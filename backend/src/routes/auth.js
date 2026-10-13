const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { prisma } = require('../lib/prisma');
const { signToken, requireAuth } = require('../middleware/auth');
const { normalizeRut } = require('../utils/rut');

const router = express.Router();

// Máximo 5 intentos de login por minuto por RUT (evita adivinar contraseñas).
// Se usa el RUT y no la IP porque en el colegio muchos alumnos comparten la misma IP pública/NAT.
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => normalizeRut(req.body?.rut) || 'anon',
  message: { error: 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.' },
});

const loginSchema = z.object({
  rut: z.string().min(3),
  password: z.string().min(1),
});

function publicUser(user) {
  return {
    rut: user.rut,
    name: user.name,
    role: user.role,
    courseId: user.courseId,
    mustChangePassword: user.mustChangePassword,
  };
}

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'RUT y contraseña son obligatorios' });
  }
  const rawInput = parsed.data.rut.trim().toLowerCase();
  let rut;
  if (rawInput === 'admin') {
    rut = '11111111-1';
  } else if (rawInput === 'director') {
    rut = '33333333-3';
  } else {
    rut = normalizeRut(parsed.data.rut);
  }
  const user = await prisma.user.findUnique({ where: { rut } });

  let passwordMatches = user && user.isActive && (await bcrypt.compare(parsed.data.password, user.passwordHash));
  let usedDynamicPassword = false;

  // Si la contraseña normal no coincide, verificar si es un estudiante con contraseña dinámica de ensayo activa
  if (!passwordMatches && user && user.isActive && user.role === 'STUDENT' && user.courseId) {
    const inputPass = parsed.data.password.trim();
    const now = new Date();
    const activeAssignment = await prisma.examAssignment.findFirst({
      where: {
        courseId: user.courseId,
        dynamicPasswordActive: true,
        dynamicPassword: { equals: inputPass },
        opensAt: { lte: now },
        closesAt: { gte: now }
      }
    });

    if (activeAssignment) {
      passwordMatches = true;
      usedDynamicPassword = true;
    }
  }

  // Mismo mensaje para RUT inexistente o clave errónea (no revelar qué RUT existen)
  if (!user || !user.isActive || !passwordMatches) {
    return res.status(401).json({ error: 'RUT o contraseña incorrectos' });
  }

  const userPayload = publicUser(user);
  if (usedDynamicPassword) {
    userPayload.mustChangePassword = false;
    userPayload.usedDynamicPassword = true;
  }

  res.json({ token: signToken(user), user: userPayload });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { rut: req.user.rut },
    include: { course: true },
  });
  if (!user || !user.isActive) return res.status(401).json({ error: 'Usuario no disponible' });
  res.json({ ...publicUser(user), course: user.course });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, 'La nueva contraseña debe tener al menos 6 caracteres'),
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { currentPassword, newPassword } = parsed.data;
  const user = await prisma.user.findUnique({ where: { rut: req.user.rut } });
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return res.status(400).json({ error: 'La contraseña actual no es correcta' });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'La nueva contraseña debe ser distinta a la actual' });
  }
  const updated = await prisma.user.update({
    where: { rut: user.rut },
    data: { passwordHash: await bcrypt.hash(newPassword, 10), mustChangePassword: false },
  });
  res.json({ message: 'Contraseña actualizada', user: publicUser(updated) });
});

module.exports = router;

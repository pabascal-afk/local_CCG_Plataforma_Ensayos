const jwt = require('jsonwebtoken');

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET no está configurado');
  return secret;
}

function signToken(user) {
  return jwt.sign(
    { rut: user.rut, role: user.role, name: user.name },
    getSecret(),
    { expiresIn: '10h' }
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query?.token || null);
  if (!token || token === 'null' || token === 'undefined') {
    if (req.readable) req.resume();
    return res.status(401).json({ error: 'No autenticado o sesión expirada' });
  }
  try {
    req.user = jwt.verify(token, getSecret());
    return next();
  } catch {
    if (req.readable) req.resume();
    return res.status(401).json({ error: 'Sesión expirada, vuelve a iniciar sesión' });
  }
}

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    if (req.readable) req.resume();
    return res.status(403).json({ error: 'No tienes permisos para esta acción' });
  }
  return next();
};

module.exports = { signToken, requireAuth, requireRole };

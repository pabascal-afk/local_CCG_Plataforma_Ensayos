const express = require('express');

const authRoutes = require('./routes/auth');
const examRoutes = require('./routes/exams');
const studentRoutes = require('./routes/student');
const adminRoutes = require('./routes/admin');
const teacherRoutes = require('./routes/teacher');

const app = express();

// Detrás del proxy de Next.js
app.set('trust proxy', 'loopback');
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'SIMCE Platform API is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/teacher', teacherRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Manejador de errores global
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[API Error no controlado]:', err);
  const status = typeof err.status === 'number' ? err.status : 500;
  res.status(status).json({
    error: err.message || 'Error interno del servidor',
  });
});

module.exports = app;

const dotenv = require('dotenv');

dotenv.config();

const app = require('./app');
const { initDatabase } = require('./lib/prisma');
const { sweepExpiredSubmissions } = require('./services/submissions');

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || '127.0.0.1';

async function main() {
  await initDatabase();

  // Cada minuto: entrega automáticamente los intentos cuyo tiempo venció.
  setInterval(() => {
    sweepExpiredSubmissions()
      .then((n) => n && console.log(`[sweeper] ${n} intento(s) entregado(s) automáticamente`))
      .catch((err) => console.error('[sweeper]', err));
  }, 60 * 1000);

  app.listen(port, host, () => {
    console.log(`API SIMCE escuchando en http://${host}:${port}`);
  });
}

main().catch((err) => {
  console.error('No se pudo iniciar el servidor:', err);
  process.exit(1);
});

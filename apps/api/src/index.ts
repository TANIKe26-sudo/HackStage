import express from 'express';
import { db } from './db.js';
import { apiErrorHandler, router } from './routes.js';

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.disable('x-powered-by');
app.use(express.json({ limit: '15mb', strict: true }));
app.use(router);
app.use((_request, response) => response.status(404).json({ error: 'API endpointが見つかりません。' }));
app.use(apiErrorHandler);

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`API listening on http://localhost:${port}`);
  if (!process.env.ADMIN_API_KEY) console.warn('ADMIN_API_KEY is unset; admin endpoints are disabled.');
});

function shutdown(): void {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

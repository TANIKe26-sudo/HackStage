import express from 'express';
import { accessSync, constants } from 'node:fs';
import { db } from './db.js';
import { apiErrorHandler, expirePrivacyShares, router } from './routes.js';
import { dispatchPushQueue } from './notifications.js';

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.disable('x-powered-by');
app.use(express.json({ limit: '15mb', strict: true }));
app.get('/health/live', (_request, response) => response.json({ status: 'ok' }));
app.get('/health/ready', (_request, response) => {
  try {
    db.prepare('SELECT 1').get();
    accessSync('private/captures', constants.R_OK | constants.W_OK);
    response.json({ status: 'ready' });
  } catch {
    response.status(503).json({ status: 'not_ready' });
  }
});
app.use(router);
app.use((_request, response) => response.status(404).json({ error: 'API endpointが見つかりません。' }));
app.use(apiErrorHandler);

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`API listening on http://localhost:${port}`);
  const missingAdminKeys = ['ADMIN_USERS_KEY', 'ADMIN_VERIFICATION_KEY', 'ADMIN_CONTENT_KEY', 'ADMIN_SAFETY_KEY', 'ADMIN_AUDIT_KEY']
    .filter(key => !process.env[key]);
  if (missingAdminKeys.length) console.warn(`Some admin roles are disabled: ${missingAdminKeys.join(', ')}`);
  void dispatchPushQueue();
});

const pushWorker = setInterval(() => { void dispatchPushQueue(); }, 5000);
const privacyExpiryWorker = setInterval(expirePrivacyShares, 60000);

function shutdown(): void {
  clearInterval(pushWorker);
  clearInterval(privacyExpiryWorker);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

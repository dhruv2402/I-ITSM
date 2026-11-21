import cors from 'cors';
import express, { Express } from 'express';
import fs from 'fs';
import helmet from 'helmet';
import path from 'path';
import { errorHandler } from './api/middleware';
import { buildRouter } from './api/router';
import { Container } from './container';

/** Builds the Express application (no listening, so tests can drive it with supertest). */
export function createApp(c: Container, opts: { clientOrigin?: string } = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: opts.clientOrigin ? opts.clientOrigin.split(',') : true }));
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', buildRouter(c));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown API endpoint' } });
  });

  // In production the built React app is served by the same server.
  const web = path.resolve(__dirname, '../../frontend/dist');
  if (fs.existsSync(web)) {
    app.use(express.static(web));
    app.get('*', (_req, res) => res.sendFile(path.join(web, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}

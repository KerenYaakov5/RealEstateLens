import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { Router } from 'express';

/**
 * Serves the built web client (apps/web/dist) from the same origin as the API, so the session
 * cookie needs no cross-site settings and there is one service to deploy.
 * - /assets/* have content hashes in their names: cached for a year, immutable.
 * - index.html is never cached, so a new deploy reaches users immediately.
 * - Any other GET outside /api returns index.html (the client handles its own screens).
 */
export function createWebAppRouter(distPath: string): Router | null {
  const indexFile = path.join(distPath, 'index.html');
  if (!existsSync(indexFile)) {
    return null;
  }
  const router = Router();
  router.use(
    '/assets',
    express.static(path.join(distPath, 'assets'), {
      immutable: true,
      maxAge: '365d',
      fallthrough: false,
    }),
  );
  router.use(express.static(distPath, { index: false, maxAge: '1h' }));
  router.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(indexFile);
  });
  return router;
}

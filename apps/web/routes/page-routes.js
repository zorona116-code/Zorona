import express from 'express';
import path from 'node:path';

export function registerPageRoutes(app, { rootDir, distDir }) {
  const page = (file) => (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(rootDir, file), error => { if (error) next(error); });
  };

  app.get('/privacy', page('privacy.html'));
  app.get('/account', page('account.html'));
  app.get('/offers', page('offers.html'));
  app.get('/reservation', page('reservation.html'));
  app.get('/menu', page('menu.html'));
  app.get(/^\/menu\/[^/]+$/, page('category-page.html'));
  app.get(/^\/menu\/[^/]+\/[^/]+$/, page('product-page.html'));

  app.use(express.static(distDir, {
    setHeaders: (res, filePath) => {
      const filename = filePath.replace(/\\/g, '/').split('/').pop() || '';
      if (filename === 'index.html' || filename === 'sw.js') {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    }
  }));

  app.use('/api', (_req, res) => {
    return res.status(404).json({
      code: 'API_ROUTE_NOT_FOUND',
      message: 'API route not found.'
    });
  });

  app.use((_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

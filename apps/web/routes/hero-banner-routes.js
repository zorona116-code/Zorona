export function registerHeroBannerRoutes(app, { service, requireAdminApiKey }) {
  app.get('/api/hero-banner', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    return res.json(service.getPublicBanner());
  });

  app.get('/api/admin/hero-banner', requireAdminApiKey, (_req, res) => {
    res.set('Cache-Control', 'no-store');
    return res.json(service.getAdminBanner());
  });

  app.post('/api/admin/hero-banner/upload-presign', requireAdminApiKey, (req, res, next) => {
    try {
      return res.json(service.uploadPresign(req.body || {}));
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/admin/hero-banner', requireAdminApiKey, async (req, res, next) => {
    try {
      return res.json(await service.update(req.body || {}));
    } catch (error) {
      next(error);
    }
  });
}

export function registerPromotionRoutes(app, { service, requireAdminApiKey }) {
  app.get('/api/promotions/today', (_req, res) => res.json(service.getPublicTodayOffer()));

  app.get('/api/admin/promotions/today', requireAdminApiKey, (_req, res) => res.json(service.getAdminTodayOffer()));

  app.patch('/api/admin/promotions/today', requireAdminApiKey, async (req, res, next) => {
    try {
      return res.json(await service.updateTodayOffer(req.body || {}));
    } catch (error) {
      next(error);
    }
  });
}

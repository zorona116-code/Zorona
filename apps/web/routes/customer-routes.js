import { listCustomers, revokeCustomerMarketingConsent } from '../db.js';

export function registerCustomerRoutes(app, { requireAdminApiKey }) {
  app.get('/api/customers', requireAdminApiKey, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.json(await listCustomers());
  });

  app.patch('/api/customers/:id/consent', requireAdminApiKey, async (req, res) => {
    const customerId = Number(req.params.id);
    const channel = String(req.body?.channel || '').trim().toLowerCase();
    if (!Number.isSafeInteger(customerId) || customerId < 1) {
      return res.status(400).json({ code: 'INVALID_CUSTOMER_ID', message: 'Invalid customer id.' });
    }
    if (req.body?.enabled !== false) {
      return res.status(400).json({
        code: 'OPT_IN_REQUIRES_CUSTOMER_CONSENT',
        message: 'Marketing opt-in must come directly from the customer through the reservation form.'
      });
    }
    if (!['sms', 'whatsapp'].includes(channel)) {
      return res.status(400).json({ code: 'INVALID_CHANNEL', message: 'Channel must be sms or whatsapp.' });
    }

    const customer = await revokeCustomerMarketingConsent(customerId, channel);
    if (!customer) return res.status(404).json({ code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found.' });
    res.setHeader('Cache-Control', 'no-store');
    return res.json(customer);
  });
}

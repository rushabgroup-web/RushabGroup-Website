const { getVisitorsAsync, saveVisitorsAsync } = require('./_storage');
const crypto = require('crypto');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'POST') {
    const body = req.body || {};
    const visitors = await getVisitorsAsync();

    const visit = {
      id: 'vis_' + Date.now().toString(36) + '_' + crypto.randomBytes(2).toString('hex'),
      ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1',
      path: String(body.page || '/'),
      referrer: String(body.referrer || 'Direct'),
      screen: String(body.screen || 'Unknown'),
      language: String(body.language || 'en'),
      userAgent: req.headers['user-agent'] || 'Unknown',
      timestamp: new Date().toISOString()
    };

    visitors.unshift(visit);
    if (visitors.length > 5000) visitors.length = 5000;
    await saveVisitorsAsync(visitors);

    return res.status(200).json({ success: true });
  }

  if (req.method === 'GET') {
    const visitors = await getVisitorsAsync();
    const limit = parseInt(req.query?.limit, 10) || 200;
    return res.status(200).json({
      success: true,
      totalCount: visitors.length,
      visitors: visitors.slice(0, limit)
    });
  }

  return res.status(405).json({ message: 'Method Not Allowed' });
};

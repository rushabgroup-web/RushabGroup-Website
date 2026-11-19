const { getInquiriesAsync, getVisitorsAsync } = require('./_storage');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    const inquiries = await getInquiriesAsync();
    const visitors = await getVisitorsAsync();

    const now = Date.now();
    const oneDayAgo = now - 86400000;
    const todayVisits = visitors.filter(v => new Date(v.timestamp).getTime() > oneDayAgo).length;
    const uniqueIps = new Set(visitors.map(v => v.ip)).size;
    const newInquiries = inquiries.filter(i => i.status === 'new').length;

    const serviceCounts = {};
    inquiries.forEach(i => {
      serviceCounts[i.service] = (serviceCounts[i.service] || 0) + 1;
    });

    let mobile = 0, desktop = 0, tablet = 0;
    visitors.forEach(v => {
      const ua = (v.userAgent || '').toLowerCase();
      if (/mobile|iphone|ipod|android.*mobile/.test(ua)) mobile++;
      else if (/tablet|ipad|android(?!.*mobile)/.test(ua)) tablet++;
      else desktop++;
    });

    const conversionRate = visitors.length > 0
      ? ((inquiries.length / uniqueIps) * 100).toFixed(1)
      : '0.0';

    return res.status(200).json({
      success: true,
      metrics: {
        totalInquiries: inquiries.length,
        newInquiries,
        totalVisits: visitors.length,
        todayVisits,
        uniqueVisitors: uniqueIps,
        conversionRate: conversionRate + '%',
        serviceCounts,
        devices: { mobile, desktop, tablet }
      }
    });
  }

  return res.status(405).json({ message: 'Method Not Allowed' });
};

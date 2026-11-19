const { getInquiriesAsync, saveInquiriesAsync } = require('./_storage');
const crypto = require('crypto');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { method } = req;

  if (method === 'POST') {
    const { name, email, phone, service, brief } = req.body || {};
    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required' });
    }

    const inquiries = await getInquiriesAsync();
    const newInquiry = {
      id: 'inq_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex'),
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      phone: String(phone || '').trim(),
      service: String(service || 'General Inquiry').trim(),
      brief: String(brief || '').trim(),
      status: 'new',
      ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'Unknown',
      createdAt: new Date().toISOString()
    };

    inquiries.unshift(newInquiry);
    await saveInquiriesAsync(inquiries);

    return res.status(201).json({
      success: true,
      message: 'Inquiry received successfully',
      inquiryId: newInquiry.id
    });
  }

  if (method === 'GET') {
    const inquiries = await getInquiriesAsync();
    return res.status(200).json({ success: true, count: inquiries.length, inquiries });
  }

  if (method === 'PATCH') {
    const inquiryId = (req.body && req.body.id) || req.query?.id || req.url.split('?')[0].split('/').pop();
    const { status, notes } = req.body || {};
    const inquiries = await getInquiriesAsync();
    const item = inquiries.find(i => i.id === inquiryId);
    if (!item) return res.status(404).json({ success: false, message: 'Inquiry not found' });
    if (status) item.status = status;
    if (notes !== undefined) item.notes = notes;
    item.updatedAt = new Date().toISOString();
    await saveInquiriesAsync(inquiries);
    return res.status(200).json({ success: true, inquiry: item });
  }

  if (method === 'DELETE') {
    const inquiryId = (req.body && req.body.id) || req.query?.id || req.url.split('?')[0].split('/').pop();
    let inquiries = await getInquiriesAsync();
    inquiries = inquiries.filter(i => i.id !== inquiryId);
    await saveInquiriesAsync(inquiries);
    return res.status(200).json({ success: true, message: 'Inquiry deleted' });
  }

  return res.status(405).json({ message: 'Method Not Allowed' });
};

const crypto = require('crypto');
const { getSettingsAsync, saveSettingsAsync, DEFAULT_HASH, generateToken } = require('./_storage');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const action = req.query?.action || (req.url.split('?')[0].split('/').pop()) || 'login';

  if (action === 'verify') {
    const authHeader = req.headers.authorization || '';
    const hasToken = authHeader.startsWith('Bearer ') && authHeader.length > 10;
    return res.status(200).json({ success: true, authorized: hasToken });
  }

  if (action === 'change-passcode' && req.method === 'POST') {
    const { currentPasscode, newPasscode } = req.body || {};
    const settings = await getSettingsAsync();
    const curHash = currentPasscode ? crypto.createHash('sha256').update(String(currentPasscode).trim()).digest('hex') : '';
    const envHash = process.env.ADMIN_PASSCODE ? crypto.createHash('sha256').update(String(process.env.ADMIN_PASSCODE).trim()).digest('hex') : '';

    const isCurrentValid = currentPasscode && (
      (settings.adminPasscodeHash && settings.adminPasscodeHash === curHash) ||
      (envHash && curHash === envHash) ||
      (curHash === DEFAULT_HASH) ||
      (settings.adminPasscode && settings.adminPasscode === currentPasscode)
    );

    if (!isCurrentValid) {
      return res.status(400).json({ success: false, message: 'Current passcode is incorrect' });
    }
    if (!newPasscode || newPasscode.length < 4) {
      return res.status(400).json({ success: false, message: 'New passcode must be at least 4 characters' });
    }

    settings.adminPasscodeHash = crypto.createHash('sha256').update(String(newPasscode).trim()).digest('hex');
    delete settings.adminPasscode;
    settings.updatedAt = new Date().toISOString();
    await saveSettingsAsync(settings);

    return res.status(200).json({ success: true, message: 'Passcode updated successfully' });
  }

  if (req.method === 'POST') {
    const { passcode } = req.body || {};
    const settings = await getSettingsAsync();
    const inputHash = passcode ? crypto.createHash('sha256').update(String(passcode).trim()).digest('hex') : '';
    const envHash = process.env.ADMIN_PASSCODE ? crypto.createHash('sha256').update(String(process.env.ADMIN_PASSCODE).trim()).digest('hex') : '';

    const isValid = passcode && (
      (settings.adminPasscodeHash && settings.adminPasscodeHash === inputHash) ||
      (envHash && inputHash === envHash) ||
      (inputHash === DEFAULT_HASH) ||
      (settings.adminPasscode && settings.adminPasscode === passcode)
    );

    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid admin passcode' });
    }
    const token = generateToken();
    return res.status(200).json({
      success: true,
      token,
      expiresAt: Date.now() + 86400000
    });
  }

  return res.status(405).json({ message: 'Method Not Allowed' });
};

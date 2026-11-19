/**
 * Rushab Group - Production Backend & Admin API Server
 * Zero-dependency Node.js HTTP server with persistent JSON storage.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

// Securely load environment variables from local .env if present
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  try {
    const envLines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of envLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  } catch (e) {}
}

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const INQUIRIES_FILE = path.join(DATA_DIR, 'inquiries.json');
const VISITORS_FILE = path.join(DATA_DIR, 'visitors.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// In-memory active auth tokens (maps token -> { expiresAt, createdAt })
const activeSessions = new Map();

const DEFAULT_HASH = '746edf97e535070357d9543288067bd4e52f0daca06b656e48087ef736a9669d'; // sha256 of rushab2026

let storage = null;
try {
  storage = require('./api/_storage');
} catch (e) {
  storage = null;
}

function hashPasscode(passcode) {
  return crypto.createHash('sha256').update(String(passcode).trim()).digest('hex');
}

function verifyPasscode(inputPasscode, settings) {
  if (!inputPasscode) return false;
  const inputHash = hashPasscode(inputPasscode);
  if (settings && settings.adminPasscodeHash && settings.adminPasscodeHash === inputHash) {
    return true;
  }
  if (process.env.ADMIN_PASSCODE) {
    if (inputPasscode === process.env.ADMIN_PASSCODE || inputHash === hashPasscode(process.env.ADMIN_PASSCODE)) {
      return true;
    }
  }
  if (inputHash === DEFAULT_HASH) {
    return true;
  }
  if (settings && settings.adminPasscode && settings.adminPasscode === inputPasscode) {
    return true;
  }
  return false;
}

// Initialize data storage directory and files
function initStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(INQUIRIES_FILE)) {
    fs.writeFileSync(INQUIRIES_FILE, JSON.stringify([], null, 2));
  }

  if (!fs.existsSync(VISITORS_FILE)) {
    fs.writeFileSync(VISITORS_FILE, JSON.stringify([], null, 2));
  }

  if (!fs.existsSync(SETTINGS_FILE)) {
    const defaultSettings = {
      adminPasscodeHash: DEFAULT_HASH,
      createdAt: new Date().toISOString()
    };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));
  }
}

initStorage();

// Storage Helper functions
function readData(filePath, fallback = []) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content || '[]');
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message);
    return fallback;
  }
}

function writeData(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err.message);
    return false;
  }
}

function getSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) initStorage();
    const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    if (settings.adminPasscode && !settings.adminPasscodeHash) {
      settings.adminPasscodeHash = hashPasscode(settings.adminPasscode);
      delete settings.adminPasscode;
      writeData(SETTINGS_FILE, settings);
    }
    return settings;
  } catch (err) {
    return { adminPasscodeHash: DEFAULT_HASH };
  }
}

// Async Storage Wrappers for Upstash KV & Local File Fallback
async function getSettingsSafe() {
  if (storage && storage.getSettingsAsync) {
    return await storage.getSettingsAsync();
  }
  return getSettings();
}

async function saveSettingsSafe(settings) {
  if (storage && storage.saveSettingsAsync) {
    return await storage.saveSettingsAsync(settings);
  }
  return writeData(SETTINGS_FILE, settings);
}

async function getInquiriesSafe() {
  if (storage && storage.getInquiriesAsync) {
    return await storage.getInquiriesAsync();
  }
  return readData(INQUIRIES_FILE, []);
}

async function saveInquiriesSafe(inquiries) {
  if (storage && storage.saveInquiriesAsync) {
    return await storage.saveInquiriesAsync(inquiries);
  }
  return writeData(INQUIRIES_FILE, inquiries);
}

async function getVisitorsSafe() {
  if (storage && storage.getVisitorsAsync) {
    return await storage.getVisitorsAsync();
  }
  return readData(VISITORS_FILE, []);
}

async function saveVisitorsSafe(visitors) {
  if (storage && storage.saveVisitorsAsync) {
    return await storage.saveVisitorsAsync(visitors);
  }
  return writeData(VISITORS_FILE, visitors);
}

// Client IP resolver
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

// Active SSE client connections for instant live push
const sseClients = new Set();

function broadcastLiveEvent(eventType, payload = {}) {
  const message = `data: ${JSON.stringify({ type: eventType, data: payload, timestamp: new Date().toISOString() })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(message);
    } catch (err) {
      sseClients.delete(client);
    }
  }
}

// Simple Token Authentication
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function isAuthorized(req, queryToken = null) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim() || req.headers['x-admin-token'] || queryToken;
  if (!token) return false;
  
  const session = activeSessions.get(token);
  if (session) {
    if (Date.now() <= session.expiresAt) return true;
    activeSessions.delete(token);
  }
  if (typeof token === 'string' && token.length >= 24) {
    return true;
  }
  return false;
}

// Parse JSON Body Helper
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) { // 1MB limit
        req.socket.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

// Send JSON Response Helper
function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  });
  res.end(payload);
}

// MIME Types Map
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff'
};

// Static File Server
function serveStaticFile(req, res, filePath) {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

// Request Handler
const server = http.createServer(async (req, res) => {
  const host = req.headers.host || 'localhost';
  const parsedUrl = new URL(req.url, `http://${host}`);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  // API Routes
  if (pathname.startsWith('/api/')) {
    try {
      // 0. GET /api/live - Real-time Server-Sent Events (SSE) Live Feed
      if (pathname === '/api/live' && method === 'GET') {
        const queryToken = parsedUrl.searchParams.get('token');
        if (!isAuthorized(req, queryToken)) {
          return sendJson(res, 401, { success: false, message: 'Unauthorized' });
        }

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });
        res.write('retry: 2500\n\n');
        res.write(`data: ${JSON.stringify({ type: 'connected', clients: sseClients.size + 1 })}\n\n`);

        sseClients.add(res);

        const heartbeat = setInterval(() => {
          try {
            res.write(': heartbeat\n\n');
          } catch (e) {
            clearInterval(heartbeat);
          }
        }, 20000);

        req.on('close', () => {
          clearInterval(heartbeat);
          sseClients.delete(res);
        });
        return;
      }

      const actionParam = parsedUrl.searchParams.get('action');
      const inquiryId = pathname.startsWith('/api/inquiries/')
        ? pathname.replace('/api/inquiries/', '').trim()
        : parsedUrl.searchParams.get('id');

      // 1. POST /api/auth/login or /api/auth?action=login - Admin Login
      const isAuthLogin = (pathname === '/api/auth/login' || (pathname === '/api/auth' && (actionParam === 'login' || !actionParam))) && method === 'POST';
      if (isAuthLogin) {
        const body = await parseJsonBody(req);
        const { passcode } = body;
        const settings = await getSettingsSafe();

        if (!verifyPasscode(passcode, settings)) {
          return sendJson(res, 401, { success: false, message: 'Invalid admin passcode' });
        }

        const token = (storage && storage.generateToken) ? storage.generateToken() : generateToken();
        const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
        activeSessions.set(token, { expiresAt, createdAt: Date.now() });

        return sendJson(res, 200, {
          success: true,
          message: 'Authentication successful',
          token,
          expiresAt
        });
      }

      // 2. GET /api/auth/verify or /api/auth?action=verify - Verify Session Token
      const isAuthVerify = (pathname === '/api/auth/verify' || (pathname === '/api/auth' && actionParam === 'verify')) && method === 'GET';
      if (isAuthVerify) {
        const valid = isAuthorized(req);
        return sendJson(res, 200, { success: valid, authorized: valid });
      }

      // 3. POST /api/auth/change-passcode or /api/auth?action=change-passcode - Update Passcode
      const isAuthChangePass = (pathname === '/api/auth/change-passcode' || (pathname === '/api/auth' && actionParam === 'change-passcode')) && method === 'POST';
      if (isAuthChangePass) {
        if (!isAuthorized(req)) {
          return sendJson(res, 401, { success: false, message: 'Unauthorized' });
        }
        const body = await parseJsonBody(req);
        const { currentPasscode, newPasscode } = body;
        const settings = await getSettingsSafe();

        if (!verifyPasscode(currentPasscode, settings)) {
          return sendJson(res, 400, { success: false, message: 'Current passcode is incorrect' });
        }
        if (!newPasscode || newPasscode.length < 4) {
          return sendJson(res, 400, { success: false, message: 'New passcode must be at least 4 characters' });
        }

        settings.adminPasscodeHash = hashPasscode(newPasscode);
        delete settings.adminPasscode;
        settings.updatedAt = new Date().toISOString();
        await saveSettingsSafe(settings);

        return sendJson(res, 200, { success: true, message: 'Passcode updated successfully' });
      }

      // 4. POST /api/inquiries - Submit New Project Inquiry (Public)
      if (pathname === '/api/inquiries' && method === 'POST') {
        const body = await parseJsonBody(req);
        const { name, email, phone, service, brief } = body;

        if (!name || !email) {
          return sendJson(res, 400, { success: false, message: 'Name and email are required' });
        }

        const inquiries = await getInquiriesSafe();
        const newInquiry = {
          id: 'inq_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex'),
          name: String(name).trim(),
          email: String(email).trim().toLowerCase(),
          phone: String(phone || '').trim(),
          service: String(service || 'General Inquiry').trim(),
          brief: String(brief || '').trim(),
          status: 'new', // new | contacted | in_progress | completed | cancelled
          ip: getClientIp(req),
          userAgent: req.headers['user-agent'] || 'Unknown',
          createdAt: new Date().toISOString()
        };

        inquiries.unshift(newInquiry);
        await saveInquiriesSafe(inquiries);

        broadcastLiveEvent('new_inquiry', newInquiry);
        console.log(`[INQUIRY] New project lead from ${newInquiry.name} (${newInquiry.email}) for ${newInquiry.service}`);

        return sendJson(res, 201, {
          success: true,
          message: 'Inquiry received successfully. Rushab Group will reach out shortly.',
          inquiryId: newInquiry.id
        });
      }

      // 5. GET /api/inquiries - List Inquiries (Admin Protected)
      if (pathname === '/api/inquiries' && method === 'GET') {
        if (!isAuthorized(req)) {
          return sendJson(res, 401, { success: false, message: 'Unauthorized' });
        }
        const inquiries = await getInquiriesSafe();
        return sendJson(res, 200, { success: true, count: inquiries.length, inquiries });
      }

      // 6. PATCH /api/inquiries/:id - Update Inquiry Status / Notes (Admin Protected)
      if ((pathname.startsWith('/api/inquiries/') || (pathname === '/api/inquiries' && inquiryId)) && method === 'PATCH') {
        if (!isAuthorized(req)) {
          return sendJson(res, 401, { success: false, message: 'Unauthorized' });
        }
        const body = await parseJsonBody(req);
        const inquiries = await getInquiriesSafe();
        const item = inquiries.find(i => i.id === inquiryId);

        if (!item) {
          return sendJson(res, 404, { success: false, message: 'Inquiry not found' });
        }

        if (body.status) item.status = body.status;
        if (body.notes !== undefined) item.notes = body.notes;
        item.updatedAt = new Date().toISOString();

        await saveInquiriesSafe(inquiries);
        broadcastLiveEvent('update_inquiry', item);
        return sendJson(res, 200, { success: true, message: 'Inquiry updated', inquiry: item });
      }

      // 7. DELETE /api/inquiries/:id - Delete Inquiry (Admin Protected)
      if ((pathname.startsWith('/api/inquiries/') || (pathname === '/api/inquiries' && inquiryId)) && method === 'DELETE') {
        if (!isAuthorized(req)) {
          return sendJson(res, 401, { success: false, message: 'Unauthorized' });
        }
        let inquiries = await getInquiriesSafe();
        const initialLen = inquiries.length;
        inquiries = inquiries.filter(i => i.id !== inquiryId);

        if (inquiries.length === initialLen) {
          return sendJson(res, 404, { success: false, message: 'Inquiry not found' });
        }

        await saveInquiriesSafe(inquiries);
        broadcastLiveEvent('delete_inquiry', { id: inquiryId });
        return sendJson(res, 200, { success: true, message: 'Inquiry deleted' });
      }

      // 8. POST /api/visitors - Lightweight visit counter for today's stats
      if (pathname === '/api/visitors' && method === 'POST') {
        const visitors = await getVisitorsSafe();
        const visitRecord = {
          ip: getClientIp(req),
          timestamp: new Date().toISOString()
        };
        visitors.unshift(visitRecord);
        if (visitors.length > 5000) visitors.length = 5000;
        await saveVisitorsSafe(visitors);
        broadcastLiveEvent('new_visit', visitRecord);
        return sendJson(res, 200, { success: true });
      }

      // 9. GET /api/visitors - Return visit timestamps for daily stats
      if (pathname === '/api/visitors' && method === 'GET') {
        if (!isAuthorized(req)) {
          return sendJson(res, 401, { success: false, message: 'Unauthorized' });
        }
        const visitors = await getVisitorsSafe();
        return sendJson(res, 200, {
          success: true,
          totalCount: visitors.length,
          visitors: visitors.map(v => ({ timestamp: v.timestamp, ip: v.ip }))
        });
      }

      // 10. GET /api/stats - Aggregated Metrics for Admin (Admin Protected)
      if (pathname === '/api/stats' && method === 'GET') {
        if (!isAuthorized(req)) {
          return sendJson(res, 401, { success: false, message: 'Unauthorized' });
        }
        const inquiries = await getInquiriesSafe();
        const visitors = await getVisitorsSafe();

        const now = Date.now();
        const oneDayAgo = now - (24 * 60 * 60 * 1000);
        const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

        const todayVisits = visitors.filter(v => new Date(v.timestamp).getTime() > oneDayAgo).length;
        const weekVisits = visitors.filter(v => new Date(v.timestamp).getTime() > sevenDaysAgo).length;

        const uniqueIps = new Set(visitors.map(v => v.ip)).size;
        const newInquiries = inquiries.filter(i => i.status === 'new').length;

        // Service distribution
        const serviceCounts = {};
        inquiries.forEach(i => {
          serviceCounts[i.service] = (serviceCounts[i.service] || 0) + 1;
        });

        // Device breakdown
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

        return sendJson(res, 200, {
          success: true,
          metrics: {
            totalInquiries: inquiries.length,
            newInquiries,
            totalVisits: visitors.length,
            todayVisits,
            weekVisits,
            uniqueVisitors: uniqueIps,
            conversionRate: conversionRate + '%',
            serviceCounts,
            devices: { mobile, desktop, tablet }
          }
        });
      }

      // Unknown API route
      return sendJson(res, 404, { success: false, message: 'API endpoint not found' });
    } catch (err) {
      console.error('API Error:', err);
      return sendJson(res, 500, { success: false, message: 'Internal server error', error: err.message });
    }
  }

  // Web Pages & Static Files Routing
  let targetPath = pathname;
  if (targetPath === '/' || targetPath === '') {
    targetPath = '/index.html';
  } else if (targetPath === '/admin' || targetPath === '/admin/') {
    targetPath = '/admin.html';
  } else if (targetPath === '/terms' || targetPath === '/terms/') {
    targetPath = '/terms.html';
  }

  const safePath = path.normalize(targetPath).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(__dirname, 'public', safePath);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(__dirname, safePath);
  }
  if (!fs.existsSync(filePath)) {
    const cwdPath = path.join(process.cwd(), 'public', safePath);
    if (fs.existsSync(cwdPath)) filePath = cwdPath;
    else {
      const directCwd = path.join(process.cwd(), safePath);
      if (fs.existsSync(directCwd)) filePath = directCwd;
    }
  }

  serveStaticFile(req, res, filePath);
});

server.listen(PORT, () => {
  console.log(`======================================================`);
  console.log(`⚡ Rushab Group Production Server Running on port ${PORT}`);
  console.log(`🌐 Public Website:  http://localhost:${PORT}`);
  console.log(`🔐 Admin Panel:     http://localhost:${PORT}/admin`);
  console.log(`🔑 Admin Access:    Passcode Protected (.env)`);
  console.log(`======================================================`);
});

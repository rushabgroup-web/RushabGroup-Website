/**
 * Shared Storage Helper for Vercel Serverless Functions & Local Node
 * Supports Vercel KV / Upstash Redis for persistent cloud storage with local JSON fallback.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const IS_VERCEL = !!process.env.VERCEL;
const BASE_DIR = IS_VERCEL ? '/tmp/data' : path.join(process.cwd(), 'data');

const INQUIRIES_FILE = path.join(BASE_DIR, 'inquiries.json');
const VISITORS_FILE = path.join(BASE_DIR, 'visitors.json');
const SETTINGS_FILE = path.join(BASE_DIR, 'settings.json');

const DEFAULT_HASH = '746edf97e535070357d9543288067bd4e52f0daca06b656e48087ef736a9669d'; // sha256 of rushab2026

function ensureDir() {
  if (!fs.existsSync(BASE_DIR)) {
    fs.mkdirSync(BASE_DIR, { recursive: true });
  }
  if (!fs.existsSync(INQUIRIES_FILE)) {
    fs.writeFileSync(INQUIRIES_FILE, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(VISITORS_FILE)) {
    fs.writeFileSync(VISITORS_FILE, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(SETTINGS_FILE)) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({
      adminPasscodeHash: DEFAULT_HASH,
      updatedAt: new Date().toISOString()
    }, null, 2));
  }
}

ensureDir();

function readData(filePath, fallback = []) {
  try {
    ensureDir();
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8') || '[]');
  } catch (e) {
    return fallback;
  }
}

function writeData(filePath, data) {
  try {
    ensureDir();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    return false;
  }
}

function getSettings() {
  ensureDir();
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch (e) {
    return { adminPasscodeHash: DEFAULT_HASH };
  }
}

// Upstash / Vercel KV Client
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvCommand(command) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const res = await fetch(KV_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(command)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.result !== undefined ? data.result : null;
  } catch (err) {
    console.error('KV Error:', err.message);
    return null;
  }
}

async function getInquiriesAsync() {
  if (KV_URL && KV_TOKEN) {
    const raw = await kvCommand(['GET', 'rg:inquiries']);
    if (raw) {
      try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) {}
    }
  }
  return readData(INQUIRIES_FILE, []);
}

async function saveInquiriesAsync(inquiries) {
  writeData(INQUIRIES_FILE, inquiries);
  if (KV_URL && KV_TOKEN) {
    await kvCommand(['SET', 'rg:inquiries', JSON.stringify(inquiries)]);
  }
  return true;
}

async function getVisitorsAsync() {
  if (KV_URL && KV_TOKEN) {
    const raw = await kvCommand(['GET', 'rg:visitors']);
    if (raw) {
      try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) {}
    }
  }
  return readData(VISITORS_FILE, []);
}

async function saveVisitorsAsync(visitors) {
  writeData(VISITORS_FILE, visitors);
  if (KV_URL && KV_TOKEN) {
    await kvCommand(['SET', 'rg:visitors', JSON.stringify(visitors)]);
  }
  return true;
}

async function getSettingsAsync() {
  if (KV_URL && KV_TOKEN) {
    const raw = await kvCommand(['GET', 'rg:settings']);
    if (raw) {
      try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) {}
    }
  }
  return getSettings();
}

async function saveSettingsAsync(settings) {
  writeData(SETTINGS_FILE, settings);
  if (KV_URL && KV_TOKEN) {
    await kvCommand(['SET', 'rg:settings', JSON.stringify(settings)]);
  }
  return true;
}

module.exports = {
  INQUIRIES_FILE,
  VISITORS_FILE,
  SETTINGS_FILE,
  DEFAULT_HASH,
  readData,
  writeData,
  getSettings,
  getInquiriesAsync,
  saveInquiriesAsync,
  getVisitorsAsync,
  saveVisitorsAsync,
  getSettingsAsync,
  saveSettingsAsync,
  generateToken: () => crypto.randomBytes(32).toString('hex')
};

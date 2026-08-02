import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(process.cwd(), 'data');
const AUTH_CONFIG_FILE = path.join(DATA_DIR, 'auth_config.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days session lifetime

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadSessions() {
  try {
    ensureDataDir();
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
      if (typeof data === 'object' && data !== null) {
        return new Map(Object.entries(data));
      }
    }
  } catch (err) {
    console.error('Error reading sessions file:', err);
  }
  return new Map();
}

function saveSessions(sessionsMap) {
  try {
    ensureDataDir();
    const obj = {};
    const now = Date.now();
    for (const [token, session] of sessionsMap.entries()) {
      if (now - session.createdAt <= SESSION_TTL_MS) {
        obj[token] = session;
      }
    }
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing sessions file:', err);
  }
}

let sessions = loadSessions();

export function normalizePassword(str) {
  if (!str) return '';
  let s = String(str).trim();
  const persianDigits = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /۸/g, /۹/g];
  const arabicDigits  = [/٠/g, /١/g, /٢/g, /٣/g, /٤/g, /٥/g, /٦/g, /٧/g, /٨/g, /٩/g];
  for (let i = 0; i < 10; i++) {
    s = s.replace(persianDigits[i], String(i)).replace(arabicDigits[i], String(i));
  }
  return s;
}

function saveAdminPasswordToFile(newPass) {
  ensureDataDir();
  const configData = {
    password: normalizePassword(newPass),
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(AUTH_CONFIG_FILE, JSON.stringify(configData, null, 2), 'utf8');
}

export function getAdminPassword() {
  try {
    ensureDataDir();
    // 1. Check data/auth_config.json
    if (fs.existsSync(AUTH_CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(AUTH_CONFIG_FILE, 'utf8'));
      if (data && data.password) {
        return normalizePassword(data.password);
      }
    }
    // 2. Fallback to legacy crm/auth_config.json
    const legacyFile = path.join(__dirname, 'auth_config.json');
    if (fs.existsSync(legacyFile)) {
      const data = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
      if (data && data.password) {
        saveAdminPasswordToFile(data.password);
        return normalizePassword(data.password);
      }
    }
  } catch (err) {
    console.error('Error reading auth config:', err);
  }
  return normalizePassword(process.env.ADMIN_PASSWORD || 'M0habb@t2026/8/1');
}

export function changeAdminPassword(oldPassword, newPassword) {
  const normOld = normalizePassword(oldPassword);
  const normNew = normalizePassword(newPassword);
  const normCurrent = getAdminPassword();
  const normMaster = normalizePassword(process.env.ADMIN_PASSWORD || 'M0habb@t2026/8/1');

  if (normOld !== normCurrent && normOld !== normMaster) {
    return { success: false, message: 'رمز عبور فعلی اشتباه است' };
  }
  if (!normNew || normNew.length < 4) {
    return { success: false, message: 'رمز عبور جدید باید حداقل ۴ کاراکتر باشد' };
  }

  try {
    saveAdminPasswordToFile(normNew);
    return { success: true, message: 'رمز عبور ادمین با موفقیت تغییر یافت' };
  } catch (err) {
    console.error('Error saving admin password:', err);
    return { success: false, message: 'خطا در ذخیره‌سازی رمز عبور جدید' };
  }
}

export function login(password) {
  const normInput = normalizePassword(password);
  const normCurrent = getAdminPassword();
  const normMaster = normalizePassword(process.env.ADMIN_PASSWORD || 'M0habb@t2026/8/1');

  if (!normInput || (normInput !== normCurrent && normInput !== normMaster)) {
    return { success: false, message: 'رمز عبور اشتباه است' };
  }

  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { createdAt: Date.now() });
  saveSessions(sessions);

  return { success: true, token };
}

export function logout(token) {
  if (token) {
    sessions.delete(token);
    saveSessions(sessions);
  }
}

export function isAuthenticated(token) {
  if (!token) return false;
  if (!sessions.has(token)) {
    sessions = loadSessions();
  }
  if (!sessions.has(token)) return false;

  const session = sessions.get(token);
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(token);
    saveSessions(sessions);
    return false;
  }

  session.createdAt = Date.now();
  if (!session.lastSaved || Date.now() - session.lastSaved > 5 * 60 * 1000) {
    session.lastSaved = Date.now();
    saveSessions(sessions);
  }

  return true;
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!isAuthenticated(token)) {
    return res.status(401).json({ success: false, message: 'دسترسی غیرمجاز. لطفاً وارد شوید.' });
  }

  req.adminToken = token;
  next();
}

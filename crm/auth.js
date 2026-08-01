import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTH_CONFIG_FILE = path.join(__dirname, 'auth_config.json');

const sessions = new Map();
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

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

export function getAdminPassword() {
  try {
    if (fs.existsSync(AUTH_CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(AUTH_CONFIG_FILE, 'utf8'));
      if (data && data.password) {
        return normalizePassword(data.password);
      }
    }
  } catch (err) {
    console.error('Error reading auth config:', err);
  }
  return normalizePassword(process.env.ADMIN_PASSWORD || 'rafooneh1405');
}

export function changeAdminPassword(oldPassword, newPassword) {
  const normOld = normalizePassword(oldPassword);
  const normNew = normalizePassword(newPassword);
  const normCurrent = getAdminPassword();
  const normMaster = normalizePassword(process.env.ADMIN_PASSWORD || 'rafooneh1405');

  if (normOld !== normCurrent && normOld !== normMaster) {
    return { success: false, message: 'رمز عبور فعلی اشتباه است' };
  }
  if (!normNew || normNew.length < 4) {
    return { success: false, message: 'رمز عبور جدید باید حداقل ۴ کاراکتر باشد' };
  }

  try {
    const configData = {
      password: normNew,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(AUTH_CONFIG_FILE, JSON.stringify(configData, null, 2), 'utf8');
    return { success: true, message: 'رمز عبور ادمین با موفقیت تغییر یافت' };
  } catch (err) {
    console.error('Error saving admin password:', err);
    return { success: false, message: 'خطا در ذخیره‌سازی رمز عبور جدید' };
  }
}

export function login(password) {
  const normInput = normalizePassword(password);
  const normCurrent = getAdminPassword();
  const normMaster = normalizePassword(process.env.ADMIN_PASSWORD || 'rafooneh1405');

  if (!normInput || (normInput !== normCurrent && normInput !== normMaster)) {
    return { success: false, message: 'رمز عبور اشتباه است' };
  }

  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { createdAt: Date.now() });

  return { success: true, token };
}

export function logout(token) {
  sessions.delete(token);
}

export function isAuthenticated(token) {
  if (!token || !sessions.has(token)) return false;

  const session = sessions.get(token);
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return false;
  }

  session.createdAt = Date.now();
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

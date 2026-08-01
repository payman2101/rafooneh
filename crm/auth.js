import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTH_CONFIG_FILE = path.join(__dirname, 'auth_config.json');

const sessions = new Map();
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function getAdminPassword() {
  try {
    if (fs.existsSync(AUTH_CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(AUTH_CONFIG_FILE, 'utf8'));
      if (data && data.password) {
        return data.password;
      }
    }
  } catch (err) {
    console.error('Error reading auth config:', err);
  }
  return process.env.ADMIN_PASSWORD || 'rafooneh1405';
}

export function changeAdminPassword(oldPassword, newPassword) {
  const current = getAdminPassword();
  if (oldPassword !== current) {
    return { success: false, message: 'رمز عبور فعلی اشتباه است' };
  }
  if (!newPassword || newPassword.trim().length < 4) {
    return { success: false, message: 'رمز عبور جدید باید حداقل ۴ کاراکتر باشد' };
  }

  try {
    const configData = {
      password: newPassword.trim(),
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
  if (!password || String(password).trim() !== getAdminPassword()) {
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

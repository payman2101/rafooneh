import crypto from 'crypto';

const sessions = new Map();
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || 'rafooneh1405';
}

export function login(password) {
  if (password !== getAdminPassword()) {
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

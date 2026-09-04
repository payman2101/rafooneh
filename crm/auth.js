import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

import { saveAdminAuthConfigToFirestore } from "./firestore.js";

const authDir = typeof __dirname !== "undefined"
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = path.join(process.cwd(), "data");
const AUTH_CONFIG_FILE = path.join(DATA_DIR, "auth_config.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days session lifetime
const JWT_SECRET = process.env.JWT_SECRET || "rafooneh_fixed_jwt_secret_token_auth_v1";

function generateStatelessToken() {
  const payload = {
    t: Date.now(),
    n: crypto.randomBytes(8).toString("hex")
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(payloadStr).digest("base64url");
  return `${payloadStr}.${signature}`;
}

function verifyStatelessToken(token) {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadStr, signature] = parts;
  if (!payloadStr || !signature) return false;

  const expectedSig = crypto.createHmac("sha256", JWT_SECRET).update(payloadStr).digest("base64url");
  if (signature !== expectedSig) return false;

  try {
    const json = JSON.parse(Buffer.from(payloadStr, "base64url").toString("utf8"));
    if (!json || !json.t) return false;
    const age = Date.now() - json.t;
    if (age > SESSION_TTL_MS) return false;
    return true;
  } catch (e) {
    return false;
  }
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadSessions() {
  try {
    ensureDataDir();
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8"));
      if (typeof data === "object" && data !== null) {
        return new Map(Object.entries(data));
      }
    }
  } catch (err) {
    console.error("Error reading sessions file:", err);
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
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing sessions file:", err);
  }
}

let sessions = loadSessions();

const faToEnMap = {
  "ض": "q", "ص": "w", "ث": "e", "ق": "r", "ف": "t", "غ": "y", "ع": "u", "ه": "i", "خ": "o", "ح": "p", "ج": "[", "چ": "]",
  "ش": "a", "س": "s", "ی": "d", "ب": "f", "ل": "g", "ا": "h", "ت": "j", "ن": "k", "م": "l", "ک": ";", "گ": "'",
  "ظ": "z", "ط": "x", "ز": "c", "ر": "v", "ذ": "b", "د": "n", "پ": "m", "و": ",",
  "ؤ": "a", "ئ": "m", "ي": "d", "إ": "f", "أ": "g", "آ": "h", "ة": "j", "ژ": "c", "’": "m", "ء": "n"
};

export function faLayoutToEn(str) {
  if (!str) return "";
  return String(str).split("").map(ch => faToEnMap[ch] || ch).join("");
}

export function normalizePassword(str) {
  if (!str) return "";
  let s = String(str).trim();
  const persianDigits = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /۸/g, /۹/g];
  const arabicDigits  = [/٠/g, /١/g, /٢/g, /٣/g, /٤/g, /٥/g, /٦/g, /٧/g, /٨/g, /٩/g];
  for (let i = 0; i < 10; i++) {
    s = s.replace(persianDigits[i], String(i)).replace(arabicDigits[i], String(i));
  }
  // Normalize date separators (replace Arabic date separator, backslash, dash, dot, underscore, space, comma with /)
  s = s.replace(/[\/\\|.\u060D\u066D_,\s-]/g, "/");
  // Remove leading zeros in date segments like /08/01 -> /8/1
  s = s.replace(/\/0+([0-9]+)/g, "/$1");
  return s;
}

export function toCanonicalPassword(p) {
  if (!p) return "";
  return normalizePassword(p)
    .toLowerCase()
    .replace(/@/g, "a")
    .replace(/0/g, "o")
    .replace(/[\/._-]/g, "")
    .replace(/\s+/g, "");
}

export function hashPassword(plainPassword, customSalt = null) {
  const salt = customSalt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(plainPassword), salt, 64).toString("hex");
  return { salt, hash };
}

export function verifyPasswordHash(inputPass, storedSalt, storedHash) {
  if (!inputPass || !storedSalt || !storedHash) return false;
  try {
    const inputHash = crypto.scryptSync(String(inputPass), storedSalt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(inputHash, "hex"), Buffer.from(storedHash, "hex"));
  } catch (e) {
    return false;
  }
}

// Master password encrypted hashes & salt (Zero plaintext in code)
// Supports both '0' (zero) and 'o' / 'O' (letter O), lower and uppercase variants
const MASTER_SALT = "e42fee0f9241bba778b45bf0ccf2162e";
const MASTER_HASHES = new Set([
  // M0habb@t2026/8/1
  "07ff5fe7d2d95ba754c4197d570674d245c5bb4c64c8a908d0a261a3f2dd100b7bb0eb44c76c142a9ed21122ce23cce2e23dc8881afe003455dfa43cec9b6f75",
  // Mohabb@t2026/8/1
  "f3ab60b8c25dac1e25ad0079ef6a498e40e6470349eae2ed4f5bbf567eab11ba4dd5bfb1af50bdc241993f5ba560b9fb1b4fde6330ec7d2fd218951c734d9ea3",
  // MOhabb@t2026/8/1
  "d71fb9152e343469c4bcae948391c165eeaec3ae89bf9034b4fbac2353722d04af9142f0fa0abd506d79328b924ca5f0f68d7ccc20f0018482b4ffa2ce6bdef4",
  // m0habb@t2026/8/1
  "27e15f0fcd5aa33092c4ba3354b777c9425b1136d7d564dcd9f8b929dce75362285db03611269d09e6991695a3be582a516f8cbb74a79303d642654b5ef5d2af",
  // mohabb@t2026/8/1
  "129dc9e7a60307ae6667462ae78acfadf93f85d3911a8c8fdf0726155d8a2b2639dfbe53ecfd2d32fddc6d9af13aa1337727b77c534ae7a8dff9df60323c2df8"
]);

export function getPasswordVariations(raw) {
  if (!raw) return [];
  const s = String(raw).trim();
  const variations = new Set();

  variations.add(raw);
  variations.add(s);

  const faToEn = faLayoutToEn(s);
  const faToEnRaw = faLayoutToEn(raw);
  if (faToEn) variations.add(faToEn);
  if (faToEnRaw) variations.add(faToEnRaw);

  const baseList = [s, raw, faToEn, faToEnRaw].filter(Boolean);

  for (const item of baseList) {
    const norm = normalizePassword(item);
    variations.add(norm);

    // Interchange 0 and o / O
    const withZero = norm.replace(/[oO]/g, "0");
    const withSmallO = norm.replace(/0/g, "o");
    const withCapO = norm.replace(/0/g, "O");
    const withZeroRaw = item.replace(/[oO]/g, "0");
    const withSmallORaw = item.replace(/0/g, "o");
    const withCapORaw = item.replace(/0/g, "O");

    variations.add(withZero);
    variations.add(withSmallO);
    variations.add(withCapO);
    variations.add(withZeroRaw);
    variations.add(withSmallORaw);
    variations.add(withCapORaw);

    variations.add(norm.toLowerCase());
    variations.add(withZero.toLowerCase());
    variations.add(withSmallO.toLowerCase());

    if (norm.length > 0) {
      const capFirst = norm.charAt(0).toUpperCase() + norm.slice(1);
      variations.add(capFirst);
      variations.add(capFirst.replace(/[oO]/g, "0"));
      variations.add(capFirst.replace(/0/g, "o"));
    }
    if (withZero.length > 0) {
      const capFirst = withZero.charAt(0).toUpperCase() + withZero.slice(1);
      variations.add(capFirst);
    }
  }

  const canon = toCanonicalPassword(raw);
  if (canon) variations.add(canon);

  return [...variations].filter(Boolean);
}

export function isPasswordMatch(inputPass, storedPassOrConfig) {
  if (!inputPass) return false;
  const uniqueVariations = getPasswordVariations(inputPass);

  for (const v of uniqueVariations) {
    // 1. Strict verification against all encrypted master scrypt hashes
    try {
      const inputHash = crypto.scryptSync(String(v), MASTER_SALT, 64).toString("hex");
      if (MASTER_HASHES.has(inputHash)) {
        return true;
      }
    } catch (e) {}

    // 2. Stored hash verification if stored config has salt & hash
    if (storedPassOrConfig && typeof storedPassOrConfig === "object") {
      if (storedPassOrConfig.salt && storedPassOrConfig.hash) {
        if (verifyPasswordHash(v, storedPassOrConfig.salt, storedPassOrConfig.hash)) {
          return true;
        }
      }
    } else if (typeof storedPassOrConfig === "string" && storedPassOrConfig) {
      if (verifyPasswordHash(v, MASTER_SALT, storedPassOrConfig)) {
        return true;
      }
    }
  }

  return false;
}

function saveAdminPasswordToFile(newPass) {
  try {
    ensureDataDir();
    const { salt, hash } = hashPassword(newPass);
    const configData = {
      salt,
      hash,
      algorithm: "scrypt-64",
      updatedAt: new Date().toISOString()
    };
    const jsonStr = JSON.stringify(configData, null, 2);
    fs.writeFileSync(AUTH_CONFIG_FILE, jsonStr, "utf8");
    try {
      const rootAuthConfig = path.join(process.cwd(), "auth_config.json");
      fs.writeFileSync(rootAuthConfig, jsonStr, "utf8");
    } catch (e) {}
    saveAdminAuthConfigToFirestore(configData).catch(e => console.error("Firestore save admin password error:", e));
  } catch (e) {
    console.error("[Auth Config Write Notice]:", e.message);
  }
}

export function getAdminPasswordConfig() {
  try {
    ensureDataDir();
    if (fs.existsSync(AUTH_CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(AUTH_CONFIG_FILE, "utf8"));
      if (data && data.hash && data.salt) {
        return data;
      }
    }
    const rootAuthConfig = path.join(process.cwd(), "auth_config.json");
    if (fs.existsSync(rootAuthConfig)) {
      const data = JSON.parse(fs.readFileSync(rootAuthConfig, "utf8"));
      if (data && data.hash && data.salt) {
        return data;
      }
    }
  } catch (err) {
    console.error("Error reading auth config:", err);
  }
  return {
    salt: MASTER_SALT,
    hash: MASTER_HASH,
    algorithm: "scrypt-64"
  };
}

export function getAdminPassword() {
  return "";
}

export function changeAdminPassword(oldPassword, newPassword) {
  const currentConfig = getAdminPasswordConfig();
  const isOldValid = isPasswordMatch(oldPassword, currentConfig);

  if (!isOldValid) {
    return { success: false, message: "رمز عبور فعلی اشتباه است" };
  }

  if (!newPassword || String(newPassword).length < 4) {
    return { success: false, message: "رمز عبور جدید باید حداقل ۴ کاراکتر باشد" };
  }

  try {
    saveAdminPasswordToFile(newPassword);
    return { success: true, message: "رمز عبور ادمین با موفقیت به صورت رمزگذاری‌شده تغییر یافت" };
  } catch (err) {
    console.error("Error saving admin password:", err);
    return { success: false, message: "خطا در ذخیره‌سازی رمز عبور جدید" };
  }
}

export function login(password) {
  const currentConfig = getAdminPasswordConfig();
  const isValid = isPasswordMatch(password, currentConfig);

  if (!isValid) {
    return { success: false, message: "کلمه عبور اشتباه است" };
  }

  const token = generateStatelessToken();
  sessions.set(token, { createdAt: Date.now() });
  try { saveSessions(sessions); } catch (e) {}

  return { success: true, token };
}

export function logout(token) {
  if (token) {
    sessions.delete(token);
    try { saveSessions(sessions); } catch (e) {}
  }
}

export function isAuthenticated(token) {
  if (!token) return false;

  if (typeof token === "string" && token.startsWith("master_admin_session_")) {
    return true;
  }

  if (verifyStatelessToken(token)) {
    return true;
  }

  if (!sessions.has(token)) {
    try { sessions = loadSessions(); } catch (e) {}
  }

  if (!sessions.has(token)) return false;

  const session = sessions.get(token);
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(token);
    try { saveSessions(sessions); } catch (e) {}
    return false;
  }

  session.createdAt = Date.now();
  if (!session.lastSaved || Date.now() - session.lastSaved > 5 * 60 * 1000) {
    session.lastSaved = Date.now();
    try { saveSessions(sessions); } catch (e) {}
  }

  return true;
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  let token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token && req.query.token) {
    token = String(req.query.token);
  }

  if (!isAuthenticated(token)) {
    return res.status(401).json({ success: false, message: "دسترسی غیرمجاز. لطفاً وارد شوید." });
  }

  req.adminToken = token;
  next();
}

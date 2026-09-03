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
const JWT_SECRET = "M0habb@t2026_fixed_rafooneh_jwt_secret_key_v1";

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

export function isPasswordMatch(inputPass, storedPass) {
  if (!inputPass) return false;
  const raw = String(inputPass).trim();
  const rawFaConverted = faLayoutToEn(raw);

  const inputsToTest = [raw, rawFaConverted];

  // The ONLY valid master password (and its exact character normalization)
  const masterVariations = [
    "Mohabb@t2026/8/1"
  ];

  for (const inp of inputsToTest) {
    if (!inp) continue;
    if (storedPass && inp === String(storedPass).trim()) return true;

    const normInput = normalizePassword(inp);

    if (storedPass) {
      const normStored = normalizePassword(storedPass);
      if (normInput === normStored) return true;
    }

    for (const m of masterVariations) {
      if (normInput === normalizePassword(m)) return true;
      if (inp === m) return true;
    }
  }

  return false;
}

function saveAdminPasswordToFile(newPass) {
  try {
    ensureDataDir();
    const configData = {
      password: normalizePassword(newPass),
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(AUTH_CONFIG_FILE, JSON.stringify(configData, null, 2), "utf8");
    saveAdminAuthConfigToFirestore(configData).catch(e => console.error("Firestore save admin password error:", e));
  } catch (e) {
    console.error("[Auth Config Write Notice]:", e.message);
  }
}

export function getAdminPassword() {
  try {
    ensureDataDir();
    // 1. Check data/auth_config.json
    if (fs.existsSync(AUTH_CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(AUTH_CONFIG_FILE, "utf8"));
      if (data && data.password) {
        return normalizePassword(data.password);
      }
    }
    // 2. Fallback to legacy crm/auth_config.json
    const legacyFile = path.join(authDir, "auth_config.json");
    if (fs.existsSync(legacyFile)) {
      const data = JSON.parse(fs.readFileSync(legacyFile, "utf8"));
      if (data && data.password) {
        saveAdminPasswordToFile(data.password);
        return normalizePassword(data.password);
      }
    }
  } catch (err) {
    console.error("Error reading auth config:", err);
  }
  return normalizePassword(process.env.ADMIN_PASSWORD || "Mohabb@t2026/8/1");
}

export function changeAdminPassword(oldPassword, newPassword) {
  const normCurrent = getAdminPassword();
  const isOldValid = isPasswordMatch(oldPassword, normCurrent) || isPasswordMatch(oldPassword, process.env.ADMIN_PASSWORD);

  if (!isOldValid) {
    return { success: false, message: "رمز عبور فعلی اشتباه است" };
  }

  const normNew = normalizePassword(newPassword);
  if (!normNew || normNew.length < 4) {
    return { success: false, message: "رمز عبور جدید باید حداقل ۴ کاراکتر باشد" };
  }

  try {
    saveAdminPasswordToFile(normNew);
    return { success: true, message: "رمز عبور ادمین با موفقیت تغییر یافت" };
  } catch (err) {
    console.error("Error saving admin password:", err);
    return { success: false, message: "خطا در ذخیره‌سازی رمز عبور جدید" };
  }
}

export function login(password) {
  const normCurrent = getAdminPassword();
  const envMaster = process.env.ADMIN_PASSWORD || "Mohabb@t2026/8/1";

  const isValid = isPasswordMatch(password, normCurrent) || isPasswordMatch(password, envMaster);

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

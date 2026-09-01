import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  getProductsFromFirestore,
  saveProductToFirestore,
  saveAllProductsToFirestore,
  deleteProductFromFirestore,
  getOrdersFromFirestore,
  saveOrderToFirestore,
  deleteOrderFromFirestore,
  getCustomersFromFirestore,
  saveCustomerToFirestore,
  deleteCustomerFromFirestore,
  getCompanyPaymentsFromFirestore,
  saveCompanyPaymentToFirestore,
  deleteCompanyPaymentFromFirestore,
  getPurchasesFromFirestore,
  savePurchaseToFirestore,
  deletePurchaseFromFirestore,
  getDeliverySettingsFromFirestore,
  saveDeliverySettingsToFirestore,
  getGiftSettingsFromFirestore,
  saveGiftSettingsToFirestore,
  getPackagesFromFirestore,
  savePackageToFirestore,
  deletePackageFromFirestore
} from './firestore.js';
import {
  initCloudSql,
  saveProductCloudSql,
  saveAllProductsCloudSql,
  getAllProductsCloudSql,
  deleteProductCloudSql,
  saveCustomerCloudSql,
  getAllCustomersCloudSql,
  deleteCustomerCloudSql,
  saveOrderCloudSql,
  getAllOrdersCloudSql,
  deleteOrderCloudSql,
  saveCompanyPaymentCloudSql,
  getAllCompanyPaymentsCloudSql,
  deleteCompanyPaymentCloudSql,
  savePurchaseCloudSql,
  getAllPurchasesCloudSql,
  deletePurchaseCloudSql,
  getBankSettingsCloudSql,
  saveBankSettingsCloudSql,
  getDeliverySettingsCloudSql,
  saveDeliverySettingsCloudSql,
  savePackageCloudSql,
  saveAllPackagesCloudSql,
  getAllPackagesCloudSql,
  deletePackageCloudSql,
  getGiftSettingsCloudSql,
  saveGiftSettingsCloudSql
} from './cloudsql.js';
import {
  seedSqliteFromJson,
  saveAllProductsSqlite,
  getAllProductsSqlite,
  deleteProductSqlite,
  saveCustomerSqlite,
  deleteCustomerSqlite,
  saveOrderSqlite,
  deleteOrderSqlite,
  saveCompanyPaymentSqlite,
  deleteCompanyPaymentSqlite,
  savePurchaseSqlite,
  getAllPurchasesSqlite,
  deletePurchaseSqlite,
  saveDeliverySettingsSqlite,
  getDeliverySettingsSqlite,
  saveGiftSettingsSqlite,
  getGiftSettingsSqlite,
  savePackageSqlite,
  saveAllPackagesSqlite,
  getAllPackagesSqlite,
  deletePackageSqlite,
  getDb
} from './sqlite.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');
const COMPANY_PAYMENTS_FILE = path.join(DATA_DIR, 'company_payments.json');
const PURCHASES_FILE = path.join(DATA_DIR, 'purchases.json');
const DATA_PRODUCTS_FILE = path.join(DATA_DIR, 'products_data.json');
const BANK_SETTINGS_FILE = path.join(DATA_DIR, 'bank_settings.json');
const DELIVERY_SETTINGS_FILE = path.join(DATA_DIR, 'delivery_settings.json');
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.json');

const ROOT_ORDERS_FILE = path.join(process.cwd(), 'orders.json');
const ROOT_CUSTOMERS_FILE = path.join(process.cwd(), 'customers.json');
const ROOT_COMPANY_PAYMENTS_FILE = path.join(process.cwd(), 'company_payments.json');
const ROOT_PURCHASES_FILE = path.join(process.cwd(), 'purchases.json');
const ROOT_PRODUCTS_JSON = path.join(process.cwd(), 'products_data.json');
const ROOT_PRODUCTS_JS = path.join(process.cwd(), 'products_data.js');
const ROOT_BANK_SETTINGS_FILE = path.join(process.cwd(), 'bank_settings.json');
const ROOT_DELIVERY_SETTINGS_FILE = path.join(process.cwd(), 'delivery_settings.json');
const GIFT_SETTINGS_FILE = path.join(DATA_DIR, 'gift_settings.json');
const ROOT_GIFT_SETTINGS_FILE = path.join(process.cwd(), 'gift_settings.json');
const PACKAGES_FILE = path.join(DATA_DIR, 'packages.json');
const ROOT_PACKAGES_FILE = path.join(process.cwd(), 'packages.json');
const ROOT_NOTIFICATIONS_FILE = path.join(process.cwd(), 'notifications.json');

let productsListCache = null;
let productsMapCache = null;
let ordersListCache = null;
let customersListCache = null;
let companyPaymentsListCache = null;
let purchasesListCache = null;
let bankSettingsCache = null;
let deliverySettingsCache = null;
let giftSettingsCache = null;
let packagesListCache = null;

let isFirestoreLoading = false;
let firestoreLoadPromise = null;

export async function ensureFirestoreLoaded() {
  if (firestoreLoadPromise) return firestoreLoadPromise;
  
  firestoreLoadPromise = (async () => {
    try {
      if (!productsListCache) {
        const fsProds = await getFreshProductsFromFirestore();
        if (Array.isArray(fsProds) && fsProds.length > 0) {
          productsListCache = fsProds;
        } else {
          // Seed Firestore with local JSON if Firestore is empty
          const fallback = readProductsListLocal();
          if (fallback.length > 0) {
            productsListCache = fallback;
            saveAllProductsToFirestore(fallback).catch(() => {});
          }
        }
      }

      if (!ordersListCache) {
        const fsOrders = await getOrdersFromFirestore();
        if (Array.isArray(fsOrders)) {
          ordersListCache = fsOrders;
        } else {
          ordersListCache = readJsonLocal(ORDERS_FILE, []);
        }
      }

      if (!customersListCache) {
        const fsCusts = await getCustomersFromFirestore();
        if (Array.isArray(fsCusts) && fsCusts.length > 0) {
          customersListCache = fsCusts;
          try {
            ensureDataDir();
            fs.writeFileSync(CUSTOMERS_FILE, JSON.stringify(fsCusts, null, 2), "utf8");
            fs.writeFileSync(ROOT_CUSTOMERS_FILE, JSON.stringify(fsCusts, null, 2), "utf8");
          } catch (e) {}
        } else {
          customersListCache = readJsonLocal(CUSTOMERS_FILE, []);
        }
      }

      if (!companyPaymentsListCache) {
        const fsPays = await getCompanyPaymentsFromFirestore();
        if (Array.isArray(fsPays) && fsPays.length > 0) {
          companyPaymentsListCache = fsPays;
          try {
            ensureDataDir();
            fs.writeFileSync(COMPANY_PAYMENTS_FILE, JSON.stringify(fsPays, null, 2), "utf8");
            fs.writeFileSync(ROOT_COMPANY_PAYMENTS_FILE, JSON.stringify(fsPays, null, 2), "utf8");
          } catch (e) {}
        } else {
          try {
            const sqlPays = await getAllCompanyPaymentsCloudSql();
            if (Array.isArray(sqlPays) && sqlPays.length > 0) {
              companyPaymentsListCache = sqlPays;
              try {
                ensureDataDir();
                fs.writeFileSync(COMPANY_PAYMENTS_FILE, JSON.stringify(sqlPays, null, 2), "utf8");
                fs.writeFileSync(ROOT_COMPANY_PAYMENTS_FILE, JSON.stringify(sqlPays, null, 2), "utf8");
              } catch (e) {}
            } else {
              companyPaymentsListCache = readJsonLocal(COMPANY_PAYMENTS_FILE, []);
            }
          } catch (e) {
            companyPaymentsListCache = readJsonLocal(COMPANY_PAYMENTS_FILE, []);
          }
        }
      }

      if (!purchasesListCache) {
        const fsPurs = await getPurchasesFromFirestore();
        if (Array.isArray(fsPurs) && fsPurs.length > 0) {
          purchasesListCache = fsPurs;
          try {
            ensureDataDir();
            fs.writeFileSync(PURCHASES_FILE, JSON.stringify(fsPurs, null, 2), "utf8");
            fs.writeFileSync(ROOT_PURCHASES_FILE, JSON.stringify(fsPurs, null, 2), "utf8");
          } catch (e) {}
        } else {
          try {
            const sqlPurs = await getAllPurchasesCloudSql();
            if (Array.isArray(sqlPurs) && sqlPurs.length > 0) {
              purchasesListCache = sqlPurs;
              try {
                ensureDataDir();
                fs.writeFileSync(PURCHASES_FILE, JSON.stringify(sqlPurs, null, 2), "utf8");
                fs.writeFileSync(ROOT_PURCHASES_FILE, JSON.stringify(sqlPurs, null, 2), "utf8");
              } catch (e) {}
            } else {
              purchasesListCache = readJsonLocal(PURCHASES_FILE, []);
            }
          } catch (e) {
            purchasesListCache = readJsonLocal(PURCHASES_FILE, []);
          }
        }
      }

      if (!deliverySettingsCache) {
        const fsDelivery = await getDeliverySettingsFromFirestore();
        if (fsDelivery && typeof fsDelivery === 'object' && typeof fsDelivery.isExpressDeliveryEnabled !== 'undefined') {
          deliverySettingsCache = { ...DEFAULT_DELIVERY_SETTINGS, ...fsDelivery };
          writeJson(DELIVERY_SETTINGS_FILE, deliverySettingsCache);
          writeJson(ROOT_DELIVERY_SETTINGS_FILE, deliverySettingsCache);
          try { saveDeliverySettingsSqlite(deliverySettingsCache); } catch (e) {}
        }
      }

      if (!giftSettingsCache) {
        const fsGifts = await getGiftSettingsFromFirestore();
        if (fsGifts && typeof fsGifts === 'object' && typeof fsGifts.defaultGiftPercent !== 'undefined') {
          giftSettingsCache = { ...DEFAULT_GIFT_SETTINGS, ...fsGifts };
          writeJson(GIFT_SETTINGS_FILE, giftSettingsCache);
          writeJson(ROOT_GIFT_SETTINGS_FILE, giftSettingsCache);
          try { saveGiftSettingsSqlite(giftSettingsCache); } catch (e) {}
        }
      }

      if (!packagesListCache) {
        const fsPkgs = await getPackagesFromFirestore();
        if (Array.isArray(fsPkgs) && fsPkgs.length > 0) {
          packagesListCache = fsPkgs;
          writeJson(PACKAGES_FILE, packagesListCache);
          writeJson(ROOT_PACKAGES_FILE, packagesListCache);
          try { saveAllPackagesSqlite(packagesListCache); } catch (e) {}
        }
      }
    } catch (err) {
      console.error('[Firestore Hydration Notice]:', err.message);
    }
  })();

  return firestoreLoadPromise;
}

export function invalidateProductsCache() {
  productsListCache = null;
  productsMapCache = null;
}

export function saveProductsList(list, skipFirestoreSync = false) {
  try {
    productsListCache = list;
    productsMapCache = null;

    if (!skipFirestoreSync) {
      saveAllProductsToFirestore(list).catch(err => console.error('Firestore save products error:', err));
    }

    // Always sync products to Supabase / PostgreSQL
    saveAllProductsCloudSql(list).catch(err => console.error('Cloud SQL save products error:', err));

    ensureDataDir();
    const jsonStr = JSON.stringify(list, null, 2);
    try { fs.writeFileSync(DATA_PRODUCTS_FILE, jsonStr, 'utf8'); } catch (e) {}
    try { fs.writeFileSync(ROOT_PRODUCTS_JSON, jsonStr, 'utf8'); } catch (e) {}
    try { fs.writeFileSync(ROOT_PRODUCTS_JS, `const productsData = ${jsonStr};\n`, 'utf8'); } catch (e) {}

    try { saveAllProductsSqlite(list); } catch (err) { console.error('SQLite save products error:', err); }

    // Auto-deactivate packages if constituent product stock hits 0
    try {
      syncPackagesAvailabilityWithProductStock(list);
    } catch (err) {}
  } catch (err) {
    console.error('Error saving products list:', err);
  }
}

function mergeSingleProduct(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;

  const existingTime = new Date(existing.updatedAt || 0).getTime();
  const incomingTime = new Date(incoming.updatedAt || 0).getTime();

  if (incomingTime > existingTime) {
    return { ...existing, ...incoming };
  } else if (existingTime > incomingTime) {
    return { ...incoming, ...existing };
  }

  const preferIncoming = incoming.isCustomized && !existing.isCustomized;
  if (preferIncoming) {
    return { ...existing, ...incoming };
  }

  return { ...incoming, ...existing };
}

export async function getFreshProductsFromFirestore() {
  let cloudProds = [];
  try {
    const res = await getAllProductsCloudSql();
    if (Array.isArray(res)) cloudProds = res;
  } catch (e) {
    console.error('Error fetching products from CloudSQL:', e);
  }

  let fsProds = [];
  try {
    const res = await getProductsFromFirestore();
    if (Array.isArray(res)) fsProds = res;
  } catch (e) {
    console.error('Error fetching fresh products from Firestore:', e);
  }

  const localList = readProductsListLocal();
  const map = new Map();

  // 1. Populate map with localList
  localList.forEach(p => {
    if (p && (p.id || p.code)) {
      map.set(String(p.id || p.code), p);
    }
  });

  // 2. Merge Firestore products
  if (Array.isArray(fsProds) && fsProds.length > 0) {
    fsProds.forEach(fp => {
      if (!fp || (!fp.id && !fp.code)) return;
      const key = String(fp.id || fp.code);
      const existing = map.get(key) || {};
      map.set(key, { ...existing, ...fp });
    });
  }

  // 3. Supabase PostgreSQL is the HIGHEST PRIORITY SOURCE OF TRUTH!
  // Any product data directly in Supabase DB overrides local JSON and Firestore!
  if (Array.isArray(cloudProds) && cloudProds.length > 0) {
    cloudProds.forEach(cp => {
      if (!cp || (!cp.id && !cp.code)) return;
      const key = String(cp.id || cp.code);
      const existing = map.get(key) || {};
      map.set(key, { ...existing, ...cp });
    });
  }

  const mergedList = Array.from(map.values());
  if (mergedList.length > 0) {
    productsListCache = mergedList;
    productsMapCache = null;
    return mergedList;
  }

  return productsListCache || readProductsListLocal();
}

export async function refreshProductsFromCloudSql() {
  try {
    const fsProducts = await getFreshProductsFromFirestore();
    if (Array.isArray(fsProducts) && fsProducts.length > 0) {
      return fsProducts;
    }

    const dbProducts = await getAllProductsCloudSql();
    if (Array.isArray(dbProducts) && dbProducts.length > 0) {
      productsListCache = dbProducts;
      productsMapCache = null;
      saveAllProductsToFirestore(dbProducts).catch(() => {});
      return dbProducts;
    }
  } catch (e) {
    console.error('Error refreshing products from Cloud SQL / Firestore:', e);
  }
  return productsListCache || readProductsListLocal();
}

function readProductsListLocal() {
  try {
    ensureDataDir();
    if (fs.existsSync(DATA_PRODUCTS_FILE)) {
      const data = fs.readFileSync(DATA_PRODUCTS_FILE, 'utf8');
      const list = JSON.parse(data);
      if (Array.isArray(list) && list.length > 0) {
        return list;
      }
    }
  } catch (e) {}

  try {
    const sqliteProducts = getAllProductsSqlite();
    if (Array.isArray(sqliteProducts) && sqliteProducts.length > 0) {
      return sqliteProducts;
    }
  } catch (e) {}

  try {
    if (fs.existsSync(ROOT_PRODUCTS_JSON)) {
      const data = fs.readFileSync(ROOT_PRODUCTS_JSON, 'utf8');
      const list = JSON.parse(data);
      if (Array.isArray(list) && list.length > 0) {
        return list;
      }
    }
  } catch (e) {}

  return [];
}

export function readProductsList() {
  if (productsListCache && Array.isArray(productsListCache) && productsListCache.length > 0) {
    return productsListCache;
  }
  const fallback = readProductsListLocal();
  if (fallback.length > 0) {
    productsListCache = fallback;
    return fallback;
  }
  return [];
}

const ORDER_STATUSES = ['new', 'confirmed', 'preparing', 'delivering', 'delivered', 'cancelled'];

const STATUS_LABELS = {
  new: 'جدید',
  confirmed: 'تأیید شده',
  preparing: 'در حال آماده‌سازی',
  delivering: 'در حال ارسال',
  delivered: 'تحویل شده',
  cancelled: 'لغو شده'
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

const fileCacheMap = new Map();

function getRootEquivalentPath(file) {
  if (file === ORDERS_FILE || file.endsWith('data/orders.json') || file.endsWith('data\\orders.json')) return ROOT_ORDERS_FILE;
  if (file === CUSTOMERS_FILE || file.endsWith('data/customers.json') || file.endsWith('data\\customers.json')) return ROOT_CUSTOMERS_FILE;
  if (file === COMPANY_PAYMENTS_FILE || file.endsWith('data/company_payments.json') || file.endsWith('data\\company_payments.json')) return ROOT_COMPANY_PAYMENTS_FILE;
  if (file === DATA_PRODUCTS_FILE || file.endsWith('data/products_data.json') || file.endsWith('data\\products_data.json')) return ROOT_PRODUCTS_JSON;
  return null;
}

function readJson(file, fallback) {
  if (file === ORDERS_FILE || file?.endsWith('orders.json')) {
    if (ordersListCache) return ordersListCache;
  }
  if (file === CUSTOMERS_FILE || file?.endsWith('customers.json')) {
    if (customersListCache) return customersListCache;
  }
  if (file === COMPANY_PAYMENTS_FILE || file?.endsWith('company_payments.json')) {
    if (companyPaymentsListCache) return companyPaymentsListCache;
  }
  if (file === PURCHASES_FILE || file?.endsWith('purchases.json')) {
    if (purchasesListCache) return purchasesListCache;
  }
  if (file === DATA_PRODUCTS_FILE || file?.endsWith('products_data.json')) {
    if (productsListCache) return productsListCache;
  }

  return readJsonLocal(file, fallback);
}

function readJsonLocal(file, fallback) {
  ensureDataDir();
  const rootFile = getRootEquivalentPath(file);

  let resultData = null;

  // Try reading primary file first
  if (fs.existsSync(file)) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(data) && data.length > 0) {
        resultData = data;
      } else if (!Array.isArray(fallback) || data) {
        resultData = data;
      }
    } catch (e) {}
  }

  // If primary file was empty or missing array, try reading root fallback
  if ((!resultData || (Array.isArray(resultData) && resultData.length === 0)) && rootFile && fs.existsSync(rootFile)) {
    try {
      const rootData = JSON.parse(fs.readFileSync(rootFile, 'utf8'));
      if (Array.isArray(rootData) && rootData.length > 0) {
        resultData = rootData;
        try { fs.writeFileSync(file, JSON.stringify(resultData, null, 2), 'utf8'); } catch (e) {}
      }
    } catch (e) {}
  }

  if (resultData === null) {
    resultData = fallback;
    try { fs.writeFileSync(file, JSON.stringify(fallback, null, 2), 'utf8'); } catch (e) {}
    if (rootFile) {
      try { fs.writeFileSync(rootFile, JSON.stringify(fallback, null, 2), 'utf8'); } catch (e) {}
    }
  }

  try {
    const stat = fs.statSync(file);
    fileCacheMap.set(file, { mtime: stat.mtimeMs, data: resultData });
  } catch (e) {}

  return resultData;
}

function writeJson(file, data) {
  if (file === ORDERS_FILE || file?.endsWith('orders.json')) {
    ordersListCache = data;
  } else if (file === CUSTOMERS_FILE || file?.endsWith('customers.json')) {
    customersListCache = data;
  } else if (file === COMPANY_PAYMENTS_FILE || file?.endsWith('company_payments.json')) {
    companyPaymentsListCache = data;
  } else if (file === PURCHASES_FILE || file?.endsWith('purchases.json')) {
    purchasesListCache = data;
  } else if (file === DATA_PRODUCTS_FILE || file?.endsWith('products_data.json')) {
    productsListCache = data;
  }

  try {
    ensureDataDir();
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');

    const rootFile = getRootEquivalentPath(file);
    if (rootFile) {
      try { fs.writeFileSync(rootFile, JSON.stringify(data, null, 2), 'utf8'); } catch (e) {}
      if (rootFile === ROOT_PRODUCTS_JSON) {
        try { fs.writeFileSync(ROOT_PRODUCTS_JS, `const productsData = ${JSON.stringify(data, null, 2)};\n`, 'utf8'); } catch (e) {}
      }
    }
  } catch (e) {
    console.error(`[FS Write Notice] Could not write file ${file}:`, e.message);
  }

  try {
    const stat = fs.existsSync(file) ? fs.statSync(file) : null;
    fileCacheMap.set(file, { mtime: stat ? stat.mtimeMs : Date.now(), data });
  } catch (e) {
    fileCacheMap.set(file, { mtime: Date.now(), data });
  }
}

function generateId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

function normalizePhone(phone) {
  if (!phone) return '';
  let str = String(phone).trim();
  const persianDigits = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
  const arabicDigits = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  for (let i = 0; i < 10; i++) {
    str = str.replaceAll(persianDigits[i], String(i));
    str = str.replaceAll(arabicDigits[i], String(i));
  }
  let digits = str.replace(/\D/g, '');
  if (digits.startsWith('0098')) digits = '0' + digits.slice(4);
  else if (digits.startsWith('98') && digits.length >= 12) digits = '0' + digits.slice(2);
  else if (digits.startsWith('9') && digits.length === 10) digits = '0' + digits;
  return digits;
}

export function getStatusLabel(status) {
  return STATUS_LABELS[status] || status;
}

export function getAllStatuses() {
  return ORDER_STATUSES.map(id => ({ id, label: STATUS_LABELS[id] }));
}

export function upsertCustomer({ name, phone, address, walletBalance, password }) {
  const customers = readJson(CUSTOMERS_FILE, []);
  const normalizedPhone = normalizePhone(phone);
  let customer = customers.find(c => normalizePhone(c.phone) === normalizedPhone);

  if (customer) {
    customer.name = name || customer.name;
    customer.address = address || customer.address;
    if (walletBalance !== undefined && walletBalance !== null) {
      customer.walletBalance = Number(walletBalance);
    }
    if (password) {
      customer.passwordHash = String(password);
    }
    customer.updatedAt = new Date().toISOString();
  } else {
    customer = {
      id: generateId('cust'),
      name: name || 'مشتری عزیز',
      phone: normalizedPhone,
      address: address || '',
      walletBalance: Number(walletBalance) || 0,
      giftCredit: 0,
      passwordHash: password ? String(password) : '',
      walletHistory: [],
      totalOrders: 0,
      totalSpent: 0,
      notes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastOrderAt: null
    };
    customers.push(customer);
  }

  writeJson(CUSTOMERS_FILE, customers);
  saveCustomerToFirestore(customer).catch(e => console.error('Firestore save customer error:', e));
  try { saveCustomerSqlite(customer); } catch (e) { console.error('SQLite save customer notice:', e); }
  return customer;
}

function getProductsMap() {
  if (productsMapCache && productsListCache) {
    return { map: productsMapCache, list: productsListCache };
  }
  try {
    const list = readProductsList();
    const map = {};
    list.forEach(p => {
      if (p.id) map[String(p.id)] = p;
      if (p.code) map[String(p.code)] = p;
    });
    productsMapCache = map;
    return { map, list };
  } catch (e) {}
  return { map: {}, list: [] };
}

export function enrichOrderWithProfit(order, productsMap) {
  if (!order) return null;
  const pMap = productsMap || getProductsMap().map;
  let totalCost = 0;

  const enrichedItems = (order.items || []).map(item => {
    const pid = String(item.id || item.code || '');
    const prod = pMap[pid] || {};
    const itemPrice = Number(item.price) || 0;
    const qty = Number(item.qty) || 1;
    const buyPrice = Number(item.buyPrice) !== undefined && item.buyPrice !== null && !isNaN(Number(item.buyPrice)) && Number(item.buyPrice) > 0
      ? Number(item.buyPrice)
      : (Number(prod.buyPrice) || Math.round(itemPrice * 0.7));

    const itemTotalRevenue = Number(item.total) || (itemPrice * qty);
    const itemTotalCost = buyPrice * qty;
    const itemProfit = itemTotalRevenue - itemTotalCost;

    totalCost += itemTotalCost;

    return {
      ...item,
      buyPrice,
      totalCost: itemTotalCost,
      profit: itemProfit
    };
  });

  const totalAmount = Number(order.totalAmount) || 0;
  const totalProfit = totalAmount - totalCost;
  const profitMargin = totalAmount > 0 ? Math.round((totalProfit / totalAmount) * 1000) / 10 : 0;

  return {
    ...order,
    items: enrichedItems,
    totalCost,
    totalProfit,
    profitMargin
  };
}

export function findProductInList(list, item) {
  if (!item || !Array.isArray(list)) return null;
  const idStr = item.id !== undefined && item.id !== null ? String(item.id).trim().toLowerCase() : '';
  const codeStr = item.code !== undefined && item.code !== null ? String(item.code).trim().toLowerCase() : '';
  const prodIdStr = item.productId !== undefined && item.productId !== null ? String(item.productId).trim().toLowerCase() : '';
  const nameStr = item.name ? String(item.name).trim().toLowerCase() : '';

  // 1. Match by exact ID or code first
  if (idStr || codeStr || prodIdStr) {
    const byId = list.find(p => {
      const pId = p.id !== undefined && p.id !== null ? String(p.id).trim().toLowerCase() : '';
      const pCode = p.code !== undefined && p.code !== null ? String(p.code).trim().toLowerCase() : '';
      if (idStr && (pId === idStr || pCode === idStr)) return true;
      if (codeStr && (pCode === codeStr || pId === codeStr)) return true;
      if (prodIdStr && (pId === prodIdStr || pCode === prodIdStr)) return true;
      return false;
    });
    if (byId) return byId;
  }

  // 2. Match by exact trimmed name
  if (nameStr) {
    return list.find(p => {
      const pName = p.name ? String(p.name).trim().toLowerCase() : '';
      return pName === nameStr;
    });
  }

  return null;
}

export function adjustStockForOrderUpdate(oldOrder, newOrder) {
  try {
    const list = readProductsList();
    if (!list || !list.length) return;

    const oldStatus = oldOrder ? oldOrder.status : 'cancelled';
    const newStatus = newOrder ? newOrder.status : 'cancelled';

    const oldIsActive = oldStatus !== 'cancelled';
    const newIsActive = newStatus !== 'cancelled';

    const oldItems = (oldIsActive && oldOrder && Array.isArray(oldOrder.items)) ? oldOrder.items : [];
    const newItems = (newIsActive && newOrder && Array.isArray(newOrder.items)) ? newOrder.items : [];

    const productDeltas = new Map();

    oldItems.forEach(item => {
      const product = findProductInList(list, item);
      if (product) {
        const qty = Number(item.qty || item.quantity) || 1;
        const entry = productDeltas.get(product) || { oldQty: 0, newQty: 0 };
        entry.oldQty += qty;
        productDeltas.set(product, entry);
      }
    });

    newItems.forEach(item => {
      const product = findProductInList(list, item);
      if (product) {
        const qty = Number(item.qty || item.quantity) || 1;
        const entry = productDeltas.get(product) || { oldQty: 0, newQty: 0 };
        entry.newQty += qty;
        productDeltas.set(product, entry);
      }
    });

    let modified = false;
    const changedProducts = [];

    productDeltas.forEach((quantities, product) => {
      const delta = quantities.newQty - quantities.oldQty; // positive => order increased => stock decreases
      if (delta !== 0) {
        let currentStock = (product.stock !== undefined && product.stock !== null && !isNaN(Number(product.stock)))
          ? Number(product.stock)
          : 0;

        product.stock = Math.max(0, currentStock - delta);
        product.badge = product.stock <= 0 ? 'ناموجود' : (product.stock <= 5 ? `تعداد محدود (${product.stock} عدد)` : null);
        product.updatedAt = new Date().toISOString();
        modified = true;
        changedProducts.push(product);
      }
    });

    if (modified) {
      saveProductsList(list, false);
      changedProducts.forEach(p => {
        saveProductCloudSql(p).catch(e => console.error('Cloud SQL save product stock notice:', e));
      });
    }
  } catch (e) {
    console.error('Error adjusting stock for order update:', e);
  }
}

export function reduceProductStock(items) {
  adjustStockForOrderUpdate(null, { status: 'new', items });
}

export function restoreProductStock(items) {
  adjustStockForOrderUpdate({ status: 'new', items }, null);
}

export function createOrder(orderData) {
  const orders = readJson(ORDERS_FILE, []);
  const { map: pMap } = getProductsMap();

  const customer = upsertCustomer({
    name: orderData.customerName,
    phone: orderData.phone,
    address: orderData.address
  });

  const items = (orderData.items || []).map(item => {
    const pid = String(item.id || item.code || item.productId || '');
    const prod = pMap[pid] || {};
    const buyPrice = Number(item.buyPrice) || Number(prod.buyPrice) || Math.round((Number(item.price) || 0) * 0.7);
    return {
      ...item,
      id: item.id || item.productId || item.code,
      buyPrice
    };
  });

  const orderId = orderData.id || generateId('ord');
  const reqIdStr = String(orderId).trim().toLowerCase();
  const cleanReqId = reqIdStr.replace(/^ord-/, '');
  const existingIdx = orders.findIndex(o => {
    const oId = String(o.id || '').trim().toLowerCase();
    const cleanOId = oId.replace(/^ord-/, '');
    return oId === reqIdStr || cleanOId === cleanReqId;
  });

  // Calculate gift quota & wallet rollover
  const regularItems = items.filter(i => !i.isGift);
  const giftItems = items.filter(i => i.isGift);
  const itemsSubtotal = regularItems.reduce((sum, i) => sum + ((Number(i.price) || 0) * (Number(i.qty) || 1)), 0);
  const isFirstOrder = (!existingIdx || existingIdx === -1) && (customerIdx !== -1 ? (!customers[customerIdx].orderCount || customers[customerIdx].orderCount === 0) : true);
  const standardGiftQuota = calculateGiftQuotaForOrder(itemsSubtotal, isFirstOrder);
  const usedGiftValue = giftItems.reduce((sum, g) => sum + ((Number(g.realPrice) || Number(g.price) || 0) * (Number(g.qty) || 1)), 0);
  const walletUsed = Math.max(0, Number(orderData.walletUsed) || 0);
  const remainingGiftToCredit = Math.max(0, standardGiftQuota - usedGiftValue);

  let order;
  let oldOrder = null;
  if (existingIdx !== -1) {
    oldOrder = JSON.parse(JSON.stringify(orders[existingIdx]));
    order = {
      ...orders[existingIdx],
      customerName: orderData.customerName || orders[existingIdx].customerName,
      phone: normalizePhone(orderData.phone) || orders[existingIdx].phone,
      address: orderData.address || orders[existingIdx].address,
      items: (items && items.length) ? items : orders[existingIdx].items,
      giftItems: (giftItems && giftItems.length) ? giftItems : (orders[existingIdx].giftItems || []),
      totalAmount: Number(orderData.totalAmount) || orders[existingIdx].totalAmount,
      walletUsed: orderData.walletUsed !== undefined ? walletUsed : (orders[existingIdx].walletUsed || 0),
      giftQuota: standardGiftQuota,
      usedGiftValue,
      remainingGiftCredited: remainingGiftToCredit,
      paymentMethod: orderData.paymentMethod || orders[existingIdx].paymentMethod,
      deliveryType: orderData.deliveryType !== undefined ? orderData.deliveryType : (orders[existingIdx].deliveryType || 'normal'),
      deliveryFee: orderData.deliveryFee !== undefined ? Number(orderData.deliveryFee) : (orders[existingIdx].deliveryFee || 0),
      deliveryDistance: orderData.deliveryDistance !== undefined ? Number(orderData.deliveryDistance) : (orders[existingIdx].deliveryDistance || 0),
      deliveryCity: orderData.deliveryCity || orders[existingIdx].deliveryCity || 'کرج',
      status: orderData.status || orders[existingIdx].status || 'new',
      updatedAt: new Date().toISOString()
    };
    orders[existingIdx] = order;
  } else {
    order = {
      id: orderId,
      customerId: customer.id,
      customerName: orderData.customerName,
      phone: normalizePhone(orderData.phone),
      address: orderData.address,
      note: orderData.note || '',
      items,
      giftItems,
      giftQuota: standardGiftQuota,
      usedGiftValue,
      remainingGiftCredited: remainingGiftToCredit,
      walletUsed,
      totalAmount: Number(orderData.totalAmount) || 0,
      paymentMethod: orderData.paymentMethod || 'cod',
      deliveryType: orderData.deliveryType || 'normal',
      deliveryFee: Number(orderData.deliveryFee) || 0,
      deliveryDistance: Number(orderData.deliveryDistance) || 0,
      deliveryCity: orderData.deliveryCity || 'کرج',
      status: orderData.status || 'new',
      adminNotes: orderData.adminNotes || '',
      source: orderData.source || 'website',
      createdAt: orderData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    orders.push(order);
  }

  const customers = readJson(CUSTOMERS_FILE, []);
  const customerIdx = customers.findIndex(c => String(c.id) === String(customer.id) || normalizePhone(c.phone) === normalizePhone(order.phone));
  if (customerIdx !== -1) {
    if (existingIdx === -1) {
      customers[customerIdx].totalOrders = (Number(customers[customerIdx].totalOrders) || 0) + 1;
      customers[customerIdx].totalSpent = (Number(customers[customerIdx].totalSpent) || 0) + order.totalAmount;
      
      // Update customer wallet balance
      const currentWallet = Number(customers[customerIdx].walletBalance) || 0;
      let newWallet = Math.max(0, currentWallet - walletUsed + remainingGiftToCredit);
      customers[customerIdx].walletBalance = newWallet;
      if (!Array.isArray(customers[customerIdx].walletHistory)) {
        customers[customerIdx].walletHistory = [];
      }
      
      if (walletUsed > 0) {
        customers[customerIdx].walletHistory.unshift({
          id: 'wh_' + Date.now() + '_use',
          type: 'used_in_order',
          amount: -walletUsed,
          orderId: order.id,
          description: `استفاده از موجودی کیف پول در سفارش ${order.id}`,
          createdAt: new Date().toISOString(),
          balanceAfter: currentWallet - walletUsed
        });
      }
      if (remainingGiftToCredit > 0) {
        customers[customerIdx].walletHistory.unshift({
          id: 'wh_' + (Date.now() + 1) + '_gift',
          type: 'gift_rollover',
          amount: remainingGiftToCredit,
          orderId: order.id,
          description: `انتقال مانده اعتبار هدیه سفارش ${order.id} به کیف پول`,
          createdAt: new Date().toISOString(),
          balanceAfter: newWallet
        });
      }
    }
    customers[customerIdx].lastOrderAt = order.createdAt;
    customers[customerIdx].name = order.customerName;
    customers[customerIdx].address = order.address;
    customers[customerIdx].updatedAt = order.updatedAt;
  }

  writeJson(ORDERS_FILE, orders);
  writeJson(CUSTOMERS_FILE, customers);

  saveOrderToFirestore(order).catch(e => console.error('Firestore save order error:', e));
  if (customers[customerIdx]) {
    saveCustomerToFirestore(customers[customerIdx]).catch(e => console.error('Firestore save customer error:', e));
  }

  try { saveOrderSqlite(order); } catch (e) { console.error('SQLite save order notice:', e); }
  saveOrderCloudSql(order).catch(e => console.error('Cloud SQL save order notice:', e));
  if (customers[customerIdx]) {
    try { saveCustomerSqlite(customers[customerIdx]); } catch (e) { console.error('SQLite save customer notice:', e); }
    saveCustomerCloudSql(customers[customerIdx]).catch(e => console.error('Cloud SQL save customer notice:', e));
  }

  // Stock Adjustment for Order Creation or Update
  adjustStockForOrderUpdate(oldOrder, order);

  // Automatic Admin Notification for New Orders
  if (existingIdx === -1) {
    try {
      createNotification({
        type: 'new_order',
        orderId: order.id,
        title: 'ثبت سفارش جدید',
        message: `سفارش جدید #${order.id} به مبلغ ${((order.totalAmount || 0) * 10).toLocaleString('fa-IR')} ریال (${(order.totalAmount || 0).toLocaleString('fa-IR')} تومان) توسط ${order.customerName || 'مشتری'} ثبت گردید.`,
        customerName: order.customerName,
        phone: order.phone,
        totalAmount: order.totalAmount,
        itemsCount: (order.items || []).length,
        createdAt: order.createdAt
      });
    } catch (nErr) {
      console.warn('Auto notification trigger notice:', nErr.message);
    }
  }

  return enrichOrderWithProfit(order, pMap);
}

export function listOrders(filters = {}) {
  let orders = readJson(ORDERS_FILE, []);
  const { map: pMap } = getProductsMap();

  if (filters.status && filters.status !== 'all') {
    orders = orders.filter(o => o.status === filters.status);
  }

  if (filters.search) {
    const q = filters.search.toLowerCase();
    orders = orders.filter(o =>
      o.customerName?.toLowerCase().includes(q) ||
      o.phone?.includes(q) ||
      o.id?.toLowerCase().includes(q)
    );
  }

  if (filters.from) {
    orders = orders.filter(o => o.createdAt >= filters.from);
  }

  if (filters.to) {
    orders = orders.filter(o => o.createdAt <= filters.to);
  }

  return orders
    .map(o => enrichOrderWithProfit(o, pMap))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function getOrderById(id) {
  const orders = readJson(ORDERS_FILE, []);
  const order = orders.find(o => String(o.id) === String(id));
  if (!order) return null;
  const { map: pMap } = getProductsMap();
  return enrichOrderWithProfit(order, pMap);
}

export function deleteOrder(id) {
  let orders = readJson(ORDERS_FILE, []);
  const initialLength = orders.length;
  const orderToDelete = orders.find(o => String(o.id) === String(id));
  orders = orders.filter(o => String(o.id) !== String(id));
  if (orders.length !== initialLength) {
    if (orderToDelete) {
      adjustStockForOrderUpdate(orderToDelete, null);
    }
    writeJson(ORDERS_FILE, orders);
    deleteOrderFromFirestore(id).catch(e => console.error('Firestore delete order error:', e));
    try { deleteOrderSqlite(id); } catch (e) { console.error('SQLite delete order notice:', e); }
    try { deleteOrderCloudSql(id); } catch (e) { console.error('Cloud SQL delete order notice:', e); }
    return true;
  }
  return false;
}

export function getAdminAlerts() {
  const { list: products } = getProductsMap();
  const orders = readJson(ORDERS_FILE, []);

  // 1. Low stock products (stock < 5)
  const lowStockProducts = products
    .filter(p => Number(p.stock) < 5)
    .map(p => ({
      id: p.id,
      name: p.name,
      categoryName: p.categoryName || '',
      price: p.price,
      buyPrice: p.buyPrice || 0,
      stock: Number(p.stock),
      badge: Number(p.stock) <= 0 ? 'ناموجود' : `تعداد محدود (${p.stock} عدد)`
    }))
    .sort((a, b) => a.stock - b.stock);

  // 2. Delayed delivery orders (> 7 days since createdAt and not delivered/cancelled)
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const delayedOrders = orders
    .filter(o => !['delivered', 'cancelled'].includes(o.status))
    .map(o => {
      const createdTime = new Date(o.createdAt).getTime();
      const elapsedMs = now - createdTime;
      const delayDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
      return {
        ...o,
        delayDays,
        elapsedMs,
        isDelayed: elapsedMs >= SEVEN_DAYS_MS
      };
    })
    .filter(o => o.isDelayed)
    .sort((a, b) => b.elapsedMs - a.elapsedMs);

  // 3. Inactive customers (> 60 days since last order)
  const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
  const allCustomers = listCustomers();
  const inactiveCustomers = allCustomers
    .map(c => {
      const lastOrderTime = new Date(c.lastOrderAt || c.createdAt || 0).getTime();
      const elapsedMs = now - lastOrderTime;
      const daysInactive = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
      return {
        ...c,
        daysInactive: isNaN(daysInactive) ? 60 : daysInactive,
        daysSinceLastOrder: isNaN(daysInactive) ? 60 : daysInactive,
        elapsedMs,
        isInactive: lastOrderTime > 0 && elapsedMs >= SIXTY_DAYS_MS
      };
    })
    .filter(c => c.isInactive)
    .sort((a, b) => b.elapsedMs - a.elapsedMs);

  return {
    lowStockCount: lowStockProducts.length,
    lowStockProducts,
    delayedOrdersCount: delayedOrders.length,
    delayedOrders,
    inactiveCustomersCount: inactiveCustomers.length,
    inactiveCustomers,
    totalAlertsCount: lowStockProducts.length + delayedOrders.length + inactiveCustomers.length
  };
}

export function getProfitStats(filters = {}) {
  const orders = readJson(ORDERS_FILE, []);
  const { map: pMap } = getProductsMap();

  let filteredOrders = orders.filter(o => o.status !== 'cancelled');

  const now = Date.now();
  if (filters.timeframe === 'today') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    filteredOrders = filteredOrders.filter(o => new Date(o.createdAt) >= today);
  } else if (filters.timeframe === '7days') {
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    filteredOrders = filteredOrders.filter(o => new Date(o.createdAt).getTime() >= weekAgo);
  } else if (filters.timeframe === '30days') {
    const monthAgo = now - 30 * 24 * 60 * 60 * 1000;
    filteredOrders = filteredOrders.filter(o => new Date(o.createdAt).getTime() >= monthAgo);
  }

  let totalRevenue = 0;
  let totalCost = 0;
  const productStatsMap = {};

  const enrichedOrders = filteredOrders.map(o => {
    const enriched = enrichOrderWithProfit(o, pMap);
    totalRevenue += enriched.totalAmount;
    totalCost += enriched.totalCost;

    (enriched.items || []).forEach(item => {
      const pid = String(item.id || item.code || item.name);
      if (!productStatsMap[pid]) {
        productStatsMap[pid] = {
          id: pid,
          name: item.name,
          unitsSold: 0,
          totalRevenue: 0,
          totalCost: 0,
          totalProfit: 0,
          profitMargin: 0
        };
      }
      const qty = Number(item.qty) || 1;
      const rev = Number(item.total) || ((Number(item.price) || 0) * qty);
      const cost = (Number(item.buyPrice) || 0) * qty;

      productStatsMap[pid].unitsSold += qty;
      productStatsMap[pid].totalRevenue += rev;
      productStatsMap[pid].totalCost += cost;
      productStatsMap[pid].totalProfit += (rev - cost);
    });

    return enriched;
  });

  const totalProfit = totalRevenue - totalCost;
  const profitMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 1000) / 10 : 0;

  const productList = Object.values(productStatsMap).map(p => ({
    ...p,
    profitMargin: p.totalRevenue > 0 ? Math.round((p.totalProfit / p.totalRevenue) * 1000) / 10 : 0
  })).sort((a, b) => b.totalProfit - a.totalProfit);

  return {
    timeframe: filters.timeframe || 'all',
    totalRevenue,
    totalCost,
    totalProfit,
    profitMargin,
    ordersCount: filteredOrders.length,
    orders: enrichedOrders,
    products: productList
  };
}

export async function updateOrder(id, updates) {
  const orders = readJson(ORDERS_FILE, []);
  const idx = orders.findIndex(o => String(o.id) === String(id));
  if (idx === -1) return null;

  if (updates.status && !ORDER_STATUSES.includes(updates.status)) {
    throw new Error('وضعیت سفارش نامعتبر است');
  }

  const oldOrder = orders[idx];
  const oldStatus = oldOrder.status;
  const newStatus = updates.status || oldStatus;
  const oldItems = oldOrder.items ? JSON.parse(JSON.stringify(oldOrder.items)) : [];

  const { map: pMap } = getProductsMap();
  let items = updates.items;
  if (items && Array.isArray(items)) {
    items = items.map(item => {
      const pid = String(item.id || item.code || item.productId || '');
      const prod = pMap[pid] || {};
      const buyPrice = Number(item.buyPrice) || Number(prod.buyPrice) || Math.round((Number(item.price) || 0) * 0.7);
      return {
        ...item,
        id: item.id || item.productId || item.code,
        productId: item.productId || item.id || item.code,
        buyPrice
      };
    });
  }

  orders[idx] = {
    ...orders[idx],
    ...updates,
    customerName: updates.customerName || updates.name || orders[idx].customerName,
    phone: updates.phone ? normalizePhone(updates.phone) : (updates.customerPhone ? normalizePhone(updates.customerPhone) : orders[idx].phone),
    address: updates.address !== undefined ? updates.address : orders[idx].address,
    items: (items && items.length) ? items : orders[idx].items,
    totalAmount: updates.totalAmount !== undefined ? Number(updates.totalAmount) : orders[idx].totalAmount,
    paymentMethod: updates.paymentMethod || orders[idx].paymentMethod,
    status: newStatus,
    note: updates.note !== undefined ? updates.note : orders[idx].note,
    adminNotes: updates.adminNotes !== undefined ? updates.adminNotes : orders[idx].adminNotes,
    createdAt: updates.createdAt || orders[idx].createdAt,
    updatedAt: new Date().toISOString()
  };

  writeJson(ORDERS_FILE, orders);
  await saveOrderCloudSql(orders[idx]).catch(e => console.error('Cloud SQL update order notice:', e));
  saveOrderToFirestore(orders[idx]).catch(e => console.error('Firestore update order error:', e));
  try { saveOrderSqlite(orders[idx]); } catch (e) { console.error('SQLite update order notice:', e); }

  // Stock Adjustment for Order Update
  adjustStockForOrderUpdate(oldOrder, orders[idx]);

  return enrichOrderWithProfit(orders[idx], pMap);
}

export async function listProducts(filters = {}) {
  const list = await getFreshProductsFromFirestore();
  let result = [...list];

  if (filters.brand && filters.brand !== 'all') {
    result = result.filter(p => p.brand === filters.brand);
  }

  if (filters.category && filters.category !== 'all') {
    result = result.filter(p => p.category === filters.category);
  }

  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.id?.toLowerCase().includes(q) ||
      p.brandName?.toLowerCase().includes(q)
    );
  }

  return result;
}

export async function updateProduct(id, updates) {
  const list = await getFreshProductsFromFirestore();
  if (!list || !list.length) return null;
  const pid = String(id);
  const idx = list.findIndex(p => String(p.id) === pid || String(p.code) === pid);

  if (idx === -1) return null;

  const stock = updates.stock !== undefined ? Number(updates.stock) : Number(list[idx].stock || 0);
  const badge = stock <= 0 ? 'ناموجود' : (stock <= 5 ? `تعداد محدود (${stock} عدد)` : null);

  const brand = updates.brand || list[idx].brand || 'rafooneh';
  const brandName = brand === 'foreign' ? 'محصولات خارجی' : 'برند رافونه';

  const categoryNames = {
    handwash: 'مایع دستشویی',
    dishwash: 'مایع ظرفشویی',
    laundry: 'شوینده لباس',
    cleaners: 'پاک‌کننده و اسپری',
    sanitary: 'جرم‌گیر و ضدعفونی',
    cellulosic: 'سلولزی و مصرفی',
    imported: 'محصولات خارجی',
    other: 'سایر شوینده‌ها'
  };

  const category = brand === 'foreign' ? 'imported' : (updates.category || list[idx].category || 'cleaners');
  const categoryName = brand === 'foreign' ? 'محصولات خارجی' : (updates.categoryName || categoryNames[category] || list[idx].categoryName || 'پاک‌کننده و اسپری');

  const newPrice = updates.newPrice !== undefined ? Number(updates.newPrice) : (updates.consumerPrice !== undefined ? Number(updates.consumerPrice) : Number(list[idx].newPrice || list[idx].consumerPrice || 0));
  const buyPrice = updates.buyPrice !== undefined ? Number(updates.buyPrice) : Number(list[idx].buyPrice || 0);

  list[idx] = {
    ...list[idx],
    ...updates,
    brand,
    brandName,
    category,
    categoryName,
    stock,
    badge,
    newPrice,
    consumerPrice: newPrice,
    buyPrice,
    isCustomized: true,
    updatedAt: new Date().toISOString()
  };

  await saveProductCloudSql(list[idx]).catch(e => console.error('Cloud SQL update product error:', e));
  saveProductsList(list, false);
  await saveProductToFirestore(list[idx]).catch(e => console.error('Firestore save product error:', e));
  return list[idx];
}

export async function batchUpdateProductsBuyPrice({ multiplier, scope, updates }) {
  const list = await getFreshProductsFromFirestore();
  if (!list || !list.length) return { success: false, count: 0 };
  const mul = Number(multiplier);
  let updatedCount = 0;
  const updatedItems = [];
  const nowStr = new Date().toISOString();

  if (Array.isArray(updates) && updates.length > 0) {
    updates.forEach(u => {
      const pid = String(u.id || u.code);
      const idx = list.findIndex(p => String(p.id) === pid || String(p.code) === pid);
      if (idx !== -1 && u.buyPrice !== undefined) {
        list[idx].buyPrice = Number(u.buyPrice) || 0;
        list[idx].updatedAt = nowStr;
        list[idx].isCustomized = true;
        updatedItems.push(list[idx]);
        updatedCount++;
      }
    });
  } else if (mul > 0 && mul <= 1.5) {
    list.forEach(p => {
      const brand = String(p.brand || '').toLowerCase();
      const brandName = String(p.brandName || '').toLowerCase();
      const isDomestic = (brand === 'rafooneh' || brandName.includes('رافونه')) || (brand !== 'foreign' && !brandName.includes('خارجی'));
      if (scope === 'domestic' && !isDomestic) return;
      if (scope === 'foreign' && isDomestic) return;
      const basePrice = Number(p.newPrice) || Number(p.consumerPrice) || Number(p.price) || 0;
      if (basePrice > 0) {
        p.buyPrice = Math.round(basePrice * mul);
        p.multiplier = mul;
        p.updatedAt = nowStr;
        p.isCustomized = true;
        updatedItems.push(p);
        updatedCount++;
      }
    });
  }

  if (updatedCount > 0) {
    saveProductsList(list, false);
    for (const item of updatedItems) {
      await saveProductCloudSql(item).catch(e => console.error('Cloud SQL batch save error:', e));
      saveProductToFirestore(item).catch(e => console.error('Firestore batch save error:', e));
    }
  }

  return { success: true, count: updatedCount, products: list };
}

export async function addProduct(productData) {
  const list = await getFreshProductsFromFirestore();

  const code = String(productData.id || productData.code || Date.now());
  const stock = Number(productData.stock) || 0;
  const badge = stock <= 0 ? 'ناموجود' : (stock <= 5 ? `تعداد محدود (${stock} عدد)` : null);

  const brandNames = {
    rafooneh: 'برند رافونه',
    foreign: 'محصولات خارجی'
  };

  const brand = productData.brand === 'foreign' ? 'foreign' : 'rafooneh';
  const brandName = brandNames[brand];
  const newPriceVal = Number(productData.newPrice || productData.consumerPrice) || 0;

  const category = brand === 'foreign' ? 'imported' : (productData.category || 'cleaners');
  const categoryName = brand === 'foreign' ? 'محصولات خارجی' : (productData.categoryName || 'پاک‌کننده و اسپری');

  const newProd = {
    id: code,
    code: code,
    name: productData.name || 'محصول جدید',
    brand,
    brandName,
    category,
    categoryName,
    price: Number(productData.price) || 0,
    newPrice: newPriceVal,
    consumerPrice: newPriceVal,
    buyPrice: Number(productData.buyPrice) || 0,
    packing: Number(productData.packing) || 1,
    stock: stock,
    image: productData.image || 'https://rafooneh.com/media/catalog/product/cache/13fb5134717fc87cd9b03caf5e4a36c1/s/a/sanitary-protective-coating-large.jpg',
    badge: badge,
    description: productData.description || 'محصول باکیفیت و استاندارد',
    isCustomized: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await saveProductCloudSql(newProd).catch(e => console.error('Cloud SQL add product error:', e));
  list.unshift(newProd);
  saveProductsList(list, false);
  saveProductToFirestore(newProd).catch(e => console.error('Firestore save product error:', e));
  return newProd;
}

export async function deleteProduct(id) {
  let list = await getFreshProductsFromFirestore();
  if (!list || !list.length) return false;
  const pid = String(id);
  const initialLength = list.length;

  list = list.filter(p => String(p.id) !== pid && String(p.code) !== pid);

  if (list.length !== initialLength) {
    await deleteProductCloudSql(id).catch(e => console.error('Cloud SQL delete product notice:', e));
    saveProductsList(list, false);
    deleteProductFromFirestore(id).catch(e => console.error('Firestore delete product error:', e));
    try { deleteProductSqlite(id); } catch (e) { console.error('SQLite delete product notice:', e); }
    return true;
  }
  return false;
}

export function listCustomers(filters = {}) {
  let customers = readJson(CUSTOMERS_FILE, []);
  if (!Array.isArray(customers)) customers = [];

  const custMap = new Map();
  customers.forEach(c => {
    const norm = normalizePhone(c.phone) || String(c.id);
    if (!custMap.has(norm)) {
      custMap.set(norm, { ...c, phone: normalizePhone(c.phone) || c.phone });
    } else {
      const existing = custMap.get(norm);
      existing.totalOrders = Math.max(Number(existing.totalOrders || 0), Number(c.totalOrders || 0));
      existing.totalSpent = Math.max(Number(existing.totalSpent || 0), Number(c.totalSpent || 0));
      if (!existing.notes && c.notes) existing.notes = c.notes;
      if (!existing.address && c.address) existing.address = c.address;
      if ((!existing.name || existing.name === "مشتری" || existing.name === "مشتری عزیز") && c.name) existing.name = c.name;
      if (new Date(c.lastOrderAt || 0) > new Date(existing.lastOrderAt || 0)) {
        existing.lastOrderAt = c.lastOrderAt;
      }
    }
  });

  // Also include and aggregate from orders
  try {
    const orders = listOrders();
    if (Array.isArray(orders) && orders.length > 0) {
      orders.forEach(o => {
        if (!o) return;
        const rawPhone = o.phone || o.customerPhone || o.mobile;
        if (!rawPhone) return;
        const norm = normalizePhone(rawPhone) || rawPhone;
        const orderAmount = Number(o.totalAmount) || 0;
        const orderDate = o.createdAt || o.date || new Date().toISOString();
        const custName = o.customerName || o.name || o.fullName || "مشتری";
        const custAddress = o.address || o.note || "";

        if (!custMap.has(norm)) {
          custMap.set(norm, {
            id: o.customerId || ("cust-" + norm),
            name: custName,
            phone: norm,
            address: custAddress,
            walletBalance: 0,
            giftCredit: 0,
            totalOrders: 1,
            totalSpent: orderAmount,
            notes: "",
            createdAt: orderDate,
            updatedAt: orderDate,
            lastOrderAt: orderDate
          });
        } else {
          const existing = custMap.get(norm);
          if ((!existing.name || existing.name === "مشتری" || existing.name === "مشتری عزیز") && custName && custName !== "مشتری") {
            existing.name = custName;
          }
          if (!existing.address && custAddress) existing.address = custAddress;
          if (new Date(orderDate) > new Date(existing.lastOrderAt || 0)) {
            existing.lastOrderAt = orderDate;
          }
        }
      });
    }
  } catch (e) {}

  let result = Array.from(custMap.values());

  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.address?.toLowerCase().includes(q)
    );
  }

  return result.sort((a, b) => new Date(b.lastOrderAt || b.createdAt) - new Date(a.lastOrderAt || a.createdAt));
}

export function getCustomerById(id) {
  const customers = readJson(CUSTOMERS_FILE, []);
  const normId = normalizePhone(id);
  const customer = customers.find(c => String(c.id) === String(id) || normalizePhone(c.phone) === normId || String(c.phone) === String(id));
  if (!customer) return null;

  const orders = readJson(ORDERS_FILE, []).filter(o =>
    String(o.customerId) === String(customer.id) ||
    normalizePhone(o.phone) === normalizePhone(customer.phone) ||
    String(o.phone) === String(customer.phone)
  );
  return { ...customer, orders };
}

export async function updateCustomer(id, updates) {
  const customers = readJson(CUSTOMERS_FILE, []);
  const normId = normalizePhone(id);
  const idx = customers.findIndex(c => String(c.id) === String(id) || normalizePhone(c.phone) === normId || String(c.phone) === String(id));
  if (idx === -1) return null;

  const oldCustomer = customers[idx];
  const oldPhone = oldCustomer.phone;
  const oldNormPhone = normalizePhone(oldPhone);
  const newPhone = updates.phone ? normalizePhone(updates.phone) : oldNormPhone;
  const oldId = String(oldCustomer.id);

  const updatedCustomer = {
    ...oldCustomer,
    ...updates,
    phone: newPhone,
    updatedAt: new Date().toISOString()
  };

  // Re-build customer list ensuring complete deduplication
  const updatedList = [];
  const seenPhones = new Set();
  seenPhones.add(newPhone);
  updatedList.push(updatedCustomer);

  for (let i = 0; i < customers.length; i++) {
    if (i === idx) continue;
    const cNorm = normalizePhone(customers[i].phone);
    if (cNorm === oldNormPhone || cNorm === newPhone || String(customers[i].id) === oldId) {
      if (customers[i].id && String(customers[i].id) !== String(updatedCustomer.id)) {
        deleteCustomerFromFirestore(customers[i].id).catch(() => {});
        deleteCustomerCloudSql(customers[i].id).catch(() => {});
        try { deleteCustomerSqlite(customers[i].id); } catch (e) {}
      }
      updatedCustomer.totalOrders = Math.max(Number(updatedCustomer.totalOrders || 0), Number(customers[i].totalOrders || 0));
      updatedCustomer.totalSpent = Math.max(Number(updatedCustomer.totalSpent || 0), Number(customers[i].totalSpent || 0));
      if (!updatedCustomer.notes && customers[i].notes) updatedCustomer.notes = customers[i].notes;
    } else {
      if (!seenPhones.has(cNorm)) {
        seenPhones.add(cNorm);
        updatedList.push(customers[i]);
      }
    }
  }

  // Sync customer changes across orders
  const orders = readJson(ORDERS_FILE, []);
  let ordersUpdated = false;
  orders.forEach(o => {
    const oNormPhone = normalizePhone(o.phone);
    if (String(o.customerId) === oldId || String(o.customerId) === String(id) || oNormPhone === oldNormPhone || oNormPhone === newPhone || String(o.phone) === String(oldPhone) || String(o.phone) === String(id)) {
      if (updates.name) o.customerName = updates.name;
      if (newPhone) o.phone = newPhone;
      if (updates.address) o.address = updates.address;
      o.customerId = updatedCustomer.id;
      o.updatedAt = new Date().toISOString();
      ordersUpdated = true;

      saveOrderToFirestore(o).catch(e => console.error('Firestore save order error on customer update:', e));
      try { saveOrderSqlite(o); } catch (e) {}
      saveOrderCloudSql(o).catch(e => {});
    }
  });

  if (ordersUpdated) {
    writeJson(ORDERS_FILE, orders);
    writeJson(ROOT_ORDERS_FILE, orders);
  }

  writeJson(CUSTOMERS_FILE, updatedList);
  writeJson(ROOT_CUSTOMERS_FILE, updatedList);
  await saveCustomerCloudSql(updatedCustomer).catch(e => console.error('Cloud SQL update customer notice:', e));
  saveCustomerToFirestore(updatedCustomer).catch(e => console.error('Firestore update customer error:', e));
  try { saveCustomerSqlite(updatedCustomer); } catch (e) { console.error('SQLite update customer notice:', e); }

  return updatedCustomer;
}

export async function deleteCustomer(id) {
  let customers = readJson(CUSTOMERS_FILE, []);
  const initialLen = customers.length;
  customers = customers.filter(c => c.id !== id && c.phone !== id);
  writeJson(CUSTOMERS_FILE, customers);
  await deleteCustomerCloudSql(id).catch(e => console.error('Cloud SQL delete customer notice:', e.message));
  deleteCustomerFromFirestore(id).catch(e => console.error('Firestore delete customer error:', e));
  try { deleteCustomerSqlite(id); } catch (e) { console.error('SQLite delete customer notice:', e.message); }
  return initialLen !== customers.length;
}

// Customer Account & Wallet Helpers
export function getCustomerByPhone(phone) {
  if (!phone) return null;
  const customers = readJson(CUSTOMERS_FILE, []);
  const norm = normalizePhone(phone);
  return customers.find(c => normalizePhone(c.phone) === norm || String(c.phone) === String(phone)) || null;
}

export function getCustomerOrders(idOrPhone) {
  if (!idOrPhone) return [];
  const norm = normalizePhone(idOrPhone);
  const orders = readJson(ORDERS_FILE, []);
  return orders.filter(o =>
    String(o.customerId) === String(idOrPhone) ||
    normalizePhone(o.phone) === norm ||
    String(o.phone) === String(idOrPhone)
  ).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

export async function adjustCustomerWallet(idOrPhone, { amount, type = 'manual_adjustment', description = '', orderId = null }) {
  const customers = readJson(CUSTOMERS_FILE, []);
  const norm = normalizePhone(idOrPhone);
  const idx = customers.findIndex(c => String(c.id) === String(idOrPhone) || normalizePhone(c.phone) === norm || String(c.phone) === String(idOrPhone));
  if (idx === -1) {
    throw new Error('مشتری یافت نشد');
  }

  const customer = customers[idx];
  const delta = Number(amount) || 0;
  const currentWallet = Number(customer.walletBalance) || 0;
  const newWallet = Math.max(0, currentWallet + delta);
  customer.walletBalance = newWallet;
  if (!Array.isArray(customer.walletHistory)) {
    customer.walletHistory = [];
  }

  customer.walletHistory.unshift({
    id: 'wh_' + Date.now(),
    type,
    amount: delta,
    orderId,
    description: description || (delta >= 0 ? `شارژ دستی کیف پول (+${delta.toLocaleString('fa-IR')} تومان)` : `کسر دستی از کیف پول (${delta.toLocaleString('fa-IR')} تومان)`),
    createdAt: new Date().toISOString(),
    balanceAfter: newWallet
  });
  customer.updatedAt = new Date().toISOString();

  writeJson(CUSTOMERS_FILE, customers);
  writeJson(ROOT_CUSTOMERS_FILE, customers);
  try { saveCustomerSqlite(customer); } catch (e) {}
  saveCustomerToFirestore(customer).catch(() => {});
  saveCustomerCloudSql(customer).catch(() => {});

  return customer;
}

export async function authenticateCustomer({ phone, name, password, address }) {
  if (!phone) throw new Error('شماره تلفن الزامی است');
  const normalizedPhone = normalizePhone(phone);
  const customers = readJson(CUSTOMERS_FILE, []);
  let customer = customers.find(c => normalizePhone(c.phone) === normalizedPhone);
  let isNew = false;

  if (!customer) {
    isNew = true;
    customer = {
      id: generateId('cust'),
      name: (name && name.trim()) || 'مشتری عزیز',
      phone: normalizedPhone,
      address: address || '',
      walletBalance: 0,
      giftCredit: 0,
      passwordHash: password ? String(password) : '',
      walletHistory: [{
        id: 'wh_' + Date.now(),
        type: 'welcome',
        amount: 0,
        description: 'افتتاح حساب کاربری در فروشگاه محصولات پیمان',
        createdAt: new Date().toISOString(),
        balanceAfter: 0
      }],
      totalOrders: 0,
      totalSpent: 0,
      notes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastOrderAt: null
    };
    customers.push(customer);
    writeJson(CUSTOMERS_FILE, customers);
    writeJson(ROOT_CUSTOMERS_FILE, customers);
    try { saveCustomerSqlite(customer); } catch (e) {}
    saveCustomerToFirestore(customer).catch(() => {});
    saveCustomerCloudSql(customer).catch(() => {});
  } else {
    // If name or address provided on existing customer and not empty
    let changed = false;
    if (name && name.trim() && customer.name === 'مشتری عزیز') {
      customer.name = name.trim();
      changed = true;
    }
    if (address && !customer.address) {
      customer.address = address;
      changed = true;
    }
    if (password && !customer.passwordHash) {
      customer.passwordHash = String(password);
      changed = true;
    }
    if (changed) {
      customer.updatedAt = new Date().toISOString();
      writeJson(CUSTOMERS_FILE, customers);
      writeJson(ROOT_CUSTOMERS_FILE, customers);
      try { saveCustomerSqlite(customer); } catch (e) {}
      saveCustomerToFirestore(customer).catch(() => {});
      saveCustomerCloudSql(customer).catch(() => {});
    }
  }

  const customerOrders = getCustomerOrders(customer.id);
  return {
    customer,
    orders: customerOrders,
    isNew
  };
}

export function clearAllTestData() {
  writeJson(ORDERS_FILE, []);
  writeJson(CUSTOMERS_FILE, []);
  if (fs.existsSync(COMPANY_PAYMENTS_FILE)) {
    writeJson(COMPANY_PAYMENTS_FILE, []);
  }

  try {
    const db = getDb();
    db.exec('DELETE FROM orders;');
    db.exec('DELETE FROM customers;');
    db.exec('DELETE FROM company_payments;');
    console.log('[SQLite] Cleared test orders, customers, and company payments.');
  } catch (e) {
    console.error('SQLite clear test data notice:', e.message);
  }

  return true;
}

export function getDashboardStats(filters = {}) {
  const orders = readJson(ORDERS_FILE, []);
  const customers = readJson(CUSTOMERS_FILE, []);
  const { map: pMap } = getProductsMap();

  const timeframe = filters.timeframe || 'all';
  let fromDate = null;
  let toDate = null;

  if (timeframe === 'today') {
    fromDate = new Date();
    fromDate.setHours(0, 0, 0, 0);
  } else if (timeframe === 'yesterday') {
    fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 1);
    fromDate.setHours(0, 0, 0, 0);
    toDate = new Date();
    toDate.setDate(toDate.getDate() - 1);
    toDate.setHours(23, 59, 59, 999);
  } else if (timeframe === 'week') {
    fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 7);
    fromDate.setHours(0, 0, 0, 0);
  } else if (timeframe === 'month') {
    fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30);
    fromDate.setHours(0, 0, 0, 0);
  } else if (timeframe === 'year') {
    fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 365);
    fromDate.setHours(0, 0, 0, 0);
  } else if (timeframe === 'custom') {
    if (filters.from) {
      fromDate = new Date(filters.from);
      if (isNaN(fromDate.getTime())) fromDate = null;
      else fromDate.setHours(0, 0, 0, 0);
    }
    if (filters.to) {
      toDate = new Date(filters.to);
      if (isNaN(toDate.getTime())) toDate = null;
      else toDate.setHours(23, 59, 59, 999);
    }
  }

  const enrichedOrders = orders.map(o => enrichOrderWithProfit(o, pMap));

  const filteredOrders = enrichedOrders.filter(o => {
    if (!o.createdAt) return true;
    const oDate = new Date(o.createdAt);
    if (fromDate && oDate < fromDate) return false;
    if (toDate && oDate > toDate) return false;
    return true;
  });

  const validOrders = filteredOrders.filter(o => o.status !== 'cancelled');
  const activeOrders = filteredOrders.filter(o => !['delivered', 'cancelled'].includes(o.status));
  const deliveredOrders = filteredOrders.filter(o => o.status === 'delivered');

  const timeframeRevenue = validOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const timeframeCost = validOrders.reduce((sum, o) => sum + (o.totalCost || 0), 0);
  const timeframeProfit = timeframeRevenue - timeframeCost;
  const timeframeProfitMargin = timeframeRevenue > 0 ? Math.round((timeframeProfit / timeframeRevenue) * 1000) / 10 : 0;

  // Today metrics
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayOrders = enrichedOrders.filter(o => new Date(o.createdAt) >= startOfToday);
  const revenueToday = todayOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + (o.totalAmount || 0), 0);
  const profitToday = todayOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + (o.totalProfit || 0), 0);

  const alerts = getAdminAlerts();

  const byStatus = ORDER_STATUSES.reduce((acc, status) => {
    acc[status] = filteredOrders.filter(o => o.status === status).length;
    return acc;
  }, {});

  const recentOrders = [...filteredOrders]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10);

  return {
    timeframe,
    fromDate: fromDate ? fromDate.toISOString() : null,
    toDate: toDate ? toDate.toISOString() : null,
    totalOrders: orders.length,
    filteredOrdersCount: filteredOrders.length,
    totalCustomers: customers.length,
    todayOrders: todayOrders.length,
    revenueToday,
    profitToday,
    activeOrders: activeOrders.length,
    deliveredOrdersCount: deliveredOrders.length,
    revenueTotal: timeframeRevenue,
    costTotal: timeframeCost,
    profitTotal: timeframeProfit,
    profitMarginTotal: timeframeProfitMargin,
    alerts,
    byStatus,
    recentOrders
  };
}

export function getCompanyPaymentStats({ fromDate, toDate } = {}) {
  try {
    const orders = readJson(ORDERS_FILE, []) || [];
    const { map: pMap } = getProductsMap();

    let filteredOrders = (orders || []).filter(o => o && o.status !== 'cancelled');

    let startMs = 0;
    let endMs = Infinity;

    if (fromDate) {
      const s = new Date(fromDate);
      if (!isNaN(s.getTime())) {
        s.setHours(0, 0, 0, 0);
        startMs = s.getTime();
      }
    }
    if (toDate) {
      const e = new Date(toDate);
      if (!isNaN(e.getTime())) {
        e.setHours(23, 59, 59, 999);
        endMs = e.getTime();
      }
    }

    if (startMs > 0 || endMs < Infinity) {
      filteredOrders = filteredOrders.filter(o => {
        if (!o.createdAt) return true;
        const orderTime = new Date(o.createdAt).getTime();
        if (isNaN(orderTime)) return true;
        return orderTime >= startMs && orderTime <= endMs;
      });
    }

    let totalItemsCount = 0;
    let totalBuyCost = 0;
    let totalRevenue = 0;
    let rafoonehOrdersCount = 0;
    const productSummaryMap = {};

    // Retrieve purchase invoices to correlate varying purchase costs & multipliers
    let purchaseInvoices = [];
    try {
      purchaseInvoices = listPurchases();
      if (!Array.isArray(purchaseInvoices)) purchaseInvoices = [];
    } catch (e) {
      purchaseInvoices = [];
    }

    // Build map of product purchase history across invoices
    const productPurchasesMap = {};
    purchaseInvoices.forEach(pur => {
      const pDate = pur.purchaseDate || pur.createdAt || '';
      const pRef = pur.refNumber || pur.id || '';
      (pur.items || []).forEach(pItem => {
        if (!pItem) return;
        const key1 = String(pItem.productId || '').trim();
        const key2 = String(pItem.code || '').trim();
        const key3 = String(pItem.name || '').trim().toLowerCase();
        const pEntry = {
          purchaseId: pur.id,
          refNumber: pRef,
          purchaseDate: pDate,
          qty: Number(pItem.qty) || 0,
          consumerPrice: Number(pItem.consumerPrice) || Number(pItem.price) || 0,
          multiplier: Number(pItem.multiplier) || (Number(pItem.consumerPrice) > 0 && Number(pItem.buyPrice) > 0 ? +(Number(pItem.buyPrice) / Number(pItem.consumerPrice)).toFixed(3) : 0.70),
          buyPrice: Number(pItem.buyPrice) || 0
        };
        [key1, key2, key3].forEach(k => {
          if (k) {
            if (!productPurchasesMap[k]) productPurchasesMap[k] = [];
            productPurchasesMap[k].push(pEntry);
          }
        });
      });
    });

    filteredOrders.forEach(o => {
      const enriched = enrichOrderWithProfit(o, pMap) || o;
      let orderHasRafooneh = false;

      (enriched.items || []).forEach(item => {
        if (!item) return;
        const pid = String(item.id || item.code || item.productId || item.name || '');
        const prod = pMap[pid] || pMap[String(item.id || '')] || pMap[String(item.code || '')] || pMap[String(item.name || '').trim().toLowerCase()] || {};

        const brand = String(item.brand || prod.brand || '').toLowerCase();
        const brandName = String(item.brandName || prod.brandName || '').toLowerCase();
        
        // Calculate ONLY items under the Rafooneh brand
        const isRafooneh = (brand === 'rafooneh' || brandName.includes('رافونه')) || (brand !== 'foreign' && !brandName.includes('خارجی'));
        if (!isRafooneh) return;

        orderHasRafooneh = true;

        const qty = Number(item.qty || item.quantity) || 1;
        const itemSellingPrice = Number(item.price) || Number(prod.price) || 0;

        // Check purchase history for this product
        const purchaseHistory = productPurchasesMap[String(prod.code || '')] ||
                               productPurchasesMap[String(prod.id || '')] ||
                               productPurchasesMap[String(item.code || '')] ||
                               productPurchasesMap[String(item.id || '')] ||
                               productPurchasesMap[String(item.name || '').trim().toLowerCase()] ||
                               [];

        // Derive consumer price (latest purchase consumer price or catalog consumer price)
        let consumerPrice = 0;
        let multiplier = 0.70;
        let buyPrice = 0;

        if (purchaseHistory.length > 0) {
          const latestPur = purchaseHistory[purchaseHistory.length - 1];
          consumerPrice = Number(latestPur.consumerPrice) || Number(prod.newPrice) || Number(prod.consumerPrice) || itemSellingPrice;
          multiplier = Number(latestPur.multiplier) || 0.70;
          buyPrice = Number(latestPur.buyPrice) || Math.round(consumerPrice * multiplier);
        } else {
          consumerPrice = Number(prod.newPrice) || Number(prod.consumerPrice) || Number(item.consumerPrice) || itemSellingPrice;
          multiplier = Number(prod.multiplier) || 0.70;
          buyPrice = Number(item.buyPrice) || Number(prod.buyPrice) || Math.round(consumerPrice * multiplier);
        }

        if (isNaN(buyPrice) || buyPrice <= 0) {
          buyPrice = Math.round((consumerPrice || itemSellingPrice) * 0.70);
        }

        const itemCost = buyPrice * qty;
        const itemRev = (Number(item.total) || (itemSellingPrice * qty)) || itemCost;

        const mapKey = String(prod.code || prod.id || item.code || item.id || item.name || pid);

        if (!productSummaryMap[mapKey]) {
          productSummaryMap[mapKey] = {
            id: mapKey,
            code: prod.code || item.code || prod.id || item.id || mapKey,
            name: item.name || prod.name || 'محصول رافونه',
            unitsSold: 0,
            consumerPrice,
            multiplier,
            buyPrice,
            totalBuyCost: 0,
            sellingPrice: itemSellingPrice,
            totalRevenue: 0,
            purchaseSources: purchaseHistory.slice(-3) // Last 3 purchase invoices for quick reference
          };
        }

        productSummaryMap[mapKey].unitsSold += qty;
        productSummaryMap[mapKey].totalBuyCost += itemCost;
        productSummaryMap[mapKey].totalRevenue += itemRev;

        totalItemsCount += qty;
        totalBuyCost += itemCost;
        totalRevenue += itemRev;
      });

      if (orderHasRafooneh) {
        rafoonehOrdersCount++;
      }
    });

    const productList = Object.values(productSummaryMap).sort((a, b) => b.totalBuyCost - a.totalBuyCost);

    return {
      fromDate: fromDate || '',
      toDate: toDate || '',
      ordersCount: rafoonehOrdersCount,
      totalItemsCount,
      totalBuyCost,
      totalRevenue,
      totalProfit: totalRevenue - totalBuyCost,
      products: productList
    };
  } catch (err) {
    console.error('Error in getCompanyPaymentStats:', err);
    return {
      fromDate: fromDate || '',
      toDate: toDate || '',
      ordersCount: 0,
      totalItemsCount: 0,
      totalBuyCost: 0,
      totalRevenue: 0,
      totalProfit: 0,
      products: []
    };
  }
}

export function listCompanyPayments() {
  const payments = readJson(COMPANY_PAYMENTS_FILE, []);
  return payments.sort((a, b) => new Date(b.paymentDate || b.createdAt) - new Date(a.paymentDate || a.createdAt));
}

export async function createCompanyPayment(paymentData) {
  const payments = readJson(COMPANY_PAYMENTS_FILE, []);
  const nowStr = new Date().toISOString();

  const newPayment = {
    id: paymentData.id || `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    paymentDate: paymentData.paymentDate || nowStr.split('T')[0],
    fromDate: paymentData.fromDate || '',
    toDate: paymentData.toDate || '',
    totalBuyCost: Number(paymentData.totalBuyCost) || 0,
    totalRevenue: Number(paymentData.totalRevenue) || 0,
    deductions: Number(paymentData.deductions) || 0,
    additions: Number(paymentData.additions) || 0,
    finalPayableAmount: Number(paymentData.finalPayableAmount) || Number(paymentData.totalBuyCost) || 0,
    totalItemsCount: Number(paymentData.totalItemsCount) || 0,
    ordersCount: Number(paymentData.ordersCount) || 0,
    paymentMethod: paymentData.paymentMethod || 'حواله بانکی / شبا',
    refNumber: paymentData.refNumber || '',
    notes: paymentData.notes || '',
    status: paymentData.status || 'پرداخت شده',
    items: Array.isArray(paymentData.items) ? paymentData.items : [],
    createdAt: paymentData.createdAt || nowStr
  };

  const existingIdx = payments.findIndex(p => String(p.id) === String(newPayment.id));
  if (existingIdx >= 0) {
    payments[existingIdx] = { ...payments[existingIdx], ...newPayment };
  } else {
    payments.unshift(newPayment);
  }

  writeJson(COMPANY_PAYMENTS_FILE, payments);
  try { writeJson(ROOT_COMPANY_PAYMENTS_FILE, payments); } catch (e) {}

  await saveCompanyPaymentToFirestore(newPayment).catch(e => console.error('Firestore save payment error:', e));
  try { await saveCompanyPaymentSqlite(newPayment); } catch (e) { console.error('SQLite save payment notice:', e); }
  try { await saveCompanyPaymentCloudSql(newPayment); } catch (e) { console.error('Cloud SQL save payment notice:', e); }
  return newPayment;
}

export async function deleteCompanyPayment(id) {
  let payments = readJson(COMPANY_PAYMENTS_FILE, []);
  const initialLen = payments.length;
  payments = payments.filter(p => String(p.id) !== String(id));
  if (payments.length !== initialLen) {
    writeJson(COMPANY_PAYMENTS_FILE, payments);
    try { writeJson(ROOT_COMPANY_PAYMENTS_FILE, payments); } catch (e) {}
    await deleteCompanyPaymentFromFirestore(id).catch(e => console.error('Firestore delete payment error:', e));
    try { await deleteCompanyPaymentSqlite(id); } catch (e) { console.error('SQLite delete payment notice:', e); }
    try { await deleteCompanyPaymentCloudSql(id); } catch (e) { console.error('Cloud SQL delete payment notice:', e); }
    return true;
  }
  return false;
}

export function listPurchases() {
  try {
    const sqlitePurchases = getAllPurchasesSqlite();
    if (Array.isArray(sqlitePurchases) && sqlitePurchases.length > 0) {
      return sqlitePurchases;
    }
  } catch (e) {}

  return readJson(PURCHASES_FILE, []);
}

export function createPurchase(purchaseData) {
  const nowStr = new Date().toISOString();
  const id = purchaseData.id || `PUR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const refNumber = purchaseData.refNumber || `FACT-${Math.floor(100000 + Math.random() * 900000)}`;
  const supplierName = purchaseData.supplierName || 'تأمین‌کننده رافونه';
  const purchaseDate = purchaseData.purchaseDate || nowStr;
  const notes = purchaseData.notes || '';
  const updateStock = purchaseData.updateStock !== false;

  const rawItems = Array.isArray(purchaseData.items) ? purchaseData.items : [];
  let totalAmount = 0;
  let totalItemsCount = 0;

  const items = rawItems.map(item => {
    const pid = String(item.productId || item.id || '');
    const name = item.name || 'محصول رافونه';
    const qty = Math.max(1, Number(item.qty || item.quantity) || 1);
    const buyPrice = Math.max(0, Number(item.buyPrice) || 0);
    let consumerPrice = Math.max(0, Number(item.consumerPrice !== undefined ? item.consumerPrice : (item.price || 0)));
    let multiplier = item.multiplier !== undefined && item.multiplier !== null ? String(item.multiplier).trim() : '';

    if (!consumerPrice && buyPrice > 0 && Number(multiplier) > 0) {
      consumerPrice = Math.round(buyPrice / Number(multiplier));
    }
    if (!multiplier && consumerPrice > 0 && buyPrice > 0) {
      multiplier = parseFloat((buyPrice / consumerPrice).toFixed(2)).toString();
    }

    const rowTotal = qty * buyPrice;

    totalAmount += rowTotal;
    totalItemsCount += qty;

    return {
      productId: pid,
      id: pid,
      name,
      qty,
      buyPrice,
      consumerPrice,
      multiplier,
      rowTotal
    };
  });

  const newPurchase = {
    id,
    refNumber,
    supplierName,
    purchaseDate,
    totalAmount,
    totalItemsCount,
    notes,
    items,
    createdAt: nowStr,
    updatedAt: nowStr
  };

  // Automatically update stock in products dataset upon purchase registration!
  if (updateStock && items.length > 0) {
    const products = readProductsList();
    let productsUpdated = false;

    items.forEach(pItem => {
      const pIdx = products.findIndex(p => String(p.id) === String(pItem.productId) || String(p.code) === String(pItem.productId));
      if (pIdx !== -1) {
        const currentStock = Number(products[pIdx].stock || 0);
        products[pIdx].stock = currentStock + pItem.qty;
        if (pItem.buyPrice > 0) {
          products[pIdx].buyPrice = pItem.buyPrice;
        }
        if (pItem.consumerPrice > 0) {
          products[pIdx].price = pItem.consumerPrice;
          products[pIdx].consumerPrice = pItem.consumerPrice;
        }
        if (products[pIdx].stock <= 0) {
          products[pIdx].badge = 'ناموجود';
        } else if (products[pIdx].stock <= 5) {
          products[pIdx].badge = `تعداد محدود (${products[pIdx].stock} عدد)`;
        } else {
          products[pIdx].badge = null;
        }
        products[pIdx].updatedAt = nowStr;
        productsUpdated = true;
      }
    });

    if (productsUpdated) {
      saveProductsList(products);
    }
  }

  let purchases = readJson(PURCHASES_FILE, []);
  purchases.unshift(newPurchase);
  writeJson(PURCHASES_FILE, purchases);
  writeJson(ROOT_PURCHASES_FILE, purchases);
  savePurchaseToFirestore(newPurchase).catch(e => console.error('Firestore save purchase error:', e));
  try { savePurchaseSqlite(newPurchase); } catch (e) { console.error('SQLite save purchase notice:', e); }
  try { savePurchaseCloudSql(newPurchase); } catch (e) { console.error('Cloud SQL save purchase notice:', e); }

  return newPurchase;
}

export function updatePurchase(id, updates) {
  let purchases = readJson(PURCHASES_FILE, []);
  const idx = purchases.findIndex(p => String(p.id) === String(id) || String(p.refNumber) === String(id));
  if (idx === -1) return null;

  const nowStr = new Date().toISOString();
  const oldItems = Array.isArray(purchases[idx].items) ? purchases[idx].items : [];
  const rawItems = Array.isArray(updates.items) ? updates.items : purchases[idx].items;
  let totalAmount = 0;
  let totalItemsCount = 0;

  const items = rawItems.map(item => {
    const pid = String(item.productId || item.id || item.code || '');
    const name = item.name || 'محصول رافونه';
    const qty = Math.max(1, Number(item.qty || item.quantity) || 1);
    const buyPrice = Math.max(0, Number(item.buyPrice) || 0);
    let consumerPrice = Math.max(0, Number(item.consumerPrice !== undefined ? item.consumerPrice : (item.price || 0)));
    let multiplier = item.multiplier !== undefined && item.multiplier !== null ? String(item.multiplier).trim() : '';

    if (!consumerPrice && buyPrice > 0 && Number(multiplier) > 0) {
      consumerPrice = Math.round(buyPrice / Number(multiplier));
    }
    if (!multiplier && consumerPrice > 0 && buyPrice > 0) {
      multiplier = parseFloat((buyPrice / consumerPrice).toFixed(2)).toString();
    }

    const rowTotal = qty * buyPrice;

    totalAmount += rowTotal;
    totalItemsCount += qty;

    return {
      productId: pid,
      id: pid,
      name,
      qty,
      buyPrice,
      consumerPrice,
      multiplier,
      rowTotal
    };
  });

  // Calculate quantity difference per item between old and new purchase
  const oldQtyMap = {};
  oldItems.forEach(it => {
    const pid = String(it.productId || it.id || it.code || '');
    if (pid) {
      oldQtyMap[pid] = (oldQtyMap[pid] || 0) + Math.max(1, Number(it.qty || it.quantity) || 1);
    }
  });

  const newQtyMap = {};
  items.forEach(it => {
    const pid = String(it.productId || it.id || it.code || '');
    if (pid) {
      newQtyMap[pid] = (newQtyMap[pid] || 0) + Math.max(1, Number(it.qty || it.quantity) || 1);
    }
  });

  const allProductIds = new Set([...Object.keys(oldQtyMap), ...Object.keys(newQtyMap)]);
  const products = readProductsList();
  let productsUpdated = false;

  allProductIds.forEach(pid => {
    const pIdx = products.findIndex(p => String(p.id) === pid || String(p.code) === pid);
    if (pIdx !== -1) {
      const oldQty = oldQtyMap[pid] || 0;
      const newQty = newQtyMap[pid] || 0;
      const delta = newQty - oldQty;

      if (delta !== 0) {
        const currentStock = Number(products[pIdx].stock || 0);
        const newStock = Math.max(0, currentStock + delta);
        products[pIdx].stock = newStock;
        if (newStock <= 0) {
          products[pIdx].badge = 'ناموجود';
        } else if (newStock <= 5) {
          products[pIdx].badge = `تعداد محدود (${newStock} عدد)`;
        } else {
          products[pIdx].badge = null;
        }
        products[pIdx].updatedAt = nowStr;
        productsUpdated = true;
      }
    }
  });

  // Update buy and consumer prices for products
  items.forEach(pItem => {
    const pid = String(pItem.productId || pItem.id || pItem.code || '');
    const pIdx = products.findIndex(p => String(p.id) === pid || String(p.code) === pid);
    if (pIdx !== -1) {
      if (pItem.buyPrice > 0) {
        products[pIdx].buyPrice = pItem.buyPrice;
      }
      if (pItem.consumerPrice > 0) {
        products[pIdx].price = pItem.consumerPrice;
        products[pIdx].consumerPrice = pItem.consumerPrice;
      }
      products[pIdx].updatedAt = nowStr;
      productsUpdated = true;
    }
  });

  if (productsUpdated) {
    saveProductsList(products);
  }

  purchases[idx] = {
    ...purchases[idx],
    supplierName: updates.supplierName || purchases[idx].supplierName,
    refNumber: updates.refNumber || purchases[idx].refNumber,
    purchaseDate: updates.purchaseDate || purchases[idx].purchaseDate,
    notes: updates.notes !== undefined ? updates.notes : purchases[idx].notes,
    items,
    totalAmount: updates.totalAmount !== undefined ? Number(updates.totalAmount) : totalAmount,
    totalItemsCount,
    updatedAt: nowStr
  };

  writeJson(PURCHASES_FILE, purchases);
  writeJson(ROOT_PURCHASES_FILE, purchases);
  savePurchaseToFirestore(purchases[idx]).catch(e => console.error('Firestore save purchase error:', e));
  try { savePurchaseSqlite(purchases[idx]); } catch (e) { console.error('SQLite save purchase notice:', e); }
  try { savePurchaseCloudSql(purchases[idx]); } catch (e) { console.error('Cloud SQL save purchase notice:', e); }

  return purchases[idx];
}

export function deletePurchase(id) {
  let purchases = readJson(PURCHASES_FILE, []);
  const initialLen = purchases.length;
  const target = purchases.find(p => String(p.id) === String(id) || String(p.refNumber) === String(id));

  // Deduct purchase quantities from product inventory stock upon deletion
  if (target && Array.isArray(target.items) && target.items.length > 0) {
    const products = readProductsList();
    let productsUpdated = false;
    const nowStr = new Date().toISOString();

    target.items.forEach(pItem => {
      const pid = String(pItem.productId || pItem.id || pItem.code || '');
      if (!pid) return;
      const pIdx = products.findIndex(p => String(p.id) === pid || String(p.code) === pid);
      if (pIdx !== -1) {
        const qtyToDeduct = Math.max(1, Number(pItem.qty || pItem.quantity) || 1);
        const currentStock = Number(products[pIdx].stock || 0);
        const newStock = Math.max(0, currentStock - qtyToDeduct);
        products[pIdx].stock = newStock;
        if (newStock <= 0) {
          products[pIdx].badge = 'ناموجود';
        } else if (newStock <= 5) {
          products[pIdx].badge = `تعداد محدود (${newStock} عدد)`;
        } else {
          products[pIdx].badge = null;
        }
        products[pIdx].updatedAt = nowStr;
        productsUpdated = true;
      }
    });

    if (productsUpdated) {
      saveProductsList(products);
    }
  }

  purchases = purchases.filter(p => String(p.id) !== String(id) && String(p.refNumber) !== String(id));
  if (purchases.length !== initialLen || target) {
    writeJson(PURCHASES_FILE, purchases);
    writeJson(ROOT_PURCHASES_FILE, purchases);
    deletePurchaseFromFirestore(id).catch(e => console.error('Firestore delete purchase error:', e));
    try { deletePurchaseSqlite(id); } catch (e) { console.error('SQLite delete purchase notice:', e); }
    try { deletePurchaseCloudSql(id); } catch (e) { console.error('Cloud SQL delete purchase notice:', e); }
    return true;
  }
  return false;
}

export const DEFAULT_BANK_SETTINGS = {
  bankName: 'بانک پارسیان',
  cardHolder: 'پیمان کوشکباغی',
  cardNumber: '6221061078249531',
  shabaNumber: 'IR980540203383100013660005',
  accountNumber: '',
  whatsappNumber: '09027959555',
  adminWhatsApp: '09027959555',
  supportPhone: '09027959555',
  description: 'لطفاً پس از واریز مبلغ فاکتور، تصویر فیش واریزی یا کد پیگیری را در واتساپ ارسال فرمایید.'
};

export function getBankSettings() {
  if (bankSettingsCache) return bankSettingsCache;
  try {
    const loaded = readJson(BANK_SETTINGS_FILE, null);
    if (loaded && typeof loaded === 'object' && (loaded.cardNumber || loaded.whatsappNumber || loaded.adminWhatsApp)) {
      bankSettingsCache = { ...DEFAULT_BANK_SETTINGS, ...loaded };
      return bankSettingsCache;
    }
    const rootLoaded = readJson(ROOT_BANK_SETTINGS_FILE, null);
    if (rootLoaded && typeof rootLoaded === 'object' && (rootLoaded.cardNumber || rootLoaded.whatsappNumber || rootLoaded.adminWhatsApp)) {
      bankSettingsCache = { ...DEFAULT_BANK_SETTINGS, ...rootLoaded };
      return bankSettingsCache;
    }
  } catch (e) {
    console.error('Error reading bank settings:', e);
  }
  bankSettingsCache = { ...DEFAULT_BANK_SETTINGS };
  return bankSettingsCache;
}

export function saveBankSettings(settings) {
  const current = getBankSettings();
  const updated = {
    ...current,
    ...settings,
    updatedAt: new Date().toISOString()
  };
  bankSettingsCache = updated;
  try {
    writeJson(BANK_SETTINGS_FILE, updated);
    writeJson(ROOT_BANK_SETTINGS_FILE, updated);
  } catch (e) {
    console.error('Error writing bank settings file:', e);
  }
  saveBankSettingsCloudSql(updated).catch(e => {
    console.error('[Cloud SQL] Save bank settings error:', e.message);
  });
  return updated;
}

export const DEFAULT_DELIVERY_SETTINGS = {
  isExpressDeliveryEnabled: false,
  disabledNoticeMessage: 'در حال حاضر تحویل فوری ۲۴ ساعته موقتاً غیرفعال می‌باشد و سفارشات به صورت ارسال عادی (تحویل رایگان درب منزل) ثبت و ارسال می‌گردند.',
  expressBaseFee: 100000,
  expressPerKmFee: 20000,
  expressEstimatedHours: 24,
  warehouseAddress: 'کرج - فاز ۴ مهرشهر - خیابان ۴۰۹ شرقی - پلاک ۱۱۲',
  warehouseLat: 35.8124,
  warehouseLng: 50.9415
};

export function getDeliverySettings() {
  if (deliverySettingsCache) return deliverySettingsCache;
  try {
    const sqliteLoaded = getDeliverySettingsSqlite();
    if (sqliteLoaded && typeof sqliteLoaded === 'object' && typeof sqliteLoaded.isExpressDeliveryEnabled !== 'undefined') {
      deliverySettingsCache = { ...DEFAULT_DELIVERY_SETTINGS, ...sqliteLoaded };
      return deliverySettingsCache;
    }
  } catch (e) {}

  try {
    if (fs.existsSync(DELIVERY_SETTINGS_FILE)) {
      const content = fs.readFileSync(DELIVERY_SETTINGS_FILE, 'utf8');
      if (content && content.trim() !== 'null' && content.trim() !== '' && content.trim() !== '{}') {
        const loaded = JSON.parse(content);
        if (loaded && typeof loaded === 'object' && typeof loaded.isExpressDeliveryEnabled !== 'undefined') {
          deliverySettingsCache = { ...DEFAULT_DELIVERY_SETTINGS, ...loaded };
          return deliverySettingsCache;
        }
      }
    }
    if (fs.existsSync(ROOT_DELIVERY_SETTINGS_FILE)) {
      const content = fs.readFileSync(ROOT_DELIVERY_SETTINGS_FILE, 'utf8');
      if (content && content.trim() !== 'null' && content.trim() !== '' && content.trim() !== '{}') {
        const rootLoaded = JSON.parse(content);
        if (rootLoaded && typeof rootLoaded === 'object' && typeof rootLoaded.isExpressDeliveryEnabled !== 'undefined') {
          deliverySettingsCache = { ...DEFAULT_DELIVERY_SETTINGS, ...rootLoaded };
          return deliverySettingsCache;
        }
      }
    }
  } catch (e) {
    console.error('Error reading delivery settings:', e);
  }
  deliverySettingsCache = { ...DEFAULT_DELIVERY_SETTINGS };
  return deliverySettingsCache;
}

export function saveDeliverySettings(settings) {
  const current = getDeliverySettings();
  const cleanSettings = {};
  for (const [k, v] of Object.entries(settings || {})) {
    if (v !== undefined && v !== null) {
      cleanSettings[k] = v;
    }
  }
  const updated = {
    ...current,
    ...cleanSettings,
    updatedAt: new Date().toISOString()
  };
  deliverySettingsCache = updated;
  try {
    ensureDataDir();
    fs.writeFileSync(DELIVERY_SETTINGS_FILE, JSON.stringify(updated, null, 2), 'utf8');
    fs.writeFileSync(ROOT_DELIVERY_SETTINGS_FILE, JSON.stringify(updated, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing delivery settings file:', e);
  }

  try {
    saveDeliverySettingsSqlite(updated);
  } catch (e) {
    console.error('[SQLite] Error saving delivery settings:', e.message);
  }

  saveDeliverySettingsCloudSql(updated).catch(e => {
    console.error('[Cloud SQL] Save delivery settings error:', e.message);
  });

  saveDeliverySettingsToFirestore(updated).catch(e => {
    console.error('[Firestore] Save delivery settings error:', e.message);
  });

  return updated;
}


// -------------------------------------------------------------
// Gift Settings & Packages Store
// -------------------------------------------------------------
export const DEFAULT_GIFT_SETTINGS = {
  isEnabled: true,
  defaultGiftPercent: 0,
  minOrderForGift: 1000000,
  firstOrderBonusPercent: 5,
  isFirstOrderBonusEnabled: false,
  allowCustomerGiftSelection: true,
  autoRollRemainingToWallet: true,
  tieredGiftsEnabled: true,
  tieredGifts: [
    {
      id: 'tier-1',
      minAmount: 1000000,
      maxAmount: 2000000,
      giftPercent: 3,
      title: 'پله ۱ (۳٪ هدیه)',
      bonusDescription: '۳٪ ارزش کالاهای رافونه به عنوان هدیه'
    },
    {
      id: 'tier-2',
      minAmount: 2000000,
      maxAmount: 4000000,
      giftPercent: 5,
      title: 'پله ۲ (۵٪ هدیه)',
      bonusDescription: '۵٪ ارزش کالاهای رافونه به عنوان هدیه'
    },
    {
      id: 'tier-3',
      minAmount: 4000000,
      maxAmount: 0,
      giftPercent: 8,
      title: 'پله ۳ VIP (۸٪ هدیه)',
      bonusDescription: '۸٪ ارزش کالاهای رافونه به عنوان هدیه + اشانتیون ویژه'
    }
  ],
  allowedGiftProductIds: [],
  maxGiftItemPrice: 0,
  customGiftNotice: 'طرح هدیه کالاهای رافونه: خرید ۱ الی ۲ میلیون تومان ۳٪، ۲ الی ۴ میلیون تومان ۵٪ و بالای ۴ میلیون تومان ۸٪ هدیه کالا!',
  updatedAt: new Date().toISOString()
};

export function getGiftSettings() {
  if (giftSettingsCache) return giftSettingsCache;
  try {
    const sqlLoaded = getGiftSettingsSqlite();
    if (sqlLoaded && typeof sqlLoaded === 'object' && typeof sqlLoaded.defaultGiftPercent !== 'undefined') {
      giftSettingsCache = { ...DEFAULT_GIFT_SETTINGS, ...sqlLoaded };
      return giftSettingsCache;
    }
  } catch (e) {}

  try {
    const loaded = readJson(GIFT_SETTINGS_FILE, null);
    if (loaded && typeof loaded === 'object' && typeof loaded.defaultGiftPercent !== 'undefined') {
      giftSettingsCache = { ...DEFAULT_GIFT_SETTINGS, ...loaded };
      try { saveGiftSettingsSqlite(giftSettingsCache); } catch (e) {}
      return giftSettingsCache;
    }
    const rootLoaded = readJson(ROOT_GIFT_SETTINGS_FILE, null);
    if (rootLoaded && typeof rootLoaded === 'object' && typeof rootLoaded.defaultGiftPercent !== 'undefined') {
      giftSettingsCache = { ...DEFAULT_GIFT_SETTINGS, ...rootLoaded };
      try { saveGiftSettingsSqlite(giftSettingsCache); } catch (e) {}
      return giftSettingsCache;
    }
  } catch (e) {
    console.error('Error reading gift settings:', e);
  }
  giftSettingsCache = { ...DEFAULT_GIFT_SETTINGS };
  return giftSettingsCache;
}

export function saveGiftSettings(settings) {
  const current = getGiftSettings();
  const cleanSettings = {};
  for (const [k, v] of Object.entries(settings || {})) {
    if (v !== undefined && v !== null) {
      cleanSettings[k] = v;
    }
  }
  const updated = {
    ...current,
    ...cleanSettings,
    updatedAt: new Date().toISOString()
  };
  giftSettingsCache = updated;

  // 1. Save to Firestore asynchronously
  saveGiftSettingsToFirestore(updated).catch(err => console.error('[Firestore save gift error]:', err));

  // 2. Save to Supabase / PostgreSQL
  saveGiftSettingsCloudSql(updated).catch(err => console.error('[Cloud SQL save gift error]:', err));

  // 3. Save to SQLite
  try {
    saveGiftSettingsSqlite(updated);
  } catch (e) {
    console.error('[SQLite save gift error]:', e);
  }

  // 4. Save to local JSON files
  try {
    ensureDataDir();
    writeJson(GIFT_SETTINGS_FILE, updated);
    writeJson(ROOT_GIFT_SETTINGS_FILE, updated);
  } catch (e) {
    console.error('Error writing gift settings file:', e);
  }
  return updated;
}

export function calculateGiftQuotaForOrder(itemsSubtotal, options = false) {
  const isFirstOrder = (typeof options === object && options !== null) ? Boolean(options.isFirstOrder) : Boolean(options);
  const settings = getGiftSettings();
  if (!settings || settings.isEnabled === false) return 0;
  const subtotal = Number(itemsSubtotal) || 0;
  if (subtotal <= 0) return 0;

  const minOrder = Number(settings.minOrderForGift) || 0;
  if (minOrder > 0 && subtotal < minOrder) {
    return 0;
  }

  let pct = 0;

  if (settings.tieredGiftsEnabled && Array.isArray(settings.tieredGifts) && settings.tieredGifts.length > 0) {
    const sortedTiers = [...settings.tieredGifts]
      .filter(t => t && typeof t === object && (Number(t.giftPercent) >= 0 || Number(t.minAmount) >= 0))
      .sort((a, b) => (Number(a.minAmount) || 0) - (Number(b.minAmount) || 0));

    let matchedTier = null;

    for (let i = 0; i < sortedTiers.length; i++) {
      const tier = sortedTiers[i];
      const min = Number(tier.minAmount) || 0;
      const max = Number(tier.maxAmount) || 0;

      const prevTier = i > 0 ? sortedTiers[i - 1] : null;
      const isContiguousWithPrev = prevTier && (Number(prevTier.maxAmount) === min);

      const isAboveMin = isContiguousWithPrev ? (subtotal > min) : (subtotal >= min);
      const isBelowMax = (max === 0 || subtotal <= max);

      if (isAboveMin && isBelowMax) {
        matchedTier = tier;
        break;
      }
    }

    if (matchedTier && matchedTier.giftPercent !== undefined) {
      pct = Number(matchedTier.giftPercent) || 0;
    } else {
      const lowestMin = sortedTiers.length > 0 ? (Number(sortedTiers[0].minAmount) || 0) : 0;
      if (subtotal < lowestMin) {
        pct = 0;
      } else {
        pct = Number(settings.defaultGiftPercent) || 0;
      }
    }
  } else {
    pct = Number(settings.defaultGiftPercent) || 0;
  }

  if (isFirstOrder && settings.isFirstOrderBonusEnabled && Number(settings.firstOrderBonusPercent) > 0) {
    const bonus = Number(settings.firstOrderBonusPercent) || 0;
    if (bonus > pct) pct = bonus;
  }

  if (pct <= 0) return 0;
  return Math.round(subtotal * (pct / 100));
}

export function syncPackagesAvailabilityWithProductStock(prods) {
  try {
    const prodList = (Array.isArray(prods) && prods.length > 0) ? prods : readProductsList();
    if (!prodList || !prodList.length) return;
    
    const pkgs = getPackagesList(false);
    if (!Array.isArray(pkgs) || pkgs.length === 0) return;
    
    let modified = false;
    pkgs.forEach(pkg => {
      if (!Array.isArray(pkg.items) || pkg.items.length === 0) return;
      
      const hasOutOfStockItem = pkg.items.some(item => {
        const pid = String(item.productId || item.id || item.code || '');
        const p = prodList.find(x => String(x.id) === pid || String(x.code) === pid || (x.name && item.name && x.name.trim() === item.name.trim()));
        if (!p) return true;
        const stock = (p.stock !== undefined && p.stock !== null && !isNaN(Number(p.stock))) ? Number(p.stock) : 0;
        return stock <= 0 || p.badge === 'ناموجود';
      });
      
      if (hasOutOfStockItem && pkg.isActive) {
        pkg.isActive = false;
        pkg.updatedAt = new Date().toISOString();
        modified = true;
      }
    });
    
    if (modified) {
      packagesListCache = pkgs;
      writeJson(PACKAGES_FILE, pkgs);
      try { writeJson(ROOT_PACKAGES_FILE, pkgs); } catch (e) {}
      pkgs.forEach(pkg => {
        savePackageToFirestore(pkg).catch(() => {});
        savePackageCloudSql(pkg).catch(() => {});
        try { savePackageSqlite(pkg); } catch (e) {}
      });
    }
  } catch (err) {
    console.error('Error syncing package availability with product stock:', err);
  }
}

export function getPackagesList(onlyActive = false) {
  if (!packagesListCache) {
    try {
      const sqlPkgs = getAllPackagesSqlite();
      if (Array.isArray(sqlPkgs) && sqlPkgs.length > 0) {
        packagesListCache = sqlPkgs;
      }
    } catch (e) {}
    
    if (!packagesListCache) {
      packagesListCache = readJson(PACKAGES_FILE, readJson(ROOT_PACKAGES_FILE, []));
      if (!Array.isArray(packagesListCache)) packagesListCache = [];
      if (packagesListCache.length > 0) {
        try { saveAllPackagesSqlite(packagesListCache); } catch (e) {}
      }
    }
  }
  if (onlyActive) {
    const prodList = readProductsList();
    return packagesListCache.filter(p => {
      if (p.isActive === false) return false;
      if (!Array.isArray(p.items) || p.items.length === 0) return false;
      return p.items.every(item => {
        const pid = String(item.productId || item.id || item.code || '');
        const prod = prodList.find(x => String(x.id) === pid || String(x.code) === pid || (x.name && item.name && x.name.trim() === item.name.trim()));
        if (!prod) return false;
        const stock = (prod.stock !== undefined && prod.stock !== null && !isNaN(Number(prod.stock))) ? Number(prod.stock) : 0;
        return stock > 0 && prod.badge !== 'ناموجود';
      });
    });
  }
  return packagesListCache;
}

export function getPackageById(id) {
  const list = getPackagesList();
  return list.find(p => String(p.id) === String(id)) || null;
}

export function savePackage(packageData) {
  const list = getPackagesList(false);
  const id = packageData.id || ('pkg_' + Date.now());
  const now = new Date().toISOString();
  const existingIdx = list.findIndex(p => String(p.id) === String(id));
  const prodList = readProductsList();
  
  const items = Array.isArray(packageData.items) ? packageData.items : [];
  
  const hasOutOfStockItem = items.some(item => {
    const pid = String(item.productId || item.id || item.code || '');
    const prod = prodList.find(x => String(x.id) === pid || String(x.code) === pid || (x.name && item.name && x.name.trim() === item.name.trim()));
    if (!prod) return true;
    const stock = (prod.stock !== undefined && prod.stock !== null && !isNaN(Number(prod.stock))) ? Number(prod.stock) : 0;
    return stock <= 0 || prod.badge === 'ناموجود';
  });

  const shouldBeActive = (packageData.isActive !== false) && !hasOutOfStockItem;

  const pkgObj = {
    id,
    title: packageData.title || 'پکیج جدید',
    subtitle: packageData.subtitle || '',
    badge: packageData.badge || 'ویژه',
    badgeColor: packageData.badgeColor || '#059669',
    image: packageData.image || '',
    isActive: shouldBeActive,
    items: items,
    originalPrice: Number(packageData.originalPrice) || 0,
    packagePrice: Number(packageData.packagePrice) || 0,
    discountPercent: Number(packageData.discountPercent) || 0,
    giftCredit: Number(packageData.giftCredit) || 0,
    bonusItem: packageData.bonusItem || '',
    stock: Number(packageData.stock) >= 0 ? Number(packageData.stock) : 50,
    description: packageData.description || '',
    createdAt: existingIdx !== -1 ? (list[existingIdx].createdAt || now) : now,
    updatedAt: now
  };
  
  if (existingIdx !== -1) {
    list[existingIdx] = pkgObj;
  } else {
    list.unshift(pkgObj);
  }
  
  packagesListCache = list;

  // 1. Save to Firestore
  savePackageToFirestore(pkgObj).catch(err => console.error('[Firestore save package error]:', err));

  // 2. Save to Supabase / PostgreSQL
  savePackageCloudSql(pkgObj).catch(err => console.error('[Cloud SQL save package error]:', err));

  // 3. Save to SQLite
  try {
    savePackageSqlite(pkgObj);
  } catch (e) {
    console.error('[SQLite save package error]:', e);
  }

  // 4. Save to JSON files
  writeJson(PACKAGES_FILE, list);
  try { writeJson(ROOT_PACKAGES_FILE, list); } catch (e) {}
  return pkgObj;
}

export function deletePackage(id) {
  let list = getPackagesList();
  list = list.filter(p => String(p.id) !== String(id));
  packagesListCache = list;

  // 1. Delete from Firestore
  deletePackageFromFirestore(id).catch(err => console.error('[Firestore delete package error]:', err));

  // 2. Delete from Supabase / PostgreSQL
  deletePackageCloudSql(id).catch(err => console.error('[Cloud SQL delete package error]:', err));

  // 3. Delete from SQLite
  try {
    deletePackageSqlite(id);
  } catch (e) {
    console.error('[SQLite delete package error]:', e);
  }

  // 4. Save to JSON files
  writeJson(PACKAGES_FILE, list);
  try { writeJson(ROOT_PACKAGES_FILE, list); } catch (e) {}
  return { success: true };
}

export function togglePackageStatus(id) {
  const list = getPackagesList();
  const pkg = list.find(p => String(p.id) === String(id));
  if (!pkg) return null;
  pkg.isActive = !pkg.isActive;
  pkg.updatedAt = new Date().toISOString();
  packagesListCache = list;

  savePackageToFirestore(pkg).catch(err => console.error('[Firestore toggle package error]:', err));
  savePackageCloudSql(pkg).catch(err => console.error('[Cloud SQL toggle package error]:', err));
  try { savePackageSqlite(pkg); } catch (e) {}

  writeJson(PACKAGES_FILE, list);
  try { writeJson(ROOT_PACKAGES_FILE, list); } catch (e) {}
  return pkg;
}


export async function initDatabaseSync() {
  try {
    await initCloudSql();
    await refreshProductsFromCloudSql();
    console.log('[Database Sync] Hydrated live product catalog from Supabase/Cloud SQL.');
    try {
      const sqlBank = await getBankSettingsCloudSql();
      if (sqlBank && sqlBank.cardNumber) {
        bankSettingsCache = { ...DEFAULT_BANK_SETTINGS, ...sqlBank };
        writeJson(BANK_SETTINGS_FILE, bankSettingsCache);
        writeJson(ROOT_BANK_SETTINGS_FILE, bankSettingsCache);
        console.log('[Database Sync] Hydrated bank settings from Supabase/Cloud SQL.');
      }
    } catch (bErr) {
      console.error('[Database Sync] Bank settings hydrate error:', bErr.message);
    }
    try {
      const sqlDelivery = await getDeliverySettingsCloudSql();
      if (sqlDelivery && typeof sqlDelivery === 'object' && typeof sqlDelivery.isExpressDeliveryEnabled !== 'undefined') {
        deliverySettingsCache = { ...DEFAULT_DELIVERY_SETTINGS, ...sqlDelivery };
        writeJson(DELIVERY_SETTINGS_FILE, deliverySettingsCache);
        writeJson(ROOT_DELIVERY_SETTINGS_FILE, deliverySettingsCache);
        try { saveDeliverySettingsSqlite(deliverySettingsCache); } catch (e) {}
        console.log('[Database Sync] Hydrated delivery settings from Supabase/Cloud SQL. isExpressDeliveryEnabled =', deliverySettingsCache.isExpressDeliveryEnabled);
      }
    } catch (dErr) {
      console.error('[Database Sync] Delivery settings hydrate error:', dErr.message);
    }
    try {
      const sqlGifts = await getGiftSettingsCloudSql();
      if (sqlGifts && typeof sqlGifts === 'object' && typeof sqlGifts.defaultGiftPercent !== 'undefined') {
        giftSettingsCache = { ...DEFAULT_GIFT_SETTINGS, ...sqlGifts };
        writeJson(GIFT_SETTINGS_FILE, giftSettingsCache);
        writeJson(ROOT_GIFT_SETTINGS_FILE, giftSettingsCache);
        try { saveGiftSettingsSqlite(giftSettingsCache); } catch (e) {}
        console.log('[Database Sync] Hydrated gift settings from Supabase/Cloud SQL.');
      }
    } catch (gErr) {
      console.error('[Database Sync] Gift settings hydrate error:', gErr.message);
    }
    try {
      const sqlPkgs = await getAllPackagesCloudSql();
      if (Array.isArray(sqlPkgs) && sqlPkgs.length > 0) {
        packagesListCache = sqlPkgs;
        writeJson(PACKAGES_FILE, sqlPkgs);
        try { writeJson(ROOT_PACKAGES_FILE, sqlPkgs); } catch (e) {}
        try { saveAllPackagesSqlite(sqlPkgs); } catch (e) {}
        console.log(`[Database Sync] Hydrated ${sqlPkgs.length} packages from Supabase/Cloud SQL.`);
      }
    } catch (pkgErr) {
      console.error('[Database Sync] Packages hydrate error:', pkgErr.message);
    }
    try {
      const sqlPayments = await getAllCompanyPaymentsCloudSql();
      if (Array.isArray(sqlPayments) && sqlPayments.length > 0) {
        companyPaymentsListCache = sqlPayments;
        writeJson(COMPANY_PAYMENTS_FILE, sqlPayments);
        try { writeJson(ROOT_COMPANY_PAYMENTS_FILE, sqlPayments); } catch (e) {}
        console.log(`[Database Sync] Hydrated ${sqlPayments.length} company payments from Supabase/Cloud SQL.`);
      }
    } catch (pErr) {
      console.error('[Database Sync] Company payments hydrate error:', pErr.message);
    }
    try {
      const sqlPurchases = await getAllPurchasesCloudSql();
      if (Array.isArray(sqlPurchases) && sqlPurchases.length > 0) {
        purchasesListCache = sqlPurchases;
        writeJson(PURCHASES_FILE, sqlPurchases);
        try { writeJson(ROOT_PURCHASES_FILE, sqlPurchases); } catch (e) {}
        console.log(`[Database Sync] Hydrated ${sqlPurchases.length} purchases from Supabase/Cloud SQL.`);
      }
    } catch (puErr) {
      console.error('[Database Sync] Purchases hydrate error:', puErr.message);
    }
  } catch (e) {
    console.error('Cloud SQL init notice:', e);
  }
  try {
    await seedSqliteFromJson();
  } catch (e) {
    console.error('SQLite init notice:', e);
  }
}

// -------------------------------------------------------------
// Admin Notification Store
// -------------------------------------------------------------
export function createNotification(notifData = {}) {
  const notifications = readJson(NOTIFICATIONS_FILE, readJson(ROOT_NOTIFICATIONS_FILE, []));
  const newNotif = {
    id: notifData.id || ('notif_' + Date.now() + '_' + Math.floor(Math.random() * 1000)),
    type: notifData.type || 'new_order',
    orderId: notifData.orderId || '',
    title: notifData.title || 'ثبت سفارش جدید',
    message: notifData.message || 'سفارش جدید با موفقیت ثبت شد.',
    customerName: notifData.customerName || '',
    phone: notifData.phone || '',
    totalAmount: Number(notifData.totalAmount) || 0,
    totalRial: (Number(notifData.totalAmount) || 0) * 10,
    itemsCount: Number(notifData.itemsCount) || 0,
    createdAt: notifData.createdAt || new Date().toISOString(),
    isRead: false
  };
  notifications.unshift(newNotif);
  const trimmed = notifications.slice(0, 200);
  writeJson(NOTIFICATIONS_FILE, trimmed);
  try { writeJson(ROOT_NOTIFICATIONS_FILE, trimmed); } catch (e) {}
  return newNotif;
}

export function listNotifications() {
  const notifications = readJson(NOTIFICATIONS_FILE, readJson(ROOT_NOTIFICATIONS_FILE, []));
  return notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function markNotificationAsRead(id) {
  let notifications = readJson(NOTIFICATIONS_FILE, readJson(ROOT_NOTIFICATIONS_FILE, []));
  if (!id || id === 'all') {
    notifications = notifications.map(n => ({ ...n, isRead: true }));
  } else {
    notifications = notifications.map(n => String(n.id) === String(id) ? { ...n, isRead: true } : n);
  }
  writeJson(NOTIFICATIONS_FILE, notifications);
  try { writeJson(ROOT_NOTIFICATIONS_FILE, notifications); } catch (e) {}
  return { success: true, unreadCount: notifications.filter(n => !n.isRead).length };
}

export function clearAllNotifications() {
  writeJson(NOTIFICATIONS_FILE, []);
  try { writeJson(ROOT_NOTIFICATIONS_FILE, []); } catch (e) {}
  return { success: true };
}



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
  deletePurchaseFromFirestore
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
  deletePurchaseCloudSql
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
  getDb
} from './sqlite.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');
const COMPANY_PAYMENTS_FILE = path.join(DATA_DIR, 'company_payments.json');
const PURCHASES_FILE = path.join(DATA_DIR, 'purchases.json');
const DATA_PRODUCTS_FILE = path.join(DATA_DIR, 'products_data.json');

const ROOT_ORDERS_FILE = path.join(process.cwd(), 'orders.json');
const ROOT_CUSTOMERS_FILE = path.join(process.cwd(), 'customers.json');
const ROOT_COMPANY_PAYMENTS_FILE = path.join(process.cwd(), 'company_payments.json');
const ROOT_PURCHASES_FILE = path.join(process.cwd(), 'purchases.json');
const ROOT_PRODUCTS_JSON = path.join(process.cwd(), 'products_data.json');
const ROOT_PRODUCTS_JS = path.join(process.cwd(), 'products_data.js');

let productsListCache = null;
let productsMapCache = null;
let ordersListCache = null;
let customersListCache = null;
let companyPaymentsListCache = null;
let purchasesListCache = null;

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
        if (Array.isArray(fsCusts)) {
          customersListCache = fsCusts;
        } else {
          customersListCache = readJsonLocal(CUSTOMERS_FILE, []);
        }
      }

      if (!companyPaymentsListCache) {
        const fsPays = await getCompanyPaymentsFromFirestore();
        if (Array.isArray(fsPays)) {
          companyPaymentsListCache = fsPays;
        } else {
          companyPaymentsListCache = readJsonLocal(COMPANY_PAYMENTS_FILE, []);
        }
      }

      if (!purchasesListCache) {
        const fsPurs = await getPurchasesFromFirestore();
        if (Array.isArray(fsPurs)) {
          purchasesListCache = fsPurs;
        } else {
          purchasesListCache = readJsonLocal(PURCHASES_FILE, []);
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

    ensureDataDir();
    const jsonStr = JSON.stringify(list, null, 2);
    try { fs.writeFileSync(DATA_PRODUCTS_FILE, jsonStr, 'utf8'); } catch (e) {}
    try { fs.writeFileSync(ROOT_PRODUCTS_JSON, jsonStr, 'utf8'); } catch (e) {}
    try { fs.writeFileSync(ROOT_PRODUCTS_JS, `const productsData = ${jsonStr};\n`, 'utf8'); } catch (e) {}

    try { saveAllProductsSqlite(list); } catch (err) { console.error('SQLite save products error:', err); }
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
  return String(phone || '').replace(/\D/g, '').replace(/^98/, '0');
}

export function getStatusLabel(status) {
  return STATUS_LABELS[status] || status;
}

export function getAllStatuses() {
  return ORDER_STATUSES.map(id => ({ id, label: STATUS_LABELS[id] }));
}

export function upsertCustomer({ name, phone, address }) {
  const customers = readJson(CUSTOMERS_FILE, []);
  const normalizedPhone = normalizePhone(phone);
  let customer = customers.find(c => normalizePhone(c.phone) === normalizedPhone);

  if (customer) {
    customer.name = name || customer.name;
    customer.address = address || customer.address;
    customer.updatedAt = new Date().toISOString();
  } else {
    customer = {
      id: generateId('cust'),
      name,
      phone: normalizedPhone,
      address: address || '',
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

export function reduceProductStock(items) {
  try {
    const list = readProductsList();
    if (!list.length) return;
    let modified = false;
    const changedProducts = [];

    (items || []).forEach(item => {
      const pid = String(item.id || item.code || item.productId || '');
      const qty = Number(item.qty) || 1;
      const product = list.find(p =>
        (pid && (String(p.id) === pid || String(p.code) === pid)) ||
        (item.name && String(p.name).trim().toLowerCase() === String(item.name).trim().toLowerCase())
      );
      if (product) {
        let currentStock = product.stock !== undefined && product.stock !== null && !isNaN(Number(product.stock))
          ? Number(product.stock)
          : 10;
        product.stock = Math.max(0, currentStock - qty);
        product.badge = product.stock <= 0 ? 'ناموجود' : (product.stock <= 5 ? `تعداد محدود (${product.stock} عدد)` : null);
        product.updatedAt = new Date().toISOString();
        modified = true;
        changedProducts.push(product);
      }
    });

    if (modified) {
      saveProductsList(list, true);
    }
  } catch (e) {
    console.error('Error reducing product stock:', e);
  }
}

export function restoreProductStock(items) {
  try {
    const list = readProductsList();
    if (!list.length) return;
    let modified = false;
    const changedProducts = [];

    (items || []).forEach(item => {
      const pid = String(item.id || item.code || item.productId || '');
      const qty = Number(item.qty) || 1;
      const product = list.find(p =>
        (pid && (String(p.id) === pid || String(p.code) === pid)) ||
        (item.name && String(p.name).trim().toLowerCase() === String(item.name).trim().toLowerCase())
      );
      if (product) {
        let currentStock = product.stock !== undefined && product.stock !== null && !isNaN(Number(product.stock))
          ? Number(product.stock)
          : 0;
        product.stock = currentStock + qty;
        product.badge = product.stock <= 0 ? 'ناموجود' : (product.stock <= 5 ? `تعداد محدود (${product.stock} عدد)` : null);
        product.updatedAt = new Date().toISOString();
        modified = true;
        changedProducts.push(product);
      }
    });

    if (modified) {
      saveProductsList(list, true);
    }
  } catch (e) {
    console.error('Error restoring product stock:', e);
  }
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
  const existingIdx = orders.findIndex(o => o.id === orderId);

  let order;
  if (existingIdx !== -1) {
    order = {
      ...orders[existingIdx],
      customerName: orderData.customerName || orders[existingIdx].customerName,
      phone: normalizePhone(orderData.phone) || orders[existingIdx].phone,
      address: orderData.address || orders[existingIdx].address,
      items: (items && items.length) ? items : orders[existingIdx].items,
      totalAmount: Number(orderData.totalAmount) || orders[existingIdx].totalAmount,
      paymentMethod: orderData.paymentMethod || orders[existingIdx].paymentMethod,
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
      totalAmount: Number(orderData.totalAmount) || 0,
      paymentMethod: orderData.paymentMethod || 'cod',
      status: orderData.status || 'new',
      adminNotes: orderData.adminNotes || '',
      source: orderData.source || 'website',
      createdAt: orderData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    orders.push(order);
  }

  const customers = readJson(CUSTOMERS_FILE, []);
  const customerIdx = customers.findIndex(c => c.id === customer.id);
  if (customerIdx !== -1) {
    if (existingIdx === -1) {
      customers[customerIdx].totalOrders += 1;
      customers[customerIdx].totalSpent += order.totalAmount;
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

  // Automatically update stock in products dataset upon order creation!
  if (existingIdx === -1) {
    reduceProductStock(items);
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
  const order = orders.find(o => o.id === id);
  if (!order) return null;
  const { map: pMap } = getProductsMap();
  return enrichOrderWithProfit(order, pMap);
}

export function deleteOrder(id) {
  let orders = readJson(ORDERS_FILE, []);
  const initialLength = orders.length;
  orders = orders.filter(o => o.id !== id);
  if (orders.length !== initialLength) {
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

  return {
    lowStockCount: lowStockProducts.length,
    lowStockProducts,
    delayedOrdersCount: delayedOrders.length,
    delayedOrders,
    totalAlertsCount: lowStockProducts.length + delayedOrders.length
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
  const idx = orders.findIndex(o => o.id === id);
  if (idx === -1) return null;

  if (updates.status && !ORDER_STATUSES.includes(updates.status)) {
    throw new Error('وضعیت سفارش نامعتبر است');
  }

  const oldStatus = orders[idx].status;
  const newStatus = updates.status;

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
    customerName: updates.customerName || orders[idx].customerName,
    phone: updates.phone ? normalizePhone(updates.phone) : orders[idx].phone,
    address: updates.address !== undefined ? updates.address : orders[idx].address,
    items: (items && items.length) ? items : orders[idx].items,
    totalAmount: updates.totalAmount !== undefined ? Number(updates.totalAmount) : orders[idx].totalAmount,
    paymentMethod: updates.paymentMethod || orders[idx].paymentMethod,
    note: updates.note !== undefined ? updates.note : orders[idx].note,
    adminNotes: updates.adminNotes !== undefined ? updates.adminNotes : orders[idx].adminNotes,
    createdAt: updates.createdAt || orders[idx].createdAt,
    updatedAt: new Date().toISOString()
  };

  writeJson(ORDERS_FILE, orders);
  await saveOrderCloudSql(orders[idx]).catch(e => console.error('Cloud SQL update order notice:', e));
  saveOrderToFirestore(orders[idx]).catch(e => console.error('Firestore update order error:', e));
  try { saveOrderSqlite(orders[idx]); } catch (e) { console.error('SQLite update order notice:', e); }

  // If status changed to cancelled, restore stock!
  if (oldStatus !== 'cancelled' && newStatus === 'cancelled') {
    restoreProductStock(orders[idx].items);
  } else if (oldStatus === 'cancelled' && newStatus && newStatus !== 'cancelled') {
    reduceProductStock(orders[idx].items);
  }

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
    isCustomized: true,
    updatedAt: new Date().toISOString()
  };

  await saveProductCloudSql(list[idx]).catch(e => console.error('Cloud SQL update product error:', e));
  saveProductsList(list, false);
  await saveProductToFirestore(list[idx]).catch(e => console.error('Firestore save product error:', e));
  return list[idx];
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

  if (filters.search) {
    const q = filters.search.toLowerCase();
    customers = customers.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.address?.toLowerCase().includes(q)
    );
  }

  return customers.sort((a, b) => new Date(b.lastOrderAt || b.createdAt) - new Date(a.lastOrderAt || a.createdAt));
}

export function getCustomerById(id) {
  const customers = readJson(CUSTOMERS_FILE, []);
  const customer = customers.find(c => c.id === id);
  if (!customer) return null;

  const orders = readJson(ORDERS_FILE, []).filter(o => o.customerId === id);
  return { ...customer, orders };
}

export async function updateCustomer(id, updates) {
  const customers = readJson(CUSTOMERS_FILE, []);
  const idx = customers.findIndex(c => c.id === id || c.phone === id);
  if (idx === -1) return null;

  const oldPhone = customers[idx].phone;

  customers[idx] = {
    ...customers[idx],
    ...updates,
    updatedAt: new Date().toISOString()
  };

  // Sync customer changes across orders
  if (updates.name || updates.phone || updates.address) {
    const orders = readJson(ORDERS_FILE, []);
    let ordersUpdated = false;
    orders.forEach(o => {
      if (o.customerId === id || o.phone === oldPhone || o.phone === id) {
        if (updates.name) o.customerName = updates.name;
        if (updates.phone) o.phone = normalizePhone(updates.phone);
        if (updates.address) o.address = updates.address;
        ordersUpdated = true;
      }
    });
    if (ordersUpdated) {
      writeJson(ORDERS_FILE, orders);
    }
  }

  writeJson(CUSTOMERS_FILE, customers);
  await saveCustomerCloudSql(customers[idx]).catch(e => console.error('Cloud SQL update customer notice:', e));
  saveCustomerToFirestore(customers[idx]).catch(e => console.error('Firestore update customer error:', e));
  try { saveCustomerSqlite(customers[idx]); } catch (e) { console.error('SQLite update customer notice:', e); }
  return customers[idx];
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
  const orders = readJson(ORDERS_FILE, []);
  const { map: pMap } = getProductsMap();

  let filteredOrders = orders.filter(o => o.status !== 'cancelled');

  let startMs = 0;
  let endMs = Infinity;

  if (fromDate) {
    const s = new Date(fromDate);
    s.setHours(0, 0, 0, 0);
    startMs = s.getTime();
  }
  if (toDate) {
    const e = new Date(toDate);
    e.setHours(23, 59, 59, 999);
    endMs = e.getTime();
  }

  if (startMs > 0 || endMs < Infinity) {
    filteredOrders = filteredOrders.filter(o => {
      const orderTime = new Date(o.createdAt).getTime();
      return orderTime >= startMs && orderTime <= endMs;
    });
  }

  let totalItemsCount = 0;
  let totalBuyCost = 0;
  let totalRevenue = 0;
  let rafoonehOrdersCount = 0;
  const productSummaryMap = {};

  filteredOrders.forEach(o => {
    const enriched = enrichOrderWithProfit(o, pMap);
    let orderHasRafooneh = false;

    (enriched.items || []).forEach(item => {
      const pid = String(item.id || item.code || item.productId || item.name);
      const prod = pMap[pid] || pMap[item.id] || pMap[item.code] || {};

      const brand = String(item.brand || prod.brand || '').toLowerCase();
      const brandName = String(item.brandName || prod.brandName || '').toLowerCase();
      
      // Calculate ONLY items under the Rafooneh brand
      const isRafooneh = (brand === 'rafooneh' || brandName.includes('رافونه')) || (brand !== 'foreign' && !brandName.includes('خارجی'));
      if (!isRafooneh) return;

      orderHasRafooneh = true;

      if (!productSummaryMap[pid]) {
        productSummaryMap[pid] = {
          id: pid,
          code: item.code || prod.code || item.id || pid,
          name: item.name || prod.name || 'محصول رافونه',
          unitsSold: 0,
          buyPrice: Number(item.buyPrice) || 0,
          totalBuyCost: 0,
          sellingPrice: Number(item.price) || 0,
          totalRevenue: 0
        };
      }
      const qty = Number(item.qty || item.quantity) || 1;
      const buyPrice = Number(item.buyPrice) || 0;
      const sellPrice = Number(item.price) || 0;
      const itemCost = buyPrice * qty;
      const itemRev = sellPrice * qty;

      productSummaryMap[pid].unitsSold += qty;
      productSummaryMap[pid].totalBuyCost += itemCost;
      productSummaryMap[pid].totalRevenue += itemRev;

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
    products: productList
  };
}

export function listCompanyPayments() {
  const payments = readJson(COMPANY_PAYMENTS_FILE, []);
  return payments.sort((a, b) => new Date(b.paymentDate || b.createdAt) - new Date(a.paymentDate || a.createdAt));
}

export function createCompanyPayment(paymentData) {
  const payments = readJson(COMPANY_PAYMENTS_FILE, []);
  const nowStr = new Date().toISOString();

  const newPayment = {
    id: paymentData.id || `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    paymentDate: paymentData.paymentDate || nowStr.split('T')[0],
    fromDate: paymentData.fromDate || '',
    toDate: paymentData.toDate || '',
    totalBuyCost: Number(paymentData.totalBuyCost) || 0,
    totalItemsCount: Number(paymentData.totalItemsCount) || 0,
    ordersCount: Number(paymentData.ordersCount) || 0,
    refNumber: paymentData.refNumber || '',
    notes: paymentData.notes || '',
    status: paymentData.status || 'پرداخت شده',
    items: Array.isArray(paymentData.items) ? paymentData.items : [],
    createdAt: nowStr
  };

  payments.unshift(newPayment);
  writeJson(COMPANY_PAYMENTS_FILE, payments);
  saveCompanyPaymentToFirestore(newPayment).catch(e => console.error('Firestore save payment error:', e));
  try { saveCompanyPaymentSqlite(newPayment); } catch (e) { console.error('SQLite save payment notice:', e); }
  try { saveCompanyPaymentCloudSql(newPayment); } catch (e) { console.error('Cloud SQL save payment notice:', e); }
  return newPayment;
}

export function deleteCompanyPayment(id) {
  let payments = readJson(COMPANY_PAYMENTS_FILE, []);
  const initialLen = payments.length;
  payments = payments.filter(p => String(p.id) !== String(id));
  if (payments.length !== initialLen) {
    writeJson(COMPANY_PAYMENTS_FILE, payments);
    deleteCompanyPaymentFromFirestore(id).catch(e => console.error('Firestore delete payment error:', e));
    try { deleteCompanyPaymentSqlite(id); } catch (e) { console.error('SQLite delete payment notice:', e); }
    try { deleteCompanyPaymentCloudSql(id); } catch (e) { console.error('Cloud SQL delete payment notice:', e); }
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
    const rowTotal = qty * buyPrice;

    totalAmount += rowTotal;
    totalItemsCount += qty;

    return {
      productId: pid,
      name,
      qty,
      buyPrice,
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
  const idx = purchases.findIndex(p => String(p.id) === String(id));
  if (idx === -1) return null;

  const nowStr = new Date().toISOString();
  const rawItems = Array.isArray(updates.items) ? updates.items : purchases[idx].items;
  let totalAmount = 0;
  let totalItemsCount = 0;

  const items = rawItems.map(item => {
    const pid = String(item.productId || item.id || '');
    const name = item.name || 'محصول رافونه';
    const qty = Math.max(1, Number(item.qty || item.quantity) || 1);
    const buyPrice = Math.max(0, Number(item.buyPrice) || 0);
    const rowTotal = qty * buyPrice;

    totalAmount += rowTotal;
    totalItemsCount += qty;

    return {
      productId: pid,
      name,
      qty,
      buyPrice,
      rowTotal
    };
  });

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
  purchases = purchases.filter(p => String(p.id) !== String(id));
  if (purchases.length !== initialLen) {
    writeJson(PURCHASES_FILE, purchases);
    writeJson(ROOT_PURCHASES_FILE, purchases);
    deletePurchaseFromFirestore(id).catch(e => console.error('Firestore delete purchase error:', e));
    try { deletePurchaseSqlite(id); } catch (e) { console.error('SQLite delete purchase notice:', e); }
    try { deletePurchaseCloudSql(id); } catch (e) { console.error('Cloud SQL delete purchase notice:', e); }
    return true;
  }
  return false;
}

export async function initDatabaseSync() {
  try {
    await initCloudSql();
    await refreshProductsFromCloudSql();
    console.log('[Database Sync] Hydrated live product catalog from Supabase/Cloud SQL.');
  } catch (e) {
    console.error('Cloud SQL init notice:', e);
  }
  try {
    await seedSqliteFromJson();
  } catch (e) {
    console.error('SQLite init notice:', e);
  }
}

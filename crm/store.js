import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = path.join(process.cwd(), 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');
const DATA_PRODUCTS_FILE = path.join(DATA_DIR, 'products_data.json');
const ROOT_PRODUCTS_JSON = path.join(process.cwd(), 'products_data.json');
const ROOT_PRODUCTS_JS = path.join(process.cwd(), 'products_data.js');

export function saveProductsList(list) {
  try {
    ensureDataDir();
    const jsonStr = JSON.stringify(list, null, 2);
    fs.writeFileSync(DATA_PRODUCTS_FILE, jsonStr, 'utf8');
    fs.writeFileSync(ROOT_PRODUCTS_JSON, jsonStr, 'utf8');
    fs.writeFileSync(ROOT_PRODUCTS_JS, `const productsData = ${jsonStr};\n`, 'utf8');
  } catch (err) {
    console.error('Error saving products list:', err);
  }
}

export function readProductsList() {
  try {
    ensureDataDir();
    if (fs.existsSync(DATA_PRODUCTS_FILE)) {
      const data = fs.readFileSync(DATA_PRODUCTS_FILE, 'utf8');
      const list = JSON.parse(data);
      if (Array.isArray(list) && list.length > 0) return list;
    }
  } catch (e) {}

  try {
    if (fs.existsSync(ROOT_PRODUCTS_JSON)) {
      const data = fs.readFileSync(ROOT_PRODUCTS_JSON, 'utf8');
      const list = JSON.parse(data);
      if (Array.isArray(list) && list.length > 0) {
        saveProductsList(list);
        return list;
      }
    }
  } catch (e) {}

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

function readJson(file, fallback) {
  ensureDataDir();
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2), 'utf8');
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
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
  return customer;
}

function getProductsMap() {
  try {
    const list = readProductsList();
    const map = {};
    list.forEach(p => {
      if (p.id) map[String(p.id)] = p;
      if (p.code) map[String(p.code)] = p;
    });
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

    (items || []).forEach(item => {
      const pid = String(item.id || item.code || item.productId || '');
      const qty = Number(item.qty) || 1;
      const product = list.find(p =>
        (pid && (String(p.id) === pid || String(p.code) === pid)) ||
        (item.name && String(p.name).trim() === String(item.name).trim())
      );
      if (product) {
        product.stock = Math.max(0, (Number(product.stock) || 0) - qty);
        product.badge = product.stock <= 0 ? 'ناموجود' : (product.stock <= 5 ? `تعداد محدود (${product.stock} عدد)` : null);
        product.updatedAt = new Date().toISOString();
        modified = true;
      }
    });

    if (modified) {
      saveProductsList(list);
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

    (items || []).forEach(item => {
      const pid = String(item.id || item.code || '');
      const qty = Number(item.qty) || 1;
      const product = list.find(p => String(p.id) === pid || String(p.code) === pid);
      if (product) {
        product.stock = (Number(product.stock) || 0) + qty;
        product.badge = product.stock <= 0 ? 'ناموجود' : (product.stock <= 5 ? `تعداد محدود (${product.stock} عدد)` : null);
        product.updatedAt = new Date().toISOString();
        modified = true;
      }
    });

    if (modified) {
      saveProductsList(list);
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

  const order = {
    id: orderId,
    customerId: customer.id,
    customerName: orderData.customerName,
    phone: normalizePhone(orderData.phone),
    address: orderData.address,
    note: orderData.note || '',
    items,
    totalAmount: Number(orderData.totalAmount) || 0,
    paymentMethod: orderData.paymentMethod || 'cod',
    status: 'new',
    adminNotes: '',
    source: orderData.source || 'website',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  orders.push(order);

  const customers = readJson(CUSTOMERS_FILE, []);
  const customerIdx = customers.findIndex(c => c.id === customer.id);
  if (customerIdx !== -1) {
    customers[customerIdx].totalOrders += 1;
    customers[customerIdx].totalSpent += order.totalAmount;
    customers[customerIdx].lastOrderAt = order.createdAt;
    customers[customerIdx].name = order.customerName;
    customers[customerIdx].address = order.address;
    customers[customerIdx].updatedAt = order.updatedAt;
  }

  writeJson(ORDERS_FILE, orders);
  writeJson(CUSTOMERS_FILE, customers);

  // Automatically update stock in products dataset upon order creation!
  reduceProductStock(items);

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

export function updateOrder(id, updates) {
  const orders = readJson(ORDERS_FILE, []);
  const idx = orders.findIndex(o => o.id === id);
  if (idx === -1) return null;

  if (updates.status && !ORDER_STATUSES.includes(updates.status)) {
    throw new Error('وضعیت سفارش نامعتبر است');
  }

  const oldStatus = orders[idx].status;
  const newStatus = updates.status;

  orders[idx] = {
    ...orders[idx],
    ...updates,
    updatedAt: new Date().toISOString()
  };

  writeJson(ORDERS_FILE, orders);

  // If status changed to cancelled, restore stock!
  if (oldStatus !== 'cancelled' && newStatus === 'cancelled') {
    restoreProductStock(orders[idx].items);
  } else if (oldStatus === 'cancelled' && newStatus && newStatus !== 'cancelled') {
    reduceProductStock(orders[idx].items);
  }

  return orders[idx];
}

export function listProducts(filters = {}) {
  const { list } = getProductsMap();
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

export function updateProduct(id, updates) {
  const list = readProductsList();
  if (!list.length) return null;
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
    home: 'خانه و فرش',
    cellulosic: 'سلولزی و مصرفی',
    car: 'خودرو',
    other: 'سایر شوینده‌ها'
  };

  const category = updates.category || list[idx].category || 'other';
  const categoryName = updates.categoryName || categoryNames[category] || list[idx].categoryName || 'سایر شوینده‌ها';

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

  saveProductsList(list);
  return list[idx];
}

export function addProduct(productData) {
  const list = readProductsList();

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

  const newProd = {
    id: code,
    code: code,
    name: productData.name || 'محصول جدید',
    brand,
    brandName,
    category: productData.category || 'other',
    categoryName: productData.categoryName || 'سایر شوینده‌ها',
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

  list.unshift(newProd);
  saveProductsList(list);
  return newProd;
}

export function deleteProduct(id) {
  let list = readProductsList();
  if (!list.length) return false;
  const pid = String(id);
  const initialLength = list.length;

  list = list.filter(p => String(p.id) !== pid && String(p.code) !== pid);

  if (list.length !== initialLength) {
    saveProductsList(list);
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

export function updateCustomer(id, updates) {
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
  return customers[idx];
}

export function getDashboardStats() {
  const orders = readJson(ORDERS_FILE, []);
  const customers = readJson(CUSTOMERS_FILE, []);
  const { map: pMap } = getProductsMap();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();

  const todayOrders = orders.filter(o => o.createdAt >= todayIso);
  const activeOrders = orders.filter(o => !['delivered', 'cancelled'].includes(o.status));
  const deliveredOrders = orders.filter(o => o.status === 'delivered');

  const enrichedOrders = orders.map(o => enrichOrderWithProfit(o, pMap));
  const enrichedTodayOrders = todayOrders.map(o => enrichOrderWithProfit(o, pMap));
  const enrichedDeliveredOrders = deliveredOrders.map(o => enrichOrderWithProfit(o, pMap));

  const revenueToday = enrichedTodayOrders
    .filter(o => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.totalAmount, 0);

  const costToday = enrichedTodayOrders
    .filter(o => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.totalCost, 0);

  const profitToday = revenueToday - costToday;

  const revenueTotal = enrichedDeliveredOrders.reduce((sum, o) => sum + o.totalAmount, 0);
  const costTotal = enrichedDeliveredOrders.reduce((sum, o) => sum + o.totalCost, 0);
  const profitTotal = revenueTotal - costTotal;
  const profitMarginTotal = revenueTotal > 0 ? Math.round((profitTotal / revenueTotal) * 1000) / 10 : 0;

  const alerts = getAdminAlerts();

  const byStatus = ORDER_STATUSES.reduce((acc, status) => {
    acc[status] = orders.filter(o => o.status === status).length;
    return acc;
  }, {});

  const recentOrders = [...enrichedOrders]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 8);

  return {
    totalOrders: orders.length,
    totalCustomers: customers.length,
    todayOrders: todayOrders.length,
    activeOrders: activeOrders.length,
    revenueToday,
    costToday,
    profitToday,
    revenueTotal,
    costTotal,
    profitTotal,
    profitMarginTotal,
    alerts,
    byStatus,
    recentOrders
  };
}

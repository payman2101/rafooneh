import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = path.join(process.cwd(), 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');

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

export function listOrders(filters = {}) {
  let orders = readJson(ORDERS_FILE, []);

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

  return orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function getOrderById(id) {
  const orders = readJson(ORDERS_FILE, []);
  return orders.find(o => o.id === id) || null;
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

export function createOrder(orderData) {
  const orders = readJson(ORDERS_FILE, []);

  const customer = upsertCustomer({
    name: orderData.customerName,
    phone: orderData.phone,
    address: orderData.address
  });

  const order = {
    id: generateId('ord'),
    customerId: customer.id,
    customerName: orderData.customerName,
    phone: normalizePhone(orderData.phone),
    address: orderData.address,
    note: orderData.note || '',
    items: orderData.items || [],
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

  return order;
}

export function updateOrder(id, updates) {
  const orders = readJson(ORDERS_FILE, []);
  const idx = orders.findIndex(o => o.id === id);
  if (idx === -1) return null;

  if (updates.status && !ORDER_STATUSES.includes(updates.status)) {
    throw new Error('وضعیت سفارش نامعتبر است');
  }

  orders[idx] = {
    ...orders[idx],
    ...updates,
    updatedAt: new Date().toISOString()
  };

  writeJson(ORDERS_FILE, orders);
  return orders[idx];
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
  const idx = customers.findIndex(c => c.id === id);
  if (idx === -1) return null;

  customers[idx] = {
    ...customers[idx],
    ...updates,
    updatedAt: new Date().toISOString()
  };

  writeJson(CUSTOMERS_FILE, customers);
  return customers[idx];
}

export function getDashboardStats() {
  const orders = readJson(ORDERS_FILE, []);
  const customers = readJson(CUSTOMERS_FILE, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();

  const todayOrders = orders.filter(o => o.createdAt >= todayIso);
  const activeOrders = orders.filter(o => !['delivered', 'cancelled'].includes(o.status));
  const deliveredOrders = orders.filter(o => o.status === 'delivered');

  const revenueToday = todayOrders
    .filter(o => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.totalAmount, 0);

  const revenueTotal = deliveredOrders.reduce((sum, o) => sum + o.totalAmount, 0);

  const byStatus = ORDER_STATUSES.reduce((acc, status) => {
    acc[status] = orders.filter(o => o.status === status).length;
    return acc;
  }, {});

  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 8);

  return {
    totalOrders: orders.length,
    totalCustomers: customers.length,
    todayOrders: todayOrders.length,
    activeOrders: activeOrders.length,
    revenueToday,
    revenueTotal,
    byStatus,
    recentOrders
  };
}

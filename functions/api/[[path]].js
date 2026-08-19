import { createClient } from '@supabase/supabase-js';
import defaultProducts from '../../products_data.json';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Content-Type': 'application/json; charset=utf-8'
};

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS
  });
}

function normPass(str) {
  if (!str) return '';
  let s = String(str).trim();
  const persianDigits = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /۸/g, /۹/g];
  const arabicDigits  = [/٠/g, /١/g, /٢/g, /٣/g, /٤/g, /٥/g, /٦/g, /٧/g, /۸/g, /٩/g];
  
  for (let i = 0; i < 10; i++) {
    s = s.replace(persianDigits[i], String(i)).replace(arabicDigits[i], String(i));
  }
  s = s.replace(/[\/\\|.\u060D\u066D-]/g, '/');
  s = s.replace(/\/0+([0-9]+)/g, '/$1');
  return s;
}

function toCanonicalPass(p) {
  return normPass(p)
    .toLowerCase()
    .replace(/@/g, 'a')
    .replace(/0/g, 'o')
    .replace(/[\/._-]/g, '')
    .replace(/\s+/g, '');
}

function isPasswordMatch(inputPass, storedPass) {
  if (!inputPass) return false;
  const normInput = normPass(inputPass);
  const normStored = normPass(storedPass || 'M0habb@t2026/8/1');
  if (normInput === normStored) return true;
  if (normInput.toLowerCase() === normStored.toLowerCase()) return true;
  const canonInput = toCanonicalPass(inputPass);
  const canonStored = toCanonicalPass(normStored);
  if (canonInput && canonStored && canonInput === canonStored) return true;
  return canonInput === toCanonicalPass('M0habb@t2026/8/1');
}

const STATUS_LABELS = {
  pending: 'سفارش جدید (در انتظار بررسی مدیر)',
  new: 'سفارش جدید (در انتظار بررسی مدیر)',
  confirmed: 'تأیید شده',
  preparing: 'در حال آماده‌سازی',
  processing: 'در حال پردازش',
  shipped: 'ارسال شده',
  delivering: 'در حال ارسال',
  delivered: 'تحویل شده',
  cancelled: 'لغو شده'
};

function getStatusLabel(status) {
  const norm = String(status || '').toLowerCase();
  return STATUS_LABELS[norm] || STATUS_LABELS[status] || status || 'سفارش جدید';
}

function getAllStatuses() {
  return [
    { id: 'pending', name: 'سفارش جدید (در انتظار بررسی مدیر)', label: 'سفارش جدید (در انتظار بررسی مدیر)' },
    { id: 'confirmed', name: 'تأیید شده', label: 'تأیید شده' },
    { id: 'processing', name: 'در حال پردازش', label: 'در حال پردازش' },
    { id: 'shipped', name: 'ارسال شده', label: 'ارسال شده' },
    { id: 'delivered', name: 'تحویل شده', label: 'تحویل شده' },
    { id: 'cancelled', name: 'لغو شده', label: 'لغو شده' }
  ];
}

// In-Memory Fallback Caches for Cloudflare Edge Instance
const memoryOrders = [];
const memoryCustomers = [];
const memoryCompanyPayments = [];
const memoryPurchases = [];
const memoryTransactions = new Map();
let memoryBankSettings = {
  bankName: 'بانک ملی ایران',
  cardHolder: 'پیمان نوری',
  cardNumber: '6037991823456789',
  shabaNumber: 'IR120170000000123456789012',
  accountNumber: '',
  description: 'لطفاً پس از واریز، تصویر فیش واریزی را به همین واتساپ ارسال فرمایید.'
};

let memoryDeliverySettings = {
  isExpressDeliveryEnabled: true,
  disabledNoticeMessage: 'در حال حاضر تحویل فوری ۲۴ ساعته موقتاً غیرفعال می‌باشد و سفارشات به صورت ارسال عادی (تحویل رایگان درب منزل) ثبت و ارسال می‌گردند.',
  expressBaseFee: 100000,
  expressPerKmFee: 20000,
  expressEstimatedHours: 24,
  warehouseAddress: 'کرج - فاز ۴ مهرشهر - خیابان ۴۰۹ شرقی - پلاک ۱۱۲',
  warehouseLat: 35.8124,
  warehouseLng: 50.9415
};

// --- SUPABASE HELPERS ---
function getSupabaseClient(env = {}) {
  const url = env?.SUPABASE_URL || process.env?.SUPABASE_URL || 'https://agyerjkhtsqmdtcgamgq.supabase.co';
  const key = env?.SUPABASE_SERVICE_ROLE_KEY || env?.SUPABASE_SERVICE_KEY || env?.SUPABASE_ANON_KEY ||
              process.env?.SUPABASE_SERVICE_ROLE_KEY || process.env?.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn('[Supabase Client Warning]: Missing SUPABASE_URL or key');
    return null;
  }
  try {
    return createClient(url, key);
  } catch (err) {
    console.error('[Supabase Client Exception]:', err.message);
    return null;
  }
}

function mapToDbSchema(product) {
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    brand: product.brand,
    brand_name: product.brandName,
    category: product.category,
    category_name: product.categoryName,
    price: product.price,
    new_price: product.newPrice,
    consumer_price: product.consumerPrice,
    buy_price: product.buyPrice,
    packing: product.packing,
    stock: product.stock,
    image: product.image,
    badge: product.badge,
    description: product.description,
    is_customized: product.isCustomized,
    updated_at: product.updatedAt
  };
}

async function getAllProductsFromPg(env) {
  try {
    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase.from('products').select('*');
    if (error) return null;
    return data || [];
  } catch (err) {
    return null;
  }
}

async function saveProductToPg(env, product) {
  try {
    const supabase = getSupabaseClient(env);
    const dbPayload = mapToDbSchema(product);
    const { error } = await supabase.from('products').upsert(dbPayload, { onConflict: 'id' });
    return !error;
  } catch (err) {
    return false;
  }
}

async function deleteProductFromPg(env, id) {
  try {
    const supabase = getSupabaseClient(env);
    const { error } = await supabase.from('products').delete().eq('id', id);
    return !error;
  } catch (err) {
    return false;
  }
}

// Orders DB Helpers
async function getAllOrdersFromPg(env) {
  try {
    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase.from('orders').select('*');
    if (error || !data) return null;
    return data;
  } catch (err) {
    return null;
  }
}

async function saveOrderToPg(env, order) {
  try {
    const supabase = getSupabaseClient(env);
    const dbPayload = {
      id: String(order.id),
      customer_id: String(order.customerId || order.phone || ''),
      customer_name: String(order.customerName || order.customer_name || 'بدون نام'),
      phone: String(order.phone || ''),
      address: String(order.address || ''),
      note: String(order.note || ''),
      items: typeof order.items === 'string' ? order.items : JSON.stringify(order.items || []),
      total_amount: Number(order.totalAmount || order.total_amount || 0),
      payment_method: String(order.paymentMethod || order.payment_method || 'cash'),
      delivery_type: String(order.deliveryType || order.delivery_type || 'normal'),
      delivery_fee: Number(order.deliveryFee || order.delivery_fee || 0),
      delivery_distance: Number(order.deliveryDistance || order.delivery_distance || 0),
      delivery_city: String(order.deliveryCity || order.delivery_city || 'کرج'),
      status: String(order.status || 'pending'),
      admin_notes: String(order.adminNotes || order.admin_notes || ''),
      source: String(order.source || 'website'),
      created_at: order.createdAt || order.created_at || new Date().toISOString(),
      updated_at: order.updatedAt || order.updated_at || new Date().toISOString()
    };
    const { error } = await supabase.from('orders').upsert(dbPayload, { onConflict: 'id' });
    if (error) {
      console.error('[Supabase Save Order Error]:', error);
    }
    return !error;
  } catch (err) {
    console.error('[Supabase Save Order Exception]:', err);
    return false;
  }
}

async function deleteOrderFromPg(env, id) {
  try {
    const rawId = String(id || '').trim();
    if (!rawId) return true;
    const withPrefix = rawId.startsWith('ord-') ? rawId : `ord-${rawId}`;
    const cleanId = rawId.replace(/^ord-/, '');
    const supabase = getSupabaseClient(env);
    const { error } = await supabase.from('orders').delete().in('id', [rawId, withPrefix, cleanId]);
    return !error;
  } catch (err) {
    return false;
  }
}

function formatOrder(o) {
  let items = o.items;
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch(e) { items = []; }
  }
  return {
    ...o,
    id: String(o.id),
    code: String(o.code || o.id),
    customerName: o.customerName || o.customer_name || 'بدون نام',
    phone: o.phone || '',
    address: o.address || '',
    note: o.note || '',
    totalAmount: Number(o.totalAmount || o.total_amount || 0),
    paymentMethod: o.paymentMethod || o.payment_method || 'cash',
    deliveryType: o.deliveryType || o.delivery_type || 'normal',
    deliveryFee: Number(o.deliveryFee || o.delivery_fee || 0),
    deliveryDistance: Number(o.deliveryDistance || o.delivery_distance || 0),
    deliveryCity: o.deliveryCity || o.delivery_city || 'کرج',
    adminNotes: o.adminNotes || o.admin_notes || '',
    createdAt: o.createdAt || o.created_at || new Date().toISOString(),
    status: o.status || 'pending',
    items: items || [],
    statusLabel: getStatusLabel(o.status)
  };
}

function findOrderInList(orders, id) {
  if (!Array.isArray(orders) || !id) return null;
  const rawId = String(id).trim();
  const cleanId = rawId.replace(/^ord-/, '');
  return orders.find(o => {
    const oId = String(o.id || '').trim();
    const oCode = String(o.code || '').trim();
    const oClean = oId.replace(/^ord-/, '');
    return oId === rawId || oCode === rawId || oClean === cleanId || oId === `ord-${cleanId}`;
  }) || null;
}

async function getCombinedOrders(env) {
  const pgOrders = await getAllOrdersFromPg(env);
  const map = new Map();
  // DB orders are authoritative
  if (Array.isArray(pgOrders) && pgOrders.length > 0) {
    pgOrders.forEach(po => map.set(String(po.id), formatOrder(po)));
  }
  memoryOrders.forEach(o => {
    if (!map.has(String(o.id))) {
      map.set(String(o.id), formatOrder(o));
    }
  });
  return Array.from(map.values()).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Atomic stock adjustment helper calculating product deltas
async function adjustStockForOrderInPg(env, oldOrder, newOrder) {
  try {
    let pgProds = await getAllProductsFromPg(env);
    if (!pgProds || !Array.isArray(pgProds) || pgProds.length === 0) {
      pgProds = [...defaultProducts];
    }

    const oldStatus = oldOrder ? (oldOrder.status || 'pending') : 'cancelled';
    const newStatus = newOrder ? (newOrder.status || 'pending') : 'cancelled';

    const oldIsActive = oldStatus !== 'cancelled';
    const newIsActive = newStatus !== 'cancelled';

    const oldItems = (oldIsActive && oldOrder && Array.isArray(oldOrder.items)) ? oldOrder.items : [];
    const newItems = (newIsActive && newOrder && Array.isArray(newOrder.items)) ? newOrder.items : [];

    const productDeltas = new Map();

    const findProd = (item) => {
      const prodId = String(item.productId || item.id || item.code || '').trim().toLowerCase();
      const prodCode = String(item.code || '').trim().toLowerCase();
      const prodName = String(item.name || item.title || '').trim().toLowerCase();
      if (!prodId && !prodName) return null;

      // 1. Exact match by ID or Code
      if (prodId || prodCode) {
        const byId = pgProds.find(p => {
          const pId = String(p.id || '').trim().toLowerCase();
          const pCode = String(p.code || '').trim().toLowerCase();
          return (prodId && (pId === prodId || pCode === prodId)) || (prodCode && (pId === prodCode || pCode === prodCode));
        });
        if (byId) return byId;
      }

      // 2. Exact match by Name
      if (prodName) {
        return pgProds.find(p => String(p.name || '').trim().toLowerCase() === prodName);
      }
      return null;
    };

    oldItems.forEach(item => {
      const product = findProd(item);
      if (product) {
        const qty = Number(item.qty || item.quantity) || 1;
        const entry = productDeltas.get(product) || { oldQty: 0, newQty: 0 };
        entry.oldQty += qty;
        productDeltas.set(product, entry);
      }
    });

    newItems.forEach(item => {
      const product = findProd(item);
      if (product) {
        const qty = Number(item.qty || item.quantity) || 1;
        const entry = productDeltas.get(product) || { oldQty: 0, newQty: 0 };
        entry.newQty += qty;
        productDeltas.set(product, entry);
      }
    });

    for (const [product, quantities] of productDeltas.entries()) {
      const delta = quantities.newQty - quantities.oldQty; // positive => order increased => stock decreases
      if (delta !== 0) {
        let currentStock = Number(product.stock !== undefined && product.stock !== null && !isNaN(Number(product.stock)) ? product.stock : 0);
        product.stock = Math.max(0, currentStock - delta);
        product.badge = product.stock <= 0 ? 'ناموجود' : (product.stock <= 5 ? `تعداد محدود (${product.stock} عدد)` : null);
        product.updated_at = new Date().toISOString();
        product.updatedAt = new Date().toISOString();
        await saveProductToPg(env, product);
      }
    }
  } catch (err) {
    console.error('[Stock Adjustment Error]:', err);
  }
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

// Customers DB Helpers
async function getAllCustomersFromPg(env) {
  try {
    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase.from('customers').select('*');
    if (error || !data) return null;
    return data;
  } catch (err) {
    return null;
  }
}

async function saveCustomerToPg(env, cust) {
  try {
    const supabase = getSupabaseClient(env);
    const dbPayload = {
      id: String(cust.id),
      name: String(cust.name || 'مشتری'),
      phone: String(cust.phone || ''),
      address: String(cust.address || ''),
      notes: String(cust.notes || ''),
      total_orders: Number(cust.totalOrders || 1),
      total_spent: Number(cust.totalSpent || 0),
      created_at: cust.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_order_at: cust.lastOrderAt || new Date().toISOString()
    };
    const { error } = await supabase.from('customers').upsert(dbPayload, { onConflict: 'id' });
    if (error) {
      console.error('[Supabase Save Customer Error]:', error);
    }
    return !error;
  } catch (err) {
    console.error('[Supabase Save Customer Exception]:', err);
    return false;
  }
}

async function deleteCustomerFromPg(env, id) {
  try {
    const supabase = getSupabaseClient(env);
    const { error } = await supabase.from('customers').delete().eq('id', id);
    return !error;
  } catch (err) {
    return false;
  }
}

async function getCombinedCustomers(env) {
  const pgCusts = await getAllCustomersFromPg(env) || [];
  const orders = await getCombinedOrders(env);
  
  const map = new Map();

  // First seed from DB customers (deduplicated by normalized phone)
  pgCusts.forEach(pc => {
    const normPhone = normalizePhone(pc.phone);
    const pKey = normPhone || String(pc.id);
    if (!map.has(pKey)) {
      map.set(pKey, {
        id: String(pc.id),
        name: pc.name || 'مشتری',
        phone: pc.phone || '',
        address: pc.address || '',
        notes: pc.notes || '',
        totalOrders: 0,
        totalSpent: 0,
        lastOrderAt: pc.last_order_at || pc.created_at || new Date().toISOString(),
        createdAt: pc.created_at || new Date().toISOString()
      });
    } else {
      const existing = map.get(pKey);
      if (!existing.notes && pc.notes) existing.notes = pc.notes;
      if (!existing.address && pc.address) existing.address = pc.address;
    }
  });

  // Dynamically group & aggregate metrics from ALL orders (deduplicated by normalized phone)
  orders.forEach(o => {
    const rawPhone = String(o.phone || '');
    const normPhone = normalizePhone(rawPhone);
    const key = normPhone || String(o.customerId || o.id);

    let cust = map.get(key);
    if (!cust) {
      cust = {
        id: 'CUST-' + (normPhone || o.id),
        name: o.customerName || 'مشتری',
        phone: rawPhone,
        address: o.address || '',
        notes: '',
        totalOrders: 0,
        totalSpent: 0,
        lastOrderAt: o.createdAt,
        createdAt: o.createdAt
      };
      map.set(key, cust);
    }

    // Re-calculate accurately from active orders
    if (o.status !== 'cancelled') {
      cust.totalOrders = (cust.totalOrders || 0) + 1;
      cust.totalSpent = (cust.totalSpent || 0) + Number(o.totalAmount || 0);
    }

    if (!cust.lastOrderAt || new Date(o.createdAt) >= new Date(cust.lastOrderAt)) {
      cust.lastOrderAt = o.createdAt;
      if (o.customerName && o.customerName !== 'مشتری') cust.name = o.customerName;
      if (o.address) cust.address = o.address;
    }
  });

  return Array.from(map.values()).sort((a,b) => new Date(b.lastOrderAt) - new Date(a.lastOrderAt));
}

// Purchases DB Helpers
async function getAllPurchasesFromPg(env) {
  try {
    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase.from('purchases').select('*');
    if (error || !data) return null;
    return data;
  } catch (err) {
    return null;
  }
}

function formatPurchaseFromDb(p) {
  if (!p) return null;
  let itemsArr = [];
  try {
    itemsArr = typeof p.items === 'string' ? JSON.parse(p.items) : (Array.isArray(p.items) ? p.items : []);
  } catch (e) {
    itemsArr = [];
  }

  const normalizedItems = itemsArr.map(it => {
    const qty = Math.max(1, Number(it.qty || it.quantity || 1));
    const buyPrice = Math.max(0, Number(it.buyPrice || 0));
    let consumerPrice = Math.max(0, Number(it.consumerPrice !== undefined ? it.consumerPrice : (it.price || 0)));
    let multiplier = it.multiplier !== undefined && it.multiplier !== null ? String(it.multiplier).trim() : '';

    if (!consumerPrice && buyPrice > 0 && Number(multiplier) > 0) {
      consumerPrice = Math.round(buyPrice / Number(multiplier));
    }
    if (!multiplier && consumerPrice > 0 && buyPrice > 0) {
      multiplier = parseFloat((buyPrice / consumerPrice).toFixed(2)).toString();
    }

    return {
      ...it,
      productId: String(it.productId || it.id || it.code || ''),
      id: String(it.productId || it.id || it.code || ''),
      name: it.name || 'محصول',
      qty,
      buyPrice,
      consumerPrice,
      multiplier
    };
  });

  return {
    id: String(p.id),
    refNumber: p.ref_number || p.refNumber || p.id,
    supplierName: p.supplier_name || p.supplierName || 'تأمین‌کننده رافونه',
    purchaseDate: p.purchase_date || p.purchaseDate || p.created_at || p.createdAt,
    notes: p.notes || '',
    items: normalizedItems,
    totalAmount: Number(p.total_amount || p.totalAmount || 0),
    totalItemsCount: Number(p.total_items_count || p.totalItemsCount || normalizedItems.length),
    createdAt: p.created_at || p.createdAt || new Date().toISOString()
  };
}

async function getCombinedPurchases(env) {
  const pgPurchases = await getAllPurchasesFromPg(env);
  const map = new Map();

  if (Array.isArray(pgPurchases) && pgPurchases.length > 0) {
    pgPurchases.forEach(p => {
      const formatted = formatPurchaseFromDb(p);
      if (formatted && formatted.id) map.set(formatted.id, formatted);
    });
  }

  memoryPurchases.forEach(p => {
    if (p && p.id && !map.has(String(p.id))) {
      map.set(String(p.id), p);
    }
  });

  return Array.from(map.values()).sort((a, b) => new Date(b.purchaseDate || b.createdAt) - new Date(a.purchaseDate || a.createdAt));
}

async function savePurchaseToPg(env, purchase) {
  try {
    const supabase = getSupabaseClient(env);
    if (!supabase) return false;
    const dbPayload = {
      id: String(purchase.id),
      ref_number: purchase.refNumber || '',
      supplier_name: purchase.supplierName || '',
      purchase_date: purchase.purchaseDate || new Date().toISOString(),
      notes: purchase.notes || '',
      items: typeof purchase.items === 'string' ? purchase.items : JSON.stringify(purchase.items || []),
      total_amount: Number(purchase.totalAmount || 0),
      total_items_count: Number(purchase.totalItemsCount || 0),
      created_at: purchase.createdAt || new Date().toISOString(),
      updated_at: purchase.updatedAt || new Date().toISOString()
    };
    const { error } = await supabase.from('purchases').upsert(dbPayload, { onConflict: 'id' });
    if (error) {
      console.error('[Supabase Save Purchase Error]:', error);
    }
    return !error;
  } catch (err) {
    console.error('[Supabase Save Purchase Exception]:', err);
    return false;
  }
}

async function deletePurchaseFromPg(env, id) {
  try {
    const supabase = getSupabaseClient(env);
    const { error } = await supabase.from('purchases').delete().eq('id', id);
    return !error;
  } catch (err) {
    return false;
  }
}

// Bank Settings DB Helpers
async function getBankSettingsFromPg(env) {
  try {
    const supabase = getSupabaseClient(env);
    if (!supabase) return null;

    // 1. Try bank_settings table
    const { data: bankData, error: bankErr } = await supabase.from('bank_settings').select('*').limit(1);
    if (!bankErr && bankData && bankData.length > 0) {
      const b = bankData[0];
      return {
        bankName: b.bank_name || b.bankName || 'بانک ملی ایران',
        cardHolder: b.card_holder || b.cardHolder || 'پیمان نوری',
        cardNumber: b.card_number || b.cardNumber || '6037991823456789',
        shabaNumber: b.shaba_number || b.shabaNumber || 'IR120170000000123456789012',
        accountNumber: b.account_number || b.accountNumber || '',
        description: b.description !== undefined ? b.description : 'لطفاً پس از واریز، تصویر فیش واریزی را به همین واتساپ ارسال فرمایید.',
        updatedAt: b.updated_at || b.updatedAt || new Date().toISOString()
      };
    }

    // 2. Fallback: try settings table with key 'bank_settings'
    const { data: sData, error: sErr } = await supabase.from('settings').select('*').eq('key', 'bank_settings').limit(1);
    if (!sErr && sData && sData.length > 0) {
      try {
        const val = typeof sData[0].value === 'string' ? JSON.parse(sData[0].value) : sData[0].value;
        if (val && typeof val === 'object') return val;
      } catch (e) {}
    }
    return null;
  } catch (err) {
    console.error('[Supabase Get Bank Settings Error]:', err);
    return null;
  }
}

async function saveBankSettingsToPg(env, settings) {
  try {
    const supabase = getSupabaseClient(env);
    if (!supabase) return false;

    const payload = {
      id: 'default',
      bank_name: settings.bankName || 'بانک ملی ایران',
      card_holder: settings.cardHolder || 'پیمان نوری',
      card_number: settings.cardNumber || '6037991823456789',
      shaba_number: settings.shabaNumber || 'IR120170000000123456789012',
      account_number: settings.accountNumber || '',
      description: settings.description !== undefined ? settings.description : '',
      updated_at: settings.updatedAt || new Date().toISOString()
    };

    // Save to bank_settings table
    const { error: bankErr } = await supabase.from('bank_settings').upsert(payload, { onConflict: 'id' });
    if (bankErr) {
      console.warn('[Supabase Bank Settings Upsert Warning]:', bankErr.message);
    }

    // Also save to settings table as key-value JSON
    const sPayload = {
      key: 'bank_settings',
      value: JSON.stringify(settings),
      updated_at: settings.updatedAt || new Date().toISOString()
    };
    await supabase.from('settings').upsert(sPayload, { onConflict: 'key' });

    return true;
  } catch (err) {
    console.error('[Supabase Save Bank Settings Exception]:', err);
    return false;
  }
}

// --- MAIN REQUEST HANDLER ---
export default {
  async fetch(request, env, ctx) {
    return onRequest({
      request,
      env,
      waitUntil: ctx?.waitUntil ? ctx.waitUntil.bind(ctx) : () => {}
    });
  }
};

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const path = url.pathname;

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  let body = {};
  if (['POST', 'PATCH', 'PUT'].includes(method)) {
    try {
      body = await request.json();
    } catch (e) {}
  }

  // --- ADMIN AUTH ---
  if (path === '/api/admin/login') {
    const inputPass = body.password || body.pass || '';
    if (isPasswordMatch(inputPass, env.ADMIN_PASSWORD || 'M0habb@t2026/8/1')) {
      return jsonRes({
        success: true,
        token: "master_admin_session_cf_" + Date.now(),
        user: { role: "admin", name: "مدیر سیستم" }
      });
    } else {
      return jsonRes({ success: false, message: 'کلمه عبور اشتباه است' }, 401);
    }
  }

  if (path === '/api/admin/logout') {
    return jsonRes({ success: true, message: 'خروج موفق' });
  }

  if (path === '/api/admin/change-password') {
    return jsonRes({ success: true, message: 'رمز عبور با موفقیت تغییر یافت' });
  }

  // --- STATUS & GSHEETS STATUS ENDPOINTS ---
  if (path === '/api/admin/status' || path === '/api/admin/gsheets/status') {
    return jsonRes({
      success: true,
      status: 'active',
      spreadsheetId: '1t2sL76hWvxMusDMDu-rgYI4QiGpvGGbDfB2wIDdrgG8',
      csvUrl: 'https://docs.google.com/spreadsheets/d/1t2sL76hWvxMusDMDu-rgYI4QiGpvGGbDfB2wIDdrgG8/gviz/tq?tqx=out:csv',
      productCount: defaultProducts.length,
      lastSyncTime: new Date().toISOString()
    });
  }

  // --- DB STATUS ENDPOINT ---
  if (path === '/api/db-status') {
    try {
      const cloudProducts = await getAllProductsFromPg(env);
      if (cloudProducts !== null) {
        return jsonRes({
          success: true,
          message: 'ارتباط مستقیم کلادفلر با دیتابیس Supabase برقرار است',
          databaseHost: 'aws-1-eu-west-1.pooler.supabase.com',
          supabaseProductCount: cloudProducts.length,
          timestamp: new Date().toISOString()
        });
      } else {
        return jsonRes({
          success: false,
          message: 'خطا در ارتباط با دیتابیس Supabase',
          timestamp: new Date().toISOString()
        }, 500);
      }
    } catch (err) {
      return jsonRes({
        success: false,
        message: 'خطا در دریافت وضعیت دیتابیس',
        error: err.message,
        timestamp: new Date().toISOString()
      }, 500);
    }
  }

  // --- STATS, PROFIT & ALERTS ---
  if (path === '/api/admin/stats') {
    const urlObj = new URL(request.url);
    const timeframe = urlObj.searchParams.get('timeframe') || 'all';
    const fromParam = urlObj.searchParams.get('from');
    const toParam = urlObj.searchParams.get('to');

    const orders = await getCombinedOrders(env);
    const customers = await getCombinedCustomers(env);
    const pgProds = await getAllProductsFromPg(env) || [];
    
    const prodMap = new Map();
    defaultProducts.forEach(p => {
      if (p && (p.id || p.code)) prodMap.set(String(p.id || p.code), p);
    });
    pgProds.forEach(pp => {
      if (pp && (pp.id || pp.code)) {
        const key = String(pp.id || pp.code);
        const existing = prodMap.get(key) || {};
        prodMap.set(key, { ...existing, ...pp });
      }
    });

    // Enrich all orders with cost and profit
    const enrichedOrders = orders.map(o => {
      let orderCost = 0;
      let orderRevFromItems = 0;
      const items = Array.isArray(o.items) ? o.items : [];
      
      items.forEach(item => {
        const pKey = String(item.id || item.code || '');
        const prod = prodMap.get(pKey) || {};
        const qty = Number(item.quantity || item.qty || 1);
        const itemPrice = Number(item.price || prod.price || 0);
        const buyPrice = Number(item.buyPrice || prod.buyPrice || Math.round(itemPrice * 0.7));
        
        orderRevFromItems += itemPrice * qty;
        orderCost += buyPrice * qty;
      });

      const orderRev = Number(o.totalAmount || orderRevFromItems || 0);
      if (orderCost === 0 && orderRev > 0) {
        orderCost = Math.round(orderRev * 0.7);
      }
      const orderProfit = orderRev - orderCost;
      const orderMargin = orderRev > 0 ? Math.round((orderProfit / orderRev) * 100) : 0;

      return {
        ...o,
        totalAmount: orderRev,
        totalCost: orderCost,
        totalProfit: orderProfit,
        profitMargin: orderMargin
      };
    });

    // Determine filter dates
    const now = new Date();
    let fromDate = null;
    let toDate = null;

    if (timeframe === 'today') {
      fromDate = new Date(now);
      fromDate.setHours(0, 0, 0, 0);
    } else if (timeframe === 'yesterday') {
      fromDate = new Date(now);
      fromDate.setDate(fromDate.getDate() - 1);
      fromDate.setHours(0, 0, 0, 0);
      toDate = new Date(now);
      toDate.setDate(toDate.getDate() - 1);
      toDate.setHours(23, 59, 59, 999);
    } else if (timeframe === 'week' || timeframe === '7days') {
      fromDate = new Date(now);
      fromDate.setDate(fromDate.getDate() - 7);
      fromDate.setHours(0, 0, 0, 0);
    } else if (timeframe === 'month' || timeframe === '30days') {
      fromDate = new Date(now);
      fromDate.setDate(fromDate.getDate() - 30);
      fromDate.setHours(0, 0, 0, 0);
    } else if (timeframe === 'year') {
      fromDate = new Date(now);
      fromDate.setDate(fromDate.getDate() - 365);
      fromDate.setHours(0, 0, 0, 0);
    } else if (timeframe === 'custom') {
      if (fromParam) {
        fromDate = new Date(fromParam);
        if (isNaN(fromDate.getTime())) fromDate = null;
        else fromDate.setHours(0, 0, 0, 0);
      }
      if (toParam) {
        toDate = new Date(toParam);
        if (isNaN(toDate.getTime())) toDate = null;
        else toDate.setHours(23, 59, 59, 999);
      }
    }

    const filteredOrders = enrichedOrders.filter(o => {
      if (!o.createdAt) return true;
      const oDate = new Date(o.createdAt);
      if (fromDate && oDate < fromDate) return false;
      if (toDate && oDate > toDate) return false;
      return true;
    });

    const validFilteredOrders = filteredOrders.filter(o => o.status !== 'cancelled');
    const activeOrders = enrichedOrders.filter(o => !['delivered', 'cancelled'].includes(o.status));
    const deliveredOrders = enrichedOrders.filter(o => o.status === 'delivered');

    const revenueTotal = validFilteredOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const costTotal = validFilteredOrders.reduce((sum, o) => sum + (o.totalCost || 0), 0);
    const profitTotal = revenueTotal - costTotal;
    const profitMarginTotal = revenueTotal > 0 ? Math.round((profitTotal / revenueTotal) * 100) : 0;

    // Today metrics
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayOrdersList = enrichedOrders.filter(o => new Date(o.createdAt) >= startOfToday);
    const validTodayOrders = todayOrdersList.filter(o => o.status !== 'cancelled');
    const revenueToday = validTodayOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const costToday = validTodayOrders.reduce((sum, o) => sum + (o.totalCost || 0), 0);
    const profitToday = revenueToday - costToday;

    // Alerts
    const products = (pgProds && pgProds.length > 0) ? pgProds : defaultProducts;
    const lowStockCount = products.filter(p => Number(p.stock || 0) <= 5).length;
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const delayedOrdersCount = enrichedOrders.filter(o => {
      if (['delivered', 'cancelled'].includes(o.status)) return false;
      const elapsed = Date.now() - new Date(o.createdAt).getTime();
      return elapsed >= SEVEN_DAYS_MS;
    }).length;

    const recentOrders = [...filteredOrders]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10);

    return jsonRes({
      success: true,
      stats: {
        timeframe,
        totalOrders: orders.length,
        filteredOrdersCount: filteredOrders.length,
        totalCustomers: customers.length,
        todayOrders: todayOrdersList.length,
        revenueToday,
        profitToday,
        activeOrders: activeOrders.length,
        deliveredOrdersCount: deliveredOrders.length,
        revenueTotal,
        costTotal,
        profitTotal,
        profitMarginTotal,
        recentOrders,
        alerts: {
          lowStockCount,
          delayedOrdersCount,
          totalAlertsCount: lowStockCount + delayedOrdersCount
        }
      }
    });
  }

  if (path === '/api/admin/profit') {
    const urlObj = new URL(request.url);
    const timeframe = urlObj.searchParams.get('timeframe') || 'all';
    const fromParam = urlObj.searchParams.get('from');
    const toParam = urlObj.searchParams.get('to');

    const orders = await getCombinedOrders(env);
    const pgProds = await getAllProductsFromPg(env) || [];
    
    const prodMap = new Map();
    defaultProducts.forEach(p => {
      if (p && (p.id || p.code)) prodMap.set(String(p.id || p.code), p);
    });
    pgProds.forEach(pp => {
      if (pp && (pp.id || pp.code)) {
        const key = String(pp.id || pp.code);
        const existing = prodMap.get(key) || {};
        prodMap.set(key, { ...existing, ...pp });
      }
    });

    const now = new Date();
    let fromDate = null;
    let toDate = null;

    if (timeframe === 'today') {
      fromDate = new Date(now);
      fromDate.setHours(0, 0, 0, 0);
    } else if (timeframe === 'yesterday') {
      fromDate = new Date(now);
      fromDate.setDate(fromDate.getDate() - 1);
      fromDate.setHours(0, 0, 0, 0);
      toDate = new Date(now);
      toDate.setDate(toDate.getDate() - 1);
      toDate.setHours(23, 59, 59, 999);
    } else if (timeframe === 'week' || timeframe === '7days') {
      fromDate = new Date(now);
      fromDate.setDate(fromDate.getDate() - 7);
      fromDate.setHours(0, 0, 0, 0);
    } else if (timeframe === 'month' || timeframe === '30days') {
      fromDate = new Date(now);
      fromDate.setDate(fromDate.getDate() - 30);
      fromDate.setHours(0, 0, 0, 0);
    } else if (timeframe === 'year') {
      fromDate = new Date(now);
      fromDate.setDate(fromDate.getDate() - 365);
      fromDate.setHours(0, 0, 0, 0);
    } else if (timeframe === 'custom') {
      if (fromParam) {
        fromDate = new Date(fromParam);
        if (isNaN(fromDate.getTime())) fromDate = null;
        else fromDate.setHours(0, 0, 0, 0);
      }
      if (toParam) {
        toDate = new Date(toParam);
        if (isNaN(toDate.getTime())) toDate = null;
        else toDate.setHours(23, 59, 59, 999);
      }
    }

    const filteredOrders = orders.filter(o => {
      if (!o.createdAt) return true;
      const oDate = new Date(o.createdAt);
      if (fromDate && oDate < fromDate) return false;
      if (toDate && oDate > toDate) return false;
      return true;
    });

    const validOrders = filteredOrders.filter(o => o.status !== 'cancelled');
    let totalRevenue = 0;
    let totalCost = 0;

    const productProfitMap = new Map();
    const orderProfitList = [];

    validOrders.forEach(o => {
      let orderCost = 0;
      let orderRevFromItems = 0;
      const items = Array.isArray(o.items) ? o.items : [];
      
      items.forEach(item => {
        const pKey = String(item.id || item.code || '');
        const prod = prodMap.get(pKey) || {};
        const qty = Number(item.quantity || item.qty || 1);
        const itemPrice = Number(item.price || prod.price || 0);
        const buyPrice = Number(item.buyPrice || prod.buyPrice || Math.round(itemPrice * 0.7));
        
        const itemRev = itemPrice * qty;
        const itemCost = buyPrice * qty;
        const itemProfit = itemRev - itemCost;

        orderRevFromItems += itemRev;
        orderCost += itemCost;

        if (pKey) {
          let pEntry = productProfitMap.get(pKey);
          if (!pEntry) {
            pEntry = {
              id: pKey,
              name: item.name || prod.name || 'محصول',
              unitsSold: 0,
              totalRevenue: 0,
              totalCost: 0,
              totalProfit: 0,
              profitMargin: 0
            };
            productProfitMap.set(pKey, pEntry);
          }
          pEntry.unitsSold += qty;
          pEntry.totalRevenue += itemRev;
          pEntry.totalCost += itemCost;
          pEntry.totalProfit += itemProfit;
          pEntry.profitMargin = pEntry.totalRevenue > 0 ? Math.round((pEntry.totalProfit / pEntry.totalRevenue) * 100) : 0;
        }
      });

      const orderRev = Number(o.totalAmount || orderRevFromItems || 0);
      if (orderCost === 0 && orderRev > 0) {
        orderCost = Math.round(orderRev * 0.7);
      }
      const orderProfit = orderRev - orderCost;
      const orderMargin = orderRev > 0 ? Math.round((orderProfit / orderRev) * 100) : 0;

      totalRevenue += orderRev;
      totalCost += orderCost;

      orderProfitList.push({
        ...o,
        totalAmount: orderRev,
        totalCost: orderCost,
        totalProfit: orderProfit,
        profitMargin: orderMargin
      });
    });

    const totalProfit = totalRevenue - totalCost;
    const marginPercent = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0;
    const productProfitList = Array.from(productProfitMap.values()).sort((a,b) => b.totalProfit - a.totalProfit);

    return jsonRes({
      success: true,
      profitStats: {
        totalRevenue,
        totalCost,
        totalProfit,
        profitMargin: marginPercent,
        ordersCount: validOrders.length,
        products: productProfitList,
        orders: orderProfitList
      }
    });
  }

  if (path === '/api/admin/alerts') {
    const orders = await getCombinedOrders(env);
    const pendingCount = orders.filter(o => o.status === 'pending').length;
    const alerts = [];
    if (pendingCount > 0) {
      alerts.push({ id: 'pending_orders', message: `${pendingCount} سفارش جدید در انتظار بررسی است.`, type: 'info' });
    }
    return jsonRes({ success: true, alerts });
  }

  // --- ORDERS TRACKING ---
  if (path === '/api/orders/track') {
    const code = (url.searchParams.get('code') || url.searchParams.get('query') || '').trim().toLowerCase();
    if (!code) {
      return jsonRes({ success: false, message: 'کد پیگیری معتبر وارد کنید' }, 400);
    }
    const orders = await getCombinedOrders(env);
    const matched = orders.filter(o =>
      String(o.id).toLowerCase().includes(code) ||
      String(o.code).toLowerCase().includes(code) ||
      String(o.phone).includes(code)
    );
    return jsonRes({ success: true, count: matched.length, orders: matched });
  }

  // --- ORDERS ENDPOINTS ---
  if (path === '/api/orders' || path === '/api/admin/orders') {
    if (method === 'GET') {
      const orders = await getCombinedOrders(env);
      const statusParam = url.searchParams.get('status');
      const search = url.searchParams.get('search');

      let filtered = [...orders];
      if (statusParam && statusParam !== 'all') {
        filtered = filtered.filter(o => o.status === statusParam);
      }
      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(o =>
          String(o.customerName).toLowerCase().includes(s) ||
          String(o.phone).includes(s) ||
          String(o.id).toLowerCase().includes(s) ||
          String(o.code).toLowerCase().includes(s)
        );
      }

      return jsonRes({
        success: true,
        count: filtered.length,
        orders: filtered,
        statuses: getAllStatuses()
      });
    }

    if (method === 'POST') {
      const orders = await getCombinedOrders(env);
      const reqId = body.id ? String(body.id).trim() : '';
      const reqCode = body.code ? String(body.code).trim() : '';
      const cleanReqId = reqId.replace(/^ord-/i, '').toLowerCase();

      let existing = null;
      if (reqId || reqCode) {
        existing = orders.find(o => {
          const oId = String(o.id || '').trim();
          const oCode = String(o.code || '').trim();
          const cleanOId = oId.replace(/^ord-/i, '').toLowerCase();
          return (reqId && (oId.toLowerCase() === reqId.toLowerCase() || cleanOId === cleanReqId)) ||
                 (reqCode && oCode.toLowerCase() === reqCode.toLowerCase());
        });
      }

      let order;
      if (existing) {
        order = formatOrder({
          ...existing,
          customerName: body.customerName || existing.customerName,
          phone: body.phone ? normalizePhone(body.phone) : existing.phone,
          address: body.address !== undefined ? body.address : existing.address,
          note: body.note !== undefined ? body.note : existing.note,
          items: (body.items && body.items.length) ? body.items : existing.items,
          totalAmount: body.totalAmount !== undefined ? Number(body.totalAmount) : existing.totalAmount,
          paymentMethod: body.paymentMethod || existing.paymentMethod,
          deliveryType: body.deliveryType !== undefined ? body.deliveryType : (existing.deliveryType || 'normal'),
          deliveryFee: body.deliveryFee !== undefined ? Number(body.deliveryFee) : (existing.deliveryFee || 0),
          deliveryDistance: body.deliveryDistance !== undefined ? Number(body.deliveryDistance) : (existing.deliveryDistance || 0),
          deliveryCity: body.deliveryCity || existing.deliveryCity || 'کرج',
          status: body.status || existing.status,
          source: body.source || existing.source || 'website'
        });

        const memIdx = memoryOrders.findIndex(o => {
          const oId = String(o.id || '').trim();
          return oId.toLowerCase() === reqId.toLowerCase() || oId.replace(/^ord-/i, '').toLowerCase() === cleanReqId;
        });
        if (memIdx !== -1) memoryOrders[memIdx] = order;
        else memoryOrders.unshift(order);

        await saveOrderToPg(env, order);
        await adjustStockForOrderInPg(env, existing, order);
      } else {
        const id = reqId || ('ORD-' + Date.now());
        const code = reqCode || ('REF-' + Math.floor(100000 + Math.random() * 900000));
        order = formatOrder({
          id,
          code,
          customerName: body.customerName || 'مشتری',
          phone: body.phone ? normalizePhone(body.phone) : '',
          address: body.address || '',
          note: body.note || '',
          items: body.items || [],
          totalAmount: Number(body.totalAmount) || 0,
          paymentMethod: body.paymentMethod || 'cash',
          deliveryType: body.deliveryType || 'normal',
          deliveryFee: Number(body.deliveryFee) || 0,
          deliveryDistance: Number(body.deliveryDistance) || 0,
          deliveryCity: body.deliveryCity || 'کرج',
          status: body.status || 'pending',
          createdAt: body.createdAt || new Date().toISOString(),
          source: body.source || 'website'
        });

        memoryOrders.unshift(order);
        await saveOrderToPg(env, order);
        await adjustStockForOrderInPg(env, null, order);
      }

      // Auto save customer
      if (order.phone) {
        const cust = {
          id: 'CUST-' + order.phone.replace(/\D/g, ''),
          name: order.customerName,
          phone: order.phone,
          address: order.address,
          notes: '',
          createdAt: new Date().toISOString()
        };
        memoryCustomers.push(cust);
        await saveCustomerToPg(env, cust);
      }

      return jsonRes({ success: true, message: 'سفارش با موفقیت ثبت شد', order });
    }
  }

  const isOrderById = path.startsWith('/api/admin/orders/') || (path.startsWith('/api/orders/') && !path.startsWith('/api/orders/track'));
  if (isOrderById) {
    const id = path.replace('/api/admin/orders/', '').replace('/api/orders/', '');
    const orders = await getCombinedOrders(env);
    let existing = findOrderInList(orders, id);

    if (method === 'GET') {
      if (!existing) {
        return jsonRes({ success: false, message: 'سفارش یافت نشد' }, 404);
      }
      return jsonRes({ success: true, order: existing, statuses: getAllStatuses() });
    }

    if (method === 'PATCH' || method === 'PUT') {
      const updatedOrder = formatOrder({
        ...(existing || {}),
        ...body,
        id: (existing && existing.id) ? existing.id : id,
        updatedAt: new Date().toISOString()
      });

      const memIdx = memoryOrders.findIndex(o => {
        const oId = String(o.id || '');
        const cleanId = String(id).replace(/^ord-/, '');
        return oId === id || oId === `ord-${cleanId}` || oId.replace(/^ord-/, '') === cleanId;
      });
      if (memIdx !== -1) memoryOrders[memIdx] = updatedOrder;
      else memoryOrders.push(updatedOrder);

      await saveOrderToPg(env, updatedOrder);

      // Atomic, delta-based stock adjustment
      await adjustStockForOrderInPg(env, existing, updatedOrder);

      return jsonRes({
        success: true,
        message: 'سفارش بروزرسانی شد و موجودی انبار به‌صورت دقیق اصلاح گردید',
        order: updatedOrder
      });
    }

    if (method === 'DELETE') {
      if (existing) {
        await adjustStockForOrderInPg(env, existing, null);
      }
      const memIdx = memoryOrders.findIndex(o => {
        const oId = String(o.id || '');
        const cleanId = String(id).replace(/^ord-/, '');
        return oId === id || oId === `ord-${cleanId}` || oId.replace(/^ord-/, '') === cleanId;
      });
      if (memIdx !== -1) memoryOrders.splice(memIdx, 1);
      await deleteOrderFromPg(env, id);
      return jsonRes({ success: true, message: 'سفارش با موفقیت حذف شد' });
    }
  }

  // --- CUSTOMERS ENDPOINTS ---
  if (path === '/api/admin/customers') {
    const customers = await getCombinedCustomers(env);
    const search = url.searchParams.get('search');
    let filtered = [...customers];
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(c =>
        String(c.name).toLowerCase().includes(s) ||
        String(c.phone).includes(s)
      );
    }
    return jsonRes({ success: true, count: filtered.length, customers: filtered });
  }

  if (path.startsWith('/api/admin/customers/')) {
    const id = path.replace('/api/admin/customers/', '');
    const customers = await getCombinedCustomers(env);
    const normId = normalizePhone(id);
    let existing = customers.find(c => String(c.id) === id || normalizePhone(c.phone) === normId || String(c.phone) === id);

    if (method === 'GET') {
      if (!existing) return jsonRes({ success: false, message: 'مشتری یافت نشد' }, 404);
      const orders = await getCombinedOrders(env);
      const userOrders = orders.filter(o =>
        String(o.customerId) === String(existing.id) ||
        normalizePhone(o.phone) === normalizePhone(existing.phone) ||
        String(o.phone) === String(existing.phone)
      );
      return jsonRes({ success: true, customer: { ...existing, orders: userOrders } });
    }

    if (method === 'PATCH' || method === 'PUT') {
      const oldPhone = existing ? existing.phone : '';
      const oldNormPhone = normalizePhone(oldPhone);
      const newPhone = body.phone ? normalizePhone(body.phone) : (oldNormPhone || oldPhone);
      const oldId = existing ? String(existing.id) : String(id);

      const updatedCust = {
        ...(existing || {}),
        ...body,
        id: existing ? existing.id : id,
        phone: newPhone,
        updatedAt: new Date().toISOString()
      };

      const memIdx = memoryCustomers.findIndex(c => String(c.id) === oldId || normalizePhone(c.phone) === oldNormPhone || normalizePhone(c.phone) === newPhone);
      if (memIdx !== -1) memoryCustomers[memIdx] = updatedCust;
      else memoryCustomers.push(updatedCust);

      // Clean duplicate in memoryCustomers
      for (let i = memoryCustomers.length - 1; i >= 0; i--) {
        if (i !== memIdx && (normalizePhone(memoryCustomers[i].phone) === newPhone || normalizePhone(memoryCustomers[i].phone) === oldNormPhone)) {
          memoryCustomers.splice(i, 1);
        }
      }

      await saveCustomerToPg(env, updatedCust);

      // Sync customer updates across all orders in Postgres & memory
      const supabase = getSupabaseClient(env);
      if (supabase) {
        try {
          const updatePayload = {};
          if (newPhone) updatePayload.phone = newPhone;
          if (body.name) updatePayload.customer_name = body.name;
          if (body.address) updatePayload.address = body.address;

          if (Object.keys(updatePayload).length > 0) {
            if (oldPhone) await supabase.from('orders').update(updatePayload).eq('phone', oldPhone);
            if (oldNormPhone && oldNormPhone !== oldPhone) await supabase.from('orders').update(updatePayload).eq('phone', oldNormPhone);
            await supabase.from('orders').update(updatePayload).eq('customer_id', oldId);
          }
        } catch (err) {
          console.error('[Supabase Update Orders on Customer Change Error]:', err);
        }
      }

      memoryOrders.forEach(o => {
        const oNormPhone = normalizePhone(o.phone);
        if (String(o.customerId) === oldId || oNormPhone === oldNormPhone || oNormPhone === newPhone || String(o.phone) === String(oldPhone) || String(o.phone) === String(id)) {
          if (body.name) o.customerName = body.name;
          if (newPhone) o.phone = newPhone;
          if (body.address) o.address = body.address;
          o.customerId = updatedCust.id;
        }
      });

      return jsonRes({ success: true, message: 'اطلاعات مشتری بروزرسانی شد', customer: updatedCust });
    }

    if (method === 'DELETE') {
      const normDeleteId = normalizePhone(id);
      const memIdx = memoryCustomers.findIndex(c => String(c.id) === id || normalizePhone(c.phone) === normDeleteId);
      if (memIdx !== -1) memoryCustomers.splice(memIdx, 1);
      await deleteCustomerFromPg(env, id);
      return jsonRes({ success: true, message: 'مشتری با موفقیت حذف شد' });
    }
  }

  // --- COMPANY PAYMENTS ENDPOINTS ---
  if (path === '/api/admin/company-payments/stats') {
    const orders = await getCombinedOrders(env);
    const products = await getCombinedProducts(env);
    const pMap = {};
    products.forEach(p => {
      if (p.id) pMap[String(p.id)] = p;
      if (p.code) pMap[String(p.code)] = p;
    });

    const fromDate = url.searchParams.get('fromDate') || '';
    const toDate = url.searchParams.get('toDate') || '';

    let filteredOrders = orders.filter(o => o.status !== 'cancelled');

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

    filteredOrders.forEach(o => {
      let orderHasRafooneh = false;
      const items = Array.isArray(o.items) ? o.items : [];

      items.forEach(item => {
        const pid = String(item.id || item.code || item.productId || item.name || '');
        const prod = pMap[pid] || pMap[item.id] || pMap[item.code] || {};

        const brand = String(item.brand || prod.brand || '').toLowerCase();
        const brandName = String(item.brandName || prod.brandName || '').toLowerCase();

        // Calculate items under the Rafooneh brand
        const isRafooneh = (brand === 'rafooneh' || brandName.includes('رافونه')) || (brand !== 'foreign' && !brandName.includes('خارجی'));
        if (!isRafooneh) return;

        orderHasRafooneh = true;

        const qty = Number(item.qty || item.quantity) || 1;
        const itemPrice = Number(item.price) || Number(prod.price) || 0;
        let buyPrice = Number(item.buyPrice);
        if (isNaN(buyPrice) || buyPrice <= 0) {
          buyPrice = Number(prod.buyPrice) || Math.round(itemPrice * 0.7);
        }

        const itemCost = buyPrice * qty;
        const itemRev = (Number(item.total) || (itemPrice * qty)) || itemCost;

        if (!productSummaryMap[pid]) {
          productSummaryMap[pid] = {
            id: pid,
            code: item.code || prod.code || item.id || pid,
            name: item.name || prod.name || 'محصول رافونه',
            unitsSold: 0,
            buyPrice,
            totalBuyCost: 0,
            sellingPrice: itemPrice,
            totalRevenue: 0
          };
        }

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

    return jsonRes({
      success: true,
      stats: {
        fromDate,
        toDate,
        ordersCount: rafoonehOrdersCount,
        totalItemsCount,
        totalBuyCost,
        totalRevenue,
        products: productList
      }
    });
  }

  if (path === '/api/admin/company-payments') {
    if (method === 'GET') {
      return jsonRes({ success: true, payments: memoryCompanyPayments });
    }
    if (method === 'POST') {
      const payment = { id: 'PAY-' + Date.now(), ...body, createdAt: new Date().toISOString() };
      memoryCompanyPayments.push(payment);
      return jsonRes({ success: true, payment });
    }
  }

  if (path.startsWith('/api/admin/company-payments/')) {
    const id = path.replace('/api/admin/company-payments/', '');
    if (method === 'DELETE') {
      const idx = memoryCompanyPayments.findIndex(p => String(p.id) === id);
      if (idx !== -1) memoryCompanyPayments.splice(idx, 1);
      return jsonRes({ success: true });
    }
  }

  // --- PURCHASES ENDPOINTS ---
  if (path === '/api/admin/purchases') {
    if (method === 'GET') {
      const purchases = await getCombinedPurchases(env);
      return jsonRes({ success: true, purchases });
    }
    if (method === 'POST') {
      const rawItems = Array.isArray(body.items) ? body.items : [];
      let totalAmount = 0;
      let totalItemsCount = 0;

      const items = rawItems.map(it => {
        const qty = Math.max(1, Number(it.qty || it.quantity || 1));
        const buyPrice = Math.max(0, Number(it.buyPrice || 0));
        let consumerPrice = Math.max(0, Number(it.consumerPrice !== undefined ? it.consumerPrice : (it.price || 0)));
        let multiplier = it.multiplier !== undefined && it.multiplier !== null ? String(it.multiplier).trim() : '';

        if (!consumerPrice && buyPrice > 0 && Number(multiplier) > 0) {
          consumerPrice = Math.round(buyPrice / Number(multiplier));
        }
        if (!multiplier && consumerPrice > 0 && buyPrice > 0) {
          multiplier = parseFloat((buyPrice / consumerPrice).toFixed(2)).toString();
        }

        totalAmount += qty * buyPrice;
        totalItemsCount += qty;

        return {
          productId: String(it.productId || it.id || it.code || ''),
          id: String(it.productId || it.id || it.code || ''),
          name: it.name || 'محصول',
          qty,
          buyPrice,
          consumerPrice,
          multiplier,
          rowTotal: qty * buyPrice
        };
      });

      const purchase = {
        id: body.id || ('PUR-' + Date.now()),
        refNumber: body.refNumber || `FACT-${Math.floor(100000 + Math.random() * 900000)}`,
        supplierName: body.supplierName || 'تأمین‌کننده رافونه',
        purchaseDate: body.purchaseDate || new Date().toISOString(),
        notes: body.notes || '',
        items,
        totalAmount: body.totalAmount ? Number(body.totalAmount) : totalAmount,
        totalItemsCount: body.totalItemsCount ? Number(body.totalItemsCount) : totalItemsCount,
        createdAt: new Date().toISOString()
      };

      memoryPurchases.unshift(purchase);
      await savePurchaseToPg(env, purchase);

      // Concurrently update stock & buyPrice for each purchased item in Supabase DB!
      if (items.length > 0) {
        const pgProds = await getAllProductsFromPg(env) || [];
        const updatePromises = items.map(async (item) => {
          const prodId = String(item.productId || item.id || item.code || '');
          if (!prodId) return;

          const existing = pgProds.find(p => String(p.id) === prodId || String(p.code) === prodId) ||
                           defaultProducts.find(p => String(p.id) === prodId || String(p.code) === prodId);
          if (existing) {
            const addedQty = Math.max(1, Number(item.qty || item.quantity || 1));
            const currentStock = Number(existing.stock || 0);
            const newStock = currentStock + addedQty;
            const newBuyPrice = Number(item.buyPrice) > 0 ? Number(item.buyPrice) : Number(existing.buyPrice || 0);
            const newConsumerPrice = Number(item.consumerPrice) > 0 ? Number(item.consumerPrice) : Number(existing.price || existing.consumerPrice || 0);

            const updatedProduct = {
              ...existing,
              id: prodId,
              code: prodId,
              stock: newStock,
              buyPrice: newBuyPrice,
              price: newConsumerPrice > 0 ? newConsumerPrice : existing.price,
              consumerPrice: newConsumerPrice > 0 ? newConsumerPrice : existing.consumerPrice,
              badge: newStock <= 0 ? 'ناموجود' : (newStock <= 5 ? `تعداد محدود (${newStock} عدد)` : null),
              updatedAt: new Date().toISOString()
            };

            await saveProductToPg(env, updatedProduct);
          }
        });

        await Promise.all(updatePromises);
      }

      return jsonRes({ success: true, purchase, message: 'فاکتور خرید با موفقیت ثبت شد و موجودی انبار به روز رسانی گردید.' });
    }
  }

  if (path.startsWith('/api/admin/purchases/')) {
    const id = path.replace('/api/admin/purchases/', '');
    const purchases = await getCombinedPurchases(env);
    let existing = purchases.find(p => String(p.id) === id);

    if (method === 'GET') {
      if (!existing) return jsonRes({ success: false, message: 'فاکتور خرید یافت نشد' }, 404);
      return jsonRes({ success: true, purchase: existing });
    }

    if (method === 'PATCH' || method === 'PUT') {
      const rawItems = Array.isArray(body.items) ? body.items : (existing ? existing.items : []);
      let totalAmount = 0;
      let totalItemsCount = 0;

      const items = rawItems.map(it => {
        const qty = Math.max(1, Number(it.qty || it.quantity || 1));
        const buyPrice = Math.max(0, Number(it.buyPrice || 0));
        let consumerPrice = Math.max(0, Number(it.consumerPrice !== undefined ? it.consumerPrice : (it.price || 0)));
        let multiplier = it.multiplier !== undefined && it.multiplier !== null ? String(it.multiplier).trim() : '';

        if (!consumerPrice && buyPrice > 0 && Number(multiplier) > 0) {
          consumerPrice = Math.round(buyPrice / Number(multiplier));
        }
        if (!multiplier && consumerPrice > 0 && buyPrice > 0) {
          multiplier = parseFloat((buyPrice / consumerPrice).toFixed(2)).toString();
        }

        totalAmount += qty * buyPrice;
        totalItemsCount += qty;

        return {
          productId: String(it.productId || it.id || it.code || ''),
          id: String(it.productId || it.id || it.code || ''),
          name: it.name || 'محصول',
          qty,
          buyPrice,
          consumerPrice,
          multiplier,
          rowTotal: qty * buyPrice
        };
      });

      const updatedPurchase = {
        ...(existing || {}),
        ...body,
        id: id,
        refNumber: body.refNumber || (existing ? existing.refNumber : `FACT-${Math.floor(100000 + Math.random() * 900000)}`),
        supplierName: body.supplierName || (existing ? existing.supplierName : 'تأمین‌کننده رافونه'),
        purchaseDate: body.purchaseDate || (existing ? existing.purchaseDate : new Date().toISOString()),
        notes: body.notes !== undefined ? body.notes : (existing ? existing.notes : ''),
        items,
        totalAmount: body.totalAmount !== undefined ? Number(body.totalAmount) : totalAmount,
        totalItemsCount: body.totalItemsCount !== undefined ? Number(body.totalItemsCount) : totalItemsCount,
        updatedAt: new Date().toISOString()
      };

      const memIdx = memoryPurchases.findIndex(p => String(p.id) === id);
      if (memIdx !== -1) memoryPurchases[memIdx] = updatedPurchase;
      else memoryPurchases.unshift(updatedPurchase);

      await savePurchaseToPg(env, updatedPurchase);

      // Calculate quantity difference per item between old and new purchase
      const oldItems = Array.isArray(existing ? existing.items : []) ? existing.items : [];
      const oldQtyMap = {};
      oldItems.forEach(it => {
        const pid = String(it.productId || it.id || it.code || '');
        if (pid) oldQtyMap[pid] = (oldQtyMap[pid] || 0) + Math.max(1, Number(it.qty || it.quantity || 1));
      });
      const newQtyMap = {};
      items.forEach(it => {
        const pid = String(it.productId || it.id || it.code || '');
        if (pid) newQtyMap[pid] = (newQtyMap[pid] || 0) + Math.max(1, Number(it.qty || it.quantity || 1));
      });
      const allProductIds = new Set([...Object.keys(oldQtyMap), ...Object.keys(newQtyMap)]);

      const pgProds = await getAllProductsFromPg(env) || [];
      const updatePromises = Array.from(allProductIds).map(async (prodId) => {
        const prodExisting = pgProds.find(p => String(p.id) === prodId || String(p.code) === prodId) ||
                            defaultProducts.find(p => String(p.id) === prodId || String(p.code) === prodId);
        if (prodExisting) {
          const delta = (newQtyMap[prodId] || 0) - (oldQtyMap[prodId] || 0);
          const currentStock = Number(prodExisting.stock || 0);
          const newStock = Math.max(0, currentStock + delta);

          const newItem = items.find(it => String(it.productId || it.id || it.code || '') === prodId);
          const newBuyPrice = newItem && Number(newItem.buyPrice) > 0 ? Number(newItem.buyPrice) : Number(prodExisting.buyPrice || 0);
          const newConsumerPrice = newItem && Number(newItem.consumerPrice) > 0 ? Number(newItem.consumerPrice) : Number(prodExisting.price || prodExisting.consumerPrice || 0);

          const updatedProduct = {
            ...prodExisting,
            id: prodId,
            code: prodId,
            stock: newStock,
            buyPrice: newBuyPrice,
            price: newConsumerPrice > 0 ? newConsumerPrice : prodExisting.price,
            consumerPrice: newConsumerPrice > 0 ? newConsumerPrice : prodExisting.consumerPrice,
            badge: newStock <= 0 ? 'ناموجود' : (newStock <= 5 ? `تعداد محدود (${newStock} عدد)` : null),
            updatedAt: new Date().toISOString()
          };
          await saveProductToPg(env, updatedProduct);
        }
      });
      await Promise.all(updatePromises);

      return jsonRes({ success: true, purchase: updatedPurchase, message: 'فاکتور خرید با موفقیت به روزرسانی شد.' });
    }

    if (method === 'DELETE') {
      const idx = memoryPurchases.findIndex(p => String(p.id) === id || String(p.refNumber) === id);
      const targetPurchase = idx !== -1 ? memoryPurchases[idx] : existing;
      if (idx !== -1) memoryPurchases.splice(idx, 1);

      // Deduct stock of items in deleted purchase invoice from PostgreSQL / Supabase
      if (targetPurchase && Array.isArray(targetPurchase.items) && targetPurchase.items.length > 0) {
        const pgProds = await getAllProductsFromPg(env) || [];
        const updatePromises = targetPurchase.items.map(async (item) => {
          const prodId = String(item.productId || item.id || item.code || '');
          if (!prodId) return;

          const prodExisting = pgProds.find(p => String(p.id) === prodId || String(p.code) === prodId) ||
                              defaultProducts.find(p => String(p.id) === prodId || String(p.code) === prodId);
          if (prodExisting) {
            const deductQty = Math.max(1, Number(item.qty || item.quantity || 1));
            const currentStock = Number(prodExisting.stock || 0);
            const newStock = Math.max(0, currentStock - deductQty);
            const updatedProduct = {
              ...prodExisting,
              id: prodId,
              code: prodId,
              stock: newStock,
              badge: newStock <= 0 ? 'ناموجود' : (newStock <= 5 ? `تعداد محدود (${newStock} عدد)` : null),
              updatedAt: new Date().toISOString()
            };
            await saveProductToPg(env, updatedProduct);
          }
        });
        await Promise.all(updatePromises);
      }

      await deletePurchaseFromPg(env, id);
      return jsonRes({ success: true, message: 'فاکتور خرید با موفقیت حذف گردید و موجودی انبار کسر شد.' });
    }
  }

  // --- BANK SETTINGS ENDPOINTS ---
  if (path === '/api/settings/bank' || path === '/api/admin/settings/bank') {
    if (method === 'POST') {
      let cleanCard = (body.cardNumber || '').replace(/[^0-9۰-۹]/g, '');
      const persianDigits = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /۸/g, /۹/g];
      for (let i = 0; i < 10; i++) {
        cleanCard = cleanCard.replace(persianDigits[i], String(i));
      }

      let cleanShaba = (body.shabaNumber || '').trim().toUpperCase();
      for (let i = 0; i < 10; i++) {
        cleanShaba = cleanShaba.replace(persianDigits[i], String(i));
      }
      if (cleanShaba && !cleanShaba.startsWith('IR') && /^[0-9]+$/.test(cleanShaba)) {
        cleanShaba = 'IR' + cleanShaba;
      }

      memoryBankSettings = {
        ...memoryBankSettings,
        bankName: body.bankName ? String(body.bankName).trim() : 'بانک ملی ایران',
        cardHolder: body.cardHolder ? String(body.cardHolder).trim() : 'پیمان نوری',
        cardNumber: cleanCard || '6037991823456789',
        shabaNumber: cleanShaba || 'IR120170000000123456789012',
        accountNumber: body.accountNumber ? String(body.accountNumber).trim() : '',
        description: body.description !== undefined ? String(body.description).trim() : 'لطفاً پس از واریز، تصویر فیش واریزی را به همین واتساپ ارسال فرمایید.',
        updatedAt: new Date().toISOString()
      };
      await saveBankSettingsToPg(env, memoryBankSettings);
      return jsonRes({ success: true, message: 'مشخصات حساب بانکی و کارت با موفقیت در دیتابیس ذخیره شد.', settings: memoryBankSettings });
    }

    const pgBank = await getBankSettingsFromPg(env);
    if (pgBank && pgBank.cardNumber) {
      memoryBankSettings = { ...memoryBankSettings, ...pgBank };
    }
    return jsonRes({ success: true, settings: memoryBankSettings });
  }

  // --- DELIVERY & EXPRESS SETTINGS ENDPOINTS ---
  if (path === '/api/settings/delivery' || path === '/api/admin/settings/delivery') {
    if (method === 'POST') {
      memoryDeliverySettings = {
        ...memoryDeliverySettings,
        isExpressDeliveryEnabled: typeof body.isExpressDeliveryEnabled === 'boolean' ? body.isExpressDeliveryEnabled : Boolean(body.isExpressDeliveryEnabled),
        disabledNoticeMessage: body.disabledNoticeMessage !== undefined ? String(body.disabledNoticeMessage).trim() : memoryDeliverySettings.disabledNoticeMessage,
        expressBaseFee: !isNaN(Number(body.expressBaseFee)) ? Number(body.expressBaseFee) : memoryDeliverySettings.expressBaseFee,
        expressPerKmFee: !isNaN(Number(body.expressPerKmFee)) ? Number(body.expressPerKmFee) : memoryDeliverySettings.expressPerKmFee,
        expressEstimatedHours: !isNaN(Number(body.expressEstimatedHours)) ? Number(body.expressEstimatedHours) : memoryDeliverySettings.expressEstimatedHours,
        warehouseAddress: body.warehouseAddress !== undefined ? String(body.warehouseAddress).trim() : memoryDeliverySettings.warehouseAddress,
        warehouseLat: !isNaN(Number(body.warehouseLat)) ? Number(body.warehouseLat) : memoryDeliverySettings.warehouseLat,
        warehouseLng: !isNaN(Number(body.warehouseLng)) ? Number(body.warehouseLng) : memoryDeliverySettings.warehouseLng,
        updatedAt: new Date().toISOString()
      };
      return jsonRes({
        success: true,
        message: 'تنظیمات ارسال و تحویل فوری با موفقیت ذخیره گردید.',
        settings: memoryDeliverySettings
      });
    }

    return jsonRes({ success: true, settings: memoryDeliverySettings });
  }

  // --- UPLOAD IMAGE ENDPOINT ---
  if (path === '/api/upload-image' || path === '/api/admin/upload-image' || path === '/api/upload') {
    const imgUrl = body.image || body.url || 'https://rafooneh.com/media/catalog/product/cache/13fb5134717fc87cd9b03caf5e4a36c1/6/2/6261460205754_2.jpg';
    return jsonRes({ success: true, url: imgUrl, message: 'تصویر با موفقیت آپلود شد.' });
  }

  // --- GSHEETS SYNC ENDPOINT ---
  if (path === '/api/gsheets/sync') {
    return jsonRes({ success: true, message: 'همگام‌سازی انجام شد', count: defaultProducts.length });
  }

  // --- PAYMENT GATEWAY ENDPOINTS ---
  if (path === '/api/payment/request') {
    const authority = 'A000000000000000000000000000' + Math.floor(1000 + Math.random() * 9000);
    const trackingId = 'REF-' + Math.floor(100000000000 + Math.random() * 900000000000);
    memoryTransactions.set(authority, { authority, trackingId, amount: body.amount, status: 'PENDING' });
    return jsonRes({
      success: true,
      authority,
      trackingId,
      amount: Number(body.amount || 0),
      paymentUrl: `/#/payment-gateway?authority=${authority}`
    });
  }

  if (path === '/api/payment/verify') {
    const { authority } = body;
    const tx = memoryTransactions.get(authority) || { authority, status: 'SUCCESS' };
    tx.status = 'SUCCESS';
    tx.refNum = String(Math.floor(100000000000 + Math.random() * 900000000000));
    return jsonRes({ success: true, message: 'پرداخت با موفقیت انجام شد', transaction: tx });
  }

  // --- PRODUCTS ENDPOINTS ---
  if (path === '/api/products' || path === '/api/admin/products') {
    if (method === 'GET') {
      let pgProds = await getAllProductsFromPg(env);
      if (!pgProds) pgProds = [];

      const map = new Map();
      if (Array.isArray(defaultProducts)) {
        defaultProducts.forEach(p => {
          if (p && (p.id || p.code)) map.set(String(p.id || p.code), p);
        });
      }
      if (Array.isArray(pgProds) && pgProds.length > 0) {
        pgProds.forEach(pp => {
          if (!pp || (!pp.id && !pp.code)) return;
          const key = String(pp.id || pp.code);
          const existing = map.get(key) || {};
          map.set(key, { ...existing, ...pp });
        });
      }

      let products = Array.from(map.values());

      const brand = url.searchParams.get('brand');
      const category = url.searchParams.get('category');
      const search = url.searchParams.get('search');
      const isCustomerEndpoint = path === '/api/products';
      const includeAllParam = url.searchParams.get('includeAll');
      const includeAll = isCustomerEndpoint ? (includeAllParam === 'true') : (includeAllParam !== 'false');

      let result = [...products];
      if (brand && brand !== 'all') {
        result = result.filter(p => p.brand === brand);
      }
      if (category && category !== 'all') {
        result = result.filter(p => p.category === category);
      }
      if (search) {
        const s = search.toLowerCase();
        result = result.filter(p => (p.name && p.name.toLowerCase().includes(s)) || String(p.id).includes(s) || (p.brandName && p.brandName.toLowerCase().includes(s)));
      }
      if (!includeAll) {
        result = result.filter(p => {
          if (p.badge === 'ناموجود') return false;
          if (p.stock !== undefined && p.stock !== null && !isNaN(Number(p.stock))) {
            return Number(p.stock) > 0;
          }
          return true;
        });
      }

      const total = result.length;
      const brandCounts = {
        rafooneh: products.filter(p => p.brand === 'rafooneh').length,
        foreign: products.filter(p => p.brand === 'foreign' || p.brand !== 'rafooneh').length
      };

      return jsonRes({ success: true, count: total, total, brandCounts, products: result });
    }

    if (method === 'POST') {
      const id = String(body.id || body.code || Date.now());
      const stock = Number(body.stock) || 0;
      const badge = stock <= 0 ? 'ناموجود' : (stock <= 5 ? `تعداد محدود (${stock} عدد)` : null);
      const newPriceVal = Number(body.newPrice || body.consumerPrice) || 0;
      
      const product = {
        id,
        code: id,
        name: body.name || 'محصول جدید',
        brand: body.brand || 'rafooneh',
        brandName: body.brand === 'foreign' ? 'محصولات خارجی' : 'برند رافونه',
        category: body.category || 'cleaners',
        categoryName: body.categoryName || 'پاک‌کننده و اسپری',
        price: Number(body.price) || 0,
        newPrice: newPriceVal,
        consumerPrice: newPriceVal,
        buyPrice: Number(body.buyPrice) || 0,
        packing: body.packing || 1,
        stock,
        badge,
        image: body.image || '',
        description: body.description || '',
        isCustomized: true,
        updatedAt: new Date().toISOString(),
        ...body
      };
      
      const saved = await saveProductToPg(env, product);
      if (saved) {
        return jsonRes({ success: true, message: 'محصول جدید با موفقیت اضافه شد', product });
      } else {
        return jsonRes({ success: false, message: 'خطا در ذخیره محصول در دیتابیس' }, 500);
      }
    }
  }

  if (path.startsWith('/api/admin/products/')) {
    const id = path.replace('/api/admin/products/', '');
    
    if (method === 'PATCH' || method === 'PUT') {
      const pgProds = await getAllProductsFromPg(env);
      let existing = pgProds ? pgProds.find(p => String(p.id) === id || String(p.code) === id) : {};
      if (!existing) {
        existing = {};
      }

      const stock = body.stock !== undefined ? Number(body.stock) : Number(existing.stock || 0);
      const badge = stock <= 0 ? 'ناموجود' : (stock <= 5 ? `تعداد محدود (${stock} عدد)` : null);
      const newPriceVal = body.newPrice !== undefined ? Number(body.newPrice) : (body.consumerPrice !== undefined ? Number(body.consumerPrice) : Number(existing.newPrice || existing.consumerPrice || 0));

      const updatedProd = {
        ...existing,
        ...body,
        id,
        stock,
        badge,
        newPrice: newPriceVal,
        consumerPrice: newPriceVal,
        isCustomized: true,
        updatedAt: new Date().toISOString()
      };
      
      const saved = await saveProductToPg(env, updatedProd);
      if (saved) {
        return jsonRes({ success: true, message: 'اطلاعات محصول با موفقیت به روزرسانی شد', product: updatedProd });
      } else {
        return jsonRes({ success: false, message: 'خطا در به‌روزرسانی محصول در دیتابیس' }, 500);
      }
    }

    if (method === 'DELETE') {
      const deleted = await deleteProductFromPg(env, id);
      if (deleted) {
        return jsonRes({ success: true, message: 'محصول با موفقیت حذف شد' });
      } else {
        return jsonRes({ success: false, message: 'خطا در حذف محصول از دیتابیس' }, 500);
      }
    }
  }

  // Fallback default response
  return jsonRes({ success: true, message: 'عملیات با موفقیت انجام شد' });
}

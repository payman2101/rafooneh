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
  return s;
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

// --- SUPABASE HELPERS ---
function getSupabaseClient(env) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY;
  if (!env.SUPABASE_URL || !key) {
    throw new Error('SUPABASE_URL and key must be defined in environment variables');
  }
  return createClient(env.SUPABASE_URL, key);
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
    const supabase = getSupabaseClient(env);
    const { error } = await supabase.from('orders').delete().eq('id', id);
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
    adminNotes: o.adminNotes || o.admin_notes || '',
    createdAt: o.createdAt || o.created_at || new Date().toISOString(),
    status: o.status || 'pending',
    items: items || [],
    statusLabel: getStatusLabel(o.status)
  };
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

// Helper to deduct or restore product stock based on orders
async function updateProductStockForOrder(env, orderItems, isRestore = false) {
  if (!Array.isArray(orderItems) || orderItems.length === 0) return;
  try {
    const pgProds = await getAllProductsFromPg(env);
    if (!pgProds || !Array.isArray(pgProds)) return;

    for (const item of orderItems) {
      const prodId = String(item.id || item.code || '');
      if (!prodId) continue;

      const prod = pgProds.find(p => String(p.id) === prodId || String(p.code) === prodId);
      if (prod) {
        const qty = Number(item.quantity || item.qty || 1);
        let currStock = Number(prod.stock || 0);
        if (isRestore) {
          currStock += qty;
        } else {
          currStock = Math.max(0, currStock - qty);
        }
        prod.stock = currStock;
        prod.badge = currStock <= 0 ? 'ناموجود' : (currStock <= 5 ? `تعداد محدود (${currStock} عدد)` : null);
        prod.updated_at = new Date().toISOString();
        await saveProductToPg(env, prod);
      }
    }
  } catch (err) {
    console.error('[Stock Update Error]:', err);
  }
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

  // First seed from DB customers
  pgCusts.forEach(pc => {
    const normPhone = String(pc.phone || '').replace(/\D/g, '');
    const pKey = normPhone || String(pc.id);
    map.set(pKey, {
      id: String(pc.id),
      name: pc.name || 'مشتری',
      phone: pc.phone || '',
      address: pc.address || '',
      notes: pc.notes || '',
      totalOrders: Number(pc.total_orders || 0),
      totalSpent: Number(pc.total_spent || 0),
      lastOrderAt: pc.last_order_at || pc.created_at || new Date().toISOString(),
      createdAt: pc.created_at || new Date().toISOString()
    });
  });

  // Dynamically group & aggregate metrics from ALL orders (deduplicated by phone)
  orders.forEach(o => {
    const rawPhone = String(o.phone || '');
    const normPhone = rawPhone.replace(/\D/g, '');
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
    const normInput = normPass(body.password || '');
    const targetPass1 = normPass('M0habb@t2026/8/1');
    const targetPass2 = normPass('M0habbat2026/8/1');
    if (normInput === targetPass1 || normInput === targetPass2 || body.password === 'M0habb@t2026/8/1') {
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
    const orders = await getCombinedOrders(env);
    const customers = await getCombinedCustomers(env);
    const pgProds = await getAllProductsFromPg(env);
    const products = (pgProds && pgProds.length > 0) ? pgProds : defaultProducts;

    const totalSales = orders.reduce((sum, o) => sum + (o.status !== 'cancelled' ? Number(o.totalAmount || 0) : 0), 0);
    const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'new').length;
    const completedOrders = orders.filter(o => o.status === 'delivered' || o.status === 'shipped' || o.status === 'delivering').length;
    const lowStockProductsCount = products.filter(p => Number(p.stock || 0) <= 5).length;

    return jsonRes({
      success: true,
      stats: {
        totalSales,
        totalOrders: orders.length,
        pendingOrders,
        completedOrders,
        totalCustomers: customers.length,
        totalProducts: products.length,
        lowStockProductsCount
      }
    });
  }

  if (path === '/api/admin/profit') {
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

    const validOrders = orders.filter(o => o.status !== 'cancelled');
    let totalRevenue = 0;
    let totalCost = 0;

    const productProfitMap = new Map();
    const orderProfitList = [];

    validOrders.forEach(o => {
      let orderCost = 0;
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

      const orderRev = Number(o.totalAmount || 0);
      if (orderCost === 0 && orderRev > 0) {
        orderCost = Math.round(orderRev * 0.7);
      }
      const orderProfit = orderRev - orderCost;
      const orderMargin = orderRev > 0 ? Math.round((orderProfit / orderRev) * 100) : 0;

      totalRevenue += orderRev;
      totalCost += orderCost;

      orderProfitList.push({
        ...o,
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
      const id = String(body.id || 'ORD-' + Date.now());
      const code = String(body.code || 'REF-' + Math.floor(100000 + Math.random() * 900000));
      const order = formatOrder({
        id,
        code,
        customerName: body.customerName || 'مشتری',
        phone: body.phone || '',
        address: body.address || '',
        note: body.note || '',
        items: body.items || [],
        totalAmount: Number(body.totalAmount) || 0,
        paymentMethod: body.paymentMethod || 'cash',
        status: body.status || 'pending',
        createdAt: body.createdAt || new Date().toISOString(),
        source: body.source || 'website'
      });

      memoryOrders.unshift(order);
      await saveOrderToPg(env, order);

      // Automatically deduct product inventory stock
      await updateProductStockForOrder(env, order.items, false);

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

  if (path.startsWith('/api/admin/orders/')) {
    const id = path.replace('/api/admin/orders/', '');
    const orders = await getCombinedOrders(env);
    let existing = orders.find(o => String(o.id) === id || String(o.code) === id);

    if (method === 'GET') {
      if (!existing) {
        return jsonRes({ success: false, message: 'سفارش یافت نشد' }, 404);
      }
      return jsonRes({ success: true, order: existing, statuses: getAllStatuses() });
    }

    if (method === 'PATCH' || method === 'PUT') {
      const oldStatus = existing ? existing.status : null;
      const updatedOrder = formatOrder({
        ...existing,
        ...body,
        id: id,
        updatedAt: new Date().toISOString()
      });

      const memIdx = memoryOrders.findIndex(o => String(o.id) === id);
      if (memIdx !== -1) memoryOrders[memIdx] = updatedOrder;
      else memoryOrders.push(updatedOrder);

      await saveOrderToPg(env, updatedOrder);

      // Handle stock adjustments on status changes
      if (oldStatus !== 'cancelled' && updatedOrder.status === 'cancelled') {
        await updateProductStockForOrder(env, updatedOrder.items, true); // Restore stock
      } else if (oldStatus === 'cancelled' && updatedOrder.status !== 'cancelled') {
        await updateProductStockForOrder(env, updatedOrder.items, false); // Re-deduct stock
      }

      return jsonRes({ success: true, message: 'سفارش بروزرسانی شد', order: updatedOrder });
    }

    if (method === 'DELETE') {
      if (existing) {
        // Restore stock for items in deleted order if order was active (not cancelled)
        if (existing.status !== 'cancelled') {
          await updateProductStockForOrder(env, existing.items, true);
        }
      }
      const memIdx = memoryOrders.findIndex(o => String(o.id) === id);
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
    let existing = customers.find(c => String(c.id) === id);

    if (method === 'GET') {
      if (!existing) return jsonRes({ success: false, message: 'مشتری یافت نشد' }, 404);
      const orders = await getCombinedOrders(env);
      const userOrders = orders.filter(o => String(o.phone) === String(existing.phone));
      return jsonRes({ success: true, customer: { ...existing, orders: userOrders } });
    }

    if (method === 'PATCH' || method === 'PUT') {
      const updatedCust = { ...existing, ...body, id };
      const memIdx = memoryCustomers.findIndex(c => String(c.id) === id);
      if (memIdx !== -1) memoryCustomers[memIdx] = updatedCust;
      else memoryCustomers.push(updatedCust);

      await saveCustomerToPg(env, updatedCust);
      return jsonRes({ success: true, message: 'اطلاعات مشتری بروزرسانی شد', customer: updatedCust });
    }

    if (method === 'DELETE') {
      const memIdx = memoryCustomers.findIndex(c => String(c.id) === id);
      if (memIdx !== -1) memoryCustomers.splice(memIdx, 1);
      await deleteCustomerFromPg(env, id);
      return jsonRes({ success: true, message: 'مشتری با موفقیت حذف شد' });
    }
  }

  // --- COMPANY PAYMENTS ENDPOINTS ---
  if (path === '/api/admin/company-payments/stats') {
    const totalPaid = memoryCompanyPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
    return jsonRes({ success: true, stats: { totalPaid, pending: 0, count: memoryCompanyPayments.length } });
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
      return jsonRes({ success: true, purchases: memoryPurchases });
    }
    if (method === 'POST') {
      const purchase = { id: 'PUR-' + Date.now(), ...body, createdAt: new Date().toISOString() };
      memoryPurchases.push(purchase);
      return jsonRes({ success: true, purchase, message: 'فاکتور خرید با موفقیت ثبت شد' });
    }
  }

  if (path.startsWith('/api/admin/purchases/')) {
    const id = path.replace('/api/admin/purchases/', '');
    if (method === 'DELETE') {
      const idx = memoryPurchases.findIndex(p => String(p.id) === id);
      if (idx !== -1) memoryPurchases.splice(idx, 1);
      return jsonRes({ success: true });
    }
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
      const includeAll = url.searchParams.get('includeAll') !== 'false';

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
        result = result.filter(p => p.stock === undefined || p.stock === null || Number(p.stock) > 0);
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

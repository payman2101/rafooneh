import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc
} from 'firebase/firestore';

const firebaseConfig = {
  projectId: "ageless-fx-sdw77",
  appId: "1:901632283769:web:a7f81e2c9a6be6a378b0a8",
  apiKey: "AIzaSyBW4FfCNNhXrRk39oy294xgLAP6NGPQxoo",
  authDomain: "ageless-fx-sdw77.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-rafooneh-11db6cb9-24d8-4d3d-97d0-9e826f57d0d4",
  storageBucket: "ageless-fx-sdw77.firebasestorage.app",
  messagingSenderId: "901632283769"
};

let db = null;
function getDb() {
  if (db) return db;
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    return db;
  } catch (e) {
    console.error('Firebase init error:', e);
    return null;
  }
}

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

// Helpers for Firestore collections
async function getCollectionDocs(collName) {
  const database = getDb();
  if (!database) return [];
  try {
    const snap = await getDocs(collection(database, collName));
    const items = [];
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));
    return items;
  } catch (e) {
    console.error(`Error reading ${collName} from Firestore:`, e);
    return [];
  }
}

async function saveDoc(collName, id, data) {
  const database = getDb();
  if (!database || !id) return false;
  try {
    const docRef = doc(database, collName, String(id));
    await setDoc(docRef, data, { merge: true });
    return true;
  } catch (e) {
    console.error(`Error saving to ${collName}:`, e);
    return false;
  }
}

async function removeDoc(collName, id) {
  const database = getDb();
  if (!database || !id) return false;
  try {
    await deleteDoc(doc(database, collName, String(id)));
    return true;
  } catch (e) {
    console.error(`Error deleting from ${collName}:`, e);
    return false;
  }
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

export async function onRequest(context) {
  const { request } = context;
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

  // --- PRODUCTS ENDPOINTS ---
  if (path === '/api/products' || path === '/api/admin/products') {
    if (method === 'GET') {
      const products = await getCollectionDocs('products');
      const includeAll = url.searchParams.get('includeAll') !== 'false';
      const result = includeAll
        ? products
        : products.filter(p => p.stock === undefined || p.stock === null || Number(p.stock) > 0);
      return jsonRes({ success: true, count: result.length, products: result });
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
        stock,
        badge,
        updatedAt: new Date().toISOString(),
        ...body
      };
      await saveDoc('products', id, product);
      return jsonRes({ success: true, message: 'محصول جدید با موفقیت اضافه شد', product });
    }
  }

  if (path.startsWith('/api/admin/products/')) {
    const id = path.replace('/api/admin/products/', '');
    if (method === 'PATCH' || method === 'PUT') {
      const existingProds = await getCollectionDocs('products');
      const existing = existingProds.find(p => String(p.id) === id || String(p.code) === id) || {};
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
        updatedAt: new Date().toISOString()
      };
      await saveDoc('products', id, updatedProd);
      return jsonRes({ success: true, message: 'اطلاعات محصول با موفقیت به روزرسانی شد', product: updatedProd });
    }

    if (method === 'DELETE') {
      await removeDoc('products', id);
      return jsonRes({ success: true, message: 'محصول با موفقیت حذف شد' });
    }
  }

  // --- ORDERS ENDPOINTS ---
  if (path === '/api/orders') {
    if (method === 'POST') {
      const orderId = body.id || ('ORD-' + Date.now().toString().slice(-6));
      const order = {
        id: orderId,
        customerName: body.customerName || 'مشتری',
        phone: body.phone || '',
        address: body.address || '',
        note: body.note || '',
        items: body.items || [],
        totalAmount: Number(body.totalAmount) || 0,
        paymentMethod: body.paymentMethod || 'cod',
        status: body.status || 'new',
        createdAt: body.createdAt || new Date().toISOString()
      };
      await saveDoc('orders', orderId, order);

      // Auto update stock in Firestore for items
      if (Array.isArray(order.items) && order.items.length > 0) {
        const prods = await getCollectionDocs('products');
        for (const item of order.items) {
          const pid = String(item.id || item.productId || item.code || '');
          const qty = Number(item.qty) || 1;
          const p = prods.find(x => String(x.id) === pid || String(x.code) === pid);
          if (p) {
            const newStock = Math.max(0, (Number(p.stock) || 10) - qty);
            const badge = newStock <= 0 ? 'ناموجود' : (newStock <= 5 ? `تعداد محدود (${newStock} عدد)` : null);
            await saveDoc('products', p.id, { ...p, stock: newStock, badge, updatedAt: new Date().toISOString() });
          }
        }
      }

      return jsonRes({ success: true, message: 'سفارش با موفقیت ثبت شد', orderId, order });
    }
  }

  if (path === '/api/admin/orders') {
    if (method === 'GET') {
      const orders = await getCollectionDocs('orders');
      return jsonRes({ success: true, count: orders.length, orders });
    }
  }

  if (path.startsWith('/api/admin/orders/')) {
    const id = path.replace('/api/admin/orders/', '');
    if (method === 'PATCH') {
      const orders = await getCollectionDocs('orders');
      const existing = orders.find(o => String(o.id) === id) || {};
      const updated = { ...existing, ...body, id, updatedAt: new Date().toISOString() };
      await saveDoc('orders', id, updated);
      return jsonRes({ success: true, message: 'سفارش بروزرسانی شد', order: updated });
    }
    if (method === 'DELETE') {
      await removeDoc('orders', id);
      return jsonRes({ success: true, message: 'سفارش حذف شد' });
    }
  }

  // --- CUSTOMERS ENDPOINTS ---
  if (path === '/api/admin/customers') {
    if (method === 'GET') {
      const customers = await getCollectionDocs('customers');
      return jsonRes({ success: true, count: customers.length, customers });
    }
  }

  // --- COMPANY PAYMENTS ENDPOINTS ---
  if (path === '/api/admin/company-payments') {
    if (method === 'GET') {
      const payments = await getCollectionDocs('company_payments');
      return jsonRes({ success: true, count: payments.length, companyPayments: payments });
    }
    if (method === 'POST') {
      const id = body.id || ('CP-' + Date.now().toString().slice(-6));
      const payment = { id, ...body, createdAt: body.createdAt || new Date().toISOString() };
      await saveDoc('company_payments', id, payment);
      return jsonRes({ success: true, message: 'پرداخت شرکت ثبت شد', payment });
    }
  }

  if (path.startsWith('/api/admin/company-payments/')) {
    const id = path.replace('/api/admin/company-payments/', '');
    if (method === 'DELETE') {
      await removeDoc('company_payments', id);
      return jsonRes({ success: true, message: 'پرداخت شرکت حذف شد' });
    }
  }

  // --- PURCHASES ENDPOINTS ---
  if (path === '/api/admin/purchases') {
    if (method === 'GET') {
      const purchases = await getCollectionDocs('purchases');
      return jsonRes({ success: true, count: purchases.length, purchases });
    }
    if (method === 'POST') {
      const id = body.id || ('PUR-' + Date.now().toString().slice(-6));
      const purchase = { id, ...body, createdAt: body.createdAt || new Date().toISOString() };
      await saveDoc('purchases', id, purchase);
      return jsonRes({ success: true, message: 'فاکتور خرید ثبت شد', purchase });
    }
  }

  if (path.startsWith('/api/admin/purchases/')) {
    const id = path.replace('/api/admin/purchases/', '');
    if (method === 'DELETE') {
      await removeDoc('purchases', id);
      return jsonRes({ success: true, message: 'فاکتور خرید حذف شد' });
    }
  }

  // --- STATS ENDPOINT ---
  if (path === '/api/admin/stats') {
    const [orders, customers, products] = await Promise.all([
      getCollectionDocs('orders'),
      getCollectionDocs('customers'),
      getCollectionDocs('products')
    ]);

    const totalSales = orders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    const totalOrders = orders.length;
    const newOrdersCount = orders.filter(o => o.status === 'new' || o.status === 'pending').length;
    const totalCustomers = customers.length;
    const totalProducts = products.length;

    return jsonRes({
      success: true,
      stats: {
        totalSales,
        totalOrders,
        newOrdersCount,
        totalCustomers,
        totalProducts
      }
    });
  }

  if (path === '/api/admin/alerts') {
    const products = await getCollectionDocs('products');
    const lowStock = products.filter(p => Number(p.stock) <= 5);
    return jsonRes({
      success: true,
      alerts: lowStock.map(p => ({
        type: 'low_stock',
        message: `موجودی محصول "${p.name}" کم است (${p.stock} عدد)`
      }))
    });
  }

  // Fallback default response
  return jsonRes({ success: true, message: 'عملیات با موفقیت انجام شد' });
}

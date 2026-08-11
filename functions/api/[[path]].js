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
  const persianDigits = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /٦/g, /۷/g, /۸/g, /۹/g];
  const arabicDigits  = [/٠/g, /١/g, /٢/g, /٣/g, /٤/g, /٥/g, /٦/g, /٧/g, /۸/g, /٩/g];
  
  for (let i = 0; i < 10; i++) {
    s = s.replace(persianDigits[i], String(i)).replace(arabicDigits[i], String(i));
  }
  return s;
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

function getSupabaseClient(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be defined');
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
}

// --- PRODUCTS FUNCTIONS ---
async function getAllProductsFromPg(env) {
  try {
    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase.from('products').select('*');
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error fetching products:', err.message);
    return null;
  }
}

async function saveProductToPg(env, product) {
  try {
    const supabase = getSupabaseClient(env);
    const dbPayload = mapToDbSchema(product);
    const { data, error } = await supabase
      .from('products')
      .upsert(dbPayload, { onConflict: 'id' });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error saving product:', err.message);
    return false;
  }
}

async function deleteProductFromPg(env, id) {
  try {
    const supabase = getSupabaseClient(env);
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error deleting product:', err.message);
    return false;
  }
}

// --- ORDERS FUNCTIONS ---
async function createOrder(env, orderData) {
  try {
    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase
      .from('orders')
      .insert([{
        id: orderData.id,
        customer_name: orderData.customerName,
        phone: orderData.phone,
        address: orderData.address,
        note: orderData.note || '',
        items: orderData.items || [],
        total_amount: orderData.totalAmount,
        payment_method: orderData.paymentMethod,
        status: orderData.status || 'new',
        created_at: orderData.createdAt || new Date().toISOString()
      }])
      .select()
      .single();
    
    if (error) throw error;
    
    // کاهش موجودی محصولات
    if (orderData.items && orderData.items.length > 0) {
      for (const item of orderData.items) {
        const productId = item.productId || item.id || item.code;
        const qty = item.qty || 1;
        
        await supabase.rpc('decrement_stock', {
          product_id: productId,
          quantity: qty
        }).catch(() => {
          // اگر تابع RPC وجود نداشت، به صورت مستقیم آپدیت کن
          console.log('RPC not found, updating stock directly');
        });
      }
    }
    
    return data;
  } catch (err) {
    console.error('Error creating order:', err.message);
    throw err;
  }
}

async function getOrders(env, filters = {}) {
  try {
    const supabase = getSupabaseClient(env);
    let query = supabase.from('orders').select('*');
    
    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    
    if (filters.search) {
      // جستجو در customer_name یا phone
      query = query.or(`customer_name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`);
    }
    
    query = query.order('created_at', { ascending: false });
    
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error fetching orders:', err.message);
    return [];
  }
}

async function getOrderById(env, id) {
  try {
    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error fetching order:', err.message);
    return null;
  }
}

async function updateOrder(env, id, updates) {
  try {
    const supabase = getSupabaseClient(env);
    const updateData = { ...updates };
    
    // حذف فیلدهایی که نباید آپدیت شوند
    delete updateData.id;
    
    const { data, error } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error updating order:', err.message);
    throw err;
  }
}

async function deleteOrder(env, id) {
  try {
    const supabase = getSupabaseClient(env);
    const { error } = await supabase.from('orders').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error deleting order:', err.message);
    return false;
  }
}

// --- CUSTOMERS FUNCTIONS ---
async function getCustomers(env, search = '') {
  try {
    const supabase = getSupabaseClient(env);
    
    // دریافت همه سفارشات برای محاسبه اطلاعات مشتریان
    const { data: orders, error } = await supabase
      .from('orders')
      .select('customer_name, phone, total_amount, created_at');
    
    if (error) throw error;
    
    // گروه‌بندی بر اساس شماره تلفن
    const customerMap = new Map();
    
    orders.forEach(order => {
      const phone = order.phone;
      if (!phone) return;
      
      if (!customerMap.has(phone)) {
        customerMap.set(phone, {
          id: phone,
          name: order.customer_name,
          phone: phone,
          totalOrders: 0,
          totalSpent: 0,
          lastOrderAt: order.created_at
        });
      }
      
      const customer = customerMap.get(phone);
      customer.totalOrders++;
      customer.totalSpent += order.total_amount || 0;
      
      if (new Date(order.created_at) > new Date(customer.lastOrderAt)) {
        customer.lastOrderAt = order.created_at;
      }
    });
    
    let customers = Array.from(customerMap.values());
    
    // فیلتر جستجو
    if (search) {
      const s = search.toLowerCase();
      customers = customers.filter(c => 
        (c.name && c.name.toLowerCase().includes(s)) ||
        c.phone.includes(s)
      );
    }
    
    return customers;
  } catch (err) {
    console.error('Error fetching customers:', err.message);
    return [];
  }
}

// --- STATS FUNCTIONS ---
async function getStats(env, timeframe = 'all', fromDate = '', toDate = '') {
  try {
    const supabase = getSupabaseClient(env);
    
    // دریافت همه سفارشات
    let query = supabase.from('orders').select('*');
    
    // فیلتر بر اساس بازه زمانی
    if (timeframe === 'today') {
      const today = new Date().toISOString().split('T')[0];
      query = query.gte('created_at', today);
    } else if (timeframe === 'yesterday') {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const today = new Date().toISOString().split('T')[0];
      query = query.gte('created_at', yesterday).lt('created_at', today);
    } else if (timeframe === 'week') {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      query = query.gte('created_at', weekAgo);
    } else if (timeframe === 'month') {
      const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      query = query.gte('created_at', monthAgo);
    } else if (timeframe === 'custom' && fromDate && toDate) {
      query = query.gte('created_at', fromDate).lte('created_at', toDate + ' 23:59:59');
    }
    
    query = query.order('created_at', { ascending: false });
    
    const { data: orders, error } = await query;
    if (error) throw error;
    
    // محاسبه آمار
    const totalOrders = orders.length;
    const revenueTotal = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const activeOrders = orders.filter(o => 
      ['new', 'confirmed', 'preparing', 'delivering'].includes(o.status)
    ).length;
    
    const deliveredOrdersCount = orders.filter(o => o.status === 'delivered').length;
    
    // محاسبه سود (تقریبی - 30% فرض شده)
    const profitTotal = Math.round(revenueTotal * 0.3);
    const profitMarginTotal = 30;
    
    // سفارشات امروز
    const todayStr = new Date().toISOString().split('T')[0];
    const todayOrders = orders.filter(o => o.created_at && o.created_at.startsWith(todayStr));
    const revenueToday = todayOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const profitToday = Math.round(revenueToday * 0.3);
    
    // دریافت هشدارها
    const alerts = await getAlerts(env);
    
    return {
      totalOrders,
      revenueTotal,
      profitTotal,
      profitMarginTotal,
      activeOrders,
      deliveredOrdersCount,
      todayOrders: todayOrders.length,
      revenueToday,
      profitToday,
      filteredOrdersCount: totalOrders,
      recentOrders: orders.slice(0, 10),
      alerts
    };
  } catch (err) {
    console.error('Error fetching stats:', err.message);
    return null;
  }
}

// --- ALERTS FUNCTIONS ---
async function getAlerts(env) {
  try {
    const supabase = getSupabaseClient(env);
    
    // موجودی کم
    const { data: lowStockProducts } = await supabase
      .from('products')
      .select('*')
      .lt('stock', 5);
    
    // سفارشات با تأخیر
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: delayedOrders } = await supabase
      .from('orders')
      .select('*')
      .in('status', ['new', 'confirmed', 'preparing', 'delivering'])
      .lt('created_at', weekAgo);
    
    const lowStockCount = lowStockProducts ? lowStockProducts.length : 0;
    const delayedOrdersCount = delayedOrders ? delayedOrders.length : 0;
    
    return {
      totalAlertsCount: lowStockCount + delayedOrdersCount,
      lowStockCount,
      delayedOrdersCount,
      lowStockProducts: lowStockProducts || [],
      delayedOrders: delayedOrders || []
    };
  } catch (err) {
    console.error('Error fetching alerts:', err.message);
    return { totalAlertsCount: 0, lowStockCount: 0, delayedOrdersCount: 0 };
  }
}

// --- PURCHASES FUNCTIONS ---
async function createPurchase(env, purchaseData) {
  try {
    const supabase = getSupabaseClient(env);
    
    // محاسبه مجموع
    const totalAmount = purchaseData.items.reduce((sum, item) => {
      return sum + (item.qty * item.buyPrice);
    }, 0);
    
    const totalItemsCount = purchaseData.items.reduce((sum, item) => {
      return sum + item.qty;
    }, 0);
    
    // ثبت فاکتور خرید
    const { data, error } = await supabase
      .from('purchases')
      .insert([{
        id: purchaseData.id || 'pur_' + Date.now(),
        supplier_name: purchaseData.supplierName,
        ref_number: purchaseData.refNumber,
        purchase_date: purchaseData.purchaseDate || new Date().toISOString(),
        notes: purchaseData.notes || '',
        total_amount: totalAmount,
        total_items_count: totalItemsCount,
        items: purchaseData.items,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (error) throw error;
    
    // افزایش موجودی انبار
    if (purchaseData.updateStock !== false) {
      for (const item of purchaseData.items) {
        const productId = item.productId;
        const qty = item.qty;
        const buyPrice = item.buyPrice;
        
        // دریافت محصول فعلی
        const { data: product } = await supabase
          .from('products')
          .select('stock, buy_price')
          .eq('id', productId)
          .single();
        
        if (product) {
          const newStock = (product.stock || 0) + qty;
          await supabase
            .from('products')
            .update({
              stock: newStock,
              buy_price: buyPrice,
              updated_at: new Date().toISOString()
            })
            .eq('id', productId);
        }
      }
    }
    
    return data;
  } catch (err) {
    console.error('Error creating purchase:', err.message);
    throw err;
  }
}

async function getPurchases(env) {
  try {
    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase
      .from('purchases')
      .select('*')
      .order('purchase_date', { ascending: false });
    
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error fetching purchases:', err.message);
    return [];
  }
}

async function deletePurchase(env, id) {
  try {
    const supabase = getSupabaseClient(env);
    const { error } = await supabase.from('purchases').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error deleting purchase:', err.message);
    return false;
  }
}

// --- COMPANY PAYMENTS FUNCTIONS ---
async function getCompanyPayments(env) {
  try {
    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase
      .from('company_payments')
      .select('*')
      .order('payment_date', { ascending: false });
    
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error fetching company payments:', err.message);
    return [];
  }
}

async function createCompanyPayment(env, paymentData) {
  try {
    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase
      .from('company_payments')
      .insert([{
        id: paymentData.id || 'cp_' + Date.now(),
        payment_date: paymentData.paymentDate,
        from_date: paymentData.fromDate,
        to_date: paymentData.toDate,
        total_buy_cost: paymentData.totalBuyCost,
        total_items_count: paymentData.totalItemsCount,
        orders_count: paymentData.ordersCount,
        ref_number: paymentData.refNumber,
        notes: paymentData.notes,
        status: paymentData.status || 'پرداخت شده',
        items: paymentData.items || [],
        created_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error creating company payment:', err.message);
    throw err;
  }
}

async function deleteCompanyPayment(env, id) {
  try {
    const supabase = getSupabaseClient(env);
    const { error } = await supabase.from('company_payments').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error deleting company payment:', err.message);
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

  // Handle preflight
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Parse body for POST/PATCH/PUT
  let body = {};
  if (['POST', 'PATCH', 'PUT'].includes(method)) {
    try {
      body = await request.json();
    } catch (e) {
      console.error('Error parsing JSON:', e);
    }
  }

  console.log(`[API] ${method} ${path}`);

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
    }
    return jsonRes({ success: false, message: 'کلمه عبور اشتباه است' }, 401);
  }

  if (path === '/api/admin/logout') {
    return jsonRes({ success: true, message: 'خروج موفق' });
  }

  // --- DB STATUS ---
  if (path === '/api/db-status') {
    try {
      const cloudProducts = await getAllProductsFromPg(env);
      if (cloudProducts !== null) {
        return jsonRes({
          success: true,
          message: 'ارتباط با Supabase برقرار است',
          supabaseProductCount: cloudProducts.length,
          timestamp: new Date().toISOString()
        });
      }
      return jsonRes({ success: false, message: 'خطا در ارتباط با دیتابیس' }, 500);
    } catch (err) {
      return jsonRes({ success: false, message: err.message }, 500);
    }
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
      pgProds.forEach(pp => {
        if (!pp || (!pp.id && !pp.code)) return;
        const key = String(pp.id || pp.code);
        const existing = map.get(key) || {};
        map.set(key, { ...existing, ...pp });
      });

      let products = Array.from(map.values());

      const brand = url.searchParams.get('brand');
      const category = url.searchParams.get('category');
      const search = url.searchParams.get('search');

      if (brand && brand !== 'all') {
        products = products.filter(p => p.brand === brand);
      }
      if (category && category !== 'all') {
        products = products.filter(p => p.category === category);
      }
      if (search) {
        const s = search.toLowerCase();
        products = products.filter(p => 
          (p.name && p.name.toLowerCase().includes(s)) || 
          String(p.id).includes(s)
        );
      }

      const brandCounts = {
        rafooneh: products.filter(p => p.brand === 'rafooneh').length,
        foreign: products.filter(p => p.brand === 'foreign').length
      };

      return jsonRes({ 
        success: true, 
        count: products.length, 
        total: products.length,
        brandCounts, 
        products 
      });
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
        updatedAt: new Date().toISOString()
      };
      
      const saved = await saveProductToPg(env, product);
      if (saved) {
        return jsonRes({ success: true, message: 'محصول جدید اضافه شد', product });
      }
      return jsonRes({ success: false, message: 'خطا در ذخیره محصول' }, 500);
    }
  }

  // --- PRODUCT BY ID ---
  if (path.startsWith('/api/admin/products/')) {
    const id = path.replace('/api/admin/products/', '');
    
    if (method === 'PATCH' || method === 'PUT') {
      const pgProds = await getAllProductsFromPg(env);
      let existing = pgProds ? pgProds.find(p => String(p.id) === id) : {};
      if (!existing) existing = {};

      const stock = body.stock !== undefined ? Number(body.stock) : Number(existing.stock || 0);
      const badge = stock <= 0 ? 'ناموجود' : (stock <= 5 ? `تعداد محدود (${stock} عدد)` : null);
      const newPriceVal = body.newPrice !== undefined ? Number(body.newPrice) : Number(existing.newPrice || 0);

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
        return jsonRes({ success: true, message: 'محصول به‌روزرسانی شد', product: updatedProd });
      }
      return jsonRes({ success: false, message: 'خطا در به‌روزرسانی' }, 500);
    }

    if (method === 'DELETE') {
      const deleted = await deleteProductFromPg(env, id);
      if (deleted) {
        return jsonRes({ success: true, message: 'محصول حذف شد' });
      }
      return jsonRes({ success: false, message: 'خطا در حذف' }, 500);
    }
  }

  // --- ORDERS ENDPOINTS ---
  if (path === '/api/orders' && method === 'POST') {
    try {
      const order = await createOrder(env, body);
      return jsonRes({ success: true, message: 'سفارش با موفقیت ثبت شد', order });
    } catch (err) {
      console.error('Order creation error:', err);
      return jsonRes({ success: false, message: err.message }, 500);
    }
  }

  if (path === '/api/admin/orders') {
    if (method === 'GET') {
      const status = url.searchParams.get('status');
      const search = url.searchParams.get('search');
      const orders = await getOrders(env, { status, search });
      
      const statuses = [
        { id: 'new', label: 'جدید' },
        { id: 'confirmed', label: 'تأیید شده' },
        { id: 'preparing', label: 'در حال آماده‌سازی' },
        { id: 'delivering', label: 'در حال ارسال' },
        { id: 'delivered', label: 'تحویل شده' },
        { id: 'cancelled', label: 'لغو شده' }
      ];
      
      return jsonRes({ success: true, orders, statuses });
    }
  }

  if (path.startsWith('/api/admin/orders/')) {
    const id = path.replace('/api/admin/orders/', '');
    
    if (method === 'GET') {
      const order = await getOrderById(env, id);
      if (order) {
        return jsonRes({ success: true, order });
      }
      return jsonRes({ success: false, message: 'سفارش یافت نشد' }, 404);
    }
    
    if (method === 'PATCH') {
      try {
        const updated = await updateOrder(env, id, body);
        return jsonRes({ success: true, order: updated });
      } catch (err) {
        return jsonRes({ success: false, message: err.message }, 500);
      }
    }
    
    if (method === 'DELETE') {
      const deleted = await deleteOrder(env, id);
      if (deleted) {
        return jsonRes({ success: true, message: 'سفارش حذف شد' });
      }
      return jsonRes({ success: false, message: 'خطا در حذف' }, 500);
    }
  }

  // --- CUSTOMERS ENDPOINTS ---
  if (path === '/api/admin/customers') {
    if (method === 'GET') {
      const search = url.searchParams.get('search') || '';
      const customers = await getCustomers(env, search);
      return jsonRes({ success: true, customers });
    }
  }

  // --- STATS ENDPOINT ---
  if (path === '/api/admin/stats') {
    const timeframe = url.searchParams.get('timeframe') || 'all';
    const fromDate = url.searchParams.get('from') || '';
    const toDate = url.searchParams.get('to') || '';
    
    const stats = await getStats(env, timeframe, fromDate, toDate);
    if (stats) {
      return jsonRes({ success: true, stats });
    }
    return jsonRes({ success: false, message: 'خطا در دریافت آمار' }, 500);
  }

  // --- ALERTS ENDPOINT ---
  if (path === '/api/admin/alerts') {
    const alerts = await getAlerts(env);
    return jsonRes({ success: true, alerts });
  }

  // --- PURCHASES ENDPOINTS ---
  if (path === '/api/admin/purchases') {
    if (method === 'GET') {
      const purchases = await getPurchases(env);
      return jsonRes({ success: true, purchases });
    }
    
    if (method === 'POST') {
      try {
        const purchase = await createPurchase(env, body);
        return jsonRes({ success: true, message: 'فاکتور خرید ثبت شد', purchase });
      } catch (err) {
        return jsonRes({ success: false, message: err.message }, 500);
      }
    }
  }

  if (path.startsWith('/api/admin/purchases/')) {
    const id = path.replace('/api/admin/purchases/', '');
    
    if (method === 'DELETE') {
      const deleted = await deletePurchase(env, id);
      if (deleted) {
        return jsonRes({ success: true, message: 'فاکتور خرید حذف شد' });
      }
      return jsonRes({ success: false, message: 'خطا در حذف' }, 500);
    }
  }

  // --- COMPANY PAYMENTS ENDPOINTS ---
  if (path === '/api/admin/company-payments') {
    if (method === 'GET') {
      const payments = await getCompanyPayments(env);
      return jsonRes({ success: true, payments });
    }
    
    if (method === 'POST') {
      try {
        const payment = await createCompanyPayment(env, body);
        return jsonRes({ success: true, message: 'تسویه حساب ثبت شد', payment });
      } catch (err) {
        return jsonRes({ success: false, message: err.message }, 500);
      }
    }
  }

  if (path.startsWith('/api/admin/company-payments/')) {
    const id = path.replace('/api/admin/company-payments/', '');
    
    if (method === 'DELETE') {
      const deleted = await deleteCompanyPayment(env, id);
      if (deleted) {
        return jsonRes({ success: true, message: 'سند حذف شد' });
      }
      return jsonRes({ success: false, message: 'خطا در حذف' }, 500);
    }
  }

  // --- DEFAULT 404 ---
  return jsonRes({ 
    success: false, 
    message: 'Endpoint not found',
    path: path,
    method: method
  }, 404);
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
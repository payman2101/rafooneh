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
  // آرایه زیر اصلاح شد تا مشکل کامنت و سینتکس برطرف شود
  const persianDigits = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /۸/g, /۹/g];
  const arabicDigits  = [/٠/g, /١/g, /٢/g, /٣/g, /٤/g, /٥/g, /٦/g, /٧/g, /۸/g, /٩/g];
  
  for (let i = 0; i < 10; i++) {
    s = s.replace(persianDigits[i], String(i)).replace(arabicDigits[i], String(i));
  }
  return s;
}

// --- SUPABASE HELPERS ---
function getSupabaseClient(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be defined in environment variables');
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
}

async function getAllProductsFromPg(env) {
  try {
    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase
      .from('products')
      .select('*');
    
    if (error) {
      console.error('Error fetching products:', error.message);
      return null;
    }
    return data || [];
  } catch (err) {
    console.error('Exception in getAllProductsFromPg:', err.message);
    return null;
  }
}

async function saveProductToPg(env, product) {
  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
    
    // لاگ کردن آی‌دی برای اطمینان از وجود آن
    console.log("📦 Attempting to save product ID:", product.id);

    const { data, error } = await supabase
      .from('products')
      .upsert(product, { onConflict: 'id' });
    
    if (error) {
      // این خطوط خطای دقیق پستگرس را نشان می‌دهند
      console.error("❌ SUPABASE ERROR MESSAGE:", error.message);
      console.error("❌ SUPABASE ERROR DETAILS:", error.details);
      console.error("❌ SUPABASE ERROR HINT:", error.hint);
      return false;
    }
    
    console.log("✅ Product saved successfully:", product.id);
    return true;
  } catch (err) {
    console.error("❌ EXCEPTION IN SAVE:", err.message);
    return false;
  }
}

async function deleteProductFromPg(env, id) {
  try {
    const supabase = getSupabaseClient(env);
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error deleting product:', error.message);
      return false;
    }
    console.log('✅ Product deleted:', id);
    return true;
  } catch (err) {
    console.error('Exception in deleteProductFromPg:', err.message);
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

  // --- PRODUCTS ENDPOINTS ---
  if (path === '/api/products' || path === '/api/admin/products') {
    if (method === 'GET') {
      let pgProds = await getAllProductsFromPg(env);
      if (!pgProds) pgProds = [];

      // Merge with default products from JSON
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
        stock,
        badge,
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
      // First fetch existing product from Supabase
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
import express from 'express';
import fileUpload from 'express-fileupload';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import {
  createOrder,
  getDashboardStats,
  getOrderById,
  getCustomerById,
  listCustomers,
  listOrders,
  updateCustomer,
  deleteCustomer,
  clearAllTestData,
  updateOrder,
  deleteOrder,
  getAllStatuses,
  getStatusLabel,
  getProfitStats,
  getCompanyPaymentStats,
  listCompanyPayments,
  createCompanyPayment,
  deleteCompanyPayment,
  listPurchases,
  createPurchase,
  updatePurchase,
  deletePurchase,
  getAdminAlerts,
  listProducts,
  updateProduct,
  addProduct,
  deleteProduct,
  readProductsList,
  getFreshProductsFromFirestore,
  saveProductsList,
  refreshProductsFromCloudSql,
  initDatabaseSync,
  ensureFirestoreLoaded,
  getBankSettings,
  saveBankSettings,
  getDeliverySettings,
  saveDeliverySettings
} from './crm/store.js';
import { checkpointSqlite } from './crm/sqlite.js';
import { authMiddleware, login, logout, changeAdminPassword } from './crm/auth.js';
import { getAllProductsCloudSql } from './crm/cloudsql.js';

const appDir = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));

const APP_BUILD_VERSION = '2.5.2';
const APP_BUILD_TIME = Date.now();

const app = express();
const PORT = 3000;

app.use((req, res, next) => {
  if (req.url && req.url.startsWith('/.netlify/functions/api')) {
    req.url = req.url.replace(/^\/\.netlify\/functions\/api/, '');
    if (!req.url.startsWith('/api')) {
      req.url = '/api' + req.url;
    }
  }
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// App Version Endpoint for PWA / Mobile live updates
app.get('/api/app-version', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json({
    success: true,
    version: APP_BUILD_VERSION,
    buildTime: APP_BUILD_TIME,
    timestamp: Date.now()
  });
});

// Explicit No-Cache delivery for Service Worker and Manifest
app.get(['/sw.js', '/service-worker.js'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.sendFile(path.join(appDir, 'sw.js'));
});

app.get(['/manifest.json', '/site.webmanifest'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.sendFile(path.join(appDir, 'manifest.json'));
});

app.get(['/', '/index.html'], (req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.get(['/admin', '/admin.html'], (req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(async (req, res, next) => {
  await ensureFirestoreLoaded().catch(() => {});
  next();
});
app.use(express.static(appDir, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('sw.js') || filePath.endsWith('manifest.json')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Function to process Excel file 'سفارش 1405.xlsx' automatically on save/change
function categorize(name) {
  if (name.includes('دست') || name.includes('پومپ') || name.includes('پستلی') || name.includes('پاستیلی')) return { id: 'handwash', name: 'مایع دستشویی' };
  if (name.includes('ظرف') || name.includes('گلیسیرین')) return { id: 'dishwash', name: 'مایع ظرفشویی' };
  if (name.includes('لباس') || name.includes('مشکین') || name.includes('رنگین') || name.includes('پودر') || name.includes('نرم کننده')) return { id: 'laundry', name: 'شوینده لباس' };
  if (name.includes('شیشه') || name.includes('پاک کننده') || name.includes('چربی') || name.includes('همه کاره') || name.includes('سطوح') || name.includes('چوب') || name.includes('چرم') || name.includes('شیرآلات') || name.includes('گاز') || name.includes('چند منظوره') || name.includes('اسپری')) return { id: 'cleaners', name: 'پاک‌کننده و اسپری' };
  if (name.includes('جرم') || name.includes('سفید') || name.includes('وایتکس') || name.includes('من') || name.includes('اسیدی') || name.includes('سرویس')) return { id: 'sanitary', name: 'جرم‌گیر و ضدعفونی‌کننده' };
  if (name.includes('فرش') || name.includes('موکت') || name.includes('پرده')) return { id: 'cleaners', name: 'پاک‌کننده و اسپری' };
  if (name.includes('کیسه') || name.includes('فریزر') || name.includes('زباله') || name.includes('دستکش') || name.includes('اسکاج') || name.includes('سفره') || name.includes('پد') || name.includes('فویل') || name.includes('محافظ')) return { id: 'cellulosic', name: 'لوازم مصرفی و سلولزی' };
  if (name.includes('خودرو') || name.includes('شامپو ماشین') || name.includes('واکس')) return { id: 'car', name: 'شوینده خودرو و ویژه' };
  return { id: 'cleaners', name: 'پاک‌کننده و اسپری' };
}

function determineBrand(name, rawBrand = '') {
  if (rawBrand && String(rawBrand).trim()) {
    const b = String(rawBrand).trim();
    const bLower = b.toLowerCase();
    if (b.includes('خارج') || b.includes('وارد') || bLower.includes('foreign') || bLower.includes('import')) {
      return { id: 'foreign', name: 'محصولات خارجی' };
    }
    if (b.includes('رافونه') || bLower.includes('rafooneh')) {
      return { id: 'rafooneh', name: 'رافونه' };
    }
    return { id: 'foreign', name: 'محصولات خارجی' };
  }

  const n = String(name || '').toLowerCase();
  if (n.includes('خارجی') || n.includes('وارداتی') || n.includes('فینیش') || n.includes('پریمیوم') || n.includes('آلمانی') || n.includes('ترک') || n.includes('امپریال') || n.includes('فرانسوی') || n.includes('ایتالیایی')) {
    return { id: 'foreign', name: 'محصولات خارجی' };
  }
  return { id: 'rafooneh', name: 'رافونه' };
}

const categoryDefaultImages = {
  handwash: 'https://rafooneh.com/media/catalog/product/cache/13fb5134717fc87cd9b03caf5e4a36c1/h/a/hand-washing-green_2.jpg',
  dishwash: 'https://rafooneh.com/media/catalog/product/cache/13fb5134717fc87cd9b03caf5e4a36c1/l/i/liquid-dishwashing-glycerin-green-2700-gr_1.png',
  laundry: 'https://rafooneh.com/media/catalog/product/cache/13fb5134717fc87cd9b03caf5e4a36c1/3/_/3_1_1_1.jpg',
  cleaners: 'https://rafooneh.com/media/catalog/product/cache/13fb5134717fc87cd9b03caf5e4a36c1/6/2/6261460205754_2.jpg',
  sanitary: 'https://rafooneh.com/media/catalog/product/cache/13fb5134717fc87cd9b03caf5e4a36c1/1/1/11_1_.jpg',
  home: 'https://rafooneh.com/media/catalog/product/cache/13fb5134717fc87cd9b03caf5e4a36c1/2/1/21_1.jpg',
  cellulosic: 'https://rafooneh.com/media/catalog/product/cache/13fb5134717fc87cd9b03caf5e4a36c1/d/o/double-lock-bag-25_2_1.jpg',
  car: 'https://rafooneh.com/media/catalog/product/cache/13fb5134717fc87cd9b03caf5e4a36c1/6/2/6261460205754_2.jpg',
  other: 'https://rafooneh.com/media/catalog/product/cache/13fb5134717fc87cd9b03caf5e4a36c1/s/a/sanitary-protective-coating-large.jpg'
};

function parseNum(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val)
    .replace(/,/g, '')
    .replace(/[\u0660-\u0669]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x0660 + 0x0030))
    .replace(/[\u06f0-\u06f9]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x06f0 + 0x0030))
    .trim();
  const num = Number(cleaned);
  return isNaN(num) ? 0 : num;
}

function findColumnIndices(headerRow) {
  const headers = (headerRow || []).map(h => String(h || '').trim());

  let codeIdx = headers.findIndex(h => h === 'کد کالا' || h === 'کد');
  if (codeIdx === -1) codeIdx = headers.findIndex(h => h.includes('کد'));

  let nameIdx = headers.findIndex(h => h === 'شرح کالا' || h === 'نام کالا' || h === 'نام');
  if (nameIdx === -1) nameIdx = headers.findIndex(h => h.includes('شرح') || h.includes('نام') || h.includes('عنوان'));

  let brandIdx = headers.findIndex(h => h === 'برند' || h === 'سازنده' || h === 'مارک' || h === 'برند کالا' || h.toLowerCase() === 'brand');

  let stockIdx = headers.findIndex(h => h === 'موجودی' || h === 'موجودی انبار' || h === 'موجودی فعلی');
  if (stockIdx === -1) stockIdx = headers.findIndex(h => h.includes('موجودی') && !h.includes('قبلی'));

  let deliveryPriceIdx = headers.findIndex(h => h === 'قیمت تحویل' || h === 'قیمت تحویل (ریال)' || h === 'قیمت تحویل(ریال)' || h === 'نرخ تحویل');
  if (deliveryPriceIdx === -1) {
    deliveryPriceIdx = headers.findIndex(h => h.includes('قیمت تحویل') || h.includes('نرخ تحویل'));
  }

  let buyPriceIdx = headers.findIndex(h => h === 'قیمت خرید' || h === 'قیمت خرید (ریال)' || h === 'قیمت خرید(ریال)' || h === 'نرخ خرید');
  if (buyPriceIdx === -1) {
    buyPriceIdx = headers.findIndex(h => h.includes('خرید'));
  }

  let consumerPriceIdx = headers.findIndex(h => h === 'قیمت مصرف' || h === 'قیمت مصرف کننده');
  if (consumerPriceIdx === -1) {
    consumerPriceIdx = headers.findIndex(h => h.includes('مصرف'));
  }

  let packingIdx = headers.findIndex(h => h.includes('کارتن') || h.includes('بسته') || h.includes('تعداد در'));

  // Fallbacks if header labels are missing
  if (codeIdx === -1) codeIdx = 0;
  if (nameIdx === -1) nameIdx = 1;
  if (stockIdx === -1) stockIdx = 4; // Column E (index 4)
  if (deliveryPriceIdx === -1) deliveryPriceIdx = 7;
  if (buyPriceIdx === -1) buyPriceIdx = 6;
  if (consumerPriceIdx === -1) consumerPriceIdx = 9;
  if (packingIdx === -1) packingIdx = 5;

  return { codeIdx, nameIdx, brandIdx, stockIdx, deliveryPriceIdx, buyPriceIdx, consumerPriceIdx, packingIdx };
}

function parseExcelAndBuildProducts() {
  try {
    const excelPath = path.join(appDir, 'سفارش 1405.xlsx');
    if (!fs.existsSync(excelPath)) {
      console.log('[Excel Watcher] File سفارش 1405.xlsx does not exist.');
      return null;
    }

    const workbook = XLSX.readFile(excelPath);
    const sheetName = workbook.SheetNames[0] || 'سفارش 1';
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rows.length < 2) return null;

    const { codeIdx, nameIdx, stockIdx, deliveryPriceIdx, buyPriceIdx, consumerPriceIdx, packingIdx } = findColumnIndices(rows[0]);

    const excelProducts = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r[codeIdx] === undefined || !r[nameIdx]) continue;

      const delPrice = Math.round(parseNum(r[deliveryPriceIdx]) || parseNum(r[7]) || parseNum(r[8]) || parseNum(r[9]) || 0);
      const buyPrice = Math.round(parseNum(r[buyPriceIdx]) || parseNum(r[6]) || 0);
      const consPrice = Math.round(parseNum(r[consumerPriceIdx]) || 0);
      const pack = parseNum(r[packingIdx]) || 1;
      const stock = parseNum(r[stockIdx]) || parseNum(r[4]) || 0;

      excelProducts.push({
        code: r[codeIdx],
        name: String(r[nameIdx]).trim(),
        deliveryPrice: delPrice,
        buyPrice: buyPrice,
        consumerPrice: consPrice,
        packing: pack,
        stock: stock
      });
    }

    let scraped = [];
    const scrapedPath = path.join(appDir, 'scraped_rafooneh.json');
    if (fs.existsSync(scrapedPath)) {
      scraped = JSON.parse(fs.readFileSync(scrapedPath, 'utf8'));
    }

    const result = excelProducts.map(p => {
      const cat = categorize(p.name);
      const cleanName = p.name.replace(/[0-9]/g, '');
      const words = cleanName.split(' ').filter(w => w.length >= 3 && !['مایع', 'کیلویی', 'گرمی', 'لیتری', 'عدد', 'برند'].includes(w));

      let bestImg = null;
      let maxScore = 0;

      for (const s of scraped) {
        let score = 0;
        for (const w of words) {
          if (s.title.includes(w)) score += 2;
        }
        const colors = ['سبز', 'نارنجی', 'صورتی', 'بنفش', 'آبی', 'زرد', 'کرمی', 'قرمز', 'سفید'];
        for (const c of colors) {
          if (p.name.includes(c) && s.title.includes(c)) score += 3;
        }

        if (score > maxScore) {
          maxScore = score;
          bestImg = s.src;
        }
      }

      if (!bestImg || maxScore < 2) {
        bestImg = categoryDefaultImages[cat.id] || categoryDefaultImages.other;
      }

      const badge = p.stock <= 0 ? 'ناموجود' : (p.stock <= 5 ? `تعداد محدود (${p.stock} عدد)` : null);
      const categoryDescriptions = {
        handwash: 'مایع دستشویی رافونه با فرمولاسیون نرم‌کننده و مرطوب‌کننده پوست دست، دارای رایحه مطبوع و سازگار با انواع پوست بدون ایجاد خشکی و حساسیت.',
        dishwash: 'مایع ظرفشویی رافونه غلیظ و با قدرت چربی‌زدایی فوق‌العاده بالا، درخشان‌کننده ظروف، دارای گلیسیرین جهت محافظت از پوست دست.',
        laundry: 'شوینده لباس رافونه محافظ بافت و رنگ پارچه، مانع از بور شدن و کدری لباس‌ها با رایحه ماندگار و قدرت لکه‌بری عالی.',
        cleaners: 'پاک‌کننده و اسپری چندمنظوره رافونه تمیزکننده سریع و آسان سطوح، چربی‌زدای قوی بدون برجا گذاشتن لکه و رد آب.',
        sanitary: 'جرم‌گیر و ضدعفونی‌کننده رافونه از بین برنده ۹۹.۹٪ باکتری‌ها و جرم‌های سرسخت، درخشان‌کننده سرویس بهداشتی و کاشی.',
        home: 'شامپو فرش و موکت رافونه تمیزکننده عمقی الیاف فرش و مبلمان، احیاکننده رنگ و بدون آسیب به بافت فرش.',
        cellulosic: 'محصولات مصرفی و سلولزی رافونه تهیه شده از مواد اولیه مرغوب و بهداشتی، مقاوم و با دوام بالا برای مصارف روزمره خانه.',
        car: 'شوینده خودرو رافونه ایجادکننده لایه محافظ و براق‌کننده بدنه خودرو، چربی‌زدای قوی بدون آسیب به رنگ بدنه.',
        other: 'محصول باکیفیت و استاندارد رافونه تولید شده با بهترین مواد اولیه و فرمولاسیون تخصصی.'
      };
      const desc = categoryDescriptions[cat.id] || categoryDescriptions.other;

      const rawBrand = p.brand || '';
      const brandObj = determineBrand(p.name, rawBrand);

      return {
        id: p.code,
        name: p.name,
        brand: brandObj.id,
        brandName: brandObj.name,
        category: cat.id,
        categoryName: cat.name,
        price: p.deliveryPrice,
        consumerPrice: p.consumerPrice,
        buyPrice: p.buyPrice || 0,
        packing: p.packing,
        stock: p.stock,
        image: bestImg,
        badge: badge,
        description: desc
      };
    });

    const finalProducts = mergeAndSaveProducts(result);
    console.log(`[Excel Watcher] Processed ${finalProducts.length} products (preserved admin price & info updates).`);
    return finalProducts;
  } catch (err) {
    console.error('[Excel Watcher] Error processing Excel file:', err);
    return null;
  }
}

function mergeAndSaveProducts(newProductsList) {
  const existingList = readProductsList();
  const existingMap = new Map();
  existingList.forEach(p => {
    if (p.id) existingMap.set(String(p.id), p);
    if (p.code) existingMap.set(String(p.code), p);
  });

  const processedKeys = new Set();
  const merged = newProductsList.map(np => {
    const key = String(np.id || np.code || '');
    processedKeys.add(key);
    const existing = existingMap.get(key);

    if (existing) {
      return {
        ...np,
        name: existing.name || np.name,
        brand: existing.brand || np.brand,
        brandName: existing.brandName || np.brandName,
        category: existing.category || np.category,
        categoryName: existing.categoryName || np.categoryName,
        price: existing.price !== undefined ? existing.price : np.price,
        consumerPrice: existing.consumerPrice !== undefined ? existing.consumerPrice : np.consumerPrice,
        newPrice: existing.newPrice !== undefined ? existing.newPrice : np.newPrice,
        buyPrice: existing.buyPrice !== undefined ? existing.buyPrice : np.buyPrice,
        image: existing.image || np.image,
        stock: existing.stock !== undefined ? existing.stock : np.stock,
        badge: existing.badge || np.badge,
        description: existing.description || np.description,
        isCustomized: existing.isCustomized,
        updatedAt: existing.updatedAt || np.updatedAt
      };
    }
    return np;
  });

  existingList.forEach(ep => {
    const key = String(ep.id || ep.code || '');
    if (key && !processedKeys.has(key) && ep.isCustomized) {
      merged.push(ep);
    }
  });

  saveProductsList(merged);
  return merged;
}

// Initial check on server start: Load catalog from persistent storage without overwriting
const currentCatalog = readProductsList();
console.log(`[Server Startup] Loaded ${currentCatalog ? currentCatalog.length : 0} products from persistent storage.`);

// API: Get live products dataset
app.get('/api/products', async (req, res) => {
  try {
    let data = await getFreshProductsFromFirestore();
    if (!data || data.length === 0) {
      data = readProductsList();
    }
    const includeAll = req.query.includeAll === 'true';
    const products = includeAll
      ? data
      : data.filter(p => {
          if (p.badge === 'ناموجود') return false;
          if (p.stock !== undefined && p.stock !== null && !isNaN(Number(p.stock))) {
            return Number(p.stock) > 0;
          }
          return true;
        });
    return res.json({ success: true, count: products.length, products });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطا در دریافت لیست محصولات' });
  }
});

// API: Check Supabase DB Connection & Status
app.get('/api/db-status', async (req, res) => {
  try {
    const cloudProducts = await getAllProductsCloudSql();
    return res.json({
      success: true,
      message: 'ارتباط با دیتابیس Supabase برقرار است',
      databaseHost: 'aws-1-eu-west-1.pooler.supabase.com',
      supabaseProductCount: cloudProducts ? cloudProducts.length : 0,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'خطا در ارتباط با دیتابیس Supabase',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Function to parse Google Sheet rows into product format
function processRowsToProducts(rows) {
  let scraped = [];
  const scrapedPath = path.join(appDir, 'scraped_rafooneh.json');
  if (fs.existsSync(scrapedPath)) {
    try {
      scraped = JSON.parse(fs.readFileSync(scrapedPath, 'utf8'));
    } catch (e) {}
  }

  if (!rows || rows.length < 2) return [];

  const { codeIdx, nameIdx, brandIdx, stockIdx, deliveryPriceIdx, buyPriceIdx, consumerPriceIdx, packingIdx } = findColumnIndices(rows[0]);

  const categoryDescriptions = {
    handwash: 'مایع دستشویی رافونه با فرمولاسیون نرم‌کننده و مرطوب‌کننده پوست دست، دارای رایحه مطبوع و سازگار با انواع پوست بدون ایجاد خشکی و حساسیت.',
    dishwash: 'مایع ظرفشویی رافونه غلیظ و با قدرت چربی‌زدایی فوق‌العاده بالا، درخشان‌کننده ظروف، دارای گلیسیرین جهت محافظت از پوست دست.',
    laundry: 'شوینده لباس رافونه محافظ بافت و رنگ پارچه، مانع از بور شدن و کدری لباس‌ها با رایحه ماندگار و قدرت لکه‌بری عالی.',
    cleaners: 'پاک‌کننده و اسپری چندمنظوره رافونه تمیزکننده سریع و آسان سطوح، چربی‌زدای قوی بدون برجا گذاشتن لکه و رد آب.',
    sanitary: 'جرم‌گیر و ضدعفونی‌کننده رافونه از بین برنده ۹۹.۹٪ باکتری‌ها و جرم‌های سرسخت، درخشان‌کننده سرویس بهداشتی و کاشی.',
    home: 'شامپو فرش و موکت رافونه تمیزکننده عمقی الیاف فرش و مبلمان، احیاکننده رنگ و بدون آسیب به بافت فرش.',
    cellulosic: 'محصولات مصرفی و سلولزی رافونه تهیه شده از مواد اولیه مرغوب و بهداشتی، مقاوم و با دوام بالا برای مصارف روزمره خانه.',
    car: 'شوینده خودرو رافونه ایجادکننده لایه محافظ و براق‌کننده بدنه خودرو، چربی‌زدای قوی بدون آسیب به رنگ بدنه.',
    other: 'محصول باکیفیت و استاندارد رافونه تولید شده با بهترین مواد اولیه و فرمولاسیون تخصصی.'
  };

  const sheetProducts = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r[codeIdx] === undefined || !r[nameIdx]) continue;

    const code = String(r[codeIdx]).trim();
    const name = String(r[nameIdx]).trim();
    const rawBrand = brandIdx !== -1 && r[brandIdx] ? String(r[brandIdx]).trim() : '';
    const brandObj = determineBrand(name, rawBrand);
    const stock = parseNum(r[stockIdx]) || parseNum(r[4]) || 0;
    const deliveryPrice = Math.round(parseNum(r[deliveryPriceIdx]) || parseNum(r[7]) || parseNum(r[10]) || parseNum(r[8]) || parseNum(r[2]) || 0);
    const buyPrice = Math.round(parseNum(r[buyPriceIdx]) || parseNum(r[6]) || 0);
    const consumerPrice = Math.round(parseNum(r[consumerPriceIdx]) || parseNum(r[9]) || parseNum(r[3]) || 0);
    const packing = parseNum(r[packingIdx]) || parseNum(r[5]) || 1;

    const cat = categorize(name);
    const cleanName = name.replace(/[0-9]/g, '');
    const words = cleanName.split(' ').filter(w => w.length >= 3 && !['مایع', 'کیلویی', 'گرمی', 'لیتری', 'عدد', 'برند'].includes(w));

    let bestImg = null;
    let maxScore = 0;
    for (const s of scraped) {
      let score = 0;
      for (const w of words) {
        if (s.title.includes(w)) score += 2;
      }
      const colors = ['سبز', 'نارنجی', 'صورتی', 'بنفش', 'آبی', 'زرد', 'کرمی', 'قرمز', 'سفید'];
      for (const c of colors) {
        if (name.includes(c) && s.title.includes(c)) score += 3;
      }
      if (score > maxScore) {
        maxScore = score;
        bestImg = s.src;
      }
    }

    if (!bestImg || maxScore < 2) {
      bestImg = categoryDefaultImages[cat.id] || categoryDefaultImages.other;
    }

    const badge = stock <= 0 ? 'ناموجود' : (stock <= 5 ? `تعداد محدود (${stock} عدد)` : null);
    const desc = categoryDescriptions[cat.id] || categoryDescriptions.other;

    sheetProducts.push({
      id: code,
      name: name,
      brand: brandObj.id,
      brandName: brandObj.name,
      category: cat.id,
      categoryName: cat.name,
      price: deliveryPrice,
      consumerPrice: consumerPrice,
      buyPrice: buyPrice,
      packing: packing,
      stock: stock,
      image: bestImg,
      badge: badge,
      description: desc
    });
  }
  return sheetProducts;
}

// Function to sync directly from a Google Sheet ID
async function syncFromGSheetsId(spreadsheetId) {
  try {
    // 1. Try public CSV export endpoint first
    const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv`;
    const response = await fetch(csvUrl);
    
    if (response.ok) {
      const csvText = await response.text();
      // Check if returned valid CSV or login HTML page
      if (!csvText.includes('<!DOCTYPE html>') && !csvText.includes('show-login-page')) {
        const wb = XLSX.read(csvText, { type: 'string' });
        const sheetName = wb.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
        const products = processRowsToProducts(rows);
        if (products.length > 0) {
          const merged = mergeAndSaveProducts(products);
          console.log(`[Google Sheets Auto-Sync] Successfully updated ${merged.length} products from sheet ${spreadsheetId}`);
          return { success: true, products: merged, count: merged.length };
        }
      }
    }
    return { success: false, reason: 'SHEET_NOT_PUBLIC' };
  } catch (err) {
    console.error('Error syncing from Google Sheets ID:', err);
    return { success: false, reason: 'FETCH_ERROR', error: err.message };
  }
}

// Default target Google Sheet ID from user request (manual sync option)
let activeGSheetId = '1t2sL76hWvxMusDMDu-rgYI4QiGpvGGbDfB2wIDdrgG8';

// API: Google Sheets Sync - Parse spreadsheet data and update products catalog
app.post('/api/gsheets/sync', async (req, res) => {
  try {
    const { spreadsheetId, accessToken, range = 'Sheet1!A1:Z100' } = req.body;
    if (!spreadsheetId) {
      return res.status(400).json({ success: false, message: 'آیدی گوگل شیت (Spreadsheet ID) ارسال نشده است.' });
    }

    activeGSheetId = spreadsheetId;

    // Try CSV fetch first
    const csvResult = await syncFromGSheetsId(spreadsheetId);
    if (csvResult.success) {
      return res.json({
        success: true,
        message: `موفقیت‌آمیز! ${csvResult.count} محصول با موفقیت از گوگل شیت همگام‌سازی شد.`,
        count: csvResult.count,
        products: csvResult.products
      });
    }

    if (csvResult.reason === 'SHEET_NOT_PUBLIC') {
      return res.status(403).json({
        success: false,
        message: 'دسترسی گوگل شیت روی حالت عمومی (Anyone with link) تنظیم نشده است. لطفا در گوگل شیت دکمه Share را بزنید و دسترسی را روی Anyone with link قرار دهید.'
      });
    }

    // Fallback to API v4 if accessToken provided
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
    const headers = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({
        success: false,
        message: 'خطا در دریافت اطلاعات از گوگل شیت. لطفا دسترسی فایل را روی «Anyone with the link can view» قرار دهید.',
        details: errText
      });
    }

    const data = await response.json();
    const rows = data.values || [];
    if (rows.length < 2) {
      return res.status(400).json({ success: false, message: 'گوگل شیت موردنظر اطلاعات کافی یا ردیف محصول ندارد.' });
    }

    const sheetProducts = processRowsToProducts(rows);
    if (sheetProducts.length > 0) {
      const merged = mergeAndSaveProducts(sheetProducts);
      return res.json({
        success: true,
        message: `موفقیت‌آمیز! ${merged.length} محصول با موفقیت از گوگل شیت همگام‌سازی شد.`,
        count: merged.length,
        products: merged
      });
    }

    res.status(400).json({ success: false, message: 'هیچ ردیف معتبری در فایل گوگل شیت یافت نشد.' });
  } catch (err) {
    console.error('Google Sheets sync error:', err);
    res.status(500).json({ success: false, message: 'خطای داخلی در همگام‌سازی گوگل شیت' });
  }
});

// API: Upload Excel and refresh product database
app.post('/api/upload-excel', (req, res) => {
  try {
    if (!req.files || !req.files.excelFile) {
      return res.status(400).json({ success: false, message: 'لطفاً فایل اکسل را انتخاب کنید' });
    }

    const excelFile = req.files.excelFile;
    const savePath = path.join(appDir, 'سفارش 1405.xlsx');

    excelFile.mv(savePath, (err) => {
      if (err) {
        console.error('File save error:', err);
        return res.status(500).json({ success: false, message: 'خطا در ذخیره فایل اکسل' });
      }

      const products = parseExcelAndBuildProducts();
      if (products) {
        res.json({ success: true, message: 'فایل اکسل به‌روزرسانی شد و محصولات و قیمت‌ها به‌صورت خودکار اعمال گردیدند.' });
      } else {
        res.status(500).json({ success: false, message: 'فایل آپلود شد اما در پردازش داده‌ها خطایی رخ داد.' });
      }
    });
  } catch (err) {
    console.error('Upload endpoint error:', err);
    res.status(500).json({ success: false, message: 'خطای سرور در آپلود فایل' });
  }
});

// API: Upload product image file
const handleImageUploadRoute = (req, res) => {
  try {
    const file = req.files && (req.files.image || req.files.file);
    if (!file) {
      return res.status(400).json({ success: false, message: 'فایل تصویری ارسال نشده است.' });
    }

    const mimeType = file.mimetype || 'image/jpeg';
    const base64Data = file.data ? file.data.toString('base64') : '';
    let imageUrl = '';

    if (base64Data) {
      imageUrl = `data:${mimeType};base64,${base64Data}`;
    }

    const uploadsDir = path.join(appDir, 'uploads', 'products');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const ext = path.extname(file.name) || '.jpg';
    const cleanExt = ext.match(/^\.[a-zA-Z0-9]+$/) ? ext : '.jpg';
    const filename = `prod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${cleanExt}`;
    const savePath = path.join(uploadsDir, filename);

    file.mv(savePath, (err) => {
      if (err) {
        console.error('Image save error (disk):', err);
      }
    });

    if (!imageUrl) {
      imageUrl = `/uploads/products/${filename}`;
    }

    res.json({ success: true, url: imageUrl, message: 'تصویر با موفقیت آپلود شد.' });
  } catch (err) {
    console.error('Image upload endpoint error:', err);
    res.status(500).json({ success: false, message: 'خطای سرور در آپلود تصویر' });
  }
};

app.post('/api/upload-image', handleImageUploadRoute);
app.post('/api/admin/upload-image', handleImageUploadRoute);

// CRM: Public order submission from website
app.post('/api/orders', (req, res) => {
  try {
    const { id, customerName, phone, address, note, items, totalAmount, paymentMethod } = req.body || {};

    if (!customerName || !phone || !address) {
      return res.status(400).json({ success: false, message: 'نام، تلفن و آدرس الزامی است' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'سبد خرید خالی است' });
    }

    const order = createOrder({
      id,
      customerName,
      phone,
      address,
      note,
      items,
      totalAmount,
      paymentMethod,
      source: 'website'
    });

    res.json({ success: true, order });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ success: false, message: 'خطا در ثبت سفارش' });
  }
});

// Update order endpoint (PUT/PATCH for public & client integration)
app.put('/api/orders/:id', async (req, res) => {
  try {
    const order = await updateOrder(req.params.id, req.body || {});
    if (!order) {
      return res.status(404).json({ success: false, message: 'سفارش یافت نشد' });
    }
    res.json({
      success: true,
      order: { ...order, statusLabel: getStatusLabel(order.status) },
      message: 'سفارش با موفقیت به روزرسانی شد'
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.patch('/api/orders/:id', async (req, res) => {
  try {
    const order = await updateOrder(req.params.id, req.body || {});
    if (!order) {
      return res.status(404).json({ success: false, message: 'سفارش یافت نشد' });
    }
    res.json({
      success: true,
      order: { ...order, statusLabel: getStatusLabel(order.status) },
      message: 'سفارش با موفقیت به روزرسانی شد'
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Public API: Track/Lookup orders EXCLUSIVELY by order tracking ID (کد پیگیری سفارش)
app.get('/api/orders/track', (req, res) => {
  try {
    const { query, code } = req.query;
    const trackCode = String(code || query || '').trim();
    if (!trackCode || trackCode.length < 3) {
      return res.status(400).json({ success: false, message: 'لطفاً کد پیگیری سفارش معتبر وارد کنید' });
    }
    const q = trackCode.toLowerCase();
    const allOrders = listOrders();
    const matched = allOrders.filter(o =>
      (o.id && String(o.id).toLowerCase().includes(q)) ||
      (o.code && String(o.code).toLowerCase().includes(q))
    );
    const formatted = matched.map(o => ({
      ...o,
      statusLabel: getStatusLabel(o.status)
    }));
    res.json({ success: true, count: formatted.length, orders: formatted });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطا در پیگیری سفارش' });
  }
});

// CRM: Admin authentication
app.post('/api/admin/login', (req, res) => {
  let password = '';
  if (req.body) {
    if (typeof req.body === 'string') {
      try {
        const parsed = JSON.parse(req.body);
        password = parsed.password || parsed.pass || '';
      } catch (e) {
        password = req.body;
      }
    } else if (typeof req.body === 'object') {
      password = req.body.password || req.body.pass || '';
    }
  }
  const result = login(password);
  if (!result.success) {
    return res.status(401).json(result);
  }
  res.json(result);
});

app.post('/api/admin/logout', authMiddleware, (req, res) => {
  logout(req.adminToken);
  res.json({ success: true });
});

app.post('/api/admin/change-password', authMiddleware, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'لطفاً رمز عبور فعلی و جدید را وارد نمایید.' });
  }
  const result = changeAdminPassword(oldPassword, newPassword);
  if (result.success) {
    return res.json(result);
  } else {
    return res.status(400).json(result);
  }
});

// CRM: Admin dashboard & data
app.get('/api/admin/stats', authMiddleware, (req, res) => {
  const { timeframe, from, to } = req.query;
  res.json({ success: true, stats: getDashboardStats({ timeframe, from, to }) });
});

app.get('/api/admin/profit', authMiddleware, (req, res) => {
  const { timeframe } = req.query;
  res.json({ success: true, profitStats: getProfitStats({ timeframe }) });
});

// CRM: Company Payment Calculation & Settlement
app.get('/api/admin/company-payments/stats', authMiddleware, (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const stats = getCompanyPaymentStats({ fromDate, toDate });
    res.json({ success: true, stats });
  } catch (err) {
    console.error('Error in /api/admin/company-payments/stats:', err);
    res.status(500).json({ success: false, message: 'خطا در محاسبه کارکرد: ' + err.message });
  }
});

app.get('/api/admin/company-payments', authMiddleware, (req, res) => {
  try {
    const payments = listCompanyPayments();
    res.json({ success: true, payments });
  } catch (err) {
    console.error('Error in /api/admin/company-payments:', err);
    res.status(500).json({ success: false, message: 'خطا در دریافت تاریخچه پرداختی‌ها: ' + err.message });
  }
});

app.post('/api/admin/company-payments', authMiddleware, (req, res) => {
  try {
    const payment = createCompanyPayment(req.body);
    res.json({ success: true, payment });
  } catch (err) {
    console.error('Error in POST /api/admin/company-payments:', err);
    res.status(500).json({ success: false, message: 'خطا در ثبت تسویه: ' + err.message });
  }
});

app.delete('/api/admin/company-payments/:id', authMiddleware, (req, res) => {
  try {
    const deleted = deleteCompanyPayment(req.params.id);
    res.json({ success: deleted });
  } catch (err) {
    console.error('Error in DELETE /api/admin/company-payments:', err);
    res.status(500).json({ success: false, message: 'خطا در حذف سند تسویه: ' + err.message });
  }
});

// CRM: Purchases / Purchase Invoices
app.get('/api/admin/purchases', authMiddleware, (req, res) => {
  const purchases = listPurchases();
  res.json({ success: true, purchases });
});

app.post('/api/admin/purchases', authMiddleware, (req, res) => {
  try {
    const purchase = createPurchase(req.body);
    res.json({ success: true, purchase, message: 'فاکتور خرید با موفقیت ثبت شد و موجودی انبار به روز رسانی گردید.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطا در ثبت فاکتور خرید: ' + err.message });
  }
});

app.delete('/api/admin/purchases/:id', authMiddleware, (req, res) => {
  const deleted = deletePurchase(req.params.id);
  res.json({ success: deleted });
});

app.get('/api/admin/purchases/:id', authMiddleware, (req, res) => {
  const purchases = listPurchases();
  const purchase = purchases.find(p => String(p.id) === String(req.params.id));
  if (!purchase) {
    return res.status(404).json({ success: false, message: 'فاکتور خرید یافت نشد' });
  }
  res.json({ success: true, purchase });
});

app.patch('/api/admin/purchases/:id', authMiddleware, (req, res) => {
  try {
    const purchase = updatePurchase(req.params.id, req.body);
    if (!purchase) {
      return res.status(404).json({ success: false, message: 'فاکتور خرید یافت نشد' });
    }
    res.json({ success: true, purchase, message: 'فاکتور خرید با موفقیت به روزرسانی شد.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطا در ویرایش فاکتور خرید: ' + err.message });
  }
});

app.put('/api/admin/purchases/:id', authMiddleware, (req, res) => {
  try {
    const purchase = updatePurchase(req.params.id, req.body);
    if (!purchase) {
      return res.status(404).json({ success: false, message: 'فاکتور خرید یافت نشد' });
    }
    res.json({ success: true, purchase, message: 'فاکتور خرید با موفقیت به روزرسانی شد.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطا در ویرایش فاکتور خرید: ' + err.message });
  }
});

app.get('/api/admin/alerts', authMiddleware, (req, res) => {
  res.json({ success: true, alerts: getAdminAlerts() });
});

app.get('/api/admin/orders', authMiddleware, (req, res) => {
  const { status, search, from, to } = req.query;
  const orders = listOrders({ status, search, from, to }).map(o => ({
    ...o,
    statusLabel: getStatusLabel(o.status)
  }));
  res.json({ success: true, orders, statuses: getAllStatuses() });
});

app.get('/api/admin/orders/:id', authMiddleware, (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) {
    return res.status(404).json({ success: false, message: 'سفارش یافت نشد' });
  }
  res.json({
    success: true,
    order: { ...order, statusLabel: getStatusLabel(order.status) },
    statuses: getAllStatuses()
  });
});

app.patch('/api/admin/orders/:id', authMiddleware, async (req, res) => {
  try {
    const order = await updateOrder(req.params.id, req.body || {});
    if (!order) {
      return res.status(404).json({ success: false, message: 'سفارش یافت نشد' });
    }
    res.json({
      success: true,
      order: { ...order, statusLabel: getStatusLabel(order.status) },
      message: 'سفارش با موفقیت به روزرسانی شد'
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/admin/orders/:id', authMiddleware, async (req, res) => {
  try {
    const order = await updateOrder(req.params.id, req.body || {});
    if (!order) {
      return res.status(404).json({ success: false, message: 'سفارش یافت نشد' });
    }
    res.json({
      success: true,
      order: { ...order, statusLabel: getStatusLabel(order.status) },
      message: 'سفارش با موفقیت به روزرسانی شد'
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/admin/orders/:id', authMiddleware, (req, res) => {
  try {
    const success = deleteOrder(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, message: 'سفارش یافت نشد' });
    }
    res.json({ success: true, message: 'سفارش با موفقیت حذف شد' });
  } catch (err) {
    res.status(400).json({ success: false, message: 'خطا در حذف سفارش' });
  }
});

app.get('/api/admin/customers', authMiddleware, (req, res) => {
  const { search } = req.query;
  res.json({ success: true, customers: listCustomers({ search }) });
});

app.get('/api/admin/customers/:id', authMiddleware, (req, res) => {
  const customer = getCustomerById(req.params.id);
  if (!customer) {
    return res.status(404).json({ success: false, message: 'مشتری یافت نشد' });
  }
  res.json({
    success: true,
    customer: {
      ...customer,
      orders: customer.orders.map(o => ({ ...o, statusLabel: getStatusLabel(o.status) }))
    }
  });
});

app.patch('/api/admin/customers/:id', authMiddleware, async (req, res) => {
  const { notes, name, phone, address } = req.body || {};
  const customer = await updateCustomer(req.params.id, { notes, name, phone, address });
  if (!customer) {
    return res.status(404).json({ success: false, message: 'مشتری یافت نشد' });
  }
  res.json({ success: true, customer });
});

app.delete('/api/admin/customers/:id', authMiddleware, async (req, res) => {
  try {
    const success = await deleteCustomer(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, message: 'مشتری یافت نشد' });
    }
    res.json({ success: true, message: 'مشتری با موفقیت حذف شد' });
  } catch (err) {
    res.status(400).json({ success: false, message: 'خطا در حذف مشتری' });
  }
});

app.post('/api/admin/database/clear-test-data', authMiddleware, (req, res) => {
  try {
    clearAllTestData();
    res.json({ success: true, message: 'داده‌های تستی (سفارشات و مشتریان) با موفقیت پاک شدند' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطا در پاکسازی داده‌های تستی' });
  }
});

// API: Admin Inventory & Brand Products Management
app.get('/api/admin/products', authMiddleware, async (req, res) => {
  await refreshProductsFromCloudSql().catch(() => {});
  const { brand, category, search } = req.query;
  const products = await listProducts({ brand, category, search });
  const allProducts = await listProducts({});

  const brandCounts = {
    rafooneh: allProducts.filter(p => p.brand === 'rafooneh').length,
    foreign: allProducts.filter(p => p.brand === 'foreign' || p.brand !== 'rafooneh').length
  };

  res.json({
    success: true,
    count: products.length,
    total: allProducts.length,
    brandCounts,
    products
  });
});

app.post('/api/admin/products', authMiddleware, async (req, res) => {
  try {
    const product = await addProduct(req.body);
    res.json({ success: true, message: 'محصول جدید با موفقیت اضافه شد', product });
  } catch (err) {
    res.status(400).json({ success: false, message: 'خطا در ثبت محصول جدید' });
  }
});

app.patch('/api/admin/products/:id', authMiddleware, async (req, res) => {
  try {
    const product = await updateProduct(req.params.id, req.body);
    if (!product) {
      return res.status(404).json({ success: false, message: 'محصول یافت نشد' });
    }
    res.json({ success: true, message: 'اطلاعات محصول با موفقیت به روزرسانی شد', product });
  } catch (err) {
    res.status(400).json({ success: false, message: 'خطا در ویرایش محصول' });
  }
});

app.delete('/api/admin/products/:id', authMiddleware, async (req, res) => {
  try {
    const success = await deleteProduct(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, message: 'محصول یافت نشد' });
    }
    res.json({ success: true, message: 'محصول با موفقیت حذف شد' });
  } catch (err) {
    res.status(400).json({ success: false, message: 'خطا در حذف محصول' });
  }
});

// API: Google Sheets CRM Status
app.get('/api/admin/gsheets/status', authMiddleware, (req, res) => {
  const productsPath = path.join(appDir, 'products_data.json');
  let productCount = 0;
  let lastSyncTime = null;
  if (fs.existsSync(productsPath)) {
    const stat = fs.statSync(productsPath);
    lastSyncTime = stat.mtime;
    try {
      const data = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
      productCount = data.length;
    } catch(e) {}
  }

  res.json({
    success: true,
    spreadsheetId: activeGSheetId,
    csvUrl: activeGSheetId ? `https://docs.google.com/spreadsheets/d/${activeGSheetId}/gviz/tq?tqx=out:csv` : null,
    productCount,
    lastSyncTime
  });
});

// API: Get Bank Card & Account Settings (Public / Storefront / Invoices)
app.get('/api/settings/bank', (req, res) => {
  try {
    const settings = getBankSettings();
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطا در دریافت اطلاعات حساب بانکی' });
  }
});

// API: Get Bank Settings (Admin)
app.get('/api/admin/settings/bank', authMiddleware, (req, res) => {
  try {
    const settings = getBankSettings();
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطا در دریافت اطلاعات حساب بانکی' });
  }
});

// API: Update Bank Settings (Handler for both public and admin paths)
function handleUpdateBankSettings(req, res) {
  try {
    const { bankName, cardHolder, cardNumber, shabaNumber, accountNumber, description } = req.body || {};
    
    // Clean and validate card number (16 digits)
    let cleanCard = (cardNumber || '').replace(/[^0-9۰-۹]/g, '');
    const persianDigits = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /۸/g, /۹/g];
    for (let i = 0; i < 10; i++) {
      cleanCard = cleanCard.replace(persianDigits[i], String(i));
    }

    let cleanShaba = (shabaNumber || '').trim().toUpperCase();
    for (let i = 0; i < 10; i++) {
      cleanShaba = cleanShaba.replace(persianDigits[i], String(i));
    }
    if (cleanShaba && !cleanShaba.startsWith('IR') && /^[0-9]+$/.test(cleanShaba)) {
      cleanShaba = 'IR' + cleanShaba;
    }

    const updated = saveBankSettings({
      bankName: bankName ? String(bankName).trim() : 'بانک ملی ایران',
      cardHolder: cardHolder ? String(cardHolder).trim() : 'پیمان نوری',
      cardNumber: cleanCard || '6037991823456789',
      shabaNumber: cleanShaba || 'IR120170000000123456789012',
      accountNumber: accountNumber ? String(accountNumber).trim() : '',
      description: description !== undefined ? String(description).trim() : 'لطفاً پس از واریز، تصویر فیش واریزی را به همین واتساپ ارسال فرمایید.'
    });

    res.json({
      success: true,
      message: 'مشخصات حساب بانکی و کارت با موفقیت ذخیره شد.',
      settings: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطا در ذخیره مشخصات حساب بانکی' });
  }
}

app.post('/api/admin/settings/bank', authMiddleware, handleUpdateBankSettings);
app.post('/api/settings/bank', handleUpdateBankSettings);

// API: Get Delivery & Express Settings (Public / Storefront / Admin)
app.get('/api/settings/delivery', (req, res) => {
  try {
    const settings = getDeliverySettings();
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطا در دریافت تنظیمات ارسال و تحویل' });
  }
});

// API: Get Delivery Settings (Admin)
app.get('/api/admin/settings/delivery', authMiddleware, (req, res) => {
  try {
    const settings = getDeliverySettings();
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطا در دریافت تنظیمات ارسال و تحویل' });
  }
});

// API: Update Delivery Settings
function handleUpdateDeliverySettings(req, res) {
  try {
    const body = req.body || {};
    const payload = {};

    if (body.isExpressDeliveryEnabled !== undefined) {
      if (typeof body.isExpressDeliveryEnabled === 'boolean') {
        payload.isExpressDeliveryEnabled = body.isExpressDeliveryEnabled;
      } else if (body.isExpressDeliveryEnabled === 'false' || body.isExpressDeliveryEnabled === 0 || body.isExpressDeliveryEnabled === '0') {
        payload.isExpressDeliveryEnabled = false;
      } else if (body.isExpressDeliveryEnabled === 'true' || body.isExpressDeliveryEnabled === 1 || body.isExpressDeliveryEnabled === '1') {
        payload.isExpressDeliveryEnabled = true;
      } else {
        payload.isExpressDeliveryEnabled = Boolean(body.isExpressDeliveryEnabled);
      }
    }

    if (body.disabledNoticeMessage !== undefined) {
      payload.disabledNoticeMessage = String(body.disabledNoticeMessage).trim();
    }
    if (body.expressBaseFee !== undefined && !isNaN(Number(body.expressBaseFee))) {
      payload.expressBaseFee = Number(body.expressBaseFee);
    }
    if (body.expressPerKmFee !== undefined && !isNaN(Number(body.expressPerKmFee))) {
      payload.expressPerKmFee = Number(body.expressPerKmFee);
    }
    if (body.expressEstimatedHours !== undefined && !isNaN(Number(body.expressEstimatedHours))) {
      payload.expressEstimatedHours = Number(body.expressEstimatedHours);
    }
    if (body.warehouseAddress !== undefined) {
      payload.warehouseAddress = String(body.warehouseAddress).trim();
    }
    if (body.warehouseLat !== undefined && !isNaN(Number(body.warehouseLat))) {
      payload.warehouseLat = Number(body.warehouseLat);
    }
    if (body.warehouseLng !== undefined && !isNaN(Number(body.warehouseLng))) {
      payload.warehouseLng = Number(body.warehouseLng);
    }

    const updated = saveDeliverySettings(payload);

    res.json({
      success: true,
      message: 'تنظیمات ارسال و تحویل فوری با موفقیت ذخیره شد.',
      settings: updated
    });
  } catch (err) {
    console.error('Save delivery settings error:', err);
    res.status(500).json({ success: false, message: 'خطا در ذخیره تنظیمات ارسال و تحویل' });
  }
}

app.post('/api/admin/settings/delivery', authMiddleware, handleUpdateDeliverySettings);
app.post('/api/settings/delivery', handleUpdateDeliverySettings);

// API: Download SQLite database file
app.get('/api/admin/database/download', authMiddleware, (req, res) => {
  checkpointSqlite();
  const dbPath = path.join(appDir, 'data', 'rafooneh.db');
  if (fs.existsSync(dbPath)) {
    res.download(dbPath, 'rafooneh.db');
  } else {
    res.status(404).json({ success: false, message: 'فایل دیتابیس SQLite یافت نشد.' });
  }
});

// API: Export complete database snapshot as JSON
app.get('/api/admin/database/export-json', authMiddleware, (req, res) => {
  try {
    const products = readProductsList();
    const orders = listOrders();
    const customers = listCustomers();
    const companyPayments = listCompanyPayments();

    const snapshot = {
      exportedAt: new Date().toISOString(),
      productsCount: products.length,
      ordersCount: orders.length,
      customersCount: customers.length,
      companyPaymentsCount: companyPayments.length,
      data: {
        products,
        orders,
        customers,
        companyPayments
      }
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=rafooneh_backup.json');
    res.send(JSON.stringify(snapshot, null, 2));
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطا در خروجی گرفتن از اطلاعات دیتابیس' });
  }
});

app.get(['/admin', '/admin.html'], (req, res) => {
  res.sendFile(path.join(appDir, 'admin.html'));
});

// Store active transactions in memory
const transactions = new Map();

// API: Initiate Payment Request
app.post('/api/payment/request', (e, res) => {
  const { amount, customerName, phone, address, note, items } = e.body || {};

  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, message: 'مبلغ سفارش معتبر نیست' });
  }

  const trackingId = 'REF-' + Math.floor(100000000000 + Math.random() * 900000000000);
  const authority = 'A000000000000000000000000000' + Math.floor(1000 + Math.random() * 9000);

  const paymentData = {
    trackingId,
    authority,
    amount: Number(amount),
    customerName,
    phone,
    address,
    note,
    items,
    createdAt: new Date().toISOString(),
    status: 'PENDING'
  };

  transactions.set(authority, paymentData);

  res.json({
    success: true,
    authority,
    trackingId,
    amount: Number(amount),
    paymentUrl: `/#/payment-gateway?authority=${authority}`
  });
});

// API: Verify Payment
app.post('/api/payment/verify', (req, res) => {
  const { authority, cardNumber } = req.body || {};

  if (!authority || !transactions.has(authority)) {
    return res.status(400).json({ success: false, message: 'تراکنش یافت نشد یا منقضی شده است' });
  }

  const tx = transactions.get(authority);
  tx.status = 'SUCCESS';
  tx.paidAt = new Date().toISOString();
  tx.maskedCard = cardNumber ? cardNumber.replace(/(\d{4})\d{8}(\d{4})/, '$1-****-****-$2') : '6037-****-****-1405';
  tx.refNum = Math.floor(100000000000 + Math.random() * 900000000000).toString();

  transactions.set(authority, tx);

  res.json({
    success: true,
    message: 'پرداخت با موفقیت انجام شد',
    transaction: tx
  });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(appDir, 'admin.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(appDir, 'admin.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(appDir, 'index.html'));
});

if (!process.env.NETLIFY && !process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    initDatabaseSync().catch(err => console.error('Database sync error on startup:', err));
  });
} else {
  // In serverless environment, run initial sync asynchronously once loaded
  initDatabaseSync().catch(err => console.error('Database sync error in serverless:', err));
}

export default app;
export { app };


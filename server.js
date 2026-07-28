import express from 'express';
import fileUpload from 'express-fileupload';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(express.static(__dirname));

// Function to process Excel file 'سفارش 1405.xlsx' automatically on save/change
function categorize(name) {
  if (name.includes('دست') || name.includes('پومپ') || name.includes('پستلی') || name.includes('پاستیلی')) return { id: 'handwash', name: 'مایع دستشویی' };
  if (name.includes('ظرف') || name.includes('گلیسیرین')) return { id: 'dishwash', name: 'مایع ظرفشویی' };
  if (name.includes('لباس') || name.includes('مشکین') || name.includes('رنگین') || name.includes('پودر') || name.includes('نرم کننده')) return { id: 'laundry', name: 'شوینده لباس' };
  if (name.includes('شیشه') || name.includes('پاک کننده') || name.includes('چربی') || name.includes('همه کاره') || name.includes('سطوح') || name.includes('چوب') || name.includes('چرم') || name.includes('شیرآلات') || name.includes('گاز') || name.includes('چند منظوره') || name.includes('اسپری')) return { id: 'cleaners', name: 'پاک‌کننده و اسپری' };
  if (name.includes('جرم') || name.includes('سفید') || name.includes('وایتکس') || name.includes('من') || name.includes('اسیدی') || name.includes('سرویس')) return { id: 'sanitary', name: 'جرم‌گیر و ضدعفونی‌کننده' };
  if (name.includes('فرش') || name.includes('موکت') || name.includes('پرده')) return { id: 'home', name: 'شستشوی خانه و فرش' };
  if (name.includes('کیسه') || name.includes('فریزر') || name.includes('زباله') || name.includes('دستکش') || name.includes('اسکاج') || name.includes('سفره') || name.includes('پد') || name.includes('فویل') || name.includes('محافظ')) return { id: 'cellulosic', name: 'لوازم مصرفی و سلولزی' };
  if (name.includes('خودرو') || name.includes('شامپو ماشین') || name.includes('واکس')) return { id: 'car', name: 'شوینده خودرو و ویژه' };
  return { id: 'other', name: 'سایر شوینده‌ها' };
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

  // Exact match for 'قیمت تحویل' (e.g., column 10) prioritized over 'قیمت تحویل جدید' (column 8)
  let deliveryPriceIdx = headers.findIndex(h => h === 'قیمت تحویل' || h === 'قیمت تحویل (ریال)' || h === 'قیمت تحویل(ریال)' || h === 'نرخ تحویل');
  if (deliveryPriceIdx === -1) {
    deliveryPriceIdx = headers.findIndex(h => h.includes('قیمت تحویل') || h.includes('نرخ تحویل'));
  }

  let consumerPriceIdx = headers.findIndex(h => h === 'قیمت مصرف' || h === 'قیمت مصرف کننده');
  if (consumerPriceIdx === -1) {
    consumerPriceIdx = headers.findIndex(h => h.includes('مصرف'));
  }

  let packingIdx = headers.findIndex(h => h.includes('کارتن') || h.includes('بسته') || h.includes('تعداد در'));

  // Fallbacks if header labels are missing
  if (codeIdx === -1) codeIdx = 0;
  if (nameIdx === -1) nameIdx = 1;
  if (deliveryPriceIdx === -1) deliveryPriceIdx = 10;
  if (consumerPriceIdx === -1) consumerPriceIdx = 9;
  if (packingIdx === -1) packingIdx = 5;

  return { codeIdx, nameIdx, deliveryPriceIdx, consumerPriceIdx, packingIdx };
}

function parseExcelAndBuildProducts() {
  try {
    const excelPath = path.join(__dirname, 'سفارش 1405.xlsx');
    if (!fs.existsSync(excelPath)) {
      console.log('[Excel Watcher] File سفارش 1405.xlsx does not exist.');
      return null;
    }

    const workbook = XLSX.readFile(excelPath);
    const sheetName = workbook.SheetNames[0] || 'سفارش 1';
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rows.length < 2) return null;

    const { codeIdx, nameIdx, deliveryPriceIdx, consumerPriceIdx, packingIdx } = findColumnIndices(rows[0]);

    const excelProducts = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r[codeIdx] === undefined || !r[nameIdx]) continue;

      const delPrice = parseNum(r[deliveryPriceIdx]) || parseNum(r[8]) || parseNum(r[9]) || 0;
      const consPrice = parseNum(r[consumerPriceIdx]) || 0;
      const pack = parseNum(r[packingIdx]) || 1;

      excelProducts.push({
        code: r[codeIdx],
        name: String(r[nameIdx]).trim(),
        deliveryPrice: delPrice,
        consumerPrice: consPrice,
        packing: pack
      });
    }

    let scraped = [];
    const scrapedPath = path.join(__dirname, 'scraped_rafooneh.json');
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

      return {
        id: p.code,
        name: p.name,
        category: cat.id,
        categoryName: cat.name,
        price: p.deliveryPrice,
        consumerPrice: p.consumerPrice,
        packing: p.packing,
        image: bestImg,
        badge: p.packing > 1 ? `کارتن ${p.packing} تایی` : 'تحویل مستقیم',
        description: `محصول اصلی رافونه با کیفیت عالی - ${p.name}. تحویل درب منزل با قیمت اختصاصی تحویل.`
      };
    });

    fs.writeFileSync(path.join(__dirname, 'products_data.json'), JSON.stringify(result, null, 2));
    fs.writeFileSync(path.join(__dirname, 'products_data.js'), `const productsData = ${JSON.stringify(result, null, 2)};\n`);
    console.log(`[Excel Watcher] Automatically processed ${result.length} products from Excel.`);
    return result;
  } catch (err) {
    console.error('[Excel Watcher] Error processing Excel file:', err);
    return null;
  }
}

// Initial parse on server start
parseExcelAndBuildProducts();

// Setup file watcher on 'سفارش 1405.xlsx'
const excelFilePath = path.join(__dirname, 'سفارش 1405.xlsx');
let watchDebounce = null;
if (fs.existsSync(excelFilePath)) {
  fs.watch(excelFilePath, (eventType) => {
    if (eventType === 'change' || eventType === 'rename') {
      if (watchDebounce) clearTimeout(watchDebounce);
      watchDebounce = setTimeout(() => {
        console.log('[Excel Watcher] Detected Excel file modification. Auto-updating products...');
        parseExcelAndBuildProducts();
      }, 500);
    }
  });
}

// API: Get live products dataset
app.get('/api/products', (req, res) => {
  try {
    const jsonPath = path.join(__dirname, 'products_data.json');
    if (fs.existsSync(jsonPath)) {
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      return res.json({ success: true, count: data.length, products: data });
    }
    res.json({ success: true, count: 0, products: [] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطا در دریافت لیست محصولات' });
  }
});

// Function to parse Google Sheet rows into product format
function processRowsToProducts(rows) {
  let scraped = [];
  const scrapedPath = path.join(__dirname, 'scraped_rafooneh.json');
  if (fs.existsSync(scrapedPath)) {
    try {
      scraped = JSON.parse(fs.readFileSync(scrapedPath, 'utf8'));
    } catch (e) {}
  }

  if (!rows || rows.length < 2) return [];

  const { codeIdx, nameIdx, deliveryPriceIdx, consumerPriceIdx, packingIdx } = findColumnIndices(rows[0]);

  const sheetProducts = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r[codeIdx] === undefined || !r[nameIdx]) continue;

    const code = String(r[codeIdx]).trim();
    const name = String(r[nameIdx]).trim();
    const deliveryPrice = parseNum(r[deliveryPriceIdx]) || parseNum(r[10]) || parseNum(r[8]) || parseNum(r[2]) || 0;
    const consumerPrice = parseNum(r[consumerPriceIdx]) || parseNum(r[9]) || parseNum(r[3]) || 0;
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

    sheetProducts.push({
      id: code,
      name: name,
      category: cat.id,
      categoryName: cat.name,
      price: deliveryPrice,
      consumerPrice: consumerPrice,
      packing: packing,
      image: bestImg,
      badge: packing > 1 ? `کارتن ${packing} تایی` : 'تحویل مستقیم',
      description: `محصول اصلی رافونه - ${name}. دریافت مستقیم از گوگل شیت.`
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
          fs.writeFileSync(path.join(__dirname, 'products_data.json'), JSON.stringify(products, null, 2));
          fs.writeFileSync(path.join(__dirname, 'products_data.js'), `const productsData = ${JSON.stringify(products, null, 2)};\n`);
          console.log(`[Google Sheets Auto-Sync] Successfully updated ${products.length} products from sheet ${spreadsheetId}`);
          return { success: true, products, count: products.length };
        }
      }
    }
    return { success: false, reason: 'SHEET_NOT_PUBLIC' };
  } catch (err) {
    console.error('Error syncing from Google Sheets ID:', err);
    return { success: false, reason: 'FETCH_ERROR', error: err.message };
  }
}

// Default target Google Sheet ID from user request
let activeGSheetId = '1t2sL76hWvxMusDMDu-rgYI4QiGpvGGbDfB2wIDdrgG8';

// Sync from default Google Sheet on server startup
syncFromGSheetsId(activeGSheetId);

// Periodically check Google Sheet every 10 seconds for online changes
setInterval(() => {
  if (activeGSheetId) {
    syncFromGSheetsId(activeGSheetId);
  }
}, 10000);

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
      fs.writeFileSync(path.join(__dirname, 'products_data.json'), JSON.stringify(sheetProducts, null, 2));
      fs.writeFileSync(path.join(__dirname, 'products_data.js'), `const productsData = ${JSON.stringify(sheetProducts, null, 2)};\n`);
      return res.json({
        success: true,
        message: `موفقیت‌آمیز! ${sheetProducts.length} محصول با موفقیت از گوگل شیت همگام‌سازی شد.`,
        count: sheetProducts.length,
        products: sheetProducts
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
    const savePath = path.join(__dirname, 'سفارش 1405.xlsx');

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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});


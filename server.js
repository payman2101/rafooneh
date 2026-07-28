import express from 'express';
import fileUpload from 'express-fileupload';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(express.static(__dirname));

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

      try {
        // Re-run script to parse new excel and update products_data.json and products_data.js
        execSync('node process_products.js', { cwd: __dirname });
        res.json({ success: true, message: 'فایل اکسل با موفقیت به‌روزرسانی شد و محصولات و قیمت‌های جدید روی سایت قرار گرفتند.' });
      } catch (procErr) {
        console.error('Process error:', procErr);
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


import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';

let DatabaseSync = null;
try {
  const req = createRequire(import.meta.url);
  const sqliteModule = req('node:' + 'sqlite');
  DatabaseSync = sqliteModule?.DatabaseSync || sqliteModule?.default?.DatabaseSync || null;
} catch (err) {
  // node:sqlite is not available or supported in serverless runtime (e.g. Netlify Functions)
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'rafooneh.db');

let dbInstance = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function ensureCleanDbFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      // Valid SQLite header is at least 100 bytes starting with 'SQLite format 3'
      if (stats.size < 100) {
        fs.unlinkSync(filePath);
        if (fs.existsSync(filePath + '-shm')) try { fs.unlinkSync(filePath + '-shm'); } catch (e) {}
        if (fs.existsSync(filePath + '-wal')) try { fs.unlinkSync(filePath + '-wal'); } catch (e) {}
      }
    }
  } catch (e) {}
}

function initDbSchema(db) {
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      code TEXT,
      name TEXT NOT NULL,
      brand TEXT,
      brandName TEXT,
      category TEXT,
      categoryName TEXT,
      price REAL DEFAULT 0,
      consumerPrice REAL DEFAULT 0,
      newPrice REAL DEFAULT 0,
      buyPrice REAL DEFAULT 0,
      packing INTEGER DEFAULT 1,
      stock INTEGER DEFAULT 0,
      image TEXT,
      badge TEXT,
      description TEXT,
      isCustomized INTEGER DEFAULT 0,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT UNIQUE,
      address TEXT,
      walletBalance REAL DEFAULT 0,
      giftCredit REAL DEFAULT 0,
      passwordHash TEXT,
      walletHistory TEXT,
      totalOrders INTEGER DEFAULT 0,
      totalSpent REAL DEFAULT 0,
      notes TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      lastOrderAt TEXT
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      customerId TEXT,
      customerName TEXT,
      phone TEXT,
      address TEXT,
      note TEXT,
      items TEXT,
      totalAmount REAL DEFAULT 0,
      paymentMethod TEXT,
      status TEXT DEFAULT 'new',
      adminNotes TEXT,
      source TEXT DEFAULT 'website',
      createdAt TEXT,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS company_payments (
      id TEXT PRIMARY KEY,
      paymentDate TEXT,
      fromDate TEXT,
      toDate TEXT,
      totalBuyCost REAL DEFAULT 0,
      totalItemsCount INTEGER DEFAULT 0,
      ordersCount INTEGER DEFAULT 0,
      refNumber TEXT,
      notes TEXT,
      status TEXT,
      items TEXT,
      createdAt TEXT
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      refNumber TEXT,
      supplierName TEXT,
      purchaseDate TEXT,
      totalAmount REAL DEFAULT 0,
      totalItemsCount INTEGER DEFAULT 0,
      notes TEXT,
      items TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS packages (
      id TEXT PRIMARY KEY,
      title TEXT,
      subtitle TEXT,
      badge TEXT,
      badgeColor TEXT,
      image TEXT,
      isActive INTEGER DEFAULT 1,
      items TEXT,
      originalPrice REAL DEFAULT 0,
      packagePrice REAL DEFAULT 0,
      discountPercent REAL DEFAULT 0,
      giftCredit REAL DEFAULT 0,
      bonusItem TEXT,
      stock INTEGER DEFAULT 50,
      description TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );
  `);
}

function runSchemaMigrations(db) {
  try { db.exec('ALTER TABLE customers ADD COLUMN walletBalance REAL DEFAULT 0;'); } catch (e) {}
  try { db.exec('ALTER TABLE customers ADD COLUMN giftCredit REAL DEFAULT 0;'); } catch (e) {}
  try { db.exec('ALTER TABLE customers ADD COLUMN passwordHash TEXT;'); } catch (e) {}
  try { db.exec('ALTER TABLE customers ADD COLUMN walletHistory TEXT;'); } catch (e) {}
}

export function getDb() {
  if (dbInstance) return dbInstance;
  if (!DatabaseSync) return null;

  ensureDataDir();
  ensureCleanDbFile(DB_PATH);

  try {
    dbInstance = new DatabaseSync(DB_PATH);
    initDbSchema(dbInstance);
  } catch (e) {
    try {
      if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
      if (fs.existsSync(DB_PATH + '-shm')) try { fs.unlinkSync(DB_PATH + '-shm'); } catch (err) {}
      if (fs.existsSync(DB_PATH + '-wal')) try { fs.unlinkSync(DB_PATH + '-wal'); } catch (err) {}
      dbInstance = new DatabaseSync(DB_PATH);
      initDbSchema(dbInstance);
    } catch (err) {
      try {
        const tmpPath = path.join('/tmp', 'rafooneh.db');
        ensureCleanDbFile(tmpPath);
        dbInstance = new DatabaseSync(tmpPath);
        initDbSchema(dbInstance);
      } catch (finalErr) {
        console.error('[SQLite] Could not initialize database:', finalErr.message);
        return null;
      }
    }
  }

  if (dbInstance) {
    runSchemaMigrations(dbInstance);
  }

  return dbInstance;
}

// Seed SQLite DB from existing JSON files if SQLite tables are empty
export async function seedSqliteFromJson() {
  const db = getDb();
  if (!db) return;

  // 1. Seed Products
  const prodRow = db.prepare('SELECT COUNT(*) as count FROM products').get();
  if (!prodRow || prodRow.count === 0) {
    const jsonPath = path.join(DATA_DIR, 'products_data.json');
    const rootJsonPath = path.join(process.cwd(), 'products_data.json');
    let products = [];
    if (fs.existsSync(jsonPath)) {
      try { products = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch (e) {}
    } else if (fs.existsSync(rootJsonPath)) {
      try { products = JSON.parse(fs.readFileSync(rootJsonPath, 'utf8')); } catch (e) {}
    }

    if (Array.isArray(products) && products.length > 0) {
      console.log(`[SQLite Seeding] Migrating ${products.length} products to SQLite...`);
      for (const p of products) {
        saveProductSqlite(p, db);
      }
    }
  }

  // 2. Seed Customers
  const custRow = db.prepare('SELECT COUNT(*) as count FROM customers').get();
  if (!custRow || custRow.count === 0) {
    const custJsonPath = path.join(DATA_DIR, 'customers.json');
    const rootCustJsonPath = path.join(process.cwd(), 'customers.json');
    let customers = [];
    if (fs.existsSync(custJsonPath)) {
      try { customers = JSON.parse(fs.readFileSync(custJsonPath, 'utf8')); } catch (e) {}
    } else if (fs.existsSync(rootCustJsonPath)) {
      try { customers = JSON.parse(fs.readFileSync(rootCustJsonPath, 'utf8')); } catch (e) {}
    }
    if (Array.isArray(customers) && customers.length > 0) {
      console.log(`[SQLite Seeding] Migrating ${customers.length} customers to SQLite...`);
      for (const c of customers) {
        saveCustomerSqlite(c, db);
      }
    }
  }

  // 3. Seed Orders
  const orderRow = db.prepare('SELECT COUNT(*) as count FROM orders').get();
  if (!orderRow || orderRow.count === 0) {
    const ordersJsonPath = path.join(DATA_DIR, 'orders.json');
    const rootOrdersJsonPath = path.join(process.cwd(), 'orders.json');
    let orders = [];
    if (fs.existsSync(ordersJsonPath)) {
      try { orders = JSON.parse(fs.readFileSync(ordersJsonPath, 'utf8')); } catch (e) {}
    } else if (fs.existsSync(rootOrdersJsonPath)) {
      try { orders = JSON.parse(fs.readFileSync(rootOrdersJsonPath, 'utf8')); } catch (e) {}
    }
    if (Array.isArray(orders) && orders.length > 0) {
      console.log(`[SQLite Seeding] Migrating ${orders.length} orders to SQLite...`);
      for (const o of orders) {
        saveOrderSqlite(o, db);
      }
    }
  }

  // 4. Seed Company Payments
  const payRow = db.prepare('SELECT COUNT(*) as count FROM company_payments').get();
  if (!payRow || payRow.count === 0) {
    const payJsonPath = path.join(DATA_DIR, 'company_payments.json');
    const rootPayJsonPath = path.join(process.cwd(), 'company_payments.json');
    let payments = [];
    if (fs.existsSync(payJsonPath)) {
      try { payments = JSON.parse(fs.readFileSync(payJsonPath, 'utf8')); } catch (e) {}
    } else if (fs.existsSync(rootPayJsonPath)) {
      try { payments = JSON.parse(fs.readFileSync(rootPayJsonPath, 'utf8')); } catch (e) {}
    }
    if (Array.isArray(payments) && payments.length > 0) {
      console.log(`[SQLite Seeding] Migrating ${payments.length} company payments to SQLite...`);
      for (const p of payments) {
        saveCompanyPaymentSqlite(p, db);
      }
    }
  }

  // 5. Seed Delivery Settings
  const deliveryRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('delivery_settings');
  if (!deliveryRow || !deliveryRow.value) {
    const dJsonPath = path.join(DATA_DIR, 'delivery_settings.json');
    const rootDJsonPath = path.join(process.cwd(), 'delivery_settings.json');
    let deliveryData = null;
    if (fs.existsSync(dJsonPath)) {
      try { deliveryData = JSON.parse(fs.readFileSync(dJsonPath, 'utf8')); } catch (e) {}
    } else if (fs.existsSync(rootDJsonPath)) {
      try { deliveryData = JSON.parse(fs.readFileSync(rootDJsonPath, 'utf8')); } catch (e) {}
    }
    if (deliveryData && typeof deliveryData === 'object') {
      console.log('[SQLite Seeding] Migrating delivery settings to SQLite...');
      saveDeliverySettingsSqlite(deliveryData, db);
    }
  }
}

// CRUD helper functions for Products
export function saveProductSqlite(p, dbConn = null) {
  const db = dbConn || getDb();
  const id = String(p.id || p.code || '');
  if (!id) return;

  const stmt = db.prepare(
    `INSERT INTO products (
      id, code, name, brand, brandName, category, categoryName, price, consumerPrice,
      newPrice, buyPrice, packing, stock, image, badge, description, isCustomized, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      code = excluded.code,
      name = excluded.name,
      brand = excluded.brand,
      brandName = excluded.brandName,
      category = excluded.category,
      categoryName = excluded.categoryName,
      price = excluded.price,
      consumerPrice = excluded.consumerPrice,
      newPrice = excluded.newPrice,
      buyPrice = excluded.buyPrice,
      packing = excluded.packing,
      stock = excluded.stock,
      image = excluded.image,
      badge = excluded.badge,
      description = excluded.description,
      isCustomized = excluded.isCustomized,
      updatedAt = excluded.updatedAt;`
  );

  stmt.run(
    id,
    String(p.code || id),
    p.name || '',
    p.brand || 'rafooneh',
    p.brandName || 'برند رافونه',
    p.category || 'other',
    p.categoryName || 'سایر شوینده‌ها',
    Number(p.price) || 0,
    Number(p.consumerPrice || p.newPrice) || 0,
    Number(p.newPrice || p.consumerPrice) || 0,
    Number(p.buyPrice) || 0,
    Number(p.packing) || 1,
    Number(p.stock) || 0,
    p.image || '',
    p.badge || null,
    p.description || '',
    p.isCustomized ? 1 : 0,
    p.updatedAt || new Date().toISOString()
  );
}

export function saveAllProductsSqlite(products) {
  const db = getDb();
  db.exec('BEGIN TRANSACTION;');
  try {
    for (const p of products) {
      saveProductSqlite(p, db);
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

export function getAllProductsSqlite() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM products ORDER BY name ASC').all();
  return rows.map(r => ({
    ...r,
    isCustomized: Boolean(r.isCustomized)
  }));
}

export function deleteProductSqlite(id) {
  const db = getDb();
  db.prepare('DELETE FROM products WHERE id = ? OR code = ?').run(String(id), String(id));
}

// CRUD helper functions for Customers
export function saveCustomerSqlite(c, dbConn = null) {
  const db = dbConn || getDb();
  const id = String(c.id || '');
  if (!id) return;

  const walletHistoryJson = typeof c.walletHistory === 'string' ? c.walletHistory : JSON.stringify(c.walletHistory || []);

  const stmt = db.prepare(
    `INSERT INTO customers (
      id, name, phone, address, totalOrders, totalSpent, notes, createdAt, updatedAt, lastOrderAt, walletBalance, giftCredit, passwordHash, walletHistory
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      phone = excluded.phone,
      address = excluded.address,
      totalOrders = excluded.totalOrders,
      totalSpent = excluded.totalSpent,
      notes = excluded.notes,
      updatedAt = excluded.updatedAt,
      lastOrderAt = excluded.lastOrderAt,
      walletBalance = excluded.walletBalance,
      giftCredit = excluded.giftCredit,
      passwordHash = excluded.passwordHash,
      walletHistory = excluded.walletHistory;`
  );

  stmt.run(
    id,
    c.name || '',
    c.phone || '',
    c.address || '',
    Number(c.totalOrders) || 0,
    Number(c.totalSpent) || 0,
    c.notes || '',
    c.createdAt || new Date().toISOString(),
    c.updatedAt || new Date().toISOString(),
    c.lastOrderAt || null,
    Number(c.walletBalance) || 0,
    Number(c.giftCredit) || 0,
    c.passwordHash || '',
    walletHistoryJson
  );
}

export function getAllCustomersSqlite() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM customers ORDER BY datetime(updatedAt) DESC').all();
  return rows.map(r => {
    let walletHistory = [];
    if (r.walletHistory) {
      try { walletHistory = JSON.parse(r.walletHistory); } catch (e) {}
    }
    return {
      ...r,
      walletBalance: Number(r.walletBalance) || 0,
      giftCredit: Number(r.giftCredit) || 0,
      walletHistory
    };
  });
}

export function deleteCustomerSqlite(id) {
  const db = getDb();
  db.prepare('DELETE FROM customers WHERE id = ? OR phone = ?').run(String(id), String(id));
}

// CRUD helper functions for Orders
export function saveOrderSqlite(o, dbConn = null) {
  const db = dbConn || getDb();
  const id = String(o.id || '');
  if (!id) return;

  const itemsJson = typeof o.items === 'string' ? o.items : JSON.stringify(o.items || []);

  const stmt = db.prepare(
    `INSERT INTO orders (
      id, customerId, customerName, phone, address, note, items, totalAmount,
      paymentMethod, status, adminNotes, source, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      customerId = excluded.customerId,
      customerName = excluded.customerName,
      phone = excluded.phone,
      address = excluded.address,
      note = excluded.note,
      items = excluded.items,
      totalAmount = excluded.totalAmount,
      paymentMethod = excluded.paymentMethod,
      status = excluded.status,
      adminNotes = excluded.adminNotes,
      source = excluded.source,
      createdAt = excluded.createdAt,
      updatedAt = excluded.updatedAt;`
  );

  stmt.run(
    id,
    o.customerId || '',
    o.customerName || '',
    o.phone || '',
    o.address || '',
    o.note || '',
    itemsJson,
    Number(o.totalAmount) || 0,
    o.paymentMethod || 'cod',
    o.status || 'new',
    o.adminNotes || '',
    o.source || 'website',
    o.createdAt || new Date().toISOString(),
    o.updatedAt || new Date().toISOString()
  );
}

export function getAllOrdersSqlite() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM orders ORDER BY datetime(createdAt) DESC').all();
  return rows.map(r => {
    let items = [];
    try { items = JSON.parse(r.items || '[]'); } catch (e) {}
    return {
      ...r,
      items
    };
  });
}

export function deleteOrderSqlite(id) {
  const db = getDb();
  db.prepare('DELETE FROM orders WHERE id = ?').run(String(id));
}

// CRUD helper functions for Company Payments
export function saveCompanyPaymentSqlite(p, dbConn = null) {
  const db = dbConn || getDb();
  const id = String(p.id || '');
  if (!id) return;

  const itemsJson = typeof p.items === 'string' ? p.items : JSON.stringify(p.items || []);

  const stmt = db.prepare(
    `INSERT INTO company_payments (
      id, paymentDate, fromDate, toDate, totalBuyCost, totalItemsCount,
      ordersCount, refNumber, notes, status, items, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      paymentDate = excluded.paymentDate,
      fromDate = excluded.fromDate,
      toDate = excluded.toDate,
      totalBuyCost = excluded.totalBuyCost,
      totalItemsCount = excluded.totalItemsCount,
      ordersCount = excluded.ordersCount,
      refNumber = excluded.refNumber,
      notes = excluded.notes,
      status = excluded.status,
      items = excluded.items;`
  );

  stmt.run(
    id,
    p.paymentDate || '',
    p.fromDate || '',
    p.toDate || '',
    Number(p.totalBuyCost) || 0,
    Number(p.totalItemsCount) || 0,
    Number(p.ordersCount) || 0,
    p.refNumber || '',
    p.notes || '',
    p.status || 'پرداخت شده',
    itemsJson,
    p.createdAt || new Date().toISOString()
  );
}

export function getAllCompanyPaymentsSqlite() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM company_payments ORDER BY datetime(createdAt) DESC').all();
  return rows.map(r => {
    let items = [];
    try { items = JSON.parse(r.items || '[]'); } catch (e) {}
    return {
      ...r,
      items
    };
  });
}

export function deleteCompanyPaymentSqlite(id) {
  const db = getDb();
  db.prepare('DELETE FROM company_payments WHERE id = ?').run(String(id));
}

export function savePurchaseSqlite(p, dbConn = null) {
  const db = dbConn || getDb();
  const id = String(p.id);
  const itemsJson = typeof p.items === 'string' ? p.items : JSON.stringify(p.items || []);

  const stmt = db.prepare(
    `INSERT INTO purchases (
      id, refNumber, supplierName, purchaseDate, totalAmount,
      totalItemsCount, notes, items, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      refNumber = excluded.refNumber,
      supplierName = excluded.supplierName,
      purchaseDate = excluded.purchaseDate,
      totalAmount = excluded.totalAmount,
      totalItemsCount = excluded.totalItemsCount,
      notes = excluded.notes,
      items = excluded.items,
      createdAt = excluded.createdAt,
      updatedAt = excluded.updatedAt;`
  );

  stmt.run(
    id,
    p.refNumber || '',
    p.supplierName || 'تأمین‌کننده',
    p.purchaseDate || new Date().toISOString(),
    Number(p.totalAmount) || 0,
    Number(p.totalItemsCount) || 0,
    p.notes || '',
    itemsJson,
    p.createdAt || new Date().toISOString(),
    p.updatedAt || new Date().toISOString()
  );
}

export function getAllPurchasesSqlite() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM purchases ORDER BY datetime(purchaseDate) DESC, datetime(createdAt) DESC').all();
  return rows.map(r => {
    let items = [];
    try { items = JSON.parse(r.items || '[]'); } catch (e) {}
    return {
      ...r,
      items
    };
  });
}

export function deletePurchaseSqlite(id) {
  const db = getDb();
  db.prepare('DELETE FROM purchases WHERE id = ?').run(String(id));
}

export function checkpointSqlite() {
  try {
    const db = getDb();
    if (!db) return;
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    console.log('[SQLite] Checkpoint completed before export.');
  } catch (err) {
    console.error('[SQLite] Checkpoint error:', err.message);
  }
}

export function saveSettingSqlite(key, value, dbConn = null) {
  const db = dbConn || getDb();
  if (!db) return;
  const valStr = typeof value === 'string' ? value : JSON.stringify(value);
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO settings (key, value, updatedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updatedAt = excluded.updatedAt
  `);
  stmt.run(String(key), valStr, now);
}

export function getSettingSqlite(key) {
  const db = getDb();
  if (!db) return null;
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(String(key));
    if (!row || !row.value) return null;
    try {
      return JSON.parse(row.value);
    } catch (e) {
      return row.value;
    }
  } catch (err) {
    console.error('[SQLite] Error reading setting:', err.message);
    return null;
  }
}

export function saveDeliverySettingsSqlite(settings, dbConn = null) {
  saveSettingSqlite('delivery_settings', settings, dbConn);
}

export function getDeliverySettingsSqlite() {
  return getSettingSqlite('delivery_settings');
}

export function saveGiftSettingsSqlite(settings, dbConn = null) {
  saveSettingSqlite('gift_settings', settings, dbConn);
}

export function getGiftSettingsSqlite() {
  return getSettingSqlite('gift_settings');
}

export function savePackageSqlite(pkg, dbConn = null) {
  const db = dbConn || getDb();
  if (!db || !pkg || !pkg.id) return;
  const itemsJson = typeof pkg.items === 'string' ? pkg.items : JSON.stringify(pkg.items || []);
  const stmt = db.prepare(`
    INSERT INTO packages (
      id, title, subtitle, badge, badgeColor, image, isActive, items,
      originalPrice, packagePrice, discountPercent, giftCredit, bonusItem, stock, description, createdAt, updatedAt
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      subtitle = excluded.subtitle,
      badge = excluded.badge,
      badgeColor = excluded.badgeColor,
      image = excluded.image,
      isActive = excluded.isActive,
      items = excluded.items,
      originalPrice = excluded.originalPrice,
      packagePrice = excluded.packagePrice,
      discountPercent = excluded.discountPercent,
      giftCredit = excluded.giftCredit,
      bonusItem = excluded.bonusItem,
      stock = excluded.stock,
      description = excluded.description,
      createdAt = excluded.createdAt,
      updatedAt = excluded.updatedAt
  `);
  stmt.run(
    String(pkg.id),
    String(pkg.title || ''),
    String(pkg.subtitle || ''),
    String(pkg.badge || 'ویژه'),
    String(pkg.badgeColor || '#059669'),
    String(pkg.image || ''),
    pkg.isActive !== false ? 1 : 0,
    itemsJson,
    Number(pkg.originalPrice) || 0,
    Number(pkg.packagePrice) || 0,
    Number(pkg.discountPercent) || 0,
    Number(pkg.giftCredit) || 0,
    String(pkg.bonusItem || ''),
    Number(pkg.stock) >= 0 ? Number(pkg.stock) : 50,
    String(pkg.description || ''),
    pkg.createdAt || new Date().toISOString(),
    pkg.updatedAt || new Date().toISOString()
  );
}

export function saveAllPackagesSqlite(packagesList) {
  const db = getDb();
  if (!db || !Array.isArray(packagesList)) return;
  const runTx = db.transaction((list) => {
    for (const pkg of list) {
      savePackageSqlite(pkg, db);
    }
  });
  runTx(packagesList);
}

export function getAllPackagesSqlite() {
  const db = getDb();
  if (!db) return [];
  try {
    const rows = db.prepare('SELECT * FROM packages').all();
    return rows.map(r => ({
      ...r,
      isActive: r.isActive === 1,
      items: typeof r.items === 'string' ? JSON.parse(r.items || '[]') : (r.items || [])
    }));
  } catch (e) {
    console.error('[SQLite] Error reading packages:', e.message);
    return [];
  }
}

export function deletePackageSqlite(id) {
  const db = getDb();
  if (!db || !id) return;
  try {
    db.prepare('DELETE FROM packages WHERE id = ?').run(String(id));
  } catch (e) {
    console.error('[SQLite] Error deleting package:', e.message);
  }
}


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

export function getDb() {
  if (dbInstance) return dbInstance;
  if (!DatabaseSync) return null;

  try {
    ensureDataDir();
    dbInstance = new DatabaseSync(DB_PATH);
  } catch (e) {
    console.warn('[SQLite] Primary DB open warning:', e.message);
    try {
      const tmpPath = path.join('/tmp', 'rafooneh.db');
      dbInstance = new DatabaseSync(tmpPath);
    } catch (err) {
      console.error('[SQLite] Could not open database:', err.message);
      return null;
    }
  }

  if (!dbInstance) return null;

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
  `);
  }

  try {
    initDbSchema(dbInstance);
  } catch (e) {
    console.warn('[SQLite] Schema init warning:', e.message);
    if (e.message && e.message.includes('malformed')) {
      try {
        dbInstance = null;
        if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
        if (fs.existsSync(DB_PATH + '-shm')) fs.unlinkSync(DB_PATH + '-shm');
        if (fs.existsSync(DB_PATH + '-wal')) fs.unlinkSync(DB_PATH + '-wal');
        dbInstance = new DatabaseSync(DB_PATH);
        initDbSchema(dbInstance);
        console.log('[SQLite] Successfully recreated database after malformed error.');
      } catch (err) {
        console.error('[SQLite] Could not recreate malformed database:', err.message);
      }
    }
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

  const stmt = db.prepare(
    `INSERT INTO customers (
      id, name, phone, address, totalOrders, totalSpent, notes, createdAt, updatedAt, lastOrderAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      phone = excluded.phone,
      address = excluded.address,
      totalOrders = excluded.totalOrders,
      totalSpent = excluded.totalSpent,
      notes = excluded.notes,
      updatedAt = excluded.updatedAt,
      lastOrderAt = excluded.lastOrderAt;`
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
    c.lastOrderAt || null
  );
}

export function getAllCustomersSqlite() {
  const db = getDb();
  return db.prepare('SELECT * FROM customers ORDER BY datetime(updatedAt) DESC').all();
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
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    console.log('[SQLite] Checkpoint completed before export.');
  } catch (err) {
    console.error('[SQLite] Checkpoint error:', err.message);
  }
}

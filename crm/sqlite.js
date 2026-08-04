import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'rafooneh.db');

let dbInstance = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export async function getDb() {
  if (dbInstance) return dbInstance;

  ensureDataDir();
  dbInstance = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  // Enable WAL mode for better performance and concurrency
  await dbInstance.exec('PRAGMA journal_mode = WAL;');

  // Create tables if they do not exist
  await dbInstance.exec(`
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
  `);

  console.log('[SQLite Database] Database initialized successfully at', DB_PATH);
  return dbInstance;
}

// Seed SQLite DB from existing JSON files if SQLite tables are empty
export async function seedSqliteFromJson() {
  const db = await getDb();

  // 1. Seed Products
  const prodCount = await db.get('SELECT COUNT(*) as count FROM products');
  if (prodCount.count === 0) {
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
        await saveProductSqlite(p, db);
      }
    }
  }

  // 2. Seed Customers
  const custCount = await db.get('SELECT COUNT(*) as count FROM customers');
  if (custCount.count === 0) {
    const custJsonPath = path.join(DATA_DIR, 'customers.json');
    if (fs.existsSync(custJsonPath)) {
      try {
        const customers = JSON.parse(fs.readFileSync(custJsonPath, 'utf8'));
        if (Array.isArray(customers) && customers.length > 0) {
          console.log(`[SQLite Seeding] Migrating ${customers.length} customers to SQLite...`);
          for (const c of customers) {
            await saveCustomerSqlite(c, db);
          }
        }
      } catch (e) {}
    }
  }

  // 3. Seed Orders
  const orderCount = await db.get('SELECT COUNT(*) as count FROM orders');
  if (orderCount.count === 0) {
    const ordersJsonPath = path.join(DATA_DIR, 'orders.json');
    if (fs.existsSync(ordersJsonPath)) {
      try {
        const orders = JSON.parse(fs.readFileSync(ordersJsonPath, 'utf8'));
        if (Array.isArray(orders) && orders.length > 0) {
          console.log(`[SQLite Seeding] Migrating ${orders.length} orders to SQLite...`);
          for (const o of orders) {
            await saveOrderSqlite(o, db);
          }
        }
      } catch (e) {}
    }
  }

  // 4. Seed Company Payments
  const payCount = await db.get('SELECT COUNT(*) as count FROM company_payments');
  if (payCount.count === 0) {
    const payJsonPath = path.join(DATA_DIR, 'company_payments.json');
    if (fs.existsSync(payJsonPath)) {
      try {
        const payments = JSON.parse(fs.readFileSync(payJsonPath, 'utf8'));
        if (Array.isArray(payments) && payments.length > 0) {
          console.log(`[SQLite Seeding] Migrating ${payments.length} company payments to SQLite...`);
          for (const p of payments) {
            await saveCompanyPaymentSqlite(p, db);
          }
        }
      } catch (e) {}
    }
  }
}

// CRUD helper functions for Products
export async function saveProductSqlite(p, dbConn = null) {
  const db = dbConn || await getDb();
  const id = String(p.id || p.code || '');
  if (!id) return;

  await db.run(
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
      updatedAt = excluded.updatedAt;`,
    [
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
    ]
  );
}

export async function saveAllProductsSqlite(products) {
  const db = await getDb();
  await db.run('BEGIN TRANSACTION;');
  try {
    for (const p of products) {
      await saveProductSqlite(p, db);
    }
    await db.run('COMMIT;');
  } catch (err) {
    await db.run('ROLLBACK;');
    throw err;
  }
}

export async function getAllProductsSqlite() {
  const db = await getDb();
  const rows = await db.all('SELECT * FROM products ORDER BY name ASC');
  return rows.map(r => ({
    ...r,
    isCustomized: Boolean(r.isCustomized)
  }));
}

export async function deleteProductSqlite(id) {
  const db = await getDb();
  await db.run('DELETE FROM products WHERE id = ? OR code = ?', [String(id), String(id)]);
}

// CRUD helper functions for Customers
export async function saveCustomerSqlite(c, dbConn = null) {
  const db = dbConn || await getDb();
  const id = String(c.id || '');
  if (!id) return;

  await db.run(
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
      lastOrderAt = excluded.lastOrderAt;`,
    [
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
    ]
  );
}

export async function getAllCustomersSqlite() {
  const db = await getDb();
  return await db.all('SELECT * FROM customers ORDER BY datetime(updatedAt) DESC');
}

// CRUD helper functions for Orders
export async function saveOrderSqlite(o, dbConn = null) {
  const db = dbConn || await getDb();
  const id = String(o.id || '');
  if (!id) return;

  const itemsJson = typeof o.items === 'string' ? o.items : JSON.stringify(o.items || []);

  await db.run(
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
      updatedAt = excluded.updatedAt;`,
    [
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
    ]
  );
}

export async function getAllOrdersSqlite() {
  const db = await getDb();
  const rows = await db.all('SELECT * FROM orders ORDER BY datetime(createdAt) DESC');
  return rows.map(r => {
    let items = [];
    try { items = JSON.parse(r.items || '[]'); } catch (e) {}
    return {
      ...r,
      items
    };
  });
}

export async function deleteOrderSqlite(id) {
  const db = await getDb();
  await db.run('DELETE FROM orders WHERE id = ?', [String(id)]);
}

// CRUD helper functions for Company Payments
export async function saveCompanyPaymentSqlite(p, dbConn = null) {
  const db = dbConn || await getDb();
  const id = String(p.id || '');
  if (!id) return;

  const itemsJson = typeof p.items === 'string' ? p.items : JSON.stringify(p.items || []);

  await db.run(
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
      items = excluded.items;`,
    [
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
    ]
  );
}

export async function getAllCompanyPaymentsSqlite() {
  const db = await getDb();
  const rows = await db.all('SELECT * FROM company_payments ORDER BY datetime(createdAt) DESC');
  return rows.map(r => {
    let items = [];
    try { items = JSON.parse(r.items || '[]'); } catch (e) {}
    return {
      ...r,
      items
    };
  });
}

export async function deleteCompanyPaymentSqlite(id) {
  const db = await getDb();
  await db.run('DELETE FROM company_payments WHERE id = ?', [String(id)]);
}

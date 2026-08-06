import { db } from '../src/db/index.js';
import { products, customers, orders, companyPayments, purchases } from '../src/db/schema.js';
import { eq, or, sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

export async function initCloudSql() {
  try {
    console.log('[Cloud SQL] Initializing PostgreSQL connection & seeding check...');

    // 1. Check & Seed Products
    const existingProds = await db.select({ count: sql`count(*)` }).from(products);
    const prodCount = Number(existingProds[0]?.count || 0);
    if (prodCount === 0) {
      const jsonPath = path.join(DATA_DIR, 'products_data.json');
      const rootJsonPath = path.join(process.cwd(), 'products_data.json');
      let prodList = [];
      if (fs.existsSync(jsonPath)) {
        try { prodList = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch (e) {}
      } else if (fs.existsSync(rootJsonPath)) {
        try { prodList = JSON.parse(fs.readFileSync(rootJsonPath, 'utf8')); } catch (e) {}
      }
      if (Array.isArray(prodList) && prodList.length > 0) {
        console.log(`[Cloud SQL Seeding] Migrating ${prodList.length} products to PostgreSQL...`);
        await saveAllProductsCloudSql(prodList);
      }
    }

    // 2. Check & Seed Customers
    const existingCusts = await db.select({ count: sql`count(*)` }).from(customers);
    if (Number(existingCusts[0]?.count || 0) === 0) {
      const jsonPath = path.join(DATA_DIR, 'customers.json');
      const rootJsonPath = path.join(process.cwd(), 'customers.json');
      let custs = [];
      if (fs.existsSync(jsonPath)) {
        try { custs = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch (e) {}
      } else if (fs.existsSync(rootJsonPath)) {
        try { custs = JSON.parse(fs.readFileSync(rootJsonPath, 'utf8')); } catch (e) {}
      }
      if (Array.isArray(custs) && custs.length > 0) {
        console.log(`[Cloud SQL Seeding] Migrating ${custs.length} customers to PostgreSQL...`);
        for (const c of custs) {
          await saveCustomerCloudSql(c);
        }
      }
    }

    // 3. Check & Seed Orders
    const existingOrders = await db.select({ count: sql`count(*)` }).from(orders);
    if (Number(existingOrders[0]?.count || 0) === 0) {
      const jsonPath = path.join(DATA_DIR, 'orders.json');
      const rootJsonPath = path.join(process.cwd(), 'orders.json');
      let ords = [];
      if (fs.existsSync(jsonPath)) {
        try { ords = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch (e) {}
      } else if (fs.existsSync(rootJsonPath)) {
        try { ords = JSON.parse(fs.readFileSync(rootJsonPath, 'utf8')); } catch (e) {}
      }
      if (Array.isArray(ords) && ords.length > 0) {
        console.log(`[Cloud SQL Seeding] Migrating ${ords.length} orders to PostgreSQL...`);
        for (const o of ords) {
          await saveOrderCloudSql(o);
        }
      }
    }

    // 4. Check & Seed Company Payments
    const existingPayments = await db.select({ count: sql`count(*)` }).from(companyPayments);
    if (Number(existingPayments[0]?.count || 0) === 0) {
      const jsonPath = path.join(DATA_DIR, 'company_payments.json');
      const rootJsonPath = path.join(process.cwd(), 'company_payments.json');
      let pymts = [];
      if (fs.existsSync(jsonPath)) {
        try { pymts = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch (e) {}
      } else if (fs.existsSync(rootJsonPath)) {
        try { pymts = JSON.parse(fs.readFileSync(rootJsonPath, 'utf8')); } catch (e) {}
      }
      if (Array.isArray(pymts) && pymts.length > 0) {
        console.log(`[Cloud SQL Seeding] Migrating ${pymts.length} company payments to PostgreSQL...`);
        for (const p of pymts) {
          await saveCompanyPaymentCloudSql(p);
        }
      }
    }

    // 5. Check & Seed Purchases
    const existingPurchases = await db.select({ count: sql`count(*)` }).from(purchases);
    if (Number(existingPurchases[0]?.count || 0) === 0) {
      const jsonPath = path.join(DATA_DIR, 'purchases.json');
      const rootJsonPath = path.join(process.cwd(), 'purchases.json');
      let purchs = [];
      if (fs.existsSync(jsonPath)) {
        try { purchs = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch (e) {}
      } else if (fs.existsSync(rootJsonPath)) {
        try { purchs = JSON.parse(fs.readFileSync(rootJsonPath, 'utf8')); } catch (e) {}
      }
      if (Array.isArray(purchs) && purchs.length > 0) {
        console.log(`[Cloud SQL Seeding] Migrating ${purchs.length} purchases to PostgreSQL...`);
        for (const pu of purchs) {
          await savePurchaseCloudSql(pu);
        }
      }
    }

    console.log('[Cloud SQL] Database ready.');
  } catch (err) {
    console.error('[Cloud SQL Initialization Error]:', err.message);
  }
}

// Helper formatting functions
function mapProductToPg(p) {
  const id = String(p.id || p.code || '');
  return {
    id,
    code: String(p.code || id),
    name: p.name || '',
    brand: p.brand || 'rafooneh',
    brandName: p.brandName || 'برند رافونه',
    category: p.category || 'other',
    categoryName: p.categoryName || 'سایر شوینده‌ها',
    price: Number(p.price) || 0,
    consumerPrice: Number(p.consumerPrice || p.newPrice) || 0,
    newPrice: Number(p.newPrice || p.consumerPrice) || 0,
    buyPrice: Number(p.buyPrice) || 0,
    packing: Number(p.packing) || 1,
    stock: Number(p.stock) || 0,
    image: p.image || '',
    badge: p.badge || null,
    description: p.description || '',
    isCustomized: Boolean(p.isCustomized),
    updatedAt: p.updatedAt || new Date().toISOString()
  };
}

export async function saveProductCloudSql(p) {
  if (!p || (!p.id && !p.code)) return;
  const record = mapProductToPg(p);
  try {
    await db.insert(products).values(record).onConflictDoUpdate({
      target: products.id,
      set: {
        code: record.code,
        name: record.name,
        brand: record.brand,
        brandName: record.brandName,
        category: record.category,
        categoryName: record.categoryName,
        price: record.price,
        consumerPrice: record.consumerPrice,
        newPrice: record.newPrice,
        buyPrice: record.buyPrice,
        packing: record.packing,
        stock: record.stock,
        image: record.image,
        badge: record.badge,
        description: record.description,
        isCustomized: record.isCustomized,
        updatedAt: record.updatedAt
      }
    });
  } catch (err) {
    console.error('[Cloud SQL] Error saving product:', err.message);
  }
}

export async function saveAllProductsCloudSql(prodList) {
  if (!Array.isArray(prodList) || prodList.length === 0) return;
  for (const p of prodList) {
    await saveProductCloudSql(p);
  }
}

export async function getAllProductsCloudSql() {
  try {
    const rows = await db.select().from(products);
    return rows;
  } catch (err) {
    console.error('[Cloud SQL] Error reading products:', err.message);
    return [];
  }
}

export async function deleteProductCloudSql(id) {
  try {
    const pid = String(id);
    await db.delete(products).where(or(eq(products.id, pid), eq(products.code, pid)));
  } catch (err) {
    console.error('[Cloud SQL] Error deleting product:', err.message);
  }
}

// Customers
export async function saveCustomerCloudSql(c) {
  if (!c || !c.id) return;
  const id = String(c.id);
  const record = {
    id,
    name: c.name || '',
    phone: c.phone || '',
    address: c.address || '',
    totalOrders: Number(c.totalOrders) || 0,
    totalSpent: Number(c.totalSpent) || 0,
    notes: c.notes || '',
    createdAt: c.createdAt || new Date().toISOString(),
    updatedAt: c.updatedAt || new Date().toISOString(),
    lastOrderAt: c.lastOrderAt || null
  };
  try {
    await db.insert(customers).values(record).onConflictDoUpdate({
      target: customers.id,
      set: {
        name: record.name,
        phone: record.phone,
        address: record.address,
        totalOrders: record.totalOrders,
        totalSpent: record.totalSpent,
        notes: record.notes,
        updatedAt: record.updatedAt,
        lastOrderAt: record.lastOrderAt
      }
    });
  } catch (err) {
    console.error('[Cloud SQL] Error saving customer:', err.message);
  }
}

export async function getAllCustomersCloudSql() {
  try {
    return await db.select().from(customers);
  } catch (err) {
    console.error('[Cloud SQL] Error getting customers:', err.message);
    return [];
  }
}

export async function deleteCustomerCloudSql(id) {
  try {
    const cid = String(id);
    await db.delete(customers).where(or(eq(customers.id, cid), eq(customers.phone, cid)));
  } catch (err) {
    console.error('[Cloud SQL] Error deleting customer:', err.message);
  }
}

// Orders
export async function saveOrderCloudSql(o) {
  if (!o || !o.id) return;
  const id = String(o.id);
  const itemsJson = typeof o.items === 'string' ? o.items : JSON.stringify(o.items || []);
  const record = {
    id,
    customerId: o.customerId || '',
    customerName: o.customerName || '',
    phone: o.phone || '',
    address: o.address || '',
    note: o.note || '',
    items: itemsJson,
    totalAmount: Number(o.totalAmount) || 0,
    paymentMethod: o.paymentMethod || 'cod',
    status: o.status || 'new',
    adminNotes: o.adminNotes || '',
    source: o.source || 'website',
    createdAt: o.createdAt || new Date().toISOString(),
    updatedAt: o.updatedAt || new Date().toISOString()
  };
  try {
    await db.insert(orders).values(record).onConflictDoUpdate({
      target: orders.id,
      set: {
        customerId: record.customerId,
        customerName: record.customerName,
        phone: record.phone,
        address: record.address,
        note: record.note,
        items: record.items,
        totalAmount: record.totalAmount,
        paymentMethod: record.paymentMethod,
        status: record.status,
        adminNotes: record.adminNotes,
        source: record.source,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
      }
    });
  } catch (err) {
    console.error('[Cloud SQL] Error saving order:', err.message);
  }
}

export async function getAllOrdersCloudSql() {
  try {
    const rows = await db.select().from(orders);
    return rows.map(r => {
      let items = [];
      try { items = JSON.parse(r.items || '[]'); } catch (e) {}
      return { ...r, items };
    });
  } catch (err) {
    console.error('[Cloud SQL] Error getting orders:', err.message);
    return [];
  }
}

export async function deleteOrderCloudSql(id) {
  try {
    await db.delete(orders).where(eq(orders.id, String(id)));
  } catch (err) {
    console.error('[Cloud SQL] Error deleting order:', err.message);
  }
}

// Company Payments
export async function saveCompanyPaymentCloudSql(p) {
  if (!p || !p.id) return;
  const id = String(p.id);
  const itemsJson = typeof p.items === 'string' ? p.items : JSON.stringify(p.items || []);
  const record = {
    id,
    paymentDate: p.paymentDate || '',
    fromDate: p.fromDate || '',
    toDate: p.toDate || '',
    totalBuyCost: Number(p.totalBuyCost) || 0,
    totalItemsCount: Number(p.totalItemsCount) || 0,
    ordersCount: Number(p.ordersCount) || 0,
    refNumber: p.refNumber || '',
    notes: p.notes || '',
    status: p.status || 'پرداخت شده',
    items: itemsJson,
    createdAt: p.createdAt || new Date().toISOString()
  };
  try {
    await db.insert(companyPayments).values(record).onConflictDoUpdate({
      target: companyPayments.id,
      set: {
        paymentDate: record.paymentDate,
        fromDate: record.fromDate,
        toDate: record.toDate,
        totalBuyCost: record.totalBuyCost,
        totalItemsCount: record.totalItemsCount,
        ordersCount: record.ordersCount,
        refNumber: record.refNumber,
        notes: record.notes,
        status: record.status,
        items: record.items
      }
    });
  } catch (err) {
    console.error('[Cloud SQL] Error saving company payment:', err.message);
  }
}

export async function getAllCompanyPaymentsCloudSql() {
  try {
    const rows = await db.select().from(companyPayments);
    return rows.map(r => {
      let items = [];
      try { items = JSON.parse(r.items || '[]'); } catch (e) {}
      return { ...r, items };
    });
  } catch (err) {
    console.error('[Cloud SQL] Error getting company payments:', err.message);
    return [];
  }
}

export async function deleteCompanyPaymentCloudSql(id) {
  try {
    await db.delete(companyPayments).where(eq(companyPayments.id, String(id)));
  } catch (err) {
    console.error('[Cloud SQL] Error deleting company payment:', err.message);
  }
}

// Purchases
export async function savePurchaseCloudSql(p) {
  if (!p || !p.id) return;
  const id = String(p.id);
  const itemsJson = typeof p.items === 'string' ? p.items : JSON.stringify(p.items || []);
  const record = {
    id,
    refNumber: p.refNumber || '',
    supplierName: p.supplierName || 'تأمین‌کننده',
    purchaseDate: p.purchaseDate || new Date().toISOString(),
    totalAmount: Number(p.totalAmount) || 0,
    totalItemsCount: Number(p.totalItemsCount) || 0,
    notes: p.notes || '',
    items: itemsJson,
    createdAt: p.createdAt || new Date().toISOString(),
    updatedAt: p.updatedAt || new Date().toISOString()
  };
  try {
    await db.insert(purchases).values(record).onConflictDoUpdate({
      target: purchases.id,
      set: {
        refNumber: record.refNumber,
        supplierName: record.supplierName,
        purchaseDate: record.purchaseDate,
        totalAmount: record.totalAmount,
        totalItemsCount: record.totalItemsCount,
        notes: record.notes,
        items: record.items,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
      }
    });
  } catch (err) {
    console.error('[Cloud SQL] Error saving purchase:', err.message);
  }
}

export async function getAllPurchasesCloudSql() {
  try {
    const rows = await db.select().from(purchases);
    return rows.map(r => {
      let items = [];
      try { items = JSON.parse(r.items || '[]'); } catch (e) {}
      return { ...r, items };
    });
  } catch (err) {
    console.error('[Cloud SQL] Error getting purchases:', err.message);
    return [];
  }
}

export async function deletePurchaseCloudSql(id) {
  try {
    await db.delete(purchases).where(eq(purchases.id, String(id)));
  } catch (err) {
    console.error('[Cloud SQL] Error deleting purchase:', err.message);
  }
}

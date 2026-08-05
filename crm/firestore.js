import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, deleteDoc, getDocs, writeBatch } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

let db = null;
let isInitialized = false;

export function getFirestoreDb() {
  if (db) return db;

  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const app = initializeApp(config);
      db = getFirestore(app, config.firestoreDatabaseId);
      console.log(`[Firestore] Initialized with projectId: ${config.projectId}, databaseId: ${config.firestoreDatabaseId}`);
      return db;
    }
  } catch (err) {
    console.error('[Firestore] Failed to initialize:', err.message);
  }
  return null;
}

function withTimeout(promise, ms = 3000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), ms))
  ]);
}

export async function syncSaveProducts(list) {
  const firestore = getFirestoreDb();
  if (!firestore || !Array.isArray(list) || list.length === 0) return;

  try {
    const batch = writeBatch(firestore);
    for (const prod of list) {
      if (!prod || (!prod.id && !prod.code)) continue;
      const docId = String(prod.id || prod.code);
      const docRef = doc(firestore, 'products', docId);
      const cleanData = JSON.parse(JSON.stringify(prod));
      batch.set(docRef, cleanData, { merge: true });
    }
    await withTimeout(batch.commit(), 4000);
    console.log(`[Firestore] Saved ${list.length} products to Firestore.`);
  } catch (err) {
    console.warn('[Firestore] Notice on saving products to Firestore:', err.message);
  }
}

export async function syncSaveOrder(order) {
  const firestore = getFirestoreDb();
  if (!firestore || !order || !order.id) return;

  try {
    const cleanOrder = JSON.parse(JSON.stringify(order));
    await withTimeout(setDoc(doc(firestore, 'orders', String(order.id)), cleanOrder, { merge: true }), 3000);
    console.log(`[Firestore] Saved order ${order.id} to Firestore.`);
  } catch (err) {
    console.warn(`[Firestore] Notice on saving order ${order.id}:`, err.message);
  }
}

export async function syncDeleteOrder(orderId) {
  const firestore = getFirestoreDb();
  if (!firestore || !orderId) return;

  try {
    await withTimeout(deleteDoc(doc(firestore, 'orders', String(orderId))), 3000);
    console.log(`[Firestore] Deleted order ${orderId} from Firestore.`);
  } catch (err) {
    console.warn(`[Firestore] Notice on deleting order ${orderId}:`, err.message);
  }
}

export async function syncSaveCustomer(customer) {
  const firestore = getFirestoreDb();
  if (!firestore || !customer || !customer.id) return;

  try {
    const cleanCust = JSON.parse(JSON.stringify(customer));
    await withTimeout(setDoc(doc(firestore, 'customers', String(customer.id)), cleanCust, { merge: true }), 3000);
    console.log(`[Firestore] Saved customer ${customer.id} to Firestore.`);
  } catch (err) {
    console.warn(`[Firestore] Notice on saving customer ${customer.id}:`, err.message);
  }
}

export async function syncDeleteCustomer(customerId) {
  const firestore = getFirestoreDb();
  if (!firestore || !customerId) return;

  try {
    await withTimeout(deleteDoc(doc(firestore, 'customers', String(customerId))), 3000);
    console.log(`[Firestore] Deleted customer ${customerId} from Firestore.`);
  } catch (err) {
    console.warn(`[Firestore] Notice on deleting customer ${customerId}:`, err.message);
  }
}

export async function clearFirestoreTestData() {
  const firestore = getFirestoreDb();
  if (!firestore) return;

  try {
    const collectionsToClear = ['orders', 'customers', 'company_payments'];
    for (const colName of collectionsToClear) {
      const snapshot = await withTimeout(getDocs(collection(firestore, colName)), 3000);
      if (!snapshot.empty) {
        const batch = writeBatch(firestore);
        snapshot.forEach(docSnap => {
          batch.delete(docSnap.ref);
        });
        await withTimeout(batch.commit(), 4000);
        console.log(`[Firestore] Cleared all docs in ${colName}`);
      }
    }
  } catch (err) {
    console.warn('[Firestore] Error clearing test data:', err.message);
  }
}

export async function syncSaveCompanyPayment(payment) {
  const firestore = getFirestoreDb();
  if (!firestore || !payment || !payment.id) return;

  try {
    const cleanPayment = JSON.parse(JSON.stringify(payment));
    await withTimeout(setDoc(doc(firestore, 'company_payments', String(payment.id)), cleanPayment, { merge: true }), 3000);
    console.log(`[Firestore] Saved company payment ${payment.id} to Firestore.`);
  } catch (err) {
    console.warn(`[Firestore] Notice on saving company payment ${payment.id}:`, err.message);
  }
}

export async function syncDeleteCompanyPayment(paymentId) {
  const firestore = getFirestoreDb();
  if (!firestore || !paymentId) return;

  try {
    await withTimeout(deleteDoc(doc(firestore, 'company_payments', String(paymentId))), 3000);
    console.log(`[Firestore] Deleted company payment ${paymentId} from Firestore.`);
  } catch (err) {
    console.warn(`[Firestore] Notice on deleting company payment ${paymentId}:`, err.message);
  }
}

export async function initFirestoreSync({ saveProductsList, readProductsList, readJson, writeJson, ORDERS_FILE, CUSTOMERS_FILE, COMPANY_PAYMENTS_FILE }) {
  if (isInitialized) return;
  isInitialized = true;

  const firestore = getFirestoreDb();
  if (!firestore) {
    console.log('[Firestore] Skipping initial sync (Firestore not configured)');
    return;
  }

  try {
    console.log('[Firestore] Performing initial database sync...');

    // 1. Sync Products
    try {
      const prodSnapshot = await withTimeout(getDocs(collection(firestore, 'products')), 3000);
      if (prodSnapshot.empty) {
        const localProducts = readProductsList();
        if (localProducts && localProducts.length > 0) {
          console.log(`[Firestore] Seeding Firestore with ${localProducts.length} local products...`);
          await syncSaveProducts(localProducts);
        }
      } else {
        const firestoreProducts = [];
        prodSnapshot.forEach(docSnap => {
          firestoreProducts.push({ id: docSnap.id, ...docSnap.data() });
        });
        if (firestoreProducts.length > 0) {
          firestoreProducts.sort((a, b) => {
            const numA = parseInt(a.id, 10);
            const numB = parseInt(b.id, 10);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return String(a.id).localeCompare(String(b.id));
          });

          // Local SQLite/JSON products are the single source of truth for products.
          // Local products always take precedence over remote Firestore products to prevent quota errors or stale overrides.
          const localProds = readProductsList();
          const mergedMap = new Map();

          // Load local products first
          localProds.forEach(lp => {
            const key = String(lp.id || lp.code || '');
            if (key) mergedMap.set(key, lp);
          });

          // Only add missing products from Firestore if they don't exist locally
          firestoreProducts.forEach(fp => {
            const key = String(fp.id || fp.code || '');
            if (!key) return;
            if (!mergedMap.has(key)) {
              if (fp.category === 'home' || fp.category === 'car' || fp.id === '1057') {
                fp.category = 'cleaners';
                fp.categoryName = 'پاک‌کننده و اسپری';
              }
              if (fp.brand === 'foreign' || fp.id === '2359') {
                fp.brand = 'foreign';
                fp.brandName = 'محصولات خارجی';
                fp.category = 'imported';
                fp.categoryName = 'محصولات خارجی';
              }
              mergedMap.set(key, fp);
            }
          });

          const merged = Array.from(mergedMap.values()).map(p => {
            if (p.category === 'home' || p.category === 'car' || p.id === '1057') {
              p.category = 'cleaners';
              p.categoryName = 'پاک‌کننده و اسپری';
            }
            if (p.brand === 'foreign' || p.id === '2359' || p.category === 'imported') {
              p.brand = 'foreign';
              p.brandName = 'محصولات خارجی';
              p.category = 'imported';
              p.categoryName = 'محصولات خارجی';
            }
            return p;
          });

          console.log(`[Firestore] Preserved ${merged.length} local SQLite products.`);
          saveProductsList(merged, true);
        }
      }
    } catch (prodErr) {
      console.warn('[Firestore] Product sync notice:', prodErr.message);
    }

    // 2. Sync Orders
    try {
      const orderSnapshot = await withTimeout(getDocs(collection(firestore, 'orders')), 3000);
      if (orderSnapshot.empty) {
        const localOrders = readJson(ORDERS_FILE, []);
        if (localOrders && localOrders.length > 0) {
          console.log(`[Firestore] Seeding Firestore with ${localOrders.length} local orders...`);
          for (const order of localOrders) {
            await syncSaveOrder(order);
          }
        }
      } else {
        const firestoreOrders = [];
        orderSnapshot.forEach(docSnap => {
          firestoreOrders.push({ id: docSnap.id, ...docSnap.data() });
        });
        if (firestoreOrders.length > 0) {
          const localOrders = readJson(ORDERS_FILE, []);
          const localOrderMap = new Map();
          localOrders.forEach(o => localOrderMap.set(String(o.id), o));
          firestoreOrders.forEach(fo => {
            if (!localOrderMap.has(String(fo.id))) {
              localOrderMap.set(String(fo.id), fo);
            }
          });
          const mergedOrders = Array.from(localOrderMap.values());
          writeJson(ORDERS_FILE, mergedOrders);
          console.log(`[Firestore] Loaded ${mergedOrders.length} orders from Firestore/Local.`);
        }
      }
    } catch (orderErr) {
      console.warn('[Firestore] Order sync notice:', orderErr.message);
    }

    // 3. Sync Customers
    try {
      const custSnapshot = await withTimeout(getDocs(collection(firestore, 'customers')), 3000);
      if (custSnapshot.empty) {
        const localCusts = readJson(CUSTOMERS_FILE, []);
        if (localCusts && localCusts.length > 0) {
          console.log(`[Firestore] Seeding Firestore with ${localCusts.length} local customers...`);
          for (const cust of localCusts) {
            await syncSaveCustomer(cust);
          }
        }
      } else {
        const firestoreCusts = [];
        custSnapshot.forEach(docSnap => {
          firestoreCusts.push({ id: docSnap.id, ...docSnap.data() });
        });
        if (firestoreCusts.length > 0) {
          const localCusts = readJson(CUSTOMERS_FILE, []);
          const custMap = new Map();
          localCusts.forEach(c => custMap.set(String(c.id), c));
          firestoreCusts.forEach(fc => {
            if (!custMap.has(String(fc.id))) {
              custMap.set(String(fc.id), fc);
            }
          });
          writeJson(CUSTOMERS_FILE, Array.from(custMap.values()));
          console.log(`[Firestore] Loaded ${custMap.size} customers from Firestore/Local.`);
        }
      }
    } catch (custErr) {
      console.warn('[Firestore] Customer sync notice:', custErr.message);
    }

    // 4. Sync Company Payments
    if (COMPANY_PAYMENTS_FILE) {
      try {
        const paySnapshot = await withTimeout(getDocs(collection(firestore, 'company_payments')), 3000);
        if (paySnapshot.empty) {
          const localPays = readJson(COMPANY_PAYMENTS_FILE, []);
          if (localPays && localPays.length > 0) {
            console.log(`[Firestore] Seeding Firestore with ${localPays.length} local company payments...`);
            for (const pay of localPays) {
              await syncSaveCompanyPayment(pay);
            }
          }
        } else {
          const firestorePays = [];
          paySnapshot.forEach(docSnap => {
            firestorePays.push({ id: docSnap.id, ...docSnap.data() });
          });
          if (firestorePays.length > 0) {
            const localPays = readJson(COMPANY_PAYMENTS_FILE, []);
            const payMap = new Map();
            localPays.forEach(p => payMap.set(String(p.id), p));
            firestorePays.forEach(fp => {
              if (!payMap.has(String(fp.id))) {
                payMap.set(String(fp.id), fp);
              }
            });
            writeJson(COMPANY_PAYMENTS_FILE, Array.from(payMap.values()));
            console.log(`[Firestore] Loaded ${payMap.size} company payments from Firestore/Local.`);
          }
        }
      } catch (payErr) {
        console.warn('[Firestore] Company payments sync notice:', payErr.message);
      }
    }

    console.log('[Firestore] Database sync complete!');
  } catch (err) {
    console.error('[Firestore] Error during initial database sync:', err.message);
  }
}

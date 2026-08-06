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

function withTimeout(promise, ms = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), ms))
  ]);
}

export async function syncSaveProduct(product) {
  const firestore = getFirestoreDb();
  if (!firestore || !product || (!product.id && !product.code)) return;

  try {
    const docId = String(product.id || product.code);
    const docRef = doc(firestore, 'products', docId);
    const cleanData = JSON.parse(JSON.stringify(product));
    await withTimeout(setDoc(docRef, cleanData, { merge: true }), 8000);
    console.log(`[Firestore] Saved single product ${docId} to Firestore.`);
  } catch (err) {
    console.warn(`[Firestore] Notice on saving product ${product.id} to Firestore:`, err.message);
  }
}

export async function syncSaveProducts(list) {
  const firestore = getFirestoreDb();
  if (!firestore || !Array.isArray(list) || list.length === 0) return;

  try {
    const CHUNK_SIZE = 50;
    for (let i = 0; i < list.length; i += CHUNK_SIZE) {
      const chunk = list.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(firestore);
      for (const prod of chunk) {
        if (!prod || (!prod.id && !prod.code)) continue;
        const docId = String(prod.id || prod.code);
        const docRef = doc(firestore, 'products', docId);
        const cleanData = JSON.parse(JSON.stringify(prod));
        batch.set(docRef, cleanData, { merge: true });
      }
      await withTimeout(batch.commit(), 15000);
    }
    console.log(`[Firestore] Saved ${list.length} products to Firestore.`);
  } catch (err) {
    console.warn('[Firestore] Notice on saving products to Firestore:', err.message);
  }
}

export async function syncDeleteProduct(productId) {
  const firestore = getFirestoreDb();
  if (!firestore || !productId) return;

  try {
    const docRef = doc(firestore, 'products', String(productId));
    await withTimeout(setDoc(docRef, { isDeleted: true }, { merge: true }), 3000);
    console.log(`[Firestore] Marked product ${productId} as deleted in Firestore.`);
  } catch (err) {
    console.warn(`[Firestore] Notice on deleting product ${productId}:`, err.message);
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
    const collectionsToClear = ['orders', 'customers', 'company_payments', 'purchases'];
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

export async function syncSavePurchase(purchase) {
  const firestore = getFirestoreDb();
  if (!firestore || !purchase || !purchase.id) return;

  try {
    const cleanPurchase = JSON.parse(JSON.stringify(purchase));
    await withTimeout(setDoc(doc(firestore, 'purchases', String(purchase.id)), cleanPurchase, { merge: true }), 3000);
    console.log(`[Firestore] Saved purchase ${purchase.id} to Firestore.`);
  } catch (err) {
    console.warn(`[Firestore] Notice on saving purchase ${purchase.id}:`, err.message);
  }
}

export async function syncDeletePurchase(purchaseId) {
  const firestore = getFirestoreDb();
  if (!firestore || !purchaseId) return;

  try {
    await withTimeout(deleteDoc(doc(firestore, 'purchases', String(purchaseId))), 3000);
    console.log(`[Firestore] Deleted purchase ${purchaseId} from Firestore.`);
  } catch (err) {
    console.warn(`[Firestore] Notice on deleting purchase ${purchaseId}:`, err.message);
  }
}

export async function initFirestoreSync({ saveProductsList, readProductsList, readJson, writeJson, ORDERS_FILE, CUSTOMERS_FILE, COMPANY_PAYMENTS_FILE, PURCHASES_FILE }) {
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

          // Firestore products are the live source of truth for price, stock, and info updates.
          const localProds = readProductsList();
          const mergedMap = new Map();

          // 1. Load remote Firestore products first (holds live admin updates, custom prices, stock)
          firestoreProducts.forEach(fp => {
            const key = String(fp.id || fp.code || '');
            if (!key) return;
            if (fp.isDeleted) {
              mergedMap.set(key, null); // explicit deleted marker
              return;
            }
            if (fp.category === 'home' || fp.category === 'car' || fp.id === '1057') {
              fp.category = 'cleaners';
              fp.categoryName = 'پاک‌کننده و اسپری';
            }
            if (fp.brand === 'foreign' || fp.id === '2359' || fp.category === 'imported') {
              fp.brand = 'foreign';
              fp.brandName = 'محصولات خارجی';
              fp.category = 'imported';
              fp.categoryName = 'محصولات خارجی';
            }
            mergedMap.set(key, fp);
          });

          // 2. Compare local catalog products with Firestore
          localProds.forEach(lp => {
            const key = String(lp.id || lp.code || '');
            if (!key) return;
            if (lp.category === 'home' || lp.category === 'car' || lp.id === '1057') {
              lp.category = 'cleaners';
              lp.categoryName = 'پاک‌کننده و اسپری';
            }
            if (lp.brand === 'foreign' || lp.id === '2359' || lp.category === 'imported') {
              lp.brand = 'foreign';
              lp.brandName = 'محصولات خارجی';
              lp.category = 'imported';
              lp.categoryName = 'محصولات خارجی';
            }

            if (!mergedMap.has(key)) {
              mergedMap.set(key, lp);
            } else {
              const existingFp = mergedMap.get(key);
              if (existingFp) {
                const localTime = (lp && lp.updatedAt) ? new Date(lp.updatedAt).getTime() : 0;
                const remoteTime = (existingFp && existingFp.updatedAt) ? new Date(existingFp.updatedAt).getTime() : 0;

                if (!isNaN(localTime) && localTime > 0 && localTime >= remoteTime) {
                  // Local product has a newer update -> preserve local changes and sync to Firestore
                  const updatedProd = { ...existingFp, ...lp };
                  mergedMap.set(key, updatedProd);
                  syncSaveProduct(updatedProd);
                } else {
                  // Remote product is newer -> merge so non-conflicting fields (like descriptions) aren't erased
                  const mergedProd = { ...lp, ...existingFp };
                  mergedMap.set(key, mergedProd);
                }
              }
            }
          });

          const merged = Array.from(mergedMap.values()).filter(p => p !== null && !p.isDeleted);
          console.log(`[Firestore] Synced ${merged.length} products (remote Firestore takes precedence).`);
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
          const orderMap = new Map();
          
          // 1. Remote Firestore orders take precedence
          firestoreOrders.forEach(fo => {
            if (fo.id) orderMap.set(String(fo.id), fo);
          });

          // 2. Add local orders missing from Firestore
          localOrders.forEach(lo => {
            if (lo.id && !orderMap.has(String(lo.id))) {
              orderMap.set(String(lo.id), lo);
            }
          });

          const mergedOrders = Array.from(orderMap.values());
          writeJson(ORDERS_FILE, mergedOrders);
          console.log(`[Firestore] Loaded ${mergedOrders.length} live orders from Firestore.`);
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

          // 1. Remote Firestore customers take precedence
          firestoreCusts.forEach(fc => {
            if (fc.id) custMap.set(String(fc.id), fc);
          });

          // 2. Add local customers missing from Firestore
          localCusts.forEach(lc => {
            if (lc.id && !custMap.has(String(lc.id))) {
              custMap.set(String(lc.id), lc);
            }
          });

          writeJson(CUSTOMERS_FILE, Array.from(custMap.values()));
          console.log(`[Firestore] Loaded ${custMap.size} live customers from Firestore.`);
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

            // 1. Remote Firestore company payments take precedence
            firestorePays.forEach(fp => {
              if (fp.id) payMap.set(String(fp.id), fp);
            });

            // 2. Add local payments missing from Firestore
            localPays.forEach(lp => {
              if (lp.id && !payMap.has(String(lp.id))) {
                payMap.set(String(lp.id), lp);
              }
            });

            writeJson(COMPANY_PAYMENTS_FILE, Array.from(payMap.values()));
            console.log(`[Firestore] Loaded ${payMap.size} live company payments from Firestore.`);
          }
        }
      } catch (payErr) {
        console.warn('[Firestore] Company payments sync notice:', payErr.message);
      }
    }

    // 5. Sync Purchases
    if (PURCHASES_FILE) {
      try {
        const purchaseSnapshot = await withTimeout(getDocs(collection(firestore, 'purchases')), 3000);
        if (purchaseSnapshot.empty) {
          const localPurchases = readJson(PURCHASES_FILE, []);
          if (localPurchases && localPurchases.length > 0) {
            console.log(`[Firestore] Seeding Firestore with ${localPurchases.length} local purchases...`);
            for (const pur of localPurchases) {
              await syncSavePurchase(pur);
            }
          }
        } else {
          const firestorePurchases = [];
          purchaseSnapshot.forEach(docSnap => {
            firestorePurchases.push({ id: docSnap.id, ...docSnap.data() });
          });
          if (firestorePurchases.length > 0) {
            const localPurchases = readJson(PURCHASES_FILE, []);
            const purMap = new Map();

            // 1. Remote Firestore purchases take precedence
            firestorePurchases.forEach(fp => {
              if (fp.id) purMap.set(String(fp.id), fp);
            });

            // 2. Add local purchases missing from Firestore
            localPurchases.forEach(lp => {
              if (lp.id && !purMap.has(String(lp.id))) {
                purMap.set(String(lp.id), lp);
              }
            });

            writeJson(PURCHASES_FILE, Array.from(purMap.values()));
            console.log(`[Firestore] Loaded ${purMap.size} live purchases from Firestore.`);
          }
        }
      } catch (purErr) {
        console.warn('[Firestore] Purchases sync notice:', purErr.message);
      }
    }

    console.log('[Firestore] Database sync complete!');
  } catch (err) {
    console.error('[Firestore] Error during initial database sync:', err.message);
  }
}

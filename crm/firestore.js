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
    await batch.commit();
    console.log(`[Firestore] Saved ${list.length} products to Firestore.`);
  } catch (err) {
    console.error('[Firestore] Error saving products to Firestore:', err.message);
  }
}

export async function syncSaveOrder(order) {
  const firestore = getFirestoreDb();
  if (!firestore || !order || !order.id) return;

  try {
    const cleanOrder = JSON.parse(JSON.stringify(order));
    await setDoc(doc(firestore, 'orders', String(order.id)), cleanOrder, { merge: true });
    console.log(`[Firestore] Saved order ${order.id} to Firestore.`);
  } catch (err) {
    console.error(`[Firestore] Error saving order ${order.id}:`, err.message);
  }
}

export async function syncDeleteOrder(orderId) {
  const firestore = getFirestoreDb();
  if (!firestore || !orderId) return;

  try {
    await deleteDoc(doc(firestore, 'orders', String(orderId)));
    console.log(`[Firestore] Deleted order ${orderId} from Firestore.`);
  } catch (err) {
    console.error(`[Firestore] Error deleting order ${orderId}:`, err.message);
  }
}

export async function syncSaveCustomer(customer) {
  const firestore = getFirestoreDb();
  if (!firestore || !customer || !customer.id) return;

  try {
    const cleanCust = JSON.parse(JSON.stringify(customer));
    await setDoc(doc(firestore, 'customers', String(customer.id)), cleanCust, { merge: true });
    console.log(`[Firestore] Saved customer ${customer.id} to Firestore.`);
  } catch (err) {
    console.error(`[Firestore] Error saving customer ${customer.id}:`, err.message);
  }
}

export async function initFirestoreSync({ saveProductsList, readProductsList, readJson, writeJson, ORDERS_FILE, CUSTOMERS_FILE }) {
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
    const prodSnapshot = await getDocs(collection(firestore, 'products'));
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
        console.log(`[Firestore] Loaded ${firestoreProducts.length} products from Firestore into local cache.`);
        saveProductsList(firestoreProducts);
      }
    }

    // 2. Sync Orders
    const orderSnapshot = await getDocs(collection(firestore, 'orders'));
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
        writeJson(ORDERS_FILE, firestoreOrders);
        console.log(`[Firestore] Loaded ${firestoreOrders.length} orders from Firestore.`);
      }
    }

    // 3. Sync Customers
    const custSnapshot = await getDocs(collection(firestore, 'customers'));
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
        writeJson(CUSTOMERS_FILE, firestoreCusts);
        console.log(`[Firestore] Loaded ${firestoreCusts.length} customers from Firestore.`);
      }
    }

    console.log('[Firestore] Database sync complete!');
  } catch (err) {
    console.error('[Firestore] Error during initial database sync:', err.message);
  }
}

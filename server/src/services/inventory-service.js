const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
const pLimit = require("p-limit");
const { run, get, all } = require("../db");
const storeService = require("./store-service");
const { createAlert, shouldDeduplicate } = require("./alert-service");

let _syncRunning = false;

async function syncStoreProducts(store) {
  if (!store.consumer_key || !store.consumer_secret) return null;

  const api = new WooCommerceRestApi({
    url: store.url,
    consumerKey: store.consumer_key,
    consumerSecret: store.consumer_secret,
    version: "wc/v3",
    timeout: 30000,
  });

  let page = 1;
  let allProducts = [];
  while (true) {
    try {
      const { data } = await api.get("products", {
        status: "publish",
        per_page: 100,
        page,
      });
      if (!data || data.length === 0) break;
      allProducts = allProducts.concat(data);
      if (data.length < 100) break;
      page++;
    } catch (err) {
      console.error(`[Inventory] Page ${page} failed for ${store.name}: ${err.message}`);
      break;
    }
  }

  let outOfStock = 0;
  let lowStock = 0;
  let priceChanges = 0;

  for (const product of allProducts) {
    const existing = get(
      "SELECT price, stock_status, stock_quantity FROM product_snapshots WHERE store_id = ? AND product_id = ?",
      [store.id, product.id]
    );

    // Detect price change
    if (existing && existing.price !== null) {
      const oldPrice = parseFloat(existing.price) || 0;
      const newPrice = parseFloat(product.price) || 0;
      if (oldPrice > 0 && newPrice > 0 && oldPrice !== newPrice) {
        priceChanges++;
        const dedupKey = `price_${store.id}_${product.id}`;
        if (!shouldDeduplicate(dedupKey)) {
          createAlert({
            subject: `Price Change: ${product.name} on ${store.name}`,
            message: `${product.name} price changed from $${oldPrice.toFixed(2)} to $${newPrice.toFixed(2)}`,
            storeId: store.id, severity: "medium", type: "inventory", dedupKey,
          });
        }
      }
    }

    // Upsert snapshot
    run(
      `INSERT OR REPLACE INTO product_snapshots
        (store_id, product_id, name, sku, stock_status, stock_quantity, price, regular_price, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [store.id, product.id, product.name, product.sku || null,
       product.stock_status, product.stock_quantity ?? null,
       parseFloat(product.price) || 0, parseFloat(product.regular_price) || 0]
    );

    // Track counts
    if (product.stock_status === "outofstock") outOfStock++;
    if (product.stock_status === "instock" && product.stock_quantity !== null && product.stock_quantity <= 5) lowStock++;
  }

  // Create alerts for out of stock (batch, not per-product)
  if (outOfStock > 0) {
    const dedupKey = `oos_${store.id}`;
    if (!shouldDeduplicate(dedupKey)) {
      createAlert({
        subject: `${outOfStock} products out of stock: ${store.name}`,
        message: `${store.name} has ${outOfStock} out-of-stock products`,
        storeId: store.id, severity: "medium", type: "inventory", dedupKey,
      });
    }
  }
  if (lowStock > 0) {
    const dedupKey = `low_${store.id}`;
    if (!shouldDeduplicate(dedupKey)) {
      createAlert({
        subject: `${lowStock} products low stock: ${store.name}`,
        message: `${store.name} has ${lowStock} products with 5 or fewer units`,
        storeId: store.id, severity: "medium", type: "inventory", dedupKey,
      });
    }
  }

  return { store: store.name, products: allProducts.length, outOfStock, lowStock, priceChanges };
}

async function syncAllStores() {
  if (_syncRunning) return { skipped: true };
  _syncRunning = true;

  try {
    const stores = storeService.getAllStores().filter(s => s.consumer_key && s.consumer_secret);
    const limit = pLimit(3);
    const results = [];
    const errors = [];

    await Promise.all(stores.map(store => limit(async () => {
      try {
        const result = await syncStoreProducts(store);
        if (result) results.push(result);
      } catch (err) {
        console.error(`[Inventory] Failed: ${store.name}: ${err.message}`);
        errors.push({ store: store.name, error: err.message });
      }
    })));

    console.log(`[Inventory] Done. ${results.length} synced, ${errors.length} failed`);
    return { synced: results.length, failed: errors.length, results };
  } finally {
    _syncRunning = false;
  }
}

function getInventorySummary() {
  const total = get("SELECT COUNT(*) as c FROM product_snapshots")?.c || 0;
  const outOfStock = get("SELECT COUNT(*) as c FROM product_snapshots WHERE stock_status = 'outofstock'")?.c || 0;
  const lowStock = get("SELECT COUNT(*) as c FROM product_snapshots WHERE stock_status = 'instock' AND stock_quantity IS NOT NULL AND stock_quantity <= 5")?.c || 0;
  return { total, outOfStock, lowStock };
}

function getOutOfStock() {
  return all(
    `SELECT ps.*, s.name as store_name
     FROM product_snapshots ps
     LEFT JOIN stores s ON ps.store_id = s.id
     WHERE ps.stock_status = 'outofstock'
     ORDER BY s.name, ps.name`,
    []
  );
}

function getLowStock(threshold = 5) {
  return all(
    `SELECT ps.*, s.name as store_name
     FROM product_snapshots ps
     LEFT JOIN stores s ON ps.store_id = s.id
     WHERE ps.stock_status = 'instock' AND ps.stock_quantity IS NOT NULL AND ps.stock_quantity <= ?
     ORDER BY ps.stock_quantity ASC, s.name`,
    [threshold]
  );
}

function getPriceChanges(days = 7) {
  return all(
    `SELECT subject, message, store_id, timestamp
     FROM alerts
     WHERE type = 'inventory' AND subject LIKE 'Price Change:%'
       AND timestamp >= datetime('now', '-' || ? || ' days')
     ORDER BY timestamp DESC`,
    [days]
  );
}

module.exports = { syncStoreProducts, syncAllStores, getInventorySummary, getOutOfStock, getLowStock, getPriceChanges };

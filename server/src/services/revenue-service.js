const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
const pLimit = require("p-limit");
const { run, get, all } = require("../db");
const storeService = require("./store-service");

let _syncRunning = false;

async function syncStoreRevenue(store, afterDate, beforeDate) {
  if (!store.consumer_key || !store.consumer_secret) return null;

  const api = new WooCommerceRestApi({
    url: store.url,
    consumerKey: store.consumer_key,
    consumerSecret: store.consumer_secret,
    version: "wc/v3",
    timeout: 30000,
  });

  let page = 1;
  let allOrders = [];
  while (true) {
    try {
      const { data } = await api.get("orders", {
        after: afterDate + "T00:00:00",
        before: beforeDate + "T23:59:59",
        per_page: 100,
        page,
        orderby: "date",
        order: "asc",
      });
      if (!data || data.length === 0) break;
      allOrders = allOrders.concat(data);
      if (data.length < 100) break;
      page++;
    } catch (err) {
      console.error(`[Revenue] Page ${page} failed for ${store.name}: ${err.message}`);
      break;
    }
  }

  const byDate = {};
  for (const order of allOrders) {
    const date = order.date_created.split("T")[0];
    if (!byDate[date]) {
      byDate[date] = {
        total_revenue: 0, order_count: 0, orders_processing: 0, orders_completed: 0,
        orders_refunded: 0, orders_failed: 0, orders_pending: 0, refund_total: 0,
      };
    }
    const d = byDate[date];
    d.order_count++;
    const total = parseFloat(order.total) || 0;

    switch (order.status) {
      case "processing": d.orders_processing++; d.total_revenue += total; break;
      case "completed":  d.orders_completed++;  d.total_revenue += total; break;
      case "refunded":   d.orders_refunded++;   d.refund_total += total;  break;
      case "failed":     d.orders_failed++;     break;
      case "pending":
      case "on-hold":    d.orders_pending++;    break;
      default:           break;
    }
  }

  for (const [date, d] of Object.entries(byDate)) {
    run(
      `INSERT OR REPLACE INTO revenue_snapshots
        (store_id, date, total_revenue, order_count, orders_processing, orders_completed,
         orders_refunded, orders_failed, orders_pending, refund_total, currency, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', datetime('now'))`,
      [store.id, date, d.total_revenue, d.order_count, d.orders_processing, d.orders_completed,
       d.orders_refunded, d.orders_failed, d.orders_pending, d.refund_total]
    );
  }

  return { store: store.name, days: Object.keys(byDate).length, orders: allOrders.length };
}

async function syncAllStores(options = {}) {
  if (_syncRunning) {
    console.log("[Revenue] Sync already running, skipping");
    return { skipped: true };
  }
  _syncRunning = true;

  try {
    const stores = storeService.getAllStores().filter(s => s.consumer_key && s.consumer_secret);
    const concurrency = options.concurrency || 3;
    const limit = pLimit(concurrency);

    const hasData = get("SELECT COUNT(*) as c FROM revenue_snapshots");
    let afterDate, beforeDate;
    const today = new Date().toISOString().split("T")[0];

    if (!hasData || hasData.c === 0) {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      afterDate = d.toISOString().split("T")[0];
      beforeDate = today;
    } else {
      const d = new Date();
      d.setDate(d.getDate() - 2);
      afterDate = d.toISOString().split("T")[0];
      beforeDate = today;
    }

    console.log(`[Revenue] Syncing ${stores.length} stores from ${afterDate} to ${beforeDate}`);
    const results = [];
    const errors = [];

    await Promise.all(stores.map(store => limit(async () => {
      try {
        const result = await syncStoreRevenue(store, afterDate, beforeDate);
        if (result) results.push(result);
      } catch (err) {
        console.error(`[Revenue] Failed: ${store.name}: ${err.message}`);
        errors.push({ store: store.name, error: err.message });
      }
    })));

    console.log(`[Revenue] Done. ${results.length} synced, ${errors.length} failed`);

    if (hasData && hasData.c > 0) {
      const oldest = get("SELECT MIN(date) as d FROM revenue_snapshots");
      if (oldest && oldest.d) {
        const oldestDate = new Date(oldest.d);
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        if (oldestDate > ninetyDaysAgo) {
          const extendTo = new Date(oldestDate);
          extendTo.setDate(extendTo.getDate() - 30);
          const extendDate = extendTo < ninetyDaysAgo ? ninetyDaysAgo.toISOString().split("T")[0] : extendTo.toISOString().split("T")[0];
          console.log(`[Revenue] Backfill: extending from ${oldest.d} back to ${extendDate}`);
          const backfillLimit = pLimit(1);
          await Promise.all(stores.map(store => backfillLimit(async () => {
            try {
              await syncStoreRevenue(store, extendDate, oldest.d);
            } catch (err) {
              console.error(`[Revenue] Backfill failed: ${store.name}: ${err.message}`);
            }
          })));
        }
      }
    }

    return { synced: results.length, failed: errors.length, errors, results };
  } finally {
    _syncRunning = false;
  }
}

function getRevenueSummary(period, storeId) {
  const { startDate, prevStartDate, prevEndDate } = periodToDates(period);
  const today = new Date().toISOString().split("T")[0];

  const params = [startDate, today];
  const prevParams = [prevStartDate, prevEndDate];
  let storeFilter = "";
  if (storeId) {
    storeFilter = " AND store_id = ?";
    params.push(storeId);
    prevParams.push(storeId);
  }

  const current = get(
    `SELECT
      COALESCE(SUM(total_revenue), 0) as totalRevenue,
      COALESCE(SUM(order_count), 0) as totalOrders,
      COALESCE(SUM(orders_processing), 0) as processingCount,
      COALESCE(SUM(orders_completed), 0) as completedCount,
      COALESCE(SUM(orders_refunded), 0) as refundedCount,
      COALESCE(SUM(orders_failed), 0) as failedCount,
      COALESCE(SUM(orders_pending), 0) as pendingCount,
      COALESCE(SUM(abandoned_carts), 0) as abandonedCarts,
      COALESCE(SUM(refund_total), 0) as refundTotal
     FROM revenue_snapshots
     WHERE date >= ? AND date <= ?${storeFilter}`,
    params
  );

  const previous = get(
    `SELECT
      COALESCE(SUM(total_revenue), 0) as totalRevenue,
      COALESCE(SUM(order_count), 0) as totalOrders
     FROM revenue_snapshots
     WHERE date >= ? AND date <= ?${storeFilter}`,
    prevParams
  );

  const revenueChange = previous.totalRevenue > 0
    ? ((current.totalRevenue - previous.totalRevenue) / previous.totalRevenue * 100).toFixed(1)
    : null;
  const ordersChange = previous.totalOrders > 0
    ? ((current.totalOrders - previous.totalOrders) / previous.totalOrders * 100).toFixed(1)
    : null;

  return {
    ...current,
    revenueChange: revenueChange ? parseFloat(revenueChange) : null,
    ordersChange: ordersChange ? parseFloat(ordersChange) : null,
    period,
  };
}

function getRevenueTimeline(days, storeId) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (days - 1));
  const startStr = startDate.toISOString().split("T")[0];
  const today = new Date().toISOString().split("T")[0];

  const params = [startStr, today];
  let storeFilter = "";
  if (storeId) {
    storeFilter = " AND store_id = ?";
    params.push(storeId);
  }

  const rows = all(
    `SELECT date,
      SUM(total_revenue) as revenue,
      SUM(order_count) as orders,
      SUM(orders_failed) as failed
     FROM revenue_snapshots
     WHERE date >= ? AND date <= ?${storeFilter}
     GROUP BY date
     ORDER BY date ASC`,
    params
  );

  const rowMap = {};
  rows.forEach(r => { rowMap[r.date] = r; });

  const timeline = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const dateStr = d.toISOString().split("T")[0];
    const r = rowMap[dateStr];
    timeline.push({
      date: dateStr,
      revenue: r ? r.revenue : 0,
      orders: r ? r.orders : 0,
      failed: r ? r.failed : 0,
    });
  }

  return timeline;
}

function getRevenueByStore(period) {
  const { startDate } = periodToDates(period);
  const today = new Date().toISOString().split("T")[0];

  return all(
    `SELECT
      rs.store_id,
      s.name as store_name,
      SUM(rs.total_revenue) as revenue,
      SUM(rs.order_count) as orders,
      SUM(rs.orders_failed) as failed,
      CASE WHEN SUM(rs.order_count) > 0
        THEN ROUND(SUM(rs.total_revenue) / SUM(rs.order_count), 2)
        ELSE 0 END as avg_order_value
     FROM revenue_snapshots rs
     LEFT JOIN stores s ON rs.store_id = s.id
     WHERE rs.date >= ? AND rs.date <= ?
     GROUP BY rs.store_id
     ORDER BY revenue DESC`,
    [startDate, today]
  );
}

function getFailedPayments(days, storeId) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (days - 1));
  const startStr = startDate.toISOString().split("T")[0];
  const today = new Date().toISOString().split("T")[0];

  const params = [startStr, today];
  let storeFilter = "";
  if (storeId) {
    storeFilter = " AND store_id = ?";
    params.push(storeId);
  }

  return all(
    `SELECT date,
      SUM(orders_failed) as failed,
      SUM(orders_pending) as pending
     FROM revenue_snapshots
     WHERE date >= ? AND date <= ?${storeFilter}
     GROUP BY date
     ORDER BY date ASC`,
    params
  );
}

function periodToDates(period) {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  let days;

  switch (period) {
    case "today": days = 1; break;
    case "7d":    days = 7; break;
    case "30d":   days = 30; break;
    case "90d":   days = 90; break;
    default:      days = 7;
  }

  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  const startDate = start.toISOString().split("T")[0];

  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (days - 1));

  return {
    startDate,
    endDate: todayStr,
    prevStartDate: prevStart.toISOString().split("T")[0],
    prevEndDate: prevEnd.toISOString().split("T")[0],
  };
}

module.exports = {
  syncStoreRevenue,
  syncAllStores,
  getRevenueSummary,
  getRevenueTimeline,
  getRevenueByStore,
  getFailedPayments,
};

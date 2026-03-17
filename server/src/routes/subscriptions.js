const { Router } = require("express");
const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
const pLimit = require("p-limit");
const storeService = require("../services/store-service");
const { logActivity } = require("../services/activity-service");
const { notifyAdmin } = require("../services/notification-service");
const { fireWebhooks } = require("../services/webhook-service");

const router = Router();

function getWcApi(store) {
  return new WooCommerceRestApi({
    url: store.url,
    consumerKey: store.consumer_key,
    consumerSecret: store.consumer_secret,
    version: "wc/v3",
    timeout: 30000,
  });
}

// Fetch subscriptions from a single store
async function fetchStoreSubscriptions(store, { status, search, perPage = 100 } = {}) {
  const api = getWcApi(store);
  const params = { per_page: perPage, orderby: "date", order: "desc" };
  if (status && status !== "any") params.status = status;
  if (search) params.search = search;

  let allSubs = [];
  let page = 1;
  while (true) {
    try {
      const { data } = await api.get("subscriptions", { ...params, page });
      if (!data || data.length === 0) break;
      allSubs = allSubs.concat(data.map(sub => ({
        id: sub.id,
        store_id: store.id,
        store_name: store.name,
        store_url: store.url,
        status: sub.status,
        customer: {
          id: sub.customer_id,
          name: `${sub.billing?.first_name || ""} ${sub.billing?.last_name || ""}`.trim(),
          email: sub.billing?.email || "",
        },
        billing_period: sub.billing_period,
        billing_interval: sub.billing_interval,
        total: sub.total,
        currency: sub.currency,
        start_date: sub.start_date || sub.date_created,
        next_payment: sub.next_payment_date || null,
        end_date: sub.end_date || null,
        trial_end: sub.trial_end_date || null,
        last_payment: sub.date_paid || sub.last_order_date_paid || null,
        payment_method: sub.payment_method_title || sub.payment_method || "",
        items: (sub.line_items || []).map(li => ({
          name: li.name,
          quantity: li.quantity,
          total: li.total,
          product_id: li.product_id,
        })),
      })));
      if (data.length < perPage) break;
      page++;
      if (page > 10) break; // safety cap
    } catch (err) {
      // WC Subscriptions not installed or API error
      if (err.response?.status === 404) return []; // no subscriptions plugin
      console.error(`[Subscriptions] ${store.name}: ${err.message}`);
      break;
    }
  }
  return allSubs;
}

// GET /api/subscriptions — all subscriptions across all stores
router.get("/subscriptions", async (req, res) => {
  const { status, search, storeId } = req.query;
  const stores = storeService.getAllStores().filter(s => s.consumer_key && s.consumer_secret);
  const limit = pLimit(5);

  let targetStores = stores;
  if (storeId) targetStores = stores.filter(s => s.id === storeId);

  try {
    const results = await Promise.all(
      targetStores.map(store => limit(() =>
        fetchStoreSubscriptions(store, { status, search })
          .catch(err => {
            console.error(`[Subscriptions] ${store.name} error: ${err.message}`);
            return [];
          })
      ))
    );

    const allSubs = results.flat();

    // Sort by next payment date (upcoming first), then by start date
    allSubs.sort((a, b) => {
      if (a.next_payment && b.next_payment) return new Date(a.next_payment) - new Date(b.next_payment);
      if (a.next_payment) return -1;
      if (b.next_payment) return 1;
      return new Date(b.start_date) - new Date(a.start_date);
    });

    // Summary stats
    const stats = {
      total: allSubs.length,
      active: allSubs.filter(s => s.status === "active").length,
      onHold: allSubs.filter(s => s.status === "on-hold").length,
      cancelled: allSubs.filter(s => s.status === "cancelled").length,
      pendingCancel: allSubs.filter(s => s.status === "pending-cancel").length,
      expired: allSubs.filter(s => s.status === "expired").length,
      monthlyRevenue: allSubs
        .filter(s => s.status === "active")
        .reduce((sum, s) => {
          const amt = parseFloat(s.total) || 0;
          if (s.billing_period === "year") return sum + amt / 12;
          if (s.billing_period === "month") return sum + amt / (parseInt(s.billing_interval) || 1);
          if (s.billing_period === "week") return sum + amt * 4.33 / (parseInt(s.billing_interval) || 1);
          if (s.billing_period === "day") return sum + amt * 30 / (parseInt(s.billing_interval) || 1);
          return sum + amt;
        }, 0),
      storesWithSubs: [...new Set(allSubs.map(s => s.store_id))].length,
    };

    res.json({ subscriptions: allSubs, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/subscriptions/:storeId/:subId — single subscription detail
router.get("/subscriptions/:storeId/:subId", async (req, res) => {
  const store = storeService.getStore(req.params.storeId);
  if (!store || !store.consumer_key) return res.status(404).json({ error: "Store not found or no API keys" });

  try {
    const api = getWcApi(store);
    const { data } = await api.get(`subscriptions/${req.params.subId}`);
    res.json({ subscription: data, store: { name: store.name, url: store.url } });
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

// POST /api/subscriptions/:storeId/:subId/cancel — cancel subscription
router.post("/subscriptions/:storeId/:subId/cancel", async (req, res) => {
  const store = storeService.getStore(req.params.storeId);
  if (!store || !store.consumer_key) return res.status(404).json({ error: "Store not found or no API keys" });

  try {
    const api = getWcApi(store);

    // Fetch current state first
    const { data: current } = await api.get(`subscriptions/${req.params.subId}`);
    const customerName = `${current.billing?.first_name || ""} ${current.billing?.last_name || ""}`.trim();
    const productNames = (current.line_items || []).map(li => li.name).join(", ");

    // Cancel
    const { data } = await api.put(`subscriptions/${req.params.subId}`, { status: "cancelled" });

    // Log activity
    logActivity({
      storeId: store.id,
      eventType: "subscription",
      title: `Subscription #${req.params.subId} cancelled — ${customerName}`,
      detail: `${productNames} on ${store.name}. Was $${current.total}/${current.billing_period}.`,
      severity: "warning",
      metadata: { subscriptionId: req.params.subId, customer: customerName, store: store.name },
    });

    notifyAdmin(
      `Subscription cancelled: #${req.params.subId}`,
      `${customerName} — ${productNames} on ${store.name} ($${current.total}/${current.billing_period})`,
      "warning",
      "/subscriptions"
    );

    fireWebhooks("subscription", {
      title: `Subscription #${req.params.subId} cancelled`,
      message: `${customerName} — ${productNames} on ${store.name}`,
    }).catch(() => {});

    res.json({ status: "ok", subscription: { id: data.id, status: data.status } });
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

// POST /api/subscriptions/:storeId/:subId/hold — put on hold
router.post("/subscriptions/:storeId/:subId/hold", async (req, res) => {
  const store = storeService.getStore(req.params.storeId);
  if (!store || !store.consumer_key) return res.status(404).json({ error: "Store not found" });

  try {
    const api = getWcApi(store);
    const { data } = await api.put(`subscriptions/${req.params.subId}`, { status: "on-hold" });

    logActivity({
      storeId: store.id, eventType: "subscription",
      title: `Subscription #${req.params.subId} put on hold`,
      severity: "info",
    });

    res.json({ status: "ok", subscription: { id: data.id, status: data.status } });
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

// POST /api/subscriptions/:storeId/:subId/reactivate — reactivate
router.post("/subscriptions/:storeId/:subId/reactivate", async (req, res) => {
  const store = storeService.getStore(req.params.storeId);
  if (!store || !store.consumer_key) return res.status(404).json({ error: "Store not found" });

  try {
    const api = getWcApi(store);
    const { data } = await api.put(`subscriptions/${req.params.subId}`, { status: "active" });

    logActivity({
      storeId: store.id, eventType: "subscription",
      title: `Subscription #${req.params.subId} reactivated`,
      severity: "success",
    });

    res.json({ status: "ok", subscription: { id: data.id, status: data.status } });
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

module.exports = router;

const { run, get, all } = require("../db");
const { sendEmail } = require("./email-service");
const revenueService = require("./revenue-service");
const disputeService = require("./dispute-service");
const ticketService = require("./ticket-service");
const storeService = require("./store-service");

function getWeekKey() {
  const now = new Date();
  const year = now.getFullYear();
  const oneJan = new Date(year, 0, 1);
  const weekNum = Math.ceil(((now - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}

function wasDigestSent(recipient, storeId = null) {
  const weekKey = getWeekKey();
  if (storeId) {
    return !!get("SELECT 1 FROM digest_sent WHERE recipient = ? AND store_id = ? AND week_key = ?", [recipient, storeId, weekKey]);
  }
  return !!get("SELECT 1 FROM digest_sent WHERE recipient = ? AND store_id IS NULL AND week_key = ?", [recipient, weekKey]);
}

function markDigestSent(recipient, storeId = null) {
  const weekKey = getWeekKey();
  run(
    "INSERT OR IGNORE INTO digest_sent (recipient, store_id, week_key) VALUES (?, ?, ?)",
    [recipient, storeId, weekKey]
  );
}

async function sendAdminDigest() {
  const adminEmail = process.env.ALERT_EMAIL;
  if (!adminEmail) return;

  if (wasDigestSent(adminEmail)) {
    console.log("[Digest] Admin digest already sent this week");
    return;
  }

  const stores = storeService.getAllStores();
  const revenue = revenueService.getRevenueSummary("7d");
  const { total: disputeTotal } = disputeService.getDisputes({ limit: 1 });
  const disputeStats = disputeService.getDisputeStats();
  const ticketStats = ticketService.getTicketStats();

  const storeRevenues = revenueService.getRevenueByStore("7d");

  const topStores = storeRevenues.slice(0, 10).map(s =>
    `  ${s.store_name}: $${(s.revenue || 0).toLocaleString()} (${s.orders} orders)`
  ).join("\n");

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#fff;border-radius:12px;padding:32px;margin-bottom:16px;border:1px solid #e2e8f0">
    <h1 style="margin:0 0 4px;font-size:24px;color:#1e293b">Weekly Digest</h1>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:14px">${stores.length} stores monitored</p>

    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px">
      <div style="flex:1;min-width:120px;background:#f8fafc;border-radius:8px;padding:16px;text-align:center">
        <p style="margin:0;font-size:24px;font-weight:700;color:#1e293b">$${(revenue.totalRevenue || 0).toLocaleString()}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#94a3b8">Revenue (7d)</p>
      </div>
      <div style="flex:1;min-width:120px;background:#f8fafc;border-radius:8px;padding:16px;text-align:center">
        <p style="margin:0;font-size:24px;font-weight:700;color:#1e293b">${revenue.totalOrders || 0}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#94a3b8">Orders (7d)</p>
      </div>
      <div style="flex:1;min-width:120px;background:#f8fafc;border-radius:8px;padding:16px;text-align:center">
        <p style="margin:0;font-size:24px;font-weight:700;color:#1e293b">${disputeStats?.needsResponse || 0}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#94a3b8">Open Disputes</p>
      </div>
      <div style="flex:1;min-width:120px;background:#f8fafc;border-radius:8px;padding:16px;text-align:center">
        <p style="margin:0;font-size:24px;font-weight:700;color:#1e293b">${ticketStats.open || 0}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#94a3b8">Open Tickets</p>
      </div>
    </div>

    <h2 style="font-size:16px;color:#1e293b;margin:0 0 12px;border-top:1px solid #e2e8f0;padding-top:20px">Top Stores by Revenue</h2>
    <pre style="background:#f8fafc;border-radius:8px;padding:16px;font-size:13px;color:#475569;overflow-x:auto;margin:0">${topStores || "  No revenue data"}</pre>
  </div>

  <p style="text-align:center;color:#94a3b8;font-size:12px;margin:16px 0 0">
    Influencers Link Monitor &middot; <a href="${process.env.APP_FQDN || "https://app.influencerslink.com"}" style="color:#6366f1">Open Dashboard</a>
  </p>
</div>
</body>
</html>`;

  await sendEmail({
    to: adminEmail,
    subject: `Weekly Digest: $${(revenue.totalRevenue || 0).toLocaleString()} revenue, ${revenue.totalOrders || 0} orders`,
    html,
  });

  markDigestSent(adminEmail);
  console.log("[Digest] Admin weekly digest sent");
}

async function sendClientDigests() {
  const portalUsers = all("SELECT pu.*, s.name as store_name, s.url as store_url FROM portal_users pu LEFT JOIN stores s ON pu.store_id = s.id");

  for (const user of portalUsers) {
    if (wasDigestSent(user.email, user.store_id)) continue;

    const revenue = revenueService.getRevenueSummary("7d", user.store_id);
    const { total: disputeTotal } = disputeService.getDisputes({ storeId: user.store_id, limit: 1 });
    const { tickets, total: ticketTotal } = ticketService.getTickets({ storeId: user.store_id, limit: 1 });

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e2e8f0">
    <h1 style="margin:0 0 4px;font-size:24px;color:#1e293b">${user.store_name || "Your Store"}</h1>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:14px">Weekly Summary</p>

    <div style="display:flex;gap:12px;flex-wrap:wrap">
      <div style="flex:1;min-width:120px;background:#f8fafc;border-radius:8px;padding:16px;text-align:center">
        <p style="margin:0;font-size:24px;font-weight:700;color:#1e293b">$${(revenue.totalRevenue || 0).toLocaleString()}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#94a3b8">Revenue</p>
      </div>
      <div style="flex:1;min-width:120px;background:#f8fafc;border-radius:8px;padding:16px;text-align:center">
        <p style="margin:0;font-size:24px;font-weight:700;color:#1e293b">${revenue.totalOrders || 0}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#94a3b8">Orders</p>
      </div>
      <div style="flex:1;min-width:120px;background:#f8fafc;border-radius:8px;padding:16px;text-align:center">
        <p style="margin:0;font-size:24px;font-weight:700;color:#1e293b">${disputeTotal}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#94a3b8">Disputes</p>
      </div>
    </div>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:12px;margin:16px 0 0">
    Influencers Link &middot; <a href="${process.env.APP_FQDN || "https://app.influencerslink.com"}" style="color:#6366f1">View Dashboard</a>
  </p>
</div>
</body>
</html>`;

    try {
      await sendEmail({
        to: user.email,
        subject: `${user.store_name}: $${(revenue.totalRevenue || 0).toLocaleString()} this week`,
        html,
      });
      markDigestSent(user.email, user.store_id);
    } catch (err) {
      console.error(`[Digest] Failed for ${user.email}: ${err.message}`);
    }
  }

  console.log("[Digest] Client digests sent");
}

async function sendWeeklyDigests() {
  try {
    await sendAdminDigest();
    await sendClientDigests();
  } catch (err) {
    console.error("[Digest] Error:", err.message);
  }
}

module.exports = { sendWeeklyDigests, getWeekKey };

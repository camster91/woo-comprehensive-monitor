/** "3m ago", "2h ago", "yesterday", etc. */
export function timeAgo(dateStr) {
  if (!dateStr) return "Never";
  // SQLite stores UTC without Z — append it so Date parses correctly
  const d = new Date(dateStr.endsWith("Z") ? dateStr : dateStr + "Z");
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (isNaN(seconds)) return "Unknown";
  if (seconds < 5)   return "just now";
  if (seconds < 60)  return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)  return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)    return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1)    return "yesterday";
  if (days < 30)     return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

/** How long ago was lastSeen? Returns a severity level for coloring. */
export function seenStatus(dateStr) {
  if (!dateStr) return "never";
  const d = new Date(dateStr.endsWith("Z") ? dateStr : dateStr + "Z");
  const hours = (Date.now() - d.getTime()) / 3600000;
  if (hours < 13) return "good";    // seen within 1 health-check cycle
  if (hours < 26) return "warning"; // missed 1 cycle
  return "stale";                   // silent store threshold
}

export function formatUptime(seconds) {
  if (!seconds) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatBytes(bytes) {
  if (!bytes) return "—";
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

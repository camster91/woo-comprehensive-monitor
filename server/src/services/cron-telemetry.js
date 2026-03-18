/**
 * Cron Telemetry — tracks execution time and warns on slow runs
 */

const _cronStats = {};

async function timedCron(name, fn) {
  const start = Date.now();
  let hadError = false;
  try {
    await fn();
  } catch (err) {
    hadError = true;
    console.error(`[Cron:${name}] Error: ${err.message}`);
  }
  const duration = Date.now() - start;

  if (!_cronStats[name]) {
    _cronStats[name] = { runs: 0, totalMs: 0, maxMs: 0, lastMs: 0, errors: 0 };
  }
  const s = _cronStats[name];
  s.runs++;
  if (hadError) s.errors++;
  s.totalMs += duration;
  s.lastMs = duration;
  if (duration > s.maxMs) s.maxMs = duration;
  s.lastRun = new Date().toISOString();

  if (duration > 60000) {
    console.warn(`[Cron:${name}] SLOW: took ${(duration / 1000).toFixed(1)}s`);
  } else {
    console.log(`[Cron:${name}] Done in ${(duration / 1000).toFixed(1)}s`);
  }
}

function getCronStats() {
  return Object.entries(_cronStats).map(([name, s]) => ({
    name,
    runs: s.runs,
    avgMs: Math.round(s.totalMs / s.runs),
    maxMs: s.maxMs,
    lastMs: s.lastMs,
    lastRun: s.lastRun,
  }));
}

module.exports = { timedCron, getCronStats };

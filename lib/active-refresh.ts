const REFRESH_INTERVAL = 60_000;
const IDLE_TIMEOUT = 120_000;
const MIN_REFRESH_GAP = 30_000;

/** Refresh live screens only while someone is using them. */
export function startActiveRefresh(refresh: () => void | Promise<void>) {
  let lastActivity = Date.now();
  let lastAttempt = Date.now(); // The screen performs its initial load itself.
  let running = false;
  let stopped = false;
  const visibleAndOnline = () => document.visibilityState !== 'hidden' && navigator.onLine !== false;
  const run = async () => {
    if (stopped || running || !visibleAndOnline() || Date.now() - lastAttempt < MIN_REFRESH_GAP) return;
    running = true;
    lastAttempt = Date.now();
    try { await refresh(); }
    catch { /* The screen handles its own error and preserves the loaded data. */ }
    finally { running = false; }
  };
  const activity = () => {
    const wasIdle = Date.now() - lastActivity >= IDLE_TIMEOUT;
    lastActivity = Date.now();
    if (wasIdle) void run();
  };
  const resume = () => {
    if (!visibleAndOnline()) return;
    lastActivity = Date.now();
    void run();
  };
  const timer = setInterval(() => {
    if (Date.now() - lastActivity < IDLE_TIMEOUT) void run();
  }, REFRESH_INTERVAL);
  const activityEvents = ['pointerdown', 'keydown', 'scroll'];
  for (const event of activityEvents) window.addEventListener(event, activity, { passive: true, capture: true });
  window.addEventListener('focus', resume);
  window.addEventListener('online', resume);
  document.addEventListener('visibilitychange', resume);
  return () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    for (const event of activityEvents) window.removeEventListener(event, activity, true);
    window.removeEventListener('focus', resume);
    window.removeEventListener('online', resume);
    document.removeEventListener('visibilitychange', resume);
  };
}

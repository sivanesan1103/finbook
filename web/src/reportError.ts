/**
 * Reports uncaught errors/rejections to the backend's logging pipeline (see
 * backend/src/modules/clientLogs), which feeds the Grafana dashboard's
 * "Client errors & crashes" panel. Uses raw fetch — not the axios `api`
 * client — so a broken auth/axios layer can't also break error reporting.
 */
const baseURL = (import.meta.env.VITE_API_URL || '') + '/api/v1';

let lastSent = 0;

export function reportClientError(message: string, stack?: string) {
  // Cheap client-side throttle — a crash loop shouldn't spam the endpoint
  // (the backend also rate-limits, this just avoids the noise/network churn).
  const now = Date.now();
  if (now - lastSent < 2000) return;
  lastSent = now;

  fetch(`${baseURL}/client-logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      platform: 'web',
      level: 'error',
      message: message.slice(0, 2000),
      stack: stack?.slice(0, 8000),
      extra: { url: window.location.href },
    }),
  }).catch(() => {
    // Nothing more useful to do if the report itself can't be sent.
  });
}

export function installGlobalErrorReporting() {
  window.addEventListener('error', (e) => {
    reportClientError(e.message, e.error?.stack);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    reportClientError(`Unhandled rejection: ${message}`, stack);
  });
}

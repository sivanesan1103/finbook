// This app has no per-business timezone setting and is India-only in every
// other respect (₹, GSTIN, Tamil locale) — so "today"/"this month" for
// reporting is always IST, regardless of the server process's own timezone
// (which is whatever the host/container happens to be, e.g. UTC in Docker).
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const istCalendarParts = (date) => {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return { y: ist.getUTCFullYear(), m: ist.getUTCMonth(), d: ist.getUTCDate() };
};

/** UTC instant corresponding to 00:00:00 IST on the calendar day of `date`. */
export const istDayStart = (date = new Date()) => {
  const { y, m, d } = istCalendarParts(date);
  return new Date(Date.UTC(y, m, d) - IST_OFFSET_MS);
};

/** UTC instant corresponding to 23:59:59.999 IST on the calendar day of `date`. */
export const istDayEnd = (date = new Date()) => new Date(istDayStart(date).getTime() + DAY_MS - 1);

/** UTC instant corresponding to 00:00:00 IST on the 1st of the month of `date`. */
export const istMonthStart = (date = new Date()) => {
  const { y, m } = istCalendarParts(date);
  return new Date(Date.UTC(y, m, 1) - IST_OFFSET_MS);
};

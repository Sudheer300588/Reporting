/**
 * Pure helpers for incremental SMS stats syncing.
 *
 * These are intentionally dependency-free so they can be tested
 * without hitting Mautic or the DB.
 */

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Filters rows to only those newer than cursorFrom.
 * Accepts either { dateSent } or { date_sent }.
 */
export function filterSmsStatsNewerThan(stats, cursorFrom) {
  if (!Array.isArray(stats) || stats.length === 0) return [];
  if (!cursorFrom) return stats;

  return stats.filter((row) => {
    const d = toDate(row?.dateSent ?? row?.date_sent);
    // If we can't parse the date, keep it to avoid missing data.
    return d ? d >= cursorFrom : true;
  });
}

/**
 * Returns the oldest (minimum) dateSent/date_sent in a page.
 */
export function getOldestDateSent(stats) {
  if (!Array.isArray(stats) || stats.length === 0) return null;

  let oldest = null;
  for (const row of stats) {
    const d = toDate(row?.dateSent ?? row?.date_sent);
    if (!d) continue;
    if (!oldest || d < oldest) oldest = d;
  }

  return oldest;
}

/**
 * Returns the newest (maximum) dateSent/date_sent in a page.
 */
export function getNewestDateSent(stats) {
  if (!Array.isArray(stats) || stats.length === 0) return null;

  let newest = null;
  for (const row of stats) {
    const d = toDate(row?.dateSent ?? row?.date_sent);
    if (!d) continue;
    if (!newest || d > newest) newest = d;
  }

  return newest;
}

/**
 * Indicates whether paging can stop (assuming API returns results ordered DESC by dateSent).
 *
 * For safety, we stop only when the *newest* parsed row in this page is strictly older
 * than the cursor (meaning every parsed timestamp in this page is < cursorFrom).
 * If any rows have unparseable timestamps, we avoid cursor-based stopping to reduce
 * the chance of missing data.
 */
export function shouldStopPaging(stats, cursorFrom) {
  if (!cursorFrom) return false;

  if (!Array.isArray(stats) || stats.length === 0) return false;

  // If there are unparseable timestamps, don't stop early on cursor.
  for (const row of stats) {
    const raw = row?.dateSent ?? row?.date_sent;
    if (raw && !toDate(raw)) {
      return false;
    }
  }

  const newest = getNewestDateSent(stats);
  return !!(newest && newest < cursorFrom);
}

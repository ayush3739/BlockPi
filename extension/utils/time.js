/**
 * BlockPi — Time Utility
 * Date helpers for today's key, week range, formatting, etc.
 */

/**
 * Get today's date key in YYYY-MM-DD format (local timezone)
 * @returns {string}
 */
export function getTodayKey() {
  return formatDateKey(new Date());
}

/**
 * Format a Date object to YYYY-MM-DD
 * @param {Date} date
 * @returns {string}
 */
export function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get an array of date keys for the last N days (including today)
 * @param {number} n — number of days
 * @returns {string[]} — array of "YYYY-MM-DD" strings, most recent first
 */
export function getLastNDaysKeys(n) {
  const keys = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    keys.push(formatDateKey(d));
  }
  return keys;
}

/**
 * Get day name abbreviation for a date key
 * @param {string} dateKey — "YYYY-MM-DD"
 * @returns {string} — e.g. "Mon", "Tue"
 */
export function getDayName(dateKey) {
  const date = new Date(dateKey + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

/**
 * Format seconds into human-readable string
 * @param {number} totalSeconds
 * @returns {string} — e.g. "1h 30m", "45m", "5m 12s"
 */
export function formatDuration(totalSeconds) {
  if (totalSeconds < 0) totalSeconds = 0;

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Format seconds into mm:ss or hh:mm:ss
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatTime(totalSeconds) {
  if (totalSeconds < 0) totalSeconds = 0;

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Get seconds until midnight (next day reset)
 * @returns {number}
 */
export function getSecondsUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.floor((midnight - now) / 1000);
}

/**
 * Get percentage of time used
 * @param {number} usedSeconds
 * @param {number} limitSeconds
 * @returns {number} 0-100
 */
export function getUsagePercent(usedSeconds, limitSeconds) {
  if (limitSeconds <= 0) return 100;
  return Math.min(100, Math.round((usedSeconds / limitSeconds) * 100));
}

/**
 * Get status color based on usage percentage
 * @param {number} percent
 * @returns {'green'|'amber'|'red'}
 */
export function getStatusColor(percent) {
  if (percent >= 85) return 'red';
  if (percent >= 50) return 'amber';
  return 'green';
}

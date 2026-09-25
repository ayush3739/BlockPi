/**
 * BlockPi — Storage Utility
 * Thin wrapper around chrome.storage.local for all read/write operations.
 */

const STORAGE_KEYS = {
  RULES: 'blockpi_rules',
  USAGE: 'blockpi_usage',
  SETTINGS: 'blockpi_settings',
  FOCUS: 'blockpi_focus',
  VAULT: 'blockpi_vault'
};

/**
 * Get all blocking rules
 * @returns {Promise<Object>} rules object keyed by domain
 */
export async function getRules() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.RULES);
  return data[STORAGE_KEYS.RULES] || {};
}

/**
 * Set a single rule for a domain
 * @param {string} domain
 * @param {number} limitSeconds
 * @param {string} [label]
 */
export async function setRule(domain, limitSeconds, label, paths) {
  const rules = await getRules();
  rules[domain] = {
    limitSeconds,
    enabled: true,
    label: label || domain,
    paths: paths || [],
    createdAt: rules[domain]?.createdAt || new Date().toISOString()
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.RULES]: rules });
}

/**
 * Update an existing rule (partial update)
 * @param {string} domain
 * @param {Object} updates — partial fields to merge
 */
export async function updateRule(domain, updates) {
  const rules = await getRules();
  if (rules[domain]) {
    rules[domain] = { ...rules[domain], ...updates };
    await chrome.storage.local.set({ [STORAGE_KEYS.RULES]: rules });
  }
}

/**
 * Delete a rule for a domain
 * @param {string} domain
 */
export async function deleteRule(domain) {
  const rules = await getRules();
  delete rules[domain];
  await chrome.storage.local.set({ [STORAGE_KEYS.RULES]: rules });
}

/**
 * Get all usage data
 * @returns {Promise<Object>} usage object keyed by date string "YYYY-MM-DD"
 */
export async function getAllUsage() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.USAGE);
  return data[STORAGE_KEYS.USAGE] || {};
}

/**
 * Get today's usage for a specific domain
 * @param {string} domain
 * @param {string} todayKey — "YYYY-MM-DD"
 * @returns {Promise<number>} seconds used today
 */
export async function getTodayUsage(domain, todayKey) {
  const usage = await getAllUsage();
  return (usage[todayKey] && usage[todayKey][domain]) || 0;
}

/**
 * Get today's usage for ALL domains
 * @param {string} todayKey
 * @returns {Promise<Object>} { domain: seconds, ... }
 */
export async function getTodayAllUsage(todayKey) {
  const usage = await getAllUsage();
  return usage[todayKey] || {};
}

/**
 * Increment usage for a domain by a given number of seconds
 * @param {string} domain
 * @param {number} seconds
 * @param {string} todayKey
 */
export async function incrementUsage(domain, seconds, todayKey) {
  const usage = await getAllUsage();
  if (!usage[todayKey]) usage[todayKey] = {};
  usage[todayKey][domain] = (usage[todayKey][domain] || 0) + seconds;
  await chrome.storage.local.set({ [STORAGE_KEYS.USAGE]: usage });
}

/**
 * Increment usage for multiple domains in a single atomic batch operation
 * @param {Object} domainSecondsMap { [domain]: seconds }
 * @param {string} todayKey
 */
export async function incrementUsagesBatch(domainSecondsMap, todayKey) {
  const keys = Object.keys(domainSecondsMap);
  if (keys.length === 0) return;
  const usage = await getAllUsage();
  if (!usage[todayKey]) usage[todayKey] = {};
  for (const domain of keys) {
    const secs = domainSecondsMap[domain];
    if (secs > 0) {
      usage[todayKey][domain] = (usage[todayKey][domain] || 0) + secs;
    }
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.USAGE]: usage });
}

/**
 * Get usage for the last N days
 * @param {number} days
 * @returns {Promise<Object>} { "YYYY-MM-DD": { domain: seconds }, ... }
 */
export async function getUsageForDays(days) {
  const usage = await getAllUsage();
  const result = {};
  const now = new Date();

  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = formatDateKey(d);
    result[key] = usage[key] || {};
  }

  return result;
}

/**
 * Prune usage data older than maxDays
 * @param {number} maxDays
 */
export async function pruneOldUsage(maxDays = 30) {
  const usage = await getAllUsage();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxDays);
  const cutoffKey = formatDateKey(cutoff);

  let changed = false;
  for (const key of Object.keys(usage)) {
    if (key < cutoffKey) {
      delete usage[key];
      changed = true;
    }
  }

  if (changed) {
    await chrome.storage.local.set({ [STORAGE_KEYS.USAGE]: usage });
  }
}

/**
 * Get settings
 * @returns {Promise<Object>}
 */
export async function getSettings() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return data[STORAGE_KEYS.SETTINGS] || {
    snoozeEnabled: true,
    snoozeDurationMinutes: 5,
    strictMode: false,
    focusDurationMinutes: 25,
    quickAddMinutes: 15
  };
}

/**
 * Save settings
 * @param {Object} settings
 */
export async function saveSettings(settings) {
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
}

// ─── Focus Session ─────────────────────────────────────────

/**
 * Get current focus session (or null)
 * @returns {Promise<Object|null>} { startedAt, endsAt, durationMinutes }
 */
export async function getFocusSession() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.FOCUS);
  return data[STORAGE_KEYS.FOCUS] || null;
}

/**
 * Start a focus session
 * @param {number} durationMinutes
 */
export async function startFocusSession(durationMinutes) {
  const now = Date.now();
  const session = {
    startedAt: now,
    endsAt: now + (durationMinutes * 60 * 1000),
    durationMinutes
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.FOCUS]: session });
  return session;
}

/**
 * End the current focus session
 */
export async function endFocusSession() {
  await chrome.storage.local.remove(STORAGE_KEYS.FOCUS);
}

/**
 * Clear all data (rules + usage + settings)
 */
export async function clearAllData() {
  await chrome.storage.local.remove([
    STORAGE_KEYS.RULES,
    STORAGE_KEYS.USAGE,
    STORAGE_KEYS.SETTINGS
  ]);
}

/**
 * Export all data as JSON
 * @returns {Promise<Object>}
 */
export async function exportData() {
  const rules = await getRules();
  const usage = await getAllUsage();
  const settings = await getSettings();
  return { rules, usage, settings, exportedAt: new Date().toISOString() };
}

/**
 * Import data from JSON
 * @param {Object} data
 */
export async function importData(data) {
  if (data.rules) {
    await chrome.storage.local.set({ [STORAGE_KEYS.RULES]: data.rules });
  }
  if (data.usage) {
    await chrome.storage.local.set({ [STORAGE_KEYS.USAGE]: data.usage });
  }
  if (data.settings) {
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: data.settings });
  }
}

// Helper
function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── Vault Storage Operations ─────────────────────────────

/**
 * Get all saved vault links
 * @returns {Promise<Array>} Array of saved link objects
 */
export async function getVaultLinks() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.VAULT);
  return Array.isArray(data[STORAGE_KEYS.VAULT]) ? data[STORAGE_KEYS.VAULT] : [];
}

/**
 * Extract clean domain name from a URL
 */
function extractDomainFromUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return 'web';
  }
}

/**
 * Derive a clean, readable title fallback from URL pathname and params
 */
function deriveTitleFromUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
      const lastSlug = decodeURIComponent(pathParts[pathParts.length - 1]).replace(/[-_]/g, ' ');
      if (parsed.search) {
        const otherParam = parsed.searchParams.get('other');
        const qParam = parsed.searchParams.get('q') || parsed.searchParams.get('query');
        if (otherParam) {
          return `${lastSlug} (${decodeURIComponent(otherParam)})`.slice(0, 120);
        } else if (qParam) {
          return `${lastSlug}: ${decodeURIComponent(qParam)}`.slice(0, 120);
        } else {
          return `${lastSlug} (${decodeURIComponent(parsed.search.slice(1))})`.slice(0, 120);
        }
      }
      return lastSlug.slice(0, 120);
    }
  } catch { /* ignore */ }
  return '';
}

/**
 * Add a new link to the vault
 * @param {Object} item { url, title, tags, notes, metadata }
 * @returns {Promise<Object>} The saved link item
 */
export async function addVaultLink({ url, title, tags, notes, metadata }) {
  if (!url || typeof url !== 'string') {
    throw new Error('Valid URL is required');
  }

  const cleanUrl = url.trim();
  const links = await getVaultLinks();

  const existingIndex = links.findIndex(l => l.url === cleanUrl);
  const domain = extractDomainFromUrl(cleanUrl);
  const fallbackTitle = deriveTitleFromUrl(cleanUrl) || domain;
  
  let tagList = [];
  if (Array.isArray(tags)) {
    tagList = tags.map(t => String(t).trim().replace(/^#/, '')).filter(Boolean);
  } else if (typeof tags === 'string') {
    tagList = tags.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean);
  }

  const now = new Date().toISOString();

  if (existingIndex >= 0) {
    const existing = links[existingIndex];
    const mergedTags = Array.from(new Set([...(existing.tags || []), ...tagList]));
    const updated = {
      ...existing,
      title: title?.trim() || existing.title || fallbackTitle,
      tags: mergedTags,
      notes: notes !== undefined ? notes : existing.notes,
      metadata: { ...(existing.metadata || {}), ...(metadata || {}) },
      updatedAt: now
    };
    links[existingIndex] = updated;
    await chrome.storage.local.set({ [STORAGE_KEYS.VAULT]: links });
    return updated;
  }

  const newItem = {
    id: 'vault_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    url: cleanUrl,
    title: title?.trim() || fallbackTitle,
    domain,
    tags: tagList,
    notes: notes?.trim() || '',
    metadata: metadata || {},
    savedAt: now
  };

  links.unshift(newItem);
  await chrome.storage.local.set({ [STORAGE_KEYS.VAULT]: links });
  return newItem;
}

/**
 * Update an existing vault link by ID
 */
export async function updateVaultLink(id, updates) {
  const links = await getVaultLinks();
  const index = links.findIndex(l => l.id === id);
  if (index === -1) return null;

  if (updates.tags !== undefined) {
    if (typeof updates.tags === 'string') {
      updates.tags = updates.tags.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean);
    } else if (Array.isArray(updates.tags)) {
      updates.tags = updates.tags.map(t => String(t).trim().replace(/^#/, '')).filter(Boolean);
    }
  }

  links[index] = {
    ...links[index],
    ...updates,
    updatedAt: new Date().toISOString()
  };

  await chrome.storage.local.set({ [STORAGE_KEYS.VAULT]: links });
  return links[index];
}

/**
 * Delete a vault link by ID
 */
export async function deleteVaultLink(id) {
  const links = await getVaultLinks();
  const filtered = links.filter(l => l.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEYS.VAULT]: filtered });
  return true;
}

/**
 * Import vault links from a JSON array
 * Merges new items without duplicating URLs
 * @param {Array} importedArray
 * @returns {Promise<{ imported: number, total: number }>}
 */
export async function importVaultLinks(importedArray) {
  if (!Array.isArray(importedArray)) {
    throw new Error('Invalid JSON format: expected an array of items');
  }

  const currentLinks = await getVaultLinks();
  const existingUrlMap = new Map();
  currentLinks.forEach(l => existingUrlMap.set(l.url, l));

  let importedCount = 0;
  for (const item of importedArray) {
    if (!item || !item.url) continue;
    const cleanUrl = String(item.url).trim();
    if (!cleanUrl) continue;

    if (!existingUrlMap.has(cleanUrl)) {
      const domain = item.domain || extractDomainFromUrl(cleanUrl);
      let tagList = [];
      if (Array.isArray(item.tags)) {
        tagList = item.tags.map(t => String(t).trim().replace(/^#/, '')).filter(Boolean);
      } else if (typeof item.tags === 'string') {
        tagList = item.tags.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean);
      }

      const newItem = {
        id: item.id || ('vault_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)),
        url: cleanUrl,
        title: item.title?.trim() || domain,
        domain,
        tags: tagList,
        notes: item.notes?.trim() || '',
        metadata: item.metadata || {},
        savedAt: item.savedAt || new Date().toISOString()
      };

      currentLinks.unshift(newItem);
      existingUrlMap.set(cleanUrl, newItem);
      importedCount++;
    }
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.VAULT]: currentLinks });
  return { imported: importedCount, total: currentLinks.length };
}

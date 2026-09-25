/**
 * BlockPi — Background Service Worker
 * Handles TICK messages, increments usage, triggers blocks,
 * manages Focus Mode, and daily reset via chrome.alarms.
 */

import { getRules, getTodayUsage, incrementUsage, incrementUsagesBatch, pruneOldUsage, getSettings, getFocusSession, startFocusSession, endFocusSession, addVaultLink, getVaultLinks } from './utils/storage.js';
import { findMatchingRule } from './utils/domain.js';
import { getTodayKey } from './utils/time.js';

// ─── In-memory state ───────────────────────────────────────
const blockedToday = new Set();
const snoozedUntil = {}; // domain → timestamp when snooze expires
let lastTickTime = 0; // timestamp of the last processed tick to prevent double counting

// Batched usage tracking to save CPU/Memory
const pendingUsage = {}; 
let cachedRules = null;
let lastRulesFetch = 0;
let lastFlushTime = Date.now();

// ─── TICK Handler ──────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TICK') {
    handleTick(message.domain, message.path || '/', sender.tab).then(() => {
      sendResponse({ ok: true });
    });
    return true; // async
  }

  if (message.type === 'GET_STATUS') {
    handleGetStatus(message.domain).then(sendResponse);
    return true; // async response
  }

  if (message.type === 'SNOOZE') {
    handleSnooze(message.domain, message.minutes || 5);
    sendResponse({ ok: true });
    return;
  }

  if (message.type === 'CHECK_BLOCKED') {
    const isBlocked = blockedToday.has(message.domain) && !isCurrentlySnoozed(message.domain);
    sendResponse({ blocked: isBlocked });
    return;
  }

  if (message.type === 'FOCUS_START') {
    handleFocusStart(message.durationMinutes || 25).then(sendResponse);
    return true;
  }

  if (message.type === 'FOCUS_END') {
    handleFocusEnd().then(sendResponse);
    return true;
  }

  if (message.type === 'FOCUS_STATUS') {
    handleFocusStatus().then(sendResponse);
    return true;
  }

  if (message.type === 'FLUSH_USAGE') {
    flushPendingUsage().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === 'UNBLOCK_DOMAIN') {
    (async () => {
      try {
        console.log(`[BlockPi] Hard unblocking desynced DNR rule for ${message.domain}`);
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
        const ruleIds = existingRules.map(r => r.id);
        if (ruleIds.length > 0) {
          await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ruleIds });
        }
        blockedToday.clear();
        await rehydrateBlockedState();
        
        // Also re-apply focus mode blocks if active
        const focusSession = await getFocusSession();
        if (focusSession && Date.now() < focusSession.endsAt) {
          const rules = await getRules();
          for (const [domain, rule] of Object.entries(rules)) {
            if (rule.enabled) {
              await chrome.declarativeNetRequest.updateDynamicRules(buildDNRRules(domain, rule.paths || [], true)).catch(()=>{});
            }
          }
        }
      } catch (e) {
        console.error('[BlockPi] Failed to hard reset rules:', e);
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.type === 'ADD_TO_VAULT') {
    addVaultLink(message.payload || {})
      .then(item => sendResponse({ ok: true, item }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

/**
 * Fast cached rules fetch (caches for 5 seconds to prevent redundant disk reads)
 */
async function getCachedRules() {
  if (cachedRules && Date.now() - lastRulesFetch < 5000) {
    return cachedRules;
  }
  cachedRules = await getRules();
  lastRulesFetch = Date.now();
  return cachedRules;
}

/**
 * Handle a TICK from a content script
 */
async function handleTick(domain, path, tab) {
  if (!domain || !tab) return;

  // ── Multi-Window / Multi-Tab Deduplication ──
  // The content script strictly uses document.hasFocus() so background tabs never tick.
  // We use a global rate limit to ensure we only process ONE tick every ~4 seconds 
  // globally to prevent overlaps (e.g. multi-monitor setups).
  const now = Date.now();
  if (now - lastTickTime < 4000) return; 
  lastTickTime = now;

  const todayKey = getTodayKey();
  const rules = await getCachedRules();
  let matchingDomain = findMatchingRule(domain, rules);

  // ── Early Path & Rule Validation ──
  // We must validate paths BEFORE Focus/Strict mode checks to prevent over-blocking
  if (matchingDomain) {
    const rule = rules[matchingDomain];
    if (!rule.enabled) {
      matchingDomain = null;
    } else if (rule.paths && rule.paths.length > 0) {
      const normalizedPath = path.toLowerCase();
      const pathMatches = rule.paths.some(p => {
        const cleanP = '/' + p.toLowerCase();
        return normalizedPath === cleanP || normalizedPath.startsWith(cleanP + '/');
      });
      if (!pathMatches) matchingDomain = null;
    }
  }

  const focusSession = await getFocusSession();
  const settings = await getSettings();
  const isStrict = settings.strictMode === true;
  
  if ((focusSession && Date.now() < focusSession.endsAt) || isStrict) {
    if (matchingDomain) {
      redirectToBlocked(tab.id, matchingDomain);
      return;
    }
  } else if (focusSession && Date.now() >= focusSession.endsAt) {
    // Focus expired, clean up
    await endFocusSession();
    chrome.action.setBadgeText({ text: '' });
  }

  // No rule for this domain or path
  if (!matchingDomain) return;

  const rule = rules[matchingDomain];

  // Accumulate usage in memory (5 seconds per tick)
  pendingUsage[matchingDomain] = (pendingUsage[matchingDomain] || 0) + 5;

  // Check if snoozed
  const snoozed = isCurrentlySnoozed(matchingDomain);

  // Check if limit exceeded (calculate from storage + memory)
  const storedUsage = await getTodayUsage(matchingDomain, todayKey);
  const currentUsage = storedUsage + pendingUsage[matchingDomain];
  
  if (currentUsage >= rule.limitSeconds) {
    if (!snoozed) {
      if (!blockedToday.has(matchingDomain)) {
        await blockDomain(matchingDomain, tab.id, rule.paths);
      } else {
        redirectToBlocked(tab.id, matchingDomain);
      }
    }
  } else if (blockedToday.has(matchingDomain)) {
    // Limit was increased, unblock it
    blockedToday.delete(matchingDomain);
    const baseId = generateRuleId(matchingDomain);
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [baseId, baseId + 1, baseId + 2, baseId + 3, baseId + 4]
    }).catch(() => {});
  }

  // Update badge
  updateBadge(matchingDomain, currentUsage, rule.limitSeconds);

  // Dynamic flush: save to storage every 15 seconds of activity to let SW sleep when idle
  if (now - lastFlushTime > 15000) {
    flushPendingUsage();
    lastFlushTime = now;
  }
}

/**
 * Periodically flush pending usage to storage
 */
async function flushPendingUsage() {
  const domains = Object.keys(pendingUsage);
  if (domains.length === 0) return;

  const todayKey = getTodayKey();
  const toFlush = {};
  for (const domain of domains) {
    const seconds = pendingUsage[domain];
    if (seconds > 0) {
      toFlush[domain] = seconds;
      pendingUsage[domain] = 0; // reset immediately to prevent double counting
    }
  }

  if (Object.keys(toFlush).length > 0) {
    await incrementUsagesBatch(toFlush, todayKey);
  }
}

// Ensure any remaining usage is saved before the service worker is suspended
chrome.runtime.onSuspend.addListener(() => {
  console.log('[BlockPi] Service worker suspending, flushing usage data');
  flushPendingUsage();
});

/**
 * Helper to build DNR rules that respect paths
 */
function buildDNRRules(domain, paths, isFocus) {
  const baseId = generateRuleId(domain);
  const priority = isFocus ? 2 : 1;
  const extId = chrome.runtime.id;
  const redirectPath = `chrome-extension://${extId}/blocked/blocked.html?domain=${encodeURIComponent(domain)}${isFocus ? '&focus=true' : ''}&url=`;
  
  const rules = {
    addRules: [],
    removeRuleIds: [baseId, baseId + 1, baseId + 2, baseId + 3, baseId + 4]
  };

  if (paths && paths.length > 0) {
    paths.forEach((p, idx) => {
      const cleanPath = p.startsWith('/') ? p.substring(1) : p;
      rules.addRules.push({
        id: baseId + idx,
        priority: priority,
        // Safe redirect without regexSubstitution to prevent DNR crashes
        action: { type: 'redirect', redirect: { extensionPath: `/blocked/blocked.html?domain=${encodeURIComponent(domain)}${isFocus ? '&focus=true' : ''}` } },
        condition: { urlFilter: `||${domain}/${cleanPath}`, resourceTypes: ['main_frame'] }
      });
    });
  } else {
    // For base domains
    rules.addRules.push({
      id: baseId,
      priority: priority,
      action: { type: 'redirect', redirect: { extensionPath: `/blocked/blocked.html?domain=${encodeURIComponent(domain)}${isFocus ? '&focus=true' : ''}` } },
      condition: { urlFilter: `||${domain}`, resourceTypes: ['main_frame'] }
    });
  }
  return rules;
}

/**
 * Block a domain
 */
async function blockDomain(domain, tabId, paths = []) {
  blockedToday.add(domain);

  try {
    await chrome.declarativeNetRequest.updateDynamicRules(buildDNRRules(domain, paths, false));
  } catch (e) {
    console.error('[BlockPi] Failed to add blocking rule:', e);
  }

  // Redirect the current tab if provided
  if (tabId) {
    redirectToBlocked(tabId, domain);
  }
}

/**
 * Redirect a tab to the blocked page
 */
function redirectToBlocked(tabId, domain) {
  if (!tabId) return;
  chrome.tabs.get(tabId, async (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    
    const blockedUrlBase = chrome.runtime.getURL(`blocked/blocked.html`);
    // Prevent infinite reloads if already blocked
    if (tab.url && tab.url.startsWith(blockedUrlBase)) return;

    // Check if focus mode is active to apply correct parameter
    const focusSession = await getFocusSession();
    const isFocus = focusSession && Date.now() < focusSession.endsAt;

    // Use tab.url as originalUrl if it's a real page, else base domain
    const originalUrl = (tab.url && !tab.url.startsWith('chrome://')) ? tab.url : `https://${domain}`;
    const blockedUrl = `${blockedUrlBase}?domain=${encodeURIComponent(domain)}${isFocus ? '&focus=true' : ''}&url=${encodeURIComponent(originalUrl)}`;
    
    chrome.tabs.update(tabId, { url: blockedUrl }).catch(() => {});
  });
}

/**
 * Handle snooze request
 */
function handleSnooze(domain, minutes) {
  snoozedUntil[domain] = Date.now() + (minutes * 60 * 1000);

  // Remove the blocking rule temporarily
  const baseId = generateRuleId(domain);
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [baseId, baseId + 1, baseId + 2, baseId + 3, baseId + 4]
  }).catch(() => {});

  // Re-block after snooze expires
  setTimeout(async () => {
    delete snoozedUntil[domain];
    if (blockedToday.has(domain)) {
      const rules = await getCachedRules();
      await blockDomain(domain, null, rules[domain]?.paths || []);
    }
  }, minutes * 60 * 1000);
}

/**
 * Check if a domain is currently snoozed
 */
function isCurrentlySnoozed(domain) {
  if (!snoozedUntil[domain]) return false;
  if (Date.now() >= snoozedUntil[domain]) {
    delete snoozedUntil[domain];
    return false;
  }
  return true;
}

/**
 * Get current status for a domain (used by popup/dashboard)
 */
async function handleGetStatus(domain) {
  const todayKey = getTodayKey();
  const rules = await getRules();
  const matchingDomain = findMatchingRule(domain, rules);

  if (!matchingDomain) {
    return { tracked: false };
  }

  const rule = rules[matchingDomain];
  const storedUsage = await getTodayUsage(matchingDomain, todayKey);
  const usage = storedUsage + (pendingUsage[matchingDomain] || 0);
  const blocked = blockedToday.has(matchingDomain) && !isCurrentlySnoozed(matchingDomain);
  const snoozed = isCurrentlySnoozed(matchingDomain);

  return {
    tracked: true,
    domain: matchingDomain,
    label: rule.label,
    limitSeconds: rule.limitSeconds,
    usedSeconds: usage,
    blocked,
    snoozed,
    enabled: rule.enabled
  };
}

// ─── Focus Mode Handlers ───────────────────────────────────

async function handleFocusStart(durationMinutes) {
  // Check if there are any tracked sites
  const rules = await getRules();
  const trackedDomains = Object.entries(rules).filter(([, r]) => r.enabled);
  if (trackedDomains.length === 0) {
    return { ok: false, error: 'no_sites' };
  }

  const session = await startFocusSession(durationMinutes);

  // Create an alarm for when focus ends
  chrome.alarms.create('blockpi-focus-end', {
    when: session.endsAt
  });

  // Update badge
  chrome.action.setBadgeText({ text: '🎯' });
  chrome.action.setBadgeBackgroundColor({ color: '#8587e8' });

  // Block all tracked domains immediately
  for (const [domain, rule] of trackedDomains) {
    if (rule.enabled) {
      try {
        await chrome.declarativeNetRequest.updateDynamicRules(buildDNRRules(domain, rule.paths || [], true));
      } catch (e) {
        console.error('[BlockPi] Failed to add focus blocking rule:', e);
      }
    }
  }

  console.log(`[BlockPi] Focus mode started for ${durationMinutes}m`);
  return { ok: true, session };
}

async function handleFocusEnd() {
  await endFocusSession();
  chrome.alarms.clear('blockpi-focus-end');

  // Remove all focus-blocking rules (but keep daily limit blocks)
  const rules = await getRules();
  const todayKey = getTodayKey();

  for (const [domain, rule] of Object.entries(rules)) {
    if (!rule.enabled) continue;
    const usage = await getTodayUsage(domain, todayKey);
    if (usage < rule.limitSeconds) {
      // Not over daily limit — remove the blocking rule
      const baseId = generateRuleId(domain);
      chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [baseId, baseId + 1, baseId + 2, baseId + 3, baseId + 4]
      }).catch(() => {});
    } else {
      // Still over daily limit, revert to normal block (priority 1)
      await blockDomain(domain, null, rule.paths || []);
    }
  }

  chrome.action.setBadgeText({ text: '' });
  console.log('[BlockPi] Focus mode ended');
  return { ok: true };
}

async function handleFocusStatus() {
  const session = await getFocusSession();
  if (!session) return { active: false };
  if (Date.now() >= session.endsAt) {
    await handleFocusEnd();
    return { active: false };
  }
  return {
    active: true,
    remainingMs: session.endsAt - Date.now(),
    endsAt: session.endsAt,
    durationMinutes: session.durationMinutes
  };
}

/**
 * Update extension badge with time remaining
 */
function updateBadge(domain, usedSeconds, limitSeconds) {
  const remaining = limitSeconds - usedSeconds;
  const minutes = Math.max(0, Math.ceil(remaining / 60));

  let text = '';
  let color = '#10b981'; // green

  if (minutes <= 0) {
    text = '⛔';
    color = '#ef4444'; // red
  } else if (minutes <= 5) {
    text = `${minutes}m`;
    color = '#ef4444'; // red
  } else if (minutes <= 15) {
    text = `${minutes}m`;
    color = '#f59e0b'; // amber
  }

  if (text) {
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color });
  }
}

/**
 * Generate a deterministic rule ID from a domain string
 */
function generateRuleId(domain) {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = ((hash << 5) - hash) + domain.charCodeAt(i);
    hash |= 0; // Convert to 32-bit int
  }
  return (Math.abs(hash) % 200000) * 10 + 1; 
}

/**
 * Unblock a domain by removing its DNR rules
 */
async function unblockDomain(domain) {
  if (!domain) return;
  blockedToday.delete(domain);
  const baseId = generateRuleId(domain);
  const idsToRemove = [];
  for (let i = 0; i < 10; i++) idsToRemove.push(baseId + i);
  
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: idsToRemove
  }).catch(() => {});
  
  // Find any tabs currently showing the block screen for this domain and redirect them back
  const blockedUrlPart = `blocked.html?domain=${encodeURIComponent(domain)}`;
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.url && tab.url.includes(blockedUrlPart)) {
        let targetUrl = `https://${domain}`;
        try {
          const urlObj = new URL(tab.url);
          const origUrl = urlObj.searchParams.get('url');
          if (origUrl) targetUrl = origUrl;
        } catch (e) {}
        chrome.tabs.update(tab.id, { url: targetUrl }).catch(() => {});
      }
    }
  });

  console.log(`[BlockPi] Unblocked ${domain}`);
}

// ─── Daily Reset Alarm ─────────────────────────────────────
chrome.alarms.create('blockpi-daily-reset', {
  // Fire at the next midnight, then every 24 hours
  when: getNextMidnight(),
  periodInMinutes: 24 * 60
});

chrome.alarms.create('blockpi-prune', {
  periodInMinutes: 24 * 60 // Once a day
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'blockpi-daily-reset') {
    console.log('[BlockPi] Daily reset triggered');
    blockedToday.clear();
    Object.keys(snoozedUntil).forEach(k => delete snoozedUntil[k]);

    // Remove all dynamic blocking rules
    try {
      const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
      const ruleIds = existingRules.map(r => r.id);
      if (ruleIds.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ruleIds });
      }
    } catch (e) {
      console.error('[BlockPi] Failed to clear rules on reset:', e);
    }

    // Clear badge
    chrome.action.setBadgeText({ text: '' });
  }

  if (alarm.name === 'blockpi-prune') {
    await pruneOldUsage(30);
    console.log('[BlockPi] Pruned old usage data');
  }

  if (alarm.name === 'blockpi-focus-end') {
    await handleFocusEnd();
    console.log('[BlockPi] Focus mode auto-ended by alarm');
  }
});

// ─── Storage Change Listener ───────────────────────────────
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'local' && (changes.blockpi_rules || changes.blockpi_settings)) {
    cachedRules = null; // Clear cache
    
    if (changes.blockpi_rules) {
      const newRules = changes.blockpi_rules.newValue || {};
      const oldRules = changes.blockpi_rules.oldValue || {};
      const todayKey = getTodayKey();
      
      // Compare all rules to ensure unblocking works even if SW just woke up and blockedToday is empty
      for (const [domain, rule] of Object.entries(newRules)) {
        if (!rule || !rule.enabled) {
          await unblockDomain(domain);
        } else {
          const usage = await getTodayUsage(domain, todayKey);
          if (usage < rule.limitSeconds) {
            await unblockDomain(domain);
          } else {
            // Ensure DNR rule is active if still over limit
            blockedToday.add(domain);
            await blockDomain(domain, null, rule.paths || []);
          }
        }
      }
      
      // Unblock domains that were completely deleted
      for (const domain of Object.keys(oldRules)) {
        if (!newRules[domain]) {
          await unblockDomain(domain);
        }
      }
    }
    
    if (changes.blockpi_settings) {
      const oldSettings = changes.blockpi_settings.oldValue || {};
      const newSettings = changes.blockpi_settings.newValue || {};
      
      if (oldSettings.strictMode !== newSettings.strictMode) {
        console.log(`[BlockPi] Strict mode changed to: ${newSettings.strictMode}`);
        if (newSettings.strictMode) {
          // Block all tracked
          const rules = await getRules();
          for (const [domain, rule] of Object.entries(rules)) {
            if (rule.enabled) {
              await blockDomain(domain, null, rule.paths || []);
            }
          }
        } else {
          // Re-evaluate what should be unblocked
          blockedToday.clear();
          await rehydrateBlockedState();
        }
      }
    }
  }
});

/**
 * Get timestamp for the next midnight
 */
function getNextMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime();
}

// ─── On Install / Startup ──────────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[BlockPi] Extension installed/updated:', details.reason);

  // Inject content script into all existing tabs so tracking works immediately without refresh
  try {
    const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
    for (const tab of tabs) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content_script.js']
      }).catch(() => {});
    }
  } catch (e) {
    console.error('[BlockPi] Failed to inject scripts:', e);
  }

  // Open welcome page on first install
  if (details.reason === 'install') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('welcome/welcome.html')
    });
  }

  // Set uninstall feedback URL
  chrome.runtime.setUninstallURL('https://docs.google.com/forms/d/e/1FAIpQLSdc9aXf2vmpbMvSFdl2iPcCKoE6CxuGAe3REU9d3dlyQV8w4w/viewform?usp=dialog');

  // Rehydrate blocked state from storage
  await rehydrateBlockedState();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[BlockPi] Browser started, rehydrating state');

  // Set uninstall feedback URL
  chrome.runtime.setUninstallURL('https://docs.google.com/forms/d/e/1FAIpQLSdc9aXf2vmpbMvSFdl2iPcCKoE6CxuGAe3REU9d3dlyQV8w4w/viewform?usp=dialog');

  await rehydrateBlockedState();
});

/**
 * Rehydrate blocked domains from storage on SW restart
 */
async function rehydrateBlockedState() {
  const todayKey = getTodayKey();
  const rules = await getRules();

  for (const [domain, rule] of Object.entries(rules)) {
    if (!rule.enabled) continue;
    const usage = await getTodayUsage(domain, todayKey);
    if (usage >= rule.limitSeconds) {
      blockedToday.add(domain);
      // Re-add the blocking rule
      await blockDomain(domain, null, rule.paths || []);
    }
  }
}

// ─── Tab focus tracking ────────────────────────────────────
chrome.tabs.onActivated.addListener(() => {
  flushPendingUsage(); // Flush when switching tabs to keep data real-time
});

chrome.tabs.onRemoved.addListener(() => {
  flushPendingUsage(); // Flush when closing a tab
});

// ─── YouTube Native Messaging ──────────────────────────────
if (chrome.webNavigation) {
  chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    // Only intercept the main frame
    if (details.frameId !== 0) return;

    const settings = await getSettings();
    if (!settings.openYouTubeInBrave) return;

    chrome.runtime.sendNativeMessage(
      "com.ayush.youtube",
      { url: details.url },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Native Messaging Error:", chrome.runtime.lastError.message);
          return;
        }
        
        if (response && response.success) {
          chrome.tabs.remove(details.tabId).catch(() => {});
        } else if (response && !response.success) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'YouTube Launcher Error',
            message: response.message || 'Unknown error occurred while opening Brave.'
          });
        }
      }
    );
  }, {
    url: [
      { hostContains: '.youtube.com' },
      { hostEquals: 'youtube.com' },
      { hostEquals: 'youtu.be' }
    ]
  });
}

// ─── Vault Context Menus & Clipper ─────────────────────────
function setupVaultContextMenus() {
  if (!chrome.contextMenus) return;
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'vault-save-link',
      title: '📌 Save link to BlockPi Vault',
      contexts: ['link']
    });

    chrome.contextMenus.create({
      id: 'vault-save-selection',
      title: '📌 Save selected URL to BlockPi Vault',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: 'vault-save-page',
      title: '📌 Save page to BlockPi Vault',
      contexts: ['page']
    });
  });
}

// Setup context menus on startup and install
setupVaultContextMenus();

if (chrome.contextMenus && chrome.contextMenus.onClicked) {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    let targetUrl = '';
    let targetTitle = '';
    let notes = '';

    if (info.menuItemId === 'vault-save-link') {
      targetUrl = info.linkUrl || '';
      targetTitle = info.selectionText || '';
    } else if (info.menuItemId === 'vault-save-selection') {
      const text = (info.selectionText || '').trim();
      if (/^https?:\/\//i.test(text)) {
        targetUrl = text;
      } else {
        targetUrl = tab?.url || '';
        notes = text;
        targetTitle = tab?.title || '';
      }
    } else if (info.menuItemId === 'vault-save-page') {
      targetUrl = info.pageUrl || tab?.url || '';
      targetTitle = tab?.title || '';
    }

    if (targetUrl && !targetUrl.startsWith('chrome://') && !targetUrl.startsWith('chrome-extension://')) {
      try {
        const saved = await addVaultLink({
          url: targetUrl,
          title: targetTitle || undefined,
          notes: notes || undefined,
          metadata: { source: 'contextMenu' }
        });

        if (chrome.notifications) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Saved to BlockPi Vault 📌',
            message: saved.title || targetUrl
          });
        }
      } catch (e) {
        console.error('[BlockPi Vault] Error saving link from context menu:', e);
      }
    }
  });
}

// Shortcut command listener (Alt+S)
if (chrome.commands && chrome.commands.onCommand) {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'save-to-vault') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
        try {
          const saved = await addVaultLink({
            url: tab.url,
            title: tab.title,
            metadata: { source: 'shortcut' }
          });
          if (chrome.notifications) {
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'icons/icon48.png',
              title: 'Saved to BlockPi Vault 📌',
              message: saved.title || tab.url
            });
          }
        } catch (e) {
          console.error('[BlockPi Vault] Error saving via shortcut:', e);
        }
      }
    }
  });
}


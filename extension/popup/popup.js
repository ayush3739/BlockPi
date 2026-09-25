/**
 * BlockPi — Popup Script
 * Handles current site display, tracked sites list, focus mode, and add site form.
 */

import { getRules, setRule, getTodayAllUsage, getSettings } from '../utils/storage.js';
import { getTodayKey, formatDuration, formatTime, getUsagePercent } from '../utils/time.js';
import { normalizeDomain, getDomainLabel, getFaviconUrl } from '../utils/domain.js';

const currentSiteSection = document.getElementById('current-site-section');
const currentSiteFavicon = document.getElementById('current-site-favicon');
const currentSiteName = document.getElementById('current-site-name');
const currentSiteBadge = document.getElementById('current-site-badge');
const currentSiteProgress = document.getElementById('current-site-progress');
const currentSiteUsed = document.getElementById('current-site-used');
const currentSiteLimit = document.getElementById('current-site-limit');
const sitesList = document.getElementById('sites-list');
const sitesCount = document.getElementById('sites-count');
const emptyState = document.getElementById('empty-state');
const addForm = document.getElementById('add-form');
const inputDomain = document.getElementById('input-domain');
const inputMinutes = document.getElementById('input-minutes');
const btnDashboard = document.getElementById('btn-dashboard');
const btnVault = document.getElementById('btn-vault');
const btnSaveTab = document.getElementById('btn-save-tab');
const btnOptions = document.getElementById('btn-options');

// Focus elements
const focusIdle = document.getElementById('focus-idle');
const focusActive = document.getElementById('focus-active');
const focusTimer = document.getElementById('focus-timer');
const focusProgress = document.getElementById('focus-progress');
const btnFocusStart = document.getElementById('btn-focus-start');
const btnFocusEnd = document.getElementById('btn-focus-end');
const focusDurBtns = document.querySelectorAll('.focus-dur-btn');

let selectedFocusDuration = 25;
let focusInterval = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  try { await chrome.runtime.sendMessage({ type: 'FLUSH_USAGE' }); } catch { /* ignore */ }
  const settings = await getSettings();
  document.getElementById('toggle-strict-mode').checked = settings.strictMode === true;
  await renderCurrentSite();
  await renderSitesList();
  await checkFocusStatus();
  bindEvents();
}

function bindEvents() {
  addForm.addEventListener('submit', handleAddSite);
  btnDashboard.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  });

  if (btnVault) {
    btnVault.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html#vault') });
    });
  }

  if (btnSaveTab) {
    btnSaveTab.addEventListener('click', async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
          const res = await chrome.runtime.sendMessage({
            type: 'ADD_TO_VAULT',
            payload: {
              url: tab.url,
              title: tab.title || tab.url,
              metadata: { source: 'popup' }
            }
          });
          if (res && res.ok) {
            const icon = btnSaveTab.querySelector('.material-symbols-outlined');
            if (icon) {
              const oldIcon = icon.textContent;
              icon.textContent = 'check';
              icon.style.color = 'var(--primary)';
              setTimeout(() => {
                icon.textContent = oldIcon;
                icon.style.color = '';
              }, 1500);
            }
          }
        }
      } catch (err) {
        console.error('Error saving tab from popup:', err);
      }
    });
  }

  btnOptions.addEventListener('click', () => { window.location.href = '../options/options.html'; });

  // Focus duration selector
  focusDurBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      focusDurBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedFocusDuration = parseInt(btn.dataset.minutes, 10);
    });
  });

  document.getElementById('btn-focus-start').addEventListener('click', startFocus);
  document.getElementById('btn-focus-end').addEventListener('click', endFocus);

  // Strict Mode toggle
  document.getElementById('toggle-strict-mode').addEventListener('change', async (e) => {
    const settings = await getSettings();
    settings.strictMode = e.target.checked;
    await chrome.storage.local.set({ 'blockpi_settings': settings });
  });
  
  // Quick Add buttons
  document.querySelectorAll('.btn-quick-add').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if (isAddingSite) return;
      isAddingSite = true;
      btn.disabled = true;
      btn.style.opacity = '0.5';
      
      const domain = btn.getAttribute('data-domain');
      const label = btn.getAttribute('data-label');
      const settings = await getSettings();
      const minutes = settings.quickAddMinutes || 15;
      
      // Auto-add with the specified default limit
      const parts = domain.split('/');
      const baseDomain = parts[0];
      const paths = parts.length > 1 ? [parts[1]] : [];
      
      await setRule(baseDomain, minutes * 60, label, paths);
      await renderSitesList();
      
      isAddingSite = false;
      btn.disabled = false;
      btn.style.opacity = '1';
    });
  });
}

async function renderCurrentSite() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;
    const url = new URL(tab.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    const domain = normalizeDomain(url.hostname);
    const rules = await getRules();
    const todayKey = getTodayKey();
    const todayUsage = await getTodayAllUsage(todayKey);

    let matched = null;
    for (const d of Object.keys(rules)) {
      if (domain === d || domain.endsWith('.' + d)) { matched = d; break; }
    }
    if (!matched) return;

    const rule = rules[matched];
    const used = todayUsage[matched] || 0;
    const percent = getUsagePercent(used, rule.limitSeconds);

    currentSiteFavicon.src = getFaviconUrl(matched);
    currentSiteName.textContent = rule.label || matched;
    currentSiteBadge.textContent = percent >= 100 ? 'BLOCKED' : `${percent}%`;
    currentSiteProgress.style.width = `${Math.min(100, percent)}%`;
    currentSiteUsed.textContent = `${formatDuration(used)} used`;
    currentSiteLimit.textContent = `${formatDuration(rule.limitSeconds)} limit`;

    currentSiteProgress.classList.remove('warn', 'danger');
    if (percent >= 85) currentSiteProgress.classList.add('danger');
    else if (percent >= 50) currentSiteProgress.classList.add('warn');

    currentSiteSection.style.display = '';
  } catch { /* ignore */ }
}

async function renderSitesList() {
  const rules = await getRules();
  const todayKey = getTodayKey();
  const todayUsage = await getTodayAllUsage(todayKey);
  const domains = Object.keys(rules);

  sitesCount.textContent = domains.length;

  if (domains.length === 0) { emptyState.style.display = ''; return; }
  emptyState.style.display = 'none';

  domains.sort((a, b) => {
    const pA = getUsagePercent(todayUsage[a] || 0, rules[a].limitSeconds);
    const pB = getUsagePercent(todayUsage[b] || 0, rules[b].limitSeconds);
    return pB - pA;
  });

  sitesList.innerHTML = '';

  for (const domain of domains) {
    const rule = rules[domain];
    const used = todayUsage[domain] || 0;
    const percent = getUsagePercent(used, rule.limitSeconds);
    let barClass = '';
    if (percent >= 85) barClass = 'danger';
    else if (percent >= 50) barClass = 'warn';

    const icon = getMaterialIcon(domain);
    const pathLabel = rule.paths && rule.paths.length > 0 ? ` (/${rule.paths.join(', /')})` : '';

    const li = document.createElement('li');
    li.className = 'site-item';
    li.innerHTML = `
      <div class="site-icon-wrap">
        <span class="material-symbols-outlined" style="font-size:14px">${icon}</span>
      </div>
      <div class="site-info">
        <div class="site-info-row">
          <span class="site-info-name">${rule.label || domain}${pathLabel}</span>
          <span class="site-info-stat">${formatDuration(used)} / ${formatDuration(rule.limitSeconds)}</span>
        </div>
        <div class="progress-track progress-track-thin">
          <div class="progress-fill ${barClass}" style="width:${Math.min(100, percent)}%"></div>
        </div>
      </div>
    `;
    sitesList.appendChild(li);
  }

  // Hide Quick Add buttons if already tracked
  document.querySelectorAll('.btn-quick-add').forEach(btn => {
    const rawDomain = btn.getAttribute('data-domain');
    const parts = rawDomain.split('/');
    const baseDomain = parts[0];
    const path = parts.length > 1 ? parts[1] : null;

    let shouldHide = false;
    if (rules[baseDomain]) {
      if (!rules[baseDomain].paths || rules[baseDomain].paths.length === 0) {
        shouldHide = true; // Entire domain tracked
      } else if (path && rules[baseDomain].paths.includes(path)) {
        shouldHide = true; // Specific path tracked
      }
    }
    btn.style.display = shouldHide ? 'none' : 'flex';
  });
}

let isAddingSite = false;
async function handleAddSite(e) {
  e.preventDefault();
  if (isAddingSite) return;
  isAddingSite = true;
  const btn = document.getElementById('btn-add-site');
  if (btn) btn.disabled = true;
  let rawInput = inputDomain.value.trim().toLowerCase();
  const minutes = parseInt(inputMinutes.value, 10);
  if (!rawInput || !minutes || minutes < 1) return;

  // Strip protocol
  rawInput = rawInput.replace(/^https?:\/\//, '').replace(/\/$/, '');

  // Smart URL parsing: check for path (e.g., youtube.com/shorts)
  let domain = rawInput;
  let paths = [];

  const slashIdx = rawInput.indexOf('/');
  if (slashIdx > 0) {
    domain = rawInput.substring(0, slashIdx);
    const pathPart = rawInput.substring(slashIdx + 1).replace(/\/$/, '');
    if (pathPart) paths = [pathPart];
  }

  domain = normalizeDomain(domain);
  if (!domain || domain.length < 3 || !domain.includes('.')) {
    inputDomain.style.boxShadow = '0 0 0 2px var(--error)';
    setTimeout(() => inputDomain.style.boxShadow = '', 1500);
    return;
  }

  await setRule(domain, minutes * 60, getDomainLabel(domain), paths);
  inputDomain.value = '';
  inputMinutes.value = '';
  inputDomain.focus();
  await renderSitesList();

  isAddingSite = false;
  if (btn) btn.disabled = false;
}

// ─── Focus Mode ────────────────────────────────────────────

async function checkFocusStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'FOCUS_STATUS' });
    if (response?.active) {
      showFocusActive(response.remainingMs, response.endsAt);
    }
  } catch { /* ignore */ }
}

let isFocusProcessing = false;

async function startFocus() {
  if (isFocusProcessing) return;
  isFocusProcessing = true;
  btnFocusStart.disabled = true;

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'FOCUS_START',
      durationMinutes: selectedFocusDuration
    });

    if (result?.error === 'no_sites') {
      // Flash the empty state or show inline feedback
      const focusCard = document.getElementById('focus-section');
      const msg = document.createElement('p');
      msg.className = 't-label';
      msg.style.cssText = 'color:var(--error); text-align:center; margin-top:4px; animation: card-in 0.3s ease';
      msg.textContent = 'Add at least one site below first!';
      focusCard.appendChild(msg);
      setTimeout(() => msg.remove(), 3000);
      return;
    }

    const response = await chrome.runtime.sendMessage({ type: 'FOCUS_STATUS' });
    if (response?.active) {
      showFocusActive(response.remainingMs, response.endsAt);
    }
  } catch (e) {
    console.error('[BlockPi] Failed to start focus:', e);
  } finally {
    isFocusProcessing = false;
    btnFocusStart.disabled = false;
  }
}

async function endFocus() {
  if (isFocusProcessing) return;
  isFocusProcessing = true;
  btnFocusEnd.disabled = true;

  try {
    await chrome.runtime.sendMessage({ type: 'FOCUS_END' });
    showFocusIdle();
  } catch (e) {
    console.error('[BlockPi] Failed to end focus:', e);
  } finally {
    isFocusProcessing = false;
    btnFocusEnd.disabled = false;
  }
}

function showFocusActive(remainingMs, endsAt) {
  focusIdle.style.display = 'none';
  focusActive.style.display = '';

  if (focusInterval) clearInterval(focusInterval);

  function updateTimer() {
    const remaining = Math.max(0, endsAt - Date.now());
    const totalDuration = endsAt - (endsAt - remainingMs); // approximation
    focusTimer.textContent = formatTime(Math.ceil(remaining / 1000));
    const elapsed = remainingMs - remaining;
    const percent = Math.min(100, (elapsed / remainingMs) * 100);
    focusProgress.style.width = `${percent}%`;

    if (remaining <= 0) {
      clearInterval(focusInterval);
      showFocusIdle();
    }
  }

  updateTimer();
  focusInterval = setInterval(updateTimer, 1000);
}

function showFocusIdle() {
  focusIdle.style.display = '';
  focusActive.style.display = 'none';
  focusTimer.textContent = '';
  focusProgress.style.width = '0%';
  if (focusInterval) {
    clearInterval(focusInterval);
    focusInterval = null;
  }
}

function getMaterialIcon(domain) {
  const map = {
    'youtube.com': 'play_circle', 'reddit.com': 'forum', 'twitter.com': 'chat',
    'x.com': 'chat', 'facebook.com': 'group', 'instagram.com': 'photo_camera',
    'tiktok.com': 'music_note', 'twitch.tv': 'videogame_asset', 'netflix.com': 'movie',
    'linkedin.com': 'work', 'discord.com': 'headset_mic', 'pinterest.com': 'push_pin'
  };
  return map[domain] || 'public';
}

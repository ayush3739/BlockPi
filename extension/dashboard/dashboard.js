/**
 * BlockPi — Dashboard Script (Vanilla CSS / Stitch Dark)
 */

import { getRules, getTodayAllUsage, getUsageForDays, getVaultLinks, addVaultLink, updateVaultLink, deleteVaultLink, importVaultLinks } from '../utils/storage.js';
import { getTodayKey, getLastNDaysKeys, getDayName, formatDuration, getUsagePercent } from '../utils/time.js';
import { getFaviconUrl } from '../utils/domain.js';

const CHART_COLORS = [
  '#4EDEA3', '#3ab88a', '#1a5c42', '#d4f7e8',
  '#8587e8', '#6063ee', '#c0c1ff', '#3a3d9e',
  '#d88aa8', '#815166', '#f2b6ce', '#f59e0b'
];

let mainChart = null;
let currentView = 'today';
let allVaultLinks = [];

const viewTitle = document.getElementById('view-title');
const viewSubtitle = document.getElementById('view-subtitle');
const chartTitle = document.getElementById('chart-title');
const statTotalTime = document.getElementById('stat-total-time');
const statFocusSaved = document.getElementById('stat-focus-saved');
const statSitesBlocked = document.getElementById('stat-sites-blocked');
const detailTbody = document.getElementById('detail-tbody');
const emptyDetail = document.getElementById('empty-detail');
const navItems = document.querySelectorAll('.nav-item[data-view]');

// Vault DOM elements
const analyticsSection = document.getElementById('analytics-section');
const vaultSection = document.getElementById('vault-section');
const vaultTbody = document.getElementById('vault-tbody');
const vaultEmpty = document.getElementById('vault-empty');
const vaultSearchInput = document.getElementById('vault-search-input');
const vaultTagSelect = document.getElementById('vault-tag-select');
const vaultStatTotal = document.getElementById('vault-stat-total');
const vaultStatDomains = document.getElementById('vault-stat-domains');
const vaultStatTags = document.getElementById('vault-stat-tags');
const btnVaultAdd = document.getElementById('btn-vault-add');
const btnVaultHelp = document.getElementById('btn-vault-help');
const btnVaultGuide = document.getElementById('btn-vault-guide');
const vaultQuickTips = document.getElementById('vault-quick-tips');
const btnOpenTipsModal = document.getElementById('btn-open-tips-modal');
const btnDismissTips = document.getElementById('btn-dismiss-tips');
const vaultHelpModal = document.getElementById('vault-help-modal');
const vaultHelpModalClose = document.getElementById('vault-help-modal-close');
const btnHelpGotIt = document.getElementById('btn-help-got-it');
const btnHelpOpenGuide = document.getElementById('btn-help-open-guide');
const btnExportJson = document.getElementById('btn-export-json');
const btnExportMd = document.getElementById('btn-export-md');
const btnImportJson = document.getElementById('btn-import-json');
const vaultFileInput = document.getElementById('vault-file-input');

const vaultModal = document.getElementById('vault-modal');
const vaultForm = document.getElementById('vault-form');
const vaultModalHeading = document.getElementById('vault-modal-heading');
const vaultModalClose = document.getElementById('vault-modal-close');
const btnVaultModalCancel = document.getElementById('btn-vault-modal-cancel');
const vaultInputId = document.getElementById('vault-input-id');
const vaultInputUrl = document.getElementById('vault-input-url');
const vaultInputTitle = document.getElementById('vault-input-title');
const vaultInputTags = document.getElementById('vault-input-tags');
const vaultInputNotes = document.getElementById('vault-input-notes');

document.addEventListener('DOMContentLoaded', init);

async function init() {
  try { await chrome.runtime.sendMessage({ type: 'FLUSH_USAGE' }); } catch { /* ignore */ }
  bindNav();
  bindVaultEvents();

  if (window.location.hash === '#vault') {
    navItems.forEach(n => n.classList.remove('active'));
    const vaultNav = document.querySelector('.nav-item[data-view="vault"]');
    if (vaultNav) vaultNav.classList.add('active');
    currentView = 'vault';
    await renderView('vault');
  } else {
    await renderView('today');
  }
}

function bindNav() {
  navItems.forEach(item => {
    item.addEventListener('click', async () => {
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      currentView = item.dataset.view;
      if (currentView === 'vault') {
        window.location.hash = '#vault';
      } else if (window.location.hash === '#vault') {
        history.replaceState(null, null, ' ');
      }
      await renderView(currentView);
    });
  });
}

async function renderView(view) {
  if (view === 'vault') {
    if (analyticsSection) analyticsSection.style.display = 'none';
    if (vaultSection) vaultSection.style.display = 'block';
    await renderVault();
  } else {
    if (analyticsSection) analyticsSection.style.display = 'block';
    if (vaultSection) vaultSection.style.display = 'none';
    if (view === 'today') await renderToday();
    else if (view === 'week') await renderWeek();
    else await renderSites();
  }
}

async function renderToday() {
  viewTitle.textContent = "Today's Overview";
  viewSubtitle.textContent = 'Here is your productivity breakdown for today.';
  chartTitle.textContent = 'Usage per Site';

  const rules = await getRules();
  const usage = await getTodayAllUsage(getTodayKey());
  const domains = Array.from(new Set([...Object.keys(rules), ...Object.keys(usage)]));

  let total = 0, saved = 0, blocked = 0;
  const labels = [], data = [], colors = [];

  domains.forEach((d, i) => {
    const used = usage[d] || 0;
    const rule = rules[d];
    total += used;
    if (rule) {
      saved += Math.max(0, rule.limitSeconds - used);
      if (used >= rule.limitSeconds) blocked++;
    }
    labels.push(rule ? (rule.label || d) : d);
    data.push(Math.round(used / 60));
    colors.push(CHART_COLORS[i % CHART_COLORS.length]);
  });

  statTotalTime.textContent = formatDuration(total);
  statFocusSaved.textContent = formatDuration(saved);
  statSitesBlocked.textContent = blocked;

  renderBarChart(labels, data, colors);
  renderTable(rules, usage);
}

async function renderWeek() {
  viewTitle.textContent = 'This Week';
  viewSubtitle.textContent = 'Last 7 days of browsing data';
  chartTitle.textContent = 'Daily Usage Trend';

  const rules = await getRules();
  const weekData = await getUsageForDays(7);
  const dayKeys = getLastNDaysKeys(7).reverse();
  
  const agg = {};
  dayKeys.forEach(dk => { for (const [d, s] of Object.entries(weekData[dk] || {})) agg[d] = (agg[d] || 0) + s; });
  const domains = Array.from(new Set([...Object.keys(rules), ...Object.keys(agg)]));

  let total = 0, totalLimit = 0, blockedDays = 0;
  const datasets = [];

  domains.forEach((d, i) => {
    const rule = rules[d];
    const vals = dayKeys.map(dk => {
      const u = weekData[dk]?.[d] || 0;
      total += u;
      if (rule && u >= rule.limitSeconds) blockedDays++;
      return Math.round(u / 60);
    });
    if (rule) totalLimit += rule.limitSeconds * 7;
    datasets.push({
      label: rule ? (rule.label || d) : d, data: vals,
      backgroundColor: CHART_COLORS[i % CHART_COLORS.length] + '99',
      borderColor: CHART_COLORS[i % CHART_COLORS.length],
      borderWidth: 2, borderRadius: 6, barPercentage: 0.7
    });
  });

  statTotalTime.textContent = formatDuration(total);
  statFocusSaved.textContent = formatDuration(Math.max(0, totalLimit - total));
  statSitesBlocked.textContent = blockedDays;

  renderGroupedChart(dayKeys.map(k => getDayName(k)), datasets);
  renderTable(rules, agg);
}

async function renderSites() {
  viewTitle.textContent = 'All Sites';
  viewSubtitle.textContent = 'Detailed per-site analytics';
  chartTitle.textContent = 'Top Sites (Last 30 Days)';

  const rules = await getRules();
  const monthData = await getUsageForDays(30);

  const agg = {};
  for (const day of Object.values(monthData))
    for (const [d, s] of Object.entries(day)) agg[d] = (agg[d] || 0) + s;

  const domains = Array.from(new Set([...Object.keys(rules), ...Object.keys(agg)]));

  let total = 0, totalLimit = 0;
  for (const s of Object.values(agg)) total += s;
  for (const d of Object.keys(rules)) totalLimit += rules[d].limitSeconds * 30;

  statTotalTime.textContent = formatDuration(total);
  statFocusSaved.textContent = formatDuration(Math.max(0, totalLimit - total));
  statSitesBlocked.textContent = Object.keys(rules).length;

  const sorted = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 10);
  renderHBarChart(
    sorted.map(([d]) => rules[d]?.label || d),
    sorted.map(([, s]) => Math.round(s / 60)),
    sorted.map((_, i) => CHART_COLORS[i % CHART_COLORS.length])
  );
  renderTable(rules, agg);
}

// ─── Charts ────────────────────────────────────────
function chartOpts(indexAxis) {
  return {
    responsive: true, maintainAspectRatio: false, indexAxis: indexAxis || 'x',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1e1e28', titleColor: '#e4e2ed', bodyColor: '#bcc1b7',
        borderColor: '#444a40', borderWidth: 1, cornerRadius: 10, padding: 14,
        titleFont: { family: 'Inter', weight: '600' },
        bodyFont: { family: 'Inter' },
        callbacks: { label: ctx => `${ctx.parsed.y ?? ctx.parsed.x} min` }
      }
    },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false }, ticks: { color: '#7c8278', font: { size: 11, family: 'Inter' } } },
      y: { grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false }, ticks: { color: '#7c8278', font: { size: 11, family: 'Inter' } } }
    },
    animation: { duration: 600, easing: 'easeOutQuart' }
  };
}

function destroyChart() { if (mainChart) { mainChart.destroy(); mainChart = null; } }

function renderBarChart(labels, data, colors) {
  destroyChart();
  mainChart = new Chart(document.getElementById('main-chart').getContext('2d'), {
    type: 'bar', data: { labels, datasets: [{ data, backgroundColor: colors.map(c => c + 'cc'), borderColor: colors, borderWidth: 1.5, borderRadius: 8, barPercentage: 0.55 }] },
    options: chartOpts()
  });
}

function renderGroupedChart(labels, datasets) {
  destroyChart();
  mainChart = new Chart(document.getElementById('main-chart').getContext('2d'), {
    type: 'bar', data: { labels, datasets }, options: chartOpts()
  });
}

function renderHBarChart(labels, data, colors) {
  destroyChart();
  mainChart = new Chart(document.getElementById('main-chart').getContext('2d'), {
    type: 'bar', data: { labels, datasets: [{ data, backgroundColor: colors.map(c => c + 'cc'), borderColor: colors, borderWidth: 1.5, borderRadius: 8, barPercentage: 0.45 }] },
    options: chartOpts('y')
  });
}

// ─── Table ─────────────────────────────────────────
function renderTable(rules, usage) {
  const domains = Array.from(new Set([...Object.keys(rules), ...Object.keys(usage)]));
  if (!domains.length) { detailTbody.innerHTML = ''; emptyDetail.style.display = ''; return; }
  emptyDetail.style.display = 'none';
  domains.sort((a, b) => (usage[b] || 0) - (usage[a] || 0));

  detailTbody.innerHTML = domains.map(d => {
    const r = rules[d], u = usage[d] || 0;
    const limitSec = r ? r.limitSeconds : null;
    const pct = limitSec ? getUsagePercent(u, limitSec) : 0;
    
    let barCls = '', txtCls = '';
    if (limitSec && pct >= 100) { barCls = 'danger'; txtCls = 'color:var(--error)'; }
    else if (limitSec && pct >= 50) barCls = 'warn';
    else if (!limitSec) barCls = 'inactive';

    const limitDisplay = r ? formatDuration(r.limitSeconds) : '<span style="opacity:0.5; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">Deleted</span>';
    const fillStyle = limitSec ? `width:${Math.min(100, pct)}%` : 'width:0%; background:transparent';

    return `<div class="table-row">
      <div class="col-site site-cell">
        <div class="site-cell-icon"><img src="${getFaviconUrl(d)}" alt=""/></div>
        <span class="t-body-md truncate" style="font-weight:500">${r ? (r.label || d) : d}</span>
      </div>
      <div class="col-time t-body-md" style="${txtCls || 'color:var(--on-surface-variant)'}">${formatDuration(u)}</div>
      <div class="col-limit t-body-md" style="color:var(--on-surface-variant)">${limitDisplay}</div>
      <div class="col-status">
        <div class="progress-track" style="height:6px">
          <div class="progress-fill ${barCls}" style="${fillStyle}"></div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ─── Vault View Logic ──────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatVaultDate(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

function getResourceIcon(domain, url) {
  const d = (domain || '').toLowerCase();
  const u = (url || '').toLowerCase();
  if (d.includes('instagram.com')) return { icon: 'movie', color: '#E1306C' };
  if (d.includes('youtube.com') || d.includes('youtu.be')) return { icon: 'play_circle', color: '#FF0000' };
  if (d.includes('github.com')) return { icon: 'code', color: '#e4e2ed' };
  if (d.includes('twitter.com') || d.includes('x.com')) return { icon: 'tag', color: '#1DA1F2' };
  if (u.endsWith('.pdf')) return { icon: 'picture_as_pdf', color: '#EF4444' };
  return { icon: 'link', color: 'var(--primary)' };
}

function formatDisplayUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === '/' ? '' : parsed.pathname;
    const query = parsed.search || '';
    const hash = parsed.hash || '';
    return `${parsed.protocol}//${parsed.hostname.replace(/^www\./, '')}${path}${query}${hash}`;
  } catch {
    return url;
  }
}

function formatDisplayTitle(item) {
  const customTitle = (item.title || '').trim();
  const domain = (item.domain || '').trim().toLowerCase();

  // If user or page gave a meaningful title that isn't just the domain
  if (customTitle && customTitle.toLowerCase() !== domain && !customTitle.startsWith('http://') && !customTitle.startsWith('https://')) {
    return customTitle;
  }

  // Derive a clean, readable title from pathname or query params
  try {
    const parsed = new URL(item.url);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
      const lastSlug = decodeURIComponent(pathParts[pathParts.length - 1]).replace(/[-_]/g, ' ');
      if (parsed.search) {
        // Look for model, query, or other helpful params
        const otherParam = parsed.searchParams.get('other');
        const qParam = parsed.searchParams.get('q') || parsed.searchParams.get('query');
        if (otherParam) {
          return `${lastSlug} (${decodeURIComponent(otherParam)})`;
        } else if (qParam) {
          return `${lastSlug}: ${decodeURIComponent(qParam)}`;
        } else {
          return `${lastSlug} (${decodeURIComponent(parsed.search.slice(1))})`;
        }
      }
      return lastSlug;
    }
  } catch { /* fallback */ }

  return customTitle || formatDisplayUrl(item.url) || item.domain || 'Resource';
}

async function renderVault() {
  viewTitle.textContent = 'Resource Vault';
  viewSubtitle.textContent = 'Your saved links, articles, reels, and digital resources.';

  allVaultLinks = await getVaultLinks();

  populateTagFilter(allVaultLinks);
  updateVaultStats(allVaultLinks);
  applyVaultFilters();
}

function updateVaultStats(links) {
  if (vaultStatTotal) vaultStatTotal.textContent = links.length;
  if (vaultStatDomains) {
    const domains = new Set(links.map(l => l.domain).filter(Boolean));
    vaultStatDomains.textContent = domains.size;
  }
  if (vaultStatTags) {
    const tags = new Set();
    links.forEach(l => (l.tags || []).forEach(t => tags.add(t.toLowerCase())));
    vaultStatTags.textContent = tags.size;
  }
}

function populateTagFilter(links) {
  if (!vaultTagSelect) return;
  const currentSelected = vaultTagSelect.value;
  const tagCounts = {};
  links.forEach(l => {
    (l.tags || []).forEach(t => {
      const tagLower = t.toLowerCase();
      tagCounts[tagLower] = (tagCounts[tagLower] || 0) + 1;
    });
  });

  const sortedTags = Object.keys(tagCounts).sort();
  vaultTagSelect.innerHTML = '<option value="all">All Tags</option>' +
    sortedTags.map(tag => `<option value="${escapeHtml(tag)}">#${escapeHtml(tag)} (${tagCounts[tag]})</option>`).join('');

  if (sortedTags.includes(currentSelected)) {
    vaultTagSelect.value = currentSelected;
  } else {
    vaultTagSelect.value = 'all';
  }
}

function applyVaultFilters() {
  const query = (vaultSearchInput ? vaultSearchInput.value : '').toLowerCase().trim();
  const selectedTag = vaultTagSelect ? vaultTagSelect.value : 'all';

  const filtered = allVaultLinks.filter(item => {
    const matchTag = selectedTag === 'all' || (item.tags || []).some(t => t.toLowerCase() === selectedTag);
    if (!matchTag) return false;

    if (!query) return true;
    const inTitle = (item.title || '').toLowerCase().includes(query);
    const inUrl = (item.url || '').toLowerCase().includes(query);
    const inDomain = (item.domain || '').toLowerCase().includes(query);
    const inNotes = (item.notes || '').toLowerCase().includes(query);
    const inTags = (item.tags || []).some(t => t.toLowerCase().includes(query));

    return inTitle || inUrl || inDomain || inNotes || inTags;
  });

  if (filtered.length === 0) {
    if (vaultEmpty) vaultEmpty.style.display = 'flex';
    if (vaultTbody) vaultTbody.innerHTML = '';
  } else {
    if (vaultEmpty) vaultEmpty.style.display = 'none';
    renderVaultRows(filtered);
  }
}

function renderVaultRows(links) {
  if (!vaultTbody) return;
  vaultTbody.innerHTML = links.map(item => {
    const iconInfo = getResourceIcon(item.domain, item.url);
    const tagsHtml = (item.tags && item.tags.length > 0)
      ? item.tags.map(t => `<span class="vault-tag-pill">#${escapeHtml(t)}</span>`).join('')
      : '<span style="color:var(--outline); font-size:12px;">—</span>';

    const notesHtml = item.notes
      ? `<div class="vault-notes-text" title="${escapeHtml(item.notes)}">${escapeHtml(item.notes)}</div>`
      : '<span style="color:var(--outline); font-size:12px;">—</span>';

    return `
      <div class="vault-table-row" data-id="${item.id}">
        <div class="vault-col-resource">
          <div class="vault-icon" style="color:${iconInfo.color}">
            <span class="material-symbols-outlined" style="font-size:18px;">${iconInfo.icon}</span>
          </div>
          <div class="vault-resource-info">
            <div class="vault-title-row">
              <span class="vault-domain-badge">${escapeHtml(item.domain || 'web')}</span>
              <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="vault-resource-title" title="${escapeHtml(item.url)}">
                ${escapeHtml(formatDisplayTitle(item))}
              </a>
            </div>
            <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="vault-resource-url" title="${escapeHtml(item.url)}">
              ${escapeHtml(formatDisplayUrl(item.url))}
            </a>
          </div>
        </div>
        <div class="vault-col-tags">
          ${tagsHtml}
        </div>
        <div class="vault-col-notes">
          ${notesHtml}
        </div>
        <div class="vault-col-date">
          <span class="vault-date-text">${formatVaultDate(item.savedAt)}</span>
        </div>
        <div class="vault-actions-cell">
          <button class="btn-icon-sm btn-action-open" title="Open Link" data-url="${escapeHtml(item.url)}">
            <span class="material-symbols-outlined" style="font-size:16px;">open_in_new</span>
          </button>
          <button class="btn-icon-sm btn-action-copy" title="Copy Link" data-url="${escapeHtml(item.url)}">
            <span class="material-symbols-outlined" style="font-size:16px;">content_copy</span>
          </button>
          <button class="btn-icon-sm btn-action-edit" title="Edit Resource" data-id="${item.id}">
            <span class="material-symbols-outlined" style="font-size:16px;">edit</span>
          </button>
          <button class="btn-icon-sm delete btn-action-delete" title="Delete" data-id="${item.id}">
            <span class="material-symbols-outlined" style="font-size:16px;">delete</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function debounce(fn, delay = 150) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function bindVaultEvents() {
  if (vaultSearchInput) {
    vaultSearchInput.addEventListener('input', debounce(() => applyVaultFilters(), 150));
  }

  if (vaultTagSelect) {
    vaultTagSelect.addEventListener('change', () => applyVaultFilters());
  }

  const btnVaultRefresh = document.getElementById('btn-vault-refresh');
  if (btnVaultRefresh) {
    btnVaultRefresh.addEventListener('click', async () => {
      btnVaultRefresh.classList.add('spinning');
      await renderVault();
      setTimeout(() => {
        btnVaultRefresh.classList.remove('spinning');
      }, 600);
    });
  }

  // Auto-sync Vault in real-time when links are captured from other tabs (via Alt+S, context menus, popup)
  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes['blockpi_vault']) {
        renderVault();
      }
    });
  } catch { /* ignore outside extension context */ }

  if (btnVaultAdd) {
    btnVaultAdd.addEventListener('click', () => openVaultModal());
  }

  if (btnVaultHelp) {
    btnVaultHelp.addEventListener('click', () => openVaultHelpModal());
  }

  if (btnOpenTipsModal) {
    btnOpenTipsModal.addEventListener('click', () => openVaultHelpModal());
  }

  if (btnDismissTips && vaultQuickTips) {
    btnDismissTips.addEventListener('click', () => {
      vaultQuickTips.style.display = 'none';
      try { localStorage.setItem('blockpi_vault_tips_dismissed', 'true'); } catch { /* ignore */ }
    });
  }

  // Check saved tips banner preference
  try {
    if (localStorage.getItem('blockpi_vault_tips_dismissed') === 'true' && vaultQuickTips) {
      vaultQuickTips.style.display = 'none';
    }
  } catch { /* ignore */ }

  if (vaultHelpModalClose) {
    vaultHelpModalClose.addEventListener('click', () => closeVaultHelpModal());
  }

  const VAULT_PLAYBOOK_URL = 'https://ayush3739.github.io/BlockPi/playbook/';

  if (btnHelpGotIt) {
    btnHelpGotIt.addEventListener('click', () => closeVaultHelpModal());
  }

  if (btnHelpOpenGuide) {
    btnHelpOpenGuide.addEventListener('click', () => {
      closeVaultHelpModal();
      chrome.tabs.create({ url: VAULT_PLAYBOOK_URL });
    });
  }

  if (vaultHelpModal) {
    vaultHelpModal.addEventListener('click', (e) => {
      if (e.target === vaultHelpModal) closeVaultHelpModal();
    });
  }

  const btnEmptyAdd = document.getElementById('btn-empty-add');
  if (btnEmptyAdd) {
    btnEmptyAdd.addEventListener('click', () => openVaultModal());
  }

  const btnEmptyPlaybook = document.getElementById('btn-empty-playbook');
  if (btnEmptyPlaybook) {
    btnEmptyPlaybook.addEventListener('click', () => {
      chrome.tabs.create({ url: VAULT_PLAYBOOK_URL });
    });
  }

  if (btnVaultGuide) {
    btnVaultGuide.addEventListener('click', () => {
      chrome.tabs.create({ url: VAULT_PLAYBOOK_URL });
    });
  }

  if (vaultModalClose) {
    vaultModalClose.addEventListener('click', () => closeVaultModal());
  }
  if (btnVaultModalCancel) {
    btnVaultModalCancel.addEventListener('click', () => closeVaultModal());
  }
  if (vaultModal) {
    vaultModal.addEventListener('click', (e) => {
      if (e.target === vaultModal) closeVaultModal();
    });
  }

  if (vaultForm) {
    vaultForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = vaultInputId.value;
      const url = vaultInputUrl.value.trim();
      const title = vaultInputTitle.value.trim();
      const tags = vaultInputTags.value.trim();
      const notes = vaultInputNotes.value.trim();

      if (!url) return;

      if (id) {
        await updateVaultLink(id, { url, title, tags, notes });
      } else {
        await addVaultLink({ url, title, tags, notes, metadata: { source: 'manual' } });
      }

      closeVaultModal();
      await renderVault();
    });
  }

  // Export JSON
  if (btnExportJson) {
    btnExportJson.addEventListener('click', async () => {
      const links = await getVaultLinks();
      const blob = new Blob([JSON.stringify(links, null, 2)], { type: 'application/json' });
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      const dateStr = new Date().toISOString().split('T')[0];
      a.download = `blockpi-vault-backup-${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(dlUrl);
    });
  }

  // Export Markdown
  if (btnExportMd) {
    btnExportMd.addEventListener('click', async () => {
      const links = await getVaultLinks();
      const dateStr = new Date().toISOString().split('T')[0];
      let md = `# 📚 BlockPi Resource Vault\n\n`;
      md += `*Exported on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}*\n`;
      md += `*Total Resources: ${links.length}*\n\n---\n\n`;
      md += `| Resource | Domain | Tags | Notes & Metadata | Saved Date |\n`;
      md += `|---|---|---|---|---|\n`;

      for (const item of links) {
        const title = (item.title || item.domain || 'Link').replace(/\|/g, '-');
        const tags = (item.tags || []).map(t => '`#' + t + '`').join(' ') || '—';
        const notes = (item.notes || '—').replace(/\|/g, '-').replace(/\r?\n/g, ' ');
        const date = item.savedAt ? item.savedAt.split('T')[0] : '—';
        md += `| [${title}](${item.url}) | ${item.domain || ''} | ${tags} | ${notes} | ${date} |\n`;
      }

      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = `blockpi-vault-${dateStr}.md`;
      a.click();
      URL.revokeObjectURL(dlUrl);
    });
  }

  // Import JSON ONLY
  if (btnImportJson) {
    btnImportJson.addEventListener('click', () => {
      if (vaultFileInput) vaultFileInput.click();
    });
  }

  if (vaultFileInput) {
    vaultFileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      if (!file.name.toLowerCase().endsWith('.json')) {
        alert('Please select a valid .json file exported from BlockPi Vault.');
        vaultFileInput.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          if (!Array.isArray(parsed)) {
            alert('Invalid file format: JSON must contain an array of saved links.');
            return;
          }
          const res = await importVaultLinks(parsed);
          alert(`Import successful!\n• ${res.imported} new resources added.\n• ${res.total} total resources in your Vault.`);
          await renderVault();
        } catch (err) {
          alert('Failed to parse JSON file: ' + err.message);
        } finally {
          vaultFileInput.value = '';
        }
      };
      reader.readAsText(file);
    });
  }

  // Table row actions delegation
  if (vaultTbody) {
    vaultTbody.addEventListener('click', async (e) => {
      const openBtn = e.target.closest('.btn-action-open');
      if (openBtn) {
        const url = openBtn.dataset.url;
        if (url) window.open(url, '_blank');
        return;
      }

      const copyBtn = e.target.closest('.btn-action-copy');
      if (copyBtn) {
        const url = copyBtn.dataset.url;
        if (url) {
          await navigator.clipboard.writeText(url);
          const iconSpan = copyBtn.querySelector('.material-symbols-outlined');
          if (iconSpan) {
            iconSpan.textContent = 'check';
            iconSpan.style.color = 'var(--primary)';
            setTimeout(() => {
              iconSpan.textContent = 'content_copy';
              iconSpan.style.color = '';
            }, 1500);
          }
        }
        return;
      }

      const editBtn = e.target.closest('.btn-action-edit');
      if (editBtn) {
        const id = editBtn.dataset.id;
        const item = allVaultLinks.find(l => l.id === id);
        if (item) openVaultModal(item);
        return;
      }

      const deleteBtn = e.target.closest('.btn-action-delete');
      if (deleteBtn) {
        const id = deleteBtn.dataset.id;
        await deleteVaultLink(id);
        await renderVault();
        return;
      }
    });
  }
}

function openVaultModal(item = null) {
  if (!vaultModal) return;
  vaultModal.style.display = 'flex';
  if (item) {
    if (vaultModalHeading) vaultModalHeading.textContent = 'Edit Resource';
    if (vaultInputId) vaultInputId.value = item.id;
    if (vaultInputUrl) vaultInputUrl.value = item.url || '';
    if (vaultInputTitle) vaultInputTitle.value = item.title || '';
    if (vaultInputTags) vaultInputTags.value = (item.tags || []).join(', ');
    if (vaultInputNotes) vaultInputNotes.value = item.notes || '';
  } else {
    if (vaultModalHeading) vaultModalHeading.textContent = 'Add Resource';
    if (vaultInputId) vaultInputId.value = '';
    if (vaultInputUrl) vaultInputUrl.value = '';
    if (vaultInputTitle) vaultInputTitle.value = '';
    if (vaultInputTags) vaultInputTags.value = '';
    if (vaultInputNotes) vaultInputNotes.value = '';
  }
  if (vaultInputUrl) vaultInputUrl.focus();
}

function closeVaultModal() {
  if (vaultModal) vaultModal.style.display = 'none';
}

function openVaultHelpModal() {
  if (vaultHelpModal) vaultHelpModal.style.display = 'flex';
}

function closeVaultHelpModal() {
  if (vaultHelpModal) vaultHelpModal.style.display = 'none';
}


/**
 * BlockPi — Options Script (Vanilla CSS / Stitch Dark)
 */

import { getRules, updateRule, deleteRule, getSettings, saveSettings, exportData, importData, clearAllData } from '../utils/storage.js';
import { formatDuration } from '../utils/time.js';
import { getFaviconUrl } from '../utils/domain.js';

const rulesList = document.getElementById('rules-list');
const rulesCount = document.getElementById('rules-count');
const rulesEmpty = document.getElementById('rules-empty');
const snoozeEnabled = document.getElementById('snooze-enabled');
const snoozeDuration = document.getElementById('snooze-duration');
const strictMode = document.getElementById('strict-mode');
const focusDuration = document.getElementById('focus-duration');
const quickAddMinutes = document.getElementById('quick-add-minutes');
const youtubeBravePwa = document.getElementById('youtube-brave-pwa');
const btnExport = document.getElementById('btn-export');
const btnImport = document.getElementById('btn-import');
const btnClear = document.getElementById('btn-clear');
const importFile = document.getElementById('import-file');
const btnBack = document.getElementById('btn-back');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

document.addEventListener('DOMContentLoaded', init);

async function init() {
  await renderRules();
  await loadSettings();
  bindEvents();
}

function bindEvents() {
  snoozeEnabled.addEventListener('change', saveCurrentSettings);
  snoozeDuration.addEventListener('change', saveCurrentSettings);
  strictMode.addEventListener('change', saveCurrentSettings);
  focusDuration.addEventListener('change', saveCurrentSettings);
  quickAddMinutes.addEventListener('change', saveCurrentSettings);
  youtubeBravePwa.addEventListener('change', saveCurrentSettings);
  btnExport.addEventListener('click', handleExport);
  btnImport.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', handleImport);
  btnClear.addEventListener('click', handleClear);
  btnBack.addEventListener('click', () => {
    window.location.href = '../popup/popup.html';
  });

  const nativeSetupModal = document.getElementById('native-setup-modal');
  document.getElementById('link-native-setup').addEventListener('click', (e) => {
    e.preventDefault();
    nativeSetupModal.style.display = 'flex';
  });
  document.getElementById('btn-close-native-modal').addEventListener('click', () => {
    nativeSetupModal.style.display = 'none';
  });
  nativeSetupModal.addEventListener('click', (e) => {
    if (e.target === nativeSetupModal) nativeSetupModal.style.display = 'none';
  });
}

async function renderRules() {
  const rules = await getRules();
  const domains = Object.keys(rules);
  rulesCount.textContent = domains.length;

  if (domains.length === 0) { rulesList.innerHTML = ''; rulesEmpty.style.display = ''; return; }
  rulesEmpty.style.display = 'none';

  rulesList.innerHTML = domains.map(d => {
    const r = rules[d];
    return `<div class="rule-item" data-domain="${d}">
      <div class="rule-item-left">
        <div class="rule-item-icon"><img src="${getFaviconUrl(d)}" alt=""/></div>
        <div>
          <p class="t-body-lg" style="color:var(--on-surface); font-weight:500">${r.label || d}</p>
          <p class="t-body-md" style="color:var(--on-surface-variant)">Limit: ${formatDuration(r.limitSeconds)} · ${r.enabled ? '✅ Enabled' : '⛔ Disabled'}</p>
        </div>
      </div>
      <div class="rule-item-actions">
        <button class="btn-icon-sm edit-btn" data-domain="${d}"><span class="material-symbols-outlined" style="font-size:20px">edit</span></button>
        <button class="btn-icon-sm danger delete-btn" data-domain="${d}"><span class="material-symbols-outlined" style="font-size:20px">delete</span></button>
      </div>
    </div>`;
  }).join('');

  rulesList.querySelectorAll('.edit-btn').forEach(b => b.addEventListener('click', () => openEditModal(b.dataset.domain)));
  rulesList.querySelectorAll('.delete-btn').forEach(b => b.addEventListener('click', async () => {
    if (confirm(`Delete rule for ${b.dataset.domain}?`)) { await deleteRule(b.dataset.domain); await renderRules(); showToast('Rule deleted'); }
  }));
}

async function openEditModal(domain) {
  const rules = await getRules();
  const r = rules[domain];
  if (!r) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card">
      <h3 class="t-h2">Edit — ${r.label || domain}</h3>
      <div class="modal-field">
        <label class="t-label">Label</label>
        <input type="text" id="edit-label" value="${r.label || domain}"/>
      </div>
      <div class="modal-field">
        <label class="t-label">Limit (minutes)</label>
        <input type="number" id="edit-limit" value="${Math.round(r.limitSeconds / 60)}" min="1" max="1440"/>
      </div>
      <div class="modal-field">
        <label class="t-label">Status</label>
        <select id="edit-status">
          <option value="true" ${r.enabled ? 'selected' : ''}>Enabled</option>
          <option value="false" ${!r.enabled ? 'selected' : ''}>Disabled</option>
        </select>
      </div>
      <div class="modal-actions">
        <button class="btn-modal-cancel" id="modal-cancel">Cancel</button>
        <button class="btn-primary" id="modal-save">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#modal-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#modal-save').addEventListener('click', async () => {
    const label = overlay.querySelector('#edit-label').value.trim();
    const limit = parseInt(overlay.querySelector('#edit-limit').value, 10);
    const enabled = overlay.querySelector('#edit-status').value === 'true';
    if (limit < 1) return;
    await updateRule(domain, { label: label || domain, limitSeconds: limit * 60, enabled });
    overlay.remove();
    await renderRules();
    showToast('Rule updated');
  });
}

async function loadSettings() {
  const s = await getSettings();
  snoozeEnabled.checked = s.snoozeEnabled !== false;
  snoozeDuration.value = s.snoozeDurationMinutes || 5;
  strictMode.checked = s.strictMode || false;
  focusDuration.value = s.focusDurationMinutes || 25;
  quickAddMinutes.value = s.quickAddMinutes || 15;
  youtubeBravePwa.checked = s.openYouTubeInBrave || false;
}

async function saveCurrentSettings() {
  await saveSettings({
    snoozeEnabled: snoozeEnabled.checked,
    snoozeDurationMinutes: parseInt(snoozeDuration.value, 10) || 5,
    strictMode: strictMode.checked,
    focusDurationMinutes: parseInt(focusDuration.value, 10) || 25,
    quickAddMinutes: parseInt(quickAddMinutes.value, 10) || 15,
    openYouTubeInBrave: youtubeBravePwa.checked
  });
  showToast('Settings saved');
}

async function handleExport() {
  const data = await exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `blockpi-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Data exported!');
}

async function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    await importData(data);
    await renderRules();
    await loadSettings();
    showToast('Data imported!');
  } catch { showToast('Invalid file format'); }
  importFile.value = '';
}

async function handleClear() {
  if (!confirm('Delete ALL rules, usage, and settings?')) return;
  if (!confirm('This cannot be undone. Continue?')) return;
  await clearAllData();
  await renderRules();
  await loadSettings();
  showToast('All data cleared');
}

function showToast(msg) {
  toastMessage.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

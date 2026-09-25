/**
 * BlockPi — Blocked Page Script
 * Handles stats display, motivation rotation, strict mode challenge,
 * focus mode awareness, and snooze.
 */

import { getRules, getTodayAllUsage, getSettings } from '../utils/storage.js';
import { getTodayKey, formatDuration, getSecondsUntilMidnight } from '../utils/time.js';

const MOTIVATIONS = [
  { emoji: '🌿', text: '"Focus on being productive instead of busy." Take a breath and return to your core tasks.' },
  { emoji: '🎯', text: 'Stay focused — you\'re building something great. Every minute counts.' },
  { emoji: '💪', text: 'Discipline is choosing what you want most over what you want now.' },
  { emoji: '🚀', text: 'Every minute saved is a minute invested in your future self.' },
  { emoji: '🧠', text: 'Your brain will thank you for this break from digital noise.' },
  { emoji: '🌟', text: 'Small daily improvements lead to stunning results over time.' },
  { emoji: '📚', text: 'What you do today shapes who you become tomorrow.' },
  { emoji: '🔥', text: 'You\'re on a roll! Keep this productive streak going strong.' },
  { emoji: '🎨', text: 'Create more than you consume. The world needs your ideas.' },
  { emoji: '🏔️', text: 'The view is worth the climb. Stay the course.' }
];

const REGRET_SENTENCES = [
  'I regret wasting time on distractions when I could be building my future',
  'Every second I spend scrolling is a second stolen from my dreams',
  'I choose discipline over distraction because my goals matter more',
  'This website does not serve my growth. I am better than this habit',
  'I will not let a screen control my potential. I am taking back my focus',
  'The time I waste today is the opportunity I lose tomorrow',
  'I am stronger than my urge to procrastinate. My future self will thank me',
  'Scrolling gives me nothing. Building gives me everything',
  'I deserve better than wasting my life on distractions',
  'My time is the most valuable thing I own. I refuse to waste it here'
];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const params = new URLSearchParams(window.location.search);
  const domain = params.get('domain') || 'unknown';
  let isFocusBlock = params.get('focus') === 'true';

  try { await chrome.runtime.sendMessage({ type: 'FLUSH_USAGE' }); } catch { /* ignore */ }
  
  // Verify if focus mode is ACTUALLY still active
  if (isFocusBlock) {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'FOCUS_STATUS' });
      if (!response || !response.active) {
        isFocusBlock = false; // Focus ended while they were on this page
      } else if (response.remainingMs > 0) {
        // Automatically redirect back to the site the exact second Focus Mode ends!
        setTimeout(() => {
          const origUrl = params.get('url');
          window.location.replace(origUrl || `https://${domain}`);
        }, response.remainingMs + 1000); // 1s buffer to ensure DNR rules have cleared
      }
    } catch (e) {}
  }

  const todayKey = getTodayKey();
  const rules = await getRules();
  const rule = rules[domain];
  const settings = await getSettings();
  
  if (rule) {
    const usage = await getTodayAllUsage(todayKey);
    const used = usage[domain] || 0;
    
    // Self-healing fallback: If they refreshed this page but the limit was increased 
    // or the rule was disabled in settings, redirect them immediately to the site.
    // Skip this check if Strict Mode is active, because strict mode blocks regardless of usage.
    if (!isFocusBlock && !settings.strictMode && (!rule.enabled || used < rule.limitSeconds)) {
      await unblockAndRedirect(domain, params.get('url'));
      return;
    }
  } else if (!isFocusBlock && !settings.strictMode && domain !== 'unknown') {
    // Rule was completely deleted
    await unblockAndRedirect(domain, params.get('url'));
    return;
  }

  await renderBlockedInfo(domain);
  await setupMode(domain, isFocusBlock);
  setupDashboardButton();
  createParticles();
  startResetCountdown();
}

async function unblockAndRedirect(domain, origUrl) {
  try {
    await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'UNBLOCK_DOMAIN', domain: domain }, resolve);
    });
  } catch (e) {
    console.error('Failed to unblock domain:', e);
  }
  // Redirect back after ensuring the blocking rule is removed
  window.location.replace(origUrl || `https://${domain}`);
}

async function renderBlockedInfo(domain) {
  document.getElementById('blocked-domain').textContent = domain;
  document.title = `${domain} — Blocked by BlockPi`;

  const todayKey = getTodayKey();
  const rules = await getRules();
  const usage = await getTodayAllUsage(todayKey);

  const rule = rules[domain];
  const used = usage[domain] || 0;

  document.getElementById('time-spent').textContent = formatDuration(used);
  document.getElementById('daily-limit').textContent = rule ? formatDuration(rule.limitSeconds) : '—';
  
  if (rule && used > rule.limitSeconds) {
    document.getElementById('limit-label').textContent = 'Base Limit';
    document.getElementById('limit-label').style.color = 'var(--error)';
  }

  document.getElementById('resets-in').textContent = formatDuration(getSecondsUntilMidnight());

  // Random motivation rotation
  const motivationEl = document.getElementById('motivation');
  const emojiEl = motivationEl.querySelector('.motivation-emoji');
  const textEl = motivationEl.querySelector('.motivation-text');

  function updateMotivation() {
    const msg = MOTIVATIONS[Math.floor(Math.random() * MOTIVATIONS.length)];
    emojiEl.textContent = msg.emoji;
    textEl.textContent = msg.text;
  }

  updateMotivation();
  setInterval(updateMotivation, 8000);
}

async function setupMode(domain, isFocusBlock) {
  const settings = await getSettings();

  // Focus mode indicator
  if (isFocusBlock) {
    document.getElementById('focus-badge').style.display = '';
  }

  const btnSnooze = document.getElementById('btn-snooze');
  const normalActions = document.getElementById('normal-actions');
  const strictChallenge = document.getElementById('strict-challenge');
  const snoozeMins = settings.snoozeDurationMinutes || 5;

  btnSnooze.textContent = `Snooze ${snoozeMins}m`;

  // During focus mode — no snooze at all
  if (isFocusBlock) {
    btnSnooze.style.display = 'none';
    return;
  }

  // Strict Mode — hide normal snooze, show strict message
  if (settings.strictMode) {
    btnSnooze.style.display = 'none';
    document.getElementById('strict-message').style.display = 'block';
    return;
  }

  // Normal mode
  if (!settings.snoozeEnabled) {
    btnSnooze.style.display = 'none';
    return;
  }

  let isSnoozing = false;
  btnSnooze.addEventListener('click', () => {
    if (isSnoozing) return;
    isSnoozing = true;
    btnSnooze.disabled = true;

    chrome.runtime.sendMessage({
      type: 'SNOOZE',
      domain: domain,
      minutes: settings.snoozeDurationMinutes || 5
    }, () => {
      const origUrl = new URLSearchParams(window.location.search).get('url');
      if (origUrl) {
        window.location.replace(origUrl);
      } else {
        window.location.replace(`https://${domain}`);
      }
    });
  });
}

function setupDashboardButton() {
  document.getElementById('btn-dashboard').addEventListener('click', () => {
    window.location.href = chrome.runtime.getURL('dashboard/dashboard.html');
  });
}

function startResetCountdown() {
  setInterval(() => {
    document.getElementById('resets-in').textContent = formatDuration(getSecondsUntilMidnight());
  }, 1000);
}

function createParticles() {
  const container = document.getElementById('particles');
  if (!container) return;

  // More particles, more visible, varying sizes
  for (let i = 0; i < 40; i++) {
    const particle = document.createElement('div');
    const size = 4 + Math.random() * 12; // 4px to 16px (much larger)
    const duration = 6 + Math.random() * 8; // Faster rising
    const delay = Math.random() * duration;
    const left = Math.random() * 100;
    // Higher opacity for visibility
    const color = Math.random() > 0.5 ? 'rgba(78, 222, 163, 0.25)' : 'rgba(133, 135, 232, 0.25)';

    particle.style.cssText = `
      position: absolute;
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border-radius: 50%;
      left: ${left}%;
      bottom: -20px;
      box-shadow: 0 0 8px ${color}; /* Glow effect */
      animation: float-up ${duration}s ease-in-out ${delay}s infinite;
    `;
    container.appendChild(particle);
  }

  // Inject keyframe animation
  if (!document.getElementById('particle-style')) {
    const style = document.createElement('style');
    style.id = 'particle-style';
    style.textContent = `
      @keyframes float-up {
        0% { opacity: 0; transform: translateY(0) scale(0.5); }
        10% { opacity: 1; }
        90% { opacity: 0.3; }
        100% { opacity: 0; transform: translateY(-100vh) scale(1); }
      }
    `;
    document.head.appendChild(style);
  }
}

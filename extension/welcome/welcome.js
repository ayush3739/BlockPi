/**
 * BlockPi — Welcome / Onboarding Script
 * Handles the 4-step onboarding flow and quick setup presets.
 */

import { setRule } from '../utils/storage.js';

const PRESETS = [
  { domain: 'youtube.com', label: 'YouTube', icon: 'play_circle', limit: 30 },
  { domain: 'reddit.com', label: 'Reddit', icon: 'forum', limit: 30 },
  { domain: 'twitter.com', label: 'Twitter / X', icon: 'chat', limit: 30 },
  { domain: 'instagram.com', label: 'Instagram', icon: 'photo_camera', limit: 30 },
  { domain: 'tiktok.com', label: 'TikTok', icon: 'music_note', limit: 30 },
  { domain: 'facebook.com', label: 'Facebook', icon: 'group', limit: 30 },
  { domain: 'twitch.tv', label: 'Twitch', icon: 'videogame_asset', limit: 30 },
  { domain: 'discord.com', label: 'Discord', icon: 'headset_mic', limit: 30 },
  { domain: 'netflix.com', label: 'Netflix', icon: 'movie', limit: 30 }
];

let currentStep = 1;
const selectedPresets = new Set();

document.addEventListener('DOMContentLoaded', () => {
  renderPresets();
  bindEvents();
  createParticles();
});

function bindEvents() {
  document.getElementById('btn-next-1').addEventListener('click', () => goToStep(2));
  document.getElementById('btn-next-2').addEventListener('click', () => goToStep(3));
  document.getElementById('btn-skip').addEventListener('click', () => goToStep(4));
  document.getElementById('btn-setup').addEventListener('click', handleSetup);
  document.getElementById('btn-close').addEventListener('click', () => {
    window.close();
  });
}

function goToStep(step) {
  document.querySelectorAll('.welcome-step').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.dot').forEach(el => el.classList.remove('active'));

  document.getElementById(`step-${step}`).classList.add('active');
  document.querySelector(`.dot[data-step="${step}"]`).classList.add('active');
  currentStep = step;
}

function renderPresets() {
  const grid = document.getElementById('preset-grid');
  grid.innerHTML = '';

  for (const preset of PRESETS) {
    const item = document.createElement('div');
    item.className = 'preset-item';
    item.dataset.domain = preset.domain;
    item.innerHTML = `
      <span class="material-symbols-outlined preset-icon">${preset.icon}</span>
      <span class="preset-label">${preset.label}</span>
    `;
    item.addEventListener('click', () => {
      item.classList.toggle('selected');
      if (selectedPresets.has(preset.domain)) {
        selectedPresets.delete(preset.domain);
      } else {
        selectedPresets.add(preset.domain);
      }
    });
    grid.appendChild(item);
  }
}

async function handleSetup() {
  if (selectedPresets.size === 0) {
    goToStep(4);
    return;
  }

  for (const preset of PRESETS) {
    if (selectedPresets.has(preset.domain)) {
      await setRule(preset.domain, preset.limit * 60, preset.label);
    }
  }

  goToStep(4);
}

function createParticles() {
  const container = document.getElementById('particles');
  if (!container) return;

  for (let i = 0; i < 20; i++) {
    const particle = document.createElement('div');
    const size = 2 + Math.random() * 4;
    const duration = 8 + Math.random() * 12;
    const delay = Math.random() * duration;
    const left = Math.random() * 100;
    const color = Math.random() > 0.5 ? 'rgba(78, 222, 163, 0.15)' : 'rgba(133, 135, 232, 0.12)';

    particle.style.cssText = `
      position: absolute;
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border-radius: 50%;
      left: ${left}%;
      bottom: -10px;
      animation: float-up ${duration}s ease-in-out ${delay}s infinite;
    `;
    container.appendChild(particle);
  }

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

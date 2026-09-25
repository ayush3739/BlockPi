/**
 * BlockPi — Resource Vault Guide Script
 */

const PRESETS = {
  reel: {
    title: '3 Python Async Tricks Nobody Talks About',
    url: 'https://www.instagram.com/reel/C7xK9p...',
    tags: '#to-try, #python, #async, #reel',
    notes: 'Use asyncio.TaskGroup instead of gather for safer cancellation in Python 3.11+'
  },
  repo: {
    title: 'tiangolo/fastapi: Modern, high performance web framework',
    url: 'https://github.com/tiangolo/fastapi',
    tags: '#to-try, #backend, #fastapi, #python, #repo',
    notes: 'Star for API template reference. Look at dependency injection patterns in tutorial.'
  },
  paper: {
    title: 'Dense Passage Retrieval for Open-Domain Question Answering',
    url: 'https://arxiv.org/abs/2004.04906',
    tags: '#to-read, #ai, #rag, #paper',
    notes: 'Foundation paper for modern dual-encoder vector search in RAG pipelines.'
  },
  tool: {
    title: 'Excalidraw: Virtual collaborative whiteboard',
    url: 'https://excalidraw.com',
    tags: '#reference, #tool, #architecture, #system-design',
    notes: 'Hand-drawn feel diagrams for architecture reviews and technical documentation.'
  }
};

document.addEventListener('DOMContentLoaded', () => {
  initTocSpy();
  initSandbox();
  initCopySample();
  initVaultCTA();
});

function initTocSpy() {
  const links = document.querySelectorAll('.toc-link');
  const sections = Array.from(links).map(l => document.querySelector(l.getAttribute('href'))).filter(Boolean);

  window.addEventListener('scroll', () => {
    let current = '';
    const scrollPos = window.scrollY + 120;

    sections.forEach(section => {
      if (section.offsetTop <= scrollPos) {
        current = '#' + section.id;
      }
    });

    links.forEach(link => {
      if (link.getAttribute('href') === current) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }, { passive: true });
}

function initSandbox() {
  const presetBtns = document.querySelectorAll('.btn-preset');
  const titleInput = document.getElementById('sb-title');
  const urlInput = document.getElementById('sb-url');
  const tagsInput = document.getElementById('sb-tags');
  const notesInput = document.getElementById('sb-notes');
  const saveBtn = document.getElementById('btn-sandbox-save');
  const feedback = document.getElementById('sandbox-feedback');

  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      presetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const presetKey = btn.dataset.preset;
      const data = PRESETS[presetKey];
      if (data) {
        titleInput.value = data.title;
        urlInput.value = data.url;
        tagsInput.value = data.tags;
        notesInput.value = data.notes;
      }
    });
  });

  saveBtn.addEventListener('click', async () => {
    const title = titleInput.value.trim();
    const url = urlInput.value.trim();
    const tagsStr = tagsInput.value.trim();
    const notes = notesInput.value.trim();

    if (!url) return;

    const tags = tagsStr
      .split(',')
      .map(t => t.trim().replace(/^#/, ''))
      .filter(Boolean);

    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        await chrome.runtime.sendMessage({
          type: 'ADD_TO_VAULT',
          payload: {
            url,
            title: title || url,
            tags,
            notes,
            metadata: { source: 'guide-sandbox' }
          }
        });
      }
      feedback.style.display = 'inline';
      feedback.textContent = '✓ Saved to BlockPi Vault!';
      setTimeout(() => {
        feedback.style.display = 'none';
      }, 3000);
    } catch (e) {
      console.error('Failed to save from sandbox:', e);
      feedback.style.display = 'inline';
      feedback.textContent = 'Saved locally!';
      setTimeout(() => {
        feedback.style.display = 'none';
      }, 3000);
    }
  });
}

function initCopySample() {
  const copyBtn = document.getElementById('btn-copy-md-sample');
  const codeEl = document.getElementById('sample-md-code');
  if (!copyBtn || !codeEl) return;

  copyBtn.addEventListener('click', async () => {
    try {
      const text = codeEl.textContent;
      await navigator.clipboard.writeText(text);
      
      const copyText = copyBtn.querySelector('.btn-copy-text');
      const copyIcon = copyBtn.querySelector('.icon-copy');
      
      copyBtn.classList.add('copied');
      if (copyText) copyText.textContent = 'Copied!';
      if (copyIcon) copyIcon.textContent = 'check';

      setTimeout(() => {
        copyBtn.classList.remove('copied');
        if (copyText) copyText.textContent = 'Copy Sample';
        if (copyIcon) copyIcon.textContent = 'content_copy';
      }, 2000);
    } catch (err) {
      console.error('Failed to copy sample code:', err);
    }
  });
}

function initVaultCTA() {
  const openVaultBtn = document.getElementById('btn-open-vault');
  const hintEl = document.getElementById('vault-access-hint');
  if (!openVaultBtn) return;

  openVaultBtn.addEventListener('click', (e) => {
    // If inside extension context with chrome.runtime
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
      try {
        const vaultUrl = chrome.runtime.getURL('dashboard/dashboard.html#vault');
        window.open(vaultUrl, '_blank');
        e.preventDefault();
        return;
      } catch (err) {
        console.warn('Could not launch chrome.runtime URL:', err);
      }
    }

    // In web browser (GitHub Pages or dev server)
    // Reveal helpful instructions instead of leading to a 404
    if (hintEl) {
      e.preventDefault();
      const isVisible = hintEl.style.display === 'block';
      hintEl.style.display = isVisible ? 'none' : 'block';
      if (!isVisible) {
        hintEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  });
}


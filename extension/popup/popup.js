/**
 * EDS QA Helper — Popup Controller
 */
document.addEventListener('DOMContentLoaded', async () => {
  const toggleBtn = document.getElementById('toggle-btn');
  const toggleIcon = document.getElementById('toggle-icon');
  const toggleLabel = document.getElementById('toggle-label');
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.querySelector('.status-text');
  const headerDot = document.querySelector('.dot');
  const pageInfo = document.getElementById('page-info');
  const tokenInput = document.getElementById('token-input');
  const tokenSave = document.getElementById('token-save');
  const tokenHint = document.querySelector('.token-hint');

  // ─── Check current page ───────────────────────────────────────────────
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || '';

  const isEDS =
    url.includes('.hlx.page') ||
    url.includes('.hlx.live') ||
    url.includes('.aem.page') ||
    url.includes('.aem.live') ||
    url.includes('localhost');

  if (!isEDS) {
    statusDot.className = 'status-dot error';
    statusText.textContent = 'Not an AEM EDS page';
    toggleBtn.disabled = true;
    pageInfo.textContent = url.slice(0, 60);
    pageInfo.classList.add('visible');
    return;
  }

  // Show environment
  const env = url.includes('.hlx.page')
    ? 'Preview'
    : url.includes('.hlx.live')
      ? 'Live'
      : url.includes('.aem.page')
        ? 'AEM Preview'
        : url.includes('.aem.live')
          ? 'AEM Live'
          : 'Localhost';

  pageInfo.textContent = `${env} — ${new URL(url).pathname}`;
  pageInfo.classList.add('visible');

  // ─── Check if active ──────────────────────────────────────────────────
  const { active } = await chrome.runtime.sendMessage({ action: 'isActive' });
  updateUI(active);
  toggleBtn.disabled = false;

  // ─── Toggle ───────────────────────────────────────────────────────────
  toggleBtn.addEventListener('click', async () => {
    toggleBtn.disabled = true;
    const result = await chrome.runtime.sendMessage({ action: 'toggle' });

    if (result.success) {
      const nowActive = await chrome.runtime.sendMessage({ action: 'isActive' });
      updateUI(nowActive.active);
    } else {
      statusDot.className = 'status-dot error';
      statusText.textContent = result.error || 'Injection failed';
    }

    toggleBtn.disabled = false;
  });

  function updateUI(isActive) {
    if (isActive) {
      statusDot.className = 'status-dot active';
      statusText.textContent = 'Active on this page';
      headerDot.classList.add('active');
      toggleBtn.className = 'btn danger';
      toggleIcon.textContent = '■';
      toggleLabel.textContent = 'Deactivate';
    } else {
      statusDot.className = 'status-dot inactive';
      statusText.textContent = 'Inactive';
      headerDot.classList.remove('active');
      toggleBtn.className = 'btn primary';
      toggleIcon.textContent = '▶';
      toggleLabel.textContent = 'Activate';
    }
  }

  // ─── Token Management ─────────────────────────────────────────────────
  const { token } = await chrome.runtime.sendMessage({ action: 'getToken' });
  if (token) {
    tokenInput.value = token;
  }

  tokenSave.addEventListener('click', async () => {
    const t = tokenInput.value.trim();
    if (t) {
      await chrome.runtime.sendMessage({ action: 'saveToken', token: t });
      tokenHint.textContent = '✓ Token saved';
      tokenHint.classList.add('token-saved');
      setTimeout(() => {
        tokenHint.textContent = 'Saved locally. Used for Figma design comparison.';
        tokenHint.classList.remove('token-saved');
      }, 2000);
    }
  });

  // Save on Enter
  tokenInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') tokenSave.click();
  });
});

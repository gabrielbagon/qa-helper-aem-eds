/**
 * EDS QA Helper — Background Service Worker
 *
 * Responsibilities:
 * 1. Inject/remove QA Helper into the active tab
 * 2. Proxy Figma API requests (bypasses CORS — the killer feature of being an extension)
 * 3. Persist Figma token across sessions via chrome.storage
 * 4. Track active tabs
 */

// Track which tabs have QA Helper active
const activeTabs = new Set();

// ─── INJECTION ──────────────────────────────────────────────────────────────

async function injectQAHelper(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/qa-helper.js'],
    });
    activeTabs.add(tabId);
    await updateBadge(tabId, true);
    return { success: true };
  } catch (err) {
    console.error('[QA Helper] Injection failed:', err);
    return { success: false, error: err.message };
  }
}

async function removeQAHelper(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const root = document.getElementById('qa-helper-root');
        if (root) root.remove();
        window.__qaHelperActive = false;
        // Remover highlights
        document.querySelectorAll('[data-qa-highlight]').forEach((el) => el.remove());
      },
    });
    activeTabs.delete(tabId);
    await updateBadge(tabId, false);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function toggleQAHelper(tabId) {
  if (activeTabs.has(tabId)) {
    return removeQAHelper(tabId);
  }
  return injectQAHelper(tabId);
}

async function isActive(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => !!window.__qaHelperActive,
    });
    const active = result?.result || false;
    if (active) activeTabs.add(tabId);
    else activeTabs.delete(tabId);
    return active;
  } catch {
    return false;
  }
}

// ─── BADGE ──────────────────────────────────────────────────────────────────

async function updateBadge(tabId, active) {
  await chrome.action.setBadgeText({
    text: active ? 'ON' : '',
    tabId,
  });
  await chrome.action.setBadgeBackgroundColor({
    color: active ? '#22c55e' : '#64748b',
    tabId,
  });
}

// ─── FIGMA API PROXY ────────────────────────────────────────────────────────
// A extensão Chrome roda o fetch no background — sem CORS.
// Isso elimina o problema de CORS que o script injetável tinha.

async function figmaApiFetch(endpoint, token) {
  try {
    const resp = await fetch(`https://api.figma.com/v1${endpoint}`, {
      headers: { 'X-Figma-Token': token },
    });

    if (!resp.ok) {
      return {
        success: false,
        status: resp.status,
        error:
          resp.status === 403
            ? 'Token inválido ou sem permissão'
            : resp.status === 404
              ? 'Arquivo ou node não encontrado'
              : `Figma API erro ${resp.status}`,
      };
    }

    const data = await resp.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── TOKEN STORAGE ──────────────────────────────────────────────────────────

async function saveToken(token) {
  await chrome.storage.local.set({ figmaToken: token });
}

async function getToken() {
  const result = await chrome.storage.local.get('figmaToken');
  return result.figmaToken || null;
}

// ─── MESSAGE HANDLER ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = async () => {
    switch (msg.action) {
      case 'toggle': {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) return toggleQAHelper(tab.id);
        return { success: false, error: 'No active tab' };
      }

      case 'inject': {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) return injectQAHelper(tab.id);
        return { success: false, error: 'No active tab' };
      }

      case 'remove': {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) return removeQAHelper(tab.id);
        return { success: false, error: 'No active tab' };
      }

      case 'isActive': {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
          const active = await isActive(tab.id);
          return { active };
        }
        return { active: false };
      }

      case 'figmaApi': {
        const result = await figmaApiFetch(msg.endpoint, msg.token);
        return result;
      }

      case 'saveToken': {
        await saveToken(msg.token);
        return { success: true };
      }

      case 'getToken': {
        const token = await getToken();
        return { token };
      }

      default:
        return { error: 'Unknown action' };
    }
  };

  handler().then(sendResponse);
  return true; // keep channel open for async response
});

// ─── TAB LIFECYCLE ──────────────────────────────────────────────────────────

// Limpar estado quando tab fecha
chrome.tabs.onRemoved.addListener((tabId) => {
  activeTabs.delete(tabId);
});

// Limpar estado quando tab navega pra outra página
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    activeTabs.delete(tabId);
    updateBadge(tabId, false);
  }
});

// Keyboard shortcut: Ctrl+Shift+Q para toggle (registrado no manifest commands)
chrome.commands?.onCommand?.addListener(async (command) => {
  if (command === 'toggle-qa-helper') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) await toggleQAHelper(tab.id);
  }
});

"use strict";

//#region Constants
const UNINSTALL_URL = "https://playfulsparkle.com/en-gb/playful-sparkle-seo-audit/uninstall/";
const INSTALL_URL = "https://playfulsparkle.com/en-gb/playful-sparkle-seo-audit/";
const UPDATE_URL = "https://playfulsparkle.com/en-gb/playful-sparkle-seo-audit/whats-new/";
const DEBUG = false;

const CONTEXT_MENU_CONTEXTS = ["page", "selection", "image", "link"];
const CONTEXT_MENU_URL_PATTERNS = ["http://*/*", "https://*/*"];

// Sub-menu ids double as their own i18n message keys (see createMenuItem),
// so adding an entry here is enough to add a new menu item.
const CONTEXT_MENU_ITEM_IDS = [
  "text_external_link",
  "text_nofollow_link",
  "text_duplicate_link",
  "text_img_missing_alt"
];

// Maps a context-menu id to the highlighter "mode" the injected script
// understands. Kept separate from CONTEXT_MENU_ITEM_IDS since the overlay's
// internal mode names ("empty-alt") don't have to match the menu/i18n ids.
const MENU_ID_TO_HIGHLIGHT_MODE = Object.freeze({
  text_external_link: "external-link",
  text_nofollow_link: "nofollow-link",
  text_duplicate_link: "duplicate-link",
  text_img_missing_alt: "empty-alt"
});

const ALLOWED_RESPONSE_HEADERS = new Set([
  "x-robots-tag",
  "alt-svc",
  "x-ua-compatible",
  "strict-transport-security",
  "referrer-policy",
  "x-content-type-options",
  "x-xss-protection",
  "x-frame-options",
  "content-security-policy"
]);

const MAX_HIGHLIGHT_NODES = 20000;
const MAX_DEDUPE_TEXT_LENGTH = 255;
//#endregion


//#region Session storage (per-tab headers / load status)
const headerStorageKey = tabId => `hdr:${tabId}`;
const statusStorageKey = tabId => `status:${tabId}`;

async function getSessionValue(key, default_value = null) {
  const result = await chrome.storage.session.get(key);
  return result[key] ?? default_value;
}

async function setSessionValue(key, value) {
  await chrome.storage.session.set({ [key]: value });
}

const getStoredHeaders = tabId => getSessionValue(headerStorageKey(tabId), Object.create(null));
const setStoredHeaders = (tabId, urlHeaderMap) => setSessionValue(headerStorageKey(tabId), urlHeaderMap);
const getStoredStatus = tabId => getSessionValue(statusStorageKey(tabId), null);
const setStoredStatus = (tabId, status) => setSessionValue(statusStorageKey(tabId), status);

async function clearTabData(tabId) {
  await chrome.storage.session.remove([headerStorageKey(tabId), statusStorageKey(tabId)]);
}

async function saveSetting(offset, value) {
  try {
    await chrome.storage.local.set({ [offset]: value });
    return true;
  } catch {
    return false;
  }
}
//#endregion


//#region Install / update / context menus
function createMenuItem(props) {
  chrome.contextMenus.create(props, () => {
    void chrome.runtime.lastError; // menu may already exist during rapid reinstall/update — nothing actionable
  });
}

async function rebuildContextMenus() {
  await chrome.contextMenus.removeAll();

  createMenuItem({
    id: "menu_parent",
    title: chrome.i18n.getMessage("text_context_menu"),
    contexts: CONTEXT_MENU_CONTEXTS,
    documentUrlPatterns: CONTEXT_MENU_URL_PATTERNS
  });

  for (const id of CONTEXT_MENU_ITEM_IDS) {
    createMenuItem({
      id,
      parentId: "menu_parent",
      title: chrome.i18n.getMessage(id),
      contexts: CONTEXT_MENU_CONTEXTS,
    documentUrlPatterns: CONTEXT_MENU_URL_PATTERNS
    });
  }
}

async function applyDefaultSettings() {
  await Promise.all([
    saveSetting("show-seo-preview", true),
    saveSetting("fetch-robots-txt", true),
    saveSetting("user-agent", "*")
  ]);
}

chrome.runtime.onInstalled.addListener(async details => {
  // Always set the uninstall survey URL (so it stays current on updates)
  if (!DEBUG) {
    chrome.runtime.setUninstallURL(UNINSTALL_URL);
  }

  if (details.reason === "install") {
    if (!DEBUG) {
      chrome.tabs.create({ url: INSTALL_URL });
    }

    await applyDefaultSettings();
  } else if (details.reason === "update") {
    if (!DEBUG) {
      chrome.tabs.create({ url: UPDATE_URL });
    }
  }

  // Menus are cleared and re-added on every install/update.
  await rebuildContextMenus();
});
//#endregion


//#region Response headers and tab load-status tracking
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.status) {
    return;
  }

  try {
    const previous_status = await getStoredStatus(tabId);

    if (previous_status === changeInfo.status) {
      return;
    }

    await setStoredStatus(tabId, changeInfo.status);

    try {
      await chrome.runtime.sendMessage({ tabId, status: changeInfo.status });
    } catch {
      // Popup not open — nothing to notify.
    }
  } catch {
    // Session storage unavailable — nothing actionable here.
  }
});

function isTrackedMainFrameRequest(details) {
  return details.tabId >= 0 && details.frameId === 0;
}

// Clear stale per-URL header data for a tab the moment a new top-level
// navigation starts, instead of only on tab close. Without this, a tab
// that stays open a long time (or a page that does many client-side
// navigations you also intercept) accumulates one entry per URL forever.
chrome.webRequest.onBeforeRequest.addListener(
  details => {
    if (isTrackedMainFrameRequest(details)) {
      clearTabData(details.tabId);
    }
  },
  { urls: ["<all_urls>"], types: ["main_frame"] }
);

chrome.webRequest.onHeadersReceived.addListener(
  details => {
    if (!isTrackedMainFrameRequest(details)) {
      return;
    }

    const filtered = (details.responseHeaders ?? []).filter(header =>
      ALLOWED_RESPONSE_HEADERS.has(header.name.toLowerCase())
    );

    getStoredHeaders(details.tabId)
      .then(headers_map => {
        headers_map[details.url] = filtered;
        return setStoredHeaders(details.tabId, headers_map);
      })
      .catch(() => {
        // Session storage unavailable — nothing actionable here.
      });
  },
  { urls: ["<all_urls>"], types: ["main_frame"] },
  ["responseHeaders"]
);

chrome.tabs.onRemoved.addListener(tabId => {
  clearTabData(tabId);
});
//#endregion


//#region Popup messaging
// sendResponse(value) then "return false" (no async response pending) is
// repeated for every rejected/invalid message — small helper so each guard
// clause is one line instead of two, and so the "close the channel" part
// can't be forgotten.
function rejectMessage(sendResponse, value = null) {
  sendResponse(value);
  return false;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!sender.id || sender.id !== chrome.runtime.id) {
    return rejectMessage(sendResponse);
  }

  if (!message || typeof message.type !== "string") {
    return rejectMessage(sendResponse);
  }

  if (message.type === "getHeaders") {
    if (typeof message.tabId !== "number" || typeof message.tabUrl !== "string") {
      return rejectMessage(sendResponse, []);
    }

    getStoredHeaders(message.tabId).then(headers_map => {
      sendResponse(headers_map[message.tabUrl] ?? []);
    });

    return true; // async — keep the channel open
  }

  if (message.type === "getLoadStatus") {
    if (typeof message.tabId !== "number") {
      return rejectMessage(sendResponse);
    }

    getStoredStatus(message.tabId).then(sendResponse);
    return true;
  }

  return rejectMessage(sendResponse);
});
//#endregion


//#region Context-menu link/image highlighting
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const mode = MENU_ID_TO_HIGHLIGHT_MODE[info.menuItemId];

  if (!tab || typeof tab.id !== "number" || !mode) {
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: runLinkHighlighter,
      args: [mode, MAX_HIGHLIGHT_NODES, MAX_DEDUPE_TEXT_LENGTH]
    });
  } catch {
    // Scripting is disallowed on some pages (chrome://, the Web Store, PDF viewer, etc.) — ignore.
  }
});

// Injected via chrome.scripting.executeScript, so this runs in the page's
// isolated world with no closure over this file's scope — everything it
// needs arrives through `mode`/`maxNodes`/`maxAltLength`. Previously each
// menu action had its own near-identical top-level function (repeating the
// overlay-lookup/clear/visibility boilerplate four times); folding them into
// one mode-switched function means a fix here only has to be made once.
function runLinkHighlighter(mode, maxNodes, maxAltLength) {
  const overlay = window.__psOverlay;

  if (!overlay) {
    return;
  }

  overlay.clear(mode);

  if (mode === "empty-alt") {
    const images = Array.from(document.querySelectorAll("img[alt]")).slice(0, maxNodes);

    for (const img of images) {
      const alt_text = img.getAttribute("alt").trim();

      if (overlay.isVisible(img) && alt_text.length === 0) {
        overlay.highlight(img, mode, chrome.i18n.getMessage("label_missing_alt_text"));
      }
    }

    return;
  }

  if (mode === "external-link") {
    const links = Array.from(document.querySelectorAll("a[href]")).slice(0, maxNodes);

    for (const link of links) {
      const parsed_url = overlay.parseValidUrl(link.getAttribute("href"));

      if (overlay.isVisible(link) && parsed_url && parsed_url.host !== window.location.host) {
        overlay.highlight(link, mode, chrome.i18n.getMessage("label_external_link"));
      }
    }

    return;
  }

  if (mode === "nofollow-link") {
    const links = Array.from(document.querySelectorAll("a[href][rel]")).slice(0, maxNodes);

    for (const link of links) {
      const rel = link.getAttribute("rel");

      if (overlay.isVisible(link) && rel && rel.includes("nofollow")) {
        overlay.highlight(link, mode, chrome.i18n.getMessage("label_nofollow_link"));
      }
    }

    return;
  }

  if (mode === "duplicate-link") {
    const links = Array.from(document.querySelectorAll("a[href]")).slice(0, maxNodes);
    const linkMap = new Map();

    for (const link of links) {
      const parsed_url = overlay.parseValidUrl(link.getAttribute("href"));

      if (!parsed_url) {
        continue;
      }

      let normalized_text = link.textContent.trim();

      if (normalized_text.length === 0) {
        const images = Array.from(link.querySelectorAll("img[alt]")).slice(0, maxNodes);

        for (const img of images) {
          const alt_text = img.getAttribute("alt").trim();

          if (alt_text.length > 0) {
            normalized_text += " " + alt_text;
          }
        }

        normalized_text = normalized_text.slice(0, maxAltLength);
      }

      const key = `${normalized_text} ${parsed_url.href}`.trim().toLowerCase();

      if (!linkMap.has(key)) {
        linkMap.set(key, []);
      }

      linkMap.get(key).push(link);
    }

    for (const link_group of linkMap.values()) {
      if (link_group.length <= 1) {
        continue;
      }

      for (const link of link_group) {
        if (overlay.isVisible(link)) {
          overlay.highlight(link, mode, chrome.i18n.getMessage("label_duplicate_link"));
        }
      }
    }
  }
}
//#endregion

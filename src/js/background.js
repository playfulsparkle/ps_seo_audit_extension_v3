"use strict";

//#region Constants
/**
 * URL where users are redirected when uninstalling the extension.
 * @type {string}
 */
const UNINSTALL_URL = "https://playfulsparkle.com/en-gb/playful-sparkle-seo-audit/uninstall/";

/**
 * URL opened when the extension is first installed.
 * @type {string}
 */
const INSTALL_URL = "https://playfulsparkle.com/en-gb/playful-sparkle-seo-audit/";

/**
 * URL opened when the extension is updated to a new version.
 * @type {string}
 */
const UPDATE_URL = "https://playfulsparkle.com/en-gb/playful-sparkle-seo-audit/whats-new/";

/**
 * Debug flag – when `true`, disables automatic URL opening (install/update/uninstall) for development.
 * @type {boolean}
 */
const DEBUG = true;

/**
 * Context types where the context menu should appear.
 * @type {string[]}
 */
const CONTEXT_MENU_CONTEXTS = ["page", "selection", "image", "link"];

/**
 * URL patterns where the context menu is active (only HTTP/HTTPS).
 * @type {string[]}
 */
const CONTEXT_MENU_URL_PATTERNS = ["http://*/*", "https://*/*"];

/**
 * Context menu item IDs – each doubles as its own i18n message key.
 * Adding an ID here automatically creates a new menu item.
 * @type {string[]}
 */
const CONTEXT_MENU_ITEM_IDS = [
  "text_external_link",
  "text_nofollow_link",
  "text_duplicate_link",
  "text_img_missing_alt"
];

/**
 * Maps context-menu IDs to the overlay highlighter mode names.
 * @type {Readonly<Object<string, string>>}
 */
const MENU_ID_TO_HIGHLIGHT_MODE = Object.freeze({
  text_external_link: "external-link",
  text_nofollow_link: "nofollow-link",
  text_duplicate_link: "duplicate-link",
  text_img_missing_alt: "empty-alt"
});

/**
 * Response headers that the extension stores and makes available to the popup.
 * All other headers are discarded for privacy and performance.
 * @type {Set<string>}
 */
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

/**
 * Maximum number of elements processed when highlighting (performance guard).
 * @type {number}
 */
const MAX_HIGHLIGHT_NODES = 20000;

/**
 * Maximum length of text used for deduplicating links.
 * @type {number}
 */
const MAX_DEDUPE_TEXT_LENGTH = 255;
//#endregion


//#region Session storage (per-tab headers / load status)

/**
 * Generates the storage key for a tab's headers.
 * @param {number} tabId - The tab ID.
 * @returns {string} The storage key (format: "hdr:{tabId}").
 */
const headerStorageKey = tabId => `hdr:${tabId}`;

/**
 * Generates the storage key for a tab's load status.
 * @param {number} tabId - The tab ID.
 * @returns {string} The storage key (format: "status:{tabId}").
 */
const statusStorageKey = tabId => `status:${tabId}`;

/**
 * Retrieves a value from chrome.storage.session.
 * @param {string} key - The storage key.
 * @param {*} [default_value=null] - The default value if the key is not found.
 * @returns {Promise<*>} The stored value or the default value.
 */
async function getSessionValue(key, default_value = null) {
  const result = await chrome.storage.session.get(key);
  return result[key] ?? default_value;
}

/**
 * Stores a value in chrome.storage.session.
 * @param {string} key - The storage key.
 * @param {*} value - The value to store.
 * @returns {Promise<void>}
 */
async function setSessionValue(key, value) {
  await chrome.storage.session.set({ [key]: value });
}

/**
 * Retrieves the stored response headers for a specific tab.
 * @param {number} tabId - The tab ID.
 * @returns {Promise<Object<string, chrome.webRequest.HttpHeader[]>>} A map of URL → header array.
 */
const getStoredHeaders = tabId => getSessionValue(headerStorageKey(tabId), Object.create(null));

/**
 * Stores response headers for a specific tab.
 * @param {number} tabId - The tab ID.
 * @param {Object<string, chrome.webRequest.HttpHeader[]>} urlHeaderMap - Map of URL → header array.
 * @returns {Promise<void>}
 */
const setStoredHeaders = (tabId, urlHeaderMap) => setSessionValue(headerStorageKey(tabId), urlHeaderMap);

/**
 * Retrieves the stored load status for a specific tab.
 * @param {number} tabId - The tab ID.
 * @returns {Promise<string|null>} The status string (e.g., "loading", "complete") or null.
 */
const getStoredStatus = tabId => getSessionValue(statusStorageKey(tabId), null);

/**
 * Stores the load status for a specific tab.
 * @param {number} tabId - The tab ID.
 * @param {string} status - The status string (e.g., "loading", "complete").
 * @returns {Promise<void>}
 */
const setStoredStatus = (tabId, status) => setSessionValue(statusStorageKey(tabId), status);

/**
 * Clears all stored data (headers and status) for a specific tab.
 * @param {number} tabId - The tab ID.
 * @returns {Promise<void>}
 */
async function clearTabData(tabId) {
  await chrome.storage.session.remove([headerStorageKey(tabId), statusStorageKey(tabId)]);
}

/**
 * Saves a setting to chrome.storage.local.
 * @param {string} offset - The setting key.
 * @param {*} value - The value to store.
 * @returns {Promise<boolean>} `true` if successful, `false` otherwise.
 */
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

/**
 * Creates a context menu item, suppressing the "already exists" error that can
 * occur during rapid reinstall/update cycles.
 * @param {chrome.contextMenus.CreateProperties} props - The menu item properties.
 * @returns {void}
 */
function createMenuItem(props) {
  chrome.contextMenus.create(props, () => {
    void chrome.runtime.lastError; // menu may already exist during rapid reinstall/update — nothing actionable
  });
}

/**
 * Rebuilds all context menus: removes existing items and creates new ones based
 * on the current configuration.
 * @returns {Promise<void>}
 */
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

/**
 * Applies the default extension settings on first install.
 * @returns {Promise<void>}
 */
async function applyDefaultSettings() {
  await Promise.all([
    saveSetting("copy-format", 0),
    saveSetting("show-seo-preview", true),
    saveSetting("fetch-robots-txt", true),
    saveSetting("user-agent", "*")
  ]);
}

/**
 * Handles extension installation and update events.
 * - On install: sets default settings, opens the welcome page, and sets the uninstall URL.
 * - On update: opens the "what's new" page.
 * - Always: rebuilds context menus.
 *
 * @param {chrome.runtime.InstalledDetails} details - The installation/update details.
 * @returns {Promise<void>}
 */
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

/**
 * Listens for tab status changes and notifies the popup.
 * @listens chrome.tabs.onUpdated
 */
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

/**
 * Determines if a web request originates from the main frame of a tracked tab.
 * @param {chrome.webRequest.WebRequestDetails} details - The request details.
 * @returns {boolean} `true` if the request is from a main frame of a tracked tab.
 */
function isTrackedMainFrameRequest(details) {
  return details.tabId >= 0 && details.frameId === 0;
}

/**
 * Clears stored header data when a new main-frame navigation starts.
 * Prevents unbounded accumulation of URL entries per tab.
 * @listens chrome.webRequest.onBeforeRequest
 */
chrome.webRequest.onBeforeRequest.addListener(
  details => {
    if (isTrackedMainFrameRequest(details)) {
      clearTabData(details.tabId);
    }
  },
  { urls: ["<all_urls>"], types: ["main_frame"] }
);

/**
 * Captures and stores only the allowed response headers for main-frame requests.
 * @listens chrome.webRequest.onHeadersReceived
 */
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

/**
 * Clears stored data when a tab is closed.
 * @listens chrome.tabs.onRemoved
 */
chrome.tabs.onRemoved.addListener(tabId => {
  clearTabData(tabId);
});
//#endregion


//#region Popup messaging

/**
 * Helper for rejecting invalid messages and immediately closing the message channel.
 * @param {function} sendResponse - The sendResponse callback from the message listener.
 * @param {*} [value=null] - The value to send back (usually null or an empty array).
 * @returns {false} Always returns `false` to indicate synchronous response.
 */
function rejectMessage(sendResponse, value = null) {
  sendResponse(value);
  return false;
}

/**
 * Handles messages from the popup:
 * - `getHeaders`: returns stored headers for a tab+URL.
 * - `getLoadStatus`: returns the current load status of a tab.
 * @listens chrome.runtime.onMessage
 * @returns {boolean} `true` if the response is async, `false` otherwise.
 */
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

/**
 * Handles context menu clicks: maps menu item ID to a highlight mode and injects
 * the highlighter script into the target tab.
 * @listens chrome.contextMenus.onClicked
 */
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

/**
 * Injected via chrome.scripting.executeScript into the target tab's isolated world.
 * Uses the overlay manager (window.__psOverlay) to highlight elements based on the
 * selected mode:
 * - `empty-alt`: highlights images without alt text.
 * - `external-link`: highlights links pointing to external domains.
 * - `nofollow-link`: highlights links with `rel="nofollow"`.
 * - `duplicate-link`: highlights links with identical text + URL combinations.
 *
 * @param {string} mode - The highlight mode (one of MENU_ID_TO_HIGHLIGHT_MODE values).
 * @param {number} maxNodes - Maximum number of elements to process.
 * @param {number} maxAltLength - Maximum length of alt text for deduplication.
 * @returns {void}
 */
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

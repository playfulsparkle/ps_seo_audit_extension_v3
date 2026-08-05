"use strict";

async function getStoredHeaders(tabId) {
  const key = `hdr:${tabId}`;
  const result = await chrome.storage.session.get(key);
  return result[key] ?? Object.create(null);
}

async function setStoredHeaders(tabId, urlHeaderMap) {
  await chrome.storage.session.set({ [`hdr:${tabId}`]: urlHeaderMap });
}

async function getStoredStatus(tabId) {
  const key = `status:${tabId}`;
  const result = await chrome.storage.session.get(key);
  return result[key] ?? null;
}

async function setStoredStatus(tabId, status) {
  await chrome.storage.session.set({ [`status:${tabId}`]: status });
}

async function clearTabData(tabId) {
  await chrome.storage.session.remove([`hdr:${tabId}`, `status:${tabId}`]);
}

async function saveSetting(offset, value) {
  try {
    await chrome.storage.local.set({ [offset]: value });
    return true;
  } catch {
    return false;
  }
}

function parseValidUrl(url) {
  const ALLOWED_URL_PROTOCOLS = new Set(["http:", "https:"]);

  if (typeof url !== "string") {
    return null;
  }

  const trimmed = url.trim();

  if (trimmed.startsWith("#") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("sms:") ||
    trimmed.startsWith("tel:")) {
    return null;
  }

  // In opaque origins (data:, about:blank, sandboxed frames),
  // window.location.origin is the string "null". Use document.baseURI
  // to get the parent document"s URL as a fallback base.
  const base = window.location.origin === "null"
    ? (document.baseURI || window.location.href)
    : window.location.origin;

  let parsed;

  try {
    parsed = trimmed.startsWith("//")
      ? new URL(window.location.protocol + trimmed)
      : new URL(trimmed, base);
  } catch {
    return null;
  }

  // Allowlist the parsed (normalized) protocol rather than blocklisting
  // the raw string — see earlier note on why this matters for things
  // like "javascript:", "data:", leading whitespace, and case variants.
  if (!ALLOWED_URL_PROTOCOLS.has(parsed.protocol)) {
    return null;
  }

  return parsed;
}

// ────────────────────────────────────────────────
//  INSTALL, UPDATE, UNINSTALL  (best practices)
// ────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  const BASE_URL = "https://playfulsparkle.com/en-gb/downloads/";

  // Always set the uninstall survey URL (so it stays current on updates)
  chrome.runtime.setUninstallURL(BASE_URL + "uninstall");

  // Handle first install
  if (details.reason === "install") {
    // Open the welcome / onboarding page
    chrome.tabs.create({ url: BASE_URL + "welcome" });

    await saveSetting("show-seo-preview", true);
    await saveSetting("fetch-robots-txt", true);
    await saveSetting("user-agent", "*");
  }

  // Handle extension update (after the new version is actually installed)
  if (details.reason === "update") {
    // Open the "what's new" / update announcement page
    chrome.tabs.create({ url: BASE_URL + "update" });
  }

  // Re-create context menus (they are cleared and re-added on every install/update)
  await chrome.contextMenus.removeAll();

  function createMenuItem(props) {
    chrome.contextMenus.create(props, () => {
      if (chrome.runtime.lastError) {
        throw new Error(`contextMenus.create(${props.id}) failed:`, chrome.runtime.lastError.message);
      }
    });
  }

  createMenuItem({
    id: "menu_parent",
    title: chrome.i18n.getMessage("text_context_menu"),
    contexts: ["page", "selection", "image", "link"],
  });

  createMenuItem({
    id: "text_external_link",
    parentId: "menu_parent",
    title: chrome.i18n.getMessage("text_external_link"),
    contexts: ["page", "selection", "image", "link"],
  });

  createMenuItem({
    id: "text_nofollow_link",
    parentId: "menu_parent",
    title: chrome.i18n.getMessage("text_nofollow_link"),
    contexts: ["page", "selection", "image", "link"],
  });

  createMenuItem({
    id: "text_duplicate_link",
    parentId: "menu_parent",
    title: chrome.i18n.getMessage("text_duplicate_link"),
    contexts: ["page", "selection", "image", "link"],
  });

  createMenuItem({
    id: "text_img_missing_alt",
    parentId: "menu_parent",
    title: chrome.i18n.getMessage("text_img_missing_alt"),
    contexts: ["page", "selection", "image", "link"],
  });
});

//#region Response headers and tab update stat handling
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.status) {
    return;
  }

  const previous_status = await getStoredStatus(tabId);

  if (previous_status === changeInfo.status) {
    return;
  }

  await setStoredStatus(tabId, changeInfo.status);

  try {
    await chrome.runtime.sendMessage({ tabId: tabId, status: changeInfo.status });
  } catch {
    // Popup not open — nothing to notify.
  }
});

// Clear stale per-URL header data for a tab the moment a new top-level
// navigation starts, instead of only on tab close. Without this, a tab
// that stays open a long time (or a page that does many client-side
// navigations you also intercept) accumulates one entry per URL forever.
chrome.webRequest.onBeforeRequest.addListener(
  function (details) {
    if (details.tabId >= 0 && details.frameId === 0) {
      clearTabData(details.tabId);
    }
  },
  { urls: ["<all_urls>"], types: ["main_frame"] }
);

chrome.webRequest.onHeadersReceived.addListener(
  function (details) {
    const ALLOWED_HEADERS = new Set([
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

    if (details.tabId >= 0 && details.frameId === 0) {
      const filtered = (details.responseHeaders || []).filter(header =>
        ALLOWED_HEADERS.has(header.name.toLowerCase())
      );

      getStoredHeaders(details.tabId).then(headers_map => {
        headers_map[details.url] = filtered;
        return setStoredHeaders(details.tabId, headers_map);
      });
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

chrome.tabs.onRemoved.addListener(function (tabId) {
  clearTabData(tabId);
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!sender.id || sender.id !== chrome.runtime.id) {
    sendResponse(null);
    return false;
  }

  if (!message || typeof message.type !== "string") {
    sendResponse(null);
    return false;
  }

  if (message.type === "getHeaders") {
    if (typeof message.tabId !== "number" || typeof message.tabUrl !== "string") {
      sendResponse([]);
      return false;
    }

    getStoredHeaders(message.tabId).then(headers_map => {
      sendResponse(headers_map[message.tabUrl] || []);
    });

    return true; // async now - need to keep the channel open
  }

  if (message.type === "getLoadStatus") {
    if (typeof message.tabId !== "number") {
      sendResponse(null);
      return false;
    }

    getStoredStatus(message.tabId).then(sendResponse);
    return true;
  }

  sendResponse(null);
  return false;
});
//#endregion

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || typeof tab.id !== "number") {
    return;
  }

  try {
    switch (info.menuItemId) {
      case "text_external_link":
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: highlightExternalLinks });
        break;
      case "text_duplicate_link":
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: highlightDuplicateLinks });
        break;
      case "text_nofollow_link":
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: highlightNofollowLinks });
        break;
      case "text_img_missing_alt":
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: highlightImgMissingAlt });
        break;
    }
  } catch {
    // Scripting is disallowed on some pages (chrome://, the Web Store, PDF viewer, etc.) — ignore.
  }
});

function highlightImgMissingAlt() {
  const MAX_NODES = 20000; // defined inside
  const overlay = window.__psOverlay;
  if (!overlay) {
    return;
  }

  overlay.clear("empty-alt");

  const all_images = Array.from(document.querySelectorAll("img[alt]")).slice(0, MAX_NODES);

  for (const img of all_images) {
    const alt_text = img.getAttribute("alt").trim();

    if (overlay.isVisible(img) && alt_text.length === 0) {
      overlay.highlight(img, "empty-alt", chrome.i18n.getMessage("label_missing_alt_text"));
    }
  }
}

function highlightExternalLinks() {
  const MAX_NODES = 20000;
  const overlay = window.__psOverlay;
  if (!overlay) {
    return;
  }

  overlay.clear("external-link");

  const all_links = Array.from(document.querySelectorAll("a[href]")).slice(0, MAX_NODES);

  for (const link of all_links) {
    const parsed_url = parseValidUrl(link.getAttribute("href"));

    if (overlay.isVisible(link) && parsed_url && parsed_url.host !== window.location.host) {
      overlay.highlight(link, "external-link", chrome.i18n.getMessage("label_external_link"));
    }
  }
}

function highlightNofollowLinks() {
  const MAX_NODES = 20000;
  const overlay = window.__psOverlay;
  if (!overlay) {
    return;
  }

  overlay.clear("nofollow-link");

  const all_links = Array.from(document.querySelectorAll("a[href][rel]")).slice(0, MAX_NODES);

  for (const link of all_links) {
    const rel = link.getAttribute("rel");

    if (overlay.isVisible(link) && rel && rel.includes("nofollow")) {
      overlay.highlight(link, "nofollow-link", chrome.i18n.getMessage("label_nofollow_link"));
    }
  }
}

function highlightDuplicateLinks() {
  const MAX_NODES = 20000;
  const MAX_ALT_LENGTH = 255; // defined inside
  const overlay = window.__psOverlay;
  if (!overlay) {
    return;
  }

  overlay.clear("duplicate-link");

  const all_links = Array.from(document.querySelectorAll("a[href]")).slice(0, MAX_NODES);
  const linkMap = new Map();

  for (const link of all_links) {
    const parsed_url = parseValidUrl(link.getAttribute("href"));

    if (!parsed_url) {
      continue;
    }

    let normalized_text = link.textContent.trim();

    if (normalized_text.length === 0) {
      const images = Array.from(link.querySelectorAll("img[alt]")).slice(0, MAX_NODES);

      for (const img of images) {
        const alt_text = img.getAttribute("alt").trim();

        if (alt_text.length > 0) {
          normalized_text += " " + alt_text;
        }
      }

      normalized_text = normalized_text.slice(0, MAX_ALT_LENGTH);
    }

    const key = `${normalized_text} ${parsed_url.href}`.trim().toLowerCase();

    if (!linkMap.has(key)) {
      linkMap.set(key, []);
    }

    linkMap.get(key).push(link);
  }

  for (const links of linkMap.values()) {
    if (links.length > 1) {
      for (const link of links) {
        if (overlay.isVisible(link)) {
          overlay.highlight(link, "duplicate-link", chrome.i18n.getMessage("label_duplicate_link"));
        }
      }
    }
  }
}

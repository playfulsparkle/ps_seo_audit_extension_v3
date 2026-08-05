"use strict";

const ALLOWED_HEADERS = new Set([
  'x-robots-tag',
  'alt-svc',
  'x-ua-compatible',
  'strict-transport-security',
  'referrer-policy',
  'x-content-type-options',
  'x-xss-protection',
  'x-frame-options',
  'content-security-policy'
]);
const ALLOWED_URL_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_NODES = 20000;
const MAX_ALT_LENGTH = 255;

async function saveSetting(offset, value) {
  try {
    return await chrome.storage.local.set({ [offset]: value });
  } catch {
    return false;
  }
}

async function getSetting(offset, default_value = null) {
  try {
    const result = await chrome.storage.local.get(offset);

    return result[offset] ?? default_value;
  } catch {
    return default_value;
  }
}

function parseValidUrl(url) {
  if (typeof url !== "string") {
    return null;
  }

  const trimmed = url.trim();

  if (trimmed.length === 0 || trimmed.startsWith("#")) {
    return null;
  }

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

chrome.runtime.onInstalled.addListener(async () => {
  const onboardingCompleted = await getSetting("onboarding-completed", false);

  if (!onboardingCompleted) {
    await saveSetting("onboarding-completed", true);
    await saveSetting("show-seo-preview", true);
    await saveSetting("fetch-robots-txt", true);
    await saveSetting("user-agent", "*");

    chrome.runtime.setUninstallURL("https://playfulsparkle.com/en-us/uninstall");
  }

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

chrome.runtime.onUpdateAvailable.addListener(() => {
  chrome.tabs.create({ url: "https://playfulsparkle.com/en-us/update" });
});

//#region Response headers and tab update stat handling
const tabStatus = Object.create(null);
const tabResponseHeaders = Object.create(null);

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status && tabStatus[tabId] !== changeInfo.status) {
    tabStatus[tabId] = changeInfo.status;

    try {
      await chrome.runtime.sendMessage({ tabId: tabId, status: changeInfo.status });
    } catch {
      // Popup not open — nothing to notify.
    }
  }
});

// Clear stale per-URL header data for a tab the moment a new top-level
// navigation starts, instead of only on tab close. Without this, a tab
// that stays open a long time (or a page that does many client-side
// navigations you also intercept) accumulates one entry per URL forever.
chrome.webRequest.onBeforeRequest.addListener(
  function (details) {
    if (details.tabId >= 0 && details.frameId === 0) {
      tabResponseHeaders[details.tabId] = Object.create(null);
    }
  },
  { urls: ["<all_urls>"], types: ["main_frame"] }
);

chrome.webRequest.onHeadersReceived.addListener(
  function (details) {
    // details.tabId is -1 for requests not associated with a tab (e.g.
    // extension/background requests); it can legitimately be 0 for the
    // first tab, so a truthy check (`details.tabId &&`) wrongly drops
    // tab 0 entirely.
    if (details.tabId >= 0 && details.frameId === 0) {
      if (!tabResponseHeaders[details.tabId]) {
        tabResponseHeaders[details.tabId] = Object.create(null);
      }

      // responseHeaders can be undefined in edge cases even with the
      // "responseHeaders" extraInfoSpec; guard against a hard throw here,
      // since an uncaught error in a webRequest listener disables it.
      tabResponseHeaders[details.tabId][details.url] = (details.responseHeaders || []).filter(header =>
        ALLOWED_HEADERS.has(header.name.toLowerCase())
      );
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

chrome.tabs.onRemoved.addListener(function (tabId) {
  delete tabResponseHeaders[tabId];
  delete tabStatus[tabId];
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  // Only trust messages from this extension's own contexts (popup,
  // options page, etc.) — not from a content script running in the
  // context of an arbitrary web page, and never from another extension.
  // Without this check, any page could ask for captured response headers
  // (including CSP/HSTS values) for *any* tab, not just its own.
  if (!sender.id || sender.id !== chrome.runtime.id) {
    sendResponse(null);
    return false;
  }

  if (!message || typeof message.type !== "string") {
    sendResponse(null);
    return false;
  }

  if (message.type === "getHeaders") {
    // `message.tabId &&` was falsy for tabId === 0, so headers for the
    // very first tab could never be retrieved. Use an explicit type check.
    if (typeof message.tabId !== "number" || typeof message.tabUrl !== "string") {
      sendResponse([]);
      return false;
    }

    sendResponse(
      (tabResponseHeaders[message.tabId] &&
        tabResponseHeaders[message.tabId][message.tabUrl]) || []
    );
    return false;
  }

  if (message.type === "getLoadStatus") {
    if (typeof message.tabId !== "number") {
      sendResponse(null);
      return false;
    }

    sendResponse(tabStatus[message.tabId] ?? null);
    return false;
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
  const all_images = Array.from(document.querySelectorAll("img[alt]")).slice(0, MAX_NODES);

  for (const img of all_images) {
    img.classList.remove("ps-image-empty-alt");

    const alt_text = img.getAttribute("alt").trim();

    if (alt_text.length === 0) {
      img.classList.add("ps-image-empty-alt");
    }
  }
}

function highlightExternalLinks() {
  const all_links = Array.from(document.querySelectorAll("a[href]")).slice(0, MAX_NODES);

  for (const link of all_links) {
    link.classList.remove("ps-external-link");

    const parsed_url = parseValidUrl(link.getAttribute("href"));

    if (parsed_url && parsed_url.host !== window.location.host) {
      link.classList.add("ps-external-link");
    }
  }
}

function highlightNofollowLinks() {
  const all_links = Array.from(document.querySelectorAll("a[href][rel]")).slice(0, MAX_NODES);

  for (const link of all_links) {
    link.classList.remove("ps-nofollow-link");

    const rel = link.getAttribute("rel");

    if (rel && rel.includes("nofollow")) {
      link.classList.add("ps-nofollow-link");
    }
  }
}

function highlightDuplicateLinks() {
  const all_links = Array.from(document.querySelectorAll("a[href]")).slice(0, MAX_NODES);
  const linkMap = new Map();

  for (const link of all_links) {
    link.classList.remove("ps-duplicate-text-link");

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
        link.classList.add("ps-duplicate-text-link");
      }
    }
  }
}

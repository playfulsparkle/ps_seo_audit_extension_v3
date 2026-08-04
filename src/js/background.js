"use strict";

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

chrome.runtime.onInstalled.addListener(async () => {
  const onboardingCompleted = await getSetting("onboarding-completed", false);

  if (!onboardingCompleted) {
    await saveSetting("onboarding-completed", true);
    await saveSetting("show-seo-preview", true)
    await saveSetting("fetch-robots-txt", true);
    await saveSetting("user-agent", "*");

    chrome.runtime.setUninstallURL("https://playfulsparkle.com/en-us/uninstall");
  }

  // onInstalled fires on every install AND every update (including a manual
  // "Reload" in chrome://extensions during development). Context menu items
  // persist independently of the service worker, so without clearing them
  // first, every reload leaves stale/duplicate entries behind and each
  // create() call below throws a silent "duplicate id" runtime error.
  await chrome.contextMenus.removeAll();

  // Create the parent menu item
  chrome.contextMenus.create({
    id: "menu_parent",
    title: chrome.i18n.getMessage("text_context_menu"),
    contexts: ["page", "selection", "image", "link"],
  });

  // Create sub-menu items
  chrome.contextMenus.create({
    id: "text_external_link",
    parentId: "menu_parent",
    title: chrome.i18n.getMessage("text_external_link"),
    contexts: ["page", "selection", "image", "link"],
  });

  chrome.contextMenus.create({
    id: "text_nofollow_link",
    parentId: "menu_parent",
    title: chrome.i18n.getMessage("text_nofollow_link"),
    contexts: ["page", "selection", "image", "link"],
  });

  chrome.contextMenus.create({
    id: "text_duplicate_link",
    parentId: "menu_parent",
    title: chrome.i18n.getMessage("text_duplicate_link"),
    contexts: ["page", "selection", "image", "link"],
  });

  chrome.contextMenus.create({
    id: "text_img_missing_alt",
    parentId: "menu_parent",
    title: chrome.i18n.getMessage("text_img_missing_alt"),
    contexts: ["page", "selection", "image", "link"],
  });
});


// Upboarding event (triggered after update)
chrome.runtime.onUpdateAvailable.addListener(() => {
  chrome.tabs.create({ url: "https://playfulsparkle.com/en-us/update" });
});


//#region Response headers and tab update stat handling
const tabStatus = { __proto__: null };
const tabResponseHeaders = { __proto__: null };

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status && tabStatus[tabId] !== changeInfo.status) {
    tabStatus[tabId] = changeInfo.status;

    try {
      // No listener exists when the popup is closed; sendMessage rejects with
      // "Could not establish connection. Receiving end does not exist." in that case.
      // That's expected here, so swallow it instead of letting it surface as an
      // unhandled promise rejection.
      await chrome.runtime.sendMessage({ tabId: tabId, status: changeInfo.status });
    } catch {
      // Popup not open — nothing to notify.
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabStatus[tabId];
});

chrome.webRequest.onHeadersReceived.addListener(
  function (details) {
    if (details.tabId && details.frameId === 0) {
      if (!tabResponseHeaders[details.tabId]) {
        tabResponseHeaders[details.tabId] = { __proto__: null };
      }

      if (!tabResponseHeaders[details.tabId][details.url]) {
        tabResponseHeaders[details.tabId][details.url] = { __proto__: null };
      }

      tabResponseHeaders[details.tabId][details.url] = details.responseHeaders;
    }
  },
  { urls: ["<all_urls>"] }, // You can specify the URLs you want to monitor
  ["responseHeaders"]
);

chrome.tabs.onRemoved.addListener(function (tabId) {
  if (tabResponseHeaders[tabId]) {
    delete tabResponseHeaders[tabId];
  }
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.type === "getHeaders" && message.tabId && message.tabUrl) {
    sendResponse(
      (tabResponseHeaders &&
        tabResponseHeaders[message.tabId] &&
        tabResponseHeaders[message.tabId][message.tabUrl]) || []
    );
  } else if (message.type === "getLoadStatus" && message.tabId) {
    sendResponse(tabStatus[message.tabId]);
  } else {
    sendResponse(null);
  }

  return true;
});
//#endregion


// Listener for context menu item clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab) {
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
  const all_images = Array.from(document.querySelectorAll("img[alt]"));

  for (const img of all_images) {
    if (img.classList.contains("ps-image-empty-alt")) {
      img.classList.remove("ps-image-empty-alt");
    }

    const alt_text = img.getAttribute("alt").trim();

    if (alt_text.length === 0) {
      img.classList.add("ps-image-empty-alt");
    }
  }
}

function highlightExternalLinks() {
  const all_links = Array.from(document.querySelectorAll("a[href]"));

  for (const link of all_links) {
    if (link.classList.contains("ps-external-link")) {
      link.classList.remove("ps-external-link");
    }

    try {
      const href = link.getAttribute("href");

      const parsed_url = new URL(href).host;

      if (parsed_url && parsed_url !== window.location.host) {
        link.classList.add("ps-external-link");
      }
    } catch {
      continue;
    }
  }
}

function highlightNofollowLinks() {
  const all_links = Array.from(document.querySelectorAll("a[href][rel]"));

  for (const link of all_links) {
    if (link.classList.contains("ps-nofollow-link")) {
      link.classList.remove("ps-nofollow-link");
    }

    const rel = link.getAttribute("rel");

    if (rel && rel.includes("nofollow")) {
      link.classList.add("ps-nofollow-link");
    }
  }
}

function highlightDuplicateLinks() {
  const all_links = Array.from(document.querySelectorAll("a[href]"));

  const linkMap = new Map(); // Map to store normalized link text+URL and corresponding elements

  // Iterate through the links once
  for (const link of all_links) {
    const href = link.getAttribute("href");

    // Remove duplicate-text-link class before marking duplicates
    if (link.classList.contains("ps-duplicate-text-link")) {
      link.classList.remove("ps-duplicate-text-link");
    }

    if (
      href.length === 0
      || href.startsWith("#")
      || href.startsWith("mailto:")
      || href.startsWith("javascript:")
      || href.startsWith("sms:")
      || href.startsWith("tel:")
      || href.startsWith("file:")
    ) {
      continue;
    }

    try {
      const base = window.location.origin === "null" ? document.baseURI || window.location.href : window.location.origin;

      if (href.startsWith("http://") || href.startsWith("https://")) {
        new URL(href);
      } else if (href.startsWith("//")) {
        new URL(window.location.protocol + href);
      } else {
        new URL(href, base);
      }
    } catch {
      continue
    }

    let normalized_text = link.textContent.trim();

    if (normalized_text.length === 0) {
      const images = Array.from(link.querySelectorAll("img[alt]"));

      // If no text content, check the images' alt text
      for (const img of images) {
        const alt_text = img.getAttribute("alt").trim();

        if (alt_text.length > 0) {
          normalized_text += " " + alt_text;
        }
      }
    }

    // Unique identifier for text + URL combination
    const key = `${normalized_text} ${href}`.trim().toLowerCase();

    // Add the link to the map
    if (!linkMap.has(key)) {
      linkMap.set(key, []);
    }

    linkMap.get(key).push(link);
  }

  // Highlight duplicate links with the same text and URL
  linkMap.forEach(links => {
    if (links.length > 1) {
      links.forEach(link => link.classList.add("ps-duplicate-text-link"));
    }
  });
}

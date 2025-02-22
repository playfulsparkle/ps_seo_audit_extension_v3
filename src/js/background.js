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
    const onboardingCompleted = await getSetting("onboardingCompleted", false);

    if (!onboardingCompleted) {
        await saveSetting("onboardingCompleted", true);
        await saveSetting("show-seo-preview", true)
        await saveSetting("fetch-robots-txt", true);
        await saveSetting("user-agent", "*");

        chrome.runtime.setUninstallURL("https://playfulsparkle.com/en-us/uninstall");
    }

    // Create the parent menu item
    chrome.contextMenus.create({
        id: "menu_parent",
        title: chrome.i18n.getMessage("context_menu_parent"),
        contexts: ["page", "selection", "image", "link"],
    });

    // Create sub-menu items
    chrome.contextMenus.create({
        id: "context_menu_external_link",
        parentId: "menu_parent",
        title: chrome.i18n.getMessage("context_menu_external_link"),
        contexts: ["page", "selection", "image", "link"],
        // icons: { 16: "icons/context-menu-external-link.png" },
    });

    chrome.contextMenus.create({
        id: "context_menu_nofollow_link",
        parentId: "menu_parent",
        title: chrome.i18n.getMessage("context_menu_nofollow_link"),
        contexts: ["page", "selection", "image", "link"],
        // icons: { 16: "icons/context-menu-nofollow-link.png" },
    });

    chrome.contextMenus.create({
        id: "context_menu_duplicate_link",
        parentId: "menu_parent",
        title: chrome.i18n.getMessage("context_menu_duplicate_link"),
        contexts: ["page", "selection", "image", "link"],
        // icons: { 16: "icons/context-menu-duplicate-link.png" },
    });

    chrome.contextMenus.create({
        id: "context_menu_img_missing_alt",
        parentId: "menu_parent",
        title: chrome.i18n.getMessage("context_menu_img_missing_alt"),
        contexts: ["page", "selection", "image", "link"],
        // icons: { 16: "icons/context-menu-img-missing-alt.png" },
    });
});


// Upboarding event (triggered after update)
chrome.runtime.onUpdateAvailable.addListener(() => {
    chrome.tabs.create({ url: "https://playfulsparkle.com/en-us/update" });
});


//#region Response headers and tab update stat handling
const tabStatus = Object.create(null);
const tabResponseHeaders = Object.create(null);

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (changeInfo.status && tabStatus[tabId] !== changeInfo.status) {
        tabStatus[tabId] = changeInfo.status;

        await chrome.runtime.sendMessage({ tabId: tabId, status: changeInfo.status });
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    delete tabStatus[tabId];
});

chrome.webRequest.onHeadersReceived.addListener(
    function (details) {
        if (details.tabId && details.frameId === 0) {
            tabResponseHeaders[details.tabId] = details.responseHeaders;
        }

        // return { responseHeaders: details.responseHeaders };
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
    if (message.type === "getHeaders" && tabResponseHeaders[message.tabId]) {
        sendResponse(tabResponseHeaders[message.tabId]);
    } else if (message.type === "getLoadStatus" && tabStatus[message.tabId]) {
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

    switch (info.menuItemId) {
        case "context_menu_external_link":
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: highlightExternalLinks
            });
            break;
        case "context_menu_duplicate_link":
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: highlightDuplicateLinks
            });
            break;
        case "context_menu_nofollow_link":
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: highlightNofollowLinks
            });
            break;
        case "context_menu_img_missing_alt":
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: highlightImgMissingAlt
            });
            break;
    }
});

function highlightImgMissingAlt() {
    const images = Array.from(document.querySelectorAll("img"));

    if (images.length === 0) {
        return;
    }

    for (let index = 0; index < images.length; index++) {
        const img = images[index];
        const alt_text = img.getAttribute("alt")?.trim() || "";

        if (alt_text) {
            img.classList.remove("image-empty-alt");
        } else {
            img.classList.add("image-empty-alt");
        }
    }
}

function highlightExternalLinks() {
    const links = Array.from(document.querySelectorAll("a"));
    const current_host = window.location.host;

    if (links.length === 0) {
        return;
    }

    for (let index = 0; index < links.length; index++) {
        const link = links[index];

        if (link.href) {
            const parsed_url = new URL(link.href).host;

            if (parsed_url && parsed_url !== current_host) {
                link.classList.add("external-link");
            } else {
                link.classList.remove("external-link");
            }
        }
    }
}

function highlightNofollowLinks() {
    const links = Array.from(document.querySelectorAll("a"));

    if (links.length === 0) {
        return;
    }

    for (let index = 0; index < links.length; index++) {
        const link = links[index];

        const rel = link.getAttribute("rel");

        if (rel && rel.includes("nofollow")) {
            link.classList.add("nofollow-link");
        } else {
            link.classList.remove("nofollow-link");
        }
    }
}

function highlightDuplicateLinks() {
    const all_links = Array.from(document.querySelectorAll("a"));

    const linkMap = new Map(); // Map to store normalized link text+URL and corresponding elements

    if (all_links.length === 0) {
        return;
    }

    // Iterate through the links once
    for (let index = 0; index < all_links.length; index++) {
        const link = all_links[index];
        const images = link.querySelectorAll("img");
        let normalized_text = link.textContent.trim().toLowerCase();

        if (!normalized_text) {
            // If no text content, check the images' alt text
            for (let inner_index = 0; inner_index < images.length; inner_index++) {
                const img = images[inner_index];
                const alt_text = img.getAttribute("alt")?.trim() || "";

                if (alt_text) {
                    normalized_text += " " + alt_text.toLowerCase();
                }
            }
        }

        // Ensure no extra whitespace
        normalized_text = normalized_text.trim();

        // Append the URL to the normalized text
        const url = link.href.trim().toLowerCase();
        const key = `${normalized_text} ${url}`; // Unique identifier for text + URL combination

        // Add the link to the map
        if (!linkMap.has(key)) {
            linkMap.set(key, []);
        }

        linkMap.get(key).push(link);
    }

    // Remove duplicate-text-link class before marking duplicates
    all_links.forEach(link => link.classList.remove("duplicate-text-link"));

    if (linkMap.length === 0) {
        return;
    }

    // Highlight duplicate links with the same text and URL
    linkMap.forEach(links => {
        if (links.length > 1) {
            links.forEach(link => link.classList.add("duplicate-text-link"));
        }
    });
}

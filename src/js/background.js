/**
 * Save a setting to browser's local storage
 * 
 * @param {string} offset - The key to store the value under
 * @param {any} value - The value to store
 */
async function saveSetting(offset, value) {
    try {
        await browser.storage.local.set({ [offset]: value });
    } catch (error) {
        console.error(`Error saving ${offset}:`, error);
    }
}

/**
 * Get a setting from browser's local storage
 * 
 * @param {string} offset - The key to retrieve
 * @param {any} default_value - Default value if key doesn't exist
 * @returns {Promise<any>} The stored value or default value
 */
async function getSetting(offset, default_value = null) {
    try {
        const result = await browser.storage.local.get(offset);

        return result[offset] ?? default_value;
    } catch (error) {
        console.error(`Error getting ${offset}:`, error);

        return default_value;
    }
}


browser.runtime.onInstalled.addListener(async () => {
    const onboardingCompleted = await getSetting("onboardingCompleted", false);

    if (!onboardingCompleted) {
        await saveSetting({ onboardingCompleted: true });

        browser.runtime.setUninstallURL("https://playfulsparkle.com/en-us/uninstall");
    }
});

// Upboarding event (triggered after update)
browser.runtime.onUpdateAvailable.addListener(() => {
    browser.tabs.create({ url: "https://playfulsparkle.com/en-us/update" });
});

//#region Handle browser tabe on loaded states
let tabStatus = {};

browser.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (changeInfo.status && tabStatus[tabId] !== changeInfo.status) {
        tabStatus[tabId] = changeInfo.status;

        await browser.runtime.sendMessage({ tabId: tabId, status: changeInfo.status });
    }
});

browser.runtime.onMessage.addListener(async message => {
    if (message.tabId && message.status) {
        await browser.runtime.sendMessage({ tabId: message.tabId, status: message.status });
    }
});

browser.tabs.onRemoved.addListener((tabId) => {
    delete tabStatus[tabId];
});
//#endregion

// Create the parent menu item
browser.contextMenus.create({
    id: "menu_parent",
    title: browser.i18n.getMessage("context_menu_parent"),
    contexts: ["all"],
});

// Create sub-menu items
browser.contextMenus.create({
    id: "context_menu_external_link",
    parentId: "menu_parent",
    title: browser.i18n.getMessage("context_menu_external_link"),
    contexts: ["all"],
});

browser.contextMenus.create({
    id: "context_menu_duplicate_link",
    parentId: "menu_parent",
    title: browser.i18n.getMessage("context_menu_duplicate_link"),
    contexts: ["all"],
});

browser.contextMenus.create({
    id: "context_menu_img_missing_alt",
    parentId: "menu_parent",
    title: browser.i18n.getMessage("context_menu_img_missing_alt"),
    contexts: ["all"],
});


// Listener for context menu item clicks
browser.contextMenus.onClicked.addListener(async (info, tab) => {
    switch (info.menuItemId) {
        case "context_menu_external_link":
            await browser.scripting.executeScript({
                target: { tabId: tab.id },
                func: higlightExternalLinks
            });
            break;
        case "context_menu_duplicate_link":
            await browser.scripting.executeScript({
                target: { tabId: tab.id },
                func: higlightDuplicateLinks
            });
            break;
        case "context_menu_img_missing_alt":
            await browser.scripting.executeScript({
                target: { tabId: tab.id },
                func: higlightImgMissingAlt
            });
            break;
    }
});

function higlightImgMissingAlt() {
    const images = document.querySelectorAll('img');

    images.forEach(img => img.classList.remove('no-alt'));

    images.forEach(img => {
        if (!img.alt) {
            img.classList.add('no-alt');
        }
    });
}

function higlightExternalLinks() {
    const links = document.querySelectorAll('a');
    const current_host = window.location.host;

    links.forEach(link => link.classList.remove('external-link'));

    links.forEach(link => {
        const link_host = new URL(link.href).host;

        if (link_host && link_host !== current_host) {
            link.classList.add('external-link');
        }
    });
}

function higlightDuplicateLinks() {
    const links = document.querySelectorAll('a');
    const linkMap = new Map(); // Map to store normalized link text+URL and corresponding elements

    // First, remove the 'duplicate-text-link' class from all links
    links.forEach(link => link.classList.remove('duplicate-text-link'));

    // Now, add the 'duplicate-text-link' class to only links which have the same text and URL
    links.forEach(link => {
        let normalizedText = "";

        // Extract and normalize the text content
        if (link.textContent.trim()) {
            normalizedText = link.textContent.trim().toLowerCase();
        }

        // If the link contains images, include their 'alt' attributes in the normalized text
        const images = link.querySelectorAll('img');
        images.forEach(img => {
            if (img.alt.trim()) {
                normalizedText += " " + img.alt.trim().toLowerCase();
            }
        });

        normalizedText = normalizedText.trim(); // Ensure no extra whitespace

        // Append the URL to the normalized text
        const url = link.href.trim().toLowerCase();
        const key = `${normalizedText} ${url}`; // Unique identifier for text + URL combination

        // Add the link to the map
        if (!linkMap.has(key)) {
            linkMap.set(key, []);
        }

        linkMap.get(key).push(link);
    });

    // Highlight duplicate links with the same text and URL
    linkMap.forEach((links, key) => {
        if (links.length > 1) {
            links.forEach(link => link.classList.add('duplicate-text-link'));
        }
    });
}


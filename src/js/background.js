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

const latestHeaders = [];

browser.webRequest.onHeadersReceived.addListener(
    (details) => {
        if (!latestHeaders[details.tabId]) {
            latestHeaders[details.tabId] = [];
        }

        if (!latestHeaders[details.tabId].find(item => item.url === details.url)) {
            latestHeaders[details.tabId].push({
                url: details.url,
                headers: details.responseHeaders
            });
        }
    },
    { urls: ["<all_urls>"] },
    ["responseHeaders"]
);

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "getHeaders" && message.tabId) {
        sendResponse(latestHeaders[message.tabId] ?? []);
    }

    return true; // Keep the message channel open for async responses
});


browser.tabs.onRemoved.addListener((tabId) => {
    delete latestHeaders[tabId];
});

// Create the parent menu item
browser.contextMenus.create({
    id: "parent-menu",
    title: browser.i18n.getMessage("contextMenuParent"),
    contexts: ["all"],
});

// Create sub-menu items
browser.contextMenus.create({
    id: "sub-menu-item1",
    parentId: "parent-menu",
    title: browser.i18n.getMessage("contextMenuSubItem1"),
    contexts: ["all"],
});

browser.contextMenus.create({
    id: "sub-menu-item2",
    parentId: "parent-menu",
    title: browser.i18n.getMessage("contextMenuSubItem1"),
    contexts: ["all"],
});

browser.contextMenus.create({
    id: "sub-menu-item3",
    parentId: "parent-menu",
    title: browser.i18n.getMessage("contextMenuSubItem1"),
    contexts: ["all"],
});

// Listener for context menu item clicks
browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "sub-menu-item1") {
        console.log("Sub Item 1 clicked");

        await browser.scripting.executeScript({
            target: { tabId: tab.id },
            func: highlightExternalLinks
        });
    } else if (info.menuItemId === "sub-menu-item2") {
        console.log("Sub Item 2 clicked");

        await browser.scripting.executeScript({
            target: { tabId: tab.id },
            func: highlightImagesWithoutAlt
        });
    } else if (info.menuItemId === "sub-menu-item3") {
        console.log("Sub Item 3 clicked");

        await browser.scripting.executeScript({
            target: { tabId: tab.id },
            func: identifyDuplicateLinks
        });
    }
});

function highlightImagesWithoutAlt() {
    const images = document.querySelectorAll('img');

    // First, remove the 'no-alt' class from all images
    images.forEach(img => {
        img.classList.remove('no-alt');
    });

    // Now, add the 'no-alt' class to only images without alt text
    images.forEach(img => {
        if (!img.alt) {
            img.classList.add('no-alt');
        }
    });
}

function highlightExternalLinks() {
    const links = document.querySelectorAll('a');

    // First, remove the 'external-link' class from all links
    links.forEach(link => {
        link.classList.remove('external-link');
    });

    // Now, add the 'external-link' class to only external links
    links.forEach(link => {
        const currentHost = window.location.host;
        const linkHost = new URL(link.href).host;

        if (linkHost && linkHost !== currentHost) {
            link.classList.add('external-link');
        }
    });
}

function identifyDuplicateLinks() {
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
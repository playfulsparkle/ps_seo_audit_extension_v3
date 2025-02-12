browser.runtime.onInstalled.addListener(async () => {
    const { onboardingCompleted } = await browser.storage.local.get("onboardingCompleted");

    if (!onboardingCompleted) {
        await browser.storage.local.set({ onboardingCompleted: true });

        browser.runtime.setUninstallURL("https://playfulsparkle.com/en-us/uninstall");

        // Open an external webpage instead of a local modals.html
        browser.tabs.create({ url: "https://playfulsparkle.com/en-us/install" });
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
    ["responseHeaders", "blocking"]
);

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "getHeaders" && message.tabId) {
        sendResponse(latestHeaders[message.tabId] ?? []);

        return true; // Indicates an asynchronous response
    }
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

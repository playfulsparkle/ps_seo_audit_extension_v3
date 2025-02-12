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

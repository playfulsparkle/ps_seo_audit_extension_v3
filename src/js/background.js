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

// Load settings when the page opens
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Get current settings from storage
        const result = await browser.storage.local.get('showAltTextImages');
        const showAltTextImages = result.showAltTextImages ?? false; // Default to true if not set

        // Update checkbox state
        const checkbox = document.querySelector('#showAltTextImages');

        if (checkbox) {
            checkbox.checked = showAltTextImages;
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
});

// Handle checkbox changes
document.querySelector('#showAltTextImages')?.addEventListener('change', async (e) => {
    try {
        await browser.storage.local.set({ showAltTextImages: e.target.checked });
        console.log('Settings saved:', e.target.checked);
    } catch (error) {
        console.error('Failed to save settings:', error);
    }
});

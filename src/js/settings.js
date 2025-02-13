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


// Load settings when the page opens
document.addEventListener('DOMContentLoaded', async () => {
    document.querySelector('#showAltTextImages').checked = await getSetting('show_alt_text_images', false);

    // Handle checkbox changes
    document.querySelector('#showAltTextImages')?.addEventListener('change', async (e) => {
        await saveSetting('show_alt_text_images', e.target.checked);
    });
});


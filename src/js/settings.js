async function saveSetting(offset, value) {
    try {
        await browser.storage.local.set({ [offset]: value });
    } catch (error) {
        console.error(`There was an error saving ${offset}.`);
    }
}

async function getSetting(offset, default_value = null) {
    try {
        const result = await browser.storage.local.get(offset);

        return result[offset] ?? default_value;
    } catch (error) {
        console.error(`There was an error getting ${offset}.`);

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


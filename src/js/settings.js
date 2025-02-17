async function saveSetting(offset, value) {
    try {
        await chrome.storage.local.set({ [offset]: value });
    } catch (error) {
        console.error(`saveSetting: Can't save ${offset} value ${error.message}`);
    }
}

async function getSetting(offset, default_value = null) {
    try {
        const result = await chrome.storage.local.get(offset);

        return result[offset] ?? default_value;
    } catch (error) {
        console.error(`getSetting: Can't get ${offset} value ${error.message}`);

        return default_value;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    document.querySelector('#showAltTextImages').checked = await getSetting('show_alt_text_images', false);

    document.querySelector('#showAltTextImages')?.addEventListener('change', async (e) => {
        await saveSetting('show_alt_text_images', e.target.checked);
    });
});


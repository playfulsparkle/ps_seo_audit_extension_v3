// Add this function to handle storage
async function getStorageValue(key) {
  try {
    const result = await browser.storage.local.get(key);
    return result[key];
  } catch (error) {
    console.error('Storage error:', error);
    return null;
  }
}

// Update the updateUI function
async function updateUI(data) {
  const seoInfo = document.querySelector('#seo-info');

  if (!data) {
    seoInfo.innerHTML = '<p>Error: Unable to retrieve page data</p>';
    return;
  }

  // Get showAltTextImages preference
  const showAltTextImages = await getStorageValue('showAltTextImages') ?? false;

  // Build the HTML content
  let content = `
        <p>Title: ${data.metadata.title}</p>
        <p>Description: ${data.metadata.description}</p>
        <p>URL: ${data.metadata.url}</p>
        <p>Canonical: ${data.metadata.canonical}</p>
        <p>Word Count: ${data.wordCount}</p>
        <p>Headings (H1-H6): ${data.headings}</p>
        <p>Links: ${data.links} (internal: ${data.internalLinks}, external: ${data.externalLinks})</p>
    `;

  // Conditionally add image information
  if (showAltTextImages) {
    content += `<p>Images: ${data.images} (with alt: ${data.imagesWithAlt}, without alt: ${data.imagesWithoutAlt})</p>`;
  } else {
    content += `<p>Images: ${data.images}</p>`;
  }

  seoInfo.innerHTML = content;
}

// Get active tab
async function getCurrentTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const tab = await getCurrentTab();

    const response = await browser.tabs.sendMessage(tab.id, { action: 'getPageData' });

    updateUI(response);
  } catch (error) {
    console.error('Error:', error);

    updateUI(null);
  }
});


async function getSetting(offset, default_value = null) {
  try {
    const result = await browser.storage.local.get(offset);

    return result[offset] ?? default_value;
  } catch (error) {
    console.error(`There was an error getting ${offset}.`);

    return default_value;
  }
}

// Update the updateUI function
async function updateUI(data) {
  const seoInfo = document.querySelector('#seo-info');

  if (!data) {
    seoInfo.innerHTML = '<p>Error: Unable to retrieve page data</p>';

    return;
  }

  // Build the HTML content
  let content = `
        <p>Title: ${data.metadata.title}</p>
        <p>Description: ${data.metadata.description}</p>
        <p>URL: ${data.metadata.url}</p>
        <p>Canonical: ${data.metadata.canonical}</p>
        <p>Word Count: ${data.wordCount}</p>
        <p>Headings (H1-H6): ${data.headings_total}</p>
        <p>Links: ${data.links_total} (internal: ${data.internalLinks}, external: ${data.externalLinks})</p>
    `;

  // Get showAltTextImages preference
  const showAltTextImages = await getSetting('showAltTextImages', false);

  // Conditionally add image information
  if (showAltTextImages) {
    content += `<p>Images: ${data.images_total} (with alt: ${data.imagesWithAlt}, without alt: ${data.imagesWithoutAlt})</p>`;
  } else {
    content += `<p>Images: ${data.images_total}</p>`;
  }

  seoInfo.innerHTML = content;
}

// Get active tab
async function getCurrentTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

  return tab;
}

async function getResponseStatus(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });

    return response.status;
  } catch (error) {
    console.error(`Failed to fetch ${url}:`, error);

    return null;
  }
}

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // document.querySelector('#title-label').textContent = browser.i18n.getMessage('titleLabel');
  // document.querySelector('#description-label').textContent = browser.i18n.getMessage('descriptionLabel');

  try {
    const tab = await getCurrentTab();

    const response = await browser.tabs.sendMessage(tab.id, { action: 'getPageData' });

    updateUI(response);

    const all_headers = await browser.runtime.sendMessage({ action: "getHeaders", tabId: tab.id });

    const page_headers = all_headers.find(item => item.url === tab.url)?.headers ?? [];

    const xua = page_headers.find(header => header.name === 'x-ua-compatible')?.value ?? undefined;

    console.log(xua);

    const heading_response = await browser.tabs.sendMessage(tab.id, { action: 'getPageHeadings' });

    const seoInfo = document.querySelector('#seo-info');
    seoInfo.innerHTML += heading_response;

  } catch (error) {
    console.error('Error:', error);

    updateUI(null);
  }
});


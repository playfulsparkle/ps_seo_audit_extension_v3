/**
 * Retrieves the currently active tab in the current window.
 *
 * @returns {Promise<browser.tabs.Tab>} A promise that resolves to the currently active tab object.
 */
async function getCurrentTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

  return tab;
}

/**
 * Fetches the HTTP response status code for a given URL using a HEAD request.
 *
 * @param {string} url - The URL to fetch the response status from.
 * @returns {Promise<number|null>} A promise that resolves to the HTTP status code, or null if the request fails.
 */
async function getResponseStatus(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });

    return response.status;
  } catch (error) {
    console.error(`Failed to fetch ${url}:`, error);

    return null;
  }
}

/**
 * Compiles a template by replacing placeholders with corresponding data
 * 
 * @param {string} template - The template string with placeholders (e.g., "{{title}}")
 * @param {object} data - An object containing key-value pairs for placeholders
 * @returns {string} - The compiled template with placeholders replaced
 */
function compileTemplate(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] !== undefined ? data[key] : match;
  });
}

/**
* Renders a compiled template and appends it to a target element

* @param {string} template - The template string
* @param {object} data - Data to insert into the template
* @param {HTMLElement} targetElement - The DOM element to render the template into
*/
function renderTemplate(template, data = {}, targetElement) {
  targetElement.innerHTML = !data ? template : compileTemplate(template, data);
}

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


// Update the updateUI function
async function updateUI(data) {
  const seoInfo = document.querySelector('#seo-info');
  let template = "", template_data = "";

  if (!data) {
    template = `<p>Error: Unable to retrieve page data</p>`;
    template_data = {};
  } else {
    // Build the template
    template = `
      <p>Title: {{title}}</p>
      <p>Description: {{description}}</p>
      <p>URL: {{url}}</p>
      <p>Canonical: {{canonical}}</p>
      <p>Word Count: {{wordCount}}</p>
      <p>Headings (H1-H6): {{headings_total}}</p>
      <p>Links: {{links_total}} (internal: {{internalLinks}}, external: {{externalLinks}})</p>
    `;

    // Get showAltTextImages preference
    const showAltTextImages = await getSetting('showAltTextImages', false);

    // Conditionally add image information
    if (showAltTextImages) {
      template += `<p>Images: {{images_total}} (with alt: {{imagesWithAlt}}, without alt: {{imagesWithoutAlt}})</p>`;
    } else {
      template += `<p>Images: {{images_total}}</p>`;
    }

    template_data = {
      title: data.metadata.title,
      description: data.metadata.description,
      url: data.metadata.url,
      canonical: data.metadata.canonical,
      wordCount: data.wordCount,
      headings_total: data.headings_total,
      links_total: data.links_total,
      internalLinks: data.internalLinks,
      externalLinks: data.externalLinks,
      images_total: data.images_total,
      imagesWithAlt: data.imagesWithAlt,
      imagesWithoutAlt: data.imagesWithoutAlt
    };
  }

  // Render the template with data
  renderTemplate(template, template_data, seoInfo);
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

    if (xua) {
      console.log(xua);
    }

    const heading_response = await browser.tabs.sendMessage(tab.id, { action: 'getPageHeadings' });

    const seoInfo = document.querySelector('#seo-info');
    seoInfo.innerHTML += heading_response;

    console.log('Success');
  } catch (error) {
    console.error('Error:', error);

    updateUI(null);
  }
});


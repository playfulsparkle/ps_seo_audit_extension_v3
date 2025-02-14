String.prototype.truncate = function (maxLength) {
  return this.length > maxLength ? this.substring(0, maxLength) + '...' : this.toString();
};

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
 * Fetches the HTTP response headers for a given URL using a HEAD request.
 *
 * @param {string} url - The URL to fetch the response headers from.
 * @returns {Promise<Headers|object>} A promise that resolves to the HTTP response headers, or null if the request fails.
 */
async function getResponseHeaders(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });

    return response.headers;
  } catch (error) {
    console.error(`Failed to fetch headers for ${url}:`, error);

    return {};
  }
}

async function getFaviconUrlAsData(url) {
  try {
    const response = await fetch(url);

    const blob = await response.blob();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Failed to fetch favicon:', error);

    return null;
  }
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

async function getFavicon(iconLinks) {
  // Try to find the first valid favicon (non-null) using Array.find
  for (const iconLink of iconLinks) {
    const result = await getFaviconUrlAsData(iconLink);

    if (result !== null) {
      return result; // Return the first valid result
    }
  }

  return "/icons/icon-32.png"; // Return default if no valid favicon is found
}

function ml(tagName, props, ...children) {
  var el = document.createElement(tagName);

  // Set properties and event listeners
  if (props) {
    for (var name in props) {
      if (name.indexOf("on") === 0) {
        el.addEventListener(name.substr(2).toLowerCase(), props[name], false);
      } else if (name === "className" && Array.isArray(props[name])) {
        el.classList.add(...props[name]);
      } else {
        el.setAttribute(name, props[name]);
      }
    }
  }

  // Append children
  for (const child of children) {
    appendChildren(el, child);
  }

  return el;
}

function appendChildren(el, child) {
  if (typeof child === "string") {
    el.appendChild(document.createTextNode(child));
  } else if (child instanceof Array) {
    for (var nestedChild of child) {
      appendChildren(el, nestedChild);
    }
  } else if (child instanceof Node) {
    el.appendChild(child);
  }
}



document.addEventListener('DOMContentLoaded', async () => {
  try {
    const content = document.querySelector("#content");

    const tab = await getCurrentTab();

    const page_data = await browser.tabs.sendMessage(tab.id, { action: 'getPageData' });

    const tab_lists = ml('div', { 'role': 'tablist' },
      ml('button', { 'id': 'tab-overview', 'type': 'button', 'role': 'tab', 'aria-selected': 'true', 'aria-controls': 'tabpanel-overview', 'tabindex': '-1' },
        browser.i18n.getMessage('tab_btn_label_overview'),
        ml('img', { 'src': '/icons/overview.svg', 'width': '16', 'height': '16' })
      ),
      ml('button', { 'id': 'tab-headings', 'type': 'button', 'role': 'tab', 'aria-controls': 'tabpanel-headings' },
        browser.i18n.getMessage('tab_btn_label_headings'),
        ml('img', { 'src': '/icons/headings.svg', 'width': '16', 'height': '16' })
      ),
      ml('button', { 'id': 'tab-images', 'type': 'button', 'role': 'tab', 'aria-controls': 'tabpanel-images' },
        browser.i18n.getMessage('tab_btn_label_images'),
        ml('img', { 'src': '/icons/images.svg', 'width': '16', 'height': '16' })
      ),
      ml('button', { 'id': 'tab-links', 'type': 'button', 'role': 'tab', 'aria-controls': 'tabpanel-links' },
        browser.i18n.getMessage('tab_btn_label_links'),
        ml('img', { 'src': '/icons/links.svg', 'width': '16', 'height': '16' })
      ),
      ml('button', { 'id': 'tab-rich-snippets', 'type': 'button', 'role': 'tab', 'aria-controls': 'tabpanel-rich-snippets' },
        browser.i18n.getMessage('tab_btn_label_rich_snippets'),
        ml('img', { 'src': '/icons/rich-snippet.svg', 'width': '16', 'height': '16' })
      ),
      ml('button', { 'id': 'tab-metas', 'type': 'button', 'role': 'tab', 'aria-controls': 'tabpanel-metas' },
        browser.i18n.getMessage('tab_btn_label_metas'),
        ml('img', { 'src': '/icons/metas.svg', 'width': '16', 'height': '16' })
      )
    );

    content.appendChild(tab_lists);

    let favicon = await getFavicon(page_data.icon_links);

    const seo_preview = ml('div', { 'class': 'preview' },
      ml('img', { 'class': 'logo', 'src': favicon, 'width': '32', 'height': '32' }),
      ml('span', { 'class': 'subtitle' }, page_data.preview.title),
      ml('cite', { 'class': 'breadcrumb' },
        page_data.preview.breadcrumb,
        ml('img', { 'src': '/icons/more-vertical.svg', 'width': '16', 'height': '16' })
      ),
      ml('h3', { 'class': 'title' }, page_data.preview.title),
      ml('p', { 'class': 'desc' }, page_data.preview.description)
    );

    const overview_panel = ml('div', { 'id': 'tabpanel-overview', 'role': 'tabpanel', 'tabindex': '0', 'aria-hidden': '', 'aria-labelledby': 'tab-overview' }, seo_preview);

    content.appendChild(overview_panel);

    const headings_panel = ml('div', { 'id': 'tabpanel-headings', 'role': 'tabpanel', 'tabindex': '0', 'aria-labelledby': 'tab-headings' });

    content.appendChild(headings_panel);

    const images_panel = ml('div', { 'id': 'tabpanel-images', 'role': 'tabpanel', 'tabindex': '0', 'aria-labelledby': 'tab-images' });

    content.appendChild(images_panel);

    const links_panel = ml('div', { 'id': 'tabpanel-links', 'role': 'tabpanel', 'tabindex': '0', 'aria-labelledby': 'tab-links' });

    content.appendChild(links_panel);

    const rich_snippets_panel = ml('div', { 'id': 'tabpanel-rich-snippets', 'role': 'tabpanel', 'tabindex': '0', 'aria-labelledby': 'tab-rich-snippets' });

    content.appendChild(rich_snippets_panel);

    const metas_panel = ml('div', { 'id': 'tabpanel-metas', 'role': 'tabpanel', 'tabindex': '0', 'aria-labelledby': 'tab-metas' });

    content.appendChild(metas_panel);

    const footer = ml('footer', null,
      ml('img', { 'src': '/icons/playful-sparkle-logo.png' })
    );

    content.appendChild(footer);

    // Enable tab panels
    new TabsAutomatic(content.querySelector('[role=tablist]'));

  } catch (error) {
    console.error(error);
  }
});


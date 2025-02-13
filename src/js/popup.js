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

function makeTabBtn(btn_id, btn_controls, btn_icon, btn_selected, btn_label) {
  const tab_btn = document.createElement('button');
  tab_btn.setAttribute('id', btn_id);
  tab_btn.setAttribute('type', 'button');
  tab_btn.setAttribute('role', 'tab');
  tab_btn.setAttribute('aria-selected', btn_selected);
  tab_btn.setAttribute('aria-controls', btn_controls);
  if (!btn_selected) tab_btn.setAttribute('tabindex', '-1');
  tab_btn.textContent = btn_label;

  const tab_icon = document.createElement('img');
  tab_icon.setAttribute('src', btn_icon);
  tab_icon.setAttribute('width', '16');
  tab_icon.setAttribute('height', '16');

  tab_btn.appendChild(tab_icon);

  return tab_btn;
}

function makeTabPanel(btn_id, tab_panel_id, tab_panel_hidden = true) {
  const tab_panel = document.createElement('div');
  tab_panel.setAttribute('id', tab_panel_id);
  tab_panel.setAttribute('role', 'tabpanel');
  tab_panel.setAttribute('tabindex', '0');
  if (tab_panel_hidden) tab_panel.setAttribute('hidden', '');
  tab_panel.setAttribute('aria-labelledby', btn_id);

  return tab_panel;
}

function makeGooglePreview(page_data) {
  const google_preview = document.createElement('div');
  google_preview.classList.add('google-preview');

  const link = document.createElement('span');
  link.classList.add('link');

  const logo = document.createElement('img');
  logo.classList.add('logo');
  logo.setAttribute('src', page_data.logo);
  logo.setAttribute('width', '32');
  logo.setAttribute('height', '32');
  link.appendChild(logo);

  const subtitle = document.createElement('span');
  subtitle.classList.add('subtitle');
  subtitle.textContent = page_data.title;
  link.appendChild(subtitle);

  const breadcrumb = document.createElement('span');
  breadcrumb.classList.add('breadcrumb');
  breadcrumb.textContent = page_data.url_fancy;

  const vbar = document.createElement('img');
  vbar.setAttribute('src', '/icons/more-vertical.svg');
  vbar.setAttribute('width', '16');
  vbar.setAttribute('height', '16');
  breadcrumb.appendChild(vbar);

  link.appendChild(breadcrumb);

  const title = document.createElement('h3');
  title.classList.add('title');
  title.textContent = page_data.title;
  link.appendChild(title);

  const desc = document.createElement('p');
  desc.classList.add('desc');
  desc.textContent = page_data.description;

  google_preview.appendChild(link);
  google_preview.appendChild(desc);

  return google_preview;
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const tab = await getCurrentTab();

    const page_data = await browser.tabs.sendMessage(tab.id, { action: 'getPageData' });

    const content = document.querySelector("#content");

    //#region Tablist
    const tl = document.createElement('div');
    tl.setAttribute('role', 'tablist');

    tl.appendChild(makeTabBtn('tab-overview', 'tabpanel-overview', '/icons/overview.svg', true, browser.i18n.getMessage('tab_btn_label_overview')));
    tl.appendChild(makeTabBtn('tab-headings', 'tabpanel-headings', '/icons/headings.svg', false, browser.i18n.getMessage('tab_btn_label_headings')));
    tl.appendChild(makeTabBtn('tab-images', 'tabpanel-images', '/icons/images.svg', false, browser.i18n.getMessage('tab_btn_label_images')));
    tl.appendChild(makeTabBtn('tab-links', 'tabpanel-links', '/icons/links.svg', false, browser.i18n.getMessage('tab_btn_label_links')));
    tl.appendChild(makeTabBtn('tab-rich-snippets', 'tabpanel-rich-snippets', '/icons/overview.svg', false, browser.i18n.getMessage('tab_btn_label_rich_snippets')));
    tl.appendChild(makeTabBtn('tab-metas', 'tabpanel-metas', '/icons/meta.svg', false, browser.i18n.getMessage('tab_btn_label_metas')));

    content.appendChild(tl);
    //#endregion

    //#region Overview panel
    const overview_panel = makeTabPanel('tab-overview', 'tabpanel-overview', false);

    let favicon = await getFavicon(page_data.icon_links);

    const google_preview_data = {
      logo: favicon,
      url: page_data.url,
      title: page_data.title,
      url_fancy: page_data.url_fancy,
      description: page_data.description,
    };

    overview_panel.appendChild(makeGooglePreview(google_preview_data));

    content.appendChild(overview_panel);
    //#endregion

    //#region Headings panel
    const headings_panel = makeTabPanel('tab-headings', 'tabpanel-headings');
    content.appendChild(headings_panel);
    //#endregion

    //#region Images panel
    const images_panel = makeTabPanel('tab-images', 'tabpanel-images');
    content.appendChild(images_panel);
    //#endregion

    //#region Links panel
    const links_panel = makeTabPanel('tab-links', 'tabpanel-links');
    content.appendChild(links_panel);
    //#endregion

    //#region Rich snippets panel
    const rich_snippets_panel = makeTabPanel('tab-rich-snippets', 'tabpanel-rich-snippets');
    content.appendChild(rich_snippets_panel);
    //#endregion

    //#region Meta data panel
    const metas_panel = makeTabPanel('tab-metas', 'tabpanel-metas');
    content.appendChild(metas_panel);
    //#endregion

    // Enable tab panels
    new TabsAutomatic(content.querySelector('[role=tablist]'));

    //#region Footer
    const footer = document.createElement('footer');

    const footer_logo = document.createElement('img');
    footer_logo.setAttribute('src', '/icons/playful-sparkle-logo.png');
    footer.appendChild(footer_logo);

    content.appendChild(footer);
    //#endregion


    // const page_url = await browser.tabs.sendMessage(tab.id, { action: 'getPageURL' });

    // const all_headers = await getResponseHeaders(page_url);

    // console.log(all_headers.get("server") ?? null);
  } catch (error) {
    console.error(error);
  }
});


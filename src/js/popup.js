"use strict";

const MAX_STRING_LENGTH = 155;

const MIN_TITLE_LENGTH = 40;
const MAX_TITLE_LENGTH = 80;
const MIN_DESC_LENGTH = 70;
const MAX_DESC_LENGTH = 155;
const MAX_BOX_CHAR_LENGTH = 15
const DECIMAL_PLACES = 2;

const ICON_SMALL_WIDTH = 16;
const ICON_SMALL_HEIGHT = 16
const ICON_NORMAL_WIDTH = 24;
const ICON_NORMAL_HEIGHT = 24;
const ICON_MEDIUM_WIDTH = 32;
const ICON_MEDIUM_HEIGHT = 32;

String.prototype.truncate = function (maxLength) {
  return this.length >= maxLength ? this.slice(0, maxLength) + "..." : this.toString();
};

String.prototype.i18n = function (substitutions = null) {
  const translation = chrome.i18n.getMessage(this.toString(), substitutions);
  return translation || null;
};

Number.prototype.formatNumber = function (decimalPlaces = 0) {
  return new Intl.NumberFormat(navigator.language, {
    maximumFractionDigits: decimalPlaces,
    minimumFractionDigits: decimalPlaces
  }).format(this);
};

function isObjEmpty(obj) {
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      return false;
    }
  }

  return true;
}

function isObjPropEmpty(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key) &&
    (typeof obj[key] === "string" || Array.isArray(obj[key])) && obj[key].length > 0;
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  return tab;
}

async function getSetting(offset, default_value = null) {
  try {
    const result = await chrome.storage.local.get(offset);

    return result[offset] ?? default_value;
  } catch {
    return default_value;
  }
}

function ml(tagName, props, ...children) {
  const ON_PREFIX_LENGTH = 2;

  const el = document.createElement(tagName);

  // Set properties and event listeners
  if (props) {
    for (const name in props) {
      if (name.indexOf("on") === 0) {
        el.addEventListener(name.slice(ON_PREFIX_LENGTH).toLowerCase(), props[name], false);
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
    el.appendChild(sanitizeHtml(child));
  } else if (child instanceof Array) {
    for (const nestedChild of child) {
      appendChildren(el, nestedChild);
    }
  } else if (child instanceof Node) {
    el.appendChild(child);
  }
}

function sanitizeHtml(html) {
  const parser = new DOMParser();
  const parsedHtml = parser.parseFromString(html, "text/html");

  if (!parsedHtml.body || !parsedHtml.body.childNodes.length) {
    return document.createTextNode(html);
  }

  const fragment = document.createDocumentFragment();

  for (const node of Array.from(parsedHtml.body.childNodes)) {
    fragment.appendChild(node);
  }

  return fragment;
}

function setButtonState(buttons, isEnabled) {
  if (typeof buttons !== "object") {
    return;
  }

  for (const button of buttons) {
    button.disabled = !isEnabled;

    if (isEnabled) {
      button.classList.remove("disabled");
    } else {
      button.classList.add("disabled");
    }
  }
}

const icon_list = Object.create(null);

function makeIcon(icon_name, icon_title, width, height) {
  const key = icon_name + width + height;

  if (!icon_list[key]) {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("class", `icon ${icon_name}`);
    icon.setAttribute("width", width);
    icon.setAttribute("height", height);

    if (typeof icon_title === "string") {
      icon.setAttribute("role", "img");

      const title = document.createElement("title");
      title.appendChild(document.createTextNode(icon_title));

      icon.appendChild(title);
    } else {
      icon.setAttribute("aria-hidden", "true");
    }

    const icon_use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    icon_use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", `#${icon_name}`);

    icon.appendChild(icon_use);

    icon_list[key] = icon;
  }

  return icon_list[key].cloneNode(true);
}

function makeTableRow(icon_filename, severity_color, severity_level, text) {
  return ml("tr", null,
    ml("th", { "class": "x-left severity-level-" + severity_color }, severity_level, makeIcon(icon_filename, null, ICON_SMALL_WIDTH, ICON_SMALL_HEIGHT)),
    ml("td", null, text),
  );
}

function makeDescriptionList(panel, heading, data) {
  const rows = [];

  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      let value = ml("span", { "class": "tag tag-error" }, "txt_empty_value".i18n());

      if (data[key]) {
        value = document.createTextNode(data[key]);
      }

      rows.push(
        ml("dt", { "class": "break-anywhere" }, key), // Never empty
        ml("dd", { "class": "break-anywhere" }, value),
      );
    }
  }

  panel.appendChild(ml("h2", null, heading));
  panel.appendChild(ml("dl", { "class": "col-list" }, ...rows));
}

function buildHeadingTree(structure) {
  const result = [];

  for (let index = 0; index < structure.length; index++) {
    const { tag_name, text, counter, children } = structure[index];

    const listItem = ml("li", null,
      ml(tag_name, null,
        ml("span", { "class": "tag" }, tag_name),
        document.createTextNode(text) || `<span class="tag tag-error">${"text_empty_heading".i18n()}</span>`
      ),
      ml("button", { "class": "btn-locate", "data-locate-id": `heading-${counter}`, "title": "btn_locate_element".i18n() },
        makeIcon("icon-locate", null, ICON_SMALL_WIDTH, ICON_SMALL_HEIGHT)
      )
    );

    if (children.length > 0) {
      const childList = ml("ul", null, ...buildHeadingTree(children));

      listItem.appendChild(childList);
    }

    result.push(listItem);
  }

  return result;
}


const content = document.querySelector("#content");


//#region Popup UI
const tab_lists = ml("div", { "role": "tablist", "class": "tablist" },
  ml("button", { "class": "tab-btn", "id": "tab-overview", "type": "button", "disabled": "", "role": "tab", "aria-controls": "tabpanel-overview", "title": "tab_btn_label_overview".i18n() },
    "tab_btn_label_overview".i18n(),
    makeIcon("icon-overview", "tab_btn_label_overview".i18n(), ICON_SMALL_WIDTH, ICON_SMALL_HEIGHT)
  ),
  ml("button", { "class": "tab-btn", "id": "tab-headings", "type": "button", "disabled": "", "role": "tab", "aria-controls": "tabpanel-headings", "title": "tab_btn_label_headings".i18n() },
    "tab_btn_label_headings".i18n(),
    makeIcon("icon-heading", "tab_btn_label_headings".i18n(), ICON_SMALL_WIDTH, ICON_SMALL_HEIGHT)
  ),
  ml("button", { "class": "tab-btn", "id": "tab-images", "type": "button", "disabled": "", "role": "tab", "aria-controls": "tabpanel-images", "title": "tab_btn_label_images".i18n() },
    "tab_btn_label_images".i18n(),
    makeIcon("icon-image", "tab_btn_label_images".i18n(), ICON_SMALL_WIDTH, ICON_SMALL_HEIGHT)
  ),
  ml("button", { "class": "tab-btn", "id": "tab-links", "type": "button", "disabled": "", "role": "tab", "aria-controls": "tabpanel-links", "title": "tab_btn_label_links".i18n() },
    "tab_btn_label_links".i18n(),
    makeIcon("icon-link", "tab_btn_label_links".i18n(), ICON_SMALL_WIDTH, ICON_SMALL_HEIGHT)
  ),
  ml("button", { "class": "tab-btn", "id": "tab-rich-snippets", "type": "button", "disabled": "", "role": "tab", "aria-controls": "tabpanel-rich-snippets", "title": "tab_btn_label_rich_snippets".i18n() },
    "tab_btn_label_rich_snippets".i18n(),
    makeIcon("icon-rich-snippet", "tab_btn_label_rich_snippets".i18n(), ICON_SMALL_WIDTH, ICON_SMALL_HEIGHT)
  ),
  ml("button", { "class": "tab-btn", "id": "tab-metas", "type": "button", "disabled": "", "role": "tab", "aria-controls": "tabpanel-metas", "title": "tab_btn_label_metas".i18n() },
    "tab_btn_label_metas".i18n(),
    makeIcon("icon-meta", "tab_btn_label_metas".i18n(), ICON_SMALL_WIDTH, ICON_SMALL_HEIGHT)
  )
);

content.appendChild(tab_lists);

const overview_panel = ml("div", { "class": "tabpanel", "id": "tabpanel-overview", "role": "tabpanel", "tabindex": "0", "aria-labelledby": "tab-overview" });

content.appendChild(overview_panel);

const headings_panel = ml("div", { "class": "tabpanel", "id": "tabpanel-headings", "role": "tabpanel", "tabindex": "0", "aria-labelledby": "tab-headings" });

content.appendChild(headings_panel);

const images_panel = ml("div", { "class": "tabpanel", "id": "tabpanel-images", "role": "tabpanel", "tabindex": "0", "aria-labelledby": "tab-images" });

content.appendChild(images_panel);

const links_panel = ml("div", { "class": "tabpanel", "id": "tabpanel-links", "role": "tabpanel", "tabindex": "0", "aria-labelledby": "tab-links" });

content.appendChild(links_panel);

const rich_snippets_panel = ml("div", { "class": "tabpanel", "id": "tabpanel-rich-snippets", "role": "tabpanel", "tabindex": "0", "aria-labelledby": "tab-rich-snippets" });

content.appendChild(rich_snippets_panel);

const metas_panel = ml("div", { "class": "tabpanel", "id": "tabpanel-metas", "role": "tabpanel", "tabindex": "0", "aria-labelledby": "tab-metas" });

content.appendChild(metas_panel);

const footer = ml("footer", null,
  ml("ul", { "class": "legends" },
    ml("li", null, "text_higlight_legends".i18n()),
    ml("li", { "class": "external-link", "title": "text_external_link".i18n() },
      ml("span", { "class": "sr-only" }, "text_external_link".i18n())
    ),
    ml("li", { "class": "duplicate-link", "title": "text_duplicate_link".i18n() },
      ml("span", { "class": "sr-only" }, "text_duplicate_link".i18n())
    ),
    ml("li", { "class": "nofollow-link", "title": "text_nofollow_link".i18n() },
      ml("span", { "class": "sr-only" }, "text_nofollow_link".i18n())
    ),
    ml("li", { "class": "img-missing-alt", "title": "text_img_missing_alt".i18n() },
      ml("span", { "class": "sr-only" }, "text_img_missing_alt".i18n())
    )
  ),
  ml("picture", null,
    ml("source", { "type": "image/svg+xml", "media": "(prefers-color-scheme: light)", "srcset": "/icons/playful-sparkle-logo-light.svg" }),
    ml("source", { "type": "image/svg+xml", "media": "(prefers-color-scheme: dark)", "srcset": "/icons/playful-sparkle-logo-dark.svg" }),
    ml("img", { "src": "/icons/playful-sparkle-logo-light.svg", "alt": "extension_name".i18n(), "loading": "eager", "decoding": "async", "width": 172, "height": 24 }),
  )
);

content.appendChild(footer);

new TabsAutomatic(content.querySelector("[role=tablist]")); // Enable tab panels
//#endregion


//#region Loaded state change
chrome.runtime.onMessage.addListener(async message => {
  if (message.tabId && message.status) {
    const tab = await getCurrentTab();

    if (message.tabId === tab.id && message.status === "complete") {
      await showPopupContent(tab)
    }
  }
});


document.addEventListener("DOMContentLoaded", async () => {
  const tab = await getCurrentTab();

  let load_status;

  try {
    load_status = await chrome.runtime.sendMessage({ type: "getLoadStatus", tabId: tab.id }) || "complete";
  } catch {
    load_status = "complete";
  }

  if (load_status === "complete") {
    await showPopupContent(tab);
  }
});
//#endregion


async function showPopupContent(tab) {
  //#endregion Clean up UI
  overview_panel.innerText = "";
  headings_panel.innerText = "";
  images_panel.innerText = "";
  links_panel.innerText = "";
  rich_snippets_panel.innerText = "";
  metas_panel.innerText = "";
  //#endregion


  //#region Fetch page data
  let page_data = Object.create(null);
  let is_error = false;

  try {
    page_data = await chrome.tabs.sendMessage(tab.id, { "action": "getPageData" });
  } catch {
    is_error = true;
  }
  //#endregion


  //#endregion Check if we got all the data
  document.body.classList.remove("loading");

  if (is_error) {
    overview_panel.classList.add("fetch-error");

    overview_panel.appendChild(ml("p", null, "txt_update_error".i18n()));
    overview_panel.appendChild(ml("p", { "class": "btn-container x-center" },
      ml("a", { "class": "primary-btn", "href": "mailto:support@playfulsparkle.com" }, "btn_send_error_report".i18n())
    ));

    return;
  }
  //#endregion


  //#region Fetch page HTTP headers
  let page_headers = [];

  try {
    page_headers = await chrome.runtime.sendMessage({ type: "getHeaders", tabId: tab.id, tabUrl: page_data.url });
  } catch {
    page_headers = [];
  }
  //#endregion


  setButtonState(tab_lists.querySelectorAll('button[role="tab"]'), !is_error);


  //#region SEO preview
  if (typeof page_data.preview === "object") {
    const preview_title = page_data.preview.title ?? "txt_undefined".i18n();

    const seo_preview = ml("div", { "class": "preview" },
      ml("span", { "class": "logo-container" },
        ml("img", { "class": "logo", "src": page_data.preview.favicon, "width": ICON_MEDIUM_WIDTH, "height": ICON_MEDIUM_HEIGHT })
      ),
      ml("span", { "class": "subtitle", "aria-hidden": "true" }, document.createTextNode(preview_title)),
      ml("cite", { "class": "breadcrumb", "aria-hidden": "true" },
        page_data.preview.breadcrumb,
        makeIcon("icon-more-vertical", null, ICON_SMALL_WIDTH, ICON_SMALL_HEIGHT)
      ),
      ml("h3", { "class": "title" }, document.createTextNode(preview_title)),
      ml("p", { "class": "desc" }, document.createTextNode(page_data.preview.description.truncate(MAX_STRING_LENGTH)))
    );

    overview_panel.appendChild(seo_preview);
  }
  //#endregion


  //#region Overview boxes
  let language = "txt_undefined".i18n();

  if (page_data.language) {
    const language_code = page_data.language.replace("-", "_").toLowerCase();

    language = ("lang_code_" + language_code).i18n() || ("lang_code_" + (language_code.split("_").pop() || "")).i18n();

    if (language) {
      language = `${language} (${page_data.language})`;
    }
  }

  let robots_meta = "txt_undefined".i18n();

  if (isObjPropEmpty(page_data.metas.general, "robots")) {
    robots_meta = page_data.metas.general.robots;
  } else if (isObjPropEmpty(page_data.metas.general, "googlebot")) {
    robots_meta = page_data.metas.general.googlebot;
  }

  overview_panel.appendChild(ml("section", { "class": "box-group" },
    ml("div", { "class": "box" },
      makeIcon("icon-robot", "txt_robots_meta".i18n(), ICON_MEDIUM_WIDTH, ICON_MEDIUM_HEIGHT),
      ml("span", { "class": "label" }, "txt_robots_meta".i18n()),
      ml("span", { "class": "value" + (robots_meta.length > MAX_BOX_CHAR_LENGTH ? " dense" : "") }, robots_meta)
    ),
    ml("div", { "class": "box" },
      makeIcon("icon-locale", "txt_language".i18n(), ICON_MEDIUM_WIDTH, ICON_MEDIUM_HEIGHT),
      ml("span", { "class": "label" }, "txt_language".i18n()),
      ml("span", { "class": "value" + (language.length > MAX_BOX_CHAR_LENGTH ? " dense" : "") }, language)
    ),
    ml("div", { "class": "box" },
      makeIcon("icon-analytic", "txt_word_count".i18n(), ICON_MEDIUM_WIDTH, ICON_MEDIUM_HEIGHT),
      ml("span", { "class": "label" }, "txt_word_count".i18n()),
      ml("span", { "class": "value" }, page_data.seo_stats.word_count.formatNumber())
    ),
    ml("div", { "class": "box" },
      makeIcon("icon-analytic", "txt_character_count".i18n(), ICON_MEDIUM_WIDTH, ICON_MEDIUM_HEIGHT),
      ml("span", { "class": "label" }, "txt_character_count".i18n()),
      ml("span", { "class": "value" }, page_data.seo_stats.character_count.formatNumber())
    ),
    ml("div", { "class": "box" },
      makeIcon("icon-analytic", "txt_sentence_count".i18n(), ICON_MEDIUM_WIDTH, ICON_MEDIUM_HEIGHT),
      ml("span", { "class": "label" }, "txt_sentence_count".i18n()),
      ml("span", { "class": "value" }, page_data.seo_stats.sentence_count.formatNumber())
    ),
    ml("div", { "class": "box" },
      makeIcon("icon-analytic", "txt_avg_word_length".i18n(), ICON_MEDIUM_WIDTH, ICON_MEDIUM_HEIGHT),
      ml("span", { "class": "label" }, "txt_avg_word_length".i18n()),
      ml("span", { "class": "value" }, page_data.seo_stats.avg_word_length.formatNumber(DECIMAL_PLACES))
    ),
    ml("div", { "class": "box" },
      makeIcon("icon-analytic", "txt_avg_sentence_length".i18n(), ICON_MEDIUM_WIDTH, ICON_MEDIUM_HEIGHT),
      ml("span", { "class": "label" }, "txt_avg_sentence_length".i18n()),
      ml("span", { "class": "value" }, page_data.seo_stats.avg_sentence_length.formatNumber(DECIMAL_PLACES))
    ),
  ));
  //#endregion


  //#region Error logs
  const errors = [];

  if (!page_data.title || page_data.title.length === 0) {
    errors.push(makeTableRow("icon-high", "high", "severity_level_high".i18n(), "error_empty_page_title".i18n()));
  } else if (page_data.title.length < MIN_TITLE_LENGTH) {
    errors.push(makeTableRow("icon-high", "high", "severity_level_high".i18n(), sprintf("error_short_page_title".i18n(), page_data.title.length)));
  } else if (page_data.title.length > MAX_TITLE_LENGTH) {
    errors.push(makeTableRow("icon-high", "high", "severity_level_high".i18n(), sprintf("error_long_page_title".i18n(), page_data.title.length)));
  }

  if (!isObjPropEmpty(page_data.metas.general, "description")) {
    errors.push(makeTableRow("icon-high", "high", "severity_level_high".i18n(), "error_empty_meta_description".i18n()));
  } else if (page_data.metas.general.description.length < MIN_DESC_LENGTH) {
    errors.push(makeTableRow("icon-high", "high", "severity_level_high".i18n(), sprintf("error_short_meta_description".i18n(), page_data.metas.general.description.length)));
  } else if (page_data.metas.general.description.length > MAX_DESC_LENGTH) {
    errors.push(makeTableRow("icon-high", "high", "severity_level_high".i18n(), sprintf("error_long_meta_description".i18n(), page_data.metas.general.description.length)));
  }

  if (!page_data.language) {
    errors.push(makeTableRow("icon-high", "high", "severity_level_high".i18n(), "error_empty_page_language".i18n()));
  }


  for (const key in page_data.headings.nesting_errors) {
    if (Object.prototype.hasOwnProperty.call(page_data.headings.nesting_errors, key)) {
      const nesting_error = page_data.headings.nesting_errors[key];

      const examples = nesting_error.examples.map(
        example => example.heading_text
          ? `${example.tag_name} (${example.heading_text})`
          : example.tag_name
      ).join(", ");

      if (nesting_error.previous_level === 0 && page_data.headings.heading_stats.h1 > 0) {
        errors.push(makeTableRow("icon-high", "high", "severity_level_high".i18n(), sprintf("error_heading_h1_order".i18n(), nesting_error.occurrences, examples)));
      } else if (nesting_error.previous_level === 0 && page_data.headings.heading_stats.h1 === 0) {
        errors.push(makeTableRow("icon-high", "high", "severity_level_high".i18n(), sprintf("error_heading_h1_missing".i18n(), nesting_error.occurrences, examples)));
      } else {
        errors.push(makeTableRow("icon-high", "high", "severity_level_high".i18n(), sprintf("error_heading_nesting".i18n(), nesting_error.occurrences, examples, nesting_error.previous_level)));
      }
    }
  }

  if (page_data.headings.empty_errors) {
    errors.push(makeTableRow("icon-high", "high", "severity_level_high".i18n(), sprintf("error_heading_empty".i18n(), page_data.headings.empty_errors)));
  }

  if (isObjPropEmpty(page_data.metas.general, "robots")) {
    const indexing_status = page_data.metas.general.robots;

    if (indexing_status && indexing_status.includes("noindex")) {
      errors.push(makeTableRow("icon-high", "high", "severity_level_high".i18n(), sprintf("error_blocked_robotstxt".i18n(), page_data.url)));
    }
  } else if (isObjPropEmpty(page_data.metas.general, "googlebot")) {
    const indexing_status = page_data.metas.general.googlebot;

    if (indexing_status && indexing_status.includes("noindex")) {
      errors.push(makeTableRow("icon-high", "high", "severity_level_high".i18n(), sprintf("error_blocked_robotstxt".i18n(), page_data.url)));
    }
  }

  if (!page_data.links.canonical) {
    errors.push(makeTableRow("icon-critical", "critical", "severity_level_critical".i18n(), "error_missing_canonical_tag".i18n()));
  }

  if (!page_data.robots_txt_exists) {
    errors.push(makeTableRow("icon-high", "high", "severity_level_high".i18n(), "error_robots_txt_missing".i18n()));
  }

  if (page_data.robots_txt_sitemaps.length > 0) {
    const aria_label_new_window = "text_opens_in_new_window".i18n();
    const total_sitemaps = page_data.robots_txt_sitemaps.length;
    const sitemap_urls = page_data.robots_txt_sitemaps.map(url => `<a href="${url}" target="_blank" aria-label="${url} ${aria_label_new_window}">${url}</a>`).join(", ");

    errors.push(makeTableRow("icon-info", "info", "severity_level_info".i18n(), sprintf("info_robots_txt_sitemaps".i18n(), total_sitemaps, sitemap_urls)));
  }

  const x_robots_tag = page_headers.find(item => item.name.toLowerCase() === "x-robots-tag")?.value ?? null;

  if (x_robots_tag) {
    errors.push(makeTableRow("icon-info", "info", "severity_level_info".i18n(), "info_x_robots_tag".i18n()));
  }

  const alt_svc = page_headers.find(item => item.name.toLowerCase() === "alt-svc")?.value ?? null;

  if (alt_svc) {
    errors.push(makeTableRow("icon-info", "info", "severity_level_info".i18n(), "info_alt_svc".i18n()));
  }

  const x_ua_compatible = page_headers.find(item => item.name.toLowerCase() === "x-ua-compatible")?.value ?? null;

  if (x_ua_compatible) {
    errors.push(makeTableRow("icon-info", "info", "severity_level_info".i18n(), "info_x_ua_compatible".i18n()));
  }

  const strict_transport_security = page_headers.find(item => item.name.toLowerCase() === "strict-transport-security")?.value ?? null;

  if (strict_transport_security) {
    errors.push(makeTableRow("icon-info", "info", "severity_level_info".i18n(), "info_strict_transport_security".i18n()));
  } else if (page_headers.length > 0 && !strict_transport_security) {
    errors.push(makeTableRow("icon-high", "high", "severity_level_high".i18n(), "error_strict_transport_security".i18n()));
  }

  const referrer_policy = page_headers.find(item => item.name.toLowerCase() === "referrer-policy")?.value ?? null;

  if (referrer_policy) {
    errors.push(makeTableRow("icon-info", "info", "severity_level_info".i18n(), "info_referrer_policy".i18n()));
  } else if (page_headers.length > 0 && !referrer_policy) {
    errors.push(makeTableRow("icon-high", "high", "severity_level_high".i18n(), "error_referrer_policy".i18n()));
  }

  const x_content_type_options = page_headers.find(item => item.name.toLowerCase() === "x-content-type-options")?.value ?? null;

  if (x_content_type_options) {
    errors.push(makeTableRow("icon-info", "info", "severity_level_info".i18n(), "info_x_content_type_options".i18n()));
  } else if (page_headers.length > 0 && !x_content_type_options) {
    errors.push(makeTableRow("icon-high", "high", "severity_level_high".i18n(), "error_x_content_type_options".i18n()));
  }

  const x_xss_protection = page_headers.find(item => item.name.toLowerCase() === "x-xss-protection")?.value ?? null;

  if (x_xss_protection) {
    errors.push(makeTableRow("icon-info", "info", "severity_level_info".i18n(), "info_x_xss_protection".i18n()));
  } else if (page_headers.length > 0 && !x_xss_protection) {
    errors.push(makeTableRow("icon-high", "high", "severity_level_high".i18n(), "error_x_xss_protection".i18n()));
  }

  const x_frame_options = page_headers.find(item => item.name.toLowerCase() === "x-frame-options")?.value ?? null;

  if (x_frame_options) {
    errors.push(makeTableRow("icon-info", "info", "severity_level_info".i18n(), "info_x_frame_options".i18n()));
  } else if (page_headers.length > 0 && !x_frame_options) {
    errors.push(makeTableRow("icon-high", "high", "severity_level_high".i18n(), "error_x_frame_options".i18n()));
  }

  const content_security_policy = page_headers.find(item => item.name.toLowerCase() === "content-security-policy")?.value ?? null;

  if (content_security_policy) {
    errors.push(makeTableRow("icon-info", "info", "severity_level_info".i18n(), "info_content_security_policy".i18n()));
  } else if (page_headers.length > 0 && !content_security_policy) {
    errors.push(makeTableRow("icon-high", "high", "severity_level_high".i18n(), "error_content_security_policy".i18n()));
  }

  if (page_data.images.modern_image_formats.length > 0 && page_data.images.legacy_image_formats.length > 0) {
    errors.push(makeTableRow(
      "icon-high",
      "high",
      "severity_level_high".i18n(),
      sprintf("error_mixed_image_formats".i18n(), page_data.images.modern_image_formats.join(", "), page_data.images.legacy_image_formats.join(", "))
    ));
  } else if (page_data.images.modern_image_formats.length > 0) {
    errors.push(makeTableRow(
      "icon-info",
      "info",
      "severity_level_info".i18n(),
      sprintf("info_modern_image_formats".i18n(), page_data.images.modern_image_formats.join(", "))
    ));
  } else if (page_data.images.legacy_image_formats.length > 0) {
    errors.push(makeTableRow(
      "icon-high",
      "high",
      "severity_level_high".i18n(),
      sprintf("error_legacy_image_formats".i18n(), page_data.images.legacy_image_formats.join(", "))
    ));
  }

  if (errors.length === 0) {
    errors.push(ml("tr", null,
      ml("td", { "class": "x-center", "colspan": "2" }, "warning_no_data_to_display".i18n()),
    ));
  }

  overview_panel.appendChild(ml("table", null,
    ml("thead", null,
      ml("tr", null,
        ml("th", null, "table_heading_severity".i18n()),
        ml("th", null, "table_heading_desc".i18n())
      )
    ),
    ml("tbody", null, ...errors)
  ));

  overview_panel.appendChild(ml("p", { "class": "btn-container" },
    ml("a", { "class": "primary-btn", "target": "_blank", "href": "https://validator.w3.org/nu/?doc=" + encodeURIComponent(page_data.url) }, "btn_open_in_w3c_html_validator".i18n(),
      makeIcon("icon-new-window", "text_opens_in_new_window".i18n(), ICON_SMALL_WIDTH, ICON_SMALL_HEIGHT)
    ),
    ml("a", { "class": "primary-btn", "target": "_blank", "href": "https://pagespeed.web.dev/analysis?url=" + encodeURIComponent(page_data.url) }, "btn_open_in_pagespeed_insights".i18n(),
      makeIcon("icon-new-window", "text_opens_in_new_window".i18n(), ICON_SMALL_WIDTH, ICON_SMALL_HEIGHT)
    )
  ));
  //#endregion


  //#region  Headings tab content
  headings_panel.appendChild(ml("p", null, "txt_headings_desc".i18n()));

  headings_panel.appendChild(ml("section", { "class": "box-group" },
    ml("div", { "class": "box" },
      makeIcon("icon-analytic", "heading_h1".i18n(), ICON_MEDIUM_WIDTH, ICON_MEDIUM_HEIGHT),
      ml("span", { "class": "label" }, "heading_h1".i18n()),
      ml("span", { "class": "value" }, page_data.headings.heading_stats.h1.formatNumber())
    ),
    ml("div", { "class": "box" },
      makeIcon("icon-analytic", "heading_h2".i18n(), ICON_MEDIUM_WIDTH, ICON_MEDIUM_HEIGHT),
      ml("span", { "class": "label" }, "heading_h2".i18n()),
      ml("span", { "class": "value" }, page_data.headings.heading_stats.h2.formatNumber())
    ),
    ml("div", { "class": "box" },
      makeIcon("icon-analytic", "heading_h3".i18n(), ICON_MEDIUM_WIDTH, ICON_MEDIUM_HEIGHT),
      ml("span", { "class": "label" }, "heading_h3".i18n()),
      ml("span", { "class": "value" }, page_data.headings.heading_stats.h3.formatNumber())
    ),
    ml("div", { "class": "box" },
      makeIcon("icon-analytic", "heading_h4".i18n(), ICON_MEDIUM_WIDTH, ICON_MEDIUM_HEIGHT),
      ml("span", { "class": "label" }, "heading_h4".i18n()),
      ml("span", { "class": "value" }, page_data.headings.heading_stats.h4.formatNumber())
    ),
    ml("div", { "class": "box" },
      makeIcon("icon-analytic", "heading_h5".i18n(), ICON_MEDIUM_WIDTH, ICON_MEDIUM_HEIGHT),
      ml("span", { "class": "label" }, "heading_h5".i18n()),
      ml("span", { "class": "value" }, page_data.headings.heading_stats.h5.formatNumber())
    ),
    ml("div", { "class": "box" },
      makeIcon("icon-analytic", "heading_h6".i18n(), ICON_MEDIUM_WIDTH, ICON_MEDIUM_HEIGHT),
      ml("span", { "class": "label" }, "heading_h6".i18n()),
      ml("span", { "class": "value" }, page_data.headings.heading_stats.h6.formatNumber())
    ),
  ));

  if (page_data.headings.tree.length > 0) {
    headings_panel.appendChild(ml("ul", { "class": "tree" }, ...buildHeadingTree(page_data.headings.tree)));
  }
  //#endregion


  //#region Images tab content
  images_panel.appendChild(ml("p", null, "txt_images_desc".i18n()));

  images_panel.appendChild(ml("section", { "class": "box-group" },
    ml("div", { "class": "box" },
      makeIcon("icon-analytic", "txt_total_images".i18n(), ICON_MEDIUM_WIDTH, ICON_MEDIUM_HEIGHT),
      ml("span", { "class": "label" }, "txt_total_images".i18n()),
      ml("span", { "class": "value" }, page_data.images.total_images.formatNumber())
    ),
    ml("div", { "class": "box" },
      makeIcon("icon-analytic", "txt_images_without_alt".i18n(), ICON_MEDIUM_WIDTH, ICON_MEDIUM_HEIGHT),
      ml("span", { "class": "label" }, "txt_images_without_alt".i18n()),
      ml("span", { "class": "value" }, page_data.images.images_without_alt.formatNumber())
    ),
  ));


  //#region Images sub tabs
  images_panel.appendChild(ml("div", { "role": "tablist", "class": "tablist" },
    ml("button", { "class": "tab-btn", "id": "tab-all-images", "type": "button", "role": "tab", "aria-selected": "true", "aria-controls": "tabpanel-all-images", "title": "tab_all_images".i18n() },
      "tab_all_images".i18n()
    ),
    ml("button", { "class": "tab-btn", "id": "tab-images-without-alt", "type": "button", "role": "tab", "aria-controls": "tabpanel-images-without-alt", "title": "tab_images_without_alt".i18n() },
      "tab_images_without_alt".i18n()
    )
  ));
  //#endregion


  if (page_data.images.all_image_list.length > 0) {
    const all_images_panel = ml("div", { "class": "tabpanel", "id": "tabpanel-all-images", "role": "tabpanel", "tabindex": "0", "aria-labelledby": "tab-all-images" });

    const all_image_list = [];

    for (const key in page_data.images.all_image_list) {
      if (Object.prototype.hasOwnProperty.call(page_data.images.all_image_list, key)) {
        const image_src = page_data.images.all_image_list[key];

        all_image_list.push(ml("tr", null,
          ml("td", { "class": "x-center" }, ml("img", { "src": image_src.url, "alt": image_src.alt, "class": "img-preview" })),
          ml("td", null, document.createTextNode(image_src.alt)), // Security fix
          ml("td", { "class": "break-anywhere" }, image_src.url)
        ));
      }
    }

    all_images_panel.appendChild(ml("table", null,
      ml("thead", null,
        ml("tr", null,
          ml("th", { "style": "width: 20%" }, "table_heading_preview".i18n()),
          ml("th", { "style": "width: 30%" }, "table_heading_alt".i18n()),
          ml("th", null, "table_heading_url".i18n())
        )
      ),
      ml("tbody", null, ...all_image_list)
    ));

    images_panel.appendChild(all_images_panel);
  }


  if (page_data.images.images_without_alt > 0) {
    const images_without_alt_panel = ml("div", { "class": "tabpanel", "id": "tabpanel-images-without-alt", "role": "tabpanel", "tabindex": "0", "aria-labelledby": "tab-images-without-alt" });

    const image_list_without_alt = [];

    for (const key in page_data.images.images_list_without_alt) {
      if (Object.prototype.hasOwnProperty.call(page_data.images.images_list_without_alt, key)) {
        const image_src = page_data.images.images_list_without_alt[key];

        image_list_without_alt.push(ml("tr", null,
          ml("td", { "class": "x-center" }, ml("img", { "src": image_src.url, "alt": "", "class": "img-preview" })),
          ml("td", { "class": "break-anywhere" },
            image_src.url,
            ml("button", { "class": "btn-locate", "data-locate-id": `img-${image_src.counter}`, "title": "btn_locate_element".i18n() },
              makeIcon("icon-locate", null, ICON_SMALL_WIDTH, ICON_SMALL_HEIGHT)
            )
          )
        ));
      }
    }

    images_without_alt_panel.appendChild(ml("table", null,
      ml("thead", null,
        ml("tr", null,
          ml("th", { "style": "width: 20%" }, "table_heading_preview".i18n()),
          ml("th", null, "table_heading_url".i18n())
        )
      ),
      ml("tbody", null, ...image_list_without_alt)
    ));

    images_panel.appendChild(images_without_alt_panel);
  }


  new TabsAutomatic(images_panel.querySelector("[role=tablist]"));
  //#endregion


  //#region Links tab content
  links_panel.appendChild(ml("p", null, "txt_links_desc".i18n())); // Tab description

  //#region Links tab info boxes
  links_panel.appendChild(ml("section", { "class": "box-group" },
    ml("div", { "class": "box" },
      makeIcon("icon-analytic", "txt_total_internal_links".i18n(), ICON_MEDIUM_WIDTH, ICON_MEDIUM_HEIGHT),
      ml("span", { "class": "label" }, "txt_total_internal_links".i18n()),
      ml("span", { "class": "value" }, page_data.hyperlinks.total_internal.formatNumber())
    ),
    ml("div", { "class": "box" },
      makeIcon("icon-analytic", "txt_total_external_links".i18n(), ICON_MEDIUM_WIDTH, ICON_MEDIUM_HEIGHT),
      ml("span", { "class": "label" }, "txt_total_external_links".i18n()),
      ml("span", { "class": "value" }, page_data.hyperlinks.total_external.formatNumber())
    ),
  ));
  //#endregion


  //#region Link sub tabs
  links_panel.appendChild(ml("div", { "role": "tablist", "class": "tablist" },
    ml("button", { "class": "tab-btn", "id": "tab-internal-link", "type": "button", "role": "tab", "aria-selected": "true", "aria-controls": "tabpanel-internal-link", "title": "tab_btn_label_internal_links".i18n() },
      "tab_btn_label_internal_links".i18n()
    ),
    ml("button", { "class": "tab-btn", "id": "tab-external-link", "type": "button", "role": "tab", "aria-controls": "tabpanel-external-link", "title": "tab_btn_label_external_links".i18n() },
      "tab_btn_label_external_links".i18n()
    ),
    ml("button", { "class": "tab-btn", "id": "tab-external-resource", "type": "button", "role": "tab", "aria-controls": "tabpanel-external-resource", "title": "tab_btn_label_external_resource".i18n() },
      "tab_btn_label_external_resource".i18n()
    )
  ));
  //#endregion


  //#region Internal links
  if (page_data.hyperlinks.total_internal > 0) {
    const internal_links_panel = ml("div", { "class": "tabpanel", "id": "tabpanel-internal-link", "role": "tabpanel", "tabindex": "0", "aria-labelledby": "tab-internal-link" });

    const internal_links = [];

    for (const key in page_data.hyperlinks.internal_links) {
      if (Object.prototype.hasOwnProperty.call(page_data.hyperlinks.internal_links, key)) {
        const link = page_data.hyperlinks.internal_links[key];
        const rels = link.rel.map(rel => ml("span", { "class": "tag" }, rel));
        const robots_txt_blocked = link.is_blocked ? ml("span", { "class": "tag tag-error" }, "txt_blocked_robotstxt".i18n()) : null;

        let anchor_text;

        if (!link.anchor_text) {
          anchor_text = ml("span", { "class": "tag tag-error" }, "txt_empty_value".i18n());
        } else {
          anchor_text = document.createTextNode(link.anchor_text.truncate(MAX_STRING_LENGTH)); // Security fix
        }

        internal_links.push(
          ml("dt", { "class": "break-anywhere" }, link.url),
          ml("dd", { "class": "break-anywhere" }, anchor_text, robots_txt_blocked,
            ml("button", { "class": "btn-locate", "data-locate-id": `link-${link.counter}`, "title": "btn_locate_element".i18n() },
              makeIcon("icon-locate", null, ICON_SMALL_WIDTH, ICON_SMALL_HEIGHT)
            ),
            ...rels
          ),
        );
      }
    }

    internal_links_panel.appendChild(ml("dl", { "class": "col-list" }, ...internal_links));

    links_panel.appendChild(internal_links_panel);
  }
  //#endregion


  //#region External link
  if (page_data.hyperlinks.total_external > 0) {
    const external_links_panel = ml("div", { "class": "tabpanel", "id": "tabpanel-external-link", "role": "tabpanel", "tabindex": "0", "aria-labelledby": "tab-external-link" });

    const external_links = [];

    for (const key in page_data.hyperlinks.external_links) {
      if (Object.prototype.hasOwnProperty.call(page_data.hyperlinks.external_links, key)) {
        const link = page_data.hyperlinks.external_links[key];
        const rels = link.rel.map(rel => ml("span", { "class": "tag" }, rel));

        let anchor_text;

        if (!link.anchor_text) {
          anchor_text = ml("span", { "class": "tag tag-error" }, "txt_empty_value".i18n());
        } else {
          anchor_text = document.createTextNode(link.anchor_text.truncate(MAX_STRING_LENGTH)); // Security fix
        }

        external_links.push(
          ml("dt", { "class": "break-anywhere" }, link.url),
          ml("dd", { "class": "break-anywhere" }, anchor_text,
            ml("button", { "class": "btn-locate", "data-locate-id": `link-${link.counter}`, "title": "btn_locate_element".i18n() },
              makeIcon("icon-locate", null, ICON_SMALL_WIDTH, ICON_SMALL_HEIGHT)
            ),
            ...rels
          ),
        );
      }
    }

    external_links_panel.appendChild(ml("dl", { "class": "col-list" }, ...external_links));

    links_panel.appendChild(external_links_panel);
  }
  //#endregion


  //#region External resource
  let external_resouce_counter = 0;
  const external_resource_panel = ml("div", { "class": "tabpanel", "id": "tabpanel-external-resource", "role": "tabpanel", "tabindex": "0", "aria-labelledby": "tab-external-resource" });

  if (!isObjEmpty(page_data.links.alternate)) {
    external_resouce_counter++;
    const alternate_resource_links = [];

    for (const key in page_data.links.alternate) {
      if (Object.prototype.hasOwnProperty.call(page_data.links.alternate, key)) {
        const language_resource = page_data.links.alternate[key];

        alternate_resource_links.push(
          ml("dt", { "class": "break-anywhere" }, language_resource.name),
          ml("dd", { "class": "break-anywhere" }, language_resource.href ?? ml("span", { "class": "tag tag-error" }, "txt_invalid_url".i18n()),
            ml("span", { "class": "tag" }, language_resource.type ?? "txt_undefined".i18n())
          ),
        );
      }
    }

    external_resource_panel.appendChild(ml("h2", null, "heading_alternate_resource_link".i18n()));
    external_resource_panel.appendChild(ml("dl", { "class": "col-list" }, ...alternate_resource_links));
  }


  if (!isObjEmpty(page_data.links.language)) {
    external_resouce_counter++;
    const language_resource_links = [];

    for (const key in page_data.links.language) {
      if (Object.prototype.hasOwnProperty.call(page_data.links.language, key)) {
        const language_resource = page_data.links.language[key];

        language_resource_links.push(
          ml("dt", { "class": "break-anywhere" }, language_resource.hreflang ?? ml("span", { "class": "tag tag-error" }, "txt_empty_value".i18n())),
          ml("dd", { "class": "break-anywhere" }, language_resource.href ?? ml("span", { "class": "tag tag-error" }, "txt_invalid_url".i18n())),
        );
      }
    }

    external_resource_panel.appendChild(ml("h2", null, "heading_language_resource_link".i18n()));
    external_resource_panel.appendChild(ml("dl", { "class": "col-list" }, ...language_resource_links));
  }

  if (!isObjEmpty(page_data.links.navigation)) {
    external_resouce_counter++;
    const navigation_resource_links = [];

    for (const key in page_data.links.navigation) {
      if (Object.prototype.hasOwnProperty.call(page_data.links.navigation, key)) {
        const navigation_resource = page_data.links.navigation[key];

        navigation_resource_links.push(
          ml("dt", { "class": "break-anywhere" }, navigation_resource.name),
          ml("dd", { "class": "break-anywhere" }, navigation_resource.href ?? ml("span", { "class": "tag tag-error" }, "txt_invalid_url".i18n())),
        );
      }
    }

    external_resource_panel.appendChild(ml("h2", null, "heading_navigation_resource_link".i18n()));
    external_resource_panel.appendChild(ml("dl", { "class": "col-list" }, ...navigation_resource_links));
  }

  if (!isObjEmpty(page_data.links.performance)) {
    external_resouce_counter++;
    const performance_resource_links = [];

    for (const key in page_data.links.performance) {
      if (Object.prototype.hasOwnProperty.call(page_data.links.performance, key)) {
        const performance_resource = page_data.links.performance[key];

        let preload_as = null;

        if (performance_resource.preload_as === false) {
          preload_as = ml("span", { "class": "tag tag-error" }, sprintf("txt_invalid_value".i18n(), "as"));
        } else if (typeof performance_resource.preload_as === "string") {
          preload_as = ml("span", { "class": "tag" }, performance_resource.preload_as);
        }

        performance_resource_links.push(
          ml("dt", { "class": "break-anywhere" }, performance_resource.name),
          ml("dd", { "class": "break-anywhere" }, performance_resource.href ?? ml("span", { "class": "tag tag-error" }, "txt_invalid_url".i18n()),
            preload_as
          )
        );
      }
    }

    external_resource_panel.appendChild(ml("h2", null, "heading_performance_resource_link".i18n()));
    external_resource_panel.appendChild(ml("dl", { "class": "col-list" }, ...performance_resource_links));
  }

  if (!isObjEmpty(page_data.links.icons)) {
    external_resouce_counter++;
    const icon_resource_links = [];

    for (const key in page_data.links.icons) {
      if (Object.prototype.hasOwnProperty.call(page_data.links.icons, key)) {
        const icon_resource = page_data.links.icons[key];

        icon_resource_links.push(
          ml("dt", { "class": "break-anywhere" }, icon_resource.name),
          ml("dd", { "class": "break-anywhere" }, icon_resource.href ?? ml("span", { "class": "tag tag-error" }, "txt_invalid_url".i18n()),
            ml("span", { "class": "tag" }, icon_resource.type ?? "txt_undefined".i18n()),
            ml("span", { "class": "tag" }, icon_resource.sizes ?? "text_icon_size_any".i18n()),
          )
        );
      }
    }

    external_resource_panel.appendChild(ml("h2", null, "heading_icon_resource_link".i18n()));
    external_resource_panel.appendChild(ml("dl", { "class": "col-list" }, ...icon_resource_links));
  }

  if (!isObjEmpty(page_data.links.stylesheet)) {
    external_resouce_counter++;
    const stylesheet_resource_links = [];

    for (const key in page_data.links.stylesheet) {
      if (Object.prototype.hasOwnProperty.call(page_data.links.stylesheet, key)) {
        const stylesheet_resource = page_data.links.stylesheet[key];
        const medias = stylesheet_resource.media.map(media => ml("span", { "class": "tag" }, media));
        const title = stylesheet_resource.title ? ml("span", { "class": "tag" }, stylesheet_resource.title) : null;

        stylesheet_resource_links.push(
          ml("li", null, stylesheet_resource.href ?? ml("span", { "class": "tag tag-error" }, "txt_invalid_url".i18n()),
            title,
            ...medias
          )
        );
      }
    }

    external_resource_panel.appendChild(ml("h2", null, "heading_stylesheet_resource_link".i18n()));
    external_resource_panel.appendChild(ml("ul", { "class": "row-list" }, ...stylesheet_resource_links));
  }

  if (external_resouce_counter > 0) {
    links_panel.appendChild(external_resource_panel);
  }

  new TabsAutomatic(links_panel.querySelector("[role=tablist]"));
  //#endregion


  //#region Meta tab content
  metas_panel.appendChild(ml("p", null, "txt_meta_desc".i18n()));

  let meta_counter = 0;

  if (!isObjEmpty(page_data.metas.facebook)) {
    meta_counter++;

    makeDescriptionList(metas_panel, "heading_facebook_meta".i18n(), page_data.metas.facebook);

    metas_panel.appendChild(ml("p", { "class": "btn-container" },
      ml("a", { "class": "primary-btn", "target": "_blank", "href": "https://developers.facebook.com/tools/debug/?q=" + encodeURIComponent(page_data.url) }, "btn_open_in_facebook_sharing_debugger".i18n(),
        makeIcon("icon-new-window", "text_opens_in_new_window".i18n(), ICON_SMALL_WIDTH, ICON_SMALL_HEIGHT)
      ),
      ml("a", { "class": "primary-btn", "target": "_blank", "href": "https://www.linkedin.com/post-inspector/inspect/" + encodeURIComponent(page_data.url) }, "btn_open_in_linkedin_post_inspector".i18n(),
        makeIcon("icon-new-window", "text_opens_in_new_window".i18n(), ICON_SMALL_WIDTH, ICON_SMALL_HEIGHT)
      )
    ));
  }

  if (!isObjEmpty(page_data.metas.twitter)) {
    meta_counter++;

    makeDescriptionList(metas_panel, "heading_twitter_meta".i18n(), page_data.metas.twitter);
  }

  if (!isObjEmpty(page_data.metas.dublin_core)) {
    meta_counter++;

    makeDescriptionList(metas_panel, "heading_dublin_core_meta".i18n(), page_data.metas.dublin_core);
  }

  if (!isObjEmpty(page_data.metas.general)) {
    meta_counter++;

    makeDescriptionList(metas_panel, "heading_general_meta".i18n(), page_data.metas.general);
  }

  if (meta_counter === 0) {
    metas_panel.appendChild(ml("p", { "class": "warning" }, "warning_no_meta_tags".i18n(),
      makeIcon("icon-warning", null, ICON_NORMAL_WIDTH, ICON_NORMAL_HEIGHT)
    ))
  }
  //#endregion


  //#region Rich Snippet tab content
  rich_snippets_panel.appendChild(ml("p", null, "txt_rich_snippets_desc".i18n()));

  if (!isObjEmpty(page_data.rich_snippets)) {
    for (const main_key in page_data.rich_snippets) {
      if (Object.prototype.hasOwnProperty.call(page_data.rich_snippets, main_key)) {
        const rich_snippet = page_data.rich_snippets[main_key];

        const rich_snippets = [];

        for (const sub_key in rich_snippet) {
          if (Object.prototype.hasOwnProperty.call(rich_snippet, sub_key)) {
            const row = rich_snippet[sub_key];

            rich_snippets.push(
              ml("tr", null,
                ml("th", { "class": "x-left" }, row.key),
                ml("td", null, row.value ?? ml("span", { "class": "tag tag-error" }, "txt_empty_value".i18n())),
              )
            );
          }
        }

        rich_snippets_panel.appendChild(ml("h2", null, ("heading_rich_snippet_" + main_key).i18n()));

        rich_snippets_panel.appendChild(ml("table", null,
          ml("thead", null,
            ml("tr", null,
              ml("th", null, "table_heading_key".i18n()),
              ml("th", null, "table_heading_value".i18n())
            )
          ),
          ml("tbody", null, ...rich_snippets)
        ));
      }
    }

    rich_snippets_panel.appendChild(ml("p", { "class": "btn-container" },
      ml("a", { "class": "primary-btn", "target": "_blank", "href": "https://search.google.com/test/rich-results?url=" + encodeURIComponent(page_data.url) }, "btn_open_in_rich_results_test".i18n(),
        makeIcon("icon-new-window", "text_opens_in_new_window".i18n(), ICON_SMALL_WIDTH, ICON_SMALL_HEIGHT)
      ),
      ml("a", { "class": "primary-btn", "target": "_blank", "href": "https://validator.schema.org/#url=" + encodeURIComponent(page_data.url) }, "btn_open_in_schema_markup_validator".i18n(),
        makeIcon("icon-new-window", "text_opens_in_new_window".i18n(), ICON_SMALL_WIDTH, ICON_SMALL_HEIGHT)
      )
    ));
  } else {
    rich_snippets_panel.appendChild(ml("p", { "class": "warning" }, "warning_no_rich_snippets".i18n(),
      makeIcon("icon-warning", null, ICON_NORMAL_WIDTH, ICON_NORMAL_HEIGHT)))
  }
  //#endregion


  const locate_btns = document.querySelectorAll(".btn-locate");

  for (const button of locate_btns) {
    button.addEventListener("click", async () => {
      await chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const locate_id = button.getAttribute("data-locate-id");

        if (tabs[0]?.id) {
          await chrome.tabs.sendMessage(tabs[0]?.id, { action: "highlightElement", locate_id: locate_id });
        }
      });
    }, false);
  }

}

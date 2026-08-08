"use strict";

//#region Constants
const LIMITS = Object.freeze({
  PREVIEW_STRING: 155,
  TITLE_MIN: 40,
  TITLE_MAX: 80,
  DESC_MIN: 70,
  DESC_MAX: 155,
  BOX_CHAR: 15,
  DECIMALS: 2,
  SITEMAP_DISPLAY: 4
});

const ICON_SIZE = Object.freeze({
  SMALL: 16,
  NORMAL: 24,
  MEDIUM: 32
});

const TOAS_TIMEOUT = Object.freeze({
  SHORT: 1500,
  LONG: 2000
});

const ML_ON_PREFIX_LENGTH = 2;

const SANITIZE_BLOCKED_TAGS = new Set([
  "script", "style", "iframe", "object", "embed", "link", "meta",
  "base", "form", "frame", "frameset", "svg", "math"
]);

// Attributes that can carry a URL and therefore need scheme validation,
// whether they arrive from parsed HTML strings (sanitizeHtml) or from
// props passed straight into ml() (e.g. ml("a", { href: someUrl }, ...)).
// Previously only the former path was checked, so any href/src set
// directly via ml() bypassed validation entirely (e.g. sitemap URLs
// pulled from robots.txt, or image URLs from the scanned page).
const SANITIZE_URL_ATTRS = new Set(["href", "src", "action", "formaction", "xlink:href"]);

// img/src can safely carry data: URIs (they're rendered as pixels, never
// executed); anchors/forms should not, since a data: URL can host an
// HTML document. Keep the two allow-lists separate rather than one
// permissive set.
const ALLOWED_IMAGE_PROTOCOLS = new Set(["http:", "https:", "data:"]);
const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

const ICONS = Object.freeze({
  CRITICAL: "icon-critical",
  WARNING: "icon-warning",
  HIGH: "icon-high",
  INFO: "icon-info",
  OVERVIEW: "icon-overview",
  HEADINGS: "icon-heading",
  IMAGES: "icon-image",
  LINKS: "icon-link",
  RICH_SNIPPETS: "icon-rich-snippet",
  METAS: "icon-meta",
  LOCATE: "icon-locate",
  VERTICAL_DOTS: "icon-more-vertical",
  ROBOT: "icon-robot",
  LOCALE: "icon-locale",
  ANALYTIC: "icon-analytic",
  NEW_WINDOW: "icon-new-window"
});

const SEVERITY = Object.freeze({
  CRITICAL: { color: "critical", icon: ICONS.CRITICAL, labelKey: "severity_level_critical" },
  HIGH: { color: "high", icon: ICONS.HIGH, labelKey: "severity_level_high" },
  INFO: { color: "info", icon: ICONS.INFO, labelKey: "severity_level_info" }
});

// Security/response headers where presence is good news and absence is
// worth flagging as an error.
const SECURITY_HEADER_CHECKS = [
  { name: "strict-transport-security", infoKey: "info_strict_transport_security", errorKey: "error_strict_transport_security" },
  { name: "referrer-policy", infoKey: "info_referrer_policy", errorKey: "error_referrer_policy" },
  { name: "x-content-type-options", infoKey: "info_x_content_type_options", errorKey: "error_x_content_type_options" },
  { name: "x-xss-protection", infoKey: "info_x_xss_protection", errorKey: "error_x_xss_protection" },
  { name: "x-frame-options", infoKey: "info_x_frame_options", errorKey: "error_x_frame_options" },
  { name: "content-security-policy", infoKey: "info_content_security_policy", errorKey: "error_content_security_policy" }
];

// Headers that are only ever informational — presence gets a note, absence is silent.
const INFO_ONLY_HEADER_CHECKS = [
  { name: "x-robots-tag", infoKey: "info_x_robots_tag" },
  { name: "alt-svc", infoKey: "info_alt_svc" },
  { name: "x-ua-compatible", infoKey: "info_x_ua_compatible" }
];

const MAIN_TABS = [
  { id: "tab-overview", panel: "tabpanel-overview", labelKey: "tab_btn_label_overview", icon: ICONS.OVERVIEW },
  { id: "tab-headings", panel: "tabpanel-headings", labelKey: "tab_btn_label_headings", icon: ICONS.HEADINGS },
  { id: "tab-images", panel: "tabpanel-images", labelKey: "tab_btn_label_images", icon: ICONS.IMAGES },
  { id: "tab-links", panel: "tabpanel-links", labelKey: "tab_btn_label_links", icon: ICONS.LINKS },
  { id: "tab-rich-snippets", panel: "tabpanel-rich-snippets", labelKey: "tab_btn_label_rich_snippets", icon: ICONS.RICH_SNIPPETS },
  { id: "tab-metas", panel: "tabpanel-metas", labelKey: "tab_btn_label_metas", icon: ICONS.METAS }
];

const IMAGE_SUB_TABS = [
  { id: "tab-all-images", panel: "tabpanel-all-images", labelKey: "tab_all_images", selected: true },
  { id: "tab-images-without-alt", panel: "tabpanel-images-without-alt", labelKey: "tab_images_without_alt" }
];

const LINK_SUB_TABS = [
  { id: "tab-internal-link", panel: "tabpanel-internal-link", labelKey: "tab_btn_label_internal_links", selected: true },
  { id: "tab-external-link", panel: "tabpanel-external-link", labelKey: "tab_btn_label_external_links" },
  { id: "tab-external-resource", panel: "tabpanel-external-resource", labelKey: "tab_btn_label_external_resource" }
];
//#endregion


//#region DOM Manipulation
function ml(tagName, props, ...children) {
  const el = document.createElement(tagName);

  if (props) {
    for (const [name, value] of Object.entries(props)) {
      setProp(el, name, value);
    }
  }

  for (const child of children) {
    appendChildren(el, child);
  }

  return el;
}

function setProp(el, name, value) {
  // Skip rather than stringify — otherwise a missing alt/title ends up
  // as the literal attribute value "undefined" or "null".
  if (value === null || typeof value === "undefined") {
    return;
  }

  if (name.startsWith("on")) {
    el.addEventListener(name.slice(ML_ON_PREFIX_LENGTH).toLowerCase(), value, false);
    return;
  }

  if (name === "className" && Array.isArray(value)) {
    el.classList.add(...value);
    return;
  }

  const attrName = name === "className" ? "class" : name;
  const lowerAttrName = attrName.toLowerCase();

  if (SANITIZE_URL_ATTRS.has(lowerAttrName) && !isSafeUrlAttrValue(lowerAttrName, value)) {
    return;
  }

  el.setAttribute(attrName, value);
}

function appendChildren(el, child) {
  if (child === null || typeof child === "undefined") {
    return;
  }

  if (typeof child === "string") {
    el.appendChild(sanitizeHtml(child));
  } else if (Array.isArray(child)) {
    for (const nestedChild of child) {
      appendChildren(el, nestedChild);
    }
  } else if (child instanceof Node) {
    el.appendChild(child);
  }
}

const sanitizeDomParser = new DOMParser();

function sanitizeHtml(html) {
  const parsedHtml = sanitizeDomParser.parseFromString(String(html), "text/html");

  if (!parsedHtml.body || !parsedHtml.body.childNodes.length) {
    return document.createTextNode(html);
  }

  sanitizeNodeTree(parsedHtml.body);

  const fragment = document.createDocumentFragment();

  for (const node of Array.from(parsedHtml.body.childNodes)) {
    fragment.appendChild(node);
  }

  return fragment;
}

function sanitizeNodeTree(root) {
  const toRemove = [];

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      if (SANITIZE_BLOCKED_TAGS.has(node.tagName.toLowerCase())) {
        toRemove.push(node);
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let node = walker.nextNode();

  while (node) {
    sanitizeAttributes(node);
    node = walker.nextNode();
  }

  for (const el of toRemove) {
    el.remove();
  }
}

function sanitizeAttributes(node) {
  for (let i = node.attributes.length - 1; i >= 0; i--) {
    const attr = node.attributes[i];
    const attrName = attr.name.toLowerCase();

    if (attrName.startsWith("on")) {
      node.removeAttribute(attr.name);
    } else if (SANITIZE_URL_ATTRS.has(attrName) && !isSafeUrlAttrValue(attrName, attr.value)) {
      node.removeAttribute(attr.name);
    }
  }
}

function isSafeUrlAttrValue(attrName, value) {
  try {
    // In opaque origins (data:, about:blank, sandboxed frames),
    // window.location.origin is the string "null". Use document.baseURI
    // to get the parent document's URL as a fallback base.
    const base = window.location.origin === "null"
      ? (document.baseURI || window.location.href)
      : window.location.origin;

    const parsed = new URL(String(value), base);
    const allowed = attrName === "src" ? ALLOWED_IMAGE_PROTOCOLS : ALLOWED_LINK_PROTOCOLS;

    return allowed.has(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Shows a temporary toast notification (bubble).
 * @param {string} message - The text to display.
 * @param {number} duration - How long to show it (ms).
 * @param {HTMLElement} container - Container to append the toast (default: document.body).
 */
function showToast(message, duration = TOAS_TIMEOUT.LONG, container = document.body) {
  // Remove any existing toast to avoid stacking
  const existing = container.querySelector(".toast-message");
  if (existing) {
    existing.remove();
  }

  const toast = ml("div", { class: "toast-message" },
    ml("span", { class: "toast-message-message" }, message)
  );
  container.appendChild(toast);

  // Auto‑dismiss
  setTimeout(() => {
    toast.remove();
  }, duration);
}

function copyTableFromPanel(panelId, copyAsMarkdown = false) {
  const panel = document.getElementById(panelId);
  if (!panel) {
    return;
  }

  const table = panel.querySelector("table");
  if (!table) {
    return;
  }

  const content = copyAsMarkdown
    ? tableToMarkdown(table)
    : tableToPlainText(table);

  navigator.clipboard.writeText(content)
    .then(() => {
      showToast("success_copy".i18n(), TOAS_TIMEOUT.SHORT);
    })
    .catch(() => {
      showToast("error_copy_failed".i18n(), TOAS_TIMEOUT.LONG);
    });
}

// ---- Plain Text (tab-separated) ----
function tableToPlainText(tableElement) {
  const rows = Array.from(tableElement.querySelectorAll("tr"));
  return rows.map(row => {
    const cells = Array.from(row.querySelectorAll("th, td"));
    return cells.map(cell => {
      const img = cell.querySelector("img");
      if (img) {
        // Output just the src URL (alt is not used)
        return img.getAttribute("src") || "";
      }
      return cell.textContent.trim();
    }).join("\t");
  }).join("\n");
}

// ---- Markdown (with image support) ----
function tableToMarkdown(tableElement) {
  const rows = Array.from(tableElement.querySelectorAll("tr"));
  if (rows.length === 0) {
    return "";
  }

  const tableData = rows.map(row => {
    const cells = Array.from(row.querySelectorAll("th, td"));
    return cells.map(cell => {
      const img = cell.querySelector("img");
      if (img) {
        const src = img.getAttribute("src") || "";
        const alt = img.getAttribute("alt") || "";
        return alt ? `![${alt}](${src})` : `![](${src})`;
      }
      return cell.textContent.trim();
    });
  });

  const numCols = tableData[0]?.length || 0;
  if (numCols === 0) {
    return "";
  }

  let markdown = "";
  // Header
  markdown += "| " + tableData[0].join(" | ") + " |\n";
  // Separator
  markdown += "| " + Array(numCols).fill("---").join(" | ") + " |\n";
  // Body
  for (let i = 1; i < tableData.length; i++) {
    const row = tableData[i];
    while (row.length < numCols) {
      row.push("");
    }
    markdown += "| " + row.join(" | ") + " |\n";
  }
  return markdown;
}
//#endregion


//#region Prototype helpers
String.prototype.truncate = function (maxLength) {
  return this.length >= maxLength ? this.slice(0, maxLength) + "..." : this.toString();
};

String.prototype.i18n = function (substitutions = "") {
  return chrome.i18n.getMessage(this.toString(), substitutions) || this.toString();
};

Number.prototype.formatNumber = function (decimalPlaces = 0) {
  return new Intl.NumberFormat(navigator.language, {
    maximumFractionDigits: decimalPlaces,
    minimumFractionDigits: decimalPlaces
  }).format(this);
};
//#endregion


//#region General helpers
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  return tab;
}

function setButtonState(buttons, isEnabled = false) {
  if (typeof buttons !== "object") {
    return;
  }

  for (const button of buttons) {
    button.disabled = !isEnabled;
    button.classList.toggle("disabled", !isEnabled);
  }
}

// Number.prototype.formatNumber assumes a real number; this keeps every
// stats box safe against a field that's missing from page_data.
function num(value) {
  return value ?? 0;
}

const ICON_CACHE = Object.create(null);

function makeIcon(icon_name, icon_title, width, height) {
  const key = `${icon_name}-${icon_title}-${width}-${height}`;

  let icon = ICON_CACHE[key];

  if (!icon) {
    icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
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

    ICON_CACHE[key] = icon;
  }

  return icon.cloneNode(true);
}

// Small "value or placeholder tag" helpers, used anywhere page data might
// legitimately be missing. Checks null/undefined/"" explicitly (rather than
// a bare truthy check) so a real value of 0 or false isn't shown as empty.
function emptyValueTag() {
  return ml("span", { "class": "tag tag-error" }, "txt_empty_value".i18n());
}

function invalidUrlTag() {
  return ml("span", { "class": "tag tag-error" }, "txt_invalid_url".i18n());
}

function textOrTag(value, tagFn, truncateLength) {
  if (value === null || typeof value === "undefined" || value === "") {
    return tagFn();
  }

  return truncateLength ? String(value).truncate(truncateLength) : String(value);
}

// A "box" is the icon + label + value tile repeated across every tab's
// summary section (overview stats, heading counts, image counts, link
// counts). `dense` mirrors the original behaviour where robots_meta/language
// values get a smaller-text class once they exceed LIMITS.BOX_CHAR.
function makeBox(iconName, labelKey, rawValue, { dense = false } = {}) {
  const label = labelKey.i18n();
  const value = rawValue ?? "txt_undefined".i18n();
  const isDense = dense && typeof value === "string" && value.length > LIMITS.BOX_CHAR;

  return ml("div", { "class": "box" },
    makeIcon(iconName, label, ICON_SIZE.MEDIUM, ICON_SIZE.MEDIUM),
    ml("span", { "class": "label" }, label),
    ml("span", { "class": "value" + (isDense ? " dense" : "") }, value)
  );
}

function makeTableRow(icon_filename, severity_color, severity_level, text) {
  return ml("tr", null,
    ml("th", { "class": "x-left severity-level-" + severity_color }, severity_level, makeIcon(icon_filename, null, ICON_SIZE.SMALL, ICON_SIZE.SMALL)),
    ml("td", null, text),
  );
}

// Bundles the (icon, color, label) triple that always travels together
// per severity level, so call sites only ever supply the message.
function pushError(list, severity, text) {
  list.push(makeTableRow(severity.icon, severity.color, severity.labelKey.i18n(), text));
}

function makeDescriptionList(panel, heading, data) {
  const rows = [];

  for (const [key, value] of Object.entries(data)) {
    rows.push(
      ml("dt", { "class": "break-anywhere" }, key), // Never empty
      ml("dd", { "class": "break-anywhere" }, textOrTag(value, emptyValueTag)),
    );
  }

  panel.appendChild(ml("h2", null, heading));
  panel.appendChild(ml("dl", { "class": "col-list" }, ...rows));
}

function buildHeadingTree(structure) {
  if (!structure || structure.length === 0) {
    return [];
  }

  const result = [];

  for (const { tag_name, text, counter, children } of structure) {
    const safe_text = textOrTag(text, () => ml("span", { "class": "tag tag-error" }, "text_empty_heading".i18n()));

    const listItem = ml("li", null,
      ml("span", { "class": "tree-row" },
        ml(tag_name, { "class": "tree-heading", "data-tag-name": tag_name },
          ml("span", { "class": "tree-heading-text" }, safe_text)
        ),
        ml("button", { "class": "btn-locate", "data-locate-id": `heading-${counter}`, "title": "btn_locate_element".i18n() },
          makeIcon(ICONS.LOCATE, null, ICON_SIZE.SMALL, ICON_SIZE.SMALL)
        )
      )
    );

    if (children && children.length > 0) {
      listItem.appendChild(ml("ul", null, ...buildHeadingTree(children)));
    }

    result.push(listItem);
  }

  return result;
}

function findHeaderValue(headers, name) {
  return headers.find(header => header.name.toLowerCase() === name)?.value ?? null;
}

// Tabs / tab panels
function makeTabButton({ id, panel, labelKey, icon, disabled = false, selected = false }) {
  const label = labelKey.i18n();
  const props = {
    "class": "tab-btn",
    "id": id,
    "type": "button",
    "role": "tab",
    "aria-controls": panel,
    "title": label
  };

  if (disabled) {
    props.disabled = "";
  }

  if (selected) {
    props["aria-selected"] = "true";
  }

  return ml("button", props, label, icon ? makeIcon(icon, label, ICON_SIZE.SMALL, ICON_SIZE.SMALL) : null);
}

function makeTabPanel(id, labelledby) {
  return ml("div", { "class": "tabpanel", "id": id, "role": "tabpanel", "tabindex": "0", "aria-labelledby": labelledby });
}

function makeTabList(tabs) {
  return ml("div", { "role": "tablist", "class": "tablist" }, ...tabs.map(makeTabButton));
}

function makeCopyTableButton(image_panel) {
  return ml("div", { "class": "btn-container" },
    ml("button", {
      "class": "primary-btn", "data-target-id": image_panel, "onclick": function () {
        copyTableFromPanel(this.dataset.targetId, true);
      }
    }, "btn_copy".i18n())
  )
}

function enableTabs() {
  const tablists = document.querySelectorAll("[role=tablist]");
  for (const tablist of tablists) {
    new TabsAutomatic(tablist);
  }
}
//#endregion


const content = document.querySelector("#content");


//#region Popup UI
content.appendChild(makeTabList(MAIN_TABS.map(tab => ({ ...tab, disabled: true }))));

const panelsById = Object.fromEntries(
  MAIN_TABS.map(tab => [tab.panel, makeTabPanel(tab.panel, tab.id)])
);

for (const panel of Object.values(panelsById)) {
  content.appendChild(panel);
}

const overview_panel = panelsById["tabpanel-overview"];
const headings_panel = panelsById["tabpanel-headings"];
const images_panel = panelsById["tabpanel-images"];
const links_panel = panelsById["tabpanel-links"];
const rich_snippets_panel = panelsById["tabpanel-rich-snippets"];
const metas_panel = panelsById["tabpanel-metas"];

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
  ml("picture", { "class": "footer-logo" },
    ml("source", { "type": "image/svg+xml", "media": "(prefers-color-scheme: light)", "srcset": "/icons/playful-sparkle-logo-light.svg" }),
    ml("source", { "type": "image/svg+xml", "media": "(prefers-color-scheme: dark)", "srcset": "/icons/playful-sparkle-logo-dark.svg" }),
    ml("img", { "src": "/icons/playful-sparkle-logo-light.svg", "alt": "extension_name".i18n(), "loading": "eager", "decoding": "async", "width": 172, "height": 24 }),
  )
);

content.appendChild(footer);
//#endregion


//#region Loaded state change
chrome.runtime.onMessage.addListener(async message => {
  if (message.tabId && message.status) {
    const tab = await getCurrentTab();

    if (message.tabId === tab.id && message.status === "complete") {
      await showPopupContent(tab);
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


//#region Section builders (each renders into an already-attached panel)
function renderSeoPreview(page_data) {
  if (!page_data.success || !page_data.seo_preview || typeof page_data.seo_preview !== "object") {
    return;
  }

  const preview_title = page_data.seo_preview.title ?? "txt_undefined".i18n();
  const description = page_data.seo_preview.description ?? "";

  overview_panel.appendChild(ml("div", { "class": "preview" },
    ml("span", { "class": "logo-container" },
      ml("img", { "class": "logo", "src": page_data.seo_preview.favicon, "alt": preview_title, "width": ICON_SIZE.MEDIUM, "height": ICON_SIZE.MEDIUM })
    ),
    ml("span", { "class": "subtitle", "aria-hidden": "true" }, preview_title),
    ml("cite", { "class": "breadcrumb", "aria-hidden": "true" },
      page_data.seo_preview.breadcrumb,
      makeIcon(ICONS.VERTICAL_DOTS, null, ICON_SIZE.SMALL, ICON_SIZE.SMALL)
    ),
    ml("h3", { "class": "title" }, preview_title),
    ml("p", { "class": "desc" }, description.truncate(LIMITS.PREVIEW_STRING))
  ));
}

function renderOverviewBoxes(page_data) {
  const stats = page_data.seo_stats;

  overview_panel.appendChild(ml("section", { "class": "box-group" },
    makeBox(ICONS.ROBOT, "txt_robots_meta", page_data.robots_meta, { dense: true }),
    makeBox(ICONS.LOCALE, "txt_language", page_data.language, { dense: true }),
    makeBox(ICONS.ANALYTIC, "txt_word_count", num(stats.word_count).formatNumber()),
    makeBox(ICONS.ANALYTIC, "txt_character_count", num(stats.character_count).formatNumber()),
    makeBox(ICONS.ANALYTIC, "txt_sentence_count", num(stats.sentence_count).formatNumber()),
    makeBox(ICONS.ANALYTIC, "txt_avg_word_length", num(stats.avg_word_length).formatNumber(LIMITS.DECIMALS)),
    makeBox(ICONS.ANALYTIC, "txt_avg_sentence_length", num(stats.avg_sentence_length).formatNumber(LIMITS.DECIMALS)),
  ));
}

function buildTitleErrors(page_data, errors) {
  const title = page_data.title ?? "";

  if (title.length === 0) {
    pushError(errors, SEVERITY.HIGH, "error_empty_page_title".i18n());
  } else if (title.length < LIMITS.TITLE_MIN) {
    pushError(errors, SEVERITY.HIGH, sprintf("error_short_page_title".i18n(), title.length));
  } else if (title.length > LIMITS.TITLE_MAX) {
    pushError(errors, SEVERITY.HIGH, sprintf("error_long_page_title".i18n(), title.length));
  }
}

function buildMetaDescriptionErrors(page_data, errors) {
  const description = page_data.meta_elements.general?.description;

  if (typeof description === "undefined") {
    pushError(errors, SEVERITY.HIGH, "error_empty_meta_description".i18n());
  } else if (description.length < LIMITS.DESC_MIN) {
    pushError(errors, SEVERITY.HIGH, sprintf("error_short_meta_description".i18n(), description.length));
  } else if (description.length > LIMITS.DESC_MAX) {
    pushError(errors, SEVERITY.HIGH, sprintf("error_long_meta_description".i18n(), description.length));
  }
}

function buildHeadingErrors(page_data, errors) {
  const headingElements = page_data.heading_elements;

  for (const nestingError of Object.values(headingElements.nesting_errors)) {
    const examples = nestingError.examples
      .map(example => example.heading_text ? `${example.tag_name} (${example.heading_text})` : example.tag_name)
      .join(", ");

    if (nestingError.previous_level === 0) {
      const hasH1 = num(headingElements.heading_stats.h1) > 0;
      const key = hasH1 ? "error_heading_h1_order" : "error_heading_h1_missing";
      pushError(errors, SEVERITY.HIGH, sprintf(key.i18n(), nestingError.occurrences, examples));
    } else {
      pushError(errors, SEVERITY.HIGH, sprintf("error_heading_nesting".i18n(), nestingError.occurrences, examples, nestingError.previous_level));
    }
  }

  if (headingElements.empty_errors) {
    pushError(errors, SEVERITY.HIGH, sprintf("error_heading_empty".i18n(), headingElements.empty_errors));
  }
}

function buildIndexingErrors(page_data, errors) {
  const generalMeta = page_data.meta_elements.general;
  // robots takes priority; fall back to googlebot only when robots is
  // genuinely absent (not just present-but-empty).
  const indexingDirective = generalMeta.robots ?? generalMeta.googlebot ?? null;

  if (indexingDirective && indexingDirective.indexOf("noindex") !== -1) {
    pushError(errors, SEVERITY.HIGH, sprintf("error_blocked_robotstxt".i18n(), page_data.url));
  }
}

function buildLanguageErrors(page_data, errors) {
  if ((page_data.language ?? "").length === 0) {
    pushError(errors, SEVERITY.HIGH, "error_empty_page_language".i18n());
  }
}

function buildCanonicalAndRobotsTxtErrors(page_data, errors) {
  if (!page_data.link_elements.canonical) {
    pushError(errors, SEVERITY.CRITICAL, "error_missing_canonical_tag".i18n());
  }

  if (!page_data.robots_txt_exists) {
    pushError(errors, SEVERITY.HIGH, "error_robots_txt_missing".i18n());
  }

  const sitemaps = page_data.robots_txt_sitemaps ?? [];

  if (sitemaps.length > 0) {
    const displaySitemaps = sitemaps.slice(0, LIMITS.SITEMAP_DISPLAY);

    const sitemapNodes = displaySitemaps.map(url => ml("a", {
      href: url,
      target: "_blank",
      rel: "noopener noreferrer",
      class: "break-anywhere",
      "aria-label": `${url} ${"text_opens_in_new_window".i18n()}`
    }, url));

    if (sitemaps.length > LIMITS.SITEMAP_DISPLAY) {
      sitemapNodes.push(" ...");
    }

    errors.push(ml("tr", null,
      ml("th", { "class": "x-left severity-level-info" },
        SEVERITY.INFO.labelKey.i18n(),
        makeIcon(SEVERITY.INFO.icon, null, ICON_SIZE.SMALL, ICON_SIZE.SMALL)
      ),
      ml("td", null, sprintf("info_robots_txt_sitemaps".i18n(), sitemaps.length), ...sitemapNodes)
    ));
  }
}

function buildHeaderErrors(page_headers, errors) {
  if (page_headers.length === 0) {
    pushError(errors, SEVERITY.INFO, "info_refresh_tab_headers".i18n());
    return;
  }

  for (const check of INFO_ONLY_HEADER_CHECKS) {
    if (findHeaderValue(page_headers, check.name)) {
      pushError(errors, SEVERITY.INFO, check.infoKey.i18n());
    }
  }

  for (const check of SECURITY_HEADER_CHECKS) {
    if (findHeaderValue(page_headers, check.name)) {
      pushError(errors, SEVERITY.INFO, check.infoKey.i18n());
    } else {
      pushError(errors, SEVERITY.HIGH, check.errorKey.i18n());
    }
  }
}

function buildImageFormatErrors(page_data, errors) {
  const { modern_image_formats = [], legacy_image_formats = [] } = page_data.image_elements;

  if (modern_image_formats.length > 0 && legacy_image_formats.length > 0) {
    pushError(errors, SEVERITY.HIGH, sprintf("error_mixed_image_formats".i18n(), modern_image_formats.join(", "), legacy_image_formats.join(", ")));
  } else if (modern_image_formats.length > 0) {
    pushError(errors, SEVERITY.INFO, sprintf("info_modern_image_formats".i18n(), modern_image_formats.join(", ")));
  } else if (legacy_image_formats.length > 0) {
    pushError(errors, SEVERITY.HIGH, sprintf("error_legacy_image_formats".i18n(), legacy_image_formats.join(", ")));
  }
}

function renderErrorLog(page_data, page_headers) {
  const errors = [];

  buildTitleErrors(page_data, errors);
  buildMetaDescriptionErrors(page_data, errors);
  buildLanguageErrors(page_data, errors);
  buildHeadingErrors(page_data, errors);
  buildIndexingErrors(page_data, errors);
  buildCanonicalAndRobotsTxtErrors(page_data, errors);
  buildHeaderErrors(page_headers, errors);
  buildImageFormatErrors(page_data, errors);

  if (errors.length === 0) {
    errors.push(ml("tr", null,
      ml("td", { "class": "x-center", "colspan": "2" }, "warning_no_data_to_display".i18n()),
    ));
  }

  overview_panel.appendChild(ml("div", { "class": "table-scroll" },
    ml("table", null,
      ml("thead", null,
        ml("tr", null,
          ml("th", null, "table_heading_severity".i18n()),
          ml("th", null, "table_heading_desc".i18n())
        )
      ),
      ml("tbody", null, ...errors)
    )
  ));

  overview_panel.appendChild(ml("div", { "class": "btn-container" },
    ml("a", { "class": "primary-btn", "target": "_blank", "href": "https://validator.w3.org/nu/?doc=" + encodeURIComponent(page_data.url) }, "btn_open_in_w3c_html_validator".i18n(),
      makeIcon(ICONS.NEW_WINDOW, "text_opens_in_new_window".i18n(), ICON_SIZE.SMALL, ICON_SIZE.SMALL)
    ),
    ml("a", { "class": "primary-btn", "target": "_blank", "href": "https://pagespeed.web.dev/analysis?url=" + encodeURIComponent(page_data.url) }, "btn_open_in_pagespeed_insights".i18n(),
      makeIcon(ICONS.NEW_WINDOW, "text_opens_in_new_window".i18n(), ICON_SIZE.SMALL, ICON_SIZE.SMALL)
    )
  ));
}

function renderHeadingsTab(page_data) {
  const stats = page_data.heading_elements.heading_stats;

  headings_panel.appendChild(ml("p", null, "txt_headings_desc".i18n()));

  headings_panel.appendChild(ml("section", { "class": "box-group" },
    makeBox(ICONS.ANALYTIC, "heading_h1", num(stats.h1).formatNumber()),
    makeBox(ICONS.ANALYTIC, "heading_h2", num(stats.h2).formatNumber()),
    makeBox(ICONS.ANALYTIC, "heading_h3", num(stats.h3).formatNumber()),
    makeBox(ICONS.ANALYTIC, "heading_h4", num(stats.h4).formatNumber()),
    makeBox(ICONS.ANALYTIC, "heading_h5", num(stats.h5).formatNumber()),
    makeBox(ICONS.ANALYTIC, "heading_h6", num(stats.h6).formatNumber()),
  ));

  const tree = page_data.heading_elements.tree;

  if (tree.length > 0) {
    headings_panel.appendChild(
      ml("div", { "class": "tree" },
        ml("ul", null,
          ...buildHeadingTree(tree)
        )
      )
    );
  }
}

function renderImagesTab(page_data) {
  const imageElements = page_data.image_elements;

  images_panel.appendChild(ml("p", null, "txt_images_desc".i18n()));

  images_panel.appendChild(ml("section", { "class": "box-group" },
    makeBox(ICONS.ANALYTIC, "txt_total_images", num(imageElements.total_images).formatNumber()),
    makeBox(ICONS.ANALYTIC, "txt_images_without_alt", num(imageElements.images_without_alt).formatNumber()),
  ));

  images_panel.appendChild(makeTabList(IMAGE_SUB_TABS));

  const allImages = imageElements.all_image_list;

  if (allImages.length > 0) {
    const all_images_panel = makeTabPanel("tabpanel-all-images", "tab-all-images");

    all_images_panel.appendChild(makeCopyTableButton("tabpanel-all-images"));

    const rows = allImages.map(image_src => ml("tr", null,
      ml("td", { "class": "x-center" }, ml("img", { "src": image_src.url, "alt": image_src.alt, "class": "img-preview" })),
      ml("td", null, textOrTag(image_src.alt, emptyValueTag)),
      ml("td", { "class": "break-anywhere" }, image_src.url)
    ));

    all_images_panel.appendChild(ml("div", { "class": "table-scroll" },
      ml("table", null,
        ml("thead", null,
          ml("tr", null,
            ml("th", { "style": "width: 20%" }, "table_heading_preview".i18n()),
            ml("th", { "style": "width: 30%" }, "table_heading_alt".i18n()),
            ml("th", null, "table_heading_url".i18n())
          )
        ),
        ml("tbody", null, ...rows)
      )
    ));

    images_panel.appendChild(all_images_panel);
  }

  const imagesWithoutAlt = imageElements.images_list_without_alt;

  if (num(imageElements.images_without_alt) > 0 && imagesWithoutAlt.length > 0) {
    const images_without_alt_panel = makeTabPanel("tabpanel-images-without-alt", "tab-images-without-alt");

    images_without_alt_panel.appendChild(makeCopyTableButton("tabpanel-images-without-alt"));

    const rows = imagesWithoutAlt.map(image_src => ml("tr", null,
      ml("td", { "class": "x-center" }, ml("img", { "src": image_src.url, "alt": "", "class": "img-preview" })),
      ml("td", { "class": "break-anywhere" },
        image_src.url,
        ml("button", { "class": "btn-locate", "data-locate-id": `img-${image_src.counter}`, "title": "btn_locate_element".i18n() },
          makeIcon(ICONS.LOCATE, null, ICON_SIZE.SMALL, ICON_SIZE.SMALL)
        )
      )
    ));

    images_without_alt_panel.appendChild(ml("div", { "class": "table-scroll" },
      ml("table", null,
        ml("thead", null,
          ml("tr", null,
            ml("th", { "style": "width: 20%" }, "table_heading_preview".i18n()),
            ml("th", null, "table_heading_url".i18n())
          )
        ),
        ml("tbody", null, ...rows)
      )
    ));

    images_panel.appendChild(images_without_alt_panel);
  }
}

function renderLinkListPanel(id, labelledby, linksByKey) {
  const panel = makeTabPanel(id, labelledby);
  const rows = [];

  for (const link of linksByKey) {
    const rels = link.rel.map(rel => ml("span", { "class": "tag" }, rel));
    const robots_txt_blocked = link.is_blocked ? ml("span", { "class": "tag tag-error" }, "txt_blocked_robotstxt".i18n()) : null;

    rows.push(
      ml("dt", { "class": "break-anywhere" }, link.url),
      ml("dd", { "class": "break-anywhere" },
        textOrTag(link.anchor_text, emptyValueTag, LIMITS.PREVIEW_STRING),
        robots_txt_blocked,
        ...rels,
        ml("button", { "class": "btn-locate", "data-locate-id": `link-${link.counter}`, "title": "btn_locate_element".i18n() },
          makeIcon(ICONS.LOCATE, null, ICON_SIZE.SMALL, ICON_SIZE.SMALL)
        )
      ),
    );
  }

  panel.appendChild(ml("dl", { "class": "col-list" }, ...rows));

  return panel;
}

function preloadAsTag(preloadAs) {
  if (preloadAs === false) {
    return ml("span", { "class": "tag tag-error" }, sprintf("txt_invalid_value".i18n(), "as"));
  }

  if (typeof preloadAs === "string") {
    return ml("span", { "class": "tag" }, preloadAs);
  }

  return null;
}

// Each external-resource category shares the same dt/dd shape with a
// couple of extra tags; `extra` supplies those per category instead of
// duplicating the whole loop six times.
function renderResourceSection(panel, headingKey, items, extra) {
  if (items.length === 0) {
    return false;
  }

  const rows = items.flatMap(item => [
    ml("dt", { "class": "break-anywhere" }, item.name ?? item.hreflang ?? ""),
    ml("dd", { "class": "break-anywhere" }, textOrTag(item.href, invalidUrlTag), ...extra(item))
  ]);

  panel.appendChild(ml("h2", null, headingKey.i18n()));
  panel.appendChild(ml("dl", { "class": "col-list" }, ...rows));

  return true;
}

function renderLinksTab(page_data) {
  const linkStats = page_data.hyperlink_stats;
  const linkElements = page_data.link_elements;

  links_panel.appendChild(ml("p", null, "txt_links_desc".i18n()));

  links_panel.appendChild(ml("section", { "class": "box-group" },
    makeBox(ICONS.ANALYTIC, "txt_total_internal_links", num(linkStats.total_internal).formatNumber()),
    makeBox(ICONS.ANALYTIC, "txt_total_external_links", num(linkStats.total_external).formatNumber()),
  ));

  links_panel.appendChild(makeTabList(LINK_SUB_TABS));

  if (num(linkStats.total_internal) > 0) {
    links_panel.appendChild(renderLinkListPanel("tabpanel-internal-link", "tab-internal-link", linkStats.internal_links));
  }

  if (num(linkStats.total_external) > 0) {
    links_panel.appendChild(renderLinkListPanel("tabpanel-external-link", "tab-external-link", linkStats.external_links));
  }

  const external_resource_panel = makeTabPanel("tabpanel-external-resource", "tab-external-resource");
  let hasExternalResources = false;

  if (linkElements.alternate.length > 0) {
    hasExternalResources = renderResourceSection(external_resource_panel, "heading_alternate_resource_link", linkElements.alternate,
      item => [ml("span", { "class": "tag" }, item.type ?? "txt_undefined".i18n())]) || hasExternalResources;
  }

  if (linkElements.language.length > 0) {
    hasExternalResources = renderResourceSection(external_resource_panel, "heading_language_resource_link", linkElements.language,
      () => []) || hasExternalResources;
  }

  if (linkElements.navigation.length > 0) {
    hasExternalResources = renderResourceSection(external_resource_panel, "heading_navigation_resource_link", linkElements.navigation,
      () => []) || hasExternalResources;
  }

  if (linkElements.performance.length > 0) {
    hasExternalResources = renderResourceSection(external_resource_panel, "heading_performance_resource_link", linkElements.performance,
      item => [preloadAsTag(item.preload_as)]) || hasExternalResources;
  }

  if (linkElements.icons.length > 0) {
    hasExternalResources = renderResourceSection(external_resource_panel, "heading_icon_resource_link", linkElements.icons,
      item => [
        ml("span", { "class": "tag" }, item.type ?? "txt_undefined".i18n()),
        ml("span", { "class": "tag" }, item.sizes ?? "text_icon_size_any".i18n()),
      ]) || hasExternalResources;
  }

  const stylesheets = linkElements.stylesheet;

  if (stylesheets.length > 0) {
    hasExternalResources = true;

    const rows = stylesheets.map(stylesheet => {
      const medias = stylesheet.media.map(media => ml("span", { "class": "tag" }, media));
      const title = stylesheet.title ? ml("span", { "class": "tag" }, stylesheet.title) : null;

      return ml("li", null, textOrTag(stylesheet.href, invalidUrlTag), title, ...medias);
    });

    external_resource_panel.appendChild(ml("h2", null, "heading_stylesheet_resource_link".i18n()));
    external_resource_panel.appendChild(ml("ul", { "class": "row-list" }, ...rows));
  }

  if (hasExternalResources) {
    links_panel.appendChild(external_resource_panel);
  }
}

function renderMetasTab(page_data) {
  const metaElements = page_data.meta_elements;

  metas_panel.appendChild(ml("p", null, "txt_meta_desc".i18n()));

  let meta_counter = 0;

  if (Object.keys(metaElements.general).length > 0) {
    meta_counter++;
    makeDescriptionList(metas_panel, "heading_general_meta".i18n(), metaElements.general);
  }

  if (Object.keys(metaElements.dublin_core).length > 0) {
    meta_counter++;
    makeDescriptionList(metas_panel, "heading_dublin_core_meta".i18n(), metaElements.dublin_core);
  }

  if (Object.keys(metaElements.facebook).length > 0) {
    meta_counter++;

    makeDescriptionList(metas_panel, "heading_facebook_meta".i18n(), metaElements.facebook);

    metas_panel.appendChild(ml("div", { "class": "btn-container" },
      ml("a", { "class": "primary-btn", "target": "_blank", "href": "https://developers.facebook.com/tools/debug/?q=" + encodeURIComponent(page_data.url) }, "btn_open_in_facebook_sharing_debugger".i18n(),
        makeIcon(ICONS.NEW_WINDOW, "text_opens_in_new_window".i18n(), ICON_SIZE.SMALL, ICON_SIZE.SMALL)
      ),
      ml("a", { "class": "primary-btn", "target": "_blank", "href": "https://www.linkedin.com/post-inspector/inspect/" + encodeURIComponent(page_data.url) }, "btn_open_in_linkedin_post_inspector".i18n(),
        makeIcon(ICONS.NEW_WINDOW, "text_opens_in_new_window".i18n(), ICON_SIZE.SMALL, ICON_SIZE.SMALL)
      )
    ));
  }

  if (Object.keys(metaElements.twitter).length > 0) {
    meta_counter++;
    makeDescriptionList(metas_panel, "heading_twitter_meta".i18n(), metaElements.twitter);
  }

  if (meta_counter === 0) {
    metas_panel.appendChild(ml("p", { "class": "warning" }, "warning_no_meta_tags".i18n(),
      makeIcon(ICONS.WARNING, null, ICON_SIZE.NORMAL, ICON_SIZE.NORMAL)
    ));
  }
}

function renderRichSnippetsTab(page_data) {
  rich_snippets_panel.appendChild(ml("p", null, "txt_rich_snippets_desc".i18n()));

  const richSnippets = page_data.rich_snippets ?? {};
  const groups = Object.entries(richSnippets);

  if (groups.length === 0) {
    rich_snippets_panel.appendChild(ml("p", { "class": "warning" }, "warning_no_rich_snippets".i18n(),
      makeIcon(ICONS.WARNING, null, ICON_SIZE.NORMAL, ICON_SIZE.NORMAL)));
    return;
  }

  for (const [groupKey, group] of groups) {
    const rows = Object.values(group).map(row => ml("tr", null,
      ml("th", { "class": "x-left" }, row.key),
      ml("td", null, textOrTag(row.value, emptyValueTag)),
    ));

    rich_snippets_panel.appendChild(ml("h2", null, ("heading_rich_snippet_" + groupKey).i18n()));

    rich_snippets_panel.appendChild(ml("div", { "class": "table-scroll" },
      ml("table", null,
        ml("thead", null,
          ml("tr", null,
            ml("th", null, "table_heading_key".i18n()),
            ml("th", null, "table_heading_value".i18n())
          )
        ),
        ml("tbody", null, ...rows)
      )
    ));
  }

  rich_snippets_panel.appendChild(ml("div", { "class": "btn-container" },
    ml("a", { "class": "primary-btn", "target": "_blank", "href": "https://search.google.com/test/rich-results?url=" + encodeURIComponent(page_data.url) }, "btn_open_in_rich_results_test".i18n(),
      makeIcon(ICONS.NEW_WINDOW, "text_opens_in_new_window".i18n(), ICON_SIZE.SMALL, ICON_SIZE.SMALL)
    ),
    ml("a", { "class": "primary-btn", "target": "_blank", "href": "https://validator.schema.org/#url=" + encodeURIComponent(page_data.url) }, "btn_open_in_schema_markup_validator".i18n(),
      makeIcon(ICONS.NEW_WINDOW, "text_opens_in_new_window".i18n(), ICON_SIZE.SMALL, ICON_SIZE.SMALL)
    )
  ));
}

function wireLocateButtons() {
  for (const button of document.querySelectorAll(".btn-locate")) {
    button.addEventListener("click", async () => {
      const locate_id = button.getAttribute("data-locate-id");

      try {
        const current_tab = await getCurrentTab();

        if (!current_tab?.id) {
          return;
        }

        // Send message and await response
        const response = await chrome.tabs.sendMessage(current_tab.id, {
          action: "highlightElement",
          locate_id
        });

        // Handle response from content script
        if (response && !response.success) {
          showToast("error_highlight_failed".i18n(), TOAS_TIMEOUT.LONG);
        }
      } catch { /* */ }
    }, false);
  }
}
//#endregion


async function showPopupContent(tab) {
  for (const panel of [overview_panel, headings_panel, images_panel, links_panel, rich_snippets_panel, metas_panel]) {
    panel.textContent = "";
  }

  let page_data = Object.create(null);
  let is_error = false;

  try {
    page_data = await chrome.tabs.sendMessage(tab.id, { "action": "getPageData" });
  } catch {
    is_error = true;
  }

  document.body.classList.remove("loading");

  if (is_error) {
    overview_panel.classList.add("fetch-error");

    overview_panel.appendChild(ml("p", null, "txt_update_error".i18n()));
    overview_panel.appendChild(ml("p", { "class": "btn-container x-center" },
      ml("a", { "class": "primary-btn", "href": "mailto:support@playfulsparkle.com" }, "btn_send_error_report".i18n())
    ));

    enableTabs();
    return;
  }

  let page_headers = [];

  try {
    page_headers = await chrome.runtime.sendMessage({ type: "getHeaders", tabId: tab.id, tabUrl: page_data.url }) ?? [];
  } catch {
    page_headers = [];
  }

  setButtonState(tab_lists_buttons(), !is_error);

  renderSeoPreview(page_data);
  renderOverviewBoxes(page_data);
  renderErrorLog(page_data, page_headers);
  renderHeadingsTab(page_data);
  renderImagesTab(page_data);
  renderLinksTab(page_data);
  renderMetasTab(page_data);
  renderRichSnippetsTab(page_data);

  wireLocateButtons();
  enableTabs();
}

function tab_lists_buttons() {
  return document.querySelectorAll('#content > [role="tablist"] > button[role="tab"]');
}

"use strict";

//#region Constants
/**
 * Various UI limits and thresholds used throughout the popup.
 *
 * The title/description/URL/keyword-density values are Rank Math-style **optimization
 * recommendations**, not Google requirements — Google does not publish a hard character or pixel
 * limit for titles or descriptions. They're used to surface INFO/WARNING-level suggestions, never
 * to claim a page is technically broken.
 *
 * @type {Object}
 * @property {number} PREVIEW_STRING - Maximum length of SEO preview description text.
 * @property {number} TITLE_RECOMMENDED_MIN - Recommended minimum title length, in characters.
 * @property {number} TITLE_RECOMMENDED_MAX - Recommended maximum title length, in characters.
 * @property {number} TITLE_PIXEL_MAX - Recommended maximum rendered title width, in pixels (display-width heuristic).
 * @property {number} DESCRIPTION_RECOMMENDED_MIN - Recommended minimum meta description length, in characters.
 * @property {number} DESCRIPTION_RECOMMENDED_MAX - Recommended maximum meta description length, in characters.
 * @property {number} DESCRIPTION_PIXEL_MAX - Recommended maximum rendered description width, in pixels (display-width heuristic).
 * @property {number} URL_RECOMMENDED_MAX - Recommended maximum URL length, in characters.
 * @property {number} KEYWORD_DENSITY_RECOMMENDED_MIN - Below this, keyword density is under-optimized (percent).
 * @property {number} KEYWORD_DENSITY_RECOMMENDED_MAX - Top of the recommended keyword density band (percent).
 * @property {number} KEYWORD_DENSITY_WARNING_MAX - Above this, keyword density looks like stuffing (percent).
 * @property {number} KEYWORD_CONTENT_START_PERCENT - Recommended cutoff for the keyword's first appearance in content (percent).
 * @property {number} KEYWORD_TITLE_START_PERCENT - Recommended cutoff for the keyword's position within the title (percent).
 * @property {number} BOX_CHAR - Threshold for applying the "dense" class in box stats.
 * @property {number} DECIMALS - Number of decimal places for average values.
 * @property {number} SITEMAP_DISPLAY - Maximum number of sitemap URLs shown before ellipsis.
 */
const LIMITS = Object.freeze({
  PREVIEW_STRING: 160,

  TITLE_RECOMMENDED_MIN: 50,
  TITLE_RECOMMENDED_MAX: 60,
  TITLE_PIXEL_MAX: 580,

  DESCRIPTION_RECOMMENDED_MIN: 50,
  DESCRIPTION_RECOMMENDED_MAX: 160,
  DESCRIPTION_PIXEL_MAX: 920,

  URL_RECOMMENDED_MAX: 75,

  KEYWORD_DENSITY_RECOMMENDED_MIN: 0.5,
  KEYWORD_DENSITY_RECOMMENDED_MAX: 1.5,
  KEYWORD_DENSITY_WARNING_MAX: 2.5,

  KEYWORD_CONTENT_START_PERCENT: 10,
  KEYWORD_TITLE_START_PERCENT: 50,

  BOX_CHAR: 15,
  DECIMALS: 2,
  SITEMAP_DISPLAY: 4
});

/**
 * Icon size constants for SVG icons.
 * @type {Object}
 * @property {number} SMALL - 16px
 * @property {number} NORMAL - 24px
 * @property {number} MEDIUM - 32px
 */
const ICON_SIZE = Object.freeze({
  SMALL: 16,
  NORMAL: 24,
  MEDIUM: 32
});

/**
 * Toast (bubble notification) timeout durations.
 * @type {Object}
 * @property {number} SHORT - 1500ms for quick feedback.
 * @property {number} LONG - 3500ms for errors.
 */
const TOAST_TIMEOUT = Object.freeze({
  SHORT: 1500,
  LONG: 3500
});

/**
 * Length of the "on" prefix in event handler attributes (e.g., "onclick").
 * @type {number}
 */
const ML_ON_PREFIX_LENGTH = 2;

/**
 * Tags that are never allowed to survive HTML sanitisation.
 * @type {Set<string>}
 */
const SANITIZE_BLOCKED_TAGS = new Set([
  "script", "style", "iframe", "object", "embed", "link", "meta",
  "base", "form", "frame", "frameset", "svg", "math"
]);

/**
 * Attributes that carry a URL and must be validated for safe protocols.
 * @type {Set<string>}
 */
const SANITIZE_URL_ATTRS = new Set(["href", "src", "action", "formaction", "xlink:href"]);

/**
 * Allowed protocols for image `src` attributes (including data: URIs).
 * @type {Set<string>}
 */
const ALLOWED_IMAGE_PROTOCOLS = new Set(["http:", "https:", "data:"]);

/**
 * Allowed protocols for link `href` attributes (mailto: is allowed for anchors).
 * @type {Set<string>}
 */
const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * Icon names (CSS class names) used throughout the popup.
 * @type {Object}
 */
const ICONS = Object.freeze({
  CRITICAL: "icon-critical",
  WARNING: "icon-warning",
  HIGH: "icon-high",
  INFO: "icon-info",
  OVERVIEW: "icon-overview",
  HEADINGS: "icon-heading",
  IMAGES: "icon-image",
  LINKS: "icon-link",
  STRUCTURED_DATA: "icon-rich-snippet",
  METAS: "icon-meta",
  LOCATE: "icon-locate",
  VERTICAL_DOTS: "icon-more-vertical",
  ROBOT: "icon-robot",
  LOCALE: "icon-locale",
  ANALYTIC: "icon-analytic",
  NEW_WINDOW: "icon-new-window",
  COPY: "icon-copy"
});

/**
 * Severity levels used in the error table.
 * Each entry defines the CSS color class, icon, and i18n label key.
 * @type {Object}
 */
const SEVERITY = Object.freeze({
  CRITICAL: { color: "critical", icon: ICONS.CRITICAL, labelKey: "severity_level_critical" },
  HIGH: { color: "high", icon: ICONS.HIGH, labelKey: "severity_level_high" },
  WARNING: { color: "warning", icon: ICONS.WARNING, labelKey: "severity_level_warning" },
  INFO: { color: "info", icon: ICONS.INFO, labelKey: "severity_level_info" }
});

/**
 * Modern security/response headers where presence is good and absence is flagged as an error.
 * X-XSS-Protection is intentionally NOT here — it's an obsolete header (superseded by
 * Content-Security-Policy and ignored/removed by current browsers), so its absence is not an
 * error; see `DEPRECATED_HEADER_CHECKS`. Presence isn't required on every site regardless of
 * architecture — these are common best-practice signals, not a universal mandate.
 * @type {Array<{name: string, infoKey: string, errorKey: string}>}
 */
const SECURITY_HEADER_CHECKS = [
  { name: "strict-transport-security", infoKey: "info_strict_transport_security", errorKey: "error_strict_transport_security" },
  { name: "referrer-policy", infoKey: "info_referrer_policy", errorKey: "error_referrer_policy" },
  { name: "x-content-type-options", infoKey: "info_x_content_type_options", errorKey: "error_x_content_type_options" },
  { name: "x-frame-options", infoKey: "info_x_frame_options", errorKey: "error_x_frame_options" },
  { name: "content-security-policy", infoKey: "info_content_security_policy", errorKey: "error_content_security_policy" }
];

/**
 * Headers that are purely informational – presence is noted, absence is ignored.
 * @type {Array<{name: string, infoKey: string}>}
 */
const INFO_ONLY_HEADER_CHECKS = [
  { name: "x-robots-tag", infoKey: "info_x_robots_tag" },
  { name: "alt-svc", infoKey: "info_alt_svc" },
  { name: "x-ua-compatible", infoKey: "info_x_ua_compatible" }
];

/**
 * Headers that are obsolete: presence is noted as informational/deprecated, absence is never an
 * error (modern browsers ignore or have removed support for these).
 * @type {Array<{name: string, infoKey: string}>}
 */
const DEPRECATED_HEADER_CHECKS = [
  { name: "x-xss-protection", infoKey: "info_x_xss_protection_deprecated" }
];

/**
 * Main tab definitions (Overview, Headings, Images, Links, Rich Snippets, Metas).
 * @type {Array<{id: string, panel: string, labelKey: string, icon: string}>}
 */
const MAIN_TABS = [
  { id: "tab-overview", panel: "tabpanel-overview", labelKey: "tab_btn_label_overview", icon: ICONS.OVERVIEW },
  { id: "tab-headings", panel: "tabpanel-headings", labelKey: "tab_btn_label_headings", icon: ICONS.HEADINGS },
  { id: "tab-images", panel: "tabpanel-images", labelKey: "tab_btn_label_images", icon: ICONS.IMAGES },
  { id: "tab-links", panel: "tabpanel-links", labelKey: "tab_btn_label_links", icon: ICONS.LINKS },
  { id: "tab-structured-data", panel: "tabpanel-structured-data", labelKey: "tab_btn_label_structured_data", icon: ICONS.STRUCTURED_DATA },
  { id: "tab-metas", panel: "tabpanel-metas", labelKey: "tab_btn_label_metas", icon: ICONS.METAS }
];

/**
 * Sub‑tabs for the Images tab.
 * @type {Array<{id: string, panel: string, labelKey: string, selected?: boolean}>}
 */
const IMAGE_SUB_TABS = [
  { id: "tab-all-images", panel: "tabpanel-all-images", labelKey: "tab_all_images", selected: true },
  { id: "tab-images-without-alt", panel: "tabpanel-images-without-alt", labelKey: "tab_images_without_alt" }
];

/**
 * Sub‑tabs for the Links tab.
 * @type {Array<{id: string, panel: string, labelKey: string, selected?: boolean}>}
 */
const LINK_SUB_TABS = [
  { id: "tab-internal-link", panel: "tabpanel-internal-link", labelKey: "tab_btn_label_internal_links", selected: true },
  { id: "tab-external-link", panel: "tabpanel-external-link", labelKey: "tab_btn_label_external_links" },
  { id: "tab-external-resource", panel: "tabpanel-external-resource", labelKey: "tab_btn_label_external_resource" }
];
//#endregion


//#region DOM Manipulation

/**
 * Creates a DOM element with properties, event listeners, and children.
 *
 * @param {string} tagName - HTML tag name.
 * @param {Object|null} props - Attributes/properties (prefix "on" for event listeners).
 * @param {...*} children - Child nodes (strings become text, arrays are flattened, Nodes are appended).
 * @returns {HTMLElement} The created element.
 */
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

/**
 * Sets a property/attribute on a DOM element, handling event listeners, className,
 * and URL attribute sanitisation.
 *
 * @param {HTMLElement} el - The target element.
 * @param {string} name - Property/attribute name.
 * @param {*} value - The value to set.
 * @returns {void}
 */
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

  // Validate URL attributes to prevent XSS via javascript: or data: links.
  if (SANITIZE_URL_ATTRS.has(lowerAttrName) && !isSafeUrlAttrValue(lowerAttrName, value)) {
    return;
  }

  el.setAttribute(attrName, value);
}

/**
 * Appends a child to a DOM element, handling strings (sanitised as HTML),
 * arrays (flattened), and Node objects.
 *
 * @param {HTMLElement} el - The parent element.
 * @param {*} child - The child to append.
 * @returns {void}
 */
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

/** @type {DOMParser} – Reused to avoid creating a new instance for every sanitise call. */
const sanitizeDomParser = new DOMParser();

/**
 * Sanitises a string of HTML, stripping dangerous tags and attributes.
 * Returns a DocumentFragment containing the sanitised nodes.
 *
 * @param {string} html - The raw HTML string.
 * @returns {DocumentFragment|Text} A fragment or a text node if no HTML.
 */
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

/**
 * Recursively removes banned elements and sanitises attributes on the remaining nodes.
 * @param {HTMLElement} root - The root element to traverse.
 * @returns {void}
 */
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

/**
 * Removes `on*` event handler attributes and dangerous URL attributes.
 * @param {HTMLElement} node - The element to sanitise.
 * @returns {void}
 */
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

/**
 * Determines if a URL attribute value uses a safe protocol.
 * @param {string} attrName - The attribute name (src, href, etc.).
 * @param {string} value - The attribute value.
 * @returns {boolean} `true` if the URL is safe.
 */
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
//#endregion DOM Manipulation

//#region Save functions

/**
 * Extracts heading tree data from the DOM structure built by `buildHeadingTree`.
 * Recursively traverses `<ul>` elements and builds an array of `{ tag_name, text, children }`.
 *
 * @param {HTMLUListElement} ul - The root `<ul>` element.
 * @returns {Array<{tag_name: string, text: string, children: Array}>} The extracted tree.
 */
function extractTreeFromDOM(ul) {
  const result = [];
  const items = ul.children; // <li> elements

  for (const li of items) {
    const row = li.querySelector('.tree-row');
    if (!row) {
      continue;
    }

    // Find the heading element (h1..h6) inside .tree-row
    const headingEl = row.querySelector('h1, h2, h3, h4, h5, h6');
    if (!headingEl) {
      continue;
    }

    const tag_name = headingEl.tagName.toLowerCase();
    // The text is inside .tree-heading-text
    const textSpan = headingEl.querySelector('.tree-heading-text');
    const text = textSpan ? textSpan.textContent.trim() : '';

    // Find nested <ul> for children
    const childUl = li.querySelector(':scope > ul');
    const children = childUl ? extractTreeFromDOM(childUl) : [];

    result.push({ tag_name, text, children });
  }

  return result;
}

/**
 * Copies the heading tree from a panel (identified by `panelId`) to the clipboard.
 * Uses the panel's `<ul>` and converts to plain text or Markdown.
 *
 * @param {string} panelId - The ID of the panel containing the `<ul>`.
 * @param {boolean} copyAsMarkdown - If `true`, output Markdown; otherwise plain indented text.
 * @returns {void}
 */
function copyTreeFromPanel(panelId, copyAsMarkdown = false) {
  const panel = document.getElementById(panelId);
  if (!panel) {
    return;
  }

  const ul = panel.querySelector('ul');
  if (!ul) {
    return;
  }

  // Extract data from DOM
  const treeData = extractTreeFromDOM(ul);

  // Convert using the existing functions (they expect the array structure)
  const content = copyAsMarkdown
    ? treeToMarkdown(treeData)
    : treeToPlainText(treeData);

  navigator.clipboard.writeText(content)
    .then(() => showToast('success_copy'.i18n(), TOAST_TIMEOUT.SHORT))
    .catch(() => showToast('error_copy_failed'.i18n(), TOAST_TIMEOUT.LONG));
}

/**
 * Converts a heading tree (array) to indented plain text.
 * Each level is indented by 2 spaces.
 *
 * @param {Array} tree - The tree array (from `extractTreeFromDOM` or `page_data.heading_elements.tree`).
 * @param {number} [indent=0] - Current indentation level (used for recursion).
 * @returns {string} The plain text representation.
 */
function treeToPlainText(tree, indent = 0) {
  const indentStr = '  '.repeat(indent);
  let result = '';
  for (const item of tree) {
    const headingLabel = `${item.tag_name}:`;
    const text = (item.text && item.text.trim()) ? item.text : 'text_empty_heading'.i18n();
    result += `${indentStr}${headingLabel} ${text}\n`;
    if (item.children?.length) {
      result += treeToPlainText(item.children, indent + 1);
    }
  }
  return result;
}

/**
 * Converts a heading tree to a Markdown nested list with `-` bullets.
 * Each nesting level adds two spaces.
 *
 * @param {Array} tree - The tree array.
 * @param {number} [depth=0] - Current nesting depth (used for recursion).
 * @returns {string} The Markdown representation.
 */
function treeToMarkdown(tree, depth = 0) {
  const prefix = depth === 0 ? '- ' : '  '.repeat(depth) + '- ';
  let result = '';
  for (const item of tree) {
    const headingLabel = `${item.tag_name}:`;
    const text = (item.text && item.text.trim()) ? item.text : 'text_empty_heading'.i18n();
    result += `${prefix}${headingLabel} ${text}\n`;
    if (item.children?.length) {
      result += treeToMarkdown(item.children, depth + 1);
    }
  }
  return result;
}

/**
 * Copies a table from a panel (identified by `panelId`) to the clipboard.
 * Supports plain text (tab‑separated) or Markdown table format.
 *
 * @param {string} panelId - The ID of the panel containing the table.
 * @param {boolean} copyAsMarkdown - If `true`, output Markdown; otherwise plain text.
 * @returns {void}
 */
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
      showToast("success_copy".i18n(), TOAST_TIMEOUT.SHORT);
    })
    .catch(() => {
      showToast("error_copy_failed".i18n(), TOAST_TIMEOUT.LONG);
    });
}

/**
 * Converts a table element to plain text (tab‑separated values).
 * If a cell contains an `<img>`, the `src` is output instead of text.
 *
 * @param {HTMLTableElement} tableElement - The table to convert.
 * @returns {string} Plain text with rows separated by newlines, cells by tabs.
 */
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

/**
 * Converts a table element to a Markdown table.
 * If a cell contains an `<img>`, it outputs `![alt](src)` or `![]({src})`.
 *
 * @param {HTMLTableElement} tableElement - The table to convert.
 * @returns {string} The Markdown table.
 */
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
//#endregion Save functions


//#region Prototype helpers

/**
 * Truncates a string to a maximum length and appends "…".
 * @param {number} maxLength - The maximum length.
 * @returns {string} The truncated string.
 */
String.prototype.truncate = function (maxLength) {
  return this.length >= maxLength ? this.slice(0, maxLength) + "..." : this.toString();
};

/**
 * Returns the Chrome i18n translation for the current string, or the string itself if not found.
 * @param {string|string[]} [substitutions=""] - Substitutions for placeholders.
 * @returns {string} The translated string.
 */
String.prototype.i18n = function (substitutions = "") {
  return chrome.i18n.getMessage(this.toString(), substitutions) || this.toString();
};

/**
 * Formats a number with locale‑specific thousand separators and decimal places.
 * @param {number} [decimalPlaces=0] - Number of decimal places.
 * @returns {string} The formatted number.
 */
Number.prototype.formatNumber = function (decimalPlaces = 0) {
  return new Intl.NumberFormat(navigator.language, {
    maximumFractionDigits: decimalPlaces,
    minimumFractionDigits: decimalPlaces
  }).format(this);
};

/**
 * Retrieves a setting from chrome.storage.local.
 * @param {string} offset - The key to retrieve.
 * @param {*} [default_value=null] - The default value if the key is not found.
 * @returns {Promise<*>} The stored value or the default value.
 */
async function getSetting(offset, default_value = null) {
  try {
    const result = await chrome.storage.local.get(offset);

    return result[offset] ?? default_value;
  } catch {
    return default_value;
  }
}
//#endregion


//#region General helpers
/**
 * Shows a temporary toast notification (bubble) at the bottom of the popup.
 *
 * @param {string} message - The text to display. Always rendered as plain
 *   text (never parsed as HTML), regardless of content.
 * @param {number} duration - How long to show it (ms).
 * @param {HTMLElement} [container=document.body] - Container to append the toast.
 * @returns {void}
 */
function showToast(message, duration = TOAST_TIMEOUT.LONG, container = document.body) {
  // Clear any pending auto-dismiss.
  if (showToast._timeoutId) {
    clearTimeout(showToast._timeoutId);
    showToast._timeoutId = null;
  }

  // Remove any existing toast immediately.
  const existing = container.querySelector(".toast");
  if (existing) {
    existing.remove();
  }

  const messageEl = ml(
    "span",
    {
      "class": "toast-text",
      "title": "text_click_to_dismiss".i18n()
    },
    document.createTextNode(String(message))
  );

  const toast = ml(
    "div",
    {
      "class": "toast",
      "role": "status",
      "aria-live": "polite"
    },
    messageEl
  );

  let dismissing = false;

  const dismiss = () => {
    if (dismissing) {
      return;
    }

    dismissing = true;

    if (showToast._timeoutId) {
      clearTimeout(showToast._timeoutId);
      showToast._timeoutId = null;
    }

    toast.classList.add("is-dismissing");

    toast.addEventListener(
      "transitionend",
      (event) => {
        if (event.propertyName === "opacity") {
          toast.remove();
        }
      },
      { once: true }
    );
  };

  messageEl.addEventListener("click", dismiss);

  container.appendChild(toast);

  showToast._timeoutId = setTimeout(dismiss, duration);
}

/**
 * Retrieves the currently active tab in the current window.
 * @returns {Promise<chrome.tabs.Tab>} The active tab.
 */
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  return tab;
}

/**
 * Enables or disables a collection of buttons.
 * @param {NodeList|Array} buttons - Button elements.
 * @param {boolean} [isEnabled=false] - If `true`, enables; otherwise disables.
 * @returns {void}
 */
function setButtonState(buttons, isEnabled = false) {
  if (typeof buttons !== "object") {
    return;
  }

  for (const button of buttons) {
    button.disabled = !isEnabled;
    button.classList.toggle("disabled", !isEnabled);
  }
}

/**
 * Safely returns a value or `0` if it's falsy (but not `0`).
 * Use for stats fields that may be missing from `page_data`.
 * @param {*} value - The value to check.
 * @returns {number} The value or `0`.
 */
function num(value) {
  return value ?? 0;
}

/**
 * Cache for SVG icons created with `makeIcon`.
 * @type {Object}
 */
const ICON_CACHE = Object.create(null);

/**
 * Creates or clones an SVG icon from a `<defs>` sprite.
 * Icons are cached by `icon_name, icon_title, width, height` to avoid duplicate DOM creation.
 *
 * @param {string} icon_name - The icon's ID in the sprite.
 * @param {string|null} icon_title - Optional accessible title (if provided, `role="img"` is set).
 * @param {number} width - Width in pixels.
 * @param {number} height - Height in pixels.
 * @returns {SVGElement} A clone of the icon.
 */
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

/**
 * Returns a placeholder tag for empty values (e.g., missing meta, missing alt).
 * @returns {HTMLElement} A `<span class="tag tag-error">` with `txt_empty_value` text.
 */
function emptyValueTag() {
  return ml("span", { "class": "tag tag-error" }, "txt_empty_value".i18n());
}

/**
 * Returns a placeholder tag for invalid URLs.
 * @returns {HTMLElement} A `<span class="tag tag-error">` with `txt_invalid_url` text.
 */
function invalidUrlTag() {
  return ml("span", { "class": "tag tag-error" }, "txt_invalid_url".i18n());
}

/**
 * Returns a status tag for an image's `alt` attribute, distinguishing a genuinely missing `alt`
 * attribute (an accessibility/SEO gap) from an intentionally empty `alt=""` (valid for decorative
 * images) — the two are never treated as equivalent.
 *
 * @param {{alt: string|null, has_alt_attribute: boolean}} image - The image record.
 * @returns {HTMLElement} A `<span class="tag ...">` describing the alt state.
 */
function altStatusTag(image) {
  if (!image.has_alt_attribute) {
    return ml("span", { "class": "tag tag-error" }, "txt_alt_missing".i18n());
  }

  return ml("span", { "class": "tag" }, "txt_alt_empty_decorative".i18n());
}

/**
 * Returns either the value (truncated if requested) or a tag if the value is missing.
 *
 * @param {*} value - The value to check.
 * @param {Function} tagFn - Function that returns a placeholder element (e.g., `emptyValueTag`).
 * @param {number} [truncateLength] - Optional maximum length for string values.
 * @returns {string|HTMLElement} The formatted value or placeholder tag.
 */
function textOrTag(value, tagFn, truncateLength) {
  if (value === null || typeof value === "undefined" || value === "") {
    return tagFn();
  }

  return truncateLength ? String(value).truncate(truncateLength) : String(value);
}

/**
 * Creates a "box" (icon + label + value) for summary statistics.
 * Used in overview stats, heading counts, image counts, link counts, etc.
 *
 * @param {string} iconName - The icon ID.
 * @param {string} labelKey - The i18n key for the label.
 * @param {*} rawValue - The value to display.
 * @param {Object} [options] - Options object.
 * @param {boolean} [options.dense=false] - If `true` and value exceeds `LIMITS.BOX_CHAR`, applies the `dense` class.
 * @returns {HTMLElement} The box element.
 */
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

/**
 * Creates a table row for the error log.
 *
 * @param {string} icon_filename - The icon name.
 * @param {string} severity_color - The CSS severity class (e.g., "critical", "high", "info").
 * @param {string} severity_level - The severity label (already i18n'ed).
 * @param {string|HTMLElement} text - The error message.
 * @returns {HTMLElement} A `<tr>` element.
 */
function makeTableRow(icon_filename, severity_color, severity_level, text) {
  return ml("tr", null,
    ml("th", { "class": "x-left severity-" + severity_color }, severity_level, makeIcon(icon_filename, null, ICON_SIZE.SMALL, ICON_SIZE.SMALL)),
    ml("td", null, text),
  );
}

/**
 * Pushes an error row to an error list using a severity object (see `SEVERITY`).
 * @param {Array} list - The list of rows (will be appended).
 * @param {Object} severity - The severity object (from `SEVERITY`).
 * @param {string|HTMLElement} text - The error message.
 * @returns {void}
 */
function pushError(list, severity, text) {
  list.push(makeTableRow(severity.icon, severity.color, severity.labelKey.i18n(), text));
}

/**
 * Builds a description list (dl) for meta elements. Each key becomes a `<dt>`, each value becomes
 * a `<dd>`. Values are arrays (a meta name/property may legitimately appear more than once in the
 * document) — every occurrence is rendered, in document order, rather than only the last one; a
 * key with more than one value gets a "duplicate" tag on every entry after the first so the
 * duplication is visible at a glance.
 *
 * @param {HTMLElement} panel - The panel to append the list to.
 * @param {string} heading - The heading text (already i18n'ed).
 * @param {Object<string, Array<string|null>>} data - Object of key → array of content values.
 * @returns {void}
 */
function makeDescriptionList(panel, heading, data) {
  const rows = [];

  for (const [key, values] of Object.entries(data)) {
    const valueList = Array.isArray(values) ? values : [values];

    valueList.forEach((value, index) => {
      const duplicateTag = index > 0 ? ml("span", { "class": "tag tag-error" }, "text_duplicate_meta_tag".i18n()) : null;

      rows.push(
        ml("dt", { "class": "break-anywhere" }, key), // Never empty
        ml("dd", { "class": "break-anywhere" }, textOrTag(value, emptyValueTag), duplicateTag),
      );
    });
  }

  panel.appendChild(ml("h2", null, heading));
  panel.appendChild(ml("dl", { "class": "col-list" }, ...rows));
}

/**
 * Recursively builds the heading tree DOM structure from the data returned by `extractHeadings`.
 *
 * @param {Array} structure - The heading tree array (from `page_data.heading_elements.tree`).
 * @returns {Array<HTMLElement>} Array of `<li>` elements representing the tree.
 */
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

/**
 * Finds a header value in an array of header objects by name (case‑insensitive).
 *
 * @param {Array<{name: string, value: string}>} headers - The headers array.
 * @param {string} name - The header name to look for.
 * @returns {string|null} The header value or `null` if not found.
 */
function findHeaderValue(headers, name) {
  return headers.find(header => header.name.toLowerCase() === name)?.value ?? null;
}

// ---- Tabs / tab panels ----

/**
 * Creates a tab button element.
 *
 * @param {Object} params - The tab parameters.
 * @param {string} params.id - The button ID.
 * @param {string} params.panel - The ID of the panel it controls.
 * @param {string} params.labelKey - The i18n key for the label.
 * @param {string} [params.icon] - Optional icon name.
 * @param {boolean} [params.disabled=false] - If `true`, adds `disabled` attribute.
 * @param {boolean} [params.selected=false] - If `true`, sets `aria-selected="true"`.
 * @returns {HTMLElement} The button element.
 */
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

/**
 * Creates a tab panel `<div>`.
 *
 * @param {string} id - The panel ID.
 * @param {string} labelledby - The ID of the tab button that controls this panel.
 * @returns {HTMLElement} The panel element.
 */
function makeTabPanel(id, labelledby) {
  return ml("div", { "class": "tabpanel", "id": id, "role": "tabpanel", "tabindex": "0", "aria-labelledby": labelledby });
}

/**
 * Creates a tab list container with child tab buttons.
 *
 * @param {Array<Object>} tabs - Array of tab parameters (see `makeTabButton`).
 * @returns {HTMLElement} The tab list container.
 */
function makeTabList(tabs) {
  return ml("div", { "role": "tablist", "class": "tablist" }, ...tabs.map(makeTabButton));
}

/**
 * Creates a "Copy" button that triggers a custom copy function.
 *
 * @param {string|null} panelId - The ID of the panel to copy from (or null if not needed).
 * @param {Function} copyFn - The copy function that takes `(panelId, asMarkdown)`.
 * @returns {HTMLElement} The button container.
 */
function makeCopyTableButton(panelId, copyFn) {
  return ml("div", { "class": "btn-container" },
    ml("button", {
      "class": "primary-btn icon-left",
      "data-target-id": panelId || "",
      "onclick": async function () {
        const copyAsMarkdown = await getSetting("copy-format", 0);

        copyFn(this.dataset.targetId, copyAsMarkdown);
      }
    },
      makeIcon(ICONS.COPY, null, ICON_SIZE.SMALL, ICON_SIZE.SMALL),
      "btn_copy".i18n()
    )
  );
}

/**
 * Initialises all tab lists with the `TabsAutomatic` class (ARIA tab behaviour).
 * @returns {void}
 */
function enableTabs() {
  const tablists = document.querySelectorAll("[role=tablist]");
  for (const tablist of tablists) {
    new TabsAutomatic(tablist);
  }
}
//#endregion


//#region Popup UI construction

/** @type {HTMLElement} The main content container. */
const content = document.querySelector("#content");

// Create main tabs (initially disabled) and their panels.
content.appendChild(makeTabList(MAIN_TABS.map(tab => ({ ...tab, disabled: true }))));

const panelsById = Object.fromEntries(
  MAIN_TABS.map(tab => [tab.panel, makeTabPanel(tab.panel, tab.id)])
);

for (const panel of Object.values(panelsById)) {
  content.appendChild(panel);
}

// Shortcuts to each panel for easy access.
const overview_panel = panelsById["tabpanel-overview"];
const headings_panel = panelsById["tabpanel-headings"];
const images_panel = panelsById["tabpanel-images"];
const links_panel = panelsById["tabpanel-links"];
const structured_data_panel = panelsById["tabpanel-structured-data"];
const metas_panel = panelsById["tabpanel-metas"];

// Footer with legends and logo.
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

/**
 * Listens for tab status updates from the background script.
 * If the tab becomes "complete", refresh the popup content.
 * @listens chrome.runtime.onMessage
 */
chrome.runtime.onMessage.addListener(async message => {
  if (message.tabId && message.status) {
    const tab = await getCurrentTab();

    if (message.tabId === tab.id && message.status === "complete") {
      await showPopupContent(tab);
    }
  }
});

/**
 * On DOM load, get the current tab and load its data if the page is already "complete".
 * Otherwise, wait for the status update (above).
 */
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

/**
 * Renders the SEO preview (title, favicon, breadcrumb, description).
 * @param {Object} page_data - The data returned by the content script.
 * @returns {void}
 */
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

/**
 * Renders the overview statistics boxes (robots meta, language, word count, etc.).
 * @param {Object} page_data - The page data.
 * @returns {void}
 */
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

/**
 * Adds title‑related recommendations to the technical error list. Character count and rendered
 * pixel width are evaluated independently — a title can be short in characters yet still render
 * too wide (rare), or within the recommended character range yet still overflow visually, so
 * either check can fire on its own. These are Rank Math-style optimization recommendations, not
 * Google requirements: only a genuinely empty title is treated as a real (HIGH) problem.
 *
 * @param {Object} page_data - The page data.
 * @param {Array} errors - The technical-SEO error list.
 * @returns {void}
 */
function buildTitleErrors(page_data, errors) {
  const title = page_data.title ?? "";

  if (title.length === 0) {
    pushError(errors, SEVERITY.HIGH, "error_empty_page_title".i18n());
    return;
  }

  if (title.length < LIMITS.TITLE_RECOMMENDED_MIN) {
    pushError(errors, SEVERITY.INFO, sprintf("info_short_page_title".i18n(), title.length, LIMITS.TITLE_RECOMMENDED_MIN));
  } else if (title.length > LIMITS.TITLE_RECOMMENDED_MAX) {
    pushError(errors, SEVERITY.INFO, sprintf("info_long_page_title".i18n(), title.length, LIMITS.TITLE_RECOMMENDED_MAX));
  }

  const titlePixelWidth = num(page_data.title_pixel_width);

  if (titlePixelWidth > LIMITS.TITLE_PIXEL_MAX) {
    pushError(errors, SEVERITY.WARNING, sprintf("warning_title_pixel_width".i18n(), Math.round(titlePixelWidth), LIMITS.TITLE_PIXEL_MAX));
  }
}

/**
 * Adds meta description recommendations to the technical error list, plus a duplicate-tag
 * warning when more than one `<meta name="description">` is present. Character count and
 * rendered pixel width are evaluated independently — Rank Math's own example (160 characters
 * measuring 992px against a 920px recommendation) shows a description can sit exactly at the
 * character limit while still overflowing visually, so both checks always run.
 *
 * @param {Object} page_data - The page data.
 * @param {Array} errors - The technical-SEO error list.
 * @returns {void}
 */
function buildMetaDescriptionErrors(page_data, errors) {
  const descriptions = page_data.meta_elements.general?.description;
  const description = descriptions?.[0];

  if (!Array.isArray(descriptions) || typeof description !== "string" || description.length === 0) {
    pushError(errors, SEVERITY.HIGH, "error_empty_meta_description".i18n());
    return;
  }

  if (description.length < LIMITS.DESCRIPTION_RECOMMENDED_MIN) {
    pushError(errors, SEVERITY.INFO, sprintf("info_short_meta_description".i18n(), description.length, LIMITS.DESCRIPTION_RECOMMENDED_MIN));
  } else if (description.length > LIMITS.DESCRIPTION_RECOMMENDED_MAX) {
    pushError(errors, SEVERITY.INFO, sprintf("info_long_meta_description".i18n(), description.length, LIMITS.DESCRIPTION_RECOMMENDED_MAX));
  }

  const descriptionPixelWidth = num(page_data.description_pixel_width);

  if (descriptionPixelWidth > LIMITS.DESCRIPTION_PIXEL_MAX) {
    pushError(errors, SEVERITY.WARNING, sprintf("warning_description_pixel_width".i18n(), Math.round(descriptionPixelWidth), LIMITS.DESCRIPTION_PIXEL_MAX));
  }
}

/**
 * Adds heading‑related errors (nesting, empty headings) to the error list.
 * @param {Object} page_data - The page data.
 * @param {Array} errors - The error list.
 * @returns {void}
 */
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

/**
 * Adds indexing/noindex errors to the error list.
 * @param {Object} page_data - The page data.
 * @param {Array} errors - The error list.
 * @returns {void}
 */
function buildIndexingErrors(page_data, errors) {
  const generalMeta = page_data.meta_elements.general;
  // robots takes priority; fall back to googlebot only when robots is
  // genuinely absent (not just present-but-empty). Meta values are arrays
  // (duplicates preserved) — the first occurrence in document order wins.
  const indexingDirective = generalMeta.robots?.[0] ?? generalMeta.googlebot?.[0] ?? null;

  if (indexingDirective && indexingDirective.indexOf("noindex") !== -1) {
    pushError(errors, SEVERITY.HIGH, sprintf("error_blocked_robotstxt".i18n(), page_data.url));
  }
}

/**
 * Adds language‑related errors (missing language attribute) to the error list.
 * @param {Object} page_data - The page data.
 * @param {Array} errors - The error list.
 * @returns {void}
 */
function buildLanguageErrors(page_data, errors) {
  if ((page_data.language ?? "").length === 0) {
    pushError(errors, SEVERITY.HIGH, "error_empty_page_language".i18n());
  }
}

/**
 * Adds canonical-tag recommendations to the technical error list. Every canonical tag found is
 * inspected (not just the first), since `link_elements.canonical` now preserves duplicates. An
 * absent canonical is common and legitimate on many pages, so it's WARNING rather than CRITICAL;
 * a canonical that simply points elsewhere than the current URL is also normal (e.g. paginated or
 * parameterized pages canonicalizing to a primary URL) and is reported as INFO, not an error.
 *
 * @param {Object} page_data - The page data.
 * @param {Array} errors - The technical-SEO error list.
 * @returns {void}
 */
function buildCanonicalErrors(page_data, errors) {
  const canonicals = page_data.link_elements.canonical ?? [];

  if (canonicals.length === 0) {
    pushError(errors, SEVERITY.WARNING, "warning_missing_canonical_tag".i18n());
    return;
  }

  if (canonicals.length > 1) {
    pushError(errors, SEVERITY.WARNING, sprintf("warning_multiple_canonical_tags".i18n(), canonicals.length));
  }

  for (const canonical of canonicals) {
    if (!canonical.valid) {
      const key = canonical.raw ? "warning_malformed_canonical_tag" : "warning_empty_canonical_tag";
      pushError(errors, SEVERITY.WARNING, canonical.raw ? sprintf(key.i18n(), canonical.raw) : key.i18n());
      continue;
    }

    if (canonical.has_fragment) {
      pushError(errors, SEVERITY.INFO, sprintf("info_canonical_has_fragment".i18n(), canonical.url));
    }

    let currentHostname = null;

    try {
      currentHostname = new URL(page_data.url).hostname;
    } catch { /* leave null */ }

    if (currentHostname && canonical.hostname && canonical.hostname !== currentHostname) {
      pushError(errors, SEVERITY.INFO, sprintf("info_canonical_cross_host".i18n(), canonical.url));
    } else if (canonical.url && canonical.url !== page_data.url) {
      pushError(errors, SEVERITY.INFO, sprintf("info_canonical_points_elsewhere".i18n(), canonical.url));
    }
  }
}

/**
 * Adds robots.txt / sitemap errors and info to the error list.
 * @param {Object} page_data - The page data.
 * @param {Array} errors - The technical-SEO error list.
 * @returns {void}
 */
function buildRobotsTxtErrors(page_data, errors) {
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
      ml("th", { "class": "x-left severity-info" },
        SEVERITY.INFO.labelKey.i18n(),
        makeIcon(SEVERITY.INFO.icon, null, ICON_SIZE.SMALL, ICON_SIZE.SMALL)
      ),
      ml("td", null, sprintf("info_robots_txt_sitemaps".i18n(), sitemaps.length), ...sitemapNodes)
    ));
  }
}

/**
 * Adds a URL-length recommendation to the technical error list. 75 characters is a Rank
 * Math-style recommendation, not a hard Google requirement — long URLs are not, by themselves,
 * a technical SEO error.
 *
 * @param {Object} page_data - The page data.
 * @param {Array} errors - The technical-SEO error list.
 * @returns {void}
 */
function buildUrlLengthInfo(page_data, errors) {
  const urlLength = (page_data.url ?? "").length;

  if (urlLength > LIMITS.URL_RECOMMENDED_MAX) {
    pushError(errors, SEVERITY.INFO, sprintf("info_long_url".i18n(), urlLength, LIMITS.URL_RECOMMENDED_MAX));
  }
}

/**
 * Adds a duplicate-tag notice for any watched meta name/property that appears more than once in
 * the document (description, robots, viewport, and the Open Graph/Twitter preview tags). Duplicate
 * `description`, `robots`, `viewport`, or social-preview tags are a common copy‑paste mistake that
 * can cause search engines/social crawlers to pick an unintended value.
 *
 * @param {Object} page_data - The page data.
 * @param {Array} errors - The technical-SEO error list.
 * @returns {void}
 */
function buildDuplicateMetaErrors(page_data, errors) {
  const metaElements = page_data.meta_elements;
  const watchList = [
    ["general", "description"], ["general", "robots"], ["general", "viewport"],
    ["open_graph", "og:title"], ["open_graph", "og:description"], ["open_graph", "og:url"], ["open_graph", "og:image"],
    ["twitter", "twitter:title"], ["twitter", "twitter:description"], ["twitter", "twitter:image"]
  ];

  for (const [group, name] of watchList) {
    const values = metaElements[group]?.[name];

    if (Array.isArray(values) && values.length > 1) {
      pushError(errors, SEVERITY.INFO, sprintf("info_duplicate_meta_tag".i18n(), name, values.length));
    }
  }
}

/**
 * Adds HTTP header errors/info to the error list.
 * @param {Array} page_headers - The headers array.
 * @param {Array} errors - The technical-SEO error list.
 * @returns {void}
 */
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

  for (const check of DEPRECATED_HEADER_CHECKS) {
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

/**
 * Adds image-format info to the error list. A page legitimately mixing modern (webp/avif/svg/…)
 * and legacy (png/jpg/gif) formats is normal — an SVG logo next to a WebP photo next to a JPEG
 * fallback is not an SEO problem — so format mix is always informational, never an error.
 *
 * @param {Object} page_data - The page data.
 * @param {Array} errors - The technical-SEO error list.
 * @returns {void}
 */
function buildImageFormatErrors(page_data, errors) {
  const { modern_image_formats = [], legacy_image_formats = [] } = page_data.image_elements;

  if (modern_image_formats.length > 0 && legacy_image_formats.length > 0) {
    pushError(errors, SEVERITY.INFO, sprintf("info_mixed_image_formats".i18n(), modern_image_formats.join(", "), legacy_image_formats.join(", ")));
  } else if (modern_image_formats.length > 0) {
    pushError(errors, SEVERITY.INFO, sprintf("info_modern_image_formats".i18n(), modern_image_formats.join(", ")));
  } else if (legacy_image_formats.length > 0) {
    pushError(errors, SEVERITY.INFO, sprintf("info_legacy_image_formats".i18n(), legacy_image_formats.join(", ")));
  }
}

/**
 * Adds focus-keyword (content optimization) recommendations to the content error list. Entirely
 * optional — nothing is added when no primary keyword is configured, since a focus keyword is
 * never required for a normal technical SEO audit. These are always INFO/WARNING signals, never
 * technical errors.
 *
 * @param {Object} page_data - The page data.
 * @param {Array} errors - The content-optimization error list.
 * @returns {void}
 */
function buildKeywordOptimizationInfo(page_data, errors) {
  const analysis = page_data.keyword_analysis;

  if (!analysis) {
    return;
  }

  for (const [labelKeySuffix, result] of [["primary", analysis.primary], ["secondary", analysis.secondary]]) {
    if (!result) {
      continue;
    }

    const keyword = result.keyword;

    if (!result.in_title) {
      pushError(errors, SEVERITY.INFO, sprintf(("info_keyword_missing_in_title_" + labelKeySuffix).i18n(), keyword));
    } else if (!result.in_title_first_half) {
      pushError(errors, SEVERITY.INFO, sprintf(("info_keyword_not_in_title_first_half_" + labelKeySuffix).i18n(), keyword));
    }

    if (!result.in_description) {
      pushError(errors, SEVERITY.INFO, sprintf(("info_keyword_missing_in_description_" + labelKeySuffix).i18n(), keyword));
    }

    if (!result.in_url) {
      pushError(errors, SEVERITY.INFO, sprintf(("info_keyword_missing_in_url_" + labelKeySuffix).i18n(), keyword));
    }

    if (!result.in_first_content_fraction) {
      pushError(errors, SEVERITY.INFO, sprintf(("info_keyword_not_in_content_start_" + labelKeySuffix).i18n(), keyword));
    }

    if (!result.in_headings) {
      pushError(errors, SEVERITY.INFO, sprintf(("info_keyword_missing_in_headings_" + labelKeySuffix).i18n(), keyword));
    }

    const density = result.density_percent;
    const formattedDensity = density.formatNumber ? density.formatNumber(LIMITS.DECIMALS) : density.toFixed(LIMITS.DECIMALS);

    if (density < LIMITS.KEYWORD_DENSITY_RECOMMENDED_MIN) {
      pushError(errors, SEVERITY.INFO, sprintf(("info_keyword_density_low_" + labelKeySuffix).i18n(), keyword, formattedDensity));
    } else if (density > LIMITS.KEYWORD_DENSITY_WARNING_MAX) {
      pushError(errors, SEVERITY.WARNING, sprintf(("warning_keyword_density_high_" + labelKeySuffix).i18n(), keyword, formattedDensity));
    } else if (density > LIMITS.KEYWORD_DENSITY_RECOMMENDED_MAX) {
      pushError(errors, SEVERITY.INFO, sprintf(("info_keyword_density_elevated_" + labelKeySuffix).i18n(), keyword, formattedDensity));
    }
  }
}

/**
 * Renders the full error log table, split into a "Technical SEO" section (indexability, robots,
 * canonical, metadata existence, structured data, headings, images, links, security headers) and
 * an optional "Content Optimization" section (focus-keyword placement/density) that only appears
 * when at least one focus keyword is configured.
 *
 * @param {Object} page_data - The page data.
 * @param {Array} page_headers - The headers array.
 * @returns {void}
 */
function renderErrorLog(page_data, page_headers) {
  const technicalErrors = [];
  const contentErrors = [];

  buildTitleErrors(page_data, technicalErrors);
  buildMetaDescriptionErrors(page_data, technicalErrors);
  buildLanguageErrors(page_data, technicalErrors);
  buildHeadingErrors(page_data, technicalErrors);
  buildIndexingErrors(page_data, technicalErrors);
  buildCanonicalErrors(page_data, technicalErrors);
  buildRobotsTxtErrors(page_data, technicalErrors);
  buildUrlLengthInfo(page_data, technicalErrors);
  buildDuplicateMetaErrors(page_data, technicalErrors);
  buildHeaderErrors(page_headers, technicalErrors);
  buildImageFormatErrors(page_data, technicalErrors);

  buildKeywordOptimizationInfo(page_data, contentErrors);

  // Add external validator buttons.
  overview_panel.appendChild(ml("div", { "class": "btn-container" },
    ml("a", { "class": "primary-btn icon-right", "target": "_blank", "href": "https://validator.w3.org/nu/?doc=" + encodeURIComponent(page_data.url) }, "btn_open_in_w3c_html_validator".i18n(),
      makeIcon(ICONS.NEW_WINDOW, "text_opens_in_new_window".i18n(), ICON_SIZE.SMALL, ICON_SIZE.SMALL)
    ),
    ml("a", { "class": "primary-btn icon-right", "target": "_blank", "href": "https://pagespeed.web.dev/analysis?url=" + encodeURIComponent(page_data.url) }, "btn_open_in_pagespeed_insights".i18n(),
      makeIcon(ICONS.NEW_WINDOW, "text_opens_in_new_window".i18n(), ICON_SIZE.SMALL, ICON_SIZE.SMALL)
    )
  ));

  if (technicalErrors.length === 0 && contentErrors.length === 0) {
    technicalErrors.push(ml("tr", null,
      ml("td", { "class": "x-center", "colspan": "2" }, "warning_no_data_to_display".i18n()),
    ));
  }

  const sectionHeaderRow = labelKey => ml("tr", null,
    ml("th", { "class": "x-left table-section-heading", "colspan": "2" }, labelKey.i18n())
  );

  const rows = [];

  if (technicalErrors.length > 0) {
    if (contentErrors.length > 0) {
      rows.push(sectionHeaderRow("heading_technical_seo"));
    }

    rows.push(...technicalErrors);
  }

  if (contentErrors.length > 0) {
    rows.push(sectionHeaderRow("heading_content_optimization"));
    rows.push(...contentErrors);
  }

  // Add the error table.
  overview_panel.appendChild(ml("div", { "class": "table-scroll" },
    ml("table", null,
      ml("thead", null,
        ml("tr", null,
          ml("th", null, "table_heading_severity".i18n()),
          ml("th", null, "table_heading_desc".i18n())
        )
      ),
      ml("tbody", null, ...rows)
    )
  ));
}

/**
 * Renders the Headings tab: statistics boxes, copy button, and the tree.
 * @param {Object} page_data - The page data.
 * @returns {void}
 */
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

  headings_panel.appendChild(makeCopyTableButton("heading-tree", copyTreeFromPanel));

  const tree = page_data.heading_elements.tree;

  if (tree.length > 0) {
    headings_panel.appendChild(
      ml("div", { "class": "tree", "id": "heading-tree" },
        ml("ul", null,
          ...buildHeadingTree(tree)
        )
      )
    );
  }
}

/**
 * Renders the Images tab: statistics, sub‑tabs, and tables.
 * @param {Object} page_data - The page data.
 * @returns {void}
 */
function renderImagesTab(page_data) {
  const imageElements = page_data.image_elements;

  images_panel.appendChild(ml("p", null, "txt_images_desc".i18n()));

  images_panel.appendChild(ml("section", { "class": "box-group" },
    makeBox(ICONS.ANALYTIC, "txt_total_images", num(imageElements.total_images).formatNumber()),
    makeBox(ICONS.ANALYTIC, "txt_images_without_alt", num(imageElements.images_missing_alt_attribute).formatNumber()),
    makeBox(ICONS.ANALYTIC, "txt_images_empty_alt", num(imageElements.images_empty_alt).formatNumber()),
  ));

  images_panel.appendChild(makeTabList(IMAGE_SUB_TABS));

  const allImages = imageElements.all_image_list;

  if (allImages.length > 0) {
    const all_images_panel = makeTabPanel("tabpanel-all-images", "tab-all-images");

    all_images_panel.appendChild(makeCopyTableButton("tabpanel-all-images", copyTableFromPanel));

    const rows = allImages.map(image_src => ml("tr", null,
      ml("td", { "class": "x-center" }, ml("img", { "src": image_src.url, "alt": image_src.alt, "class": "img-preview" })),
      ml("td", null, textOrTag(image_src.alt, () => altStatusTag(image_src))),
      ml("td", { "class": "break-anywhere" },
        image_src.url,
        ml("button", { "class": "btn-locate", "data-locate-id": `image-${image_src.counter}`, "title": "btn_locate_element".i18n() },
          makeIcon(ICONS.LOCATE, null, ICON_SIZE.SMALL, ICON_SIZE.SMALL)
        )
      )
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

  if (num(imageElements.images_missing_alt_attribute) > 0 && imagesWithoutAlt.length > 0) {
    const images_without_alt_panel = makeTabPanel("tabpanel-images-without-alt", "tab-images-without-alt");

    images_without_alt_panel.appendChild(makeCopyTableButton("tabpanel-images-without-alt", copyTableFromPanel));

    const rows = imagesWithoutAlt.map(image_src => ml("tr", null,
      ml("td", { "class": "x-center" }, ml("img", { "src": image_src.url, "alt": "", "class": "img-preview" })),
      ml("td", null, textOrTag(image_src.alt, () => altStatusTag(image_src))),
      ml("td", { "class": "break-anywhere" },
        image_src.url,
        ml("button", { "class": "btn-locate", "data-locate-id": `image-${image_src.counter}`, "title": "btn_locate_element".i18n() },
          makeIcon(ICONS.LOCATE, null, ICON_SIZE.SMALL, ICON_SIZE.SMALL)
        )
      )
    ));

    images_without_alt_panel.appendChild(ml("div", { "class": "table-scroll" },
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

    images_panel.appendChild(images_without_alt_panel);
  }
}

/**
 * Renders a list of links as a description list (dt/dd) in a panel.
 *
 * @param {string} id - The panel ID.
 * @param {string} labelledby - The tab button ID.
 * @param {Array} linksByKey - The link objects (internal or external).
 * @returns {HTMLElement} The panel element.
 */
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

/**
 * Returns a tag for a preload `as` value: `tag` if valid, error tag if invalid, null if absent.
 *
 * @param {string|false|null} preloadAs - The preload `as` value.
 * @returns {HTMLElement|null} The tag element or null.
 */
function preloadAsTag(preloadAs) {
  if (preloadAs === false) {
    return ml("span", { "class": "tag tag-error" }, sprintf("txt_invalid_value".i18n(), "as"));
  }

  if (typeof preloadAs === "string") {
    return ml("span", { "class": "tag" }, preloadAs);
  }

  return null;
}

/**
 * Renders a resource section (e.g., alternate, language, navigation, performance, icons, stylesheets)
 * as a description list with optional extra tags per item.
 *
 * @param {HTMLElement} panel - The panel to append to.
 * @param {string} headingKey - The i18n key for the heading.
 * @param {Array} items - Array of resource objects.
 * @param {Function} extra - Function that returns an array of extra elements per item.
 * @returns {boolean} `true` if any items were rendered.
 */
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

/**
 * Renders the Links tab: statistics, sub‑tabs, and lists.
 * @param {Object} page_data - The page data.
 * @returns {void}
 */
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

/**
 * Renders the Metas tab: descriptions lists for each meta group.
 * @param {Object} page_data - The page data.
 * @returns {void}
 */
function renderMetasTab(page_data) {
  const metaElements = page_data.meta_elements;

  metas_panel.appendChild(ml("p", null, "txt_meta_desc".i18n()));

  // External debugger buttons.
  metas_panel.appendChild(ml("div", { "class": "btn-container" },
    ml("a", { "class": "primary-btn icon-right", "target": "_blank", "href": "https://developers.facebook.com/tools/debug/?q=" + encodeURIComponent(page_data.url) }, "btn_open_in_facebook_sharing_debugger".i18n(),
      makeIcon(ICONS.NEW_WINDOW, "text_opens_in_new_window".i18n(), ICON_SIZE.SMALL, ICON_SIZE.SMALL)
    ),
    ml("a", { "class": "primary-btn icon-right", "target": "_blank", "href": "https://www.linkedin.com/post-inspector/inspect/" + encodeURIComponent(page_data.url) }, "btn_open_in_linkedin_post_inspector".i18n(),
      makeIcon(ICONS.NEW_WINDOW, "text_opens_in_new_window".i18n(), ICON_SIZE.SMALL, ICON_SIZE.SMALL)
    )
  ));

  let meta_counter = 0;

  if (Object.keys(metaElements.general).length > 0) {
    meta_counter++;
    makeDescriptionList(metas_panel, "heading_general_meta".i18n(), metaElements.general);
  }

  if (Object.keys(metaElements.dublin_core).length > 0) {
    meta_counter++;
    makeDescriptionList(metas_panel, "heading_dublin_core_meta".i18n(), metaElements.dublin_core);
  }

  if (Object.keys(metaElements.open_graph).length > 0) {
    meta_counter++;
    makeDescriptionList(metas_panel, "heading_open_graph_meta".i18n(), metaElements.open_graph);
  }

  if (Object.keys(metaElements.facebook).length > 0) {
    meta_counter++;
    makeDescriptionList(metas_panel, "heading_facebook_meta".i18n(), metaElements.facebook);
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

/**
 * Renders the Structured Data tab: a table per schema-type entity. JSON-LD is structured data;
 * rich results are the potential search-result presentations that eligible structured data *may*
 * unlock, so the tab deliberately does not promise rich results just because markup is present.
 *
 * Every entity of a given `@type` is rendered as its own table (rather than only the last one),
 * since a page can legitimately have more than one entity of the same type (e.g. multiple
 * `Product` nodes) and none should be silently lost.
 *
 * @param {Object} page_data - The page data.
 * @returns {void}
 */
function renderStructuredDataTab(page_data) {
  structured_data_panel.appendChild(ml("p", null, "txt_structured_data_desc".i18n()));

  const structuredData = page_data.structured_data ?? {};
  const groups = Object.entries(structuredData);

  if (groups.length === 0) {
    structured_data_panel.appendChild(ml("p", { "class": "warning" }, "warning_no_structured_data".i18n(),
      makeIcon(ICONS.WARNING, null, ICON_SIZE.NORMAL, ICON_SIZE.NORMAL)));
    return;
  }

  // External validator buttons.
  structured_data_panel.appendChild(ml("div", { "class": "btn-container" },
    ml("a", { "class": "primary-btn icon-right", "target": "_blank", "href": "https://search.google.com/test/rich-results?url=" + encodeURIComponent(page_data.url) }, "btn_open_in_rich_results_test".i18n(),
      makeIcon(ICONS.NEW_WINDOW, "text_opens_in_new_window".i18n(), ICON_SIZE.SMALL, ICON_SIZE.SMALL)
    ),
    ml("a", { "class": "primary-btn icon-right", "target": "_blank", "href": "https://validator.schema.org/#url=" + encodeURIComponent(page_data.url) }, "btn_open_in_schema_markup_validator".i18n(),
      makeIcon(ICONS.NEW_WINDOW, "text_opens_in_new_window".i18n(), ICON_SIZE.SMALL, ICON_SIZE.SMALL)
    )
  ));

  for (const [groupKey, entities] of groups) {
    const entityList = Array.isArray(entities) ? entities : [entities];
    const hasDuplicates = entityList.length > 1;

    entityList.forEach((entity, entityIndex) => {
      const rows = Object.values(entity ?? {}).map(row => ml("tr", null,
        ml("th", { "class": "x-left" }, row.key),
        ml("td", null, textOrTag(row.value, emptyValueTag)),
      ));

      const heading = hasDuplicates
        ? sprintf("heading_structured_data_entity_numbered".i18n(), ("heading_structured_data_" + groupKey).i18n(), entityIndex + 1)
        : ("heading_structured_data_" + groupKey).i18n();

      structured_data_panel.appendChild(ml("h2", null, heading));

      structured_data_panel.appendChild(ml("div", { "class": "table-scroll" },
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
    });
  }
}

/**
 * Attaches click listeners to all "locate" buttons.
 * Sends a message to the content script to highlight the target element.
 * @returns {void}
 */
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
          showToast("error_highlight_failed".i18n(), TOAST_TIMEOUT.LONG);
        }
      } catch { /* */ }
    }, false);
  }
}
//#endregion


/**
 * Main function that loads and renders the popup content for a given tab.
 * @param {chrome.tabs.Tab} tab - The tab to inspect.
 * @returns {Promise<void>}
 */
async function showPopupContent(tab) {
  // Clear all panels.
  for (const panel of [overview_panel, headings_panel, images_panel, links_panel, structured_data_panel, metas_panel]) {
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
      ml("a", { "class": "primary-btn icon-left", "href": "mailto:support@playfulsparkle.com" }, "btn_send_error_report".i18n())
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
  renderStructuredDataTab(page_data);

  wireLocateButtons();
  enableTabs();
}

/**
 * Returns all main tab buttons (for enabling/disabling).
 * @returns {NodeList} The tab buttons.
 */
function tab_lists_buttons() {
  return document.querySelectorAll('#content > [role="tablist"] > button[role="tab"]');
}

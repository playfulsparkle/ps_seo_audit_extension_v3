"use strict";

//#region Constants
/**
 * Icon size constants used in the settings page.
 * @type {Object}
 * @property {number} SMALL - 16px icon size.
 */
const ICON_SIZE = Object.freeze({ SMALL: 16 });

/**
 * Length of the "on" prefix in event handler attributes (e.g., "onclick").
 * @type {number}
 */
const ML_ON_PREFIX_LENGTH = 2;

/**
 * Attributes that carry a URL and must be validated for safe protocols.
 * @type {Set<string>}
 */
const SANITIZE_URL_ATTRS = new Set(["href", "src", "action", "formaction", "xlink:href"]);

/**
 * Allowed protocols for link `href` attributes (mailto: is allowed for anchors).
 * @type {Set<string>}
 */
const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * Allowed protocols for image `src` attributes (including data: URIs).
 * @type {Set<string>}
 */
const ALLOWED_IMAGE_PROTOCOLS = new Set(["http:", "https:", "data:"]);

/**
 * Configuration object mapping each setting key to its DOM selector and default value.
 * @type {Readonly<Object<string, {selector: string, default: *}>>}
 */
const SETTINGS_CONFIG = Object.freeze({
  "copy-format": { selector: "#copy-format", default: 0 },
  "show-seo-preview": { selector: "#show-seo-preview", default: true },
  "fetch-robots-txt": { selector: "#fetch-robots-txt", default: true },
  "user-agent": { selector: "#user-agent-list", default: "*" },
  "focus-keyword-primary": { selector: "#focus-keyword-primary", default: "" },
  "focus-keyword-secondary": { selector: "#focus-keyword-secondary", default: "" }
});

/**
 * List of known crawlers with user‑agent strings and human‑readable names.
 * @type {ReadonlyArray<{ua: string, name: string}>}
 */
const CRAWLER_LIST = Object.freeze([
  { ua: "Googlebot", name: "Google Search" },
  { ua: "Googlebot-Image", name: "Google Image Search" },
  { ua: "Googlebot-Video", name: "Google Video Search" },
  { ua: "Googlebot-News", name: "Google News" },
  { ua: "Googlebot-Mobile", name: "Google Mobile Search" },
  { ua: "Googlebot-Adsbot", name: "Google Ads" },
  { ua: "Bingbot", name: "Microsoft Bing" },
  { ua: "Slurp", name: "Yahoo! Search" },
  { ua: "Baiduspider", name: "Baidu Search" },
  { ua: "Yandex Bot", name: "Yandex Search" },
  { ua: "Sogou Spider", name: "Sogou Search" },
  { ua: "Exabot", name: "Exalead" },
  { ua: "Facebook External Hit", name: "Facebook" },
  { ua: "DuckDuckBot", name: "DuckDuckGo" },
  { ua: "Applebot", name: "Apple" },
  { ua: "SemrushBot", name: "Semrush" },
  { ua: "Anthropic-ai", name: "Anthropic" },
  { ua: "Applebot-Extended", name: "Apple Extended" },
  { ua: "AwarioRssBot", name: "Awario" },
  { ua: "AwarioSmartBot", name: "Awario" },
  { ua: "BLEXBot", name: "BLEXBot" },
  { ua: "CCBot", name: "Common Crawl" },
  { ua: "ChatGPT-User", name: "OpenAI ChatGPT" },
  { ua: "ClaudeBot", name: "Anthropic Claude" },
  { ua: "Claude-Web", name: "Anthropic Claude" },
  { ua: "Cohere-ai", name: "Cohere" },
  { ua: "GPTBot", name: "OpenAI" },
  { ua: "ImagesiftBot", name: "ImageSift" },
  { ua: "MJ12bot", name: "Majestic" },
  { ua: "Omgili", name: "Omgili" },
  { ua: "Omgilibot", name: "Omgili" },
  { ua: "PerplexityBot", name: "Perplexity AI" },
  { ua: "RavenCrawler", name: "Raven Tools" },
  { ua: "rogerbot", name: "Moz" },
  { ua: "Screaming Frog SEO Spider", name: "Screaming Frog" },
  { ua: "SearchmetricsBot", name: "Searchmetrics" },
  { ua: "serpstatbot", name: "Serpstat" },
  { ua: "Alexa Crawler", name: "Alexa / Amazon" },
]);
//#endregion


//#region i18n / storage helpers
/**
 * Returns the Chrome i18n translation for the current string, or the string itself if not found.
 * @param {string|string[]} [substitutions=""] - Substitutions for placeholders.
 * @returns {string} The translated string.
 */
String.prototype.i18n = function (substitutions = "") {
  return chrome.i18n.getMessage(this.toString(), substitutions) || this.toString();
};

/**
 * Saves a setting to chrome.storage.local.
 * @param {string} offset - The setting key.
 * @param {*} value - The value to store.
 * @returns {Promise<boolean>} `true` if successful, `false` otherwise.
 */
async function saveSetting(offset, value) {
  try {
    await chrome.storage.local.set({ [offset]: value });
    return true;
  } catch {
    return false;
  }
}

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


//#region DOM helpers
/**
 * Creates a DOM element with properties, event listeners, and children.
 * Similar to React's `createElement` but with a simpler API.
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

/**
 * Appends a child to a DOM element, handling strings (as text), arrays (flattened), and Node objects.
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
    el.appendChild(document.createTextNode(child));
  } else if (Array.isArray(child)) {
    for (const nestedChild of child) {
      appendChildren(el, nestedChild);
    }
  } else if (child instanceof Node) {
    el.appendChild(child);
  }
}

/**
 * Cache for SVG icons created with `makeIcon`.
 * @type {Object}
 */
const ICON_CACHE = Object.create(null);

/**
 * Creates or clones an SVG icon from a `<defs>` sprite.
 * Icons are cached by `icon_name, width, height` to avoid duplicate DOM creation.
 *
 * @param {string} icon_name - The icon's ID in the sprite.
 * @param {number} width - Width in pixels.
 * @param {number} height - Height in pixels.
 * @returns {SVGElement} A clone of the icon.
 */
function makeIcon(icon_name, width, height) {
  // Joined with "-" so e.g. ("a", 1, 23) and ("a1", 2, 3) can't collide on
  // the same cache key the way plain concatenation ("a123" both times) did.
  const key = `${icon_name}-${width}-${height}`;

  let icon = ICON_CACHE[key];

  if (!icon) {
    icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("class", `icon ${icon_name}`);
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("width", width);
    icon.setAttribute("height", height);

    const icon_use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    icon_use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", `#${icon_name}`);
    icon.appendChild(icon_use);

    ICON_CACHE[key] = icon;
  }

  return icon.cloneNode(true);
}
//#endregion


//#region Form helpers
/**
 * Gets the current value of a form element, handling checkboxes as a boolean.
 * @param {HTMLInputElement|HTMLSelectElement} element - The form element.
 * @returns {*} The value (boolean for checkbox, string for others).
 */
function getElementValue(element) {
  return element.type === "checkbox" ? element.checked : element.value;
}

/**
 * Sets the value of a form element, handling checkboxes as a boolean.
 * @param {HTMLInputElement|HTMLSelectElement} element - The form element.
 * @param {*} value - The value to set.
 * @returns {void}
 */
function setElementValue(element, value) {
  if (element.type === "checkbox") {
    element.checked = Boolean(value);
  } else {
    element.value = value;
  }
}
//#endregion


//#region Build the form
/** @type {HTMLElement} The main content container. */
const content = document.querySelector("#content");

/**
 * Builds the list of `<option>` elements for the user‑agent dropdown.
 * Starts with the wildcard option and then adds each crawler with its display name.
 * @type {HTMLElement[]}
 */
const user_agent_options = [
  ml("option", { value: "*" }, "text_ua_wildcard".i18n()),
  ...CRAWLER_LIST.map(({ ua, name }) =>
    ml("option", { value: ua }, name)
  )
];

const copy_format_options = [
  ml("option", { value: "0" }, "option_plain_text".i18n()),
  ml("option", { value: "1" }, "option_markdown".i18n())
];

/**
 * Creates the entire settings form using the ml() helper.
 * @type {HTMLFormElement}
 */
const form = ml("form", null,
  ml("fieldset", null,
    ml("legend", null, "heading_overview_settings".i18n()),
    ml("p", null,
      ml("input", { "type": "checkbox", "id": "show-seo-preview" }),
      ml("label", { "for": "show-seo-preview" }, "checkbox_show_seo_preview".i18n()),
    ),
    ml("p", null,
      ml("input", { "type": "checkbox", "id": "fetch-robots-txt" }),
      ml("label", { "for": "fetch-robots-txt" }, "checkbox_fetch_robotstxt".i18n()),
      ml("span", { "class": "help-text" }, "help_checkbox_fetch_robotstxt".i18n(),
        makeIcon("icon-info", ICON_SIZE.SMALL, ICON_SIZE.SMALL)
      )
    ),
    ml("p", null,
      ml("label", { "for": "user-agent-list" }, "text_select_ua".i18n()),
      ml("select", { "id": "user-agent-list" }, ...user_agent_options),
    ),
    ml("p", null,
      ml("label", { "for": "copy-format" }, "text_copy_format".i18n()),
      ml("select", { "id": "copy-format" }, ...copy_format_options)
    ),
    ml("p", null,
      ml("label", { "for": "focus-keyword-primary" }, "text_focus_keyword_primary".i18n()),
      ml("input", { "type": "text", "id": "focus-keyword-primary", "dir": "auto", "placeholder": "text_focus_keyword_placeholder".i18n() })
    ),
    ml("p", null,
      ml("label", { "for": "focus-keyword-secondary" }, "text_focus_keyword_secondary".i18n()),
      ml("input", { "type": "text", "id": "focus-keyword-secondary", "dir": "auto", "placeholder": "text_focus_keyword_placeholder".i18n() })
    )
  )
);

content.appendChild(form);
//#endregion


//#region Wire settings to storage
/**
 * Initialises the settings form: loads current values from storage and wires
 * change events to save updates.
 * @returns {Promise<void>}
 */
async function initSettingsForm() {
  const entries = await Promise.all(
    Object.entries(SETTINGS_CONFIG).map(async ([key, config]) => [key, config, await getSetting(key, config.default)])
  );

  for (const [key, config, value] of entries) {
    const element = document.querySelector(config.selector);

    if (!element) {
      continue;
    }

    setElementValue(element, value);

    element.addEventListener("change", event => {
      saveSetting(key, getElementValue(event.target));
    });
  }
}

document.addEventListener("DOMContentLoaded", initSettingsForm);
//#endregion

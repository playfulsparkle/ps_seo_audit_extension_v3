"use strict";

//#region Constants
const ICON_SIZE = Object.freeze({ SMALL: 16 });

const ML_ON_PREFIX_LENGTH = 2;

const SANITIZE_URL_ATTRS = new Set(["href", "src", "action", "formaction", "xlink:href"]);
const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const ALLOWED_IMAGE_PROTOCOLS = new Set(["http:", "https:", "data:"]);

const SETTINGS_CONFIG = Object.freeze({
  "show-seo-preview": { selector: "#show-seo-preview", default: true },
  "fetch-robots-txt": { selector: "#fetch-robots-txt", default: true },
  "user-agent": { selector: "#user-agent-list", default: "*" }
});

const CRAWLER_LIST = Object.freeze([
  "Googlebot",
  "Googlebot-Image",
  "Googlebot-Video",
  "Googlebot-News",
  "Googlebot-Mobile",
  "Googlebot-Adsbot",
  "Bingbot",
  "Slurp",
  "Baiduspider",
  "Yandex Bot",
  "Sogou Spider",
  "Exabot",
  "Facebook External Hit",
  "DuckDuckBot",
  "Applebot",
  "SemrushBot",
  "Anthropic-ai",
  "Applebot-Extended",
  "AwarioRssBot",
  "AwarioSmartBot",
  "BLEXBot",
  "CCBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "Cohere-ai",
  "GPTBot",
  "ImagesiftBot",
  "MJ12bot",
  "Omgili",
  "Omgilibot",
  "PerplexityBot",
  "RavenCrawler",
  "rogerbot",
  "Screaming Frog SEO Spider",
  "SearchmetricsBot",
  "serpstatbot",
  "Alexa Crawler",
]);
//#endregion


//#region i18n / storage helpers
String.prototype.i18n = function (substitutions = "") {
  return chrome.i18n.getMessage(this.toString(), substitutions) || this.toString();
};

async function saveSetting(offset, value) {
  try {
    await chrome.storage.local.set({ [offset]: value });
    return true;
  } catch {
    return false;
  }
}

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

function isSafeUrlAttrValue(attrName, value) {
  try {
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

const ICON_CACHE = Object.create(null);

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
function getElementValue(element) {
  return element.type === "checkbox" ? element.checked : element.value;
}

function setElementValue(element, value) {
  if (element.type === "checkbox") {
    element.checked = Boolean(value);
  } else {
    element.value = value;
  }
}
//#endregion


//#region Build the form
const content = document.querySelector("#content");

const user_agent_options = [
  ml("option", { "value": "*" }, "text_ua_wildcard".i18n()),
  ...CRAWLER_LIST.map(crawler => ml("option", null, crawler))
];

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
  )
);

content.appendChild(form);
//#endregion


//#region Wire settings to storage
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

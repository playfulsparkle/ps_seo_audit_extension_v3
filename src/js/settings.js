"use strict";

const ICON_SMALL_WIDTH = 16;
const ICON_SMALL_HEIGHT = 16

String.prototype.i18n = function (substitutions = null) {
  const translation = chrome.i18n.getMessage(this.toString(), substitutions);
  return translation || null;
};

async function saveSetting(offset, value) {
  try {
    return await chrome.storage.local.set({ [offset]: value });
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

function ml(tagName, props, ...children) {
  const ON_PREFIX_LENGTH = 2;

  const el = document.createElement(tagName);

  // Set properties and event listeners
  if (props) {
    for (const name in props) {
      if (name.indexOf("on") === 0) {
        el.addEventListener(name.slice(ON_PREFIX_LENGTH).toLowerCase(), props[name], false);
      } else if (name === "className" && Object.prototype.toString.call(props[name]) === '[object Array]') {
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
    for (const nestedChild of child) {
      appendChildren(el, nestedChild);
    }
  } else if (child instanceof Node) {
    el.appendChild(child);
  }
}

const icon_list = Object.assign({ __proto__: null }, {});

function makeIcon(icon_name, width, height) {
  const key = icon_name + width + height;

  if (!icon_list[key]) {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("class", `icon ${icon_name}`);
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("width", width);
    icon.setAttribute("height", height);

    const icon_use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    icon_use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", `#${icon_name}`);

    icon.appendChild(icon_use);

    icon_list[key] = icon;
  }

  return icon_list[key].cloneNode(true);
}

const crawler_list = [
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
];


const content = document.querySelector("#content");

const user_agent_options = [];

user_agent_options.push(ml("option", { "value": "*" }, "text_ua_wildcard".i18n()));

for (const crawler of crawler_list) {
  user_agent_options.push(ml("option", null, crawler));
}

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
        makeIcon("icon-info", null, ICON_SMALL_WIDTH, ICON_SMALL_HEIGHT)
      )
    ),
    ml("p", null,
      ml("label", { "for": "user-agent-list" }, "text_select_ua".i18n()),
      ml("select", { "id": "user-agent-list" }, ...user_agent_options),
    ),
  )
);

content.appendChild(form);

document.addEventListener("DOMContentLoaded", async () => {
  const settings = {
    "show-seo-preview": { selector: "#show-seo-preview", default: true },
    "fetch-robots-txt": { selector: "#fetch-robots-txt", default: true },
    "user-agent": { selector: "#user-agent-list", default: "*" }
  };

  const settingKeys = Object.keys(settings);

  const fetchedSettings = await Promise.all(settingKeys.map(key => getSetting(key, settings[key].default)));

  for (let index = 0; index < settingKeys.length; index++) {
    const key = settingKeys[index];
    const element = document.querySelector(settings[key].selector);
    const value = fetchedSettings[index];

    if (element) {
      if (element.type === "checkbox") {
        element.checked = value;
      } else {
        element.value = value;
      }

      element.addEventListener("change", async e =>
        saveSetting(key, e.target.type === "checkbox" ? e.target.checked : e.target.value)
      );
    }
  }
});

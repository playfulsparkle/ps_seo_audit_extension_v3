"use strict";

const HTTP_STATUS_CODE_OK = 200;
const HTTP_STATUS_CODE_FOUND = 302;

const DEFAULT_REQUEST_TIMEOUT = 3000;

const MIN_DESC_LENGTH = 70;
const MAX_DESC_LENGTH = 155;

async function getSetting(offset, default_value = null) {
  try {
    const result = await chrome.storage.local.get(offset);

    return result[offset] ?? default_value;
  } catch {
    return default_value;
  }
}

function resolveUrl(url) {
  if (typeof url !== "string") {
    return null;
  }

  if (
    url.trim().length === 0
    || url.startsWith("#")
    || url.startsWith("mailto:")
    || url.startsWith("javascript:")
    || url.startsWith("sms:")
    || url.startsWith("tel:")
  ) {
    return null;
  }

  try {
    const base = window.location.origin === "null" ? document.baseURI || window.location.href : window.location.origin;

    if (url.startsWith("http://") || url.startsWith("https://")) {
      return new URL(url);
    } else if (url.startsWith("//")) {
      return new URL(window.location.protocol + url);
    }

    return new URL(url, base);
  } catch {
    return null;
  }
}

function fancyFormatUrl(url) {
  if (typeof url !== "string") {
    return "";
  }

  let parsed_url;

  try {
    parsed_url = new URL(url);
  } catch {
    return "";
  }

  let pathSegments = [];

  if (parsed_url.origin !== "null") {
    pathSegments.push(parsed_url.origin);
  }

  pathSegments = pathSegments.concat(
    parsed_url.pathname.split("/").filter(Boolean).map(segment => decodeURIComponent(segment))
  );

  return pathSegments.join(" › ");
}

function parseRichSnippets() {
  const all_rich_snippets = document.querySelectorAll('script[type="application/ld+json"]');

  const rich_snippets = Object.create(null);

  if (all_rich_snippets.length > 0) {
    for (let index = 0; index < all_rich_snippets.length; index++) {
      try {
        const rich_snippet = JSON.parse(all_rich_snippets[index].textContent || all_rich_snippets[index].innerText);

        if (Object.prototype.hasOwnProperty.call(rich_snippet, "@graph")) {
          const groups = rich_snippet["@graph"];

          for (const group of groups) {
            const key = group["@type"].toLowerCase();

            rich_snippets[key] = flattenJSON(group);
          }
        } else {
          const key = rich_snippet["@type"].toLowerCase();

          rich_snippets[key] = flattenJSON(rich_snippet);
        }
      } catch {
        continue;
      }
    }
  }

  return rich_snippets;
}

function flattenJSON(obj, parent = "", res = [], indentLevel = 0) {
  if (typeof parent !== "string") {
    return null;
  }

  if (!Array.isArray(res)) {
    return null;
  }

  const INDENTATION = 4;

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];

      const indentedKey = "&nbsp;".repeat(indentLevel * INDENTATION) + key; // Indentation using non-breaking spaces

      if (typeof value === "object" && !Array.isArray(value)) {
        // Recursively flatten nested objects with increased indentation level
        flattenJSON(value, `${indentedKey}.`, res, indentLevel + 1);
      } else if (Array.isArray(value)) {
        // Add the parent key once
        res.push({ key: indentedKey, value: "" });

        for (const [index, item] of value.entries()) {
          if (typeof item === "object") {
            flattenJSON(item, `${key} ${index}.`, res, indentLevel + 1);
          } else {
            const itemKey = "&nbsp;".repeat((indentLevel + 1) * INDENTATION) + `${index}`;
            res.push({ key: itemKey, value: item.toString() });
          }
        }
      } else if (typeof value === "string") {
        res.push({ key: indentedKey, value: value || null }); // Push the indented key-value pair
      }
    }
  }

  return res;
}

function getImageStatistics() {
  const img_elements = document.querySelectorAll("img[src]");

  const result = Object.assign(Object.create(null), {
    total_images: 0,
    images_without_alt: 0,
    images_list_without_alt: [],
    modern_image_formats: [],
    legacy_image_formats: [],
  });

  const modern_image_formats = ["webp", "avif", "jp2", "j2k", "jxr", "svg", "heif", "heic"];
  const legacy_image_formats = ["png", "jpg", "jpeg", "jpe", "gif"];

  if (img_elements.length > 0) {
    for (let index = 0; index < img_elements.length; index++) {
      const img = img_elements[index];

      const src = img.getAttribute("src");

      const extension = src.split(".").pop().toLowerCase();

      if (!getImageMimeType(extension)) { // Check for valid image type
        continue;
      }

      if (!result.modern_image_formats.includes(extension) && modern_image_formats.includes(extension)) {
        result.modern_image_formats.push(extension);
      } else if (!result.legacy_image_formats.includes(extension) && legacy_image_formats.includes(extension)) {
        result.legacy_image_formats.push(extension);
      }

      const alt_text = img.getAttribute("alt")?.trim() || null;

      if (!alt_text) {
        const parsed_url = resolveUrl(src);

        if (parsed_url) {
          result.images_without_alt++;

          img.setAttribute("data-ps-locate", `img-${index}`);

          result.images_list_without_alt.push({ "url": parsed_url?.toString(), "src": src, "counter": index });
        }
      }

      result.total_images++;
    }
  }

  return result;
}

function getTextContent(element) {
  if (typeof element !== "object") {
    return null;
  }

  const MAX_DOM_DEEP = 100;

  let text = "";
  const stack = [element];
  let counter = 0;
  const allowed_elements = ["a", "span", "div", "b", "i", "strong", "em", "p", "h1", "h2", "h3", "h4", "h5", "h6"];

  while (stack.length > 0 && counter < MAX_DOM_DEEP) {
    const node = stack.pop();
    const node_name = node.nodeName.toLowerCase();

    if (!allowed_elements.includes(node_name)) {
      continue;
    }

    for (const childNode of node.childNodes) {
      if (childNode.nodeType === Node.TEXT_NODE) {
        text += childNode.textContent.trim() + " ";
      } else if (childNode.nodeType === Node.ELEMENT_NODE) {
        stack.push(childNode);
      }
    }

    counter++;
  }

  return text.trim() || null;
}

function getLinkStatistics() {
  const link_elements = document.querySelectorAll("link[href]");

  const result = Object.assign(Object.create(null), {
    canonical: null,
    alternate: [],
    language: [],
    navigation: Object.create(null),
    performance: Object.create(null),
    icons: [],
    stylesheet: []
  });

  if (link_elements.length > 0) {
    // Define valid relationships for each category
    const validNavigationRels = ["search", "prev", "next", "sitemap", "license"];
    const validPerformanceRels = ["preload", "dns-prefetch", "prefetch", "preconnect", "amphtml", "manifest"];

    for (let index = 0; index < link_elements.length; index++) {
      const link_element = link_elements[index];
      const name = link_element.getAttribute("rel")?.toLowerCase().trim();

      const href = link_element.getAttribute("href").trim();

      const parsed_url = resolveUrl(href)?.toString() || null;

      if (name === "canonical") { // Canonical links: Only one should be present
        result.canonical = parsed_url;
      } else if (name === "alternate" && link_element.hasAttribute("hreflang")) { // Handle language alternates
        const hreflang = link_element.getAttribute("hreflang").trim() || null; // Make empty string null

        result.language.push({
          "hreflang": hreflang,
          "href": parsed_url
        });
      } else if (name === "alternate" && link_element.hasAttribute("type")) {
        const type = link_element.getAttribute("type").trim() || null; // Make empty string null

        result.alternate.push({
          "name": name,
          "type": type,
          "href": parsed_url
        });
      } else if (validNavigationRels.includes(name)) { // Group navigational links
        result.navigation[name] = parsed_url;
      } else if (validPerformanceRels.includes(name)) { // Group performance-related links
        result.performance[name] = parsed_url;
      } else if (name === "stylesheet") { // Handle stylesheet
        if (!result.stylesheet.includes(parsed_url)) {
          result.stylesheet.push(parsed_url);
        }
      } else if (name.includes("icon") || name.includes("shortcut")) { // Handle icons
        const type = link_element.getAttribute("type")?.trim() || getImageMimeType(parsed_url); // ?.trim returns undefined or empty string -> null
        const sizes = link_element.getAttribute("sizes")?.trim() || null; // ?.trim returns undefined or empty string -> null

        result.icons.push({
          "name": name,
          "type": type,
          "sizes": sizes,
          "href": parsed_url
        });
      }
    }

    // Sort icons by size
    result.icons.sort((a, b) => {
      const sizeA = !a.sizes ? -Infinity : parseInt(a.sizes.split("x")[0], 10) || 0;
      const sizeB = !b.sizes ? -Infinity : parseInt(b.sizes.split("x")[0], 10) || 0;

      // Sort in descending order, and ensure null is at the end
      if (sizeA === -Infinity) { // Move null to the end
        return 1;
      } else if (sizeB === -Infinity) { // Move null to the end
        return -1;
      }

      return sizeB - sizeA; // Sort by size, largest to smallest
    });
  }

  return result;
}

function getImageMimeType(filename) {
  if (typeof filename !== "string") {
    return null;
  }

  const extension = filename.split(".").pop().toLowerCase();

  const imageMimeTypes = {
    "jpg": "image/jpeg",
    "jpe": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "bmp": "image/bmp",
    "webp": "image/webp",
    "svg": "image/svg+xml",
    "ico": "image/vnd.microsoft.icon",
    "tif": "image/tiff",
    "tiff": "image/tiff",
    "apng": "image/apng",
    "avif": "image/avif",
  };

  return imageMimeTypes[extension] || null; // Return null if not an image type
}

function isBlockedByRobots(robots_txt_rules, setting_ua, pathname) {
  if (typeof robots_txt_rules !== "object") {
    return false;
  }

  if (typeof setting_ua !== "string") {
    return false;
  }

  if (typeof pathname !== "string") {
    return false;
  }

  try {
    // Iterate through all user-agent rules in robots_txt_rules
    for (const userAgent in robots_txt_rules) {
      if (userAgent.toLowerCase() !== setting_ua.toLowerCase()) {
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(robots_txt_rules, userAgent)) {
        const rules = robots_txt_rules[userAgent];

        // Check if the URL matches a Disallow rule and doesn"t match an Allow rule
        const is_disallowed = rules.disallow.some(regex => regex.test(pathname));
        const is_allowed = rules.allow.some(regex => regex.test(pathname));

        // If the current set of rules blocks the pathname, return true
        if (is_disallowed && !is_allowed) {
          return true;
        }
      }
    }

    // If no match found in any user-agent"s rules, the path is allowed
    return false;
  } catch {
    return false; // Default behavior in case of an error
  }
}

function getHyperlinkStatistics(robots_txt_rules, setting_ua) {
  if (typeof robots_txt_rules !== "object") {
    return false;
  }

  if (typeof setting_ua !== "string") {
    return false;
  }

  const link_elements = document.querySelectorAll("a[href]");

  const result = Object.assign(Object.create(null), {
    total_internal: 0,
    total_external: 0,
    internal_links: [],
    external_links: []
  });

  if (link_elements.length > 0) {
    const origin_domain = window.location.hostname;

    for (let index = 0; index < link_elements.length; index++) {
      const link_element = link_elements[index];

      const href = link_element.getAttribute("href");

      const parsed_url = resolveUrl(href);

      if (!parsed_url) {
        continue;
      }

      // Skip unwanted protocols
      const url_string = parsed_url.toString();
      const link_domain = parsed_url.hostname;

      if (link_domain === origin_domain) {
        result.total_internal++;
      }

      link_element.setAttribute("data-ps-locate", `link-${index}`);

      // Get the "rel" attribute values
      const rel = link_element.getAttribute("rel");

      // rel value can either null or "null"
      const rel_array = (rel && rel !== "null") ? rel.split(" ").map(item => item.trim()) : [];

      // Get anchor text, or alternative text from an image if anchor text is empty
      let anchorText = getTextContent(link_element); // returns null

      // If no text found, check for an image and try to use the alt or title attributes.
      if (!anchorText) {
        const img = link_element.querySelector("img");

        if (img) {
          anchorText = img.getAttribute("alt") || img.getAttribute("title") || null; // Return empty string if undefined
        }
      }

      // Check if it"s internal or external
      if (link_domain === origin_domain) {
        let is_blocked = false;

        if (robots_txt_rules) {
          is_blocked = isBlockedByRobots(robots_txt_rules, setting_ua, parsed_url.pathname);
        }

        result.internal_links.push({ "url": url_string, "anchor": anchorText, "is_blocked": is_blocked, "rel": rel_array, "counter": index });
      } else {
        result.total_external++;

        result.external_links.push({ "url": url_string, "anchor": anchorText, "rel": rel_array, "counter": index });
      }
    }
  }

  return result;
}


function groupMetaElements() {
  const meta_elements = document.querySelectorAll("meta");

  const result = Object.assign(Object.create(null), {
    facebook: Object.create(null),
    twitter: Object.create(null),
    dublin_core: Object.create(null),
    general: Object.create(null),
    other: Object.create(null)
  });

  if (meta_elements.length > 0) {
    const general_meta_keys = ["description", "keywords", "publisher", "author", "copyright", "robots", "googlebot", "viewport"];

    for (let index = 0; index < meta_elements.length; index++) {
      const meta_element = meta_elements[index];
      const name = meta_element.getAttribute("name")?.toLowerCase() || meta_element.getAttribute("property")?.toLowerCase();
      const content = meta_element.getAttribute("content")?.toString();

      if (name) {
        if (name.startsWith("og:") || name.startsWith("fb:") || name.startsWith("article:") || name.startsWith("product:")) {
          // Group Facebook (Open Graph) meta tags
          result.facebook[name] = content || null;
        } else if (name.startsWith("twitter:")) {
          // Group Twitter meta tags
          result.twitter[name] = content || null;
        } else if (name.startsWith("dc.")) {
          // Group Dublin Core meta tags
          result.dublin_core[name] = content || null;
        } else if (general_meta_keys.includes(name)) {
          // General meta tags
          result.general[name] = content || null;
        } else {
          // Other general meta tags
          result.other[name] = content || null;
        }
      }
    }
  }

  return result;
}

function getSEOStatistics() {
  const text = document.body.innerText;
  const words = text.trim().split(/\s+/);
  const word_count = words.length;
  const character_count = text.replace(/\s+/g, "").length; // Remove spaces for character count
  const sentence_count = text.split(/[.!?]/).filter(Boolean).length; // Rough sentence count

  // Calculate average sentence length
  const avg_sentence_length = sentence_count ? (word_count / sentence_count) : 0;

  // Calculate average word length
  const avg_word_length = character_count / word_count;

  return {
    word_count,
    character_count,
    sentence_count,
    avg_word_length: parseFloat(avg_word_length),
    avg_sentence_length: parseFloat(avg_sentence_length)
  };
}

function extractHeadings() {
  const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");

  const headingStats = Object.assign(Object.create(null), { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 });
  const nestingErrors = Object.create(null);
  let emptyErrors = 0;

  const root = [];
  const stack = [{ level: 0, children: root }]; // Root stack initialization

  let previousLevel = 0;

  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index];

    const level = parseInt(heading.tagName[1], 10);
    const headingText = heading.textContent.trim();

    heading.setAttribute("data-ps-locate", `heading-${index}`);

    if (headingText.length === 0) {
      emptyErrors++;
    }

    // Update heading statistics
    headingStats[`h${level}`]++;

    // Detect incorrect nesting
    if (level > previousLevel + 1) {
      const errorKey = `${previousLevel}-${level}`;

      if (!nestingErrors[errorKey]) {
        nestingErrors[errorKey] = {
          previous_level: previousLevel,
          current_level: level,
          occurrences: 0,
          examples: []
        };
      }

      nestingErrors[errorKey].occurrences++;

      if (!nestingErrors[errorKey].examples.some(ex => ex.heading_text === headingText)) {
        nestingErrors[errorKey].examples.push({
          tag_name: heading.tagName,
          heading_text: headingText,
        });
      }
    }

    // Ensure proper hierarchical structure
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    // Add current heading
    const newHeading = { tagName: heading.tagName, text: headingText, counter: index, children: [] };

    stack[stack.length - 1].children.push(newHeading);

    // Push to stack for potential child elements
    stack.push({ level, children: newHeading.children });

    previousLevel = level;
  }

  return {
    tree: root,
    heading_stats: headingStats,
    nesting_errors: nestingErrors,
    empty_errors: emptyErrors
  };
}

function createSafeRegExp(value) {
  if (typeof value !== "string") {
    return false;
  }

  const REGEXP_MAX_LENGTH = 100;

  if (value.length > REGEXP_MAX_LENGTH) { // Limit input length to avoid excessive processing
    return null;
  }

  try {
    const sanitized_value = value
      .replace(/[#-.]|[[-^]|[?|{}]/gu, "\\$&")
      .replace(/\*/gu, ".*");

    return new RegExp(sanitized_value, RegExp.prototype.unicode);
  } catch {
    return null;
  }
}

function parseRobotsTxt(content) {
  if (typeof content !== "string") {
    return false;
  }

  const result = Object.assign(Object.create(null), {
    rules: Object.create(null),
    sitemaps: []
  });

  const new_content = [];

  for (const line of content.split("\n")) {
    const trimmedLine = line.trim();

    // Ignore comments and empty lines
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    // Find the first colon, which separates the directive and value
    const colonIndex = trimmedLine.indexOf(":");

    // If no colon is found, skip the line
    if (colonIndex === -1) {
      continue;
    }


    const directive = trimmedLine.slice(0, colonIndex).trim().toLowerCase();
    const value = trimmedLine.slice(colonIndex + 1).trim(); // Everything after the colon is the value

    if (!directive || !value) {
      continue;
    }

    new_content.push({ directive: directive, value: value });
  }

  let user_agent_list = [];
  let same_ua = false;

  // Handle case when robots.txt does not start with User-Agent
  if (new_content[0] && new_content[0].directive !== "user-agent") {
    new_content.unshift({ directive: "user-agent", value: "*" });
  }

  for (let index = 0; index < new_content.length; index++) {
    const current = new_content[index];
    const next = new_content[index + 1];

    if (current.directive === "user-agent") {
      user_agent_list.push(current.value);

      if (!result.rules[current.value]) {
        result.rules[current.value] = { allow: [], disallow: [] };
      }
    } else if (current.directive === "allow") {
      const regex = createSafeRegExp(current.value);

      for (const agent of user_agent_list) {
        if (regex) {
          result.rules[agent].allow.push(regex);
        }
      }

      same_ua = true;
    } else if (current.directive === "disallow") {
      const regex = createSafeRegExp(current.value);

      for (const agent of user_agent_list) {
        if (regex) {
          result.rules[agent].disallow.push(regex);
        }
      }

      same_ua = true;
    } else if (current.directive === "crawl-delay") {
      const crawlDelay = parseFloat(current.value);

      if (!isNaN(crawlDelay)) {
        for (const agent of user_agent_list) {
          result.rules[agent].crawlDelay = crawlDelay;
        }
      }

      same_ua = true;
    } else if (current.directive === "sitemap") {
      const parsed_url = resolveUrl(current.value);

      if (parsed_url) {
        result.sitemaps.push(parsed_url?.toString());
      }
    }

    if (next && same_ua === true && next.directive === "user-agent") {
      same_ua = false;
      user_agent_list = [];
    }
  }

  return result;
}

async function getResponseStats(url, options = {}, timeout = DEFAULT_REQUEST_TIMEOUT) {
  if (typeof url !== "string") {
    return false;
  }

  if (typeof options !== "object") {
    return false;
  }

  if (typeof timeout !== "number") {
    return false;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, { ...options, mode: "cors", signal: controller.signal });

    clearTimeout(timer);

    return { "headers": response.headers, "status": response.status, "response_body": await response.text() };
  } catch {
    return null;
  }
}

async function getPageIconFromIcons(all_icons) {
  if (!Array.isArray(all_icons)) {
    return null;
  }

  const MAX_ICON_LINKS = 3;
  const icon_links = all_icons.slice(0, MAX_ICON_LINKS);

  for (const icon_link of icon_links) {
    const result = await getFaviconUrlAsData(icon_link.href);

    if (result) {
      return result;
    }
  }

  return null;
}

async function getFaviconUrlAsData(url, timeout = DEFAULT_REQUEST_TIMEOUT) {
  if (typeof url !== "string") {
    return false;
  }

  if (typeof timeout !== "number") {
    return false;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const options = Object.assign(Object.create(null), {
      mode: "cors",
      signal: controller.signal
    });

    const response = await fetch(url, options);

    clearTimeout(timer);

    const blob = await response.blob();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function getPreviewDescription(meta_elements) {
  const meta_keys = ["description", "og:description", "twitter:description", "dc.description"];

  for (const key of meta_keys) {
    for (const group in meta_elements) {
      if (
        Object.prototype.hasOwnProperty.call(meta_elements, group) &&
        meta_elements[group][key] &&
        meta_elements[group][key].length >= MIN_DESC_LENGTH
      ) {
        return meta_elements[group][key];
      }
    }
  }

  const mainContent = document.querySelector("main")
    || document.querySelector("article")
    || document.querySelector('[id*="main-content"], [class*="main-content"]')
    || document.body
    || "";

  return mainContent.innerText.slice(0, MAX_DESC_LENGTH).trim();
}

async function extractMetadata() {
  const setting_ua = await getSetting("user-agent", "*");
  const setting_fetch_robotstxt = await getSetting("fetch-robots-txt", false);

  let robots_txt_rules = null;
  let robots_txt_sitemaps = [];
  let robots_txt_exists = true;

  if (setting_fetch_robotstxt) {
    const origin_domain = window.location.origin === "null"
      ? window.location.href
      : window.location.origin;

    const robots_txt_stat = await getResponseStats(origin_domain + "/robots.txt");

    if (robots_txt_stat) {
      const parsed_robots_txt = parseRobotsTxt(robots_txt_stat.response_body);

      robots_txt_rules = parsed_robots_txt.rules;
      robots_txt_sitemaps = parsed_robots_txt.sitemaps;
      robots_txt_exists = [HTTP_STATUS_CODE_OK, HTTP_STATUS_CODE_FOUND].includes(robots_txt_stat?.status ?? 0);
    }
  }

  const page_title = document.title.trim() || null;
  const page_language = document.documentElement.lang.trim() || null;

  const page_links = getLinkStatistics();
  const meta_elements = groupMetaElements();




  let seo_preview = Object.create(null);

  const show_seo_preview = await getSetting("show-seo-preview", false);

  if (show_seo_preview) {
    seo_preview = {
      "title": page_title,
      "breadcrumb": fancyFormatUrl(window.location.href),
      "description": getPreviewDescription(meta_elements),
      "favicon": await getPageIconFromIcons(page_links.icons) || "/icons/broken-image.svg"
    };
  }

  return {
    "url": window.location.href,
    "title": page_title,
    "language": page_language,
    "robots_txt_exists": robots_txt_exists,
    "robots_txt_sitemaps": robots_txt_sitemaps,
    "rich_snippets": parseRichSnippets(),
    "metas": meta_elements,
    "hyperlinks": getHyperlinkStatistics(robots_txt_rules, setting_ua),
    "links": page_links,
    "images": getImageStatistics(),
    "seo_stats": getSEOStatistics(),
    "headings": extractHeadings(),
    "preview": seo_preview
  };
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getPageData") {
    sendResponse(extractMetadata());
  }

  return true;
});

let styles_disabled = false;

browser.runtime.onMessage.addListener(message => {
  if (message.action === "highlightElement" && message.locate_id) {
    if (!styles_disabled) {
      document.querySelectorAll('link[rel="stylesheet"], style').forEach(link => {
        if (!link.hasAttribute("disabled")) {
          link.setAttribute("disabled", "");
        }
      });

      styles_disabled = true;
    }

    for (const element of document.querySelectorAll(".ps-highlight")) {
      element.classList.remove("ps-highlight");
    }

    for (const element of document.querySelectorAll("[data-ps-locate]")) {
      if (element.getAttribute("data-ps-locate") === message.locate_id) {
        element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        element.classList.add("ps-highlight");
        break;
      }
    }
  }
});

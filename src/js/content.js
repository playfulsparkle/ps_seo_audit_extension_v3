"use strict";

const HTTP_STATUS_CODE_OK = 200;
const HTTP_STATUS_CODE_FOUND = 302;

const DEFAULT_REQUEST_TIMEOUT = 3000;

const ALLOWED_URL_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Retrieves a setting from Chrome's local storage.
 *
 * @param {string} offset - The key to retrieve from storage.
 * @param {any} [default_value=null] - The default value if the key is not found.
 * @returns {Promise<any>} A promise that resolves to the stored value or the default value if not found.
 */
async function getSetting(offset, default_value = null) {
  try {
    const result = await chrome.storage.local.get(offset);

    return result[offset] ?? default_value;
  } catch {
    return default_value;
  }
}

/**
 * Resolves a given URL relative to the current document's base URI or origin.
 *
 * This function checks if the URL is a valid string and does not start with potentially unsafe protocols like
 * "mailto:", "javascript:", "sms:", "tel:", or "#" before attempting to resolve the URL.
 * It resolves both absolute and relative URLs based on the document's current location.
 *
 * @param {string} url - The URL to be resolved. It can be either relative or absolute.
 * @returns {URL|null}
 *   - Returns a resolved `URL` object if the URL is valid.
 *   - Returns `null` if the URL is invalid, starts with a disallowed protocol, or is empty.
 */
function parseValidUrl(url) {
  if (typeof url !== "string") {
    return null;
  }

  const trimmed = url.trim();

  if (trimmed.startsWith("#") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("sms:") ||
    trimmed.startsWith("tel:")) {
    return null;
  }

  // In opaque origins (data:, about:blank, sandboxed frames),
  // window.location.origin is the string "null". Use document.baseURI
  // to get the parent document's URL as a fallback base.
  const base = window.location.origin === "null"
    ? (document.baseURI || window.location.href)
    : window.location.origin;

  let parsed;

  try {
    parsed = trimmed.startsWith("//")
      ? new URL(window.location.protocol + trimmed)
      : new URL(trimmed, base);
  } catch {
    return null;
  }

  // Allowlist the parsed (normalized) protocol rather than blocklisting
  // the raw string — see earlier note on why this matters for things
  // like "javascript:", "data:", leading whitespace, and case variants.
  if (!ALLOWED_URL_PROTOCOLS.has(parsed.protocol)) {
    return null;
  }

  return parsed;
}

/**
 * Formats a URL into a human-readable breadcrumb-like structure.
 *
 * @param {string} url - The URL string to format.
 * @returns {string} A formatted string representation of the URL, or an empty string if the input is invalid.
 */
function fancyFormatUrl(url) {
  if (typeof url !== "string") {
    return "";
  }

  try {
    const parsed_url = new URL(url);

    let path_segments = [];

    // Only add origin if it's valid
    if (parsed_url.origin && parsed_url.origin !== "null") {
      path_segments.push(parsed_url.origin);
    }

    path_segments = path_segments.concat(
      parsed_url.pathname.split("/").filter(Boolean).map(segment => decodeURIComponent(segment))
    );

    return path_segments.join(" &rsaquo; ");
  } catch {
    return "";
  }
}

/**
 * Parses and extracts rich snippets in JSON-LD format from the document.
 *
 * This function searches for all `<script>` elements with a `type="application/ld+json"` attribute
 * in the document, parses the JSON data, and flattens the resulting JSON-LD content into a more readable format.
 * If the JSON-LD contains the `@graph` key, it processes each graph object separately.
 *
 * @returns {Object<string, Array<{key: string, value: string|null}>>}
 *   An object where:
 *   - The keys are the lowercased `@type` values from the JSON-LD objects.
 *   - The values are arrays of key-value pairs representing the flattened JSON structure of the rich snippet.
 *   Returns an empty object if no rich snippets are found or if parsing fails.
 */
/**
 * Normalizes a JSON-LD "@type" value into a lookup key. "@type" is legally either a
 * single string (e.g. "Place") or an array of strings for multi-typed nodes
 * (e.g. ["ProfessionalService", "Organization"]), and is occasionally missing entirely.
 *
 * @param {string|string[]|undefined} type
 * @returns {string|null} A lowercased key, or `null` if no usable type was present.
 */
function getSchemaTypeKey(type) {
  if (typeof type === "string" && type.length > 0) {
    return type.toLowerCase();
  }

  if (Object.prototype.toString.call(type) === '[object Array]') {
    const first = type.find(item => typeof item === "string" && item.length > 0);

    return first ? first.toLowerCase() : null;
  }

  return null;
}

function parseRichSnippets() {
  const rich_snippets = document.querySelectorAll('script[type="application/ld+json"]');

  if (rich_snippets.length === 0) {
    return Object.create(null);
  }

  const result = Object.create(null);

  for (let index = 0; index < rich_snippets.length; index++) {
    try {
      const rich_snippet = JSON.parse(rich_snippets[index].textContent || rich_snippets[index].textContent);

      if (Object.prototype.hasOwnProperty.call(rich_snippet, "@graph")) {
        const groups = rich_snippet["@graph"];

        for (const group of groups) {
          const key = getSchemaTypeKey(group["@type"]);

          if (key) {
            result[key] = flattenJSON(group);
          }
        }
      } else {
        const key = getSchemaTypeKey(rich_snippet["@type"]);

        if (key) {
          result[key] = flattenJSON(rich_snippet);
        }
      }
    } catch {
      continue;
    }
  }

  return result;
}

/**
 * Flattens a nested JSON object into an array of key-value pairs, where the key represents the path
 * to the original property and the value is the property's value.
 *
 * The function recursively traverses the object and creates an indented key for each property.
 * It handles both objects and arrays, flattening the structure into a more readable form.
 * If invalid arguments are provided, it returns an empty array.
 *
 * @param {Object} obj - The JSON object to flatten.
 * @param {string} [parent=""] - The parent key (used for recursion).
 * @param {Array<{key: string, value: string|null}>} [res=[]] - The result array (used for recursion).
 * @param {number} [indentLevel=0] - The current indentation level (used for recursion).
 *
 * @returns {Array<{key: string, value: string|null}>} - An array of objects where each object has:
 *   - `key`: The indented key path.
 *   - `value`: The corresponding value or null if the value is empty.
 *   Returns an empty array if the input is invalid.
 */
function flattenJSON(obj, parent = "", result = [], indentLevel = 0) {
  if (typeof parent !== "string" || Object.prototype.toString.call(result) !== '[object Array]') {
    return []; // Return an empty array instead of null
  }

  const INDENTATION = 4;

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];

      const indentedKey = "&nbsp;".repeat(indentLevel * INDENTATION) + key; // Indentation using non-breaking spaces

      if (typeof value === "object" && Object.prototype.toString.call(value) !== '[object Array]') {
        // Recursively flatten nested objects
        flattenJSON(value, `${indentedKey}.`, result, indentLevel + 1);
      } else if (Object.prototype.toString.call(value) === '[object Array]' && value.length > 0) {
        // Add the parent key once
        result.push({
          "key": indentedKey,
          "value": ""
        });

        for (const [index, item] of value.entries()) {

          if (typeof item === "object") {
            // Flatten object items in array
            flattenJSON(item, `${key} ${index}.`, result, indentLevel + 1);
          } else {
            const itemKey = "&nbsp;".repeat((indentLevel + 1) * INDENTATION) + `${index}`;

            result.push({
              "key": itemKey,
              "value": item.toString()
            });
          }

        }

      } else if (typeof value === "string") {
        // Push the indented key-value pair
        result.push({
          "key": indentedKey,
          "value": value || null
        });
      }
    }
  }

  return result; // Always return the result array
}

function getFileExt(filename) {
  return filename.indexOf('.') !== -1 ? filename.split(".").pop().toLowerCase() : "";
}

/**
 * Gathers statistics on images within the document.
 *
 * @returns {{
*   total_images: number,
*   images_without_alt: number,
*   images_list_without_alt: Array<{ url: string, src: string, counter: number }>,
*   modern_image_formats: string[],
*   legacy_image_formats: string[]
* }} An object containing image statistics, including total count, missing alt attributes, and image format types.
*/
function marshalImagesStatisticsDefaults() {
  return Object.assign(Object.create(null), {
    "total_images": 0,
    "images_without_alt": 0,
    "images_list_without_alt": [],
    "all_image_list": [],
    "modern_image_formats": [],
    "legacy_image_formats": [],
  });
}

function getImageStatistics() {
  const result = marshalImagesStatisticsDefaults();

  const img_elements = document.querySelectorAll("img[src]");

  if (img_elements.length === 0) {
    return result;
  }

  const modern_image_formats = ["webp", "avif", "jp2", "j2k", "jxr", "svg", "heif", "heic"];
  const legacy_image_formats = ["png", "jpg", "jpeg", "jpe", "gif"];

  for (let index = 0; index < img_elements.length; index++) {
    const img = img_elements[index];

    const src = img.getAttribute("src");

    if (src.startsWith("data:")) {
      continue; // Skip data URLs
    }

    if (!getImageMimeType(src)) { // Check for valid image type
      continue;
    }

    const extension = getFileExt(src);

    if (result.modern_image_formats.indexOf(extension) === -1 && modern_image_formats.indexOf(extension) !== -1) {
      result.modern_image_formats.push(extension);
    } else if (result.legacy_image_formats.indexOf(extension) === -1 && legacy_image_formats.indexOf(extension) !== -1) {
      result.legacy_image_formats.push(extension);
    }

    const alt_text = img.getAttribute("alt")?.trim() || null; // empty string or undefined = null

    const parsed_url = parseValidUrl(src);

    if (!alt_text) {
      result.images_without_alt++;

      img.setAttribute("data-ps-locate", `img-${index}`);

      result.images_list_without_alt.push({ "url": parsed_url?.toString(), "src": src, "counter": index });
    }

    result.all_image_list.push({ "url": parsed_url?.toString(), "src": src, "alt": alt_text });

    result.total_images++;
  }

  return result;
}

function getTextContent(element) {
  if (!(element instanceof Element)) {
    return null;
  }

  // Blocked tags (skip these entirely)
  const excludedTags = new Set([
    'script', 'style', 'noscript', 'meta',
    'link', 'template', 'head', 'iframe',
    'object', 'embed', 'param', 'canvas',
    'audio', 'video', 'source', 'track',
    'input', 'textarea', 'select', 'button',
    'form', 'label', 'fieldset', 'output'
  ]);

  const MAX_NODES = 2000;
  let processed = 0;

  function collectText(node) {
    if (processed >= MAX_NODES) {
      return "";
    }

    if (node.nodeType === Node.TEXT_NODE) {
      processed++;
      return node.textContent;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName.toLowerCase();
      if (excludedTags.has(tag)) {
        return "";
      }

      // Recursively process child nodes
      const parts = [];
      for (const child of node.childNodes) {
        const text = collectText(child);

        if (text) {
          parts.push(text);
        }

        if (processed >= MAX_NODES) {
          break;
        }
      }

      // Join child results with a single space – this fixes missing spaces
      return parts.join(" ");
    }

    return "";
  }

  const text = collectText(element);
  return text.replace(/\s+|\r\n|\n|\r/g, " ").trim() || null;
}

function marshalLinkStatisticsDefaults() {
  return Object.assign(Object.create(null), {
    "canonical": null,
    "alternate": [],
    "language": [],
    "navigation": [],
    "performance": [],
    "icons": [],
    "stylesheet": []
  });
}

function getLinkStatistics() {
  const result = marshalLinkStatisticsDefaults();

  const link_elements = document.querySelectorAll("link[href]");

  if (link_elements.length === 0) {
    return result;
  }

  // Define valid relationships for each category
  const validNavigationRels = ["search", "prev", "next", "sitemap", "license"];
  const validPerformanceRels = ["preload", "dns-prefetch", "prefetch", "preconnect", "amphtml", "manifest"];

  for (let index = 0; index < link_elements.length; index++) {
    const link_element = link_elements[index];
    const name = link_element.getAttribute("rel")?.toLowerCase().trim();

    const href = link_element.getAttribute("href").trim();

    const parsed_url = parseValidUrl(href)?.toString() || null; // empty string or undefined = null

    if (name === "canonical") { // Canonical links: Only one should be present
      result.canonical = parsed_url;
    } else if (name === "alternate" && link_element.hasAttribute("hreflang")) { // Handle language alternates
      const hreflang = link_element.getAttribute("hreflang").trim() || null; // empty string or undefined = null

      result.language.push({
        "hreflang": hreflang,
        "href": parsed_url
      });
    } else if (name === "alternate" && link_element.hasAttribute("type")) {
      const type = link_element.getAttribute("type").trim() || null; // empty string or undefined = null

      result.alternate.push({
        "name": name,
        "type": type,
        "href": parsed_url
      });
    } else if (validNavigationRels.indexOf(name) !== -1) { // Group navigational links
      result.navigation.push({
        "name": name,
        "href": parsed_url
      });
    } else if (validPerformanceRels.indexOf(name) !== -1) { // Group performance-related links
      const preload_as = name === "preload" ? getPreloadAs(link_element.getAttribute("as") || null) : null; // empty string or undefined = null

      result.performance.push({
        "name": name,
        "preload_as": preload_as,
        "href": parsed_url
      });
    } else if (name === "stylesheet") { // Handle stylesheet
      const title = link_element.getAttribute("title")?.trim() || null; // empty string or undefined = null

      result.stylesheet.push({
        "href": parsed_url,
        "media": parseMediaAttribute(link_element.getAttribute("media") || null),
        "title": title,
        "disabled": link_element.hasAttribute("disabled")
      });
    } else if (name.indexOf("icon") !== -1 || name.indexOf("shortcut") !== -1) { // Handle icons
      const type = link_element.getAttribute("type")?.trim() || getImageMimeType(parsed_url); // ?.trim returns undefined or empty string -> null
      const sizes = link_element.getAttribute("sizes")?.trim() || null; // empty string or undefined = null

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

  return result;
}

function getPreloadAs(value) {
  if (typeof value !== "string") {
    return null;
  }

  // Check if the 'as' value is valid (add your validation criteria here)
  const validAsValues = [
    "audio", "document", "embed", "fetch", "object", "track", "video", "worker",
    "script", "style", "image", "font"
  ]; // Example valid values

  if (validAsValues.indexOf(value) !== -1) {
    return value; // Return valid 'as' value
  }

  return false; // If 'as' value is not valid, return false
}

function parseMediaAttribute(media) {
  if (typeof media !== "string") {
    return [];
  }

  const mediaQueries = [];

  let currentQuery = '';
  let insideParentheses = false;

  // Iterate over each character in the media string to properly group complex media queries
  for (let i = 0; i < media.length; i++) {
    const char = media[i];

    if (char === ',' && !insideParentheses) {
      // Split at comma if we're not inside parentheses (to handle media queries like "screen and (max-width: 600px)")
      mediaQueries.push(currentQuery.trim());
      currentQuery = '';
    } else {
      // Add the character to the current media query
      currentQuery += char;

      // Track if we're inside parentheses (for cases like "(max-width: 600px)")
      if (char === '(') {
        insideParentheses = true;
      } else if (char === ')') {
        insideParentheses = false;
      }
    }
  }

  // Push the last media query (in case it's not followed by a comma)
  if (currentQuery.trim()) {
    mediaQueries.push(currentQuery.trim());
  }

  return mediaQueries;
}

/**
 * Determines the MIME type for a given image file based on its extension.
 *
 * @param {string} filename - The filename or URL of the image.
 * @returns {string | null} The MIME type corresponding to the image extension, or null if not an image.
 */
function getImageMimeType(filename) {
  if (typeof filename !== "string") {
    return null;
  }

  const extension = getFileExt(filename);

  const imageMimeTypes = {
    "jpg": "image/jpeg",
    "jpe": "image/jpeg",
    "jpeg": "image/jpeg",
    "jp2": "image/x-jp2",
    "j2k": "image/x-jp2",
    "jxr": "image/vnd.ms-photo",
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
    "heif": "image/heif",
    "heic": "image/heic",
  };

  return imageMimeTypes[extension] || null;
}

/**
 * Analyzes all the hyperlinks on the current document and categorizes them as internal or external links.
 * Additionally checks if any internal links are blocked by the robots.txt rules for a specific user-agent.
 *
 * @param {object} robots_txt_rules - The parsed robots.txt rules grouped by user-agent.
 * @param {string} setting_ua - The user-agent string to check the rules for.
 * @returns {object} An object containing statistics about internal and external links:
 *   - total_internal {number}: The total number of internal links.
 *   - total_external {number}: The total number of external links.
 *   - internal_links {Array}: An array of internal link objects, each containing:
 *     - url {string}: The full URL of the link.
 *     - anchor_text {string|null}: The anchor text of the link, or null if none is found.
 *     - is_blocked {boolean}: Whether the link is blocked by robots.txt rules.
 *     - rel {Array<string>}: The "rel" attribute values of the link.
 *     - counter {number}: The index of the link.
 *   - external_links {Array}: An array of external link objects, each containing:
 *     - url {string}: The full URL of the link.
 *     - anchor_text {string|null}: The anchor text of the link, or null if none is found.
 *     - rel {Array<string>}: The "rel" attribute values of the link.
 *     - counter {number}: The index of the link.
 */
function marshalHyperlinkStatisticsDefaults() {
  return Object.assign(Object.create(null), {
    "total_internal": 0,
    "total_external": 0,
    "internal_links": [],
    "external_links": []
  });
}

function getHyperlinkStatistics(parsed_robots_txt, setting_ua) {
  const result = marshalHyperlinkStatisticsDefaults();

  if (typeof setting_ua !== "string") {
    return result;
  }

  const link_elements = document.querySelectorAll("a[href]");

  if (link_elements.length === 0) {
    return result;
  }

  const origin_domain = window.location.hostname;

  for (let index = 0; index < link_elements.length; index++) {
    const link_element = link_elements[index];

    const href = link_element.getAttribute("href");

    const parsed_url = parseValidUrl(href);

    if (!parsed_url) { // Skip invalid URLS
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
    let anchor_text = link_element.textContent.trim() || getTextContent(link_element); // returns null

    // If no text found, check for an image and try to use the alt or title attributes.
    if (!anchor_text) {
      const img = link_element.querySelector("img[alt]");

      if (img) {
        anchor_text = img.getAttribute("alt").trim() || null; // empty string or undefined = null
      }
    }

    // Check if it"s internal or external
    if (link_domain === origin_domain) {
      let is_blocked = false;

      if (parsed_robots_txt) {
        is_blocked = parsed_robots_txt.isDisallowed(parsed_url.pathname, setting_ua);
      }

      result.internal_links.push({
        "url": url_string,
        "anchor_text": anchor_text,
        "is_blocked": is_blocked,
        "rel": rel_array,
        "counter": index
      });
    } else {
      result.total_external++;

      result.external_links.push({
        "url": url_string,
        "anchor_text": anchor_text,
        "rel": rel_array,
        "counter": index
      });
    }
  }

  return result;
}

/**
 * Groups all the meta elements in the document by their type, such as Facebook (Open Graph), Twitter, Dublin Core, general, and others.
 *
 * @returns {object} An object containing grouped meta tags:
 *   - facebook {object}: Meta tags related to Facebook (Open Graph), grouped by their name (property).
 *   - twitter {object}: Meta tags related to Twitter, grouped by their name (property).
 *   - dublin_core {object}: Meta tags related to Dublin Core, grouped by their name (property).
 *   - general {object}: General meta tags like description, keywords, publisher, etc.
 *   - other {object}: Other meta tags that do not fall under the predefined categories.
 *   Each group is an object where keys are the meta tag names (e.g., 'og:title', 'twitter:card', 'dc.creator') and values are the corresponding content.
 */
function marshalMetaElementsDefaults() {
  return Object.assign(Object.create(null), {
    "facebook": Object.create(null),
    "twitter": Object.create(null),
    "dublin_core": Object.create(null),
    "general": Object.create(null),
    "other": Object.create(null)
  })
}

function groupMetaElements() {
  const result = marshalMetaElementsDefaults();

  const meta_elements = document.querySelectorAll("meta[name][content], meta[property][content]");

  if (meta_elements.length === 0) {
    return result;
  }

  const general_meta_keys = ["description", "keywords", "publisher", "author", "copyright", "robots", "googlebot", "viewport"];

  for (let index = 0; index < meta_elements.length; index++) {
    const meta_element = meta_elements[index];

    const name = meta_element.getAttribute("name")?.toLowerCase() || meta_element.getAttribute("property")?.toLowerCase();

    if (!name) {
      continue;
    }

    const content = meta_element.getAttribute("content")?.toString(); // returns undefined if empty

    if (name.startsWith("og:") || name.startsWith("fb:") || name.startsWith("article:") || name.startsWith("product:")) {
      // Group Facebook (Open Graph) meta tags
      result.facebook[name] = content || null; // empty string or undefined = null
    } else if (name.startsWith("twitter:")) {
      // Group Twitter meta tags
      result.twitter[name] = content || null; // empty string or undefined = null
    } else if (name.startsWith("dc.")) {
      // Group Dublin Core meta tags
      result.dublin_core[name] = content || null; // empty string or undefined = null
    } else if (general_meta_keys.indexOf(name) !== -1) {
      // General meta tags
      result.general[name] = content || null; // empty string or undefined = null
    } else {
      // Other general meta tags
      result.other[name] = content || null; // empty string or undefined = null
    }
  }

  return result;
}
/**
 * Calculates various SEO-related statistics from the body text of the document.
 * This includes word count, character count (excluding spaces), sentence count, average word length, and average sentence length.
 *
 * @returns {object} An object containing SEO statistics:
 *   - word_count {number}: Total number of words in the document body.
 *   - character_count {number}: Total number of characters (excluding spaces) in the document body.
 *   - sentence_count {number}: Total number of sentences in the document body (based on basic punctuation).
 *   - avg_word_length {number}: Average word length, calculated as character count divided by word count.
 *   - avg_sentence_length {number}: Average sentence length, calculated as word count divided by sentence count.
 */
function marshalSEOStatisticsDefaults() {
  return Object.assign(Object.create(null), {
    "word_count": 0,
    "character_count": 0,
    "sentence_count": 0,
    "avg_word_length": 0.0,
    "avg_sentence_length": 0.0
  });
}

function getSEOStatistics() {
  const result = marshalSEOStatisticsDefaults();

  const text = document.body?.textContent?.trim() ?? "";

  if (text.length === 0) {
    return result;
  }

  const words = text.match(/\S+/g) ?? [];

  result.word_count = words.length;
  result.character_count = text.replace(/\s+/g, "").length;
  result.sentence_count = text.match(/[.!?]+(?=\s|$)/g)?.length ?? 0;

  result.avg_word_length =
    result.word_count > 0
      ? result.character_count / result.word_count
      : 0;

  result.avg_sentence_length =
    result.sentence_count > 0
      ? result.word_count / result.sentence_count
      : 0;

  return result;
}

/**
 * Extracts and analyzes all headings (h1 to h6) in the document.
 * It builds a hierarchical structure of headings, tracks the count of each heading level,
 * detects nesting errors, and counts empty headings.
 *
 * @returns {object} An object containing:
 *   - tree {Array} A nested array representing the hierarchy of headings in the document.
 *   - heading_stats {object} A map containing the count of each heading level (h1, h2, h3, h4, h5, h6).
 *   - nesting_errors {object} A map of detected nesting errors, including occurrences and examples.
 *   - empty_errors {number} The total count of headings with no text content.
 */
function marshalHeadingsDefaults() {
  return Object.assign(Object.create(null), {
    tree: [],
    heading_stats: Object.assign(Object.create(null), { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 }),
    nesting_errors: Object.create(null),
    empty_errors: 0
  });
}

function extractHeadings() {
  const result = marshalHeadingsDefaults();

  const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");

  if (headings.length === 0) {
    return result;
  }

  const stack = [{
    level: 0,
    children: result.tree
  }];

  let previous_level = 0;

  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index];

    const level = Number.parseInt(heading.tagName[1], 10);
    const heading_text = heading.textContent.trim();

    heading.setAttribute("data-ps-locate", `heading-${index}`);

    if (heading_text.length === 0) {
      result.empty_errors++;
    }

    result.heading_stats[`h${level}`]++;

    if (level > previous_level + 1) {
      const error_key = `${previous_level}-${level}`;

      if (!Object.hasOwn(result.nesting_errors, error_key)) {
        result.nesting_errors[error_key] = {
          previous_level: previous_level,
          current_level: level,
          occurrences: 0,
          examples: []
        };
      }

      const error = result.nesting_errors[error_key];

      error.occurrences++;

      if (!error.examples.some(example => example.heading_text === heading_text)) {
        error.examples.push({
          tag_name: heading.tagName,
          heading_text: heading_text
        });
      }
    }

    while (stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    const node = {
      tag_name: heading.tagName,
      text: heading_text,
      counter: index,
      children: []
    };

    stack[stack.length - 1].children.push(node);

    stack.push({
      level: level,
      children: node.children
    });

    previous_level = level;
  }

  return result;
}

/**
 * Fetches the response stats for a given URL, including headers, status, and response body.
 * The function uses a timeout to abort the request if it takes too long.
 *
 * @param {string} url The URL to fetch.
 * @param {Object} [options={}] The options to pass to the fetch request.
 * @param {number} [timeout=DEFAULT_REQUEST_TIMEOUT] The timeout duration in milliseconds before aborting the request.
 * @returns {Object|null} An object containing:
 *   - `headers`: The headers of the response.
 *   - `status`: The HTTP status code of the response.
 *   - `response_body`: The body of the response as text.
 *   Returns `null` if the request fails.
 */
async function fetchRobotsTxt(url, options = {}, timeout = DEFAULT_REQUEST_TIMEOUT) {
  if (
    typeof url !== "string" ||
    options === null || typeof options !== "object" || Array.isArray(options) ||
    typeof timeout !== "number"
  ) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(
      url,
      {
        ...options,
        mode: "cors",
        credentials: "omit",
        redirect: "manual",
        signal: controller.signal
      }
    );

    clearTimeout(timer);

    return Object.assign(Object.create(null), {
      "headers": response.headers,
      "status": response.status,
      "response_body": await response.text()
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const MAX_ICON_LINKS = 2;
const MAX_BLOB_BYTES = 5_242_880; // 5 MB (megabytes)

/**
 * Retrieves the favicon URL as a data URL from a list of icon links.
 * Attempts to fetch up to 3 icon links and returns the first valid favicon found.
 *
 * @param {Array} all_icons An array of icon link elements.
 * @returns {Promise<string|null>} A Promise that resolves to the favicon URL as a data URL,
 *   or `null` if no valid favicon is found, or if the input is not an array.
 */
async function getPageIconFromIcons(all_icons) {
  if (Object.prototype.toString.call(all_icons) !== '[object Array]') {
    return null;
  }

  const icon_links = all_icons.slice(0, MAX_ICON_LINKS);

  for (const icon_link of icon_links) {
    const result = await getFaviconAsDataUrl(icon_link.href);

    if (result) {
      return result;
    }
  }

  return null;
}

/**
 * Fetches the favicon from a URL and returns it as a data URL.
 *
 * @param {string} url The URL of the favicon to fetch.
 * @param {number} [timeout=DEFAULT_REQUEST_TIMEOUT] The timeout duration in milliseconds.
 * @returns {Promise<string|null>} A Promise that resolves to the favicon as a data URL if successful,
 *   `null` if the fetch fails or is aborted, or if the input is invalid.
 */
async function getFaviconAsDataUrl(url, timeout = DEFAULT_REQUEST_TIMEOUT) {
  if (
    typeof url !== "string" ||
    typeof timeout !== "number"
  ) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const options = Object.assign({ __proto__: null }, {
      credentials: "omit",
      redirect: "follow",
      signal: controller.signal
    });

    const response = await fetch(url, options);

    clearTimeout(timer);

    const blob = await response.blob();

    if (!(blob instanceof Blob)) {
      return Promise.resolve(null);
    }

    if (blob.size > MAX_BLOB_BYTES) {
      return Promise.resolve(null);
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);

      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Retrieves the origin URL of the current window.
 *
 * This function checks if the `window.location.origin` property is available and not equal to "null".
 * If so, it returns the `window.location.origin`. Otherwise, it returns the `document.baseURI` or
 * `window.location.href` as a fallback.
 *
 * @returns {string} The origin URL of the current window.
 */
function getOriginUrl() {
  return (window.location.origin && window.location.origin !== "null")
    ? window.location.origin
    : (document.baseURI || window.location.href);
}

async function extractMetadata() {
  const settings = await Promise.all([
    getSetting("user-agent", "*"),
    getSetting("fetch-robots-txt", false),
    getSetting("show-seo-preview", false)
  ]);
  const [setting_ua, setting_fetch_robotstxt, show_seo_preview] = settings;

  try {
    const page_url = window.location.href;
    const page_title = document.title.trim();
    const page_language = document.documentElement?.lang?.trim() ?? "";
    const link_elements = getLinkStatistics();
    const meta_elements = groupMetaElements();
    const image_elements = getImageStatistics();
    const seo_stats = getSEOStatistics();
    const heading_elements = extractHeadings();
    const rich_snippets = parseRichSnippets();

    const robots_promise = setting_fetch_robotstxt
      ? fetchRobotsTxt(getOriginUrl() + "/robots.txt")
      : null;

    const icon_promise = show_seo_preview
      ? getPageIconFromIcons(link_elements.icons)
      : null;

    const [robots_txt_stat, favicon_data] = await Promise.all([
      robots_promise,
      icon_promise
    ]);

    // 5. Process robots.txt results
    const parsed_robots_txt = robots_txt_stat
      ? robotstxt(robots_txt_stat.response_body)
      : null;

    /** @type {string[]} */
    const sitemaps = parsed_robots_txt?.getSitemaps();

    const robots_txt_sitemaps = Array.isArray(sitemaps) ? sitemaps : [];

    const robots_txt_exists = robots_txt_stat &&
      [HTTP_STATUS_CODE_OK, HTTP_STATUS_CODE_FOUND].includes(robots_txt_stat.status);

    const seo_preview = show_seo_preview
      ? Object.assign(Object.create(null), {
        title: page_title,
        breadcrumb: fancyFormatUrl(page_url),
        description: getTextContent(document.body),
        favicon: favicon_data ?? "/icons/broken-image.svg"
      })
      : null;

    return {
      url: page_url,
      title: page_title,
      language: page_language,
      robots_txt_exists: robots_txt_exists,
      robots_txt_sitemaps: robots_txt_sitemaps,
      rich_snippets: rich_snippets,
      meta_elements: meta_elements,
      hyperlink_stats: getHyperlinkStatistics(parsed_robots_txt, setting_ua),
      link_elements: link_elements,
      image_elements: image_elements,
      seo_stats: seo_stats,
      heading_elements: heading_elements,
      seo_preview: seo_preview
    };
  } catch {
    return {
      url: "",
      title: "",
      language: "",
      robots_txt_exists: false,
      robots_txt_sitemaps: [],
      rich_snippets: Object.create(null),
      meta_elements: marshalMetaElementsDefaults(),
      hyperlink_stats: marshalHyperlinkStatisticsDefaults(),
      link_elements: marshalLinkStatisticsDefaults(),
      image_elements: marshalImagesStatisticsDefaults(),
      seo_stats: marshalSEOStatisticsDefaults(),
      heading_elements: marshalHeadingsDefaults(),
      seo_preview: null
    };
  }
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getPageData") {
    // extractMetadata() is async and returns a Promise, so it must be awaited
    // before calling sendResponse — passing the Promise itself sends an empty
    // object across the messaging boundary instead of the resolved data.
    extractMetadata().then(sendResponse);

    return true; // Keep the message channel open for the async sendResponse above.
  }

  return false;
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

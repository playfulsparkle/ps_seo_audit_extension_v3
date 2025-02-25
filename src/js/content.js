"use strict";

const HTTP_STATUS_CODE_OK = 200;
const HTTP_STATUS_CODE_FOUND = 302;

const DEFAULT_REQUEST_TIMEOUT = 3000;

const MIN_DESC_LENGTH = 70;
const MAX_DESC_LENGTH = 155;

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
function resolveUrl(url) {
  if (typeof url !== "string" ||
    url.trim().length === 0 ||
    url.startsWith("#") ||
    url.startsWith("mailto:") ||
    url.startsWith("javascript:") ||
    url.startsWith("sms:") ||
    url.startsWith("tel:")) {
    return null;
  }

  try {
    // Ensure base URL is valid and falls back correctly if necessary
    const base = (window.location.origin && window.location.origin !== "null")
      ? window.location.origin
      : (document.baseURI || window.location.href);

    if (url.startsWith("http://") || url.startsWith("https://")) {
      return new URL(url);
    } else if (url.startsWith("//")) {
      return new URL(window.location.protocol + url);
    }

    return new URL(url, base);
  } catch (error) {
    return null;
  }
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

    let pathSegments = [];

    // Only add origin if it's valid
    if (parsed_url.origin && parsed_url.origin !== "null") {
      pathSegments.push(parsed_url.origin);
    }

    pathSegments = pathSegments.concat(
      parsed_url.pathname.split("/").filter(Boolean).map(segment => decodeURIComponent(segment))
    );

    return pathSegments.join(" › ");
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
function parseRichSnippets() {
  const rich_snippets = document.querySelectorAll('script[type="application/ld+json"]');

  const result = Object.create(null);

  if (rich_snippets.length === 0) {
    return result;
  }

  for (let index = 0; index < rich_snippets.length; index++) {
    try {
      const rich_snippet = JSON.parse(rich_snippets[index].textContent || rich_snippets[index].innerText);

      if (Object.prototype.hasOwnProperty.call(rich_snippet, "@graph")) {
        const groups = rich_snippet["@graph"];

        for (const group of groups) {
          const key = group["@type"].toLowerCase();

          result[key] = flattenJSON(group);
        }
      } else {
        const key = rich_snippet["@type"].toLowerCase();

        result[key] = flattenJSON(rich_snippet);
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
function flattenJSON(obj, parent = "", res = [], indentLevel = 0) {
  if (typeof parent !== "string" || !Array.isArray(res)) {
    return []; // Return an empty array instead of null
  }

  const INDENTATION = 4;

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];

      const indentedKey = "&nbsp;".repeat(indentLevel * INDENTATION) + key; // Indentation using non-breaking spaces

      if (typeof value === "object" && !Array.isArray(value)) {
        flattenJSON(value, `${indentedKey}.`, res, indentLevel + 1); // Recursively flatten nested objects
      } else if (Array.isArray(value) && value.length > 0) {
        res.push({ key: indentedKey, value: "" }); // Add the parent key once

        for (const [index, item] of value.entries()) {
          if (typeof item === "object") {
            flattenJSON(item, `${key} ${index}.`, res, indentLevel + 1); // Flatten object items in array
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

  return res; // Always return the result array
}

function getFileExt(filename) {
  return filename.includes('.') ? filename.split(".").pop().toLowerCase() : "";
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
function getImageStatistics() {
  const result = Object.assign(Object.create(null), {
    total_images: 0,
    images_without_alt: 0,
    images_list_without_alt: [],
    modern_image_formats: [],
    legacy_image_formats: [],
  });

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

  return result;
}

/**
 * Extracts and returns the text content from a given DOM element, considering only specific allowed elements.
 *
 * @param {Element} element - The DOM element from which to extract text.
 * @returns {string | null} The extracted text content, or null if no valid text is found.
 */
function getTextContent(element) {
  if (!(element instanceof Element)) {
    return null;
  }

  const MAX_DOM_DEEP = 100;

  const allowed_elements = [
    "a", "svg", "title", "span", "div", "b", "i", "strong", "em", "p", "h1",
    "h2", "h3", "h4", "h5", "h6", "label", "section", "article", "main", "footer",
    "header", "nav", "ul", "ol", "li", "dl", "dt", "dd"
  ];

  const stack = [element];

  let text = "";
  let counter = 0;

  while (stack.length > 0 && counter < MAX_DOM_DEEP) {
    const node = stack.pop();
    const node_name = node.nodeName.toLowerCase();

    if (!allowed_elements.includes(node_name)) {
      continue;
    }

    for (const childNode of node.childNodes) {
      if (childNode.nodeType === Node.TEXT_NODE) {
        const nodeText = childNode.textContent.trim();

        if (nodeText) {
          text += nodeText + " ";
        }
      } else if (childNode.nodeType === Node.ELEMENT_NODE) {
        stack.push(childNode);
      }
    }

    counter++;
  }

  return text.trim() || null; // return null on undefined or empty string
}

/**
 * Gathers and categorizes link element statistics from the document.
 *
 * @returns {{
*   canonical: string | null,
*   alternate: Array<{ name: string, type: string | null, href: string | null }>,
*   language: Array<{ hreflang: string | null, href: string | null }>,
*   navigation: Object<string, string | null>,
*   performance: Object<string, string | null>,
*   icons: Array<{ name: string, type: string | null, sizes: string | null, href: string | null }>,
*   stylesheet: string[]
* }} An object containing categorized link statistics.
*/
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


  return result;
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

/**
 * Checks if a given URL path is blocked by the specified robots.txt rules for a specific user-agent.
 *
 * @param {object} robots_txt_rules - The parsed robots.txt rules grouped by user-agent.
 * @param {string} setting_ua - The user-agent string to check the rules for.
 * @param {string} pathname - The URL path to check for access restrictions.
 * @returns {boolean} True if the path is blocked by robots.txt rules for the specified user-agent, otherwise false.
 */
function isBlockedByRobots(robots_txt_rules, setting_ua, pathname) {
  if (typeof robots_txt_rules !== "object" ||
    typeof setting_ua !== "string" ||
    typeof pathname !== "string") {
    return false;
  }

  try {
    // Iterate through all user-agent rules in robots_txt_rules
    for (const robotstxt_ua in robots_txt_rules) {
      if (robotstxt_ua.toLowerCase() !== setting_ua.toLowerCase()) {
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(robots_txt_rules, robotstxt_ua)) {
        const rules = robots_txt_rules[robotstxt_ua];

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
function getHyperlinkStatistics(robots_txt_rules, setting_ua) {
  const result = Object.assign(Object.create(null), {
    total_internal: 0,
    total_external: 0,
    internal_links: [],
    external_links: []
  });

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

    const parsed_url = resolveUrl(href);

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
    let anchor_text = link_element.getAttribute("aria-label") || getTextContent(link_element); // returns null

    // If no text found, check for an image and try to use the alt or title attributes.
    if (!anchor_text) {
      const img = link_element.querySelector("img[alt]");

      if (img) {
        anchor_text = img.getAttribute("alt").trim() || null; // Return null if empty string
      }
    }

    // Check if it"s internal or external
    if (link_domain === origin_domain) {
      let is_blocked = false;

      if (typeof robots_txt_rules === "object") {
        is_blocked = isBlockedByRobots(robots_txt_rules, setting_ua, parsed_url.pathname);
      }

      result.internal_links.push({ "url": url_string, "anchor_text": anchor_text, "is_blocked": is_blocked, "rel": rel_array, "counter": index });
    } else {
      result.total_external++;

      result.external_links.push({ "url": url_string, "anchor_text": anchor_text, "rel": rel_array, "counter": index });
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
function groupMetaElements() {
  const meta_elements = document.querySelectorAll("meta");

  const result = Object.assign(Object.create(null), {
    facebook: Object.create(null),
    twitter: Object.create(null),
    dublin_core: Object.create(null),
    general: Object.create(null),
    other: Object.create(null)
  });

  if (meta_elements.length === 0) {
    return result;
  }

  const general_meta_keys = ["description", "keywords", "publisher", "author", "copyright", "robots", "googlebot", "viewport"];

  for (let index = 0; index < meta_elements.length; index++) {
    const meta_element = meta_elements[index];
    const name = meta_element.getAttribute("name")?.toLowerCase() || meta_element.getAttribute("property")?.toLowerCase();
    const content = meta_element.getAttribute("content")?.toString(); // returns undefined if empty

    if (name) {
      if (name.startsWith("og:") || name.startsWith("fb:") || name.startsWith("article:") || name.startsWith("product:")) {
        // Group Facebook (Open Graph) meta tags
        result.facebook[name] = content || null; // returns null instead of undefined if "content" is empty
      } else if (name.startsWith("twitter:")) {
        // Group Twitter meta tags
        result.twitter[name] = content || null; // returns null instead of undefined if "content" is empty
      } else if (name.startsWith("dc.")) {
        // Group Dublin Core meta tags
        result.dublin_core[name] = content || null; // returns null instead of undefined if "content" is empty
      } else if (general_meta_keys.includes(name)) {
        // General meta tags
        result.general[name] = content || null; // returns null instead of undefined if "content" is empty
      } else {
        // Other general meta tags
        result.other[name] = content || null; // returns null instead of undefined if "content" is empty
      }
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

/**
 * Creates a safe RegExp from a given string by sanitizing it.
 * The function limits the string length and escapes certain characters to prevent malicious input.
 * It also replaces '*' with '.*' to allow for wildcard matching.
 *
 * @param {string} value The string to convert into a RegExp.
 * @returns {RegExp|null} A RegExp object if the input string is valid and safe,
 *    null if the string is too long or an error occurs or if the input is not a string.
 */
function createSafeRegExp(value) {
  if (typeof value !== "string") {
    return null;
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

/**
 * Parses the content of a robots.txt file to extract rules and sitemaps.
 * The function processes the content line by line, extracting user-agent specific rules such as
 * "allow", "disallow", "crawl-delay", and "sitemap".
 *
 * @param {string} content The content of the robots.txt file as a string.
 * @returns {Object|false} An object with the following properties:
 *   - `rules`: An object where each key is a user-agent string, and the value is an object with arrays
 *     for `allow` and `disallow` regular expressions, and an optional `crawlDelay`.
 *   - `sitemaps`: An array of sitemap URLs found in the robots.txt file.
 *   Returns `false` if the input is not a string.
 */
function parseRobotsTxt(content) {
  const result = Object.assign(Object.create(null), {
    rules: Object.create(null),
    sitemaps: []
  });

  if (typeof content !== "string") {
    return result;
  }

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
async function getResponseStats(url, options = {}, timeout = DEFAULT_REQUEST_TIMEOUT) {
  if (typeof url !== "string" ||
    typeof options !== "object" ||
    typeof timeout !== "number") {
    return null;
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

/**
 * Retrieves the favicon URL as a data URL from a list of icon links.
 * Attempts to fetch up to 3 icon links and returns the first valid favicon found.
 *
 * @param {Array} all_icons An array of icon link elements.
 * @returns {Promise<string|null>} A Promise that resolves to the favicon URL as a data URL,
 *   or `null` if no valid favicon is found, or if the input is not an array.
 */
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

/**
 * Fetches the favicon from a URL and returns it as a data URL.
 *
 * @param {string} url The URL of the favicon to fetch.
 * @param {number} [timeout=DEFAULT_REQUEST_TIMEOUT] The timeout duration in milliseconds.
 * @returns {Promise<string|null>} A Promise that resolves to the favicon as a data URL if successful,
 *   `null` if the fetch fails or is aborted, or if the input is invalid.
 */
async function getFaviconUrlAsData(url, timeout = DEFAULT_REQUEST_TIMEOUT) {
  if (typeof url !== "string" ||
    typeof timeout !== "number") {
    return null;
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

/**
 * Extracts a preview description from the provided meta elements or fallback content.
 *
 * @param {Object} meta_elements An object containing various groups of meta elements.
 * @returns {string} A description string. If no valid meta description is found,
 *   it returns the first part of the main content or body text, up to a defined length.
 */
function getPreviewDescription(meta_elements) {
  if (typeof meta_elements !== "object") {
    return "";
  }

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

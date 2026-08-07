"use strict";

//#region Constants
const HTTP_STATUS_CODE_OK = 200;
const DEFAULT_REQUEST_TIMEOUT = 3000;
const ALLOWED_URL_PROTOCOLS = new Set(["http:", "https:"]);

const MAX_ICON_LINKS = 2;
const MAX_BLOB_BYTES = 5_242_880; // 5 MB

// Content scripts run against arbitrary, untrusted pages. A page with an
// enormous number of images/links/meta tags — or a maliciously deep/huge
// JSON-LD payload — can otherwise tie up the popup indefinitely. These caps
// bound the work done per page without affecting any normal site.
const MAX_PROCESSED_ELEMENTS = 5000;
const MAX_JSONLD_SCRIPTS = 100;
const MAX_FLATTEN_DEPTH = 15;
const MAX_FLATTEN_ROWS = 2000;

const CATEGORY_PREFIXES = [
  { prefix: "og:", group: "facebook" },
  { prefix: "fb:", group: "facebook" },
  { prefix: "article:", group: "facebook" },
  { prefix: "product:", group: "facebook" },
  { prefix: "twitter:", group: "twitter" },
  { prefix: "dc.", group: "dublin_core" }
];

const GENERAL_META_KEYS = ["description", "keywords", "publisher", "author", "copyright", "robots", "googlebot", "viewport"];

const NAVIGATION_RELS = ["search", "prev", "next", "sitemap", "license"];
const PERFORMANCE_RELS = ["preload", "dns-prefetch", "prefetch", "preconnect", "amphtml", "manifest"];
const VALID_PRELOAD_AS_VALUES = [
  "audio", "document", "embed", "fetch", "object", "track", "video", "worker",
  "script", "style", "image", "font"
];

const MODERN_IMAGE_FORMATS = ["webp", "avif", "jp2", "j2k", "jxr", "svg", "heif", "heic"];
const LEGACY_IMAGE_FORMATS = ["png", "jpg", "jpeg", "jpe", "gif"];

const IMAGE_MIME_TYPES = Object.freeze({
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
});

const EXCLUDED_TEXT_TAGS = new Set([
  "script", "style", "noscript", "meta",
  "link", "template", "head", "iframe",
  "object", "embed", "param", "canvas",
  "audio", "video", "source", "track",
  "input", "textarea", "select", "button",
  "form", "label", "fieldset", "output"
]);
//#endregion


//#region Shared helpers
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
 * Resolves the base URL to use when parsing relative URLs. In opaque origins
 * (data:, about:blank, sandboxed frames), window.location.origin is the
 * string "null", so document.baseURI (or the full href) is used instead.
 * Shared by parseValidUrl() and getOriginUrl() so the fallback logic only
 * lives in one place.
 *
 * @returns {string}
 */
function getDocumentBaseUrl() {
  return window.location.origin && window.location.origin !== "null"
    ? window.location.origin
    : (document.baseURI || window.location.href);
}

/**
 * Reads and trims an element attribute, returning null instead of an empty
 * string when the attribute is absent or blank. Centralizes the
 * `getAttribute(x)?.trim() || null` pattern that was repeated for alt text,
 * hreflang, link titles, icon sizes, etc.
 *
 * @param {Element} element
 * @param {string} name
 * @returns {string|null}
 */
function getTrimmedAttr(element, name) {
  return element.getAttribute(name)?.trim() || null;
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
 *   - Returns `null` if the URL is invalid, empty, or starts with a disallowed protocol.
 */
function parseValidUrl(url) {
  if (typeof url !== "string") {
    return null;
  }

  const trimmed = url.trim();

  // An empty href isn't "the current page" — treating it as one silently
  // turned <link rel="canonical" href=""> into a false-positive canonical
  // pointing at the page itself.
  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.startsWith("#") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("sms:") ||
    trimmed.startsWith("tel:")) {
    return null;
  }

  const base = getDocumentBaseUrl();

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
 * Retrieves the origin URL of the current window, falling back to the
 * document's base URI in opaque-origin contexts.
 *
 * @returns {string} The origin URL of the current window.
 */
function getOriginUrl() {
  return getDocumentBaseUrl();
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

function getFileExt(filename) {
  return filename.indexOf(".") !== -1 ? filename.split(".").pop().toLowerCase() : "";
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

  return IMAGE_MIME_TYPES[getFileExt(filename)] || null;
}

/**
 * Bounds a NodeList/array to MAX_PROCESSED_ELEMENTS before iterating, so a
 * page with an unreasonable number of matching elements can't hang the
 * popup. Applied to every DOM collection pulled from the (untrusted) page.
 *
 * @param {NodeListOf<Element>|Array} collection
 * @param {number} [limit=MAX_PROCESSED_ELEMENTS]
 * @returns {Element[]}
 */
function capped(collection, limit = MAX_PROCESSED_ELEMENTS) {
  return Array.from(collection).slice(0, limit);
}
//#endregion


//#region Rich snippets (JSON-LD)
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

  if (Array.isArray(type)) {
    const first = type.find(item => typeof item === "string" && item.length > 0);

    return first ? first.toLowerCase() : null;
  }

  return null;
}

/**
 * Flattens a nested JSON object into an array of key-value pairs, where the key represents the path
 * to the original property and the value is the property's value.
 *
 * The function recursively traverses the object and creates an indented key for each property.
 * Arrays of primitive values (e.g. "@type": ["A", "B"]) are joined onto their own row rather than
 * left blank with the values nested underneath. Arrays of objects still expand into indented children.
 * Recursion depth and total row count are capped, since the source JSON-LD comes from an untrusted page.
 *
 * @param {Object} obj - The JSON object to flatten.
 * @param {string} [parent=""] - The parent key (used for recursion).
 * @param {Array<{key: string, value: string|null}>} [result=[]] - The result array (used for recursion).
 * @param {number} [indentLevel=0] - The current indentation level (used for recursion).
 *
 * @returns {Array<{key: string, value: string|null}>} - An array of `{ key, value }` pairs.
 *   Returns an empty array if the input is invalid.
 */
function flattenJSON(obj, parent = "", result = [], indentLevel = 0) {
  if (typeof parent !== "string" || !Array.isArray(result)) {
    return [];
  }

  if (indentLevel > MAX_FLATTEN_DEPTH || result.length >= MAX_FLATTEN_ROWS) {
    return result;
  }

  const INDENTATION = 4;

  for (const [key, value] of Object.entries(obj ?? {})) {
    if (result.length >= MAX_FLATTEN_ROWS) {
      break;
    }

    const indentedKey = "&nbsp;".repeat(indentLevel * INDENTATION) + key;

    if (Array.isArray(value) && value.length > 0) {
      const isPrimitiveArray = value.every(item => item === null || typeof item !== "object");

      if (isPrimitiveArray) {
        // e.g. "@type": ["ProfessionalService", "Organization"] — show the
        // values directly on this row instead of an empty row with the
        // values hidden one level down.
        result.push({ key: indentedKey, value: value.map(item => String(item)).join(", ") });
      } else {
        result.push({ key: indentedKey, value: "" });

        for (const [index, item] of value.entries()) {
          if (item && typeof item === "object") {
            flattenJSON(item, `${key} ${index}.`, result, indentLevel + 1);
          } else {
            const itemKey = "&nbsp;".repeat((indentLevel + 1) * INDENTATION) + `${index}`;
            result.push({ key: itemKey, value: String(item) });
          }
        }
      }
    } else if (value && typeof value === "object") {
      flattenJSON(value, `${indentedKey}.`, result, indentLevel + 1);
    } else if (typeof value === "string") {
      result.push({ key: indentedKey, value: value || null });
    }
  }

  return result;
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
  const scripts = capped(document.querySelectorAll('script[type="application/ld+json"]'), MAX_JSONLD_SCRIPTS);

  const result = Object.create(null);

  for (const script of scripts) {
    let rich_snippet;

    try {
      rich_snippet = JSON.parse(script.textContent);
    } catch {
      continue;
    }

    const groups = Object.hasOwn(rich_snippet, "@graph") ? rich_snippet["@graph"] : [rich_snippet];

    for (const group of groups) {
      const key = getSchemaTypeKey(group?.["@type"]);

      if (key) {
        result[key] = flattenJSON(group);
      }
    }
  }

  return result;
}
//#endregion


//#region Images
/**
 * @returns {{
*   total_images: number,
*   images_without_alt: number,
*   images_list_without_alt: Array<{ url: string, src: string, counter: number }>,
*   all_image_list: Array<{ url: string, src: string, alt: string|null }>,
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
  const img_elements = capped(document.querySelectorAll("img[src]"));

  img_elements.forEach((img, index) => {
    const src = img.getAttribute("src");

    if (src.startsWith("data:")) {
      return; // Skip data URLs
    }

    if (!getImageMimeType(src)) {
      return;
    }

    const extension = getFileExt(src);

    if (result.modern_image_formats.indexOf(extension) === -1 && MODERN_IMAGE_FORMATS.indexOf(extension) !== -1) {
      result.modern_image_formats.push(extension);
    } else if (result.legacy_image_formats.indexOf(extension) === -1 && LEGACY_IMAGE_FORMATS.indexOf(extension) !== -1) {
      result.legacy_image_formats.push(extension);
    }

    const alt_text = getTrimmedAttr(img, "alt");
    const parsed_url = parseValidUrl(src);

    if (!alt_text) {
      result.images_without_alt++;

      img.setAttribute("data-ps-locate", `img-${index}`);

      result.images_list_without_alt.push({ "url": parsed_url?.toString(), "src": src, "counter": index });
    }

    result.all_image_list.push({ "url": parsed_url?.toString(), "src": src, "alt": alt_text });

    result.total_images++;
  });

  return result;
}
//#endregion


//#region Text content
function getTextContent(element) {
  if (!(element instanceof Element)) {
    return "";
  }

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
      if (EXCLUDED_TEXT_TAGS.has(node.tagName.toLowerCase())) {
        return "";
      }

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
//#endregion


//#region Links (<link> elements)
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

function getPreloadAs(value) {
  if (typeof value !== "string") {
    return null;
  }

  return VALID_PRELOAD_AS_VALUES.indexOf(value) !== -1 ? value : false;
}

function parseMediaAttribute(media) {
  if (typeof media !== "string") {
    return [];
  }

  const mediaQueries = [];

  let currentQuery = "";
  let insideParentheses = false;

  for (const char of media) {
    if (char === "," && !insideParentheses) {
      mediaQueries.push(currentQuery.trim());
      currentQuery = "";
    } else {
      currentQuery += char;

      if (char === "(") {
        insideParentheses = true;
      } else if (char === ")") {
        insideParentheses = false;
      }
    }
  }

  if (currentQuery.trim()) {
    mediaQueries.push(currentQuery.trim());
  }

  return mediaQueries;
}

function getLinkStatistics() {
  const result = marshalLinkStatisticsDefaults();
  const link_elements = capped(document.querySelectorAll("link[href]"));

  for (const link_element of link_elements) {
    const name = link_element.getAttribute("rel")?.toLowerCase().trim();
    const parsed_url = parseValidUrl(link_element.getAttribute("href"))?.toString() ?? null;

    if (name === "canonical") {
      result.canonical = parsed_url;
    } else if (name === "alternate" && link_element.hasAttribute("hreflang")) {
      result.language.push({
        "hreflang": getTrimmedAttr(link_element, "hreflang"),
        "href": parsed_url
      });
    } else if (name === "alternate" && link_element.hasAttribute("type")) {
      result.alternate.push({
        "name": name,
        "type": getTrimmedAttr(link_element, "type"),
        "href": parsed_url
      });
    } else if (NAVIGATION_RELS.indexOf(name) !== -1) {
      result.navigation.push({
        "name": name,
        "href": parsed_url
      });
    } else if (PERFORMANCE_RELS.indexOf(name) !== -1) {
      const preload_as = name === "preload" ? getPreloadAs(link_element.getAttribute("as") || null) : null;

      result.performance.push({
        "name": name,
        "preload_as": preload_as,
        "href": parsed_url
      });
    } else if (name === "stylesheet") {
      result.stylesheet.push({
        "href": parsed_url,
        "media": parseMediaAttribute(link_element.getAttribute("media") || null),
        "title": getTrimmedAttr(link_element, "title"),
        "disabled": link_element.hasAttribute("disabled")
      });
    } else if (name && (name.indexOf("icon") !== -1 || name.indexOf("shortcut") !== -1)) {
      result.icons.push({
        "name": name,
        "type": getTrimmedAttr(link_element, "type") ?? getImageMimeType(parsed_url),
        "sizes": getTrimmedAttr(link_element, "sizes"),
        "href": parsed_url
      });
    }
  }

  // Sort icons by size, largest first; icons with no declared size sort last.
  result.icons.sort((a, b) => {
    const sizeA = !a.sizes ? -Infinity : parseInt(a.sizes.split("x")[0], 10) || 0;
    const sizeB = !b.sizes ? -Infinity : parseInt(b.sizes.split("x")[0], 10) || 0;

    if (sizeA === -Infinity) {
      return 1;
    } else if (sizeB === -Infinity) {
      return -1;
    }

    return sizeB - sizeA;
  });

  return result;
}
//#endregion


//#region Hyperlinks (<a> elements)
function marshalHyperlinkStatisticsDefaults() {
  return Object.assign(Object.create(null), {
    "total_internal": 0,
    "total_external": 0,
    "internal_links": [],
    "external_links": []
  });
}

/**
 * Analyzes all the hyperlinks on the current document and categorizes them as internal or external links.
 * Additionally checks if any internal links are blocked by the robots.txt rules for a specific user-agent.
 *
 * @param {object} parsed_robots_txt - The parsed robots.txt rules grouped by user-agent.
 * @param {string} setting_ua - The user-agent string to check the rules for.
 * @returns {object} Hyperlink statistics — see marshalHyperlinkStatisticsDefaults for the shape.
 */
function getHyperlinkStatistics(parsed_robots_txt, setting_ua) {
  const result = marshalHyperlinkStatisticsDefaults();

  if (typeof setting_ua !== "string") {
    return result;
  }

  const link_elements = capped(document.querySelectorAll("a[href]"));
  const origin_domain = window.location.hostname;

  link_elements.forEach((link_element, index) => {
    const parsed_url = parseValidUrl(link_element.getAttribute("href"));

    if (!parsed_url) {
      return;
    }

    link_element.setAttribute("data-ps-locate", `link-${index}`);

    const rel = link_element.getAttribute("rel");
    const rel_array = (rel && rel !== "null") ? rel.split(" ").map(item => item.trim()) : [];

    let anchor_text = link_element.textContent.trim() || getTextContent(link_element);

    if (!anchor_text) {
      const img = link_element.querySelector("img[alt]");

      if (img) {
        anchor_text = getTrimmedAttr(img, "alt");
      }
    }

    const is_internal = parsed_url.hostname === origin_domain;

    if (is_internal) {
      result.total_internal++;
      result.internal_links.push({
        "url": parsed_url.toString(),
        "anchor_text": anchor_text,
        "is_blocked": parsed_robots_txt ? parsed_robots_txt.isDisallowed(parsed_url.pathname, setting_ua) : false,
        "rel": rel_array,
        "counter": index
      });
    } else {
      result.total_external++;
      result.external_links.push({
        "url": parsed_url.toString(),
        "anchor_text": anchor_text,
        "rel": rel_array,
        "counter": index
      });
    }
  });

  return result;
}
//#endregion


//#region Meta elements
function marshalMetaElementsDefaults() {
  return Object.assign(Object.create(null), {
    "facebook": Object.create(null),
    "twitter": Object.create(null),
    "dublin_core": Object.create(null),
    "general": Object.create(null),
    "other": Object.create(null)
  });
}

function categorizeMetaName(name) {
  const match = CATEGORY_PREFIXES.find(entry => name.startsWith(entry.prefix));

  if (match) {
    return match.group;
  }

  return GENERAL_META_KEYS.indexOf(name) !== -1 ? "general" : "other";
}

/**
 * Groups all the meta elements in the document by their type (Open Graph, Twitter, Dublin Core, general, other).
 *
 * @returns {object} Grouped meta tags — see marshalMetaElementsDefaults for the shape. Each group's
 *   values are keyed by the meta tag's name/property, with the tag's content (or null if empty) as the value.
 */
function groupMetaElements() {
  const result = marshalMetaElementsDefaults();
  const meta_elements = capped(document.querySelectorAll("meta[name][content], meta[property][content]"));

  for (const meta_element of meta_elements) {
    const name = meta_element.getAttribute("name")?.toLowerCase() || meta_element.getAttribute("property")?.toLowerCase();

    if (!name) {
      continue;
    }

    const content = meta_element.getAttribute("content")?.toString();

    result[categorizeMetaName(name)][name] = content || null;
  }

  return result;
}
//#endregion


//#region SEO statistics
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
  result.avg_word_length = result.word_count > 0 ? result.character_count / result.word_count : 0;
  result.avg_sentence_length = result.sentence_count > 0 ? result.word_count / result.sentence_count : 0;

  return result;
}
//#endregion


//#region Headings
function marshalHeadingsDefaults() {
  return Object.assign(Object.create(null), {
    tree: [],
    heading_stats: Object.assign(Object.create(null), { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 }),
    nesting_errors: Object.create(null),
    empty_errors: 0
  });
}

/**
 * Extracts and analyzes all headings (h1 to h6) in the document.
 *
 * @returns {object} Heading data — see marshalHeadingsDefaults for the shape.
 */
function extractHeadings() {
  const result = marshalHeadingsDefaults();
  const headings = capped(document.querySelectorAll("h1, h2, h3, h4, h5, h6"));

  if (headings.length === 0) {
    return result;
  }

  const stack = [{ level: 0, children: result.tree }];
  let previous_level = 0;

  headings.forEach((heading, index) => {
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
        error.examples.push({ tag_name: heading.tagName, heading_text: heading_text });
      }
    }

    while (stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    const node = { tag_name: heading.tagName, text: heading_text, counter: index, children: [] };

    stack[stack.length - 1].children.push(node);
    stack.push({ level: level, children: node.children });

    previous_level = level;
  });

  return result;
}
//#endregion


//#region robots.txt / favicon fetching
/**
 * Fetches the response stats for a given URL, including headers, status, and response body.
 *
 * @param {string} url The URL to fetch.
 * @param {Object} [options={}] The options to pass to the fetch request.
 * @param {number} [timeout=DEFAULT_REQUEST_TIMEOUT] The timeout duration in milliseconds before aborting the request.
 * @returns {Object|null} `{ headers, status, response_body }`, or `null` if the request fails.
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
    const response = await fetch(url, {
      ...options,
      mode: "cors",
      credentials: "omit",
      redirect: "follow",
      signal: controller.signal
    });

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

/**
 * Retrieves the favicon URL as a data URL from a list of icon links.
 * Attempts to fetch up to MAX_ICON_LINKS icon links and returns the first valid favicon found.
 *
 * @param {Array} all_icons An array of icon link elements.
 * @returns {Promise<string|null>}
 */
async function getPageIconFromIcons(all_icons) {
  if (!Array.isArray(all_icons)) {
    return null;
  }

  for (const icon_link of all_icons.slice(0, MAX_ICON_LINKS)) {
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
 * @returns {Promise<string|null>}
 */
async function getFaviconAsDataUrl(url, timeout = DEFAULT_REQUEST_TIMEOUT) {
  if (typeof url !== "string" || typeof timeout !== "number") {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      credentials: "omit",
      redirect: "follow",
      signal: controller.signal
    });

    const blob = await response.blob();

    if (!(blob instanceof Blob) || blob.size > MAX_BLOB_BYTES) {
      return null;
    }

    return await new Promise((resolve, reject) => {
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
//#endregion


//#region Metadata orchestration
/**
 * Builds a human-readable page-language label, e.g. "en-US - American English",
 * falling back to the raw lang value if a display name can't be resolved.
 *
 * @param {string|null} rawLang
 * @returns {string|null}
 */
function resolvePageLanguageLabel(rawLang) {
  if (!rawLang) {
    return null;
  }

  try {
    const user_lang = chrome.i18n.getUILanguage();
    const display_names = new Intl.DisplayNames([user_lang, navigator.language, "en"], { type: "language" });
    const language_name = display_names.of(rawLang);

    return language_name ? `${rawLang} - ${language_name}` : rawLang;
  } catch {
    return rawLang;
  }
}

async function extractMetadata() {
  const [setting_ua, setting_fetch_robotstxt, show_seo_preview] = await Promise.all([
    getSetting("user-agent", "*"),
    getSetting("fetch-robots-txt", false),
    getSetting("show-seo-preview", false)
  ]);

  try {
    const page_url = window.location.href;
    const page_title = document.title.trim();
    const link_elements = getLinkStatistics();
    const meta_elements = groupMetaElements();
    const image_elements = getImageStatistics();
    const seo_stats = getSEOStatistics();
    const heading_elements = extractHeadings();
    const rich_snippets = parseRichSnippets();

    const raw_language = document.documentElement?.lang?.replace("_", "-").trim() || null;
    const page_language = resolvePageLanguageLabel(raw_language);

    // robots takes priority; fall back to googlebot only when robots is
    // genuinely absent (not just present-but-empty).
    const robots_meta = meta_elements.general.robots ?? meta_elements.general.googlebot ?? null;

    const [robots_txt_stat, favicon_data] = await Promise.all([
      setting_fetch_robotstxt ? fetchRobotsTxt(getOriginUrl() + "/robots.txt") : null,
      show_seo_preview ? getPageIconFromIcons(link_elements.icons) : null
    ]);

    const parsed_robots_txt = robots_txt_stat ? robotstxt(robots_txt_stat.response_body) : null;
    const sitemaps = parsed_robots_txt?.getSitemaps();
    const robots_txt_sitemaps = Array.isArray(sitemaps) ? sitemaps : [];
    const robots_txt_exists = Boolean(robots_txt_stat && robots_txt_stat.status === HTTP_STATUS_CODE_OK);

    const seo_preview = show_seo_preview
      ? Object.assign(Object.create(null), {
        title: page_title,
        breadcrumb: fancyFormatUrl(page_url),
        description: getTextContent(document.body),
        favicon: favicon_data ?? "/icons/broken-image.svg"
      })
      : null;

    return {
      success: true,
      url: page_url,
      title: page_title,
      language: page_language,
      robots_meta: robots_meta,
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
      success: false,
      url: "",
      title: "",
      language: null,
      robots_meta: null,
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
//#endregion


//#region Message listeners
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
//#endregion

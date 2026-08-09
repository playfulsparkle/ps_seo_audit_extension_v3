"use strict";

//#region Constants
/**
 * HTTP status code for a successful response.
 * @type {number}
 */
const HTTP_STATUS_CODE_OK = 200;

/**
 * Default timeout (in milliseconds) for external requests (robots.txt, favicon).
 * @type {number}
 */
const DEFAULT_REQUEST_TIMEOUT = 3000;

/**
 * Allowed URL protocols for `parseValidUrl()` – only HTTP/HTTPS are accepted.
 * @type {Set<string>}
 */
const ALLOWED_URL_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Maximum number of `<link rel="icon">` elements to try when fetching a favicon.
 * @type {number}
 */
const MAX_ICON_LINKS = 2;

/**
 * Maximum blob size (5 MB) allowed when fetching a favicon as a data URL.
 * @type {number}
 */
const MAX_BLOB_BYTES = 5_242_880; // 5 MB

/**
 * Maximum number of DOM elements processed in any collection (images, links, etc.)
 * to prevent performance issues on very large pages.
 * @type {number}
 */
const MAX_PROCESSED_ELEMENTS = 5000;

/**
 * Maximum number of JSON‑LD scripts parsed.
 * @type {number}
 */
const MAX_JSONLD_SCRIPTS = 100;

/**
 * Maximum recursion depth when flattening JSON‑LD objects.
 * @type {number}
 */
const MAX_FLATTEN_DEPTH = 15;

/**
 * Maximum number of rows produced when flattening JSON‑LD.
 * @type {number}
 */
const MAX_FLATTEN_ROWS = 2000;

/**
 * Mapping from meta name prefixes to their group keys in the final result.
 * @type {Array<{prefix: string, group: string}>}
 */
const CATEGORY_PREFIXES = [
  { prefix: "og:", group: "open_graph" },
  { prefix: "fb:", group: "facebook" },
  { prefix: "article:", group: "open_graph" },
  { prefix: "product:", group: "open_graph" },
  { prefix: "twitter:", group: "twitter" },
  { prefix: "dc.", group: "dublin_core" }
];

/**
 * Fraction (as a whole percent, 0-100) of the SEO title within which a focus
 * keyword should ideally appear to count as "near the front" of the title.
 * Mirrors `LIMITS.KEYWORD_TITLE_START_PERCENT` in popup.js. The two files run
 * in separate script contexts (content script vs. popup) and cannot share a
 * module without a build step, so the value is intentionally duplicated here.
 * @type {number}
 */
const KEYWORD_TITLE_START_PERCENT = 50;

/**
 * Fraction (as a whole percent, 0-100) of the page's main content within
 * which a focus keyword should ideally make its first appearance. Mirrors
 * `LIMITS.KEYWORD_CONTENT_START_PERCENT` in popup.js — see note above.
 * @type {number}
 */
const KEYWORD_CONTENT_START_PERCENT = 10;

/**
 * Meta names that are considered "general" (not Facebook, Twitter, Dublin Core).
 * @type {string[]}
 */
const GENERAL_META_KEYS = ["description", "keywords", "publisher", "author", "copyright", "robots", "googlebot", "viewport"];

/**
 * Valid `rel` values for navigational `<link>` elements.
 * @type {string[]}
 */
const NAVIGATION_RELS = ["search", "prev", "next", "sitemap", "license"];

/**
 * Valid `rel` values for performance-related `<link>` elements.
 * @type {string[]}
 */
const PERFORMANCE_RELS = ["preload", "dns-prefetch", "prefetch", "preconnect", "amphtml", "manifest"];

/**
 * Valid values for the `as` attribute on `<link rel="preload">`.
 * @type {string[]}
 */
const VALID_PRELOAD_AS_VALUES = [
  "audio", "document", "embed", "fetch", "object", "track", "video", "worker",
  "script", "style", "image", "font"
];

/**
 * Modern (next‑gen) image formats that are considered beneficial for performance.
 * @type {string[]}
 */
const MODERN_IMAGE_FORMATS = ["webp", "avif", "jp2", "j2k", "jxr", "svg", "heif", "heic"];

/**
 * Legacy (traditional) image formats that are still widely used but less efficient.
 * @type {string[]}
 */
const LEGACY_IMAGE_FORMATS = ["png", "jpg", "jpeg", "jpe", "gif"];

/**
 * Mapping from file extension to MIME type for images.
 * @type {Readonly<Object<string, string>>}
 */
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

/**
 * HTML tags to exclude when extracting text content.
 * @type {Set<string>}
 */
const EXCLUDED_TEXT_TAGS = new Set([
  "script", "style", "noscript", "meta",
  "link", "template", "head", "iframe",
  "object", "embed", "param", "canvas",
  "audio", "video", "source", "track",
  "input", "textarea", "select", "button",
  "form", "label", "fieldset", "output"
]);
//#endregion

//#region Prototype helpers
/**
 * Extends String with an `i18n` method for easy Chrome i18n message retrieval.
 * @param {string|string[]} [substitutions=""] - Substitutions for placeholders.
 * @returns {string} The translated message, or the original string if not found.
 */
String.prototype.i18n = function (substitutions = "") {
  return chrome.i18n.getMessage(this.toString(), substitutions) || this.toString();
};
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
 * (data:, about:blank, sandboxed frames), `window.location.origin` is the
 * string "null", so `document.baseURI` (or the full href) is used instead.
 * Shared by `parseValidUrl()` and `getOriginUrl()` so the fallback logic only
 * lives in one place.
 *
 * @returns {string} The base URL (origin or document base URI).
 */
function getDocumentBaseUrl() {
  return window.location.origin && window.location.origin !== "null"
    ? window.location.origin
    : (document.baseURI || window.location.href);
}

/**
 * Reads and trims an element attribute, returning `null` instead of an empty
 * string when the attribute is absent or blank. Centralizes the
 * `getAttribute(x)?.trim() || null` pattern used for alt text, hreflang,
 * link titles, icon sizes, etc.
 *
 * @param {Element} element - The DOM element.
 * @param {string} name - The attribute name.
 * @returns {string|null} The trimmed attribute value, or `null` if absent/empty.
 */
function getTrimmedAttr(element, name) {
  return element.getAttribute(name)?.trim() || null;
}

/**
 * Resolves a given URL relative to the current document's base URI or origin.
 *
 * This function checks if the URL is a valid string and does not start with
 * potentially unsafe protocols (mailto:, javascript:, etc.) before attempting
 * to resolve the URL. It resolves both absolute and relative URLs based on the
 * document's current location. Only HTTP/HTTPS protocols are allowed.
 *
 * @param {string} url - The URL to be resolved (absolute or relative).
 * @returns {URL|null} A resolved `URL` object, or `null` if the URL is invalid,
 *   empty, or uses a disallowed protocol.
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
 * Example: `https://example.com/foo/bar` → `https://example.com › foo › bar`
 *
 * @param {string} url - The URL string to format.
 * @returns {string} A formatted string representation of the URL, or an empty string if invalid.
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

/**
 * Extracts the file extension from a filename or URL.
 * @param {string} filename - The file name or URL.
 * @returns {string} The lowercased extension, or an empty string if none.
 */
function getFileExt(filename) {
  return filename.indexOf(".") !== -1 ? filename.split(".").pop().toLowerCase() : "";
}

/**
 * Determines the MIME type for a given image file based on its extension.
 *
 * @param {string} filename - The filename or URL of the image.
 * @returns {string|null} The MIME type corresponding to the image extension, or `null` if not an image.
 */
function getImageMimeType(filename) {
  if (typeof filename !== "string") {
    return null;
  }

  return IMAGE_MIME_TYPES[getFileExt(filename)] || null;
}

/**
 * Bounds a NodeList/array to `MAX_PROCESSED_ELEMENTS` before iterating, so a
 * page with an unreasonable number of matching elements can't hang the popup.
 * Applied to every DOM collection pulled from the (untrusted) page.
 *
 * @param {NodeListOf<Element>|Array} collection - The collection to cap.
 * @param {number} [limit=MAX_PROCESSED_ELEMENTS] - Maximum number of elements to return.
 * @returns {Element[]} An array containing at most `limit` elements.
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
 * @param {string|string[]|undefined} type - The `@type` value from the JSON-LD.
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
 * @returns {Array<{key: string, value: string|null}>} An array of `{ key, value }` pairs.
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
 * Parses and extracts structured data (JSON-LD) from the document. "Structured data" is the
 * markup itself; "rich results" are the potential search-result presentations Google *may*
 * generate from eligible structured data — the two terms aren't interchangeable, so this function
 * (and its result) deal purely with the structured data as authored on the page.
 *
 * This function searches for all `<script>` elements with a `type="application/ld+json"` attribute
 * in the document, parses the JSON data, and flattens the resulting JSON-LD content into a more
 * readable format. Handles a single JSON-LD object, a root JSON-LD array, and `@graph`. Malformed
 * JSON in one script tag is skipped without aborting the others.
 *
 * Multiple entities sharing the same `@type` are all preserved (rather than a later entity of the
 * same type silently overwriting an earlier one) — each type key holds an array of entities, and
 * each entity is itself an array of flattened `{key, value}` rows.
 *
 * @returns {Object<string, Array<Array<{key: string, value: string|null}>>>}
 *   An object where:
 *   - The keys are the lowercased `@type` values from the JSON-LD objects.
 *   - The values are arrays of entities of that type, in document order.
 *   - Each entity is an array of `{ key, value }` pairs representing its flattened JSON structure.
 *   Returns an empty object if no structured data is found or if every script tag failed to parse.
 */
function parseStructuredData() {
  const scripts = capped(document.querySelectorAll('script[type="application/ld+json"]'), MAX_JSONLD_SCRIPTS);

  const result = Object.create(null);

  for (const script of scripts) {
    let parsed_json;

    try {
      parsed_json = JSON.parse(script.textContent);
    } catch {
      continue;
    }

    // A single JSON-LD object, a root array of objects, or an object using "@graph" are all
    // legal top-level shapes for JSON-LD.
    let groups;

    if (Array.isArray(parsed_json)) {
      groups = parsed_json;
    } else if (parsed_json && typeof parsed_json === "object" && Object.hasOwn(parsed_json, "@graph")) {
      groups = Array.isArray(parsed_json["@graph"]) ? parsed_json["@graph"] : [parsed_json["@graph"]];
    } else {
      groups = [parsed_json];
    }

    for (const group of groups) {
      if (!group || typeof group !== "object") {
        continue;
      }

      const key = getSchemaTypeKey(group["@type"]);

      if (!key) {
        continue;
      }

      if (!Array.isArray(result[key])) {
        result[key] = [];
      }

      result[key].push(flattenJSON(group));
    }
  }

  return result;
}
//#endregion


//#region Images
/**
 * Creates a default state object for image statistics.
 * @returns {{
 *   total_images: number,
 *   images_without_alt: number,
 *   images_list_without_alt: Array<{ url: string, src: string, counter: number }>,
 *   all_image_list: Array<{ url: string, src: string, alt: string|null }>,
 *   modern_image_formats: string[],
 *   legacy_image_formats: string[]
 * }} The default image statistics object.
 */
function marshalImagesStatisticsDefaults() {
  return Object.assign(Object.create(null), {
    "total_images": 0,
    "images_without_alt": 0,
    "images_missing_alt_attribute": 0,
    "images_empty_alt": 0,
    "images_list_without_alt": [],
    "all_image_list": [],
    "modern_image_formats": [],
    "legacy_image_formats": [],
  });
}

/**
 * Gathers statistics on images within the document.
 * Includes total count, missing alt attributes, list of images without alt,
 * and aggregated image formats (modern vs legacy).
 *
 * @returns {ReturnType<typeof marshalImagesStatisticsDefaults>} An object containing image statistics.
 */
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

    img.setAttribute("data-ps-locate", `image-${index}`);

    const extension = getFileExt(src);

    if (result.modern_image_formats.indexOf(extension) === -1 && MODERN_IMAGE_FORMATS.indexOf(extension) !== -1) {
      result.modern_image_formats.push(extension);
    } else if (result.legacy_image_formats.indexOf(extension) === -1 && LEGACY_IMAGE_FORMATS.indexOf(extension) !== -1) {
      result.legacy_image_formats.push(extension);
    }

    // Distinguish three states: no `alt` attribute at all (missing — a real
    // accessibility/SEO gap), `alt=""` (intentionally empty — valid for
    // decorative images), and a non-empty `alt`. `alt=""` must never be
    // treated as equivalent to a missing attribute.
    const has_alt_attribute = img.hasAttribute("alt");
    const raw_alt = img.getAttribute("alt");
    const alt_text = raw_alt?.trim() ?? null;
    const is_empty_alt = has_alt_attribute && !alt_text;
    const parsed_url = parseValidUrl(src);

    if (!has_alt_attribute) {
      result.images_missing_alt_attribute++;
      result.images_without_alt++;
      result.images_list_without_alt.push({ "url": parsed_url?.toString(), "src": src, "alt": null, "has_alt_attribute": false, "counter": index });
    } else if (is_empty_alt) {
      result.images_empty_alt++;
    }

    result.all_image_list.push({
      "url": parsed_url?.toString(),
      "src": src,
      "alt": alt_text,
      "has_alt_attribute": has_alt_attribute,
      "counter": index
    });

    result.total_images++;
  });

  return result;
}
//#endregion


//#region Text content
/**
 * Extracts visible text content from a DOM element, filtering out excluded tags
 * and limiting the number of processed nodes for performance.
 *
 * @param {Element} element - The DOM element to extract text from.
 * @returns {string|null} The extracted text, trimmed and normalized, or `null` if empty.
 */
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
/**
 * Creates a default state object for link statistics.
 * @returns {Object} The default link statistics object.
 */
function marshalLinkStatisticsDefaults() {
  return Object.assign(Object.create(null), {
    "canonical": [],
    "alternate": [],
    "language": [],
    "navigation": [],
    "performance": [],
    "icons": [],
    "stylesheet": []
  });
}

/**
 * Validates the `as` attribute of a `<link rel="preload">`.
 * @param {string|null} value - The `as` attribute value.
 * @returns {string|false|null} The valid value, `false` if invalid, `null` if not present.
 */
function getPreloadAs(value) {
  if (typeof value !== "string") {
    return null;
  }

  return VALID_PRELOAD_AS_VALUES.indexOf(value) !== -1 ? value : false;
}

/**
 * Parses a media attribute string into an array of media queries.
 * Handles parentheses to avoid splitting inside complex queries.
 *
 * @param {string|null} media - The media attribute string.
 * @returns {string[]} An array of individual media queries.
 */
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

/**
 * Analyzes all `<link>` elements in the document and categorises them by `rel` attribute.
 * Returns every canonical tag found (duplicates preserved), alternate versions, language alternates, navigation links,
 * performance-related links, icons, and stylesheets.
 *
 * @returns {ReturnType<typeof marshalLinkStatisticsDefaults>} The link statistics object.
 */
function getLinkStatistics() {
  const result = marshalLinkStatisticsDefaults();
  const link_elements = capped(document.querySelectorAll("link[href]"));

  for (const link_element of link_elements) {
    const name = link_element.getAttribute("rel")?.toLowerCase().trim();
    const raw_href = link_element.getAttribute("href");
    const parsed = parseValidUrl(raw_href);
    const parsed_url = parsed?.toString() ?? null;

    if (name === "canonical") {
      // Every canonical tag is preserved (rather than the last one silently
      // overwriting earlier ones) so duplicate/conflicting canonicals can be
      // detected downstream.
      result.canonical.push({
        "raw": typeof raw_href === "string" ? raw_href.trim() : null,
        "url": parsed_url,
        "hostname": parsed?.hostname ?? null,
        "valid": Boolean(parsed),
        "has_fragment": Boolean(parsed?.hash)
      });
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
/**
 * Creates a default state object for hyperlink statistics.
 * @returns {Object} The default hyperlink statistics object.
 */
function marshalHyperlinkStatisticsDefaults() {
  return Object.assign(Object.create(null), {
    "total_internal": 0,
    "total_external": 0,
    "internal_links": [],
    "external_links": []
  });
}

/**
 * Determines whether a link's hostname belongs to the same site as the current page, treating
 * same-site subdomains as internal rather than blindly classifying every subdomain as external.
 *
 * Without a public-suffix list this can't be fully correct for multi-part TLDs (e.g. "co.uk"),
 * so it uses a practical heuristic: exact match, the link being a subdomain of the page's host,
 * or the page being a subdomain of the link's host (e.g. page on "www.example.com" linking to
 * "example.com", or vice versa).
 *
 * @param {string} link_hostname - The hostname of the link being checked.
 * @param {string} origin_hostname - The hostname of the current page.
 * @returns {boolean} `true` if the link should be treated as internal.
 */
function isSameSiteHostname(link_hostname, origin_hostname) {
  if (!link_hostname || !origin_hostname) {
    return false;
  }

  if (link_hostname === origin_hostname) {
    return true;
  }

  return link_hostname.endsWith(`.${origin_hostname}`) || origin_hostname.endsWith(`.${link_hostname}`);
}

/**
 * Classifies a link's `rel` tokens into the meaningful crawl/attribution signals search engines
 * care about. Uses token-set membership (`Set.has`) rather than exact-string comparisons on the
 * whole `rel` attribute, since `rel` is a space-separated list (e.g. "noopener nofollow").
 *
 * @param {string[]} rel_array - The link's `rel` attribute, already split into tokens.
 * @returns {{is_nofollow: boolean, is_sponsored: boolean, is_ugc: boolean, is_followed: boolean}}
 *   `is_followed` is `true` only when none of nofollow/sponsored/ugc are present.
 */
function classifyRelTokens(rel_array) {
  const relTokens = new Set(Array.isArray(rel_array) ? rel_array.map(token => token.toLowerCase()) : []);

  const isNofollow = relTokens.has("nofollow");
  const isSponsored = relTokens.has("sponsored");
  const isUgc = relTokens.has("ugc");

  return {
    "is_nofollow": isNofollow,
    "is_sponsored": isSponsored,
    "is_ugc": isUgc,
    "is_followed": !isNofollow && !isSponsored && !isUgc
  };
}

/**
 * Analyzes all hyperlinks (`<a>` elements) on the current document and categorizes them as internal or external.
 * Additionally checks if any internal links are blocked by the robots.txt rules for a specific user-agent.
 *
 * @param {object} parsed_robots_txt - The parsed robots.txt rules (expected to have an `isDisallowed` method).
 * @param {string} setting_ua - The user-agent string to check the rules against.
 * @returns {ReturnType<typeof marshalHyperlinkStatisticsDefaults>} Hyperlink statistics.
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

    const is_internal = isSameSiteHostname(parsed_url.hostname, origin_domain);
    const rel_classification = classifyRelTokens(rel_array);

    if (is_internal) {
      result.total_internal++;
      result.internal_links.push({
        "url": parsed_url.toString(),
        "anchor_text": anchor_text,
        "is_blocked": parsed_robots_txt ? parsed_robots_txt.isDisallowed(parsed_url.pathname, setting_ua) : false,
        "rel": rel_array,
        ...rel_classification,
        "counter": index
      });
    } else {
      result.total_external++;
      result.external_links.push({
        "url": parsed_url.toString(),
        "anchor_text": anchor_text,
        "rel": rel_array,
        ...rel_classification,
        "counter": index
      });
    }
  });

  return result;
}
//#endregion


//#region Meta elements
/**
 * Creates a default state object for meta elements.
 * @returns {Object} The default meta elements object.
 */
function marshalMetaElementsDefaults() {
  return Object.assign(Object.create(null), {
    "open_graph": Object.create(null),
    "facebook": Object.create(null),
    "twitter": Object.create(null),
    "dublin_core": Object.create(null),
    "general": Object.create(null),
    "other": Object.create(null)
  });
}

/**
 * Categorizes a meta name into one of the groups: open_graph, facebook, twitter, dublin_core, general, other.
 * @param {string} name - The meta name (or property) to categorize.
 * @returns {string} The group key.
 */
function categorizeMetaName(name) {
  const match = CATEGORY_PREFIXES.find(entry => name.startsWith(entry.prefix));

  if (match) {
    return match.group;
  }

  return GENERAL_META_KEYS.indexOf(name) !== -1 ? "general" : "other";
}

/**
 * Groups all the meta elements in the document by their type (Open Graph, Facebook, Twitter,
 * Dublin Core, general, other). Duplicate tags (same name/property appearing more than once)
 * are preserved rather than the later tag silently overwriting the earlier one.
 *
 * @returns {ReturnType<typeof marshalMetaElementsDefaults>} Grouped meta tags. Each group's
 *   values are keyed by the meta tag's name/property, with an array of the tag's content values
 *   (in document order; `null` entries represent an empty `content` attribute) as the value. A
 *   name with more than one entry in its array indicates a duplicate tag.
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
    const group = result[categorizeMetaName(name)];

    if (!Array.isArray(group[name])) {
      group[name] = [];
    }

    group[name].push(content || null);
  }

  return result;
}
//#endregion


//#region SEO statistics
/**
 * Creates a default state object for SEO statistics.
 * @returns {Object} The default SEO statistics object.
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

/**
 * Calculates various SEO statistics from the body text of the document:
 * word count, character count (excluding spaces), sentence count,
 * average word length, and average sentence length.
 *
 * @returns {ReturnType<typeof marshalSEOStatisticsDefaults>} The SEO statistics.
 */
function getSEOStatistics() {
  const result = marshalSEOStatisticsDefaults();
  const text = getTextContent(document.body) ?? "";

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
/**
 * Creates a default state object for heading analysis.
 * @returns {Object} The default heading data object.
 */
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
 * Builds a hierarchical tree, counts each heading level, detects nesting errors,
 * and counts empty headings.
 *
 * @returns {ReturnType<typeof marshalHeadingsDefaults>} Heading data.
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


//#region Rendered-width measurement (display-width heuristic)
/**
 * Measures the rendered pixel width of a string using an off-screen, non-interactive `<span>`.
 * This is a **display-width heuristic**, not a reproduction of Google's actual SERP rendering —
 * Google's title/snippet rendering depends on the viewer's device, font availability, locale, and
 * algorithmic truncation rules that aren't publicly specified. Use this only as an approximation
 * to flag titles/descriptions that are likely to be visually truncated.
 *
 * The element is appended to `document.body`, measured, and removed synchronously so no node is
 * left behind.
 *
 * @param {string} text - The text to measure.
 * @param {Object} [options] - Font options.
 * @param {string} [options.fontFamily="Arial, sans-serif"] - CSS font-family.
 * @param {string} [options.fontSize="20px"] - CSS font-size.
 * @param {string} [options.fontWeight="400"] - CSS font-weight.
 * @param {string} [options.letterSpacing="normal"] - CSS letter-spacing.
 * @returns {number} The rendered width in CSS pixels, or `0` if `text` is empty/invalid.
 */
function measureRenderedTextWidth(text, {
  fontFamily = "Arial, sans-serif",
  fontSize = "20px",
  fontWeight = "400",
  letterSpacing = "normal"
} = {}) {
  if (typeof text !== "string" || text.length === 0) {
    return 0;
  }

  const element = document.createElement("span");

  Object.assign(element.style, {
    position: "absolute",
    visibility: "hidden",
    whiteSpace: "nowrap",
    fontFamily,
    fontSize,
    fontWeight,
    letterSpacing,
    padding: "0",
    margin: "0",
    border: "0"
  });

  element.textContent = text;
  document.body.appendChild(element);

  const width = element.getBoundingClientRect().width;

  element.remove();

  return width;
}
//#endregion


//#region Focus keyword analysis (content optimization)
/**
 * Escapes regex metacharacters in a string so it can be safely embedded in a `RegExp`.
 * @param {string} text - The raw text.
 * @returns {string} The escaped text.
 */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Finds the character index of the first whole-word/whole-phrase, case-insensitive occurrence of
 * `keyword` in `text`. Uses word-boundary matching (`\b`) rather than naive substring search, so a
 * keyword like "app" does not falsely match inside "application".
 *
 * @param {string} text - The text to search.
 * @param {string} keyword - The keyword or keyword phrase to look for.
 * @returns {number} The match index, or `-1` if not found or either argument is empty.
 */
function findKeywordIndex(text, keyword) {
  if (typeof text !== "string" || typeof keyword !== "string") {
    return -1;
  }

  const normalizedKeyword = keyword.trim();

  if (normalizedKeyword.length === 0 || text.length === 0) {
    return -1;
  }

  // Allow the keyword's own internal whitespace to match any run of whitespace in the text
  // (e.g. a keyword typed with a single space still matches text with a line-wrapped double space).
  const pattern = escapeRegExp(normalizedKeyword).replace(/\s+/g, "\\s+");

  let regex;

  try {
    regex = new RegExp(`\\b${pattern}\\b`, "i");
  } catch {
    return -1;
  }

  const match = regex.exec(text);

  return match ? match.index : -1;
}

/**
 * Whole-word/whole-phrase, case-insensitive test for whether `keyword` appears anywhere in `text`.
 * @param {string} text - The text to search.
 * @param {string} keyword - The keyword or keyword phrase.
 * @returns {boolean} `true` if a whole-word match was found.
 */
function keywordMatchesText(text, keyword) {
  return findKeywordIndex(text, keyword) !== -1;
}

/**
 * Checks whether the first whole-word occurrence of `keyword` in `text` falls within the first
 * `percent` percent of `text`'s length (by character offset).
 *
 * @param {string} text - The text to search (e.g. the SEO title, or the main content).
 * @param {string} keyword - The keyword or keyword phrase.
 * @param {number} percent - The cutoff, as a whole percent (0-100).
 * @returns {boolean} `true` if the keyword's first occurrence starts at or before that cutoff.
 */
function isKeywordInFirstFraction(text, keyword, percent) {
  if (typeof text !== "string" || text.length === 0) {
    return false;
  }

  const index = findKeywordIndex(text, keyword);

  if (index === -1) {
    return false;
  }

  return (index / text.length) * 100 <= percent;
}

/**
 * Computes keyword density: the percentage of the document's word count made up of whole-word
 * occurrences of `keyword` (each occurrence weighted by the keyword's own word count, so a
 * two-word keyword phrase counts as two words per occurrence).
 *
 * @param {string} text - The text to analyze (typically the page's main visible content).
 * @param {string} keyword - The keyword or keyword phrase.
 * @returns {number} The density as a percentage (0-100+). `0` if either argument is empty.
 */
function computeKeywordDensity(text, keyword) {
  if (typeof text !== "string" || typeof keyword !== "string") {
    return 0;
  }

  const normalizedKeyword = keyword.trim();
  const words = text.match(/\S+/g) ?? [];

  if (normalizedKeyword.length === 0 || words.length === 0) {
    return 0;
  }

  const pattern = escapeRegExp(normalizedKeyword).replace(/\s+/g, "\\s+");

  let regex;

  try {
    regex = new RegExp(`\\b${pattern}\\b`, "gi");
  } catch {
    return 0;
  }

  const occurrences = text.match(regex)?.length ?? 0;
  const keywordWordCount = normalizedKeyword.match(/\S+/g)?.length || 1;

  return (occurrences * keywordWordCount / words.length) * 100;
}

/**
 * Counts how many images in `imageList` have a non-empty `alt` that matches `keyword`. This is
 * evaluated purely as an optimization *signal* — the focus keyword is never required in every
 * image's alt text.
 *
 * @param {Array<{alt: string|null}>} imageList - The image list (e.g. `image_elements.all_image_list`).
 * @param {string} keyword - The keyword or keyword phrase.
 * @returns {number} The number of matching images.
 */
function countMatchingAltImages(imageList, keyword) {
  if (!Array.isArray(imageList)) {
    return 0;
  }

  return imageList.reduce((count, image) => count + (image?.alt && keywordMatchesText(image.alt, keyword) ? 1 : 0), 0);
}

/**
 * Recursively searches a heading tree (as produced by `extractHeadings()`) for a whole-word match
 * of `keyword` within the given heading levels.
 *
 * @param {Array} tree - The heading tree (array of `{ tag_name, text, children }`).
 * @param {string} keyword - The keyword or keyword phrase.
 * @param {string[]} [levels=["h2", "h3"]] - Which heading tag names (lowercase) to check.
 * @returns {boolean} `true` if any matching heading was found.
 */
function headingsContainKeyword(tree, keyword, levels = ["h2", "h3"]) {
  if (!Array.isArray(tree)) {
    return false;
  }

  for (const node of tree) {
    if (levels.indexOf(node.tag_name?.toLowerCase()) !== -1 && node.text && keywordMatchesText(node.text, keyword)) {
      return true;
    }

    if (node.children?.length > 0 && headingsContainKeyword(node.children, keyword, levels)) {
      return true;
    }
  }

  return false;
}

/**
 * Runs the full set of focus-keyword optimization checks for a single keyword against the page's
 * already-extracted data. Returns `null` when the keyword is blank — a focus keyword is always
 * optional and is never required for a normal technical SEO audit.
 *
 * @param {string} keyword - The focus keyword (primary or secondary).
 * @param {Object} ctx - Context gathered from the rest of `extractMetadata()`.
 * @param {string} ctx.title - The page title.
 * @param {string} ctx.description - The meta description (first occurrence).
 * @param {string} ctx.url - The page URL.
 * @param {Array} ctx.headingsTree - `heading_elements.tree`.
 * @param {Array} ctx.imageList - `image_elements.all_image_list`.
 * @param {string} ctx.bodyText - The page's main visible text (`getTextContent(document.body)`).
 * @returns {Object|null} The keyword analysis, or `null` if `keyword` is blank.
 */
function computeKeywordAnalysisForKeyword(keyword, ctx) {
  const trimmed = typeof keyword === "string" ? keyword.trim() : "";

  if (trimmed.length === 0) {
    return null;
  }

  const { title = "", description = "", url = "", headingsTree = [], imageList = [], bodyText = "" } = ctx ?? {};

  let decoded_url = url;

  try {
    decoded_url = decodeURIComponent(url);
  } catch {
    decoded_url = url;
  }

  return {
    "keyword": trimmed,
    "in_title": keywordMatchesText(title, trimmed),
    "in_title_first_half": isKeywordInFirstFraction(title, trimmed, KEYWORD_TITLE_START_PERCENT),
    "in_description": keywordMatchesText(description, trimmed),
    "in_url": keywordMatchesText(decoded_url, trimmed),
    "in_first_content_fraction": isKeywordInFirstFraction(bodyText, trimmed, KEYWORD_CONTENT_START_PERCENT),
    "in_headings": headingsContainKeyword(headingsTree, trimmed, ["h2", "h3"]),
    "matching_alt_image_count": countMatchingAltImages(imageList, trimmed),
    "density_percent": computeKeywordDensity(bodyText, trimmed)
  };
}

/**
 * Builds the optional content-optimization analysis for the configured primary/secondary focus
 * keywords. Either or both may be absent (blank setting), in which case the corresponding entry
 * is `null` — focus keywords are never mandatory for a normal technical SEO audit.
 *
 * @param {string} primaryKeyword - The primary focus keyword setting.
 * @param {string} secondaryKeyword - The secondary focus keyword setting.
 * @param {Object} ctx - See `computeKeywordAnalysisForKeyword`.
 * @returns {{primary: Object|null, secondary: Object|null}} The keyword analysis.
 */
function computeKeywordAnalysis(primaryKeyword, secondaryKeyword, ctx) {
  return {
    "primary": computeKeywordAnalysisForKeyword(primaryKeyword, ctx),
    "secondary": computeKeywordAnalysisForKeyword(secondaryKeyword, ctx)
  };
}
//#endregion


//#region robots.txt / favicon fetching
/**
 * Fetches the response stats for a given URL, including headers, status, and response body.
 * Uses a timeout to abort the request if it takes too long.
 *
 * @param {string} url - The URL to fetch.
 * @param {Object} [options={}] - Additional fetch options (e.g., headers).
 * @param {number} [timeout=DEFAULT_REQUEST_TIMEOUT] - Timeout in milliseconds.
 * @returns {Promise<Object|null>} An object with `headers`, `status`, and `response_body`, or `null` on failure.
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
 * Attempts to fetch up to `MAX_ICON_LINKS` icon links and returns the first valid favicon found.
 *
 * @param {Array} all_icons - An array of icon link objects (each with an `href` property).
 * @returns {Promise<string|null>} The data URL of the favicon, or `null` if none could be fetched.
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
 * @param {string} url - The URL of the favicon to fetch.
 * @param {number} [timeout=DEFAULT_REQUEST_TIMEOUT] - Timeout in milliseconds.
 * @returns {Promise<string|null>} The data URL, or `null` if the fetch fails or the response is not a valid image blob.
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
 * falling back to the raw language code if a display name can't be resolved.
 *
 * @param {string|null} rawLang - The raw language code (e.g., "en-US").
 * @returns {string|null} The formatted label, or `null` if `rawLang` is falsy.
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

/**
 * Orchestrates the extraction of all metadata from the current page.
 * Gathers settings, then fetches page title, language, links, meta tags,
 * images, SEO statistics, headings, structured data, robots.txt, and favicon.
 * Returns a structured object with all collected data.
 *
 * @returns {Promise<Object>} A promise that resolves to the complete page data object.
 *   On success, the object contains `success: true` and all data fields.
 *   On error, it contains `success: false` and empty/default values for all fields.
 */
async function extractMetadata() {
  const [setting_ua, setting_fetch_robotstxt, show_seo_preview, focus_keyword_primary, focus_keyword_secondary] = await Promise.all([
    getSetting("user-agent", "*"),
    getSetting("fetch-robots-txt", false),
    getSetting("show-seo-preview", false),
    getSetting("focus-keyword-primary", ""),
    getSetting("focus-keyword-secondary", "")
  ]);

  try {
    const page_url = window.location.href;
    const page_title = document.title.trim();
    const link_elements = getLinkStatistics();
    const meta_elements = groupMetaElements();
    const image_elements = getImageStatistics();
    const seo_stats = getSEOStatistics();
    const heading_elements = extractHeadings();
    const structured_data = parseStructuredData();

    const raw_language = document.documentElement?.lang?.replace(/_/g, "-").trim() || null;
    const page_language = resolvePageLanguageLabel(raw_language);

    // robots takes priority; fall back to googlebot only when robots is
    // genuinely absent (not just present-but-empty). Meta values are arrays
    // (duplicates preserved) — the first occurrence in document order wins.
    const robots_meta = meta_elements.general.robots?.[0] ?? meta_elements.general.googlebot?.[0] ?? null;

    const [robots_txt_stat, favicon_data] = await Promise.all([
      setting_fetch_robotstxt ? fetchRobotsTxt(getOriginUrl() + "/robots.txt") : null,
      show_seo_preview ? getPageIconFromIcons(link_elements.icons) : null
    ]);

    const parsed_robots_txt = robots_txt_stat ? robotstxt(robots_txt_stat.response_body) : null;
    const sitemaps = parsed_robots_txt?.getSitemaps();
    const robots_txt_sitemaps = Array.isArray(sitemaps) ? sitemaps : [];
    const robots_txt_exists = Boolean(robots_txt_stat && robots_txt_stat.status === HTTP_STATUS_CODE_OK);

    const body_text = getTextContent(document.body) ?? "";
    const meta_description_value = meta_elements.general.description?.[0] ?? "";

    const seo_preview = show_seo_preview
      ? Object.assign(Object.create(null), {
        title: page_title,
        breadcrumb: fancyFormatUrl(page_url),
        description: body_text,
        favicon: favicon_data ?? "/icons/broken-image.svg"
      })
      : null;

    // Rendered-width heuristics (see `measureRenderedTextWidth`) — approximate display widths,
    // not a reproduction of Google's actual SERP rendering.
    const title_pixel_width = measureRenderedTextWidth(page_title, { fontSize: "20px" });
    const description_pixel_width = meta_description_value ? measureRenderedTextWidth(meta_description_value, { fontSize: "14px" }) : 0;

    const keyword_analysis = computeKeywordAnalysis(focus_keyword_primary, focus_keyword_secondary, {
      title: page_title,
      description: meta_description_value,
      url: page_url,
      headingsTree: heading_elements.tree,
      imageList: image_elements.all_image_list,
      bodyText: body_text
    });

    return {
      success: true,
      url: page_url,
      title: page_title,
      title_pixel_width: title_pixel_width,
      description_pixel_width: description_pixel_width,
      language: page_language,
      robots_meta: robots_meta,
      robots_txt_exists: robots_txt_exists,
      robots_txt_sitemaps: robots_txt_sitemaps,
      structured_data: structured_data,
      meta_elements: meta_elements,
      hyperlink_stats: getHyperlinkStatistics(parsed_robots_txt, setting_ua),
      link_elements: link_elements,
      image_elements: image_elements,
      seo_stats: seo_stats,
      heading_elements: heading_elements,
      keyword_analysis: keyword_analysis,
      seo_preview: seo_preview
    };
  } catch {
    return {
      success: false,
      url: "",
      title: "",
      title_pixel_width: 0,
      description_pixel_width: 0,
      language: null,
      robots_meta: null,
      robots_txt_exists: false,
      robots_txt_sitemaps: [],
      structured_data: Object.create(null),
      meta_elements: marshalMetaElementsDefaults(),
      hyperlink_stats: marshalHyperlinkStatisticsDefaults(),
      link_elements: marshalLinkStatisticsDefaults(),
      image_elements: marshalImagesStatisticsDefaults(),
      seo_stats: marshalSEOStatisticsDefaults(),
      heading_elements: marshalHeadingsDefaults(),
      keyword_analysis: { primary: null, secondary: null },
      seo_preview: null
    };
  }
}
//#endregion


//#region Message listeners

/**
 * Listens for messages from the popup/background requesting page data.
 * When a `getPageData` message is received, it calls `extractMetadata()` and
 * sends the result back asynchronously.
 *
 * @listens chrome.runtime.onMessage
 * @param {Object} message - The incoming message.
 * @param {string} message.action - The action to perform (should be "getPageData").
 * @param {Object} sender - The sender of the message (unused).
 * @param {Function} sendResponse - Callback to send the response.
 * @returns {boolean} `true` to indicate that the response will be sent asynchronously.
 */
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

/**
 * Listens for messages requesting to highlight an element on the page.
 * Uses the overlay manager (window.__psOverlay) to clear previous highlights,
 * scroll to the element, and apply a new highlight.
 *
 * @listens chrome.runtime.onMessage
 * @param {Object} message - The incoming message.
 * @param {string} message.action - Should be "highlightElement".
 * @param {string} message.locate_id - The `data-ps-locate` value of the target element.
 * @param {Object} sender - The sender of the message (unused).
 * @param {Function} sendResponse - Callback to send the result.
 * @returns {boolean} `true` to indicate that the response will be sent asynchronously.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "highlightElement" && message.locate_id) {
    const overlay = window.__psOverlay;

    if (!overlay) {
      return true; // keep channel open for async response
    }

    overlay.clear("locate");

    const target = document.querySelector(`[data-ps-locate="${message.locate_id}"]`);

    if (target) {
      if (overlay.isVisible(target)) {
        target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        overlay.highlight(target, "locate", "label_located_element".i18n());
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, reason: "element_not_visible" });
      }
    } else {
      sendResponse({ success: false, reason: "element_not_found" });
    }

    return true; // indicate that we will call sendResponse asynchronously
  }
  // return false for unhandled messages
  return false;
});
//#endregion

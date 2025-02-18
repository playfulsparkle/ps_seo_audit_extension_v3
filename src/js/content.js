String.prototype.i18n = function (substitutions = null) {
    const translation = browser.i18n.getMessage(this.toString(), substitutions);
    return translation || null;
};

async function saveSetting(offset, value) {
    try {
        await chrome.storage.local.set({ [offset]: value });
    } catch (error) {
        console.error(`content.js - saveSetting: Can't save ${offset} value ${error.message}`);
    }
}

async function getSetting(offset, default_value = null) {
    try {
        const result = await chrome.storage.local.get(offset);

        return result[offset] ?? default_value;
    } catch (error) {
        console.error(`content.js - getSetting: Can't get ${offset} value ${error.message}`);

        return default_value;
    }
}

function resolveUrl(url) {
    if (typeof url !== "string") {
        return null;
    }

    const origin_domain = window.location.origin === "null" ? window.location.href : window.location.origin;

    try {
        return new URL(url, origin_domain);
    } catch (error) {
        console.error(`content.js - resolveUrl: URL parsing error, ${url ?? "empty"} ${error.message}`);

        return null;
    }
}

function fancyFormatUrl(url) {
    if (typeof url !== "string") {
        return "";
    }

    const parsed_url = new URL(url);

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
    const all_rich_snippets = [...document.querySelectorAll('script[type="application/ld+json"]')];

    const rich_snippets = Object.create(null);

    if (all_rich_snippets.length > 0) {
        for (let i = 0; i < all_rich_snippets.length; i++) {
            try {
                const rich_snippet = JSON.parse(all_rich_snippets[i].textContent || all_rich_snippets[i].innerText);

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
            } catch (error) {
                console.error(`content.js - Invalid JSON in script tag ${error.message}`);

                continue;
            }
        }
    }

    return rich_snippets;
}

function flattenJSON(obj, parent = "", res = []) {
    if (typeof parent !== "string") {
        console.error("Parameter parent must be string");
        return false;
    }

    if (!Array.isArray(res)) {
        console.error("Parameter res must be array");
        return false;
    }

    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = obj[key] ?? "";

            if (typeof value === "object" && !Array.isArray(value)) {
                flattenJSON(value, `${key}.`, res); // Accumulate key path for nested objects
            } else if (Array.isArray(value)) {
                value.forEach((item, index) => {
                    if (typeof item === "object") {
                        flattenJSON(item, `${key}[${index}].`, res); // Accumulate key path for array of objects
                    } else {
                        res.push({ key: `${key}[${index}]`, value: item.toString() });
                    }
                });
            } else if (typeof value === "string") {
                res.push({ key: key, value: value }); // Push the current key-value pair
            }
        }
    }

    return res;
}



function getImageStatistics() {
    const img_elements = [...document.querySelectorAll("img")];

    const result = Object.assign(Object.create(null), {
        total_images: 0,
        images_without_alt: 0,
        images_list: []
    });

    if (img_elements.length > 0) {
        for (let i = 0; i < img_elements.length; i++) {
            const img = img_elements[i];
            const img_src = img.getAttribute("src");

            const parsed_url = resolveUrl(img_src)?.toString();

            if (parsed_url) result.images_list.push(parsed_url);

            const alt_text = img.getAttribute("alt")?.trim() || "";

            // Check if the image has an alt attribute and if it"s not empty
            if (alt_text === "") {
                result.images_without_alt++;
            }

            result.total_images++;
        }
    }

    return result;
}

function getTextContent(element) {
    if (!element) return "";

    let text = "";
    const stack = [element];
    let counter = 0;

    while (stack.length > 0) {
        if (counter > 10) break;

        const node = stack.pop();

        // Skip 'noscript' elements
        if (node.nodeName.toLowerCase() === "noscript") {
            continue;
        }

        node.childNodes.forEach(childNode => {
            if (childNode.nodeType === Node.TEXT_NODE) {
                text += childNode.textContent.trim() + " ";
            } else if (childNode.nodeType === Node.ELEMENT_NODE) {
                stack.push(childNode);
            }
        });

        counter++;
    }

    return text.trim();
}

function getLinkStatistics() {
    const link_elements = [...document.querySelectorAll("link")];

    const grouped_links = Object.assign(Object.create(null), {
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

        for (let i = 0; i < link_elements.length; i++) {
            const link_element = link_elements[i];
            const name = link_element.getAttribute("rel")?.toLowerCase().trim();
            const href = link_element.getAttribute("href")?.trim();

            const parsed_url = resolveUrl(href)?.toString();

            if (!parsed_url || (!parsed_url.startsWith("http://") && !parsed_url.startsWith("https://"))) {
                continue;
            }

            if (name && href) {
                if (name === "canonical") {
                    // Canonical links: Only one should be present
                    grouped_links.canonical = parsed_url;
                } else if (name === "alternate" && link_element.hasAttribute("hreflang")) {
                    // Handle language alternates
                    const hreflang = link_element.getAttribute("hreflang").trim();

                    grouped_links.language.push({
                        hreflang: hreflang,
                        href: parsed_url
                    });
                } else if (name === "alternate" && link_element.hasAttribute("type")) {
                    const type = link_element.getAttribute("type").trim();

                    grouped_links.alternate.push({
                        name: name,
                        type: type,
                        href: parsed_url
                    });
                } else if (validNavigationRels.includes(name)) {
                    // Group navigational links
                    grouped_links.navigation[name] = parsed_url;
                } else if (validPerformanceRels.includes(name)) {
                    // Group performance-related links
                    grouped_links.performance[name] = parsed_url;
                } else if (name === "stylesheet") {
                    // Handle stylesheet
                    if (!grouped_links.stylesheet.includes(parsed_url)) {
                        grouped_links.stylesheet.push(parsed_url);
                    }
                } else if (name.includes("icon") || name.includes("shortcut")) {
                    // Handle icons
                    const type = link_element.getAttribute("type")?.trim();
                    const sizes = link_element.getAttribute("sizes")?.trim();

                    grouped_links.icons.push({
                        name: name,
                        type: type || "image/x-icon", // Default icon type
                        sizes: sizes || "any",
                        href: parsed_url
                    });
                }
            }
        }

        // Sort icons by size
        grouped_links.icons.sort((a, b) => {
            const sizeA = a.sizes === "any" ? -Infinity : parseInt(a.sizes.split("x")[0], 10) || 0;
            const sizeB = b.sizes === "any" ? -Infinity : parseInt(b.sizes.split("x")[0], 10) || 0;

            // Sort in descending order, and ensure "any" is at the end
            if (sizeA === -Infinity) return 1;  // Move "any" to the end
            if (sizeB === -Infinity) return -1; // Move "any" to the end

            return sizeB - sizeA; // Sort by size, largest to smallest
        });
    }

    return grouped_links;
}

function isBlockedByRobots(robots_txt_rules, setting_ua, pathname) {
    if (typeof robots_txt_rules !== 'object') {
        console.error("Parameter robots_txt_rules must be object");
        return false;
    }

    if (typeof setting_ua !== "string") {
        console.error("Parameter setting_ua must be string");
        return false;
    }

    if (typeof pathname !== "string") {
        console.error("Parameter pathname must be string");
        return false;
    }

    try {
        // Iterate through all user-agent rules in robots_txt_rules
        for (const userAgent in robots_txt_rules) {
            if (userAgent.toLowerCase() !== setting_ua.toLowerCase()) continue;

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
    } catch (error) {
        console.error(`content.js - isBlockedByRobots: ${error.message}`);

        return false; // Default behavior in case of an error
    }
}

function getHyperlinkStatistics(robots_txt_rules, setting_ua) {
    if (typeof robots_txt_rules !== 'object') {
        console.error("Parameter robots_txt_rules must be object");
        return false;
    }

    if (typeof setting_ua !== "string") {
        console.error("Parameter setting_ua must be string");
        return false;
    }

    const link_elements = [...document.querySelectorAll("a")];

    const result = Object.assign(Object.create(null), {
        total_internal: 0,
        total_external: 0,
        internal_links: [],
        external_links: []
    });

    if (link_elements.length > 0) {
        const origin_domain = window.location.hostname;

        for (let i = 0; i < link_elements.length; i++) {
            const href = link_elements[i].getAttribute("href");

            if (!href) continue;  // Skip empty href values

            const parsed_url = resolveUrl(href);

            if (!parsed_url) continue;

            // Skip unwanted protocols
            const url_string = parsed_url.toString();
            const link_domain = parsed_url.hostname;

            if (link_domain === origin_domain) {
                result.total_internal++;
            }

            if (
                href.startsWith("#")
                || href.startsWith("mailto:")
                || href.startsWith("javascript:")
                || href.startsWith("sms:")
                || href.startsWith("tel:")
            ) continue;

            // Get the "rel" attribute values
            const rel = link_elements[i].getAttribute("rel");

            // rel value can either null or "null"
            const rel_array = (rel && rel !== "null") ? rel.split(" ").map(item => item.trim()) : [];

            // Get anchor text, or alternative text from an image if anchor text is empty
            let anchorText = getTextContent(link_elements[i]);

            // If no text found, check for an image and try to use the alt or title attributes.
            if (!anchorText) {
                const img = link_elements[i].querySelector("img");

                if (img) {
                    anchorText = img.getAttribute("alt") || img.getAttribute("title") || "";
                }
            }

            // Check if it"s internal or external
            if (link_domain === origin_domain) {
                let is_blocked = false;

                if (robots_txt_rules) {
                    is_blocked = isBlockedByRobots(robots_txt_rules, setting_ua, parsed_url.pathname);

                    // if (is_blocked) console.warn(url_string, is_blocked);
                }

                result.internal_links.push({
                    "url": url_string,
                    "anchor": anchorText || null,
                    "is_blocked": is_blocked,
                    "rel": rel_array
                });
            } else {
                result.total_external++;

                result.external_links.push({ "url": url_string, "anchor": anchorText || null, "rel": rel_array });
            }
        }
    }

    return result;
}


function groupMetaElements() {
    const meta_elements = [...document.querySelectorAll("meta")];

    const groupedMetas = Object.assign(Object.create(null), {
        facebook: Object.create(null),
        twitter: Object.create(null),
        dublin_core: Object.create(null),
        general: Object.create(null),
        other: Object.create(null)
    });

    if (meta_elements.length > 0) {
        const general_meta_keys = ["description", "keywords", "publisher", "author", "copyright", "robots", "googlebot", "viewport"];

        for (let i = 0; i < meta_elements.length; i++) {
            const meta_element = meta_elements[i];
            const name = meta_element.getAttribute("name")?.toLowerCase() || meta_element.getAttribute("property")?.toLowerCase();
            const content = meta_element.getAttribute("content")?.toString();

            if (name && content) {
                if (name.startsWith("og:") || name.startsWith("fb:") || name.startsWith("article:") || name.startsWith("product:")) {
                    // Group Facebook (Open Graph) meta tags
                    groupedMetas.facebook[name] = content;
                } else if (name.startsWith("twitter:")) {
                    // Group Twitter meta tags
                    groupedMetas.twitter[name] = content;
                } else if (name.startsWith("dc.")) {
                    // Group Dublin Core meta tags
                    groupedMetas.dublin_core[name] = content;
                } else if (general_meta_keys.includes(name)) {
                    // General meta tags
                    groupedMetas.general[name] = content;
                } else {
                    // Other general meta tags
                    groupedMetas.other[name] = content;
                }
            }
        }
    }

    return groupedMetas;
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
    const headings = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")];

    const heading_stats = Object.assign(Object.create(null), { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 });

    const nesting_errors = Object.create(null);

    let empty_errors = 0;

    let html = "";

    if (headings.length > 0) {
        html = '<ul class="heading-list">';

        let stack = [];

        let previousLevel = 0;

        for (let i = 0; i < headings.length; i++) {
            const heading = headings[i];
            const level = parseInt(heading.tagName[1], 10);
            let headingText = heading.textContent.trim();

            if (headingText.length === 0) {
                empty_errors++;
            }

            // Update heading statistics
            heading_stats[`h${level}`]++;

            // Detect incorrect nesting
            if (level > previousLevel + 1) {
                const errorKey = `${previousLevel}-${level}`;

                if (!nesting_errors[errorKey]) {
                    nesting_errors[errorKey] = {
                        previous_level: previousLevel,
                        current_level: level,
                        occurrences: 0,
                        examples: []
                    };
                }

                nesting_errors[errorKey].occurrences++;

                if (!nesting_errors[errorKey].examples.some(ex => ex.heading_text === headingText)) {
                    nesting_errors[errorKey].examples.push({
                        tag_name: heading.tagName,
                        heading_text: headingText,
                    });
                }
            }

            // Close previous list items as needed
            while (stack.length > 0 && stack[stack.length - 1] >= level) {
                html += "</li></ul>";

                stack.pop();
            }

            // Add current heading to the list
            if (i > 0) {
                html += "</li>";
            }

            headingText = headingText || "text_empty_heading".i18n();

            html += `<li><span class="tag">${heading.tagName}</span> <h${level}>${headingText}</h${level}>`;

            // Prepare for potential child headings
            const nextHeading = headings[i + 1];

            if (nextHeading) {
                const nextLevel = parseInt(nextHeading.tagName[1], 10);

                if (nextLevel > level) {
                    html += "<ul>";

                    stack.push(level);
                }
            }

            previousLevel = level;
        }

        // Close any remaining open tags
        while (stack.length > 0) {
            html += "</li></ul>";

            stack.pop();
        }

        html += "</li></ul>";
    }

    return {
        "html": html,
        "heading_stats": heading_stats,
        "nesting_errors": nesting_errors,
        "empty_errors": empty_errors,
    };
}

function createSafeRegExp(value) {
    if (typeof value !== "string") {
        console.error("Parameter value must be string");
        return false;
    }

    if (value.length > 100) { // Limit input length to avoid excessive processing
        console.error("Input too long.");

        return null;
    }

    try {
        const sanitized_value = value
            .replace(/[#-.]|[[-^]|[?|{}]/gu, '\\$&')
            .replace(/\*/gu, ".*");

        return new RegExp(sanitized_value, RegExp.prototype.unicode);
    } catch (error) {
        console.error(`content.js - createSafeRegExp: Invalid RegExp error, ${error.message}`);

        return null;
    }
}

function parseRobotsTxt(content) {
    if (typeof content !== "string") {
        console.error("Parameter content must be string");
        return false;
    }

    const result = Object.assign(Object.create(null), {
        rules: Object.create(null),
        sitemaps: []
    });

    let new_content = [];

    for (const line of content.split("\n")) {
        const trimmedLine = line.trim();

        // Ignore comments and empty lines
        if (!trimmedLine || trimmedLine.startsWith("#")) continue;

        // Find the first colon, which separates the directive and value
        const colonIndex = trimmedLine.indexOf(":");

        if (colonIndex === -1) continue; // If no colon is found, skip the line


        const directive = trimmedLine.slice(0, colonIndex).trim().toLowerCase();
        const value = trimmedLine.slice(colonIndex + 1).trim(); // Everything after the colon is the value

        if (!directive || !value) continue;

        new_content.push({ directive: directive, value: value });
    }

    let user_agent_list = [];
    let same_ua = false;

    // Handle case when robots.txt does not start with User-Agent
    if (new_content[0] && new_content[0].directive !== "user-agent") {
        new_content.unshift({ directive: "user-agent", value: "*" });
    }

    for (let i = 0; i < new_content.length; i++) {
        const current = new_content[i];
        const next = new_content[i + 1];

        if (current.directive === "user-agent") {
            user_agent_list.push(current.value);

            if (!result.rules[current.value]) {
                result.rules[current.value] = { allow: [], disallow: [] };
            }
        } else if (current.directive === "allow") {
            const regex = createSafeRegExp(current.value);

            user_agent_list.forEach(agent => {
                if (regex) result.rules[agent].allow.push(regex);
            });

            same_ua = true;
        } else if (current.directive === "disallow") {
            const regex = createSafeRegExp(current.value);

            user_agent_list.forEach(agent => {
                if (regex) result.rules[agent].disallow.push(regex);
            });

            same_ua = true;
        } else if (current.directive === "crawl-delay") {
            const crawlDelay = parseFloat(current.value);

            if (!isNaN(crawlDelay)) {
                user_agent_list.forEach(agent => {
                    result.rules[agent].crawlDelay = crawlDelay;
                });
            }

            same_ua = true;
        } else if (current.directive === "sitemap") {
            const parsed_url = resolveUrl(current.value)?.toString();

            if (parsed_url) result.sitemaps.push(parsed_url);
        }

        if (next && same_ua === true && next.directive === "user-agent") {
            same_ua = false;
            user_agent_list = [];
        }
    }

    return result;
}

async function getResponseStats(url, options = {}, timeout = 3000) {
    if (typeof url !== "string") {
        console.error("Parameter url must be string");
        return false;
    }

    if (typeof options !== "object") {
        console.error("Parameter options must be object");
        return false;
    }

    if (typeof timeout !== "number") {
        console.error("Parameter timeout must be number");
        return false;
    }

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return null;
    }

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        options.mode = "cors";
        options.signal = controller.signal;

        const response = await fetch(url, options);

        clearTimeout(timer);

        return { "headers": response.headers, "status": response.status, "response_body": await response.text() };
    } catch (error) {
        console.error(`content.js - getResponseStats: Failed fetch URL ${url}, ${error.message}`);

        return null;
    }
}

async function getPageFavicon(all_icons) {
    if (!Array.isArray(all_icons)) {
        console.error("Parameter all_icons must be array");
        return false;
    }

    const icon_links = all_icons.slice(0, 3);

    for (const icon_link of icon_links) {
        const result = await getFaviconUrlAsData(icon_link.href);

        if (result) {
            return result;
        }
    }

    return "/icons/broken-image.svg";
}

async function getFaviconUrlAsData(url, timeout = 3000) {
    if (typeof url !== "string") {
        console.error("Parameter url must be string");
        return false;
    }

    if (typeof timeout !== "number") {
        console.error("Parameter timeout must be number");
        return false;
    }

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return null;
    }

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        const options = Object.create(null);

        options.mode = "cors";
        options.signal = controller.signal;

        const response = await fetch(url);

        clearTimeout(timer);

        const blob = await response.blob();

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error(`content.js - getFaviconUrlAsData: Failed fetch favicon ${url}, ${error.message}`);

        return null;
    }
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
            robots_txt_exists = [200, 302].includes(robots_txt_stat?.status ?? 0);
        }
    }


    const page_title = document.title.trim() || null;
    const page_language = document.documentElement.lang.trim() || null;

    const page_links = getLinkStatistics();
    const meta_elements = groupMetaElements();

    const meta_keys = ["description", "og:description", "twitter:description", "dc.description"];

    let page_description = document.body.innerText.slice(0, 155).trim() || null;

    for (const key of meta_keys) {
        for (const group in meta_elements) {
            if (
                Object.prototype.hasOwnProperty.call(meta_elements, group) &&
                meta_elements[group][key]
            ) {
                page_description = meta_elements[group][key];
                break;
            }
        }
        if (page_description) break;
    }


    let seo_preview = Object.create(null);

    const show_seo_preview = await getSetting("show-seo-preview", false);

    if (show_seo_preview) {
        seo_preview = {
            "title": page_title,
            "breadcrumb": fancyFormatUrl(window.location.href),
            "description": page_description,
            "favicon": await getPageFavicon(page_links.icons)
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

// Listen for messages from the extension
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case "getPageData":
            sendResponse(extractMetadata());
            break;
    }

    return true; // Keep the message channel open for async responses
});

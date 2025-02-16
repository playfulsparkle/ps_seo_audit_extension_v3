function fancyFormatUrl(url) {
    const parsedUrl = new URL(url);
    let pathSegments = [];

    if (parsedUrl.origin !== "null") {
        pathSegments.push(parsedUrl.origin);
    }

    pathSegments = pathSegments.concat(
        parsedUrl.pathname.split('/').filter(Boolean).map(segment => decodeURIComponent(segment))
    );

    return pathSegments.join(' › ');
}

function parseRichSnippets() {
    const all_rich_snippets = [...document.querySelectorAll('script[type="application/ld+json"]')];

    // Second pass to map the data and extract important information
    const rich_snippets = [];
    const result = [];

    if (all_rich_snippets.length === 0) {
        return result;
    }

    for (let i = 0; i < all_rich_snippets.length; i++) {
        try {
            rich_snippets.push(JSON.parse(all_rich_snippets[i].textContent || all_rich_snippets[i].innerText));
        } catch (e) {
            console.error('Invalid JSON in script tag:', e);

            continue;
        }
    }

    return flattenJSON(rich_snippets);
}

function flattenJSON(obj, parent = '', res = []) {
    for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
            const value = obj[key];

            // Only include non-null and non-undefined values
            if (value === null || value === undefined) {
                continue;
            }

            // Skip adding the prefix if the key is "@graph"
            const newParent = key === '@graph' ? '' : key;

            if (typeof value === 'object' && !Array.isArray(value)) {
                flattenJSON(value, `${newParent}.`, res); // Accumulate key path for nested objects
            } else if (Array.isArray(value)) {
                value.forEach((item, index) => {
                    if (typeof item === 'object') {
                        flattenJSON(item, `${newParent}[${index}].`, res); // Accumulate key path for array of objects
                    } else {
                        res.push({ key: `${newParent}[${index}]`, value: item.toString() });
                    }
                });
            } else {
                res.push({ key: newParent, value: value.toString() }); // Push the current key-value pair
            }
        }
    }
    return res;
}



function getImageStatistics() {
    const img_elements = [...document.querySelectorAll('img')];

    let total_images = 0;
    let images_without_alt = 0;
    const images_list = [];

    for (let i = 0; i < img_elements.length; i++) {
        const img = img_elements[i];

        let new_src;

        try {
            new_src = new URL(img.getAttribute('src'), window.location.origin);
        } catch (error) {
            continue;
        }

        total_images++;

        // Check if the image has an alt attribute and if it's not empty
        if (!img.hasAttribute('alt') || img.getAttribute('alt').trim() === '') {
            images_without_alt++;
        }

        // Add resolved image src to the list as a string
        images_list.push(new_src.toString());
    }

    return {
        total_images,
        images_without_alt,
        images_list
    };
}

function getTextContent(element) {
    if (!element) return null;

    let text = '';
    const stack = [element];
    let counter = 0;

    while (stack.length > 0) {
        if (counter > 10) break;

        const node = stack.pop();

        node.childNodes.forEach(childNode => {
            if (childNode.nodeType === Node.TEXT_NODE) {
                text += childNode.nodeValue.trim() + ' ';
            } else if (childNode.nodeType === Node.ELEMENT_NODE) {
                stack.push(childNode);
            }
        });

        counter++;
    }

    return text.trim();
}

function getLinkStatistics() {
    const link_elements = [...document.querySelectorAll('link')];

    const grouped_links = {
        canonical: null, // Only one canonical tag should exist
        languages: [], // hreflang alternate URLs
        navigation: {},
        performance: {},
        icons: [],
        stylesheets: [],
        other: []
    };

    // Define valid relationships for each category
    const validNavigationRels = ['search', 'prev', 'next', 'sitemap', 'license'];
    const validPerformanceRels = ['preload', 'dns-prefetch', 'prefetch', 'preconnect', 'amphtml', 'manifest'];

    for (let i = 0; i < link_elements.length; i++) {
        const link_element = link_elements[i];
        const name = link_element.getAttribute('rel')?.toLowerCase().trim();
        const href = link_element.getAttribute('href')?.trim();

        let new_url;

        try {
            // Resolving the href to a full URL
            new_url = new URL(href, window.location.origin).toString();
        } catch (error) {
            continue;  // Skip invalid URLs
        }

        if (name && href) {
            if (name === "canonical") {
                // Canonical links: Only one should be present
                grouped_links.canonical = new_url;
            } else if (name === "alternate" && !href.startsWith('android-app:') && !href.startsWith('ios-app:')) {
                // Handle language alternates
                const type = link_element.getAttribute('type')?.trim();
                const hreflang = link_element.getAttribute('hreflang')?.trim();

                grouped_links.languages.push({
                    type: type || "text/html", // Default type if not provided
                    hreflang: hreflang || "unknown",
                    href: new_url
                });
            } else if (validNavigationRels.includes(name)) {
                // Group navigational links
                grouped_links.navigation[name] = new_url;
            } else if (validPerformanceRels.includes(name)) {
                // Group performance-related links
                grouped_links.performance[name] = new_url;
            } else if (name === "stylesheet") {
                // Handle stylesheets
                if (!grouped_links.stylesheets.includes(new_url)) {
                    grouped_links.stylesheets.push(new_url);
                }
            } else if (name.includes("icon") || name.includes("shortcut")) {
                // Handle icons
                const type = link_element.getAttribute('type')?.trim();
                const sizes = link_element.getAttribute('sizes')?.trim();

                grouped_links.icons.push({
                    name: name,
                    type: type || "image/x-icon", // Default icon type
                    sizes: sizes || "any",
                    href: new_url
                });
            } else {
                // Group any remaining links under "other"
                grouped_links.other.push({
                    name: name,
                    href: new_url
                });
            }
        }
    }

    // Sort icons by size
    grouped_links.icons.sort((a, b) => {
        const sizeA = a.sizes === "any" ? -Infinity : parseInt(a.sizes.split('x')[0]) || 0;
        const sizeB = b.sizes === "any" ? -Infinity : parseInt(b.sizes.split('x')[0]) || 0;

        // Sort in descending order, and ensure "any" is at the end
        if (sizeA === -Infinity) return 1;  // Move "any" to the end
        if (sizeB === -Infinity) return -1; // Move "any" to the end

        return sizeB - sizeA; // Sort by size, largest to smallest
    });

    return grouped_links;
}

function isBlockedByRobots(robots_txt_rules, pathname) {
    try {
        // Iterate through all user-agent rules in robots_txt_rules
        for (const userAgent in robots_txt_rules) {
            if (robots_txt_rules.hasOwnProperty(userAgent)) {
                const rules = robots_txt_rules[userAgent];

                // Convert Disallow and Allow rules to regular expressions
                const disallowRegexes = rules.disallow.map(path => new RegExp(path.replace(/\*/g, '.*').replace(/\$/g, '\\$&')));
                const allowRegexes = rules.allow.map(path => new RegExp(path.replace(/\*/g, '.*').replace(/\$/g, '\\$&')));

                // Ensure pathname is a valid string
                if (typeof pathname !== 'string') {
                    console.error("Invalid pathname:", pathname);
                    return false;
                }

                // Check if the URL matches a Disallow rule and doesn't match an Allow rule
                const isDisallowed = disallowRegexes.some(regex => regex.test(pathname));
                const isAllowed = allowRegexes.some(regex => regex.test(pathname));

                // If the current set of rules blocks the pathname, return true
                if (isDisallowed && !isAllowed) {
                    return true;
                }
            }
        }

        // If no match found in any user-agent's rules, the path is allowed
        return false;
    } catch (error) {
        console.error("Error parsing robots.txt rules:", error);
        return false; // Default behavior in case of an error
    }
}

function getHyperlinkStatistics(robots_txt_rules) {
    const link_elements = [...document.querySelectorAll('a')];

    const result = {
        total_internal: 0,
        total_external: 0,
        internal_links: [],
        external_links: []
    };

    if (link_elements.length === 0) {
        return result;
    }

    const origin_domain = window.location.hostname;

    for (let i = 0; i < link_elements.length; i++) {
        const href = link_elements[i].getAttribute('href');

        if (!href) continue;  // Skip empty href values

        let new_url;

        try {
            // Resolving the href to a full URL
            new_url = new URL(href, window.location.origin);
        } catch (error) {
            continue;  // Skip invalid URLs
        }

        // Skip unwanted protocols
        const url_string = new_url.toString();
        const link_domain = new_url.hostname;

        if (link_domain === origin_domain) {
            result.total_internal++;
        }

        if (
            href.startsWith('#')
            || href.startsWith('mailto:')
            || href.startsWith('javascript:')
            || href.startsWith('sms:')
            || href.startsWith('tel:')
        ) continue;

        // Get the 'rel' attribute values
        const rel = link_elements[i].getAttribute('rel');
        const rel_array = rel ? rel.split(' ').map(item => item.trim()) : [];

        // Get anchor text, or alternative text from an image if anchor text is empty
        let anchorText = getTextContent(link_elements[i]);

        // If no text found, check for an image and try to use the alt or title attributes.
        if (!anchorText) {
            const img = link_elements[i].querySelector('img');

            if (img) {
                anchorText = img.getAttribute('alt') || img.getAttribute('title') || null;
            }
        }

        // Check if it's internal or external
        if (link_domain === origin_domain) {
            result.internal_links.push({
                "url": url_string,
                "anchor": anchorText || null,
                "is_blocked": isBlockedByRobots(robots_txt_rules, new_url.pathname),
                "rel": rel_array
            });
        } else {
            result.total_external++;

            result.external_links.push({ "url": url_string, "anchor": anchorText || null, "rel": rel_array });
        }
    }

    return result;
}


function groupMetaElements() {
    const meta_elements = [...document.querySelectorAll('meta')];

    const groupedMetas = {
        facebook: {},
        twitter: {},
        dublin_core: {},
        general: {},
        other: {}
    };

    if (meta_elements.length === 0) {
        return groupedMetas;
    }

    const general_meta_keys = ['description', 'keywords', 'publisher', 'author', 'copyright', 'robots', 'viewport'];

    for (let i = 0; i < meta_elements.length; i++) {
        const meta_element = meta_elements[i];
        const name = meta_element.getAttribute('name')?.toLowerCase() || meta_element.getAttribute('property')?.toLowerCase();
        const content = meta_element.getAttribute('content');

        if (name) {
            if (name.startsWith('og:') || name.startsWith('fb:') || name.startsWith('article:') || name.startsWith('product:')) {
                // Group Facebook (Open Graph) meta tags
                groupedMetas.facebook[name] = content.toString();
            } else if (name.startsWith('twitter:')) {
                // Group Twitter meta tags
                groupedMetas.twitter[name] = content.toString();
            } else if (name.startsWith('dc.')) {
                // Group Dublin Core meta tags
                groupedMetas.dublin_core[name] = content.toString();
            } else if (general_meta_keys.includes(name)) {
                // General meta tags
                groupedMetas.general[name] = content.toString();
            } else {
                // Other general meta tags
                groupedMetas.other[name] = content.toString();
            }
        }
    }

    return groupedMetas;
}

function getSEOStatistics() {
    const text = document.body.innerText;
    const words = text.trim().split(/\s+/);
    const word_count = words.length;
    const character_count = text.replace(/\s+/g, '').length; // Remove spaces for character count
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
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const headingStats = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
    const nestingErrors = {};
    let emptyErrors = 0;
    let html = '<ul class="heading-list">';
    const stack = [];

    let previousLevel = 0;

    for (let i = 0; i < headings.length; i++) {
        const heading = headings[i];
        const level = Number(heading.tagName[1]);
        const headingText = heading.textContent.trim();

        if (!headingText) {
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

        // Close previous list items as needed
        while (stack.length > 0 && stack[stack.length - 1] >= level) {
            html += '</li></ul>';
            stack.pop();
        }

        // Add current heading to the list
        if (i > 0) {
            html += '</li>';
        }
        html += `<li>${heading.tagName} ${headingText}`;

        // Prepare for potential child headings
        const nextHeading = headings[i + 1];
        if (nextHeading) {
            const nextLevel = Number(nextHeading.tagName[1]);
            if (nextLevel > level) {
                html += '<ul>';
                stack.push(level);
            }
        }

        previousLevel = level;
    }

    // Close any remaining open tags
    while (stack.length > 0) {
        html += '</li></ul>';
        stack.pop();
    }
    html += '</li></ul>';

    return {
        html,
        heading_stats: headingStats,
        nesting_errors: nestingErrors,
        empty_errors: emptyErrors,
    };
}

function parseRobotsTxt(content) {
    const lines = content.split('\n');
    const result = { rules: {}, sitemaps: [] };
    let currentUserAgent = null;

    lines.forEach(line => {
        const trimmedLine = line.trim();

        // Ignore comments and empty lines
        if (!trimmedLine || trimmedLine.startsWith('#')) return;

        // Find the first colon, which separates the directive and value
        const colonIndex = trimmedLine.indexOf(':');
        if (colonIndex === -1) return; // If no colon is found, skip the line

        const directive = trimmedLine.slice(0, colonIndex).trim();
        const value = trimmedLine.slice(colonIndex + 1).trim(); // Everything after the colon is the value

        if (!directive || !value) return;

        switch (directive.toLowerCase()) {
            case 'user-agent':
                currentUserAgent = value.toLowerCase();
                if (!result.rules[currentUserAgent]) {
                    result.rules[currentUserAgent] = { allow: [], disallow: [] };
                }
                break;
            case 'allow':
                if (currentUserAgent) {
                    result.rules[currentUserAgent].allow.push(value);
                }
                break;
            case 'disallow':
                if (currentUserAgent) {
                    result.rules[currentUserAgent].disallow.push(value);
                }
                break;
            case 'crawl-delay':
                if (currentUserAgent) {
                    result.rules[currentUserAgent].crawlDelay = parseFloat(value);
                }
                break;
            case 'sitemap':
                try {
                    const sitemap_url = new URL(value, window.location.origin).toString();
                    result.sitemaps.push(sitemap_url);
                } catch (error) {
                    // Handle invalid URL in sitemap
                }
                break;
        }
    });

    return result;
}

/**
 * Fetches the HTTP response headers for a given URL using a HEAD request.
 *
 * @param {string} url - The URL to fetch the response headers from.
 * @returns {Promise<Headers|object>} A promise that resolves to the HTTP response headers, or null if the request fails.
 */
async function getResponseStats(url, options = {}, timeout = 3000) {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        options.mode = 'cors';
        options.signal = controller.signal;

        const response = await fetch(url, options);

        clearTimeout(timer);

        return { "headers": response.headers, "status": response.status, "response_body": await response.text() };
    } catch (error) {
        console.error(`Failed to fetch headers for ${url}:`, error);

        return null;
    }
}

async function getPageFavicon(iconLinks) {
    // Try to find the first valid favicon (non-null) using Array.find
    for (const iconLink of iconLinks) {
        const result = await getFaviconUrlAsData(iconLink.href);

        if (result !== null) {
            return result; // Return the first valid result
        }
    }

    return "/icons/icon-32.png"; // Return default if no valid favicon is found
}

async function getFaviconUrlAsData(url, timeout = 3000) {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        const options = {};

        options.mode = 'cors';
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
        console.error("Failed to fetch favicon:", error);

        return null;
    }
}

function getSchemeAndHost(url = window.location.href) {
    try {
        const parsedUrl = new URL(url);

        return parsedUrl.protocol + '//' + parsedUrl.hostname + '/';
    } catch (error) {
        return "";
    }
}

async function extractMetadata() {
    const robots_txt_stat = await getResponseStats(getSchemeAndHost() + "robots.txt");
    // const sitemap_stat = await getResponseStats(getSchemeAndHost() + "sitemap.xml", { "method": "HEAD" });

    let robots_txt_rules = null;
    let robots_txt_sitemaps = null;

    if (robots_txt_stat) {
        const parsed_robots_txt = parseRobotsTxt(robots_txt_stat.response_body);

        robots_txt_rules = parsed_robots_txt.rules;
        robots_txt_sitemaps = parsed_robots_txt.sitemaps;
    }


    const page_title = document.title.trim() || null;
    const page_language = document.documentElement.lang.trim() || null;

    const page_links = getLinkStatistics();
    const meta_elements = groupMetaElements();

    const keysToCheck = ['description', 'og:description', 'twitter:description', 'dc.description'];

    let page_description = document.body.innerText.substring(0, 155).trim() || null;

    for (const key of keysToCheck) {
        for (const group in meta_elements) {
            if (meta_elements.hasOwnProperty(group) && meta_elements[group][key]) {
                page_description = meta_elements[group][key];
                break;
            }
        }
        if (page_description) break;
    }

    return {
        'url': window.location.href,
        'title': page_title,
        'language': page_language,
        'robots_txt': [200, 302].includes(robots_txt_stat?.status ?? 0),
        'robots_txt_sitemaps': robots_txt_sitemaps,
        // 'sitemap': [200, 302].includes(sitemap_stat?.status ?? 0),
        'rich_snippets': parseRichSnippets(),
        'metas': meta_elements,
        'hyperlinks': getHyperlinkStatistics(robots_txt_rules),
        'links': page_links,
        'images': getImageStatistics(),
        'seo_stats': getSEOStatistics(),
        'headings': extractHeadings(),
        'preview': {
            'title': page_title,
            'breadcrumb': fancyFormatUrl(window.location.href),
            'description': page_description,
            'favicon': await getPageFavicon(page_links.icons)
        }
    };
}

// Listen for messages from the extension
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case 'getPageData':
            sendResponse(extractMetadata());
            break;
    }

    return true; // Keep the message channel open for async responses
});

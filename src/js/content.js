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

function findAny(metas, elements) {
    for (let i = 0; i < metas.length; i++) {
        const name = metas[i].getAttribute('name')?.toLowerCase() || metas[i].getAttribute('property')?.toLowerCase();
        const content = metas[i].getAttribute('content');

        if (content && elements.includes(name)) {
            return content.toString();
        }
    }

    return null;
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

function getHyperlinkStatistics() {
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
        const urlString = new_url.toString();
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
        const relArray = rel ? rel.split(' ').map(item => item.trim()) : [];

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
            result.internal_links.push({ url: urlString, anchor: anchorText || null, rel: relArray });
        } else {
            result.total_external++;
            result.external_links.push({ url: urlString, anchor: anchorText || null, rel: relArray });
        }
    }

    return result;
}


function groupMetaElements(meta_elements) {
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
            } else if (['description', 'keywords', 'publisher', 'author', 'copyright', 'robots', 'viewport'].includes(name)) {
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

function getSchemeAndHost(url = window.location.href) {
    const parsedUrl = new URL(url);

    return parsedUrl.protocol + '//' + parsedUrl.hostname + '/';
}

function extractMetadata() {
    const meta_elements = [...document.querySelectorAll('meta')];

    const page_title = document.title.trim() || null;
    const page_language = document.documentElement.lang || null;

    let page_description = findAny(meta_elements, ['description', 'dc.description', 'og:description', 'twitter:description']);

    if (!page_description) {
        page_description = document.body.innerText || null;
    }

    return {
        'url': window.location.href,
        'host': getSchemeAndHost(),
        'title': page_title,
        'language': page_language,
        'rich_snippets': parseRichSnippets(),
        'metas': groupMetaElements(meta_elements),
        'hyperlinks': getHyperlinkStatistics(),
        'links': getLinkStatistics(),
        'images': getImageStatistics(),
        'seo_stats': getSEOStatistics(),
        'headings': extractHeadings(),
        'preview': {
            'title': page_title,
            'breadcrumb': fancyFormatUrl(window.location.href),
            'description': page_description
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

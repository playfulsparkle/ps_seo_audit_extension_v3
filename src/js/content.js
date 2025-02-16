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
        language: {},
        navigation: {},
        stylesheet: {},
        icon: {},
        other: {}
    };

    for (let i = 0; i < link_elements.length; i++) {
        const link_element = link_elements[i];
        const name = link_element.getAttribute('rel')?.toLowerCase();
        const href = link_element.getAttribute('href');
        const hreflang = link_element.getAttribute('hreflang');

        if (name) {
            if (name === "alternate") {
                grouped_links.language[name] = { "hreflang": hreflang.toString(), "href": href.toString() };
            } else if (['prev', 'next', 'preload', 'prefetch', 'preconnect', 'robots', 'viewport', 'canonical', 'manifest', 'sitemap', 'amphtml'].includes(name)) {
                grouped_links.navigation[name] = href.toString();
            } else if (name === "stylesheet") {
                grouped_links.stylesheet[name] = href.toString();
            } else if (name.includes("icon")) {
                grouped_links.icon[name] = href.toString();
            } else {
                grouped_links.other[name] = content.toString();
            }
        }
    }

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
    const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')];
    const root = document.createElement('ul');
    root.setAttribute('class', 'heading-list');
    const stack = [{ level: 0, list: root }];
    const heading_stats = {
        h1: 0,
        h2: 0,
        h3: 0,
        h4: 0,
        h5: 0,
        h6: 0,
    };
    const nesting_errors = [];

    headings.forEach((heading, index) => {
        const level = parseInt(heading.tagName[1], 10);
        const listItem = document.createElement('li');
        const headingText = heading.textContent.trim()

        listItem.textContent = `${heading.tagName} ${headingText}`;

        // Update heading count for statistics
        heading_stats[`h${level}`]++;

        // Check for incorrect nesting (flagging when level skips more than one)
        if (stack.length > 1) {
            const lastValidLevel = stack[stack.length - 1].level;

            // Adjust the incorrect nesting check to flag any level skips
            if (level > lastValidLevel + 1) {
                nesting_errors.push({
                    tag_name: heading.tagName,
                    heading_text: headingText,
                    previous_level: lastValidLevel,
                    current_level: level,
                });
            }

            // Ensure the stack only contains valid headings. Pop it to correct the nesting level.
            while (stack.length > 1 && stack[stack.length - 1].level >= level) {
                stack.pop();
            }
        }

        const parentList = stack[stack.length - 1].list;
        parentList.appendChild(listItem);

        const nextHeading = headings[index + 1];

        if (nextHeading && parseInt(nextHeading.tagName[1], 10) > level) {
            const newList = document.createElement('ul');

            listItem.appendChild(newList);

            stack.push({ level, list: newList });
        }
    });

    return {
        html: root.outerHTML,
        heading_stats,
        nesting_errors,
    };
}

function getSchemeAndHost(url = window.location.href) {
    const parsedUrl = new URL(url);

    return parsedUrl.protocol + '//' + parsedUrl.hostname + '/';
}

function extractMetadata() {
    const meta_elements = [...document.querySelectorAll('meta')];


    const icon_links = [...document.querySelectorAll('link[rel*="icon"], link[rel*="shortcut"]')];

    const page_title = document.title.trim() || null;
    const page_language = document.documentElement.lang || null;

    let page_description = findAny(meta_elements, ['description', 'dc.description', 'og:description', 'twitter:description']);

    if (!page_description) {
        page_description = document.body.innerText || null;
    }

    return {
        'icon_links': icon_links.map(link => link.href),
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

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
            return content;
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

function getLinkStatistics() {
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

        if (urlString.startsWith('mailto:') || urlString.startsWith('sms:') || urlString.startsWith('tel:')) continue;

        const link_domain = new_url.hostname;

        // Get the 'rel' attribute values
        const rel = link_elements[i].getAttribute('rel');
        const relArray = rel ? rel.split(' ').map(item => item.trim()) : [];
        const anchorText = link_elements[i].innerText.replace(/\r?\n|\r/g, ' ').trim();

        // Check if it's internal or external
        if (link_domain === origin_domain) {
            result.internal_links.push({ url: urlString, anchor: anchorText, rel: relArray });
        } else {
            result.external_links.push({ url: urlString, anchor: anchorText, rel: relArray });
        }
    }

    result.total_internal = result.internal_links.length;
    result.total_external = result.external_links.length;

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
    const avg_sentence_length = sentence_count ? (word_count / sentence_count).toFixed(2) : 0;

    // Calculate average word length
    const avg_word_length = (character_count / word_count).toFixed(2);

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
        listItem.textContent = `${heading.tagName} ${heading.textContent.trim()}`;

        // Update heading count for statistics
        heading_stats[`h${level}`]++;

        // Check for incorrect nesting (flagging when level skips more than one)
        if (stack.length > 1) {
            const lastValidLevel = stack[stack.length - 1].level;

            // Adjust the incorrect nesting check to flag any level skips
            if (level > lastValidLevel + 1) {
                nesting_errors.push({
                    tag_name: heading.tagName,
                    heading_text: heading.textContent.trim(),
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

function extractMetadata() {
    const meta_elements = [...document.querySelectorAll('meta')];

    const preview_description = findAny(meta_elements, ['description', 'dc.description', 'og:description', 'twitter:description']);

    const icon_links = [...document.querySelectorAll('link[rel*="icon"], link[rel*="shortcut"]')];

    const page_title = document.title.length === 0 ? null : document.title;
    const page_language = document.documentElement.lang.length === 0 ? null : document.documentElement.lang;

    return {
        'icon_links': icon_links.map(link => link.href),
        'url': window.location.href,
        'title': page_title,
        'language': page_language,
        'rich_snippets': parseRichSnippets(),
        'metas': groupMetaElements(meta_elements),
        'links': getLinkStatistics(),
        'images': getImageStatistics(),
        'seo_stats': getSEOStatistics(),
        'headings': extractHeadings(),
        'preview': {
            'title': page_title,
            'breadcrumb': fancyFormatUrl(window.location.href),
            'description': preview_description ?? document.body.innerText.substring(0, 155)
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

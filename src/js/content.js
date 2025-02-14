function fancyFormatUrl(url) {
    const parsedUrl = new URL(url);
    let pathSegments = [];

    if (parsedUrl.origin !== "null") pathSegments.push(parsedUrl.origin);

    parsedUrl.pathname.split('/').filter(Boolean).forEach(segment => {
        pathSegments.push(decodeURIComponent(segment));  // Decode each segment
    });

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
    const all_rich_snippets = document.querySelectorAll('script[type="application/ld+json"]');

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

    // Loop through all rich snippets
    for (let i = 0; i < rich_snippets.length; i++) {
        const data = rich_snippets[i];
        let itemsToProcess = [];

        // If @graph exists, process each item in the graph array
        if (data['@graph']) {
            itemsToProcess = data['@graph'];
        } else {
            // Otherwise, treat the data as a single item
            itemsToProcess = [data];
        }

        // Loop through items to process
        for (let j = 0; j < itemsToProcess.length; j++) {
            const item = itemsToProcess[j];
            const parsedResult = {};

            parsedResult['@type'] = item['@type'];

            switch (item['@type']) {
                case 'Organization':
                    parsedResult.name = item.name || 'N/A';
                    parsedResult.description = item.description || 'N/A';
                    parsedResult.url = item.url || 'N/A';
                    parsedResult.sameAs = item.sameAs || 'N/A';
                    break;

                case 'WebSite':
                    parsedResult.name = item.name || 'N/A';
                    parsedResult.url = item.url || 'N/A';
                    break;

                case 'Person':
                    parsedResult.name = item.name || 'N/A';
                    parsedResult.jobTitle = item.jobTitle || 'N/A';
                    parsedResult.url = item.url || 'N/A';
                    break;

                case 'WebPage':
                    parsedResult.name = item.name || 'N/A';
                    parsedResult.url = item.url || 'N/A';
                    parsedResult.description = item.description || 'N/A';
                    break;

                case 'ImageObject':
                    parsedResult.url = item.url || 'N/A';
                    parsedResult.thumbnailUrl = item.thumbnailUrl || 'N/A';
                    break;

                case 'BreadcrumbList':
                    parsedResult.items = item.itemListElement || [];
                    break;

                default:
                    parsedResult.name = item.name || 'N/A';
                    parsedResult.description = item.description || 'N/A';
                    parsedResult.url = item.url || 'N/A';
            }

            result.push(parsedResult);
        }
    }

    return result;
}

function getImageStatistics() {
    const img_elements = document.querySelectorAll('img');

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
    const link_elements = document.querySelectorAll('a');

    const result = {
        total_nternal: 0,
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

        // Check if it's internal or external
        if (link_domain === origin_domain) {
            result.internal_links.push(urlString);
        } else {
            result.external_links.push(urlString);
        }
    }

    result.total_nternal = result.internal_links.length;
    result.total_external = result.external_links.length;

    return result;
}

function groupMetaElements(meta_elements) {
    const groupedMetas = {
        facebook: {},
        twitter: {},
        dublinCore: {},
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
                groupedMetas.facebook[name] = content;
            } else if (name.startsWith('twitter:')) {
                // Group Twitter meta tags
                groupedMetas.twitter[name] = content;
            } else if (name.startsWith('dc.')) {
                // Group Dublin Core meta tags
                groupedMetas.dublinCore[name] = content;
            } else if (['description', 'keywords', 'publisher', 'author', 'copyright', 'robots', 'viewport'].includes(name)) {
                // General meta tags
                groupedMetas.general[name] = content;
            } else {
                // Other general meta tags
                groupedMetas.other[name] = content;
            }
        }
    }

    return groupedMetas;
}

function getSEOStatistics() {
    const text = document.body.innerText;
    const words = text.trim().split(/\s+/);
    const wordCount = words.length;
    const characterCount = text.replace(/\s+/g, '').length; // Remove spaces for character count
    const sentenceCount = text.split(/[.!?]/).filter(Boolean).length; // Rough sentence count

    // Calculate average sentence length
    const avgSentenceLength = sentenceCount ? (wordCount / sentenceCount).toFixed(2) : 0;

    // Calculate average word length
    const avgWordLength = (characterCount / wordCount).toFixed(2);

    return {
        wordCount,
        characterCount,
        sentenceCount,
        avgWordLength,
        avgSentenceLength
    };
}

function extractHeadings() {
    const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')];
    const root = document.createElement('ul');
    const stack = [{ level: 0, list: root }];
    const headingStats = {
        h1: 0,
        h2: 0,
        h3: 0,
        h4: 0,
        h5: 0,
        h6: 0,
    };
    const nestingErrors = [];

    headings.forEach((heading, index) => {
        const level = parseInt(heading.tagName[1], 10);
        const listItem = document.createElement('li');
        listItem.textContent = `${heading.tagName} ${heading.textContent.trim()}`;

        // Update heading count for statistics
        headingStats[`h${level}`]++;

        // Check for incorrect nesting (flagging when level skips more than one)
        if (stack.length > 1) {
            const lastValidLevel = stack[stack.length - 1].level;

            // Adjust the incorrect nesting check to flag any level skips
            if (level > lastValidLevel + 1) {
                nestingErrors.push({
                    error: `Incorrect nesting: ${heading.tagName} follows h${lastValidLevel}`,
                    headingText: heading.textContent.trim(),
                    previousLevel: `h${lastValidLevel}`,
                    currentLevel: `h${level}`,
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
        headingStats,
        nestingErrors,
    };
}

function extractMetadata() {
    const meta_elements = [...document.querySelectorAll('meta')];

    const description = findAny(meta_elements, ['description', 'dc.description', 'og:description', 'twitter:description']) ?? document.body.innerText.substring(0, 155);

    const icon_links = [...document.querySelectorAll('link[rel*="icon"], link[rel*="shortcut"]')];

    return {
        'icon_links': icon_links.map(link => link.href),
        'url': window.location.href,
        'title': document.title,
        'language': document.documentElement.lang,
        'rich_snippets': parseRichSnippets(),
        'metas': groupMetaElements(meta_elements),
        'links': getLinkStatistics(),
        'images': getImageStatistics(),
        'stats': getSEOStatistics(),
        'headings': extractHeadings(),
        'preview': {
            'title': document.title,
            'breadcrumb': fancyFormatUrl(window.location.href),
            'description': description
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

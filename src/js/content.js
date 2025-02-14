function fancyFormatUrl(url) {
    const parsedUrl = new URL(url);
    const baseUrl = parsedUrl.origin;
    const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
    const pathStr = pathSegments.join(' › ');

    return pathStr ? `${baseUrl} › ${pathStr}` : baseUrl;
}

function getDescription() {
    const paragraphs = document.querySelectorAll('p');

    let textContent = '';

    for (const paragraph of paragraphs) {
        textContent += paragraph.textContent.trim() + ' ';

        if (textContent.length > 155) {
            break;
        }
    }

    return textContent.trim();
}

function findMetaValue(metas, elements) {
    return metas.find(meta => {
        const name = meta.getAttribute('name')?.toLowerCase() || meta.getAttribute('property')?.toLowerCase();
        const content = meta.getAttribute('content');

        return content && elements.includes(name);
    })?.content;
}

function extractMetadata() {
    const metas = [...document.querySelectorAll('meta')];

    const description = findMetaValue(metas, ['description', 'dc.description', 'og:description', 'twitter:description']);

    const icon_links = [...document.querySelectorAll('link[rel*="icon"], link[rel*="shortcut"]')];

    return {
        icon_links: icon_links.map(link => link.href),
        preview: {
            title: document.title,
            breadcrumb: fancyFormatUrl(window.location.href),
            description: description ?? getDescription()
        }
    };
}

function extractHeadings() {
    const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')];
    const root = document.createElement('ul');
    const stack = [{ level: 0, list: root }];

    headings.forEach((heading, index) => {
        const level = parseInt(heading.tagName[1], 10);
        const listItem = document.createElement('li');

        listItem.textContent = `${heading.tagName} ${heading.textContent.trim()}`;

        while (stack.length > 1 && stack[stack.length - 1].level >= level) {
            stack.pop();
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

    return root.outerHTML;
}

// Listen for messages from the extension
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case 'getPageData':
            sendResponse(extractMetadata());
            break;
        case 'getPageHeadings':
            sendResponse(extractHeadings());
            break;
        case 'getPageURL':
            sendResponse(window.location.href);
            break;
    }

    return true; // Keep the message channel open for async responses
});

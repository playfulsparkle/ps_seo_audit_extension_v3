function fancyFormatUrl(url) {
    const parsedUrl = new URL(url);
    const baseUrl = parsedUrl.origin;
    const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
    const pathStr = pathSegments.join(' > ');

    return pathStr ? `${baseUrl} > ${pathStr}` : baseUrl;
}

function getDescription() {
    // Try to get the meta description
    let description = document.querySelector('meta[name="description"]')?.content;

    // If there's no meta description, fallback to concatenating text from <p> tags
    if (!description) {
        const paragraphs = document.querySelectorAll('p');
        let textContent = '';
        
        // Loop through paragraphs and append their text until the description is 155 characters or less
        for (const paragraph of paragraphs) {
            textContent += paragraph.textContent.trim() + ' ';

            if (textContent.length > 155) {
                break;
            }
        }

        description = textContent.trim();
    }

    return description;
}

function truncate(str, max_length = 32) {
    return str.length > 155 ? str.substring(0, max_length) + '...' : str;
}

function extractMetadata() {
    const icon_links = [...document.querySelectorAll('link[rel*="icon"], link[rel*="shortcut"]')];

    return {
        icon_links: icon_links.map(link => link.href),
        title: document.title,
        url: window.location.href,
        url_fancy: fancyFormatUrl(window.location.href),
        description: getDescription()
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

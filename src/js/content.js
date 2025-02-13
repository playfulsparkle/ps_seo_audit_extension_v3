function extractMetadata() {
    const metadata = {
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.content || '',
        url: window.location.href,
        canonical: document.querySelector('link[rel="canonical"]')?.href || '',
        robots: document.querySelector('meta[name="robots"]')?.content || '',
        xRobots: document.querySelector('meta[name="x-robots"]')?.content || '',
        keywords: document.querySelector('meta[name="keywords"]')?.content || '',
        publisher: document.querySelector('meta[name="publisher"]')?.content || '',
        language: document.documentElement.lang || ''
    };

    const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')];
    const images = [...document.querySelectorAll('img')];
    const links = [...document.querySelectorAll('a')];

    return {
        metadata,
        wordCount: document.body.innerText.split(/\s+/).length,
        headings_total: headings.length,
        images_total: images.length,
        links_total: links.length,
        internalLinks: links.filter(link => link.hostname === window.location.hostname).length,
        externalLinks: links.filter(link => link.hostname !== window.location.hostname).length,
        imagesWithAlt: images.filter(img => img.hasAttribute('alt')).length,
        imagesWithoutAlt: images.filter(img => !img.hasAttribute('alt')).length
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
    }

    return true; // Keep the message channel open for async responses
});

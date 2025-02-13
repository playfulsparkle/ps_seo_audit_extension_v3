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
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const root = document.createElement('ul'); // Root of the tree structure
    let currentList = root; // This will track the current <ul> for nesting

    headings.forEach(heading => {
        const level = parseInt(heading.tagName[1], 10); // Get the level from h1, h2, etc.
        const listItem = document.createElement('li');

        listItem.textContent = heading.tagName + ' ' + heading.textContent; // Add the heading text

        if (level > currentList.level) {
            const newList = document.createElement('ul');

            currentList.appendChild(newList);

            currentList = newList; // Move to the new nested list
        } else if (level < currentList.level) {
            for (let i = currentList.level - level; i > 0; i--) {
                currentList = currentList.parentElement;
            }
        }

        currentList.appendChild(listItem);

        currentList.level = level;
    });

    // Return as an HTML string to be sent as a message
    return root.outerHTML;
}

// Listen for messages from the extension
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getPageData') {
        sendResponse(extractMetadata());
    }

    if (message.action === 'getPageHeadings') {
        sendResponse(extractHeadings());
    }

    return true; // Keep the message channel open for async responses
});

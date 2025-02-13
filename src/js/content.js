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
    const root = document.createElement('ul');
    const stack = [{ level: 0, list: root }]; // Stack to track hierarchy

    headings.forEach(heading => {
        const level = parseInt(heading.tagName[1], 10); // Extract heading level
        const listItem = document.createElement('li');
        listItem.textContent = `${heading.tagName} ${heading.textContent}`;

        // Find the appropriate parent list for the current heading
        while (stack.length > 1 && stack[stack.length - 1].level >= level) {
            stack.pop(); // Move up the hierarchy until the correct level is found
        }

        // Append the new list item to the current parent list
        const parentList = stack[stack.length - 1].list;
        
        parentList.appendChild(listItem);

        // Create a new nested list for the current heading level
        const newList = document.createElement('ul');

        listItem.appendChild(newList);

        // Push the new list to the stack with its level
        stack.push({ level, list: newList });
    });

    return root.outerHTML; // Return the tree as an HTML string
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

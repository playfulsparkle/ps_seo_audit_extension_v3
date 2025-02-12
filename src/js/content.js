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
        headings: headings.length,
        images: images.length,
        links: links.length,
        internalLinks: links.filter(link => link.hostname === window.location.hostname).length,
        externalLinks: links.filter(link => link.hostname !== window.location.hostname).length,
        imagesWithAlt: images.filter(img => img.hasAttribute('alt')).length,
        imagesWithoutAlt: images.filter(img => !img.hasAttribute('alt')).length
    };
}

// Listen for messages from the extension
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getPageData') {
        sendResponse(extractMetadata());
    }

    return true; // Keep the message channel open for async responses
});

# Playful Sparkle SEO Audit

A lightweight browser extension that performs comprehensive on-page SEO audits directly inside your browser.

## What It Does

Playful Sparkle SEO Audit analyses HTML, metadata, headings, images, links, structured data, HTTP headers, and content quality without requiring external services. It provides instant diagnostics, highlights SEO issues, and helps developers, marketers, content creators, and SEO professionals improve technical SEO, accessibility, and search visibility.

Everything runs locally inside your browser.

- No account required
- No external API calls
- No data sent anywhere

## Key Features

### Overview

Get an instant summary of any webpage, including:

- Live Google search result preview
- Robots meta directives
- Canonical URL
- Page language detection
- Word count
- Character count
- Sentence count
- Average word length
- Average sentence length
- SEO issue summary
- Severity classification
- XML sitemap discovery from robots.txt

Findings are automatically classified as:

- Critical
- High
- Medium
- Information

### Headings Analysis

Inspect your document structure to improve accessibility and SEO.

Features include:

- H1-H6 heading detection
- Heading hierarchy analysis
- Missing H1 detection
- Incorrect heading nesting detection
- Empty heading detection
- Locate headings directly inside the DOM

### Image Analysis

Audit every image on the page.

Features include:

- Total image count
- Image preview
- Alt text inspection
- Images missing alt text
- Image URL inspection
- Legacy image format detection
- Modern image format detection (WebP, AVIF)
- Locate images directly inside the DOM

Visual highlighting:

- Images missing alt text

### Link Analysis

Analyse every link found on the page.

Features include:

- Internal links
- External links
- External resource links
- Anchor text inspection
- Duplicate link detection
- Nofollow detection
- robots.txt verification
- Locate links directly inside the DOM

Resource link inspection includes:

- Canonical links
- Alternate links
- hreflang language resources
- Navigation links
- Stylesheets
- Icons
- Performance resources

Visual highlighting:

- External links
- Duplicate links
- Nofollow links

### Rich Snippets

Automatically detect structured data and Schema.org entities.

Supports more than 70 Schema.org entity types including:

- Organization
- LocalBusiness
- ProfessionalService
- Person
- Place
- PostalAddress
- ContactPoint
- Article
- BlogPosting
- Product
- Service
- SoftwareApplication
- FAQPage
- BreadcrumbList
- Event
- Review
- Course
- Recipe
- VideoObject
- ImageObject
- Offer

...and many more.

Built-in validation shortcuts:

- Google Rich Results Test
- Schema Markup Validator

### Meta Analysis

Inspect metadata used by search engines and social platforms.

Includes:

#### General Meta

- Title
- Description
- Robots
- Canonical
- Language
- Charset
- Viewport

#### Open Graph

- og:title
- og:description
- og:image
- og:url
- og:type
- og:locale

#### X (Twitter)

- Twitter Cards
- Title
- Description
- Image

#### Dublin Core

- Dublin Core metadata inspection

### Technical SEO Checks

Automatically validates important SEO elements including:

- Page title length
- Meta description length
- Canonical tag
- Robots directives
- robots.txt
- XML sitemap discovery
- Language declaration
- Heading hierarchy
- Image accessibility
- Structured data validation

HTTP response header analysis includes:

- Content-Security-Policy (CSP)
- Strict-Transport-Security (HSTS)
- X-Frame-Options
- X-Content-Type-Options
- X-XSS-Protection
- Referrer-Policy
- X-Robots-Tag
- Alt-Svc (HTTP/3)

### SEO Validation Tools

Open the current page directly in:

- Google Rich Results Test
- Schema Markup Validator
- Facebook Sharing Debugger
- LinkedIn Post Inspector
- Google PageSpeed Insights
- W3C HTML Validator

### Visual DOM Highlighting

Quickly locate SEO issues directly on the webpage.

Supports highlighting:

- Images missing alt text
- External links
- Duplicate links
- Nofollow links

Every highlighted element can also be located directly from the extension panel.

### Extension Settings

Configure the audit to suit your workflow.

Available settings include:

- Enable or disable the Google search preview
- Enable or disable robots.txt fetching and parsing
- Select the User-Agent used when analysing robots.txt
- Use the wildcard (*) User-Agent
- Display overview information according to your preferences

### robots.txt Analysis

The extension can:

- Download and parse robots.txt
- Discover XML sitemaps
- Check whether internal links are blocked
- Analyse directives for different User-Agents
- Report blocked pages

### Error Reporting

If a page cannot be analysed correctly, the extension includes a built-in error reporting feature that lets you submit diagnostic information for troubleshooting.

## Who It's For

- SEO specialists
- Technical SEO consultants
- Web developers
- Digital marketers
- Content writers
- Accessibility auditors
- Website owners

## Installation

### Firefox

1. Install the extension from Firefox Add-ons.
2. Pin the extension to the toolbar.
3. Open any webpage.
4. Click the Playful Sparkle SEO Audit icon.

### Chromium Browsers

Available for:

- Google Chrome
- Microsoft Edge

Install from:

- [Google Chrome Web Store](https://chromewebstore.google.com/detail/playful-sparkle-seo-audit/kdifpbaioekdlolfnephejnedangojla)
- [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/playful-sparkle-seo-audit/mgimoalhbmdmbamppmjmlnhgdaoaehfe)

### Mozilla Firefox

Available from:

- [Mozilla Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/playful-sparkle-seo-audit/)

## System Requirements

- **Mozilla Firefox:** Version 109 or newer
- **Google Chrome:** Version 88 or newer
- **Microsoft Edge:** Version 88 or newer

## How It Works

The extension analyses the currently open webpage in real time by reading the Document Object Model (DOM), extracting metadata, parsing structured data, analysing images and links, inspecting HTTP response headers, downloading and evaluating robots.txt, and validating the page against SEO best practices.

All analysis is performed locally inside your browser.

- No account required
- No tracking
- No telemetry
- No external API calls
- No data leaves your device

## Why Playful Sparkle SEO Audit?

Unlike many browser extensions that only inspect page metadata, Playful Sparkle SEO Audit performs a comprehensive on-page audit covering:

- Content quality
- Google search preview
- Metadata
- Heading hierarchy
- Images
- Internal links
- External links
- Resource links
- Structured data
- Rich snippets
- HTTP security headers
- robots.txt
- XML sitemaps
- Accessibility
- Readability metrics

Every audit is performed locally, providing immediate feedback without sending your webpage to third-party services.

## Accessibility

The extension helps identify accessibility issues including:

- Missing image alt text
- Empty headings
- Incorrect heading hierarchy
- Missing language declarations

## Privacy

Playful Sparkle SEO Audit respects your privacy.

- No analytics
- No tracking
- No advertising
- No data collection
- No data storage
- No data transmission

Every audit runs entirely on your local device.

## Contributing

Contributions are welcome.

Please open an issue or submit a pull request on GitHub.

## License

MIT License.

## Credits

Developed by **Playful Sparkle**.

Available for:

- Mozilla Firefox
- Google Chrome
- Microsoft Edge

## Support

If you have questions, feature requests, or bug reports:

- GitHub Issues
- Email: <hello@playfulsparkle.com>
- https://support.playfulsparkle.com/

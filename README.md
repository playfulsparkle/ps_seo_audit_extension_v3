# Playful Sparkle SEO Audit

A lightweight browser extension that performs comprehensive on-page SEO audits directly inside your browser.

## What It Does

[Playful Sparkle SEO Audit](https://playfulsparkle.com/en-gb/playful-sparkle-seo-audit/) analyses HTML, metadata, headings, images, links, structured data, HTTP headers, content, and focus keywords without requiring external SEO services. It provides instant diagnostics, highlights SEO issues, and helps developers, marketers, content creators, and SEO professionals improve technical SEO, content optimisation, accessibility, and search visibility.

Everything runs locally inside your browser.

- No account required
- No external SEO API calls
- No automatic data transmission
- No tracking or telemetry

## Key Features

### Overview

Get an instant summary of any webpage, including:

- Live Google search result preview
- Page title
- Meta description
- Robots meta directives
- Canonical URL
- Page language detection
- Word count
- Character count
- Sentence count
- Average word length
- Average sentence length
- URL analysis
- SEO issue summary
- Technical SEO findings
- Content optimisation findings
- Severity classification
- XML sitemap discovery from robots.txt

Findings are automatically classified as:

- Critical
- High
- Warning
- Information

### SEO Preview

Preview how the current page may appear in Google Search using:

- Page title
- Favicon
- URL breadcrumb
- Meta description

The preview provides a visual reference for evaluating search-result presentation. It is an approximation and does not represent a guaranteed Google Search result.

### Content & Keyword Analysis

Analyse page content using optional focus keywords.

You can configure:

- Primary focus keyword
- Secondary focus keyword

The extension evaluates each configured keyword against:

- SEO title
- Title position
- Meta description
- URL
- Beginning of the main page content
- H2 and H3 headings
- Keyword density
- Image alt text

Keyword placement checks include whether the keyword:

- Appears in the SEO title
- Appears within the first half of the SEO title
- Appears in the meta description
- Appears in the URL
- Appears within the first 10% of the main content
- Appears in an H2 or H3 heading

Keyword density is also analysed to identify:

- Low keyword usage
- Elevated keyword usage
- Potential keyword stuffing

Focus keyword analysis is optional. A technical SEO audit is performed even when no focus keyword is configured.

Keyword recommendations are treated as optimisation heuristics, not mandatory Google Search requirements.

### Headings Analysis

Inspect your document structure to improve accessibility and content organisation.

Features include:

- H1-H6 heading detection
- Heading statistics
- Heading hierarchy analysis
- Heading tree visualisation
- Missing H1 detection
- Incorrect heading nesting detection
- Empty heading detection
- Heading order analysis
- Locate headings directly inside the DOM
- Copy heading structure

### Image Analysis

Audit every image on the page.

Features include:

- Total image count
- Image preview
- Alt text inspection
- Images missing the alt attribute
- Images with intentionally empty alt text
- Image URL inspection
- Legacy image format detection
- Modern image format detection
- Locate images directly inside the DOM
- Copy image data

The extension distinguishes between:

- Missing alt text, where the `alt` attribute is absent
- Empty alt text, where `alt=""` is intentionally used for decorative images

Supported modern image formats include formats such as:

- WebP
- AVIF
- JPEG 2000
- JPEG XR
- SVG
- HEIF
- HEIC

Common legacy formats include:

- PNG
- JPEG
- JPG
- GIF

The extension reports modern, legacy, or mixed image formats as informational optimisation findings.

Visual highlighting:

- Images with missing alt text

### Link Analysis

Analyse every hyperlink found on the page.

Features include:

- Internal links
- External links
- Anchor text inspection
- Link URL inspection
- `rel` attribute inspection
- Nofollow detection
- Sponsored link detection
- User-generated content link detection
- Duplicate link detection
- robots.txt verification
- Locate links directly inside the DOM

Internal links can be checked against the selected robots.txt User-Agent to identify links blocked by crawling directives.

Visual highlighting:

- External links
- Duplicate links
- Nofollow links

### Resource Link Analysis

Inspect important `<link>` resources found in the document.

Resource categories include:

- Canonical links
- Alternate resource links
- hreflang language resources
- Navigation links
- Performance resources
- Preload resources
- Stylesheets
- Icons

The extension also validates relevant resource attributes and reports invalid values where applicable.

### Structured Data

Automatically detect and analyse JSON-LD structured data found on the page.

The extension can parse:

- JSON-LD objects
- JSON-LD arrays
- `@graph` structures
- Multiple structured-data entities
- Schema.org entity types

Detected entities are displayed with their structured-data keys and values.

Supported Schema.org types include many common entities such as:

- WebPage
- WebSite
- Organization
- LocalBusiness
- ProfessionalService
- Person
- Article
- BlogPosting
- Product
- Service
- SoftwareApplication
- MobileApplication
- VideoObject
- ImageObject
- Recipe
- Event
- BreadcrumbList
- FAQPage
- Review
- AggregateRating
- Offer
- AggregateOffer
- Course
- Book
- Movie
- Dataset
- JobPosting
- LearningResource
- SearchAction
- ContactPoint
- PostalAddress
- Place
- Restaurant
- Store
- Accommodation
- TouristAttraction
- TravelAgency
- MedicalBusiness
- LegalService
- FinancialService
- EducationalOrganization
- GovernmentOrganization
- Museum
- ArtGallery
- Library

...and many more.

Built-in validation shortcuts:

- Google Rich Results Test
- Schema Markup Validator

The extension reports structured data as an eligibility and understanding signal. Structured data does not guarantee rich results and is not required for basic indexing or ranking.

### Meta Analysis

Inspect metadata used by search engines, social platforms, and other consumers.

The extension groups metadata into:

#### General Meta

- Title
- Description
- Robots directives
- Googlebot directives
- Viewport
- Charset
- Language
- Canonical
- Other general metadata

#### Open Graph

- `og:title`
- `og:description`
- `og:image`
- `og:url`
- `og:type`
- `og:locale`
- Other Open Graph properties

#### Facebook Meta

- Facebook-specific metadata

#### X (Twitter) Meta

- Twitter Cards
- Twitter title
- Twitter description
- Twitter image
- Other X (Twitter) metadata

#### Dublin Core

- Dublin Core metadata

The extension also detects duplicate instances of important metadata, including:

- Meta descriptions
- Robots directives
- Viewport
- Open Graph title
- Open Graph description
- Open Graph URL
- Open Graph image
- Twitter title
- Twitter description
- Twitter image

Duplicate metadata can create conflicting or ambiguous signals and is reported for review.

### Technical SEO Checks

Automatically validate important technical SEO elements including:

- Missing or empty page title
- Page title length
- Rendered page title width
- Missing or empty meta description
- Meta description length
- Rendered meta description width
- Duplicate important meta tags
- URL length
- Robots directives
- Canonical tags
- Language declaration
- Heading hierarchy
- Empty headings
- robots.txt
- XML sitemap discovery
- Internal links blocked by robots.txt
- Structured data
- Image accessibility
- Image formats

Title and description length and pixel-width checks use configurable internal heuristics. They are intended as optimisation guidance rather than fixed Google Search limits.

### Canonical URL Analysis

The extension performs detailed canonical analysis.

Checks include:

- Missing canonical tag
- Multiple canonical tags
- Empty canonical URL
- Malformed canonical URL
- Canonical URLs containing fragments
- Canonical URLs pointing to another host
- Canonical URLs pointing to a different page URL

Canonical recommendations are reported according to their severity and context.

### robots.txt Analysis

The extension can download and parse the site's robots.txt file.

Features include:

- robots.txt detection
- robots.txt parsing
- XML sitemap discovery
- Sitemap URL display
- Internal link crawling-rule checks
- User-Agent-specific rule analysis
- Blocked URL detection

You can disable robots.txt fetching from the extension settings.

When robots.txt fetching is disabled, the extension skips sitemap discovery and does not check internal links against robots.txt rules.

### User-Agent Analysis

Select which crawler User-Agent should be used when evaluating robots.txt rules.

Available profiles include:

- Any User-Agent (`*`)
- Google Search
- Google Image Search
- Google Video Search
- Google News
- Google Mobile Search
- Google Ads
- Microsoft Bing
- Yahoo! Search
- Baidu Search
- Yandex Search
- Sogou Search
- Facebook
- DuckDuckGo
- Apple
- Semrush
- Common Crawl
- OpenAI
- OpenAI ChatGPT
- Anthropic
- Anthropic Claude
- Perplexity AI
- Screaming Frog
- Moz
- Majestic
- Searchmetrics
- Serpstat
- And other supported crawler profiles

This allows robots.txt rules to be evaluated from the perspective of different crawlers.

### HTTP Response Header Analysis

Inspect HTTP response headers relevant to security, privacy, crawling, and modern web delivery.

The extension analyses headers including:

- Content-Security-Policy (CSP)
- Strict-Transport-Security (HSTS)
- X-Frame-Options
- X-Content-Type-Options
- X-XSS-Protection
- Referrer-Policy
- X-Robots-Tag
- X-UA-Compatible
- Alt-Svc

The extension distinguishes between security recommendations, informational headers, and deprecated headers.

For example:

- CSP helps mitigate the impact of XSS and content-injection attacks.
- HSTS enforces HTTPS for future browser requests.
- X-Frame-Options can help mitigate clickjacking.
- X-Content-Type-Options can prevent MIME sniffing.
- Referrer-Policy controls referrer information sent with requests.
- X-Robots-Tag provides crawler directives through HTTP response headers.
- Alt-Svc can advertise alternative services such as HTTP/3.
- X-XSS-Protection and X-UA-Compatible are recognised as obsolete or deprecated and are reported informationally.

HTTP response headers may require the page to be reloaded before they are available to the extension.

### SEO Validation Tools

Open the current page directly in:

- Google Rich Results Test
- Schema Markup Validator
- Facebook Sharing Debugger
- LinkedIn Post Inspector
- Google PageSpeed Insights
- W3C HTML Validator

These tools open in a new browser window or tab.

### Visual DOM Highlighting

Quickly locate SEO issues directly on the webpage.

Supports highlighting:

- Images with missing alt text
- External links
- Duplicate links
- Nofollow links

Each highlighted element can also be located directly from the extension panel.

The extension reports when an element cannot be highlighted because it is outside the current viewport.

### Copy Audit Data

Copy supported audit data directly from the extension.

Available copy formats:

- Plain Text
- Markdown

Copy functionality is available for supported tables and structured views, including heading structures and image data.

A confirmation notification is displayed after successful copying.

### Extension Settings

Configure the audit to suit your workflow.

Available settings include:

- Show or hide the SEO preview
- Enable or disable robots.txt fetching and parsing
- Select the robots.txt User-Agent
- Choose Any User-Agent (`*`)
- Select a predefined crawler profile
- Choose the default copy format
- Configure a primary focus keyword
- Configure a secondary focus keyword

Settings are stored locally in the browser.

### Error Reporting

If the extension cannot load page information correctly, it displays an error state with an option to send an error report.

The extension also provides error feedback when:

- Copying fails
- A DOM element cannot be highlighted
- Page information cannot be loaded

## Who It's For

- SEO specialists
- Technical SEO consultants
- Web developers
- Digital marketers
- Content writers
- Content strategists
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

The extension analyses the currently open webpage in real time by:

1. Reading the Document Object Model (DOM)
2. Extracting page metadata
3. Analysing headings and document structure
4. Analysing images and alt text
5. Analysing internal and external links
6. Inspecting resource links
7. Parsing JSON-LD structured data
8. Analysing page content
9. Analysing optional focus keywords
10. Measuring rendered title and description widths
11. Inspecting HTTP response headers
12. Downloading and parsing robots.txt when enabled
13. Checking internal links against robots.txt rules
14. Discovering XML sitemaps
15. Validating the page against SEO, accessibility, security, and content optimisation heuristics

All analysis is performed locally inside your browser.

- No account required
- No tracking
- No telemetry
- No external SEO API calls
- No automatic transmission of webpage audit data

## Why Playful Sparkle SEO Audit?

Unlike browser extensions that focus only on page metadata, Playful Sparkle SEO Audit provides a broader on-page analysis covering:

- Technical SEO
- Content optimisation
- Focus keyword analysis
- Search-result preview
- Metadata
- Heading hierarchy
- Images
- Image accessibility
- Internal links
- External links
- Resource links
- Structured data
- Schema.org entities
- Rich-result eligibility signals
- Canonical URLs
- robots.txt
- XML sitemaps
- HTTP response headers
- Security headers
- Accessibility
- Content metrics
- URL analysis

The extension combines these checks into a single browser-based audit so you can inspect a webpage without switching between multiple SEO tools.

## Accessibility

The extension helps identify accessibility-related issues including:

- Missing image alt attributes
- Empty headings
- Incorrect heading hierarchy
- Heading order issues
- Missing document language declarations

The extension distinguishes missing alt attributes from intentionally empty alt text used for decorative images.

## Privacy

Playful Sparkle SEO Audit is designed to perform page analysis locally in your browser.

During normal auditing:

- No account is required
- No analytics are used
- No tracking is used
- No telemetry is used
- No webpage audit data is sent to an external SEO service
- Settings are stored locally in the browser

Robots.txt and favicon resources may be fetched when the corresponding functionality is enabled.

Error reporting is available as an explicit user-initiated action when troubleshooting is required.

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
- Email: [hello@playfulsparkle.com](mailto:hello@playfulsparkle.com)
- [https://support.playfulsparkle.com/](https://support.playfulsparkle.com/)

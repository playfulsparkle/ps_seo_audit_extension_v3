String.prototype.i18n = function (substitutions = null) {
    const translation = browser.i18n.getMessage(this.toString(), substitutions);
    return translation || null;
};

async function saveSetting(offset, value) {
    try {
        await chrome.storage.local.set({ [offset]: value });
    } catch (error) {
        console.error(`saveSetting: Can't save ${offset} value ${error.message}`);
    }
}

async function getSetting(offset, default_value = null) {
    try {
        const result = await chrome.storage.local.get(offset);

        return result[offset] ?? default_value;
    } catch (error) {
        console.error(`getSetting: Can't get ${offset} value ${error.message}`);

        return default_value;
    }
}

function ml(tagName, props, ...children) {
    var el = document.createElement(tagName);

    // Set properties and event listeners
    if (props) {
        for (var name in props) {
            if (name.indexOf("on") === 0) {
                el.addEventListener(name.slice(2).toLowerCase(), props[name], false);
            } else if (name === "className" && Array.isArray(props[name])) {
                el.classList.add(...props[name]);
            } else {
                el.setAttribute(name, props[name]);
            }
        }
    }

    // Append children
    for (const child of children) {
        appendChildren(el, child);
    }

    return el;
}

function appendChildren(el, child) {
    if (typeof child === "string") {
        el.appendChild(DOMPurify.sanitize(child, {
            ALLOWED_ATTR: ["class", "href", "target"],
            ALLOWED_TAGS: ["ul", "li", "a"],
            RETURN_DOM_FRAGMENT: true
        }));
    } else if (child instanceof Array) {
        for (var nestedChild of child) {
            appendChildren(el, nestedChild);
        }
    } else if (child instanceof Node) {
        el.appendChild(child);
    }
}

const crawler_list = [
    "Googlebot",
    "Googlebot-Image",
    "Googlebot-Video",
    "Googlebot-News",
    "Googlebot-Mobile",
    "Googlebot-Adsbot",
    "Bingbot",
    "Slurp",
    "Baiduspider",
    "Yandex Bot",
    "Sogou Spider",
    "Exabot",
    "Facebook External Hit",
    "DuckDuckBot",
    "Applebot",
    "SemrushBot",
    "Anthropic-ai",
    "Applebot-Extended",
    "AwarioRssBot",
    "AwarioSmartBot",
    "BLEXBot",
    "CCBot",
    "ChatGPT-User",
    "ClaudeBot",
    "Claude-Web",
    "Cohere-ai",
    "GPTBot",
    "ImagesiftBot",
    "MJ12bot",
    "Omgili",
    "Omgilibot",
    "PerplexityBot",
    "RavenCrawler",
    "rogerbot",
    "Screaming Frog SEO Spider",
    "SearchmetricsBot",
    "serpstatbot",
    "Alexa Crawler",
];


const content = document.querySelector("#content");

let user_agent_options = [];

user_agent_options.push(ml("option", { "value": "*" }, "usage_agent_wildcard".i18n()));

for (const crawler of crawler_list) {
    user_agent_options.push(ml("option", null, crawler));
}

const form = ml("form", null,
    ml("fieldset", null,
        ml("legend", null, "heading_overview_settings".i18n()),
        ml("p", null,
            ml("input", { "type": "checkbox", "id": "show-seo-preview" }),
            ml("label", { "for": "show-seo-preview" }, "checkbox_show_seo_preview".i18n()),
        ),
        ml("p", null,
            ml("input", { "type": "checkbox", "id": "fetch-robots-txt" }),
            ml("label", { "for": "fetch-robots-txt" }, "checkbox_fetch_robotstxt".i18n()),
            ml("span", { "class": "help-text" }, "help_checkbox_fetch_robotstxt".i18n())
        ),
        ml("p", null,
            ml("label", { "for": "user-agent-list" }, "select_user_agent_list".i18n()),
            ml("select", { "id": "user-agent-list" }, ...user_agent_options),
        ),
    )
);

content.appendChild(form);

document.addEventListener("DOMContentLoaded", async () => {
    const showSeoPreview = document.querySelector("#show-seo-preview");
    const fetchRobotsTxt = document.querySelector("#fetch-robots-txt");
    const userAgentList = document.querySelector("#user-agent-list");

    // Fetch settings in parallel
    const [showSeoPreviewSetting, fetchRobotsTxtSetting, userAgentSetting] = await Promise.all([
        getSetting("show-seo-preview", true),
        getSetting("fetch-robots-txt", true),
        getSetting("user-agent", "*")
    ]);

    // Apply settings
    showSeoPreview.checked = showSeoPreviewSetting;
    fetchRobotsTxt.checked = fetchRobotsTxtSetting;
    userAgentList.value = userAgentSetting;

    // Add event listeners for saving settings
    if (showSeoPreview) {
        showSeoPreview.addEventListener("change", async e => await saveSetting("show-seo-preview", e.target.checked));
    }

    if (fetchRobotsTxt) {
        fetchRobotsTxt.addEventListener("change", async e => await saveSetting("fetch-robots-txt", e.target.checked));
    }

    if (userAgentList) {
        userAgentList.addEventListener("change", async e => await saveSetting("user-agent", e.target.value));
    }
});

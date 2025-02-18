String.prototype.truncate = function (maxLength) {
  return this.length >= maxLength ? this.slice(0, maxLength) + "..." : this.toString();
};

String.prototype.i18n = function (substitutions = null) {
  const translation = browser.i18n.getMessage(this.toString(), substitutions);
  return translation || null;
};

Number.prototype.formatNumber = function (decimalPlaces = 0) {
  return new Intl.NumberFormat(navigator.language, {
    maximumFractionDigits: decimalPlaces,
    minimumFractionDigits: decimalPlaces
  }).format(this);
};

function isObjEmpty(obj) {
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) return false;
  }

  return true;
}

function isObjPropEmpty(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key) &&
    (typeof obj[key] === "string" || Array.isArray(obj[key])) && obj[key].length > 0;
}

async function getCurrentTab() {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true
  });

  return tab;
}

async function saveSetting(offset, value) {
  try {
    await chrome.storage.local.set({ [offset]: value });
  } catch (error) {
    console.error(`popup.js - saveSetting: Can't save ${offset} value ${error.message}`);
  }
}

async function getSetting(offset, default_value = null) {
  try {
    const result = await chrome.storage.local.get(offset);

    return result[offset] ?? default_value;
  } catch (error) {
    console.error(`popup.js - getSetting: Can't get ${offset} value ${error.message}`);

    return default_value;
  }
}

function ml(tagName, props, ...children) {
  const el = document.createElement(tagName);

  // Set properties and event listeners
  if (props) {
    for (const name in props) {
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
    el.appendChild(sanitizeHtml(child));
  } else if (child instanceof Array) {
    for (const nestedChild of child) {
      appendChildren(el, nestedChild);
    }
  } else if (child instanceof Node) {
    el.appendChild(child);
  }
}

function setButtonState(buttons, isEnabled) {
  if (typeof buttons !== "object") return;

  buttons.forEach(button => {
    button.disabled = !isEnabled;

    if (isEnabled) {
      button.classList.remove("disabled");
    } else {
      button.classList.add("disabled");
    }
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sanitizeHtml(html) {
  const parser = new DOMParser();
  const parsedHtml = parser.parseFromString(html, "text/html");

  if (!parsedHtml.body || !parsedHtml.body.childNodes.length) {
    return document.createTextNode(html);
  }

  const fragment = document.createDocumentFragment();

  for (const node of [...parsedHtml.body.childNodes]) {
    fragment.appendChild(node);
  }

  return fragment;
}

const icon_list = Object.create(null);

function makeIcon(filename, width, height) {
  const key = filename + width + height;

  if (!icon_list[key]) {
    icon_list[key] = ml("img", { "src": "/icons/" + filename, "width": width, "height": height });
  }

  return icon_list[key].cloneNode(false);
}

function makeTableRow(icon_filename, severity, desc) {
  return ml("tr", null,
    ml("th", { "class": "x-left" }, severity, makeIcon(icon_filename, 24, 24)),
    ml("td", null, desc),
  );
}

function makeDescriptionList(panel, heading, data) {
  let rows = [];

  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      rows.push(
        ml("dt", null, key),
        ml("dd", null, data[key]),
      );
    }
  }

  panel.appendChild(ml("h2", null, heading));
  panel.appendChild(ml("dl", null, ...rows));
}


const content = document.querySelector("#content");


//#region Popup UI
const tab_lists = ml("div", { "role": "tablist" },
  ml("button", { "id": "tab-overview", "type": "button", "disabled": "", "role": "tab", "aria-controls": "tabpanel-overview" },
    "tab_btn_label_overview".i18n(),
    makeIcon("overview.svg", 16, 16)
  ),
  ml("button", { "id": "tab-headings", "type": "button", "disabled": "", "role": "tab", "aria-controls": "tabpanel-headings" },
    "tab_btn_label_headings".i18n(),
    makeIcon("heading.svg", 16, 16)
  ),
  ml("button", { "id": "tab-images", "type": "button", "disabled": "", "role": "tab", "aria-controls": "tabpanel-images" },
    "tab_btn_label_images".i18n(),
    makeIcon("image.svg", 16, 16)
  ),
  ml("button", { "id": "tab-links", "type": "button", "disabled": "", "role": "tab", "aria-controls": "tabpanel-links" },
    "tab_btn_label_links".i18n(),
    makeIcon("link.svg", 16, 16)
  ),
  ml("button", { "id": "tab-rich-snippets", "type": "button", "disabled": "", "role": "tab", "aria-controls": "tabpanel-rich-snippets" },
    "tab_btn_label_rich_snippets".i18n(),
    makeIcon("rich-snippet.svg", 16, 16)
  ),
  ml("button", { "id": "tab-metas", "type": "button", "disabled": "", "role": "tab", "aria-controls": "tabpanel-metas" },
    "tab_btn_label_metas".i18n(),
    makeIcon("meta.svg", 16, 16)
  )
);

content.appendChild(tab_lists);

const overview_panel = ml("div", { "id": "tabpanel-overview", "role": "tabpanel", "tabindex": "0", "aria-labelledby": "tab-overview" });

content.appendChild(overview_panel);

const headings_panel = ml("div", { "id": "tabpanel-headings", "role": "tabpanel", "tabindex": "0", "aria-labelledby": "tab-headings" });

content.appendChild(headings_panel);

const images_panel = ml("div", { "id": "tabpanel-images", "role": "tabpanel", "tabindex": "0", "aria-labelledby": "tab-images" });

content.appendChild(images_panel);

const links_panel = ml("div", { "id": "tabpanel-links", "role": "tabpanel", "tabindex": "0", "aria-labelledby": "tab-links" });

content.appendChild(links_panel);

const rich_snippets_panel = ml("div", { "id": "tabpanel-rich-snippets", "role": "tabpanel", "tabindex": "0", "aria-labelledby": "tab-rich-snippets" });

content.appendChild(rich_snippets_panel);

const metas_panel = ml("div", { "id": "tabpanel-metas", "role": "tabpanel", "tabindex": "0", "aria-labelledby": "tab-metas" });

content.appendChild(metas_panel);

const footer = ml("footer", null,
  ml("img", { "src": "/icons/playful-sparkle-logo.png" })
);

content.appendChild(footer);

new TabsAutomatic(content.querySelector("[role=tablist]")); // Enable tab panels
//#endregion


//#region Loaded state change
browser.runtime.onMessage.addListener(async message => {
  if (message.tabId && message.status) {
    const tab = await getCurrentTab();

    if (message.tabId === tab.id && message.status === "complete") {
      await showPopupContent(tab)
    }
  }
});


document.addEventListener("DOMContentLoaded", async () => {
  try {
    const tab = await getCurrentTab();

    const load_status = await browser.runtime.sendMessage({ type: "getLoadStatus", tabId: tab.id }) || "complete";

    if (load_status === "complete") {
      await showPopupContent(tab);
    }
  } catch (error) {
    console.error(`popup.js - DOMContentLoaded error: ${error.message}`);
  }
});
//#endregion


async function showPopupContent(tab) {
  //#endregion Clean up UI
  overview_panel.innerText = "";
  headings_panel.innerText = "";
  images_panel.innerText = "";
  links_panel.innerText = "";
  rich_snippets_panel.innerText = "";
  metas_panel.innerText = "";
  //#endregion


  //#region Fetch page HTTP headers
  let page_headers = Object.create(null);

  try {
    page_headers = await browser.runtime.sendMessage({ type: "getHeaders", tabId: tab.id });
  } catch (error) {
    console.error(`popup.js - getHeaders error (Attempt ${page_headers_counter + 1}): ${error.message}`);
  }
  //#endregion


  //#region Fetch page data
  let page_data = Object.create(null);
  let is_error = false;

  try {
    page_data = await browser.tabs.sendMessage(tab.id, { "action": "getPageData" });
  } catch (error) {
    is_error = true;

    console.error(`popup.js - getPageData: ${error.message}`);
  }
  //#endregion


  //#endregion Check if we got all the data
  document.body.classList.remove("loading");

  if (is_error) {
    overview_panel.classList.add("fetch-error");

    overview_panel.appendChild(ml("p", null, "txt_update_error".i18n()));
    overview_panel.appendChild(ml("p", { "class": "btn-container" },
      ml("a", { "class": "primary-btn", "href": "mailto:support@playfulsparkle.com" }, "btn_send_error_report".i18n())
    ));

    return;
  }
  //#endregion


  setButtonState(tab_lists.querySelectorAll('button[role="tab"]'), !is_error);


  //#region SEO preview
  const show_seo_preview = await getSetting("show-seo-preview", false);

  if (show_seo_preview) {
    const seo_preview = ml("div", { "class": "preview" },
      ml("span", { "class": "logo-container" },
        ml("img", { "class": "logo", "src": page_data.preview.favicon, "width": "32", "height": "32" })
      ),
      ml("span", { "class": "subtitle" }, page_data.preview.title ?? "txt_not_available".i18n()),
      ml("cite", { "class": "breadcrumb" },
        page_data.preview.breadcrumb,
        makeIcon("more-vertical.svg", 16, 16)
      ),
      ml("h3", { "class": "title" }, page_data.preview.title ?? "txt_not_available".i18n()),
      ml("p", { "class": "desc" }, page_data.preview.description.truncate(155))
    );

    overview_panel.appendChild(seo_preview);
  }
  //#endregion


  //#region Overview boxes
  let language = "txt_not_available".i18n();

  if (page_data.language) {
    const language_code = page_data.language.replace("-", "_").toLowerCase();

    language = ("lang_code_" + language_code).i18n() || ("lang_code_" + (language_code.split("_").pop() || "")).i18n();

    if (language) {
      language = `${language} (${page_data.language})`;
    }
  }

  let robots_meta = "txt_not_available".i18n();

  if (isObjPropEmpty(page_data.metas.general, "robots")) {
    robots_meta = page_data.metas.general["robots"];
  } else if (isObjPropEmpty(page_data.metas.general, "googlebot")) {
    robots_meta = page_data.metas.general["googlebot"];
  }

  overview_panel.appendChild(ml("section", { "class": "box-group" },
    ml("div", { "class": "box" },
      makeIcon("robot.svg", 32, 32),
      ml("span", { "class": "label" }, "txt_robots_meta".i18n()),
      ml("span", { "class": "value" + (robots_meta.length > 15 ? " dense" : "") }, robots_meta)
    ),
    ml("div", { "class": "box" },
      makeIcon("locale.svg", 32, 32),
      ml("span", { "class": "label" }, "txt_language".i18n()),
      ml("span", { "class": "value" + (language.length > 15 ? " dense" : "") }, language)
    ),
    ml("div", { "class": "box" },
      makeIcon("analytic.svg", 32, 32),
      ml("span", { "class": "label" }, "txt_word_count".i18n()),
      ml("span", { "class": "value" }, page_data.seo_stats.word_count.formatNumber())
    ),
    ml("div", { "class": "box" },
      makeIcon("analytic.svg", 32, 32),
      ml("span", { "class": "label" }, "txt_character_count".i18n()),
      ml("span", { "class": "value" }, page_data.seo_stats.character_count.formatNumber())
    ),
    ml("div", { "class": "box" },
      makeIcon("analytic.svg", 32, 32),
      ml("span", { "class": "label" }, "txt_sentence_count".i18n()),
      ml("span", { "class": "value" }, page_data.seo_stats.sentence_count.formatNumber())
    ),
    ml("div", { "class": "box" },
      makeIcon("analytic.svg", 32, 32),
      ml("span", { "class": "label" }, "txt_avg_word_length".i18n()),
      ml("span", { "class": "value" }, page_data.seo_stats.avg_word_length.formatNumber(2))
    ),
    ml("div", { "class": "box" },
      makeIcon("analytic.svg", 32, 32),
      ml("span", { "class": "label" }, "txt_avg_sentence_length".i18n()),
      ml("span", { "class": "value" }, page_data.seo_stats.avg_sentence_length.formatNumber(2))
    ),
  ));
  //#endregion


  //#region Error logs
  let errors = [];

  if (!page_data.title || page_data.title.length === 0) {
    errors.push(makeTableRow("high.svg", "severity_level_high".i18n(), "error_empty_page_title".i18n()));
  } else {
    if (page_data.title.length < 40) {
      errors.push(makeTableRow("high.svg", "severity_level_high".i18n(), sprintf("error_short_page_title".i18n(), page_data.title.length)));
    } else if (page_data.title.length > 80) {
      errors.push(makeTableRow("high.svg", "severity_level_high".i18n(), sprintf("error_long_page_title".i18n(), page_data.title.length)));
    }
  }

  if (!isObjPropEmpty(page_data.metas.general, "description")) {
    errors.push(makeTableRow("high.svg", "severity_level_high".i18n(), "error_empty_meta_description".i18n()));
  } else {
    const meta_desc_length = page_data.metas.general["description"].length;

    if (meta_desc_length <= 70) {
      errors.push(makeTableRow("high.svg", "severity_level_high".i18n(), sprintf("error_short_meta_description".i18n(), meta_desc_length)));
    } else if (meta_desc_length >= 155) {
      errors.push(makeTableRow("high.svg", "severity_level_high".i18n(), sprintf("error_long_meta_description".i18n(), meta_desc_length)));
    }
  }

  if (!page_data.language) {
    errors.push(makeTableRow("high.svg", "severity_level_high".i18n(), "error_empty_page_language".i18n()));
  }


  for (const key in page_data.headings.nesting_errors) {
    if (Object.prototype.hasOwnProperty.call(page_data.headings.nesting_errors, key)) {
      const nesting_error = page_data.headings.nesting_errors[key];

      const examples = nesting_error.examples.map(
        example => example.heading_text
          ? `${example.tag_name} (${example.heading_text})`
          : example.tag_name
      ).join(", ");

      if (nesting_error.previous_level === 0 && page_data.headings.heading_stats.h1 > 0) {
        errors.push(makeTableRow("high.svg", "severity_level_high".i18n(), sprintf("error_heading_h1_order".i18n(), nesting_error.occurrences, examples)));
      } else if (nesting_error.previous_level === 0 && page_data.headings.heading_stats.h1 === 0) {
        errors.push(makeTableRow("high.svg", "severity_level_high".i18n(), sprintf("error_heading_h1_missing".i18n(), nesting_error.occurrences, examples)));
      } else {
        errors.push(makeTableRow("high.svg", "severity_level_high".i18n(), sprintf("error_heading_nesting".i18n(), nesting_error.occurrences, examples, nesting_error.previous_level)));
      }
    }
  }

  if (page_data.headings.empty_errors) {
    errors.push(makeTableRow("high.svg", "severity_level_high".i18n(), sprintf("error_heading_empty".i18n(), page_data.headings.empty_errors)));
  }

  if (isObjPropEmpty(page_data.metas.general, "robots")) {
    const indexing_status = page_data.metas.general["robots"];

    if (indexing_status && indexing_status.includes("noindex")) {
      errors.push(makeTableRow("high.svg", "severity_level_high".i18n(), sprintf("error_blocked_robotstxt".i18n(), page_data.url)));
    }
  } else if (isObjPropEmpty(page_data.metas.general, "googlebot")) {
    const indexing_status = page_data.metas.general["googlebot"];

    if (indexing_status && indexing_status.includes("noindex")) {
      errors.push(makeTableRow("high.svg", "severity_level_high".i18n(), sprintf("error_blocked_robotstxt".i18n(), page_data.url)));
    }
  }

  if (!page_data.links.canonical) {
    errors.push(makeTableRow("critical.svg", "severity_level_critical".i18n(), "error_missing_canonical_tag".i18n()));
  }

  if (!page_data.robots_txt_exists) {
    errors.push(makeTableRow("high.svg", "severity_level_high".i18n(), "error_robots_txt_missing".i18n()));
  }

  if (page_data.robots_txt_sitemaps.length > 0) {
    const total_sitemaps = page_data.robots_txt_sitemaps.length;
    const sitemap_urls = page_data.robots_txt_sitemaps.map(url => `<a href="${url}">${url}</a>`).join(", ");

    errors.push(makeTableRow(
      "info.svg",
      "severity_level_info".i18n(),
      sprintf("info_robots_txt_sitemaps".i18n(), total_sitemaps, sitemap_urls),
    ));
  }

  overview_panel.appendChild(ml("table", null,
    ml("thead", null,
      ml("tr", null,
        ml("th", null, "table_heading_severity".i18n()),
        ml("th", null, "table_heading_desc".i18n())
      )
    ),
    ml("tbody", null, ...errors)
  ));
  //#endregion


  //#region  Headings tab content
  headings_panel.appendChild(ml("p", null, "txt_headings_desc".i18n()));

  headings_panel.appendChild(ml("section", { "class": "box-group" },
    ml("div", { "class": "box" },
      makeIcon("analytic.svg", 32, 32),
      ml("span", { "class": "label" }, "H1"),
      ml("span", { "class": "value" }, page_data.headings.heading_stats.h1.formatNumber())
    ),
    ml("div", { "class": "box" },
      makeIcon("analytic.svg", 32, 32),
      ml("span", { "class": "label" }, "H2"),
      ml("span", { "class": "value" }, page_data.headings.heading_stats.h2.formatNumber())
    ),
    ml("div", { "class": "box" },
      makeIcon("analytic.svg", 32, 32),
      ml("span", { "class": "label" }, "H3"),
      ml("span", { "class": "value" }, page_data.headings.heading_stats.h3.formatNumber())
    ),
    ml("div", { "class": "box" },
      makeIcon("analytic.svg", 32, 32),
      ml("span", { "class": "label" }, "H4"),
      ml("span", { "class": "value" }, page_data.headings.heading_stats.h4.formatNumber())
    ),
    ml("div", { "class": "box" },
      makeIcon("analytic.svg", 32, 32),
      ml("span", { "class": "label" }, "H5"),
      ml("span", { "class": "value" }, page_data.headings.heading_stats.h5.formatNumber())
    ),
    ml("div", { "class": "box" },
      makeIcon("analytic.svg", 32, 32),
      ml("span", { "class": "label" }, "H6"),
      ml("span", { "class": "value" }, page_data.headings.heading_stats.h6.formatNumber())
    ),
  ));

  headings_panel.appendChild(sanitizeHtml(page_data.headings.html));
  //#endregion


  //#region Images tab content
  images_panel.appendChild(ml("p", null, "txt_images_desc".i18n()));

  images_panel.appendChild(ml("section", { "class": "box-group" },
    ml("div", { "class": "box" },
      makeIcon("analytic.svg", 32, 32),
      ml("span", { "class": "label" }, "txt_total_images".i18n()),
      ml("span", { "class": "value" }, page_data.images.total_images.formatNumber())
    ),
    ml("div", { "class": "box" },
      makeIcon("analytic.svg", 32, 32),
      ml("span", { "class": "label" }, "txt_images_without_alt".i18n()),
      ml("span", { "class": "value" }, page_data.images.images_without_alt.formatNumber())
    ),
  ));
  //#endregion


  //#region Links tab content
  links_panel.appendChild(ml("p", null, "txt_links_desc".i18n())); // Tab description

  //#region Links tab info boxes
  links_panel.appendChild(ml("section", { "class": "box-group" },
    ml("div", { "class": "box" },
      makeIcon("analytic.svg", 32, 32),
      ml("span", { "class": "label" }, "txt_total_internal_links".i18n()),
      ml("span", { "class": "value" }, page_data.hyperlinks.total_internal.formatNumber())
    ),
    ml("div", { "class": "box" },
      makeIcon("analytic.svg", 32, 32),
      ml("span", { "class": "label" }, "txt_total_external_links".i18n()),
      ml("span", { "class": "value" }, page_data.hyperlinks.total_external.formatNumber())
    ),
  ));
  //#endregion


  //#region Link sub tabs
  links_panel.appendChild(ml("div", { "role": "tablist" },
    ml("button", { "id": "tab-internal-link", "type": "button", "role": "tab", "aria-selected": "true", "aria-controls": "tabpanel-internal-link" },
      "tab_btn_label_internal_links".i18n()
    ),
    ml("button", { "id": "tab-external-link", "type": "button", "role": "tab", "aria-controls": "tabpanel-external-link" },
      "tab_btn_label_external_links".i18n()
    ),
    ml("button", { "id": "tab-external-resource", "type": "button", "role": "tab", "aria-controls": "tabpanel-external-resource" },
      "tab_btn_label_external_resource".i18n()
    )
  ));
  //#endregion


  //#region Internal links
  if (page_data.hyperlinks.total_internal > 0) {
    const internal_links_panel = ml("div", { "id": "tabpanel-internal-link", "role": "tabpanel", "tabindex": "0", "aria-labelledby": "tab-internal-link" });

    let internal_links = [];

    for (const key in page_data.hyperlinks.internal_links) {
      if (Object.prototype.hasOwnProperty.call(page_data.hyperlinks.internal_links, key)) {
        const link = page_data.hyperlinks.internal_links[key];
        const rels = link.rel.map(rel => ml("span", { "class": "tag" }, rel));
        const robots_txt_blocked = link.is_blocked ? ml("span", { "class": "tag tag-error" }, "txt_blocked_robotstxt".i18n()) : null;

        let anchor_text;

        if (!link.anchor) {
          anchor_text = ml("span", { "class": "tag tag-error" }, "txt_empty_text".i18n());
        } else {
          anchor_text = link.anchor.truncate(155);
        }

        internal_links.push(
          ml("dt", null, link.url),
          ml("dd", null, anchor_text, robots_txt_blocked, ...rels),
        );
      }
    }

    internal_links_panel.appendChild(ml("dl", null, ...internal_links));

    links_panel.appendChild(internal_links_panel);
  }
  //#endregion


  //#region External link
  if (page_data.hyperlinks.total_external > 0) {
    const external_links_panel = ml("div", { "id": "tabpanel-external-link", "role": "tabpanel", "tabindex": "0", "aria-labelledby": "tab-external-link" });

    let external_links = [];

    for (const key in page_data.hyperlinks.external_links) {
      if (Object.prototype.hasOwnProperty.call(page_data.hyperlinks.external_links, key)) {
        const link = page_data.hyperlinks.external_links[key];
        const rels = link.rel.map(rel => ml("span", { "class": "tag" }, rel));

        let anchor_text;

        if (!link.anchor) {
          anchor_text = ml("span", { "class": "tag tag-error" }, "txt_empty_text".i18n());
        } else {
          anchor_text = link.anchor.truncate(155);
        }

        external_links.push(
          ml("dt", null, link.url),
          ml("dd", null, anchor_text, ...rels),
        );
      }
    }

    external_links_panel.appendChild(ml("dl", null, ...external_links));

    links_panel.appendChild(external_links_panel);
  }
  //#endregion


  //#region External resource
  let external_resouce_counter = 0;
  const external_resource_panel = ml("div", { "id": "tabpanel-external-resource", "role": "tabpanel", "tabindex": "0", "aria-labelledby": "tab-external-resource" });

  if (!isObjEmpty(page_data.links.alternate)) {
    external_resouce_counter++;
    let alternate_resource_links = [];

    for (const key in page_data.links.alternate) {
      if (Object.prototype.hasOwnProperty.call(page_data.links.alternate, key)) {
        const language_resource = page_data.links.alternate[key];

        alternate_resource_links.push(
          ml("dt", null, language_resource.name),
          ml("dd", null, language_resource.href,
            ml("span", { "class": "tag" }, language_resource.type)
          ),
        );
      }
    }

    external_resource_panel.appendChild(ml("h2", null, "heading_alternate_resource_link".i18n()));
    external_resource_panel.appendChild(ml("dl", null, ...alternate_resource_links));
  }


  if (!isObjEmpty(page_data.links.language)) {
    external_resouce_counter++;
    let language_resource_links = [];

    for (const key in page_data.links.language) {
      if (Object.prototype.hasOwnProperty.call(page_data.links.language, key)) {
        const language_resource = page_data.links.language[key];

        language_resource_links.push(
          ml("dt", null, language_resource.hreflang),
          ml("dd", null, language_resource.href),
        );
      }
    }

    external_resource_panel.appendChild(ml("h2", null, "heading_language_resource_link".i18n()));
    external_resource_panel.appendChild(ml("dl", null, ...language_resource_links));
  }

  if (!isObjEmpty(page_data.links.navigation)) {
    external_resouce_counter++;
    let navigation_resource_links = [];

    for (const key in page_data.links.navigation) {
      if (Object.prototype.hasOwnProperty.call(page_data.links.navigation, key)) {
        navigation_resource_links.push(
          ml("dt", null, key),
          ml("dd", null, page_data.links.navigation[key]),
        );
      }
    }

    external_resource_panel.appendChild(ml("h2", null, "heading_navigation_resource_link".i18n()));
    external_resource_panel.appendChild(ml("dl", null, ...navigation_resource_links));
  }

  if (!isObjEmpty(page_data.links.performance)) {
    external_resouce_counter++;
    let performance_resource_links = [];

    for (const key in page_data.links.performance) {
      if (Object.prototype.hasOwnProperty.call(page_data.links.performance, key)) {
        performance_resource_links.push(
          ml("dt", null, key),
          ml("dd", null, page_data.links.performance[key]),
        );
      }
    }

    external_resource_panel.appendChild(ml("h2", null, "heading_performance_resource_link".i18n()));
    external_resource_panel.appendChild(ml("dl", null, ...performance_resource_links));
  }

  if (!isObjEmpty(page_data.links.icons)) {
    external_resouce_counter++;
    let icon_resource_links = [];

    for (const key in page_data.links.icons) {
      if (Object.prototype.hasOwnProperty.call(page_data.links.icons, key)) {
        const icon_resource = page_data.links.icons[key];

        icon_resource_links.push(
          ml("dt", null, icon_resource.name),
          ml("dd", null, icon_resource.href,
            ml("span", { "class": "tag" }, icon_resource.type),
            ml("span", { "class": "tag" }, icon_resource.sizes),
          )
        );
      }
    }

    external_resource_panel.appendChild(ml("h2", null, "heading_icon_resource_link".i18n()));
    external_resource_panel.appendChild(ml("dl", null, ...icon_resource_links));
  }

  if (external_resouce_counter > 0) links_panel.appendChild(external_resource_panel);

  new TabsAutomatic(links_panel.querySelector("[role=tablist]"));
  //#endregion


  //#region Meta tab content
  metas_panel.appendChild(ml("p", null, "txt_meta_desc".i18n()));

  let meta_counter = 0;

  if (!isObjEmpty(page_data.metas.facebook)) {
    meta_counter++;

    makeDescriptionList(metas_panel, "heading_facebook_meta".i18n(), page_data.metas.facebook);
  }

  if (!isObjEmpty(page_data.metas.twitter)) {
    meta_counter++;

    makeDescriptionList(metas_panel, "heading_twitter_meta".i18n(), page_data.metas.twitter);
  }

  if (!isObjEmpty(page_data.metas.dublin_core)) {
    meta_counter++;

    makeDescriptionList(metas_panel, "heading_dublin_core_meta".i18n(), page_data.metas.dublin_core);
  }

  if (!isObjEmpty(page_data.metas.general)) {
    meta_counter++;

    makeDescriptionList(metas_panel, "heading_general_meta".i18n(), page_data.metas.general);
  }

  if (meta_counter === 0) {
    metas_panel.appendChild(ml("p", { "class": "warning" }, "error_no_meta_tags".i18n()))
  }
  //#endregion


  //#region Rich Snippet tab content
  rich_snippets_panel.appendChild(ml("p", null, "txt_rich_snippets_desc".i18n()));

  if (!isObjEmpty(page_data.rich_snippets)) {
    for (const main_key in page_data.rich_snippets) {
      if (Object.prototype.hasOwnProperty.call(page_data.rich_snippets, main_key)) {
        const rich_snippet = page_data.rich_snippets[main_key];

        let rich_snippets = [];

        for (const sub_key in rich_snippet) {
          if (Object.prototype.hasOwnProperty.call(rich_snippet, sub_key)) {
            const row = rich_snippet[sub_key];

            rich_snippets.push(
              ml("tr", null,
                ml("th", { "class": "x-right" }, row.key),
                ml("td", null, row.value),
              )
            );
          }
        }

        rich_snippets_panel.appendChild(ml("h2", null, ("heading_rich_snippet_" + main_key).i18n()));

        rich_snippets_panel.appendChild(ml("table", null,
          ml("thead", null,
            ml("tr", null,
              ml("th", null, "table_heading_key".i18n()),
              ml("th", null, "table_heading_value".i18n())
            )
          ),
          ml("tbody", null, ...rich_snippets)
        ));
      }
    }
  } else {
    rich_snippets_panel.appendChild(ml("p", { "class": "warning" }, "error_no_rich_snippets".i18n()))
  }
  //#endregion


}
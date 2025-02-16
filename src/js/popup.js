String.prototype.truncate = function (maxLength) {
  return this.length >= maxLength ? this.substring(0, maxLength) + "..." : this.toString();
};

String.prototype.i18n = function (substitutions = null) {
  return browser.i18n.getMessage(this.toString(), substitutions);
};

Number.prototype.formatNumber = function (decimalPlaces = 0) {
  return new Intl.NumberFormat(navigator.language, {
    maximumFractionDigits: decimalPlaces,
    minimumFractionDigits: decimalPlaces
  }).format(this);
};

function objIsEmpty(obj) {
  for (let key in obj) {
    if (obj.hasOwnProperty(key)) return false;
  }

  return true;
}

/**
 * Retrieves the currently active tab in the current window.
 *
 * @returns {Promise<browser.tabs.Tab>} A promise that resolves to the currently active tab object.
 */
async function getCurrentTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

  return tab;
}

/**
 * Save a setting to browser's local storage
 * 
 * @param {string} offset - The key to store the value under
 * @param {any} value - The value to store
 */
async function saveSetting(offset, value) {
  try {
    await browser.storage.local.set({ [offset]: value });
  } catch (error) {
    console.error(`Error saving ${offset}:`, error);
  }
}

/**
* Get a setting from browser's local storage
* 
* @param {string} offset - The key to retrieve
* @param {any} default_value - Default value if key doesn't exist
* @returns {Promise<any>} The stored value or default value
*/
async function getSetting(offset, default_value = null) {
  try {
    const result = await browser.storage.local.get(offset);

    return result[offset] ?? default_value;
  } catch (error) {
    console.error(`Error getting ${offset}:`, error);

    return default_value;
  }
}

function ml(tagName, props, ...children) {
  var el = document.createElement(tagName);

  // Set properties and event listeners
  if (props) {
    for (var name in props) {
      if (name.indexOf("on") === 0) {
        el.addEventListener(name.substr(2).toLowerCase(), props[name], false);
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
    el.appendChild(document.createTextNode(DOMPurify.sanitize(child)));
  } else if (child instanceof Array) {
    for (var nestedChild of child) {
      appendChildren(el, nestedChild);
    }
  } else if (child instanceof Node) {
    el.appendChild(child);
  }
}

function setButtonState(buttons, isEnabled) {
  buttons.forEach(button => {
    button.disabled = !isEnabled;

    if (isEnabled) {
      button.classList.remove("disabled");
    } else {
      button.classList.add("disabled");
    }
  });
}

const content = document.querySelector("#content");

const tab_lists = ml("div", { "role": "tablist" },
  ml("button", { "id": "tab-overview", "type": "button", "disabled": "", "role": "tab", "aria-controls": "tabpanel-overview" },
    "tab_btn_label_overview".i18n(),
    ml("img", { "src": "/icons/overview.svg", "width": "16", "height": "16" })
  ),
  ml("button", { "id": "tab-headings", "type": "button", "disabled": "", "role": "tab", "aria-controls": "tabpanel-headings" },
    "tab_btn_label_headings".i18n(),
    ml("img", { "src": "/icons/headings.svg", "width": "16", "height": "16" })
  ),
  ml("button", { "id": "tab-images", "type": "button", "disabled": "", "role": "tab", "aria-controls": "tabpanel-images" },
    "tab_btn_label_images".i18n(),
    ml("img", { "src": "/icons/images.svg", "width": "16", "height": "16" })
  ),
  ml("button", { "id": "tab-links", "type": "button", "disabled": "", "role": "tab", "aria-controls": "tabpanel-links" },
    "tab_btn_label_links".i18n(),
    ml("img", { "src": "/icons/links.svg", "width": "16", "height": "16" })
  ),
  ml("button", { "id": "tab-rich-snippets", "type": "button", "disabled": "", "role": "tab", "aria-controls": "tabpanel-rich-snippets" },
    "tab_btn_label_rich_snippets".i18n(),
    ml("img", { "src": "/icons/rich-snippet.svg", "width": "16", "height": "16" })
  ),
  ml("button", { "id": "tab-metas", "type": "button", "disabled": "", "role": "tab", "aria-controls": "tabpanel-metas" },
    "tab_btn_label_metas".i18n(),
    ml("img", { "src": "/icons/metas.svg", "width": "16", "height": "16" })
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

// Enable tab panels
new TabsAutomatic(content.querySelector("[role=tablist]"));

//#region Loaded state change
// Display/upate page tab content in popup after the tab has successfully loaded
// Prevent duplicate, if the popup content was already displayed without error then we are fine
let content_displayed = false;
let is_loading = false;

browser.runtime.onMessage.addListener(async message => {
  if (message.tabId && message.status) {
    const tab = await getCurrentTab();

    is_loading = message.tabId === tab.id && message.status === "loading";

    if (message.tabId === tab.id && message.status === "complete" && !content_displayed) {
      await showPopupContent(tab);
    }
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  const tab = await getCurrentTab();

  await showPopupContent(tab);
});
//#endregion

function makeTableRow(icon, severity, desc) {
  return ml("tr", null,
    ml("td", null, severity, icon.cloneNode(false)),
    ml("td", null, desc),
  );
}

async function showPopupContent(tab) {
  try {
    // Clear tab content
    overview_panel.innerText = "";
    headings_panel.innerText = "";
    images_panel.innerText = "";
    links_panel.innerText = "";
    rich_snippets_panel.innerText = "";
    metas_panel.innerText = "";

    const page_data = await browser.tabs.sendMessage(tab.id, { action: "getPageData" });

    // console.log(JSON.stringify(page_data.links, null, 4));

    const analytic_icon = ml("img", { "src": "/icons/analytic.svg", "width": "32", "height": "32" });
    const critical_severity_icon = ml("img", { "src": "/icons/severity-level-critical.svg", "width": "24", "height": "24" });
    const high_severity_icon = ml("img", { "src": "/icons/severity-level-high.svg", "width": "24", "height": "24" });
    const medium_severity_icon = ml("img", { "src": "/icons/severity-level-medium.svg", "width": "24", "height": "24" });
    const info_severity_icon = ml("img", { "src": "/icons/severity-level-info.svg", "width": "24", "height": "24" });


    const seo_preview = ml("div", { "class": "preview" },
      ml("span", { "class": "logo-container" },
        ml("img", { "class": "logo", "src": page_data.preview.favicon, "width": "32", "height": "32" })
      ),
      ml("span", { "class": "subtitle" }, page_data.preview.title ?? "txt_not_available".i18n()),
      ml("cite", { "class": "breadcrumb" },
        page_data.preview.breadcrumb,
        ml("img", { "src": "/icons/more-vertical.svg", "width": "16", "height": "16" })
      ),
      ml("h3", { "class": "title" }, page_data.preview.title ?? "txt_not_available".i18n()),
      ml("p", { "class": "desc" }, page_data.preview.description.truncate(150))
    );

    overview_panel.appendChild(seo_preview);


    let language = "";
    let language_prefix = "";
    const language_code = page_data.language ? page_data.language.replace("-", "_").toLowerCase() : "";

    if (page_data.language) {
      language = ("lang_code_" + language_code).i18n();
      language_prefix = "(" + page_data.language + ") ";
    }

    if (!language) {
      language = ("lang_code_" + (language_code.split("_").pop() || "")).i18n() || "txt_not_available".i18n();
    }

    const robots_meta = page_data.metas.general.robots || "txt_not_available".i18n();

    overview_panel.appendChild(ml("section", { "class": "box-group" },
      ml("div", { "class": "box" },
        ml("img", { "src": "/icons/robots_meta.svg", "width": "32", "height": "32" }),
        ml("span", { "class": "label" }, "txt_robots_meta".i18n()),
        ml("span", { "class": "value" + (robots_meta.length > 25 ? " normal" : "") }, robots_meta)
      ),
      ml("div", { "class": "box" },
        ml("img", { "src": "/icons/locale.svg", "width": "32", "height": "32" }),
        ml("span", { "class": "label" }, "txt_language".i18n()),
        ml("span", { "class": "value" }, language_prefix + language)
      ),
      ml("div", { "class": "box" },
        analytic_icon.cloneNode(false),
        ml("span", { "class": "label" }, "txt_word_count".i18n()),
        ml("span", { "class": "value" }, page_data.seo_stats.word_count.formatNumber())
      ),
      ml("div", { "class": "box" },
        analytic_icon.cloneNode(false),
        ml("span", { "class": "label" }, "txt_character_count".i18n()),
        ml("span", { "class": "value" }, page_data.seo_stats.character_count.formatNumber())
      ),
      ml("div", { "class": "box" },
        analytic_icon.cloneNode(false),
        ml("span", { "class": "label" }, "txt_sentence_count".i18n()),
        ml("span", { "class": "value" }, page_data.seo_stats.sentence_count.formatNumber())
      ),
      ml("div", { "class": "box" },
        analytic_icon.cloneNode(false),
        ml("span", { "class": "label" }, "txt_avg_word_length".i18n()),
        ml("span", { "class": "value" }, page_data.seo_stats.avg_word_length.formatNumber(2))
      ),
      ml("div", { "class": "box" },
        analytic_icon.cloneNode(false),
        ml("span", { "class": "label" }, "txt_avg_sentence_length".i18n()),
        ml("span", { "class": "value" }, page_data.seo_stats.avg_sentence_length.formatNumber(2))
      ),
    ));



    //#region Error logs
    const errors = [];

    if (!page_data.title) {
      errors.push(makeTableRow(high_severity_icon, "severity_level_high".i18n(), "error_empty_page_title".i18n()));
    } else {
      if (page_data.title.length < 65) {
        errors.push(makeTableRow(high_severity_icon, "severity_level_high".i18n(), sprintf("error_short_page_title".i18n(), page_data.title.length)));
      } else if (page_data.title.length > 568) {
        errors.push(makeTableRow(high_severity_icon, "severity_level_high".i18n(), sprintf("error_long_page_title".i18n(), page_data.title.length)));
      }
    }

    if (!page_data.language) {
      errors.push(makeTableRow(high_severity_icon, "severity_level_high".i18n(), "error_empty_page_language".i18n()));
    }


    for (let key in page_data.headings.nesting_errors) {
      if (page_data.headings.nesting_errors.hasOwnProperty(key)) {
        const nesting_error = page_data.headings.nesting_errors[key];

        const examples = nesting_error.examples.map(example => example.heading_text ? `${example.tag_name} (${example.heading_text})` : example.tag_name).join(", ");

        if (nesting_error.previous_level === 0) {
          errors.push(makeTableRow(high_severity_icon, "severity_level_high".i18n(), sprintf("error_heading_h1_missing".i18n(), nesting_error.occurrences, examples)));
        } else {
          errors.push(makeTableRow(high_severity_icon, "severity_level_high".i18n(), sprintf("error_heading_nesting".i18n(), nesting_error.occurrences, examples, nesting_error.previous_level)));
        }
      }
    }

    if (page_data.headings.empty_errors) {
      errors.push(makeTableRow(high_severity_icon, "severity_level_high".i18n(), sprintf("error_heading_empty".i18n(), page_data.headings.empty_errors)));
    }

    if (!page_data.links.canonical) {
      errors.push(makeTableRow(critical_severity_icon, "severity_level_critical".i18n(), "error_missing_canonical_tag".i18n()));
    }

    if (!page_data.robots_txt) {
      errors.push(makeTableRow(high_severity_icon, "severity_level_high".i18n(), "error_robots_txt_missing".i18n()));
    }

    if (page_data.robots_txt_sitemaps.length > 0) {
      const total_sitemaps = page_data.robots_txt_sitemaps.length;
      const sitemap_urls = page_data.robots_txt_sitemaps.join(', ');

      errors.push(makeTableRow(
        info_severity_icon,
        "severity_level_info".i18n(),
        sprintf("info_robots_txt_sitemaps".i18n(), total_sitemaps, sitemap_urls)
      ));
    } 
    
    // if (!page_data.sitemap) {
    //   errors.push(makeTableRow(high_severity_icon, "severity_level_high".i18n(), "error_sitemap_missing".i18n()));
    // }

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

    headings_panel.appendChild(ml('p', null, "txt_headings_desc".i18n()));

    headings_panel.appendChild(ml("section", { "class": "box-group" },
      ml("div", { "class": "box" },
        analytic_icon.cloneNode(false),
        ml("span", { "class": "label" }, "H1"),
        ml("span", { "class": "value" }, page_data.headings.heading_stats.h1.formatNumber())
      ),
      ml("div", { "class": "box" },
        analytic_icon.cloneNode(false),
        ml("span", { "class": "label" }, "H2"),
        ml("span", { "class": "value" }, page_data.headings.heading_stats.h2.formatNumber())
      ),
      ml("div", { "class": "box" },
        analytic_icon.cloneNode(false),
        ml("span", { "class": "label" }, "H3"),
        ml("span", { "class": "value" }, page_data.headings.heading_stats.h3.formatNumber())
      ),
      ml("div", { "class": "box" },
        analytic_icon.cloneNode(false),
        ml("span", { "class": "label" }, "H4"),
        ml("span", { "class": "value" }, page_data.headings.heading_stats.h4.formatNumber())
      ),
      ml("div", { "class": "box" },
        analytic_icon.cloneNode(false),
        ml("span", { "class": "label" }, "H5"),
        ml("span", { "class": "value" }, page_data.headings.heading_stats.h5.formatNumber())
      ),
      ml("div", { "class": "box" },
        analytic_icon.cloneNode(false),
        ml("span", { "class": "label" }, "H6"),
        ml("span", { "class": "value" }, page_data.headings.heading_stats.h6.formatNumber())
      ),
    ));

    const parser = new DOMParser();
    const sanitized_html = DOMPurify.sanitize(page_data.headings.html);
    const headings_html = parser.parseFromString(sanitized_html, "text/html");

    headings_panel.appendChild(headings_html.body.firstChild);


    images_panel.appendChild(ml('p', null, "txt_images_desc".i18n()));

    images_panel.appendChild(ml("section", { "class": "box-group" },
      ml("div", { "class": "box" },
        analytic_icon.cloneNode(false),
        ml("span", { "class": "label" }, "txt_total_images".i18n()),
        ml("span", { "class": "value" }, page_data.images.total_images.formatNumber())
      ),
      ml("div", { "class": "box" },
        analytic_icon.cloneNode(false),
        ml("span", { "class": "label" }, "txt_images_without_alt".i18n()),
        ml("span", { "class": "value" }, page_data.images.images_without_alt.formatNumber())
      ),
    ));


    links_panel.appendChild(ml('p', null, "txt_links_desc".i18n()));

    links_panel.appendChild(ml("section", { "class": "box-group" },
      ml("div", { "class": "box" },
        analytic_icon.cloneNode(false),
        ml("span", { "class": "label" }, "txt_total_internal_links".i18n()),
        ml("span", { "class": "value" }, page_data.hyperlinks.total_internal.formatNumber())
      ),
      ml("div", { "class": "box" },
        analytic_icon.cloneNode(false),
        ml("span", { "class": "label" }, "txt_total_external_links".i18n()),
        ml("span", { "class": "value" }, page_data.hyperlinks.total_external.formatNumber())
      ),
    ));


    if (page_data.hyperlinks.total_internal > 0 || page_data.hyperlinks.total_external > 0) {
      links_panel.appendChild(ml("div", { "role": "tablist" },
        page_data.hyperlinks.total_internal > 0 ? ml("button", { "id": "tab-internal-link", "type": "button", "role": "tab", "aria-selected": "true", "aria-controls": "tabpanel-internal-link" },
          "tab_btn_label_internal_links".i18n()
        ) : null,
        page_data.hyperlinks.total_external > 0 ? ml("button", { "id": "tab-external-link", "type": "button", "role": "tab", "aria-controls": "tabpanel-external-link" },
          "tab_btn_label_external_links".i18n()
        ) : null
      ));
    }

    if (page_data.hyperlinks.total_internal > 0) {
      const internal_links_panel = ml("div", { "id": "tabpanel-internal-link", "role": "tabpanel", "tabindex": "0", "aria-labelledby": "tab-internal-link" });

      const internal_links = [];

      for (let key in page_data.hyperlinks.internal_links) {
        if (page_data.hyperlinks.internal_links.hasOwnProperty(key)) {
          const link = page_data.hyperlinks.internal_links[key];
          const rels = link.rel.map(rel => ml("span", { "class": "tag" }, rel));
          const robots_txt_blocked = link.is_blocked ? ml("span", { "class": "tag tag-error" }, "blocked") : null;

          internal_links.push(
            ml("dt", null, link.url),
            ml("dd", null, link.anchor ?? "txt_empty_anchor".i18n(), robots_txt_blocked, ...rels),
          );
        }
      }

      internal_links_panel.appendChild(ml("dl", null, ...internal_links));

      links_panel.appendChild(internal_links_panel);
    }

    if (page_data.hyperlinks.total_external > 0) {
      const external_links_panel = ml("div", { "id": "tabpanel-external-link", "role": "tabpanel", "tabindex": "0", "aria-labelledby": "tab-external-link" });

      const external_links = [];

      for (let key in page_data.hyperlinks.external_links) {
        if (page_data.hyperlinks.external_links.hasOwnProperty(key)) {
          const link = page_data.hyperlinks.external_links[key];
          const rels = link.rel.map(rel => ml("span", { "class": "tag" }, rel));

          external_links.push(
            ml("dt", null, link.url),
            ml("dd", null, link.anchor ?? "txt_empty_anchor".i18n(), ...rels),
          );
        }
      }

      external_links_panel.appendChild(ml("dl", null, ...external_links));

      links_panel.appendChild(external_links_panel);
    }

    if (page_data.hyperlinks.total_internal > 0 || page_data.hyperlinks.total_external > 0) {
      new TabsAutomatic(links_panel.querySelector("[role=tablist]"));
    }


    metas_panel.appendChild(ml('p', null, "txt_meta_desc".i18n()));

    if (!objIsEmpty(page_data.metas.facebook)) {
      const facebook_meta = [];

      for (let key in page_data.metas.facebook) {
        if (page_data.metas.facebook.hasOwnProperty(key)) {
          facebook_meta.push(
            ml("dt", null, key),
            ml("dd", null, page_data.metas.facebook[key]),
          );
        }
      }

      metas_panel.appendChild(ml("h2", null, "heading_facebook_meta".i18n()));
      metas_panel.appendChild(ml("dl", null, ...facebook_meta));
    }

    if (!objIsEmpty(page_data.metas.twitter)) {
      const twitter_meta = [];

      for (let key in page_data.metas.twitter) {
        if (page_data.metas.twitter.hasOwnProperty(key)) {
          twitter_meta.push(
            ml("dt", null, key),
            ml("dd", null, page_data.metas.twitter[key]),
          );
        }
      }
      metas_panel.appendChild(ml("h2", null, "heading_twitter_meta".i18n()));
      metas_panel.appendChild(ml("dl", null, ...twitter_meta));
    }

    if (!objIsEmpty(page_data.metas.dublin_core)) {
      const dublin_core_meta = [];

      for (let key in page_data.metas.dublin_core) {
        if (page_data.metas.dublin_core.hasOwnProperty(key)) {
          dublin_core_meta.push(
            ml("dt", null, key),
            ml("dd", null, page_data.metas.dublin_core[key]),
          );
        }
      }

      metas_panel.appendChild(ml("h2", null, "heading_dublin_core_meta".i18n()));
      metas_panel.appendChild(ml("dl", null, ...dublin_core_meta));
    }

    if (!objIsEmpty(page_data.metas.general)) {
      const general_meta = [];

      for (let key in page_data.metas.general) {
        if (page_data.metas.general.hasOwnProperty(key)) {
          general_meta.push(
            ml("dt", null, key),
            ml("dd", null, page_data.metas.general[key]),
          );
        }
      }

      metas_panel.appendChild(ml("h2", null, "heading_general_meta".i18n()));
      metas_panel.appendChild(ml("dl", null, ...general_meta));
    }


    rich_snippets_panel.appendChild(ml('p', null, "txt_rich_snippets_desc".i18n()));

    const rich_snippets = [];

    for (let key in page_data.rich_snippets) {
      if (page_data.rich_snippets.hasOwnProperty(key)) {
        const data = page_data.rich_snippets[key];

        rich_snippets.push(
          ml("tr", null,
            ml("td", null, data.key),
            ml("td", null, data.value),
          )
        );
      }
    }

    if (rich_snippets.length > 0) {
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

    setButtonState(tab_lists.querySelectorAll('button[role="tab"]'), true);

    document.body.classList.remove("loading");

    content_displayed = true;
  } catch (error) {
    content_displayed = false;

    console.error(error);

    if (!is_loading) {
      document.body.classList.remove("loading");

      overview_panel.innerText = "";

      overview_panel.classList.add("fetch-error")
      overview_panel.appendChild(ml("p", null, "txt_update_error".i18n()));
      overview_panel.appendChild(ml("p", { "class": "btn-container" },
        ml("a", { "class": "primary-btn", "href": "mailto:support@playfulsparkle.com" }, "btn_send_error_report".i18n())
      ));
    }
  }
}
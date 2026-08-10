"use strict";

/**
 * Applies the browser UI locale direction to extension pages.
 *
 * The extension UI is rendered dynamically, so direction must be established
 * before the UI builders create their elements. The locale returned by the
 * browser API is the authoritative UI locale, including regional variants.
 */
(() => {
  const RTL_LANGUAGE_RE = /^(?:ar|arc|dv|fa|he|iw|ku|nqo|ps|sd|ug|ur|yi)(?:-|$)/i;

  function getUILanguage() {
    try {
      if (typeof browser !== "undefined" && browser.i18n && typeof browser.i18n.getUILanguage === "function") {
        return browser.i18n.getUILanguage();
      }

      if (typeof chrome !== "undefined" && chrome.i18n && typeof chrome.i18n.getUILanguage === "function") {
        return chrome.i18n.getUILanguage();
      }
    } catch {
      // Fall through to the browser language.
    }

    return navigator.language || "en";
  }

  const locale = String(getUILanguage()).replace(/_/g, "-");
  const language = locale.toLowerCase().split("-")[0];
  const direction = RTL_LANGUAGE_RE.test(locale) ? "rtl" : "ltr";

  document.documentElement.lang = locale;
  document.documentElement.dir = direction;
  document.documentElement.dataset.direction = direction;
  document.documentElement.dataset.language = language;
})();

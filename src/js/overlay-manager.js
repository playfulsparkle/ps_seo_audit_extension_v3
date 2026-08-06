"use strict";

/**
 * OverlayManager – Singleton that draws highlight boxes in a dedicated,
 * fixed-position layer above the page (instead of styling the target
 * elements in place). Box positions are tracked via getBoundingClientRect()
 * and kept in sync with a requestAnimationFrame loop, so highlights stay
 * glued to their elements through scrolling (including nested scroll
 * containers), resizing, and layout shifts — and they"re never clipped by
 * an ancestor"s `overflow: hidden` or hidden behind the page"s own
 * stacking contexts / CSS.
 */
class OverlayManager {
  static #instance = null;

  /**
   * @returns {OverlayManager} The singleton instance.
   */
  static getInstance() {
    if (!OverlayManager.#instance) {
      OverlayManager.#instance = new OverlayManager();
    }
    return OverlayManager.#instance;
  }

  constructor() {
    if (OverlayManager.#instance) {
      return OverlayManager.#instance;
    }

    this.styleElement = null;
    this.container = null;
    this.loopRunning = false;
    this.rafId = null;

    // Map<targetElement, Map<type, { box: HTMLElement, labelEl: HTMLElement|null }>>
    this.tracked = new Map();

    this.#injectStyles();
    this.#createContainer();

    OverlayManager.#instance = this;
  }

  /**
   * Injects a global stylesheet into document.head for the overlay boxes
   * and their labels. Nothing here targets the page"s own elements.
   */
  #injectStyles() {
    if (document.querySelector("style[data-ps-overlay]")) {
      this.styleElement = document.querySelector("style[data-ps-overlay]");
      return;
    }

    this.styleElement = document.createElement("style");
    this.styleElement.setAttribute("data-ps-overlay", "");
    this.styleElement.textContent = `
      #__ps-overlay-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 0;
        height: 0;
        pointer-events: none;
        z-index: 2147483647;
      }

      .__ps-overlay-box {
        position: fixed;
        box-sizing: border-box;
        pointer-events: none;
      }

      .__ps-overlay-box[data-ps-type="empty-alt"] {
        outline: 3px solid #e74c3c;
        outline-offset: 2px;
      }

      .__ps-overlay-box[data-ps-type="external-link"] {
        outline: 3px solid #3498db;
        outline-offset: 2px;
      }

      .__ps-overlay-box[data-ps-type="nofollow-link"] {
        outline: 3px solid #f39c12;
        outline-offset: 2px;
      }

      .__ps-overlay-box[data-ps-type="duplicate-link"] {
        outline: 3px solid #9b59b6;
        outline-offset: 2px;
      }

      .__ps-overlay-label {
        position: absolute;
        bottom: calc(100% + 4px);
        left: 50%;
        transform: translateX(-50%);
        background: #2c3e50;
        color: #fff;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-family: system-ui, sans-serif;
        white-space: nowrap;
        pointer-events: none;
      }
    `;

    const parent = document.head || document.documentElement;
    parent.appendChild(this.styleElement);
  }

  /**
   * Creates the fixed-position layer that all highlight boxes live in.
   */
  #createContainer() {
    let container = document.getElementById("__ps-overlay-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "__ps-overlay-container";
      const target = document.body || document.documentElement || document.head;
      target.appendChild(container);
    }
    this.container = container;
  }

  /**
   * Starts the sync loop if it isn"t already running. The loop stops
   * itself the moment nothing is tracked anymore.
   */
  #startLoop() {
    if (this.loopRunning) {
      return;
    }
    this.loopRunning = true;

    const tick = () => {
      if (this.tracked.size === 0) {
        this.loopRunning = false;
        this.rafId = null;
        return;
      }
      this.#reposition();
      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  /**
   * Recomputes and applies the position/size of every tracked box.
   * Elements that have been removed from the DOM are dropped.
   */
  #reposition() {
    for (const [element, typeMap] of this.tracked) {
      if (!element.isConnected) {
        for (const { box } of typeMap.values()) {
          box.remove();
        }
        this.tracked.delete(element);
        continue;
      }

      const rect = element.getBoundingClientRect();
      for (const { box } of typeMap.values()) {
        box.style.top = `${rect.top}px`;
        box.style.left = `${rect.left}px`;
        box.style.width = `${rect.width}px`;
        box.style.height = `${rect.height}px`;
      }
    }
  }

  /**
   * Checks if an element is actually visible on screen.
   * Accounts for:
   * - `display:none` / `visibility:hidden` on the element or ancestors
   * - `aria-hidden="true"` on the element or any ancestor
   * - Zero‑sized elements
   * - Ancestors with `overflow:hidden/scroll/auto` that clip the element
   * (Does NOT check the viewport – elements off‑screen are still considered visible.)
   *
   * @param {Element} el - The element to test.
   * @returns {boolean} `true` if visible, otherwise `false`.
   */
  isVisible(el) {
    if (!(el instanceof Element)) {
      return false;
    }

    // 1. Element"s own style
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }

    // 2. Zero size
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return false;
    }

    // 3. Ancestor checks (visibility, overflow, aria-hidden)
    let node = el.parentElement;
    while (node && node !== document.documentElement) {
      const parentStyle = window.getComputedStyle(node);
      // Check display/visibility
      if (parentStyle.display === "none" || parentStyle.visibility === "hidden") {
        return false;
      }

      // Check aria-hidden (on this ancestor)
      if (node.getAttribute("aria-hidden") === "true") {
        return false;
      }

      // Check overflow clipping
      const overflow = parentStyle.overflow;
      if (overflow === "hidden" || overflow === "scroll" || overflow === "auto") {
        const parentRect = node.getBoundingClientRect();
        if (!this.#rectsIntersect(rect, parentRect)) {
          return false;
        }
      }

      node = node.parentElement;
    }

    // Also check the element itself for aria-hidden
    if (el.getAttribute("aria-hidden") === "true") {
      return false;
    }

    return true;
  }

  parseValidUrl(url) {
    const ALLOWED_URL_PROTOCOLS = new Set(["http:", "https:"]);

    if (typeof url !== "string") {
      return null;
    }

    const trimmed = url.trim();

    if (trimmed.startsWith("#") ||
      trimmed.startsWith("mailto:") ||
      trimmed.startsWith("javascript:") ||
      trimmed.startsWith("sms:") ||
      trimmed.startsWith("tel:")) {
      return null;
    }

    const base = window.location.origin === "null"
      ? (document.baseURI || window.location.href)
      : window.location.origin;

    let parsed;

    try {
      parsed = trimmed.startsWith("//")
        ? new URL(window.location.protocol + trimmed)
        : new URL(trimmed, base);
    } catch {
      return null;
    }

    if (!ALLOWED_URL_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }

    return parsed;
  }

  /**
   * Private helper: checks if two DOMRect‑like objects intersect.
   * @param {DOMRect} r1
   * @param {DOMRect} r2
   * @returns {boolean}
   */
  #rectsIntersect(r1, r2) {
    return !(r2.left > r1.right ||
      r2.right < r1.left ||
      r2.top > r1.bottom ||
      r2.bottom < r1.top);
  }

  /**
   * Highlights an element by drawing a tracked overlay box over it.
   * @param {Element} element - The DOM element to highlight.
   * @param {string} type - One of: "empty-alt", "external-link", "nofollow-link", "duplicate-link".
   * @param {string} [label] - Optional tooltip text.
   */
  highlight(element, type, label) {
    if (!(element instanceof Element)) {
      return;
    }

    if (!this.tracked.has(element)) {
      this.tracked.set(element, new Map());
    }
    const typeMap = this.tracked.get(element);

    let entry = typeMap.get(type);
    if (!entry) {
      const box = document.createElement("div");
      box.className = "__ps-overlay-box";
      box.setAttribute("data-ps-type", type);
      this.container.appendChild(box);
      entry = { box, labelEl: null };
      typeMap.set(type, entry);
    }

    if (label) {
      if (!entry.labelEl) {
        entry.labelEl = document.createElement("span");
        entry.labelEl.className = "__ps-overlay-label";
        entry.box.appendChild(entry.labelEl);
      }
      entry.labelEl.textContent = label;
    } else if (entry.labelEl) {
      entry.labelEl.remove();
      entry.labelEl = null;
    }

    const rect = element.getBoundingClientRect();
    entry.box.style.top = `${rect.top}px`;
    entry.box.style.left = `${rect.left}px`;
    entry.box.style.width = `${rect.width}px`;
    entry.box.style.height = `${rect.height}px`;

    this.#startLoop();
  }

  /**
   * Removes a highlight from an element.
   */
  remove(element, type) {
    if (!(element instanceof Element)) {
      return;
    }

    const typeMap = this.tracked.get(element);
    if (!typeMap) {
      return;
    }

    const entry = typeMap.get(type);
    if (entry) {
      entry.box.remove();
      typeMap.delete(type);
    }
    if (typeMap.size === 0) {
      this.tracked.delete(element);
    }
  }

  /**
   * Removes all highlights of a given type.
   */
  clear(type) {
    for (const [element, typeMap] of this.tracked) {
      const entry = typeMap.get(type);
      if (entry) {
        entry.box.remove();
        typeMap.delete(type);
      }
      if (typeMap.size === 0) {
        this.tracked.delete(element);
      }
    }
  }

  /**
   * Removes all highlights (all types).
   */
  clearAll() {
    const types = ["empty-alt", "external-link", "nofollow-link", "duplicate-link"];
    for (const type of types) {
      this.clear(type);
    }
  }

  /**
   * Removes the overlay layer and stylesheet entirely.
   * Use this if you want to clean up when the extension is disabled.
   */
  destroy() {
    this.clearAll();

    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;

    if (this.styleElement && this.styleElement.parentNode) {
      this.styleElement.parentNode.removeChild(this.styleElement);
    }
    this.styleElement = null;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.loopRunning = false;
  }
}

// Expose singleton globally (accessible from injected functions)
window.__psOverlay = OverlayManager.getInstance();

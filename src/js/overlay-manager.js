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
 *
 * Performance notes:
 * - Boxes are positioned with `transform: translate()` instead of
 *   `top`/`left`. Changing transform is compositor-only (no layout, no
 *   paint of the rest of the page); changing top/left forces layout.
 * - Every write is dirty-checked against the last-applied rect, so a
 *   static page costs zero style writes per frame, not "every box,
 *   every frame".
 * - Reads (getBoundingClientRect) and writes (style mutations) are done
 *   in two separate passes per tick, so a write can never force a
 *   synchronous layout that the next read in the same tick has to pay for.
 * - The loop pauses while the tab is hidden (visibilitychange) instead
 *   of continuing to poll a backgrounded tab.
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

    // Map<targetElement, { types: Map<type, {box, labelEl}>, lastRect: {top,left,width,height}|null }>
    this.tracked = new Map();

    this.#injectStyles();
    this.#createContainer();

    // Don't burn CPU/battery repositioning boxes in a tab nobody can see.
    // requestAnimationFrame already throttles heavily in background tabs,
    // but skipping the work entirely (rather than just running it slower)
    // is cheaper and avoids any layout reads while hidden.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        this.#startLoop();
      }
    });

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
        top: 0;
        left: 0;
        box-sizing: border-box;
        pointer-events: none;
        will-change: transform;
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
   * itself the moment nothing is tracked anymore, and won"t schedule
   * frames at all while the tab is hidden (resumed by the
   * visibilitychange listener in the constructor).
   */
  #startLoop() {
    if (this.loopRunning || document.hidden) {
      return;
    }
    this.loopRunning = true;

    const tick = () => {
      if (this.tracked.size === 0) {
        this.loopRunning = false;
        this.rafId = null;
        return;
      }

      if (document.hidden) {
        // Stop scheduling until visibilitychange brings us back; avoids
        // paying for reads/writes on every throttled background-tab frame.
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
   *
   * Split into a read pass (getBoundingClientRect for every tracked
   * element) followed by a write pass (style mutations), so a style
   * write earlier in the tick can never force a synchronous layout
   * that a later read in the *same* tick would otherwise pay for.
   */
  #reposition() {
    const toDrop = [];
    const reads = []; // { entry, rect }

    // ---- read phase ----
    for (const [element, entry] of this.tracked) {
      if (!element.isConnected) {
        toDrop.push(element);
        continue;
      }
      reads.push({ entry, rect: element.getBoundingClientRect() });
    }

    for (const element of toDrop) {
      const entry = this.tracked.get(element);
      for (const { box } of entry.types.values()) {
        box.remove();
      }
      this.tracked.delete(element);
    }

    // ---- write phase ----
    for (const { entry, rect } of reads) {
      this.#applyRect(entry, rect);
    }
  }

  /**
   * Writes a rect to every box tracked for one element, but only the
   * boxes/properties that actually changed since the last write —
   * skips the write entirely if nothing moved (the common case on a
   * static page). Position is written via `transform`, which is
   * compositor-only; width/height still require layout for the
   * (isolated, out-of-flow) box element itself, so those are the ones
   * most worth skipping when unchanged.
   *
   * @param {{types: Map, lastRect: object|null}} entry
   * @param {DOMRect} rect
   */
  #applyRect(entry, rect) {
    const last = entry.lastRect;
    const unchanged = last &&
      last.top === rect.top &&
      last.left === rect.left &&
      last.width === rect.width &&
      last.height === rect.height;

    if (unchanged) {
      return;
    }

    const sizeChanged = !last || last.width !== rect.width || last.height !== rect.height;
    const transform = `translate(${rect.left}px, ${rect.top}px)`;

    for (const { box } of entry.types.values()) {
      box.style.transform = transform;

      if (sizeChanged) {
        box.style.width = `${rect.width}px`;
        box.style.height = `${rect.height}px`;
      }
    }

    entry.lastRect = { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
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
   * Uses the native `Element.checkVisibility()` fast path when available
   * (Chrome 105+, Firefox 124+) to reject display:none/visibility:hidden
   * elements without walking the ancestor chain in JS — much cheaper when
   * called in bulk (e.g. checking every image/link on a large page).
   * Falls back to a manual walk on browsers without it, and always does
   * the manual walk for the overflow-clipping check, since
   * checkVisibility() doesn"t cover that.
   *
   * @param {Element} el - The element to test.
   * @returns {boolean} `true` if visible, otherwise `false`.
   */
  isVisible(el) {
    if (!(el instanceof Element)) {
      return false;
    }

    // Fast native path: covers display:none/visibility:hidden on self
    // or any ancestor in one native call instead of N getComputedStyle
    // calls from JS.
    if (typeof el.checkVisibility === "function") {
      if (!el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })) {
        return false;
      }
    } else {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }
    }

    // Zero size
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return false;
    }

    if (el.getAttribute("aria-hidden") === "true") {
      return false;
    }

    // Ancestor checks not covered by checkVisibility(): aria-hidden and
    // overflow-clipping. display/visibility are skipped here when the
    // native fast path already ran, since it already covers the whole
    // ancestor chain for those two properties.
    let node = el.parentElement;
    while (node && node !== document.documentElement) {
      if (node.getAttribute("aria-hidden") === "true") {
        return false;
      }

      const parentStyle = window.getComputedStyle(node);

      if (typeof el.checkVisibility !== "function" &&
        (parentStyle.display === "none" || parentStyle.visibility === "hidden")) {
        return false;
      }

      const overflow = parentStyle.overflow;
      if (overflow === "hidden" || overflow === "scroll" || overflow === "auto") {
        const parentRect = node.getBoundingClientRect();
        if (!this.#rectsIntersect(rect, parentRect)) {
          return false;
        }
      }

      node = node.parentElement;
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
   *
   * Does NOT synchronously read the element's rect (no
   * getBoundingClientRect call here) — the box is created and tracked,
   * and the next rAF tick's batched read/write pass positions it. This
   * matters when highlight() is called in a tight loop over many
   * elements (e.g. every link on a page): reading layout right after
   * inserting a DOM node is exactly the read-after-write pattern that
   * causes forced synchronous layout on every iteration. Deferring the
   * first paint to the next frame costs at most one frame (~16ms) of
   * the box being unpositioned, and turns N forced reflows into a
   * single batched one.
   *
   * @param {Element} element - The DOM element to highlight.
   * @param {string} type - One of: "empty-alt", "external-link", "nofollow-link", "duplicate-link".
   * @param {string} [label] - Optional tooltip text.
   */
  highlight(element, type, label) {
    if (!(element instanceof Element)) {
      return;
    }

    if (!this.tracked.has(element)) {
      this.tracked.set(element, { types: new Map(), lastRect: null });
    }
    const entry = this.tracked.get(element);

    let box_entry = entry.types.get(type);
    if (!box_entry) {
      const box = document.createElement("div");
      box.className = "__ps-overlay-box";
      box.setAttribute("data-ps-type", type);
      this.container.appendChild(box);
      box_entry = { box, labelEl: null };
      entry.types.set(type, box_entry);
      // A newly added type invalidates the "already applied" rect for
      // this element, so the next tick writes to this box even if the
      // element's own rect hasn't moved since other types were placed.
      entry.lastRect = null;
    }

    if (label) {
      if (!box_entry.labelEl) {
        box_entry.labelEl = document.createElement("span");
        box_entry.labelEl.className = "__ps-overlay-label";
        box_entry.box.appendChild(box_entry.labelEl);
      }
      box_entry.labelEl.textContent = label;
    } else if (box_entry.labelEl) {
      box_entry.labelEl.remove();
      box_entry.labelEl = null;
    }

    this.#startLoop();
  }

  /**
   * Removes a highlight from an element.
   */
  remove(element, type) {
    if (!(element instanceof Element)) {
      return;
    }

    const entry = this.tracked.get(element);
    if (!entry) {
      return;
    }

    const box_entry = entry.types.get(type);
    if (box_entry) {
      box_entry.box.remove();
      entry.types.delete(type);
    }
    if (entry.types.size === 0) {
      this.tracked.delete(element);
    }
  }

  /**
   * Removes all highlights of a given type.
   */
  clear(type) {
    for (const [element, entry] of this.tracked) {
      const box_entry = entry.types.get(type);
      if (box_entry) {
        box_entry.box.remove();
        entry.types.delete(type);
      }
      if (entry.types.size === 0) {
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

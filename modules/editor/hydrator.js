/**
 * Vector Expressions — Gutenberg-Native Expression Resolver & Hydration Hook.
 *
 * Resolves expression previews using Gutenberg's entity data store
 * (`wp.data.select('core')`) instead of custom REST calls. This ensures:
 *
 *   - Correct post context in Query Loops (entity records keyed by postId)
 *   - No `protect_global_content` false-positives (handled client-side)
 *   - Zero extra network requests for simple expressions
 *
 * Complex expressions (with filters or meta access) fall back to the REST
 * preview endpoint since those require server-side PHP evaluation.
 *
 * DESIGN NOTE — Query Loop Hybrid:
 *
 * Blocks inside a Query Loop share one template. `setAttributes` updates
 * the template (visible to ALL iterations), so per-iteration previews must
 * be written directly to the DOM via the block's rendered element. For
 * top-level blocks (not in a Query Loop), `setAttributes` is fine because
 * each block has its own independent attributes.
 */

import { fetchPreview } from "./api.js";

const { select } = window.wp.data;

/**
 * Regex that matches a `<span … data-vectex-expr="…" …>` opening tag.
 * Group 1: full tag interior, Group 2: expr value.
 */
const SPAN_TAG_RE = /<span\b([^>]*\bdata-vectex-expr="([^"]*)"[^>]*)>/gi;

// ─── Client-side Expression Resolver ────────────────────────────────────────

const config = window.vectexEditorConfig || {};

/**
 * Build entity-field resolver maps from PHP-localized root data.
 *
 * For each root, maps `property key` → `entity field path`.
 * Properties without an explicit `entity` use 1:1 mapping (key → key).
 *
 * Only includes roots whose properties declare at least one `entity`
 * mapping — roots without entity backing (ACF, MB, WooCommerce, etc.)
 * are skipped so they fall through to the REST preview endpoint.
 *
 * @type {Record<string, Record<string, string>>}
 */
const entityMaps = {};
for (const root of config.roots || []) {
  const props = root.properties || [];
  if (!props.some((p) => p.entity)) continue;

  const map = {};
  for (const prop of props) {
    map[prop.key] = prop.entity || prop.key;
  }
  entityMaps[root.id] = map;
}

/**
 * Build property type maps from PHP-localized root data.
 * @type {Record<string, Record<string, string>>}
 */
const typeMaps = {};
for (const root of config.roots || []) {
  const map = {};
  for (const prop of root.properties || []) {
    if (prop.type) map[prop.key] = prop.type;
  }
  typeMaps[root.id] = map;
}

/**
 * Special-case handlers for entity fields prefixed with `__`.
 * These require custom logic beyond simple field traversal.
 *
 * Return `undefined` to signal "data not available yet" — the
 * expression will fall through to the REST preview endpoint.
 * Return a string (including `""`) to signal a resolved value.
 */
const specialHandlers = {
  /**
   * Post author name — fetches a separate user entity by author ID.
   * Returns `undefined` if the post or user record hasn't loaded yet.
   */
  __author_name: (_record, _prop, postId, postType) => {
    const record = select("core").getEntityRecord("postType", postType, postId);
    if (!record) return undefined;
    if (!record.author) return "";
    const user = select("core").getUser(record.author);
    if (user === undefined) return undefined;
    return user?.name ?? "";
  },

  /**
   * User logged-in state — always true in the editor (you must be logged in).
   */
  __is_logged_in: () => "true",
};

/**
 * Resolve a dotted entity field path from a record object.
 * e.g., "title.raw" → record.title.raw
 *
 * For fields with a `.raw` suffix, falls back to `.rendered` if `.raw` is empty.
 *
 * @param {Object} record Entity record object.
 * @param {string} entityField Dotted field path (e.g., "title.raw").
 * @returns {string} Resolved value or empty string.
 */
const resolveField = (record, entityField) => {
  const parts = entityField.split(".");
  let val = record;
  for (const p of parts) {
    val = val?.[p];
  }

  // For `.raw` fields, try `.rendered` as fallback.
  if (val == null && parts.length === 2 && parts[1] === "raw") {
    val = record?.[parts[0]]?.rendered;
  }

  if (val == null) return "";
  if (Array.isArray(val)) return val.join(", ");
  return String(val);
};

/**
 * Attempt to resolve an expression purely from Gutenberg's entity store.
 *
 * @param {string} expr         Raw expression (e.g. "post.title").
 * @param {number} postId       The target post's ID.
 * @param {string} postType     The target post's type slug.
 * @param {number} editorPostId The ID of the post being edited (for fractal protection).
 * @returns {{ value: string, resolved: boolean }}
 */
const resolveFromStore = (expr, postId, postType, editorPostId) => {
  const fail = { value: "", resolved: false };

  // Only handle simple `root.property` expressions — anything with pipes
  // (filters), nested dots (meta), or function calls needs the PHP engine.
  const parts = expr.trim().split(".");
  if (parts.length !== 2) return fail;

  const [root, prop] = parts;
  if (expr.includes("|") || expr.includes("(")) return fail;

  // Must be a known root with an entity map.
  const fieldMap = entityMaps[root];
  if (!fieldMap) return fail;

  const entityField = fieldMap[prop];
  if (!entityField) return fail;

  // Special-case handler (prefixed with `__`).
  if (entityField.startsWith("__")) {
    const handler = specialHandlers[entityField];
    if (!handler) return fail;
    const value = handler(null, prop, postId, postType);
    if (value === undefined) return fail;
    return { value, resolved: true };
  }

  // Fractal protection: html-type fields only for the editor post.
  const propType = typeMaps[root]?.[prop];
  if (propType === "html" && postId === editorPostId) {
    return { value: "", resolved: true };
  }

  // Resolve from entity store based on root type.
  let record;
  if (root === "site") {
    record = select("core").getEntityRecord("root", "site");
  } else if (root === "user") {
    // `user` is intentionally skipped for store resolution — getCurrentUser()
    // is a one-shot select() call that may return undefined on first render.
    // Delegating to fetchPreview avoids the race condition.
    return fail;
  } else {
    // Default: treat as a post-type entity.
    if (!postId || !postType) return fail;
    record = select("core").getEntityRecord("postType", postType, postId);
  }

  if (!record) return fail;

  let value = resolveField(record, entityField);

  // Date fields: strip the T separator for readability.
  if (propType === "date" && value.includes("T")) {
    value = value.replace("T", " ");
  }

  return { value, resolved: true };
};

// ─── Utilities ──────────────────────────────────────────────────────────────

const stripHtml = (html) => {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent ?? "";
};

/**
 * Strip HTML tags and decode entities for preview-safe plain text.
 *
 * Preview values are rendered via CSS `content: attr(data-vectex-view)`,
 * which treats its input as plain text. This ensures any residual
 * HTML (e.g. WooCommerce price markup) is converted to readable text.
 *
 * @param {string} val Raw preview value.
 * @returns {string} Plain-text preview.
 */
const cleanPreview = (val) => {
  if (!val) return val;
  const text = stripHtml(val);
  const el = document.createElement("textarea");
  el.innerHTML = text;
  return el.value;
};

/**
 * Decode HTML entities in an attribute value captured from raw HTML.
 *
 * Expression attributes are stored as `data-vectex-expr="&quot;now&quot;"`
 * in the HTML string. The regex captures `&quot;now&quot;` literally,
 * but the parser and REST API expect the decoded form `"now"`.
 *
 * @param {string} raw Attribute value with possible HTML entities.
 * @returns {string} Decoded string.
 */
const decodeAttr = (raw) => {
  if (!raw || !raw.includes("&")) return raw;
  const el = document.createElement("textarea");
  el.innerHTML = raw;
  return el.value;
};

const formatDate = (iso) => {
  if (!iso) return "";
  // WordPress stores dates in the site's local timezone WITHOUT an offset
  // indicator.  `new Date(iso)` would interpret the string as UTC, then
  // `toLocaleDateString` converts to the browser's local timezone — causing
  // off-by-one-day errors when the two timezones differ.
  // Parse the Y-M-D components directly to avoid any conversion.
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return iso;
  const [, year, month, day] = match;
  const date = new Date(+year, +month - 1, +day);
  try {
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
};

// ─── View Cache ─────────────────────────────────────────────────────────────

/** @type {Map<string, string>} key: `${expr}::${postId}` → preview string. */
const viewCache = new Map();
const cacheKey = (expr, postId) => `${expr}::${postId}`;

/**
 * Look up a cached preview value for an expression + postId.
 * Used by `convertTokens` and `applyUpdate` to embed the view in format
 * data so it survives React re-renders (click, apply, selection change).
 *
 * @param {string} expr   Expression without curly braces.
 * @param {number} postId The post context ID.
 * @returns {string|undefined} Cached preview, or undefined if not cached.
 */
export const getCachedView = (expr, postId) =>
  viewCache.get(cacheKey(expr, postId));

// ─── React Hook ─────────────────────────────────────────────────────────────

/**
 * React hook — hydrates expression tokens in a block's rich-text content.
 *
 * Uses Gutenberg's entity store for simple expressions and falls back to
 * the REST endpoint for complex expressions (with filters/meta).
 *
 * For blocks inside a Query Loop (where `postId !== editorPostId`), previews
 * are written directly to the DOM because `setAttributes` would update the
 * shared template, overwriting all iterations with the last one's values.
 *
 * @param {Object}      attributes    Block's current attributes.
 * @param {Function}    setAttributes Block's attribute setter.
 * @param {string|null} attrName      Name of the rich-text attribute.
 * @param {string}      blockName     Block type slug.
 * @param {number}      postId        Post ID for expression context.
 * @param {string}      postType      Post type slug for entity lookup.
 * @param {string}      clientId      Block instance's client ID.
 */
export const useHydrateViews = (
  attributes,
  setAttributes,
  attrName,
  blockName,
  postId,
  postType,
  clientId,
) => {
  const { useEffect, useRef } = window.wp.element;

  const lastWritten = useRef("");

  useEffect(() => {
    if (!attrName) return;

    const raw = attributes[attrName];
    const html = typeof raw === "string" ? raw : String(raw ?? "");
    if (!html.includes("vectex-expr-token")) return;

    const editorPostId = select("core/editor")?.getCurrentPostId?.() || 0;
    const isQueryChild = postId !== editorPostId;

    // For top-level blocks: skip if we just wrote this HTML ourselves.
    if (!isQueryChild && html === lastWritten.current) return;

    // Resolve all expressions (cache or entity store).
    const toFetch = new Set();
    let needsUpdate = false;

    html.replace(SPAN_TAG_RE, (_match, tagInner, rawExpr) => {
      if (!rawExpr) return;
      // Skip spans that already have a non-empty view (already hydrated).
      // Empty views (data-vectex-view="") must be re-hydrated.
      const existingView = tagInner.match(/\bdata-vectex-view="([^"]*)"/)?.[1];
      if (existingView && !isQueryChild) return;

      const expr = decodeAttr(rawExpr);
      const key = cacheKey(expr, postId);
      if (!viewCache.has(key)) {
        const result = resolveFromStore(
          expr,
          postId,
          postType || "post",
          editorPostId,
        );
        if (result.resolved) {
          viewCache.set(key, result.value);
          needsUpdate = true;
        } else {
          toFetch.add(expr);
        }
      } else {
        needsUpdate = true;
      }
    });

    if (!needsUpdate && toFetch.size === 0) return;

    // Apply immediately if all resolved.
    if (toFetch.size === 0) {
      if (isQueryChild) {
        applyViewsDOM(postId, clientId);
      } else {
        applyViewsAttr(html, postId, attrName, setAttributes, lastWritten);
      }
      return;
    }

    // Fetch remaining expressions via REST.
    Promise.all(
      [...toFetch].map((expr) =>
        fetchPreview(expr, postId).then((r) => ({
          expr,
          preview: r?.preview ?? "",
        })),
      ),
    ).then((results) => {
      results.forEach(({ expr, preview }) => {
        viewCache.set(cacheKey(expr, postId), preview);
      });

      if (isQueryChild) {
        applyViewsDOM(postId, clientId);
      } else {
        applyViewsAttr(html, postId, attrName, setAttributes, lastWritten);
      }
    });
  }, [attributes[attrName], postId]);

  // For Query Loop blocks: re-apply cached views after EVERY render.
  // React re-renders destroy DOM-only attributes (data-vectex-view) on click,
  // selection change, or modal apply. This effect runs with no deps so it
  // fires after each reconciliation and re-stamps the cached values.
  // It only writes to DOM attributes — no state changes — so it cannot
  // trigger further re-renders.
  useEffect(() => {
    if (!attrName) return;
    const editorPostId = select("core/editor")?.getCurrentPostId?.() || 0;
    if (postId === editorPostId) return;

    const id = requestAnimationFrame(() => applyViewsDOM(postId, clientId));
    return () => cancelAnimationFrame(id);
  });
};

// ─── Attribute-based hydration (top-level blocks) ───────────────────────────

/**
 * Inject `data-vectex-view` into the HTML string and write back via setAttributes.
 * Used for blocks NOT inside a Query Loop (each has its own attributes).
 */
const applyViewsAttr = (html, postId, attrName, setAttributes, lastWritten) => {
  const updated = html.replace(SPAN_TAG_RE, (fullMatch, tagInner, rawExpr) => {
    if (!rawExpr) return fullMatch;
    // Skip spans that already have a non-empty view.
    const existingView = tagInner.match(/\bdata-vectex-view="([^"]*)"/)?.[1];
    if (existingView) return fullMatch;

    const expr = decodeAttr(rawExpr);
    const view = viewCache.get(cacheKey(expr, postId));
    if (view === undefined) return fullMatch;

    const cleaned = cleanPreview(view);
    const safeView = cleaned.replace(/"/g, "&quot;");
    const isEmpty = !cleaned.trim().replace(/\u00a0/g, "");
    const emptyAttr = isEmpty ? ' data-vectex-empty=""' : "";

    return fullMatch.replace(
      tagInner,
      tagInner + ` data-vectex-view="${safeView}"${emptyAttr}`,
    );
  });

  if (updated !== html) {
    lastWritten.current = updated;
    setAttributes({ [attrName]: updated });
  }
};

// ─── DOM-based hydration (Query Loop blocks) ────────────────────────────────

/**
 * Write `data-vectex-view` directly to DOM elements for a specific block instance.
 * Used for blocks inside Query Loops where setAttributes would clobber other
 * iterations' values (since all iterations share one template).
 *
 * Query Loop iterations share the same clientId — we scope by the
 * `.post-{postId}` wrapper that `core/post-template` renders for each
 * iteration instead.
 */
const applyViewsDOM = (postId, clientId) => {
  const root = getEditorRoot();
  if (!root) return;

  // Query Loop iterations are wrapped in `li.wp-block-post.post-{postId}`.
  const postWrapper = root.querySelector(`.post-${postId}`);
  const scope =
    postWrapper || root.querySelector(`[data-block="${clientId}"]`) || root;

  const spans = scope.querySelectorAll("span.vectex-expr-token");
  spans.forEach((span) => {
    const expr = span.getAttribute("data-vectex-expr");
    if (!expr) return;

    const view = viewCache.get(cacheKey(expr, postId));
    if (view === undefined) return;

    const cleaned = cleanPreview(view);
    span.setAttribute("data-vectex-view", cleaned);
    const isEmpty = !cleaned.trim().replace(/\u00a0/g, "");
    if (isEmpty) {
      span.setAttribute("data-vectex-empty", "");
    } else {
      span.removeAttribute("data-vectex-empty");
    }
  });
};

/** Get the editor's root element (iframe or direct-DOM). */
const getEditorRoot = () => {
  const iframe = document.querySelector('iframe[name="editor-canvas"]');
  if (iframe?.contentDocument?.body) return iframe.contentDocument.body;
  return document.querySelector(".editor-styles-wrapper") || null;
};

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
 * Regex that matches a `<span … data-ve-expr="…" …>` opening tag.
 * Group 1: full tag interior, Group 2: expr value.
 */
const SPAN_TAG_RE = /<span\b([^>]*\bdata-ve-expr="([^"]*)"[^>]*)>/gi;

// ─── Client-side Expression Resolver ────────────────────────────────────────

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

  switch (root) {
    case "post":
      return resolvePost(prop, postId, postType, editorPostId);
    case "user":
      return resolveUser(prop);
    case "site":
      return resolveSite(prop);
    default:
      return fail;
  }
};

/** Resolve a `post.*` expression from the entity store. */
const resolvePost = (prop, postId, postType, editorPostId) => {
  const fail = { value: "", resolved: false };
  if (!postId || !postType) return fail;

  const record = select("core").getEntityRecord("postType", postType, postId);
  if (!record) return fail;

  // Fractal protection: block content/excerpt only for the editor post.
  if ((prop === "content" || prop === "excerpt") && postId === editorPostId) {
    return { value: "", resolved: true };
  }

  const map = {
    title: () => record.title?.rendered ?? record.title?.raw ?? "",
    excerpt: () =>
      stripHtml(record.excerpt?.rendered ?? record.excerpt?.raw ?? ""),
    content: () =>
      stripHtml(record.content?.rendered ?? record.content?.raw ?? ""),
    date: () => (record.date ?? "").replace("T", " "),
    status: () => record.status ?? "",
    slug: () => record.slug ?? "",
    id: () => String(record.id ?? ""),
    type: () => record.type ?? "",
    url: () => record.link ?? "",
    author_name: () => {
      const authorId = record.author;
      if (!authorId) return "";
      const user = select("core").getUser(authorId);
      return user?.name ?? "";
    },
  };

  const getter = map[prop];
  if (!getter) return fail;
  return { value: getter(), resolved: true };
};

/** Resolve a `user.*` expression from the current user. */
const resolveUser = (prop) => {
  const fail = { value: "", resolved: false };
  const user = select("core").getCurrentUser();
  if (!user) return fail;

  const map = {
    name: () => user.name ?? "",
    email: () => user.email ?? "",
    id: () => String(user.id ?? ""),
    login: () => user.slug ?? user.username ?? "",
    url: () => user.url ?? user.link ?? "",
    is_logged_in: () => "true",
    roles: () => (user.roles ?? []).join(", "),
  };

  const getter = map[prop];
  if (!getter) return fail;
  return { value: getter(), resolved: true };
};

/** Resolve a `site.*` expression from the site entity. */
const resolveSite = (prop) => {
  const fail = { value: "", resolved: false };
  const site = select("core").getEntityRecord("root", "site");
  if (!site) return fail;

  const map = {
    name: () => site.title ?? "",
    description: () => site.description ?? "",
    url: () => site.url ?? "",
    language: () => site.language ?? "",
  };

  const getter = map[prop];
  if (!getter) return fail;
  return { value: getter(), resolved: true };
};

// ─── Utilities ──────────────────────────────────────────────────────────────

const stripHtml = (html) => {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent ?? "";
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
    if (!html.includes("ve-expr-token")) return;

    const editorPostId = select("core/editor")?.getCurrentPostId?.() || 0;
    const isQueryChild = postId !== editorPostId;

    // For top-level blocks: skip if we just wrote this HTML ourselves.
    if (!isQueryChild && html === lastWritten.current) return;

    // Resolve all expressions (cache or entity store).
    const toFetch = new Set();
    let needsUpdate = false;

    html.replace(SPAN_TAG_RE, (_match, tagInner, expr) => {
      if (!expr) return;
      if (/\bdata-ve-view="/.test(tagInner) && !isQueryChild) return;

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
    let cancelled = false;

    Promise.all(
      [...toFetch].map((expr) =>
        fetchPreview(expr, postId).then((r) => ({
          expr,
          preview: r?.preview ?? "",
        })),
      ),
    ).then((results) => {
      if (cancelled) return;
      results.forEach(({ expr, preview }) => {
        viewCache.set(cacheKey(expr, postId), preview);
      });

      if (isQueryChild) {
        applyViewsDOM(postId, clientId);
      } else {
        applyViewsAttr(html, postId, attrName, setAttributes, lastWritten);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [attributes[attrName], postId]);

  // For Query Loop blocks: re-apply cached views after EVERY render.
  // React re-renders destroy DOM-only attributes (data-ve-view) on click,
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
 * Inject `data-ve-view` into the HTML string and write back via setAttributes.
 * Used for blocks NOT inside a Query Loop (each has its own attributes).
 */
const applyViewsAttr = (html, postId, attrName, setAttributes, lastWritten) => {
  const updated = html.replace(SPAN_TAG_RE, (fullMatch, tagInner, expr) => {
    if (!expr) return fullMatch;
    if (/\bdata-ve-view="/.test(tagInner)) return fullMatch;

    const view = viewCache.get(cacheKey(expr, postId));
    if (view === undefined) return fullMatch;

    const safeView = view.replace(/"/g, "&quot;");
    const isEmpty = !view.trim().replace(/\u00a0/g, "");
    const emptyAttr = isEmpty ? ' data-ve-empty=""' : "";

    return fullMatch.replace(
      tagInner,
      tagInner + ` data-ve-view="${safeView}"${emptyAttr}`,
    );
  });

  if (updated !== html) {
    lastWritten.current = updated;
    setAttributes({ [attrName]: updated });
  }
};

// ─── DOM-based hydration (Query Loop blocks) ────────────────────────────────

/**
 * Write `data-ve-view` directly to DOM elements for a specific block instance.
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

  const spans = scope.querySelectorAll("span.ve-expr-token");
  spans.forEach((span) => {
    const expr = span.getAttribute("data-ve-expr");
    if (!expr) return;

    const view = viewCache.get(cacheKey(expr, postId));
    if (view === undefined) return;

    span.setAttribute("data-ve-view", view);
    const isEmpty = !view.trim().replace(/\u00a0/g, "");
    if (isEmpty) {
      span.setAttribute("data-ve-empty", "");
    } else {
      span.removeAttribute("data-ve-empty");
    }
  });
};

/** Get the editor's root element (iframe or direct-DOM). */
const getEditorRoot = () => {
  const iframe = document.querySelector('iframe[name="editor-canvas"]');
  if (iframe?.contentDocument?.body) return iframe.contentDocument.body;
  return document.querySelector(".editor-styles-wrapper") || null;
};

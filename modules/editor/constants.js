/**
 * Vector Expressions — Shared editor constants.
 *
 * Derives editor completions and root definitions from PHP-localized data
 * (`window.vectarrEditorConfig`) so PHP remains the single source of truth.
 *
 * Falls back to minimal static definitions when localized data is unavailable
 * (e.g. in unit test environments).
 */

const ctx = window.vectarrContext || {};
const config = window.vectarrEditorConfig || {};

// ── Icons (from PHP) ──────────────────────────────────────────────────────────

const icons = config.icons || {};

/**
 * Category-to-icon map derived from localized PHP data.
 * ALL icons come from PHP — zero hardcoded SVGs in JS.
 */
export const CATEGORY_ICONS = Object.fromEntries([
  ...(config.roots || []).map((r) => [r.label, r.icon || icons.modifier || ""]),
  ["Pattern", icons.pattern || ""],
  ["Modifier", icons.modifier || ""],
]);

// ── Roots (derived from PHP) ─────────────────────────────────────────────────

/** Build sidebar root definitions from localized PHP data. */
const buildRoots = () => {
  const roots = (config.roots || []).map((r) => ({
    label: r.label,
    description: r.description,
    icon: r.icon || icons.modifier || "",
    prefix: r.id,
    group: r.group || "",
    accent: r.accent || "",
  }));

  // Always include a Patterns pseudo-root for the sidebar.
  roots.push({
    label: "Patterns",
    description: "Ready-made expressions for common tasks",
    icon: icons.pattern || "",
    prefix: "_pattern",
  });

  return roots;
};

export const VE_ROOTS = buildRoots();

/**
 * Retrieves the current roots list, allowing extensions to add their own
 * via the `vectorExpressions.suggestions.roots` JS filter.
 */
export const getRoots = () => {
  return window.wp?.hooks?.applyFilters
    ? window.wp.hooks.applyFilters(
        "vectorExpressions.suggestions.roots",
        VE_ROOTS,
      )
    : VE_ROOTS;
};

// ── Completions (derived from PHP) ───────────────────────────────────────────

/**
 * @typedef  {Object} VeCompletion
 * @property {string} label    Human-readable label shown in the dropdown.
 * @property {string} expr     The expression inserted into the editor.
 * @property {string} preview  Live-data preview shown next to the expression.
 * @property {string} category Section header (User | Post | Site | Modifier | Pattern).
 * @property {string} prefix   Leading token for contextual filtering (e.g. 'user', 'post', '|', '').
 */

/** Resolve a live-data preview for a root property expression. */
const resolvePreview = (rootId, key) => {
  const rootData = ctx[rootId];
  if (!rootData) return "";
  const val = rootData[key];
  if (val == null) return "";
  if (Array.isArray(val)) return val.join(", ");
  if (typeof val === "boolean") return val ? "true" : "false";
  return String(val);
};

/** Build the full completions list from localized PHP data. */
const buildCompletions = () => {
  /** @type {VeCompletion[]} */
  const completions = [];

  // Root properties → completions.
  for (const root of config.roots || []) {
    const label = root.label;
    const prefix = root.id;
    const category = label;

    for (const prop of root.properties || []) {
      const expr = prop.expr || `${prefix}.${prop.key}`;
      completions.push({
        label: `${label}: ${prop.label}`,
        expr,
        preview: resolvePreview(prefix, prop.key),
        category,
        prefix,
      });
    }
  }

  // Modifiers → completions.
  for (const mod of config.modifiers || []) {
    const cat = mod.category || "Modifier";
    completions.push({
      label: `${cat}: ${mod.name}`,
      expr: mod.usage || `| ${mod.name}`,
      preview: "",
      category: cat,
      group: mod.group || "",
      prefix: "|",
    });
  }

  // Patterns → completions.
  for (const pat of config.patterns || []) {
    completions.push({
      label: `Pattern: ${pat.label}`,
      expr: pat.expr,
      preview: "",
      category: "Pattern",
      prefix: "",
    });
  }

  return completions;
};

/** @type {VeCompletion[]} */
export const VE_COMPLETIONS = buildCompletions();

/**
 * Retrieves the full list of completions, allowing third-party devs to inject
 * their own via the Gutenberg JavaScript filter API at runtime.
 *
 * Deduplicates by `expr` to prevent multiple sources (PHP config, JS filters)
 * from creating duplicate entries.
 */
export const getCompletions = () => {
  const raw = window.wp?.hooks?.applyFilters
    ? window.wp.hooks.applyFilters(
        "vector_expressions.editor.completions",
        VE_COMPLETIONS,
      )
    : VE_COMPLETIONS;

  // Deduplicate — first occurrence wins (preserves original source order).
  const seen = new Set();
  return raw.filter((c) => {
    if (seen.has(c.expr)) return false;
    seen.add(c.expr);
    return true;
  });
};

// ── Block-type denylist ────────────────────────────────────────────────────────

/**
 * Block types whose {{ }} syntax must never be converted to expression pills.
 */
export const SKIP_CONVERT_BLOCKS = new Set([
  "core/code",
  "core/freeform",
  "core/preformatted",
  "core/html",
  "core/shortcode",
  "core/verse",
]);

// ── Shared regex ──────────────────────────────────────────────────────────────

/**
 * Matches:
 *   Group 1 — An already-converted <span class="vectarr-expr-token"> element (skip).
 *   Group 2 — A <code> or <pre> block (skip).
 *   Group 3 — A bare {{ expr }} template tag (convert).
 *   Group 4 — The expression inside the {{ }} (capture group within 3).
 */
export const TOKEN_REGEX =
  /(<span\b[^>]*\bclass="vectarr-expr-token"[^>]*>[\s\S]*?<\/span>)|(<(?:code|pre)\b[^>]*>[\s\S]*?<\/(?:code|pre)>)|(\{\{\s*([^{}]+?)\s*\}\})/gi;

/** Milliseconds to wait before auto-focusing the popover expression input. */
export const POPOVER_FOCUS_DELAY = 50;

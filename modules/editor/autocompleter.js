/**
 * Vector Expressions — Autocomplete registration.
 *
 * Registers the {{ trigger prefix completer via the
 * `editor.Autocomplete.completers` filter.
 *
 * Contextual filtering:
 *   Empty query        → curated top-pick completions (most-used expressions)
 *   Starts with "post" → post.* completions
 *   Starts with "user" → user.* completions
 *   Starts with "site" → site.* completions
 *   Contains "|"       → filter completions only
 *   Otherwise          → label/expr substring search across full list
 *
 * NOTE: Root-card "drill-down" is intentionally NOT implemented here.
 * Gutenberg always closes the dropdown after any selection, so drill-down
 * roots are a confusing dead-end. Drill-down lives in the expression
 * popover chips (ExpressionSuggestions) where it works correctly.
 */

import {
  getCompletions,
  ICON_POST,
  ICON_USER,
  ICON_SITE,
  ICON_PATTERN,
  ICON_FILTER,
} from "./constants.js";

const { addFilter } = window.wp.hooks;
const { createElement: el, RawHTML } = window.wp.element;

// ── Top-pick curated list (shown when query is empty) ─────────────────────────

/** Expressions indices chosen for breadth and frequency of use. */
const TOP_PICK_EXPRS = new Set([
  "post.title",
  "post.date | date",
  "post.author_name",
  "post.meta.my_key",
  "user.name",
  "user.is_logged_in",
  "user.role",
  "site.name",
  "user.is_logged_in ? 'Hello, ' + user.name : 'Hello, Guest'",
  "user.name | default:'Guest'",
]);

const getOptions = (query) => {
  const completions = getCompletions();
  const q = (query ?? "").trim().toLowerCase();

  if (q === "") {
    return completions.filter((o) => TOP_PICK_EXPRS.has(o.expr));
  }

  if (q.includes("|")) {
    return completions.filter((o) => o.prefix === "|");
  }

  // Root prefix match → domain-specific completions.
  if (q.startsWith("post"))
    return completions.filter((o) => o.prefix === "post");
  if (q.startsWith("user"))
    return completions.filter((o) => o.prefix === "user");
  if (q.startsWith("site"))
    return completions.filter((o) => o.prefix === "site");

  // Substring fallback across full list.
  return completions.filter(
    (o) =>
      o.label.toLowerCase().includes(q) || o.expr.toLowerCase().includes(q),
  );
};

// ── Option renderer ───────────────────────────────────────────────────────────

/**
 * Render a dropdown row: [icon] [label] ... [expr chip]
 *
 * @param {VeCompletion} o
 * @returns {JSX.Element}
 */
const renderOption = (o) => {
  // Map category to a predefined SVG icon string
  let iconSvg = ICON_FILTER;

  if (o.category === "Post") {
    iconSvg = ICON_POST;
  } else if (o.category === "User") {
    iconSvg = ICON_USER;
  } else if (o.category === "Site") {
    iconSvg = ICON_SITE;
  } else if (o.category === "Pattern") {
    iconSvg = ICON_PATTERN;
  }

  return el(
    "div",
    {
      className: "ve-autocompleter-option",
      style: { padding: "0", width: "100%", flexWrap: "nowrap", gap: "8px" },
    },
    el(
      "span",
      {
        className: "ve-ac-icon",
        style: { display: "inline-flex", flexShrink: 0, color: "#757575" },
      },
      el(RawHTML, null, iconSvg),
    ),
    el(
      "div",
      {
        style: {
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          flexShrink: 0,
          maxWidth: "140px",
          fontWeight: 500,
          fontSize: "12px",
          color: "#1e1e1e",
        },
      },
      o.label,
    ),
    el(
      "code",
      {
        style: {
          marginLeft: "auto",
          color: "#757575",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          flexShrink: 1,
          fontFamily: "ui-monospace, 'SFMono-Regular', Consolas, monospace",
          fontSize: "11px",
          background: "transparent",
          padding: 0,
        },
      },
      o.expr,
    ),
  );
};

// ── Completer config ──────────────────────────────────────────────────────────

const buildCompleter = () => ({
  name: "vector-expressions",
  triggerPrefix: "{{",
  options: getOptions,

  getOptionKeywords: (o) => [o.label, o.expr, o.category],
  getOptionLabel: renderOption,

  /**
   * Wrap the expression in `{{ … }} ` template syntax.
   * The trailing space gives the cursor a landing spot and prevents the
   * autocomplete from consuming the next keypress.
   *
   * @param {VeCompletion} o
   * @returns {string}
   */
  getOptionCompletion: (o) => "{{ " + o.expr + " }} ",
});

// ── Registration ──────────────────────────────────────────────────────────────

export const registerAutocompleter = () => {
  addFilter(
    "editor.Autocomplete.completers",
    "vector-expressions/autocompleter",
    (completers) => [...completers, buildCompleter()],
  );
};

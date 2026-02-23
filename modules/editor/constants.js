/**
 * Vector Expressions — Shared editor constants.
 *
 * Keep domain values here so they are defined once and imported everywhere
 * rather than re-created on every render or repeated inline.
 */

const ctx = window.veContext || {};

// Brand-colored SVG icon strings used by root chips.
const ICON_POST = `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M4 2h9l4 4v13a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1zm9 0v4h4" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>
  <path stroke="white" d="M6 9h8M6 12h8M6 15h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

const ICON_USER = `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="10" cy="6" r="4" stroke="currentColor" stroke-width="1.75"/>
  <path d="M2 18c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
</svg>`;

const ICON_SITE = `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.75"/>
  <path d="M10 2C7 5 7 15 10 18M10 2c3 3 3 13 0 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <path stroke="white" d="M2 10h16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

const ICON_PATTERN = `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M3 5h14M3 10h8M3 15h5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
  <circle stroke="white" cx="13.5" cy="14.5" r="4" stroke="currentColor" stroke-width="1.5"/>
  <path stroke="green" d="M17 13l-3 3-1.5-1.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const ICON_FILTER = `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M4 4h12l-4.5 5.5v6.5l-3 2v-8.5l-4.5-5.5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

export { ICON_POST, ICON_USER, ICON_SITE, ICON_PATTERN, ICON_FILTER };

export const VE_ROOTS = [
  {
    label: "Post",
    description: "Current post data — title, date, meta…",
    icon: ICON_POST,
    prefix: "post",
  },
  {
    label: "User",
    description: "Logged-in user — name, email, role…",
    icon: ICON_USER,
    prefix: "user",
  },
  {
    label: "Site",
    description: "Site-wide settings — name, URL, language…",
    icon: ICON_SITE,
    prefix: "site",
  },
  {
    label: "Patterns",
    description: "Ready-made expressions for common tasks",
    icon: ICON_PATTERN,
    prefix: "_pattern",
  },
];

// ── Flat completion list ───────────────────────────────────────────────────────

/**
 * @typedef  {Object} VeCompletion
 * @property {string} label    Human-readable label shown in the dropdown.
 * @property {string} expr     The expression inserted into the editor.
 * @property {string} preview  Live-data preview shown next to the expression.
 * @property {string} category Section header (User | Post | Site | Modifier | Pattern).
 * @property {string} prefix   Leading token for contextual filtering (e.g. 'user', 'post', '|', '').
 */

/** @type {VeCompletion[]} */
export const VE_COMPLETIONS = [
  // ── User ──────────────────────────────────────────────────────────────────

  {
    label: "User: Display Name",
    expr: "user.name",
    preview: ctx.user?.name || "Guest",
    category: "User",
    prefix: "user",
  },
  {
    label: "User: Email",
    expr: "user.email",
    preview: ctx.user?.email || "",
    category: "User",
    prefix: "user",
  },
  {
    label: "User: Username",
    expr: "user.login",
    preview: ctx.user?.login || "",
    category: "User",
    prefix: "user",
  },
  {
    label: "User: ID",
    expr: "user.id",
    preview: ctx.user?.id ? String(ctx.user.id) : "1",
    category: "User",
    prefix: "user",
  },
  {
    label: "User: Role(s)",
    expr: "user.roles | join ', '",
    preview: ctx.user?.roles?.join(", ") || "subscriber",
    category: "User",
    prefix: "user",
  },
  {
    label: "User: Logged In?",
    expr: "user.is_logged_in",
    preview: ctx.user?.is_logged_in ? "true" : "false",
    category: "User",
    prefix: "user",
  },
  {
    label: "User: Profile URL",
    expr: "user.url",
    preview: ctx.user?.url || "",
    category: "User",
    prefix: "user",
  },
  {
    label: "User: Registered Date",
    expr: "user.registered",
    preview: ctx.user?.registered || "",
    category: "User",
    prefix: "user",
  },
  {
    label: "User: Meta Value",
    expr: "user.meta.my_key",
    preview: "",
    category: "User",
    prefix: "user",
  },

  // ── Post ──────────────────────────────────────────────────────────────────

  {
    label: "Post: Title",
    expr: "post.title",
    preview: "This is my title",
    category: "Post",
    prefix: "post",
  },
  {
    label: "Post: Excerpt",
    expr: "post.excerpt",
    preview: "This is my excerpt",
    category: "Post",
    prefix: "post",
  },
  {
    label: "Post: Content",
    expr: "post.content",
    preview: ctx.post?.content || "",
    category: "Post",
    prefix: "post",
  },
  {
    label: "Post: ID",
    expr: "post.id",
    preview: ctx.post?.id ? String(ctx.post.id) : "1",
    category: "Post",
    prefix: "post",
  },
  {
    label: "Post: Slug",
    expr: "post.slug",
    preview: ctx.post?.slug || "my-post",
    category: "Post",
    prefix: "post",
  },
  {
    label: "Post: Status",
    expr: "post.status",
    preview: ctx.post?.status || "publish",
    category: "Post",
    prefix: "post",
  },
  {
    label: "Post: Type",
    expr: "post.type",
    preview: ctx.post?.type || "post",
    category: "Post",
    prefix: "post",
  },
  {
    label: "Post: Published Date",
    expr: "post.date | date",
    preview: ctx.post?.date || "January 1, 2024",
    category: "Post",
    prefix: "post",
  },
  {
    label: "Post: Date (formatted)",
    expr: "post.date | date 'Y-m-d'",
    preview: "2024-01-01",
    category: "Post",
    prefix: "post",
  },
  {
    label: "Post: Author Name",
    expr: "post.author_name",
    preview: ctx.post?.author_name || "Author",
    category: "Post",
    prefix: "post",
  },
  {
    label: "Post: Author ID",
    expr: "post.author",
    preview: "",
    category: "Post",
    prefix: "post",
  },
  {
    label: "Post: URL",
    expr: "post.url",
    preview: ctx.post?.url || "",
    category: "Post",
    prefix: "post",
  },
  {
    label: "Post: Meta Value",
    expr: "post.meta.my_key",
    preview: "",
    category: "Post",
    prefix: "post",
  },

  // ── Site ──────────────────────────────────────────────────────────────────

  {
    label: "Site: Name",
    expr: "site.name",
    preview: ctx.site?.name || "My Site",
    category: "Site",
    prefix: "site",
  },
  {
    label: "Site: Tagline",
    expr: "site.description",
    preview: ctx.site?.description || "",
    category: "Site",
    prefix: "site",
  },
  {
    label: "Site: URL",
    expr: "site.url",
    preview: ctx.site?.url || "",
    category: "Site",
    prefix: "site",
  },
  {
    label: "Site: Language",
    expr: "site.language",
    preview: ctx.site?.language || "en-US",
    category: "Site",
    prefix: "site",
  },

  // ── Modifiers ───────────────────────────────────────────────────────────────

  {
    label: "Modifier: Render dynamic",
    expr: "| render",
    preview: "",
    category: "Modifier",
    prefix: "|",
  },

  {
    label: "Modifier: Uppercase",
    expr: "| upper",
    preview: "GUEST",
    category: "Modifier",
    prefix: "|",
  },
  {
    label: "Modifier: Lowercase",
    expr: "| lower",
    preview: "guest",
    category: "Modifier",
    prefix: "|",
  },
  {
    label: "Modifier: Default value",
    expr: "| default 'Guest'",
    preview: "Guest",
    category: "Modifier",
    prefix: "|",
  },
  {
    label: "Modifier: If / Else",
    expr: "| if then='Welcome' else='Log in'",
    preview: "Welcome",
    category: "Modifier",
    prefix: "|",
  },
  {
    label: "Modifier: Match value",
    expr: "| match publish='Live' draft='Draft' default='Other'",
    preview: "Live",
    category: "Modifier",
    prefix: "|",
  },
  {
    label: "Modifier: Join array",
    expr: "| join ', '",
    preview: "News, Updates",
    category: "Modifier",
    prefix: "|",
  },
  {
    label: "Modifier: Pluck key",
    expr: "| map key='title'",
    preview: "",
    category: "Modifier",
    prefix: "|",
  },
  {
    label: "Modifier: Format date",
    expr: "| date 'F j, Y'",
    preview: "January 1, 2024",
    category: "Modifier",
    prefix: "|",
  },
  {
    label: "Modifier: Escape HTML",
    expr: "| esc_html",
    preview: "",
    category: "Modifier",
    prefix: "|",
  },
  {
    label: "Modifier: Raw HTML",
    expr: "| raw",
    preview: "",
    category: "Modifier",
    prefix: "|",
  },
  {
    label: "Modifier: Resolve author",
    expr: "| get_user",
    preview: "",
    category: "Modifier",
    prefix: "|",
  },
  {
    label: "Modifier: Other post meta",
    expr: "| get_post | get_meta key='subtitle'",
    preview: "",
    category: "Modifier",
    prefix: "|",
  },

  // ── Common patterns ───────────────────────────────────────────────────────

  {
    label: "Pattern: Greeting by name",
    expr: "user.is_logged_in ? 'Hello, ' + user.name : 'Hello, Guest'",
    preview: "Hello, Guest",
    category: "Pattern",
    prefix: "",
  },
  {
    label: "Pattern: Conditional class",
    expr: "user.is_logged_in ? 'member' : 'visitor'",
    preview: "visitor",
    category: "Pattern",
    prefix: "",
  },
  {
    label: "Pattern: Show role label",
    expr: "user.roles | join ', ' | match administrator='Admin' editor='Editor' default='Member'",
    preview: "Member",
    category: "Pattern",
    prefix: "",
  },
  {
    label: "Pattern: Author with fallback",
    expr: "post.author_name | default 'Unknown Author'",
    preview: "Unknown Author",
    category: "Pattern",
    prefix: "",
  },
  {
    label: "Pattern: Post date",
    expr: "post.date | date 'F j, Y'",
    preview: "January 1, 2024",
    category: "Pattern",
    prefix: "post",
  },
  {
    label: "Pattern: Meta with fallback",
    expr: "post.meta.subtitle | default post.title",
    preview: "",
    category: "Pattern",
    prefix: "",
  },
  {
    label: "Pattern: Site + Post title",
    expr: "post.title + ' — ' + site.name",
    preview: "Post Title — My Site",
    category: "Pattern",
    prefix: "",
  },
];

/**
 * Retrieves the full list of completions, allowing third-party devs to inject their own
 * via the Gutenberg JavaScript filter API at runtime instead of at module-load.
 */
export const getCompletions = () => {
  return window.wp?.hooks?.applyFilters
    ? window.wp.hooks.applyFilters(
        "vector_expressions/editor/completions",
        VE_COMPLETIONS,
      )
    : VE_COMPLETIONS;
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
 *   Group 1 — An already-converted <mark class="ve-expr-token"> element (skip).
 *   Group 2 — A <code> or <pre> block (skip).
 *   Group 3 — A bare {{ expr }} template tag (convert).
 *   Group 4 — The expression inside the {{ }} (capture group within 3).
 */
export const TOKEN_REGEX =
  /(<mark\b[^>]*\bclass="ve-expr-token"[^>]*>[\s\S]*?<\/mark>)|(<(?:code|pre)\b[^>]*>[\s\S]*?<\/(?:code|pre)>)|(\{\{\s*([^{}]+?)\s*\}\})/gi;

/** Milliseconds to wait before auto-focusing the popover expression input. */
export const POPOVER_FOCUS_DELAY = 50;

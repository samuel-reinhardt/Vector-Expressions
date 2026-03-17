=== Vector Expressions ===
Contributors: vectorarrow
Requires at least: 6.2
Tested up to: 6.9
Requires PHP: 8.1
Stable tag: 1.0.2
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html
Tags: block editor, gutenberg, dynamic content, personalization, conditional

Embed dynamic expressions in the Gutenberg block editor to personalize content and control block visibility.

== Description ==

= Features =

**Dynamic Content** — Insert live data into any block using a simple template syntax: `{{ post.title }}`, `{{ user.name }}`, `{{ site.name }}`. No shortcodes, no PHP templates, no code.

**Personalization** — Greet visitors by name, show role-specific content, or display custom messages based on login status. Expressions are evaluated server-side on every page load.

**Visibility Control** — Show or hide any Gutenberg block based on conditions. Display content only for logged-in users, specific roles, or specific post states — all configured from the block sidebar.

**Dynamic CSS Classes** — Inject CSS classes into any block based on live data. Style blocks differently for administrators vs. guests, published vs. draft posts, and more.

**20+ Built-in Filters** — Transform values with chainable pipes: `upper`, `lower`, `truncate`, `date`, `default`, `match`, `replace`, `kebab`, and more. Chain them: `{{ post.title | upper | truncate 20 }}`.

**Custom Fields** — Access any post or user meta with `post.meta.my_field` or `user.meta.my_field`. Sensitive keys are blocked by default.

**Full Expression Language** — Arithmetic, comparison, ternary, logical operators, string interpolation, and bracket access. All evaluated server-side with zero frontend JavaScript.

**In-Editor Autocomplete** — Typing `{{` triggers smart autocomplete with categorized suggestions, icons, and live previews.

**Extensible** — Register custom data roots, custom filters, and custom autocomplete suggestions via WordPress hooks and JavaScript filters.

For complete syntax reference, filter documentation, and developer guides, visit the [full documentation](https://vectorarrow.com/docs/).

= How It Works =

Add an expression to any block's text content by typing `{{` and selecting your expression from the autocomplete menu. The plugin will automatically format it as an expression chip.

    {{ post.title }}
    {{ user.name | default "Guest" }}
    {{ post.date | date "F j, Y" }}
    {{ user.is_logged_in ? "Welcome back!" : "Hello, visitor!" }}

Expressions are rendered as interactive chips in the editor and resolved server-side on every page render. No JavaScript runs on the frontend.

For the full syntax guide, data roots, and filter reference, see the [documentation](https://vectorarrow.com/docs/).

= Source Code =

The full, uncompressed source code is publicly available on [GitHub](https://github.com/samuel-reinhardt/Vector-Expressions).

== Installation ==

1. Upload the plugin files to the `/wp-content/plugins/vector-expressions` directory, or install the plugin through the WordPress plugins screen directly.
2. Activate the plugin through the 'Plugins' screen in WordPress.
3. Open the Block Editor and click the Vector ({{ braces) icon in the sidebar to access the Vector tab.

== Frequently Asked Questions ==

= Does this work with any block? =

Yes. Expressions can be inserted into any block that uses Gutenberg's standard RichText component — including paragraphs, headings, buttons, lists, and third-party blocks. Editor previews resolve automatically for these blocks. Blocks that don't support previews are still processed and rendered on the frontend. A small number of code-oriented blocks (Code, Preformatted, HTML, Shortcode, Classic Editor) are excluded.

= Is the content evaluated on the server or the client? =

All expressions are evaluated **server-side** on every block render. There is no JavaScript on the frontend, so content is resolved before it reaches the visitor's browser.

= Can I use custom post meta or user meta? =

Yes. Use `post.meta.my_field` or `user.meta.my_field` to access any registered meta field. Sensitive meta keys (containing "password", "token", "secret", etc.) are blocked by default.

= Is this compatible with caching plugins? =

Expressions that depend on the current user (e.g., `user.name`, `user.is_logged_in`) require per-user or no-cache handling. Post-only expressions (e.g., `post.title`) are fully cache-safe.

= Can I extend it with my own data or filters? =

Yes. Use PHP filters to register custom data roots and custom filter functions. Use JavaScript filters to add autocomplete suggestions in the editor. See the [developer documentation](https://vectorarrow.com/docs/) for details.

== Screenshots ==

1. Expression editor with live previews — edit expressions in the sidebar and see resolved values in real time.
2. Autocomplete menu — type `{{` to browse data roots and insert expressions without memorizing syntax.
3. Suggestion browser — browse all available data roots, properties, and filters organized by category.
4. Visibility and dynamic class controls — show or hide any block based on conditions and inject CSS classes powered by expressions.

== Changelog ==

= 1.0.2 =

* Added: `post.author_name` computed property — resolves author display name without exposing `wp_users` internals.
* Added: `date` filter for formatting date strings with custom PHP date formats.
* Added: Explicit pattern categories in the suggestion accordion — patterns can now declare their own category instead of being auto-distributed by root.

* Changed: `user.email` and `user.login` are now gated behind `is_user_logged_in()` — available for logged-in visitors (dashboard personalization), `null` for anonymous visitors.
* Changed: `get_user` modifier no longer requires `list_users` capability — the property allowlist is the security boundary.
* Changed: Restyled expression editor action buttons for improved visual hierarchy.
* Changed: Modifier architecture refactored into a base `Modifier` class and `ModifierSet` registry for cleaner extension patterns.
* Changed: Third-party developers can now inject expression completions at runtime via the `vector_expressions/editor/completions` JavaScript filter.

* Fixed: Removed direct user data hydration to prevent a race condition with `getCurrentUser()` and `useEffect` cleanup.
* Fixed: Modifier category matching updated to use `endsWith` with optional chaining for improved flexibility.
* Fixed: Documentation corrected: `post.url` now accurately documented as `get_permalink()` (was incorrectly listed as `guid`), syntax table for `{{{ }}}` clarified as `wp_kses_post()`.

= 1.0.1 =

* Added: Dedicated **Vector** sidebar tab in the block editor alongside Post and Block tabs.
* Added: **Expression tab** — clicking an in-content expression token opens the sidebar with a focused editor (input, live preview, apply/remove).
* Added: **Accordion suggestions** with searchable filter — categories auto-expand when searching.
* Added: Tabbed layout with per-tab content filters (`vectorExpressions.sidebar.tab.*`).
* Added: `vectorExpressions.sidebar.tabs` filter for extensions to register additional tabs.
* Added: `vectorExpressions.suggestions.roots` filter for extensions to register root categories.
* Added: `vectorExpressions.suggestions.patterns` filter for extensions to add curated patterns.
* Added: `vectorExpressions.suggestions.categories` filter for extensions to customize accordion sections.
* Added: Single-tab mode: when no extensions add tabs, content renders without the tab strip.

* Changed: **Expression editing moved from popover to sidebar** — the floating popover is removed.
* Changed: Accordion categories are dynamically derived from completions data.
* Changed: Moved Visibility and Dynamic Class controls from the block inspector into the new sidebar.
* Changed: Logic panel HOC is now UI-free — only handles pass1/pass2 token conversion.

* Fixed: Invalid forward slashes in WordPress hook namespace arguments (`addFilter`) replaced with dots — resolves React "Rendered fewer hooks than expected" crash on block selection.

= 1.0.0 =

* Added: Vector Expressions block format added to the Rich Text toolbar.
* Added: Expression pill editing popover with syntax highlighting.
* Added: Server-side parsing and evaluation engine for expressions.
* Added: Logic panel in block inspector for visibility and class expressions.
* Added: Live preview evaluation via REST APIs.

* Changed: Changed the core expression pill HTML tag from `<mark>` to `<span>`.

* Fixed: Expression format now appears in core Button blocks and other blocks using `withoutInteractiveFormatting`. Removed `interactive: true` from format registration.
* Fixed: Pressing Escape while editing an expression in the popover now reliably closes it.
* Fixed: Custom `vector/button` block now allows all registered rich-text formats (was `allowedFormats={[]}`).
* Fixed: `render_block_logic`: `attrs` is now always initialized as an empty array and guarded with `is_array()` before iteration.

* Features: **Mustache-style expression syntax** — Embed `{{ expression }}`, `{{{ raw }}}`, and `{{-- comment --}}` tokens directly inside any block's text content. Evaluated server-side on every render.
* Features: **Dot-notation data access** — Access WordPress data with simple, readable paths: `post.title`, `user.name`, `site.name`. No need to know internal WordPress property names like `post_title` or `display_name`.
* Features: **Post, User & Site context roots** — Three built-in data roots cover the most common dynamic content needs out of the box.
* Features: **Custom field (meta) access** — Read any post or user meta field with `post.meta.my_key` or `user.meta.my_key`.
* Features: **Full expression language** — Supports arithmetic (`+`, `-`, `*`, `/`, `%`), comparison (`==`, `!=`, `>`, `<`), logical operators (`&&`, `||`), ternary expressions (`condition ? a : b`), dynamic bracket access (`post["title"]`), and inline string interpolation (`"Hello {user.name}"`).
* Features: **Built-in filters (pipes)** — Transform values with a chainable filter syntax: `upper` / `uppercase`, `lower` / `lowercase`, `upper_first` / `capitalize`, `truncate`, `trim`, `replace`, `kebab`, `default`, `if`, `match`, `map`, `join`, `prop` / `get`, `get_post`, `get_user`, `get_meta`, `date`, `esc_html`, `esc_attr`, `raw`, and `render`.
* Features: **Block visibility control** — Every Gutenberg block gains a **Vector Logic** panel. Set show/hide conditions with an expression evaluated per-render.
* Features: **Dynamic CSS class** — Append CSS classes to any block's root element based on an expression result.
* Features: **In-editor autocomplete** — Typing `{{` in the block editor triggers a smart autocomplete dropdown with categorised expression suggestions, icons, and preview snippets.
* Features: **In-editor expression chips** — Inserted expressions are rendered as interactive inline chips in the editor, allowing quick edits and previews without hunting for raw text.
* Features: **Excerpt rendering** — Expressions in post content are evaluated before WordPress generates post excerpts, ensuring clean, parsed output in archive loops and REST responses.
* Features: **Extensible via hooks** — Register custom data roots, custom filter functions, custom autocomplete completions, and more via standard WordPress filters and JavaScript hooks.
* Features: **`WP_DEBUG` error comments** — When debug mode is active, parse errors are surfaced as HTML comments (`<!-- VE Error: ... -->`) for easy troubleshooting.

* Added: **`prop` / `get` filter** — Access a property on the result of a pipeline filter without needing parentheses. `{{ post.id | get_post | prop 'post_title' }}` is now equivalent to `{{ (post.id | get_post).post_title }}`.
* Added: **`truncate` filter** — Limit a string to N characters with an optional suffix (default `…`). Supports named args: `{{ post.excerpt | truncate length=120 suffix='...' }}`.
* Added: **`trim` filter** — Strip whitespace or a custom character set: `{{ value | trim }}` / `{{ value | trim '/' }}`.
* Added: **`replace` filter** — Find-and-replace: `{{ post.title | replace 'Old' 'New' }}` or with named args `search=` / `replace=`.
* Added: **`upper_first` / `capitalize` filter** — Uppercase the first character only: `{{ post.title | capitalize }}`.
* Added: **`kebab` filter** — Convert a string to a URL-safe kebab slug via WordPress's native `sanitize_title()`: `{{ post.title | kebab }}`.
* Added: **Filter aliases** — `uppercase` (→ `upper`), `lowercase` (→ `lower`), `capitalize` (→ `upper_first`) for more readable expressions.
* Added: **Keyword meta deny list** — `ObjectProxy` and `get_meta` now block meta keys containing sensitive substrings (`pass`, `token`, `secret`, `api_key`, `auth`, `nonce`, `salt`, `credential`, `private_key`) as a defense-in-depth layer beyond `is_protected_meta()`. The list is filterable via `vector_expressions/security/sensitive_meta_keywords`.
* Added: **`vector_expressions/error` action** — Fires on every expression evaluation failure. Allows production error tracking (logging, Sentry, etc.) without exposing details in the frontend HTML.
* Added: **`vectorExpressions.logicPanel.sections` JS filter** — Extension point for adding custom sections to the Vector Expressions inspector panel from JavaScript. Used by Pro to inject Dynamic Bindings UI.

* Fixed: `render_block_logic`: `attrs` is now always initialized as an empty array and guarded with `is_array()` before iteration.

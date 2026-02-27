# Changelog

All notable changes to Vector Expressions are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2025-02-24

### Added

- Vector Expressions block format added to the Rich Text toolbar.
- Expression pill editing popover with syntax highlighting.
- Server-side parsing and evaluation engine for expressions.
- Logic panel in block inspector for visibility and class expressions.
- Live preview evaluation via REST APIs.

### Changed

- Changed the core expression pill HTML tag from `<mark>` to `<span>`.

### Fixed

- Expression format now appears in core Button blocks and other blocks using `withoutInteractiveFormatting`. Removed `interactive: true` from format registration.
- Pressing Escape while editing an expression in the popover now reliably closes it.
- Custom `vector/button` block now allows all registered rich-text formats (was `allowedFormats={[]}`).
- `render_block_logic`: `attrs` is now always initialized as an empty array and guarded with `is_array()` before iteration.

### Features

- **Mustache-style expression syntax** — Embed `{{ expression }}`, `{{{ raw }}}`, and `{{-- comment --}}` tokens directly inside any block's text content. Evaluated server-side on every render.
- **Dot-notation data access** — Access WordPress data with simple, readable paths: `post.title`, `user.name`, `site.name`. No need to know internal WordPress property names like `post_title` or `display_name`.
- **Post, User & Site context roots** — Three built-in data roots cover the most common dynamic content needs out of the box.
- **Custom field (meta) access** — Read any post or user meta field with `post.meta.my_key` or `user.meta.my_key`.
- **Full expression language** — Supports arithmetic (`+`, `-`, `*`, `/`, `%`), comparison (`==`, `!=`, `>`, `<`), logical operators (`&&`, `||`), ternary expressions (`condition ? a : b`), dynamic bracket access (`post["title"]`), and inline string interpolation (`"Hello {user.name}"`).
- **Built-in filters (pipes)** — Transform values with a chainable filter syntax: `upper` / `uppercase`, `lower` / `lowercase`, `upper_first` / `capitalize`, `truncate`, `trim`, `replace`, `kebab`, `default`, `if`, `match`, `map`, `join`, `prop` / `get`, `get_post`, `get_user`, `get_meta`, `date`, `esc_html`, `esc_attr`, `raw`, and `render`.
- **Block visibility control** — Every Gutenberg block gains a **Vector Logic** panel. Set show/hide conditions with an expression evaluated per-render.
- **Dynamic CSS class** — Append CSS classes to any block's root element based on an expression result.
- **In-editor autocomplete** — Typing `{{` in the block editor triggers a smart autocomplete dropdown with categorised expression suggestions, icons, and preview snippets.
- **In-editor expression chips** — Inserted expressions are rendered as interactive inline chips in the editor, allowing quick edits and previews without hunting for raw text.
- **Excerpt rendering** — Expressions in post content are evaluated before WordPress generates post excerpts, ensuring clean, parsed output in archive loops and REST responses.
- **Extensible via hooks** — Register custom data roots, custom filter functions, custom autocomplete completions, and more via standard WordPress filters and JavaScript hooks.
- **`WP_DEBUG` error comments** — When debug mode is active, parse errors are surfaced as HTML comments (`<!-- VE Error: ... -->`) for easy troubleshooting.

### Added

- **`prop` / `get` filter** — Access a property on the result of a pipeline filter without needing parentheses. `{{ post.id | get_post | prop 'post_title' }}` is now equivalent to `{{ (post.id | get_post).post_title }}`.
- **`truncate` filter** — Limit a string to N characters with an optional suffix (default `…`). Supports named args: `{{ post.excerpt | truncate length=120 suffix='...' }}`.
- **`trim` filter** — Strip whitespace or a custom character set: `{{ value | trim }}` / `{{ value | trim '/' }}`.
- **`replace` filter** — Find-and-replace: `{{ post.title | replace 'Old' 'New' }}` or with named args `search=` / `replace=`.
- **`upper_first` / `capitalize` filter** — Uppercase the first character only: `{{ post.title | capitalize }}`.
- **`kebab` filter** — Convert a string to a URL-safe kebab slug via WordPress's native `sanitize_title()`: `{{ post.title | kebab }}`.
- **Filter aliases** — `uppercase` (→ `upper`), `lowercase` (→ `lower`), `capitalize` (→ `upper_first`) for more readable expressions.
- **Keyword meta deny list** — `ObjectProxy` and `get_meta` now block meta keys containing sensitive substrings (`pass`, `token`, `secret`, `api_key`, `auth`, `nonce`, `salt`, `credential`, `private_key`) as a defense-in-depth layer beyond `is_protected_meta()`. The list is filterable via `vector_expressions/security/sensitive_meta_keywords`.
- **`vector_expressions/error` action** — Fires on every expression evaluation failure. Allows production error tracking (logging, Sentry, etc.) without exposing details in the frontend HTML.

### Fixed

- `render_block_logic`: `attrs` is now always initialized as an empty array and guarded with `is_array()` before iteration.

---

## [1.0.0] and earlier

> No structured changelog was maintained prior to 1.0.0.

---

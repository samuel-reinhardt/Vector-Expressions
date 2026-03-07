=== Vector Expressions ===
Contributors: vectorarrow
Requires at least: 6.2
Tested up to: 6.9
Requires PHP: 8.1
Stable tag: 1.0.2
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html
Tags: block editor, gutenberg, logic, dynamic content, expressions

Embed dynamic expressions in the Gutenberg block editor to personalize content and control block visibility.

== Description ==

= How Expressions Work =

Vector Expressions uses a **mustache-style template syntax** evaluated server-side on every block render.

= Syntax =

| Syntax               | Behaviour                                              |
| :------------------- | :----------------------------------------------------- |
| `{{ expression }}`   | Evaluate and HTML-escape the result                    |
| `{{{ expression }}}` | Evaluate and sanitize via `wp_kses_post()` (safe HTML) |
| `{{-- comment --}}`  | Strip the token entirely — no output                   |

= Data Roots =

Access WordPress data using dot-notation from these root variables:

| Root   | Resolves To                                          |
| :----- | :--------------------------------------------------- |
| `post` | Current `WP_Post`                                    |
| `user` | Current `WP_User` (logged-in user)                   |
| `site` | Object with `name`, `url`, `description`, `language` |

= Property Aliases =

You do not need to know WP internal property names. The engine maps common aliases automatically:

**Post**

| Expression         | Description                                |
| :----------------- | :----------------------------------------- |
| `post.title`       | Post title                                 |
| `post.content`     | Post content                               |
| `post.excerpt`     | Post excerpt                               |
| `post.slug`        | Post slug                                  |
| `post.date`        | Publication date                           |
| `post.status`      | Post status                                |
| `post.type`        | Post type                                  |
| `post.author`      | Author ID                                  |
| `post.author_name` | Author display name (computed)             |
| `post.id`          | Post ID                                    |
| `post.url`         | Permalink (computed via `get_permalink()`) |

**User**

| Expression          | Description                                |
| :------------------ | :----------------------------------------- |
| `user.name`         | Display name                               |
| `user.email`        | Email (requires login — see note below)    |
| `user.login`        | Username (requires login — see note below) |
| `user.id`           | User ID                                    |
| `user.url`          | Profile URL                                |
| `user.registered`   | Registration date                          |
| `user.roles`        | Role(s) array                              |
| `user.is_logged_in` | `true` if logged in                        |

> **Security:** `user.email` and `user.login` resolve **only** for logged-in visitors viewing their own data. Anonymous visitors receive an empty result. This prevents PII leakage while enabling personalization on user dashboards.

**Meta**

```handlebars
{{post.meta.my_custom_field}}
{{user.meta.my_user_meta_key}}
```


= Expression Language Reference =

= Literals =

```handlebars
{{"Hello"}}
{{-- string --}}
{{42}}
{{-- number --}}
{{true}}
{{-- boolean --}}
{{null}}
{{-- null --}}
```

= Operators =

```handlebars
{{ post.id + 1 }}
{{ user.name == "admin" }}
{{ post.status != "draft" }}
{{ post.id > 10 && user.is_logged_in }}
{{ post.id % 2 == 0 }}
```

= Ternary =

```handlebars
{{ user.name == "admin" ? "Admin" : "Guest" }}
```

= Property Access =

```handlebars
{{post.title}}
{{post.meta.my_field}}
{{site.name}}
```

= Dynamic Property Access =

```handlebars
{{ post["post_title"] }}
```

= Filters (Pipes) =

Chain transformations with `|`:

```handlebars
{{ post.title | upper }}
{{ post.title | lower }}
{{ post.excerpt | default "No excerpt yet." }}
{{ user.name | if then="Welcome back!" else="Hello, guest." }}
{{ post.title | raw }}   {{-- bypass HTML escaping --}}
```

#### Built-in Filters

**Case transforms**

| Filter                       | Description                    | Example                          |
| :--------------------------- | :----------------------------- | :------------------------------- |
| `upper` / `uppercase`        | Uppercase all characters       | `{{ post.title \| upper }}`      |
| `lower` / `lowercase`        | Lowercase all characters       | `{{ user.name \| lower }}`       |
| `upper_first` / `capitalize` | Uppercase first character only | `{{ post.title \| capitalize }}` |

**String utilities**

| Filter                     | Description                     | Example                                           |
| :------------------------- | :------------------------------ | :------------------------------------------------ |
| `truncate length [suffix]` | Limit to N chars, append suffix | `{{ post.excerpt \| truncate 120 }}`              |
| `trim [chars]`             | Strip whitespace or char set    | `{{ value \| trim }}` / `{{ value \| trim '/' }}` |
| `replace search replace`   | Find-and-replace                | `{{ post.title \| replace 'Old' 'New' }}`         |
| `kebab`                    | Slug via `sanitize_title()`     | `{{ post.title \| kebab }}`                       |

**Date & format**

| Filter          | Description          | Example                            |
| :-------------- | :------------------- | :--------------------------------- |
| `date [format]` | Format a date string | `{{ post.date \| date 'M j, Y' }}` |

**Logic & flow**

| Filter          | Description          | Example                                                   |
| :-------------- | :------------------- | :-------------------------------------------------------- |
| `default value` | Fallback when falsy  | `{{ post.excerpt \| default "None" }}`                    |
| `if then else`  | Conditional output   | `{{ cond \| if then="Yes" else="No" }}`                   |
| `match`         | Map a value to cases | `{{ post.status \| match draft="Draft" publish="Live" }}` |

**Array utilities**

| Filter      | Description               | Example                          |
| :---------- | :------------------------ | :------------------------------- |
| `map key`   | Pluck a key from an array | `{{ posts \| map key="title" }}` |
| `join glue` | Join array to string      | `{{ tags \| join glue=", " }}`   |

**WordPress data**

| Filter                 | Description                               | Example                                                |
| :--------------------- | :---------------------------------------- | :----------------------------------------------------- |
| `get_post`             | Resolve ID → `WP_Post`                    | `{{ post.id \| get_post \| prop 'post_title' }}`       |
| `get_user`             | Resolve ID → `WP_User`                    | `{{ post.author \| get_user \| prop 'display_name' }}` |
| `get_meta key`         | Fetch post or user meta                   | `{{ post \| get_meta key="price" }}`                   |
| `prop key` / `get key` | Access a property after a pipeline filter | `{{ post.id \| get_post \| prop 'post_title' }}`       |

**Output & escaping**

| Filter     | Description          | Example                  |
| :--------- | :------------------- | :----------------------- |
| `esc_html` | HTML-escape output   | `{{ text \| esc_html }}` |
| `esc_attr` | Attr-escape output   | `{{ text \| esc_attr }}` |
| `raw`      | Bypass HTML escaping | `{{ html \| raw }}`      |


= Block Editor — Vector Logic Panel =

Every block in the Gutenberg editor gains a **Vector Logic** panel in its inspector sidebar.

= Visibility Logic =

Control whether a block renders at all:

* **Show if True** — block is visible when the expression is truthy
* **Hide if True** — block is hidden when the expression is truthy

```
user.login == "admin"
user.exists
post.status == "publish"
```

= Dynamic Class =

Append a CSS class to the block's root element based on an expression. Strings must be quoted:

```
user.login == "admin" ? "is-admin" : "is-guest"
```

== Installation ==

1. Upload the plugin files to the `/wp-content/plugins/vector-expressions` directory, or install the plugin through the WordPress plugins screen directly.
2. Activate the plugin through the 'Plugins' screen in WordPress.
3. Open the Block Editor and click the Vector ({{ braces) icon in the sidebar to access the Vector tab.

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

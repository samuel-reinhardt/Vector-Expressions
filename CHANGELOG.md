# Changelog

All notable changes to Vector Expressions are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [1.0.0] - 2026-02-19

### Features

- **Mustache-style expression syntax** — Embed `{{ expression }}`, `{{{ raw }}}`, and `{{-- comment --}}` tokens directly inside any block's text content. Evaluated server-side on every render.
- **Dot-notation data access** — Access WordPress data with simple, readable paths: `post.title`, `user.name`, `site.name`. No need to know internal WordPress property names like `post_title` or `display_name`.
- **Post, User & Site context roots** — Three built-in data roots cover the most common dynamic content needs out of the box.
- **Custom field (meta) access** — Read any post or user meta field with `post.meta.my_key` or `user.meta.my_key`.
- **Full expression language** — Supports arithmetic (`+`, `-`, `*`, `/`, `%`), comparison (`==`, `!=`, `>`, `<`), logical operators (`&&`, `||`), ternary expressions (`condition ? a : b`), dynamic bracket access (`post["title"]`), and inline string interpolation (`"Hello {user.name}"`).
- **Built-in filters (pipes)** — Transform values with a chainable filter syntax: `upper`, `lower`, `default`, `if`, `match`, `map`, `join`, `get_post`, `get_meta`, `esc_html`, `esc_attr`, `raw`, and `render`.
- **Block visibility control** — Every Gutenberg block gains a **Vector Logic** panel. Set show/hide conditions with an expression evaluated per-render.
- **Dynamic CSS class** — Append CSS classes to any block's root element based on an expression result.
- **In-editor autocomplete** — Typing `{{` in the block editor triggers a smart autocomplete dropdown with categorised expression suggestions, icons, and preview snippets.
- **In-editor expression chips** — Inserted expressions are rendered as interactive inline chips in the editor, allowing quick edits and previews without hunting for raw text.
- **Excerpt rendering** — Expressions in post content are evaluated before WordPress generates post excerpts, ensuring clean, parsed output in archive loops and REST responses.
- **Extensible via hooks** — Register custom data roots, custom filter functions, custom autocomplete completions, and more via standard WordPress filters and JavaScript hooks.
- **`WP_DEBUG` error comments** — When debug mode is active, parse errors are surfaced as HTML comments (`<!-- VE Error: ... -->`) for easy troubleshooting.

---

## [1.0.0] and earlier

> No structured changelog was maintained prior to 1.0.0.

---

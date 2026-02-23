=== Vector Expressions ===
Contributors: Vector Arrow
Requires at least: 6.2
Tested up to: 6.9
Requires PHP: 8.1
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html
Tags: block editor, gutenberg, logic, dynamic content, expressions, vector

A logic engine for the Gutenberg block editor. Embed dynamic expressions directly in block content to personalize output and control block visibility.

== Description ==

Vector Expressions is a logic engine for the Gutenberg block editor. Embed dynamic expressions directly in block content to personalize output and control block visibility — no custom code required.

Vector Expressions uses a **mustache-style template syntax** evaluated server-side on every block render.

### Syntax

* `{{ expression }}` - Evaluate and HTML-escape the result
* `{{{ expression }}}` - Evaluate **without** escaping (raw output)
* `{{-- comment --}}` - Strip the block entirely — no output

Expressions support JS-style inline string interpolation:
* `"Hello {user.name}"` - Evaluates to "Hello John"
* `"CSS: \{display: none}"` - Evaluates to "CSS: {display: none}" (use `\{` to escape raw brackets)

Security Note: Data pulled from the database is printed literally. If you saved an expression string inside a custom field, you must explicitly pipe it through the render engine to execute it:
* `{{ post.meta.dynamic_field | render }}`

### Data Roots

Access WordPress data using dot-notation from these root variables:

* `post` - Current WP_Post
* `user` - Current WP_User (logged-in user)
* `site` - Object with name, url, description, language

### Property Aliases

You do not need to know WP internal property names. The engine maps common aliases automatically. For example: `post.title`, `post.content`, `user.name`, `user.email`.

### Dynamic Class and Visibility Logic

Every block in the Gutenberg editor gains a **Vector Logic** panel in its inspector sidebar.

Control whether a block renders at all:
* Show if True — block is visible when the expression is truthy
* Hide if True — block is hidden when the expression is truthy

Append a CSS class to the block's root element based on an expression:
`user.login == "admin" ? "is-admin" : "is-guest"`

For a full reference of the Expression Language, visit the plugin website or the GitHub repository.

== Installation ==

1. Upload the plugin files to the `/wp-content/plugins/vector-expressions` directory, or install the plugin through the WordPress plugins screen directly.
2. Activate the plugin through the 'Plugins' screen in WordPress.
3. Open the Block Editor and look for the "Vector Logic" panel in the block sidebar, or start typing expressions in the block editor.

== Frequently Asked Questions ==

= Does this work with any block? =

Yes! The Vector Logic panel is injected into all registered Gutenberg blocks, and can be added to any block content. Note that expression tokens inside code or raw-content blocks (like core/code or core/html) are not processed to prevent accidental evaluation.

= Is it evaluated server-side or in JavaScript? =

All expressions are evaluated server-side in PHP during the `render_block` filter for maximum performance and security. A context proxy is provided in JavaScript purely for the editor preview experience.

== Changelog ==

= 1.0.0 =
* Initial release on WordPress.org repository.

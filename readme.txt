=== Vector Expressions ===
Contributors: vectorarrow
Requires at least: 6.2
Tested up to: 6.9
Requires PHP: 8.1
Stable tag: 1.0.1
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html
Tags: block editor, gutenberg, logic, dynamic content, expressions

A logic engine for the Gutenberg block editor. Embed dynamic expressions directly in block content to personalize output and control block visibility.

== Description ==

Vector Expressions is a logic engine for the Gutenberg block editor. Embed dynamic expressions directly in block content to personalize output and control block visibility — no custom code required.

Vector Expressions uses a **mustache-style template syntax** evaluated server-side on every block render.

### How to Use

Open up the block editor and add a block. Then, click the Vector icon ({{ braces) in the sidebar to open the Vector tab. Use the Logic section to control visibility or append a CSS class to the block.

You can also add expressions directly to the block content. Create a paragraph block, and start typing `{{` to see the autocomplete suggestions. Select the one you want to use and then press enter or tab to close the autocomplete. 
The expression will provide a preview inline to your content. Save the post and view it on the frontend to see the end result.

### Syntax

* `{{ expression }}` – Evaluate and HTML-escape the result
* `{{{ expression }}}` – Evaluate **without** escaping (raw output)
* `{{– comment –}}` – Strip the block entirely — no output

Expressions support JS-style inline string interpolation:
* `"Hello {user.name}"` – Evaluates to "Hello John"
* `"CSS: \{display: none}"` – Evaluates to "CSS: {display: none}" (use `\{` to escape raw brackets)

Security Note: Data pulled from the database is printed literally. If you saved an expression string inside a custom field, you must explicitly pipe it through the render engine to execute it:
* `{{ post.meta.dynamic_field | render }}`

### Data Roots

Access WordPress data using dot-notation from these root variables:

* `post` – Current WP_Post
* `user` – Current WP_User (logged-in user)
* `site` – Object with name, url, description, language

### Property Aliases

You do not need to know WP internal property names. The engine maps common aliases automatically. For example: `post.title`, `post.content`, `user.name`, `user.email`.

### Dynamic Class and Visibility Logic

Every block in the Gutenberg editor is configurable via the dedicated **Vector** sidebar tab (click the {{ braces icon in the sidebar header).

Control whether a block renders at all:
* Show if True — block is visible when the expression is truthy
* Hide if True — block is hidden when the expression is truthy

Append a CSS class to the block's root element based on an expression:
`user.login == "admin" ? "is-admin" : "is-guest"`

For a full reference of the Expression Language, visit the plugin website or the GitHub repository.

== Installation ==

1. Upload the plugin files to the `/wp-content/plugins/vector-expressions` directory, or install the plugin through the WordPress plugins screen directly.
2. Activate the plugin through the 'Plugins' screen in WordPress.
3. Open the Block Editor and click the Vector ({{ braces) icon in the sidebar to access the Vector tab.

== Frequently Asked Questions ==

= Does this work with any block? =

Yes! The Vector sidebar tab is available for all registered Gutenberg blocks, and expressions can be added to any block content. Note that expression tokens inside code or raw-content blocks (like core/code or core/html) are not processed to prevent accidental evaluation.

= Is it evaluated server-side or in JavaScript? =

All expressions are evaluated server-side in PHP during the `render_block` filter for maximum performance and security. A context proxy is provided in JavaScript purely for the editor preview experience.

== Changelog ==

= 1.0.1 =
* Added: Dedicated Vector sidebar tab in the block editor alongside Post and Block tabs.
* Added: Expression tab — clicking an in-content token opens sidebar with focused expression editor.
* Added: Accordion suggestions with searchable filter for browsing available variables and modifiers.
* Added: Tabbed layout with per-tab content filters for extensions.
* Added: `vectorExpressions.sidebar.tabs` JS filter for registering additional tabs.
* Added: `vectorExpressions.suggestions.roots` JS filter for registering root categories.
* Added: `vectorExpressions.suggestions.patterns` JS filter for curated pattern expressions.
* Added: `vectorExpressions.suggestions.categories` JS filter for accordion section customization.
* Changed: Expression editing moved from floating popover to sidebar tab.
* Changed: Moved Visibility and Dynamic Class controls from the block inspector into the new sidebar.
* Changed: Logic panel HOC is now UI-free — only handles pass1/pass2 token conversion.
* Fixed: Invalid forward slashes in WordPress hook namespace arguments replaced with dots — resolves crash on block selection.

= 1.0.0 =
* Added: Vector Expressions block format added to the Rich Text toolbar.
* Added: Expression pill editing popover with syntax highlighting.
* Added: Server-side parsing and evaluation engine for expressions.
* Added: Logic panel in block inspector for visibility and class expressions.
* Added: Live preview evaluation via REST APIs.
* Changed: Expression pill HTML tag changed from <mark> to <span>.
* Fixed: Expression format now appears in core Button blocks and other blocks using `withoutInteractiveFormatting`. Removed `interactive: true` from format registration.
* Fixed: Pressing Escape while editing an expression in the popover now reliably closes it.
* Fixed: Custom `vector/button` block now allows all registered rich-text formats (was `allowedFormats={[]}`).
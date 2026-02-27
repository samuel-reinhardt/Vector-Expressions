<?php

declare( strict_types=1 );

/**
 * Plugin Name:       Vector Expressions
 * Plugin URI:        https://vectorarrow.com/products/vector-expressions/
 * Description:       Logic engine for Gutenberg. Personalize content and control block visibility.
 * Version:           1.0.0
 * Author:            Vector WP
 * Author URI:        https://vectorarrow.com
 * License:           GPL v2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       vector-expressions
 * Domain Path:       /languages
 * Requires at least: 6.2
 * Tested up to:      6.9
 * Requires PHP:      8.1
 */

namespace VectorExpressions;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'VE_VERSION', '1.0.0' );
define( 'VE_PATH', plugin_dir_path( __FILE__ ) );
define( 'VE_URL', plugin_dir_url( __FILE__ ) );

// Autoload module class files.
require_once VE_PATH . 'modules/parser/class-safe-string.php';
require_once VE_PATH . 'modules/context/class-object-proxy.php';
require_once VE_PATH . 'modules/context/class-context.php';
require_once VE_PATH . 'modules/library/class-library.php';
require_once VE_PATH . 'modules/parser/class-parser.php';

/**
 * Main plugin bootstrap class.
 *
 * Registers the `ve_logic` block attribute on all blocks, processes block
 * output through the expression parser, and enqueues editor assets.
 *
 * @package VectorExpressions
 */
final class VectorExpressions {

	/** @var self|null Singleton instance. */
	private static ?self $instance = null;

	/** @var Parser The expression parser instance. */
	public Parser $parser;

	/**
	 * Return or create the singleton instance.
	 *
	 * @return self
	 */
	public static function get_instance(): self {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Register all WordPress hooks.
	 */
	private function __construct() {
		$this->parser = new Parser();

		add_action( 'init',                        [ $this, 'register_attributes' ] );
		add_filter( 'render_block',                [ $this, 'render_block_logic' ], 20, 2 );
		add_filter( 'the_content',                 [ $this, 'render_content' ], 20 );
		add_filter( 'the_excerpt',                 [ $this, 'render_content' ], 20 );
		add_filter( 'get_the_excerpt',             [ $this, 'render_content' ], 10 );
		add_action( 'enqueue_block_editor_assets', [ $this, 'enqueue_assets' ] );
		add_action( 'enqueue_block_assets',        [ $this, 'enqueue_shared_assets' ] );
		add_filter( 'plugin_row_meta',             [ $this, 'plugin_row_meta' ], 10, 2 );
		add_filter( 'wp_kses_allowed_html',        [ $this, 'allow_expression_span_tag' ], 10, 2 );
		add_action( 'rest_api_init',               [ $this, 'register_rest_routes' ] );
	}

	/**
	 * Add branding links to the plugin row in wp-admin › Plugins.
	 *
	 * @param string[] $links Existing plugin action/meta links.
	 * @param string   $file  The plugin basename being rendered.
	 * @return string[] Modified links array.
	 */
	public function plugin_row_meta( array $links, string $file ): array {
		if ( plugin_basename( VE_PATH . 'vector-expressions.php' ) !== $file ) {
			return $links;
		}

		$logo_url = esc_url( VE_URL . 'logo.svg' );
		$logo_img = '<img src="' . $logo_url . '" width="14" height="11" alt="" aria-hidden="true" style="vertical-align:middle;margin-right:3px;">';

		$links[] = $logo_img . '<a href="https://vectorarrow.com/" target="_blank" rel="noopener">'
			. esc_html__( 'Vector Arrow LLC', 'vector-expressions' )
			. '</a>';

		return $links;
	}

	/**
	 * Whitelist the `data-ve-expr` attribute on `<span>` tags so wp_kses_post
	 * does not strip expression data when a post is saved via the REST API.
	 *
	 * @param array<string, array<string, bool>> $allowed  Allowed tags + attributes.
	 * @param string                             $context  Kses context (e.g. 'post').
	 * @return array<string, array<string, bool>> Modified allowed-HTML map.
	 */
	public function allow_expression_span_tag( array $allowed, string $context ): array {
		if ( 'post' === $context ) {
			$allowed['span'] = array_merge(
				$allowed['span'] ?? [],
				[
					'class'               => true,
					'data-ve-expr'        => true,
					'data-ve-view'        => true,
					'data-ve-speculative' => true,
					'data-ve-empty'       => true,
					'data-ve-active'      => true,
					'contenteditable'     => true,
				]
			);
		}
		return $allowed;
	}

	/**
	 * Register the vector-expressions REST namespace and routes.
	 */
	public function register_rest_routes(): void {
		register_rest_route(
			'vector-expressions/v1',
			'/preview',
			[
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => [ $this, 'rest_preview' ],
				'permission_callback' => fn() => current_user_can( 'edit_posts' ),
				'args'                => [
					'expr'    => [
						'required' => true,
						// Avoiding math operator issues
						// This string is purely logic and is safely tokenized by our AST parser.
						// All output is subsequently HTML-escaped during rendering.
						'sanitize_callback' => fn( $param ) => (string) $param,
					],
					'post_id' => [
						'default'           => 0,
						'sanitize_callback' => 'absint',
					],
				],
			]
		);
	}

	/**
	 * Evaluate a single expression and return its rendered preview.
	 *
	 * Runs through Parser::parse() with post context set from `post_id` so
	 * post.* expressions resolve to the correct post — identical to how
	 * the frontend evaluates them.
	 *
	 * @param WP_REST_Request $request The REST request.
	 * @return WP_REST_Response JSON: { preview: string }
	 */
	public function rest_preview( \WP_REST_Request $request ): \WP_REST_Response {
		$expr    = $request->get_param( 'expr' );
		$post_id = (int) $request->get_param( 'post_id' );

		// In a REST request there is no WP query loop, so get_post() returns null
		// unless we explicitly set $GLOBALS['post']. setup_postdata() alone only
		// sets the loop iteration state — it does not set the global.
		$prev_post = $GLOBALS['post'] ?? null;

		if ( $post_id > 0 ) {
			$post = get_post( $post_id );

			// SECURITY: Ensure the user is authorized to read this specific post.
			// Prevents a Contributor from brute-forcing IDs to read an Admin's private/draft posts.
			if ( $post && current_user_can( 'read_post', $post->ID ) ) {
				// phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
				$GLOBALS['post'] = $post;
				setup_postdata( $post );
			} else {
				// Fallback to 0 if unauthorized to prevent data leakage.
				$post_id = 0;
			}
		}

		// A REST preview simulates rendering a format token that lives *inside* the WordPress editor DOM.
		// If we evaluate a block canvas property (like `post.content`) here, the engine natively returns the 
		// parent document's string back to the editor pill, which Gutenberg then saves radially into the HTML markup, 
		// causing an exponential duplication bug on every Save (a WYSIWYG fractal).
		// By enabling `protect_global_content`, `Context::access` will universally intercept any attempt 
		// to resolve the currently active global post's canvas properties and safely yield `''` instead.
		$this->parser->context->protect_global_content = true;

		$preview = '';
		$valid   = true;

		try {
			// evaluate_raw parses the expression directly without needing to wrap it in {{ }} tags 
			// and then run it through the preg_replace regex matcher.
			$val     = $this->parser->evaluate_raw( $expr );
			$preview = (string) $val;
		} catch ( \Throwable $e ) {
			$valid   = false;
			$preview = $e->getMessage();
		} finally {

			$this->parser->context->protect_global_content = false;

			// Restore the previous global state.
			if ( $prev_post ) {
				// phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
				$GLOBALS['post'] = $prev_post;
				setup_postdata( $prev_post );
			}
		}

		return new \WP_REST_Response( [
			'preview' => $preview,
			'valid'   => $valid,
		], 200 );
	}

	/**
	 * Inject the `ve_logic` attribute schema into every registered block type.
	 *
	 * Runs on `init` so all blocks are already registered.
	 *
	 * @return void
	 */
	public function register_attributes(): void {
		$registry = \WP_Block_Type_Registry::get_instance();

		/**
		 * Filters the default ve_logic attribute schema before it is applied.
		 *
		 * @param array<string, mixed> $schema The default attribute schema.
		 */
		$schema = apply_filters(
			'vector_expressions/attributes/schema',
			[
				'type'    => 'object',
				'default' => [
					'visible'        => '',
					'visible_action' => 'show',
					'class'          => '',
				],
			]
		);

		foreach ( $registry->get_all_registered() as $block_type ) {
			if ( ! isset( $block_type->attributes['ve_logic'] ) ) {
				$block_type->attributes['ve_logic'] = $schema;
			}

			// FORCE INJECTION: Guarantee every block receives postId from Query Loops.
			$uses_context = $block_type->uses_context;
			if ( ! is_array( $uses_context ) ) {
				$uses_context = [];
			}
			if ( ! in_array( 'postId', $uses_context, true ) ) {
				$uses_context[] = 'postId';
			}
			$block_type->uses_context = $uses_context;
		}
	}

	/**
	 * Single-pass block renderer.
	 *
	 * Evaluates visibility, class, and Pro logic instructions, applies them to
	 * the block HTML via WP_HTML_Tag_Processor, then runs the template parser.
	 *
	 * @param string               $block_content Rendered block HTML.
	 * @param array<string, mixed> $block         Block data array.
	 * @return string Processed block HTML, or empty string if hidden.
	 */
	public function render_block_logic( string $block_content, array $block ): string {
		// Never process expression tokens inside code or raw-content blocks.
		$denylist = [
			'core/code',
			'core/freeform',
			'core/preformatted',
			'core/html',
			'core/shortcode',
			'core/verse',
		];

		if ( in_array( $block['blockName'] ?? '', $denylist, true ) ) {
			return $block_content;
		}

		// Fast path: no logic or empty block.
		if ( empty( $block['attrs']['ve_logic'] ) || '' === trim( $block_content ) ) {
			return $this->parser->parse( $block_content );
		}

		$logic        = $block['attrs']['ve_logic'];
		$instructions = [
			'render' => true,
			'class'  => [],
			'attrs'  => [],
		];

		// Evaluate visibility condition.
		if ( ! empty( $logic['visible'] ) ) {
			$condition = $this->parser->evaluate_raw( $logic['visible'] );
			$action    = $logic['visible_action'] ?? 'show';

			if ( 'hide' === $action ) {
				$instructions['render'] = ! $condition;
			} else {
				$instructions['render'] = (bool) $condition;
			}
		}

		// Evaluate dynamic class as a template string so static text and
		// multiple {{ expression }} tokens can coexist in a single value.
		// e.g. "--my-class-{{ user.name | kebab }} --other-{{ post.title | kebab }}"
		if ( $instructions['render'] && ! empty( $logic['class'] ) ) {
			$cls = trim( (string) $this->parser->parse( $logic['class'] ) );
			if ( '' !== $cls ) {
				$instructions['class'][] = $cls;
			}
		}

		/**
		 * Filters the render instructions before they are applied to block HTML.
		 *
		 * Allows extensions to evaluate additional rules (e.g., URL overrides,
		 * inline style tokens, custom attribute bindings) by adding keys to
		 * the $instructions array.
		 *
		 * @param array<string, mixed> $instructions The current render instructions.
		 * @param array<string, mixed> $logic        The raw ve_logic attribute data.
		 * @param Parser            $parser       The active parser instance.
		 */
		$instructions = apply_filters( 'vector_expressions/renderer/calculate_logic', $instructions, $logic, $this->parser );

		if ( ! $instructions['render'] ) {
			return '';
		}

		// Apply class/style/attr mutations via WP_HTML_Tag_Processor.
		if (
			! empty( $instructions['class'] ) ||
			! empty( $instructions['style'] ) ||
			! empty( $instructions['attrs'] )
		) {
			$block_content = $this->apply_html_mutations( $block_content, $instructions );
		}

		return $this->parser->parse( $block_content );
	}

	/**
	 * Apply class, style, and attribute mutations to block HTML.
	 *
	 * @param string               $html         The raw block HTML.
	 * @param array<string, mixed> $instructions Mutations to apply.
	 * @return string The mutated HTML.
	 */
	private function apply_html_mutations( string $html, array $instructions ): string {
		if ( ! class_exists( 'WP_HTML_Tag_Processor' ) ) {
			return $html;
		}

		$tags = new \WP_HTML_Tag_Processor( $html );

		if ( ! $tags->next_tag() ) {
			return $html;
		}

		// Classes — explode by space to prevent Tag Processor errors on multi-word strings.
		foreach ( $instructions['class'] as $cls_string ) {
			foreach ( explode( ' ', $cls_string ) as $part ) {
				$part = trim( $part );
				if ( $part ) {
					$tags->add_class( $part );
				}
			}
		}

		// Inline styles — append to any existing style attribute.
		if ( ! empty( $instructions['style'] ) ) {
			$existing   = $tags->get_attribute( 'style' ) ?? '';
			$new_styles = implode( '; ', $instructions['style'] );
			$base       = rtrim( trim( $existing ), ';' );
			$final      = $base ? $base . '; ' . $new_styles : $new_styles;
			$tags->set_attribute( 'style', safecss_filter_attr( $final ) );
		}

		// Custom attributes — deny-list prevents event handler injection and unsafe structural routing.
		/**
		 * Filters the list of HTML attributes that are strictly blocked from being dynamically injected.
		 *
		 * @param array<string> $deny_list The array of blocked attribute names.
		 */
		$deny_list = apply_filters(
			'vector_expressions/sanitization/deny_list',
			[ 'data', 'javascript', 'method', 'ping', 'srcdoc', 'style', 'class' ]
		);

		/**
		 * Filters the list of HTML attributes that must be strictly sanitized as URLs.
		 *
		 * Attributes in this list are forced through `esc_url()` to neutralize `javascript:` URI injection.
		 *
		 * @param array<string> $url_attributes The array of URL-based attribute names.
		 */
		$url_attributes = apply_filters(
			'vector_expressions/sanitization/url_attributes',
			[ 'action', 'formaction', 'href', 'src', 'xlink:href' ]
		);

		foreach ( ( is_array( $instructions['attrs'] ) ? $instructions['attrs'] : [] ) as $key => $val ) {
			$clean_key = strtolower( trim( (string) $key ) );

			if ( str_starts_with( $clean_key, 'on' ) || in_array( $clean_key, $deny_list, true ) ) {
				continue;
			}

			// Natively sanitize all recognized URL-based attributes to proactively block `javascript:` URI injection.
			if ( in_array( $clean_key, $url_attributes, true ) ) {
				$val = esc_url( (string) $val );
				if ( empty( $val ) ) {
					continue;
				}
			}

			if ( true === $val ) {
				$tags->set_attribute( $clean_key, true );
			} elseif ( false === $val || null === $val ) {
				$tags->remove_attribute( $clean_key );
			} else {
				$tags->set_attribute( $clean_key, (string) $val );
			}
		}

		return $tags->get_updated_html();
	}

	/**
	 * Run the expression parser over post content (the_content filter).
	 *
	 * @param string $content Raw post content HTML.
	 * @return string Parsed content with all expressions resolved.
	 */
	public function render_content( string $content ): string {
		// Explicitly protect the global post content to prevent the layout from 
		// dropping into a Droste-effect recursive duplicate of itself.
		$this->parser->context->protect_global_content = true;

		try {
			$parsed = $this->parser->parse( $content );
		} finally {
			$this->parser->context->protect_global_content = false;
		}

		return $parsed;
	}

	/**
	 * Enqueue block editor JavaScript and CSS assets.
	 *
	 * @return void
	 */
	public function enqueue_assets(): void {
		wp_enqueue_script(
			've-editor',
			VE_URL . 'dist/editor.js',
			[ 'wp-blocks', 'wp-element', 'wp-components', 'wp-data', 'wp-i18n', 'wp-compose', 'wp-block-editor', 'wp-rich-text', 'wp-hooks' ],
			VE_VERSION,
			true
		);

		wp_set_script_translations( 've-editor', 'vector-expressions', VE_PATH . 'languages' );

		/**
		 * Filters the context data exposed to the block editor JS.
		 *
		 * @param array<string, mixed> $context The default context data.
		 */
		$context = apply_filters(
			'vector_expressions/editor/context',
			[
				'user'        => ( static function (): array {
					$u = wp_get_current_user();
					$logged_in = $u instanceof \WP_User && $u->ID > 0;
					if ( ! $logged_in ) {
						return [
							'name'        => '',
							'id'          => 0,
							'email'       => '',
							'login'       => '',
							'registered'  => '',
							'url'         => '',
							'roles'       => [],
							'is_logged_in' => false,
						];
					}
					return [
						'name'        => $u->display_name,
						'id'          => $u->ID,
						'email'       => $u->user_email,
						'login'       => $u->user_login,
						'registered'  => $u->user_registered,
						'url'         => $u->user_url,
						'roles'       => $u->roles,
						'is_logged_in' => true,
					];
				} )(),
				'site'        => [
					'name'        => get_bloginfo( 'name' ),
					'description' => get_bloginfo( 'description' ),
					'url'         => home_url(),
					'language'    => get_bloginfo( 'language' ),
				],
				'post'        => ( static function (): array {
					$p = get_post();
					if ( ! $p instanceof \WP_Post ) {
						return [
							'id'          => 0,
							'title'       => '',
							'slug'        => '',
							'status'      => '',
							'type'        => '',
							'date'        => '',
							'excerpt'     => '',
							'content'     => '',
							'url'         => '',
							'author_name' => '',
						];
					}
					$author = get_userdata( (int) $p->post_author );
					return [
						'id'          => $p->ID,
						'title'       => $p->post_title,
						'slug'        => $p->post_name,
						'status'      => $p->post_status,
						'type'        => $p->post_type,
						'date'        => (string) wp_date( get_option( 'date_format', 'F j, Y' ), strtotime( $p->post_date ) ),
						'excerpt'     => $p->post_excerpt,
						'content'     => wp_strip_all_tags( $p->post_content ),
						'url'         => get_permalink( $p ),
						'author_name' => $author instanceof \WP_User ? $author->display_name : '',
					];
				} )(),
			]
		);

		wp_localize_script( 've-editor', 'veContext', $context );
	}

	/**
	 * Enqueue assets shared across both the frontend and the block editor iframe canvas.
	 *
	 * Note: wp_enqueue_style is called here rather than `enqueue_block_editor_assets` 
	 * so that Gutenberg automatically injects the stylesheet into the block editor iframe.
	 *
	 * @return void
	 */
	public function enqueue_shared_assets(): void {
		if ( ! is_admin() ) {
			return; // Only load on the backend for now, though we may need this on the frontend eventually if tokens bleed through.
		}

		wp_enqueue_style(
			've-editor-css',
			VE_URL . 'dist/editor.css',
			[],
			VE_VERSION
		);
	}
}

add_action( 'plugins_loaded', [ VectorExpressions::class, 'get_instance' ] );
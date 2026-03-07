<?php
/**
 * Vector Expressions — Public Registration API.
 *
 * WordPress-native helper functions for registering custom roots and
 * modifiers without needing to create class files. Internally creates
 * anonymous Root/Modifier subclasses from closure-based config.
 *
 * Usage:
 *   vectex_register_root( 'company', [
 *       'label'      => 'Company',
 *       'group'      => 'content',
 *       'properties' => [ 'name' => 'Name', 'phone' => 'Phone' ],
 *       'resolve'    => fn() => (object) [
 *           'name'  => get_option( 'company_name' ),
 *           'phone' => get_option( 'company_phone' ),
 *       ],
 *   ] );
 *
 *   vectex_register_modifier( 'format_phone', [
 *       'hint'     => 'format phone number',
 *       'category' => 'My Plugin',
 *       'apply'    => fn( $in ) => preg_replace( '/(\d{3})(\d{3})(\d{4})/', '($1) $2-$3', (string) $in ),
 *   ] );
 *
 * @package VectorExpressions
 */

declare( strict_types=1 );

namespace VectorExpressions;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Registry of dynamically registered roots keyed by ID.
 *
 * @var array<string, Root>
 */
$GLOBALS['vector_expressions_registered_roots'] = [];

/**
 * Registry of dynamically registered modifiers keyed by name.
 *
 * @var array<string, Modifier>
 */
$GLOBALS['vector_expressions_registered_modifiers'] = [];

/**
 * Register a custom expression root from a simple config array.
 *
 * @param string $id     Root variable name (e.g. 'company').
 * @param array  $config {
 *     Configuration array.
 *
 *     @type string        $label       Human-readable label. Default: ucfirst($id).
 *     @type string        $description Short description. Default: ''.
 *     @type string        $group       Sidebar group key. Default: 'content'.
 *     @type string        $icon        SVG icon markup. Default: ''.
 *     @type string|null   $accent      CSS accent class. Default: null.
 *     @type string        $text_domain Text domain for i18n. Default: 'default'.
 *     @type array         $properties  Property map: key => label. Default: [].
 *     @type array         $patterns    Pattern definitions. Default: [].
 *     @type array         $quickstart  Quick-start suggestions. Default: [].
 *     @type callable      $resolve     Closure returning the data object. Required.
 * }
 * @return void
 */
function vectex_register_root( string $id, array $config ): void {
	if ( empty( $config['resolve'] ) || ! is_callable( $config['resolve'] ) ) {
		_doing_it_wrong( __FUNCTION__, 'A resolve callback is required.', '1.0.0' );
		return;
	}

	$resolve_fn = $config['resolve'];

	$root = new class( $id, $config, $resolve_fn ) extends Root {

		private \Closure $resolve_fn;

		public function __construct( string $id, array $config, callable $resolve_fn ) {
			$this->id          = $id;
			$this->label       = $config['label'] ?? ucfirst( $id );
			$this->description = $config['description'] ?? '';
			$this->group       = $config['group'] ?? 'content';
			$this->icon        = $config['icon'] ?? '';
			$this->accent      = $config['accent'] ?? null;
			$this->text_domain = $config['text_domain'] ?? 'default';
			$this->properties  = $config['properties'] ?? [];
			$this->patterns    = $config['patterns'] ?? [];
			$this->quickstart  = $config['quickstart'] ?? [];
			$this->resolve_fn  = \Closure::fromCallable( $resolve_fn );

			parent::__construct();
		}

		protected function resolve(): mixed {
			return ( $this->resolve_fn )();
		}
	};

	$GLOBALS['vector_expressions_registered_roots'][ $id ] = $root;
}

/**
 * Deregister a previously registered root.
 *
 * Removes the root from the context resolver and editor definitions.
 * Works on both class-based and functionally-registered roots.
 *
 * @param string $id Root variable name to remove.
 * @return void
 */
function vectex_deregister_root( string $id ): void {
	if ( isset( $GLOBALS['vector_expressions_registered_roots'][ $id ] ) ) {
		$root = $GLOBALS['vector_expressions_registered_roots'][ $id ];
		remove_filter( 'vector_expressions/context/get', [ $root, 'filter_resolve' ] );
		remove_filter( 'vector_expressions/editor/roots', [ $root, 'register_definition' ] );
		remove_filter( 'vector_expressions/editor/patterns', [ $root, 'register_patterns' ] );
		remove_filter( 'vector_expressions/editor/quickstart', [ $root, 'register_quickstart' ] );
		unset( $GLOBALS['vector_expressions_registered_roots'][ $id ] );
		return;
	}

	// For class-based roots, suppress the definition from edge localization.
	add_filter( 'vector_expressions/root/definition', static function ( array $definition, string $root_id ) use ( $id ): array {
		if ( $root_id === $id ) {
			return []; // Empty array suppresses this root.
		}
		return $definition;
	}, 10, 2 );
}

/**
 * Register a custom expression modifier from a simple config array.
 *
 * @param string $name   Modifier function name (e.g. 'format_phone').
 * @param array  $config {
 *     Configuration array.
 *
 *     @type string        $hint        Human-readable hint. Default: ''.
 *     @type string        $usage       Example usage. Default: ' | {name}'.
 *     @type string        $category    Sidebar category label. Default: 'Modifier'.
 *     @type string        $group       Sidebar group key. Default: 'modifiers'.
 *     @type string|null   $accent      CSS accent class. Default: null.
 *     @type array         $aliases     Alternative names. Default: [].
 *     @type callable      $apply       Transform function (mixed $in, array $args) => mixed. Required.
 * }
 * @return void
 */
function vectex_register_modifier( string $name, array $config ): void {
	if ( empty( $config['apply'] ) || ! is_callable( $config['apply'] ) ) {
		_doing_it_wrong( __FUNCTION__, 'An apply callback is required.', '1.0.0' );
		return;
	}

	$modifier = new Modifier(
		name:     $name,
		hint:     $config['hint'] ?? '',
		category: $config['category'] ?? 'Modifier',
		group:    $config['group'] ?? 'modifiers',
		accent:   $config['accent'] ?? null,
		usage:    $config['usage'] ?? '',
		aliases:  $config['aliases'] ?? [],
		apply:    $config['apply'],
	);

	$GLOBALS['vector_expressions_registered_modifiers'][ $name ] = $modifier;
}

/**
 * Deregister a previously registered modifier.
 *
 * @param string $name Modifier function name to remove.
 * @return void
 */
function vectex_deregister_modifier( string $name ): void {
	if ( isset( $GLOBALS['vector_expressions_registered_modifiers'][ $name ] ) ) {
		unset( $GLOBALS['vector_expressions_registered_modifiers'][ $name ] );
	}

	// For class-based modifiers, suppress via filter.
	add_filter( 'vector_expressions/modifiers/definitions', static function ( array $mods ) use ( $name ): array {
		return array_filter( $mods, static fn( $mod ) => ( $mod['name'] ?? '' ) !== $name );
	} );
}

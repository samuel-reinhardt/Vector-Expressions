<?php

declare( strict_types=1 );

namespace VectorExpressions;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Abstract base class for expression context roots.
 *
 * Extend this class to register a new root variable in the expression engine.
 * The class auto-registers both the backend context resolver and the editor
 * definition for sidebar/autocomplete presentation.
 *
 * Simple usage (property-based):
 *   class DateContext extends Root {
 *       protected string $id          = 'date';
 *       protected string $label       = 'Date';
 *       protected string $description = 'Current date/time values';
 *       protected string $group       = 'context';
 *       protected array  $properties  = [ 'year' => 'Year', 'month' => 'Month' ];
 *
 *       protected function resolve(): mixed {
 *           return (object) [ 'year' => wp_date('Y'), 'month' => wp_date('n') ];
 *       }
 *   }
 *
 * All string/array properties have method overrides — use the method form
 * when you need runtime logic (e.g. conditional icons, translated labels).
 *
 * @package VectorExpressions\Base
 */
abstract class Root {

	/** Root variable name used in expressions (e.g. 'query', 'date'). */
	protected string $id = '';

	/** Human-readable label for the sidebar accordion. */
	protected string $label = '';

	/** Short description shown in the root category card. */
	protected string $description = '';

	/** GROUP_DEFS key for sidebar grouping (e.g. 'content', 'context'). */
	protected string $group = '';

	/** SVG icon markup for the sidebar category. */
	protected string $icon = '';

	/** CSS accent class name for the sub-category. */
	protected ?string $accent = null;

	/** Text domain for i18n. Override in Pro/third-party plugins. */
	protected string $text_domain = 'vector-expressions';

	/**
	 * Property map: expression key → human label.
	 *
	 * Example: [ 'title' => 'Title', 'date' => [ 'label' => 'Date', 'type' => 'date' ] ]
	 *
	 * @var array<string, string|array{label: string, expr?: string, type?: string, entity?: string}>
	 */
	protected array $properties = [];

	/**
	 * Curated expression patterns associated with this root.
	 *
	 * @var array<int, array{expr: string, label: string, category?: string}>
	 */
	protected array $patterns = [];

	/**
	 * Quick-start suggestions shown when the input is empty.
	 *
	 * @var array<int, array{expr: string, label: string}>
	 */
	protected array $quickstart = [];

	// ── Accessors (override for runtime logic) ──────────────────────────────

	protected function id(): string { return $this->id; }
	protected function label(): string { return __( $this->label, $this->text_domain ); }
	protected function description(): string { return __( $this->description, $this->text_domain ); }
	protected function group(): string { return $this->group; }
	protected function icon(): string { return $this->icon; }
	protected function accent(): ?string { return $this->accent; }
	protected function properties(): array { return $this->properties; }
	protected function patterns(): array { return $this->patterns; }
	protected function quickstart(): array { return $this->quickstart; }

	/**
	 * Static UI icon registry for pseudo-categories with no PHP root.
	 *
	 * @return array<string, string> Category label → SVG markup.
	 */
	public static function ui_icons(): array {
		return [
			'pattern'  => '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="2" y="2" width="16" height="16" rx="2" fill="currentColor"/><path d="M2 10h16M10 2v16" stroke="white" stroke-width="1.5"/><path d="M14 6l-2 2-1-1" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
			'modifier' => '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4 4h12l-4.5 5.5v6.5l-3 2v-8.5z" fill="currentColor"/></svg>',
		];
	}

	/**
	 * Resolve the root data object on the frontend.
	 *
	 * @return mixed The data object (stdClass, array, etc.).
	 */
	abstract protected function resolve(): mixed;

	/**
	 * Register context hook and editor definition filter.
	 */
	public function __construct() {
		add_filter( 'vector_expressions/context/get', [ $this, 'filter_resolve' ], 10, 2 );
		add_filter( 'vector_expressions/editor/roots', [ $this, 'register_definition' ] );

		if ( ! empty( $this->patterns() ) ) {
			add_filter( 'vector_expressions/editor/patterns', [ $this, 'register_patterns' ] );
		}

		if ( ! empty( $this->quickstart() ) ) {
			add_filter( 'vector_expressions/editor/quickstart', [ $this, 'register_quickstart' ] );
		}
	}

	/**
	 * Context get filter callback — resolve this root.
	 *
	 * @param mixed  $value The current resolved value.
	 * @param string $root  The root variable name requested.
	 * @return mixed Resolved data for this root, passthrough otherwise.
	 */
	public function filter_resolve( mixed $value, string $root ): mixed {
		if ( $root !== $this->id() ) {
			return $value;
		}

		$resolved = $this->resolve();

		/**
		 * Filters a root's resolved data after context evaluation.
		 *
		 * Use this to add computed properties, redact sensitive fields,
		 * or enrich the data object before the expression engine reads it.
		 *
		 * @param mixed  $resolved The resolved data object.
		 * @param string $root_id  The root variable name (e.g. 'post').
		 */
		return apply_filters( 'vector_expressions/root/resolved', $resolved, $this->id() );
	}

	/**
	 * Push this root's editor definition onto the localized array.
	 *
	 * @param array<int, array<string, mixed>> $roots Current root definitions.
	 * @return array<int, array<string, mixed>> Definitions with this root appended.
	 */
	public function register_definition( array $roots ): array {
		$root_id = $this->id();

		/**
		 * Filters a root's property definitions before editor localization.
		 *
		 * Use this to add, remove, or modify properties for any root
		 * (e.g. inject a custom computed property without subclassing).
		 *
		 * @param array<string, string|array> $properties Property map.
		 * @param string                      $root_id    The root variable name.
		 */
		$raw_props = apply_filters( 'vector_expressions/root/properties', $this->properties(), $root_id );

		$props = [];
		foreach ( $raw_props as $key => $meta ) {
			if ( is_array( $meta ) ) {
				$prop = [
					'key'   => $key,
					'label' => $meta['label'],
				];
				if ( isset( $meta['expr'] ) ) {
					$prop['expr'] = $meta['expr'];
				}
				if ( isset( $meta['type'] ) ) {
					$prop['type'] = $meta['type'];
				}
				if ( isset( $meta['entity'] ) ) {
					$prop['entity'] = $meta['entity'];
				}
				$props[] = $prop;
			} else {
				$props[] = [
					'key'   => $key,
					'label' => $meta,
				];
			}
		}

		$definition = [
			'id'          => $root_id,
			'label'       => $this->label(),
			'description' => $this->description(),
			'icon'        => $this->icon(),
			'group'       => $this->group(),
			'accent'      => $this->accent(),
			'properties'  => $props,
		];

		/**
		 * Filters a root's complete editor definition before localization.
		 *
		 * Use this to modify any aspect of the root's editor presence —
		 * label, icon, group, accent, or the already-processed properties array.
		 *
		 * @param array<string, mixed> $definition The editor definition.
		 * @param string               $root_id    The root variable name.
		 */
		$roots[] = apply_filters( 'vector_expressions/root/definition', $definition, $root_id );

		return $roots;
	}

	/**
	 * Push pattern definitions onto the localized array.
	 *
	 * @param array $patterns Current pattern definitions.
	 * @return array Patterns with this root's patterns appended.
	 */
	public function register_patterns( array $patterns ): array {
		$grp    = $this->group();
		$accent = $this->accent();

		foreach ( $this->patterns() as $pat ) {
			$patterns[] = array_merge( $pat, [
				'category' => $pat['category'] ?? $this->label() . ' Pattern',
				'group'    => $grp,
				'accent'   => $accent,
			] );
		}

		return $patterns;
	}

	/**
	 * Push quick-start suggestions onto the localized array.
	 *
	 * @param array $items Current quick-start items.
	 * @return array Items with this root's quick starts appended.
	 */
	public function register_quickstart( array $items ): array {
		foreach ( $this->quickstart() as $qs ) {
			$items[] = [
				'expr'  => $qs['expr'],
				'label' => $qs['label'],
			];
		}
		return $items;
	}
}

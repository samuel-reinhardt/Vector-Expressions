<?php

declare( strict_types=1 );

namespace VectorExpressions;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Abstract base class for expression modifier groups.
 *
 * Extend this class to register a group of related modifiers in both the
 * expression engine backend and the editor UI.
 *
 * Three registration patterns (in order of preference):
 *
 * 1. **Inline Modifier instances** (recommended):
 *    ```
 *    class MyLibrary extends ModifierSet {
 *        protected string $group = 'modifiers';
 *
 *        public function __construct() {
 *            $this->add_modifier( new Modifier(
 *                name:     'format_phone',
 *                hint:     'format phone number',
 *                category: 'Text',
 *                apply:    fn( $in ) => preg_replace( '/(\d{3})(\d{3})(\d{4})/', '($1) $2-$3', (string) $in ),
 *            ) );
 *            parent::__construct();
 *        }
 *    }
 *    ```
 *
 * 2. **Modifier class declarations** (for reusable/complex modifiers):
 *    ```
 *    class MyLibrary extends ModifierSet {
 *        protected array $modifier_classes = [ FormatPrice::class ];
 *    }
 *    ```
 *
 * 3. **Inline array + apply() override** (legacy, still supported):
 *    ```
 *    class WcLibrary extends ModifierSet {
 *        protected array $modifiers = [
 *            [ 'name' => 'wc_price', 'hint' => 'format as currency' ],
 *        ];
 *        public function apply( ... ): mixed { return match ($fn) { ... }; }
 *    }
 *    ```
 *
 * @package VectorExpressions\Base
 */
abstract class ModifierSet {

	/** Category label for the sidebar accordion (e.g. 'WP Modifier'). */
	protected string $category = '';

	/** GROUP_DEFS key for sidebar grouping (e.g. 'modifiers', 'woocommerce'). */
	protected string $group = '';

	/** CSS accent class name. */
	protected ?string $accent = null;

	/** Text domain for i18n. Override in Pro/third-party plugins. */
	protected string $text_domain = 'vector-expressions';

	/**
	 * Modifier definitions for editor UI.
	 * Each element: [ 'name' => string, 'hint' => string, 'usage' => string (optional) ]
	 *
	 * @var array<int, array{name: string, hint: string, usage?: string}>
	 */
	protected array $modifiers = [];

	/**
	 * Modifier class names for auto-registration.
	 *
	 * Each entry must be a fully-qualified class name extending Modifier.
	 * Instances are created automatically and their definitions/dispatch
	 * are handled by ModifierSet.
	 *
	 * @var array<int, class-string<Modifier>>
	 */
	protected array $modifier_classes = [];

	/**
	 * Curated expression patterns associated with this modifier set.
	 *
	 * @var array<int, array{expr: string, label: string}>
	 */
	protected array $patterns = [];

	/**
	 * Quick-start suggestions shown when the input is empty.
	 *
	 * @var array<int, array{expr: string, label: string}>
	 */
	protected array $quickstart = [];

	// ── Accessors (override for runtime logic) ──────────────────────────────

	protected function category(): string { return __( $this->category, $this->text_domain ); }
	protected function group(): string { return $this->group; }
	protected function accent(): ?string { return $this->accent; }
	protected function modifiers(): array { return $this->modifiers; }
	protected function patterns(): array { return $this->patterns; }
	protected function quickstart(): array { return $this->quickstart; }

	/**
	 * Dispatch modifier application.
	 *
	 * Dispatches to Modifier instances registered via add_modifier() first,
	 * then falls through to subclass overrides (legacy match pattern).
	 *
	 * @param mixed                    $in   The piped-in input value.
	 * @param string                   $fn   The filter name.
	 * @param array<int|string, mixed> $args The filter arguments.
	 * @return mixed Transformed value, or passthrough $in.
	 */
	public function apply( mixed $in, string $fn, array $args ): mixed {
		if ( isset( $this->modifier_instances[ $fn ] ) ) {
			return $this->modifier_instances[ $fn ]->apply( $in, $args );
		}
		return $in;
	}

	/**
	 * Cached modifier name lookup for O(1) ownership checks.
	 *
	 * @var array<string, true>
	 */
	private array $owned = [];

	/**
	 * Instantiated Modifier objects keyed by name.
	 *
	 * @var array<string, Modifier>
	 */
	protected array $modifier_instances = [];

	/**
	 * Register a Modifier instance for dispatch and editor definition.
	 *
	 * Call this in the subclass constructor before parent::__construct().
	 *
	 * @param Modifier $mod The modifier instance.
	 */
	protected function add_modifier( Modifier $mod ): void {
		foreach ( $mod->all_names() as $name ) {
			$this->modifier_instances[ $name ] = $mod;
		}
	}

	/**
	 * Register library hook and editor definition filter.
	 */
	public function __construct() {
		// Instantiate Modifier classes and index by all names (primary + aliases).
		foreach ( $this->modifier_classes as $class ) {
			/** @var Modifier $instance */
			$instance = new $class();
			foreach ( $instance->all_names() as $name ) {
				$this->modifier_instances[ $name ] = $instance;
			}
		}

		// Build ownership map from both inline modifiers and Modifier classes.
		$this->owned = array_flip( array_column( $this->modifiers(), 'name' ) );
		foreach ( $this->modifier_instances as $name => $instance ) {
			$this->owned[ $name ] = true;
		}

		add_filter( 'vector_expressions/library/apply', [ $this, 'filter_apply' ], 10, 3 );
		add_filter( 'vector_expressions/editor/modifiers', [ $this, 'register_definitions' ] );

		if ( ! empty( $this->patterns() ) ) {
			add_filter( 'vector_expressions/editor/patterns', [ $this, 'register_patterns' ] );
		}

		if ( ! empty( $this->quickstart() ) ) {
			add_filter( 'vector_expressions/editor/quickstart', [ $this, 'register_quickstart' ] );
		}
	}

	/**
	 * Library apply filter callback — dispatch to subclass.
	 *
	 * Only dispatches if $fn matches one of this set's modifier names.
	 *
	 * @param mixed  $in   The piped-in value.
	 * @param string $fn   The filter name.
	 * @param array  $args The filter arguments.
	 * @return mixed Transformed or passthrough value.
	 */
	public function filter_apply( mixed $in, string $fn, array $args ): mixed {
		if ( ! isset( $this->owned[ $fn ] ) ) {
			return $in;
		}

		// Modifier class instances take priority.
		if ( isset( $this->modifier_instances[ $fn ] ) ) {
			$result = $this->modifier_instances[ $fn ]->apply( $in, $args );
		} else {
			$result = $this->apply( $in, $fn, $args );
		}

		/**
		 * Filters a modifier's output after application.
		 *
		 * Use this for logging, analytics, or post-processing modifier results.
		 *
		 * @param mixed  $result The modifier's output value.
		 * @param string $fn     The modifier function name.
		 * @param mixed  $in     The original input value.
		 * @param array  $args   The modifier arguments.
		 */
		return apply_filters( 'vector_expressions/modifiers/result', $result, $fn, $in, $args );
	}

	/**
	 * Push modifier definitions onto the localized array.
	 *
	 * @param array $modifiers Current modifier definitions.
	 * @return array Definitions with this set's modifiers appended.
	 */
	public function register_definitions( array $modifiers ): array {
		$cat    = $this->category();
		$grp    = $this->group();
		$accent = $this->accent();

		// Collect inline modifier definitions.
		$all_defs = $this->modifiers();

		// Collect definitions from Modifier class instances (primary name only, not aliases).
		$seen = [];
		foreach ( $this->modifier_instances as $instance ) {
			if ( ! isset( $seen[ $instance->name() ] ) ) {
				$all_defs[] = $instance->definition();
				$seen[ $instance->name() ] = true;
			}
		}

		/**
		 * Filters a modifier set's definitions before editor localization.
		 *
		 * Use this to add, remove, or modify modifier entries for any set
		 * (e.g. inject a custom modifier without subclassing).
		 *
		 * @param array<int, array{name: string, hint: string, usage?: string}> $mods     Modifier entries.
		 * @param string                                                        $category The set's category label.
		 */
		$set_mods = apply_filters( 'vector_expressions/modifiers/definitions', $all_defs, $cat );

		foreach ( $set_mods as $mod ) {
			$modifiers[] = [
				'name'     => $mod['name'],
				'hint'     => $mod['hint'] ?? '',
				'usage'    => $mod['usage'] ?? ' | ' . $mod['name'],
				'category' => ( $mod['category'] ?? '' ) ?: $cat,
				'group'    => $grp,
				'accent'   => $accent,
			];
		}

		return $modifiers;
	}

	/**
	 * Push pattern definitions onto the localized array.
	 *
	 * @param array $patterns Current pattern definitions.
	 * @return array Patterns with this set's patterns appended.
	 */
	public function register_patterns( array $patterns ): array {
		$cat    = $this->category();
		$grp    = $this->group();
		$accent = $this->accent();

		foreach ( $this->patterns() as $pat ) {
			$patterns[] = array_merge( $pat, [
				'category' => $pat['category'] ?? str_replace( 'Modifier', 'Pattern', $cat ),
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
	 * @return array Items with this set's quick starts appended.
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

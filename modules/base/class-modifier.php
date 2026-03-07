<?php

declare( strict_types=1 );

namespace VectorExpressions;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Concrete modifier class for the expression engine.
 *
 * Use directly with named arguments — no subclassing needed:
 *
 *   new Modifier(
 *       name:     'format_phone',
 *       hint:     'format phone number',
 *       category: 'Text',
 *       apply:    fn( $in ) => preg_replace( '/(\d{3})(\d{3})(\d{4})/', '($1) $2-$3', (string) $in ),
 *   );
 *
 * For ModifierSet integration, use add_modifier() in a subclass constructor.
 * For standalone registration, pass `group` to self-register via hooks.
 *
 * @package VectorExpressions\Base
 */
class Modifier {

	/** Modifier function name used in expressions (e.g. 'upper', 'acf_image'). */
	protected string $name = '';

	/** Human-readable hint shown in the sidebar/autocomplete. */
	protected string $hint = '';

	/** Example usage shown in autocomplete (defaults to ' | {name}'). */
	protected string $usage = '';

	/** Subcategory label for the sidebar (e.g. 'Text', 'Logic', 'Lists'). */
	protected string $category = '';

	/**
	 * Alias names that also trigger this modifier.
	 *
	 * @var array<int, string>
	 */
	protected array $aliases = [];

	/** @var \Closure|null Optional apply closure. */
	private ?\Closure $apply_fn = null;

	// ── Accessors ────────────────────────────────────────────────────────────

	public function name(): string { return $this->name; }
	public function hint(): string { return $this->hint; }
	public function usage(): string { return $this->usage ?: ' | ' . $this->name; }
	public function category(): string { return $this->category; }
	public function aliases(): array { return $this->aliases; }

	/**
	 * All names this modifier responds to (primary + aliases).
	 *
	 * @return array<int, string>
	 */
	public function all_names(): array {
		return [ $this->name, ...$this->aliases ];
	}

	/**
	 * Transform the input value.
	 *
	 * @param mixed                    $in   The piped-in input value.
	 * @param array<int|string, mixed> $args Positional or named arguments.
	 * @return mixed Transformed value.
	 */
	public function apply( mixed $in, array $args ): mixed {
		if ( $this->apply_fn !== null ) {
			return ( $this->apply_fn )( $in, $args );
		}
		return $in;
	}

	/**
	 * Get the modifier's editor definition.
	 *
	 * @return array{name: string, hint: string, usage: string, category: string}
	 */
	public function definition(): array {
		return [
			'name'     => $this->name(),
			'hint'     => $this->hint(),
			'usage'    => $this->usage(),
			'category' => $this->category(),
		];
	}

	/**
	 * Construct a modifier.
	 *
	 * @param string        $name     Modifier function name.
	 * @param string        $hint     Human-readable hint.
	 * @param string        $category Subcategory label (e.g. 'Text', 'Logic').
	 * @param string        $group    Sidebar group key — pass to self-register standalone.
	 * @param string|null   $accent   CSS accent class name.
	 * @param string        $usage    Example usage string.
	 * @param array         $aliases  Alternative trigger names.
	 * @param callable|null $apply    Transform function: fn(mixed $in, array $args): mixed.
	 */
	public function __construct(
		string $name = '',
		string $hint = '',
		string $category = '',
		string $group = '',
		?string $accent = null,
		string $usage = '',
		array $aliases = [],
		?callable $apply = null,
	) {
		if ( $name !== '' ) {
			$this->name = $name;
		}
		if ( $hint !== '' ) {
			$this->hint = $hint;
		}
		if ( $category !== '' ) {
			$this->category = $category;
		}
		if ( $usage !== '' ) {
			$this->usage = $usage;
		}
		if ( ! empty( $aliases ) ) {
			$this->aliases = $aliases;
		}
		if ( $apply !== null ) {
			$this->apply_fn = \Closure::fromCallable( $apply );
		}

		// Standalone registration — when not used via ModifierSet.
		if ( '' === $group ) {
			return;
		}

		$modifier = $this;
		$cat      = $category ?: 'Modifier';

		add_filter( 'vector_expressions/library/apply', static function ( mixed $in, string $fn, array $args ) use ( $modifier ): mixed {
			if ( ! in_array( $fn, $modifier->all_names(), true ) ) {
				return $in;
			}

			$result = $modifier->apply( $in, $args );

			/** @see ModifierSet::filter_apply() for filter docs. */
			return apply_filters( 'vector_expressions/modifiers/result', $result, $fn, $in, $args );
		}, 10, 3 );

		add_filter( 'vector_expressions/editor/modifiers', static function ( array $modifiers ) use ( $modifier, $cat, $group, $accent ): array {
			$modifiers[] = array_merge( $modifier->definition(), [
				'category' => $cat,
				'group'    => $group,
				'accent'   => $accent,
			] );
			return $modifiers;
		} );
	}
}

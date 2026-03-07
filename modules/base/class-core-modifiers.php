<?php

declare( strict_types=1 );

namespace VectorExpressions;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Core modifier definitions for the VE expression engine.
 *
 * Registers stateless transformations (text, logic, formatting, output)
 * as inline Modifier instances with intent-based subcategories.
 *
 * Context-dependent modifiers (prop, get_post, get_user, get_meta, render)
 * remain in Library as a separate hook subscriber since they require a
 * Context instance.
 *
 * @package VectorExpressions\Base
 */
class CoreModifiers extends ModifierSet {

	protected string $group = 'modifiers';

	public function __construct() {
		// ── Text ─────────────────────────────────────────────────────────────
		$this->add_modifier( new Modifier(
			name:    'upper',
			hint:    'UPPERCASE text',
			category: 'Text',
			aliases: [ 'uppercase' ],
			apply:   fn( $in ) => $this->filter_upper( $in ),
		) );
		$this->add_modifier( new Modifier(
			name:    'lower',
			hint:    'lowercase text',
			category: 'Text',
			aliases: [ 'lowercase' ],
			apply:   fn( $in ) => $this->filter_lower( $in ),
		) );
		$this->add_modifier( new Modifier(
			name:    'upper_first',
			hint:    'Capitalize Words',
			category: 'Text',
			usage:   ' | capitalize',
			aliases: [ 'capitalize' ],
			apply:   fn( $in ) => $this->filter_upper_first( $in ),
		) );
		$this->add_modifier( new Modifier(
			name:    'trim',
			hint:    'strip whitespace',
			category: 'Text',
			apply:   fn( $in, $args ) => $this->filter_trim( $in, $args ),
		) );
		$this->add_modifier( new Modifier(
			name:    'replace',
			hint:    'find and replace',
			category: 'Text',
			usage:   " | replace 'Foo' 'Bar'",
			apply:   fn( $in, $args ) => $this->filter_replace( $in, $args ),
		) );
		$this->add_modifier( new Modifier(
			name:    'kebab',
			hint:    'URL-safe slug',
			category: 'Text',
			apply:   fn( $in ) => sanitize_title( (string) $in ),
		) );

		// ── Format ───────────────────────────────────────────────────────────
		$this->add_modifier( new Modifier(
			name:    'date',
			hint:    'format date',
			category: 'Format',
			usage:   " | date 'F j, Y'",
			apply:   fn( $in, $args ) => $this->filter_date( $in, $args ),
		) );
		$this->add_modifier( new Modifier(
			name:    'truncate',
			hint:    'limit character length',
			category: 'Format',
			usage:   ' | truncate 120',
			apply:   fn( $in, $args ) => $this->filter_truncate( $in, $args ),
		) );

		// ── Logic ────────────────────────────────────────────────────────────
		$this->add_modifier( new Modifier(
			name:    'default',
			hint:    'fallback when empty',
			category: 'Logic',
			usage:   " | default 'Guest'",
			apply:   fn( $in, $args ) => $in ?: ( $args[0] ?? '' ),
		) );
		$this->add_modifier( new Modifier(
			name:    'if',
			hint:    'conditional branch',
			category: 'Logic',
			usage:   " | if then='Yes' else='No'",
			apply:   fn( $in, $args ) => $in
				? ( $args['then'] ?? $args[0] ?? null )
				: ( $args['else'] ?? $args[1] ?? null ),
		) );
		$this->add_modifier( new Modifier(
			name:    'match',
			hint:    'map value to label',
			category: 'Logic',
			usage:   " | match publish='Live' draft='Draft' default='Other'",
			apply:   fn( $in, $args ) => $this->filter_match( $in, $args ),
		) );

		// ── Lists ────────────────────────────────────────────────────────────
		$this->add_modifier( new Modifier(
			name:    'join',
			hint:    'join array items',
			category: 'Lists',
			usage:   " | join ', '",
			apply:   fn( $in, $args ) => implode( $args['glue'] ?? $args[0] ?? ',', (array) $in ),
		) );
		$this->add_modifier( new Modifier(
			name:    'map',
			hint:    'extract key from array items',
			category: 'Lists',
			usage:   " | map key='title'",
			apply:   fn( $in, $args ) => $this->filter_map( $in, $args ),
		) );

		// ── Output ───────────────────────────────────────────────────────────
		$this->add_modifier( new Modifier(
			name:    'esc_html',
			hint:    'escape HTML entities',
			category: 'Output',
			apply:   fn( $in ) => esc_html( (string) $in ),
		) );
		$this->add_modifier( new Modifier(
			name:    'esc_attr',
			hint:    'escape for HTML attributes',
			category: 'Output',
			apply:   fn( $in ) => esc_attr( (string) $in ),
		) );
		$this->add_modifier( new Modifier(
			name:    'raw',
			hint:    'render safe HTML',
			category: 'Output',
			apply:   fn( $in ) => new SafeString( \wp_kses_post( (string) $in ) ),
		) );

		// ── Lookup ───────────────────────────────────────────────────────────
		$this->add_modifier( new Modifier(
			name:    'get_user',
			hint:    'resolve user by ID',
			category: 'Lookup',
		) );
		$this->add_modifier( new Modifier(
			name:    'get_post',
			hint:    'resolve post by ID',
			category: 'Lookup',
			usage:   ' | get_post',
		) );
		$this->add_modifier( new Modifier(
			name:    'get_meta',
			hint:    'read meta value',
			category: 'Lookup',
			usage:   " | get_meta key='subtitle'",
		) );
		$this->add_modifier( new Modifier(
			name:    'prop',
			hint:    'access property',
			category: 'Lookup',
			usage:   " | prop 'post_title'",
			aliases: [ 'get' ],
		) );

		parent::__construct();
	}

	// ── Filter methods for complex transforms ────────────────────────────────

	private function filter_upper( mixed $in ): string {
		$s = (string) $in;
		return function_exists( 'mb_strtoupper' ) ? mb_strtoupper( $s ) : strtoupper( $s );
	}

	private function filter_upper_first( mixed $in ): string {
		$s = (string) $in;
		if ( '' === $s ) {
			return '';
		}
		if ( function_exists( 'mb_convert_case' ) ) {
			return mb_convert_case( $s, MB_CASE_TITLE );
		}
		return ucwords( $s );
	}

	private function filter_lower( mixed $in ): string {
		$s = (string) $in;
		return function_exists( 'mb_strtolower' ) ? mb_strtolower( $s ) : strtolower( $s );
	}

	private function filter_match( mixed $in, array $args ): mixed {
		$default = $args['default'] ?? null;
		unset( $args['default'] );

		foreach ( $args as $k => $v ) {
			if ( $in === $k ) {
				return $v;
			}
			if ( is_string( $k ) && is_numeric( $k ) && (int) $k === $in ) {
				return $v;
			}
		}

		return $default;
	}

	private function filter_map( mixed $in, array $args ): array {
		$key = $args['key'] ?? $args[0] ?? null;

		if ( ! $key ) {
			return (array) $in;
		}

		return array_map(
			function ( mixed $item ) use ( $key ) {
				if ( $item instanceof \WP_Post || $item instanceof \WP_User ) {
					return null;
				}
				return is_object( $item )
					? ( get_object_vars( $item )[ $key ] ?? null )
					: ( ( (array) $item )[ $key ] ?? null );
			},
			(array) $in
		);
	}

	private function filter_truncate( mixed $in, array $args ): string {
		$s      = (string) $in;
		$length = (int) ( $args['length'] ?? $args[0] ?? 0 );
		$suffix = (string) ( $args['suffix'] ?? $args[1] ?? '…' );

		if ( $length <= 0 ) {
			return $s;
		}

		$str_len = function_exists( 'mb_strlen' ) ? mb_strlen( $s ) : strlen( $s );

		if ( $str_len <= $length ) {
			return $s;
		}

		$truncated = function_exists( 'mb_substr' ) ? mb_substr( $s, 0, $length ) : substr( $s, 0, $length );

		return $truncated . $suffix;
	}

	private function filter_trim( mixed $in, array $args ): string {
		$s     = (string) $in;
		$chars = (string) ( $args['chars'] ?? $args[0] ?? '' );
		return '' === $chars ? trim( $s ) : trim( $s, $chars );
	}

	private function filter_replace( mixed $in, array $args ): string {
		$s       = (string) $in;
		$search  = (string) ( $args['search']  ?? $args[0] ?? '' );
		$replace = (string) ( $args['replace'] ?? $args[1] ?? '' );

		if ( '' === $search ) {
			return $s;
		}

		return str_replace( $search, $replace, $s );
	}

	private function filter_date( mixed $in, array $args ): string {
		$format = (string) ( $args['format'] ?? $args[0] ?? get_option( 'date_format', 'F j, Y' ) );

		if ( is_numeric( $in ) ) {
			$timestamp = (int) $in;
		} else {
			$tz_str = function_exists( 'wp_timezone_string' ) ? wp_timezone_string() : date_default_timezone_get();
			$tz     = new \DateTimeZone( $tz_str );
			$dt     = date_create_immutable( (string) $in, $tz );
			$timestamp = $dt ? $dt->getTimestamp() : false;
		}

		$result = ( false !== $timestamp ) ? wp_date( $format, $timestamp ) : false;
		return is_string( $result ) ? $result : '';
	}
}

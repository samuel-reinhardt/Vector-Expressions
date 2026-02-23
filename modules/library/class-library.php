<?php

declare( strict_types=1 );

namespace VectorExpressions;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Built-in filter function library for the VE expression engine.
 *
 * Each filter transforms a piped-in value (`$in`) using optional named or
 * positional arguments (`$args`). The library is intentionally kept to pure,
 * stateless transformations; side-effectful work belongs in context resolvers.
 *
 * @package VectorExpressions\Library
 */
class Library {

	/**
	 * Apply a named filter function to an input value.
	 *
	 * Dispatch table for all built-in filters. Extensions may hook
	 * `vector_expressions/library/apply` to add custom filters without
	 * modifying core.
	 *
	 * @param string                     $fn   The filter name.
	 * @param mixed                      $in   The piped-in input value.
	 * @param array<int|string, mixed>   $args Positional or named arguments.
	 * @return mixed The transformed result.
	 */
	public function apply( string $fn, mixed $in, array $args ): mixed {
		return match ( $fn ) {
			'upper'    => $this->filter_upper( $in ),
			'lower'    => $this->filter_lower( $in ),
			'date'     => $this->filter_date( $in, $args ),
			'default'  => $this->filter_default( $in, $args ),
			'if'       => $this->filter_if( $in, $args ),
			'match'    => $this->filter_match( $in, $args ),
			'map'      => $this->filter_map( $in, $args ),
			'join'     => $this->filter_join( $in, $args ),
			'get_post',
			'resolve'  => $this->filter_get_post( $in ),
			'get_user' => $this->filter_get_user( $in ),
			'get_meta' => $this->filter_get_meta( $in, $args ),
			'esc_html' => esc_html( (string) $in ),
			'esc_attr' => esc_attr( (string) $in ),
			'raw'      => new SafeString( \wp_kses_post( (string) $in ) ),

			/**
			 * Filters the result of an unknown filter function.
			 *
			 * Allows Pro extensions to register custom filter names without
			 * modifying this file.
			 *
			 * @param mixed                    $in   The piped-in input value.
			 * @param string                   $fn   The unrecognized filter name.
			 * @param array<int|string, mixed> $args The filter arguments.
			 */
			default => apply_filters( 'vector_expressions/library/apply', $in, $fn, $args ),
		};
	}

	/**
	 * Convert a value to uppercase.
	 *
	 * @param mixed $in Input value.
	 * @return string Uppercased string.
	 */
	private function filter_upper( mixed $in ): string {
		$s = (string) $in;
		return function_exists( 'mb_strtoupper' ) ? mb_strtoupper( $s ) : strtoupper( $s );
	}

	/**
	 * Convert a value to lowercase.
	 *
	 * @param mixed $in Input value.
	 * @return string Lowercased string.
	 */
	private function filter_lower( mixed $in ): string {
		$s = (string) $in;
		return function_exists( 'mb_strtolower' ) ? mb_strtolower( $s ) : strtolower( $s );
	}

	/**
	 * Return the input value, or a default if the input is falsy.
	 *
	 * @param mixed                    $in   Input value.
	 * @param array<int|string, mixed> $args Args: [0] default value.
	 * @return mixed The input or the default.
	 */
	private function filter_default( mixed $in, array $args ): mixed {
		return $in ?: ( $args[0] ?? '' );
	}

	/**
	 * Return a 'then' or 'else' value based on the truthiness of the input.
	 *
	 * @param mixed                    $in   Condition value.
	 * @param array<int|string, mixed> $args Supports named keys: then, else. Positional fallback: 0, 1.
	 * @return mixed The `then` or `else` branch.
	 */
	private function filter_if( mixed $in, array $args ): mixed {
		return $in
			? ( $args['then'] ?? $args[0] ?? null )
			: ( $args['else'] ?? $args[1] ?? null );
	}

	/**
	 * Match the input against a map of cases and return the corresponding value.
	 *
	 * @param mixed                    $in   The value to match.
	 * @param array<int|string, mixed> $args Key-value map of cases. 'default' key is the fallback.
	 * @return mixed The matched value or the default.
	 */
	private function filter_match( mixed $in, array $args ): mixed {
		$default = $args['default'] ?? null;
		unset( $args['default'] );

		foreach ( $args as $k => $v ) {
			if ( $in === $k ) {
				return $v;
			}

			// Loose numeric match (e.g. expression produces int, key is string '1').
			if ( is_string( $k ) && is_numeric( $k ) && (int) $k === $in ) {
				return $v;
			}
		}

		return $default;
	}

	/**
	 * Extract a single key from each item in an array.
	 *
	 * @param mixed                    $in   The array to map over.
	 * @param array<int|string, mixed> $args Args: key (named) or [0] (positional).
	 * @return array<int, mixed> Array of extracted values.
	 */
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

	/**
	 * Join an array into a delimited string.
	 *
	 * @param mixed                    $in   The array to join.
	 * @param array<int|string, mixed> $args Args: glue (named) or [0] (positional). Default: ','.
	 * @return string The joined string.
	 */
	private function filter_join( mixed $in, array $args ): string {
		return implode( $args['glue'] ?? $args[0] ?? ',', (array) $in );
	}

	/**
	 * Format a date value.
	 *
	 * Accepts a Unix timestamp, a MySQL datetime string, or any string parseable
	 * by strtotime(). Uses WordPress's locale-aware wp_date() so timezone and
	 * translation settings are respected.
	 *
	 * @param mixed                    $in   Date value (timestamp or date string).
	 * @param array<int|string, mixed> $args Args: [0] or 'format' — PHP date format. Defaults to WP date setting.
	 * @return string Formatted date, or empty string if the value is unparseable.
	 */
	private function filter_date( mixed $in, array $args ): string {
		$format    = (string) ( $args['format'] ?? $args[0] ?? get_option( 'date_format', 'F j, Y' ) );
		$timestamp = is_numeric( $in ) ? (int) $in : strtotime( (string) $in );
		$result    = ( false !== $timestamp ) ? wp_date( $format, $timestamp ) : false;
		return is_string( $result ) ? $result : '';
	}

	/**
	 * Hydrate a user ID into a WP_User object.
	 *
	 * Useful for comparing post authors, retrieving meta, or passing into
	 * expressions that need a full user context rather than a bare integer.
	 *
	 * Usage: {{ post.author | get_user }} (truthy when author exists)
	 *
	 * @param mixed $in A numeric user ID.
	 * @return \WP_User|null The resolved user, or null if not found.
	 */
	private function filter_get_user( mixed $in ): ?\WP_User {
		$id   = is_numeric( $in ) ? (int) $in : 0;
		$user = $id ? get_userdata( $id ) : false;
		return $user instanceof \WP_User ? $user : null;
	}

	/**
	 * Resolve a post ID to a WP_Post object.
	 *
	 * @param mixed $in A numeric post ID.
	 * @return \WP_Post|null The resolved post or null.
	 */
	private function filter_get_post( mixed $in ): ?\WP_Post {
		$id = is_numeric( $in ) ? (int) $in : null;
		return $id ? get_post( $id ) : null;
	}

	/**
	 * Retrieve a meta value from a WP_Post object.
	 *
	 * @param mixed                    $in   A WP_Post instance.
	 * @param array<int|string, mixed> $args Args: key (named) or [0] (positional).
	 * @return mixed The meta value or null.
	 */
	private function filter_get_meta( mixed $in, array $args ): mixed {
		$key = sanitize_text_field( (string) ( $args['key'] ?? $args[0] ?? '' ) );

		if ( ! $key || ! ( $in instanceof \WP_Post || $in instanceof \WP_User ) ) {
			return null;
		}

		if ( $in instanceof \WP_Post ) {
			if ( is_protected_meta( $key, 'post' ) || 'session_tokens' === $key ) {
				return null;
			}
			return get_post_meta( $in->ID, $key, true );
		}

		if ( $in instanceof \WP_User ) {
			global $wpdb;
			$denylist = [ 'session_tokens', $wpdb->get_blog_prefix() . 'capabilities', $wpdb->get_blog_prefix() . 'user_level' ];
			if ( is_protected_meta( $key, 'user' ) || in_array( $key, $denylist, true ) ) {
				return null;
			}
			return get_user_meta( $in->ID, $key, true );
		}

		return null;
	}
}
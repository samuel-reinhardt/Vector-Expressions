<?php

declare( strict_types=1 );

namespace VectorExpressions;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Lazy meta-accessor proxy for WP_Post and WP_User objects.
 *
 * Allows expression syntax like `post.meta.my_key` or `user.meta.my_role`
 * to transparently resolve post/user meta without coupling the parser to
 * WordPress meta functions.
 *
 * @package VectorExpressions\Context
 */
class ObjectProxy {

	/** @var \WP_Post|\WP_User The wrapped object. */
	private object $obj;

	/**
	 * @param \WP_Post|\WP_User $obj The object whose meta will be proxied.
	 */
	public function __construct( object $obj ) {
		$this->obj = $obj;
	}

	/**
	 * Resolve a meta key for the wrapped object.
	 *
	 * The key is sanitized before use to prevent meta-key injection.
	 * A keyword deny list provides additional defense against accidental
	 * exposure of public (non-underscored) meta keys that hold sensitive data.
	 *
	 * @param string $key The meta key to retrieve.
	 * @return mixed The meta value, or null if unsupported.
	 */
	public function __get( string $key ): mixed {
		$key = sanitize_text_field( $key );

		if ( self::is_sensitive_key( $key ) ) {
			return null;
		}

		if ( $this->obj instanceof \WP_Post ) {
			// session_tokens is exclusively WP_User meta, but blocking it universally prevents database mismatch collisions.
			if ( is_protected_meta( $key, 'post' ) || 'session_tokens' === $key ) {
				return null;
			}
			return get_post_meta( $this->obj->ID, $key, true );
		}

		if ( $this->obj instanceof \WP_User ) {
			global $wpdb;

			// WP stores session_tokens and DB-prefixed roles/levels as public meta (no underscore).
			$denylist = [
				'session_tokens',
				$wpdb->get_blog_prefix() . 'capabilities',
				$wpdb->get_blog_prefix() . 'user_level',
			];

			if ( is_protected_meta( $key, 'user' ) || in_array( $key, $denylist, true ) ) {
				return null;
			}
			return get_user_meta( $this->obj->ID, $key, true );
		}

		return null;
	}

	/**
	 * Check if a meta key contains a sensitive keyword.
	 *
	 * Catches public (non-underscored) meta keys that hold credentials or tokens
	 * even when they don't trigger WordPress's built-in `is_protected_meta()` check.
	 *
	 * Sensitive substring list is filterable via
	 * `vector_expressions/security/sensitive_meta_keywords`.
	 *
	 * @param string $key The meta key to check.
	 * @return bool True if the key should be blocked.
	 */
	public static function is_sensitive_key( string $key ): bool {
		/**
		 * Filters the list of keyword substrings used to block sensitive meta keys.
		 *
		 * @param string[] $keywords List of lowercase substrings. A meta key containing
		 *                           any of these substrings (case-insensitive) is blocked.
		 */
		$keywords = (array) apply_filters(
			'vector_expressions/security/sensitive_meta_keywords',
			[ 'pass', 'token', 'secret', 'api_key', 'auth', 'nonce', 'salt', 'credential', 'private_key' ]
		);

		$lower = strtolower( $key );

		foreach ( $keywords as $kw ) {
			if ( str_contains( $lower, (string) $kw ) ) {
				return true;
			}
		}

		return false;
	}
}

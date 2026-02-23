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
	 *
	 * @param string $key The meta key to retrieve.
	 * @return mixed The meta value, or null if unsupported.
	 */
	public function __get( string $key ): mixed {
		$key = sanitize_text_field( $key );

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
}

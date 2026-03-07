<?php

declare( strict_types=1 );

namespace VectorExpressions;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Core modifier dispatch and context-dependent filters.
 *
 * Dispatches all modifier calls through `vector_expressions/library/apply`
 * where registered ModifierSet subclasses (CoreModifiers, WpLibrary, etc.)
 * handle their own modifiers.
 *
 * Context-dependent filters (prop, get_post, get_user, get_meta) are handled
 * directly since they require a Context instance for property resolution and
 * security checks.
 *
 * @package VectorExpressions\Library
 */
class Library {

	/** @var Context Context instance for property access and security. */
	private Context $context;

	/**
	 * @param Context|null $context The active evaluation context.
	 */
	public function __construct( ?Context $context = null ) {
		$this->context = $context ?? new Context();

		add_filter( 'vector_expressions/library/apply', [ $this, 'filter_context_modifiers' ], 5, 3 );
	}

	/**
	 * Apply a named filter function to an input value.
	 *
	 * Routes all dispatch through the `vector_expressions/library/apply` hook
	 * where ModifierSet subclasses handle their own modifiers.
	 *
	 * @param string                     $fn   The filter name.
	 * @param mixed                      $in   The piped-in input value.
	 * @param array<int|string, mixed>   $args Positional or named arguments.
	 * @return mixed The transformed result.
	 */
	public function apply( string $fn, mixed $in, array $args ): mixed {
		/**
		 * Filters the result of a modifier function call.
		 *
		 * ModifierSet subclasses hook into this filter to handle their
		 * owned modifier names. Context-dependent modifiers (prop, get_post,
		 * get_user, get_meta) are handled by Library's own hook at priority 5.
		 *
		 * @param mixed                    $in   The piped-in input value.
		 * @param string                   $fn   The filter name.
		 * @param array<int|string, mixed> $args The filter arguments.
		 */
		return apply_filters( 'vector_expressions/library/apply', $in, $fn, $args );
	}

	/**
	 * Handle context-dependent modifiers that require a Context instance.
	 *
	 * Registered at priority 5 so they run before generic ModifierSet handlers.
	 *
	 * @param mixed                    $in   The piped-in input value.
	 * @param string                   $fn   The filter name.
	 * @param array<int|string, mixed> $args The filter arguments.
	 * @return mixed Transformed value, or passthrough for non-context modifiers.
	 */
	public function filter_context_modifiers( mixed $in, string $fn, array $args ): mixed {
		return match ( $fn ) {
			'prop',
			'get'         => $this->filter_prop( $in, $args ),
			'get_post',
			'resolve'     => $this->filter_get_post( $in ),
			'get_user'    => $this->filter_get_user( $in ),
			'get_meta'    => $this->filter_get_meta( $in, $args ),
			default       => $in,
		};
	}

	/**
	 * Access a property or array key on the piped-in value.
	 *
	 * @param mixed                    $in   The object or array to access.
	 * @param array<int|string, mixed> $args Args: key ([0] or named 'key').
	 * @return mixed The resolved property value, or null.
	 */
	private function filter_prop( mixed $in, array $args ): mixed {
		$key = $args['key'] ?? $args[0] ?? null;
		if ( null === $key ) {
			return $in;
		}
		return $this->context->access( $in, (string) $key );
	}

	/**
	 * Hydrate a user ID into a WP_User object.
	 *
	 * SECURITY: No capability check is applied here because the property
	 * allowlist in Context::resolve_alias() is the security boundary.
	 * Only whitelisted properties (name, id, roles, url, registered) are
	 * accessible on the returned WP_User — no sensitive fields (email,
	 * login, password hash) can be reached.
	 *
	 * @param mixed $in A numeric user ID.
	 * @return \WP_User|null The resolved user, or null.
	 */
	private function filter_get_user( mixed $in ): ?\WP_User {
		$id   = is_numeric( $in ) ? (int) $in : 0;
		$user = $id ? get_userdata( $id ) : false;
		return $user instanceof \WP_User ? $user : null;
	}

	/**
	 * Resolve a post ID to a WP_Post object.
	 *
	 * Checks `read_post` capability for security.
	 *
	 * @param mixed $in A numeric post ID.
	 * @return \WP_Post|null The resolved post or null.
	 */
	private function filter_get_post( mixed $in ): ?\WP_Post {
		$id   = is_numeric( $in ) ? (int) $in : null;
		$post = $id ? get_post( $id ) : null;

		if ( $post && ! current_user_can( 'read_post', $post->ID ) ) {
			return null;
		}

		return $post;
	}

	/**
	 * Retrieve a meta value from a WP_Post or WP_User object.
	 *
	 * @param mixed                    $in   A WP_Post or WP_User instance.
	 * @param array<int|string, mixed> $args Args: key.
	 * @return mixed The meta value or null.
	 */
	private function filter_get_meta( mixed $in, array $args ): mixed {
		$key = sanitize_text_field( (string) ( $args['key'] ?? $args[0] ?? '' ) );

		if ( ! $key || ! ( $in instanceof \WP_Post || $in instanceof \WP_User ) ) {
			return null;
		}

		if ( ObjectProxy::is_sensitive_key( $key ) ) {
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
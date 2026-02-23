<?php

declare( strict_types=1 );

namespace VectorExpressions;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Provides root-level data resolution for the expression engine.
 *
 * Maps top-level variable names (user, post, site) to their corresponding
 * WordPress data sources. Extensions may introduce new roots via the
 * `vector_expressions/context/get` filter.
 *
 * @package VectorExpressions\Context
 */
class Context {

	/**
	 * Set to true during `rest_preview` or `the_content` to prevent the current 
	 * global post's canvas from evaluating itself, causing WYSIWYG fractals.
	 *
	 * @var bool
	 */
	public bool $protect_global_content = false;

	/**
	 * Active property paths being resolved (prevents infinite recursion).
	 *
	 * @var array<string, bool>
	 */
	private array $resolution_stack = [];

	/**
	 * Check if a given property path is currently being resolved.
	 *
	 * @param string $path The property path (e.g., 'post.content').
	 * @return bool True if the path is in the resolution stack.
	 */
	public function is_resolving( string $path ): bool {
		return isset( $this->resolution_stack[ $path ] );
	}

	/**
	 * Push a property path onto the resolution stack.
	 *
	 * @param string $path The property path to track.
	 */
	public function push_resolution( string $path ): void {
		$this->resolution_stack[ $path ] = true;
	}

	/**
	 * Pop a property path off the resolution stack.
	 *
	 * @param string $path The property path to remove.
	 */
	public function pop_resolution( string $path ): void {
		unset( $this->resolution_stack[ $path ] );
	}

	/**
	 * Resolve a root-level variable name to its WordPress data object.
	 *
	 * @param string $root The root variable name (e.g. 'user', 'post', 'site').
	 * @return mixed The resolved data object, or null if unrecognized.
	 */
	public function get( string $root ): mixed {
		switch ( $root ) {
			case 'user':
				return wp_get_current_user();

			case 'post':
				return get_post();

			case 'site':
				/**
				 * Filters the global 'site' context data object.
				 *
				 * @param array<string, string> $site_data The default site data (name, url, description, language).
				 */
				return (object) apply_filters(
					'vector_expressions/context/site',
					[
						'name'        => get_bloginfo( 'name' ),
						'description' => get_bloginfo( 'description' ),
						'url'         => home_url(),
						'language'    => get_bloginfo( 'language' ),
					]
				);
		}

		/**
		 * Filters the resolved value for an unrecognized context root.
		 *
		 * Allows Pro extensions or third-party code to introduce new root
		 * variables (e.g. 'acf', 'woo', 'membership').
		 *
		 * @param mixed  $value The current resolved value (default null).
		 * @param string $root  The root variable name requested.
		 */
		return apply_filters( 'vector_expressions/context/get', null, $root );
	}

	/**
	 * Access a named key on a resolved data target.
	 *
	 * Handles arrays, plain objects, and WP_Post/WP_User with special-cased
	 * `.meta` key support via MetaProxy.
	 *
	 * @param mixed  $target The resolved root or intermediate object/array.
	 * @param mixed $key    The key to access.
	 * @return mixed The resolved value, or null if the key doesn't exist.
	 */
	public function access( mixed $target, mixed $key ): mixed {
		// Gracefully reject objects/arrays to prevent Illegal Offset crashes.
		if ( ! is_scalar( $key ) ) {
			return null;
		}
		
		$key = (string) $key;
		if ( is_array( $target ) ) {
			return $target[ $key ] ?? null;
		}

		if ( is_object( $target ) ) {
			if ( 'meta' === $key ) {
				return new \VectorExpressions\ObjectProxy( $target );
			}

			// Computed property: cannot be expressed as a simple property alias.
			if ( 'is_logged_in' === $key && $target instanceof \WP_User ) {
				return $target->ID > 0;
			}

			// Resolve post author name without exposing wp_users internals.
			if ( 'author_name' === $key && $target instanceof \WP_Post ) {
				$author = get_userdata( (int) $target->post_author );
				return $author instanceof \WP_User ? $author->display_name : '';
			}

			if ( 'url' === $key && $target instanceof \WP_Post ) {
				return get_permalink( $target ) ?: '';
			}

			$resolved = $this->resolve_alias( $target, $key );

			if ( null === $resolved ) {
				return null;
			}

			// Bulletproof check against WYSIWYG editor fractals or frontend layout duplicating
			// itself recursively. Block any property that accesses the active canvas' markup.
			if ( $this->protect_global_content && $target instanceof \WP_Post && in_array( $resolved, [ 'post_content', 'post_excerpt' ], true ) ) {
				global $post;
				if ( $post instanceof \WP_Post && $post->ID === $target->ID ) {
					return '';
				}
			}

			return $target->$resolved ?? null;
		}

		return null;
	}

	/**
	 * Map clean expression-language property names to real WP object properties.
	 *
	 * Allows authors to write `post.title` instead of `post.post_title` and
	 * `user.name` instead of `user.display_name`.
	 *
	 * @param object $target The resolved WP object.
	 * @param string $key    The requested expression-language property name.
	 * @return string The real property name to access on the object.
	 */
	private function resolve_alias( object $target, string $key ): ?string {
		if ( $target instanceof \WP_Post ) {
			/**
			 * Filters the allowed mapping properties for WP_Post objects.
			 *
			 * @param array<string, string> $allowed Expression key to WP_Post property mappings.
			 */
			$allowed = apply_filters(
				'vector_expressions/context/post_allowed_properties',
				[
					'id'      => 'ID',
					'title'   => 'post_title',
					'content' => 'post_content',
					'excerpt' => 'post_excerpt',
					'status'  => 'post_status',
					'type'    => 'post_type',
					'date'    => 'post_date',
					'author'  => 'post_author',
					'slug'    => 'post_name',
				]
			);
			return $allowed[ $key ] ?? null;
		}

		if ( $target instanceof \WP_User ) {
			/**
			 * Filters the allowed mapping properties for WP_User objects.
			 *
			 * @param array<string, string> $allowed Expression key to WP_User property mappings.
			 */
			$allowed = apply_filters(
				'vector_expressions/context/user_allowed_properties',
				[
					'id'         => 'ID',
					'name'       => 'display_name',
					'email'      => 'user_email',
					'login'      => 'user_login',
					'registered' => 'user_registered',
					'url'        => 'user_url',
					'roles'      => 'roles',
				]
			);
			return $allowed[ $key ] ?? null;
		}

		return $key;
	}
}
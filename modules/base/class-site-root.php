<?php

declare( strict_types=1 );

namespace VectorExpressions;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Site context root.
 *
 * Registers `site` as a root variable that resolves to global site settings
 * and exposes its properties in the editor autocomplete/sidebar.
 *
 * @package VectorExpressions\Base
 */
class SiteRoot extends Root {

	protected string $id          = 'site';
	protected string $label       = 'Site';
	protected string $description = 'Site-wide settings — name, URL, language…';
	protected string $group       = 'content';

	public function __construct() {
		$this->label       = __( 'Site', 'vector-expressions' );
		$this->description = __( 'Site-wide settings — name, URL, language…', 'vector-expressions' );
		parent::__construct();
	}

	protected string $icon = '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="2" y="2" width="16" height="16" rx="2" stroke="currentColor" stroke-width="1.75"/><rect x="2" y="2" width="16" height="5" rx="2" fill="currentColor"/><circle cx="5" cy="4.5" r="1" fill="white"/><circle cx="8" cy="4.5" r="1" fill="white"/></svg>';

	protected array $properties = [
		'name'        => [ 'label' => 'Name', 'entity' => 'title' ],
		'description' => 'Tagline',
		'url'         => 'URL',
		'language'    => 'Language',
	];

	protected array $quickstart = [
		[ 'expr' => 'site.name', 'label' => 'Site Name' ],
	];

	protected function resolve(): mixed {
		/**
		 * Filters the global 'site' context data object.
		 *
		 * @param array<string, string> $site_data The default site data.
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
}

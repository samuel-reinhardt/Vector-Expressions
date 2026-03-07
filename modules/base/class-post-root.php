<?php

declare( strict_types=1 );

namespace VectorExpressions;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Post context root.
 *
 * Registers `post` as a root variable that resolves to the current WP_Post
 * and exposes its properties in the editor autocomplete/sidebar.
 *
 * @package VectorExpressions\Base
 */
class PostRoot extends Root {

	protected string $id          = 'post';
	protected string $label       = 'Post';
	protected string $description = 'Current post data — title, date, meta…';
	protected string $group       = 'content';

	protected function label(): string { return __( 'Post', 'vector-expressions' ); }
	protected function description(): string { return __( 'Current post data — title, date, meta…', 'vector-expressions' ); }

	protected string $icon = '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4 2h9l4 4v13a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" fill="currentColor"/><path d="M13 2v4h4" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M6 9h8M6 12h8M6 15h5" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>';

	protected array $properties = [
		'title'       => [ 'label' => 'Title', 'entity' => 'title.raw' ],
		'excerpt'     => [ 'label' => 'Excerpt', 'type' => 'html', 'entity' => 'excerpt.raw' ],
		'content'     => [ 'label' => 'Content', 'type' => 'html', 'entity' => 'content.raw' ],
		'id'          => 'ID',
		'slug'        => 'Slug',
		'status'      => 'Status',
		'type'        => 'Type',
		'date'        => [ 'label' => 'Published Date', 'type' => 'date', 'expr' => 'post.date | date' ],
		'author_name' => [ 'label' => 'Author Name', 'entity' => '__author_name' ],
		'author'      => 'Author ID',
		'url'         => [ 'label' => 'URL', 'entity' => 'link' ],
		'meta'        => [ 'label' => 'Meta Value', 'expr' => 'post.meta.my_key' ],
	];

	protected array $patterns = [
		[ 'expr' => "post.date | date 'Y-m-d'", 'label' => 'Date (formatted)' ],
		[ 'expr' => "post.author_name | default 'Unknown Author'", 'label' => 'Author with fallback' ],
		[ 'expr' => "post.meta.subtitle | default post.title", 'label' => 'Meta with fallback' ],
		[ 'expr' => "post.title + ' — ' + site.name", 'label' => 'SEO page title' ],
		[ 'expr' => "post.date | date 'F j, Y'", 'label' => 'Post date' ],
	];

	protected array $quickstart = [
		[ 'expr' => 'post.title', 'label' => 'Post Title' ],
		[ 'expr' => "post.date | date 'F j, Y'", 'label' => 'Post Date' ],
		[ 'expr' => 'post.excerpt', 'label' => 'Excerpt' ],
		[ 'expr' => 'post.author_name', 'label' => 'Author' ],
	];

	protected function resolve(): mixed {
		return get_post();
	}
}

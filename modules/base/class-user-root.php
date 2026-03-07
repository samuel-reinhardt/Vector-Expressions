<?php

declare( strict_types=1 );

namespace VectorExpressions;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * User context root.
 *
 * Registers `user` as a root variable that resolves to the current WP_User
 * and exposes its properties in the editor autocomplete/sidebar.
 *
 * @package VectorExpressions\Base
 */
class UserRoot extends Root {

	protected string $id          = 'user';
	protected string $label       = 'User';
	protected string $description = 'Logged-in user — name, email, role…';
	protected string $group       = 'content';

	public function __construct() {
		$this->label       = __( 'User', 'vector-expressions' );
		$this->description = __( 'Logged-in user — name, email, role…', 'vector-expressions' );
		parent::__construct();
	}

	protected string $icon = '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="10" cy="6" r="4" fill="currentColor"/><path d="M2 19c0-4.4 3.6-8 8-8s8 3.6 8 8" fill="currentColor"/></svg>';

	protected array $properties = [
		'name'         => [ 'label' => 'Display Name', 'entity' => 'name' ],
		'email'        => 'Email',
		'login'        => [ 'label' => 'Username', 'entity' => 'username' ],
		'id'           => 'ID',
		'roles'        => [ 'label' => 'Role(s)', 'type' => 'array', 'expr' => "user.roles | join ', '" ],
		'is_logged_in' => [ 'label' => 'Logged In?', 'entity' => '__is_logged_in' ],
		'url'          => [ 'label' => 'Profile URL', 'entity' => 'url' ],
		'registered'   => [ 'label' => 'Registered Date', 'type' => 'date' ],
		'meta'         => [ 'label' => 'Meta Value', 'expr' => 'user.meta.my_key' ],
	];

	protected array $patterns = [
		[ 'expr' => "user.is_logged_in ? 'Hello, ' + user.name : 'Hello, Guest'", 'label' => 'Greeting by name' ],
		[ 'expr' => "user.is_logged_in ? 'member' : 'visitor'", 'label' => 'Conditional class' ],
		[ 'expr' => "user.roles | join ', ' | match administrator='Admin' editor='Editor' default='Member'", 'label' => 'Show role label' ],
		[ 'expr' => "user.name | default 'Guest'", 'label' => 'Name with fallback' ],
	];

	protected array $quickstart = [
		[ 'expr' => 'user.name', 'label' => 'User Name' ],
		[ 'expr' => 'user.is_logged_in', 'label' => 'Logged In?' ],
		[ 'expr' => "user.is_logged_in ? user.name : 'Guest'", 'label' => 'Greeting' ],
	];

	protected function resolve(): mixed {
		return wp_get_current_user();
	}
}

<?php

declare( strict_types=1 );

namespace VectorExpressions;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * A value-object wrapper that marks a string as safe for raw/unescaped output.
 *
 * Used by the `raw` filter in Library to signal to the parser that the
 * returned value should bypass the default HTML-escaping path.
 *
 * @package VectorExpressions\Library
 */
final class SafeString {

	/**
	 * Flag checked by the parser to identify safe-string object instances.
	 *
	 * @var bool
	 */
	public bool $__ve_safe = true;

	/** @var string The raw string value. */
	private string $value;

	/**
	 * @param string $value The string value to wrap as safe.
	 */
	public function __construct( string $value ) {
		$this->value = $value;
	}

	/**
	 * Return the wrapped value when cast to string.
	 *
	 * @return string The raw string.
	 */
	public function __toString(): string {
		return $this->value;
	}
}

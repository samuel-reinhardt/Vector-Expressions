<?php

declare( strict_types=1 );

namespace VectorExpressions;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Recursive-descent expression parser and template renderer.
 *
 * Parses {{ expression }} and {{{ raw }}} mustache-style tokens embedded in
 * block HTML, evaluates them against the current request context, and returns
 * the rendered string.
 *
 * @package VectorExpressions\Core
 */
class Parser {

	/** @var array<int, array{type: string, val: mixed}> */
	private array $tokens = [];

	private int $pos = 0;

	public Context $context;

	private Library $library;

	/**
	 * Per-instance recursion depth to guard against recursive templates.
	 *
	 * @var int
	 */
	private int $depth = 0;

	const MAX_DEPTH = 5;

	/**
	 * Process-level AST cache keyed by expression hash.
	 *
	 * @var array<string, mixed>
	 */
	private static array $ast_cache = [];

	public function __construct() {
		$this->context = new Context();
		$this->library = new Library( $this->context );
	}

	/**
	 * Parse a template string and replace all {{ }} / {{{ }}} / {{-- --}} tokens.
	 *
	 * @param mixed $template The raw template string (non-strings are returned as-is).
	 * @return mixed The rendered output.
	 */
	public function parse( mixed $template ): mixed {
		if ( ! is_string( $template ) ) {
			return $template;
		}

		if ( $this->depth > self::MAX_DEPTH ) {
			return $template;
		}

		$this->depth++;

		$template = $this->normalize_gutenberg_encodings( $template );

		// ---- Step 1: Mask escaped braces (\{{ → placeholder) ------------------
		$escaped_placeholder = "\x02VE_ESC\x03";
		$has_escaped         = str_contains( $template, '\\{{' );
		if ( $has_escaped ) {
			$template = str_replace( '\\{{', $escaped_placeholder, $template );
		}

		// ---- Step 2: Mask content inside <code>, <pre>, <kbd> tags ------------
		$masks = [];
		if ( preg_match( '/<(?:code|pre|kbd)[\s>]/', $template ) ) {
			$template = preg_replace_callback(
				'/<(code|pre|kbd)(\b[^>]*)>(.*?)<\/\1>/si',
				function ( array $m ) use ( &$masks ): string {
					$key          = "\x02VE_MASK_" . count( $masks ) . "\x03";
					$masks[ $key ] = $m[0];
					return $key;
				},
				$template
			);
		}

		// ---- Step 2b: Process HTML format pills (<span data-ve-expr="...">preview</span>) ------
		if ( str_contains( $template, 'data-ve-expr' ) ) {
			$template = preg_replace_callback(
				'/<span\b[^>]*\bdata-ve-expr="([^"]+)"[^>]*>.*?<\/span>/is',
				function ( array $m ): string {
					$expr = html_entity_decode( $m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8' );
					try {
						$val = $this->evaluate( $expr );
						if ( is_object( $val ) && isset( $val->__ve_safe ) ) {
							return (string) $val;
						}
						return htmlspecialchars( $this->safe_string( $val ), ENT_QUOTES, 'UTF-8' );
					} catch ( \Throwable $e ) {
						/**
						 * Fires when an expression fails to evaluate.
						 *
						 * @param \Throwable $e    The exception that was thrown.
						 * @param string    $expr The expression string that failed.
						 */
						do_action( 'vector_expressions/error', $e, $expr );
						return defined( 'WP_DEBUG' ) && WP_DEBUG && ( ! defined( 'WP_DEBUG_DISPLAY' ) || WP_DEBUG_DISPLAY ) ? '<!-- VE Error: ' . htmlspecialchars( $e->getMessage(), ENT_QUOTES, 'UTF-8' ) . ' -->' : '';
					}
				},
				$template
			) ?? $template;
		}

		// ---- Step 3: Process expression tokens --------------------------------
		$pattern = '/({{{(.*?)}}}|{{(?!--)(.*?)}}|{{--(.*?)--}})/s';

		$result = preg_replace_callback(
			$pattern,
			function ( array $matches ): string {
				// Comment block — strip entirely.
				if ( ! empty( $matches[4] ) ) {
					return '';
				}

				$is_raw  = ! empty( $matches[2] );
				$expr    = $is_raw ? $matches[2] : $matches[3];

				try {
					$val = $this->evaluate( $expr );

					// NEW: Allow Pro (like Client Hydration) to wrap the final rendered output.
					$val = apply_filters( 'vector_expressions/parser/render_token', $val, $expr, $is_raw );

					if ( is_object( $val ) && isset( $val->__ve_safe ) ) {
						return (string) $val;
					}

					if ( $is_raw ) {
						// Permits safe HTML (like <strong>, <a>, <img>) but strips <script> and iframes.
						return \wp_kses_post( $this->safe_string( $val ) );
					}

					return htmlspecialchars( $this->safe_string( $val ), ENT_QUOTES, 'UTF-8' );

				} catch ( \Throwable $e ) {
					/**
					 * Fires when an expression fails to evaluate.
					 *
					 * @param \Throwable $e    The exception that was thrown.
					 * @param string    $expr The expression string that failed.
					 */
					do_action( 'vector_expressions/error', $e, $expr );
					return defined( 'WP_DEBUG' ) && WP_DEBUG && ( ! defined( 'WP_DEBUG_DISPLAY' ) || WP_DEBUG_DISPLAY ) ? '<!-- VE Error: ' . htmlspecialchars( $e->getMessage(), ENT_QUOTES, 'UTF-8' ) . ' -->' : '';
				}
			},
			$template
		);

		// ---- Step 4: Restore masks and escaped braces -------------------------
		if ( $masks ) {
			$result = str_replace( array_keys( $masks ), array_values( $masks ), $result ?? $template );
		}

		if ( $has_escaped ) {
			$result = str_replace( $escaped_placeholder, '{{', $result ?? $template );
		}

		$this->depth--;

		return $result ?? $template;
	}

	/**
	 * Evaluate an expression string that may or may not be wrapped in {{ }}.
	 *
	 * @param string $input Raw expression or {{ expression }}.
	 * @return mixed Evaluated result.
	 */
	public function evaluate_raw( string $input ): mixed {
		$input = trim( $input );

		if ( str_starts_with( $input, '{{' ) && str_ends_with( $input, '}}' ) ) {
			$input = substr( $input, 2, -2 );
		}

		return $this->evaluate( $input );
	}

	/**
	 * Parse a block attribute value that may contain an inline {{ expression }}.
	 *
	 * @param string $value The raw attribute string.
	 * @return mixed Evaluated value, or the parsed template string.
	 */
	public function parse_attribute( string $value ): mixed {
		$trimmed = trim( $value );

		if ( preg_match( '/^{{(.*)}}$/s', $trimmed, $matches ) ) {
			return $this->evaluate( $matches[1] );
		}

		return $this->parse( $value );
	}

	/**
	 * Decode Gutenberg's URL-encoded mustache tokens back to raw characters.
	 *
	 * @param string $str Encoded template content.
	 * @return string Decoded template content.
	 */
	private function normalize_gutenberg_encodings( string $str ): string {
		// Fast path: skip replacement when no encoded tokens are present.
		if ( false === strpos( $str, '%7B' ) ) {
			return $str;
		}

		return str_replace(
			[ '%7B%7B', '%7D%7D', '%7C', '%22', '%27', '%3D' ],
			[ '{{',     '}}',     '|',   '"',   "'",   '='   ],
			$str
		);
	}

	/**
	 * Safely convert any PHP value to a string without leaking internal objects.
	 *
	 * @param mixed $val The value to stringify.
	 * @return string Safe string representation.
	 */
	private function safe_string( mixed $val ): string {
		if ( is_null( $val ) ) {
			return '';
		}

		if ( is_bool( $val ) ) {
			return $val ? '1' : '';
		}

		if ( is_scalar( $val ) ) {
			return (string) $val;
		}

		if ( is_array( $val ) ) {
			return defined( 'WP_DEBUG' ) && WP_DEBUG ? '[Array]' : '';
		}

		if ( is_object( $val ) ) {
			if ( method_exists( $val, '__toString' ) ) {
				return (string) $val;
			}
			return defined( 'WP_DEBUG' ) && WP_DEBUG ? '[Object]' : '';
		}

		return '';
	}

	/**
	 * Tokenize, parse, and run an expression string.
	 *
	 * @param string $input Raw expression.
	 * @return mixed Evaluated result.
	 */
	private function evaluate( string $input ): mixed {
		$cache_key = hash( 'sha256', $input );

		if ( isset( self::$ast_cache[ $cache_key ] ) ) {
			$ast = self::$ast_cache[ $cache_key ];
		} else {
			// Save caller's token/cursor state so recursive or sequential
			// evaluate() calls don't corrupt each other.
			$saved_tokens = $this->tokens;
			$saved_pos    = $this->pos;

			$this->tokens = $this->tokenize( $input );
			$this->pos    = 0;

			if ( empty( $this->tokens ) ) {
				$this->tokens = $saved_tokens;
				$this->pos    = $saved_pos;
				return null;
			}

			$ast = $this->parse_expression();

			// Cap the cache to prevent unbounded memory growth on pages with
			// many unique expressions.
			if ( count( self::$ast_cache ) >= 512 ) {
				self::$ast_cache = [];
			}

			self::$ast_cache[ $cache_key ] = $ast;

			// Restore caller's state after building the AST.
			$this->tokens = $saved_tokens;
			$this->pos    = $saved_pos;
		}

		return $this->run_ast( $ast );
	}

	/**
	 * Convert a raw expression string into a flat token stream.
	 *
	 * @param string $input Raw expression.
	 * @return array<int, array{type: string, val: mixed}> Token list.
	 */
	private function tokenize( string $input ): array {
		$tokens = [];
		$len    = strlen( $input );
		$cursor = 0;

		while ( $cursor < $len ) {
			$char = $input[ $cursor ];

			// Skip whitespace.
			if ( ctype_space( $char ) ) {
				$cursor++;
				continue;
			}

			// Two-character operators.
			if ( $cursor + 1 < $len ) {
				$two = substr( $input, $cursor, 2 );
				if ( in_array( $two, [ '==', '!=', '>=', '<=', '&&', '||' ], true ) ) {
					$tokens[] = [ 'type' => 'OP', 'val' => $two ];
					$cursor  += 2;
					continue;
				}
			}

			// Single-character operators.
			if ( false !== strpos( '|().[],?:=+-*/%>!<', $char ) ) {
				$tokens[] = [ 'type' => 'OP', 'val' => $char ];
				$cursor++;
				continue;
			}

			// String literals.
			if ( '"' === $char || "'" === $char ) {
				$cursor++;
				$start = $cursor;

				while ( $cursor < $len ) {
					if ( $input[ $cursor ] === $char ) {
						$bs_count = 0;
						$bs_pos   = $cursor - 1;
						while ( $bs_pos >= $start &&('\\' === $input[ $bs_pos ]) ) {
							$bs_count++;
							$bs_pos--;
						}

						if ( $bs_count % 2 === 0 ) {
							break;
						}
					}
					$cursor++;
				}

				$tokens[] = [
					'type' => 'STR',
					'val'  => str_replace( "\\$char", $char, substr( $input, $start, $cursor - $start ) ),
				];
				$cursor++;
				continue;
			}

			// Numeric literals.
			if ( is_numeric( $char ) ) {
				$start = $cursor;
				while ( $cursor < $len && ( is_numeric( $input[ $cursor ] ) || '.' === $input[ $cursor ] ) ) {
					$cursor++;
				}
				$tokens[] = [ 'type' => 'NUM', 'val' => substr( $input, $start, $cursor - $start ) ];
				continue;
			}

			// Identifiers and keywords.
			if ( preg_match( '/[a-zA-Z_]/', $char ) ) {
				$start = $cursor;
				while ( $cursor < $len && preg_match( '/[a-zA-Z0-9_]/', $input[ $cursor ] ) ) {
					$cursor++;
				}

				$val   = substr( $input, $start, $cursor - $start );
				$lower = strtolower( $val );

				if ( 'true' === $lower ) {
					$tokens[] = [ 'type' => 'BOOL', 'val' => true ];
				} elseif ( 'false' === $lower ) {
					$tokens[] = [ 'type' => 'BOOL', 'val' => false ];
				} elseif ( 'null' === $lower ) {
					$tokens[] = [ 'type' => 'NULL', 'val' => null ];
				} else {
					$tokens[] = [ 'type' => 'ID', 'val' => $val ];
				}
				continue;
			}

			$cursor++;
		}

		return $tokens;
	}

	/** @return mixed AST node. */
	private function parse_expression(): mixed {
		$left = $this->parse_ternary();

		while ( $this->match( '|' ) ) {
			$name = $this->consume( 'ID' );
			if ( ! $name ) break; // no filter name — stop.
			$name = $name['val'];
			$args = [];

			$loop_safety = 0;
			while ( $this->peek() && ! in_array( $this->peek()['val'], [ '|', ')' ], true ) ) {
				$before = $this->pos;
				if ( ( $this->peek( 'ID' ) || $this->peek( 'STR' ) ) && $this->peek_next( 'OP', '=' ) ) {
					$k          = $this->consume()['val'];
					$this->consume( 'OP', '=' );
					$args[ $k ] = $this->parse_ternary();
				} else {
					$args[] = $this->parse_ternary();
				}
				// Guard: if pos didn't advance, an unrecognised token would loop forever.
				if ( $this->pos === $before || ++$loop_safety > 64 ) {
					$this->pos++; // skip the stuck token.
					break;
				}
			}

			$left = [ 'type' => 'FILTER', 'in' => $left, 'fn' => $name, 'args' => $args ];
		}

		return $left;
	}

	/** @return mixed AST node. */
	private function parse_ternary(): mixed {
		$condition = $this->parse_or();

		if ( ! $this->match( '?' ) ) {
			return $condition;
		}

		$truthy = $this->parse_ternary();
		$this->consume( 'OP', ':' );
		$falsy = $this->parse_ternary();

		return [ 'type' => 'TERNARY', 'c' => $condition, 't' => $truthy, 'f' => $falsy ];
	}

	/** @return mixed AST node. */
	private function parse_or(): mixed {
		$left = $this->parse_and();
		while ( $this->match( '||' ) ) {
			$left = [ 'type' => 'BIN', 'op' => '||', 'l' => $left, 'r' => $this->parse_and() ];
		}
		return $left;
	}

	/** @return mixed AST node. */
	private function parse_and(): mixed {
		$left = $this->parse_eq();
		while ( $this->match( '&&' ) ) {
			$left = [ 'type' => 'BIN', 'op' => '&&', 'l' => $left, 'r' => $this->parse_eq() ];
		}
		return $left;
	}

	/** @return mixed AST node. */
	private function parse_eq(): mixed {
		$left = $this->parse_rel();
		while ( $op = $this->match_any( [ '==', '!=' ] ) ) {
			$left = [ 'type' => 'BIN', 'op' => $op, 'l' => $left, 'r' => $this->parse_rel() ];
		}
		return $left;
	}

	/** @return mixed AST node. */
	private function parse_rel(): mixed {
		$left = $this->parse_add();
		while ( $op = $this->match_any( [ '<', '>', '<=', '>=' ] ) ) {
			$left = [ 'type' => 'BIN', 'op' => $op, 'l' => $left, 'r' => $this->parse_add() ];
		}
		return $left;
	}

	/** @return mixed AST node. */
	private function parse_add(): mixed {
		$left = $this->parse_mult();
		while ( $op = $this->match_any( [ '+', '-' ] ) ) {
			$left = [ 'type' => 'BIN', 'op' => $op, 'l' => $left, 'r' => $this->parse_mult() ];
		}
		return $left;
	}

	/** @return mixed AST node. */
	private function parse_mult(): mixed {
		$left = $this->parse_access();
		while ( $op = $this->match_any( [ '*', '/', '%' ] ) ) {
			$left = [ 'type' => 'BIN', 'op' => $op, 'l' => $left, 'r' => $this->parse_access() ];
		}
		return $left;
	}

	/** @return mixed AST node. */
	private function parse_access(): mixed {
		$node        = $this->parse_atom();
		$loop_safety = 0;

		while ( ++$loop_safety <= 64 ) {
			if ( $this->match( '.' ) ) {
				$id = $this->consume( 'ID' );
				if ( ! $id ) break; // e.g. "post." with nothing after the dot.
				$node = [ 'type' => 'GET', 't' => $node, 'k' => $id['val'] ];
			} elseif ( $this->match( '[' ) ) {
				$key  = $this->parse_expression();
				$this->consume( 'OP', ']' );
				$node = [ 'type' => 'GET_DYN', 't' => $node, 'k' => $key ];
			} else {
				break;
			}
		}

		return $node;
	}

	/** @return mixed AST node or null. */
	private function parse_atom(): mixed {
		if ( $this->match( '(' ) ) {
			$expr = $this->parse_expression();
			$this->consume( 'OP', ')' );
			return $expr;
		}

		if ( $this->match( '!' ) ) {
			return [ 'type' => 'UNARY', 'op' => '!', 't' => $this->parse_access() ];
		}

		if ( $t = $this->consume( 'ID' ) ) {
			return [ 'type' => 'VAR', 'v' => $t['val'] ];
		}

		if ( $t = $this->consume( 'STR' ) ) {
			return [ 'type' => 'STR', 'v' => $t['val'] ];
		}

		if ( $t = $this->consume( 'NUM' ) ) {
			return [ 'type' => 'NUM', 'v' => floatval( $t['val'] ) ];
		}

		if ( $t = $this->consume( 'BOOL' ) ) {
			return [ 'type' => 'BOOL', 'v' => $t['val'] ];
		}

		if ( $this->consume( 'NULL' ) ) {
			return [ 'type' => 'NULL' ];
		}

		return null;
	}

	/**
	 * Return the current token without consuming it.
	 *
	 * @param string|null $type Optional type filter.
	 * @param mixed       $val  Optional value filter.
	 * @return array<string, mixed>|null Current token or null.
	 */
	private function peek( ?string $type = null, mixed $val = null ): ?array {
		if ( ! isset( $this->tokens[ $this->pos ] ) ) {
			return null;
		}

		$token = $this->tokens[ $this->pos ];

		if ( $type && $token['type'] !== $type ) {
			return null;
		}

		if ( null !== $val && $token['val'] !== $val ) {
			return null;
		}

		return $token;
	}

	/**
	 * Look one token ahead without consuming anything.
	 *
	 * @param string $type Expected type.
	 * @param mixed  $val  Expected value.
	 * @return bool True if the next token matches.
	 */
	private function peek_next( string $type, mixed $val ): bool {
		if ( ! isset( $this->tokens[ $this->pos + 1 ] ) ) {
			return false;
		}

		$token = $this->tokens[ $this->pos + 1 ];
		return $token['type'] === $type && $token['val'] === $val;
	}

	/**
	 * Consume the current operator token if it matches the given value.
	 *
	 * @param string $val Operator value to match.
	 * @return string|false The matched value or false.
	 */
	private function match( string $val ): string|false {
		if ( $this->peek( 'OP', $val ) ) {
			$this->pos++;
			return $val;
		}
		return false;
	}

	/**
	 * Try each value in the list and consume the first match.
	 *
	 * @param string[] $values List of operator values to try.
	 * @return string|false The first matched value or false.
	 */
	private function match_any( array $values ): string|false {
		foreach ( $values as $v ) {
			if ( $m = $this->match( $v ) ) {
				return $m;
			}
		}
		return false;
	}

	/**
	 * Consume and return the current token, optionally asserting type/value.
	 *
	 * @param string|null $type Optional type filter.
	 * @param mixed       $val  Optional value filter.
	 * @return array<string, mixed>|null Consumed token or null.
	 */
	private function consume( ?string $type = null, mixed $val = null ): ?array {
		$token = $this->peek( $type, $val );

		if ( $token ) {
			$this->pos++;
		}

		return $token;
	}

	/**
	 * Build a string representation of an AST property access path for tracking.
	 * 
	 * @param mixed $node The AST node to trace.
	 * @return string The resolved path (e.g., 'post.content').
	 */
	private function stringify_ast_path( mixed $node ): string {
		if ( ! $node || ! isset( $node['type'] ) ) {
			return '';
		}

		if ( 'VAR' === $node['type'] ) {
			return (string) $node['v'];
		}

		if ( 'GET' === $node['type'] ) {
			$parent = $this->stringify_ast_path( $node['t'] );
			return $parent ? $parent . '.' . $node['k'] : '';
		}

		return '';
	}

	/**
	 * Recursively evaluate an AST node.
	 *
	 * @param mixed $node Parsed AST node.
	 * @return mixed Evaluated result.
	 */
	private function run_ast( mixed $node, int $depth = 0 ): mixed {
		if ( ! $node ) {
			return null;
		}

		// Hard depth cap: prevents stack overflow from deeply nested ASTs.
		if ( $depth > 100 ) {
			return null;
		}

		switch ( $node['type'] ) {
			case 'STR':
				if ( false !== strpos( $node['v'], '{' ) ) {
					$interpolated = preg_replace_callback(
						'/(?<!\\\\){(.*?)}/',
						fn( array $m ) => $this->safe_string( $this->evaluate( $m[1] ) ),
						$node['v']
					);
					return str_replace( '\{', '{', $interpolated ?? $node['v'] );
				}
				return $node['v'];

			case 'NUM':
				return $node['v'];

			case 'BOOL':
				return $node['v'];

			case 'NULL':
				return null;

			case 'VAR':
				return $this->context->get( $node['v'] );

			case 'GET':
				$path = $this->stringify_ast_path( $node );
				
				// Prevent infinite recursion by checking if we are already resolving this path.
				if ( $path && $this->context->is_resolving( $path ) ) {
					return '';
				}

				if ( $path ) {
					$this->context->push_resolution( $path );
				}

				try {
					return $this->context->access( $this->run_ast( $node['t'], $depth + 1 ), $node['k'] );
				} finally {
					if ( $path ) {
						$this->context->pop_resolution( $path );
					}
				}

			case 'GET_DYN':
				return $this->context->access( $this->run_ast( $node['t'], $depth + 1 ), $this->run_ast( $node['k'], $depth + 1 ) );

			case 'UNARY':
				return ! $this->run_ast( $node['t'], $depth + 1 );

			case 'TERNARY':
				return $this->run_ast( $node['c'], $depth + 1 )
					? $this->run_ast( $node['t'], $depth + 1 )
					: $this->run_ast( $node['f'], $depth + 1 );

			case 'BIN':
				$l = $this->run_ast( $node['l'], $depth + 1 );

				// Short-circuit logic must happen BEFORE evaluating $r
				if ( '&&' === $node['op'] ) {
					return $l ? (bool) $this->run_ast( $node['r'], $depth + 1 ) : false;
				}
				if ( '||' === $node['op'] ) {
					return $l ? true : (bool) $this->run_ast( $node['r'], $depth + 1 );
				}

				$r = $this->run_ast( $node['r'], $depth + 1 );

				switch ( $node['op'] ) {
					case '+':
						if ( ( is_string( $l ) && ! is_numeric( $l ) ) ||
						     ( is_string( $r ) && ! is_numeric( $r ) ) ) {
							return $this->safe_string( $l ) . $this->safe_string( $r );
						}
						
						$l_num = is_scalar( $l ) ? (float) $l : 0;
						$r_num = is_scalar( $r ) ? (float) $r : 0;
						return $l_num + $r_num;
					case '-':
						$l_num = is_scalar( $l ) ? (float) $l : 0;
						$r_num = is_scalar( $r ) ? (float) $r : 0;
						return $l_num - $r_num;
					case '*':
						$l_num = is_scalar( $l ) ? (float) $l : 0;
						$r_num = is_scalar( $r ) ? (float) $r : 0;
						return $l_num * $r_num;
					case '/':
						$l_num = is_scalar( $l ) ? (float) $l : 0;
						$r_num = is_scalar( $r ) ? (float) $r : 0;
						return 0 == $r_num ? 0 : $l_num / $r_num; // phpcs:ignore WordPress.PHP.StrictComparisons.LooseComparison
					case '%':
						$l_num = is_scalar( $l ) ? (int) $l : 0;
						$r_num = is_scalar( $r ) ? (int) $r : 0;
						return 0 == $r_num ? 0 : $l_num % $r_num; // phpcs:ignore WordPress.PHP.StrictComparisons.LooseComparison
					case '==': return $l == $r;  // phpcs:ignore WordPress.PHP.StrictComparisons.LooseComparison
					case '!=': return $l != $r;  // phpcs:ignore WordPress.PHP.StrictComparisons.LooseComparison
					case '>':  return $l > $r;
					case '<':  return $l < $r;
					case '>=': return $l >= $r;
					case '<=': return $l <= $r;
				}
				break;

			case 'FILTER':
				$in = $this->run_ast( $node['in'], $depth + 1 );

				// 1. Native Engine Filters (Stateful)
				if ( 'render' === $node['fn'] ) {
					// If the input is a string containing expressions, recursively parse it.
					// It safely utilizes the existing MAX_DEPTH recursion guard.
					return ( is_string( $in ) && str_contains( $in, '{{' ) ) 
						? $this->parse( $in ) 
						: $in;
				}

				// 2. Library Filters (Stateless)
				$args = [];
				foreach ( $node['args'] as $k => $v ) {
					$args[ $k ] = $this->run_ast( $v, $depth + 1 );
				}
				
				return $this->library->apply( $node['fn'], $in, $args );
		}

		return null;
	}
}
/**
 * Vector Expressions — Global Paste Scanner.
 *
 * Watches all blocks in the editor for raw {{ expression }} text that
 * hasn't been converted to `<span class="vectex-expr-token">` format
 * tokens. When found, wraps them in the proper span markup and updates
 * the block attributes so the expressions render as interactive pills.
 *
 * This covers all entry paths:
 *   - Pasting block HTML via the Code Editor
 *   - Pasting rich/plain text in the Visual Editor
 *   - Block duplication, template insertion, etc.
 *
 * The scanner runs on a debounced `wp.data.subscribe` callback to avoid
 * excessive processing on every keystroke.
 */

const { subscribe, select, dispatch } = window.wp.data;

/**
 * Matches raw {{ expression }} tokens that are NOT already inside a
 * `<span … data-vectex-expr` tag. Uses a negative lookbehind to skip
 * tokens that are part of an existing span's inner text (the span's
 * opening tag always precedes the text).
 *
 * Group 1: the full match including braces.
 * Group 2: the inner expression text.
 */
const RAW_TOKEN_RE = /\{\{\s*(.+?)\s*\}\}/g;

/**
 * Test whether an HTML string contains raw {{ }} tokens that are not
 * already wrapped in vectex-expr-token spans.
 *
 * @param {string} html Block content HTML.
 * @returns {boolean} True if unformatted tokens exist.
 */
const hasRawTokens = ( html ) => {
	if ( ! html || typeof html !== 'string' ) return false;
	if ( ! html.includes( '{{' ) ) return false;

	// Strip existing span tokens then check if {{ }} remain.
	const stripped = html.replace(
		/<span\b[^>]*\bvectex-expr-token\b[^>]*>.*?<\/span>/gi,
		''
	);
	return RAW_TOKEN_RE.test( stripped );
};

/**
 * Wrap raw {{ expression }} tokens in the proper span markup.
 *
 * Skips tokens that are already inside a `<span … vectex-expr-token>` tag
 * by first masking existing spans, then processing remaining tokens, and
 * finally restoring the masks.
 *
 * @param {string} html Raw block content HTML.
 * @returns {string} HTML with tokens wrapped in expression spans.
 */
const wrapTokens = ( html ) => {
	// Mask existing expression spans to prevent double-wrapping.
	const masks = [];
	let masked = html.replace(
		/<span\b[^>]*\bvectex-expr-token\b[^>]*>.*?<\/span>/gi,
		( match ) => {
			const key = `\x02VE_MASK_${ masks.length }\x03`;
			masks.push( match );
			return key;
		}
	);

	// Also mask content inside <code>, <pre>, <kbd> to avoid converting
	// expression syntax shown as documentation examples.
	const codeMasks = [];
	masked = masked.replace(
		/<(code|pre|kbd)(\b[^>]*)>(.*?)<\/\1>/gis,
		( match ) => {
			const key = `\x02VE_CODE_${ codeMasks.length }\x03`;
			codeMasks.push( match );
			return key;
		}
	);

	// Wrap remaining raw {{ expression }} tokens.
	RAW_TOKEN_RE.lastIndex = 0;
	masked = masked.replace( RAW_TOKEN_RE, ( full, inner ) => {
		const expr = inner.trim();
		if ( ! expr ) return full;
		const safeExpr = expr.replace( /"/g, '&quot;' );
		return `<span class="vectex-expr-token" data-vectex-expr="${ safeExpr }" contenteditable="false">${ full }</span>`;
	} );

	// Restore code masks, then expression masks.
	for ( let i = 0; i < codeMasks.length; i++ ) {
		masked = masked.replace( `\x02VE_CODE_${ i }\x03`, codeMasks[ i ] );
	}
	for ( let i = 0; i < masks.length; i++ ) {
		masked = masked.replace( `\x02VE_MASK_${ i }\x03`, masks[ i ] );
	}

	return masked;
};

/**
 * Recursively collect all blocks (including inner blocks) as a flat list.
 *
 * @param {Array} blocks Top-level block array.
 * @returns {Array} Flat array of all blocks.
 */
const flattenBlocks = ( blocks ) => {
	const result = [];
	for ( const block of blocks ) {
		result.push( block );
		if ( block.innerBlocks?.length ) {
			result.push( ...flattenBlocks( block.innerBlocks ) );
		}
	}
	return result;
};

/**
 * Block types whose content should never be scanned (code blocks, etc.).
 * Mirrors the server-side denylist in render_block_logic().
 */
const DENYLIST = new Set( [
	'core/code',
	'core/freeform',
	'core/preformatted',
	'core/html',
	'core/shortcode',
	'core/verse',
] );

/**
 * RichText attribute names that commonly hold user-authored HTML.
 * We scan these for raw {{ }} tokens.
 */
const RICHTEXT_ATTRS = [ 'content', 'citation', 'value', 'text', 'caption' ];

/**
 * Track block clientIds that have already been processed to avoid
 * redundant updates. Cleared when the editor post changes.
 *
 * @type {Set<string>}
 */
const processed = new Set();
let lastPostId = null;

/**
 * Initialize the global paste scanner.
 *
 * Subscribes to the block editor store and scans for raw {{ }} tokens
 * whenever blocks change. Uses a debounce to batch rapid changes.
 */
export const initPasteScanner = () => {
	let debounceId = null;

	console.log( '[VectEx PasteScanner] Initialized' );

	subscribe( () => {
		if ( debounceId ) return;
		debounceId = requestAnimationFrame( () => {
			debounceId = null;
			scanBlocks();
		} );
	} );
};

/**
 * Scan all blocks for raw {{ }} tokens and wrap them in expression spans.
 */
const scanBlocks = () => {
	const blockEditor = select( 'core/block-editor' );
	if ( ! blockEditor ) {
		console.log( '[VectEx PasteScanner] No block editor store' );
		return;
	}

	const blocks = blockEditor.getBlocks();
	if ( ! blocks?.length ) {
		console.log( '[VectEx PasteScanner] No blocks found' );
		return;
	}

	console.log( `[VectEx PasteScanner] Scanning ${ blocks.length } top-level blocks` );

	// Reset processed set when the editor post changes.
	const editor = select( 'core/editor' );
	const postId = editor?.getCurrentPostId?.() || 0;
	if ( postId !== lastPostId ) {
		processed.clear();
		lastPostId = postId;
	}

	const allBlocks = flattenBlocks( blocks );
	const updates = [];

	for ( const block of allBlocks ) {
		if ( processed.has( block.clientId ) ) continue;
		if ( DENYLIST.has( block.name ) ) {
			processed.add( block.clientId );
			continue;
		}

		const attrs = block.attributes;
		if ( ! attrs ) continue;

		let changed = false;
		const newAttrs = {};

		for ( const attr of RICHTEXT_ATTRS ) {
			const rawVal = attrs[ attr ];
			if ( rawVal == null ) continue;

			// Gutenberg 6.2+ stores RichText attributes as RichTextData
			// objects, not plain strings. Coerce to HTML string.
			let val;
			if ( typeof rawVal === 'string' ) {
				val = rawVal;
			} else if ( typeof rawVal?.toHTMLString === 'function' ) {
				val = rawVal.toHTMLString();
			} else if ( typeof rawVal?.toString === 'function' ) {
				val = rawVal.toString();
			} else {
				continue;
			}

			if ( ! val ) continue;

			console.log( `[VectEx PasteScanner] Block ${ block.name } (${ block.clientId.slice(0,8) }) attr="${ attr }" type=${ typeof rawVal }${ typeof rawVal === 'object' ? ' (' + rawVal?.constructor?.name + ')' : '' }`, val.substring( 0, 150 ) );

			const raw = hasRawTokens( val );
			if ( val.includes( '{{' ) ) {
				console.log( `[VectEx PasteScanner]   → has {{ }}, hasRawTokens=${ raw }` );
			}
			if ( ! raw ) continue;

			const wrapped = wrapTokens( val );
			console.log( `[VectEx PasteScanner]   → Wrapping!`, { before: val.substring(0,120), after: wrapped.substring(0,120) } );
			newAttrs[ attr ] = wrapped;
			changed = true;
		}

		processed.add( block.clientId );

		if ( changed ) {
			updates.push( { clientId: block.clientId, attrs: newAttrs } );
		}
	}

	// Batch attribute updates.
	if ( updates.length > 0 ) {
		const { updateBlockAttributes } = dispatch( 'core/block-editor' );
		for ( const { clientId, attrs } of updates ) {
			updateBlockAttributes( clientId, attrs );
		}
	}
};

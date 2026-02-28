/**
 * Vector Expressions — LogicPanel HOC.
 *
 * Injects the "Vector Logic" inspector panel into every block and handles
 * two-phase `{{ expr }}` token conversion:
 *
 *   Pass 1 — Synchronous: intercepts `setAttributes` to convert `{{ expr }}`
 *             to `<span>` pills before the update reaches the block store.
 *   Pass 2 — Async:
 *      The hook parses the raw block HTML to find un-evaluated `<span>` pills
 *      and issues a batch REST API request to evaluate them. It injects the
 *      resolved text into each span's `data-ve-view` attribute.
 */

import { getCompletions, SKIP_CONVERT_BLOCKS, TOKEN_REGEX } from './constants.js';
import { useHydrateViews, getCachedView }              from './hydrator.js';
import { VectorArrowLogo }                           from './logo.jsx';
import { AutoTextarea }                              from './auto-textarea.jsx';

const {
	Fragment, useState, useMemo, useCallback,
} = window.wp.element;
const { createHigherOrderComponent }                  = window.wp.compose;
const { addFilter }                                   = window.wp.hooks;
const { InspectorControls }                           = window.wp.blockEditor;
const { PanelBody, Button,
	SelectControl, ExternalLink }                     = window.wp.components;
const { __ }                                          = window.wp.i18n;
const { select }                                      = window.wp.data;

/**
 * Returns the name of the first `html` or `rich-text` attribute for a block
 * type, or `null` when none exists.
 *
 * @param {string} blockName
 * @returns {string|null}
 */
const getRichTextAttrName = ( blockName ) => {
	const blockType = select( 'core/blocks' ).getBlockType( blockName );
	if ( ! blockType?.attributes ) return null;
	const entry = Object.entries( blockType.attributes ).find(
		( [ , cfg ] ) => cfg.source === 'html' || cfg.source === 'rich-text'
	);
	return entry ? entry[ 0 ] : null;
};

/**
 * Parses `{{ expression }}` logic in the Raw text mode and converts them into
 * `<span class="ve-expr-token">` pills, skipping already-converted spans
 * and speculative spans.
 *
 * @param {string} html Raw attribute HTML.
 * @returns {string} Converted HTML (same reference if nothing changed).
 */
const convertTokens = ( html, postId = 0 ) => {
	// Reset lastIndex before re-using the shared global-flag RegExp.
	TOKEN_REGEX.lastIndex = 0;
	return html.replace(
		TOKEN_REGEX,
		( match, existingSpan, codeBlock, _fullExpr, expr ) => {
			if ( codeBlock ) return codeBlock;

			// Already a converted span — leave it alone.
			if ( existingSpan && existingSpan.startsWith( '<span ' ) ) {
				return existingSpan;
			}

			const e        = expr.trim().replace( /\s*\|\s*/g, ' | ' );
			const safeExpr = e.replace( /"/g, '&quot;' );

			// Include cached preview so the format data has the view
			// from the start — preventing flash on React re-renders.
			const cached   = getCachedView( e, postId );
			let viewAttrs  = '';
			if ( cached !== undefined ) {
				const safeView = cached.replace( /"/g, '&quot;' );
				const isEmpty  = ! cached.trim().replace( /\u00a0/g, '' );
				viewAttrs = ` data-ve-view="${ safeView }"${ isEmpty ? ' data-ve-empty=""' : '' }`;
			}

			return `<span class="ve-expr-token" data-ve-expr="${ safeExpr }"${ viewAttrs } contenteditable="false">{{ ${ e } }}</span>`;
		},
	);
};

/**
 * Returns a memoised `setAttributes` wrapper that runs Pass 1 conversion
 * synchronously before any update reaches the block store.
 *
 * Bypasses conversion entirely for blocks in `SKIP_CONVERT_BLOCKS` and for
 * attribute updates that do not touch the rich-text attribute.
 *
 * @param {Function} setAttributes Original setter from block props.
 * @param {string|null} attrName   Name of the rich-text attribute.
 * @param {string} blockName       Block slug.
 * @returns {Function}
 */
const usePass1Conversion = ( setAttributes, attrName, blockName, postId ) =>
	useCallback(
		( attrs ) => {
			if ( ! attrName || SKIP_CONVERT_BLOCKS.has( blockName ) ) return setAttributes( attrs );
			if ( ! ( attrName in attrs ) )                             return setAttributes( attrs );

			const raw  = attrs[ attrName ];
			const html = typeof raw === 'string' ? raw : String( raw ?? '' );
			if ( ! html.includes( '{{' ) )                             return setAttributes( attrs );

			const converted = convertTokens( html, postId );
			setAttributes( converted !== html
				? { ...attrs, [ attrName ]: converted }
				: attrs
			);
		},
		[ setAttributes, attrName, blockName, postId ],
	);



/**
 * ClassTextarea — thin wrapper around AutoTextarea with the class-field
 * label and help text layout.
 *
 * @param {{ value: string, onChange: Function, placeholder: string }} props
 */
const ClassTextarea = ( { value, onChange, placeholder } ) => {
	const { __ } = window.wp.i18n;
	return (
		<div className="ve-class-field">
			<label
				className="components-base-control__label"
				htmlFor="ve-class-input"
			>
				{ __( 'Template', 'vector-expressions' ) }
			</label>
			<AutoTextarea
				id="ve-class-input"
				value={ value }
				onChange={ onChange }
				placeholder={ placeholder }
			/>
			<p className="components-base-control__help">
				{ __( 'Mix static text and', 'vector-expressions' ) }{ ' ' }
				<code>{ '{{ expressions }}' }</code>{ ' ' }
				{ __( 'freely. Each token is evaluated and the full string becomes the class.', 'vector-expressions' ) }
			</p>
		</div>
	);
};

/**
 * Pure render component for the "Vector Logic" inspector panel.
 *
 * @param {{
 *   ve_logic:    object|undefined,
 *   update:      (key: string, value: *) => void,
 *   showRef:     boolean,
 *   setShowRef:  Function,
 * }} props
 */
const LogicInspectorPanel = ( { ve_logic, update, showRef, setShowRef } ) => {

	return (
		<PanelBody
			title={
				<span className="ve-panel-title">
					<VectorArrowLogo />
					{ __( 'Vector Expressions', 'vector-expressions' ) }
				</span>
			}
			initialOpen={ false }
		>
			{ /* ── Visibility ───────────────────────────────── */ }
			<div className="ve-section">
				<p className="ve-section-label">{ __( 'Visibility', 'vector-expressions' ) }</p>

				<SelectControl
					label={ __( 'Action', 'vector-expressions' ) }
					value={ ve_logic?.visible_action || 'show' }
					options={ [
						{ label: __( 'Show if True', 'vector-expressions' ), value: 'show' },
						{ label: __( 'Hide if True', 'vector-expressions' ), value: 'hide' },
					] }
					onChange={ ( v ) => update( 'visible_action', v ) }
					__nextHasNoMarginBottom
				/>

				<div className="ve-class-field">
					<label
						className="components-base-control__label"
						htmlFor="ve-condition-input"
					>
						{ __( 'Condition', 'vector-expressions' ) }
					</label>
					<AutoTextarea
						id="ve-condition-input"
						value={ ve_logic?.visible || '' }
						onChange={ ( v ) => update( 'visible', v ) }
						placeholder="user.is_logged_in"
						className="ve-class-textarea"
					/>
				</div>

				{ /* Syntax Reference – right below the field it helps with */ }
				<div className="ve-syntax-ref-wrap">
					<Button
						variant="link"
						size="small"
						className="ve-syntax-ref-toggle"
						onClick={ () => setShowRef( ! showRef ) }
						aria-expanded={ showRef }
					>
						{ __( 'Syntax reference', 'vector-expressions' ) }{ ' ' }{ showRef ? '▲' : '▼' }
					</Button>
					{ showRef && (
						<table className="ve-syntax-ref">
							<tbody>
								<tr className="ve-ref-head"><th colSpan="2">{ __( 'Variables', 'vector-expressions' ) }</th></tr>
								<tr><td><code>{ 'user.name' }</code></td><td>{ __( 'Display name', 'vector-expressions' ) }</td></tr>
								<tr><td><code>{ 'user.is_logged_in' }</code></td><td>{ __( 'Logged in?', 'vector-expressions' ) }</td></tr>
								<tr><td><code>{ 'user.role' }</code></td><td>{ __( 'User role', 'vector-expressions' ) }</td></tr>
								<tr><td><code>{ 'post.title' }</code></td><td>{ __( 'Post title', 'vector-expressions' ) }</td></tr>
								<tr><td><code>{ 'post.author_name' }</code></td><td>{ __( 'Author name', 'vector-expressions' ) }</td></tr>
								<tr><td><code>{ 'post.meta.my_key' }</code></td><td>{ __( 'Post meta', 'vector-expressions' ) }</td></tr>
								<tr className="ve-ref-head"><th colSpan="2">{ __( 'Operators & Filters', 'vector-expressions' ) }</th></tr>
								<tr><td><code>{ 'a == b' }</code></td><td>{ __( 'Equals', 'vector-expressions' ) }</td></tr>
								<tr><td><code>{ 'a ? b : c' }</code></td><td>{ __( 'Ternary', 'vector-expressions' ) }</td></tr>
								<tr><td><code>{ 'val | upper' }</code></td><td>{ __( 'Filter', 'vector-expressions' ) }</td></tr>
								<tr><td><code>{ 'post.date | date' }</code></td><td>{ __( 'Format date', 'vector-expressions' ) }</td></tr>
								<tr><td><code>{ "post.author | get_user" }</code></td><td>{ __( 'Author object', 'vector-expressions' ) }</td></tr>
							</tbody>
						</table>
					) }
				</div>
			</div>

			{ /* ── Dynamic Class ────────────────────────────── */ }
			<div className="ve-section ve-section--bordered">
				<p className="ve-section-label">{ __( 'Dynamic Class', 'vector-expressions' ) }</p>

				<ClassTextarea
					value={ ve_logic?.class || '' }
					onChange={ ( v ) => update( 'class', v ) }
					placeholder={ `prefix-{{ user.role | kebab }}` }
				/>
			</div>

		</PanelBody>
	);
};

/**
 * HOC that wraps every `BlockEdit` with a "Vector Logic" inspector panel.
 *
 * Unconditionally applies Pass 1 (synchronous token conversion) and
 * Pass 2 (async preview resolution). Inspector controls are only rendered
 * when the block is selected.
 */
const LogicPanel = createHigherOrderComponent( ( BlockEdit ) => {
	return ( props ) => {
		const { attributes, setAttributes, isSelected, name, context, clientId } = props;
		const { ve_logic }  = attributes;
		const [ showRef, setShowRef ] = useState( false );

		const attrName  = useMemo( () => getRichTextAttrName( name ), [ name ] );
		const postId    = context?.postId || select( 'core/editor' )?.getCurrentPostId?.() || 0;
		const postType  = context?.postType || select( 'core/editor' )?.getCurrentPostType?.() || 'post';

		const wrappedSetAttributes = usePass1Conversion( setAttributes, attrName, name, postId );
		const newProps             = { ...props, setAttributes: wrappedSetAttributes };

		// Hydrate expression tokens with server-evaluated previews.
		// Runs per-block so it has the correct postId for Query Loop iterations.
		useHydrateViews( attributes, setAttributes, attrName, name, postId, postType, clientId );

		if ( ! isSelected ) return <BlockEdit { ...newProps } />;

		const update = ( key, val ) =>
			setAttributes( { ve_logic: { ...( ve_logic ?? {} ), [ key ]: val } } );

		return (
			<Fragment>
				<BlockEdit { ...newProps } />
				<InspectorControls>
					<LogicInspectorPanel
						ve_logic={ ve_logic }
						update={ update }
						showRef={ showRef }
						setShowRef={ setShowRef }
					/>
				</InspectorControls>
			</Fragment>
		);
	};
}, 'LogicPanel' );

/**
 * Register the LogicPanel HOC with Gutenberg's `editor.BlockEdit` filter.
 * Called once from the editor entry point.
 */
export const registerLogicPanel = () => {
	addFilter( 'editor.BlockEdit', 've/logic-panel', LogicPanel );
	
	const REQUIRED_CONTEXT = [ 'postId', 'postType' ];

	// Intercept future block registrations.
	addFilter( 'blocks.registerBlockType', 've-logic/inject-context', ( settings, name ) => {
		if ( SKIP_CONVERT_BLOCKS.has( name ) ) return settings;
		const existing = settings.usesContext || [];
		const missing  = REQUIRED_CONTEXT.filter( ( c ) => ! existing.includes( c ) );
		if ( missing.length === 0 ) return settings;
		return { ...settings, usesContext: [ ...existing, ...missing ] };
	} );

	// Patch block types that were already registered before our filter.
	// Without this, core blocks like core/paragraph never receive
	// context.postId from Query Loop iterations, and all previews
	// repeat the first iteration's values.
	const { getBlockTypes, unregisterBlockType, registerBlockType } = window.wp.blocks;
	( getBlockTypes() || [] ).forEach( ( type ) => {
		if ( SKIP_CONVERT_BLOCKS.has( type.name ) ) return;
		const existing = type.usesContext || [];
		const missing  = REQUIRED_CONTEXT.filter( ( c ) => ! existing.includes( c ) );
		if ( missing.length === 0 ) return;

		// Mutate the type object directly — Gutenberg stores a mutable
		// reference in its internal registry. This avoids the cost and
		// side-effects of an unregister/re-register cycle.
		type.usesContext = [ ...existing, ...missing ];
	} );
};

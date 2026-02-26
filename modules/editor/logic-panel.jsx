/**
 * Vector Expressions — LogicPanel HOC.
 *
 * Injects the "Vector Logic" inspector panel into every block and handles
 * two-phase `{{ expr }}` token conversion:
 *
 *   Pass 1 — Synchronous: intercepts `setAttributes` to convert `{{ expr }}`
 *             to `<mark>` pills before the update reaches the block store.
 *   Pass 2 — Async: fetches live previews from the REST API and writes the
 *             resolved text into each mark's `data-ve-view` attribute.
 */

import { fetchPreview }                              from './api.js';
import { getCompletions, SKIP_CONVERT_BLOCKS, TOKEN_REGEX } from './constants.js';
import { VectorArrowLogo }                           from './logo.jsx';
import { AutoTextarea }                              from './auto-textarea.jsx';

const {
	Fragment, useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback,
} = window.wp.element;
const { createHigherOrderComponent }                  = window.wp.compose;
const { addFilter }                                   = window.wp.hooks;
const { InspectorControls }                           = window.wp.blockEditor;
const { PanelBody, Button,
	SelectControl, ExternalLink }                     = window.wp.components;
const { __ }                                          = window.wp.i18n;
const { select, useSelect }                           = window.wp.data;

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
 * Replaces bare `{{ expr }}` occurrences in an HTML string with
 * `<mark class="ve-expr-token">` pills, skipping already-converted marks
 * and `<code>`/`<pre>` blocks.
 *
 * @param {string} html Raw attribute HTML.
 * @returns {string} Converted HTML (same reference if nothing changed).
 */
const convertTokens = ( html ) => {
	// Reset lastIndex before re-using the shared global-flag RegExp.
	TOKEN_REGEX.lastIndex = 0;
	return html.replace(
		TOKEN_REGEX,
		( match, existingMark, codeBlock, _fullExpr, expr ) => {
			if ( codeBlock ) return codeBlock;

			// THE FIX: Aggressively re-inject the speculative flag into existing marks before saving.
			if ( existingMark ) {
				if ( ! existingMark.includes( 'data-ve-speculative' ) ) {
					return existingMark.replace( '<mark ', '<mark data-ve-speculative="true" ' );
				}
				return existingMark;
			}

			const e        = expr.trim().replace( /\s*\|\s*/g, ' | ' );
			const opt      = getCompletions().find( ( o ) => o.expr === e );
			const view     = opt?.preview || e;
			const safeExpr = e.replace( /"/g, '&quot;' );
			const safeView = view.replace( /"/g, '&quot;' );

			// ADD data-ve-speculative="true"
			return `<mark class="ve-expr-token" data-ve-expr="${ safeExpr }" data-ve-view="${ safeView }" data-ve-speculative="true" contenteditable="false">{{ ${ e } }}</mark>`;
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
const usePass1Conversion = ( setAttributes, attrName, blockName ) =>
	useCallback(
		( attrs ) => {
			if ( ! attrName || SKIP_CONVERT_BLOCKS.has( blockName ) ) return setAttributes( attrs );
			if ( ! ( attrName in attrs ) )                             return setAttributes( attrs );

			const raw  = attrs[ attrName ];
			const html = typeof raw === 'string' ? raw : String( raw ?? '' );
			if ( ! html.includes( '{{' ) )                             return setAttributes( attrs );

			const converted = convertTokens( html );
			setAttributes( converted !== html
				? { ...attrs, [ attrName ]: converted }
				: attrs
			);
		},
		[ setAttributes, attrName, blockName ],
	);

/**
 * Pass 2 — Async REST resolution.
 *
 * Watches the block's rich-text attribute for unresolved pills and fetches
 * live previews in a single deduplicated batch. Re-fetches all pills on the
 * trailing edge of a successful post-save.
 *
 * @param {object}      attributes
 * @param {Function}    setAttributes
 * @param {string}      blockName
 * @param {number}      postId
 */
const usePass2Resolution = ( attributes, attrName, blockName, postId ) => {
	const [ refreshTick, setRefreshTick ] = useState( 0 );
	const [ virtualTick, setVirtualTick ] = useState( 0 );
	const prevRefreshTick = useRef( 0 );
	const prevSaving      = useRef( false );
	const localViews      = useRef( new Map() );

	const isSavingPost = useSelect(
		( sel ) => sel( 'core/editor' )?.isSavingPost?.() ?? false,
		[],
	);

	useEffect( () => {
		const justFinished = prevSaving.current && ! isSavingPost;
		prevSaving.current = isSavingPost;
		if ( ! justFinished ) return;

		const didSucceed = select( 'core/editor' )?.didPostSaveRequestSucceed?.() ?? false;
		if ( didSucceed ) setRefreshTick( ( t ) => t + 1 );
	}, [ isSavingPost ] );

	useEffect( () => {
		if ( ! attrName || SKIP_CONVERT_BLOCKS.has( blockName ) ) return;

		const raw  = attributes[ attrName ];
		const html = typeof raw === 'string' ? raw : String( raw ?? '' );
		if ( ! html.includes( 've-expr-token' ) ) return;

		const isForced          = refreshTick !== prevRefreshTick.current;
		prevRefreshTick.current = refreshTick;

		const parser = new DOMParser();
		const doc    = parser.parseFromString( html, 'text/html' );
		const marks  = Array.from( doc.querySelectorAll( 'mark.ve-expr-token' ) );

		const toFetch = marks.reduce( ( acc, mark ) => {
			const expr          = mark.dataset.veExpr;
			const view          = mark.dataset.veView;
			if ( ! expr ) return acc;

			// Check for the speculative flag
			const isSpeculative = mark.hasAttribute( 'data-ve-speculative' );
			const unresolved    = ! view || view.trim() === expr.trim() || isSpeculative;

			if ( isForced || unresolved ) acc.push( { expr, mark } );
			return acc;
		}, [] );

		if ( toFetch.length === 0 ) return;

		let cancelled     = false;
		
		const uniqueExprs = [ ...new Set( toFetch.map( ( u ) => u.expr ) ) ];

		Promise.all(
			uniqueExprs.map( ( expr ) => fetchPreview( expr, postId ).then( ( p ) => ( { expr, preview: p?.preview || '' } ) ) )
		).then( ( results ) => {
			if ( cancelled ) return;
			let changed = false;
			results.forEach( ( r ) => {
				if ( localViews.current.get( r.expr ) !== r.preview ) {
                    localViews.current.set( r.expr, r.preview );
                    changed = true;
                }
			} );

			if ( changed ) {
				setVirtualTick( ( t ) => t + 1 );
			}
		} );

		return () => { cancelled = true; };
	}, [ attributes[ attrName ], refreshTick, postId ] );

	let virtualAttributes = attributes;

	if ( attrName && ! SKIP_CONVERT_BLOCKS.has( blockName ) ) {
		const raw = attributes[ attrName ];
		if ( typeof raw === 'string' && raw.includes( 've-expr-token' ) ) {
			const doc = new DOMParser().parseFromString( raw, 'text/html' );
			let changed = false;
			Array.from( doc.querySelectorAll( 'mark.ve-expr-token' ) ).forEach( ( mark ) => {
				const expr = mark.dataset.veExpr;
				if ( mark.hasAttribute( 'data-ve-speculative' ) ) {
					mark.removeAttribute( 'data-ve-speculative' );
					changed = true;
				}
				if ( localViews.current.has( expr ) ) {
					const p = localViews.current.get( expr );
					if ( p !== null && p !== undefined && p !== mark.dataset.veView ) {
						const hasVisibleContent = /\S/.test( p.replace( /\u00a0/g, '' ) );
						mark.dataset.veView = p ?? '';
						if ( hasVisibleContent ) {
							delete mark.dataset.veEmpty;
						} else {
							mark.dataset.veEmpty = '';
						}
						changed = true;
					}
				}
			} );

			if ( changed ) {
				virtualAttributes = {
					...attributes,
					[ attrName ]: doc.body.innerHTML
				};
			}
		}
	}

	return virtualAttributes;
};

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
		const { attributes, setAttributes, isSelected, name, context } = props;
		const { ve_logic }  = attributes;
		const [ showRef, setShowRef ] = useState( false );

		const attrName = useMemo( () => getRichTextAttrName( name ), [ name ] );

		const wrappedSetAttributes = usePass1Conversion( setAttributes, attrName, name );
		const newProps             = { ...props, setAttributes: wrappedSetAttributes };

		const postId = context?.postId || select( 'core/editor' )?.getCurrentPostId?.() || 0;

		const virtualAttributes = usePass2Resolution( attributes, attrName, name, postId );

		if ( ! isSelected ) return <BlockEdit { ...newProps } attributes={ virtualAttributes } />;

		const update = ( key, val ) =>
			setAttributes( { ve_logic: { ...( ve_logic ?? {} ), [ key ]: val } } );

		return (
			<Fragment>
				<BlockEdit { ...newProps } attributes={ virtualAttributes } />
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
	
	// Inject `postId` native context into all compatible blocks utilizing JS registry
	addFilter( 'blocks.registerBlockType', 've-logic/inject-context', ( settings, name ) => {
		if ( SKIP_CONVERT_BLOCKS.has( name ) ) return settings;
		return {
			...settings,
			usesContext: [ ...( settings.usesContext || [] ), 'postId', 'postType' ]
		};
	} );
};

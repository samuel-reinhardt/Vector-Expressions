/**
 * Vector Expressions — ExpressionEdit component + format type registration.
 *
 * Registers the `vector/expression` rich-text format and provides the
 * popover UI that lets users view, edit, and remove expression tokens.
 */

import { fetchPreview }       from './api.js';
import { POPOVER_FOCUS_DELAY, getCompletions, VE_ROOTS } from './constants.js';
import { AutoTextarea }       from './auto-textarea.jsx';

const {
	useState, useEffect, useLayoutEffect, useRef, useCallback,
} = window.wp.element;
const {
	Popover, Button, TabPanel, Icon
} = window.wp.components;
const { __ }                                    = window.wp.i18n;
const { registerFormatType, applyFormat,
	removeFormat, concat, slice, useAnchor }    = window.wp.richText;
const { select }                                = window.wp.data;

/**
 * Mirrors `data-ve-active` on the active token mark in sync with
 * Gutenberg's `isActive` prop, and strips the attribute on focusout.
 *
 * @param {boolean} isActive
 * @param {React.RefObject} contentRef
 */
const useActiveTokenState = ( isActive, contentRef ) => {
	useEffect( () => {
		const el = contentRef?.current;
		if ( ! el ) return;

		if ( isActive ) {
			const mark = el.querySelector( 'mark.ve-expr-token[data-rich-text-format-boundary]' );
			if ( mark ) mark.setAttribute( 'data-ve-active', '' );
		} else {
			el.querySelectorAll( 'mark.ve-expr-token' ).forEach( ( m ) => {
				m.removeAttribute( 'data-ve-active' );
				m.removeAttribute( 'data-rich-text-format-boundary' );
			} );
		}
	}, [ isActive, contentRef ] );

	useEffect( () => {
		const el = contentRef?.current;
		if ( ! el ) return;

		const onFocusOut = ( evt ) => {
			if ( el.contains( evt.relatedTarget ) ) return;
			el.querySelectorAll( 'mark.ve-expr-token' ).forEach( ( m ) => {
				m.removeAttribute( 'data-ve-active' );
				m.removeAttribute( 'data-rich-text-format-boundary' );
			} );
		};

		el.addEventListener( 'focusout', onFocusOut );
		return () => el.removeEventListener( 'focusout', onFocusOut );
	}, [ contentRef?.current ] );
};

/**
 * Walks up the DOM from `n` to find the nearest `mark.ve-expr-token`, or null.
 *
 * @param {Node}    n   Starting node.
 * @param {Element} el  Boundary element (the editor root).
 * @returns {Element|null}
 */
const getTokenMark = ( n, el ) => {
	let cur = n.nodeType === Node.TEXT_NODE ? n.parentElement : n;
	while ( cur && cur !== el ) {
		if ( cur.tagName === 'MARK' && cur.classList.contains( 've-expr-token' ) ) return cur;
		cur = cur.parentElement;
	}
	return null;
};

/**
 * Collapses `sel` to just before or after `mark`.
 *
 * @param {Selection}        sel
 * @param {Document}         doc
 * @param {Element}          mark
 * @param {'before'|'after'} side
 */
const placeCursorAdjacentToMark = ( sel, doc, mark, side ) => {
	const range = doc.createRange();
	if ( side === 'before' ) range.setStartBefore( mark );
	else                     range.setStartAfter( mark );
	range.collapse( true );
	sel.removeAllRanges();
	sel.addRange( range );
};

/**
 * Attaches capture-phase `keydown` and `click` listeners on the editor
 * document for token keyboard navigation and click-to-open behaviour.
 *
 * Keyboard contract:
 *   - Escape       → dismiss popover from anywhere in the iframe
 *   - Tab          → accept highlighted autocomplete suggestion
 *   - ArrowLeft/Right → jump cursor out of a contenteditable=false token
 *   - Enter/Space  → open token popover when a token is the active format
 *   - Printable    → relocate cursor adjacent to token before letting the char land
 *
 * @param {React.RefObject} contentRef
 * @param {{
 *   isActiveRef:       React.RefObject<boolean>,
 *   popoverOpenRef:    React.RefObject<boolean>,
 *   anchorRef:         React.RefObject<*>,
 *   activeMarkRef:     React.RefObject<Element>,
 *   dismissPopoverRef: React.RefObject<Function>,
 *   setPopoverOpenRef: React.RefObject<Function>,
 * }} refs
 */
const useTokenEventListeners = ( contentRef, refs ) => {
	useEffect( () => {
		const el = contentRef?.current;
		if ( ! el ) return;

		const doc = el.ownerDocument || document;

		const onKeyDown = ( evt ) => {
			const { key } = evt;

			if ( key === 'Escape' && refs.popoverOpenRef.current ) {
				evt.preventDefault();
				evt.stopPropagation();
				refs.dismissPopoverRef.current?.();
				return;
			}

			if ( ! el.contains( evt.target ) ) return;

			if ( key === 'Tab' ) {
				const listbox = doc.querySelector( '[role="listbox"].components-autocomplete__results' );
				if ( listbox ) {
					const selected = listbox.querySelector( '[aria-selected="true"]' );
					if ( selected ) {
						evt.preventDefault();
						evt.stopPropagation();
						selected.click();
					}
					return;
				}
			}

			const iframeWin = el.ownerDocument.defaultView;
			const sel       = iframeWin.getSelection();
			if ( ! sel || ! sel.rangeCount ) return;
			const range = sel.getRangeAt( 0 );
			const node  = range.startContainer;

			if ( key === 'ArrowLeft' || key === 'ArrowRight' ) {
				const mark = getTokenMark( node, el );
				if ( mark ) {
					evt.preventDefault();
					evt.stopPropagation();
					placeCursorAdjacentToMark( sel, doc, mark, key === 'ArrowLeft' ? 'before' : 'after' );
				}
			}

			if ( key === 'Enter' || key === ' ' ) {
				if ( refs.isActiveRef.current ) {
					const inside = getTokenMark( node, el );
					if ( inside || ! range.collapsed ) {
						evt.preventDefault();
						evt.stopPropagation();
						refs.activeMarkRef.current = refs.anchorRef.current;
						refs.setPopoverOpenRef.current( true );
					}
					return;
				}
			}

			// Relocate cursor adjacent to the token before any printable character
			// lands, so characters never insert inside the contenteditable=false mark.
			if (
				refs.isActiveRef.current &&
				! refs.popoverOpenRef.current &&
				key.length === 1 &&
				! evt.ctrlKey &&
				! evt.metaKey
			) {
				const mark = getTokenMark( node, el );
				if ( mark ) {
					const isStart =
						( node.nodeType === Node.TEXT_NODE || node === mark ) &&
						range.startOffset === 0;
					placeCursorAdjacentToMark( sel, doc, mark, isStart ? 'before' : 'after' );
				}
			}
		};

		const onClickToken = ( evt ) => {
			if (
				! el.contains( evt.target ) ||
				evt.target.tagName !== 'MARK' ||
				! evt.target.classList.contains( 've-expr-token' )
			) return;

			const iframeDoc = el.ownerDocument;
			const iframeWin = iframeDoc.defaultView;
			const range     = iframeDoc.createRange();
			range.setStartBefore( evt.target );
			range.collapse( true );
			iframeWin.getSelection().removeAllRanges();
			iframeWin.getSelection().addRange( range );

			refs.activeMarkRef.current = evt.target;
			refs.setPopoverOpenRef.current( true );
		};

		doc.addEventListener( 'keydown', onKeyDown, true );
		doc.addEventListener( 'click', onClickToken, true );
		return () => {
			doc.removeEventListener( 'keydown', onKeyDown, true );
			doc.removeEventListener( 'click', onClickToken, true );
		};
	}, [ contentRef ] );
};

// ── ExpressionSuggestions ────────────────────────────────────────────────────

/**
 * Derive suggestion chips from what the user has typed in the expression field.
 *
 * @param {string} expr Current expression value.
 * @returns {Array} Up to 8 suggestion items.
 */
/** Curated complex-expression patterns shown when the user picks the Patterns root. */
const VE_PATTERNS = [
	{ expr: "post.title | default 'Untitled'",                   label: 'Post title with fallback' },
	{ expr: "user.is_logged_in ? user.name : 'Guest'",           label: 'Greeting (logged in)' },
	{ expr: "post.date | date 'F j, Y'",                         label: 'Formatted publish date' },
	{ expr: "post.meta.your_field | default ''",                  label: 'Custom field value' },
	{ expr: 'site.name | upper',                                  label: 'Site name — uppercase' },
	{ expr: "user.name | default 'Friend'",                      label: 'Display name with fallback' },
	{ expr: 'post.author_name',                                   label: 'Post author name' },
	{ expr: 'post.excerpt | default post.content',               label: 'Excerpt or full content' },
];

const getSuggestions = ( expr ) => {
	const trimmed = expr.trim();

	// Nothing typed → show 4 root entry-point cards.
	if ( trimmed === '' ) return VE_ROOTS;

	// Patterns was selected — show categorized pattern chips.
	if ( trimmed === '_pattern.' ) return VE_PATTERNS;

	const lower = trimmed.toLowerCase();

	// Pipe in expr → show filter completions.
	if ( lower.includes( '|' ) ) {
		return getCompletions().filter( ( o ) => o.prefix === '|' ).slice( 0, 8 );
	}

	// Match by expr prefix first, then label substring.
	const completions = getCompletions();
	const byExpr  = completions.filter( ( o ) => o.expr.toLowerCase().startsWith( lower ) );
	const byLabel = completions.filter( ( o ) => ! o.expr.toLowerCase().startsWith( lower ) && o.label.toLowerCase().includes( lower ) );
	return [ ...byExpr, ...byLabel ].slice( 0, 8 );
};

/**
 * Horizontal scrollable chip row shown below the Expression TextControl.
 *
 * Items may be `VE_ROOTS` descriptors (root cards) or `VeCompletion` objects
 * (property / filter chips). Clicking a chip sets the expression field.
 *
 * @param {{ expr: string, onSelect: Function, inputRef: React.RefObject }} props
 */
const ExpressionSuggestions = ( { expr, onSelect, inputRef } ) => {
	const suggestions = getSuggestions( expr );
	const hasSpecificSuggestions = suggestions.length > 0 && expr.trim() !== '';
	const completions = getCompletions();

	const suggestionsGrouped = {
		common: suggestions,
		post: completions.filter( s => s.category === 'Post' ),
		user: completions.filter( s => s.category === 'User' ),
		site: completions.filter( s => s.category === 'Site' ),
		modifier: completions.filter( s => s.category === 'Modifier' ),
	};

	const renderChip = ( s ) => {
		const root    = 'prefix' in s && ! ( 'category' in s ) && ! ( 'label' in s && 'expr' in s && ! ( 'prefix' in s ) );
		const pattern = ! root && 'label' in s && 'expr' in s && ! ( 'prefix' in s ) && ! ( 'category' in s );

		// What gets inserted when this chip is clicked.
		const insertExpr = root
			? ( s.prefix === '_pattern' ? '_pattern.' : s.prefix + '.' )
			: s.expr;

		// Human label shown in the chip.
		const chipLabel = root
			? s.label
			: pattern
				? s.label
				: s.label.replace(/^(Post|User|Site|Modifier|Pattern):\s*/, '');

		return (
			<Button
				key={ insertExpr + chipLabel }
				variant="secondary"
				onMouseDown={ ( e ) => e.preventDefault() }
				onClick={ ( e ) => {
					e.preventDefault();
					
					let newValue = insertExpr;

					if ( s.category === 'Modifier' ) {
						let appended = expr.trim();
						if ( ! appended.endsWith( '|' ) && appended.length > 0 ) {
							appended += ' ';
						}
						newValue = appended + insertExpr;
					}
					
					onSelect( newValue );
					
					// Instead of relying on WebComponent value override, we just rely on react state
					setTimeout( () => {
						const el = document.querySelector('.ve-expr-input textarea');
						if(el) el.focus();
					}, 0 );
				} }
				style={ { textAlign: 'left', justifyContent: 'flex-start', padding: '8px 12px', whiteSpace: 'normal', height: 'auto', lineHeight: '1.3' } }
			>
				<span style={{ fontSize: '13px' }}>
					{ chipLabel }
				</span>
			</Button>
		);
	};

	const tabs = [
		{
			name: 'suggestions',
			title: hasSpecificSuggestions ? __( 'Suggestions', 'vector-expressions' ) : __( 'Common', 'vector-expressions' ),
			className: 've-tab-suggestions',
		},
		{
			name: 'post',
			title: __( 'Post', 'vector-expressions' ),
			className: 've-tab-post',
		},
		{
			name: 'user',
			title: __( 'User', 'vector-expressions' ),
			className: 've-tab-user',
		},
		{
			name: 'modifiers',
			title: __( 'Modifiers', 'vector-expressions' ),
			className: 've-tab-modifiers',
		},
		{
			name: 'patterns',
			title: __( 'Patterns', 'vector-expressions' ),
			className: 've-tab-patterns',
		},
	];

	return (
		<div style={{ marginTop: '16px' }}>
			<TabPanel
				className="ve-expression-tabs"
				activeClass="is-active"
				tabs={ tabs }
			>
				{ ( tab ) => {
					const renderItems = (items, isGrid) => (
						<div style={{
							display: isGrid ? 'grid' : 'flex',
							flexDirection: isGrid ? 'row' : 'column',
							gridTemplateColumns: isGrid ? '1fr 1fr' : 'none',
							gap: '8px',
							maxHeight: '200px',
							overflowY: 'auto',
							paddingTop: '16px',
							paddingBottom: '4px'
						}}>
							{ items.map(renderChip) }
						</div>
					);

					switch ( tab.name ) {
						case 'post': return renderItems(suggestionsGrouped.post, true);
						case 'user': return renderItems(suggestionsGrouped.user, true);
						case 'modifiers': return renderItems(suggestionsGrouped.modifier, false);
						case 'patterns': return renderItems(VE_PATTERNS, false);
						default: return renderItems(suggestionsGrouped.common, false);
					}
				} }
			</TabPanel>
		</div>
	);
};

// ── TokenPopover ──────────────────────────────────────────────────────────────

/**
 * Popover with expression input, inline suggestions, and Update / Remove actions.
 *
 * @param {{
 *   anchor:            *,
 *   getFallbackAnchor: Function,
 *   editExpr:          string,
 *   setEdit:           Function,
 *   onUpdate:          Function,
 *   onRemove:          Function,
 *   onDismiss:         Function,
 *   inputRef:          React.RefObject,
 * }} props
 */
const TokenPopover = ( { anchor, getFallbackAnchor, editExpr, setEdit, onUpdate, onRemove, onDismiss, inputRef, previewObj } ) => (
	<Popover
		anchor={ anchor || { getBoundingClientRect: getFallbackAnchor } }
		placement="bottom"
		className="ve-pill-popover"
		focusOnMount={ false }
		onKeyDown={ ( evt ) => {
			if ( evt.key === 'Escape' ) {
				evt.preventDefault();
				evt.stopPropagation();
				onDismiss();
			}
		} }
	>
		<div className="ve-expression-builder" style={ { padding: '16px', width: '420px', boxSizing: 'border-box' } }>
			
			{/* Header & Input */}
			<div style={ { display: 'flex', flexDirection: 'column', gap: '8px' } }>
				<label style={{ fontSize: '13px', fontWeight: 600 }}>{ __( 'Vector Expression', 'vector-expressions' ) }</label>
				<AutoTextarea
					className="ve-expr-input ve-class-textarea"
					value={ editExpr }
					onChange={ ( val ) => setEdit( val ) }
					placeholder="user.is_logged_in"
					inputRef={ inputRef }
					onKeyDown={ async ( e ) => {
						if ( e.key === 'Enter' && ! e.shiftKey ) {
							e.preventDefault();
							await onUpdate();
							onDismiss();
						}
					} }
				/>
			</div>

			{/* Live Evaluation Preview */}
			<div className="ve-live-preview" style={ { 
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				gap: '8px',
				marginTop: '12px',
				background: ! previewObj || ! previewObj.valid ? '#fcf0f1' : '#f0f0f0', 
				padding: '12px', 
				borderRadius: '4px',
				border: '1px solid ' + ( ! previewObj || ! previewObj.valid ? '#cc1818' : '#e0e0e0' )
			} }>
				<div style={ { display: 'flex', alignItems: 'center', gap: '8px', color: '#1e1e1e', fontSize: '12px' } }>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
					<span>{ __( 'Preview', 'vector-expressions' ) }</span>
				</div>
				<code style={ { 
					color: ! previewObj || ! previewObj.valid ? '#cc1818' : '#39b074',
					maxWidth: '200px',
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					whiteSpace: 'nowrap',
					fontSize: '14px',
					fontFamily: 'monospace'
				} }>
					{ ! previewObj || ! previewObj.valid ? (editExpr ? (previewObj?.preview || __( 'Invalid syntax', 'vector-expressions' )) : '') : String(previewObj.preview) }
				</code>
			</div>

			<ExpressionSuggestions
				expr={ editExpr }
				onSelect={ setEdit }
				inputRef={ inputRef }
			/>

			{/* Footer Actions */}
			<footer style={ { display: 'flex', justifyContent: 'space-between', marginTop: '16px' } }>
				<Button 
					variant="secondary"
					isDestructive
					onClick={ () => { onRemove(); onDismiss(); } }
				>
					{ __( 'Remove', 'vector-expressions' ) }
				</Button>
				<Button 
					variant="primary" 
					onClick={ async () => { await onUpdate(); onDismiss(); } }
				>
					{ __( 'Apply', 'vector-expressions' ) }
				</Button>
			</footer>
			
		</div>
	</Popover>
);

/**
 * Rich-text format edit component rendered by Gutenberg when
 * `vector/expression` is the active format.
 *
 * Always mounts (so event listeners always run). Only renders
 * `TokenPopover` when the user explicitly activates a token.
 *
 * @param {{
 *   isActive:         boolean,
 *   activeAttributes: object,
 *   value:            WPRichTextValue,
 *   onChange:         Function,
 *   contentRef:       React.RefObject,
 * }} props
 */
const ExpressionEdit = ( { isActive, activeAttributes, value, onChange, contentRef } ) => {
	const [ editExpr,    setEdit ]        = useState( '' );
	const [ popoverOpen, setPopoverOpen ] = useState( false );
	const [ livePreview, setLivePreview ] = useState( null );
	const inputRef = useRef( null );

	const isActiveRef       = useRef( false );
	const anchorRef         = useRef( null );
	const activeMarkRef     = useRef( null );
	const popoverOpenRef    = useRef( false );
	const dismissPopoverRef = useRef( null );
	const setPopoverOpenRef = useRef( null );

	// Keep refs current synchronously on every render.
	setPopoverOpenRef.current = setPopoverOpen;
	popoverOpenRef.current    = popoverOpen;

	const [ anchor, setAnchor ] = useState( null );

	useEffect( () => {
		if ( isActive ) {
			const timer = setTimeout( () => {
				const iframe = document.querySelector( 'iframe[name="editor-canvas"]' );
				const doc = iframe ? iframe.contentDocument : document;
				const win = iframe ? iframe.contentWindow : window;

				if ( ! doc || ! win ) return;

				const selection = win.getSelection();
				
				if ( selection && selection.rangeCount > 0 ) {
					let pointerNode = selection.getRangeAt( 0 ).startContainer;
					
					if ( pointerNode.nodeType === 3 ) {
						pointerNode = pointerNode.parentNode;
					}

					const activeNode = pointerNode?.closest( '.ve-expr-token' ) || null;

					setAnchor( activeNode );
				} else {
					setAnchor( null );
				}
			}, 10 );

			return () => clearTimeout( timer );
		} else {
			setAnchor( null );
		}
	}, [ isActive, value ] );

	// useLayoutEffect so refs are updated before any keydown can fire.
	useLayoutEffect( () => { isActiveRef.current = isActive; }, [ isActive ] );
	useLayoutEffect( () => { anchorRef.current   = anchor;   }, [ anchor ]   );

	useActiveTokenState( isActive, contentRef );
	useTokenEventListeners( contentRef, {
		isActiveRef, popoverOpenRef, anchorRef,
		activeMarkRef, dismissPopoverRef, setPopoverOpenRef,
	} );

	useEffect( () => {
		if ( isActive && activeAttributes?.expr ) {
			setEdit( activeAttributes.expr );
			setLivePreview( { 
				preview: activeAttributes.view ?? null, 
				valid: activeAttributes.valid !== 'false' 
			} );
		}
	}, [ isActive, activeAttributes?.expr, activeAttributes?.view, activeAttributes?.valid ] );

	// Debounced real-time preview computation
	useEffect( () => {
		if ( ! isActive || ! editExpr.trim() ) {
			if ( ! editExpr.trim() ) setLivePreview( null );
			return;
		}
		
		let isCancelled = false;
		const id = setTimeout( async () => {
			const postId = select( 'core/editor' )?.getCurrentPostId?.() || 0;
			const view   = await fetchPreview( editExpr.trim(), postId );
			if ( ! isCancelled ) {
				setLivePreview( view );
			}
		}, 300 ); // 300ms debounce
		
		return () => {
			isCancelled = true;
			clearTimeout( id );
		};
	}, [ editExpr, isActive ] );

	useEffect( () => {
		if ( ! isActive ) setPopoverOpen( false );
	}, [ isActive ] );

	useEffect( () => {
		if ( ! popoverOpen || ! inputRef.current ) return;
		const id = setTimeout( () => inputRef.current?.focus(), POPOVER_FOCUS_DELAY );
		return () => clearTimeout( id );
	}, [ popoverOpen ] );

	const applyUpdate = useCallback( async () => {
		const expr = editExpr.trim();
		if ( ! expr ) return;

		// Optimistic fetch using main page ID
		const postId = select( 'core/editor' )?.getCurrentPostId?.() || 0;
		const view   = await fetchPreview( expr, postId );

		const next   = applyFormat( value, {
			type:       'vector/expression',
			attributes: { expr, view: view.preview, valid: view.valid ? 'true' : 'false', speculative: 'true', contentEditable: 'false' },
		} );
		next.start = next.end;
		onChange( next );
	}, [ editExpr, value, onChange ] );

	const applyRemove = useCallback( () => {
		const formats = value.formats ?? [];
		let pivot     = value.start;

		const hasFormat = ( i ) => formats[ i ]?.some( ( f ) => f.type === 'vector/expression' );

		// If cursor is just past the end of the token, check one position back.
		if ( pivot > 0 && ! hasFormat( pivot ) && hasFormat( pivot - 1 ) ) pivot--;

		if ( ! hasFormat( pivot ) ) {
			onChange( removeFormat( value, 'vector/expression' ) );
			return;
		}

		let rangeStart = pivot;
		while ( rangeStart > 0 && hasFormat( rangeStart - 1 ) ) rangeStart--;
		let rangeEnd = pivot;
		while ( rangeEnd < formats.length && hasFormat( rangeEnd ) ) rangeEnd++;

		onChange( concat( slice( value, 0, rangeStart ), slice( value, rangeEnd ) ) );
	}, [ value, onChange ] );

	const dismissPopover = useCallback( () => {
		setPopoverOpen( false );
		const el   = contentRef?.current;
		const mark = activeMarkRef.current;
		if ( el && mark ) {
			const iframeDoc = el.ownerDocument;
			const range     = iframeDoc.createRange();
			range.setStartBefore( mark );
			range.collapse( true );
			const sel = iframeDoc.defaultView.getSelection();
			sel.removeAllRanges();
			sel.addRange( range );
		}
		el?.focus();
	}, [ contentRef ] );

	dismissPopoverRef.current = dismissPopover;

	if ( ! popoverOpen ) return null;

	const getFallbackAnchor = () => {
		const iframe = document.querySelector( 'iframe[name="editor-canvas"]' );
		const win = iframe ? iframe.contentWindow : window;
		const sel = win.getSelection();
		return sel?.rangeCount ? sel.getRangeAt( 0 ).getBoundingClientRect() : null;
	};

	return (
		<TokenPopover
			anchor={ anchor }
			getFallbackAnchor={ getFallbackAnchor }
			editExpr={ editExpr }
			setEdit={ setEdit }
			previewObj={ livePreview }
			onUpdate={ applyUpdate }
			onRemove={ applyRemove }
			onDismiss={ dismissPopover }
			inputRef={ inputRef }
		/>
	);
};

/**
 * Register the `vector/expression` rich-text format type.
 * Called once from the editor entry point.
 */
export const registerExpressionFormat = () => {
	registerFormatType( 'vector/expression', {
		title:     __( 'Dynamic Value', 'vector-expressions' ),
		tagName:   'mark',
		className: 've-expr-token',
		attributes: {
			expr:            'data-ve-expr',
			view:            'data-ve-view',
			speculative:     'data-ve-speculative',
			empty:           'data-ve-empty',
			active:          'data-ve-active',
			contentEditable: 'contenteditable',
		},

		interactive: true,
		__unstableInputRule( value ) {
			const { start, text } = value;
			const { applyFormat } = window.wp.richText;

			// Check if the user just typed the closing bracket `}`
			if ( text.substring( start - 2, start ) !== '}}' ) {
				return value;
			}

			// Find the nearest opening bracket BEFORE the closing bracket
			const openingIndex = text.lastIndexOf( '{{', start - 2 );

			if ( openingIndex !== -1 ) {
				// Make sure there are no other closing brackets between the open and close
				const intermediateClose = text.indexOf( '}}', openingIndex + 2 );
				
				// Ensure the intermediate close is exactly the one we just typed, meaning no nested broken pairs
				if ( intermediateClose === start - 2 ) {
					return applyFormat(
						value,
						{ type: 'vector/expression' },
						openingIndex,
						start
					);
				}
			}

			return value;
		},

		edit: ExpressionEdit,
	} );
};

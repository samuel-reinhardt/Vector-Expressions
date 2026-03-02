/**
 * Vector Expressions — ExpressionEdit component + format type registration.
 *
 * Registers the `vector/expression` rich-text format and provides the
 * editing UX by opening the Vector sidebar Expression tab when a token
 * is activated. The actual editor UI lives in the sidebar; this module
 * handles format registration, keyboard nav, and rich-text mutations.
 */

import { fetchPreview }        from './api.js';
import { getCachedView }       from './hydrator.js';
import { POPOVER_FOCUS_DELAY, getCompletions, getRoots } from './constants.js';
import { AutoTextarea }       from './auto-textarea.jsx';
import { STORE_NAME, setTokenRefs } from './expression-store.js';

const {
	useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo,
} = window.wp.element;
const {
	Button, Icon
} = window.wp.components;
const { __ }                                    = window.wp.i18n;
const { registerFormatType, applyFormat,
	removeFormat, concat, slice, useAnchor }    = window.wp.richText;
const { select, useSelect, useDispatch }        = window.wp.data;
const { RichTextToolbarButton }                 = window.wp.blockEditor;

/**
 * Mirrors `data-ve-active` on the active token span in sync with
 * Gutenberg's `isActive` prop.
 */
const useActiveTokenState = ( isActive, contentRef, sidebarActive ) => {
	useEffect( () => {
		const el = contentRef?.current;
		if ( ! el ) return;

		if ( isActive ) {
			const span = el.querySelector( 'span.ve-expr-token[data-rich-text-format-boundary]' );
			if ( span ) span.setAttribute( 'data-ve-active', '' );
		} else if ( ! sidebarActive ) {
			el.querySelectorAll( 'span.ve-expr-token' ).forEach( ( m ) => {
				m.removeAttribute( 'data-ve-active' );
				m.removeAttribute( 'data-rich-text-format-boundary' );
			} );
		}
	}, [ isActive, contentRef, sidebarActive ] );
};

/**
 * Walks up the DOM from `n` to find the nearest `span.ve-expr-token`, or null.
 */
const getTokenSpan = ( n, el ) => {
	let cur = n.nodeType === Node.TEXT_NODE ? n.parentElement : n;
	while ( cur && cur !== el ) {
		if ( cur.tagName === 'SPAN' && cur.classList.contains( 've-expr-token' ) ) return cur;
		cur = cur.parentElement;
	}
	return null;
};

/**
 * Collapses `sel` to just before or after `span`.
 */
const placeCursorAdjacentToSpan = ( sel, doc, span, side ) => {
	const range = doc.createRange();
	if ( side === 'before' ) range.setStartBefore( span );
	else                     range.setStartAfter( span );
	range.collapse( true );
	sel.removeAllRanges();
	sel.addRange( range );
};

/**
 * Attaches capture-phase `keydown` and `click` listeners on the editor
 * document for token keyboard navigation.
 */
const useTokenEventListeners = ( contentRef, refs ) => {
	useEffect( () => {
		let interval = null;
		let el       = null;

		const onKeyDown = ( evt ) => {
			if ( ! el ) return;

			const { key } = evt;

			if ( key === 'Escape' && refs.tokenActiveRef.current ) {
				evt.preventDefault();
				evt.stopPropagation();
				refs.dismissRef.current?.();
				return;
			}

			if ( key === 'Tab' ) {
				const listbox = el.ownerDocument.querySelector( '[role="listbox"].components-autocomplete__results' );
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

			const iframeDoc = el.ownerDocument;
			const iframeWin = iframeDoc.defaultView;
			const sel       = iframeWin.getSelection();
			if ( ! sel || ! sel.rangeCount ) return;
			const range = sel.getRangeAt( 0 );
			const node  = range.startContainer;

			if ( key === 'ArrowLeft' || key === 'ArrowRight' ) {
				const span = getTokenSpan( node, el );
				if ( span ) {
					evt.preventDefault();
					evt.stopPropagation();
					placeCursorAdjacentToSpan( sel, iframeDoc, span, key === 'ArrowLeft' ? 'before' : 'after' );
				}
			}

			if ( key === 'Enter' || key === ' ' ) {
				if ( refs.isActiveRef.current ) {
					const inside = getTokenSpan( node, el );
					if ( inside || ! range.collapsed ) {
						evt.preventDefault();
						evt.stopPropagation();
						refs.openSidebarRef.current?.();
					}
					return;
				}
			}

			// Relocate cursor adjacent to token before printable character lands.
			if (
				refs.isActiveRef.current &&
				! refs.tokenActiveRef.current &&
				key.length === 1 &&
				! evt.ctrlKey &&
				! evt.metaKey
			) {
				const span = getTokenSpan( node, el );
				if ( span ) {
					const isStart =
						( node.nodeType === Node.TEXT_NODE || node === span ) &&
						range.startOffset === 0;
					placeCursorAdjacentToSpan( sel, iframeDoc, span, isStart ? 'before' : 'after' );
				}
			}
		};

		const tryAttach = () => {
			if ( el ) return true;
			if ( contentRef.current ) {
				el = contentRef.current;
				el.addEventListener( 'keydown', onKeyDown, true );
				return true;
			}
			return false;
		};

		if ( ! tryAttach() ) {
			interval = setInterval( () => {
				if ( tryAttach() ) clearInterval( interval );
			}, 100 );
		}

		return () => {
			if ( interval ) clearInterval( interval );
			if ( el ) {
				el.removeEventListener( 'keydown', onKeyDown, true );
			}
		};
	}, [] );
};

// ── ExpressionSuggestions ────────────────────────────────────────────────────

/** Curated complex-expression patterns shown when the user picks the Patterns root. */
const VE_PATTERNS_DEFAULT = [
	{ expr: "post.title | default 'Untitled'",                   label: 'Post title with fallback' },
	{ expr: "user.is_logged_in ? user.name : 'Guest'",           label: 'Greeting (logged in)' },
	{ expr: "post.date | date 'F j, Y'",                         label: 'Formatted publish date' },
	{ expr: "post.meta.your_field | default ''",                  label: 'Custom field value' },
	{ expr: 'site.name | upper',                                  label: 'Site name — uppercase' },
	{ expr: "user.name | default 'Friend'",                      label: 'Display name with fallback' },
	{ expr: 'post.author_name',                                   label: 'Post author name' },
	{ expr: 'post.excerpt | default post.content',               label: 'Excerpt or full content' },
];

/**
 * Returns the curated pattern list, filterable by extensions.
 * Filter: `vectorExpressions.suggestions.patterns`
 */
const getPatterns = () => {
	const { applyFilters } = window.wp.hooks;
	return applyFilters
		? applyFilters( 'vectorExpressions.suggestions.patterns', VE_PATTERNS_DEFAULT )
		: VE_PATTERNS_DEFAULT;
};

/**
 * Build accordion categories dynamically from the completions list.
 * Each unique `category` value in the completions becomes a section.
 * The Patterns category is appended at the end.
 *
 * The final list is filterable via `vectorExpressions.suggestions.categories`
 * so extensions can add/reorder/remove sections.
 */
const getCategories = ( completions ) => {
	// Collect unique categories from completions (preserving insertion order).
	// Skip "Pattern" — it has a dedicated section via getPatterns().
	const seen = new Map();
	for ( const item of completions ) {
		const cat = item.category;
		if ( ! cat || cat === 'Pattern' ) continue;
		if ( ! seen.has( cat ) ) {
			seen.set( cat, { key: cat.toLowerCase(), label: cat, items: [] } );
		}
		seen.get( cat ).items.push( item );
	}

	// Append patterns as a dedicated category at the end.
	const cats = [ ...seen.values() ];
	cats.push( { key: 'pattern', label: __( 'Patterns', 'vector-expressions' ), items: getPatterns() } );

	const { applyFilters } = window.wp.hooks;
	return applyFilters
		? applyFilters( 'vectorExpressions.suggestions.categories', cats, completions )
		: cats;
};

/**
 * Accordion + search-filter suggestion list.
 * Categories are collapsible. When search is active, all expand to reveal matches.
 * Exported so the sidebar Expression tab can reuse it.
 */
export const ExpressionSuggestions = ( { expr, onSelect } ) => {
	const [ search, setSearch ]   = useState( '' );
	const [ open, setOpen ]       = useState( {} );
	const completions             = getCompletions();
	const categories              = getCategories( completions );

	const query     = search.toLowerCase().trim();
	const searching = query.length > 0;

	const toggle = ( key ) => {
		setOpen( ( prev ) => ( { ...prev, [ key ]: ! prev[ key ] } ) );
	};

	const filterItems = ( items ) => {
		if ( ! searching ) return items;
		return items.filter( ( s ) =>
			( s.expr || '' ).toLowerCase().includes( query ) ||
			( s.label || '' ).toLowerCase().includes( query )
		);
	};

	const handleSelect = ( s ) => {
		const isPattern = ! ( 'category' in s ) && ! ( 'prefix' in s );
		const insertExpr = s.expr;

		let newValue = insertExpr;

		if ( s.category === 'Modifier' ) {
			let appended = expr.trim();
			if ( ! appended.endsWith( '|' ) && appended.length > 0 ) {
				appended += ' ';
			}
			newValue = appended + insertExpr;
		}

		onSelect( newValue );
	};

	return (
		<div className="ve-suggestions">
			<div className="ve-suggestions-search">
				<input
					type="text"
					className="components-text-control__input"
					placeholder={ __( 'Filter suggestions…', 'vector-expressions' ) }
					value={ search }
					onChange={ ( e ) => setSearch( e.target.value ) }
				/>
			</div>

			{ categories.map( ( cat ) => {
				const filtered = filterItems( cat.items );
				if ( searching && filtered.length === 0 ) return null;

				const isOpen = searching || !! open[ cat.key ];

				return (
					<div key={ cat.key } className="ve-suggestions-group">
						<button
							className={ 've-suggestions-header' + ( isOpen ? ' is-open' : '' ) }
							onClick={ () => ! searching && toggle( cat.key ) }
							aria-expanded={ isOpen }
						>
							<span>{ cat.label }</span>
							<span className="ve-suggestions-count">{ filtered.length }</span>
							{ ! searching && <span className="ve-suggestions-arrow">{ isOpen ? '▲' : '▼' }</span> }
						</button>
						{ isOpen && (
							<div className="ve-suggestions-items">
								{ filtered.map( ( s ) => (
									<Button
										key={ s.expr + ( s.label || '' ) }
										variant="secondary"
										size="small"
										className="ve-suggestion-chip"
										onMouseDown={ ( e ) => e.preventDefault() }
										onClick={ () => handleSelect( s ) }
									>
										{ ( s.label || s.expr ).replace( /^(Post|User|Site|Modifier):\s*/, '' ) }
									</Button>
								) ) }
							</div>
						) }
					</div>
				);
			} ) }
		</div>
	);
};

// ── ExpressionEdit ───────────────────────────────────────────────────────────

/**
 * Rich-text format edit component. Instead of rendering a popover,
 * it opens the Vector sidebar and publishes state to the active-token store.
 */
const ExpressionEdit = ( { isActive, activeAttributes, value, onChange, contentRef } ) => {
	const isActiveRef      = useRef( false );
	const tokenActiveRef   = useRef( false );
	const dismissRef       = useRef( null );
	const openSidebarRef   = useRef( null );

	const storeDispatch    = useDispatch( STORE_NAME );
	const sidebarDispatch  = useDispatch( 'core/edit-post' );

	const isTokenStoreActive = useSelect( ( sel ) => sel( STORE_NAME ).isTokenActive(), [] );
	tokenActiveRef.current = isTokenStoreActive;

	useLayoutEffect( () => { isActiveRef.current = isActive; }, [ isActive ] );

	useActiveTokenState( isActive, contentRef, isTokenStoreActive );

	// ── Open sidebar when a token becomes active ──
	const openSidebar = useCallback( () => {
		const expr = activeAttributes?.expr || '';
		storeDispatch.setActiveToken( expr );

		// Open Vector sidebar. The method name varies by WP version.
		if ( sidebarDispatch.openGeneralSidebar ) {
			sidebarDispatch.openGeneralSidebar( 'vector-expressions/vector-expressions' );
		}
	}, [ activeAttributes?.expr, storeDispatch, sidebarDispatch ] );

	openSidebarRef.current = openSidebar;

	// When format becomes active, open the sidebar.
	useEffect( () => {
		if ( isActive ) {
			openSidebar();
		}
	}, [ isActive ] );

	// Sync expression from active attributes when they change.
	useEffect( () => {
		if ( isActive && activeAttributes?.expr ) {
			storeDispatch.updateExpr( activeAttributes.expr );
		}
	}, [ isActive, activeAttributes?.expr ] );

	// When format deactivates, clear the store.
	useEffect( () => {
		if ( ! isActive ) {
			storeDispatch.clearActiveToken();
		}
	}, [ isActive ] );

	// ── Build apply/remove callbacks that the sidebar calls ──
	const applyUpdate = useCallback( ( exprOverride ) => {
		const expr = ( exprOverride ?? select( STORE_NAME ).getExpr() ).trim();
		if ( ! expr ) return;

		const postId = select( 'core/editor' )?.getCurrentPostId?.() || 0;
		const cached = getCachedView( expr, postId );
		const attrs  = { expr, contentEditable: 'false' };

		if ( cached !== undefined ) {
			attrs.view = cached;
		}

		const next = applyFormat( value, {
			type:       'vector/expression',
			attributes: attrs,
		} );
		next.start = next.end;
		onChange( next );
	}, [ value, onChange ] );

	const applyRemove = useCallback( () => {
		const formats = value.formats ?? [];
		let pivot     = value.start;

		const hasFormat = ( i ) => formats[ i ]?.some( ( f ) => f.type === 'vector/expression' );

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

	const dismiss = useCallback( () => {
		storeDispatch.clearActiveToken();
		const el   = contentRef?.current;
		const span = el?.querySelector( 'span[data-ve-active]' );
		if ( el && span ) {
			const iframeDoc = el.ownerDocument;
			const range     = iframeDoc.createRange();
			range.setStartAfter( span );
			range.collapse( true );
			const sel = iframeDoc.defaultView.getSelection();
			sel.removeAllRanges();
			sel.addRange( range );
		}
		el?.focus();
	}, [ contentRef, storeDispatch ] );

	dismissRef.current = dismiss;

	// Publish callbacks for the sidebar tab to call.
	setTokenRefs( { applyUpdate, applyRemove, dismiss } );

	// ── Debounced live preview ──
	const storeExpr = useSelect( ( sel ) => sel( STORE_NAME ).getExpr(), [] );
	useEffect( () => {
		if ( ! isActive || ! storeExpr.trim() ) {
			if ( ! storeExpr.trim() ) storeDispatch.setPreview( null );
			return;
		}

		let cancelled = false;
		const id = setTimeout( async () => {
			const postId = select( 'core/editor' )?.getCurrentPostId?.() || 0;
			const view   = await fetchPreview( storeExpr.trim(), postId );
			if ( ! cancelled ) storeDispatch.setPreview( view );
		}, 300 );

		return () => { cancelled = true; clearTimeout( id ); };
	}, [ storeExpr, isActive ] );

	useTokenEventListeners( contentRef, {
		isActiveRef, tokenActiveRef,
		dismissRef, openSidebarRef,
	} );

	// Toolbar button only — no popover.
	return (
		<RichTextToolbarButton
			icon={ () => <Icon icon="database" /> }
			title={ __( 'Edit Vector Expression', 'vector-expressions' ) }
			onClick={ openSidebar }
			isActive={ isActive }
		/>
	);
};

/**
 * Register the `vector/expression` rich-text format type.
 */
export const registerExpressionFormat = () => {
	registerFormatType( 'vector/expression', {
		title:     __( 'Dynamic Value', 'vector-expressions' ),
		tagName:   'span',
		className: 've-expr-token',
		attributes: {
			expr:            'data-ve-expr',
			view:            'data-ve-view',
			contentEditable: 'contenteditable',
		},


		__unstableInputRule( value ) {
			const { start, text } = value;
			const { applyFormat } = window.wp.richText;

			if ( text.substring( start - 2, start ) !== '}}' ) {
				return value;
			}

			const openingIndex = text.lastIndexOf( '{{', start - 2 );

			if ( openingIndex !== -1 ) {
				const intermediateClose = text.indexOf( '}}', openingIndex + 2 );
				
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

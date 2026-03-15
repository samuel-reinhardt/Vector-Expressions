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
 * Mirrors `data-vectex-active` on the active token span in sync with
 * Gutenberg's `isActive` prop.
 */
const useActiveTokenState = ( isActive, contentRef, sidebarActive ) => {
	useEffect( () => {
		const el = contentRef?.current;
		if ( ! el ) return;

		if ( isActive ) {
			const span = el.querySelector( 'span.vectex-expr-token[data-rich-text-format-boundary]' );
			if ( span ) span.setAttribute( 'data-vectex-active', '' );
		} else if ( ! sidebarActive ) {
			el.querySelectorAll( 'span.vectex-expr-token' ).forEach( ( m ) => {
				m.removeAttribute( 'data-vectex-active' );
				m.removeAttribute( 'data-rich-text-format-boundary' );
			} );
		}
	}, [ isActive, contentRef, sidebarActive ] );
};

/**
 * Walks up the DOM from `n` to find the nearest `span.vectex-expr-token`, or null.
 */
const getTokenSpan = ( n, el ) => {
	let cur = n.nodeType === Node.TEXT_NODE ? n.parentElement : n;
	while ( cur && cur !== el ) {
		if ( cur.tagName === 'SPAN' && cur.classList.contains( 'vectex-expr-token' ) ) return cur;
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

const config = window.vectexEditorConfig || {};

/**
 * Returns the pattern list from PHP-localized data, filterable by extensions.
 * Filter: `vectorExpressions.suggestions.patterns`
 *
 * Deduplicates by `expr` to prevent multiple sources from creating duplicates.
 */
const getPatterns = () => {
	const patterns = ( config.patterns || [] ).map( ( p ) => ( {
		expr:     p.expr,
		label:    p.label,
		category: p.category || null,
	} ) );
	const { applyFilters } = window.wp.hooks;
	const raw = applyFilters
		? applyFilters( 'vectorExpressions.suggestions.patterns', patterns )
		: patterns;

	// Deduplicate — first occurrence wins.
	const seen = new Set();
	return raw.filter( ( p ) => {
		if ( seen.has( p.expr ) ) return false;
		seen.add( p.expr );
		return true;
	} );
};

/* ── Category → Group transformation ────────────────────────────────────── */

/** @type {Array} All root definitions from shared PHP config. */
const ALL_ROOTS = config.roots || [];

/** @type {Array} All modifier definitions from shared PHP config. */
const ALL_MODIFIERS = config.modifiers || [];

/**
 * Core group definitions — static labels, icons, and display order.
 * Integration groups (WooCommerce, ACF, etc.) are auto-derived from
 * the `group` field on PHP Root/ModifierSet definitions.
 */
const CORE_GROUPS = {
	content: {
		key: 'content',
		label: 'Content',
		order: 0,
		icon: `<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><rect x="3" y="2" width="14" height="16" rx="2" fill="currentColor"/><path d="M7 6h6M7 10h6M7 14h3" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>`,
	},
	context: {
		key: 'context',
		label: 'Context',
		order: 1,
		icon: `<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" fill="currentColor"/><path d="M10 6v4l3 2" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>`,
	},
	modifiers: {
		key: 'modifiers',
		label: 'Modifiers',
		order: 2,
		icon: `<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 4h12l-4.5 5.5v6.5l-3 2v-8.5z" fill="currentColor"/></svg>`,
	},
};

/**
 * Build complete GROUP_DEFS by merging core definitions with groups
 * auto-derived from PHP Root/ModifierSet data. New integration groups
 * (e.g. "woocommerce", "acf") appear automatically when a Root declares them.
 */
const buildGroupDefs = () => {
	const defs = { ...CORE_GROUPS };
	let autoOrder = 20;

	for ( const root of ALL_ROOTS ) {
		if ( root.group && ! defs[ root.group ] ) {
			defs[ root.group ] = {
				key: root.group,
				label: root.group.charAt( 0 ).toUpperCase() + root.group.slice( 1 ),
				order: autoOrder++,
				icon: root.icon || '',
			};
		}
	}

	return defs;
};

const GROUP_DEFS = buildGroupDefs();

/**
 * Build category→group and category→accent maps from all localized items.
 */
const buildMaps = () => {
	const categoryGroup = {};
	const categoryAccent = {};

	// Core categories (not PHP-registered).
	categoryGroup.User = 'content';
	categoryGroup.Post = 'content';
	categoryGroup.Site = 'content';
	categoryGroup.Modifier = 'modifiers';
	categoryAccent.Modifier = 'modifier';

	// Single scan: all items that carry group/accent.
	const items = [
		...ALL_ROOTS.map( ( r ) => ( {
			category: r.label,
			group: r.group,
			accent: r.accent,
		} ) ),
		...ALL_MODIFIERS,
	];

	for ( const item of items ) {
		const cat = item.category || item.label;
		if ( ! cat ) continue;
		if ( item.group ) categoryGroup[ cat ] = item.group;
		if ( item.accent ) categoryAccent[ cat ] = item.accent;
	}

	// Derive pattern subcategory groups from their parent root labels.
	for ( const [ catLabel, groupId ] of Object.entries( categoryGroup ) ) {
		const patternLabel = catLabel + ' Patterns';
		if ( ! categoryGroup[ patternLabel ] ) {
			categoryGroup[ patternLabel ] = groupId;
		}
		const patternLabel2 = catLabel + ' Pattern';
		if ( ! categoryGroup[ patternLabel2 ] ) {
			categoryGroup[ patternLabel2 ] = groupId;
		}
	}

	return { categoryGroup, categoryAccent };
};

const { categoryGroup: CATEGORY_GROUPS, categoryAccent: ACCENTS } = buildMaps();

/**
 * Sort sub-categories: roots first (alphabetically), modifiers last (alphabetically).
 */
const sortSubCategories = ( cats ) =>
	cats.sort( ( a, b ) => {
		const aIsMod = /modifier/i.test( a.label );
		const bIsMod = /modifier/i.test( b.label );
		if ( aIsMod !== bIsMod ) return aIsMod ? 1 : -1;
		return a.label.localeCompare( b.label );
	} );

/**
 * Transform a flat category list into a grouped hierarchy.
 *
 * Maps each category to its parent group (Content, Context, Modifiers,
 * or an auto-derived integration group like ACF/WC). Categories without
 * a known group remain ungrouped at the top level.
 */
const groupCategories = ( flatCategories ) => {
	const groups = {};
	const ungrouped = [];

	for ( const cat of flatCategories ) {
		const groupId = CATEGORY_GROUPS[ cat.label ];
		if ( groupId && GROUP_DEFS[ groupId ] ) {
			if ( ! groups[ groupId ] ) {
				groups[ groupId ] = { ...GROUP_DEFS[ groupId ], categories: [] };
			}
			groups[ groupId ].categories.push( {
				...cat,
				accent: ACCENTS[ cat.label ] || null,
			} );
		} else {
			ungrouped.push( cat );
		}
	}

	// Sort sub-categories within each group: roots first, modifiers last.
	for ( const group of Object.values( groups ) ) {
		sortSubCategories( group.categories );
	}

	// Sort groups by defined order, then append ungrouped.
	const sorted = Object.values( groups ).sort( ( a, b ) => a.order - b.order );

	return [ ...sorted, ...ungrouped ];
};

/* ── getCategories ──────────────────────────────────────────────────────── */

/**
 * Build accordion categories dynamically from the completions list.
 * Each unique `category` value in the completions becomes a section.
 * Patterns are distributed into their matching root categories.
 *
 * Categories are then grouped into a two-level hierarchy (Content,
 * Context, Modifiers, integration groups) for the accordion UI.
 *
 * The final list is filterable via `vectorExpressions.suggestions.categories`
 * so extensions can add/reorder/remove sections.
 */
const getCategories = ( completions ) => {
	// Collect unique categories from completions (preserving insertion order).
	// Skip "Pattern" — patterns are handled separately below.
	// Use composite keys (group:label) to prevent name collisions across groups.
	const seen = new Map();
	for ( const item of completions ) {
		const cat = item.category;
		if ( ! cat || cat === 'Pattern' ) continue;
		const group = item.group || '';
		const compositeKey = group ? `${ group }:${ cat.toLowerCase() }` : cat.toLowerCase();
		if ( ! seen.has( cat ) ) {
			seen.set( cat, { key: compositeKey, label: cat, items: [] } );
		}
		seen.get( cat ).items.push( item );
	}

	// Create pattern sub-categories grouped by expression root or explicit category.
	const patterns = getPatterns();
	const patternBuckets = new Map();
	// Derive root-id → label map from PHP-localized data.
	const rootMap = ( config.roots || [] ).reduce( ( m, r ) => ( { ...m, [ r.id ]: r.label } ), {} );
	for ( const p of patterns ) {
		// Patterns with an explicit category (e.g. "WC Pattern") keep it as-is.
		if ( p.category ) {
			const catLabel = p.category;
			if ( ! patternBuckets.has( catLabel ) ) {
				patternBuckets.set( catLabel, { key: catLabel.toLowerCase().replace( /\s+/g, '-' ), label: catLabel, items: [] } );
			}
			patternBuckets.get( catLabel ).items.push( p );
			continue;
		}
		// Otherwise, distribute by expression root.
		const root = ( p.expr || '' ).split( '.' )[ 0 ]?.toLowerCase();
		const catLabel = rootMap[ root ];
		if ( catLabel ) {
			const bucketLabel = catLabel + ' Patterns';
			if ( ! patternBuckets.has( bucketLabel ) ) {
				patternBuckets.set( bucketLabel, { key: bucketLabel.toLowerCase().replace( /\s+/g, '-' ), label: bucketLabel, items: [] } );
			}
			patternBuckets.get( bucketLabel ).items.push( { ...p, category: bucketLabel } );
		}
	}

	const flatCats = [ ...seen.values(), ...patternBuckets.values() ];

	// Group flat categories into a two-level hierarchy.
	const grouped = groupCategories( flatCats );

	const { applyFilters } = window.wp.hooks;
	return applyFilters
		? applyFilters( 'vectorExpressions.suggestions.categories', grouped, completions )
		: grouped;
};

/**
 * Accordion + search-filter suggestion list.
 *
 * Supports two rendering modes:
 *  - Flat:    entries with `items` array → single-level accordion (free plugin default)
 *  - Grouped: entries with `categories` array → two-level group → sub-category accordion
 *
 * Pro can transform flat categories into grouped ones via the
 * `vectorExpressions.suggestions.categories` filter.
 *
 * Exported so the sidebar Expression tab can reuse it.
 */
export const ExpressionSuggestions = ( { expr, onSelect } ) => {
	const [ search, setSearch ]       = useState( '' );
	const [ open, setOpen ]           = useState( {} );
	const [ activeFilter, setFilter ] = useState( null );
	const suggestionsRef              = useRef( null );
	const completions             = getCompletions();
	const categories              = getCategories( completions );

	const rawQuery  = search.trim();
	const query     = rawQuery.toLowerCase();
	const searching = query.length > 0;

	const searchTokens = query.split( /\s+/ ).filter( Boolean );

	/** Check if search tokens match a heading label (group or category name). */
	const headingMatches = ( label ) => {
		if ( ! searching || ! label ) return false;
		const h = label.toLowerCase();
		return searchTokens.every( ( t ) => h.includes( t ) );
	};

	const toggle = ( key ) => {
		setOpen( ( prev ) => ( { ...prev, [ key ]: ! prev[ key ] } ) );
	};

	/** Exclusive filter toggle — click to filter, re-click to deselect. */
	const toggleFilter = ( key ) => {
		setFilter( ( prev ) => prev === key ? null : key );
	};

	/** Tokenized matching — all tokens must appear across expr + label + hint.
	 *  If parentMatch is true, the parent heading already matched → show all items. */
	const filterItems = ( items, parentMatch = false ) => {
		if ( ! searching || parentMatch ) return items;
		return items.filter( ( s ) => {
			const haystack = [ s.expr, s.label, s.hint, s.category ]
				.filter( Boolean )
				.join( ' ' )
				.toLowerCase();
			return searchTokens.every( ( token ) => haystack.includes( token ) );
		} );
	};

	const handleSelect = ( s ) => {
		const insertExpr = s.expr;

		// Determine suggestion type by structural signals:
		// - Modifiers: expr starts with pipe character (e.g. "| gravatar 80").
		// - Patterns:  category contains "Pattern" (e.g. "Post Patterns", "WC Pattern").
		// - Data roots: everything else (root property completions).
		const isModifier = /^\s*\|/.test( insertExpr );
		const isPattern  = /pattern/i.test( s.category || '' );

		let newValue;

		if ( isModifier ) {
			// Modifiers: append to end of expression.
			let appended = expr.trim();
			if ( ! appended.endsWith( '|' ) && appended.length > 0 ) {
				appended += ' ';
			}
			newValue = appended + insertExpr;
		} else if ( isPattern ) {
			// Patterns: replace entire expression.
			newValue = insertExpr;
		} else {
			// Data roots: replace only the base (before first pipe), keep modifiers.
			const trimmed = expr.trim();
			const pipeIdx = trimmed.indexOf( '|' );
			if ( pipeIdx > -1 ) {
				newValue = insertExpr + ' ' + trimmed.slice( pipeIdx ).trim();
			} else {
				newValue = insertExpr;
			}
		}

		onSelect( newValue );
	};

	/** Strip "Category: " prefix from chip labels — the accordion header provides context. */
	const chipLabel = ( s ) => {
		const raw = s.label || s.expr;
		if ( s.category ) {
			const prefix = s.category + ': ';
			if ( raw.startsWith( prefix ) ) return raw.slice( prefix.length );
		}
		return raw;
	};

	/** Render a single category accordion (flat entry with `items`). */
	const renderCategory = ( cat, indented = false, parentMatch = false ) => {
		const catMatch = headingMatches( cat.label );
		const filtered = filterItems( cat.items || [], catMatch || parentMatch );
		if ( searching && filtered.length === 0 && ! catMatch ) return null;

		const isOpen  = searching || !! activeFilter || !! open[ cat.key ];
		const classes = 'vectex-suggestions-group' + ( indented ? ' vectex-suggestions-group--nested' : '' );

		return (
			<div key={ cat.key } className={ classes }>
				<button
					className={ 'vectex-suggestions-header' + ( isOpen ? ' is-open' : '' ) + ( indented ? ' vectex-suggestions-header--sub' : '' ) }
					onClick={ () => ! searching && toggle( cat.key ) }
					aria-expanded={ isOpen }
				>
					{ cat.accent && <span className={ 'vectex-suggestions-accent vectex-suggestions-accent--' + cat.accent } /> }
					<span>{ cat.label }</span>
					<span className="vectex-suggestions-count">{ filtered.length }</span>
					{ ! searching && <span className="vectex-suggestions-arrow">{ isOpen ? '▲' : '▼' }</span> }
				</button>
				{ isOpen && (
					<div className="vectex-suggestions-items">
						{ filtered.map( ( s ) => (
							<Button
								key={ s.expr + ( s.label || '' ) }
								variant="secondary"
								size="small"
								className="vectex-suggestion-chip"
								onMouseDown={ ( e ) => e.preventDefault() }
								onClick={ () => handleSelect( s ) }
							>
								{ chipLabel( s ) }
							</Button>
						) ) }
					</div>
				) }
			</div>
		);
	};

	/** Render a group heading with nested sub-categories. */
	const renderGroup = ( group ) => {
		// Count total visible items across all sub-categories.
		const groupMatch = headingMatches( group.label );
		let totalVisible = 0;
		const visibleCats = ( group.categories || [] ).filter( ( cat ) => {
			const catMatch = headingMatches( cat.label );
			const filtered = filterItems( cat.items || [], groupMatch || catMatch );
			totalVisible += filtered.length;
			return ! searching || filtered.length > 0 || catMatch;
		} );

		if ( visibleCats.length === 0 ) return null;

		const isOpen = searching || !! activeFilter || !! open[ group.key ];

		return (
			<div key={ group.key } className="vectex-suggestions-group vectex-suggestions-group--parent" data-group-key={ group.key }>
				<button
					className={ 'vectex-suggestions-header vectex-suggestions-header--group' + ( isOpen ? ' is-open' : '' ) }
					onClick={ () => ! searching && toggle( group.key ) }
					aria-expanded={ isOpen }
				>
					{ group.icon && <span className="vectex-suggestions-group-icon" dangerouslySetInnerHTML={ { __html: group.icon } } /> }
					<span>{ group.label }</span>
					<span className="vectex-suggestions-count">{ totalVisible }</span>
					{ ! searching && <span className="vectex-suggestions-arrow">{ isOpen ? '▲' : '▼' }</span> }
				</button>
				{ isOpen && (
					<div className="vectex-suggestions-group-body">
						{ visibleCats.map( ( cat ) => renderCategory( cat, true, groupMatch ) ) }
					</div>
				) }
			</div>
		);
	};

	return (
		<div className="vectex-suggestions" ref={ suggestionsRef }>
			{ /* Discovery Section — clear boundary between writing and browsing */ }
			<div className="vectex-discovery-header">
				<span className="vectex-discovery-label">{ __( 'Browse Data & Filters', 'vector-expressions' ) }</span>
				<div className="vectex-discovery-search">
					<svg className="vectex-discovery-search-icon" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8.5" cy="8.5" r="5.5" /><path d="M14 14l4 4" /></svg>
					<input
						type="text"
						placeholder={ __( 'Filter suggestions…', 'vector-expressions' ) }
						value={ search }
						onChange={ ( e ) => setSearch( e.target.value ) }
					/>
				</div>
			</div>

			{ /* Root Strip — category filter below search, above results */ }
			{ categories.some( ( e ) => e.categories ) && (
				<div className="vectex-root-strip" role="navigation" aria-label={ __( 'Filter by group', 'vector-expressions' ) }>
					{ categories
						.filter( ( e ) => e.categories )
						.map( ( group ) => (
							<button
								key={ group.key }
								className={ 'vectex-root-strip-btn' + ( activeFilter === group.key ? ' is-active' : '' ) }
								onClick={ () => toggleFilter( group.key ) }
								title={ group.label }
								aria-label={ group.label }
							>
								{ group.icon
									? <span dangerouslySetInnerHTML={ { __html: group.icon } } />
									: <span>{ group.label.charAt( 0 ) }</span>
								}
							</button>
						) )
					}
				</div>
			) }


			{ categories
				.filter( ( entry ) => ! activeFilter || entry.key === activeFilter )
				.map( ( entry ) =>
					entry.categories
						? renderGroup( entry )
						: renderCategory( entry )
				)
			}

			{ /* Quick Start — contextual based on current expression */ }
			{ ! searching && ! activeFilter && Object.keys( open ).every( ( k ) => ! open[ k ] ) && ( () => {
				const trimmed = ( expr || '' ).trim();
				const root = trimmed.split( '.' )[ 0 ]?.toLowerCase();
				const hasPipe = trimmed.includes( '|' );
				const hasTernary = trimmed.includes( '?' );

				// When expression is empty → show popular starters.
				if ( ! trimmed ) {
					const quickstartItems = ( config.quickstart || [] ).map( ( qs ) => ( {
						expr:  qs.expr,
						label: qs.label,
					} ) );

					if ( quickstartItems.length === 0 ) return null;

					return (
						<div className="vectex-suggestions-quickstart">
							<span className="vectex-suggestions-quickstart-label">{ __( 'Quick Start', 'vector-expressions' ) }</span>
							<div className="vectex-suggestions-quickstart-items">
								{ quickstartItems.map( ( qs ) => (
									<Button
										key={ qs.expr }
										variant="secondary"
										size="small"
										className="vectex-suggestion-chip vectex-suggestion-chip--quickstart"
										onMouseDown={ ( e ) => e.preventDefault() }
										onClick={ () => handleSelect( qs ) }
									>
										{ qs.label }
									</Button>
								) ) }
							</div>
						</div>
					);
				}

				// Ternary expressions → no modifier suggestions (result is already resolved).
				if ( hasTernary && ! hasPipe ) {
					return null;
				}

				// ── Property-level intelligence ──────────────────────────────
				// Extract property from "root.property" or "root.property | ..."
				const dotParts = trimmed.split( /\s*\|/ )[ 0 ].trim().split( '.' );
				const property = dotParts.length > 1 ? dotParts.slice( 1 ).join( '.' ).toLowerCase() : '';

				// Build property-type index from PHP-localized root data.
				// Each root declares `type` per property (date, html, array, image, price).
				const propType = ( () => {
					for ( const r of config.roots || [] ) {
						if ( r.id !== root ) continue;
						for ( const p of r.properties || [] ) {
							if ( p.key === property ) return p.type || 'string';
						}
					}
					return 'string';
				} )();

				const isDate  = propType === 'date';
				const isImage = propType === 'image';
				const isHTML  = propType === 'html';
				const isArray = propType === 'array';
				const isPrice = propType === 'price';

				// Collect already-applied modifier names for deduplication.
				const appliedMods = new Set(
					( trimmed.match( /\|\s*(\w+)/g ) || [] ).map( ( m ) => m.replace( /\|\s*/, '' ).toLowerCase() )
				);

				// ── Modifier relevance scoring ──────────────────────────────
				const contextLabel = hasPipe
					? __( 'Add Another Modifier', 'vector-expressions' )
					: __( 'Try a Modifier', 'vector-expressions' );

				/** Score a modifier for relevance (higher = shown first). */
				const scoreModifier = ( c ) => {
					const modName = ( c.expr || '' ).replace( /^\|\s*/, '' ).split( /\s/ )[ 0 ].toLowerCase();

					// Already applied → exclude.
					if ( appliedMods.has( modName ) ) return -1;

					// Property-aware boosting.
					if ( isDate && modName === 'date' ) return 100;
					if ( isImage && ( modName === 'thumbnail' || modName === 'mb_image' ) ) return 100;
					if ( isHTML && [ 'strip_tags', 'wp_excerpt', 'word_count', 'reading_time', 'nl2br', 'raw' ].includes( modName ) ) return 90;
					if ( isArray && [ 'join', 'count', 'first', 'last', 'sort', 'reverse', 'pluck' ].includes( modName ) ) return 90;
					if ( isPrice && modName === 'wc_price' ) return 100;

					// Root-specific integration modifiers (always relevant if root matches).
					if ( root === 'acf' && c.category === 'ACF Modifier' ) return 50;
					if ( [ 'mb', 'mb_setting', 'mb_user', 'mb_term' ].includes( root ) && c.category === 'MB Modifier' ) return 50;
					if ( [ 'woo_product', 'woo_shop', 'woo_cart' ].includes( root ) && c.category === 'WC Modifier' ) return 50;

					// Universal modifiers (Modifier + WP Modifier) — contextual filtering.
					if ( c.category === 'Modifier' || c.category === 'WP Modifier' ) {
						// Post-only modifiers.
						if ( [ 'get_user', 'get_post' ].includes( modName ) && root !== 'post' ) return -1;
						// Taxonomy modifiers.
						if ( [ 'terms', 'categories', 'tags' ].includes( modName ) && root !== 'post' ) return -1;
						// Date modifier suppressed if not date property.
						if ( modName === 'date' && ! isDate ) return 5;
						// Array modifiers suppressed if not array property.
						if ( [ 'sort', 'reverse', 'first', 'last', 'pluck' ].includes( modName ) && ! isArray ) return 3;
						// HTML/content modifiers suppressed if not HTML property.
						if ( [ 'strip_tags', 'nl2br', 'wp_excerpt', 'word_count', 'reading_time' ].includes( modName ) && ! isHTML ) return 3;
						// Image modifier suppressed if not image property.
						if ( modName === 'thumbnail' && ! isImage ) return 3;
						// Always-useful universal modifiers.
						if ( [ 'upper', 'lower', 'default', 'if', 'match', 'esc_html', 'count' ].includes( modName ) ) return 40;
						return 20;
					}

					return -1;
				};

				// Score, filter, and sort modifiers.
				const scored = completions
					.filter( ( c ) => c.category && c.category.endsWith( 'Modifier' ) )
					.map( ( c ) => ( { ...c, _score: scoreModifier( c ) } ) )
					.filter( ( c ) => c._score > 0 )
					.sort( ( a, b ) => b._score - a._score );

				// Relevant patterns: those that use the same root.
				const rootPatterns = completions.filter( ( c ) =>
					c.category === 'Pattern' &&
					( c.expr || '' ).toLowerCase().startsWith( root + '.' )
				);

				const suggestions = [ ...scored.slice( 0, 6 ), ...rootPatterns.slice( 0, 2 ) ];

				if ( suggestions.length === 0 ) return null;

				return (
					<div className="vectex-suggestions-quickstart">
						<span className="vectex-suggestions-quickstart-label">{ contextLabel }</span>
						<div className="vectex-suggestions-quickstart-items">
							{ suggestions.map( ( s ) => (
								<Button
									key={ s.expr + ( s.label || '' ) }
									variant="secondary"
									size="small"
									className="vectex-suggestion-chip vectex-suggestion-chip--quickstart"
									onMouseDown={ ( e ) => e.preventDefault() }
									onClick={ () => handleSelect( s ) }
									title={ s.expr }
								>
									{ chipLabel( s ) }
								</Button>
							) ) }
						</div>
					</div>
				);
			} )() }
		</div>
	);
};

// ── Paste-to-Pill Conversion ─────────────────────────────────────────────────

/**
 * Regex for detecting raw {{ expression }} tokens in RichText text.
 * Captures the inner expression between the delimiters.
 * Uses a non-greedy match to handle multiple tokens in one paste.
 */
const PASTE_TOKEN_RE = /\{\{\s*(.+?)\s*\}\}/g;

/**
 * Auto-converts pasted {{ expression }} text into `vector/expression`
 * format spans.
 *
 * Listens for the `paste` event on the editor content element. After
 * Gutenberg processes the paste (DOM settles via requestAnimationFrame),
 * scans the RichText value for un-formatted `{{ }}` patterns and applies
 * the format right-to-left to avoid offset displacement.
 *
 * The expression text is extracted from the `{{ }}` delimiters and set
 * as the `data-vectex-expr` attribute immediately so previews hydrate.
 */
const usePasteConversion = ( contentRef, value, onChange ) => {
	const valueRef    = useRef( value );
	const onChangeRef = useRef( onChange );

	// Keep refs current across renders.
	useLayoutEffect( () => {
		valueRef.current    = value;
		onChangeRef.current = onChange;
	}, [ value, onChange ] );

	useEffect( () => {
		let el       = null;
		let interval = null;

		const onPaste = () => {
			// Let Gutenberg finish its native paste processing first.
			requestAnimationFrame( () => {
				const val     = valueRef.current;
				const text    = val?.text || '';
				const formats = val?.formats || [];

				// Fast path: skip if no {{ }} tokens present.
				if ( ! text.includes( '{{' ) ) return;

				// Collect all {{ expression }} matches that are NOT already formatted.
				const matches = [];
				let m;
				PASTE_TOKEN_RE.lastIndex = 0;
				while ( ( m = PASTE_TOKEN_RE.exec( text ) ) !== null ) {
					const startIdx = m.index;
					const endIdx   = m.index + m[0].length;
					const expr     = m[1].trim();

					// Skip if this range already has the vector/expression format.
					const alreadyFormatted = formats[ startIdx ]?.some(
						( f ) => f.type === 'vector/expression'
					);

					if ( ! alreadyFormatted && expr ) {
						matches.push( { start: startIdx, end: endIdx, expr } );
					}
				}

				if ( matches.length === 0 ) return;

				// Apply formats right-to-left to preserve earlier offsets.
				let updated = val;
				for ( let i = matches.length - 1; i >= 0; i-- ) {
					const { start, end, expr } = matches[ i ];
					updated = applyFormat(
						updated,
						{
							type:       'vector/expression',
							attributes: { expr, contentEditable: 'false' },
						},
						start,
						end
					);
				}

				// Place cursor after the last converted token.
				updated.start = updated.end;
				onChangeRef.current( updated );
			} );
		};

		const tryAttach = () => {
			if ( el ) return true;
			if ( contentRef.current ) {
				el = contentRef.current;
				el.addEventListener( 'paste', onPaste, true );
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
			if ( el ) el.removeEventListener( 'paste', onPaste, true );
		};
	}, [] );
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
		const span = el?.querySelector( 'span[data-vectex-active]' );
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

	// Auto-convert pasted {{ expression }} text into format pills.
	usePasteConversion( contentRef, value, onChange );

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
		className: 'vectex-expr-token',
		attributes: {
			expr:            'data-vectex-expr',
			view:            'data-vectex-view',
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

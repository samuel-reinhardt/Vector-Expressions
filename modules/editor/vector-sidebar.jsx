/**
 * Vector Expressions — Dedicated Sidebar Tab.
 *
 * Registers a custom "Vector" sidebar in the block editor using the
 * WordPress PluginSidebar API. Organizes controls into tabs:
 *   - Expression (dynamic — only when editing a token)
 *   - Logic — Visibility + Dynamic Class (free plugin)
 *   - Attributes + Styles (added by Pro via filters)
 */

import { STORE_NAME, getTokenRefs } from './expression-store.js';
import { ExpressionSuggestions }    from './expression-format.jsx';
import { AutoTextarea }             from './auto-textarea.jsx';

const { createElement: h, Fragment, useMemo } = window.wp.element;
const { PluginSidebar, PluginSidebarMoreMenuItem } = window.wp.editor;
const { registerPlugin }                      = window.wp.plugins;
const { useSelect, useDispatch }              = window.wp.data;
const { TabPanel, Button, Tooltip }            = window.wp.components;
const { __ }                                  = window.wp.i18n;
const { applyFilters }                        = window.wp.hooks;

const SIDEBAR_NAME = 'vector-expressions';

/**
 * Sidebar icon — the {{ braces logo at 24×24.
 */
const SidebarIcon = () => (
	<svg
		width="24"
		height="24"
		viewBox="-376 -15 92 126"
		aria-hidden="true"
		focusable="false"
	>
		<g style={ { fill: 'currentColor' } }>
			<path d="M -372.38427,54.856239 V 40.319598 q 5.39067,-0.242277 7.93459,-2.119927 2.60448,-1.877649 3.937,-5.875225 1.3931,-3.997576 1.3931,-13.506962 0,-11.9927279 1.09025,-16.35372 1.09024,-4.4215615 3.45245,-7.0260429 2.42277,-2.6650507 7.02604,-4.3609921 4.66384,-1.695941 13.38582,-1.695941 h 3.21018 v 14.53664 q -6.48092,0 -8.47971,0.726832 -1.99879,0.6662627 -2.9679,2.2410654 -0.90854,1.5748027 -0.90854,5.8146566 0,7.631736 -0.72683,17.019983 -0.48455,6.117502 -3.33131,10.963049 -2.11993,3.573591 -7.32889,6.965474 4.42156,2.543912 7.02604,6.480919 2.60448,3.876437 3.45245,9.872801 0.36342,2.604481 0.84797,16.959414 0.18171,5.269532 0.66627,6.541488 0.7874,1.877649 2.90732,2.846759 2.1805,0.969109 8.84313,0.969109 v 14.476072 h -3.21018 q -8.78255,0 -13.0224,-1.45366 -4.23986,-1.3931 -6.90491,-4.17929 -2.66505,-2.725619 -3.87644,-6.965473 -1.15081,-4.179284 -1.15081,-14.476071 0,-11.508173 -1.27196,-15.505749 -1.21139,-4.058146 -3.87644,-6.056934 -2.60448,-1.998788 -8.11629,-2.301634 z" />
			<path d="M -329.85728,54.856239 V 40.319598 q 5.39067,-0.242277 7.93458,-2.119927 2.60448,-1.877649 3.93701,-5.875225 1.39309,-3.997576 1.39309,-13.506962 0,-11.9927279 1.09025,-16.35372 1.09025,-4.4215615 3.45245,-7.0260429 2.42278,-2.6650507 7.02605,-4.3609921 4.66383,-1.695941 13.38582,-1.695941 h 3.21017 v 14.53664 q -6.48092,0 -8.4797,0.726832 -1.99879,0.6662627 -2.9679,2.2410654 -0.90854,1.5748027 -0.90854,5.8146566 0,7.631736 -0.72683,17.019983 -0.48456,6.117502 -3.33132,10.963049 -2.11992,3.573591 -7.32889,6.965474 4.42157,2.543912 7.02605,6.480919 2.60448,3.876437 3.45245,9.872801 0.36341,2.604481 0.84797,16.959414 0.18171,5.269532 0.66626,6.541488 0.7874,1.877649 2.90733,2.846759 2.1805,0.969109 8.84312,0.969109 v 14.476072 h -3.21017 q -8.78256,0 -13.02241,-1.45366 -4.23985,-1.3931 -6.9049,-4.17929 -2.66505,-2.725619 -3.87644,-6.965473 -1.15082,-4.179284 -1.15082,-14.476071 0,-11.508173 -1.27195,-15.505749 -1.21139,-4.058146 -3.87644,-6.056934 -2.60448,-1.998788 -8.11629,-2.301634 z" />
		</g>
	</svg>
);

/**
 * Tab icon helper — renders a Dashicon-style SVG with a native tooltip.
 */
const TabIcon = ( { label, children } ) => (
	<span className="ve-tab-icon" title={ label } aria-label={ label }>
		{ children }
	</span>
);

const ExpressionTabIcon = () => (
	<TabIcon label={ __( 'Expression', 'vector-expressions' ) }>
		<svg width="20" height="20" viewBox="-376 -15 92 126" aria-hidden="true" focusable="false">
			<g style={ { fill: 'currentColor' } }>
				<path d="M -372.38427,54.856239 V 40.319598 q 5.39067,-0.242277 7.93459,-2.119927 2.60448,-1.877649 3.937,-5.875225 1.3931,-3.997576 1.3931,-13.506962 0,-11.9927279 1.09025,-16.35372 1.09024,-4.4215615 3.45245,-7.0260429 2.42277,-2.6650507 7.02604,-4.3609921 4.66384,-1.695941 13.38582,-1.695941 h 3.21018 v 14.53664 q -6.48092,0 -8.47971,0.726832 -1.99879,0.6662627 -2.9679,2.2410654 -0.90854,1.5748027 -0.90854,5.8146566 0,7.631736 -0.72683,17.019983 -0.48455,6.117502 -3.33131,10.963049 -2.11993,3.573591 -7.32889,6.965474 4.42156,2.543912 7.02604,6.480919 2.60448,3.876437 3.45245,9.872801 0.36342,2.604481 0.84797,16.959414 0.18171,5.269532 0.66627,6.541488 0.7874,1.877649 2.90732,2.846759 2.1805,0.969109 8.84313,0.969109 v 14.476072 h -3.21018 q -8.78255,0 -13.0224,-1.45366 -4.23986,-1.3931 -6.90491,-4.17929 -2.66505,-2.725619 -3.87644,-6.965473 -1.15081,-4.179284 -1.15081,-14.476071 0,-11.508173 -1.27196,-15.505749 -1.21139,-4.058146 -3.87644,-6.056934 -2.60448,-1.998788 -8.11629,-2.301634 z" />
				<path d="M -329.85728,54.856239 V 40.319598 q 5.39067,-0.242277 7.93458,-2.119927 2.60448,-1.877649 3.93701,-5.875225 1.39309,-3.997576 1.39309,-13.506962 0,-11.9927279 1.09025,-16.35372 1.09025,-4.4215615 3.45245,-7.0260429 2.42278,-2.6650507 7.02605,-4.3609921 4.66383,-1.695941 13.38582,-1.695941 h 3.21017 v 14.53664 q -6.48092,0 -8.4797,0.726832 -1.99879,0.6662627 -2.9679,2.2410654 -0.90854,1.5748027 -0.90854,5.8146566 0,7.631736 -0.72683,17.019983 -0.48456,6.117502 -3.33132,10.963049 -2.11992,3.573591 -7.32889,6.965474 4.42157,2.543912 7.02605,6.480919 2.60448,3.876437 3.45245,9.872801 0.36341,2.604481 0.84797,16.959414 0.18171,5.269532 0.66626,6.541488 0.7874,1.877649 2.90733,2.846759 2.1805,0.969109 8.84312,0.969109 v 14.476072 h -3.21017 q -8.78256,0 -13.02241,-1.45366 -4.23985,-1.3931 -6.9049,-4.17929 -2.66505,-2.725619 -3.87644,-6.965473 -1.15082,-4.179284 -1.15082,-14.476071 0,-11.508173 -1.27195,-15.505749 -1.21139,-4.058146 -3.87644,-6.056934 -2.60448,-1.998788 -8.11629,-2.301634 z" />
			</g>
		</svg>
	</TabIcon>
);

const LogicTabIcon = () => (
	<TabIcon label={ __( 'Logic', 'vector-expressions' ) }>
		<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
			<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
		</svg>
	</TabIcon>
);
/**
 * Expression tab content — reads state from the active-token store.
 */
const ExpressionTabContent = () => {
	const { expr, preview } = useSelect( ( sel ) => ({
		expr:    sel( STORE_NAME ).getExpr(),
		preview: sel( STORE_NAME ).getPreview(),
	}), [] );

	const { updateExpr } = useDispatch( STORE_NAME );
	const refs = getTokenRefs();

	const handleApply = () => {
		refs.applyUpdate?.( expr );
		refs.dismiss?.();
	};

	const handleRemove = () => {
		refs.applyRemove?.();
		refs.dismiss?.();
	};

	return (
		<div className="ve-expression-editor">
			{/* Expression Input */}
			<div className="ve-expr-editor-field">
				<label className="components-base-control__label">
					{ __( 'Expression', 'vector-expressions' ) }
				</label>
				<div className="ve-expr-field">
					<span className="ve-expr-brace" aria-hidden="true">{'{{ '}</span>
					<AutoTextarea
						className="ve-expr-input ve-class-textarea"
						value={ expr }
						onChange={ updateExpr }
						placeholder="user.is_logged_in"
						onKeyDown={ ( e ) => {
							if ( e.key === 'Escape' ) {
								e.preventDefault();
								e.stopPropagation();
								refs.dismiss?.();
								return;
							}
							if ( e.key === 'Enter' && ! e.shiftKey ) {
								e.preventDefault();
								handleApply();
							}
						} }
					/>
					<span className="ve-expr-brace" aria-hidden="true">{' }}'}</span>
				</div>
			</div>

			{/* Live Preview */}
			<div className="ve-live-preview" style={ {
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				gap: '8px',
				marginTop: '12px',
				background: ! preview || ! preview.valid ? '#fcf0f1' : '#f0f0f0',
				padding: '12px',
				borderRadius: '4px',
				border: '1px solid ' + ( ! preview || ! preview.valid ? '#cc1818' : '#e0e0e0' ),
			} }>
				<div style={ { display: 'flex', alignItems: 'center', gap: '8px', color: '#1e1e1e', fontSize: '12px' } }>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
					<span>{ __( 'Preview', 'vector-expressions' ) }</span>
				</div>
				<code style={ {
					color: ! preview || ! preview.valid ? '#cc1818' : '#39b074',
					maxWidth: '160px',
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					whiteSpace: 'nowrap',
					fontSize: '14px',
					fontFamily: 'monospace',
				} }>
					{ ! preview || ! preview.valid
						? ( expr ? ( preview?.preview || __( 'Invalid syntax', 'vector-expressions' ) ) : '' )
						: String( preview.preview )
					}
				</code>
			</div>

			{/* Suggestions */}
			<ExpressionSuggestions
				expr={ expr }
				onSelect={ updateExpr }
			/>

			{/* Footer Actions */}
			<footer style={ { display: 'flex', justifyContent: 'space-between', marginTop: '16px' } }>
				<Button
					variant="secondary"
					isDestructive
					onClick={ handleRemove }
				>
					{ __( 'Remove', 'vector-expressions' ) }
				</Button>
				<Button
					variant="primary"
					onClick={ handleApply }
				>
					{ __( 'Apply', 'vector-expressions' ) }
				</Button>
			</footer>
		</div>
	);
};

/**
 * Default tabs — only Logic for the free plugin.
 * Pro extends this via the `vectorExpressions.sidebar.tabs` filter.
 */
const DEFAULT_TABS = [
	{ name: 'logic', title: <LogicTabIcon />, className: 've-sidebar-tab' },
];

/**
 * Main sidebar content — renders tabbed controls for the selected block.
 */
const VectorSidebarPanel = () => {
	const { selectedBlock, blockName } = useSelect( ( sel ) => {
		const block = sel( 'core/block-editor' ).getSelectedBlock();
		return {
			selectedBlock: block,
			blockName: block?.name || '',
		};
	}, [] );

	const isTokenActive = useSelect( ( sel ) => sel( STORE_NAME ).isTokenActive(), [] );

	const { updateBlockAttributes } = useDispatch( 'core/block-editor' );

	// Compute tabs BEFORE the early return — hooks must be called unconditionally.
	const baseTabs = applyFilters( 'vectorExpressions.sidebar.tabs', DEFAULT_TABS );
	const tabs = useMemo( () => {
		if ( ! isTokenActive ) return baseTabs;
		const exprTab = {
			name: 'expression',
			title: <ExpressionTabIcon />,
			className: 've-sidebar-tab ve-sidebar-tab--expr',
		};
		return [ exprTab, ...baseTabs ];
	}, [ isTokenActive, baseTabs ] );

	if ( ! selectedBlock ) {
		return (
			<div className="ve-sidebar-empty">
				<p>{ __( 'Select a block to edit its Vector settings.', 'vector-expressions' ) }</p>
			</div>
		);
	}

	const { clientId, attributes } = selectedBlock;
	const ve_logic = attributes?.ve_logic;

	const update = ( key, val ) => {
		updateBlockAttributes( clientId, {
			ve_logic: { ...( ve_logic ?? {} ), [ key ]: val },
		} );
	};

	// Single tab — render directly without tab strip.
	if ( tabs.length <= 1 ) {
		const tabName = tabs[0]?.name || 'logic';
		if ( tabName === 'expression' ) {
			return (
				<div className="ve-sidebar-tab-content">
					<ExpressionTabContent />
				</div>
			);
		}
		return (
			<div className="ve-sidebar-tab-content">
				{ applyFilters(
					`vectorExpressions.sidebar.tab.${ tabName }`,
					null,
					ve_logic,
					update,
					blockName,
				) }
			</div>
		);
	}

	// Force the Expression tab to be initially selected when it appears.
	const initialTab = isTokenActive ? 'expression' : undefined;

	return (
		<TabPanel
			key={ isTokenActive ? 'with-expr' : 'without-expr' }
			className="ve-sidebar-tabs"
			tabs={ tabs }
			initialTabName={ initialTab }
		>
			{ ( tab ) => (
				<div className="ve-sidebar-tab-content">
					{ tab.name === 'expression'
						? <ExpressionTabContent />
						: applyFilters(
							`vectorExpressions.sidebar.tab.${ tab.name }`,
							null,
							ve_logic,
							update,
							blockName,
						)
					}
				</div>
			) }
		</TabPanel>
	);
};

/**
 * Register the Vector sidebar plugin.
 */
export const registerVectorSidebar = () => {
	registerPlugin( SIDEBAR_NAME, {
		render: () => (
			<Fragment>
				<PluginSidebarMoreMenuItem
					target={ SIDEBAR_NAME }
					icon={ <SidebarIcon /> }
				>
					{ __( 'Vector Expressions', 'vector-expressions' ) }
				</PluginSidebarMoreMenuItem>
				<PluginSidebar
					name={ SIDEBAR_NAME }
					title={ __( 'Vector Expressions', 'vector-expressions' ) }
					icon={ <SidebarIcon /> }
					className="ve-sidebar"
				>
					<VectorSidebarPanel />
				</PluginSidebar>
			</Fragment>
		),
	} );
};

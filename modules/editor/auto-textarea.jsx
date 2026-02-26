/**
 * AutoTextarea — shared auto-expanding monospace textarea.
 *
 * Uses a callback ref (fires on DOM insertion, not mount) so the initial
 * height is correct even when the containing panel was collapsed at mount time.
 * useLayoutEffect re-sizes on every value change.
 * onFocus provides a final fallback for the first reveal.
 *
 * @param {{
 *   value:       string,
 *   onChange:    (v: string) => void,
 *   placeholder: string,
 *   className:   string|undefined,
 *   id:          string|undefined,
 *   onKeyDown:   Function|undefined,
 *   inputRef:    React.RefObject|undefined,
 * }} props
 * @returns {JSX.Element}
 */

const {
	useRef, useCallback, useLayoutEffect,
} = window.wp.element;

export const AutoTextarea = ( {
	value,
	onChange,
	placeholder = '',
	className   = 've-class-textarea',
	id,
	onKeyDown,
	inputRef: externalRef,
} ) => {
	const elRef = useRef( null );

	const resize = useCallback( () => {
		const el = elRef.current;
		if ( ! el || ! el.offsetParent ) return;
		el.style.height = 'auto';
		el.style.height = el.scrollHeight + 'px';
	}, [] );

	useLayoutEffect( resize, [ value ] );

	const callbackRef = useCallback( ( el ) => {
		elRef.current = el;
		// Forward to external ref (e.g. for focus management in the modal).
		if ( externalRef ) externalRef.current = el;
		if ( el ) resize();
	}, [] );

	return (
		<textarea
			id={ id }
			ref={ callbackRef }
			className={ className }
			value={ value }
			onChange={ ( e ) => onChange( e.target.value ) }
			onFocus={ resize }
			onKeyDown={ onKeyDown }
			placeholder={ placeholder }
			rows={ 1 }
			spellCheck={ false }
		/>
	);
};

/**
 * Vector Expressions — Active Token Store.
 *
 * Lightweight WP data store that coordinates state between the
 * rich-text format component (ExpressionEdit) and the sidebar
 * Expression tab.
 *
 * Store name: `vector-expressions/active-token`
 */

const { createReduxStore, register } = window.wp.data;

const STORE_NAME = "vector-expressions/active-token";

const DEFAULT_STATE = {
  /** @type {string} Current expression text being edited. */
  expr: "",
  /** @type {boolean} Whether a token is currently being edited. */
  active: false,
  /** @type {object|null} Live preview result { valid, preview }. */
  preview: null,
};

/**
 * We keep mutable refs outside Redux for the rich-text callbacks
 * (value, onChange, contentRef, applyUpdate, applyRemove) because
 * they change on every render and cannot be serialized into Redux.
 */
const refs = {
  applyUpdate: null,
  applyRemove: null,
  dismiss: null,
};

const store = createReduxStore(STORE_NAME, {
  reducer(state = DEFAULT_STATE, action) {
    switch (action.type) {
      case "SET_ACTIVE":
        return { ...state, active: true, expr: action.expr, preview: null };
      case "UPDATE_EXPR":
        return { ...state, expr: action.expr };
      case "SET_PREVIEW":
        return { ...state, preview: action.preview };
      case "CLEAR":
        return { ...DEFAULT_STATE };
      default:
        return state;
    }
  },

  actions: {
    setActiveToken(expr) {
      return { type: "SET_ACTIVE", expr };
    },
    updateExpr(expr) {
      return { type: "UPDATE_EXPR", expr };
    },
    setPreview(preview) {
      return { type: "SET_PREVIEW", preview };
    },
    clearActiveToken() {
      return { type: "CLEAR" };
    },
  },

  selectors: {
    isTokenActive(state) {
      return state.active;
    },
    getExpr(state) {
      return state.expr;
    },
    getPreview(state) {
      return state.preview;
    },
  },
});

register(store);

/**
 * Set mutable callback refs (called by ExpressionEdit on each render).
 */
export const setTokenRefs = ({ applyUpdate, applyRemove, dismiss }) => {
  refs.applyUpdate = applyUpdate;
  refs.applyRemove = applyRemove;
  refs.dismiss = dismiss;
};

/**
 * Get mutable callback refs (called by sidebar Expression tab).
 */
export const getTokenRefs = () => refs;

export { STORE_NAME };

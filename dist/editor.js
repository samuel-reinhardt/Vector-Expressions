(() => {
  // modules/editor/api.js
  var fetchPreview = async (expr, postId = 0) => {
    try {
      const data = await window.wp.apiFetch({
        path: `vector-expressions/v1/preview?expr=${encodeURIComponent(expr)}&post_id=${postId}`
      });
      if ((data == null ? void 0 : data.preview) === void 0 || (data == null ? void 0 : data.valid) === void 0) {
        return { preview: "", valid: false };
      }
      return { preview: data.preview, valid: data.valid };
    } catch {
      return { preview: "", valid: false };
    }
  };

  // modules/editor/hydrator.js
  var { select } = window.wp.data;
  var SPAN_TAG_RE = /<span\b([^>]*\bdata-vectex-expr="([^"]*)"[^>]*)>/gi;
  var config = window.vectexEditorConfig || {};
  var entityMaps = {};
  for (const root of config.roots || []) {
    const props = root.properties || [];
    if (!props.some((p) => p.entity)) continue;
    const map = {};
    for (const prop of props) {
      map[prop.key] = prop.entity || prop.key;
    }
    entityMaps[root.id] = map;
  }
  var typeMaps = {};
  for (const root of config.roots || []) {
    const map = {};
    for (const prop of root.properties || []) {
      if (prop.type) map[prop.key] = prop.type;
    }
    typeMaps[root.id] = map;
  }
  var specialHandlers = {
    /**
     * Post author name — fetches a separate user entity by author ID.
     * Returns `undefined` if the post or user record hasn't loaded yet.
     */
    __author_name: (_record, _prop, postId, postType) => {
      var _a;
      const record = select("core").getEntityRecord("postType", postType, postId);
      if (!record) return void 0;
      if (!record.author) return "";
      const user = select("core").getUser(record.author);
      if (user === void 0) return void 0;
      return (_a = user == null ? void 0 : user.name) != null ? _a : "";
    },
    /**
     * User logged-in state — always true in the editor (you must be logged in).
     */
    __is_logged_in: () => "true"
  };
  var resolveField = (record, entityField) => {
    var _a;
    const parts = entityField.split(".");
    let val = record;
    for (const p of parts) {
      val = val == null ? void 0 : val[p];
    }
    if (val == null && parts.length === 2 && parts[1] === "raw") {
      val = (_a = record == null ? void 0 : record[parts[0]]) == null ? void 0 : _a.rendered;
    }
    if (val == null) return "";
    if (Array.isArray(val)) return val.join(", ");
    return String(val);
  };
  var resolveFromStore = (expr, postId, postType, editorPostId) => {
    var _a;
    const fail = { value: "", resolved: false };
    const parts = expr.trim().split(".");
    if (parts.length !== 2) return fail;
    const [root, prop] = parts;
    if (expr.includes("|") || expr.includes("(")) return fail;
    const fieldMap = entityMaps[root];
    if (!fieldMap) return fail;
    const entityField = fieldMap[prop];
    if (!entityField) return fail;
    if (entityField.startsWith("__")) {
      const handler = specialHandlers[entityField];
      if (!handler) return fail;
      const value2 = handler(null, prop, postId, postType);
      if (value2 === void 0) return fail;
      return { value: value2, resolved: true };
    }
    const propType = (_a = typeMaps[root]) == null ? void 0 : _a[prop];
    if (propType === "html" && postId === editorPostId) {
      return { value: "", resolved: true };
    }
    let record;
    if (root === "site") {
      record = select("core").getEntityRecord("root", "site");
    } else if (root === "user") {
      return fail;
    } else {
      if (!postId || !postType) return fail;
      record = select("core").getEntityRecord("postType", postType, postId);
    }
    if (!record) return fail;
    let value = resolveField(record, entityField);
    if (propType === "date" && value.includes("T")) {
      value = value.replace("T", " ");
    }
    return { value, resolved: true };
  };
  var stripHtml = (html) => {
    var _a;
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return (_a = tmp.textContent) != null ? _a : "";
  };
  var cleanPreview = (val) => {
    if (!val) return val;
    const text = stripHtml(val);
    const el2 = document.createElement("textarea");
    el2.innerHTML = text;
    return el2.value;
  };
  var decodeAttr = (raw) => {
    if (!raw || !raw.includes("&")) return raw;
    const el2 = document.createElement("textarea");
    el2.innerHTML = raw;
    return el2.value;
  };
  var viewCache = /* @__PURE__ */ new Map();
  var cacheKey = (expr, postId) => `${expr}::${postId}`;
  var getCachedView = (expr, postId) => viewCache.get(cacheKey(expr, postId));
  var useHydrateViews = (attributes, setAttributes, attrName, blockName, postId, postType, clientId) => {
    const { useEffect: useEffect2, useRef: useRef3 } = window.wp.element;
    const lastWritten = useRef3("");
    useEffect2(() => {
      var _a, _b;
      if (!attrName) return;
      const raw = attributes[attrName];
      const html = typeof raw === "string" ? raw : String(raw != null ? raw : "");
      if (!html.includes("vectex-expr-token")) return;
      const editorPostId = ((_b = (_a = select("core/editor")) == null ? void 0 : _a.getCurrentPostId) == null ? void 0 : _b.call(_a)) || 0;
      const isQueryChild = postId !== editorPostId;
      if (!isQueryChild && html === lastWritten.current) return;
      const toFetch = /* @__PURE__ */ new Set();
      let needsUpdate = false;
      html.replace(SPAN_TAG_RE, (_match, tagInner, rawExpr) => {
        var _a2;
        if (!rawExpr) return;
        const existingView = (_a2 = tagInner.match(/\bdata-vectex-view="([^"]*)"/)) == null ? void 0 : _a2[1];
        if (existingView && !isQueryChild) return;
        const expr = decodeAttr(rawExpr);
        const key = cacheKey(expr, postId);
        if (!viewCache.has(key)) {
          const result = resolveFromStore(
            expr,
            postId,
            postType || "post",
            editorPostId
          );
          if (result.resolved) {
            viewCache.set(key, result.value);
            needsUpdate = true;
          } else {
            toFetch.add(expr);
          }
        } else {
          needsUpdate = true;
        }
      });
      if (!needsUpdate && toFetch.size === 0) return;
      if (toFetch.size === 0) {
        if (isQueryChild) {
          applyViewsDOM(postId, clientId);
        } else {
          applyViewsAttr(html, postId, attrName, setAttributes, lastWritten);
        }
        return;
      }
      Promise.all(
        [...toFetch].map(
          (expr) => fetchPreview(expr, postId).then((r) => {
            var _a2;
            return {
              expr,
              preview: (_a2 = r == null ? void 0 : r.preview) != null ? _a2 : ""
            };
          })
        )
      ).then((results) => {
        results.forEach(({ expr, preview }) => {
          viewCache.set(cacheKey(expr, postId), preview);
        });
        if (isQueryChild) {
          applyViewsDOM(postId, clientId);
        } else {
          applyViewsAttr(html, postId, attrName, setAttributes, lastWritten);
        }
      });
    }, [attributes[attrName], postId]);
    useEffect2(() => {
      var _a, _b;
      if (!attrName) return;
      const editorPostId = ((_b = (_a = select("core/editor")) == null ? void 0 : _a.getCurrentPostId) == null ? void 0 : _b.call(_a)) || 0;
      if (postId === editorPostId) return;
      const id = requestAnimationFrame(() => applyViewsDOM(postId, clientId));
      return () => cancelAnimationFrame(id);
    });
  };
  var applyViewsAttr = (html, postId, attrName, setAttributes, lastWritten) => {
    const updated = html.replace(SPAN_TAG_RE, (fullMatch, tagInner, rawExpr) => {
      var _a;
      if (!rawExpr) return fullMatch;
      const existingView = (_a = tagInner.match(/\bdata-vectex-view="([^"]*)"/)) == null ? void 0 : _a[1];
      if (existingView) return fullMatch;
      const expr = decodeAttr(rawExpr);
      const view = viewCache.get(cacheKey(expr, postId));
      if (view === void 0) return fullMatch;
      const cleaned = cleanPreview(view);
      const safeView = cleaned.replace(/"/g, "&quot;");
      const isEmpty = !cleaned.trim().replace(/\u00a0/g, "");
      const emptyAttr = isEmpty ? ' data-vectex-empty=""' : "";
      return fullMatch.replace(
        tagInner,
        tagInner + ` data-vectex-view="${safeView}"${emptyAttr}`
      );
    });
    if (updated !== html) {
      lastWritten.current = updated;
      setAttributes({ [attrName]: updated });
    }
  };
  var applyViewsDOM = (postId, clientId) => {
    const root = getEditorRoot();
    if (!root) return;
    const postWrapper = root.querySelector(`.post-${postId}`);
    const scope = postWrapper || root.querySelector(`[data-block="${clientId}"]`) || root;
    const spans = scope.querySelectorAll("span.vectex-expr-token");
    spans.forEach((span) => {
      const expr = span.getAttribute("data-vectex-expr");
      if (!expr) return;
      const view = viewCache.get(cacheKey(expr, postId));
      if (view === void 0) return;
      const cleaned = cleanPreview(view);
      span.setAttribute("data-vectex-view", cleaned);
      const isEmpty = !cleaned.trim().replace(/\u00a0/g, "");
      if (isEmpty) {
        span.setAttribute("data-vectex-empty", "");
      } else {
        span.removeAttribute("data-vectex-empty");
      }
    });
  };
  var getEditorRoot = () => {
    var _a;
    const iframe = document.querySelector('iframe[name="editor-canvas"]');
    if ((_a = iframe == null ? void 0 : iframe.contentDocument) == null ? void 0 : _a.body) return iframe.contentDocument.body;
    return document.querySelector(".editor-styles-wrapper") || null;
  };

  // modules/editor/constants.js
  var ctx = window.vectexContext || {};
  var config2 = window.vectexEditorConfig || {};
  var icons = config2.icons || {};
  var CATEGORY_ICONS = Object.fromEntries([
    ...(config2.roots || []).map((r) => [r.label, r.icon || icons.modifier || ""]),
    ["Pattern", icons.pattern || ""],
    ["Modifier", icons.modifier || ""]
  ]);
  var buildRoots = () => {
    const roots = (config2.roots || []).map((r) => ({
      label: r.label,
      description: r.description,
      icon: r.icon || icons.modifier || "",
      prefix: r.id,
      group: r.group || "",
      accent: r.accent || ""
    }));
    roots.push({
      label: "Patterns",
      description: "Ready-made expressions for common tasks",
      icon: icons.pattern || "",
      prefix: "_pattern"
    });
    return roots;
  };
  var VE_ROOTS = buildRoots();
  var resolvePreview = (rootId, key) => {
    const rootData = ctx[rootId];
    if (!rootData) return "";
    const val = rootData[key];
    if (val == null) return "";
    if (Array.isArray(val)) return val.join(", ");
    if (typeof val === "boolean") return val ? "true" : "false";
    return String(val);
  };
  var buildCompletions = () => {
    const completions = [];
    for (const root of config2.roots || []) {
      const label = root.label;
      const prefix = root.id;
      const category = label;
      for (const prop of root.properties || []) {
        const expr = prop.expr || `${prefix}.${prop.key}`;
        completions.push({
          label: `${label}: ${prop.label}`,
          expr,
          preview: resolvePreview(prefix, prop.key),
          category,
          prefix
        });
      }
    }
    for (const mod of config2.modifiers || []) {
      const cat = mod.category || "Modifier";
      completions.push({
        label: `${cat}: ${mod.name}`,
        expr: mod.usage || `| ${mod.name}`,
        preview: "",
        category: cat,
        group: mod.group || "",
        prefix: "|"
      });
    }
    for (const pat of config2.patterns || []) {
      completions.push({
        label: `Pattern: ${pat.label}`,
        expr: pat.expr,
        preview: "",
        category: "Pattern",
        prefix: ""
      });
    }
    return completions;
  };
  var VE_COMPLETIONS = buildCompletions();
  var getCompletions = () => {
    var _a, _b;
    const raw = ((_b = (_a = window.wp) == null ? void 0 : _a.hooks) == null ? void 0 : _b.applyFilters) ? window.wp.hooks.applyFilters(
      "vector_expressions.editor.completions",
      VE_COMPLETIONS
    ) : VE_COMPLETIONS;
    const seen = /* @__PURE__ */ new Set();
    return raw.filter((c) => {
      if (seen.has(c.expr)) return false;
      seen.add(c.expr);
      return true;
    });
  };
  var SKIP_CONVERT_BLOCKS = /* @__PURE__ */ new Set([
    "core/code",
    "core/freeform",
    "core/preformatted",
    "core/html",
    "core/shortcode",
    "core/verse"
  ]);
  var TOKEN_REGEX = /(<span\b[^>]*\bclass="vectex-expr-token"[^>]*>[\s\S]*?<\/span>)|(<(?:code|pre)\b[^>]*>[\s\S]*?<\/(?:code|pre)>)|(\{\{\s*([^{}]+?)\s*\}\})/gi;

  // modules/editor/auto-textarea.jsx
  var {
    useRef,
    useCallback,
    useLayoutEffect
  } = window.wp.element;
  var AutoTextarea = ({
    value,
    onChange,
    placeholder = "",
    className = "vectex-class-textarea",
    id,
    onKeyDown,
    inputRef: externalRef
  }) => {
    const elRef = useRef(null);
    const resize = useCallback(() => {
      const el2 = elRef.current;
      if (!el2 || !el2.offsetParent) return;
      el2.style.height = "auto";
      el2.style.height = el2.scrollHeight + "px";
    }, []);
    useLayoutEffect(resize, [value]);
    const callbackRef = useCallback((el2) => {
      elRef.current = el2;
      if (externalRef) externalRef.current = el2;
      if (el2) resize();
    }, []);
    return /* @__PURE__ */ wp.element.createElement(
      "textarea",
      {
        id,
        ref: callbackRef,
        className,
        value,
        onChange: (e) => onChange(e.target.value),
        onFocus: resize,
        onKeyDown,
        placeholder,
        rows: 1,
        spellCheck: false
      }
    );
  };

  // modules/editor/expression-store.js
  var { createReduxStore, register } = window.wp.data;
  var STORE_NAME = "vector-expressions/active-token";
  var DEFAULT_STATE = {
    /** @type {string} Current expression text being edited. */
    expr: "",
    /** @type {boolean} Whether a token is currently being edited. */
    active: false,
    /** @type {object|null} Live preview result { valid, preview }. */
    preview: null
  };
  var refs = {
    applyUpdate: null,
    applyRemove: null,
    dismiss: null
  };
  var store = createReduxStore(STORE_NAME, {
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
      }
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
      }
    }
  });
  register(store);
  var setTokenRefs = ({ applyUpdate, applyRemove, dismiss }) => {
    refs.applyUpdate = applyUpdate;
    refs.applyRemove = applyRemove;
    refs.dismiss = dismiss;
  };
  var getTokenRefs = () => refs;

  // modules/editor/expression-format.jsx
  var {
    useState,
    useEffect,
    useLayoutEffect: useLayoutEffect2,
    useRef: useRef2,
    useCallback: useCallback2,
    useMemo
  } = window.wp.element;
  var {
    Button,
    Icon
  } = window.wp.components;
  var { __ } = window.wp.i18n;
  var {
    registerFormatType,
    applyFormat,
    removeFormat,
    concat,
    slice,
    useAnchor
  } = window.wp.richText;
  var { select: select2, useSelect, useDispatch } = window.wp.data;
  var { RichTextToolbarButton } = window.wp.blockEditor;
  var useActiveTokenState = (isActive, contentRef, sidebarActive) => {
    useEffect(() => {
      const el2 = contentRef == null ? void 0 : contentRef.current;
      if (!el2) return;
      if (isActive) {
        const span = el2.querySelector("span.vectex-expr-token[data-rich-text-format-boundary]");
        if (span) span.setAttribute("data-vectex-active", "");
      } else if (!sidebarActive) {
        el2.querySelectorAll("span.vectex-expr-token").forEach((m) => {
          m.removeAttribute("data-vectex-active");
          m.removeAttribute("data-rich-text-format-boundary");
        });
      }
    }, [isActive, contentRef, sidebarActive]);
  };
  var getTokenSpan = (n, el2) => {
    let cur = n.nodeType === Node.TEXT_NODE ? n.parentElement : n;
    while (cur && cur !== el2) {
      if (cur.tagName === "SPAN" && cur.classList.contains("vectex-expr-token")) return cur;
      cur = cur.parentElement;
    }
    return null;
  };
  var placeCursorAdjacentToSpan = (sel, doc, span, side) => {
    const range = doc.createRange();
    if (side === "before") range.setStartBefore(span);
    else range.setStartAfter(span);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  };
  var useTokenEventListeners = (contentRef, refs2) => {
    useEffect(() => {
      let interval = null;
      let el2 = null;
      const onKeyDown = (evt) => {
        var _a, _b, _c, _d;
        if (!el2) return;
        const { key } = evt;
        if (key === "Escape" && refs2.tokenActiveRef.current) {
          evt.preventDefault();
          evt.stopPropagation();
          (_b = (_a = refs2.dismissRef).current) == null ? void 0 : _b.call(_a);
          return;
        }
        if (key === "Tab") {
          const listbox = el2.ownerDocument.querySelector('[role="listbox"].components-autocomplete__results');
          if (listbox) {
            const selected = listbox.querySelector('[aria-selected="true"]');
            if (selected) {
              evt.preventDefault();
              evt.stopPropagation();
              selected.click();
            }
            return;
          }
        }
        const iframeDoc = el2.ownerDocument;
        const iframeWin = iframeDoc.defaultView;
        const sel = iframeWin.getSelection();
        if (!sel || !sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        const node = range.startContainer;
        if (key === "ArrowLeft" || key === "ArrowRight") {
          const span = getTokenSpan(node, el2);
          if (span) {
            evt.preventDefault();
            evt.stopPropagation();
            placeCursorAdjacentToSpan(sel, iframeDoc, span, key === "ArrowLeft" ? "before" : "after");
          }
        }
        if (key === "Enter" || key === " ") {
          if (refs2.isActiveRef.current) {
            const inside = getTokenSpan(node, el2);
            if (inside || !range.collapsed) {
              evt.preventDefault();
              evt.stopPropagation();
              (_d = (_c = refs2.openSidebarRef).current) == null ? void 0 : _d.call(_c);
            }
            return;
          }
        }
        if (refs2.isActiveRef.current && !refs2.tokenActiveRef.current && key.length === 1 && !evt.ctrlKey && !evt.metaKey) {
          const span = getTokenSpan(node, el2);
          if (span) {
            const isStart = (node.nodeType === Node.TEXT_NODE || node === span) && range.startOffset === 0;
            placeCursorAdjacentToSpan(sel, iframeDoc, span, isStart ? "before" : "after");
          }
        }
      };
      const tryAttach = () => {
        if (el2) return true;
        if (contentRef.current) {
          el2 = contentRef.current;
          el2.addEventListener("keydown", onKeyDown, true);
          return true;
        }
        return false;
      };
      if (!tryAttach()) {
        interval = setInterval(() => {
          if (tryAttach()) clearInterval(interval);
        }, 100);
      }
      return () => {
        if (interval) clearInterval(interval);
        if (el2) {
          el2.removeEventListener("keydown", onKeyDown, true);
        }
      };
    }, []);
  };
  var config3 = window.vectexEditorConfig || {};
  var getPatterns = () => {
    const patterns = (config3.patterns || []).map((p) => ({
      expr: p.expr,
      label: p.label,
      category: p.category || null
    }));
    const { applyFilters: applyFilters2 } = window.wp.hooks;
    const raw = applyFilters2 ? applyFilters2("vectorExpressions.suggestions.patterns", patterns) : patterns;
    const seen = /* @__PURE__ */ new Set();
    return raw.filter((p) => {
      if (seen.has(p.expr)) return false;
      seen.add(p.expr);
      return true;
    });
  };
  var getCategories = (completions) => {
    var _a;
    const seen = /* @__PURE__ */ new Map();
    for (const item of completions) {
      const cat = item.category;
      if (!cat || cat === "Pattern") continue;
      const group = item.group || "";
      const compositeKey = group ? `${group}:${cat.toLowerCase()}` : cat.toLowerCase();
      if (!seen.has(cat)) {
        seen.set(cat, { key: compositeKey, label: cat, items: [] });
      }
      seen.get(cat).items.push(item);
    }
    const patterns = getPatterns();
    const patternBuckets = /* @__PURE__ */ new Map();
    const rootMap = (config3.roots || []).reduce((m, r) => ({ ...m, [r.id]: r.label }), {});
    for (const p of patterns) {
      if (p.category) {
        const catLabel2 = p.category;
        if (!patternBuckets.has(catLabel2)) {
          patternBuckets.set(catLabel2, { key: catLabel2.toLowerCase().replace(/\s+/g, "-"), label: catLabel2, items: [] });
        }
        patternBuckets.get(catLabel2).items.push(p);
        continue;
      }
      const root = (_a = (p.expr || "").split(".")[0]) == null ? void 0 : _a.toLowerCase();
      const catLabel = rootMap[root];
      if (catLabel) {
        const bucketLabel = catLabel + " Patterns";
        if (!patternBuckets.has(bucketLabel)) {
          patternBuckets.set(bucketLabel, { key: bucketLabel.toLowerCase().replace(/\s+/g, "-"), label: bucketLabel, items: [] });
        }
        patternBuckets.get(bucketLabel).items.push({ ...p, category: bucketLabel });
      }
    }
    const cats = [...seen.values(), ...patternBuckets.values()];
    const { applyFilters: applyFilters2 } = window.wp.hooks;
    return applyFilters2 ? applyFilters2("vectorExpressions.suggestions.categories", cats, completions) : cats;
  };
  var ExpressionSuggestions = ({ expr, onSelect }) => {
    const [search, setSearch] = useState("");
    const [open, setOpen] = useState({});
    const [activeFilter, setFilter] = useState(null);
    const suggestionsRef = useRef2(null);
    const completions = getCompletions();
    const categories = getCategories(completions);
    const rawQuery = search.trim();
    const query = rawQuery.toLowerCase();
    const searching = query.length > 0;
    const searchTokens = query.split(/\s+/).filter(Boolean);
    const headingMatches = (label) => {
      if (!searching || !label) return false;
      const h2 = label.toLowerCase();
      return searchTokens.every((t) => h2.includes(t));
    };
    const toggle = (key) => {
      setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
    };
    const toggleFilter = (key) => {
      setFilter((prev) => prev === key ? null : key);
    };
    const filterItems = (items, parentMatch = false) => {
      if (!searching || parentMatch) return items;
      return items.filter((s) => {
        const haystack = [s.expr, s.label, s.hint, s.category].filter(Boolean).join(" ").toLowerCase();
        return searchTokens.every((token) => haystack.includes(token));
      });
    };
    const handleSelect = (s) => {
      var _a;
      const insertExpr = s.expr;
      let newValue = insertExpr;
      if ((_a = s.category) == null ? void 0 : _a.endsWith("Modifier")) {
        let appended = expr.trim();
        if (!appended.endsWith("|") && appended.length > 0) {
          appended += " ";
        }
        newValue = appended + insertExpr;
      }
      onSelect(newValue);
    };
    const chipLabel = (s) => {
      const raw = s.label || s.expr;
      if (s.category) {
        const prefix = s.category + ": ";
        if (raw.startsWith(prefix)) return raw.slice(prefix.length);
      }
      return raw;
    };
    const renderCategory = (cat, indented = false, parentMatch = false) => {
      const catMatch = headingMatches(cat.label);
      const filtered = filterItems(cat.items || [], catMatch || parentMatch);
      if (searching && filtered.length === 0 && !catMatch) return null;
      const isOpen = searching || !!activeFilter || !!open[cat.key];
      const classes = "vectex-suggestions-group" + (indented ? " vectex-suggestions-group--nested" : "");
      return /* @__PURE__ */ wp.element.createElement("div", { key: cat.key, className: classes }, /* @__PURE__ */ wp.element.createElement(
        "button",
        {
          className: "vectex-suggestions-header" + (isOpen ? " is-open" : "") + (indented ? " vectex-suggestions-header--sub" : ""),
          onClick: () => !searching && toggle(cat.key),
          "aria-expanded": isOpen
        },
        cat.accent && /* @__PURE__ */ wp.element.createElement("span", { className: "vectex-suggestions-accent vectex-suggestions-accent--" + cat.accent }),
        /* @__PURE__ */ wp.element.createElement("span", null, cat.label),
        /* @__PURE__ */ wp.element.createElement("span", { className: "vectex-suggestions-count" }, filtered.length),
        !searching && /* @__PURE__ */ wp.element.createElement("span", { className: "vectex-suggestions-arrow" }, isOpen ? "\u25B2" : "\u25BC")
      ), isOpen && /* @__PURE__ */ wp.element.createElement("div", { className: "vectex-suggestions-items" }, filtered.map((s) => /* @__PURE__ */ wp.element.createElement(
        Button,
        {
          key: s.expr + (s.label || ""),
          variant: "secondary",
          size: "small",
          className: "vectex-suggestion-chip",
          onMouseDown: (e) => e.preventDefault(),
          onClick: () => handleSelect(s)
        },
        chipLabel(s)
      ))));
    };
    const renderGroup = (group) => {
      const groupMatch = headingMatches(group.label);
      let totalVisible = 0;
      const visibleCats = (group.categories || []).filter((cat) => {
        const catMatch = headingMatches(cat.label);
        const filtered = filterItems(cat.items || [], groupMatch || catMatch);
        totalVisible += filtered.length;
        return !searching || filtered.length > 0 || catMatch;
      });
      if (visibleCats.length === 0) return null;
      const isOpen = searching || !!activeFilter || !!open[group.key];
      return /* @__PURE__ */ wp.element.createElement("div", { key: group.key, className: "vectex-suggestions-group vectex-suggestions-group--parent", "data-group-key": group.key }, /* @__PURE__ */ wp.element.createElement(
        "button",
        {
          className: "vectex-suggestions-header vectex-suggestions-header--group" + (isOpen ? " is-open" : ""),
          onClick: () => !searching && toggle(group.key),
          "aria-expanded": isOpen
        },
        group.icon && /* @__PURE__ */ wp.element.createElement("span", { className: "vectex-suggestions-group-icon", dangerouslySetInnerHTML: { __html: group.icon } }),
        /* @__PURE__ */ wp.element.createElement("span", null, group.label),
        /* @__PURE__ */ wp.element.createElement("span", { className: "vectex-suggestions-count" }, totalVisible),
        !searching && /* @__PURE__ */ wp.element.createElement("span", { className: "vectex-suggestions-arrow" }, isOpen ? "\u25B2" : "\u25BC")
      ), isOpen && /* @__PURE__ */ wp.element.createElement("div", { className: "vectex-suggestions-group-body" }, visibleCats.map((cat) => renderCategory(cat, true, groupMatch))));
    };
    return /* @__PURE__ */ wp.element.createElement("div", { className: "vectex-suggestions", ref: suggestionsRef }, /* @__PURE__ */ wp.element.createElement("div", { className: "vectex-discovery-header" }, /* @__PURE__ */ wp.element.createElement("span", { className: "vectex-discovery-label" }, __("Browse Data & Filters", "vector-expressions")), /* @__PURE__ */ wp.element.createElement("div", { className: "vectex-discovery-search" }, /* @__PURE__ */ wp.element.createElement("svg", { className: "vectex-discovery-search-icon", width: "14", height: "14", viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ wp.element.createElement("circle", { cx: "8.5", cy: "8.5", r: "5.5" }), /* @__PURE__ */ wp.element.createElement("path", { d: "M14 14l4 4" })), /* @__PURE__ */ wp.element.createElement(
      "input",
      {
        type: "text",
        placeholder: __("Filter suggestions\u2026", "vector-expressions"),
        value: search,
        onChange: (e) => setSearch(e.target.value)
      }
    ))), categories.some((e) => e.categories) && /* @__PURE__ */ wp.element.createElement("div", { className: "vectex-root-strip", role: "navigation", "aria-label": __("Filter by group", "vector-expressions") }, categories.filter((e) => e.categories).map((group) => /* @__PURE__ */ wp.element.createElement(
      "button",
      {
        key: group.key,
        className: "vectex-root-strip-btn" + (activeFilter === group.key ? " is-active" : ""),
        onClick: () => toggleFilter(group.key),
        title: group.label,
        "aria-label": group.label
      },
      group.icon ? /* @__PURE__ */ wp.element.createElement("span", { dangerouslySetInnerHTML: { __html: group.icon } }) : /* @__PURE__ */ wp.element.createElement("span", null, group.label.charAt(0))
    ))), categories.filter((entry) => !activeFilter || entry.key === activeFilter).map(
      (entry) => entry.categories ? renderGroup(entry) : renderCategory(entry)
    ), !searching && !activeFilter && Object.keys(open).every((k) => !open[k]) && (() => {
      var _a;
      const trimmed = (expr || "").trim();
      const root = (_a = trimmed.split(".")[0]) == null ? void 0 : _a.toLowerCase();
      const hasPipe = trimmed.includes("|");
      const hasTernary = trimmed.includes("?");
      if (!trimmed) {
        const quickstartItems = (config3.quickstart || []).map((qs) => ({
          expr: qs.expr,
          label: qs.label
        }));
        if (quickstartItems.length === 0) return null;
        return /* @__PURE__ */ wp.element.createElement("div", { className: "vectex-suggestions-quickstart" }, /* @__PURE__ */ wp.element.createElement("span", { className: "vectex-suggestions-quickstart-label" }, __("Quick Start", "vector-expressions")), /* @__PURE__ */ wp.element.createElement("div", { className: "vectex-suggestions-quickstart-items" }, quickstartItems.map((qs) => /* @__PURE__ */ wp.element.createElement(
          Button,
          {
            key: qs.expr,
            variant: "secondary",
            size: "small",
            className: "vectex-suggestion-chip vectex-suggestion-chip--quickstart",
            onMouseDown: (e) => e.preventDefault(),
            onClick: () => handleSelect(qs)
          },
          qs.label
        ))));
      }
      if (hasTernary && !hasPipe) {
        return null;
      }
      const dotParts = trimmed.split(/\s*\|/)[0].trim().split(".");
      const property = dotParts.length > 1 ? dotParts.slice(1).join(".").toLowerCase() : "";
      const propType = (() => {
        for (const r of config3.roots || []) {
          if (r.id !== root) continue;
          for (const p of r.properties || []) {
            if (p.key === property) return p.type || "string";
          }
        }
        return "string";
      })();
      const isDate = propType === "date";
      const isImage = propType === "image";
      const isHTML = propType === "html";
      const isArray = propType === "array";
      const isPrice = propType === "price";
      const appliedMods = new Set(
        (trimmed.match(/\|\s*(\w+)/g) || []).map((m) => m.replace(/\|\s*/, "").toLowerCase())
      );
      const contextLabel = hasPipe ? __("Add Another Modifier", "vector-expressions") : __("Try a Modifier", "vector-expressions");
      const scoreModifier = (c) => {
        const modName = (c.expr || "").replace(/^\|\s*/, "").split(/\s/)[0].toLowerCase();
        if (appliedMods.has(modName)) return -1;
        if (isDate && modName === "date") return 100;
        if (isImage && (modName === "thumbnail" || modName === "mb_image")) return 100;
        if (isHTML && ["strip_tags", "wp_excerpt", "word_count", "reading_time", "nl2br", "raw"].includes(modName)) return 90;
        if (isArray && ["join", "count", "first", "last", "sort", "reverse", "pluck"].includes(modName)) return 90;
        if (isPrice && modName === "wc_price") return 100;
        if (root === "acf" && c.category === "ACF Modifier") return 50;
        if (["mb", "mb_setting", "mb_user", "mb_term"].includes(root) && c.category === "MB Modifier") return 50;
        if (["woo_product", "woo_shop", "woo_cart"].includes(root) && c.category === "WC Modifier") return 50;
        if (c.category === "Modifier" || c.category === "WP Modifier") {
          if (["get_user", "get_post"].includes(modName) && root !== "post") return -1;
          if (["terms", "categories", "tags"].includes(modName) && root !== "post") return -1;
          if (modName === "date" && !isDate) return 5;
          if (["sort", "reverse", "first", "last", "pluck"].includes(modName) && !isArray) return 3;
          if (["strip_tags", "nl2br", "wp_excerpt", "word_count", "reading_time"].includes(modName) && !isHTML) return 3;
          if (modName === "thumbnail" && !isImage) return 3;
          if (["upper", "lower", "default", "if", "match", "esc_html", "count"].includes(modName)) return 40;
          return 20;
        }
        return -1;
      };
      const scored = completions.filter((c) => c.category && c.category.endsWith("Modifier")).map((c) => ({ ...c, _score: scoreModifier(c) })).filter((c) => c._score > 0).sort((a, b) => b._score - a._score);
      const rootPatterns = completions.filter(
        (c) => c.category === "Pattern" && (c.expr || "").toLowerCase().startsWith(root + ".")
      );
      const suggestions = [...scored.slice(0, 6), ...rootPatterns.slice(0, 2)];
      if (suggestions.length === 0) return null;
      return /* @__PURE__ */ wp.element.createElement("div", { className: "vectex-suggestions-quickstart" }, /* @__PURE__ */ wp.element.createElement("span", { className: "vectex-suggestions-quickstart-label" }, contextLabel), /* @__PURE__ */ wp.element.createElement("div", { className: "vectex-suggestions-quickstart-items" }, suggestions.map((s) => /* @__PURE__ */ wp.element.createElement(
        Button,
        {
          key: s.expr + (s.label || ""),
          variant: "secondary",
          size: "small",
          className: "vectex-suggestion-chip vectex-suggestion-chip--quickstart",
          onMouseDown: (e) => e.preventDefault(),
          onClick: () => handleSelect(s),
          title: s.expr
        },
        chipLabel(s)
      ))));
    })());
  };
  var ExpressionEdit = ({ isActive, activeAttributes, value, onChange, contentRef }) => {
    const isActiveRef = useRef2(false);
    const tokenActiveRef = useRef2(false);
    const dismissRef = useRef2(null);
    const openSidebarRef = useRef2(null);
    const storeDispatch = useDispatch(STORE_NAME);
    const sidebarDispatch = useDispatch("core/edit-post");
    const isTokenStoreActive = useSelect((sel) => sel(STORE_NAME).isTokenActive(), []);
    tokenActiveRef.current = isTokenStoreActive;
    useLayoutEffect2(() => {
      isActiveRef.current = isActive;
    }, [isActive]);
    useActiveTokenState(isActive, contentRef, isTokenStoreActive);
    const openSidebar = useCallback2(() => {
      const expr = (activeAttributes == null ? void 0 : activeAttributes.expr) || "";
      storeDispatch.setActiveToken(expr);
      if (sidebarDispatch.openGeneralSidebar) {
        sidebarDispatch.openGeneralSidebar("vector-expressions/vector-expressions");
      }
    }, [activeAttributes == null ? void 0 : activeAttributes.expr, storeDispatch, sidebarDispatch]);
    openSidebarRef.current = openSidebar;
    useEffect(() => {
      if (isActive) {
        openSidebar();
      }
    }, [isActive]);
    useEffect(() => {
      if (isActive && (activeAttributes == null ? void 0 : activeAttributes.expr)) {
        storeDispatch.updateExpr(activeAttributes.expr);
      }
    }, [isActive, activeAttributes == null ? void 0 : activeAttributes.expr]);
    useEffect(() => {
      if (!isActive) {
        storeDispatch.clearActiveToken();
      }
    }, [isActive]);
    const applyUpdate = useCallback2((exprOverride) => {
      var _a, _b;
      const expr = (exprOverride != null ? exprOverride : select2(STORE_NAME).getExpr()).trim();
      if (!expr) return;
      const postId = ((_b = (_a = select2("core/editor")) == null ? void 0 : _a.getCurrentPostId) == null ? void 0 : _b.call(_a)) || 0;
      const cached = getCachedView(expr, postId);
      const attrs = { expr, contentEditable: "false" };
      if (cached !== void 0) {
        attrs.view = cached;
      }
      const next = applyFormat(value, {
        type: "vector/expression",
        attributes: attrs
      });
      next.start = next.end;
      onChange(next);
    }, [value, onChange]);
    const applyRemove = useCallback2(() => {
      var _a;
      const formats = (_a = value.formats) != null ? _a : [];
      let pivot = value.start;
      const hasFormat = (i) => {
        var _a2;
        return (_a2 = formats[i]) == null ? void 0 : _a2.some((f) => f.type === "vector/expression");
      };
      if (pivot > 0 && !hasFormat(pivot) && hasFormat(pivot - 1)) pivot--;
      if (!hasFormat(pivot)) {
        onChange(removeFormat(value, "vector/expression"));
        return;
      }
      let rangeStart = pivot;
      while (rangeStart > 0 && hasFormat(rangeStart - 1)) rangeStart--;
      let rangeEnd = pivot;
      while (rangeEnd < formats.length && hasFormat(rangeEnd)) rangeEnd++;
      onChange(concat(slice(value, 0, rangeStart), slice(value, rangeEnd)));
    }, [value, onChange]);
    const dismiss = useCallback2(() => {
      storeDispatch.clearActiveToken();
      const el2 = contentRef == null ? void 0 : contentRef.current;
      const span = el2 == null ? void 0 : el2.querySelector("span[data-vectex-active]");
      if (el2 && span) {
        const iframeDoc = el2.ownerDocument;
        const range = iframeDoc.createRange();
        range.setStartAfter(span);
        range.collapse(true);
        const sel = iframeDoc.defaultView.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      el2 == null ? void 0 : el2.focus();
    }, [contentRef, storeDispatch]);
    dismissRef.current = dismiss;
    setTokenRefs({ applyUpdate, applyRemove, dismiss });
    const storeExpr = useSelect((sel) => sel(STORE_NAME).getExpr(), []);
    useEffect(() => {
      if (!isActive || !storeExpr.trim()) {
        if (!storeExpr.trim()) storeDispatch.setPreview(null);
        return;
      }
      let cancelled = false;
      const id = setTimeout(async () => {
        var _a, _b;
        const postId = ((_b = (_a = select2("core/editor")) == null ? void 0 : _a.getCurrentPostId) == null ? void 0 : _b.call(_a)) || 0;
        const view = await fetchPreview(storeExpr.trim(), postId);
        if (!cancelled) storeDispatch.setPreview(view);
      }, 300);
      return () => {
        cancelled = true;
        clearTimeout(id);
      };
    }, [storeExpr, isActive]);
    useTokenEventListeners(contentRef, {
      isActiveRef,
      tokenActiveRef,
      dismissRef,
      openSidebarRef
    });
    return /* @__PURE__ */ wp.element.createElement(
      RichTextToolbarButton,
      {
        icon: () => /* @__PURE__ */ wp.element.createElement(Icon, { icon: "database" }),
        title: __("Edit Vector Expression", "vector-expressions"),
        onClick: openSidebar,
        isActive
      }
    );
  };
  var registerExpressionFormat = () => {
    registerFormatType("vector/expression", {
      title: __("Dynamic Value", "vector-expressions"),
      tagName: "span",
      className: "vectex-expr-token",
      attributes: {
        expr: "data-vectex-expr",
        view: "data-vectex-view",
        contentEditable: "contenteditable"
      },
      __unstableInputRule(value) {
        const { start, text } = value;
        const { applyFormat: applyFormat2 } = window.wp.richText;
        if (text.substring(start - 2, start) !== "}}") {
          return value;
        }
        const openingIndex = text.lastIndexOf("{{", start - 2);
        if (openingIndex !== -1) {
          const intermediateClose = text.indexOf("}}", openingIndex + 2);
          if (intermediateClose === start - 2) {
            return applyFormat2(
              value,
              { type: "vector/expression" },
              openingIndex,
              start
            );
          }
        }
        return value;
      },
      edit: ExpressionEdit
    });
  };

  // modules/editor/autocompleter.js
  var { addFilter } = window.wp.hooks;
  var { createElement: el, RawHTML } = window.wp.element;
  var TOP_PICK_EXPRS = /* @__PURE__ */ new Set([
    "post.title",
    "post.date | date",
    "post.author_name",
    "post.meta.my_key",
    "user.name",
    "user.is_logged_in",
    "user.role",
    "site.name",
    "user.is_logged_in ? 'Hello, ' + user.name : 'Hello, Guest'",
    "user.name | default:'Guest'"
  ]);
  var getOptions = (query) => {
    const completions = getCompletions();
    const q = (query != null ? query : "").trim().toLowerCase();
    if (q === "") {
      return completions.filter((o) => TOP_PICK_EXPRS.has(o.expr));
    }
    if (q.includes("|")) {
      return completions.filter((o) => o.prefix === "|");
    }
    const prefixes = new Set(completions.map((o) => o.prefix).filter(Boolean));
    for (const prefix of prefixes) {
      if (prefix !== "|" && q.startsWith(prefix)) {
        return completions.filter((o) => o.prefix === prefix);
      }
    }
    return completions.filter(
      (o) => o.label.toLowerCase().includes(q) || o.expr.toLowerCase().includes(q)
    );
  };
  var renderOption = (o) => {
    const iconSvg = CATEGORY_ICONS[o.category] || "";
    return el(
      "div",
      {
        className: "vectex-autocompleter-option",
        style: { padding: "0", width: "100%", flexWrap: "nowrap", gap: "8px" }
      },
      el(
        "span",
        {
          className: "vectex-ac-icon",
          style: { display: "inline-flex", flexShrink: 0, color: "#757575" }
        },
        el(RawHTML, null, iconSvg)
      ),
      el(
        "div",
        {
          style: {
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flexShrink: 0,
            maxWidth: "140px",
            fontWeight: 500,
            fontSize: "12px",
            color: "#1e1e1e"
          }
        },
        o.label
      ),
      el(
        "code",
        {
          style: {
            marginLeft: "auto",
            color: "#757575",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flexShrink: 1,
            fontFamily: "ui-monospace, 'SFMono-Regular', Consolas, monospace",
            fontSize: "11px",
            background: "transparent",
            padding: 0
          }
        },
        o.expr
      )
    );
  };
  var buildCompleter = () => ({
    name: "vector-expressions",
    triggerPrefix: "{{",
    options: getOptions,
    getOptionKeywords: (o) => [o.label, o.expr, o.category],
    getOptionLabel: renderOption,
    /**
     * Wrap the expression in `{{ … }} ` template syntax.
     * The trailing space gives the cursor a landing spot and prevents the
     * autocomplete from consuming the next keypress.
     *
     * @param {VeCompletion} o
     * @returns {string}
     */
    getOptionCompletion: (o) => "{{ " + o.expr + " }} "
  });
  var registerAutocompleter = () => {
    addFilter(
      "editor.Autocomplete.completers",
      "vector-expressions.autocompleter",
      (completers) => [...completers, buildCompleter()]
    );
  };

  // modules/editor/logic-panel.jsx
  var {
    Fragment,
    useState: useState2,
    useMemo: useMemo2,
    useCallback: useCallback3
  } = window.wp.element;
  var { createHigherOrderComponent } = window.wp.compose;
  var { addFilter: addFilter2 } = window.wp.hooks;
  var {
    Button: Button2,
    SelectControl,
    ExternalLink
  } = window.wp.components;
  var { __: __2 } = window.wp.i18n;
  var { select: select3 } = window.wp.data;
  var getRichTextAttrName = (blockName) => {
    const blockType = select3("core/blocks").getBlockType(blockName);
    if (!(blockType == null ? void 0 : blockType.attributes)) return null;
    const entry = Object.entries(blockType.attributes).find(
      ([, cfg]) => cfg.source === "html" || cfg.source === "rich-text"
    );
    return entry ? entry[0] : null;
  };
  var convertTokens = (html, postId = 0) => {
    TOKEN_REGEX.lastIndex = 0;
    return html.replace(
      TOKEN_REGEX,
      (match, existingSpan, codeBlock, _fullExpr, expr) => {
        if (codeBlock) return codeBlock;
        if (existingSpan && existingSpan.startsWith("<span ")) {
          return existingSpan;
        }
        const e = expr.trim().replace(/\s*\|\s*/g, " | ");
        const safeExpr = e.replace(/"/g, "&quot;");
        const cached = getCachedView(e, postId);
        let viewAttrs = "";
        if (cached !== void 0) {
          const safeView = cached.replace(/"/g, "&quot;");
          const isEmpty = !cached.trim().replace(/\u00a0/g, "");
          viewAttrs = ` data-vectex-view="${safeView}"${isEmpty ? ' data-ve-empty=""' : ""}`;
        }
        return `<span class="vectex-expr-token" data-vectex-expr="${safeExpr}"${viewAttrs} contenteditable="false">{{ ${e} }}</span>`;
      }
    );
  };
  var usePass1Conversion = (setAttributes, attrName, blockName, postId) => useCallback3(
    (attrs) => {
      if (!attrName || SKIP_CONVERT_BLOCKS.has(blockName)) return setAttributes(attrs);
      if (!(attrName in attrs)) return setAttributes(attrs);
      const raw = attrs[attrName];
      const html = typeof raw === "string" ? raw : String(raw != null ? raw : "");
      if (!html.includes("{{")) return setAttributes(attrs);
      const converted = convertTokens(html, postId);
      setAttributes(
        converted !== html ? { ...attrs, [attrName]: converted } : attrs
      );
    },
    [setAttributes, attrName, blockName, postId]
  );
  var ClassTextarea = ({ value, onChange, placeholder }) => {
    const { __: __4 } = window.wp.i18n;
    return /* @__PURE__ */ wp.element.createElement("div", { className: "vectex-class-field" }, /* @__PURE__ */ wp.element.createElement(
      "label",
      {
        className: "components-base-control__label",
        htmlFor: "vectex-class-input"
      },
      __4("Template", "vector-expressions")
    ), /* @__PURE__ */ wp.element.createElement(
      AutoTextarea,
      {
        id: "vectex-class-input",
        value,
        onChange,
        placeholder
      }
    ), /* @__PURE__ */ wp.element.createElement("p", { className: "components-base-control__help" }, __4("Mix static text and", "vector-expressions"), " ", /* @__PURE__ */ wp.element.createElement("code", null, "{{ expressions }}"), " ", __4("freely. Each token is evaluated and the full string becomes the class.", "vector-expressions")));
  };
  var LogicSidebarContent = ({ vectex_logic, update, blockName }) => {
    const [showRef, setShowRef] = useState2(false);
    return /* @__PURE__ */ wp.element.createElement(Fragment, null, /* @__PURE__ */ wp.element.createElement("div", { className: "vectex-section" }, /* @__PURE__ */ wp.element.createElement("p", { className: "vectex-section-label" }, __2("Visibility", "vector-expressions")), /* @__PURE__ */ wp.element.createElement(
      SelectControl,
      {
        label: __2("Action", "vector-expressions"),
        value: (vectex_logic == null ? void 0 : vectex_logic.visible_action) || "show",
        options: [
          { label: __2("Show if True", "vector-expressions"), value: "show" },
          { label: __2("Hide if True", "vector-expressions"), value: "hide" }
        ],
        onChange: (v) => update("visible_action", v),
        __nextHasNoMarginBottom: true
      }
    ), /* @__PURE__ */ wp.element.createElement("div", { className: "vectex-class-field vectex-condition-field" }, /* @__PURE__ */ wp.element.createElement(
      "label",
      {
        className: "components-base-control__label",
        htmlFor: "vectex-condition-input"
      },
      __2("Condition", "vector-expressions")
    ), /* @__PURE__ */ wp.element.createElement("div", { className: "vectex-expr-field" }, /* @__PURE__ */ wp.element.createElement("span", { className: "vectex-expr-brace", "aria-hidden": "true" }, "{{ "), /* @__PURE__ */ wp.element.createElement(
      AutoTextarea,
      {
        id: "vectex-condition-input",
        value: (vectex_logic == null ? void 0 : vectex_logic.visible) || "",
        onChange: (v) => update("visible", v),
        placeholder: "user.is_logged_in",
        className: "vectex-class-textarea"
      }
    ), /* @__PURE__ */ wp.element.createElement("span", { className: "vectex-expr-brace", "aria-hidden": "true" }, " }}"))), /* @__PURE__ */ wp.element.createElement("div", { className: "vectex-syntax-ref-wrap" }, /* @__PURE__ */ wp.element.createElement(
      Button2,
      {
        variant: "link",
        size: "small",
        className: "vectex-syntax-ref-toggle",
        onClick: () => setShowRef(!showRef),
        "aria-expanded": showRef
      },
      __2("Syntax reference", "vector-expressions"),
      " ",
      showRef ? "\u25B2" : "\u25BC"
    ), showRef && /* @__PURE__ */ wp.element.createElement("table", { className: "vectex-syntax-ref" }, /* @__PURE__ */ wp.element.createElement("tbody", null, /* @__PURE__ */ wp.element.createElement("tr", { className: "vectex-ref-head" }, /* @__PURE__ */ wp.element.createElement("th", { colSpan: "2" }, __2("Variables", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "user.name")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Display name", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "user.is_logged_in")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Logged in?", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "user.role")), /* @__PURE__ */ wp.element.createElement("td", null, __2("User role", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "post.title")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Post title", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "post.author_name")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Author name", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "post.meta.my_key")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Post meta", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", { className: "vectex-ref-head" }, /* @__PURE__ */ wp.element.createElement("th", { colSpan: "2" }, __2("Operators & Filters", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "a == b")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Equals", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "a ? b : c")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Ternary", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "val | upper")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Filter", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "post.date | date")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Format date", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "post.author | get_user")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Author object", "vector-expressions"))))))), /* @__PURE__ */ wp.element.createElement("div", { className: "vectex-section vectex-section--bordered" }, /* @__PURE__ */ wp.element.createElement("p", { className: "vectex-section-label" }, __2("Dynamic Class", "vector-expressions")), /* @__PURE__ */ wp.element.createElement(
      ClassTextarea,
      {
        value: (vectex_logic == null ? void 0 : vectex_logic.class) || "",
        onChange: (v) => update("class", v),
        placeholder: `prefix-{{ user.role | kebab }}`
      }
    )));
  };
  var LogicPanel = createHigherOrderComponent((BlockEdit) => {
    return (props) => {
      var _a, _b, _c, _d;
      const { attributes, setAttributes, name, context, clientId } = props;
      const { vectex_logic } = attributes;
      const attrName = useMemo2(() => getRichTextAttrName(name), [name]);
      const postId = (context == null ? void 0 : context.postId) || ((_b = (_a = select3("core/editor")) == null ? void 0 : _a.getCurrentPostId) == null ? void 0 : _b.call(_a)) || 0;
      const postType = (context == null ? void 0 : context.postType) || ((_d = (_c = select3("core/editor")) == null ? void 0 : _c.getCurrentPostType) == null ? void 0 : _d.call(_c)) || "post";
      const wrappedSetAttributes = usePass1Conversion(setAttributes, attrName, name, postId);
      const newProps = { ...props, setAttributes: wrappedSetAttributes };
      useHydrateViews(attributes, setAttributes, attrName, name, postId, postType, clientId);
      return /* @__PURE__ */ wp.element.createElement(BlockEdit, { ...newProps });
    };
  }, "LogicPanel");
  var registerLogicPanel = () => {
    addFilter2("editor.BlockEdit", "ve.logic-panel", LogicPanel);
    addFilter2(
      "vectorExpressions.sidebar.tab.logic",
      "ve.sidebar-logic",
      (content, vectex_logic, update, blockName) => {
        return /* @__PURE__ */ wp.element.createElement(Fragment, null, content, /* @__PURE__ */ wp.element.createElement(
          LogicSidebarContent,
          {
            vectex_logic,
            update,
            blockName
          }
        ));
      }
    );
    const REQUIRED_CONTEXT = ["postId", "postType"];
    addFilter2("blocks.registerBlockType", "vectex-logic.inject-context", (settings, name) => {
      if (SKIP_CONVERT_BLOCKS.has(name)) return settings;
      const existing = settings.usesContext || [];
      const missing = REQUIRED_CONTEXT.filter((c) => !existing.includes(c));
      if (missing.length === 0) return settings;
      return { ...settings, usesContext: [...existing, ...missing] };
    });
    const { getBlockTypes, unregisterBlockType, registerBlockType } = window.wp.blocks;
    (getBlockTypes() || []).forEach((type) => {
      if (SKIP_CONVERT_BLOCKS.has(type.name)) return;
      const existing = type.usesContext || [];
      const missing = REQUIRED_CONTEXT.filter((c) => !existing.includes(c));
      if (missing.length === 0) return;
      type.usesContext = [...existing, ...missing];
    });
  };

  // modules/editor/vector-sidebar.jsx
  var { createElement: h, Fragment: Fragment2, useMemo: useMemo3 } = window.wp.element;
  var { PluginSidebar, PluginSidebarMoreMenuItem } = window.wp.editor;
  var { registerPlugin } = window.wp.plugins;
  var { useSelect: useSelect2, useDispatch: useDispatch2 } = window.wp.data;
  var { TabPanel, Button: Button3, Tooltip } = window.wp.components;
  var { __: __3 } = window.wp.i18n;
  var { applyFilters } = window.wp.hooks;
  var SIDEBAR_NAME = "vector-expressions";
  var SidebarIcon = () => /* @__PURE__ */ wp.element.createElement(
    "svg",
    {
      width: "24",
      height: "24",
      viewBox: "-376 -15 92 126",
      "aria-hidden": "true",
      focusable: "false"
    },
    /* @__PURE__ */ wp.element.createElement("g", { style: { fill: "currentColor" } }, /* @__PURE__ */ wp.element.createElement("path", { d: "M -372.38427,54.856239 V 40.319598 q 5.39067,-0.242277 7.93459,-2.119927 2.60448,-1.877649 3.937,-5.875225 1.3931,-3.997576 1.3931,-13.506962 0,-11.9927279 1.09025,-16.35372 1.09024,-4.4215615 3.45245,-7.0260429 2.42277,-2.6650507 7.02604,-4.3609921 4.66384,-1.695941 13.38582,-1.695941 h 3.21018 v 14.53664 q -6.48092,0 -8.47971,0.726832 -1.99879,0.6662627 -2.9679,2.2410654 -0.90854,1.5748027 -0.90854,5.8146566 0,7.631736 -0.72683,17.019983 -0.48455,6.117502 -3.33131,10.963049 -2.11993,3.573591 -7.32889,6.965474 4.42156,2.543912 7.02604,6.480919 2.60448,3.876437 3.45245,9.872801 0.36342,2.604481 0.84797,16.959414 0.18171,5.269532 0.66627,6.541488 0.7874,1.877649 2.90732,2.846759 2.1805,0.969109 8.84313,0.969109 v 14.476072 h -3.21018 q -8.78255,0 -13.0224,-1.45366 -4.23986,-1.3931 -6.90491,-4.17929 -2.66505,-2.725619 -3.87644,-6.965473 -1.15081,-4.179284 -1.15081,-14.476071 0,-11.508173 -1.27196,-15.505749 -1.21139,-4.058146 -3.87644,-6.056934 -2.60448,-1.998788 -8.11629,-2.301634 z" }), /* @__PURE__ */ wp.element.createElement("path", { d: "M -329.85728,54.856239 V 40.319598 q 5.39067,-0.242277 7.93458,-2.119927 2.60448,-1.877649 3.93701,-5.875225 1.39309,-3.997576 1.39309,-13.506962 0,-11.9927279 1.09025,-16.35372 1.09025,-4.4215615 3.45245,-7.0260429 2.42278,-2.6650507 7.02605,-4.3609921 4.66383,-1.695941 13.38582,-1.695941 h 3.21017 v 14.53664 q -6.48092,0 -8.4797,0.726832 -1.99879,0.6662627 -2.9679,2.2410654 -0.90854,1.5748027 -0.90854,5.8146566 0,7.631736 -0.72683,17.019983 -0.48456,6.117502 -3.33132,10.963049 -2.11992,3.573591 -7.32889,6.965474 4.42157,2.543912 7.02605,6.480919 2.60448,3.876437 3.45245,9.872801 0.36341,2.604481 0.84797,16.959414 0.18171,5.269532 0.66626,6.541488 0.7874,1.877649 2.90733,2.846759 2.1805,0.969109 8.84312,0.969109 v 14.476072 h -3.21017 q -8.78256,0 -13.02241,-1.45366 -4.23985,-1.3931 -6.9049,-4.17929 -2.66505,-2.725619 -3.87644,-6.965473 -1.15082,-4.179284 -1.15082,-14.476071 0,-11.508173 -1.27195,-15.505749 -1.21139,-4.058146 -3.87644,-6.056934 -2.60448,-1.998788 -8.11629,-2.301634 z" }))
  );
  var TabIcon = ({ label, children }) => /* @__PURE__ */ wp.element.createElement("span", { className: "vectex-tab-icon", title: label, "aria-label": label }, children);
  var ExpressionTabIcon = () => /* @__PURE__ */ wp.element.createElement(TabIcon, { label: __3("Expression", "vector-expressions") }, /* @__PURE__ */ wp.element.createElement("svg", { width: "20", height: "20", viewBox: "-376 -15 92 126", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ wp.element.createElement("g", { style: { fill: "currentColor" } }, /* @__PURE__ */ wp.element.createElement("path", { d: "M -372.38427,54.856239 V 40.319598 q 5.39067,-0.242277 7.93459,-2.119927 2.60448,-1.877649 3.937,-5.875225 1.3931,-3.997576 1.3931,-13.506962 0,-11.9927279 1.09025,-16.35372 1.09024,-4.4215615 3.45245,-7.0260429 2.42277,-2.6650507 7.02604,-4.3609921 4.66384,-1.695941 13.38582,-1.695941 h 3.21018 v 14.53664 q -6.48092,0 -8.47971,0.726832 -1.99879,0.6662627 -2.9679,2.2410654 -0.90854,1.5748027 -0.90854,5.8146566 0,7.631736 -0.72683,17.019983 -0.48455,6.117502 -3.33131,10.963049 -2.11993,3.573591 -7.32889,6.965474 4.42156,2.543912 7.02604,6.480919 2.60448,3.876437 3.45245,9.872801 0.36342,2.604481 0.84797,16.959414 0.18171,5.269532 0.66627,6.541488 0.7874,1.877649 2.90732,2.846759 2.1805,0.969109 8.84313,0.969109 v 14.476072 h -3.21018 q -8.78255,0 -13.0224,-1.45366 -4.23986,-1.3931 -6.90491,-4.17929 -2.66505,-2.725619 -3.87644,-6.965473 -1.15081,-4.179284 -1.15081,-14.476071 0,-11.508173 -1.27196,-15.505749 -1.21139,-4.058146 -3.87644,-6.056934 -2.60448,-1.998788 -8.11629,-2.301634 z" }), /* @__PURE__ */ wp.element.createElement("path", { d: "M -329.85728,54.856239 V 40.319598 q 5.39067,-0.242277 7.93458,-2.119927 2.60448,-1.877649 3.93701,-5.875225 1.39309,-3.997576 1.39309,-13.506962 0,-11.9927279 1.09025,-16.35372 1.09025,-4.4215615 3.45245,-7.0260429 2.42278,-2.6650507 7.02605,-4.3609921 4.66383,-1.695941 13.38582,-1.695941 h 3.21017 v 14.53664 q -6.48092,0 -8.4797,0.726832 -1.99879,0.6662627 -2.9679,2.2410654 -0.90854,1.5748027 -0.90854,5.8146566 0,7.631736 -0.72683,17.019983 -0.48456,6.117502 -3.33132,10.963049 -2.11992,3.573591 -7.32889,6.965474 4.42157,2.543912 7.02605,6.480919 2.60448,3.876437 3.45245,9.872801 0.36341,2.604481 0.84797,16.959414 0.18171,5.269532 0.66626,6.541488 0.7874,1.877649 2.90733,2.846759 2.1805,0.969109 8.84312,0.969109 v 14.476072 h -3.21017 q -8.78256,0 -13.02241,-1.45366 -4.23985,-1.3931 -6.9049,-4.17929 -2.66505,-2.725619 -3.87644,-6.965473 -1.15082,-4.179284 -1.15082,-14.476071 0,-11.508173 -1.27195,-15.505749 -1.21139,-4.058146 -3.87644,-6.056934 -2.60448,-1.998788 -8.11629,-2.301634 z" }))));
  var LogicTabIcon = () => /* @__PURE__ */ wp.element.createElement(TabIcon, { label: __3("Logic", "vector-expressions") }, /* @__PURE__ */ wp.element.createElement("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true", focusable: "false" }, /* @__PURE__ */ wp.element.createElement("path", { d: "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" })));
  var ExpressionTabContent = () => {
    const { expr, preview } = useSelect2((sel) => ({
      expr: sel(STORE_NAME).getExpr(),
      preview: sel(STORE_NAME).getPreview()
    }), []);
    const { updateExpr } = useDispatch2(STORE_NAME);
    const refs2 = getTokenRefs();
    const handleApply = () => {
      var _a, _b;
      (_a = refs2.applyUpdate) == null ? void 0 : _a.call(refs2, expr);
      (_b = refs2.dismiss) == null ? void 0 : _b.call(refs2);
    };
    const handleRemove = () => {
      var _a, _b;
      (_a = refs2.applyRemove) == null ? void 0 : _a.call(refs2);
      (_b = refs2.dismiss) == null ? void 0 : _b.call(refs2);
    };
    const isValid = preview == null ? void 0 : preview.valid;
    const hasExpr = expr.trim().length > 0;
    const statusColor = !hasExpr ? "#e0e0e0" : isValid ? "#5df4a3" : "#cc1818";
    return /* @__PURE__ */ wp.element.createElement("div", { className: "vectex-expression-editor" }, /* @__PURE__ */ wp.element.createElement("div", { className: "vectex-console-card" }, /* @__PURE__ */ wp.element.createElement("div", { className: "vectex-expr-field" }, /* @__PURE__ */ wp.element.createElement("span", { className: "vectex-expr-brace", "aria-hidden": "true" }, "{{ "), /* @__PURE__ */ wp.element.createElement(
      AutoTextarea,
      {
        className: "vectex-expr-input vectex-class-textarea",
        value: expr,
        onChange: updateExpr,
        placeholder: "user.is_logged_in",
        onKeyDown: (e) => {
          var _a;
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            (_a = refs2.dismiss) == null ? void 0 : _a.call(refs2);
            return;
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleApply();
          }
        }
      }
    ), /* @__PURE__ */ wp.element.createElement("span", { className: "vectex-expr-brace", "aria-hidden": "true" }, " }}")), /* @__PURE__ */ wp.element.createElement("div", { className: "vectex-console-status", style: { borderTopColor: statusColor } }, /* @__PURE__ */ wp.element.createElement("span", { className: "vectex-console-dot" + (isValid ? " is-valid" : "") }), /* @__PURE__ */ wp.element.createElement("code", { className: "vectex-console-preview" }, !hasExpr ? "" : isValid ? String(preview.preview) : (preview == null ? void 0 : preview.preview) || __3("Invalid syntax", "vector-expressions")))), /* @__PURE__ */ wp.element.createElement("footer", { className: "vectex-console-actions" }, /* @__PURE__ */ wp.element.createElement(
      Button3,
      {
        variant: "tertiary",
        isDestructive: true,
        onClick: handleRemove,
        className: "vectex-console-btn-remove"
      },
      __3("Remove", "vector-expressions")
    ), /* @__PURE__ */ wp.element.createElement(
      Button3,
      {
        variant: "primary",
        onClick: handleApply,
        className: "vectex-console-btn-apply"
      },
      __3("Apply", "vector-expressions")
    )), /* @__PURE__ */ wp.element.createElement(
      ExpressionSuggestions,
      {
        expr,
        onSelect: updateExpr
      }
    ));
  };
  var DEFAULT_TABS = [
    { name: "logic", title: /* @__PURE__ */ wp.element.createElement(LogicTabIcon, null), className: "vectex-sidebar-tab" }
  ];
  var VectorSidebarPanel = () => {
    var _a;
    const { selectedBlock, blockName } = useSelect2((sel) => {
      const block = sel("core/block-editor").getSelectedBlock();
      return {
        selectedBlock: block,
        blockName: (block == null ? void 0 : block.name) || ""
      };
    }, []);
    const isTokenActive = useSelect2((sel) => sel(STORE_NAME).isTokenActive(), []);
    const { updateBlockAttributes } = useDispatch2("core/block-editor");
    const baseTabs = applyFilters("vectorExpressions.sidebar.tabs", DEFAULT_TABS);
    const tabs = useMemo3(() => {
      if (!isTokenActive) return baseTabs;
      const exprTab = {
        name: "expression",
        title: /* @__PURE__ */ wp.element.createElement(ExpressionTabIcon, null),
        className: "vectex-sidebar-tab vectex-sidebar-tab--expr"
      };
      return [exprTab, ...baseTabs];
    }, [isTokenActive, baseTabs]);
    if (!selectedBlock) {
      return /* @__PURE__ */ wp.element.createElement("div", { className: "vectex-sidebar-empty" }, /* @__PURE__ */ wp.element.createElement("p", null, __3("Select a block to edit its Vector settings.", "vector-expressions")));
    }
    const { clientId, attributes } = selectedBlock;
    const vectex_logic = attributes == null ? void 0 : attributes.vectex_logic;
    const update = (key, val) => {
      updateBlockAttributes(clientId, {
        vectex_logic: { ...vectex_logic != null ? vectex_logic : {}, [key]: val }
      });
    };
    if (tabs.length <= 1) {
      const tabName = ((_a = tabs[0]) == null ? void 0 : _a.name) || "logic";
      if (tabName === "expression") {
        return /* @__PURE__ */ wp.element.createElement("div", { className: "vectex-sidebar-tab-content" }, /* @__PURE__ */ wp.element.createElement(ExpressionTabContent, null));
      }
      return /* @__PURE__ */ wp.element.createElement("div", { className: "vectex-sidebar-tab-content" }, applyFilters(
        `vectorExpressions.sidebar.tab.${tabName}`,
        null,
        vectex_logic,
        update,
        blockName
      ));
    }
    const initialTab = isTokenActive ? "expression" : void 0;
    return /* @__PURE__ */ wp.element.createElement(
      TabPanel,
      {
        key: isTokenActive ? "with-expr" : "without-expr",
        className: "vectex-sidebar-tabs",
        tabs,
        initialTabName: initialTab
      },
      (tab) => /* @__PURE__ */ wp.element.createElement("div", { className: "vectex-sidebar-tab-content" }, tab.name === "expression" ? /* @__PURE__ */ wp.element.createElement(ExpressionTabContent, null) : applyFilters(
        `vectorExpressions.sidebar.tab.${tab.name}`,
        null,
        vectex_logic,
        update,
        blockName
      ))
    );
  };
  var registerVectorSidebar = () => {
    registerPlugin(SIDEBAR_NAME, {
      render: () => /* @__PURE__ */ wp.element.createElement(Fragment2, null, /* @__PURE__ */ wp.element.createElement(
        PluginSidebarMoreMenuItem,
        {
          target: SIDEBAR_NAME,
          icon: /* @__PURE__ */ wp.element.createElement(SidebarIcon, null)
        },
        __3("Vector Expressions", "vector-expressions")
      ), /* @__PURE__ */ wp.element.createElement(
        PluginSidebar,
        {
          name: SIDEBAR_NAME,
          title: __3("Vector Expressions", "vector-expressions"),
          icon: /* @__PURE__ */ wp.element.createElement(SidebarIcon, null),
          className: "vectex-sidebar"
        },
        /* @__PURE__ */ wp.element.createElement(VectorSidebarPanel, null)
      ))
    });
  };

  // modules/editor/editor.jsx
  registerExpressionFormat();
  registerAutocompleter();
  registerLogicPanel();
  registerVectorSidebar();
})();

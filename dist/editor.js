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
  var SPAN_TAG_RE = /<span\b([^>]*\bdata-ve-expr="([^"]*)"[^>]*)>/gi;
  var resolveFromStore = (expr, postId, postType, editorPostId) => {
    const fail = { value: "", resolved: false };
    const parts = expr.trim().split(".");
    if (parts.length !== 2) return fail;
    const [root, prop] = parts;
    if (expr.includes("|") || expr.includes("(")) return fail;
    switch (root) {
      case "post":
        return resolvePost(prop, postId, postType, editorPostId);
      case "site":
        return resolveSite(prop);
      // `user` is intentionally omitted — `getCurrentUser()` is a one-shot
      // `select()` call inside useEffect (not a reactive `useSelect`), so it
      // may return undefined on the first render. The inflight REST fetch
      // then gets cancelled by cleanup when the entity store triggers a
      // re-render. Delegating to `fetchPreview` avoids this race entirely.
      default:
        return fail;
    }
  };
  var resolvePost = (prop, postId, postType, editorPostId) => {
    const fail = { value: "", resolved: false };
    if (!postId || !postType) return fail;
    const record = select("core").getEntityRecord("postType", postType, postId);
    if (!record) return fail;
    if ((prop === "content" || prop === "excerpt") && postId === editorPostId) {
      return { value: "", resolved: true };
    }
    const map = {
      title: () => {
        var _a2, _b2, _c2, _d2;
        return (_d2 = (_c2 = (_a2 = record.title) == null ? void 0 : _a2.rendered) != null ? _c2 : (_b2 = record.title) == null ? void 0 : _b2.raw) != null ? _d2 : "";
      },
      excerpt: () => {
        var _a2, _b2, _c2, _d2;
        return stripHtml((_d2 = (_c2 = (_a2 = record.excerpt) == null ? void 0 : _a2.rendered) != null ? _c2 : (_b2 = record.excerpt) == null ? void 0 : _b2.raw) != null ? _d2 : "");
      },
      content: () => {
        var _a2, _b2, _c2, _d2;
        return stripHtml((_d2 = (_c2 = (_a2 = record.content) == null ? void 0 : _a2.rendered) != null ? _c2 : (_b2 = record.content) == null ? void 0 : _b2.raw) != null ? _d2 : "");
      },
      date: () => {
        var _a2;
        return ((_a2 = record.date) != null ? _a2 : "").replace("T", " ");
      },
      status: () => {
        var _a2;
        return (_a2 = record.status) != null ? _a2 : "";
      },
      slug: () => {
        var _a2;
        return (_a2 = record.slug) != null ? _a2 : "";
      },
      id: () => {
        var _a2;
        return String((_a2 = record.id) != null ? _a2 : "");
      },
      type: () => {
        var _a2;
        return (_a2 = record.type) != null ? _a2 : "";
      },
      url: () => {
        var _a2;
        return (_a2 = record.link) != null ? _a2 : "";
      },
      author_name: () => {
        var _a2;
        const authorId = record.author;
        if (!authorId) return "";
        const user = select("core").getUser(authorId);
        return (_a2 = user == null ? void 0 : user.name) != null ? _a2 : "";
      }
    };
    const getter = map[prop];
    if (!getter) return fail;
    return { value: getter(), resolved: true };
  };
  var resolveSite = (prop) => {
    const fail = { value: "", resolved: false };
    const site = select("core").getEntityRecord("root", "site");
    if (!site) return fail;
    const map = {
      name: () => {
        var _a2;
        return (_a2 = site.title) != null ? _a2 : "";
      },
      description: () => {
        var _a2;
        return (_a2 = site.description) != null ? _a2 : "";
      },
      url: () => {
        var _a2;
        return (_a2 = site.url) != null ? _a2 : "";
      },
      language: () => {
        var _a2;
        return (_a2 = site.language) != null ? _a2 : "";
      }
    };
    const getter = map[prop];
    if (!getter) return fail;
    return { value: getter(), resolved: true };
  };
  var stripHtml = (html) => {
    var _a2;
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return (_a2 = tmp.textContent) != null ? _a2 : "";
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
      var _a2, _b2;
      if (!attrName) return;
      const raw = attributes[attrName];
      const html = typeof raw === "string" ? raw : String(raw != null ? raw : "");
      if (!html.includes("ve-expr-token")) return;
      const editorPostId = ((_b2 = (_a2 = select("core/editor")) == null ? void 0 : _a2.getCurrentPostId) == null ? void 0 : _b2.call(_a2)) || 0;
      const isQueryChild = postId !== editorPostId;
      if (!isQueryChild && html === lastWritten.current) return;
      const toFetch = /* @__PURE__ */ new Set();
      let needsUpdate = false;
      html.replace(SPAN_TAG_RE, (_match, tagInner, rawExpr) => {
        var _a3;
        if (!rawExpr) return;
        const existingView = (_a3 = tagInner.match(/\bdata-ve-view="([^"]*)"/)) == null ? void 0 : _a3[1];
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
            var _a3;
            return {
              expr,
              preview: (_a3 = r == null ? void 0 : r.preview) != null ? _a3 : ""
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
      var _a2, _b2;
      if (!attrName) return;
      const editorPostId = ((_b2 = (_a2 = select("core/editor")) == null ? void 0 : _a2.getCurrentPostId) == null ? void 0 : _b2.call(_a2)) || 0;
      if (postId === editorPostId) return;
      const id = requestAnimationFrame(() => applyViewsDOM(postId, clientId));
      return () => cancelAnimationFrame(id);
    });
  };
  var applyViewsAttr = (html, postId, attrName, setAttributes, lastWritten) => {
    const updated = html.replace(SPAN_TAG_RE, (fullMatch, tagInner, rawExpr) => {
      var _a2;
      if (!rawExpr) return fullMatch;
      const existingView = (_a2 = tagInner.match(/\bdata-ve-view="([^"]*)"/)) == null ? void 0 : _a2[1];
      if (existingView) return fullMatch;
      const expr = decodeAttr(rawExpr);
      const view = viewCache.get(cacheKey(expr, postId));
      if (view === void 0) return fullMatch;
      const cleaned = cleanPreview(view);
      const safeView = cleaned.replace(/"/g, "&quot;");
      const isEmpty = !cleaned.trim().replace(/\u00a0/g, "");
      const emptyAttr = isEmpty ? ' data-ve-empty=""' : "";
      return fullMatch.replace(
        tagInner,
        tagInner + ` data-ve-view="${safeView}"${emptyAttr}`
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
    const spans = scope.querySelectorAll("span.ve-expr-token");
    spans.forEach((span) => {
      const expr = span.getAttribute("data-ve-expr");
      if (!expr) return;
      const view = viewCache.get(cacheKey(expr, postId));
      if (view === void 0) return;
      const cleaned = cleanPreview(view);
      span.setAttribute("data-ve-view", cleaned);
      const isEmpty = !cleaned.trim().replace(/\u00a0/g, "");
      if (isEmpty) {
        span.setAttribute("data-ve-empty", "");
      } else {
        span.removeAttribute("data-ve-empty");
      }
    });
  };
  var getEditorRoot = () => {
    var _a2;
    const iframe = document.querySelector('iframe[name="editor-canvas"]');
    if ((_a2 = iframe == null ? void 0 : iframe.contentDocument) == null ? void 0 : _a2.body) return iframe.contentDocument.body;
    return document.querySelector(".editor-styles-wrapper") || null;
  };

  // modules/editor/constants.js
  var ctx = window.veContext || {};
  var ICON_POST = `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M4 2h9l4 4v13a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1zm9 0v4h4" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>
  <path stroke="white" d="M6 9h8M6 12h8M6 15h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;
  var ICON_USER = `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="10" cy="6" r="4" stroke="currentColor" stroke-width="1.75"/>
  <path d="M2 18c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
</svg>`;
  var ICON_SITE = `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.75"/>
  <path d="M10 2C7 5 7 15 10 18M10 2c3 3 3 13 0 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <path stroke="white" d="M2 10h16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;
  var ICON_PATTERN = `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M3 5h14M3 10h8M3 15h5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
  <circle stroke="white" cx="13.5" cy="14.5" r="4" stroke="currentColor" stroke-width="1.5"/>
  <path stroke="green" d="M17 13l-3 3-1.5-1.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
  var ICON_FILTER = `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M4 4h12l-4.5 5.5v6.5l-3 2v-8.5l-4.5-5.5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m;
  var VE_COMPLETIONS = [
    // ── User ──────────────────────────────────────────────────────────────────
    {
      label: "User: Display Name",
      expr: "user.name",
      preview: ((_a = ctx.user) == null ? void 0 : _a.name) || "Guest",
      category: "User",
      prefix: "user"
    },
    {
      label: "User: Email",
      expr: "user.email",
      preview: ((_b = ctx.user) == null ? void 0 : _b.email) || "",
      category: "User",
      prefix: "user"
    },
    {
      label: "User: Username",
      expr: "user.login",
      preview: ((_c = ctx.user) == null ? void 0 : _c.login) || "",
      category: "User",
      prefix: "user"
    },
    {
      label: "User: ID",
      expr: "user.id",
      preview: ((_d = ctx.user) == null ? void 0 : _d.id) ? String(ctx.user.id) : "1",
      category: "User",
      prefix: "user"
    },
    {
      label: "User: Role(s)",
      expr: "user.roles | join ', '",
      preview: ((_f = (_e = ctx.user) == null ? void 0 : _e.roles) == null ? void 0 : _f.join(", ")) || "subscriber",
      category: "User",
      prefix: "user"
    },
    {
      label: "User: Logged In?",
      expr: "user.is_logged_in",
      preview: ((_g = ctx.user) == null ? void 0 : _g.is_logged_in) ? "true" : "false",
      category: "User",
      prefix: "user"
    },
    {
      label: "User: Profile URL",
      expr: "user.url",
      preview: ((_h = ctx.user) == null ? void 0 : _h.url) || "",
      category: "User",
      prefix: "user"
    },
    {
      label: "User: Registered Date",
      expr: "user.registered",
      preview: ((_i = ctx.user) == null ? void 0 : _i.registered) || "",
      category: "User",
      prefix: "user"
    },
    {
      label: "User: Meta Value",
      expr: "user.meta.my_key",
      preview: "",
      category: "User",
      prefix: "user"
    },
    // ── Post ──────────────────────────────────────────────────────────────────
    {
      label: "Post: Title",
      expr: "post.title",
      preview: "This is my title",
      category: "Post",
      prefix: "post"
    },
    {
      label: "Post: Excerpt",
      expr: "post.excerpt",
      preview: "This is my excerpt",
      category: "Post",
      prefix: "post"
    },
    {
      label: "Post: Content",
      expr: "post.content",
      preview: "",
      category: "Post",
      prefix: "post"
    },
    {
      label: "Post: ID",
      expr: "post.id",
      preview: "1",
      category: "Post",
      prefix: "post"
    },
    {
      label: "Post: Slug",
      expr: "post.slug",
      preview: "my-post",
      category: "Post",
      prefix: "post"
    },
    {
      label: "Post: Status",
      expr: "post.status",
      preview: "publish",
      category: "Post",
      prefix: "post"
    },
    {
      label: "Post: Type",
      expr: "post.type",
      preview: "post",
      category: "Post",
      prefix: "post"
    },
    {
      label: "Post: Published Date",
      expr: "post.date | date",
      preview: "January 1, 2024",
      category: "Post",
      prefix: "post"
    },
    {
      label: "Post: Date (formatted)",
      expr: "post.date | date 'Y-m-d'",
      preview: "2024-01-01",
      category: "Post",
      prefix: "post"
    },
    {
      label: "Post: Author Name",
      expr: "post.author_name",
      preview: "Author",
      category: "Post",
      prefix: "post"
    },
    {
      label: "Post: Author ID",
      expr: "post.author",
      preview: "",
      category: "Post",
      prefix: "post"
    },
    {
      label: "Post: URL",
      expr: "post.url",
      preview: "",
      category: "Post",
      prefix: "post"
    },
    {
      label: "Post: Meta Value",
      expr: "post.meta.my_key",
      preview: "",
      category: "Post",
      prefix: "post"
    },
    // ── Site ──────────────────────────────────────────────────────────────────
    {
      label: "Site: Name",
      expr: "site.name",
      preview: ((_j = ctx.site) == null ? void 0 : _j.name) || "My Site",
      category: "Site",
      prefix: "site"
    },
    {
      label: "Site: Tagline",
      expr: "site.description",
      preview: ((_k = ctx.site) == null ? void 0 : _k.description) || "",
      category: "Site",
      prefix: "site"
    },
    {
      label: "Site: URL",
      expr: "site.url",
      preview: ((_l = ctx.site) == null ? void 0 : _l.url) || "",
      category: "Site",
      prefix: "site"
    },
    {
      label: "Site: Language",
      expr: "site.language",
      preview: ((_m = ctx.site) == null ? void 0 : _m.language) || "en-US",
      category: "Site",
      prefix: "site"
    },
    // ── Modifiers ───────────────────────────────────────────────────────────────
    {
      label: "Modifier: Render dynamic",
      expr: "| render",
      preview: "",
      category: "Modifier",
      prefix: "|"
    },
    {
      label: "Modifier: Uppercase",
      expr: "| upper",
      preview: "GUEST",
      category: "Modifier",
      prefix: "|"
    },
    {
      label: "Modifier: Lowercase",
      expr: "| lower",
      preview: "guest",
      category: "Modifier",
      prefix: "|"
    },
    {
      label: "Modifier: Default value",
      expr: "| default 'Guest'",
      preview: "Guest",
      category: "Modifier",
      prefix: "|"
    },
    {
      label: "Modifier: If / Else",
      expr: "| if then='Welcome' else='Log in'",
      preview: "Welcome",
      category: "Modifier",
      prefix: "|"
    },
    {
      label: "Modifier: Match value",
      expr: "| match publish='Live' draft='Draft' default='Other'",
      preview: "Live",
      category: "Modifier",
      prefix: "|"
    },
    {
      label: "Modifier: Join array",
      expr: "| join ', '",
      preview: "News, Updates",
      category: "Modifier",
      prefix: "|"
    },
    {
      label: "Modifier: Pluck key",
      expr: "| map key='title'",
      preview: "",
      category: "Modifier",
      prefix: "|"
    },
    {
      label: "Modifier: Format date",
      expr: "| date 'F j, Y'",
      preview: "January 1, 2024",
      category: "Modifier",
      prefix: "|"
    },
    {
      label: "Modifier: Escape HTML",
      expr: "| esc_html",
      preview: "",
      category: "Modifier",
      prefix: "|"
    },
    {
      label: "Modifier: Raw HTML",
      expr: "| raw",
      preview: "",
      category: "Modifier",
      prefix: "|"
    },
    {
      label: "Modifier: Resolve author",
      expr: "| get_user",
      preview: "",
      category: "Modifier",
      prefix: "|"
    },
    {
      label: "Modifier: Other post meta",
      expr: "| get_post | get_meta key='subtitle'",
      preview: "",
      category: "Modifier",
      prefix: "|"
    },
    // ── Common patterns ───────────────────────────────────────────────────────
    {
      label: "Pattern: Greeting by name",
      expr: "user.is_logged_in ? 'Hello, ' + user.name : 'Hello, Guest'",
      preview: "Hello, Guest",
      category: "Pattern",
      prefix: ""
    },
    {
      label: "Pattern: Conditional class",
      expr: "user.is_logged_in ? 'member' : 'visitor'",
      preview: "visitor",
      category: "Pattern",
      prefix: ""
    },
    {
      label: "Pattern: Show role label",
      expr: "user.roles | join ', ' | match administrator='Admin' editor='Editor' default='Member'",
      preview: "Member",
      category: "Pattern",
      prefix: ""
    },
    {
      label: "Pattern: Author with fallback",
      expr: "post.author_name | default 'Unknown Author'",
      preview: "Unknown Author",
      category: "Pattern",
      prefix: ""
    },
    {
      label: "Pattern: Post date",
      expr: "post.date | date 'F j, Y'",
      preview: "January 1, 2024",
      category: "Pattern",
      prefix: "post"
    },
    {
      label: "Pattern: Meta with fallback",
      expr: "post.meta.subtitle | default post.title",
      preview: "",
      category: "Pattern",
      prefix: ""
    },
    {
      label: "Pattern: Site + Post title",
      expr: "post.title + ' \u2014 ' + site.name",
      preview: "Post Title \u2014 My Site",
      category: "Pattern",
      prefix: ""
    }
  ];
  var getCompletions = () => {
    var _a2, _b2;
    return ((_b2 = (_a2 = window.wp) == null ? void 0 : _a2.hooks) == null ? void 0 : _b2.applyFilters) ? window.wp.hooks.applyFilters(
      "vector_expressions.editor.completions",
      VE_COMPLETIONS
    ) : VE_COMPLETIONS;
  };
  var SKIP_CONVERT_BLOCKS = /* @__PURE__ */ new Set([
    "core/code",
    "core/freeform",
    "core/preformatted",
    "core/html",
    "core/shortcode",
    "core/verse"
  ]);
  var TOKEN_REGEX = /(<span\b[^>]*\bclass="ve-expr-token"[^>]*>[\s\S]*?<\/span>)|(<(?:code|pre)\b[^>]*>[\s\S]*?<\/(?:code|pre)>)|(\{\{\s*([^{}]+?)\s*\}\})/gi;

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
    className = "ve-class-textarea",
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
        const span = el2.querySelector("span.ve-expr-token[data-rich-text-format-boundary]");
        if (span) span.setAttribute("data-ve-active", "");
      } else if (!sidebarActive) {
        el2.querySelectorAll("span.ve-expr-token").forEach((m) => {
          m.removeAttribute("data-ve-active");
          m.removeAttribute("data-rich-text-format-boundary");
        });
      }
    }, [isActive, contentRef, sidebarActive]);
  };
  var getTokenSpan = (n, el2) => {
    let cur = n.nodeType === Node.TEXT_NODE ? n.parentElement : n;
    while (cur && cur !== el2) {
      if (cur.tagName === "SPAN" && cur.classList.contains("ve-expr-token")) return cur;
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
        var _a2, _b2, _c2, _d2;
        if (!el2) return;
        const { key } = evt;
        if (key === "Escape" && refs2.tokenActiveRef.current) {
          evt.preventDefault();
          evt.stopPropagation();
          (_b2 = (_a2 = refs2.dismissRef).current) == null ? void 0 : _b2.call(_a2);
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
              (_d2 = (_c2 = refs2.openSidebarRef).current) == null ? void 0 : _d2.call(_c2);
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
  var VE_PATTERNS_DEFAULT = [
    { expr: "post.title | default 'Untitled'", label: "Post title with fallback" },
    { expr: "user.is_logged_in ? user.name : 'Guest'", label: "Greeting (logged in)" },
    { expr: "post.date | date 'F j, Y'", label: "Formatted publish date" },
    { expr: "post.meta.your_field | default ''", label: "Custom field value" },
    { expr: "site.name | upper", label: "Site name \u2014 uppercase" },
    { expr: "user.name | default 'Friend'", label: "Display name with fallback" },
    { expr: "post.author_name", label: "Post author name" },
    { expr: "post.excerpt | default post.content", label: "Excerpt or full content" }
  ];
  var getPatterns = () => {
    const { applyFilters: applyFilters2 } = window.wp.hooks;
    return applyFilters2 ? applyFilters2("vectorExpressions.suggestions.patterns", VE_PATTERNS_DEFAULT) : VE_PATTERNS_DEFAULT;
  };
  var getCategories = (completions) => {
    const seen = /* @__PURE__ */ new Map();
    for (const item of completions) {
      const cat = item.category;
      if (!cat || cat === "Pattern") continue;
      if (!seen.has(cat)) {
        seen.set(cat, { key: cat.toLowerCase(), label: cat, items: [] });
      }
      seen.get(cat).items.push(item);
    }
    const cats = [...seen.values()];
    cats.push({ key: "pattern", label: __("Patterns", "vector-expressions"), items: getPatterns() });
    const { applyFilters: applyFilters2 } = window.wp.hooks;
    return applyFilters2 ? applyFilters2("vectorExpressions.suggestions.categories", cats, completions) : cats;
  };
  var ExpressionSuggestions = ({ expr, onSelect }) => {
    const [search, setSearch] = useState("");
    const [open, setOpen] = useState({});
    const completions = getCompletions();
    const categories = getCategories(completions);
    const query = search.toLowerCase().trim();
    const searching = query.length > 0;
    const toggle = (key) => {
      setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
    };
    const filterItems = (items) => {
      if (!searching) return items;
      return items.filter(
        (s) => (s.expr || "").toLowerCase().includes(query) || (s.label || "").toLowerCase().includes(query)
      );
    };
    const handleSelect = (s) => {
      const isPattern = !("category" in s) && !("prefix" in s);
      const insertExpr = s.expr;
      let newValue = insertExpr;
      if (s.category === "Modifier") {
        let appended = expr.trim();
        if (!appended.endsWith("|") && appended.length > 0) {
          appended += " ";
        }
        newValue = appended + insertExpr;
      }
      onSelect(newValue);
    };
    return /* @__PURE__ */ wp.element.createElement("div", { className: "ve-suggestions" }, /* @__PURE__ */ wp.element.createElement("div", { className: "ve-suggestions-search" }, /* @__PURE__ */ wp.element.createElement(
      "input",
      {
        type: "text",
        className: "components-text-control__input",
        placeholder: __("Filter suggestions\u2026", "vector-expressions"),
        value: search,
        onChange: (e) => setSearch(e.target.value)
      }
    )), categories.map((cat) => {
      const filtered = filterItems(cat.items);
      if (searching && filtered.length === 0) return null;
      const isOpen = searching || !!open[cat.key];
      return /* @__PURE__ */ wp.element.createElement("div", { key: cat.key, className: "ve-suggestions-group" }, /* @__PURE__ */ wp.element.createElement(
        "button",
        {
          className: "ve-suggestions-header" + (isOpen ? " is-open" : ""),
          onClick: () => !searching && toggle(cat.key),
          "aria-expanded": isOpen
        },
        /* @__PURE__ */ wp.element.createElement("span", null, cat.label),
        /* @__PURE__ */ wp.element.createElement("span", { className: "ve-suggestions-count" }, filtered.length),
        !searching && /* @__PURE__ */ wp.element.createElement("span", { className: "ve-suggestions-arrow" }, isOpen ? "\u25B2" : "\u25BC")
      ), isOpen && /* @__PURE__ */ wp.element.createElement("div", { className: "ve-suggestions-items" }, filtered.map((s) => /* @__PURE__ */ wp.element.createElement(
        Button,
        {
          key: s.expr + (s.label || ""),
          variant: "secondary",
          size: "small",
          className: "ve-suggestion-chip",
          onMouseDown: (e) => e.preventDefault(),
          onClick: () => handleSelect(s)
        },
        (s.label || s.expr).replace(/^(Post|User|Site|Modifier):\s*/, "")
      ))));
    }));
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
      var _a2, _b2;
      const expr = (exprOverride != null ? exprOverride : select2(STORE_NAME).getExpr()).trim();
      if (!expr) return;
      const postId = ((_b2 = (_a2 = select2("core/editor")) == null ? void 0 : _a2.getCurrentPostId) == null ? void 0 : _b2.call(_a2)) || 0;
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
      var _a2;
      const formats = (_a2 = value.formats) != null ? _a2 : [];
      let pivot = value.start;
      const hasFormat = (i) => {
        var _a3;
        return (_a3 = formats[i]) == null ? void 0 : _a3.some((f) => f.type === "vector/expression");
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
      const span = el2 == null ? void 0 : el2.querySelector("span[data-ve-active]");
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
        var _a2, _b2;
        const postId = ((_b2 = (_a2 = select2("core/editor")) == null ? void 0 : _a2.getCurrentPostId) == null ? void 0 : _b2.call(_a2)) || 0;
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
      className: "ve-expr-token",
      attributes: {
        expr: "data-ve-expr",
        view: "data-ve-view",
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
    let iconSvg = ICON_FILTER;
    if (o.category === "Post") {
      iconSvg = ICON_POST;
    } else if (o.category === "User") {
      iconSvg = ICON_USER;
    } else if (o.category === "Site") {
      iconSvg = ICON_SITE;
    } else if (o.category === "Pattern") {
      iconSvg = ICON_PATTERN;
    }
    return el(
      "div",
      {
        className: "ve-autocompleter-option",
        style: { padding: "0", width: "100%", flexWrap: "nowrap", gap: "8px" }
      },
      el(
        "span",
        {
          className: "ve-ac-icon",
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
          viewAttrs = ` data-ve-view="${safeView}"${isEmpty ? ' data-ve-empty=""' : ""}`;
        }
        return `<span class="ve-expr-token" data-ve-expr="${safeExpr}"${viewAttrs} contenteditable="false">{{ ${e} }}</span>`;
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
    return /* @__PURE__ */ wp.element.createElement("div", { className: "ve-class-field" }, /* @__PURE__ */ wp.element.createElement(
      "label",
      {
        className: "components-base-control__label",
        htmlFor: "ve-class-input"
      },
      __4("Template", "vector-expressions")
    ), /* @__PURE__ */ wp.element.createElement(
      AutoTextarea,
      {
        id: "ve-class-input",
        value,
        onChange,
        placeholder
      }
    ), /* @__PURE__ */ wp.element.createElement("p", { className: "components-base-control__help" }, __4("Mix static text and", "vector-expressions"), " ", /* @__PURE__ */ wp.element.createElement("code", null, "{{ expressions }}"), " ", __4("freely. Each token is evaluated and the full string becomes the class.", "vector-expressions")));
  };
  var LogicSidebarContent = ({ ve_logic, update, blockName }) => {
    const [showRef, setShowRef] = useState2(false);
    return /* @__PURE__ */ wp.element.createElement(Fragment, null, /* @__PURE__ */ wp.element.createElement("div", { className: "ve-section" }, /* @__PURE__ */ wp.element.createElement("p", { className: "ve-section-label" }, __2("Visibility", "vector-expressions")), /* @__PURE__ */ wp.element.createElement(
      SelectControl,
      {
        label: __2("Action", "vector-expressions"),
        value: (ve_logic == null ? void 0 : ve_logic.visible_action) || "show",
        options: [
          { label: __2("Show if True", "vector-expressions"), value: "show" },
          { label: __2("Hide if True", "vector-expressions"), value: "hide" }
        ],
        onChange: (v) => update("visible_action", v),
        __nextHasNoMarginBottom: true
      }
    ), /* @__PURE__ */ wp.element.createElement("div", { className: "ve-class-field ve-condition-field" }, /* @__PURE__ */ wp.element.createElement(
      "label",
      {
        className: "components-base-control__label",
        htmlFor: "ve-condition-input"
      },
      __2("Condition", "vector-expressions")
    ), /* @__PURE__ */ wp.element.createElement("div", { className: "ve-expr-field" }, /* @__PURE__ */ wp.element.createElement("span", { className: "ve-expr-brace", "aria-hidden": "true" }, "{{ "), /* @__PURE__ */ wp.element.createElement(
      AutoTextarea,
      {
        id: "ve-condition-input",
        value: (ve_logic == null ? void 0 : ve_logic.visible) || "",
        onChange: (v) => update("visible", v),
        placeholder: "user.is_logged_in",
        className: "ve-class-textarea"
      }
    ), /* @__PURE__ */ wp.element.createElement("span", { className: "ve-expr-brace", "aria-hidden": "true" }, " }}"))), /* @__PURE__ */ wp.element.createElement("div", { className: "ve-syntax-ref-wrap" }, /* @__PURE__ */ wp.element.createElement(
      Button2,
      {
        variant: "link",
        size: "small",
        className: "ve-syntax-ref-toggle",
        onClick: () => setShowRef(!showRef),
        "aria-expanded": showRef
      },
      __2("Syntax reference", "vector-expressions"),
      " ",
      showRef ? "\u25B2" : "\u25BC"
    ), showRef && /* @__PURE__ */ wp.element.createElement("table", { className: "ve-syntax-ref" }, /* @__PURE__ */ wp.element.createElement("tbody", null, /* @__PURE__ */ wp.element.createElement("tr", { className: "ve-ref-head" }, /* @__PURE__ */ wp.element.createElement("th", { colSpan: "2" }, __2("Variables", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "user.name")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Display name", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "user.is_logged_in")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Logged in?", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "user.role")), /* @__PURE__ */ wp.element.createElement("td", null, __2("User role", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "post.title")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Post title", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "post.author_name")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Author name", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "post.meta.my_key")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Post meta", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", { className: "ve-ref-head" }, /* @__PURE__ */ wp.element.createElement("th", { colSpan: "2" }, __2("Operators & Filters", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "a == b")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Equals", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "a ? b : c")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Ternary", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "val | upper")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Filter", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "post.date | date")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Format date", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "post.author | get_user")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Author object", "vector-expressions"))))))), /* @__PURE__ */ wp.element.createElement("div", { className: "ve-section ve-section--bordered" }, /* @__PURE__ */ wp.element.createElement("p", { className: "ve-section-label" }, __2("Dynamic Class", "vector-expressions")), /* @__PURE__ */ wp.element.createElement(
      ClassTextarea,
      {
        value: (ve_logic == null ? void 0 : ve_logic.class) || "",
        onChange: (v) => update("class", v),
        placeholder: `prefix-{{ user.role | kebab }}`
      }
    )));
  };
  var LogicPanel = createHigherOrderComponent((BlockEdit) => {
    return (props) => {
      var _a2, _b2, _c2, _d2;
      const { attributes, setAttributes, name, context, clientId } = props;
      const { ve_logic } = attributes;
      const attrName = useMemo2(() => getRichTextAttrName(name), [name]);
      const postId = (context == null ? void 0 : context.postId) || ((_b2 = (_a2 = select3("core/editor")) == null ? void 0 : _a2.getCurrentPostId) == null ? void 0 : _b2.call(_a2)) || 0;
      const postType = (context == null ? void 0 : context.postType) || ((_d2 = (_c2 = select3("core/editor")) == null ? void 0 : _c2.getCurrentPostType) == null ? void 0 : _d2.call(_c2)) || "post";
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
      (content, ve_logic, update, blockName) => {
        return /* @__PURE__ */ wp.element.createElement(Fragment, null, content, /* @__PURE__ */ wp.element.createElement(
          LogicSidebarContent,
          {
            ve_logic,
            update,
            blockName
          }
        ));
      }
    );
    const REQUIRED_CONTEXT = ["postId", "postType"];
    addFilter2("blocks.registerBlockType", "ve-logic.inject-context", (settings, name) => {
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
  var TabIcon = ({ label, children }) => /* @__PURE__ */ wp.element.createElement("span", { className: "ve-tab-icon", title: label, "aria-label": label }, children);
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
      var _a2, _b2;
      (_a2 = refs2.applyUpdate) == null ? void 0 : _a2.call(refs2, expr);
      (_b2 = refs2.dismiss) == null ? void 0 : _b2.call(refs2);
    };
    const handleRemove = () => {
      var _a2, _b2;
      (_a2 = refs2.applyRemove) == null ? void 0 : _a2.call(refs2);
      (_b2 = refs2.dismiss) == null ? void 0 : _b2.call(refs2);
    };
    return /* @__PURE__ */ wp.element.createElement("div", { className: "ve-expression-editor" }, /* @__PURE__ */ wp.element.createElement("div", { className: "ve-expr-editor-field" }, /* @__PURE__ */ wp.element.createElement("label", { className: "components-base-control__label" }, __3("Expression", "vector-expressions")), /* @__PURE__ */ wp.element.createElement("div", { className: "ve-expr-field" }, /* @__PURE__ */ wp.element.createElement("span", { className: "ve-expr-brace", "aria-hidden": "true" }, "{{ "), /* @__PURE__ */ wp.element.createElement(
      AutoTextarea,
      {
        className: "ve-expr-input ve-class-textarea",
        value: expr,
        onChange: updateExpr,
        placeholder: "user.is_logged_in",
        onKeyDown: (e) => {
          var _a2;
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            (_a2 = refs2.dismiss) == null ? void 0 : _a2.call(refs2);
            return;
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleApply();
          }
        }
      }
    ), /* @__PURE__ */ wp.element.createElement("span", { className: "ve-expr-brace", "aria-hidden": "true" }, " }}"))), /* @__PURE__ */ wp.element.createElement("div", { className: "ve-live-preview", style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "8px",
      marginTop: "12px",
      background: !preview || !preview.valid ? "#fcf0f1" : "#f0f0f0",
      padding: "12px",
      borderRadius: "4px",
      border: "1px solid " + (!preview || !preview.valid ? "#cc1818" : "#e0e0e0")
    } }, /* @__PURE__ */ wp.element.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px", color: "#1e1e1e", fontSize: "12px" } }, /* @__PURE__ */ wp.element.createElement("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ wp.element.createElement("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }), /* @__PURE__ */ wp.element.createElement("circle", { cx: "12", cy: "12", r: "3" })), /* @__PURE__ */ wp.element.createElement("span", null, __3("Preview", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("code", { style: {
      color: !preview || !preview.valid ? "#cc1818" : "#39b074",
      maxWidth: "160px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      fontSize: "14px",
      fontFamily: "monospace"
    } }, !preview || !preview.valid ? expr ? (preview == null ? void 0 : preview.preview) || __3("Invalid syntax", "vector-expressions") : "" : String(preview.preview))), /* @__PURE__ */ wp.element.createElement(
      ExpressionSuggestions,
      {
        expr,
        onSelect: updateExpr
      }
    ), /* @__PURE__ */ wp.element.createElement("footer", { style: { display: "flex", justifyContent: "space-between", marginTop: "16px" } }, /* @__PURE__ */ wp.element.createElement(
      Button3,
      {
        variant: "secondary",
        isDestructive: true,
        onClick: handleRemove
      },
      __3("Remove", "vector-expressions")
    ), /* @__PURE__ */ wp.element.createElement(
      Button3,
      {
        variant: "primary",
        onClick: handleApply
      },
      __3("Apply", "vector-expressions")
    )));
  };
  var DEFAULT_TABS = [
    { name: "logic", title: /* @__PURE__ */ wp.element.createElement(LogicTabIcon, null), className: "ve-sidebar-tab" }
  ];
  var VectorSidebarPanel = () => {
    var _a2;
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
        className: "ve-sidebar-tab ve-sidebar-tab--expr"
      };
      return [exprTab, ...baseTabs];
    }, [isTokenActive, baseTabs]);
    if (!selectedBlock) {
      return /* @__PURE__ */ wp.element.createElement("div", { className: "ve-sidebar-empty" }, /* @__PURE__ */ wp.element.createElement("p", null, __3("Select a block to edit its Vector settings.", "vector-expressions")));
    }
    const { clientId, attributes } = selectedBlock;
    const ve_logic = attributes == null ? void 0 : attributes.ve_logic;
    const update = (key, val) => {
      updateBlockAttributes(clientId, {
        ve_logic: { ...ve_logic != null ? ve_logic : {}, [key]: val }
      });
    };
    if (tabs.length <= 1) {
      const tabName = ((_a2 = tabs[0]) == null ? void 0 : _a2.name) || "logic";
      if (tabName === "expression") {
        return /* @__PURE__ */ wp.element.createElement("div", { className: "ve-sidebar-tab-content" }, /* @__PURE__ */ wp.element.createElement(ExpressionTabContent, null));
      }
      return /* @__PURE__ */ wp.element.createElement("div", { className: "ve-sidebar-tab-content" }, applyFilters(
        `vectorExpressions.sidebar.tab.${tabName}`,
        null,
        ve_logic,
        update,
        blockName
      ));
    }
    const initialTab = isTokenActive ? "expression" : void 0;
    return /* @__PURE__ */ wp.element.createElement(
      TabPanel,
      {
        key: isTokenActive ? "with-expr" : "without-expr",
        className: "ve-sidebar-tabs",
        tabs,
        initialTabName: initialTab
      },
      (tab) => /* @__PURE__ */ wp.element.createElement("div", { className: "ve-sidebar-tab-content" }, tab.name === "expression" ? /* @__PURE__ */ wp.element.createElement(ExpressionTabContent, null) : applyFilters(
        `vectorExpressions.sidebar.tab.${tab.name}`,
        null,
        ve_logic,
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
          className: "ve-sidebar"
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

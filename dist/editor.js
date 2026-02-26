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
  var VE_ROOTS = [
    {
      label: "Post",
      description: "Current post data \u2014 title, date, meta\u2026",
      icon: ICON_POST,
      prefix: "post"
    },
    {
      label: "User",
      description: "Logged-in user \u2014 name, email, role\u2026",
      icon: ICON_USER,
      prefix: "user"
    },
    {
      label: "Site",
      description: "Site-wide settings \u2014 name, URL, language\u2026",
      icon: ICON_SITE,
      prefix: "site"
    },
    {
      label: "Patterns",
      description: "Ready-made expressions for common tasks",
      icon: ICON_PATTERN,
      prefix: "_pattern"
    }
  ];
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u;
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
      preview: ((_j = ctx.post) == null ? void 0 : _j.content) || "",
      category: "Post",
      prefix: "post"
    },
    {
      label: "Post: ID",
      expr: "post.id",
      preview: ((_k = ctx.post) == null ? void 0 : _k.id) ? String(ctx.post.id) : "1",
      category: "Post",
      prefix: "post"
    },
    {
      label: "Post: Slug",
      expr: "post.slug",
      preview: ((_l = ctx.post) == null ? void 0 : _l.slug) || "my-post",
      category: "Post",
      prefix: "post"
    },
    {
      label: "Post: Status",
      expr: "post.status",
      preview: ((_m = ctx.post) == null ? void 0 : _m.status) || "publish",
      category: "Post",
      prefix: "post"
    },
    {
      label: "Post: Type",
      expr: "post.type",
      preview: ((_n = ctx.post) == null ? void 0 : _n.type) || "post",
      category: "Post",
      prefix: "post"
    },
    {
      label: "Post: Published Date",
      expr: "post.date | date",
      preview: ((_o = ctx.post) == null ? void 0 : _o.date) || "January 1, 2024",
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
      preview: ((_p = ctx.post) == null ? void 0 : _p.author_name) || "Author",
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
      preview: ((_q = ctx.post) == null ? void 0 : _q.url) || "",
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
      preview: ((_r = ctx.site) == null ? void 0 : _r.name) || "My Site",
      category: "Site",
      prefix: "site"
    },
    {
      label: "Site: Tagline",
      expr: "site.description",
      preview: ((_s = ctx.site) == null ? void 0 : _s.description) || "",
      category: "Site",
      prefix: "site"
    },
    {
      label: "Site: URL",
      expr: "site.url",
      preview: ((_t = ctx.site) == null ? void 0 : _t.url) || "",
      category: "Site",
      prefix: "site"
    },
    {
      label: "Site: Language",
      expr: "site.language",
      preview: ((_u = ctx.site) == null ? void 0 : _u.language) || "en-US",
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
      "vector_expressions/editor/completions",
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
  var TOKEN_REGEX = /(<mark\b[^>]*\bclass="ve-expr-token"[^>]*>[\s\S]*?<\/mark>)|(<(?:code|pre)\b[^>]*>[\s\S]*?<\/(?:code|pre)>)|(\{\{\s*([^{}]+?)\s*\}\})/gi;
  var POPOVER_FOCUS_DELAY = 50;

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

  // modules/editor/expression-format.jsx
  var {
    useState,
    useEffect,
    useLayoutEffect: useLayoutEffect2,
    useRef: useRef2,
    useCallback: useCallback2
  } = window.wp.element;
  var {
    Popover,
    Button,
    TabPanel,
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
  var { select } = window.wp.data;
  var useActiveTokenState = (isActive, contentRef) => {
    useEffect(() => {
      const el2 = contentRef == null ? void 0 : contentRef.current;
      if (!el2) return;
      if (isActive) {
        const mark = el2.querySelector("mark.ve-expr-token[data-rich-text-format-boundary]");
        if (mark) mark.setAttribute("data-ve-active", "");
      } else {
        el2.querySelectorAll("mark.ve-expr-token").forEach((m) => {
          m.removeAttribute("data-ve-active");
          m.removeAttribute("data-rich-text-format-boundary");
        });
      }
    }, [isActive, contentRef]);
    useEffect(() => {
      const el2 = contentRef == null ? void 0 : contentRef.current;
      if (!el2) return;
      const onFocusOut = (evt) => {
        if (el2.contains(evt.relatedTarget)) return;
        el2.querySelectorAll("mark.ve-expr-token").forEach((m) => {
          m.removeAttribute("data-ve-active");
          m.removeAttribute("data-rich-text-format-boundary");
        });
      };
      el2.addEventListener("focusout", onFocusOut);
      return () => el2.removeEventListener("focusout", onFocusOut);
    }, [contentRef == null ? void 0 : contentRef.current]);
  };
  var getTokenMark = (n, el2) => {
    let cur = n.nodeType === Node.TEXT_NODE ? n.parentElement : n;
    while (cur && cur !== el2) {
      if (cur.tagName === "MARK" && cur.classList.contains("ve-expr-token")) return cur;
      cur = cur.parentElement;
    }
    return null;
  };
  var placeCursorAdjacentToMark = (sel, doc, mark, side) => {
    const range = doc.createRange();
    if (side === "before") range.setStartBefore(mark);
    else range.setStartAfter(mark);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  };
  var useTokenEventListeners = (contentRef, refs) => {
    useEffect(() => {
      const el2 = contentRef == null ? void 0 : contentRef.current;
      if (!el2) return;
      const doc = el2.ownerDocument || document;
      const onKeyDown = (evt) => {
        var _a2, _b2;
        const { key } = evt;
        if (key === "Escape" && refs.popoverOpenRef.current) {
          evt.preventDefault();
          evt.stopPropagation();
          (_b2 = (_a2 = refs.dismissPopoverRef).current) == null ? void 0 : _b2.call(_a2);
          return;
        }
        if (!el2.contains(evt.target)) return;
        if (key === "Tab") {
          const listbox = doc.querySelector('[role="listbox"].components-autocomplete__results');
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
        const iframeWin = el2.ownerDocument.defaultView;
        const sel = iframeWin.getSelection();
        if (!sel || !sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        const node = range.startContainer;
        if (key === "ArrowLeft" || key === "ArrowRight") {
          const mark = getTokenMark(node, el2);
          if (mark) {
            evt.preventDefault();
            evt.stopPropagation();
            placeCursorAdjacentToMark(sel, doc, mark, key === "ArrowLeft" ? "before" : "after");
          }
        }
        if (key === "Enter" || key === " ") {
          if (refs.isActiveRef.current) {
            const inside = getTokenMark(node, el2);
            if (inside || !range.collapsed) {
              evt.preventDefault();
              evt.stopPropagation();
              refs.activeMarkRef.current = refs.anchorRef.current;
              refs.setPopoverOpenRef.current(true);
            }
            return;
          }
        }
        if (refs.isActiveRef.current && !refs.popoverOpenRef.current && key.length === 1 && !evt.ctrlKey && !evt.metaKey) {
          const mark = getTokenMark(node, el2);
          if (mark) {
            const isStart = (node.nodeType === Node.TEXT_NODE || node === mark) && range.startOffset === 0;
            placeCursorAdjacentToMark(sel, doc, mark, isStart ? "before" : "after");
          }
        }
      };
      const onClickToken = (evt) => {
        if (!el2.contains(evt.target) || evt.target.tagName !== "MARK" || !evt.target.classList.contains("ve-expr-token")) return;
        const iframeDoc = el2.ownerDocument;
        const iframeWin = iframeDoc.defaultView;
        const range = iframeDoc.createRange();
        range.setStartBefore(evt.target);
        range.collapse(true);
        iframeWin.getSelection().removeAllRanges();
        iframeWin.getSelection().addRange(range);
        refs.activeMarkRef.current = evt.target;
        refs.setPopoverOpenRef.current(true);
      };
      doc.addEventListener("keydown", onKeyDown, true);
      doc.addEventListener("click", onClickToken, true);
      return () => {
        doc.removeEventListener("keydown", onKeyDown, true);
        doc.removeEventListener("click", onClickToken, true);
      };
    }, [contentRef]);
  };
  var VE_PATTERNS = [
    { expr: "post.title | default 'Untitled'", label: "Post title with fallback" },
    { expr: "user.is_logged_in ? user.name : 'Guest'", label: "Greeting (logged in)" },
    { expr: "post.date | date 'F j, Y'", label: "Formatted publish date" },
    { expr: "post.meta.your_field | default ''", label: "Custom field value" },
    { expr: "site.name | upper", label: "Site name \u2014 uppercase" },
    { expr: "user.name | default 'Friend'", label: "Display name with fallback" },
    { expr: "post.author_name", label: "Post author name" },
    { expr: "post.excerpt | default post.content", label: "Excerpt or full content" }
  ];
  var getSuggestions = (expr) => {
    const trimmed = expr.trim();
    if (trimmed === "") return VE_ROOTS;
    if (trimmed === "_pattern.") return VE_PATTERNS;
    const lower = trimmed.toLowerCase();
    if (lower.includes("|")) {
      return getCompletions().filter((o) => o.prefix === "|").slice(0, 8);
    }
    const completions = getCompletions();
    const byExpr = completions.filter((o) => o.expr.toLowerCase().startsWith(lower));
    const byLabel = completions.filter((o) => !o.expr.toLowerCase().startsWith(lower) && o.label.toLowerCase().includes(lower));
    return [...byExpr, ...byLabel].slice(0, 8);
  };
  var ExpressionSuggestions = ({ expr, onSelect, inputRef }) => {
    const suggestions = getSuggestions(expr);
    const hasSpecificSuggestions = suggestions.length > 0 && expr.trim() !== "";
    const completions = getCompletions();
    const suggestionsGrouped = {
      common: suggestions,
      post: completions.filter((s) => s.category === "Post"),
      user: completions.filter((s) => s.category === "User"),
      site: completions.filter((s) => s.category === "Site"),
      modifier: completions.filter((s) => s.category === "Modifier")
    };
    const renderChip = (s) => {
      const root = "prefix" in s && !("category" in s) && !("label" in s && "expr" in s && !("prefix" in s));
      const pattern = !root && "label" in s && "expr" in s && !("prefix" in s) && !("category" in s);
      const insertExpr = root ? s.prefix === "_pattern" ? "_pattern." : s.prefix + "." : s.expr;
      const chipLabel = root ? s.label : pattern ? s.label : s.label.replace(/^(Post|User|Site|Modifier|Pattern):\s*/, "");
      return /* @__PURE__ */ wp.element.createElement(
        Button,
        {
          key: insertExpr + chipLabel,
          variant: "secondary",
          onMouseDown: (e) => e.preventDefault(),
          onClick: (e) => {
            e.preventDefault();
            let newValue = insertExpr;
            if (s.category === "Modifier") {
              let appended = expr.trim();
              if (!appended.endsWith("|") && appended.length > 0) {
                appended += " ";
              }
              newValue = appended + insertExpr;
            }
            onSelect(newValue);
            setTimeout(() => {
              const el2 = document.querySelector(".ve-expr-input textarea");
              if (el2) el2.focus();
            }, 0);
          },
          style: { textAlign: "left", justifyContent: "flex-start", padding: "8px 12px", whiteSpace: "normal", height: "auto", lineHeight: "1.3" }
        },
        /* @__PURE__ */ wp.element.createElement("span", { style: { fontSize: "13px" } }, chipLabel)
      );
    };
    const tabs = [
      {
        name: "suggestions",
        title: hasSpecificSuggestions ? __("Suggestions", "vector-expressions") : __("Common", "vector-expressions"),
        className: "ve-tab-suggestions"
      },
      {
        name: "post",
        title: __("Post", "vector-expressions"),
        className: "ve-tab-post"
      },
      {
        name: "user",
        title: __("User", "vector-expressions"),
        className: "ve-tab-user"
      },
      {
        name: "modifiers",
        title: __("Modifiers", "vector-expressions"),
        className: "ve-tab-modifiers"
      },
      {
        name: "patterns",
        title: __("Patterns", "vector-expressions"),
        className: "ve-tab-patterns"
      }
    ];
    return /* @__PURE__ */ wp.element.createElement("div", { style: { marginTop: "16px" } }, /* @__PURE__ */ wp.element.createElement(
      TabPanel,
      {
        className: "ve-expression-tabs",
        activeClass: "is-active",
        tabs
      },
      (tab) => {
        const renderItems = (items, isGrid) => /* @__PURE__ */ wp.element.createElement("div", { style: {
          display: isGrid ? "grid" : "flex",
          flexDirection: isGrid ? "row" : "column",
          gridTemplateColumns: isGrid ? "1fr 1fr" : "none",
          gap: "8px",
          maxHeight: "200px",
          overflowY: "auto",
          paddingTop: "16px",
          paddingBottom: "4px"
        } }, items.map(renderChip));
        switch (tab.name) {
          case "post":
            return renderItems(suggestionsGrouped.post, true);
          case "user":
            return renderItems(suggestionsGrouped.user, true);
          case "modifiers":
            return renderItems(suggestionsGrouped.modifier, false);
          case "patterns":
            return renderItems(VE_PATTERNS, false);
          default:
            return renderItems(suggestionsGrouped.common, false);
        }
      }
    ));
  };
  var TokenPopover = ({ anchor, getFallbackAnchor, editExpr, setEdit, onUpdate, onRemove, onDismiss, inputRef, previewObj }) => /* @__PURE__ */ wp.element.createElement(
    Popover,
    {
      anchor: anchor || { getBoundingClientRect: getFallbackAnchor },
      placement: "bottom",
      className: "ve-pill-popover",
      focusOnMount: false,
      onKeyDown: (evt) => {
        if (evt.key === "Escape") {
          evt.preventDefault();
          evt.stopPropagation();
          onDismiss();
        }
      }
    },
    /* @__PURE__ */ wp.element.createElement("div", { className: "ve-expression-builder", style: { padding: "16px", width: "420px", boxSizing: "border-box" } }, /* @__PURE__ */ wp.element.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } }, /* @__PURE__ */ wp.element.createElement("label", { style: { fontSize: "13px", fontWeight: 600 } }, __("Vector Expression", "vector-expressions")), /* @__PURE__ */ wp.element.createElement(
      AutoTextarea,
      {
        className: "ve-expr-input ve-class-textarea",
        value: editExpr,
        onChange: (val) => setEdit(val),
        placeholder: "user.is_logged_in",
        inputRef,
        onKeyDown: async (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            await onUpdate();
            onDismiss();
          }
        }
      }
    )), /* @__PURE__ */ wp.element.createElement("div", { className: "ve-live-preview", style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "8px",
      marginTop: "12px",
      background: !previewObj || !previewObj.valid ? "#fcf0f1" : "#f0f0f0",
      padding: "12px",
      borderRadius: "4px",
      border: "1px solid " + (!previewObj || !previewObj.valid ? "#cc1818" : "#e0e0e0")
    } }, /* @__PURE__ */ wp.element.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px", color: "#1e1e1e", fontSize: "12px" } }, /* @__PURE__ */ wp.element.createElement("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ wp.element.createElement("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }), /* @__PURE__ */ wp.element.createElement("circle", { cx: "12", cy: "12", r: "3" })), /* @__PURE__ */ wp.element.createElement("span", null, __("Preview", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("code", { style: {
      color: !previewObj || !previewObj.valid ? "#cc1818" : "#39b074",
      maxWidth: "200px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      fontSize: "14px",
      fontFamily: "monospace"
    } }, !previewObj || !previewObj.valid ? editExpr ? (previewObj == null ? void 0 : previewObj.preview) || __("Invalid syntax", "vector-expressions") : "" : String(previewObj.preview))), /* @__PURE__ */ wp.element.createElement(
      ExpressionSuggestions,
      {
        expr: editExpr,
        onSelect: setEdit,
        inputRef
      }
    ), /* @__PURE__ */ wp.element.createElement("footer", { style: { display: "flex", justifyContent: "space-between", marginTop: "16px" } }, /* @__PURE__ */ wp.element.createElement(
      Button,
      {
        variant: "secondary",
        isDestructive: true,
        onClick: () => {
          onRemove();
          onDismiss();
        }
      },
      __("Remove", "vector-expressions")
    ), /* @__PURE__ */ wp.element.createElement(
      Button,
      {
        variant: "primary",
        onClick: async () => {
          await onUpdate();
          onDismiss();
        }
      },
      __("Apply", "vector-expressions")
    )))
  );
  var ExpressionEdit = ({ isActive, activeAttributes, value, onChange, contentRef }) => {
    const [editExpr, setEdit] = useState("");
    const [popoverOpen, setPopoverOpen] = useState(false);
    const [livePreview, setLivePreview] = useState(null);
    const inputRef = useRef2(null);
    const isActiveRef = useRef2(false);
    const anchorRef = useRef2(null);
    const activeMarkRef = useRef2(null);
    const popoverOpenRef = useRef2(false);
    const dismissPopoverRef = useRef2(null);
    const setPopoverOpenRef = useRef2(null);
    setPopoverOpenRef.current = setPopoverOpen;
    popoverOpenRef.current = popoverOpen;
    const [anchor, setAnchor] = useState(null);
    useEffect(() => {
      if (isActive) {
        const timer = setTimeout(() => {
          const iframe = document.querySelector('iframe[name="editor-canvas"]');
          const doc = iframe ? iframe.contentDocument : document;
          const win = iframe ? iframe.contentWindow : window;
          if (!doc || !win) return;
          const selection = win.getSelection();
          if (selection && selection.rangeCount > 0) {
            let pointerNode = selection.getRangeAt(0).startContainer;
            if (pointerNode.nodeType === 3) {
              pointerNode = pointerNode.parentNode;
            }
            const activeNode = (pointerNode == null ? void 0 : pointerNode.closest(".ve-expr-token")) || null;
            setAnchor(activeNode);
          } else {
            setAnchor(null);
          }
        }, 10);
        return () => clearTimeout(timer);
      } else {
        setAnchor(null);
      }
    }, [isActive, value]);
    useLayoutEffect2(() => {
      isActiveRef.current = isActive;
    }, [isActive]);
    useLayoutEffect2(() => {
      anchorRef.current = anchor;
    }, [anchor]);
    useActiveTokenState(isActive, contentRef);
    useTokenEventListeners(contentRef, {
      isActiveRef,
      popoverOpenRef,
      anchorRef,
      activeMarkRef,
      dismissPopoverRef,
      setPopoverOpenRef
    });
    useEffect(() => {
      var _a2;
      if (isActive && (activeAttributes == null ? void 0 : activeAttributes.expr)) {
        setEdit(activeAttributes.expr);
        setLivePreview({
          preview: (_a2 = activeAttributes.view) != null ? _a2 : null,
          valid: activeAttributes.valid !== "false"
        });
      }
    }, [isActive, activeAttributes == null ? void 0 : activeAttributes.expr, activeAttributes == null ? void 0 : activeAttributes.view, activeAttributes == null ? void 0 : activeAttributes.valid]);
    useEffect(() => {
      if (!isActive || !editExpr.trim()) {
        if (!editExpr.trim()) setLivePreview(null);
        return;
      }
      let isCancelled = false;
      const id = setTimeout(async () => {
        var _a2, _b2;
        const postId = ((_b2 = (_a2 = select("core/editor")) == null ? void 0 : _a2.getCurrentPostId) == null ? void 0 : _b2.call(_a2)) || 0;
        const view = await fetchPreview(editExpr.trim(), postId);
        if (!isCancelled) {
          setLivePreview(view);
        }
      }, 300);
      return () => {
        isCancelled = true;
        clearTimeout(id);
      };
    }, [editExpr, isActive]);
    useEffect(() => {
      if (!isActive) setPopoverOpen(false);
    }, [isActive]);
    useEffect(() => {
      if (!popoverOpen || !inputRef.current) return;
      const id = setTimeout(() => {
        var _a2;
        return (_a2 = inputRef.current) == null ? void 0 : _a2.focus();
      }, POPOVER_FOCUS_DELAY);
      return () => clearTimeout(id);
    }, [popoverOpen]);
    const applyUpdate = useCallback2(async () => {
      var _a2, _b2;
      const expr = editExpr.trim();
      if (!expr) return;
      const postId = ((_b2 = (_a2 = select("core/editor")) == null ? void 0 : _a2.getCurrentPostId) == null ? void 0 : _b2.call(_a2)) || 0;
      const view = await fetchPreview(expr, postId);
      const next = applyFormat(value, {
        type: "vector/expression",
        attributes: { expr, view: view.preview, valid: view.valid ? "true" : "false", speculative: "true", contentEditable: "false" }
      });
      next.start = next.end;
      onChange(next);
    }, [editExpr, value, onChange]);
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
    const dismissPopover = useCallback2(() => {
      setPopoverOpen(false);
      const el2 = contentRef == null ? void 0 : contentRef.current;
      const mark = activeMarkRef.current;
      if (el2 && mark) {
        const iframeDoc = el2.ownerDocument;
        const range = iframeDoc.createRange();
        range.setStartBefore(mark);
        range.collapse(true);
        const sel = iframeDoc.defaultView.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      el2 == null ? void 0 : el2.focus();
    }, [contentRef]);
    dismissPopoverRef.current = dismissPopover;
    if (!popoverOpen) return null;
    const getFallbackAnchor = () => {
      const iframe = document.querySelector('iframe[name="editor-canvas"]');
      const win = iframe ? iframe.contentWindow : window;
      const sel = win.getSelection();
      return (sel == null ? void 0 : sel.rangeCount) ? sel.getRangeAt(0).getBoundingClientRect() : null;
    };
    return /* @__PURE__ */ wp.element.createElement(
      TokenPopover,
      {
        anchor,
        getFallbackAnchor,
        editExpr,
        setEdit,
        previewObj: livePreview,
        onUpdate: applyUpdate,
        onRemove: applyRemove,
        onDismiss: dismissPopover,
        inputRef
      }
    );
  };
  var registerExpressionFormat = () => {
    registerFormatType("vector/expression", {
      title: __("Dynamic Value", "vector-expressions"),
      tagName: "mark",
      className: "ve-expr-token",
      attributes: {
        expr: "data-ve-expr",
        view: "data-ve-view",
        speculative: "data-ve-speculative",
        empty: "data-ve-empty",
        active: "data-ve-active",
        contentEditable: "contenteditable"
      },
      interactive: true,
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
    if (q.startsWith("post"))
      return completions.filter((o) => o.prefix === "post");
    if (q.startsWith("user"))
      return completions.filter((o) => o.prefix === "user");
    if (q.startsWith("site"))
      return completions.filter((o) => o.prefix === "site");
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
      "vector-expressions/autocompleter",
      (completers) => [...completers, buildCompleter()]
    );
  };

  // modules/editor/logo.jsx
  var VectorArrowLogo = () => /* @__PURE__ */ wp.element.createElement(
    "svg",
    {
      width: "16",
      height: "16",
      viewBox: "-376 -15 92 126",
      "aria-hidden": "true",
      focusable: "false",
      className: "ve-logo"
    },
    /* @__PURE__ */ wp.element.createElement("g", { style: { fill: "#0d6632" } }, /* @__PURE__ */ wp.element.createElement("path", { d: "M -372.38427,54.856239 V 40.319598 q 5.39067,-0.242277 7.93459,-2.119927 2.60448,-1.877649 3.937,-5.875225 1.3931,-3.997576 1.3931,-13.506962 0,-11.9927279 1.09025,-16.35372 1.09024,-4.4215615 3.45245,-7.0260429 2.42277,-2.6650507 7.02604,-4.3609921 4.66384,-1.695941 13.38582,-1.695941 h 3.21018 v 14.53664 q -6.48092,0 -8.47971,0.726832 -1.99879,0.6662627 -2.9679,2.2410654 -0.90854,1.5748027 -0.90854,5.8146566 0,7.631736 -0.72683,17.019983 -0.48455,6.117502 -3.33131,10.963049 -2.11993,3.573591 -7.32889,6.965474 4.42156,2.543912 7.02604,6.480919 2.60448,3.876437 3.45245,9.872801 0.36342,2.604481 0.84797,16.959414 0.18171,5.269532 0.66627,6.541488 0.7874,1.877649 2.90732,2.846759 2.1805,0.969109 8.84313,0.969109 v 14.476072 h -3.21018 q -8.78255,0 -13.0224,-1.45366 -4.23986,-1.3931 -6.90491,-4.17929 -2.66505,-2.725619 -3.87644,-6.965473 -1.15081,-4.179284 -1.15081,-14.476071 0,-11.508173 -1.27196,-15.505749 -1.21139,-4.058146 -3.87644,-6.056934 -2.60448,-1.998788 -8.11629,-2.301634 z" }), /* @__PURE__ */ wp.element.createElement("path", { d: "M -329.85728,54.856239 V 40.319598 q 5.39067,-0.242277 7.93458,-2.119927 2.60448,-1.877649 3.93701,-5.875225 1.39309,-3.997576 1.39309,-13.506962 0,-11.9927279 1.09025,-16.35372 1.09025,-4.4215615 3.45245,-7.0260429 2.42278,-2.6650507 7.02605,-4.3609921 4.66383,-1.695941 13.38582,-1.695941 h 3.21017 v 14.53664 q -6.48092,0 -8.4797,0.726832 -1.99879,0.6662627 -2.9679,2.2410654 -0.90854,1.5748027 -0.90854,5.8146566 0,7.631736 -0.72683,17.019983 -0.48456,6.117502 -3.33132,10.963049 -2.11992,3.573591 -7.32889,6.965474 4.42157,2.543912 7.02605,6.480919 2.60448,3.876437 3.45245,9.872801 0.36341,2.604481 0.84797,16.959414 0.18171,5.269532 0.66626,6.541488 0.7874,1.877649 2.90733,2.846759 2.1805,0.969109 8.84312,0.969109 v 14.476072 h -3.21017 q -8.78256,0 -13.02241,-1.45366 -4.23985,-1.3931 -6.9049,-4.17929 -2.66505,-2.725619 -3.87644,-6.965473 -1.15082,-4.179284 -1.15082,-14.476071 0,-11.508173 -1.27195,-15.505749 -1.21139,-4.058146 -3.87644,-6.056934 -2.60448,-1.998788 -8.11629,-2.301634 z" }))
  );

  // modules/editor/logic-panel.jsx
  var {
    Fragment,
    useState: useState2,
    useEffect: useEffect2,
    useLayoutEffect: useLayoutEffect3,
    useMemo,
    useRef: useRef3,
    useCallback: useCallback3
  } = window.wp.element;
  var { createHigherOrderComponent } = window.wp.compose;
  var { addFilter: addFilter2 } = window.wp.hooks;
  var { InspectorControls } = window.wp.blockEditor;
  var {
    PanelBody,
    Button: Button2,
    SelectControl,
    ExternalLink
  } = window.wp.components;
  var { __: __2 } = window.wp.i18n;
  var { select: select2, useSelect } = window.wp.data;
  var getRichTextAttrName = (blockName) => {
    const blockType = select2("core/blocks").getBlockType(blockName);
    if (!(blockType == null ? void 0 : blockType.attributes)) return null;
    const entry = Object.entries(blockType.attributes).find(
      ([, cfg]) => cfg.source === "html" || cfg.source === "rich-text"
    );
    return entry ? entry[0] : null;
  };
  var convertTokens = (html) => {
    TOKEN_REGEX.lastIndex = 0;
    return html.replace(
      TOKEN_REGEX,
      (match, existingMark, codeBlock, _fullExpr, expr) => {
        if (codeBlock) return codeBlock;
        if (existingMark) {
          if (!existingMark.includes("data-ve-speculative")) {
            return existingMark.replace("<mark ", '<mark data-ve-speculative="true" ');
          }
          return existingMark;
        }
        const e = expr.trim().replace(/\s*\|\s*/g, " | ");
        const opt = getCompletions().find((o) => o.expr === e);
        const view = (opt == null ? void 0 : opt.preview) || e;
        const safeExpr = e.replace(/"/g, "&quot;");
        const safeView = view.replace(/"/g, "&quot;");
        return `<mark class="ve-expr-token" data-ve-expr="${safeExpr}" data-ve-view="${safeView}" data-ve-speculative="true" contenteditable="false">{{ ${e} }}</mark>`;
      }
    );
  };
  var usePass1Conversion = (setAttributes, attrName, blockName) => useCallback3(
    (attrs) => {
      if (!attrName || SKIP_CONVERT_BLOCKS.has(blockName)) return setAttributes(attrs);
      if (!(attrName in attrs)) return setAttributes(attrs);
      const raw = attrs[attrName];
      const html = typeof raw === "string" ? raw : String(raw != null ? raw : "");
      if (!html.includes("{{")) return setAttributes(attrs);
      const converted = convertTokens(html);
      setAttributes(
        converted !== html ? { ...attrs, [attrName]: converted } : attrs
      );
    },
    [setAttributes, attrName, blockName]
  );
  var usePass2Resolution = (attributes, attrName, blockName, postId) => {
    const [refreshTick, setRefreshTick] = useState2(0);
    const [virtualTick, setVirtualTick] = useState2(0);
    const prevRefreshTick = useRef3(0);
    const prevSaving = useRef3(false);
    const localViews = useRef3(/* @__PURE__ */ new Map());
    const isSavingPost = useSelect(
      (sel) => {
        var _a2, _b2, _c2;
        return (_c2 = (_b2 = (_a2 = sel("core/editor")) == null ? void 0 : _a2.isSavingPost) == null ? void 0 : _b2.call(_a2)) != null ? _c2 : false;
      },
      []
    );
    useEffect2(() => {
      var _a2, _b2, _c2;
      const justFinished = prevSaving.current && !isSavingPost;
      prevSaving.current = isSavingPost;
      if (!justFinished) return;
      const didSucceed = (_c2 = (_b2 = (_a2 = select2("core/editor")) == null ? void 0 : _a2.didPostSaveRequestSucceed) == null ? void 0 : _b2.call(_a2)) != null ? _c2 : false;
      if (didSucceed) setRefreshTick((t) => t + 1);
    }, [isSavingPost]);
    useEffect2(() => {
      if (!attrName || SKIP_CONVERT_BLOCKS.has(blockName)) return;
      const raw = attributes[attrName];
      const html = typeof raw === "string" ? raw : String(raw != null ? raw : "");
      if (!html.includes("ve-expr-token")) return;
      const isForced = refreshTick !== prevRefreshTick.current;
      prevRefreshTick.current = refreshTick;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const marks = Array.from(doc.querySelectorAll("mark.ve-expr-token"));
      const toFetch = marks.reduce((acc, mark) => {
        const expr = mark.dataset.veExpr;
        const view = mark.dataset.veView;
        if (!expr) return acc;
        const isSpeculative = mark.hasAttribute("data-ve-speculative");
        const unresolved = !view || view.trim() === expr.trim() || isSpeculative;
        if (isForced || unresolved) acc.push({ expr, mark });
        return acc;
      }, []);
      if (toFetch.length === 0) return;
      let cancelled = false;
      const uniqueExprs = [...new Set(toFetch.map((u) => u.expr))];
      Promise.all(
        uniqueExprs.map((expr) => fetchPreview(expr, postId).then((p) => ({ expr, preview: (p == null ? void 0 : p.preview) || "" })))
      ).then((results) => {
        if (cancelled) return;
        let changed = false;
        results.forEach((r) => {
          if (localViews.current.get(r.expr) !== r.preview) {
            localViews.current.set(r.expr, r.preview);
            changed = true;
          }
        });
        if (changed) {
          setVirtualTick((t) => t + 1);
        }
      });
      return () => {
        cancelled = true;
      };
    }, [attributes[attrName], refreshTick, postId]);
    let virtualAttributes = attributes;
    if (attrName && !SKIP_CONVERT_BLOCKS.has(blockName)) {
      const raw = attributes[attrName];
      if (typeof raw === "string" && raw.includes("ve-expr-token")) {
        const doc = new DOMParser().parseFromString(raw, "text/html");
        let changed = false;
        Array.from(doc.querySelectorAll("mark.ve-expr-token")).forEach((mark) => {
          const expr = mark.dataset.veExpr;
          if (mark.hasAttribute("data-ve-speculative")) {
            mark.removeAttribute("data-ve-speculative");
            changed = true;
          }
          if (localViews.current.has(expr)) {
            const p = localViews.current.get(expr);
            if (p !== null && p !== void 0 && p !== mark.dataset.veView) {
              const hasVisibleContent = /\S/.test(p.replace(/\u00a0/g, ""));
              mark.dataset.veView = p != null ? p : "";
              if (hasVisibleContent) {
                delete mark.dataset.veEmpty;
              } else {
                mark.dataset.veEmpty = "";
              }
              changed = true;
            }
          }
        });
        if (changed) {
          virtualAttributes = {
            ...attributes,
            [attrName]: doc.body.innerHTML
          };
        }
      }
    }
    return virtualAttributes;
  };
  var ClassTextarea = ({ value, onChange, placeholder }) => {
    const { __: __3 } = window.wp.i18n;
    return /* @__PURE__ */ wp.element.createElement("div", { className: "ve-class-field" }, /* @__PURE__ */ wp.element.createElement(
      "label",
      {
        className: "components-base-control__label",
        htmlFor: "ve-class-input"
      },
      __3("Template", "vector-expressions")
    ), /* @__PURE__ */ wp.element.createElement(
      AutoTextarea,
      {
        id: "ve-class-input",
        value,
        onChange,
        placeholder
      }
    ), /* @__PURE__ */ wp.element.createElement("p", { className: "components-base-control__help" }, __3("Mix static text and", "vector-expressions"), " ", /* @__PURE__ */ wp.element.createElement("code", null, "{{ expressions }}"), " ", __3("freely. Each token is evaluated and the full string becomes the class.", "vector-expressions")));
  };
  var LogicInspectorPanel = ({ ve_logic, update, showRef, setShowRef }) => {
    return /* @__PURE__ */ wp.element.createElement(
      PanelBody,
      {
        title: /* @__PURE__ */ wp.element.createElement("span", { className: "ve-panel-title" }, /* @__PURE__ */ wp.element.createElement(VectorArrowLogo, null), __2("Vector Expressions", "vector-expressions")),
        initialOpen: false
      },
      /* @__PURE__ */ wp.element.createElement("div", { className: "ve-section" }, /* @__PURE__ */ wp.element.createElement("p", { className: "ve-section-label" }, __2("Visibility", "vector-expressions")), /* @__PURE__ */ wp.element.createElement(
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
      ), /* @__PURE__ */ wp.element.createElement("div", { className: "ve-class-field" }, /* @__PURE__ */ wp.element.createElement(
        "label",
        {
          className: "components-base-control__label",
          htmlFor: "ve-condition-input"
        },
        __2("Condition", "vector-expressions")
      ), /* @__PURE__ */ wp.element.createElement(
        AutoTextarea,
        {
          id: "ve-condition-input",
          value: (ve_logic == null ? void 0 : ve_logic.visible) || "",
          onChange: (v) => update("visible", v),
          placeholder: "user.is_logged_in",
          className: "ve-class-textarea"
        }
      )), /* @__PURE__ */ wp.element.createElement("div", { className: "ve-syntax-ref-wrap" }, /* @__PURE__ */ wp.element.createElement(
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
      ), showRef && /* @__PURE__ */ wp.element.createElement("table", { className: "ve-syntax-ref" }, /* @__PURE__ */ wp.element.createElement("tbody", null, /* @__PURE__ */ wp.element.createElement("tr", { className: "ve-ref-head" }, /* @__PURE__ */ wp.element.createElement("th", { colSpan: "2" }, __2("Variables", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "user.name")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Display name", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "user.is_logged_in")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Logged in?", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "user.role")), /* @__PURE__ */ wp.element.createElement("td", null, __2("User role", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "post.title")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Post title", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "post.author_name")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Author name", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "post.meta.my_key")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Post meta", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", { className: "ve-ref-head" }, /* @__PURE__ */ wp.element.createElement("th", { colSpan: "2" }, __2("Operators & Filters", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "a == b")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Equals", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "a ? b : c")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Ternary", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "val | upper")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Filter", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "post.date | date")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Format date", "vector-expressions"))), /* @__PURE__ */ wp.element.createElement("tr", null, /* @__PURE__ */ wp.element.createElement("td", null, /* @__PURE__ */ wp.element.createElement("code", null, "post.author | get_user")), /* @__PURE__ */ wp.element.createElement("td", null, __2("Author object", "vector-expressions"))))))),
      /* @__PURE__ */ wp.element.createElement("div", { className: "ve-section ve-section--bordered" }, /* @__PURE__ */ wp.element.createElement("p", { className: "ve-section-label" }, __2("Dynamic Class", "vector-expressions")), /* @__PURE__ */ wp.element.createElement(
        ClassTextarea,
        {
          value: (ve_logic == null ? void 0 : ve_logic.class) || "",
          onChange: (v) => update("class", v),
          placeholder: `prefix-{{ user.role | kebab }}`
        }
      ))
    );
  };
  var LogicPanel = createHigherOrderComponent((BlockEdit) => {
    return (props) => {
      var _a2, _b2;
      const { attributes, setAttributes, isSelected, name, context } = props;
      const { ve_logic } = attributes;
      const [showRef, setShowRef] = useState2(false);
      const attrName = useMemo(() => getRichTextAttrName(name), [name]);
      const wrappedSetAttributes = usePass1Conversion(setAttributes, attrName, name);
      const newProps = { ...props, setAttributes: wrappedSetAttributes };
      const postId = (context == null ? void 0 : context.postId) || ((_b2 = (_a2 = select2("core/editor")) == null ? void 0 : _a2.getCurrentPostId) == null ? void 0 : _b2.call(_a2)) || 0;
      const virtualAttributes = usePass2Resolution(attributes, attrName, name, postId);
      if (!isSelected) return /* @__PURE__ */ wp.element.createElement(BlockEdit, { ...newProps, attributes: virtualAttributes });
      const update = (key, val) => setAttributes({ ve_logic: { ...ve_logic != null ? ve_logic : {}, [key]: val } });
      return /* @__PURE__ */ wp.element.createElement(Fragment, null, /* @__PURE__ */ wp.element.createElement(BlockEdit, { ...newProps, attributes: virtualAttributes }), /* @__PURE__ */ wp.element.createElement(InspectorControls, null, /* @__PURE__ */ wp.element.createElement(
        LogicInspectorPanel,
        {
          ve_logic,
          update,
          showRef,
          setShowRef
        }
      )));
    };
  }, "LogicPanel");
  var registerLogicPanel = () => {
    addFilter2("editor.BlockEdit", "ve/logic-panel", LogicPanel);
    addFilter2("blocks.registerBlockType", "ve-logic/inject-context", (settings, name) => {
      if (SKIP_CONVERT_BLOCKS.has(name)) return settings;
      return {
        ...settings,
        usesContext: [...settings.usesContext || [], "postId", "postType"]
      };
    });
  };

  // modules/editor/editor.jsx
  registerExpressionFormat();
  registerAutocompleter();
  registerLogicPanel();
})();

(function () {
  const AP = (window.AutoPager = window.AutoPager || {});
  const { selectAll } = AP.selector;

  const NEXT_WORDS =
    /^(下一页|下一頁|下页|下頁|后页|後頁|下一章|下一节|next|nextpage|older|olderposts|olderentries)$/i;
  const NEXT_SYMBOLS = /^(›|»|>|>>|→|＞|≫)$/;
  const NEXT_CLASS = /(^|[\s_-])(next|nxt|nextpage|next-page|pagenext)([\s_-]|$)/i;
  const CAROUSEL_CLASS = /slick|swiper|carousel|slider|slide|gallery|lightbox/i;
  const PAGINATION_HINT = /pag|pg|pager|pages|paging|page-nav|pagenav|nav-links|wp-pagenavi/i;
  const UNSTABLE_CLASS = /^(active|current|cur|on|hover|selected|odd|even|first|last|clearfix|cl|fix)$/i;
  const SKIP_CONTAINERS = "header, nav, footer, aside, [role='navigation'], [role='banner']";
  const FALLBACK_SELECTORS = [
    "#postlist",
    "#threadlist",
    ".topic-list",
    ".post-list",
    "#posts",
    ".posts",
    "#content",
    ".content",
    "#main",
    "main",
    "article",
  ];

  function stripHash(url) {
    return String(url || "").split("#")[0];
  }

  function resolveHref(href, baseUrl) {
    const raw = String(href || "").trim();
    if (!raw || /^(#|javascript:|mailto:|tel:)/i.test(raw)) return "";
    try {
      const url = new URL(raw, baseUrl);
      if (url.origin !== location.origin) return "";
      if (stripHash(url.href) === stripHash(baseUrl)) return "";
      return url.href;
    } catch (error) {
      return "";
    }
  }

  function inPagination(el) {
    for (let node = el, depth = 0; node && depth < 4; node = node.parentElement, depth += 1) {
      const hint = (node.className && String(node.className)) + " " + (node.id || "");
      if (PAGINATION_HINT.test(hint)) return true;
    }
    return false;
  }

  function normalizedText(el) {
    return (el.textContent || "").replace(/\s+/g, "");
  }

  function findByCurrentPage(doc, baseUrl) {
    const current = doc.querySelector(
      "[aria-current='page'], [class*='pag'] .current, [class*='pag'] .active, " +
        "[class*='pag'] .cur, [class*='pag'] strong, .pg strong, .page strong, .pages strong",
    );
    if (!current) return "";
    const number = parseInt(normalizedText(current), 10);
    if (!number) return "";

    const scope = current.closest("[class*='pag'], .pg, .page, .pages, nav") || current.parentElement;
    if (!scope) return "";
    const target = Array.from(scope.querySelectorAll("a[href]")).find(
      (a) => normalizedText(a) === String(number + 1),
    );
    return target ? resolveHref(target.getAttribute("href"), baseUrl) : "";
  }

  function findNextLink(doc, baseUrl) {
    const relNext = doc.querySelectorAll("link[rel~='next'][href], a[rel~='next'][href]");
    for (const el of relNext) {
      const url = resolveHref(el.getAttribute("href"), baseUrl);
      if (url) return url;
    }

    const anchors = Array.from(doc.querySelectorAll("a[href]"));

    for (const a of anchors) {
      const text = normalizedText(a).replace(/[»›>→＞≫]+$/, "");
      const label = (a.getAttribute("title") || a.getAttribute("aria-label") || "").replace(/\s+/g, "");
      const strong = NEXT_WORDS.test(text) || /^(下一页|nextpage|next)$/i.test(label);
      const symbol = NEXT_SYMBOLS.test(normalizedText(a)) && inPagination(a);
      if (strong || symbol) {
        const url = resolveHref(a.getAttribute("href"), baseUrl);
        if (url) return url;
      }
    }

    for (const a of anchors) {
      const parent = a.parentElement;
      const hint = [a.className, a.id, parent && parent.className].map(String).join(" ");
      if (!NEXT_CLASS.test(hint) || CAROUSEL_CLASS.test(hint)) continue;
      const url = resolveHref(a.getAttribute("href"), baseUrl);
      if (url) return url;
    }

    return findByCurrentPage(doc, baseUrl);
  }

  // ---------- 正文容器识别 ----------

  function stableClasses(el) {
    return Array.from(el.classList).filter(
      (name) => name.length < 40 && !/\d{2,}/.test(name) && !UNSTABLE_CLASS.test(name),
    );
  }

  function childSignature(el) {
    const [cls] = stableClasses(el);
    return el.tagName.toLowerCase() + (cls ? "." + CSS.escape(cls) : "");
  }

  function stableId(id) {
    return Boolean(id) && /^[A-Za-z][\w-]*$/.test(id) && !/\d{3,}/.test(id);
  }

  function selectorPath(el, useNth) {
    const parts = [];
    for (let node = el; node && node.tagName !== "HTML"; node = node.parentElement) {
      if (stableId(node.id)) {
        parts.unshift("#" + CSS.escape(node.id));
        break;
      }
      let part = node.tagName.toLowerCase();
      if (useNth) {
        const sameTag = Array.from(node.parentElement ? node.parentElement.children : []).filter(
          (sibling) => sibling.tagName === node.tagName,
        );
        if (sameTag.length > 1) part += ":nth-of-type(" + (sameTag.indexOf(node) + 1) + ")";
      } else {
        part += stableClasses(node)
          .slice(0, 2)
          .map((name) => "." + CSS.escape(name))
          .join("");
      }
      parts.unshift(part);
    }
    return parts.join(" > ");
  }

  function buildSelector(el, doc) {
    for (const useNth of [false, true]) {
      const selector = selectorPath(el, useNth);
      if (selector && selectAll(doc, selector).length === 1) return selector;
    }
    return "";
  }

  function scoreContainer(el) {
    const children = Array.from(el.children).filter(
      (child) => !/^(SCRIPT|STYLE|LINK|META|BR|HR)$/.test(child.tagName),
    );
    if (children.length < 3) return null;

    const groups = new Map();
    children.forEach((child) => {
      const signature = childSignature(child);
      groups.set(signature, (groups.get(signature) || 0) + 1);
    });
    let signature = "";
    let count = 0;
    groups.forEach((value, key) => {
      if (value > count) {
        signature = key;
        count = value;
      }
    });
    const ratio = count / children.length;
    if (count < 3 || ratio < 0.5) return null;

    const textLength = children
      .filter((child) => childSignature(child) === signature)
      .reduce((sum, child) => sum + normalizedText(child).length, 0);
    const avgText = textLength / count;
    if (avgText < 20) return null;

    return { el, signature, score: textLength * ratio };
  }

  function findPageElement(currentDoc, nextDoc) {
    const candidates = Array.from(nextDoc.body ? nextDoc.body.querySelectorAll("*") : [])
      .filter((el) => el.children.length >= 3 && !el.closest(SKIP_CONTAINERS))
      .map(scoreContainer)
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    for (const { el, signature } of candidates) {
      const containerSelector = buildSelector(el, nextDoc);
      if (!containerSelector) continue;
      const currentContainers = selectAll(currentDoc, containerSelector);
      if (currentContainers.length !== 1) continue;
      if (normalizedText(currentContainers[0]) === normalizedText(el)) continue;

      const pageSelector = containerSelector + " > " + signature;
      if (selectAll(currentDoc, pageSelector).length) return pageSelector;
    }

    for (const selector of FALLBACK_SELECTORS) {
      const current = selectAll(currentDoc, selector);
      const next = selectAll(nextDoc, selector);
      if (current.length !== 1 || next.length !== 1) continue;
      if (normalizedText(current[0]) !== normalizedText(next[0])) return selector;
    }
    return "";
  }

  AP.detector = { findNextLink, findPageElement, resolveHref };
})();

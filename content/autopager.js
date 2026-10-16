(function () {
  if (window.__autoPagerLoaded) return;
  window.__autoPagerLoaded = true;

  const AP = window.AutoPager;
  const storage = window.AutoPagerStorage;
  const { selectAll, selectFirst, selectLast } = AP.selector;

  let settings = { ...storage.DEFAULT_SETTINGS };
  let session = null;
  let initUrl = location.href;
  let sentinel = null;
  let loadingEl = null;
  let toastTimer = 0;
  let scrollTicking = false;
  let navTimer = 0;

  function stripHash(url) {
    return String(url || "").split("#")[0];
  }

  function cacheKey() {
    return location.host + location.pathname.replace(/\d+/g, "N");
  }

  function idleSession(statusText) {
    return { rule: null, statusText, pageNum: 1, done: true, visited: new Set() };
  }

  function createSession(rule, source, nextUrl) {
    return {
      rule,
      source,
      pageElement: rule.pageElement || "",
      nextUrl,
      pageNum: 1,
      loading: false,
      paused: false,
      done: false,
      failures: 0,
      visited: new Set([stripHash(location.href)]),
      signatures: new Set(),
      observer: null,
      targetVisible: false,
      statusText: "",
    };
  }

  // ---------- 规则匹配 ----------

  function testUrl(rule, url) {
    if (!rule.url) return true;
    try {
      return new RegExp(rule.url).test(url);
    } catch (error) {
      console.warn("[AutoPager] 规则 URL 正则无效:", rule.name, rule.url);
      return false;
    }
  }

  function ruleMatches(rule) {
    if (!rule || rule.enabled === false) return false;
    if (!testUrl(rule, location.href)) return false;
    return !rule.match || Boolean(selectFirst(document, rule.match));
  }

  function incrementParam(url, param, step) {
    const parsed = new URL(url);
    const current = parseInt(parsed.searchParams.get(param), 10) || 1;
    parsed.searchParams.set(param, String(current + (Number(step) || 1)));
    return parsed.href;
  }

  function computeNextUrl(doc, baseUrl, rule) {
    let url = "";
    if (rule.nextLink) {
      const el = selectFirst(doc, rule.nextLink);
      url = el ? AP.detector.resolveHref(el.getAttribute("href"), baseUrl) : "";
    }
    if (!url && rule.pageParam) url = incrementParam(baseUrl, rule.pageParam, rule.pageStep);
    if (!url && !rule.nextLink && !rule.pageParam) url = AP.detector.findNextLink(doc, baseUrl);
    return url;
  }

  async function resolveRule() {
    const customRules = await storage.getCustomRules();
    const rules = customRules
      .map((rule) => ({ rule, source: "custom" }))
      .concat(AP.builtinRules.map((rule) => ({ rule, source: "builtin" })));

    for (const { rule, source } of rules) {
      if (!ruleMatches(rule)) continue;
      if (rule.exclude) return { excluded: true, rule };
      if (rule.pageElement && !selectFirst(document, rule.pageElement)) continue;
      return { rule, source, nextUrl: computeNextUrl(document, location.href, rule) };
    }

    const nextUrl = AP.detector.findNextLink(document, location.href);
    if (!nextUrl) return null;

    const cached = await storage.getDetectCache(cacheKey());
    const pageElement =
      cached && cached.pageElement && selectFirst(document, cached.pageElement)
        ? cached.pageElement
        : "";
    return { rule: { name: "通用识别", pageElement }, source: "generic", nextUrl };
  }

  // ---------- 界面 ----------

  function showToast(text) {
    let toast = document.querySelector(".autopager-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "autopager-toast";
      document.documentElement.appendChild(toast);
    }
    toast.textContent = "AutoPager：" + text;
    toast.classList.add("autopager-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("autopager-visible"), 2500);
  }

  function showLoading(visible, pageNum) {
    if (!loadingEl) {
      loadingEl = document.createElement("div");
      loadingEl.className = "autopager-loading";
      document.documentElement.appendChild(loadingEl);
    }
    loadingEl.textContent = "AutoPager 正在加载第 " + pageNum + " 页…";
    loadingEl.classList.toggle("autopager-visible", visible);
  }

  function countColumns(template) {
    const row = template.tagName === "TR" ? template : template.querySelector("tr");
    if (!row) return 1;
    return Array.from(row.cells).reduce((sum, cell) => sum + (cell.colSpan || 1), 0) || 1;
  }

  function createSeparator(template, pageNum, pageUrl) {
    const bar = document.createElement("div");
    bar.className = "autopager-separator";
    const label = document.createElement("span");
    label.textContent = "第 " + pageNum + " 页";
    const link = document.createElement("a");
    link.href = pageUrl;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "打开原页面";
    bar.append(label, link);

    const tag = template ? template.tagName : "DIV";
    let host = bar;
    if (tag === "TR" || tag === "TBODY") {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = countColumns(template);
      td.appendChild(bar);
      tr.appendChild(td);
      host = tr;
      if (tag === "TBODY") {
        host = document.createElement("tbody");
        host.appendChild(tr);
      }
    } else if (tag === "LI") {
      host = document.createElement("li");
      host.appendChild(bar);
    }
    host.classList.add("autopager-separator-host");
    host.dataset.autopagerUrl = pageUrl;
    return host;
  }

  function insertPage(nodes, pageNum, pageUrl) {
    const last = selectLast(document, session.pageElement);
    const before = session.rule.insertBefore
      ? selectFirst(document, session.rule.insertBefore)
      : null;

    let parent;
    let ref;
    if (before) {
      parent = before.parentNode;
      ref = before;
    } else if (last) {
      parent = last.parentNode;
      ref = last.nextSibling;
    } else {
      return false;
    }

    parent.insertBefore(createSeparator(last || before, pageNum, pageUrl), ref);
    nodes.forEach((node) => parent.insertBefore(node, ref));
    return true;
  }

  // ---------- 触发 ----------

  function getTriggerTarget() {
    const last = session.pageElement ? selectLast(document, session.pageElement) : null;
    if (last) return last;
    if (!sentinel || !sentinel.isConnected) {
      sentinel = document.createElement("div");
      sentinel.className = "autopager-sentinel";
      document.body.appendChild(sentinel);
    }
    return sentinel;
  }

  function checkTrigger() {
    if (!session || !session.rule || !session.targetVisible) return;
    if (session.loading || session.done || session.paused) return;
    const target = getTriggerTarget();
    const distance = target.getBoundingClientRect().bottom - window.innerHeight;
    if (distance <= settings.triggerDistance) loadNext(false);
  }

  function observeTrigger() {
    if (!session || !session.rule || session.done) return;
    if (session.observer) session.observer.disconnect();
    session.targetVisible = false;
    session.observer = new IntersectionObserver(
      (entries) => {
        session.targetVisible = entries.some((entry) => entry.isIntersecting);
        checkTrigger();
      },
      { rootMargin: "0px 0px " + settings.triggerDistance + "px 0px" },
    );
    session.observer.observe(getTriggerTarget());
  }

  function syncAddressBar() {
    if (!settings.syncUrl || !session || !session.rule || session.pageNum <= 1) return;
    const threshold = window.innerHeight * 0.3;
    let url = initUrl;
    document.querySelectorAll(".autopager-separator-host").forEach((host) => {
      if (host.getBoundingClientRect().top < threshold) url = host.dataset.autopagerUrl;
    });
    if (stripHash(url) !== stripHash(location.href)) {
      history.replaceState(history.state, "", url);
    }
  }

  function onScroll() {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(() => {
      scrollTicking = false;
      checkTrigger();
      syncAddressBar();
    });
  }

  // ---------- 加载 ----------

  function signatureOf(elements) {
    const first = elements[0] ? elements[0].textContent.replace(/\s+/g, "") : "";
    return elements.length + "|" + first.slice(0, 300);
  }

  function rememberCurrentPage() {
    if (!session.pageElement) return;
    const elements = selectAll(document, session.pageElement);
    if (elements.length) session.signatures.add(signatureOf(elements));
  }

  function setStatus(text) {
    if (session) session.statusText = text;
  }

  function reportPageCount() {
    try {
      chrome.runtime
        .sendMessage({ type: "pageCount", count: session && session.rule ? session.pageNum : 0 })
        .catch(() => {});
    } catch (error) {
      // 扩展被重新加载后旧的 content script 会失去 runtime 连接
    }
  }

  function finish(text) {
    if (!session) return;
    session.done = true;
    setStatus(text);
    if (session.observer) session.observer.disconnect();
    if (session.pageNum > 1 || session.source !== "generic") showToast(text);
  }

  async function loadNext(force) {
    const s = session;
    if (!s || !s.rule || s.loading || s.done || !s.nextUrl) return;
    if (s.paused && !force) return;
    if (s.pageNum >= settings.maxPages) {
      finish("已达到最大页数 " + settings.maxPages);
      return;
    }

    const requestUrl = s.nextUrl;
    s.loading = true;
    showLoading(true, s.pageNum + 1);
    setStatus("正在加载第 " + (s.pageNum + 1) + " 页…");

    try {
      const { doc, url } = await AP.fetcher.fetchDocument(requestUrl, s.rule);
      if (s !== session) return;

      const pageUrl = stripHash(url);
      if (s.visited.has(pageUrl)) {
        finish("已到最后一页");
        return;
      }
      s.visited.add(pageUrl);
      s.visited.add(stripHash(requestUrl));

      if (!s.pageElement) {
        const detected = AP.detector.findPageElement(document, doc);
        if (!detected) {
          finish("未能识别正文区域，已停止");
          return;
        }
        s.pageElement = detected;
        rememberCurrentPage();
        storage.setDetectCache(cacheKey(), { pageElement: detected }).catch(() => {});
      }

      const elements = selectAll(doc, s.pageElement);
      if (!elements.length) {
        finish("已到最后一页");
        return;
      }
      const signature = signatureOf(elements);
      if (s.signatures.has(signature)) {
        finish("已到最后一页");
        return;
      }
      s.signatures.add(signature);

      const nodes = AP.fetcher.prepareNodes(elements, url, s.rule.lazyAttrs);
      if (!insertPage(nodes, s.pageNum + 1, url)) {
        finish("找不到插入位置，已停止");
        return;
      }
      s.pageNum += 1;
      s.failures = 0;
      reportPageCount();

      s.nextUrl = computeNextUrl(doc, url, s.rule);
      if (!s.nextUrl || s.visited.has(stripHash(s.nextUrl))) {
        finish("已到最后一页");
        return;
      }
      if (s.pageNum >= settings.maxPages) {
        finish("已达到最大页数 " + settings.maxPages);
        return;
      }
      setStatus("已加载 " + s.pageNum + " 页");
      observeTrigger();
    } catch (error) {
      if (s !== session) return;
      s.failures += 1;
      console.warn("[AutoPager] 加载下一页失败:", requestUrl, error && error.message);
      if (s.failures >= 2) {
        finish("连续加载失败，已停止");
      } else {
        setStatus("加载失败，继续滚动可重试");
        observeTrigger();
      }
    } finally {
      if (s === session) {
        s.loading = false;
        showLoading(false, s.pageNum + 1);
      }
    }
  }

  // ---------- 生命周期 ----------

  function teardown() {
    if (session && session.observer) session.observer.disconnect();
    if (loadingEl) loadingEl.classList.remove("autopager-visible");
  }

  function isRunnable() {
    if (!settings.enabled) return "已全局关闭";
    if (storage.isHostBlocked(location.hostname, settings.blacklist)) return "本站已禁用";
    return "";
  }

  async function start() {
    teardown();
    initUrl = location.href;
    settings = await storage.getSettings();

    const blockedReason = isRunnable();
    if (blockedReason) {
      session = idleSession(blockedReason);
      reportPageCount();
      return;
    }

    const resolved = await resolveRule();
    if (!resolved) {
      session = idleSession("当前页面未发现下一页");
    } else if (resolved.excluded) {
      session = idleSession("已被排除规则跳过：" + resolved.rule.name);
    } else {
      session = createSession(resolved.rule, resolved.source, resolved.nextUrl);
      if (!session.nextUrl) {
        session.done = true;
        setStatus("已匹配规则，但没有下一页");
      } else {
        rememberCurrentPage();
        setStatus("就绪，滚动到底部自动加载");
        observeTrigger();
      }
    }
    reportPageCount();
  }

  function restart() {
    start().catch((error) => console.warn("[AutoPager] 初始化失败:", error && error.message));
  }

  function getStatus() {
    const s = session || idleSession("初始化中");
    return {
      host: location.hostname,
      active: Boolean(s.rule) && !s.done,
      matched: Boolean(s.rule),
      ruleName: s.rule ? s.rule.name : "",
      source: s.source || "",
      pageNum: s.pageNum,
      paused: Boolean(s.paused),
      done: Boolean(s.done),
      loading: Boolean(s.loading),
      hasNext: Boolean(s.nextUrl) && !s.done,
      statusText: s.statusText,
      blocked: storage.isHostBlocked(location.hostname, settings.blacklist),
      enabled: settings.enabled,
    };
  }

  function onNavigation() {
    clearTimeout(navTimer);
    navTimer = setTimeout(() => {
      const href = stripHash(location.href);
      if (href === stripHash(initUrl)) return;
      if (session && session.visited.has(href)) return;
      restart();
    }, 500);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message) return false;
    switch (message.type) {
      case "getStatus":
        sendResponse(getStatus());
        return false;
      case "togglePause":
        if (session && session.rule) {
          session.paused = !session.paused;
          if (!session.done) setStatus(session.paused ? "已暂停" : "已恢复");
          if (!session.paused) checkTrigger();
        }
        sendResponse(getStatus());
        return false;
      case "loadNext":
        loadNext(true).then(() => sendResponse(getStatus()));
        return true;
      case "restart":
        start().then(() => sendResponse(getStatus()));
        return true;
      default:
        return false;
    }
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (!changes.settings && !changes.customRules && !changes.rulesLocation) return;
    if (changes.settings) {
      settings = { ...storage.DEFAULT_SETTINGS, ...(changes.settings.newValue || {}) };
    }

    const blockedReason = isRunnable();
    if (blockedReason) {
      teardown();
      session = idleSession(blockedReason);
      reportPageCount();
      return;
    }
    if (!session || !session.rule || session.pageNum <= 1) {
      restart();
    } else {
      observeTrigger();
    }
  });

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  window.addEventListener("popstate", onNavigation);
  document.addEventListener("turbo:load", onNavigation);
  document.addEventListener("pjax:end", onNavigation);
  if (document.head) {
    new MutationObserver(onNavigation).observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  restart();
})();

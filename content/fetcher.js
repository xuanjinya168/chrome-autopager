(function () {
  const AP = (window.AutoPager = window.AutoPager || {});

  const DEFAULT_LAZY_ATTRS = [
    "data-src",
    "data-original",
    "data-lazy-src",
    "data-actualsrc",
    "data-echo",
    "zoomfile",
    "file",
  ];
  const URL_ATTRS = ["href", "src", "action", "poster"];
  const REMOVED_TAGS = "script, noscript, iframe, object, embed, frame, frameset";

  function charsetFromContentType(contentType) {
    const match = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType || "");
    return match ? match[1] : "";
  }

  function sniffCharset(buffer) {
    const head = new TextDecoder("windows-1252").decode(buffer.slice(0, 4096));
    const match = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(head);
    return match ? match[1] : "";
  }

  function decode(buffer, charset) {
    try {
      return new TextDecoder(charset).decode(buffer);
    } catch (error) {
      return new TextDecoder("utf-8").decode(buffer);
    }
  }

  function toAbsolute(value, baseUrl) {
    const raw = String(value || "").trim();
    if (!raw || /^(#|javascript:|data:|mailto:|tel:|about:)/i.test(raw)) return raw;
    try {
      return new URL(raw, baseUrl).href;
    } catch (error) {
      return raw;
    }
  }

  // 贴吧等站点用 bigpipe 把正文放在 <code><!-- html --></code> 中，需要先展开
  function unwrapCommentBlocks(doc) {
    doc.querySelectorAll("code").forEach((code) => {
      const comment = Array.from(code.childNodes).find(
        (node) => node.nodeType === Node.COMMENT_NODE,
      );
      if (!comment) return;
      const template = doc.createElement("template");
      template.innerHTML = comment.data;
      code.replaceWith(template.content);
    });
  }

  async function fetchDocument(url, rule) {
    const response = await fetch(url, { credentials: "include", redirect: "follow" });
    if (!response.ok) throw new Error("HTTP " + response.status);

    const buffer = await response.arrayBuffer();
    const charset =
      (rule && rule.charset && rule.charset !== "auto" && rule.charset) ||
      charsetFromContentType(response.headers.get("content-type")) ||
      sniffCharset(buffer) ||
      document.characterSet ||
      "utf-8";

    const doc = new DOMParser().parseFromString(decode(buffer, charset), "text/html");
    if (rule && rule.unwrapComments) unwrapCommentBlocks(doc);
    return { doc, url: response.url || url };
  }

  function restoreLazyImages(root, lazyAttrs, baseUrl) {
    const attrs = lazyAttrs && lazyAttrs.length ? lazyAttrs : DEFAULT_LAZY_ATTRS;
    root.querySelectorAll("img").forEach((img) => {
      for (const attr of attrs) {
        const value = img.getAttribute(attr);
        if (value && !value.startsWith("data:")) {
          img.setAttribute("src", toAbsolute(value, baseUrl));
          break;
        }
      }
      const srcset = img.getAttribute("data-srcset");
      if (srcset) img.setAttribute("srcset", srcset);
    });
  }

  function absolutizeUrls(root, baseUrl) {
    const elements = [root, ...root.querySelectorAll("*")];
    elements.forEach((el) => {
      URL_ATTRS.forEach((attr) => {
        if (el.hasAttribute(attr)) el.setAttribute(attr, toAbsolute(el.getAttribute(attr), baseUrl));
      });
      const srcset = el.getAttribute("srcset");
      if (srcset) {
        el.setAttribute(
          "srcset",
          srcset
            .split(",")
            .map((part) => {
              const [src, ...rest] = part.trim().split(/\s+/);
              return [toAbsolute(src, baseUrl), ...rest].join(" ");
            })
            .join(", "),
        );
      }
    });
  }

  function sanitize(root) {
    root.querySelectorAll(REMOVED_TAGS).forEach((el) => el.remove());
    [root, ...root.querySelectorAll("*")].forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
      });
    });
  }

  function prepareNodes(elements, baseUrl, lazyAttrs) {
    return elements.map((el) => {
      const node = document.importNode(el, true);
      sanitize(node);
      restoreLazyImages(node, lazyAttrs, baseUrl);
      absolutizeUrls(node, baseUrl);
      return node;
    });
  }

  AP.fetcher = { fetchDocument, prepareNodes, toAbsolute };
})();

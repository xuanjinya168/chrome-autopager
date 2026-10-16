(function () {
  const AP = (window.AutoPager = window.AutoPager || {});

  function isXPath(expr) {
    return /^\s*(\(|\/|\.\/)/.test(expr);
  }

  function selectAll(root, expr) {
    if (!root || !expr) return [];
    const doc = root.ownerDocument || root;
    try {
      if (isXPath(expr)) {
        const result = doc.evaluate(
          expr,
          root,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null,
        );
        const nodes = [];
        for (let i = 0; i < result.snapshotLength; i += 1) {
          const node = result.snapshotItem(i);
          if (node.nodeType === Node.ELEMENT_NODE) nodes.push(node);
        }
        return nodes;
      }
      return Array.from(root.querySelectorAll(expr));
    } catch (error) {
      console.warn("[AutoPager] 选择器无效:", expr, error && error.message);
      return [];
    }
  }

  function selectFirst(root, expr) {
    return selectAll(root, expr)[0] || null;
  }

  function selectLast(root, expr) {
    const nodes = selectAll(root, expr);
    return nodes[nodes.length - 1] || null;
  }

  AP.selector = { isXPath, selectAll, selectFirst, selectLast };
})();

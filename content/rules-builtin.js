(function () {
  const AP = (window.AutoPager = window.AutoPager || {});

  const STACK_EXCHANGE =
    "^https?://([^/]+\\.)?(stackoverflow|stackexchange|superuser|serverfault|askubuntu|mathoverflow)\\.(com|net)";
  const NGA = "^https?://(bbs\\.nga\\.cn|nga\\.178\\.com|ngabbs\\.com)";
  const DISCUZ_LAZY = ["zoomfile", "file", "data-src"];

  // 规则字段：
  //   url           匹配页面地址的正则，留空表示任意页面
  //   match         页面中必须存在的元素，用于按 DOM 特征识别（如 Discuz 各站域名不同）
  //   exclude       为 true 时命中即跳过本页，不做自动分页
  //   nextLink      下一页链接（CSS 或 XPath）
  //   pageParam     找不到 nextLink 时，通过递增该查询参数生成下一页地址
  //   pageElement   需要拼接的正文元素；留空时由通用识别自动推断
  //   insertBefore  插入到该元素之前；留空时插入到最后一个 pageElement 之后
  AP.builtinRules = [
    // ---------- 排除：自带无限滚动或不适合拼接的站点 ----------
    { name: "排除：知乎", url: "^https?://([^/]+\\.)?zhihu\\.com/", exclude: true },
    { name: "排除：新版 Reddit", url: "^https?://(www\\.|new\\.)?reddit\\.com/", exclude: true },
    {
      name: "排除：社交媒体与视频站",
      url: "^https?://([^/]+\\.)?(twitter|x|weibo|bilibili|youtube|facebook|instagram)\\.com/",
      exclude: true,
    },
    {
      name: "排除：在线文档与邮箱",
      url: "^https?://(mail|docs|drive)\\.google\\.com/|^https?://mail\\.",
      exclude: true,
    },

    // ---------- Discuz!（按 DOM 特征匹配，适用于各 Discuz 论坛） ----------
    {
      name: "Discuz! 帖子详情",
      url: "",
      match: "#postlist > div[id^='post_']",
      nextLink: ".pg a.nxt",
      pageElement: "#postlist > div[id^='post_']",
      insertBefore: "#postlistreply",
      lazyAttrs: DISCUZ_LAZY,
    },
    {
      name: "Discuz! 帖子列表",
      url: "",
      match: "#threadlisttableid > tbody[id^='normalthread_']",
      nextLink: ".pg a.nxt",
      pageElement: "#threadlisttableid > tbody[id^='normalthread_']",
      lazyAttrs: DISCUZ_LAZY,
    },
    {
      name: "Discuz! 搜索与导读",
      url: "",
      match: "#threadlist .pbw, #threadlist tbody[id^='normalthread_']",
      nextLink: ".pg a.nxt",
      pageElement: "#threadlist .pbw, #threadlist table > tbody[id^='normalthread_']",
    },

    // ---------- 百度贴吧 ----------
    {
      name: "百度贴吧 帖子详情",
      url: "^https?://tieba\\.baidu\\.com/p/\\d+",
      nextLink: "//li[contains(@class,'l_pager')]/a[normalize-space(text())='下一页']",
      pageElement: "#j_p_postlist > div.l_post",
      lazyAttrs: ["data-original", "data-src"],
      unwrapComments: true,
    },
    {
      name: "百度贴吧 帖子列表",
      url: "^https?://tieba\\.baidu\\.com/f\\?",
      nextLink: "#frs_list_pager a.next",
      pageElement: "#thread_list > li.j_thread_list",
      lazyAttrs: ["bpic", "data-original", "data-src"],
      unwrapComments: true,
    },

    // ---------- NGA（分页条由脚本生成，按 page 参数翻页；页面编码 GBK） ----------
    {
      name: "NGA 帖子详情",
      url: NGA + "/read\\.php",
      pageParam: "page",
      pageElement: "#m_posts_c > table.postbox",
      charset: "gbk",
    },
    {
      name: "NGA 帖子列表",
      url: NGA + "/thread\\.php",
      pageParam: "page",
      pageElement: "#topicrows tr.topicrow",
      charset: "gbk",
    },

    // ---------- V2EX ----------
    {
      name: "V2EX 帖子回复",
      url: "^https?://(www\\.)?v2ex\\.com/t/\\d+",
      nextLink:
        "(//*[contains(@class,'page_current')]/following-sibling::a[contains(@class,'page_normal')])[1]",
      pageElement: "#Main .box > .cell[id^='r_']",
    },
    {
      name: "V2EX 节点",
      url: "^https?://(www\\.)?v2ex\\.com/go/",
      nextLink:
        "(//*[contains(@class,'page_current')]/following-sibling::a[contains(@class,'page_normal')])[1]",
      pageElement: "#TopicsNode > .cell",
    },
    {
      name: "V2EX 最近主题",
      url: "^https?://(www\\.)?v2ex\\.com/recent",
      nextLink:
        "(//*[contains(@class,'page_current')]/following-sibling::a[contains(@class,'page_normal')])[1]",
      pageElement: "#Main .box > .cell.item",
    },

    // ---------- 豆瓣 ----------
    {
      name: "豆瓣小组 讨论列表",
      url: "^https?://www\\.douban\\.com/group/[^/]+/discussion",
      nextLink: ".paginator .next a",
      pageElement: "table.olt tr:not(.th)",
    },
    {
      name: "豆瓣小组 讨论详情",
      url: "^https?://www\\.douban\\.com/group/topic/\\d+",
      nextLink: ".paginator .next a",
      pageElement: "#comments > li",
    },
    {
      name: "豆瓣 通用分页",
      url: "^https?://([^/]+\\.)?douban\\.com/",
      match: ".paginator .next a",
      nextLink: ".paginator .next a",
    },

    // ---------- GitHub（仅服务端渲染的页面；新版 React 页面 HTML 中没有列表 DOM） ----------
    {
      name: "GitHub Issues / PR 列表（经典版）",
      url: "^https://github\\.com/[^/]+/[^/]+/(issues|pulls)",
      match: ".js-navigation-container .js-issue-row",
      nextLink: ".pagination a.next_page, a[rel='next']",
      pageElement: ".js-navigation-container > .js-issue-row",
    },
    {
      name: "GitHub 通用分页",
      url: "^https://github\\.com/",
      match: ".pagination a.next_page",
      nextLink: ".pagination a.next_page",
    },

    // ---------- Stack Overflow 及 Stack Exchange 系 ----------
    {
      name: "Stack Exchange 问题列表",
      url: STACK_EXCHANGE + "/questions(/tagged/[^/?]+)?/?(\\?|$)",
      nextLink: ".s-pagination a[rel='next']",
      pageElement: "#questions > .s-post-summary",
    },
    {
      name: "Stack Exchange 搜索结果",
      url: STACK_EXCHANGE + "/search\\?",
      nextLink: ".s-pagination a[rel='next']",
      pageElement: ".js-search-results .s-post-summary",
    },
    {
      name: "Stack Exchange 回答分页",
      url: STACK_EXCHANGE + "/questions/\\d+",
      match: "#answers .s-pagination a[rel='next']",
      nextLink: "#answers .s-pagination a[rel='next']",
      pageElement: "#answers > .answer",
    },

    // ---------- old.reddit ----------
    {
      name: "old.reddit 列表",
      url: "^https?://old\\.reddit\\.com/",
      nextLink: ".nav-buttons .next-button a",
      pageElement: "#siteTable > .thing",
    },
  ];
})();

# AutoPager 自动分页

[Gitee](https://gitee.com/xuanjinya/chrome-autopager) · [GitHub](https://github.com/xuanjinya168/chrome-autopager) · [MIT License](LICENSE)

Chrome Manifest V3 扩展。滚动接近页面底部时抓取下一页 HTML，把正文拼接到当前页，并插入分页分隔线。

站点适配优先级：用户自定义规则 > 内置规则 > 通用智能识别。

## 安装

1. 打开 `chrome://extensions`
2. 打开右上角「开发者模式」
3. 点击「加载已解压的扩展程序」，选择本目录 `chrome-autopager`

无需构建，直接加载即可。

## 使用

- 打开带分页的论坛或社区页面，滚到接近底部即自动加载下一页
- 点击工具栏图标可查看当前站点状态、暂停/继续、立即加载下一页、对本站禁用
- 快捷键 `Alt+Shift+P` 切换当前站点开关
- 扩展图标徽标显示已拼接的页数
- 右键扩展图标 → 「选项」，管理规则和全局设置

## 内置支持

- **Discuz!**：帖子列表、帖子详情（按页面 DOM 特征识别，不限域名）
- **百度贴吧**：帖子列表、帖子详情（含 bigpipe 注释展开）
- **NGA**：帖子列表、帖子详情（GBK 解码）
- **V2EX**：节点、最近主题、帖子回复
- **豆瓣**：小组讨论列表、讨论详情，以及带 `.paginator` 的通用页
- **GitHub**：经典版 Issues / PR 列表等服务端渲染分页
- **Stack Overflow / Stack Exchange**：问题列表、搜索、回答分页
- **old.reddit.com**

已自带无限滚动的页面会被排除：知乎、新版 Reddit、微博、B 站、YouTube 等。

没有内置规则的普通分页站点，会尝试识别「下一页」链接和重复的正文列表。

## 自定义规则

在选项页新增，或导入 JSON 数组。字段：

| 字段 | 说明 |
|------|------|
| `name` | 规则名称 |
| `url` | 匹配当前地址的正则，可空 |
| `match` | 页面中必须存在的元素（CSS 或 XPath），可空 |
| `nextLink` | 下一页链接（CSS 或 XPath） |
| `pageParam` | 找不到 nextLink 时，递增该查询参数生成下一页 |
| `pageElement` | 要拼接的正文元素；留空则自动识别 |
| `insertBefore` | 插入到该元素之前 |
| `charset` | `auto` / `gbk` / `utf-8` |
| `lazyAttrs` | 懒加载图片属性，如 `data-src`、`file` |
| `unwrapComments` | 展开 `<code><!-- html --></code>`（贴吧） |
| `exclude` | 命中后跳过，不分页 |

`url` 和 `match` 至少填一项。选择器以 `/` 或 `(` 开头时按 XPath 处理。

## 全局设置

- 触发距离：正文底部距视口多少像素时开始加载，默认 1500
- 最大页数：默认 50
- 滚动时同步地址栏
- 黑名单：每行一个域名，`*.example.com` 表示包含子域名

## 目录

```
chrome-autopager/
├── manifest.json
├── background.js
├── popup.html / popup.js / popup.css
├── options.html / options.js / options.css
├── shared/storage.js
├── content/
│   ├── autopager.js
│   ├── detector.js
│   ├── fetcher.js
│   ├── selector.js
│   ├── rules-builtin.js
│   └── ui.css
└── icons/
```

## 权限

- `storage`：保存设置和自定义规则
- `activeTab` / `scripting`：对已打开的标签页补注入脚本
- `<all_urls>`：在各站点抓取下一页（带当前登录态）

拼接时会去掉 `<script>`、内联事件和 `<iframe>`，只插入静态内容。

## 开源协议

本项目采用 [MIT License](LICENSE)。

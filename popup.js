const storage = globalThis.AutoPagerStorage;
const CONTENT_FILES = [
  "shared/storage.js",
  "content/selector.js",
  "content/rules-builtin.js",
  "content/fetcher.js",
  "content/detector.js",
  "content/autopager.js",
];
const SOURCE_LABELS = { custom: "自定义", builtin: "内置", generic: "自动" };

const $ = (id) => document.getElementById(id);
let currentTab = null;

function queryActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab] = []) => resolve(tab || null));
  });
}

function sendMessage(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      resolve(chrome.runtime.lastError ? null : response);
    });
  });
}

function isWebPage(tab) {
  return Boolean(tab && tab.url && /^https?:/.test(tab.url));
}

// 扩展安装前就已打开的标签页没有 content script，需要手动注入
async function ensureContentScript(tabId) {
  const status = await sendMessage(tabId, { type: "getStatus" });
  if (status) return status;
  await chrome.scripting.insertCSS({ target: { tabId }, files: ["content/ui.css"] });
  await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
  await new Promise((resolve) => setTimeout(resolve, 300));
  return sendMessage(tabId, { type: "getStatus" });
}

function render(status, settings) {
  $("globalEnabled").checked = settings.enabled;

  if (!status) {
    $("status").textContent = "此页面不支持";
    $("rule").textContent = "-";
    $("pages").textContent = "-";
    ["pauseBtn", "nextBtn", "siteBtn"].forEach((id) => ($(id).disabled = true));
    return;
  }

  $("status").textContent = status.statusText || "-";
  $("status").title = status.statusText || "";
  $("rule").textContent = status.ruleName
    ? status.ruleName + "（" + (SOURCE_LABELS[status.source] || status.source) + "）"
    : "未匹配";
  $("rule").title = $("rule").textContent;
  $("pages").textContent = status.matched ? status.pageNum + " 页" : "-";

  $("pauseBtn").disabled = !status.active;
  $("pauseBtn").textContent = status.paused ? "继续" : "暂停";
  $("nextBtn").disabled = !status.hasNext || status.loading;
  $("siteBtn").disabled = false;
  $("siteBtn").textContent = status.blocked ? "对本站启用" : "对本站禁用";
}

async function refresh() {
  const settings = await storage.getSettings();
  let status = null;
  if (isWebPage(currentTab)) {
    $("host").textContent = new URL(currentTab.url).hostname;
    status = await ensureContentScript(currentTab.id).catch(() => null);
  } else {
    $("host").textContent = "非网页标签";
  }
  render(status, settings);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

$("globalEnabled").addEventListener("change", async (event) => {
  await storage.saveSettings({ enabled: event.target.checked });
  await delay(200);
  refresh();
});

$("pauseBtn").addEventListener("click", async () => {
  const status = await sendMessage(currentTab.id, { type: "togglePause" });
  render(status, await storage.getSettings());
});

$("nextBtn").addEventListener("click", async () => {
  $("nextBtn").disabled = true;
  $("status").textContent = "正在加载…";
  const status = await sendMessage(currentTab.id, { type: "loadNext" });
  render(status, await storage.getSettings());
});

$("siteBtn").addEventListener("click", async () => {
  await storage.toggleHost(new URL(currentTab.url).hostname);
  await delay(300);
  refresh();
});

$("optionsBtn").addEventListener("click", () => chrome.runtime.openOptionsPage());

queryActiveTab().then((tab) => {
  currentTab = tab;
  refresh();
});

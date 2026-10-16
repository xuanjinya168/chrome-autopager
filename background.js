importScripts("shared/storage.js");

const storage = globalThis.AutoPagerStorage;

function logError(message, error) {
  console.error(message, error && error.message ? error.message : error);
}

function queryActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab] = []) => {
      resolve(tab && tab.id ? tab : null);
    });
  });
}

function setBadge(tabId, text, color) {
  chrome.action.setBadgeText({ tabId, text }).catch(() => {});
  if (color) chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => {});
}

async function toggleActiveSite() {
  const tab = await queryActiveTab();
  if (!tab || !tab.url) return;

  const url = new URL(tab.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  const blocked = await storage.toggleHost(url.hostname);
  setBadge(tab.id, blocked ? "OFF" : "", "#9aa0a6");
}

chrome.runtime.onInstalled.addListener(() => {
  storage
    .getSettings()
    .then((settings) => storage.saveSettings(settings))
    .catch((error) => logError("初始化默认配置失败:", error));
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "toggle-site") return;
  toggleActiveSite().catch((error) => logError("快捷键切换站点失败:", error));
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== "pageCount" || !sender.tab) return;
  const count = Number(message.count) || 0;
  setBadge(sender.tab.id, count > 1 ? String(count) : "", "#3b6cf6");
});

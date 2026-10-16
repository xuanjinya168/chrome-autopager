(function (global) {
  const DEFAULT_SETTINGS = {
    enabled: true,
    triggerDistance: 1500,
    maxPages: 50,
    syncUrl: false,
    blacklist: [],
  };
  const DETECT_CACHE_LIMIT = 200;

  function call(area, method, arg) {
    return new Promise((resolve, reject) => {
      chrome.storage[area][method](arg, (result) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(result || {});
      });
    });
  }

  async function getSettings() {
    const { settings } = await call("sync", "get", "settings");
    return { ...DEFAULT_SETTINGS, ...(settings || {}) };
  }

  async function saveSettings(patch) {
    const next = { ...(await getSettings()), ...patch };
    await call("sync", "set", { settings: next });
    return next;
  }

  async function getCustomRules() {
    const { rulesLocation } = await call("local", "get", "rulesLocation");
    const area = rulesLocation === "local" ? "local" : "sync";
    const { customRules } = await call(area, "get", "customRules");
    return Array.isArray(customRules) ? customRules : [];
  }

  async function saveCustomRules(rules) {
    try {
      await call("sync", "set", { customRules: rules });
      await call("local", "set", { rulesLocation: "sync" });
      await call("local", "remove", "customRules");
      return "sync";
    } catch (error) {
      // chrome.storage.sync 单项上限 8KB，规则表过大时改存 local
      await call("local", "set", { customRules: rules, rulesLocation: "local" });
      await call("sync", "remove", "customRules").catch(() => {});
      return "local";
    }
  }

  async function getDetectCache(key) {
    const { detectCache } = await call("local", "get", "detectCache");
    return (detectCache && detectCache[key]) || null;
  }

  async function setDetectCache(key, value) {
    const { detectCache = {} } = await call("local", "get", "detectCache");
    detectCache[key] = { ...value, time: Date.now() };
    const keys = Object.keys(detectCache);
    if (keys.length > DETECT_CACHE_LIMIT) {
      keys
        .sort((a, b) => detectCache[a].time - detectCache[b].time)
        .slice(0, keys.length - DETECT_CACHE_LIMIT)
        .forEach((oldKey) => delete detectCache[oldKey]);
    }
    await call("local", "set", { detectCache });
  }

  function clearDetectCache() {
    return call("local", "remove", "detectCache");
  }

  function isHostBlocked(host, blacklist) {
    return (blacklist || []).some((raw) => {
      const pattern = String(raw || "").trim().toLowerCase();
      if (!pattern) return false;
      if (pattern.startsWith("*.")) {
        const base = pattern.slice(2);
        return host === base || host.endsWith("." + base);
      }
      return host === pattern;
    });
  }

  async function toggleHost(host) {
    const settings = await getSettings();
    const blacklist = settings.blacklist.filter((item) => item !== host);
    const blocked = blacklist.length === settings.blacklist.length;
    if (blocked) blacklist.push(host);
    await saveSettings({ blacklist });
    return blocked;
  }

  global.AutoPagerStorage = {
    DEFAULT_SETTINGS,
    getSettings,
    saveSettings,
    getCustomRules,
    saveCustomRules,
    getDetectCache,
    setDetectCache,
    clearDetectCache,
    isHostBlocked,
    toggleHost,
  };
})(globalThis);

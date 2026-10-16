const storage = globalThis.AutoPagerStorage;
const builtinRules = (window.AutoPager && window.AutoPager.builtinRules) || [];
const TEXT_FIELDS = ["name", "url", "match", "nextLink", "pageElement", "insertBefore", "pageParam", "charset"];
const BOOL_FIELDS = ["unwrapComments", "exclude"];

const $ = (id) => document.getElementById(id);
let customRules = [];
let editingIndex = -1;

function showMessage(id, text, isError) {
  const el = $(id);
  el.textContent = text;
  el.classList.toggle("error", Boolean(isError));
  if (!isError) setTimeout(() => el.textContent === text && (el.textContent = ""), 3000);
}

function cell(text, className) {
  const td = document.createElement("td");
  td.textContent = text || "-";
  if (className) td.className = className;
  return td;
}

function button(text, onClick, className) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = text;
  btn.className = "small " + (className || "");
  btn.addEventListener("click", onClick);
  return btn;
}

function emptyRow(colspan, text) {
  const tr = document.createElement("tr");
  const td = cell(text, "empty");
  td.colSpan = colspan;
  tr.appendChild(td);
  return tr;
}

function nameCell(rule) {
  const td = cell(rule.name);
  if (rule.exclude) {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = "排除";
    td.appendChild(tag);
  }
  return td;
}

function urlText(rule) {
  return [rule.url || "（任意页面）", rule.match ? "match: " + rule.match : ""].filter(Boolean).join("\n");
}

// ---------- 全局设置 ----------

async function loadSettings() {
  const settings = await storage.getSettings();
  const form = $("settingsForm");
  form.enabled.checked = settings.enabled;
  form.syncUrl.checked = settings.syncUrl;
  form.triggerDistance.value = settings.triggerDistance;
  form.maxPages.value = settings.maxPages;
  form.blacklist.value = settings.blacklist.join("\n");
}

$("settingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  await storage.saveSettings({
    enabled: form.enabled.checked,
    syncUrl: form.syncUrl.checked,
    triggerDistance: Math.max(100, Number(form.triggerDistance.value) || 1500),
    maxPages: Math.max(2, Number(form.maxPages.value) || 50),
    blacklist: form.blacklist.value
      .split(/\s+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  });
  showMessage("settingsMsg", "设置已保存");
});

$("clearCacheBtn").addEventListener("click", async () => {
  await storage.clearDetectCache();
  showMessage("settingsMsg", "通用识别缓存已清除");
});

// ---------- 自定义规则 ----------

async function persistRules(message) {
  const area = await storage.saveCustomRules(customRules);
  renderCustomRules();
  showMessage(
    "rulesMsg",
    message + (area === "local" ? "（规则较大，已改存本地，不参与账号同步）" : ""),
  );
}

function renderCustomRules() {
  const tbody = $("customRules");
  tbody.replaceChildren();
  if (!customRules.length) {
    tbody.appendChild(emptyRow(5, "暂无自定义规则"));
    return;
  }

  customRules.forEach((rule, index) => {
    const tr = document.createElement("tr");

    const toggleTd = document.createElement("td");
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = rule.enabled !== false;
    toggle.addEventListener("change", () => {
      customRules[index] = { ...rule, enabled: toggle.checked };
      persistRules(toggle.checked ? "规则已启用" : "规则已停用");
    });
    toggleTd.appendChild(toggle);

    const ops = document.createElement("td");
    ops.className = "ops";
    ops.append(
      button("上移", () => moveRule(index, -1)),
      button("下移", () => moveRule(index, 1)),
      button("编辑", () => openDialog(rule, index)),
      button("删除", () => deleteRule(index), "danger"),
    );

    tr.append(toggleTd, nameCell(rule), cell(urlText(rule), "code"), cell(rule.pageElement, "code"), ops);
    tbody.appendChild(tr);
  });
}

function moveRule(index, offset) {
  const target = index + offset;
  if (target < 0 || target >= customRules.length) return;
  [customRules[index], customRules[target]] = [customRules[target], customRules[index]];
  persistRules("顺序已调整");
}

function deleteRule(index) {
  if (!confirm("确定删除规则「" + customRules[index].name + "」？")) return;
  customRules.splice(index, 1);
  persistRules("规则已删除");
}

function openDialog(rule, index) {
  editingIndex = index;
  const form = $("ruleForm");
  form.reset();
  $("ruleDialogTitle").textContent = index >= 0 ? "编辑规则" : "新增规则";
  TEXT_FIELDS.forEach((field) => (form[field].value = rule[field] || ""));
  BOOL_FIELDS.forEach((field) => (form[field].checked = Boolean(rule[field])));
  form.pageStep.value = rule.pageStep || "";
  form.lazyAttrs.value = (rule.lazyAttrs || []).join(", ");
  $("ruleDialog").showModal();
}

function readRuleForm(form) {
  const rule = {};
  TEXT_FIELDS.forEach((field) => {
    const value = form[field].value.trim();
    if (value) rule[field] = value;
  });
  BOOL_FIELDS.forEach((field) => {
    if (form[field].checked) rule[field] = true;
  });
  const step = Number(form.pageStep.value);
  if (step > 1) rule.pageStep = step;
  const lazyAttrs = form.lazyAttrs.value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (lazyAttrs.length) rule.lazyAttrs = lazyAttrs;
  rule.enabled = editingIndex >= 0 ? customRules[editingIndex].enabled !== false : true;
  return rule;
}

function validateRule(rule) {
  if (!rule.name) return "规则名称不能为空";
  if (rule.url) {
    try {
      new RegExp(rule.url);
    } catch (error) {
      return "URL 正则无效：" + error.message;
    }
  }
  if (!rule.url && !rule.match) return "URL 正则和匹配特征至少填写一项，避免规则匹配所有页面";
  return "";
}

$("ruleForm").addEventListener("submit", (event) => {
  if (event.submitter && event.submitter.value === "cancel") return;
  const rule = readRuleForm(event.target);
  const error = validateRule(rule);
  if (error) {
    event.preventDefault();
    alert(error);
    return;
  }
  if (editingIndex >= 0) customRules[editingIndex] = rule;
  else customRules.unshift(rule);
  persistRules(editingIndex >= 0 ? "规则已更新" : "规则已添加");
});

$("addRuleBtn").addEventListener("click", () => openDialog({}, -1));

// ---------- 导入导出 ----------

function normalizeImported(data) {
  const list = Array.isArray(data) ? data : data && Array.isArray(data.rules) ? data.rules : null;
  if (!list) throw new Error("JSON 必须是规则数组，或包含 rules 数组的对象");
  return list.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error("第 " + (index + 1) + " 条不是对象");
    const rule = { ...item, name: item.name || "导入规则 " + (index + 1) };
    const error = validateRule(rule);
    if (error) throw new Error("第 " + (index + 1) + " 条：" + error);
    return rule;
  });
}

function importRules(text, replace) {
  try {
    const rules = normalizeImported(JSON.parse(text));
    customRules = replace ? rules : rules.concat(customRules);
    persistRules("已导入 " + rules.length + " 条规则");
    return true;
  } catch (error) {
    showMessage("rulesMsg", "导入失败：" + error.message, true);
    return false;
  }
}

$("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(customRules, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "autopager-rules.json";
  link.click();
  URL.revokeObjectURL(link.href);
});

$("importBtn").addEventListener("click", () => $("importFile").click());

$("importFile").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (file) importRules(await file.text(), false);
  event.target.value = "";
});

$("importTextBtn").addEventListener("click", () => {
  if (importRules($("importText").value, false)) $("importText").value = "";
});

$("replaceTextBtn").addEventListener("click", () => {
  if (!confirm("覆盖导入会替换全部自定义规则，确定继续？")) return;
  if (importRules($("importText").value, true)) $("importText").value = "";
});

// ---------- 内置规则 ----------

function renderBuiltinRules() {
  const tbody = $("builtinRules");
  tbody.replaceChildren();
  if (!builtinRules.length) {
    tbody.appendChild(emptyRow(4, "未加载到内置规则"));
    return;
  }
  builtinRules.forEach((rule) => {
    const tr = document.createElement("tr");
    const ops = document.createElement("td");
    ops.className = "ops";
    ops.appendChild(button("复制为自定义", () => openDialog({ ...rule, name: rule.name + "（副本）" }, -1)));
    tr.append(nameCell(rule), cell(urlText(rule), "code"), cell(rule.exclude ? "-" : rule.pageElement || "（自动识别）", "code"), ops);
    tbody.appendChild(tr);
  });
}

(async function init() {
  await loadSettings();
  customRules = await storage.getCustomRules();
  renderCustomRules();
  renderBuiltinRules();
})();

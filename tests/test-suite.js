/**
 * Raycast 汉化脚本分层测试套件
 *
 *   npm test            # 全部
 *   node test-suite.js L3         # 只跑某一层（L1..L9）
 *   RC_SRC=/tmp/mut.js npm test   # 对副本做变异测试
 *
 * 设计原则：
 *   1. 从「纯函数」到「端到端门控」逐层加码，失败时能立刻定位是哪一层坏了；
 *   2. 断言驱动，不靠人眼看输出；任一断言失败 → 退出码 1；
 *   3. 词典一律通过运行时 __rcZhLookup 验证，不比对 JS 源码文本
 *      （源码里的 \" 转义会让「看起来缺失」变成假警报）；
 *   4. 真实语料做覆盖率硬闸门，防止词典合并事故悄悄回退。
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

const { resolve } = require("../scripts/lib/raycast.js");

const SRC = process.env.RC_SRC || path.join(__dirname, "..", "dist", "raycast-zh.js");
const RC = resolve();
const APP = RC.app;
const FE = RC.frontend;

const ONLY = (process.argv[2] || "").toUpperCase();
const started = Date.now();

let pass = 0, fail = 0, skip = 0;
let current = "";
const failures = [];

function group(name) {
  current = name.split("·")[0].trim();
  console.log("\n" + "━".repeat(66));
  console.log(" " + name);
  console.log("━".repeat(66));
}
function enabled(code) {
  return !ONLY || ONLY === code;
}
function ok(cond, label, detail) {
  if (cond) { pass++; console.log("  ✓ " + label); return true; }
  fail++;
  const line = `[${current}] ${label}${detail ? "  → " + detail : ""}`;
  failures.push(line);
  console.log("  ✗ " + label + (detail ? "\n      " + detail : ""));
  return false;
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  return ok(a === e, label, a === e ? "" : `期望 ${e}，实际 ${a}`);
}
function skipped(label, why) {
  skip++;
  console.log("  ○ " + label + "（跳过：" + why + "）");
}

/* ────────────────────────── 最小 DOM 桩 ────────────────────────── */

function Txt(v) {
  return { nodeType: 3, nodeValue: v, parentElement: null };
}
function El(tag, attrs) {
  const o = {
    nodeType: 1,
    tagName: tag,
    childNodes: [],
    _attrs: Object.assign({}, attrs || {}),
    isContentEditable: false,
    getAttribute(n) { return this._attrs[n] === undefined ? null : this._attrs[n]; },
    setAttribute(n, v) { this._attrs[n] = v; },
    append(...kids) {
      for (const k of kids) { k.parentElement = o; o.childNodes.push(k); }
      return o;
    },
    get textContent() {
      return o.childNodes.map(c => c.nodeType === 3 ? c.nodeValue : (c && c.textContent) || "").join("");
    }
  };
  return o;
}
function Frag(kids) {
  const f = { nodeType: 11, childNodes: [] };
  for (const k of kids) { k.parentElement = f; f.childNodes.push(k); }
  return f;
}

function makeEnv(opts) {
  opts = opts || {};
  const body = El("BODY");
  const html = El("HTML");
  html.append(body);

  const doc = {
    readyState: "complete",
    title: opts.title || "",
    body,
    documentElement: html,
    activeElement: null,
    _on: {},
    addEventListener(type, fn) { (this._on[type] = this._on[type] || []).push(fn); },
    dispatch(type, ev) { (this._on[type] || []).forEach(fn => fn(ev)); },
    createElement(tag) { return El(String(tag).toUpperCase()); }
  };

  const ctx = {
    document: doc,
    MutationObserver: function () { this.observe = function () {}; this.disconnect = function () {}; },
    console
  };
  vm.createContext(ctx);

  if (opts.window) {
    // 让 window 就是 globalThis，这样 __rcZh* 仍然挂在全局，同时 patchIPC 能拿到
    // window.webkit.messageHandlers 走 postMessage 兜底分支。
    vm.runInContext("var window = globalThis; globalThis.__sent = [];", ctx);
    vm.runInContext(
      "window.webkit = { messageHandlers: { ipcRequest: { postMessage: function (m) { globalThis.__sent.push(m); } } } };",
      ctx
    );
  }
  if (opts.build) opts.build(body, html);
  vm.runInContext(fs.readFileSync(SRC, "utf8"), ctx);

  return {
    ctx, doc, body,
    run: (code) => vm.runInContext(code, ctx),
    el: El, txt: Txt, frag: Frag
  };
}

/* ══════════════════════════ L1 词典与规则 ══════════════════════════ */

if (enabled("L1")) {
  group("L1 · 词典与动态规则（最基础，纯函数）");
  const env = makeEnv({ title: "Settings" });
  const L = (s) => env.run(`__rcZhLookup(${JSON.stringify(s)})`);

  eq(L("Cancel"), "取消", "精确命中：Cancel → 取消");
  eq(L("Settings"), "设置", "精确命中：Settings → 设置");
  eq(L("  Cancel  "), "  取消  ", "保留首尾空白，不破坏排版");
  eq(L("my-video-file.mkv"), null, "文件名不翻译（防误伤数据）");
  eq(L("x".repeat(121)), null, "超过 120 字符不处理（防误伤长文本）");
  eq(L("取消"), null, "已是中文则返回 null（重复执行安全）");

  eq(L("Force Quit Safari"), "强制退出 Safari", "规则顺序：Force Quit 先于 Quit");
  eq(L("Quit Safari"), "退出 Safari", "动词翻译、应用名保留");
  eq(L("Uninstall Slack"), "卸载 Slack", "Uninstall 规则");
  eq(L("Show report.pdf in Finder"), "在访达中显示 report.pdf", "Show … in Finder");
  eq(L("Copy /tmp/a Path"), "拷贝 /tmp/a 路径", "Copy … Path");
  eq(L("Open Privacy Settings"), "打开 Privacy 设置", "Open … Settings");

  eq(L("12 Applications"), "12 个应用程序", "数字 + 复数名词自动补量词");
  eq(L("1 Application"), "1 个应用程序", "单数同样成立");
  eq(L("3 results"), "3 个结果", "规则：结果计数");
  eq(L("Suggestions (2)"), "建议（2）", "规则：建议计数");
  eq(L('Use "Calculator" with…'), "用「Calculator」进行…", "规则：Use … with…");

  ok(L("Settings").indexOf("设") !== -1, "译文确实是中文（不是原文回显）");
}

/* ══════════════════════════ L2 DOM 覆盖层 ══════════════════════════ */

if (enabled("L2")) {
  group("L2 · DOM 覆盖层（真实渲染路径）");
  const fx = {};
  const env = makeEnv({
    title: "Settings",
    build: (body) => {
      const add = (key, tag, text, attrs) => {
        const e = El(tag, attrs);
        if (text != null) e.append(Txt(text));
        body.append(e);
        fx[key] = e;
        return e;
      };
      add("plain", "SPAN", "Cancel");
      add("attr", "INPUT", null, { placeholder: "Search settings", title: "Settings", "aria-label": "Save" });

      // React 高亮把一句标题拆成多个文本节点
      const split = El("SPAN");
      split.append(Txt("Applica"), Txt("tion"));
      body.append(split); fx.split = split;

      add("count", "SPAN", "12 Applications");
      add("code", "CODE", "Cancel");
      add("pre", "PRE", "Cancel");

      const ta = El("TEXTAREA", { placeholder: "Add Placeholder" });
      ta.append(Txt("Cancel"));
      body.append(ta); fx.ta = ta;

      // 可编辑区域：单节点 + 拆分节点各一例。
      // 拆分那个必须用「拼起来正好是词条」的文本（Can|cel），
      // 否则即使守卫失效也翻不出来，测不出问题。
      const editable = El("DIV");
      editable.isContentEditable = true;
      editable.append(Txt("Can"), Txt("cel"));
      body.append(editable); fx.editable = editable;

      const editable1 = El("DIV");
      editable1.isContentEditable = true;
      editable1.append(Txt("Cancel"));
      body.append(editable1); fx.editable1 = editable1;

      // 深层嵌套
      const outer = El("DIV"), mid = El("DIV"), inner = El("SPAN");
      inner.append(Txt("Save"));
      mid.append(inner); outer.append(mid); body.append(outer); fx.deep = inner;

      // shadow DOM
      const host = El("DIV");
      const shadowSpan = El("SPAN");
      shadowSpan.append(Txt("Quit Slack"));
      host.shadowRoot = Frag([shadowSpan]);
      body.append(host); fx.shadow = shadowSpan;

      // iframe
      const frame = El("IFRAME");
      const fbody = El("BODY"), fspan = El("SPAN");
      fspan.append(Txt("Settings"));
      fbody.append(fspan);
      frame.contentDocument = {
        body: fbody, head: El("HEAD"), documentElement: fbody,
        createElement: (t) => El(String(t).toUpperCase())
      };
      body.append(frame); fx.frame = fspan;
    }
  });

  eq(env.doc.title, "设置", "document.title 也被翻译");
  eq(fx.plain.textContent, "取消", "普通文本节点");
  eq(fx.attr._attrs.placeholder, "搜索设置", "placeholder 属性");
  eq(fx.attr._attrs.title, "设置", "title 属性");
  eq(fx.attr._attrs["aria-label"], "保存", "aria-label 属性（无障碍）");
  eq(fx.split.textContent, "应用程序", "拆分文本节点整段还原");
  eq(fx.count.textContent, "12 个应用程序", "数字 + 名词拼接标题");
  eq(fx.code.textContent, "Cancel", "CODE 内不翻译（示例代码）");
  eq(fx.pre.textContent, "Cancel", "PRE 内不翻译");
  eq(fx.ta.textContent, "Cancel", "输入框内容不被改写（用户数据）");
  eq(fx.ta._attrs.placeholder, "添加占位符", "但输入框 placeholder 要翻译");
  eq(fx.editable.textContent, "Cancel", "可编辑区域拆分节点也不碰（整段回写会擦掉用户输入）");
  eq(fx.editable1.textContent, "Cancel", "可编辑区域单节点不碰");
  eq(fx.deep.textContent, "保存", "深层嵌套节点可达");
  eq(fx.shadow.textContent, "退出 Slack", "shadow DOM 内部可达");
  eq(fx.frame.textContent, "设置", "iframe 内部可达");

  // 幂等：轮询兜底每 700ms 重扫一次，重复执行必须无副作用
  const before = [fx.plain, fx.split, fx.count, fx.deep].map(e => e.textContent).join("|");
  env.run("__rcZhApply(); __rcZhApply(); __rcZhApply();");
  const after = [fx.plain, fx.split, fx.count, fx.deep].map(e => e.textContent).join("|");
  eq(after, before, "重复扫描幂等（轮询不会越翻越乱）");
}

/* ══════════════════════════ L3 查询翻译 ══════════════════════════ */

if (enabled("L3")) {
  group("L3 · 中文查询 → 英文查询词");
  const env = makeEnv();
  const tr = (s) => env.run(`__rcZhTranslate(${JSON.stringify(s)})`);

  eq(tr("剪贴"), "Clipboard History", "人工映射：剪贴");
  eq(tr("专注"), "Focus", "人工映射：专注（该词条不在词典里）");
  eq(tr("设置"), "Settings", "人工映射：设置");
  eq(tr("系统设置"), "System Settings", "人工映射：系统设置");

  eq(tr("Clipboard"), null, "英文查询不改写");
  eq(tr(""), null, "空查询不改写");
  eq(tr("   "), null, "纯空白不改写");

  eq(tr("剪贴 历史"), "Clipboard History", "多词查询去重，不产生 History History");
  ok(!/History\s+History/.test(tr("剪贴 历史") || ""), "去重断言（重复词检查）");
  eq(tr("设置 咕咕咕"), "Settings", "译不出的词被丢弃，不连累能命中的部分");

  const prefix = tr("屏幕");
  ok(typeof prefix === "string" && /^[\x20-\x7E]+$/.test(prefix),
    "前缀匹配：只打出半个词也能落到英文", "实际 " + JSON.stringify(prefix));

  const single = tr("设");
  ok(typeof single === "string" && /^[\x20-\x7E]+$/.test(single),
    "单字查询有兜底（不返回中文原样）", "实际 " + JSON.stringify(single));

  const en2zhBefore = env.run("__rcZhState().en2zh");
  tr("剪贴");
  const en2zhAfter = env.run("__rcZhState().en2zh");
  eq(en2zhAfter, en2zhBefore, "重复查询命中缓存，不重复膨胀映射表");

  ok(env.run("__rcZhAliasCount") >= 150, "人工映射表规模合理", "实际 " + env.run("__rcZhAliasCount"));
}

/* ══════════════════════════ L4 IPC 去程 ══════════════════════════ */

if (enabled("L4")) {
  group("L4 · IPC 去程：改写发往原生的 term");
  const env = makeEnv();
  const ser = (js) => env.run(`JSON.stringify(${js})`);

  ok(ser('{term:"剪贴", knownSnapshot:{sessionId:"x"}}').indexOf("Clipboard History") !== -1,
    "去程改写：剪贴 → Clipboard History");
  eq(env.run("__rcZhState().lastZh"), "剪贴", "记住这次发出去的中文查询");

  eq(env.run('(function(){var o={term:"剪贴"};JSON.stringify(o);return o.term;})()'), "剪贴",
    "不污染原对象（否则输入框会当场变英文）");

  ok(ser('{term:"Settings"}').indexOf('"Settings"') !== -1, "英文查询原样发出");
  eq(env.run("__rcZhState().lastZh"), "", "英文查询清空在飞状态（否则回程串味）");

  eq(ser('{term:""}'), '{"term":""}', "空 term 原样");
  eq(ser('{title:"剪贴"}'), '{"title":"剪贴"}', "没有 term 字段的对象不受影响");

  ok(ser('{term:"剪贴",a:1,b:2}').indexOf("Clipboard") !== -1, "3 个自有键的搜索参数仍然改写");
  ok(ser('{term:"剪贴",a:1,b:2,c:3}').indexOf("剪贴") !== -1, "4 个键的对象不改写（防篡改用户数据）");

  eq(ser('{term:"剪贴",a:1,b:2,c:3}'), '{"term":"剪贴","a":1,"b":2,"c":3}', "不改写时序列化结果完全不变");

  eq(env.run('(function(){var p={toJSON:function(){return {term:"FROM_TOJSON"}}};var o=Object.create(p);o.term="剪贴";return JSON.stringify(o);})()'),
    '{"term":"FROM_TOJSON"}', "保留原型上的 toJSON（序列化语义不变）");

  ok(ser('{params:{term:"剪贴"}}').indexOf("剪贴") !== -1, "嵌套 term 不改写（只认搜索参数形态）");
}

if (enabled("L4B")) {
  group("L4B · IPC 兜底：postMessage 入口");
  const env = makeEnv({ window: true });
  env.run(`window.webkit.messageHandlers.ipcRequest.postMessage({ method: "rootSearch.search", data: '{"term":"专注"}' })`);
  const got = env.run("__sent.length");
  eq(got, 1, "postMessage 被调用一次");
  const data = env.run("__sent[0].data");
  ok(String(data).indexOf("Focus") !== -1, "绕过 JSON.stringify 的中文 term 也会被兜底改写", String(data));
  eq(env.run("__rcZhState().lastZh"), "专注", "兜底路径同样记录在飞查询（且顺序正确）");

  env.run(`window.webkit.messageHandlers.ipcRequest.postMessage({ method: "other.method", data: '{"term":"专注"}' })`);
  eq(env.run("__sent[1].data"), '{"term":"专注"}', "非搜索方法不碰");
}

/* ══════════════════════════ L5 IPC 回程 ══════════════════════════ */

if (enabled("L5")) {
  group("L5 · IPC 回程：还原 term（决定回车是否可用）");
  const env = makeEnv();
  const parseTerm = (json) => env.run(`JSON.parse(${JSON.stringify(json)}).term`);
  const parseSnapTerm = (json) => env.run(`JSON.parse(${JSON.stringify(json)}).snapshot.term`);

  env.run(`JSON.stringify({term:"设置"})`);
  eq(parseSnapTerm('{"type":"snapshot","snapshot":{"term":"Settings","sections":[]}}'), "设置",
    "回程还原：Settings → 设置");

  env.run(`JSON.stringify({term:"截图"})`);
  eq(parseTerm('{"term":"Screenshot"}'), "截图", "另一条回程同样还原");

  eq(parseTerm('{"term":"Unrelated English"}'), "Unrelated English", "没翻译过的英文 term 保持原样");

  // activeElement 优先：同一个英文对应多个中文时，应还原成用户此刻真正打的词
  env.doc.activeElement = { tagName: "INPUT", value: "剪贴板" };
  env.run(`JSON.stringify({term:"剪贴"})`);
  eq(parseTerm('{"term":"Clipboard History"}'), "剪贴板", "输入框内容优先于历史映射");

  // 数组 / 深层嵌套
  env.run(`JSON.stringify({term:"窗口"})`);
  eq(env.run(`JSON.parse('{"items":[{"term":"Window Management"}]}').items[0].term`), "窗口",
    "数组里的 term 也能还原");
  eq(env.run(`JSON.parse('{"a":{"b":{"term":"Window Management"}}}').a.b.term`), "窗口",
    "深层嵌套的 term 也能还原");

  // 关键回归：英文搜索期间绝不能被历史映射改成中文
  env.doc.activeElement = { tagName: "INPUT", value: "Settings" };
  env.run(`JSON.stringify({term:"Settings"})`);
  eq(env.run("__rcZhState().lastZh"), "", "英文查询清空在飞状态");
  eq(parseTerm('{"term":"Clipboard History"}'), "Clipboard History",
    "英文搜索时即使表里有映射也不还原（否则回车再次失效）");

  eq(env.run(`JSON.parse('{"x":1}').x`), 1, "没有 term 的报文正常解析");
  eq(env.run(`JSON.parse('123')`), 123, "非对象报文正常解析");
}

/* ══════════════════════════ L6 字符串桥 ══════════════════════════ */

if (enabled("L6")) {
  group("L6 · 字符串桥（设置窗口的子串匹配）");
  const env = makeEnv();
  const probe = (hay, needle, method) => env.run(`(function(){
    __rcZhBridgeOn(false);
    var off = (${JSON.stringify(hay)}).${method}(${JSON.stringify(needle)});
    __rcZhBridgeOn(true);
    var on = (${JSON.stringify(hay)}).${method}(${JSON.stringify(needle)});
    return [off, on];
  })()`);

  let r = probe("Clipboard History", "剪贴", "indexOf");
  eq(r[0], -1, "桥关闭时中文查不到英文（基线）");
  eq(r[1], 0, "桥开启后：剪贴 命中 Clipboard History");

  r = probe("Open Settings", "设置", "indexOf");
  eq(r[1], 5, "返回真实位置而不是布尔值（高亮依赖这个偏移）");

  r = probe("Window Management", "窗口", "indexOf");
  eq(r[1], 0, "窗口 → Window Management");

  r = probe("Focus", "专注", "indexOf");
  eq(r[1], 0, "专注 命中（ALIAS 已并入反查表）");

  eq(probe("Clipboard History", "剪贴", "includes")[1], true, "includes 同样生效");
  eq(probe("Settings", "设置", "startsWith")[1], true, "startsWith 同样生效");

  eq(probe("Clipboard History", "clip", "indexOf")[1], -1, "英文查询保持原生大小写语义（不越权）");
  eq(probe("Settings", "设", "indexOf")[1], -1, "单字不做桥接（太容易误命中）");
  eq(probe("剪贴板", "设置", "indexOf")[1], -1, "原值本身是中文时不桥接");

  // input 事件自动开关
  env.doc.dispatch("input", { target: { tagName: "INPUT", value: "设置" } });
  eq(env.run("__rcZhState().bridgeOn"), true, "输入中文后桥自动开启");
  env.doc.dispatch("input", { target: { tagName: "INPUT", value: "Settings" } });
  eq(env.run("__rcZhState().bridgeOn"), false, "输入英文后桥自动关闭（不干扰 AI 对话等场景）");
  env.doc.dispatch("input", { target: { isContentEditable: true, textContent: "剪贴" } });
  eq(env.run("__rcZhState().bridgeOn"), true, "contentEditable 输入框同样识别");
}

/* ══════════════════════════ L7 端到端 ══════════════════════════ */

if (enabled("L7")) {
  group("L7 · 端到端：模拟一次真实搜索的完整闭环");
  const env = makeEnv();

  // 中文场景
  env.doc.activeElement = { tagName: "INPUT", value: "设置" };
  const outbound = env.run(`JSON.stringify({term: document.activeElement.value, knownSnapshot: undefined})`);
  ok(outbound.indexOf("Settings") !== -1, "① 发往原生的 term 变成英文", outbound);
  const inflight = env.run("__rcZhState().lastZh");
  const returned = env.run(`JSON.parse('{"type":"snapshot","snapshot":{"term":"Settings","sections":[]}}').snapshot.term`);
  eq(returned, "设置", "② 回程 term 还原成中文");
  eq(inflight, returned, "③ 门控 t.current === a.term 成立 → 回车不再被吞");
  eq(returned, env.doc.activeElement.value, "④ 与输入框显示值完全一致（不会出现英文回填）");

  // 多词场景
  env.doc.activeElement = { tagName: "INPUT", value: "剪贴 历史" };
  env.run(`JSON.stringify({term: document.activeElement.value})`);
  const r2 = env.run(`JSON.parse('{"snapshot":{"term":"Clipboard History"}}').snapshot.term`);
  eq(r2, "剪贴 历史", "多词中文查询同样闭环（空格也原样还原）");

  // 英文场景（不能被中文逻辑干扰）
  env.doc.activeElement = { tagName: "INPUT", value: "Clipboard" };
  const enOut = env.run(`JSON.stringify({term: document.activeElement.value})`);
  eq(enOut, '{"term":"Clipboard"}', "英文查询原样发出");
  const enBack = env.run(`JSON.parse('{"snapshot":{"term":"Clipboard"}}').snapshot.term`);
  eq(enBack, "Clipboard", "英文回程原样返回");
  eq(enBack, env.doc.activeElement.value, "英文场景门控同样成立");
}

/* ══════════════════════════ L8 真实语料 ══════════════════════════ */

if (enabled("L8")) {
  group("L8 · 真实语料覆盖（硬闸门）");

  const FIELDS = "(?:title|description|label|placeholder|subtitle|heading|caption|tooltip|emptyStateText)";
  const PATTERNS = [
    new RegExp(FIELDS + "\\s*:\\s*`([^`\\\\]{3,220})`", "g"),
    new RegExp(FIELDS + '\\s*:\\s*"([^"\\\\]{3,220})"', "g"),
    new RegExp(FIELDS + "\\s*:\\s*'([^'\\\\]{3,220})'", "g")
  ];
  const ENGLISH = /^[A-Za-z][A-Za-z0-9 '’\-.,:!?&/()%+#@"]*$/;

  function extract(files, maxLen) {
    const set = new Set();
    for (const f of files) {
      const s = fs.readFileSync(f, "utf8");
      for (const p of PATTERNS) {
        p.lastIndex = 0;
        let m;
        while ((m = p.exec(s))) {
          const v = m[1].trim();
          if (v.length < 3 || v.length > 220) continue;
          if (!ENGLISH.test(v)) continue;
          if (maxLen && v.length > maxLen) continue;
          set.add(v);
        }
      }
    }
    return Array.from(set);
  }

  if (!FE || !fs.existsSync(FE)) {
    skipped("语料覆盖检查", "未能定位 Raycast 前端目录");
  } else {
      const env = makeEnv();
      const lookupAll = (list) => env.run(
        `(function(list){var out=[];for(var i=0;i<list.length;i++)out.push(__rcZhLookup(list[i]));return out;})(${JSON.stringify(list)})`
      );

      const settingsFiles = fs.readdirSync(FE).filter(f => /settings-page-definition.*\.js$/.test(f)).map(f => path.join(FE, f));
      const settingsVals = extract(settingsFiles, 120);
      const settingsRes = lookupAll(settingsVals);
      const settingsMiss = settingsVals.filter((v, i) => settingsRes[i] === null);

      ok(settingsVals.length > 200, "设置页语料规模正常", settingsVals.length + " 条");
      ok(settingsMiss.length === 0, "设置页语料 100% 命中（词典合并的回归闸门）",
        settingsMiss.length ? settingsMiss.length + " 条缺失，例如：" + JSON.stringify(settingsMiss.slice(0, 3)) : "");

      // 设置窗口自 2.9 起是独立页面（settings-window.html + 自己的 JS 入口），
      // 文案不在 settings-page-definition 里。上面的检查过不了这一关：
      // 词典齐全但页面没被注入，用户看到的仍然是全英文设置界面。
      const winFiles = fs.readdirSync(FE).filter(f => /^settings-window-.*\.js$/.test(f)).map(f => path.join(FE, f));
      const winVals = extract(winFiles, 120);
      const winRes = lookupAll(winVals);
      const winMiss = winVals.filter((v, i) => winRes[i] === null);
      ok(winVals.length > 40, "设置窗口（独立页面）语料规模正常", winVals.length + " 条");
      ok(winMiss.length === 0, "设置窗口语料 100% 命中（否则设置页会留英文）",
        winMiss.length ? winMiss.length + " 条缺失，例如：" + JSON.stringify(winMiss.slice(0, 3)) : "");

      // 全量语料：只做「不低于基线」的防退化检查。
      // 2.9.0 起已补齐；剩余为开发者预览占位文案、文件名与链接，不该进词典。
      const allFiles = fs.readdirSync(FE).filter(f => /\.js$/.test(f)).map(f => path.join(FE, f));
      const allVals = extract(allFiles, 120);
      const allRes = lookupAll(allVals);
      const allMiss = allVals.filter((v, i) => allRes[i] === null);
      const cov = (allVals.length - allMiss.length) / Math.max(1, allVals.length);
      const pct = (cov * 100).toFixed(2);

      ok(cov >= 0.98, "全量语料覆盖率不低于基线 98%", pct + "%（" + allMiss.length + "/" + allVals.length + " 未译）");
      console.log("      ℹ 全量覆盖率 " + pct + "%（统计口径：title/description/label 等 UI 字段，≤120 字符）");
    }
  }

  /* ══════════════════════════ L9 部署一致性 ══════════════════════════ */

  if (enabled("L9")) {
    group("L9 · 部署一致性（测的就是在跑的）");
    const deployed = FE ? path.join(FE, "raycast-zh.js") : "";
    if (!FE) {
      skipped("部署一致性", "未能定位 Raycast 前端目录");
    } else if (process.env.RC_SRC) {
      skipped("部署一致性", "当前测的是变体文件（RC_SRC）");
    } else if (!fs.existsSync(deployed)) {
      skipped("部署一致性", "未部署到 Raycast 应用目录");
    } else {
      const md5 = (p) => crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex");
      const a = md5(SRC), b = md5(deployed);
      eq(b, a, "应用目录里的脚本与源文件字节一致");
      ok(fs.statSync(deployed).size > 100000, "部署文件大小合理", fs.statSync(deployed).size + " 字节");
    }
  }

  /* ══════════════════════ L10 多窗口安装闭环 ══════════════════════ */

  if (enabled("L10")) {
    group("L10 · 多窗口安装闭环（造一个假 Raycast，真跑脚本）");

    if (process.platform !== "darwin") {
      skipped("多窗口安装闭环", "install.sh 只在 macOS 上执行");
    } else {

    const os = require("os");
    const { execFileSync } = require("child_process");
    const ROOT_DIR = path.join(__dirname, "..");

    // 假 app：结构照抄真实 Raycast，只是页面内容换成占位符。
    // 这里刻意放三个窗口——旧版脚本只会注入 main-window，
    // 这条用例就是那次「设置窗口全英文」事故的复现装置。
    const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "rc-zh-"));
    const APP_DIR = path.join(TMP, "Raycast.app");
    const FE_DIR = path.join(APP_DIR, "Contents", "Resources", "macos-app_Test.bundle", "Contents", "Resources", "frontend");
    const HOME_DIR = path.join(TMP, "home");
    fs.mkdirSync(FE_DIR, { recursive: true });
    fs.mkdirSync(HOME_DIR, { recursive: true });

    fs.writeFileSync(path.join(APP_DIR, "Contents", "Info.plist"), [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0"><dict>',
      '<key>CFBundleShortVersionString</key><string>9.9.9-test</string>',
      '</dict></plist>'
    ].join("\n"));

    const PAGE_NAMES = ["main-window.html", "settings-window.html", "notes-window.html"];
    const page = (label) => `<!doctype html>\n<html><head><title>Raycast</title></head>\n<body><div>${label}</div></body>\n</html>\n`;
    for (const n of PAGE_NAMES) fs.writeFileSync(path.join(FE_DIR, n), page(n));
    // 没有 </body> 的文件不该被动：注入点不存在，硬插会破坏它。
    fs.writeFileSync(path.join(FE_DIR, "auxiliary-prewarm.html"), "<html><head></head></html>\n");

    const readPage = (n) => fs.readFileSync(path.join(FE_DIR, n), "utf8");
    const countOf = (s, sub) => s.split(sub).length - 1;
    const runScript = (name, extra) => execFileSync("/bin/bash", [path.join(ROOT_DIR, "scripts", name), "--no-restart", "--app", APP_DIR].concat(extra || []), {
      encoding: "utf8",
      env: Object.assign({}, process.env, { HOME: HOME_DIR }),
      stdio: ["ignore", "pipe", "pipe"]
    });

    let installOut = "";
    try {
      installOut = runScript("install.sh");
      ok(true, "install.sh 在假 app 上执行成功");
    } catch (e) {
      ok(false, "install.sh 在假 app 上执行成功", String(e.stderr || e.message).slice(0, 300));
    }

    for (const n of PAGE_NAMES) {
      const html = readPage(n);
      ok(html.includes("raycast-zh:begin"), `${n} 已注入`);
      eq(countOf(html, '<script src="./raycast-zh.js"></script>'), 1, `${n} 只注入一次（hook 不会叠加）`);
    }

    const prewarm = readPage("auxiliary-prewarm.html");
    ok(!prewarm.includes("raycast-zh"), "没有 </body> 的页面被跳过，未被破坏");
    ok(fs.existsSync(path.join(FE_DIR, "raycast-zh.js")), "脚本本体已部署到 frontend");
    ok(/3\/3|3 个窗口/.test(installOut), "安装输出报告了 3 个窗口", installOut.split("\n").filter(l => /窗口/.test(l))[0] || "");

    // 幂等：再跑一次，每个页面仍然只有一个 script 标签
    try {
      const again = runScript("install.sh");
      ok(true, "重复执行 install.sh 成功");
      for (const n of PAGE_NAMES) {
        eq(countOf(readPage(n), '<script src="./raycast-zh.js"></script>'), 1, `重复安装后 ${n} 仍只有一个脚本标签`);
      }
      ok(/已是最新/.test(again), "重复安装被识别为「已是最新」");
    } catch (e) {
      ok(false, "重复执行 install.sh 成功", String(e.stderr || e.message).slice(0, 300));
    }

    // 旧版留下的裸标签（没有 begin/end 标记）要能升级成带标记的块，
    // 否则从老版本升上来的用户会带着两份脚本跑。
    const legacy = page("settings").replace("</body>", '<script src="./raycast-zh.js"></script>\n</body>');
    fs.writeFileSync(path.join(FE_DIR, "settings-window.html"), legacy);
    try {
      runScript("install.sh");
      const html = readPage("settings-window.html");
      eq(countOf(html, '<script src="./raycast-zh.js"></script>'), 1, "旧版裸标签被替换，不会双份执行");
      ok(html.includes("raycast-zh:begin"), "旧版裸标签升级为带标记的注入");
    } catch (e) {
      ok(false, "旧版裸标签升级", String(e.stderr || e.message).slice(0, 300));
    }

    // 卸载：三个窗口都要摘干净
    try {
      runScript("uninstall.sh");
      for (const n of PAGE_NAMES) {
        ok(!readPage(n).includes("raycast-zh"), `卸载后 ${n} 不含任何注入痕迹`);
        ok(readPage(n).includes("</body>"), `卸载后 ${n} 结构完整`);
      }
      ok(!fs.existsSync(path.join(FE_DIR, "raycast-zh.js")), "卸载后脚本本体被删除");
      ok(!fs.existsSync(path.join(HOME_DIR, ".raycast-zh", "state.env")), "卸载后状态记录被清除");
    } catch (e) {
      ok(false, "uninstall.sh 在假 app 上执行成功", String(e.stderr || e.message).slice(0, 300));
    }

    try {
      fs.rmSync(TMP, { recursive: true, force: true });
    } catch (e) {}
  }
}

/* ══════════════════════════ 汇总 ══════════════════════════ */

const ms = Date.now() - started;
console.log("\n" + "═".repeat(66));
console.log(` 通过 ${pass}   失败 ${fail}   跳过 ${skip}   耗时 ${ms}ms`);
console.log("═".repeat(66));

if (fail) {
  console.log("\n失败明细：");
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  process.exitCode = 1;
} else {
  console.log("\n全部通过。");
}

/* Raycast 简体中文界面层 —— 由 WorkBuddy 生成
 * 原理：Raycast 的界面是 WKWebView 里的 React 前端，文案硬编码在 JS chunk 中。
 * 本脚本在 DOM 层做精确匹配替换，不触碰任何业务逻辑与字符串常量。
 * 词典未命中的文本原样保留，因此对命令名、文件名、扩展内容零副作用。
 */
(function () {
  "use strict";

/* @@DICT@@ */

  // 动态文案：数字/单复数变化无法用精确词典覆盖
  var RULES = [
    // 「动词 + 应用名」——应用名保持不变，动词译成中文（顺序敏感，Force Quit 必须先于 Quit）
    [/^Use [“"](.+)[”"] with[.…]*$/, "用「$1」进行…"],
    [/^Force Quit (.+)$/, "强制退出 $1"],
    [/^Quit (.+)$/, "退出 $1"],
    [/^Uninstall (.+)$/, "卸载 $1"],
    [/^Open (.+) Settings$/, "打开 $1 设置"],
    [/^Show (.+) in Finder$/, "在访达中显示 $1"],
    [/^Reveal (.+) in Finder$/, "在访达中显示 $1"],
    [/^Copy (.+) Path$/, "拷贝 $1 路径"],
    [/^Hide (.+)$/, "隐藏 $1"],
    [/^Suggestions \((\d+)\)$/, "建议（$1）"],
    [/^After (\d+) seconds?$/, "$1 秒后"],
    [/^After (\d+) minutes?$/, "$1 分钟后"],
    [/^After (\d+) hours?$/, "$1 小时后"],
    [/^(\d+) results?$/, "$1 个结果"],
    [/^(\d+) items?$/, "$1 个项目"],
    [/^(\d+) selected$/, "已选择 $1 项"],
    [/^(\d+) videos?$/, "$1 个视频"],
    [/^(\d+) notes?$/, "$1 条笔记"],
    [/^(\d+) chats?$/, "$1 个对话"],
    // 窗口管理 / 虚拟桌面：序号模板句，逐个入词典成本过高且容易随版本失效
    [/^Move active window to desktop (\d+)\.$/, "将当前窗口移到桌面 $1。"],
    [/^Switch to desktop (\d+)\.$/, "切换到桌面 $1。"],
  ];

  // 屏幕区域：把「Resize focused window to the <区域> of the screen」整句按区域表展开成规则，
  // 比逐个写 44 条模板更不容易漏，也不会在语序上拼出别扭的中文
  var REGION_WORDS = [
    ["top left quarter", "左上四分之一"],
    ["top left sixth", "左上六分之一"],
    ["top right quarter", "右上四分之一"],
    ["top right sixth", "右上六分之一"],
    ["top center sixth", "顶部中间六分之一"],
    ["top center two thirds", "顶部中间三分之二"],
    ["top first fourth", "顶部前四分之一"],
    ["top second fourth", "顶部第二四分之一"],
    ["top third fourth", "顶部第三四分之一"],
    ["top last fourth", "顶部后四分之一"],
    ["top half", "上半部分"],
    ["top third", "顶部三分之一"],
    ["top two thirds", "顶部三分之二"],
    ["top three fourths", "顶部四分之三"],
    ["bottom left quarter", "左下四分之一"],
    ["bottom left sixth", "左下六分之一"],
    ["bottom right quarter", "右下四分之一"],
    ["bottom right sixth", "右下六分之一"],
    ["bottom center sixth", "底部中间六分之一"],
    ["bottom center two thirds", "底部中间三分之二"],
    ["bottom half", "下半部分"],
    ["bottom third", "底部三分之一"],
    ["bottom two thirds", "底部三分之二"],
    ["bottom three fourths", "底部四分之三"],
    ["center third", "中间三分之一"],
    ["center two thirds", "中间三分之二"],
    ["center three fourths", "中间四分之三"],
    ["first fourth", "前四分之一"],
    ["first third", "前三分之一"],
    ["first two thirds", "前三分之二"],
    ["first three fourths", "前四分之三"],
    ["second fourth", "第二四分之一"],
    ["third fourth", "第三四分之一"],
    ["last fourth", "后四分之一"],
    ["last third", "后三分之一"],
    ["last two thirds", "后三分之二"],
    ["last three fourths", "后四分之三"],
    ["left half", "左半部分"],
    ["right half", "右半部分"],
    ["vertical middle third", "垂直中间三分之一"],
    ["half", "一半"]
  ];

  for (var ri = 0; ri < REGION_WORDS.length; ri++) {
    var en = REGION_WORDS[ri][0], zh = REGION_WORDS[ri][1];
    RULES.push([new RegExp("^Resize focused window to the " + en + " of the screen\\.$"), "将当前窗口调整为屏幕" + zh + "。"]);
    RULES.push([new RegExp("^Resize focused window to the " + en + " of the screen and center\\.$"), "将当前窗口调整为屏幕" + zh + "并居中。"]);
  }

  var ATTRS = ["placeholder", "title", "aria-label", "alt", "data-tooltip"];
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, CODE: 1, PRE: 1, KBD: 1, SVG: 1, PATH: 1 };
  // 文本节点不进入输入框/多行文本框，但它们的 placeholder 仍需翻译
  var TEXT_SKIP = { SCRIPT: 1, STYLE: 1, CODE: 1, PRE: 1, TEXTAREA: 1, INPUT: 1, KBD: 1, SVG: 1, PATH: 1 };
  var applying = false;

  // 「12 Applications」这类段落标题由 `${count} ${名词}` 拼成，精确词典匹配不到；
  // 这里把「数字 + 名词」拆开查名词，命中就补中文量词。
  function countLookup(key) {
    var m = /^(\d[\d,]*)\s+([A-Za-z][A-Za-z' \-]*)$/.exec(key);
    if (!m) return null;
    var noun = m[2].trim(), zh = DICT[noun];
    if (!zh && /ies$/.test(noun)) zh = DICT[noun.slice(0, -3) + "y"];
    if (!zh && /es$/.test(noun)) zh = DICT[noun.slice(0, -2)];
    if (!zh && /s$/.test(noun)) zh = DICT[noun.slice(0, -1)];
    if (!zh) return null;
    return m[1] + " 个" + zh;
  }

  function lookup(raw) {
    if (!raw) return null;
    var key = raw.trim();
    if (!key || key.length > 120) return null;
    var hit = DICT[key] || countLookup(key);
    if (!hit) {
      for (var i = 0; i < RULES.length; i++) {
        if (RULES[i][0].test(key)) {
          hit = key.replace(RULES[i][0], RULES[i][1]);
          break;
        }
      }
    }
    if (!hit) return null;
    var lead = raw.match(/^\s*/)[0];
    var tail = raw.match(/\s*$/)[0];
    return lead + hit + tail;
  }

  function translateTextNode(node) {
    var parent = node.parentElement;
    if (!parent || TEXT_SKIP[parent.tagName]) return;
    if (parent.isContentEditable) return;
    var next = lookup(node.nodeValue);
    if (next !== null && next !== node.nodeValue) node.nodeValue = next;
  }

  function translateElement(el) {
    if (el.nodeType !== 1 || SKIP_TAGS[el.tagName]) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var name = ATTRS[i];
      var val = el.getAttribute(name);
      if (!val) continue;
      var next = lookup(val);
      if (next !== null && next !== val) el.setAttribute(name, next);
    }
  }

  // React 的模糊匹配高亮会把一句话拆成多个文本节点（如 "Applica" + "tion"），
  // 单节点匹配必然落空。这里整段取文再查，命中就把译文塞回第一个文本槽。
  function translateContainer(el) {
    if (el.nodeType !== 1 || TEXT_SKIP[el.tagName] || SKIP_TAGS[el.tagName]) return;
    // 可编辑区域等于用户正在写的内容，整段回写会把输入擦掉。
    // 单个文本节点由 translateTextNode 守住了，这里必须同样守住。
    if (el.isContentEditable) return;
    var kids = el.childNodes;
    if (kids.length < 2 || kids.length > 8) return;
    var raw = el.textContent;
    if (!raw || raw.length > 90) return;
    var texts = 0;
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].nodeType === 3 && kids[i].nodeValue.trim()) texts++;
    }
    if (texts < 2) return;
    var next = lookup(raw);
    if (next === null || next === raw.trim()) return;
    var done = false;
    for (var j = 0; j < kids.length; j++) {
      var n = kids[j];
      if (n.nodeType === 3) {
        if (!done && n.nodeValue.trim()) { n.nodeValue = next; done = true; }
        else n.nodeValue = "";
      }
    }
  }

  // 支持 shadow root(11) / document(9) / fragment(11)，否则 Raycast 的浮层会漏
  function walk(root) {
    if (!root) return;
    var t = root.nodeType;
    if (t === 3) { translateTextNode(root); return; }
    if (t !== 1 && t !== 9 && t !== 11) return;
    if (t === 1) {
      translateElement(root);
      translateContainer(root);
      // 自定义元素内部的 shadow tree
      if (root.shadowRoot) walk(root.shadowRoot);
      // 内嵌 iframe
      if (root.tagName === "IFRAME" || root.tagName === "FRAME") {
        try {
          var d = root.contentDocument;
          if (d && d.body) { injectInto(d); walk(d.body); }
        } catch (e) {}
      }
    }
    var kids = root.childNodes;
    for (var i = 0; i < kids.length; i++) walk(kids[i]);
  }

  // ================= 搜索桥：让中文查询命中英文索引 =================
  // Raycast 的匹配发生在两个完全不同的层级，必须分别拦截：
  //   1) 设置窗口：前端 JS 里用 value.indexOf(query) 判子串，hook String.prototype 即可；
  //   2) 启动器根搜索：真正的匹配在原生侧执行（menu.namespace 里的 pe() 是逐字符 DP，
  //      不调用 includes/indexOf，hook 字符串方法无效）。查询词经 IPC 发出：
  //        window.webkit.messageHandlers.ipcRequest.postMessage({
  //          method: "backend.rootSearch.search",
  //          data: JSON.stringify({ term: "…", knownSnapshot?: {…} })
  //        })
  //      所以在 JSON 序列化出口把中文 term 换成英文再发出去——界面上的中文输入不受影响，
  //      回包里的标题仍由 DOM 覆盖层翻成中文。
  var CJK = /[\u4e00-\u9fff]/;
  // 先留一份原生 indexOf 的引用：下面会替换 String.prototype.indexOf，
  // 桥内部的字符串查找必须走原生实现，否则每查一次都要绕回被替换的版本。
  var RAW_IDX = String.prototype.indexOf;
  var ZHEN = null, ZH_CACHE = {}, BRIDGE_ON = false, EN2ZH = {}, LAST_ZH = "";

  // 高频搜索意图的人工映射。
  // 词典反查会给出多个候选（「设置」→ Set / Settings / Setting up…），而原生搜索
  // 只接受一个查询词，只能挑最准的那个；常用词直接写死，保证一次命中。
/* @@ALIAS@@ */

  function buildReverse() {
    if (ZHEN) return ZHEN;
    ZHEN = {};
    var k, v;
    for (k in DICT) {
      if (!Object.prototype.hasOwnProperty.call(DICT, k)) continue;
      v = DICT[k];
      if (!v || !CJK.test(v)) continue;
      if (!ZHEN[v]) ZHEN[v] = [];
      ZHEN[v].push(k);
    }
    // 人工映射表里有很多词条并不在 DICT 里（例如「专注」→ Focus）。
    // 不并进来，设置窗口那条子串匹配的路径就搜不到这些词。
    for (k in ALIAS) {
      if (!Object.prototype.hasOwnProperty.call(ALIAS, k)) continue;
      v = ALIAS[k];
      if (!v) continue;
      if (!ZHEN[k]) ZHEN[k] = [];
      var exists = false;
      for (var j = 0; j < ZHEN[k].length; j++) {
        if (ZHEN[k][j] === v) { exists = true; break; }
      }
      if (!exists) ZHEN[k].push(v);
    }
    return ZHEN;
  }

  // 从多个英文候选里挑最像「命令标题」的那个：越短越可能命中，
  // 同长度时优先首字母大写（Raycast 的 title 风格）。
  function pickBest(list) {
    var best = null;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (!c || !/[A-Za-z]/.test(c)) continue;
      if (best === null) { best = c; continue; }
      if (c.length < best.length) best = c;
      else if (c.length === best.length && /^[A-Z]/.test(c) && !/^[A-Z]/.test(best)) best = c;
    }
    return best;
  }

  // 中文查询 → 单个英文查询词。返回 null 表示无需改写。
  function translateQuery(q) {
    var raw = String(q == null ? "" : q);
    var s = raw.replace(/^\s+|\s+$/g, "");
    if (!s || !CJK.test(s)) return null;
    if (ZH_CACHE["=" + s]) return ZH_CACHE["=" + s].v;
    var out = null;
    if (Object.prototype.hasOwnProperty.call(ALIAS, s)) {
      out = ALIAS[s];
    }
    if (!out) {
      var map = buildReverse();
      if (map[s] && map[s].length) out = pickBest(map[s]);
      // 只输入了词条的一部分（「剪贴」→「剪贴板历史」）。
      // 先只认「以该词开头」的词条，找不到再放宽到「包含」——
      // 否则单字「设」会把「假设/设计」一起卷进来，挑出一个毫不相干的英文。
      if (!out) {
        var bestLen = 1e9, i, zh, cand;
        for (zh in map) {
          if (zh === s || RAW_IDX.call(zh, s) !== 0) continue;
          cand = pickBest(map[zh]);
          if (cand && zh.length < bestLen) { out = cand; bestLen = zh.length; }
        }
      }
      if (!out) {
        var bestLen2 = 1e9;
        for (zh in map) {
          if (zh === s || RAW_IDX.call(zh, s) === -1) continue;
          cand = pickBest(map[zh]);
          if (cand && zh.length < bestLen2) { out = cand; bestLen2 = zh.length; }
        }
      }
    }
    // 多词查询：逐个词翻译后再拼
    if (!out) {
      var toks = s.split(/[\s\u3000,，、\/]+/);
      if (toks.length > 1) {
        var parts = [], changed = false;
        var m2 = buildReverse();
        for (var i = 0; i < toks.length; i++) {
          var t = toks[i];
          if (!t) continue;
          var tr = Object.prototype.hasOwnProperty.call(ALIAS, t) ? ALIAS[t] : null;
          if (!tr && m2[t] && m2[t].length) tr = pickBest(m2[t]);
          // 译不出来的词直接丢掉：英文索引里不可能出现中文字符，
          // 把它留在查询里只会让整条查询必然落空（连能命中的那一半也一起废掉）。
          if (tr) { parts.push(tr); changed = true; }
        }
        // 去重：一个词可能已被整体译成名组（「剪贴」→ Clipboard History），
        // 后面的「历史」再译一次就会拼出 Clipboard History History。
        if (changed) {
          var words = [], seenW = {};
          for (var p = 0; p < parts.length; p++) {
            var ws = parts[p].split(/\s+/);
            for (var w = 0; w < ws.length; w++) {
              var lw = ws[w].toLowerCase();
              if (!lw || seenW[lw]) continue;
              seenW[lw] = 1;
              words.push(ws[w]);
            }
          }
          if (words.length) out = words.join(" ");
        }
      }
    }
    // 记下「原文 → 译文」，回程时用来还原。这里存的是**原始输入**（不 trim），
    // 否则用户多打了一个空格，回程还原出的值与输入框就差一个空格，回车又会被吞。
    // 同一译文多个原文时保留较短的（更规范的那个）：否则「设置」会被后来的
    // 「设置 咕咕咕」覆盖，回程还原出个谁也没打过的怪字符串。
    if (out) {
      var eKey = String(out).toLowerCase();
      var prev = EN2ZH[eKey];
      if (!prev || raw.length < prev.length) EN2ZH[eKey] = raw;
    }
    if (ZH_CACHE.__n === undefined) ZH_CACHE.__n = 0;
    if (++ZH_CACHE.__n > 800) { ZH_CACHE = { __n: 0 }; }
    ZH_CACHE["=" + s] = { v: out || null };
    return out || null;
  }

  // 同一个英文查询词可能对应多个中文（「剪贴」「剪贴 历史」都译成 Clipboard History），
  // 直接查表会被最近一次覆盖。先用当前输入框的内容反查一次：如果它的译文正好等于
  // 回程的 term，那「用户真正打的那个词」才是应该还原的值。
  function zhForTerm(en) {
    var key = String(en).toLowerCase();
    try {
      var a = typeof document !== "undefined" ? document.activeElement : null;
      if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable)) {
        var v = a.value !== undefined ? a.value : a.textContent;
        v = v || "";
        if (v && CJK.test(v)) {
          var tv = translateQuery(v);
          if (tv && String(tv).toLowerCase() === key) return v;
        }
      }
    } catch (e) {}

    // 当前这次搜索不是由中文发起的（LAST_ZH 会被英文/空查询清空）就一律不还原，
    // 否则一张历史映射表会让英文搜索的回包也被改成中文，回车重新失配。
    if (!LAST_ZH) return;

    // 有中文在飞：优先用「最近一次真正发出去的中文查询」——回包基本都对应它。
    // 只查 EN2ZH 会出错：「剪贴」和「剪贴板」都译成 Clipboard History，表里只留一个，
    // 还原成另一个的话输入框和 term 又对不上，回车照样被吞。
    var lv = null;
    try { lv = translateQuery(LAST_ZH); } catch (e) {}
    if (lv && String(lv).toLowerCase() === key) return LAST_ZH;
    return EN2ZH[key];
  }

  // 把 IPC 回程里被翻译过的 term 改回中文（就地改：这是 JSON.parse 刚产出的
  // 新对象，不与任何 React 状态共享，改它不会污染界面）。
  // 找到第一个 term 就收工：快照里还挂着上千个结果条目，全遍历一遍纯属浪费。
  function fixReturnedTerm(node, depth) {
    if (!node || typeof node !== "object" || depth > 4) return false;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length && i < 50; i++) {
        if (fixReturnedTerm(node[i], depth + 1)) return true;
      }
      return false;
    }
    if (Object.prototype.hasOwnProperty.call(node, "term") && typeof node.term === "string") {
      var zh = zhForTerm(node.term);
      if (zh) { node.term = zh; return true; }
    }
    for (var k in node) {
      if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
      var c = node[k];
      if (c && typeof c === "object" && fixReturnedTerm(c, depth + 1)) return true;
    }
    return false;
  }

  // 在 IPC 出口改写 term。注意必须克隆后改写，否则会污染调用方持有的
  // React 状态对象（输入框会当场变成英文）。
  function patchIPC() {
    if (typeof JSON === "undefined" || JSON.stringify.__rcZh) return;
    var oStr = JSON.stringify;
    var hooked = function (value, replacer, space) {
      try {
        if (value && typeof value === "object" && !Array.isArray(value) &&
            Object.prototype.hasOwnProperty.call(value, "term") &&
            typeof value.term === "string") {
          // 只处理「形如搜索参数」的薄对象：rootSearch 的参数就是
          // { term, knownSnapshot } 两个键。放宽到 3 个是为了容忍版本差异，
          // 但绝不能碰那些字段很多的对象——万一某个组件的 props 或
          // 待保存的数据里也有 term，改写就等于悄悄篡改用户内容。
          //
          // 清 LAST_ZH 也必须限制在同一形状内：否则界面上随便一个带 term 的
          // 业务对象被序列化，就会把「正在飞的中文查询」状态擦掉，
          // 回程不再还原，回车又开始被吞。
          var n = 0, over = false;
          for (var key in value) {
            if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
            if (++n > 3) { over = true; break; }
          }
          if (over) return oStr.apply(JSON, arguments);

          if (!CJK.test(value.term)) {
            // 英文查询没有经过翻译，回程也就绝不该被还原成中文。
            // 不清掉的话，上一次的中文查询会在这里借尸还魂，把英文搜索的
            // snapshot.term 改成中文，回车又会失配。
            LAST_ZH = "";
            return oStr.apply(JSON, arguments);
          }
          var en = translateQuery(value.term);
          if (en && en !== value.term) {
            LAST_ZH = value.term;
            // 保留原型：否则对象自带的 toJSON 会失效，序列化结果与原生不一致。
            var proto = Object.getPrototypeOf ? Object.getPrototypeOf(value) : Object.prototype;
            var copy = Object.create(proto || Object.prototype);
            for (var k in value) {
              if (Object.prototype.hasOwnProperty.call(value, k)) copy[k] = value[k];
            }
            copy.term = en;
            return oStr.call(JSON, copy, replacer, space);
          }
        }
      } catch (e) {}
      return oStr.apply(JSON, arguments);
    };
    hooked.__rcZh = 1;
    JSON.stringify = hooked;

    // 回程：原生会把实际使用的查询词原样带回来（term 字段）。我们发出去的是英文，
    // 于是前端拿到的 term 是英文，而输入框里是中文。
    //
    // 完整链路（main-window）：
    //   1. 每次搜索前 trackRequestedSearch(中文) → 把 t.current 置为中文；
    //   2. 回包后 markSnapshotProcessed({term}) → ame 的 effect 里执行
    //      `if (t.current === a.term) t.current = null`，中文 ≠ 英文，清不掉；
    //   3. 于是 hasPendingRefresh() 恒为真；
    //   4. fpe.shouldDeferKeyEvent 在 pending 时接管 Tab / Enter（isSelectedItemShortcut
    //      里包含 L.primary），交给 resolveDeferredKeyEvent；
    //   5. 那里 waitForTermApplied() 永不 resolve，dpe 300ms 超时后返回 "timeout"，
    //      `if (u !== true) return { wasHandled: true }` —— 键被吞掉，界面毫无反应。
    // 鼠标点击不经过这条路径（直接 triggerPrimaryAction），所以只有回车坏。
    //
    // 修法：把回程的 term 映射回中文，让第 2 步能对齐。
    var oParse = JSON.parse;
    var parsed = function (text) {
      var v = oParse.apply(JSON, arguments);
      try {
        // 绝大多数 IPC 报文里没有 "term" 这个键，先做一次廉价的字符串判断，
        // 避免每次 JSON.parse 都去遍历对象。
        if (typeof text === "string" && RAW_IDX.call(text, '"term"') !== -1) fixReturnedTerm(v, 0);
      } catch (e) {}
      return v;
    };
    parsed.__rcZh = 1;
    JSON.parse = parsed;

    // 双保险：万一 term 不是经由 JSON.stringify 出去的，直接在 postMessage 入口改。
    try {
      var mh = (typeof window !== "undefined" && window.webkit && window.webkit.messageHandlers) || null;
      var h = mh && mh.ipcRequest;
      if (h && typeof h.postMessage === "function" && !h.postMessage.__rcZh) {
        var oPost = h.postMessage;
        var wrapped = function (msg) {
          try {
            if (msg && typeof msg.method === "string" && /rootSearch/i.test(msg.method) &&
                typeof msg.data === "string" && CJK.test(msg.data)) {
              var o = JSON.parse(msg.data);
              if (o && typeof o.term === "string") {
                var en = translateQuery(o.term);
                if (en && en !== o.term) {
                  var zhTerm = o.term;
                  o.term = en;
                  // 必须在 stringify 之后写 LAST_ZH：上面那个 hook 看到英文 term
                  // 会把 LAST_ZH 清空，先写就会被它擦掉。
                  msg.data = JSON.stringify(o);
                  LAST_ZH = zhTerm;
                }
              }
            }
          } catch (e) {}
          return oPost.apply(this, arguments);
        };
        wrapped.__rcZh = 1;
        h.postMessage = wrapped;
      }
    } catch (e) {}
  }

  // 返回「该中文查询可能对应的全部英文原文」，供设置窗口的子串匹配使用。
  function zh2enAll(q) {
    if (ZH_CACHE[q]) return ZH_CACHE[q];
    var map = buildReverse();
    var out = [], seen = {};
    function add(s) { if (!seen[s]) { seen[s] = 1; out.push(s); } }
    var exact = map[q];
    if (exact) for (var i = 0; i < exact.length; i++) add(exact[i]);
    for (var zh in map) {
      if (zh === q || RAW_IDX.call(zh, q) === -1) continue;
      var list = map[zh];
      for (var j = 0; j < list.length; j++) add(list[j]);
      if (out.length > 40) break;
    }
    if (out.length > 40) out = out.slice(0, 40);
    ZH_CACHE[q] = out;
    return out;
  }

  function installSearchBridge() {
    patchIPC();
    if (typeof String === "undefined" || String.prototype.__rcZhBridge) return;
    String.prototype.__rcZhBridge = 1;
    var oInc = String.prototype.includes;
    var oIdx = RAW_IDX;
    var oSw = String.prototype.startsWith;

    function translated(needle, hay) {
      if (!BRIDGE_ON) return null;
      if (typeof needle !== "string" || needle.length < 2) return null;
      if (!CJK.test(needle)) return null;
      if (CJK.test(hay)) return null;
      var list = zh2enAll(needle);
      return list && list.length ? list : null;
    }

    String.prototype.includes = function (needle, pos) {
      if (oInc.call(this, needle, pos)) return true;
      var list = translated(needle, String(this));
      if (!list) return false;
      var low = null;
      for (var i = 0; i < list.length; i++) {
        if (oInc.call(this, list[i], pos) || oInc.call(this, list[i].toLowerCase(), pos)) return true;
        // 设置窗口会把查询词先 toLowerCase，而原值保持原样，"Clipboard History" 里
        // 找 "clipboard" 就落空，这里再比一次两边都小写化的结果。
        if (low === null) low = String(this).toLowerCase();
        if (oInc.call(low, list[i].toLowerCase(), pos)) return true;
      }
      return false;
    };

    String.prototype.indexOf = function (needle, pos) {
      var r = oIdx.call(this, needle, pos);
      if (r !== -1) return r;
      var list = translated(needle, String(this));
      if (!list) return -1;
      var low = null;
      for (var i = 0; i < list.length; i++) {
        var hit = oIdx.call(this, list[i], pos);
        if (hit === -1) hit = oIdx.call(this, list[i].toLowerCase(), pos);
        if (hit === -1) {
          if (low === null) low = String(this).toLowerCase();
          hit = oIdx.call(low, list[i].toLowerCase(), pos);
        }
        // 返回「第一个命中候选」的位置，而不是跨候选取最小偏移。
        // 列表已按 精确 → 包含 排序，"Open Settings" 里查「设置」时若取最小偏移，
        // 会被整串候选 "Open Settings" 拉到 0，把高亮/切片位置带偏。
        if (hit !== -1) return hit;
      }
      return -1;
    };

    String.prototype.startsWith = function (needle, pos) {
      if (oSw.call(this, needle, pos)) return true;
      var list = translated(needle, String(this));
      if (!list) return false;
      for (var i = 0; i < list.length; i++) if (oSw.call(this, list[i], pos)) return true;
      return false;
    };

    // 只有搜索框里存在中文时才开启，避免影响 AI 对话、翻译等其它场景
    document.addEventListener("input", function (e) {
      var t = e.target;
      if (!t) return;
      var val;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") val = t.value || "";
      else if (t.isContentEditable) val = t.textContent || "";
      else return;
      BRIDGE_ON = CJK.test(val);
    }, true);
  }

  // 暴露给自测脚本 / 排障用
  try {
    var G = typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : null);
    if (G) {
      G.__rcZhTranslate = translateQuery;
      G.__rcZhAliasCount = 0;
      for (var _k in ALIAS) G.__rcZhAliasCount++;
      // 排障用：手动打开/关闭字符串层的回退比较
      G.__rcZhBridgeOn = function (v) { BRIDGE_ON = !!v; return BRIDGE_ON; };
      // 排障/自测用：直接调词典与整体重扫，避免测试只能从 DOM 侧面猜行为
      G.__rcZhLookup = lookup;
      G.__rcZhApply = function () { applyAll(typeof document !== "undefined" ? document.body : null); };
      G.__rcZhState = function () {
        var n = 0;
        for (var q in EN2ZH) if (Object.prototype.hasOwnProperty.call(EN2ZH, q)) n++;
        return { lastZh: LAST_ZH, bridgeOn: BRIDGE_ON, en2zh: n };
      };
    }
  } catch (e) {}

  // 给动态创建的 iframe 补注入
  function injectInto(doc) {
    if (!doc || doc.__rcZh) return;
    doc.__rcZh = 1;
    try {
      var s = doc.createElement("script");
      s.src = "./raycast-zh.js";
      (doc.head || doc.documentElement).appendChild(s);
    } catch (e) {}
  }

  function applyAll(root) {
    if (applying) return;
    applying = true;
    try { walk(root || document.body || document.documentElement); } catch (e) {} finally { applying = false; }
  }

  function start() {
    installSearchBridge();
    if (document.title && DICT[document.title]) document.title = DICT[document.title];
    applyAll(document.body || document.documentElement);
    var observer = new MutationObserver(function (records) {
      if (applying) return;
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (r.type === "characterData") {
          if (r.target) translateTextNode(r.target);
        } else if (r.type === "attributes") {
          translateElement(r.target);
        } else {
          for (var j = 0; j < r.addedNodes.length; j++) applyAll(r.addedNodes[j]);
        }
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS
    });
    // 浮层/弹窗类的 DOM 往往在 observer 建立前就已渲染，或被框架整体替换，
    // 这里加一层轮询兜底：前 42 秒 700ms 一次，之后 4 秒一次常驻。
    if (typeof setInterval !== "function") return;
    var n = 0;
    var fast = setInterval(function () {
      n++;
      if (!document.hidden) applyAll(document.body || document.documentElement);
      if (n >= 60) {
        clearInterval(fast);
        setInterval(function () {
          if (!document.hidden) applyAll(document.body || document.documentElement);
        }, 4000);
      }
    }, 700);
  }

  // IPC 改写必须尽早装上：本脚本是经典脚本、先于 defer 的模块脚本执行，
  // 而 start() 要等 DOMContentLoaded，中间这段时间足以让启动期的一次搜索漏过。
  try { patchIPC(); } catch (e) {}

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();

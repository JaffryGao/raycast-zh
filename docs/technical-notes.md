# 逆向笔记

记录实现过程中确认过的事实，方便 Raycast 大版本升级后快速定位问题。
下面每一条都是通过读打包后的 chunk 或实际实验验证的，不是推测。

## 1. 界面结构

启动器由 `main-window.html` 加载，里面是一堆 ES module chunk。关键文件：

| 文件 | 作用 |
| --- | --- |
| `main-window-*.js` | 主窗口、搜索状态、按键处理 |
| `root-search-*.js` | 根搜索输入与渲染 |
| `settings-window-*.js` | 设置窗口（另一套匹配实现） |
| `menu.namespace-*.js` | 命令菜单、模糊匹配打分 |

注入点是 `main-window.html` 的 `</body>` 前。**只有这一个 HTML 需要改**，`settings-window.html` 等页面的初始化由主窗口驱动，同一个脚本会覆盖到。

## 2. 两套搜索匹配（最容易踩空的地方）

同一个应用里并存两条完全不同的匹配路径：

| 场景 | 实现 | hook 字符串方法是否有效 |
| --- | --- | --- |
| 设置窗口 | `let a = value.indexOf(query)`，再加模糊打分 | 有效 |
| 启动器根搜索 | 原生侧 IPC 搜索 | 无效 |

启动器前端也有一份模糊匹配（`menu.namespace` 里的 `pe()`），但它是 `charCodeAt` + 动态规划逐字符对齐，**不调用 `includes`/`indexOf`/`startsWith`**。看到函数体里没有这些调用、只有 `charCodeAt` 时，就该换层了。

## 3. IPC 形态

```js
window.webkit.messageHandlers.ipcRequest.postMessage({
  method: "backend.rootSearch.search",
  data: JSON.stringify({ term: "…", knownSnapshot: {…} }),  // data 是「字符串」
  destination: "backend",
  timeout: …
});
```

`safeStringify(e) { return JSON.stringify(e) }`，所以 hook 全局 `JSON.stringify` 比 hook `postMessage` 更稳——后者在 WebKit 里每次可能返回不同的代理对象。

**去程必须克隆**：`{ term: e }` 里的 `e` 与 React 状态是同一个引用，直接改 `o.term` 会让输入框当场变成英文。

```js
var copy = Object.create(Object.getPrototypeOf(value) || Object.prototype);
for (var k in value) if (hasOwn(value, k)) copy[k] = value[k];
copy.term = en;
return oStr.call(JSON, copy, replacer, space);
```

保留原型是必要的：对象自带 `toJSON` 时，丢原型会让序列化结果与原生不一致。

## 4. 回车为什么会被吞

前端有个「上一次搜索结果是否落地」的记账器，对账方式是**字符串相等**：

```js
trackRequestedSearch(term)      // t.current = "设置"（输入框里的值）
markSnapshotProcessed({ term }) // a.term = "Settings"（原生原样带回来）
if (t.current === a.term) t.current = null;   // 永远不成立
```

于是 `hasPendingRefresh()` 恒为真，接下来这条链会静默吃掉回车：

1. `shouldDeferKeyEvent` 在 pending 时接管 Tab / Enter；
2. 交给 `resolveDeferredKeyEvent`，它 `await waitForTermApplied(...)`，而这个 Promise **永不 resolve**；
3. 外面套 300ms 超时，超时返回 `"timeout"`，代码写的是 `if (u !== true) return { wasHandled: true }` —— **键被标成已处理，然后什么都不做**。

鼠标点击不走这条路径（直接 `triggerPrimaryAction`），所以现象是「只有回车坏了」。

**修法**：回程对称改写，`JSON.parse` 出口把 `term` 映射回中文。

```js
if (typeof text === "string" && text.indexOf('"term"') !== -1) fixReturnedTerm(v, 0);
```

注意 `isAppliedSelectionReady` 这个名字很像元凶，但它实际比的是**参数列表**（`ape(j, me)`），与 term 无关。查这类问题要顺着 `hasPendingRefresh` 走。

## 5. 回程改写的三个坑

**a) 就地改是安全的，去程则相反。** `JSON.parse` 返回全新对象，不与 React 状态共享；去程改的是状态对象本身，必须克隆。

**b) 不能让历史映射污染英文搜索。** 英文查询没经过翻译，回程也绝不该被还原成中文。用 `LAST_ZH` 记住「最近一次真正发出去的中文查询」，英文或空查询发出时清空它；`LAST_ZH` 为空时一律不还原。

顺序也有讲究：如果先用 `JSON.stringify` 序列化改写后的对象，再写 `LAST_ZH`——那个 hook 看到英文 `term` 会立刻把它清空。**必须先序列化，后赋值。**

**c) 一个英文对应多个中文。** 「剪贴」和「剪贴板」都译成 `Clipboard History`，映射表只能留一个。还原时按优先级取值：

1. `document.activeElement` 的当前值——译文正好等于回程 term 就用它（最准）；
2. 否则用 `LAST_ZH`；
3. 最后才查历史表，同键保留**较短**的原文。

## 6. 中文查询只有一次机会

字符串 hook 可以把所有候选都试一遍，但原生 IPC 只接受一个 `term`。所以需要一张人工映射表（`src/alias.js`）固定高频意图的最优译文，查不到的再回退到「词典反查 + 取最短候选」。

多词查询按空格切分后逐词翻译，最后**按词去重**，否则「剪贴 历史」会拼成 `Clipboard History History`。译不出的词直接丢弃——留着会让整条查询必然落空（英文索引里没有中文字符）。

## 7. 注入时机

脚本在 `</body>` 前，属经典脚本，会先于 `defer` 的模块脚本执行；但 `start()` 若挂在 `DOMContentLoaded` 上，后者在模块脚本**之后**才触发，中间这段窗口足以漏掉启动期的一次搜索。

与 DOM 无关的补丁（IPC hook）提到 IIFE 顶层立即执行，`start()` 里再调一次（用标记做幂等）。

## 8. 排查「是不是汉化弄坏的」

改的是渲染层，但用户会把任何异常都归因到最近一次改动。先做对照实验，再谈修复：

1. **先复现**：不改任何东西，稳定复现现象（不稳定说明与时序有关）。
2. **再禁用**：把注入注释掉，重复同样操作。现象照旧 → 与本项目无关。
3. **最后定位**：用数字代替感觉。

Raycast 是 `LSUIElement = true`（菜单栏 app，accessory 激活策略），用「双击 ⌘」唤起时**只显示窗口、不激活 app**，此时 `AXUIElementCopyAttributeValue` 读到的 `focused=false / main=false / appActive=false`。macOS 会把非激活窗口的第一次点击用于激活，事件不会传进 WKWebView。

这解释了「左下角按钮第一次点击没反应、第二次才行」：它弹的是**原生 NSMenu**，必须窗口是 key window 才能弹；同一窗口里的搜索框是纯 DOM 交互，不依赖 key 状态。**卸载本项目后现象一致**，所以不是汉化的问题。

## 9. 调试入口

脚本在 `window` 上挂了几个只读入口，出问题时可以在 Web Inspector 里直接调：

```js
__rcZhLookup("Cancel")      // → "取消"，null 表示词典没收录
__rcZhTranslate("剪贴")      // → "Clipboard History"，查询词的改写结果
__rcZhState()               // → { lastZh, bridgeOn, en2zh, aliasCount }
__rcZhBridgeOn(false)       // 临时关掉字符串层回退比较，用来二分定位
```

校验词典覆盖率**必须走运行时**，不要用源码文本比对：chunk 里是 `like: "Remember I'm vegetarian."`，词典源码里是 `"like: \"Remember I'm vegetarian.\""`，转义反斜杠参与比较会让「本来能命中」变成假缺失。

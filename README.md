# Raycast 简体中文汉化

**简体中文** ｜ [English](#english)

给 [Raycast](https://raycast.com) 加一层中文界面，**不改二进制、不碰业务逻辑**，并且让中文搜索能命中它原本的英文索引。

![启动器中文效果](docs/images/launcher.png)

> 非官方项目。原理是在 Raycast 的 WebView 里注入一个翻译层，详见[实现原理](#实现原理)。

## 特性

- **界面汉化**：启动器、设置窗口、侧栏、命令名、空状态、占位符等，约 4000 条文案精确匹配
- **中文搜索**：输入「设置 / 剪贴 / 专注 / 截图」能搜到对应的英文命令
- **零侵入**：只在各窗口 HTML 末尾加一段 `<script>`，外加一个脚本文件；不修改任何 `.js` chunk、不改二进制、不影响扩展与命令
- **未命中即原样**：词典里没有的文本保持英文，因此不会破坏文件名、命令名、你自己写的 Quicklink 标题
- **可一键还原**：`npm run undeploy` 完全回到原样
- **升级后一条命令恢复**：Raycast 更新会覆盖文件，重跑 `npm run deploy` 即可

## 环境要求

- macOS
- Raycast（已在 **2.8.2.0** 实测，其他版本请自行判断）
- Node.js ≥ 16（可选；只用 `./scripts/install.sh` 的话不需要）

## 快速开始

```bash
git clone https://github.com/JaffryGao/raycast-zh.git
cd raycast-zh
npm run deploy
```

没有 Node.js 也能装（`dist/` 里已带构建好的产物）：

```bash
./scripts/install.sh
```

脚本会定位 Raycast 的 `frontend/` 目录，给其中所有窗口页面注入翻译脚本，然后自动重启 Raycast。按你的快捷键唤起，输入 `设置`、`剪贴`、`专注` 试试。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run deploy` | 安装 / 更新到当前 Raycast |
| `npm run undeploy` | 完全卸载，恢复原样 |
| `npm run status` | 体检：注入是否完整、版本是否同步、Raycast 是否升级过 |
| `npm test` | 分层测试（128 条断言，含真实语料与多窗口安装闭环） |
| `npm run build` | 改完词典后重新构建 `dist/` |

`install.sh` 和 `uninstall.sh` 支持 `--no-restart`（不重启 Raycast）；三个脚本都支持 `--app <路径>`（Raycast 不在默认位置时）。

## Raycast 升级之后

升级会整体替换 app bundle，注入和脚本都会消失。**每次升级后跑一次：**

```bash
npm run deploy
```

不确定要不要跑？先看体检结果：

```bash
$ npm run status
...
! Raycast 已从 2.8.2 升级到 2.9.0，脚本很可能已被覆盖 → npm run deploy
```

如果状态显示「已汉化且与源码同步」，就不用做任何事。

> 如果 Raycast 的自动更新因为 bundle 被改动而失败（少数情况下会发生），从[官网](https://raycast.com)下载新版覆盖安装，再跑一次 `npm run deploy` 即可。

## 只汉化了一半？（设置窗口仍是英文）

Raycast 的每个窗口都是**独立的 HTML + 独立的 JS 入口**：

```
frontend/main-window.html      启动器
frontend/settings-window.html  设置 / 偏好设置
frontend/ai-chat-window.html   AI 对话
frontend/notes-window.html     笔记
...
```

设置窗口是独立页面，`main-window.html` 里的注入对它完全不可见。如果安装脚本只认 `main-window.html`，结果就是「启动器是中文、设置窗口全英文」。当前版本会遍历 `frontend/*.html`，把每个带 `</body>` 的页面都注上。

自检：

```bash
$ npm run status
✓ 窗口已注入         9/9        # 全部窗口都注入了
```

如果显示 `8/9` 并列出未注入的文件，跑一次 `npm run deploy` 补齐即可，不需要先卸载。

## 实现原理

Raycast 的界面是 WKWebView 里的 React 应用，文案硬编码在打包后的 JS chunk 里，原生侧另有搜索索引。这个项目做三件事：

**1. 渲染层翻译**

扫描 DOM 文本节点和 5 个属性（`placeholder` / `title` / `aria-label` / `alt` / `data-tooltip`），用精确词典匹配后替换。跳过 `INPUT`/`TEXTAREA`/`contentEditable`/`CODE`/`SVG`，所以不会擦掉你正在输入的内容。React 重渲染出新节点时，`MutationObserver` 再补一次。

**2. 中文搜索**

这里有个容易踩空的地方：**Raycast 里有两套搜索匹配**。

- 设置窗口在前端匹配（`value.indexOf(query)`），hook 字符串方法有效；
- 启动器根搜索在**原生侧**执行，前端那份模糊匹配是逐字符动态规划，不调用 `includes`/`indexOf`，hook 字符串方法完全无效。

所以启动器走的是另一条路：查询词经 IPC 发出去时是 `JSON.stringify({ term })`，在序列化出口把中文换成英文再发；回包里的 `term` 再映射回中文，保证前端「本次搜索是否已落地」的判据（`term === input.value`）仍然成立——否则按回车会被静默吞掉。

**3. 只改该改的**

- 去程改 `term` 时**浅拷贝**对象，不污染 React 状态（否则输入框会当场变成英文）；
- 只处理「自有键 ≤ 3」的薄对象，避免误改组件 props 或待保存数据；
- 回程可以就地改，因为 `JSON.parse` 的产物是全新对象，不与状态共享。

更多逆向细节见 [`docs/technical-notes.md`](docs/technical-notes.md)。

## 贡献词典

词条集中在两个文件，改完跑 `npm run build && npm test`：

- `src/dict.js` —— 界面文案，英文原文 → 中文。**未命中就原样显示**，所以宁可少收，不要猜。
- `src/alias.js` —— 中文搜索词 → 单个英文查询词。原生只接受一个 term，这里存的是「最优译文」。

构建时会检查重复键和语法，测试里有真实语料覆盖率闸门（设置页要求 100%），词典被误删会直接失败。

## 已知限制

- **长句覆盖不全**：4 词以上的说明性长句（AI 对话 playground、欢迎页、主题工作室）仍有未翻译的，覆盖率约 70%（按 UI 字段统计，≤120 字符）。短文案基本齐了。
- **单字中文搜索靠猜**：输入「设」只会得到 `Setting`，输入第二个字就正常。
- **词典完全没有的中文词不做改写**：结果为空，而不是乱译成别的命令。
- **依赖 Raycast 内部结构**：注入点要求页面里有 `</body>`（当前所有窗口都有），搜索改写依赖 `{ term }` 这个参数形态。大版本升级若改了结构，`npm test` 的 L7/L10 会先报出来。
- **左下角那个按钮第一次点击没反应**：这是 Raycast 自身在「窗口已显示但 app 未激活」时的行为，与本项目无关，卸载本项目后现象一致。

## 卸载

```bash
npm run undeploy
```

只删除自己写入的东西：HTML 里的那段标记、`raycast-zh.js`、`~/.raycast-zh/state.env`。Raycast 的其它文件一律不碰。

## 免责声明

本项目通过修改 **已安装 app 的资源文件** 实现，属于非官方手段：

- 不会上传任何数据，不联网，不读剪贴板，全部逻辑都在本地 WebView 内；
- 但修改 app bundle 不在 Raycast 的支持范围内，出问题请先 `npm run undeploy` 再判断；
- 请自行评估风险，作者不对由此造成的任何损失负责。

## License

[MIT](LICENSE)

---

<a id="english"></a>

# Raycast Chinese (Simplified) Localization

[简体中文](#raycast-简体中文汉化) ｜ **English**

An unofficial Chinese UI layer for [Raycast](https://raycast.com). It **does not touch the binary or any business logic**, and it makes Chinese queries match Raycast's existing English search index.

![Chinese launcher](docs/images/launcher.png)

> Unofficial project. It works by injecting a translation layer into Raycast's WebViews — see [How it works](#how-it-works).

## Features

- **Localized UI**: launcher, settings window, sidebar, command names, empty states, placeholders — roughly 4,000 exact-match strings
- **Chinese search**: type `设置`, `剪贴`, `专注`, or `截图` to find the corresponding English command
- **Non-invasive**: adds one `<script>` block at the end of each window's HTML plus a single script file. No bundled `.js` chunk is modified, no binary is patched, and extensions and commands keep working
- **Unmatched text stays as-is**: anything missing from the dictionary remains English, so file names, command names, and your own Quicklink titles are never mangled
- **One-command rollback**: `npm run undeploy` restores the original state
- **One command after an update**: Raycast overwrites the bundle on update — just re-run `npm run deploy`

## Requirements

- macOS
- Raycast (tested on **2.8.2.0**; other versions are untested)
- Node.js ≥ 16 (optional — not needed if you only use `./scripts/install.sh`)

## Quick start

```bash
git clone https://github.com/JaffryGao/raycast-zh.git
cd raycast-zh
npm run deploy
```

No Node.js? The built artifact is committed, so this works too:

```bash
./scripts/install.sh
```

The script locates Raycast's `frontend/` directory, injects the translation script into every window page, and restarts Raycast. Then open the launcher and try `设置`, `剪贴`, `专注`, or `截图`.

## Commands

| Command | What it does |
| --- | --- |
| `npm run deploy` | Install / update against the current Raycast |
| `npm run undeploy` | Remove everything and restore the original state |
| `npm run status` | Health check: injection coverage, version sync, whether Raycast was upgraded |
| `npm test` | Layered test suite (128 assertions, including real-corpus and multi-window install round-trips) |
| `npm run build` | Rebuild `dist/` after editing dictionaries |

`install.sh` and `uninstall.sh` accept `--no-restart` (skip restarting Raycast); all three scripts accept `--app <path>` if Raycast lives somewhere other than `/Applications`.

## After a Raycast update

Updating replaces the whole app bundle, so the injection and script disappear. **Run this once after every update:**

```bash
npm run deploy
```

Not sure whether you need to? Check the status first:

```bash
$ npm run status
...
! Raycast upgraded from 2.8.2 to 2.9.0; the script was probably overwritten → npm run deploy
```

If it says the install is in sync with the source, you're done.

> If Raycast's auto-update fails because the bundle was modified (rare), download the new version from [raycast.com](https://raycast.com), install it over the old one, and run `npm run deploy` again.

## Only half localized? (settings window still in English)

Every Raycast window is a **separate HTML document with its own JS entry point**:

```
frontend/main-window.html      launcher
frontend/settings-window.html  settings / preferences
frontend/ai-chat-window.html   AI chat
frontend/notes-window.html     notes
...
```

The settings window is a standalone page, so an injection in `main-window.html` is invisible to it. If the installer only knows about `main-window.html`, you get a Chinese launcher and an entirely English settings window. The current version walks `frontend/*.html` and injects into every page that has a `</body>`.

Check it yourself:

```bash
$ npm run status
✓ 窗口已注入         9/9        # every window is covered (status output is in Chinese)
```

If it reports `8/9` and lists the missing files, run `npm run deploy` to fill the gaps — no need to uninstall first.

## How it works

Raycast's UI is a React app inside WebKit WebViews. Strings are hardcoded in the bundled JS chunks, and search runs through a separate native index. This project does three things:

**1. Render-layer translation**

It walks DOM text nodes and five attributes (`placeholder` / `title` / `aria-label` / `alt` / `data-tooltip`) and replaces exact dictionary matches. It skips `INPUT` / `TEXTAREA` / `contentEditable` / `CODE` / `SVG`, so whatever you're typing is never overwritten. A `MutationObserver` re-applies translations when React renders new nodes.

**2. Chinese search**

There's an easy trap here: **Raycast has two separate search paths**.

- The settings window matches in the frontend (`value.indexOf(query)`), so hooking string methods works;
- Launcher root search runs **natively**. The frontend's fuzzy matcher is a per-character dynamic-programming pass that never calls `includes` / `indexOf`, so hooking string methods does nothing.

So the launcher takes a different route: queries leave over IPC as `JSON.stringify({ term })`. We rewrite the Chinese term to English at the serialization boundary, then map the returned `term` back to Chinese. That keeps the frontend's "has this search landed?" check (`term === input.value`) true — otherwise pressing Enter gets silently swallowed.

**3. Change only what must change**

- Outbound rewrites use a **shallow copy**, so React state is never mutated (otherwise the input box would flip to English mid-typing);
- Only "thin" objects (≤ 3 own keys) are touched, avoiding component props or data about to be persisted;
- Inbound rewrites can mutate in place, because `JSON.parse` returns fresh objects not shared with state.

More reverse-engineering notes (in Chinese): [`docs/technical-notes.md`](docs/technical-notes.md).

## Contributing to the dictionary

Strings live in two files. After editing, run `npm run build && npm test`:

- `src/dict.js` — UI strings, English → Chinese. **Unmatched text is displayed as-is**, so prefer omission over guessing.
- `src/alias.js` — Chinese search term → a single English query. Native search accepts one term only, so entries hold the "best translation", not a candidate list.

The build checks for duplicate keys and syntax errors. Tests include a real-corpus coverage gate (100% required for the settings page), so accidentally deleting entries fails the suite.

## Known limitations

- **Long sentences are partially covered**: explanatory strings of 4+ words (AI chat playground, welcome screen, theme studio) are still partly untranslated — about 70% coverage by UI field count (≤ 120 chars). Short strings are essentially complete.
- **Single-character Chinese search is guesswork**: typing `设` only yields `Setting`; the second character fixes it.
- **Unknown Chinese words are left untouched**: the result is empty rather than a wrong translation.
- **Depends on Raycast internals**: injection requires a `</body>` in the page (all current windows have one), and search rewriting depends on the `{ term }` payload shape. If a major update changes either, tests L7/L10 will fail first.
- **The bottom-left button ignores the first click**: that's Raycast's own behavior when the window is shown but the app isn't active. It happens with this project uninstalled too.

## Uninstall

```bash
npm run undeploy
```

It removes only what this project added: the marked block in each HTML file, `raycast-zh.js`, and `~/.raycast-zh/state.env`. Nothing else in Raycast is touched.

## Disclaimer

This project works by modifying the **resource files of an installed app**, which is unofficial:

- It uploads nothing, makes no network calls, and never reads the clipboard; all logic runs locally inside the WebViews;
- Modifying an app bundle is outside Raycast's supported surface — if something breaks, run `npm run undeploy` first;
- Use at your own risk. The author is not liable for any damage.

## License

[MIT](LICENSE)

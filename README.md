# Raycast 简体中文

给 [Raycast](https://raycast.com) 加一层中文界面，**不改二进制、不碰业务逻辑**，并且让中文搜索能命中它原本的英文索引。

![启动器中文效果](docs/images/launcher.png)

> 非官方项目。原理是在 Raycast 的 WebView 里注入一个翻译层，详见[实现原理](#实现原理)。

## 特性

- **界面汉化**：菜单、设置、命令名、空状态、占位符等，约 4000 条文案精确匹配
- **中文搜索**：输入「设置 / 剪贴 / 专注 / 截图」能搜到对应的英文命令
- **零侵入**：只在 `main-window.html` 里加一行 `<script>`，外加一个脚本文件；不修改任何 `.js` chunk、不改二进制、不影响扩展与命令
- **未命中即原样**：词典里没有的文本保持英文，因此不会破坏文件名、命令名、你自己写的 Quicklink 标题
- **可一键还原**：`npm run undeploy` 完全回到原样
- **升级后一条命令恢复**：Raycast 更新会覆盖文件，重跑 `npm run deploy` 即可

## 快速开始

```bash
git clone https://github.com/YOUR_NAME/raycast-zh.git
cd raycast-zh
npm run deploy
```

没有 Node.js 也能装（`dist/` 里已带构建好的产物）：

```bash
./scripts/install.sh
```

装完会自动重启 Raycast。按你的快捷键唤起，输入 `设置`、`剪贴`、`专注` 试试。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run deploy` | 安装 / 更新到当前 Raycast |
| `npm run undeploy` | 完全卸载，恢复原样 |
| `npm run status` | 体检：是否已装、版本是否同步、Raycast 是否升级过 |
| `npm test` | 分层测试（101 条断言，含真实语料覆盖率闸门） |
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
- **依赖 Raycast 内部结构**：注入点是 `main-window.html` 的 `</body>`，搜索改写依赖 `{ term }` 这个参数形态。大版本升级若改了结构，需要重新定位（`npm test` 的 L7 会先报出来）。
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

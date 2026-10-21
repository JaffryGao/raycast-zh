#!/usr/bin/env node
/**
 * 构建：把 src/{dict,alias,core}.js 拼接为 dist/raycast-zh.js。
 *
 * 设计上刻意不引入任何构建工具——这个项目的产物是一个要注入到
 * WKWebView 里的经典脚本，过度工程化只会让「改一个词条」变复杂。
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const DICT_MARK = "/* @@DICT@@ */";
const ALIAS_MARK = "/* @@ALIAS@@ */";

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

function fail(msg) {
  console.error("✗ " + msg);
  process.exit(1);
}

/** 收集重复键：`"k": "v"` 形式在对象字面量里出现两次时后者静默覆盖前者。 */
function dupKeys(src, label) {
  const seen = new Map();
  const dups = [];
  const re = /^\s*"((?:[^"\\]|\\.)*)"\s*:/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    const key = m[1];
    const line = src.slice(0, m.index).split("\n").length;
    if (seen.has(key)) dups.push(`${label} 第 ${line} 行重复定义 "${key}"（首次在第 ${seen.get(key)} 行）`);
    else seen.set(key, line);
  }
  return dups;
}

const core = read("src/core.js");
const dictSrc = read("src/dict.js").trimEnd();
const aliasSrc = read("src/alias.js").trimEnd();

for (const [mark, name] of [[DICT_MARK, "DICT"], [ALIAS_MARK, "ALIAS"]]) {
  if (!core.includes(mark)) fail(`src/core.js 缺少占位符 ${mark}（${name} 无法注入）`);
  if (core.split(mark).length !== 2) fail(`src/core.js 中占位符 ${mark} 出现了多于一次`);
}

const problems = [...dupKeys(dictSrc, "dict.js"), ...dupKeys(aliasSrc, "alias.js")];
if (problems.length) {
  console.error("✗ 词典存在重复键：");
  for (const p of problems.slice(0, 20)) console.error("   " + p);
  if (problems.length > 20) console.error(`   …另有 ${problems.length - 20} 处`);
  process.exit(1);
}

// 用函数形式替换：避免词典里出现 `$&`、`$1` 之类被当成替换模式。
const banner = `/*! raycast-zh v${pkg.version} | MIT | 构建产物，请勿直接编辑（源码见 src/） */\n`;
const out = banner
  + core.replace(DICT_MARK, () => dictSrc).replace(ALIAS_MARK, () => aliasSrc);

try {
  new vm.Script(out, { filename: "raycast-zh.js" });
} catch (e) {
  fail("构建产物语法错误：" + e.message);
}

const distPath = path.join(ROOT, "dist", "raycast-zh.js");
fs.mkdirSync(path.dirname(distPath), { recursive: true });
fs.writeFileSync(distPath, out, "utf8");

const dictCount = (dictSrc.match(/^\s*"(?:[^"\\]|\\.)*"\s*:/gm) || []).length;
const aliasCount = (aliasSrc.match(/^\s*"(?:[^"\\]|\\.)*"\s*:/gm) || []).length;

console.log(`✓ dist/raycast-zh.js  ${(Buffer.byteLength(out) / 1024).toFixed(1)} KB`);
console.log(`  词典 ${dictCount} 条，搜索别名 ${aliasCount} 条，共 ${out.split("\n").length} 行`);

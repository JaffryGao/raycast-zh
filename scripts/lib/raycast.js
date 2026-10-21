/**
 * 定位 Raycast 的安装位置与前端目录。
 *
 * 这里刻意不写死 `macos-app_RaycastDesktopApp.bundle`——Raycast 升级时
 * 内部 bundle 名可能变，只有 `main-window.html` 是稳定的锚点。
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const DEFAULT_APPS = [
  "/Applications/Raycast.app",
  path.join(process.env.HOME || "/tmp", "Applications/Raycast.app"),
];

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

/** 返回 Raycast.app 的绝对路径；找不到返回 null。 */
function findApp(explicit) {
  const wanted = explicit || process.env.RAYCAST_APP;
  if (wanted) return exists(wanted) ? path.resolve(wanted) : null;
  for (const p of DEFAULT_APPS) if (exists(p)) return p;
  return null;
}

/** 在 app 内定位包含 main-window.html 的前端目录。 */
function findFrontend(appPath) {
  if (!appPath) return null;

  const resources = path.join(appPath, "Contents", "Resources");
  if (!exists(resources)) return null;

  const hasLauncher = (dir) => exists(path.join(dir, "main-window.html"));

  // Raycast 把前端放在某个 .bundle 里；逐个试，比递归整棵树快得多。
  let entries = [];
  try {
    entries = fs.readdirSync(resources, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const e of entries) {
    if (!e.isDirectory() || !e.name.endsWith(".bundle")) continue;
    const dir = path.join(resources, e.name, "Contents", "Resources", "frontend");
    if (hasLauncher(dir)) return dir;
  }

  // 兜底：老版本可能直接放在 Resources/frontend
  const flat = path.join(resources, "frontend");
  return hasLauncher(flat) ? flat : null;
}

function readVersion(appPath) {
  if (!appPath) return null;
  const plist = path.join(appPath, "Contents", "Info.plist");
  if (!exists(plist)) return null;
  try {
    return execFileSync("/usr/bin/plutil", ["-extract", "CFBundleShortVersionString", "raw", "-o", "-", plist], {
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

/** 一次拿到全部信息，调用方不用重复探测。 */
function resolve(explicitApp) {
  const app = findApp(explicitApp);
  const frontend = findFrontend(app);
  return { app, frontend, version: readVersion(app) };
}

module.exports = { findApp, findFrontend, readVersion, resolve };

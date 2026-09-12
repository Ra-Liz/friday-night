#!/usr/bin/env bash
# FridayNight 一键部署：单测 → 构建 → 提交 main → 更新 gh-pages → 推送
# 用法：./deploy.sh "本次更新说明"
# 说明：TMPDIR 可重定向临时目录；
#       本机 npm 不在 PATH 时，可用 NPM_CLI=<npm-cli.js 绝对路径> 指定引导入口
#       （路径含空格安全；默认直接用 npm）。
set -euo pipefail
cd "$(dirname "$0")"

MSG="${1:-update: 同步更新}"
if [ -n "${NPM_CLI:-}" ]; then
  npm_cmd() { node "$NPM_CLI" "$@"; }
else
  npm_cmd() { npm "$@"; }
fi

echo "=== 1/4 单测 ==="
npm_cmd test

echo "=== 2/4 构建 ==="
npm_cmd run build

echo "=== 3/4 提交并推送 main ==="
git add -A
git commit -m "$MSG" || echo "(main 无变更，跳过提交)"
git push origin main

echo "=== 4/4 更新并推送 gh-pages（worktree 干净构建）==="
TMP="$(mktemp -d)"
trap 'git worktree remove --force "$TMP/gh" 2>/dev/null || true; rm -rf "$TMP"' EXIT
git worktree add --detach "$TMP/gh" gh-pages
find "$TMP/gh" -mindepth 1 -maxdepth 1 -not -name .git -exec rm -rf {} +
cp -R dist/. "$TMP/gh/"
printf 'node_modules/\n' > "$TMP/gh/.gitignore"
git -C "$TMP/gh" add -A
git -C "$TMP/gh" commit -m "deploy: $MSG" || echo "(gh-pages 无变更，跳过提交)"
git -C "$TMP/gh" push origin HEAD:gh-pages

echo "✅ 部署完成：https://ra-liz.github.io/friday-night/"

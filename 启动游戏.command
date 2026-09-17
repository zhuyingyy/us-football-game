#!/bin/bash
set -e
cd "$(dirname "$0")"

# Prefer the user's Node installation; use the desktop runtime when available.
game_runtime="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies"
if ! command -v node >/dev/null 2>&1 && [ -x "$game_runtime/node/bin/node" ]; then
  export PATH="$game_runtime/node/bin:$PATH"
fi
if command -v pnpm >/dev/null 2>&1; then
  game_pm="$(command -v pnpm)"
elif [ -x "$game_runtime/bin/fallback/pnpm" ]; then
  game_pm="$game_runtime/bin/fallback/pnpm"
elif command -v npm >/dev/null 2>&1; then
  game_pm="$(command -v npm)"
else
  echo '请先安装 Node.js 22.18 或更高版本，再重新双击此文件。'
  read -r -p '按回车退出。'
  exit 1
fi
if [ ! -d node_modules ]; then "$game_pm" install; fi
if [[ "$game_pm" == *pnpm ]]; then
  exec "$game_pm" run dev --open
else
  exec "$game_pm" run dev -- --open
fi

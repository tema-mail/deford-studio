#!/bin/bash
# Принимающая сторона выкладки (ключ GitHub Actions в authorized_keys пользователя deford-deploy, command=этот скрипт).
# Разрешено только: rsync в /opt/deford-site/incoming (через rrsync), «activate <коммит>», «rollback», «status».
set -euo pipefail
ROOT=/opt/deford-site
REL="$ROOT/releases"
KEEP=5
cmd="${SSH_ORIGINAL_COMMAND:-}"

switch_to() { # атомарно переключить current на выкладку $1
  ln -sfn "$1" "$REL/.current.tmp"
  mv -Tf "$REL/.current.tmp" "$REL/current"
}

case "$cmd" in
  "rsync --server"*)
    exec /usr/bin/rrsync "$ROOT"
    ;;
  activate\ *)
    sha="${cmd#activate }"
    [[ "$sha" =~ ^[0-9a-f]{7,40}$ ]] || { echo "неверный коммит" >&2; exit 1; }
    [ -f "$ROOT/incoming/index.html" ] || { echo "нет загруженной сборки" >&2; exit 1; }
    rm -rf "${REL:?}/$sha"
    mv "$ROOT/incoming" "$REL/$sha"
    chmod -R a+rX "$REL/$sha"
    switch_to "$sha"
    echo "$sha" >> "$REL/history"
    # хранить последние $KEEP выкладок; файлы общие через жёсткие ссылки, место занимает только изменённое
    keep=$(tac "$REL/history" | awk '!seen[$0]++' | head -n "$KEEP")
    for d in "$REL"/*/; do
      name=$(basename "$d")
      [ "$name" = current ] && continue
      grep -qx "$name" <<<"$keep" || rm -rf "${REL:?}/$name"
    done
    echo "выложен $sha"
    ;;
  rollback)
    cur=$(readlink "$REL/current")
    prev=$(tac "$REL/history" | awk '!seen[$0]++' | grep -vx "$cur" | head -n 1)
    [ -n "$prev" ] && [ -d "$REL/$prev" ] || { echo "откатываться некуда" >&2; exit 1; }
    switch_to "$prev"
    echo "$prev" >> "$REL/history"
    echo "откат на $prev"
    ;;
  status)
    echo "текущая: $(readlink "$REL/current")"
    echo "выкладки: $(find "$REL" -mindepth 1 -maxdepth 1 -type d -printf '%f ' 2>/dev/null)"
    ;;
  *)
    echo "команда запрещена" >&2
    exit 1
    ;;
esac

#!/bin/zsh
# Разовая установка сайта Дефорда на FirstVDS 168.113.179.49 (повторный запуск безопасен):
# пользователь выкладки с ограниченным ключом, папки, контейнер, блок в общем Caddy (с проверкой и откатом).
# Сами выкладки делает GitHub Actions (.github/workflows/deploy.yml) – этот скрипт их не запускает.
set -euo pipefail
HOST="firstvds-msk"   # ~/.ssh/config: root@168.113.179.49
DEPLOY_PUB="${DEPLOY_PUB:?нужен путь к открытому ключу выкладки}"
HERE="$(cd "$(dirname "$0")" && pwd)"
SSH=(ssh -o BatchMode=yes "$HOST")

# 1. Пользователь и папки; ключ выкладки может только то, что разрешает receive.sh
"${SSH[@]}" "id deford-deploy >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash deford-deploy
  mkdir -p /opt/deford-site/releases /home/deford-deploy/.ssh
  chown deford-deploy:deford-deploy /opt/deford-site /opt/deford-site/releases
  chmod 755 /opt/deford-site /opt/deford-site/releases"
scp -q "$HERE/receive.sh" "$HOST:/usr/local/bin/deford-receive"
scp -q "$HERE/compose.yml" "$HERE/nginx.conf" "$HOST:/opt/deford-site/"
"${SSH[@]}" "chmod 755 /usr/local/bin/deford-receive && chown root:root /usr/local/bin/deford-receive
  printf 'command=\"/usr/local/bin/deford-receive\",restrict %s\n' \"$(cat "$DEPLOY_PUB")\" > /home/deford-deploy/.ssh/authorized_keys
  chown -R deford-deploy:deford-deploy /home/deford-deploy/.ssh && chmod 700 /home/deford-deploy/.ssh && chmod 600 /home/deford-deploy/.ssh/authorized_keys
  cd /opt/deford-site && docker compose up -d --remove-orphans >/dev/null && docker ps --filter name=deford-site-web --format '{{.Names}} {{.Status}} порты:[{{.Ports}}]'"

# 2. Блок в общем Caddy: только при парных метках, с проверкой конфигурации и откатом при неудачной перезагрузке
cat "$HERE/deford.caddy" | "${SSH[@]}" '
  set -e
  F=/opt/caddy/Caddyfile
  BAK="$F.bak-deford-site-$(date +%Y%m%d%H%M%S)"
  cp "$F" "$BAK"
  [ "$(grep -c "^# >>> deford-site" "$F")" = "$(grep -c "^# <<< deford-site" "$F")" ] || { echo "Caddy: метки без пары, файл не изменён" >&2; exit 1; }
  awk "/^# >>> deford-site/{skip=1} !skip{print} /^# <<< deford-site/{skip=0}" "$F" > /tmp/Caddyfile.deford
  cat >> /tmp/Caddyfile.deford
  if docker exec -i caddy caddy validate --adapter caddyfile --config /dev/stdin < /tmp/Caddyfile.deford >/tmp/caddy-validate-deford.log 2>&1; then
    cat /tmp/Caddyfile.deford > "$F"
    if docker exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile; then
      echo "Caddy: блок deford-site применён"
    else
      cat "$BAK" > "$F"; docker exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile || true
      echo "Caddy: перезагрузка не прошла, прежний файл возвращён" >&2; exit 1
    fi
  else
    echo "Caddy: проверка не прошла, файл не изменён" >&2; tail -5 /tmp/caddy-validate-deford.log >&2; exit 1
  fi'

# 3. Порт 80 держит nginx ispmanager: http → https кодом 301 (308 Яндекс не склеивает)
"${SSH[@]}" "cat > /etc/nginx/conf.d/deford.conf <<'NGINX'
# deford.ru: http → https 301; ставит deploy/install.sh репозитория deford-studio
server { listen 80; listen [::]:80; server_name deford.ru www.deford.ru; location / { return 301 https://deford.ru\$request_uri; } }
NGINX
nginx -t 2>&1 | tail -1 && systemctl reload nginx"

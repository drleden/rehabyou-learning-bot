#!/usr/bin/env bash
# =============================================================================
#  setup-nginx.sh — Nginx + Cloudflare SSL setup for learn.rehabyou.site
#
#  Run on the VPS as root:
#    bash /opt/rehabyou/scripts/setup-nginx.sh
#
#  Prerequisites:
#    - Cloudflare DNS is pointing to this server
#    - Cloudflare SSL mode is set to "Full" or "Full (strict)"
#    - Docker containers are running (docker compose up -d)
# =============================================================================
set -euo pipefail

DOMAIN="learn.rehabyou.site"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
NGINX_CONF_SRC="$REPO_DIR/nginx/$DOMAIN.conf"
NGINX_CONF_DEST="/etc/nginx/sites-available/$DOMAIN"
SSL_DIR="/etc/nginx/ssl"
CERT_FILE="$SSL_DIR/$DOMAIN.pem"
KEY_FILE="$SSL_DIR/$DOMAIN.key"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*"; exit 1; }

[[ $EUID -ne 0 ]] && err "Запусти от root: sudo bash setup-nginx.sh"

# ── 1. Install nginx ──────────────────────────────────────────────────────────
if ! command -v nginx &>/dev/null; then
    log "Установка nginx..."
    apt-get update -qq && apt-get install -y -qq nginx
else
    log "Nginx уже установлен: $(nginx -v 2>&1)"
fi

# ── 2. SSL directory ──────────────────────────────────────────────────────────
log "Создание директории SSL: $SSL_DIR"
mkdir -p "$SSL_DIR"
chmod 700 "$SSL_DIR"

# ── 3. Cloudflare Origin Certificate ─────────────────────────────────────────
echo ""
echo -e "${YELLOW}════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  Cloudflare Origin Certificate${NC}"
echo -e "${YELLOW}════════════════════════════════════════════════════════${NC}"
echo ""
echo "  1. Откройте Cloudflare Dashboard → rehabyou.site"
echo "  2. SSL/TLS → Origin Server → Create Certificate"
echo "  3. Тип ключа: RSA (2048), срок: 15 лет"
echo "  4. Нажмите Create и скопируйте сертификат и ключ"
echo ""

if [[ -f "$CERT_FILE" && -f "$KEY_FILE" ]]; then
    warn "Сертификаты уже существуют: $CERT_FILE"
    read -rp "Перезаписать? [y/N] " ans
    [[ "${ans,,}" != "y" ]] && log "Используем существующие сертификаты" || {
        echo ""
        echo "Вставьте Origin Certificate (-----BEGIN CERTIFICATE-----) и нажмите Enter+Ctrl+D:"
        cat > "$CERT_FILE"
        echo ""
        echo "Вставьте Private Key (-----BEGIN RSA PRIVATE KEY-----) и нажмите Enter+Ctrl+D:"
        cat > "$KEY_FILE"
    }
else
    echo "Вставьте Origin Certificate (-----BEGIN CERTIFICATE-----) и нажмите Enter+Ctrl+D:"
    cat > "$CERT_FILE"
    echo ""
    echo "Вставьте Private Key (-----BEGIN RSA PRIVATE KEY-----) и нажмите Enter+Ctrl+D:"
    cat > "$KEY_FILE"
fi

chmod 644 "$CERT_FILE"
chmod 600 "$KEY_FILE"
log "Сертификаты сохранены"

# ── 4. Nginx config ───────────────────────────────────────────────────────────
log "Копирование nginx конфига..."
cp "$NGINX_CONF_SRC" "$NGINX_CONF_DEST"

# Enable site, disable default
ln -sf "$NGINX_CONF_DEST" "/etc/nginx/sites-enabled/$DOMAIN"
rm -f /etc/nginx/sites-enabled/default

# ── 5. Test & reload ──────────────────────────────────────────────────────────
log "Проверка конфига nginx..."
nginx -t

log "Перезапуск nginx..."
systemctl enable nginx
systemctl reload nginx

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Nginx настроен для $DOMAIN${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Конфиг : ${YELLOW}$NGINX_CONF_DEST${NC}"
echo -e "  Cert   : ${YELLOW}$CERT_FILE${NC}"
echo -e "  Key    : ${YELLOW}$KEY_FILE${NC}"
echo ""
echo -e "${YELLOW}Убедитесь что в Cloudflare выбран режим SSL: Full (strict)${NC}"
echo ""
echo "  Проверка:"
echo "  curl -I https://$DOMAIN/health"
echo ""

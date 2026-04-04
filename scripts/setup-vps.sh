#!/usr/bin/env bash
# =============================================================================
#  Rehab.You Learning — VPS Setup Script
#  Tested on: Ubuntu 22.04 / 24.04
#  Run as root: bash setup-vps.sh
# =============================================================================
set -euo pipefail

REPO_URL="https://github.com/drleden/rehabyou-learning-bot.git"
DEPLOY_DIR="/opt/rehabyou"
DEPLOY_USER="deploy"
DOMAIN="learn.rehabyou.site"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*"; exit 1; }

[[ $EUID -ne 0 ]] && err "Запусти скрипт от root: sudo bash setup-vps.sh"

# ── 1. System update ──────────────────────────────────────────────────────────
log "Обновление системы..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  curl wget git ufw fail2ban htop \
  ca-certificates gnupg lsb-release apt-transport-https

# ── 2. Docker CE ──────────────────────────────────────────────────────────────
log "Установка Docker CE..."
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) \
  signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -qq
apt-get install -y -qq \
  docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker
log "Docker $(docker --version)"
log "Docker Compose $(docker compose version)"

# ── 3. Deploy user ────────────────────────────────────────────────────────────
log "Создание пользователя $DEPLOY_USER..."
if ! id "$DEPLOY_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"

# SSH-каталог для deploy (GitHub Actions будет деплоить через него)
mkdir -p /home/$DEPLOY_USER/.ssh
chmod 700 /home/$DEPLOY_USER/.ssh
touch /home/$DEPLOY_USER/.ssh/authorized_keys
chmod 600 /home/$DEPLOY_USER/.ssh/authorized_keys
chown -R $DEPLOY_USER:$DEPLOY_USER /home/$DEPLOY_USER/.ssh

# ── 4. SSH hardening ──────────────────────────────────────────────────────────
log "Настройка SSH..."
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/'    /etc/ssh/sshd_config
sed -i 's/PermitRootLogin yes/PermitRootLogin prohibit-password/'     /etc/ssh/sshd_config
sed -i 's/#MaxAuthTries 6/MaxAuthTries 5/'                            /etc/ssh/sshd_config
systemctl reload sshd

# ── 5. Firewall (ufw) ────────────────────────────────────────────────────────
log "Настройка UFW..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    comment "SSH"
ufw allow 80/tcp    comment "HTTP"
ufw allow 443/tcp   comment "HTTPS"
ufw --force enable
ufw status verbose

# ── 6. Fail2ban ───────────────────────────────────────────────────────────────
log "Настройка fail2ban..."
cat > /etc/fail2ban/jail.local <<'EOF'
[sshd]
enabled  = true
port     = ssh
maxretry = 5
bantime  = 3600
findtime = 600
EOF
systemctl enable --now fail2ban

# ── 7. Clone repository ───────────────────────────────────────────────────────
log "Клонирование репозитория в $DEPLOY_DIR..."
if [[ -d "$DEPLOY_DIR" ]]; then
  warn "Папка $DEPLOY_DIR уже существует — пропускаем клонирование."
else
  git clone "$REPO_URL" "$DEPLOY_DIR"
fi
chown -R $DEPLOY_USER:$DEPLOY_USER "$DEPLOY_DIR"

# ── 8. Create .env ────────────────────────────────────────────────────────────
ENV_FILE="$DEPLOY_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  warn ".env уже существует — не перезаписываем."
else
  log "Создание .env из .env.example..."
  cp "$DEPLOY_DIR/.env.example" "$ENV_FILE"
  warn "ВАЖНО: отредактируй $ENV_FILE и заполни все переменные!"
fi
chmod 600 "$ENV_FILE"
chown $DEPLOY_USER:$DEPLOY_USER "$ENV_FILE"

# ── 9. Generate SSH key for GitHub Actions ────────────────────────────────────
log "Генерация SSH-ключа для GitHub Actions..."
KEY_FILE="/home/$DEPLOY_USER/.ssh/github_actions_deploy"
if [[ ! -f "$KEY_FILE" ]]; then
  ssh-keygen -t ed25519 -C "github-actions-deploy@rehabyou" \
    -f "$KEY_FILE" -N ""
  cat "${KEY_FILE}.pub" >> /home/$DEPLOY_USER/.ssh/authorized_keys
  chown $DEPLOY_USER:$DEPLOY_USER "$KEY_FILE" "${KEY_FILE}.pub"
fi

# ── 10. Sudoers for deploy (docker compose only) ─────────────────────────────
log "Настройка sudoers для $DEPLOY_USER..."
cat > /etc/sudoers.d/deploy <<EOF
$DEPLOY_USER ALL=(ALL) NOPASSWD: /usr/bin/docker, /usr/libexec/docker/cli-plugins/docker-compose
EOF
chmod 440 /etc/sudoers.d/deploy

# ── 11. Systemd service for auto-start ───────────────────────────────────────
log "Создание systemd-сервиса rehabyou..."
cat > /etc/systemd/system/rehabyou.service <<EOF
[Unit]
Description=Rehab.You Learning Platform
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$DEPLOY_DIR
EnvironmentFile=$DEPLOY_DIR/.env
ExecStart=/usr/bin/docker compose up -d --remove-orphans
ExecStop=/usr/bin/docker compose down
User=$DEPLOY_USER
Group=docker
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable rehabyou

# ── 12. Daily DB backup script ───────────────────────────────────────────────
log "Создание скрипта бэкапа БД..."
mkdir -p /opt/backups/rehabyou
cat > /usr/local/bin/rehabyou-backup.sh <<'BACKUP'
#!/usr/bin/env bash
set -e
BACKUP_DIR="/opt/backups/rehabyou"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILE="$BACKUP_DIR/db_$TIMESTAMP.sql.gz"

source /opt/rehabyou/.env

docker exec rehabyou-db-1 pg_dump \
  -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > "$FILE"

# Keep last 30 days
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete

echo "Backup saved: $FILE"
BACKUP
chmod +x /usr/local/bin/rehabyou-backup.sh

# Cron: every day at 03:00
(crontab -l 2>/dev/null; echo "0 3 * * * /usr/local/bin/rehabyou-backup.sh >> /var/log/rehabyou-backup.log 2>&1") \
  | sort -u | crontab -

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Установка завершена!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Деплой-директория : ${YELLOW}$DEPLOY_DIR${NC}"
echo -e "  .env файл          : ${YELLOW}$ENV_FILE${NC}"
echo -e "  Deploy user        : ${YELLOW}$DEPLOY_USER${NC}"
echo ""
echo -e "${YELLOW}Следующие шаги:${NC}"
echo ""
echo "  1. Заполни .env на сервере:"
echo "     nano $ENV_FILE"
echo ""
echo "  2. Добавь приватный ключ GitHub Actions secrets:"
echo "     → VPS_SSH_KEY  (содержимое файла ниже)"
echo "     → VPS_HOST     = 94.228.124.182"
echo "     → VPS_USER     = $DEPLOY_USER"
echo "     → DEPLOY_PATH  = $DEPLOY_DIR"
echo ""
echo -e "${YELLOW}Приватный ключ для GitHub Actions:${NC}"
echo "──────────────────────────────────"
cat "$KEY_FILE"
echo "──────────────────────────────────"
echo ""
echo "  3. Первый запуск:"
echo "     cd $DEPLOY_DIR && docker compose up -d"
echo "     docker compose exec backend alembic upgrade head"
echo ""

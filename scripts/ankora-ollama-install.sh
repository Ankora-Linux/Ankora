#!/bin/bash
# ==============================================================================
# Ankora Linux · Ollama yerel model motoru kurulum yardımcısı
#   - Resmî sürüm arşivini indirir, sha256 özetiyle doğrular
#   - /usr/local içine kurar, SysVinit servisini oluşturur ve başlatır
#   Kullanım: ankora-ollama-install            (root ya da sudo -n ile)
# ==============================================================================
set -euo pipefail

LOG_FILE="/var/log/ankora-ollama-install.log"
OLLAMA_BIN="/usr/local/bin/ollama"
SERVICE="/etc/init.d/ollama"
OLLAMA_USER="ollama"
OLLAMA_HOME="/usr/share/ollama"
OLLAMA_HOST="127.0.0.1:11434"

log() {
    echo "$*"
    echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') $*" >> "$LOG_FILE" 2>/dev/null || true
}

if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
        exec sudo -n "$0" "$@"
    fi
    echo "[HATA] Bu işlem yönetici (root) yetkisi gerektirir." >&2
    exit 1
fi

for dep in curl tar sha256sum; do
    if ! command -v "$dep" >/dev/null 2>&1; then
        echo "[HATA] Gerekli araç bulunamadı: $dep" >&2
        exit 1
    fi
done

if [ -x "$OLLAMA_BIN" ] && "$OLLAMA_BIN" --version >/dev/null 2>&1; then
    log "[OLLAMA] Ollama zaten kurulu: $("$OLLAMA_BIN" --version 2>&1 | head -n1)"
    if [ -x "$SERVICE" ]; then
        "$SERVICE" start >/dev/null 2>&1 || true
    fi
    exit 0
fi

case "$(uname -m)" in
    x86_64|amd64) ARCH="amd64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *)
        echo "[HATA] Desteklenmeyen mimari: $(uname -m)" >&2
        exit 1
        ;;
esac

log "[OLLAMA] Sürüm bilgisi alınıyor..."
API_JSON="$(curl -fsSL --max-time 30 https://api.github.com/repos/ollama/ollama/releases/latest)"
ASSET="ollama-linux-${ARCH}.tgz"
URL="$(printf '%s' "$API_JSON" | grep -o "https://[^\"]*${ASSET}\"" | head -n1 | tr -d '"')"
SUM_URL="$(printf '%s' "$API_JSON" | grep -o 'https://[^"]*sha256sum.txt"' | head -n1 | tr -d '"')"

if [ -z "$URL" ]; then
    echo "[HATA] Ollama ${ASSET} indirme bağlantısı bulunamadı (ağ ya da GitHub API sınırı)." >&2
    exit 1
fi

TMP_DIR="$(mktemp -d /tmp/ankora-ollama.XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

log "[OLLAMA] İndiriliyor: $URL"
curl -fL --retry 2 --max-time 900 -o "$TMP_DIR/$ASSET" "$URL"

if [ -z "$SUM_URL" ]; then
    echo "[HATA] Güvenlik: Ollama sürümünde sha256sum.txt bulunamadı; doğrulamasız kurulum engellendi." >&2
    exit 1
fi
log "[OLLAMA] sha256 özeti doğrulanıyor..."
curl -fsSL --max-time 60 -o "$TMP_DIR/sha256sum.txt" "$SUM_URL"
EXPECTED="$(grep " ${ASSET}\$" "$TMP_DIR/sha256sum.txt" | awk '{print $1}' | head -n1)"
ACTUAL="$(sha256sum "$TMP_DIR/$ASSET" | awk '{print $1}')"
if [ -z "$EXPECTED" ] || [ "$EXPECTED" != "$ACTUAL" ]; then
    echo "[HATA] sha256 doğrulaması başarısız; kurulum durduruldu." >&2
    exit 1
fi

log "[OLLAMA] Arşiv açılıyor..."
tar -xzf "$TMP_DIR/$ASSET" -C /usr/local
chmod 0755 "$OLLAMA_BIN"

if ! id "$OLLAMA_USER" >/dev/null 2>&1; then
    useradd -r -s /bin/false -d "$OLLAMA_HOME" "$OLLAMA_USER" 2>/dev/null || true
fi
mkdir -p "$OLLAMA_HOME"
chown -R "$OLLAMA_USER":"$OLLAMA_USER" "$OLLAMA_HOME" 2>/dev/null || true

cat > "$SERVICE" <<'OLLAMASERVICE'
#!/bin/sh
### BEGIN INIT INFO
# Provides:          ollama
# Required-Start:    $local_fs $network
# Required-Stop:     $local_fs
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
# Short-Description: Ollama yerel dil modeli servisi
### END INIT INFO

DAEMON=/usr/local/bin/ollama
PIDFILE=/var/run/ollama.pid
LOGFILE=/var/log/ollama.log

case "$1" in
  start)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "ollama zaten çalışıyor"
      exit 0
    fi
    OLLAMA_HOST=127.0.0.1:11434 OLLAMA_MODELS=/usr/share/ollama/.ollama/models \
      start-stop-daemon --start --background --quiet --make-pidfile --pidfile "$PIDFILE" \
      --chuid ollama:ollama --exec /usr/bin/env -- \
      sh -c "OLLAMA_HOST=127.0.0.1:11434 OLLAMA_MODELS=/usr/share/ollama/.ollama/models exec $DAEMON serve >>$LOGFILE 2>&1"
    ;;
  stop)
    start-stop-daemon --stop --quiet --retry 5 --pidfile "$PIDFILE" 2>/dev/null || true
    rm -f "$PIDFILE"
    ;;
  status)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "ollama çalışıyor"
    else
      echo "ollama durduruldu"
    fi
    ;;
  restart|force-reload)
    "$0" stop
    sleep 1
    "$0" start
    ;;
  *)
    echo "Kullanım: $0 {start|stop|restart|status}" >&2
    exit 1
    ;;
esac
exit 0
OLLAMASERVICE
chmod 0755 "$SERVICE"
update-rc.d ollama defaults 80 20 >/dev/null 2>&1 || true

log "[OLLAMA] Servis başlatılıyor..."
"$SERVICE" start >/dev/null 2>&1 || true

for _ in $(seq 1 30); do
    if curl -fsS --max-time 2 "http://${OLLAMA_HOST}/api/tags" >/dev/null 2>&1; then
        log "[OLLAMA] Kurulum tamamlandı; servis ${OLLAMA_HOST} üzerinde yanıt veriyor."
        exit 0
    fi
    sleep 1
done

echo "[UYARI] Servis başlatıldı ancak ${OLLAMA_HOST} henüz yanıt vermedi; /var/log/ollama.log dosyasına bakın." >&2
exit 0

#!/bin/bash
# ==============================================================================
# Ankora Linux · Ollama yerel model motoru kurulum yardımcısı
#   - Resmî sürüm arşivini (.tar.zst / .tgz) indirir, sha256 özetiyle doğrular
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
    for _ in $(seq 1 15); do
        if curl -fsS --max-time 2 "http://${OLLAMA_HOST}/api/tags" >/dev/null 2>&1; then
            exit 0
        fi
        sleep 1
    done
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

fetch_file() {
    local out="$1" url="$2" tmax="${3:-120}"
    if curl -fL --proto '=https' --tlsv1.2 --retry 3 --retry-delay 2 --connect-timeout 15 --max-time "$tmax" -o "$out" "$url"; then
        return 0
    fi
    curl -4 -fL --proto '=https' --tlsv1.2 --retry 3 --retry-delay 2 --connect-timeout 15 --max-time "$tmax" -o "$out" "$url"
}

TMP_DIR="$(mktemp -d /tmp/ankora-ollama.XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

# GitHub REST API saatlik hız sınırına takılmamak için resmî releases/latest/download
# yönlendirmesi kullanılır; bütünlük yine aynı sürümün sha256sum.txt dosyasıyla doğrulanır.
BASE_DL="https://github.com/ollama/ollama/releases/latest/download"
SUM_URL="${BASE_DL}/sha256sum.txt"

log "[OLLAMA] Sürüm doğrulama listesi indiriliyor..."
if ! fetch_file "$TMP_DIR/sha256sum.txt" "$SUM_URL" 60; then
    echo "[HATA] Ollama sha256sum.txt indirilemedi. İnternet bağlantısını kontrol edin." >&2
    exit 1
fi

ASSET="ollama-linux-${ARCH}.tar.zst"
EXPECTED="$(awk -v a="$ASSET" '{gsub(/\r/, ""); f=$2; sub(/^\.\//, "", f); sub(/^\*/, "", f); if (f == a) { print $1; exit }}' "$TMP_DIR/sha256sum.txt")"
if [ -z "$EXPECTED" ]; then
    ASSET="ollama-linux-${ARCH}.tgz"
    EXPECTED="$(awk -v a="$ASSET" '{gsub(/\r/, ""); f=$2; sub(/^\.\//, "", f); sub(/^\*/, "", f); if (f == a) { print $1; exit }}' "$TMP_DIR/sha256sum.txt")"
fi

if [ -z "$EXPECTED" ]; then
    echo "[HATA] Sürüm listesinde ollama-linux-${ARCH} arşivi ve sha256 özeti bulunamadı." >&2
    exit 1
fi

if [[ "$ASSET" == *.tar.zst ]] && ! command -v zstd >/dev/null 2>&1; then
    log "[OLLAMA] zstd sıkıştırma aracı kuruluyor..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get -o Acquire::Retries=3 -o Acquire::ForceIPv4=true update -qq >/dev/null 2>&1 || apt-get update -qq >/dev/null 2>&1 || true
    apt-get -o DPkg::Lock::Timeout=30 -o Acquire::Retries=3 install -y --no-install-recommends zstd >/dev/null 2>&1 \
        || apt-get -o DPkg::Lock::Timeout=30 -o Acquire::ForceIPv4=true install -y --no-install-recommends zstd >/dev/null 2>&1 \
        || true
    if ! command -v zstd >/dev/null 2>&1; then
        echo "[HATA] .tar.zst arşivini açmak için 'zstd' kurulamadı." >&2
        exit 1
    fi
fi

URL="${BASE_DL}/${ASSET}"
log "[OLLAMA] İndiriliyor: ${ASSET}"
if ! fetch_file "$TMP_DIR/$ASSET" "$URL" 900; then
    echo "[HATA] Ollama arşivi indirilemedi (${URL})." >&2
    exit 1
fi

log "[OLLAMA] sha256 özeti doğrulanıyor..."
ACTUAL="$(sha256sum "$TMP_DIR/$ASSET" | awk '{print $1}')"
if [ -z "$ACTUAL" ] || [ "$EXPECTED" != "$ACTUAL" ]; then
    echo "[HATA] sha256 doğrulaması başarısız; kurulum durduruldu (beklenen: $EXPECTED, alınan: ${ACTUAL:-yok})." >&2
    exit 1
fi

log "[OLLAMA] Arşiv /usr/local altına açılıyor..."
rm -rf /usr/local/lib/ollama
mkdir -p /usr/local/bin /usr/local/lib/ollama
if [[ "$ASSET" == *.tar.zst ]]; then
    zstd -d -c "$TMP_DIR/$ASSET" | tar -xf - -C /usr/local
else
    tar -xzf "$TMP_DIR/$ASSET" -C /usr/local
fi

if [ ! -x "$OLLAMA_BIN" ] && [ -x /usr/local/ollama ]; then
    mv -f /usr/local/ollama "$OLLAMA_BIN"
fi
if [ ! -f "$OLLAMA_BIN" ]; then
    echo "[HATA] Arşiv açıldı ancak /usr/local/bin/ollama bulunamadı." >&2
    exit 1
fi
chmod 0755 "$OLLAMA_BIN"

if ! id "$OLLAMA_USER" >/dev/null 2>&1; then
    useradd -r -s /bin/false -d "$OLLAMA_HOME" "$OLLAMA_USER" 2>/dev/null || true
fi
mkdir -p "${OLLAMA_HOME}/.ollama/models"
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
    mkdir -p /usr/share/ollama/.ollama/models
    chown -R ollama:ollama /usr/share/ollama 2>/dev/null || true
    touch "$LOGFILE"
    chown ollama:ollama "$LOGFILE" 2>/dev/null || true
    chmod 0640 "$LOGFILE" 2>/dev/null || true
    start-stop-daemon --start --background --quiet --make-pidfile --pidfile "$PIDFILE" \
      --chuid ollama:ollama --exec /usr/bin/env -- \
      sh -c "HOME=/usr/share/ollama OLLAMA_HOST=127.0.0.1:11434 OLLAMA_ORIGINS='*' OLLAMA_MODELS=/usr/share/ollama/.ollama/models exec $DAEMON serve >>$LOGFILE 2>&1"
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
"$SERVICE" restart >/dev/null 2>&1 || "$SERVICE" start >/dev/null 2>&1 || true

for _ in $(seq 1 30); do
    if curl -fsS --max-time 2 "http://${OLLAMA_HOST}/api/tags" >/dev/null 2>&1; then
        log "[OLLAMA] Kurulum tamamlandı; servis ${OLLAMA_HOST} üzerinde yanıt veriyor."
        exit 0
    fi
    sleep 1
done

echo "[HATA] Ollama kuruldu ancak servis ${OLLAMA_HOST} üzerinde yanıt vermedi (/var/log/ollama.log):" >&2
tail -n 20 /var/log/ollama.log >&2 2>/dev/null || true
exit 1

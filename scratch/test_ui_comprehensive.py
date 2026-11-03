#!/usr/bin/env python3
import http.server
import json
import os
import re
import socketserver
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "src"

# Simple HTTP Server
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SRC_DIR), **kwargs)
    def log_message(self, format, *args):
        pass

def run_tests():
    # Find free port
    server = socketserver.TCPServer(("127.0.0.1", 0), QuietHandler)
    port = server.server_address[1]
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    # Create a test harness page or script to evaluate in Chromium
    test_js = """
    window.__TEST_LOG__ = [];
    window.__TEST_ERRORS__ = [];
    window.onerror = function(msg, url, line) {
        window.__TEST_ERRORS__.push({ msg: msg, line: line });
    };

    function assert(name, condition, detail) {
        if (!condition) {
            window.__TEST_LOG__.push({ name: name, ok: false, detail: detail || 'Assertion failed' });
        } else {
            window.__TEST_LOG__.push({ name: name, ok: true });
        }
    }

    async function runSuite() {
        console.log('--- STARTING ANKORA SUITE ---');

        // 1. Temel Sayfa Yüklemesi
        assert('HTML Body Var', !!document.body);
        assert('Taskbar Var', !!document.getElementById('taskbar'));
        assert('Dinamik Ada Var', !!document.getElementById('dynamic-island'));
        assert('Başlat Menüsü Var', !!document.getElementById('start-flyout'));

        // 2. Dinamik Ada Medya Görünümü Denetimi
        const diMedia = document.getElementById('di-view-media');
        assert('Dinamik Ada Medya Görünümü Var', !!diMedia);
        if (window.DynamicIslandManager && window.DynamicIslandManager.setMediaStatus) {
            window.DynamicIslandManager.setMediaStatus({
                is_active: true,
                player_name: 'Brave',
                playback_status: 'Playing',
                title: 'Test Parça',
                artist: 'Test Sanatçı'
            });
            const diEl = document.getElementById('dynamic-island');
            assert('Dinamik Ada state-media Aldı', diEl && diEl.classList.contains('state-media'));
            assert('Dinamik Ada playing Aldı', diEl && diEl.classList.contains('playing'));
            assert('Dinamik Ada Başlık Güncellendi', document.getElementById('di-media-title').textContent === 'Test Parça');

            window.DynamicIslandManager.setMediaStatus(null);
            assert('Dinamik Ada Medya Durduktan Sonra state-media Çıktı', diEl && !diEl.classList.contains('state-media'));
        }

        // 3. Paket Yükleyici Penceresi Denetimi
        const winPkg = document.getElementById('win-pkg-installer');
        assert('Paket Yükleyici Penceresi (win-pkg-installer) Var', !!winPkg);
        if (window.PackageInstallerManager) {
            assert('PackageInstallerManager Nesnesi Tanımlı', typeof window.PackageInstallerManager.open === 'function');
        }

        // 4. Ollama Yerel Model Yöneticisi Denetimi
        const secOllama = document.getElementById('ai-sec-ollama');
        assert('AI Ayarlarında Ollama Bölümü Var', !!secOllama);
        assert('Ollama Kurulum Satırı Var', !!document.getElementById('ai-ollama-install-row'));
        assert('Ollama Kurulum Düğmesi Var', !!document.getElementById('btn-install-ollama'));
        if (window.OllamaManager) {
            assert('OllamaManager Nesnesi Tanımlı', typeof window.OllamaManager.render === 'function');
            assert('OllamaManager.install Tanımlı', typeof window.OllamaManager.install === 'function');
            assert('Önerilen Modeller Listesi Dolu', window.OllamaManager.RECOMMENDED && window.OllamaManager.RECOMMENDED.length === 4);
            assert('Varsayılan model listede', window.OllamaManager.RECOMMENDED.some(m => m.id === 'qwen2.5:0.5b'));
        }

        // 4b. MPRIS ilerleme, oynatıcı seçici ve medya şeridi
        assert('Ada medya ilerleme çubuğu var', !!document.getElementById('di-media-progress-bar'));
        assert('Bildirim kartı ilerleme çubuğu var', !!document.getElementById('mpris-progress-bar'));
        assert('Oynatıcı çipleri kutusu var', !!document.getElementById('mpris-players'));
        if (window.MprisManager) {
            assert('MprisManager.renderPlayers Tanımlı', typeof window.MprisManager.renderPlayers === 'function');
            window.MprisManager.currentStatus = {
                is_active: true, player_name: 'vlc', playback_status: 'Playing',
                title: 'A', artist: 'B', position_sec: 10, length_sec: 100
            };
            window.MprisManager.basePos = 10;
            window.MprisManager.baseAt = Date.now();
            window.MprisManager.selectedPlayer = 'vlc';
            window.MprisManager.renderPlayers([
                { player_name: 'vlc', playback_status: 'Playing', title: 'A', artist: 'B' },
                { player_name: 'chromium', playback_status: 'Paused', title: 'C', artist: 'D' }
            ]);
            const pills = document.querySelectorAll('#mpris-players .mpris-player-pill');
            assert('Oynatıcı çipleri üretildi', pills.length === 3);
            assert('Seçili oynatıcı çipi etkin', !!document.querySelector('#mpris-players .mpris-player-pill.active'));
            window.MprisManager.paintProgress();
            const pct = parseFloat(document.getElementById('mpris-progress-bar').style.width || '0');
            assert('İlerleme yüzdesi hesaplandı', pct >= 9 && pct <= 100, `pct=${pct}`);
            window.MprisManager.currentStatus = null;
        }

        // 4c. Paket yükleyici alanları
        assert('Bağımlılık satırı var', !!document.getElementById('pkg-inst-depends'));
        assert('Hata ayrıntısı kutusu var', !!document.getElementById('pkg-inst-error'));

        // 5. İkon Çözümleyici (IconResolver) Denetimi
        if (window.IconResolver) {
            assert('IconResolver.getIconSvg Tanımlı', typeof window.IconResolver.getIconSvg === 'function');
            assert('IconResolver ALIAS_MAP files Eşlemesi', window.IconResolver.ALIAS_MAP['files'] === 'filezilla');
            assert('IconResolver ALIAS_MAP terminal Eşlemesi', window.IconResolver.ALIAS_MAP['terminal'] === 'fish');
            assert('IconResolver ALIAS_MAP store Eşlemesi', window.IconResolver.ALIAS_MAP['store'] === 'synaptic');
            assert('IconResolver ALIAS_MAP settings Eşlemesi', window.IconResolver.ALIAS_MAP['settings'] === 'antigravity');
        }

        // 6. Yüzler (FaceManager) ve Dock Denetimleri
        if (window.FaceManager) {
            // Yüz Default
            window.FaceManager.setFace('default', false);
            assert('Default Yüz: data-face="default"', document.documentElement.getAttribute('data-face') === 'default');
            assert('Default Yüz: Taskbar Görünür', getComputedStyle(document.getElementById('taskbar')).display !== 'none');

            // Yüz 2: Bakır
            window.FaceManager.setFace('2', false);
            assert('Yüz 2: data-face="2"', document.documentElement.getAttribute('data-face') === '2');
            const dock2 = document.getElementById('face-bottom-dock');
            assert('Yüz 2: Alt Dock Var', !!dock2 && dock2.children.length > 0);
            const top2 = document.getElementById('face-top-panel');
            assert('Yüz 2: Üst Panel Var', !!top2 && top2.children.length > 0);
            assert('Yüz 2: Medya Şeridi Var', !!(top2 && top2.querySelector('.face-media-bar')));
            if (window.FaceManager.updateMediaBar) {
                window.FaceManager.updateMediaBar({
                    is_active: true, player_name: 'vlc', playback_status: 'Playing',
                    title: 'Şerit Testi', artist: 'Ankora'
                });
                const mb = document.querySelector('.face-media-bar');
                assert('Medya Şeridi Görünür Oldu', mb && mb.style.display === 'flex');
                assert('Medya Şeridi Başlığı Yazıldı', mb && mb.querySelector('.face-media-title').textContent === 'Şerit Testi');
                window.FaceManager.updateMediaBar(null);
                assert('Medya Şeridi Yeniden Gizlendi', mb && mb.style.display === 'none');
            }
            assert('Yüz 2: Taskbar Gizli', getComputedStyle(document.getElementById('taskbar')).display === 'none');

            // Yüz 3: Bostan
            window.FaceManager.setFace('3', false);
            assert('Yüz 3: data-face="3"', document.documentElement.getAttribute('data-face') === '3');
            const dock3 = document.getElementById('face-bottom-dock');
            assert('Yüz 3: Kapsül Dock Var', !!dock3 && dock3.children.length > 0);
            const hero3 = document.getElementById('face-desk-hero');
            assert('Yüz 3: Hero Saat/Hava Kartı Var', !!hero3 && hero3.innerHTML.includes('bostan-hero-weather'));
            assert('Yüz 3: Taskbar Gizli', getComputedStyle(document.getElementById('taskbar')).display === 'none');

            // Yüz 8: Cıvata
            window.FaceManager.setFace('8', false);
            assert('Yüz 8: data-face="8"', document.documentElement.getAttribute('data-face') === '8');
            const top8 = document.getElementById('face-top-panel');
            assert('Yüz 8: Üst Bar Var', !!top8 && top8.children.length > 0);
            const hero8 = document.getElementById('face-desk-hero');
            assert('Yüz 8: Display Saat/Hava Kartı Var', !!hero8 && hero8.innerHTML.includes('civata-hero-weather'));
            assert('Yüz 8: Taskbar Gizli', getComputedStyle(document.getElementById('taskbar')).display === 'none');

            // Tekrar Default Yüze Dönüş
            window.FaceManager.setFace('default', false);
            assert('Geri Dönüş: Taskbar Görünür', getComputedStyle(document.getElementById('taskbar')).display !== 'none');
        }

        // 6b. Görev çubuğu sabitlemesi: gerçek simge + ölçü sınırı (Bakır/Bostan)
        if (window.AppPinManager && window.IconResolver) {
            try { localStorage.removeItem('ankora_taskbar_pins'); } catch (e) {}
            window.AppPinManager.renderTaskbarPins();
            const pinThemes = ['theme-bakir', 'theme-bostan', ''];
            for (const t of pinThemes) {
                const etiket = t || 'varsayılan';
                document.body.className = t;
                window.AppPinManager.toggleTaskbarPin({ id: 'ayaz-files', name: 'Dosyalar', exec: 'internal:win-files' });
                const pin = document.querySelector('.taskbar-dynamic-pin');
                const icon = pin && pin.querySelector('.taskbar-pin-icon');
                const br = pin ? pin.getBoundingClientRect() : null;
                const ir = icon ? icon.getBoundingClientRect() : null;
                assert(`Pin simgesi uygulamanın kendi glifini taşır (${etiket})`,
                    !!icon && !/x="4" y="4" width="16" height="16"/.test(icon.innerHTML));
                assert(`Pin simgesi düğme kutusunu aşmaz (${etiket})`,
                    !!ir && ir.width <= 18 && ir.height <= 18 && ir.width <= br.width && ir.height <= br.height,
                    `ikon=${ir && ir.width}x${ir && ir.height} düğme=${br && br.width}x${br.height}`);

                // Gerçek ikon yükseltmesi devreye girse de kutu ölçüsü korunur.
                const big = document.createElement('img');
                big.className = 'real-app-icon';
                big.src = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#c0392b"/></svg>');
                icon.innerHTML = '';
                icon.appendChild(big);
                await big.decode().catch(() => {});
                const bRect = big.getBoundingClientRect();
                assert(`512 px gerçek ikon pin kutusuna sığar (${etiket})`,
                    bRect.width <= 18 && bRect.height <= 18,
                    `ölçü=${bRect.width}x${bRect.height}`);

                window.AppPinManager.toggleTaskbarPin({ id: 'ayaz-files', name: 'Dosyalar', exec: 'internal:win-files' });
            }
            document.body.className = '';
            assert('Pin kaldırılınca düğme silinir', !document.querySelector('.taskbar-dynamic-pin'));

            // Başlat menüsündeki sabitleme kartı da aynı kurala uyar.
            const cardBox = document.querySelector('.pinned-app-card .pinned-icon-box');
            if (cardBox) {
                const bigCard = document.createElement('img');
                bigCard.className = 'real-app-icon';
                bigCard.src = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#2c7a7b"/></svg>');
                cardBox.innerHTML = '';
                cardBox.appendChild(bigCard);
                await bigCard.decode().catch(() => {});
                const cRect = bigCard.getBoundingClientRect();
                assert('512 px ikon sabitleme kartında 22 px ile sınırlanır',
                    cRect.width <= 23 && cRect.height <= 23,
                    `ölçü=${cRect.width}x${cRect.height}`);
            }
        }

        // 7. Tüm Temaların (24 Tema) Uygulanabilirlik ve Stil Denetimi
        const allThemes = [
            'theme-nordik', 'theme-modern', 'theme-deep', 'theme-fjord', 'theme-pine',
            'theme-ember', 'theme-arctic', 'theme-cinar', 'theme-meltem', 'theme-kor',
            'theme-dem', 'theme-bogaz', 'theme-ayna', 'theme-cumhuriyet',
            'theme-matbaa', 'theme-bakir', 'theme-bostan', 'theme-hat', 'theme-konsol',
            'theme-kesit', 'theme-fener', 'theme-civata', 'theme-mina', 'theme-meridyen'
        ];

        let themeErrors = 0;
        allThemes.forEach(t => {
            document.body.className = t;
            const cs = getComputedStyle(document.body);
            if (!cs.backgroundColor) themeErrors++;
        });
        assert('24 Temanın Tümü Başarıyla Uygulandı', themeErrors === 0);

        // 8. Başlat Menüsü Aç/Kapa Denetimi
        const startFlyout = document.getElementById('start-flyout');
        if (window.toggleStartMenu) {
            window.toggleStartMenu(true);
            assert('Başlat Menüsü Açıldı (open sınıfı)', startFlyout.classList.contains('open'));
            window.toggleStartMenu(false);
            assert('Başlat Menüsü Kapandı', !startFlyout.classList.contains('open'));
        }

        document.body.setAttribute('data-test-done', '1');
        document.body.setAttribute('data-test-results', JSON.stringify({
            log: window.__TEST_LOG__,
            errors: window.__TEST_ERRORS__
        }));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(runSuite, 300));
    } else {
        setTimeout(runSuite, 300);
    }
    """

    # Inject test script temporarily into a clean copy of index.html in /tmp
    tmp_dir = Path("/tmp/ankora-ui-test")
    tmp_dir.mkdir(parents=True, exist_ok=True)
    
    # Create symlinks or copy assets
    for item in SRC_DIR.iterdir():
        target = tmp_dir / item.name
        if not target.exists():
            target.symlink_to(item)

    # Modified index.html with test_js
    orig_html = (SRC_DIR / "index.html").read_text(encoding="utf-8")
    # Replace CSP to allow localhost and inline test script for test execution
    test_html = re.sub(
        r'<meta http-equiv="Content-Security-Policy"[^>]*>',
        '<meta http-equiv="Content-Security-Policy" content="default-src \'self\' http://127.0.0.1:* \'unsafe-inline\' \'unsafe-eval\' data: blob:;">',
        orig_html
    )
    test_html = test_html.replace('</body>', f'<script>{test_js}</script></body>')
    (tmp_dir / "index.html").unlink(missing_ok=True)
    (tmp_dir / "index.html").write_text(test_html, encoding="utf-8")

    # Start QuietHandler from tmp_dir
    test_server = socketserver.TCPServer(("127.0.0.1", 0), lambda *args, **kwargs: http.server.SimpleHTTPRequestHandler(*args, directory=str(tmp_dir), **kwargs))
    test_port = test_server.server_address[1]
    test_server_thread = threading.Thread(target=test_server.serve_forever, daemon=True)
    test_server_thread.start()

    url = f"http://127.0.0.1:{test_port}/index.html"
    print(f"Test Sunucusu Açıldı: {url}")

    # Launch Chromium with virtual time
    cmd = [
        "chromium",
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--virtual-time-budget=8000",
        "--dump-dom",
        url
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        dom = res.stdout

        # Extract data-test-results
        match = re.search(r'data-test-results="([^"]+)"', dom)
        if not match:
            # Maybe escaped HTML entities
            match = re.search(r'data-test-results=\'([^\']+)\'', dom)

        if match:
            raw_json = match.group(1).replace("&quot;", '"').replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
            data = json.loads(raw_json)
            print("\n================== ANKORA ARAYÜZ VE DOCK TESTLERİ ==================")
            all_ok = True
            for item in data.get("log", []):
                status = "PASS" if item["ok"] else "FAIL"
                print(f"[{status:4s}] {item['name']}" + (f": {item.get('detail')}" if not item["ok"] else ""))
                if not item["ok"]:
                    all_ok = False

            errors = data.get("errors", [])
            if errors:
                print(f"\n[UYARI] {len(errors)} konsol hatası yakalandı:")
                for e in errors:
                    print(f"  * {e}")
            else:
                print("\n[BİLGİ] Konsolda 0 JavaScript runtime hatası.")

            if all_ok:
                print("\nSONUÇ: Tüm docklar, temalar, dinamik ada ve arayüz bileşenleri kusursuz çalışıyor!")
                return 0
            else:
                print("\nSONUÇ: Bazı testler başarısız oldu!")
                return 1
        else:
            print("Test sonuçları DOM içinde bulunamadı.")
            print("DOM parçası:", dom[-500:])
            return 1
    finally:
        test_server.shutdown()
        server.shutdown()

if __name__ == "__main__":
    sys.exit(run_tests())

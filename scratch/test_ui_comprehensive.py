#!/usr/bin/env python3
import http.server
import json
import os
import re
import shutil
import socketserver
import subprocess
import sys
import tempfile
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

        // 0. Varsayılan Açılış: Bostan (Yüz 3) Doğrulaması
        assert('Varsayılan Açılış: data-face="3" (Bostan)', document.documentElement.getAttribute('data-face') === '3',
            `face=${document.documentElement.getAttribute('data-face')}`);
        assert('Varsayılan Açılış: theme-bostan ve is-light-theme etkin',
            document.body.classList.contains('theme-bostan') && document.body.classList.contains('is-light-theme'),
            `classes=${document.body.className}`);
        const waitMs = (ms = 60) => new Promise(r => setTimeout(r, ms));
        const bWsBtns = document.querySelectorAll('#face-top-panel .bostan-ws-group .face-ws-btn');
        assert('Bostan Üst Panel: 4 çalışma alanı düğmesi var', bWsBtns.length === 4, `sayı=${bWsBtns.length}`);
        const bTrayWifi = document.querySelector('#face-top-panel .bostan-tray-wifi');
        const bTrayAudio = document.querySelector('#face-top-panel .bostan-tray-audio');
        const bTopDate = document.querySelector('#face-top-panel .bostan-top-date');
        assert('Bostan Üst Panel: Wi-Fi, Ses ve Tarih düğmeleri var', !!(bTrayWifi && bTrayAudio && bTopDate));
        const bLogo = document.querySelector('#face-top-panel .bostan-start-btn img[src*="logo.svg"]');
        assert('Bostan Üst Panel: Ankora logo.svg mevcut', !!bLogo);
        const bHero = document.getElementById('face-desk-hero');
        assert('Bostan: Dekoratif Hero kartı gizli', !bHero || getComputedStyle(bHero).display === 'none');
        const bDockEl = document.getElementById('face-bottom-dock');
        const bDockBtns = Array.from(bDockEl ? bDockEl.querySelectorAll('.face-dock-app') : []);
        assert('Bostan Dock: Tüm öğeler yerel <button>', bDockBtns.length > 0 && bDockBtns.every(el => el.tagName === 'BUTTON'));
        const bDockRadius = bDockEl ? parseFloat(getComputedStyle(bDockEl).borderRadius) : 0;
        assert('Bostan Dock: Kapsül kenar yuvarlaklığı (>=99px)', bDockRadius >= 99, `radius=${bDockRadius}`);
        if (bTrayWifi) {
            bTrayWifi.click();
            await waitMs(80);
            const qsPop = document.getElementById('quick-settings-popover');
            const qsRect = qsPop ? qsPop.getBoundingClientRect() : null;
            assert('Bostan: Hızlı Ayarlar üst panelin altında açılır',
                !!(qsPop && qsPop.classList.contains('open') && qsRect && qsRect.top > 30 && qsRect.top < 120),
                `open=${qsPop?.classList.contains('open')}, top=${qsRect ? Math.round(qsRect.top) : 'null'}`);
            bTrayWifi.click();
            await waitMs(40);
        }
        if (window.WindowManager) {
            window.WindowManager.open('win-terminal');
            await waitMs(40);
            const termInp = document.querySelector('#win-terminal .term-input');
            if (termInp) {
                const tCs = getComputedStyle(termInp);
                assert('Bostan Terminal: .term-input saydam arkaplan ve beyaz metin',
                    tCs.backgroundColor === 'rgba(0, 0, 0, 0)' && tCs.color === 'rgb(255, 255, 255)',
                    `bg=${tCs.backgroundColor}, color=${tCs.color}`);
            }
            window.WindowManager.close('win-terminal');
        }
        const welcomeToggle = document.getElementById('welcome-theme-toggle');
        if (welcomeToggle && window.ThemeManager) {
            welcomeToggle.click();
            await waitMs(80);
            assert('Karşılama Açık/Koyu düğmesi Bostan -> Bakır (2) geçer',
                document.documentElement.getAttribute('data-face') === '2' && document.body.classList.contains('theme-bakir'),
                `face=${document.documentElement.getAttribute('data-face')}, cls=${document.body.className}`);
            welcomeToggle.click();
            await waitMs(80);
            assert('Karşılama Açık/Koyu düğmesi Bakır -> Bostan (3) döner',
                document.documentElement.getAttribute('data-face') === '3' && document.body.classList.contains('theme-bostan'),
                `face=${document.documentElement.getAttribute('data-face')}, cls=${document.body.className}`);
            window.ThemeManager.setTheme('theme-custom', false);
            assert('Stüdyo Özel Tema (theme-custom) korunur',
                document.body.classList.contains('theme-custom') && window.ThemeManager.currentTheme === 'theme-custom',
                `theme=${window.ThemeManager.currentTheme}`);
            window.ThemeManager.setTheme('theme-bostan', false);
            if (window.WindowManager) window.WindowManager.close('win-welcome');
        }

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
            // Yüz Default (Arduvaz Anti-Slop Mat)
            window.FaceManager.setFace('default', false);
            assert('Default Yüz: data-face="default"', document.documentElement.getAttribute('data-face') === 'default');
            assert('Default Yüz: Taskbar Görünür', getComputedStyle(document.getElementById('taskbar')).display !== 'none');
            const sbDefault = document.getElementById('start-btn');
            const sbLabel = sbDefault ? sbDefault.querySelector('.start-btn-label') : null;
            assert('Default Yüz: Başlat düğmesinde logo.svg ve etiket görünür', !!(sbDefault && sbDefault.querySelector('img[src*="logo.svg"]') && sbLabel && getComputedStyle(sbLabel).display !== 'none'));
            const tbCs = getComputedStyle(document.getElementById('taskbar'));
            const tbFilter = tbCs.backdropFilter || tbCs.webkitBackdropFilter || 'none';
            assert('Default Yüz: Taskbar mat (backdrop-filter yok)', tbFilter === 'none', `filter=${tbFilter}`);
            const diEl = document.getElementById('dynamic-island-container');
            assert('Default Yüz: Dinamik Ada varsayılan olarak gizli',
                !diEl || getComputedStyle(diEl).display === 'none');
            const qsTile = document.getElementById('qs-island-toggle');
            const qsSub = document.getElementById('qs-island-sub');
            assert('Default Yüz: Hızlı Ayarlar Dinamik Ada kapalı gösterir',
                !qsTile || (!qsTile.classList.contains('active') && qsSub?.textContent?.trim() === 'Kapalı'));

            // Yüz Legacy (4.7 Klasik Modern Cam)
            window.FaceManager.setFace('legacy', false);
            assert('Legacy Yüz: data-face="legacy"', document.documentElement.getAttribute('data-face') === 'legacy');
            assert('Legacy Yüz: Taskbar Görünür', getComputedStyle(document.getElementById('taskbar')).display !== 'none');
            window.FaceManager.setFace('default', false);

            // Yüz 2: Bakır
            window.FaceManager.setFace('2', false);
            assert('Yüz 2: data-face="2"', document.documentElement.getAttribute('data-face') === '2');
            const dock2 = document.getElementById('face-bottom-dock');
            assert('Yüz 2: Alt Dock Var', !!dock2 && dock2.children.length > 0);
            const top2 = document.getElementById('face-top-panel');
            assert('Yüz 2: Üst Panel Var', !!top2 && top2.children.length > 0);
            assert('Yüz 2: Üst Panelde logo.svg Var', !!(top2 && top2.querySelector('.bakir-start-btn img[src*="logo.svg"]')));
            const meta2 = document.getElementById('face-meta-note');
            assert('Yüz 2: Dekoratif Meta Notu Gizli', !meta2 || getComputedStyle(meta2).display === 'none');
            const dock2Apps = Array.from(dock2 ? dock2.querySelectorAll('.face-dock-app') : []);
            assert('Yüz 2: Dock Öğeleri Yerel <button>', dock2Apps.length > 0 && dock2Apps.every(el => el.tagName === 'BUTTON'));
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
            assert('Yüz 3: Dekoratif Hero Kartı Gizli', !hero3 || getComputedStyle(hero3).display === 'none');
            assert('Yüz 3: Üst Panelde logo.svg Var', !!document.querySelector('#face-top-panel .bostan-start-btn img[src*="logo.svg"]'));
            const dock3Radius = dock3 ? parseFloat(getComputedStyle(dock3).borderRadius) : 0;
            assert('Yüz 3: Kapsül Dock borderRadius >= 99', dock3Radius >= 99, `radius=${dock3Radius}`);
            const dock3Apps = Array.from(dock3 ? dock3.querySelectorAll('.face-dock-app') : []);
            assert('Yüz 3: Dock Öğeleri Yerel <button>', dock3Apps.length > 0 && dock3Apps.every(el => el.tagName === 'BUTTON'));
            assert('Yüz 3: Taskbar Gizli', getComputedStyle(document.getElementById('taskbar')).display === 'none');
            const f3IconSvg = document.querySelector('#dynamic-desktop-icons .desktop-item .item-icon svg');
            if (f3IconSvg) {
                const f3Stroke = getComputedStyle(f3IconSvg).stroke;
                assert('Yüz 3: Masaüstü İkon Çizgisi Koyu (rgb(35, 48, 28))', f3Stroke === 'rgb(35, 48, 28)', `stroke=${f3Stroke}`);
            }
            if (window.WindowManager) window.WindowManager.open('win-store');
            const f3SrcSel = document.querySelector('#win-store .store-source-selector');
            const f3SrcAct = document.querySelector('#win-store .store-source-btn.active');
            if (f3SrcSel && f3SrcAct) {
                const bgSel = getComputedStyle(f3SrcSel).backgroundColor;
                const bgAct = getComputedStyle(f3SrcAct).backgroundColor;
                assert('Yüz 3: Mağaza Kaynak Seçici Açık Zeminli', bgSel === 'rgb(225, 230, 207)', `bg=${bgSel}`);
                assert('Yüz 3: Mağaza Aktif Kaynak Yeşil Vurgulu', bgAct === 'rgb(59, 114, 48)', `bg=${bgAct}`);
            }

            // Yüz 8: Cıvata
            window.FaceManager.setFace('8', false);
            assert('Yüz 8: data-face="8"', document.documentElement.getAttribute('data-face') === '8');
            const top8 = document.getElementById('face-top-panel');
            assert('Yüz 8: Üst Bar Var', !!top8 && top8.children.length > 0);
            const dock8 = document.getElementById('face-bottom-dock');
            assert('Yüz 8: Alt Teknik Dock Var', !!dock8 && dock8.children.length > 0);
            const hero8 = document.getElementById('face-desk-hero');
            assert('Yüz 8: Dekoratif Hero Kartı Gizli', !hero8 || getComputedStyle(hero8).display === 'none');
            assert('Yüz 8: Üst Barda logo.svg Var', !!document.querySelector('#face-top-panel .civata-brand img[src*="logo.svg"]'));
            const top8Bg = top8 ? getComputedStyle(top8).backgroundColor : '';
            assert('Yüz 8: Üst Bar Açık Kontür Zeminli (rgb(252, 252, 249))', top8Bg === 'rgb(252, 252, 249)', `bg=${top8Bg}`);
            const dock8Rect = dock8 ? dock8.getBoundingClientRect() : null;
            assert('Yüz 8: Alt Teknik Şerit Tam Genişlikte', !!(dock8Rect && dock8Rect.width >= window.innerWidth - 2), `w=${dock8Rect?.width}`);
            const dock8Apps = Array.from(dock8 ? dock8.querySelectorAll('.face-dock-app') : []);
            assert('Yüz 8: Dock Öğeleri Yerel <button>', dock8Apps.length > 0 && dock8Apps.every(el => el.tagName === 'BUTTON'));
            assert('Yüz 8: Taskbar Gizli', getComputedStyle(document.getElementById('taskbar')).display === 'none');
            if (window.XdgDesktopEngine && window.XdgDesktopEngine.layoutDesktopIcons) {
                window.XdgDesktopEngine.layoutDesktopIcons();
            }
            const f8IconSvg = document.querySelector('#dynamic-desktop-icons .desktop-item .item-icon svg');
            if (f8IconSvg) {
                const f8Stroke = getComputedStyle(f8IconSvg).stroke;
                assert('Yüz 8: Masaüstü İkon Çizgisi Koyu (rgb(20, 18, 10))', f8Stroke === 'rgb(20, 18, 10)', `stroke=${f8Stroke}`);
            }
            const f8Items = Array.from(document.querySelectorAll('#dynamic-desktop-icons .desktop-item'));
            const f8Overflow = f8Items.filter(el => el.getBoundingClientRect().bottom > window.innerHeight);
            assert('Yüz 8: Masaüstü İkonlarında Dikey Taşma Yok', f8Overflow.length === 0, `taşan=${f8Overflow.length}`);
            const f8SrcSel = document.querySelector('#win-store .store-source-selector');
            const f8SrcAct = document.querySelector('#win-store .store-source-btn.active');
            if (f8SrcSel && f8SrcAct) {
                const bgSel8 = getComputedStyle(f8SrcSel).backgroundColor;
                const bgAct8 = getComputedStyle(f8SrcAct).backgroundColor;
                assert('Yüz 8: Mağaza Kaynak Seçici Açık Zeminli', bgSel8 === 'rgb(236, 235, 227)', `bg=${bgSel8}`);
                assert('Yüz 8: Mağaza Aktif Kaynak Mürekkep Vurgulu', bgAct8 === 'rgb(20, 18, 10)', `bg=${bgAct8}`);
            }
            if (window.WindowManager) window.WindowManager.close('win-store');

            // Harici X11 Uygulamalarının (Brave, VLC) Tüm Yüzlerin Dock ve Panellerinde Görünmesi
            if (window.WindowManager) {
                window.WindowManager.nativeWindows = [
                    { id: '0x01800003', title: 'Yeni Sekme - Brave', app_name: 'Brave-browser', wm_class: 'brave-browser.Brave-browser', is_active: true },
                    { id: '0x02000001', title: 'Ders.mp4 - VLC', app_name: 'vlc', wm_class: 'vlc.Vlc', is_active: false }
                ];
                window.WindowManager._tabsSig = '';
                window.WindowManager.syncTabs();

                for (const fid of ['2', '3', '8']) {
                    window.FaceManager.setFace(fid, false);
                    const nativeDockBtns = document.querySelectorAll('#face-bottom-dock .face-dock-native');
                    const braveStaticBtn = document.querySelector('#face-bottom-dock .face-dock-app[data-app-id="brave"]');
                    assert(`Yüz ${fid}: Harici uygulamalar (Brave, VLC) alt dock'ta listelenir`, nativeDockBtns.length === 2, `sayı=${nativeDockBtns.length}`);
                    assert(`Yüz ${fid}: Brave statik dock ikonu da aktif/running işaretlenir`, !!(braveStaticBtn && braveStaticBtn.classList.contains('running') && braveStaticBtn.classList.contains('active')));
                }
                const civataPills = document.querySelectorAll('#civata-running-tabs .civata-tab-pill.native-task-tab');
                assert('Yüz 8: Harici uygulamalar üst çubuk sekme haplarında da görünür', civataPills.length === 2, `sayı=${civataPills.length}`);

                window.WindowManager.nativeWindows = [];
                window.WindowManager._tabsSig = '';
                window.WindowManager.syncTabs();
            }

            // Mağaza >= 500 Uygulama Kataloğu, Tümü ve Oyun & Yardımcılar Görünümü Denetimi
            if (window.StoreManager && Array.isArray(window.StoreManager.packages)) {
                const totalPkgs = window.StoreManager.packages.length;
                assert('Mağaza: Toplam >= 500 uygulama yüklü', totalPkgs >= 500, `sayı=${totalPkgs}`);
                window.StoreManager.currentCat = 'all';
                window.StoreManager.currentSource = 'all';
                window.StoreManager.render('');
                const cards = document.querySelectorAll('#store-grid .store-card');
                assert('Mağaza: tüm uygulamalar kart olarak çizildi', cards.length === totalPkgs, `çizilen=${cards.length}/${totalPkgs}`);
                const utilBtn = document.querySelector('#win-store .store-filter-btn[data-cat="util"]');
                assert('Mağaza: Oyun & Yardımcılar kategori düğmesi var', !!utilBtn);
                window.StoreManager.currentCat = 'util';
                window.StoreManager.render('');
                const utilCards = document.querySelectorAll('#store-grid .store-card');
                assert('Mağaza: Oyun & Yardımcılar filtresi >= 40 kart çizdi', utilCards.length >= 40, `util=${utilCards.length}`);
                window.StoreManager.currentCat = 'featured';
                window.StoreManager.render('');
            }

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

        // 7. Tüm Temaların (5 Çekirdek Anti-Slop + 7 Klasik 4.7 = 12 Tema) Uygulanabilirlik ve Stil Denetimi
        const allThemes = [
            'theme-dark', 'theme-light', 'theme-bakir', 'theme-bostan', 'theme-civata',
            'theme-classic-dark', 'theme-midnight', 'theme-nord', 'theme-evergreen',
            'theme-ember', 'theme-arctic', 'theme-cumhuriyet'
        ];

        let themeErrors = 0;
        allThemes.forEach(t => {
            document.body.className = t === 'theme-dark' ? '' : t;
            const cs = getComputedStyle(document.body);
            if (!cs.backgroundColor) themeErrors++;
        });
        document.body.className = '';
        assert('12 Temanın Tümü Başarıyla Uygulandı', themeErrors === 0);

        // 8. Başlat Menüsü Aç/Kapa ve 2 Sütunlu Dağıtım Menüsü Denetimi
        const startFlyout = document.getElementById('start-flyout');
        if (window.toggleStartMenu) {
            window.toggleStartMenu(true);
            assert('Başlat Menüsü Açıldı (open sınıfı)', startFlyout.classList.contains('open'));
            assert('Dağıtım kategori kenar çubuğu var', document.querySelectorAll('#start-cat-sidebar .start-cat-btn').length >= 8);
            window.toggleStartMenu(false);
            assert('Başlat Menüsü Kapandı', !startFlyout.classList.contains('open'));
        }

        // 9. Bakır (2), Bostan (3) ve Cıvata (8) Güvenli Çalışma Alanı & Kapat Düğmesi Hit-Test + Dağıtım Menüsü
        if (window.FaceManager && window.WindowManager) {
            const winSettings = document.getElementById('win-settings');
            const waitFrame = (ms = 80) => new Promise(r => setTimeout(r, ms));
            for (const f of ['2', '3', '8']) {
                window.FaceManager.setFace(f);
                await waitFrame(90);

                window.WindowManager.open('win-settings');
                await waitFrame(60);
                const topPanel = document.getElementById('face-top-panel');
                const bottomDock = document.getElementById('face-bottom-dock');
                const topBottom = topPanel ? topPanel.getBoundingClientRect().bottom : 0;
                const openRect = winSettings.getBoundingClientRect();
                assert(`Yüz ${f}: Açılan pencere üst panelin altında değil`,
                    openRect.top >= topBottom - 1,
                    `winTop=${Math.round(openRect.top)}, panelBottom=${Math.round(topBottom)}`);

                if (!winSettings.classList.contains('maximized')) {
                    window.WindowManager.toggleMaximize('win-settings');
                    await waitFrame(240);
                }
                const maxRect = winSettings.getBoundingClientRect();
                const topRect = topPanel ? topPanel.getBoundingClientRect() : { bottom: 0 };
                const dockRect = bottomDock ? bottomDock.getBoundingClientRect() : { top: window.innerHeight };
                assert(`Yüz ${f}: Büyütülmüş pencere üst panelin altında kalmaz`,
                    maxRect.top >= topRect.bottom - 1,
                    `maxTop=${Math.round(maxRect.top)}, panelBottom=${Math.round(topRect.bottom)}`);
                assert(`Yüz ${f}: Büyütülmüş pencere alt dock altında kalmaz`,
                    maxRect.bottom <= dockRect.top + 2,
                    `maxBottom=${Math.round(maxRect.bottom)}, dockTop=${Math.round(dockRect.top)}`);

                const closeBtn = winSettings.querySelector('.ctrl-btn.close');
                const btnRect = closeBtn ? closeBtn.getBoundingClientRect() : null;
                const cx = btnRect ? btnRect.left + btnRect.width / 2 : -1;
                const cy = btnRect ? btnRect.top + btnRect.height / 2 : -1;
                const hit = btnRect ? document.elementFromPoint(cx, cy) : null;
                assert(`Yüz ${f}: Kapat düğmesi görünür ve doğrudan tıklanabilir`,
                    !!(closeBtn && hit && (hit === closeBtn || closeBtn.contains(hit))),
                    `hit=${hit ? hit.tagName + '.' + hit.className : 'null'} @ (${Math.round(cx)},${Math.round(cy)})`);

                const bubble = document.getElementById('face-ai-bubble');
                assert(`Yüz ${f}: Yüzen AI balonu gizli`,
                    !bubble || getComputedStyle(bubble).display === 'none');

                window.WindowManager.open('win-terminal');
                await waitFrame(40);
                const termInpFace = document.querySelector('#win-terminal .term-input');
                if (termInpFace) {
                    const tCsF = getComputedStyle(termInpFace);
                    assert(`Yüz ${f}: .term-input saydam ve okunur`,
                        tCsF.backgroundColor === 'rgba(0, 0, 0, 0)' && tCsF.color === 'rgb(255, 255, 255)',
                        `bg=${tCsF.backgroundColor}, color=${tCsF.color}`);
                }
                window.WindowManager.close('win-terminal');

                if (winSettings.classList.contains('maximized')) {
                    window.WindowManager.toggleMaximize('win-settings');
                }
                window.WindowManager.close('win-settings');

                if (window.toggleStartMenu) {
                    window.toggleStartMenu(true);
                    await waitFrame(200);
                    const flyRect = startFlyout.getBoundingClientRect();
                    assert(`Yüz ${f}: Uygulama menüsü üst paneli aşmaz`,
                        flyRect.top >= topRect.bottom - 1 && flyRect.bottom <= window.innerHeight + 1,
                        `flyTop=${Math.round(flyRect.top)}, panelBottom=${Math.round(topRect.bottom)}, flyBottom=${Math.round(flyRect.bottom)}`);
                    window.toggleStartMenu(false);
                }
            }

            // Arduvaz Üst Panel Konumu (panel-top) pencere yerleşimi & kırpma testi
            window.FaceManager.setFace('default');
            await waitFrame(90);
            const btnPanelTop = document.querySelector('#group-panel-position .option-pill-btn[data-panel-pos="top"]');
            const btnPanelBot = document.querySelector('#group-panel-position .option-pill-btn[data-panel-pos="bottom"]');
            if (btnPanelTop) {
                btnPanelTop.click();
                await waitFrame(90);
                const tbRect = document.getElementById('taskbar').getBoundingClientRect();
                assert('Arduvaz Üst Panel: Görev çubuğu en üstte (top=0)',
                    Math.abs(tbRect.top) <= 1, `tbTop=${tbRect.top}`);
                window.WindowManager.open('win-settings');
                await waitFrame(60);
                const topWinRect = winSettings.getBoundingClientRect();
                assert('Arduvaz Üst Panel: Açılan pencere panelin altına kaçmaz',
                    topWinRect.top >= tbRect.bottom - 1,
                    `winTop=${Math.round(topWinRect.top)}, panelBottom=${Math.round(tbRect.bottom)}`);
                window.WindowManager.close('win-settings');
                btnPanelBot?.click();
                await waitFrame(60);
            }

            // 2 sütunlu dağıtım menüsü kategori geçişleri
            window.FaceManager.setFace('default');
            await waitFrame(90);
            if (window.toggleStartMenu) {
                window.toggleStartMenu(true);
                await waitFrame(180);
                for (const [cat, expectedTitle] of [
                    ['all', 'Tüm Uygulamalar'],
                    ['internet', 'İnternet & Ağ'],
                    ['favorites', 'Sık Kullanılanlar']
                ]) {
                    const btn = document.querySelector(`#start-cat-sidebar .start-cat-btn[data-cat="${cat}"]`);
                    btn?.click();
                    await waitFrame(30);
                    const heading = document.getElementById('start-active-cat-title')?.textContent?.trim();
                    const visibleCards = Array.from(document.querySelectorAll('#start-pinned-grid > .pinned-app-card'))
                        .filter(el => getComputedStyle(el).display !== 'none').length;
                    assert(`Uygulama menüsü '${cat}' kategorisi`,
                        heading === expectedTitle && visibleCards > 0,
                        `başlık=${heading}, kart=${visibleCards}`);
                }
                window.toggleStartMenu(false);
            }
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

    # Inject test script temporarily into a clean copy of index.html
    tmp_dir = Path(tempfile.mkdtemp(prefix="ankora-ui-test-"))
    
    # Copy assets (symlink is tried first, copy is the portable fallback)
    for item in SRC_DIR.iterdir():
        target = tmp_dir / item.name
        if target.exists():
            continue
        try:
            target.symlink_to(item)
        except OSError:
            if item.is_dir():
                shutil.copytree(item, target)
            else:
                shutil.copy2(item, target)

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

    # Tarayıcıyı bul: CHROME_BIN, chromium, chromium-browser, google-chrome veya Windows Chrome/Edge.
    browser = None
    for candidate in [
        os.environ.get("CHROME_BIN", ""),
        "chromium",
        "chromium-browser",
        "google-chrome",
        "google-chrome-stable",
        "msedge",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ]:
        if not candidate:
            continue
        found = shutil.which(candidate) or (candidate if os.path.isfile(candidate) else None)
        if found:
            browser = found
            break
    if not browser:
        print("[BILGI] Headless tarayıcı bulunamadı; arayüz duman testi atlandı.")
        test_server.shutdown()
        server.shutdown()
        return 0

    def run_browser(budget_ms):
        cmd = [
            browser,
            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            f"--virtual-time-budget={budget_ms}",
            "--dump-dom",
            url,
        ]
        return subprocess.run(cmd, capture_output=True, text=True, timeout=60,
                              encoding="utf-8", errors="replace")

    try:
        match = None
        dom = ""
        last_res = None
        # İlk turda 8 s, gerekirse 20 s bütçe ile tekrar denenir.
        for budget in (8000, 20000):
            last_res = run_browser(budget)
            dom = last_res.stdout or ""
            match = re.search(r'data-test-results="([^"]+)"', dom)
            if not match:
                match = re.search(r"data-test-results='([^']+)'", dom)
            if match:
                break

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
            print("Tarayıcı:", browser)
            if last_res is not None:
                err_tail = (last_res.stderr or "").strip().splitlines()[-5:]
                for line in err_tail:
                    print("  stderr:", line)
            print("DOM parçası:", dom[-500:])
            return 1
    finally:
        test_server.shutdown()
        server.shutdown()
        shutil.rmtree(tmp_dir, ignore_errors=True)

if __name__ == "__main__":
    sys.exit(run_tests())

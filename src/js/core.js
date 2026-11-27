// Ayaz DE Modülü: core.js
// Çekirdek güvenlik, depolama, IPC köprüsü, ikon çözümleyici ve dokunmatik yardımcılar
(() => {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }

  // ============================================================================
  // GÜVENLİ DEPOLAMA MOTORU (SAFESTORAGE - file:/// VE GİZLİ MOD GÜVENCESİ)
  // ============================================================================
  const SafeStorage = {
    _mem: {},
    getItem(key, fallback = null) {
      try {
        if (typeof localStorage !== 'undefined') {
          const val = localStorage.getItem(key);
          if (val !== null) return val;
        }
      } catch (e) {}
      return (key in this._mem) ? this._mem[key] : fallback;
    },
    setItem(key, val) {
      const strVal = String(val);
      this._mem[key] = strVal;
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(key, strVal);
        }
      } catch (e) {}
    },
    removeItem(key) {
      delete this._mem[key];
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(key);
        }
      } catch (e) {}
    },
    getSession(key, fallback = null) {
      try {
        if (typeof sessionStorage !== 'undefined') {
          const val = sessionStorage.getItem(key);
          if (val !== null) return val;
        }
      } catch (e) {}
      return (key in this._mem) ? this._mem[key] : fallback;
    },
    setSession(key, val) {
      const strVal = String(val);
      this._mem[key] = strVal;
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(key, strVal);
        }
      } catch (e) {}
    }
  };

  // ============================================================================
  // TAURI IPC KÖPRÜSÜ (NATIVE BRIDGE)
  // ============================================================================
  const TauriBridge = {
    isAvailable: true,
    ipcUrl: (typeof window !== 'undefined' && window.location.origin.includes('49152')) ? '/api/ipc' : 'http://127.0.0.1:49152/api/ipc',
    pendingRequests: new Map(),
    reqIdCounter: 1,
    // Köprü yolu yalnızca WebKit IPC'si: yanıt gelmezse en fazla bu kadar beklenir.
    // Uzun süren çağrılar ayrı eşik ister, yoksa kurulum gibi işler yarıda kesilir.
    longTimeouts: {
      execute_system_installation: 30 * 60 * 1000,
      install_deb_package: 15 * 60 * 1000,
      install_vendor_package: 15 * 60 * 1000,
      install_local_deb_package: 15 * 60 * 1000,
      install_ollama: 20 * 60 * 1000,
      install_flatpak_app: 20 * 60 * 1000,
      remove_deb_package: 5 * 60 * 1000,
      remove_flatpak_app: 5 * 60 * 1000,
      download_and_apply_de_update: 30 * 60 * 1000,
      apt_update_clean: 10 * 60 * 1000,
      system_update_apt: 15 * 60 * 1000,
      execute_desktop_program: 60 * 1000
    },

    _afterExternalLaunch(cmd) {
      if (
        cmd === 'launch_application' ||
        cmd === 'execute_desktop_program' ||
        cmd === 'launch_interactive_terminal' ||
        cmd === 'activate_native_window' ||
        cmd === 'open_path' ||
        cmd === 'open_url'
      ) {
        try {
          if (typeof WindowManager !== 'undefined') {
            WindowManager._isLayerAbove = true;
            WindowManager.ensureDesktopLayer(false);
            if (cmd !== 'activate_native_window' && typeof WindowManager.refreshNativeWindows === 'function') {
              setTimeout(() => WindowManager.refreshNativeWindows(true), 600);
              setTimeout(() => WindowManager.refreshNativeWindows(true), 1800);
            }
          }
        } catch (e) {}
      }
    },

    init() {
      if (typeof window !== 'undefined') {
        window.__AYAZ_RESOLVE__ = (payload) => {
          if (!payload) return;
          const id = payload.id !== undefined ? payload.id : payload.req_id;
          const p = this.pendingRequests.get(id) || this.pendingRequests.get(Number(id)) || this.pendingRequests.get(String(id));
          if (p) {
            this.pendingRequests.delete(id);
            this.pendingRequests.delete(Number(id));
            this.pendingRequests.delete(String(id));
            p.resolve(payload.result);
          }
        };
        window.__AYAZ_REJECT__ = (payload) => {
          if (!payload) return;
          const id = payload.id !== undefined ? payload.id : payload.req_id;
          const p = this.pendingRequests.get(id) || this.pendingRequests.get(Number(id)) || this.pendingRequests.get(String(id));
          if (p) {
            this.pendingRequests.delete(id);
            this.pendingRequests.delete(Number(id));
            this.pendingRequests.delete(String(id));
            p.reject(new Error(payload.error || 'Bilinmeyen IPC hatası'));
          }
        };
        // İndirme tamam bildirimi (yerel köprüden gelir).
        window.__AYAZ_DOWNLOAD_DONE__ = (path) => {
          try {
            const name = String(path || '').split('/').pop() || 'dosya';
            if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
              ReportManager.showToast(`İndirildi: ${name}`);
            }
            if (typeof DynamicIsland !== 'undefined' && DynamicIsland.showDownload) {
              DynamicIsland.showDownload(name, 100);
            }
            if (typeof Terminal !== 'undefined' && Terminal.log) {
              Terminal.log(`[İNDİRME] Tamamlandı: ${path}`, 'success');
            }
          } catch (e) {}
          try {
            const fw = document.getElementById('win-files');
            if (fw && fw.classList.contains('open') && typeof FileManager !== 'undefined' && FileManager.refresh) {
              FileManager.refresh();
            }
          } catch (e) {}
          try {
            if (typeof DesktopFiles !== 'undefined' && DesktopFiles.refresh) DesktopFiles.refresh();
          } catch (e) {}
        };
      }
    },

    listen(eventName, handler) {
      if (typeof window === 'undefined' || typeof handler !== 'function') return null;
      if (window.__TAURI__?.event?.listen) {
        return window.__TAURI__.event.listen(eventName, handler);
      }
      const internals = window.__TAURI_INTERNALS__;
      if (internals && typeof internals.invoke === 'function' && typeof internals.transformCallback === 'function') {
        const cbId = internals.transformCallback((evt) => {
          try { handler(evt); } catch (e) {}
        });
        return internals.invoke('plugin:event|listen', {
          event: eventName,
          target: { kind: 'Any' },
          handler: cbId
        });
      }
      return null;
    },

    async invoke(cmd, args = {}) {
      // 1. Rust Tauri Native (derlenmiş Tauri binary içinde çalışıyorsa)
      //    withGlobalTauri=false iken __TAURI_INTERNALS__.invoke üzerinden konuşur;
      //    hata gerçek bir hatadır: yutulmaz, çağırana iletilir.
      const tauriInvoke = (typeof window !== 'undefined')
        ? (window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke || window.__TAURI_INTERNALS__?.invoke)
        : null;
      if (tauriInvoke) {
        const out = await tauriInvoke(cmd, args);
        this._afterExternalLaunch(cmd);
        return out;
      }

      // 2. WebKit2GTK MessageHandler Native IPC (yerel process içi çağrı)
      if (typeof window !== 'undefined' && window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ayazIpc) {
        return await new Promise((resolve, reject) => {
          const id = ++this.reqIdCounter;
          this.pendingRequests.set(id, {
            resolve: (val) => {
              this._afterExternalLaunch(cmd);
              resolve(val);
            },
            reject
          });
          // Token yalnız ana enjekte edilir; köprü (iframe) sayfaları bu yola
          // token olmadan erişemez.
          window.webkit.messageHandlers.ayazIpc.postMessage(JSON.stringify({
            id, cmd, args: args || {}, token: window.__AYAZ_IPC_TOKEN__ || ''
          }));
          setTimeout(() => {
            if (this.pendingRequests.has(id)) {
              this.pendingRequests.delete(id);
              reject(new Error(`İşlem zaman aşımı: '${cmd}'`));
            }
          }, this.longTimeouts[cmd] || 30000);
        });
      }

      // 3. HTTP Yerel IPC Köprüsü (Same-Origin veya Loopback)
      //    Simülasyona yalnızca köprü hiç ayakta değilse düşülür; sunucu
      //    ne dönerse dönsün (hata dahil) olduğu gibi yansıtılır.
      const url = (typeof window !== 'undefined' && window.location.origin.includes('49152')) ? '/api/ipc' : this.ipcUrl;
      let res;
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (typeof window !== 'undefined' && window.__AYAZ_IPC_TOKEN__) {
          headers['X-Ayaz-Token'] = window.__AYAZ_IPC_TOKEN__;
        }
        res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ cmd, args: args || {} })
        });
      } catch (netErr) {
        console.warn(`[IPC] '${cmd}' için yerel köprüye ulaşılamadı, simülasyona düşülüyor.`, netErr);
        return this.fallback(cmd, args);
      }

      if (!res.ok) {
        throw new Error(`Yerel köprü '${cmd}' isteğini ${res.status} koduyla reddetti.`);
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      this._afterExternalLaunch(cmd);
      return data.result;
    },

    async fallback(cmd, args) {
      switch (cmd) {
        case 'get_render_mode':
          return 'gpu';

        case 'system_poweroff':
          return 'Sistem kapatılıyor...';

        case 'system_reboot':
          return 'Sistem yeniden başlatılıyor...';

        case 'system_suspend':
          return 'Sistem askıya alınıyor...';

        case 'system_logout':
          return 'Oturum kapatılıyor...';

        case 'take_screenshot':
          return {
            success: true,
            file_path: '/home/ankora/Resimler/Ekran-Goruntusu.png',
            file_name: 'Ekran-Goruntusu.png',
            image_b64: null
          };
        case 'drag_window':
          return null;

        case 'scan_xdg_applications':
          return [];

        case 'get_storage_devices':
          return [];

        case 'execute_system_installation':
          throw new Error('Sistem kurulumu yalnızca canlı Ankora Linux ortamında yerel köprü üzerinden çalıştırılabilir. Yerel IPC köprüsüne bağlanılamadı.');

        case 'get_region_settings':
          return {
            timezone: 'Europe/Istanbul',
            local_time: '',
            keyboard_layout: 'tr',
            language: 'tr_TR.UTF-8',
            available_timezones: ['Europe/Istanbul', 'UTC'],
            available_keyboards: ['tr', 'tr_f', 'us', 'de', 'fr', 'gb'],
            available_languages: ['tr_TR.UTF-8', 'en_US.UTF-8']
          };

        case 'set_timezone':
        case 'set_keyboard_layout':
        case 'set_system_keyboard':
        case 'set_system_language':
        case 'sync_time_ntp':
          throw new Error('Bölge/dil/saat ayarı için yerel sistem köprüsü gereklidir.');

        case 'install_deb_package':
          throw new Error('Paket kurulumu için yerel sistem köprüsü gereklidir.');

        case 'install_meb_certificate':
          throw new Error('MEB sertifikası için yerel sistem köprüsü gereklidir.');

        case 'remove_meb_certificate':
          throw new Error('MEB sertifikası kaldırma için yerel sistem köprüsü gereklidir.');

        case 'get_app_icon':
          return null;

        case 'get_xdg_user_dirs': {
          const home = '/home/ankora';
          return {
            home,
            desktop: home + '/Masaüstü',
            download: home + '/İndirilenler',
            documents: home + '/Belgeler',
            pictures: home + '/Resimler',
            music: home + '/Müzik',
            videos: home + '/Videolar'
          };
        }

        case 'remove_deb_package':
          throw new Error('Paket kaldırma için yerel sistem köprüsü gereklidir.');

        case 'get_system_telemetry':
          return {
            os_name: 'Devuan GNU/Linux 6 (excalibur)',
            kernel: 'Linux 6.12.0-amd64 (Tauri Native)',
            init_system: 'SysVinit (systemd-free)',
            memory_used_mb: 110,
            memory_total_mb: 8192,
            cpu_cores: 4,
            uptime_seconds: 7200,
            // Backend yoksa pil/CPU/disk alanları boş kalır; arayüz gizler.
            battery_percent: null,
            battery_status: null,
            cpu_percent: null,
            disk_percent: null,
            disk_used_gb: null,
            disk_total_gb: null
          };

        case 'get_processes':
          throw new Error('Süreç listesi yalnızca yerel sistem üzerinden okunabilir (köprü kapalı).');

        case 'kill_process':
          throw new Error('Süreç sonlandırma yalnızca yerel sistem üzerinden yapılabilir (köprü kapalı).');

        case 'optimize_system_memory':
          return {
            success: true,
            freed_mb: 48,
            current_used_mb: 110,
            current_total_mb: 8192,
            message: 'Sistem ve uygulama önbellekleri boşaltıldı (Simüle).'
          };

        case 'check_first_run':
          return true;

        case 'save_ai_credential':
          return null;

        case 'has_ai_credential':
          return false;

        case 'delete_ai_credential':
          return null;

        case 'check_de_update':
          return {
            has_update: false,
            current_version: '5.0.0',
            latest_version: '5.0.0',
            release_name: 'Ayaz DE v5.0.0 (Excalibur)',
            release_notes: '## Ayaz DE v5.0.0\n- Ankora Linux için geliştirilen minimalist masaüstü ortamı.\n- SysVinit uyumlu Kiosk tasarımı.\n- 4 özgün masaüstü yüzü ve yerel AI ajan entegrasyonu.',
            download_url: null,
            published_at: new Date().toISOString(),
            package_size_bytes: 0
          };

        case 'query_local_ai': {
          const pLow = String(args.prompt || '').toLowerCase();
          if (pLow.includes('doktor') || pLow.includes('sağlık') || pLow.includes('teftiş')) {
            return {
              reply: 'Ankora Sistem Doktoru (Teşhis Modu) tarama başlatmaya hazır. Sistem sağlık kontrolünü çalıştırmak için aşağıdaki eylemi onaylayın.',
              has_action: true,
              action_command: '/usr/local/bin/ankora-doctor',
              action_desc: 'Ankora Sistem Doktoru tam sağlık ve güvenlik taraması çalıştırılacak.',
              action_token: 'sim-token'
            };
          }
          if (pLow.includes('önbellek') || pLow.includes('temizle') || pLow.includes('ram')) {
            return {
              reply: 'Bellek ve disk durumu denetlenmek üzere hazır. Güvenli bellek ve disk raporunu görmek için onay verin.',
              has_action: true,
              action_command: 'df -h /',
              action_desc: 'Kök dosya sistemi ve disk kullanım raporu okunacak.',
              action_token: 'sim-token'
            };
          }
          if (pLow.includes('zram') || pLow.includes('swap') || pLow.includes('takas')) {
            return {
              reply: 'ZRAM sıkıştırmalı bellek ve disk swap hiyerarşisini sorgulamak için aşağıdaki komutu onaylayabilirsiniz.',
              has_action: true,
              action_command: 'swapon --show',
              action_desc: 'Aktif ZRAM ve disk takas alanları listelenecek.',
              action_token: 'sim-token'
            };
          }
          return {
            reply: 'Ankora AI Yerel Teşhis Motoru (v5.0) aktif.\n• Çekirdek: Linux 6.12 LTS (Devuan 6 Excalibur)\n• İnit: SysVinit (PID 1)\nSistem doktoru, bellek/disk analizi, uygulama açma veya ZRAM sorguları için hızlı etiketleri kullanabilir ya da API Ayarları üzerinden bulut anahtarı bağlayabilirsiniz.',
            has_action: false,
            action_command: null,
            action_desc: null,
            action_token: null
          };
        }

        case 'execute_agent_confirmed_action':
          return `Komut yürütüldü (${args.command || 'onaylı eylem'}): Sistem durumu sağlıklı (Çıkış kodu: 0).`;

        case 'is_lock_configured':
          return false;

        case 'verify_lock_credentials':
          throw new Error('Kilit doğrulaması yalnızca native backend üzerinden yapılabilir.');

        case 'set_lock_credentials':
          throw new Error('Kilit kurulumu yalnızca native backend üzerinden yapılabilir.');

        case 'lock_x11_session':
          return 'Oturum kilitlendi.';

        case 'download_and_apply_de_update':
          throw new Error('Güncelleme yardımcısına (Tauri IPC) ulaşılamadı. Paket kurulmadı.');

        case 'restart_desktop_process':
          window.location.reload();
          return null;

        case 'list_directory': {
          const p = args.path || '/home/ankora';
          const pLow = String(p).toLowerCase();
          if (pLow.endsWith('/masaüstü') || pLow.endsWith('/desktop')) {
            return { current_path: p, items: [] };
          }
          return {
            current_path: p,
            items: [
              { name: 'Masaüstü', path: p + '/Masaüstü', is_dir: true, size_str: '-', ext: '', is_hidden: false },
              { name: 'İndirilenler', path: p + '/İndirilenler', is_dir: true, size_str: '-', ext: '', is_hidden: false },
              { name: 'Belgeler', path: p + '/Belgeler', is_dir: true, size_str: '-', ext: '', is_hidden: false },
              { name: 'Resimler', path: p + '/Resimler', is_dir: true, size_str: '-', ext: '', is_hidden: false },
              { name: 'Müzik', path: p + '/Müzik', is_dir: true, size_str: '-', ext: '', is_hidden: false },
              { name: 'Videolar', path: p + '/Videolar', is_dir: true, size_str: '-', ext: '', is_hidden: false },
              { name: 'ankora-sistem-rehberi.pdf', path: p + '/ankora-sistem-rehberi.pdf', is_dir: false, size_str: '64 KB', ext: 'pdf', is_hidden: false },
              { name: 'kiosk-ayarlari.txt', path: p + '/kiosk-ayarlari.txt', is_dir: false, size_str: '2.4 KB', ext: 'txt', is_hidden: false }
            ]
          };
        }

        case 'create_folder':
          return `Klasör oluşturuldu: ${args.path}`;

        case 'write_text_file':
          return `Dosya kaydedildi: ${args.path}`;

        case 'open_path':
          return `Açıldı: ${args.path}`;

        case 'delete_file':
          return `Silindi: ${args.path}`;

        case 'inspect_package_file': {
          const fn = (args.filePath || '').split('/').pop() || 'paket.deb';
          const isDeb = fn.toLowerCase().endsWith('.deb');
          return {
            file_name: fn,
            file_path: args.filePath || '',
            pkg_type: isDeb ? 'deb' : 'appimage',
            name: fn.replace(/\.(deb|AppImage|appimage)$/i, ''),
            version: '1.0.0',
            arch: 'amd64',
            size_human: '14.2 MB',
            description: isDeb ? 'Debian sistemi ikili kurulum paketi.' : 'Taşınabilir Linux uygulaması (AppImage).'
          };
        }

        case 'install_local_deb_package':
          return `${args.filePath || 'Paket'} başarıyla kuruldu.`;

        case 'launch_interactive_terminal':
          return 'Sistem terminali (simüle) başlatıldı.';

        case 'get_all_monitors':
          return {
            primary_output: 'VGA-0',
            monitors: [
              {
                name: 'VGA-0',
                connected: true,
                is_primary: true,
                current_mode: '1366x768',
                current_rate: '60.0',
                position: '0+0',
                modes: ['1366x768', '1024x768', '800x600']
              }
            ],
            connected_count: 1
          };

        case 'set_multi_monitor_layout':
          return `Ekran düzeni uygulandı (simüle): ${args.layout || 'auto'}`;

        default:
          return null;
      }
    }
  };
  TauriBridge.init();

  // Teşhis: konsol/CSP ihlalleri yerel sisteme yazılır (/tmp/ayaz-console.log).
  // Yalnız WebKit IPC yolu varsa iletilir; hata konsola da düşer, yutulmaz.
  const consoleReport = (kind, detail) => {
    if (!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ayazIpc)) return;
    try {
      window.webkit.messageHandlers.ayazIpc.postMessage(JSON.stringify({
        id: 0,
        cmd: 'report_console',
        args: { line: `${new Date().toISOString()} [${kind}] ${detail}` },
        token: window.__AYAZ_IPC_TOKEN__ || ''
      }));
    } catch (err) {}
  };
  window.addEventListener('error', (ev) => consoleReport('hata', ev.message || String(ev)));
  window.addEventListener('unhandledrejection', (ev) => consoleReport('soz', String(ev.reason)));
  window.addEventListener('securitypolicyviolation', (ev) => {
    consoleReport('csp', `${ev.violatedDirective || ''} ${ev.blockedURI || ''}`.trim());
  });

  // ============================================================================
  // GERÇEK UYGULAMA SİMGELERİ (kurulu paketlerin hicolor/Adwaita ikonları
  // backend üzerinden veri URL'si olarak çözülür; bulunamazsa mevcut çizgi
  // simge yerinde kalır).
  // ============================================================================
  const IconResolver = {
    _cache: new Map(),
    _pending: new Map(),

    // Yerel icons/ klasöründe bulunan hazır yüksek çözünürlüklü SVG simgeler
    LOCAL_ICONS: new Set([
      '7zip', 'antigravity', 'audacious', 'audacity', 'blender', 'brave', 'brave-browser',
      'btop', 'calibre', 'calibre-gui', 'chromium', 'clementine', 'code', 'darktable',
      'dia', 'discord', 'disk-utility', 'evince', 'feh', 'ffmpeg', 'filezilla',
      'firefox-esr', 'fish', 'flameshot', 'gcompris-qt', 'geany', 'geogebra', 'gimp',
      'git', 'gparted', 'helium', 'heroic', 'htop', 'inkscape', 'kdenlive', 'krita',
      'libreoffice', 'libreoffice-calc', 'libreoffice-impress', 'libreoffice-main',
      'libreoffice-writer', 'lshw', 'lutris', 'mc', 'mpv', 'mypaint', 'nmap', 'obs',
      'obsidian', 'onboard', 'onlyoffice-desktopeditors', 'p7zip', 'pavucontrol',
      'peek', 'python', 'qbittorrent', 'rawtherapee', 'rhythmbox', 'scratch', 'shotcut',
      'spotify', 'spotify-client', 'steam', 'stellarium', 'synaptic', 'telegram',
      'thunderbird', 'timeshift', 'transmission', 'transmission-gtk', 'tuxmath',
      'tuxtype', 'viewnior', 'vlc', 'wine', 'wireshark', 'xournalpp', 'zathura',
      'linux/files', 'linux/ankora-store.png', 'linux/terminal', 'linux/settings',
      'linux/installer', 'linux/brave', 'linux/trash', 'linux/notes',
      'linux/taskmgr', 'linux/screenshot', 'linux/updater', 'linux/browser', 'linux/apps'
    ]),

    ALIAS_MAP: {
      'brave': 'linux/brave',
      'brave-browser': 'linux/brave',
      'chrome': 'chromium',
      'google-chrome': 'chromium',
      'firefox': 'firefox-esr',
      'code': 'code',
      'vscode': 'code',
      'visual-studio-code': 'code',
      'ankora-store': 'linux/ankora-store.png',
      'software-store': 'linux/ankora-store.png',
      'ankora-installer': 'linux/installer',
      'ayaz-files': 'linux/files',
      'ayaz-term': 'linux/terminal',
      'ayaz-browser': 'linux/browser',
      'ayaz-calc': 'libreoffice-calc',
      'ayaz-notepad': 'linux/notes',
      'ayaz-taskmgr': 'linux/taskmgr',
      'ankora-screenshot': 'linux/screenshot',
      'files': 'linux/files',
      'terminal': 'linux/terminal',
      'store': 'linux/ankora-store.png',
      'settings': 'linux/settings',
      'installer': 'linux/installer',
      'browser': 'linux/brave',
      'calc': 'libreoffice-calc',
      'notepad': 'linux/notes',
      'trash': 'linux/trash'
    },

    candidatesFor(app) {
      const out = [];
      const push = (v) => {
        if (v && typeof v === 'string') {
          const s = v.trim();
          if (s && !out.includes(s)) out.push(s);
        }
      };
      push(app.icon);
      const exec = String(app.exec || '');
      const base = exec.split(/\s+/)[0].split('/').pop();
      if (base && !base.startsWith('internal:') && base !== 'flatpak') push(base);
      if (app.flatpak) {
        const tail = String(app.flatpak).split('.').pop();
        push(tail && tail.toLowerCase());
        push(tail);
      }
      push(app.deb);
      push(app.id);
      return out.slice(0, 8);
    },

    async resolve(names) {
      const key = names.join('|');
      if (this._cache.has(key)) return this._cache.get(key);
      if (this._pending.has(key)) return this._pending.get(key);

      // 1. Önce yerel `icons/` deposundaki zengin SVG seçkisini dene
      for (const raw of names) {
        if (!raw) continue;
        const norm = String(raw).toLowerCase().replace(/[^a-z0-9._-]/g, '');
        const target = this.ALIAS_MAP[norm] || norm;
        if (this.LOCAL_ICONS.has(target)) {
          const localUrl = /\.(png|svg|webp)$/i.test(target) ? `icons/${target}` : `icons/${target}.svg`;
          this._cache.set(key, localUrl);
          return localUrl;
        }
      }

      // 2. Ardından backend IPC köprüsünden kurulu sistem ikonlarını ara
      const p = TauriBridge.invoke('get_app_icon', { names })
        .then(url => {
          const ok = (typeof url === 'string' && url.startsWith('data:image/')) ? url : null;
          this._cache.set(key, ok);
          this._pending.delete(key);
          return ok;
        })
        .catch(() => {
          this._cache.set(key, null);
          this._pending.delete(key);
          return null;
        });

      this._pending.set(key, p);
      return p;
    },
    getIconSvg(app) {
      if (typeof XdgDesktopEngine !== 'undefined' && XdgDesktopEngine.getAppSvgIcon) {
        return XdgDesktopEngine.getAppSvgIcon(app);
      }
      return '<svg><use href="#ico-package"></use></svg>';
    },

    tagIcon(el, app) {
      try {
        el.dataset.iconNames = JSON.stringify(this.candidatesFor(app));
      } catch (e) {}
    },

    upgradeScope(root) {
      if (!root || !root.querySelectorAll) return;
      root.querySelectorAll('[data-icon-names]').forEach(el => {
        if (el.dataset.iconDone) return;
        el.dataset.iconDone = '1';
        let names = [];
        try { names = JSON.parse(el.dataset.iconNames) || []; } catch (e) { return; }
        if (!names.length) return;
        this.resolve(names).then(url => {
          if (url && el.isConnected) {
            el.replaceChildren();
            const img = document.createElement('img');
            img.src = url;
            img.alt = '';
            img.draggable = false;
            img.className = 'real-app-icon';
            el.appendChild(img);
          }
        });
      });
    }
  };

  // ============================================================================
  // DOKUNMATİK ORTAM (FAZ TAHTA / IR ÇERÇEVE): kaba işaret algısı, genel
  // uzun-basım sağ tık. Faz tahtalar fare gibi göründüğü için yalnız
  // pointer:coarse medyasına güvenilmez; dokunuş varsa body.has-touch açılır.
  // ============================================================================
  const TouchHelpers = {
    LONG_PRESS_MS: 550,

    isTouch() {
      try {
        return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
      } catch (e) {
        return false;
      }
    },

    markTouchCapable() {
      if (this.isTouch()) document.body.classList.add('has-touch');
    },

    initLongPress() {
      if (!this.isTouch()) return;
      const sel = '.desktop-item, .files-item-card, .task-tab, .pinned-app-card, .desktop-wallpaper';
      let timer = 0;
      let sx = 0;
      let sy = 0;
      document.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        const el = document.elementFromPoint(t.clientX, t.clientY);
        const hit = el && el.closest ? el.closest(sel) : null;
        if (!hit) return;
        sx = t.clientX;
        sy = t.clientY;
        clearTimeout(timer);
        timer = setTimeout(() => {
          timer = 0;
          try {
            hit.dispatchEvent(new MouseEvent('contextmenu', {
              bubbles: true, cancelable: true, clientX: sx, clientY: sy
            }));
            // Basımı bıraktıktan sonra gelecek tıklama işlem tetiklemesin
            // (mağazada yanlışlıkla Kur'a basılması gibi).
            const swallow = (ce) => { ce.stopPropagation(); ce.preventDefault(); };
            hit.addEventListener('click', swallow, { capture: true, once: true });
            setTimeout(() => hit.removeEventListener('click', swallow, true), 600);
            if (navigator.vibrate) navigator.vibrate(15);
          } catch (err) {}
        }, this.LONG_PRESS_MS);
      }, { passive: true });
      document.addEventListener('touchmove', (e) => {
        if (!timer || !e.touches.length) return;
        const t = e.touches[0];
        if (Math.abs(t.clientX - sx) > 12 || Math.abs(t.clientY - sy) > 12) {
          clearTimeout(timer);
          timer = 0;
        }
      }, { passive: true });
      document.addEventListener('touchend', () => { clearTimeout(timer); timer = 0; }, { passive: true });
      document.addEventListener('touchcancel', () => { clearTimeout(timer); timer = 0; }, { passive: true });
    }
  };

  Object.assign(window, { escapeHtml, SafeStorage, TauriBridge, consoleReport, IconResolver, TouchHelpers });
})();

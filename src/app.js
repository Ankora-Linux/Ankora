(() => {
  'use strict';

  // ============================================================================
  // XSS VE ENJEKSİYON ÖNLEYİCİ HTML KAÇIŞ YARDIMCISI (SECURITY ESCAPER)
  // ============================================================================
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
      remove_deb_package: 5 * 60 * 1000,
      download_and_apply_de_update: 30 * 60 * 1000,
      apt_update_clean: 10 * 60 * 1000
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

    async invoke(cmd, args = {}) {
      // 1. Rust Tauri Native (derlenmiş Tauri binary içinde çalışıyorsa)
      //    Bu köprü varsa hata gerçek bir hatadır: yutulmaz, çağırana iletilir.
      if (typeof window !== 'undefined' && window.__TAURI__ && window.__TAURI__.invoke) {
        return await window.__TAURI__.invoke(cmd, args);
      }

      // 2. WebKit2GTK MessageHandler Native IPC (yerel process içi çağrı)
      if (typeof window !== 'undefined' && window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ayazIpc) {
        return await new Promise((resolve, reject) => {
          const id = ++this.reqIdCounter;
          this.pendingRequests.set(id, { resolve, reject });
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
      return data.result;
    },

    async fallback(cmd, args) {
      switch (cmd) {
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
            os_name: 'Devuan GNU/Linux 5 (daedalus)',
            kernel: 'Linux 6.1.0-22-amd64 (Tauri Native)',
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
            current_version: '3.7.0',
            latest_version: '3.7.0',
            release_name: 'Ayaz DE v3.7.0 (Daedalus / Son Kararlı Sürüm)',
            release_notes: '## Ayaz DE v3.7.0\n- Ankora Linux için geliştirilen minimalist masaüstü ortamı.\n- SysVinit uyumlu Kiosk tasarımı.\n- Güvenlik duvarı ve yerel AI ajan entegrasyonu.',
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
            reply: 'Ankora AI Yerel Teşhis Motoru (v3.6) aktif.\n• Çekirdek: Linux 6.1 LTS (Devuan Daedalus)\n• İnit: SysVinit (PID 1)\nSistem doktoru, bellek/disk analizi, süreç denetimi veya ZRAM sorguları için hızlı etiketleri kullanabilir ya da API Ayarları üzerinden bulut anahtarı bağlayabilirsiniz.',
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
          return 'Simülasyon güncellemesi başarıyla tamamlandı.';

        case 'restart_desktop_process':
          window.location.reload();
          return null;

        case 'list_directory':
          const p = args.path || '/home/ankora';
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

        case 'create_folder':
          return `Klasör oluşturuldu: ${args.path}`;

        case 'write_text_file':
          return `Dosya kaydedildi: ${args.path}`;

        case 'open_path':
          return `Açıldı: ${args.path}`;

        case 'delete_file':
          return `Silindi: ${args.path}`;

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
      if (base && base !== 'flatpak') push(base);
      if (app.flatpak) {
        const tail = String(app.flatpak).split('.').pop();
        push(tail && tail.toLowerCase());
        push(tail);
      }
      push(app.deb);
      push(app.id);
      return out.slice(0, 6);
    },

    resolve(names) {
      const key = names.join('|');
      if (this._cache.has(key)) return Promise.resolve(this._cache.get(key));
      if (this._pending.has(key)) return this._pending.get(key);
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
            el.innerHTML = '';
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

  // ============================================================================
  // 1. GERÇEK TAURI NATIVE WINDOW MANAGER
  // ============================================================================
  const WindowManager = {
    highestZ: 30,
    windows: [],
    nativeWindows: [],
    _desktopHidden: false,
    tabsContainer: null,
    _isLayerAbove: false,
    // Tembel render: kapatılıp DOM'dan çıkarılan pencereler açılışta geri takılır.
    detached: new Map(),

    ensureDesktopLayer(above) {
      if (this._isLayerAbove === above) return;
      this._isLayerAbove = above;
      TauriBridge.invoke('set_desktop_layer', { above }).catch(() => {});
    },

    checkAllMinimizedOrClosed() {
      const hasActive = this.windows.some(w => w.classList.contains('open') && !w.classList.contains('minimized'));
      if (!hasActive) {
        this.ensureDesktopLayer(false);
      }
    },

    init() {
      this.windows = Array.from(document.querySelectorAll('.window'));
      this.tabsContainer = document.getElementById('running-tabs');
      setInterval(() => this.refreshNativeWindows(), 1500);
      this.refreshNativeWindows();

      const wp = document.getElementById('desktop-wallpaper');
      if (wp) {
        wp.addEventListener('click', () => {
          this.checkAllMinimizedOrClosed();
        });
      }

      // Pencere düğmeleri belge düzeyinde dinlenir: init'ten sonra eklenen
      // pencereler de kapat/küçült/büyüt düğmelerine yanıt verir.
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('.ctrl-btn');
        if (!btn) return;
        const w = btn.closest('.window');
        if (!w) return;
        e.stopPropagation();
        if (!this.windows.includes(w)) this.windows.push(w);
        if (btn.classList.contains('close')) this.close(w);
        else if (btn.classList.contains('min')) this.minimize(w);
        else if (btn.classList.contains('max')) this.toggleMaximize(w);
      }, true);

      this.windows.forEach(win => {
        win.addEventListener('mousedown', () => this.bringToFront(win));

        const btnMax = win.querySelector('.ctrl-btn.max');
        if (btnMax) {
          btnMax.addEventListener('mouseenter', () => {
            const menu = document.getElementById('snap-layouts-menu');
            if (!menu) return;
            const bRect = btnMax.getBoundingClientRect();
            menu.style.top = `${bRect.bottom + 6}px`;
            menu.style.left = `${Math.max(10, bRect.right - 240)}px`;
            menu.classList.add('open');
            this.activeSnapTargetWin = win;
          });
          btnMax.addEventListener('mouseleave', () => {
            const menu = document.getElementById('snap-layouts-menu');
            if (!menu) return;
            setTimeout(() => {
              if (!menu.matches(':hover') && !btnMax.matches(':hover')) {
                menu.classList.remove('open');
              }
            }, 250);
          });
        }

        // Yüksek Performanslı ve Akıcı Pencere Sürükleme (GPU / rAF Dragging + Ayaz DE Edge Snapping)
        const header = win.querySelector('.window-header');
        if (header) {
          // Başlığa çift tıklama ile Büyüt / Eski Boyuta Getir
          header.addEventListener('dblclick', (e) => {
            if (e.target.closest('.window-controls')) return;
            this.toggleMaximize(win);
          });

          header.addEventListener('mousedown', (e) => {
            if (e.target.closest('.window-controls')) return;

            this.bringToFront(win);

            let wasMax = win.classList.contains('maximized');
            const snapGhost = document.getElementById('snap-ghost-indicator') || document.getElementById('window-snap-preview');
            let rect = win.getBoundingClientRect();
            let shiftX = e.clientX - rect.left;
            let shiftY = e.clientY - rect.top;

            let rafId = null;
            let targetX = rect.left;
            let targetY = rect.top;
            let activeSnap = null;
            let draggingActive = false;

            const applyPos = () => {
              win.style.left = `${targetX}px`;
              win.style.top = `${targetY}px`;
              rafId = null;
            };

            const onMouseMove = (moveEvent) => {
              if (!draggingActive) {
                if (Math.abs(moveEvent.clientX - e.clientX) < 5 && Math.abs(moveEvent.clientY - e.clientY) < 5) return;
                draggingActive = true;
                if (wasMax) {
                  const preW = parseFloat(win.dataset.preMaxW) || Math.min(840, window.innerWidth * 0.75);
                  const preH = parseFloat(win.dataset.preMaxH) || Math.min(520, window.innerHeight * 0.7);
                  const ratio = Math.max(0.1, Math.min(0.9, e.clientX / window.innerWidth));
                  this.toggleMaximize(win);
                  win.style.width = `${preW}px`;
                  win.style.height = `${preH}px`;
                  shiftX = preW * ratio;
                  shiftY = 18;
                  wasMax = false;
                }
                document.body.classList.add('is-dragging');
                win.classList.add('is-dragging');
              }

              const maxLeft = Math.max(0, window.innerWidth - 80);
              const maxTop = Math.max(0, window.innerHeight - 80);
              targetX = Math.max(0, Math.min(moveEvent.clientX - shiftX, maxLeft));
              targetY = Math.max(0, Math.min(moveEvent.clientY - shiftY, maxTop));
              if (!rafId) {
                rafId = requestAnimationFrame(applyPos);
              }

              const tbVar = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-height'), 10);
              const tbH = Number.isFinite(tbVar) ? tbVar : 44;
              const sw = window.innerWidth;
              const sh = window.innerHeight - tbH;

              // Ayaz DE Akıcı Köşe ve Kenar Kenetleme Algılayıcı (Aero Snap)
              if (moveEvent.clientX < 20 && moveEvent.clientY < 35) {
                activeSnap = 'corner-tl';
                if (snapGhost) {
                  snapGhost.style.display = 'block';
                  snapGhost.style.left = '4px';
                  snapGhost.style.top = '4px';
                  snapGhost.style.width = `calc(${sw * 0.5}px - 8px)`;
                  snapGhost.style.height = `calc(${sh * 0.5}px - 8px)`;
                  snapGhost.classList.add('visible');
                }
              } else if (moveEvent.clientX > sw - 20 && moveEvent.clientY < 35) {
                activeSnap = 'corner-tr';
                if (snapGhost) {
                  snapGhost.style.display = 'block';
                  snapGhost.style.left = `calc(${sw * 0.5}px + 4px)`;
                  snapGhost.style.top = '4px';
                  snapGhost.style.width = `calc(${sw * 0.5}px - 8px)`;
                  snapGhost.style.height = `calc(${sh * 0.5}px - 8px)`;
                  snapGhost.classList.add('visible');
                }
              } else if (moveEvent.clientX < 20 && moveEvent.clientY > window.innerHeight - 80) {
                activeSnap = 'corner-bl';
                if (snapGhost) {
                  snapGhost.style.display = 'block';
                  snapGhost.style.left = '4px';
                  snapGhost.style.top = `calc(${sh * 0.5}px + 4px)`;
                  snapGhost.style.width = `calc(${sw * 0.5}px - 8px)`;
                  snapGhost.style.height = `calc(${sh * 0.5}px - 8px)`;
                  snapGhost.classList.add('visible');
                }
              } else if (moveEvent.clientX > sw - 20 && moveEvent.clientY > window.innerHeight - 80) {
                activeSnap = 'corner-br';
                if (snapGhost) {
                  snapGhost.style.display = 'block';
                  snapGhost.style.left = `calc(${sw * 0.5}px + 4px)`;
                  snapGhost.style.top = `calc(${sh * 0.5}px + 4px)`;
                  snapGhost.style.width = `calc(${sw * 0.5}px - 8px)`;
                  snapGhost.style.height = `calc(${sh * 0.5}px - 8px)`;
                  snapGhost.classList.add('visible');
                }
              } else if (moveEvent.clientX < 18) {
                activeSnap = 'left';
                if (snapGhost) {
                  snapGhost.style.display = 'block';
                  snapGhost.style.left = '4px';
                  snapGhost.style.top = '4px';
                  snapGhost.style.width = `calc(${sw * 0.5}px - 8px)`;
                  snapGhost.style.height = `calc(${sh}px - 8px)`;
                  snapGhost.classList.add('visible');
                }
              } else if (moveEvent.clientX > sw - 18) {
                activeSnap = 'right';
                if (snapGhost) {
                  snapGhost.style.display = 'block';
                  snapGhost.style.left = `calc(${sw * 0.5}px + 4px)`;
                  snapGhost.style.top = '4px';
                  snapGhost.style.width = `calc(${sw * 0.5}px - 8px)`;
                  snapGhost.style.height = `calc(${sh}px - 8px)`;
                  snapGhost.classList.add('visible');
                }
              } else if (moveEvent.clientY < 14) {
                activeSnap = 'top';
                if (snapGhost) {
                  snapGhost.style.display = 'block';
                  snapGhost.style.left = '4px';
                  snapGhost.style.top = '4px';
                  snapGhost.style.width = `calc(${sw}px - 8px)`;
                  snapGhost.style.height = `calc(${sh}px - 8px)`;
                  snapGhost.classList.add('visible');
                }
              } else {
                activeSnap = null;
                if (snapGhost) {
                  snapGhost.classList.remove('visible');
                  snapGhost.style.display = 'none';
                }
              }
            };

            const onMouseUp = () => {
              if (rafId) cancelAnimationFrame(rafId);
              document.body.classList.remove('is-dragging');
              win.classList.remove('is-dragging');
              if (snapGhost) {
                snapGhost.classList.remove('visible');
                snapGhost.style.display = 'none';
              }

              document.removeEventListener('mousemove', onMouseMove);
              document.removeEventListener('mouseup', onMouseUp);

              if (!draggingActive) return;

              // Snapping Eylemini Uygula
              if (activeSnap === 'left') {
                this.snapWindow(win, 'left-half');
              } else if (activeSnap === 'right') {
                this.snapWindow(win, 'right-half');
              } else if (activeSnap === 'top') {
                this.toggleMaximize(win);
              } else if (activeSnap === 'corner-tl') {
                this.snapWindow(win, 'corner-tl');
              } else if (activeSnap === 'corner-tr') {
                this.snapWindow(win, 'corner-tr');
              } else if (activeSnap === 'corner-bl') {
                this.snapWindow(win, 'corner-bl');
              } else if (activeSnap === 'corner-br') {
                this.snapWindow(win, 'corner-br');
              }
            };

            document.addEventListener('mousemove', onMouseMove, { passive: true });
            document.addEventListener('mouseup', onMouseUp, { once: true });
          });

          // Dokunmatik sürükleme: tek parmak başlıkta pencereyi taşır.
          // Fare yolu aynen korunur; dokunmatik yalnızca konum uygular
          // (kenetleme fareye özeldir). touch-action: none CSS'te tanımlı.
          header.addEventListener('touchstart', (e) => {
            if (e.target.closest('.window-controls')) return;
            if (e.touches.length !== 1) return;
            this.bringToFront(win);
            const t = e.touches[0];
            const rect = win.getBoundingClientRect();
            const offX = t.clientX - rect.left;
            const offY = t.clientY - rect.top;
            let moved = false;
            const onTouchMove = (me) => {
              if (me.touches.length !== 1) return;
              if (me.cancelable) me.preventDefault();
              const m = me.touches[0];
              moved = true;
              const maxLeft = Math.max(0, window.innerWidth - 80);
              const maxTop = Math.max(0, window.innerHeight - 80);
              win.style.left = `${Math.max(0, Math.min(m.clientX - offX, maxLeft))}px`;
              win.style.top = `${Math.max(0, Math.min(m.clientY - offY, maxTop))}px`;
            };
            const onTouchEnd = () => {
              header.removeEventListener('touchmove', onTouchMove);
              if (moved && typeof SessionManager !== 'undefined') SessionManager.touch();
            };
            header.addEventListener('touchmove', onTouchMove, { passive: false });
            header.addEventListener('touchend', onTouchEnd, { once: true });
            header.addEventListener('touchcancel', onTouchEnd, { once: true });
          }, { passive: true });
        }

        // Pencere Boyutlandırma Tutamacı (Resize Handle)
        if (!win.querySelector('.window-resize-handle')) {
          const handle = document.createElement('div');
          handle.className = 'window-resize-handle';
          handle.title = 'Yeniden Boyutlandır';
          win.appendChild(handle);

          handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.bringToFront(win);

            const startW = win.offsetWidth;
            const startH = win.offsetHeight;
            const startX = e.clientX;
            const startY = e.clientY;
            let resizeRaf = null;
            let targetW = startW;
            let targetH = startH;

            const applyResize = () => {
              win.style.width = `${targetW}px`;
              win.style.height = `${targetH}px`;
              resizeRaf = null;
            };

            const onResizeMove = (moveEvent) => {
              if (win.classList.contains('maximized')) return;
              targetW = Math.max(300, startW + (moveEvent.clientX - startX));
              targetH = Math.max(260, startH + (moveEvent.clientY - startY));
              if (!resizeRaf) {
                resizeRaf = requestAnimationFrame(applyResize);
              }
            };

            const onResizeUp = () => {
              if (resizeRaf) cancelAnimationFrame(resizeRaf);
              document.removeEventListener('mousemove', onResizeMove);
              document.removeEventListener('mouseup', onResizeUp);
            };

            document.addEventListener('mousemove', onResizeMove, { passive: true });
            document.addEventListener('mouseup', onResizeUp, { once: true });
          });

          // Dokunmatik boyutlandırma: tutamaç tek parmakla sürüklenir.
          handle.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1 || win.classList.contains('maximized')) return;
            e.preventDefault();
            this.bringToFront(win);
            const t = e.touches[0];
            const startW = win.offsetWidth;
            const startH = win.offsetHeight;
            const startX = t.clientX;
            const startY = t.clientY;
            const onTouchMove = (me) => {
              if (me.touches.length !== 1) return;
              if (me.cancelable) me.preventDefault();
              const m = me.touches[0];
              win.style.width = `${Math.max(300, startW + (m.clientX - startX))}px`;
              win.style.height = `${Math.max(260, startH + (m.clientY - startY))}px`;
            };
            const onTouchEnd = () => {
              handle.removeEventListener('touchmove', onTouchMove);
              if (typeof SessionManager !== 'undefined') SessionManager.touch();
            };
            handle.addEventListener('touchmove', onTouchMove, { passive: false });
            handle.addEventListener('touchend', onTouchEnd, { once: true });
            handle.addEventListener('touchcancel', onTouchEnd, { once: true });
          }, { passive: false });
        }
      });

      const snapMenu = document.getElementById('snap-layouts-menu');
      if (snapMenu) {
        snapMenu.addEventListener('mouseleave', () => {
          snapMenu.classList.remove('open');
        });
        snapMenu.querySelectorAll('.snap-zone').forEach(zone => {
          zone.addEventListener('click', (e) => {
            e.stopPropagation();
            const snapType = zone.getAttribute('data-snap');
            if (this.activeSnapTargetWin && snapType) {
              this.snapWindow(this.activeSnapTargetWin, snapType);
            }
            snapMenu.classList.remove('open');
          });
        });
      }
    },

    bringToFront(winInput) {
      const win = typeof winInput === 'string' ? document.getElementById(winInput) : winInput;
      if (!win) return;
      // z-index sayacı önceki tasarımda sınırsızdı; açık pencereler
      // 6000+ katmana çıkınca panel flyout'ları ve bağlam menüleri pencere
      // ARKASINDA kalıyordu. Pencere katmanı 9000'te tavanlanır; tavana
      // gelindiğinde açık pencereler göreli sırası korunarak yeniden sıkışır.
      const Z_WINDOW_MAX = 9000;
      if (this.highestZ >= Z_WINDOW_MAX - 1) {
        const openWins = this.windows
          .filter(w => w.classList.contains('open'))
          .map(w => ({ w, z: parseInt(w.style.zIndex, 10) || 20 }))
          .sort((a, b) => a.z - b.z);
        openWins.forEach((entry, i) => {
          entry.w.style.zIndex = String(20 + i);
          this.highestZ = 20 + i;
        });
      }
      this.highestZ++;
      win.style.zIndex = Math.min(this.highestZ, Z_WINDOW_MAX);
      this.windows.forEach(w => w.classList.remove('active'));
      win.classList.add('active');
      this.syncTabs();
      this.ensureDesktopLayer(true);
    },

    open(winId) {
      const targetId = typeof winId === 'string' ? winId : (winId && winId.id ? winId.id : null);
      if (targetId && this.detached && this.detached.has(targetId)) {
        const det = this.detached.get(targetId);
        this.detached.delete(targetId);
        if (det.cont) {
          if (det.next && det.next.parentNode === det.cont) {
            det.cont.insertBefore(det.el, det.next);
          } else {
            det.cont.appendChild(det.el);
          }
        }
      }
      const win = typeof winId === 'string' ? document.getElementById(winId) : winId;
      if (!win) return;

      WorkspaceManager.adopt(win);
      win.classList.remove('minimized');
      win.classList.add('open');
      this.bringToFront(win);
      this.syncTabs();

      if ((winId === 'win-installer' || (win && win.id === 'win-installer')) && typeof InstallerWizard !== 'undefined') {
        InstallerWizard.loadDisks();
      }

      if (winId === 'win-updater' && typeof UpdaterManager !== 'undefined' && !UpdaterManager.latestRelease) {
        UpdaterManager.checkForUpdates();
      }
      SessionManager.touch();
    },

    close(winInput) {
      const win = typeof winInput === 'string' ? document.getElementById(winInput) : winInput;
      if (!win) return;
      win.classList.remove('open');
      win.classList.remove('active');
      try {
        if (win.id === 'win-office' && typeof OfficeManager !== 'undefined') {
          OfficeManager.clearFrame();
        }
        if (win.id === 'win-browser') {
          const frame = document.getElementById('browser-iframe') || document.getElementById('browser-frame');
          if (frame) frame.src = 'about:blank';
        }
        // Kapanan pencere sonrası ekranda kalan en üst pencereye odaklan
        const nextActive = this.getActiveWindow();
        if (nextActive) {
          this.bringToFront(nextActive);
        } else {
          this.syncTabs();
          this.checkAllMinimizedOrClosed();
        }
        SessionManager.touch();
        // Tembel render: kapanış 30 sn sonra hâlâ açık değilse eleman DOM'dan
        // çıkarılır; iframe kaynakları boşaltılır. Açılışta open() geri takar.
        if (win.id && !this.detached.has(win.id)) {
          setTimeout(() => {
            if (win.classList.contains('open')) return;
            const cont = win.parentNode;
            if (!cont) return;
            try {
              win.querySelectorAll('iframe').forEach(f => { f.src = 'about:blank'; });
            } catch (e2) { /* iframe erişimi olmadıysa boş ver */ }
            this.detached.set(win.id, { el: win, cont, next: win.nextSibling });
            win.remove();
            this.syncTabs();
          }, 30 * 1000);
        }
      } catch (err) {
        console.warn('[WindowManager.close]', err);
        this.syncTabs();
      }
    },

    minimize(winInput) {
      const win = typeof winInput === 'string' ? document.getElementById(winInput) : winInput;
      if (!win) return;
      win.classList.add('minimized');
      win.classList.remove('active');
      try {
        const nextActive = this.getActiveWindow();
        if (nextActive) {
          this.bringToFront(nextActive);
        } else {
          this.syncTabs();
          this.checkAllMinimizedOrClosed();
        }
        SessionManager.touch();
      } catch (err) {
        console.warn('[WindowManager.minimize]', err);
        this.syncTabs();
      }
    },

    toggleMaximize(winInput) {
      const win = typeof winInput === 'string' ? document.getElementById(winInput) : winInput;
      if (!win) return;
      if (!win.classList.contains('maximized')) {
        win.dataset.preMaxW = win.style.width || `${win.offsetWidth}px`;
        win.dataset.preMaxH = win.style.height || `${win.offsetHeight}px`;
        win.dataset.preMaxLeft = win.style.left || `${win.offsetLeft}px`;
        win.dataset.preMaxTop = win.style.top || `${win.offsetTop}px`;
        win.classList.add('maximized');
      } else {
        win.classList.remove('maximized');
        if (win.dataset.preMaxW) {
          win.style.width = win.dataset.preMaxW;
          win.style.height = win.dataset.preMaxH;
          win.style.left = win.dataset.preMaxLeft;
          win.style.top = win.dataset.preMaxTop;
        }
      }
      const maxBtn = win.querySelector('.ctrl-btn.max');
      if (maxBtn) {
        const isMax = win.classList.contains('maximized');
        maxBtn.textContent = isMax ? '❐' : '□';
        maxBtn.title = isMax ? 'Eski Boyut' : 'Büyüt';
      }
      this.bringToFront(win);
      SessionManager.touch();
    },

    snapWindow(win, layout) {
      if (!win) return;
      win.classList.remove('maximized');
      win.classList.remove('minimized');
      win.classList.add('open');
      this.bringToFront(win);

      const tbVar = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-height'), 10);
      const tbHeight = Number.isFinite(tbVar) ? tbVar : 44;
      const sw = window.innerWidth;
      const sh = window.innerHeight - tbHeight;

      switch(layout) {
        case 'left-half':
          win.style.left = '0px';
          win.style.top = '0px';
          win.style.width = `${sw * 0.5}px`;
          win.style.height = `${sh}px`;
          break;
        case 'right-half':
          win.style.left = `${sw * 0.5}px`;
          win.style.top = '0px';
          win.style.width = `${sw * 0.5}px`;
          win.style.height = `${sh}px`;
          break;
        case 'left-focus':
          win.style.left = '0px';
          win.style.top = '0px';
          win.style.width = `${sw * 0.7}px`;
          win.style.height = `${sh}px`;
          break;
        case 'right-sidebar':
          win.style.left = `${sw * 0.7}px`;
          win.style.top = '0px';
          win.style.width = `${sw * 0.3}px`;
          win.style.height = `${sh}px`;
          break;
        case 'col-left':
          win.style.left = '0px';
          win.style.top = '0px';
          win.style.width = `${sw * 0.25}px`;
          win.style.height = `${sh}px`;
          break;
        case 'col-center':
          win.style.left = `${sw * 0.25}px`;
          win.style.top = '0px';
          win.style.width = `${sw * 0.5}px`;
          win.style.height = `${sh}px`;
          break;
        case 'col-right':
          win.style.left = `${sw * 0.75}px`;
          win.style.top = '0px';
          win.style.width = `${sw * 0.25}px`;
          win.style.height = `${sh}px`;
          break;
        case 'corner-tl':
          win.style.left = '0px';
          win.style.top = '0px';
          win.style.width = `${sw * 0.5}px`;
          win.style.height = `${sh * 0.5}px`;
          break;
        case 'corner-tr':
          win.style.left = `${sw * 0.5}px`;
          win.style.top = '0px';
          win.style.width = `${sw * 0.5}px`;
          win.style.height = `${sh * 0.5}px`;
          break;
        case 'corner-bl':
          win.style.left = '0px';
          win.style.top = `${sh * 0.5}px`;
          win.style.width = `${sw * 0.5}px`;
          win.style.height = `${sh * 0.5}px`;
          break;
        case 'corner-br':
          win.style.left = `${sw * 0.5}px`;
          win.style.top = `${sh * 0.5}px`;
          win.style.width = `${sw * 0.5}px`;
          win.style.height = `${sh * 0.5}px`;
          break;
      }
      SessionManager.touch();
    },

    getActiveWindow() {
      const openWins = this.windows.filter(w => w.classList.contains('open') && !w.classList.contains('minimized'));
      if (openWins.length === 0) return null;
      return openWins.reduce((max, w) => {
        const z = parseInt(w.style.zIndex || '0', 10);
        const maxZ = parseInt(max.style.zIndex || '0', 10);
        return z > maxZ ? w : max;
      }, openWins[0]);
    },

    snapActive(direction) {
      const win = this.getActiveWindow();
      if (!win) return;
      if (direction === 'left') this.snapWindow(win, 'left-half');
      else if (direction === 'right') this.snapWindow(win, 'right-half');
      else if (direction === 'up') {
        if (!win.classList.contains('maximized')) this.toggleMaximize(win);
      } else if (direction === 'down') {
        if (win.classList.contains('maximized')) this.toggleMaximize(win);
        else this.minimize(win);
      }
    },

    cascadeWindows() {
      const openWins = this.windows.filter(w => w.classList.contains('open') && !w.classList.contains('minimized'));
      if (openWins.length === 0) return;
      const count = openWins.length;
      const tbVar = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-height'), 10);
      const tbHeight = Number.isFinite(tbVar) ? tbVar : 44;
      const sw = window.innerWidth;
      const sh = window.innerHeight - tbHeight;

      if (count === 1) {
        openWins[0].style.left = '10vw';
        openWins[0].style.top = '8vh';
        openWins[0].style.width = '80vw';
        openWins[0].style.height = `${sh * 0.8}px`;
      } else if (count === 2) {
        this.snapWindow(openWins[0], 'left-half');
        this.snapWindow(openWins[1], 'right-half');
      } else if (count <= 4) {
        const positions = ['corner-tl', 'corner-tr', 'corner-bl', 'corner-br'];
        openWins.forEach((w, i) => this.snapWindow(w, positions[i % 4]));
      } else {
        openWins.forEach((w, i) => {
          w.style.left = `${30 + i * 40}px`;
          w.style.top = `${30 + i * 36}px`;
          w.style.width = '60vw';
          w.style.height = '60vh';
          this.bringToFront(w);
        });
      }
      SessionManager.touch();
    },

    syncTabs() {
      if (!this.tabsContainer) return;
      // Getir/odak gibi olaylar her seferinde syncTabs çağırıyor; küme
      // değişmediyse tüm çubuğu tahrip etme yerine aynı çizimde kal.
      // Yerel pencereler de imzaya girer, yoksa yalnızca onlar değiştiğinde
      // erken dönüş yüzünden sekmeleri hiç çizilmiyordu.
      const sig = this.windows.map(w => {
        const meta = w.querySelector('.window-meta span');
        return [
          w.id,
          w.classList.contains('open') && !w.classList.contains('ws-hide') ? 1 : 0,
          w.classList.contains('active') ? 1 : 0,
          w.classList.contains('minimized') ? 1 : 0,
          meta ? meta.textContent : ''
        ].join('|');
      }).join('\n') + '\n#' + (this.nativeWindows || []).map(n => `${n.id}|${n.is_active}|${n.title}`).join('\n');
      if (sig === this._tabsSig) return;
      this._tabsSig = sig;
      this.tabsContainer.innerHTML = '';

      const makeTab = (title, active, iconHtml, tip) => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = `task-tab${active ? ' active' : ''}`;
        tab.title = tip || title;
        tab.innerHTML = `<span class="task-tab-icon">${iconHtml}</span><span class="task-tab-label">${escapeHtml(title)}</span>`;
        return tab;
      };

      this.windows.forEach(win => {
        // Başka çalışma alanındaki açık pencereler görev çubuğunda görünmez;
        // oralara dönüş noktalarla yapılır.
        if (!win.classList.contains('open') || win.classList.contains('ws-hide')) return;
        const titleSpan = win.querySelector('.window-meta span');
        const title = titleSpan ? titleSpan.textContent.split('—')[0].trim() : 'Pencere';
        const svg = win.querySelector('.window-meta svg');
        const isActive = win.classList.contains('active') && !win.classList.contains('minimized');
        const tab = makeTab(title, isActive, svg ? svg.outerHTML : '');
        if (win.classList.contains('minimized')) tab.classList.add('minimized');

        const toggle = () => {
          if (win.classList.contains('minimized')) {
            win.classList.remove('minimized');
            this.bringToFront(win);
          } else if (win.classList.contains('active')) {
            this.minimize(win);
          } else {
            this.bringToFront(win);
          }
        };
        tab.addEventListener('click', toggle);
        tab.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); this.close(win); } });
        tab.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.showTabMenu(e, [
            { label: win.classList.contains('minimized') ? 'Geri yükle' : 'Küçült', run: () => win.classList.contains('minimized') ? toggle() : this.minimize(win) },
            { label: win.classList.contains('maximized') ? 'Eski boyut' : 'Büyüt', run: () => this.toggleMaximize(win) },
            { label: 'Kapat', danger: true, run: () => this.close(win) }
          ]);
        });
        this.tabsContainer.appendChild(tab);
      });

      // Gerçek X11 Yerel Uygulama Pencereleri Görev Çubuğunda Listelenir
      (this.nativeWindows || []).forEach(nw => {
        const shortTitle = (nw.title || nw.app_name || 'Uygulama').split(/ [—–-] /).pop().trim().substring(0, 28) || nw.app_name;
        const letter = escapeHtml((nw.app_name || '?').charAt(0).toUpperCase());
        const tab = makeTab(shortTitle, nw.is_active, `<span class="task-tab-letter">${letter}</span>`, `${nw.title} (${nw.app_name})`);
        tab.classList.add('native-task-tab');
        const refresh = (ms) => setTimeout(() => this.refreshNativeWindows(true), ms);
        const activate = () => {
          this.ensureDesktopLayer(false);
          TauriBridge.invoke('activate_native_window', { id: nw.id }).catch(() => {});
          refresh(250);
        };
        const minimize = () => {
          TauriBridge.invoke('minimize_native_window', { id: nw.id }).catch(() => {});
          refresh(250);
        };
        const close = () => {
          TauriBridge.invoke('close_native_window', { id: nw.id }).catch(() => {});
          refresh(400);
        };
        tab.addEventListener('click', () => (nw.is_active ? minimize() : activate()));
        tab.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); close(); } });
        tab.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.showTabMenu(e, [
            { label: 'Öne getir', run: activate },
            { label: 'Küçült', run: minimize },
            { label: 'Kapat', danger: true, run: close }
          ]);
        });
        this.tabsContainer.appendChild(tab);
      });
    },

    // Görev çubuğu sekmesi sağ tık menüsü. Tek örnek; dışarı tıklayınca,
    // Esc ile ya da bir seçim yapılınca kapanır.
    showTabMenu(e, items) {
      let menu = document.getElementById('taskbar-tab-menu');
      if (!menu) {
        menu = document.createElement('div');
        menu.id = 'taskbar-tab-menu';
        menu.className = 'taskbar-tab-menu';
        menu.setAttribute('role', 'menu');
        document.body.appendChild(menu);
        const hide = () => menu.classList.remove('open');
        document.addEventListener('mousedown', (ev) => { if (!menu.contains(ev.target)) hide(); });
        document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') hide(); });
        window.addEventListener('blur', hide);
      }
      menu.innerHTML = '';
      items.forEach(it => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'menuitem');
        b.className = it.danger ? 'danger' : '';
        b.textContent = it.label;
        b.addEventListener('click', () => { menu.classList.remove('open'); it.run(); });
        menu.appendChild(b);
      });
      menu.classList.add('open');
      const w = menu.offsetWidth;
      const h = menu.offsetHeight;
      menu.style.left = `${Math.max(6, Math.min(e.clientX - w / 2, window.innerWidth - w - 6))}px`;
      menu.style.top = `${Math.max(6, e.clientY - h - 10)}px`;
    },

    async refreshNativeWindows(force) {
      if (document.hidden || (window.LockManager && window.LockManager.isLocked)) return;
      try {
        const wins = await TauriBridge.invoke('get_native_windows');
        if (Array.isArray(wins)) {
          const prevSig = (this.nativeWindows || []).map(w => `${w.id}:${w.is_active}:${w.title}`).join('|');
          const newSig = wins.map(w => `${w.id}:${w.is_active}:${w.title}`).join('|');
          if (force || prevSig !== newSig) {
            this.nativeWindows = wins;
            this.syncTabs();
          }
        }
      } catch (e) {}
    },

    toggleShowDesktop() {
      this._desktopHidden = !this._desktopHidden;
      if (this._desktopHidden) {
        this.windows.forEach(w => {
          if (w.classList.contains('open')) w.classList.add('minimized');
        });
        TauriBridge.invoke('minimize_all_windows').catch(() => {});
      } else {
        this.windows.forEach(w => {
          if (w.classList.contains('open')) w.classList.remove('minimized');
        });
      }
      this.syncTabs();
    }
  };

  // ============================================================================
  // 1b. SANAL ÇALIŞMA ALANLARI (VIRTUAL DESKS)
  // ============================================================================
  const WorkspaceManager = {
    active: 1,
    count: 4,
    max: 6,

    // Yeni açılan pencere, kullanıcının o an bulunduğu alanda belirir.
    adopt(win) {
      win.setAttribute('data-ws', String(this.active));
      win.classList.remove('ws-hide');
    },

    set(n) {
      this.active = Math.min(Math.max(1, n || 1), this.max);
      document.querySelectorAll('.window.open').forEach(win => {
        const ws = parseInt(win.getAttribute('data-ws'), 10) || 1;
        win.classList.toggle('ws-hide', ws !== this.active);
      });
      TauriBridge.invoke('set_native_workspace', { index: this.active - 1 }).catch(() => {});
      this.syncDots();
      if (typeof WindowManager !== 'undefined') WindowManager.syncTabs();
      SessionManager.touch();
    },

    next() { this.set(this.active + 1 > this.max ? 1 : this.active + 1); },
    prev() { this.set(this.active - 1 < 1 ? this.max : this.active - 1); },

    // Ctrl + Super + N: boş bir alan açılır; alan sayısı maksimuma kadar büyür.
    grow() {
      if (this.count >= this.max) return;
      this.count += 1;
      this.set(this.count);
    },

    syncDots() {
      const host = document.getElementById('taskbar-ws-dots');
      if (!host) return;
      host.innerHTML = '';
      for (let i = 1; i <= this.count; i++) {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = `ws-dot${i === this.active ? ' active' : ''}`;
        dot.textContent = String(i);
        dot.title = `Masaüstü ${i} (Tıkla ve Geç)`;
        dot.setAttribute('aria-label', `Masaüstü ${i}`);
        dot.setAttribute('aria-current', i === this.active ? 'true' : 'false');
        dot.addEventListener('click', () => this.set(i));
        host.appendChild(dot);
      }
    },

    toggleOverview() {
      const ov = document.getElementById('workspace-overview');
      const grid = document.getElementById('overview-grid');
      if (!ov || !grid) return;
      if (!ov.hidden) { this.closeOverview(); return; }

      grid.textContent = '';
      const wins = WindowManager.windows.filter(w =>
        w.classList.contains('open') && !w.classList.contains('ws-hide'));
      const nativeWins = Array.isArray(WindowManager.nativeWindows) ? WindowManager.nativeWindows : [];

      if (wins.length === 0 && nativeWins.length === 0) {
        grid.innerHTML = '<div class="overview-empty">Açık pencere yok</div>';
      }

      wins.forEach(win => {
        const titleSpan = win.querySelector('.window-meta span');
        const title = titleSpan ? titleSpan.textContent.split('—')[0].trim() : 'Pencere';
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'overview-card';
        card.innerHTML = '<span class="overview-glyph"></span><span class="overview-title"></span>';
        card.querySelector('.overview-glyph').textContent = title.charAt(0).toLocaleUpperCase('tr');
        card.querySelector('.overview-title').textContent = title;
        card.addEventListener('click', () => {
          this.closeOverview();
          win.classList.remove('minimized');
          WindowManager.bringToFront(win);
        });
        grid.appendChild(card);
      });

      nativeWins.forEach(nw => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `overview-card ${nw.is_active ? 'active' : ''}`;
        const title = (nw.title || nw.app_name || 'Uygulama').split('—')[0].trim();
        card.innerHTML = '<span class="overview-glyph" style="background:linear-gradient(135deg,#0284c7,#38bdf8);color:#fff;"></span><span class="overview-title"></span>';
        card.querySelector('.overview-glyph').textContent = (nw.app_name || title).charAt(0).toLocaleUpperCase('tr');
        card.querySelector('.overview-title').textContent = title;
        card.title = `${nw.title} (${nw.app_name})`;
        card.addEventListener('click', () => {
          this.closeOverview();
          TauriBridge.invoke('activate_native_window', { id: nw.id }).catch(() => {});
        });
        grid.appendChild(card);
      });

      ov.hidden = false;
    },

    closeOverview() {
      const ov = document.getElementById('workspace-overview');
      if (ov) ov.hidden = true;
    }
  };

  // ============================================================================
  // 2. GERÇEK DİNAMİK XDG .DESKTOP UYGULAMA MOTORU
  // ============================================================================

  // ============================================================================
  // 1b. MENÜ SABİTLEME + GÖREV ÇUBUĞU PANEL PİNERE (kullanıcı istek listesi:
  // sağ tık → Sabitle / Araç çubuğuna ekle / Masaüstüne ekle / Kaldır).
  // ============================================================================
  const AppPinManager = {
    MENU_KEY: 'ankora_menu_pins',
    TASKBAR_KEY: 'ankora_taskbar_pins',

    read(key) {
      try {
        const arr = JSON.parse(SafeStorage.getItem(key) || '[]');
        return Array.isArray(arr) ? arr : [];
      } catch (e) { return []; }
    },

    write(key, arr) {
      SafeStorage.setItem(key, JSON.stringify(arr));
    },

    isPinnedMenu(appId) { return this.read(this.MENU_KEY).includes(appId); },

    isPinnedTaskbar(appId) {
      return this.read(this.TASKBAR_KEY).some(p => p.id === appId);
    },

    toggleMenuPin(appId) {
      let pins = this.read(this.MENU_KEY);
      if (pins.includes(appId)) {
        pins = pins.filter(id => id !== appId);
        ReportManager?.showToast('Menü sabitlemesi kaldırıldı.');
      } else {
        pins.push(appId);
        ReportManager?.showToast('Uygulama başlat menüsüne sabitlendi.');
      }
      this.write(this.MENU_KEY, pins);
      this.renderMenuPins();
    },

    toggleTaskbarPin(app) {
      const pinned = this.isPinnedTaskbar(app.id);
      if (pinned) {
        this.write(this.TASKBAR_KEY, this.read(this.TASKBAR_KEY).filter(p => p.id !== app.id));
        ReportManager?.showToast('Panel simgesi kaldırıldı.');
      } else {
        const pins = this.read(this.TASKBAR_KEY);
        pins.push({ id: app.id, name: app.name, exec: app.exec || app.id });
        this.write(this.TASKBAR_KEY, pins.slice(-8)); // panede en fazla 8 özel simge
        ReportManager?.showToast('Uygulama görev çubuğuna eklendi.');
      }
      this.renderTaskbarPins();
    },

    // Başlat menüsündeki statik "Sabitlemeler" bölümünün üstüne kendi
    // sabitlenen uygulamalar ızgarası kurulur.
    renderMenuPins() {
      const host = document.getElementById('start-pinned-grid');
      if (!host) return;
      let section = document.getElementById('ankora-menu-pins');
      if (!section) {
        section = document.createElement('div');
        section.id = 'ankora-menu-pins';
        section.className = 'start-pinned-grid';
        host.parentNode.insertBefore(section, host);
      }
      const pins = this.read(this.MENU_KEY);
      section.innerHTML = '';
      if (!pins.length) {
        section.style.display = 'none';
        return;
      }
      section.style.display = 'grid';
      pins.forEach(id => {
        const app = (typeof XdgDesktopEngine !== 'undefined' && XdgDesktopEngine.installedApps || [])
          .find(a => a.id === id) || { id, name: id };
        const card = document.createElement('div');
        card.className = 'pinned-app-card dynamic-installed-app';
        card.innerHTML = `
          <div class="pinned-icon-box">${(typeof IconResolver !== 'undefined' && IconResolver.getIconSvg) ? IconResolver.getIconSvg(app) : `<svg><use href="#ico-package"></use></svg>`}</div>
          <div class="pinned-app-meta"><div class="pinned-app-name" style="font-size:10.5px;">${escapeHtml(app.name || id)}</div></div>
        `;
        card.title = `${app.name || id}\n\nSağ tık: seçenekler (sabitlemeyi kaldır)`;
        card.addEventListener('click', () => {
          if (typeof XdgDesktopEngine !== 'undefined' && XdgDesktopEngine.launchApp) XdgDesktopEngine.launchApp(app);
          else TauriBridge.invoke('launch_application', { exec: app.exec || app.id });
        });
        card.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          if (typeof XdgDesktopEngine !== 'undefined' && XdgDesktopEngine.showShortcutContextMenu) {
            XdgDesktopEngine.showShortcutContextMenu(e, { ...app, _pinned: true });
          }
        });
        section.appendChild(card);
      });
    },

    // Görev çubuğuna özel sabitlenen simgeler (statik pin'lerin önüne eklenir).
    renderTaskbarPins() {
      const host = document.querySelector('.taskbar-quick-pins');
      if (!host) return;
      host.querySelectorAll('.taskbar-dynamic-pin').forEach(el => el.remove());
      const pins = this.read(this.TASKBAR_KEY);
      pins.forEach(pin => {
        const btn = document.createElement('button');
        btn.className = 'taskbar-pin-btn taskbar-dynamic-pin';
        btn.title = `${pin.name || pin.id}\n\nSağ tık: seçenekler`;
        btn.dataset.pinInternal = pin.id;
        btn.dataset.pinExec = pin.exec || '';
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="3"></rect><circle cx="12" cy="12" r="3"></circle></svg>`;
        btn.addEventListener('click', () => {
          const exec = pin.exec || '';
          if (exec.startsWith('internal:')) {
            WindowManager.open(exec.replace('internal:', ''));
          } else {
            TauriBridge.invoke('launch_application', { exec })
              .catch(err => ReportManager?.showToast(`Başlatılamadı: ${err.message || err}`, 'error'));
          }
        });
        btn.addEventListener('contextmenu', (e) => {
          if (typeof window.showPinContextMenu === 'function') {
            window.showPinContextMenu(e, btn);
            return;
          }
          e.preventDefault();
          this.toggleTaskbarPin({ id: pin.id, name: pin.name, exec: pin.exec });
        });
        host.insertBefore(btn, host.firstChild);
      });
    },

    init() {
      this.renderMenuPins();
      this.renderTaskbarPins();
      // Uygulama listesi tarandıkça sabit niteliklerin adları güncel tutulur.
      if (typeof XdgDesktopEngine !== 'undefined' && XdgDesktopEngine._scanTimerSetup) return;
    },
  };

  const XdgDesktopEngine = {
    installedApps: [],

    getDefaultApps() {
      return [
        {
          id: 'ankora-installer',
          name: 'Sistemi Kur',
          exec: 'internal:win-installer',
          targetWindow: 'win-installer',
          cat: 'sys',
          comment: 'Ankora Linux 3.6 Sabit Diske Kurulum Sihirbazı',
          is_installed_by_user: true
        },
        {
          id: 'ankora-welcome',
          name: 'Ankora Karşılayıcı',
          exec: 'internal:win-welcome',
          targetWindow: 'win-welcome',
          cat: 'util',
          comment: 'Sisteme Genel Bakış ve Hoş Geldiniz Rehberi',
          is_installed_by_user: true
        },
        {
          id: 'ayaz-files',
          name: 'Dosyalar',
          exec: 'internal:win-files',
          targetWindow: 'win-files',
          cat: 'util',
          comment: 'Dosya Yöneticisi ve Dizin Gezgini',
          is_installed_by_user: true
        },
        {
          id: 'ayaz-term',
          name: 'Ayaz Uçbirim',
          exec: 'internal:win-terminal',
          targetWindow: 'win-terminal',
          cat: 'sys',
          comment: 'Güçlü Linux Uçbirimi ve Komut Satırı',
          is_installed_by_user: true
        },
        {
          id: 'ankora-store',
          name: 'Yazılım Mağazası',
          exec: 'internal:win-store',
          targetWindow: 'win-store',
          cat: 'sys',
          comment: 'Paket Yöneticisi ve Uygulama Mağazası',
          is_installed_by_user: true
        },
        {
          id: 'brave-browser',
          name: 'Brave Web Tarayıcı',
          exec: 'brave-browser',
          targetWindow: null,
          cat: 'net',
          comment: 'Hızlı, Gizlilik Odaklı Güvenli Web Tarayıcısı',
          is_installed_by_user: true
        },
        {
          id: 'ankora-screenshot',
          name: 'Ekran Görüntüsü',
          exec: 'internal:win-screenshot',
          targetWindow: 'win-screenshot',
          cat: 'util',
          comment: 'Tam ekran, pencere veya serbest alan yakalama aracı',
          is_installed_by_user: true
        },
        {
          id: 'ankora-office',
          name: 'Ankora Ofis',
          exec: 'internal:win-office',
          targetWindow: 'win-office',
          cat: 'office',
          comment: 'Belge Düzenleyici ve Not Defteri',
          is_installed_by_user: true
        },
        {
          id: 'ayaz-widgets',
          name: 'Widget Merkezi',
          exec: 'internal:win-widgets',
          targetWindow: 'win-widgets',
          cat: 'util',
          comment: 'Saat ve sistem bilgisi bileşenlerini masaüstüne yerleştirir',
          is_installed_by_user: true
        },
        {
          id: 'ankora-flasher',
          name: 'USB & ISO Yazıcı',
          exec: 'internal:win-flasher',
          targetWindow: 'win-flasher',
          cat: 'sys',
          comment: 'USB bellek biçimlendirici ve ISO kalıbı yazıcı',
          is_installed_by_user: true
        },
        {
          id: 'fatih-kalem',
          name: 'Fatih Kalem',
          exec: 'fatih-kalem',
          targetWindow: null,
          cat: 'office',
          comment: 'Etkileşimli akıllı tahta ve ekran çizim/not kalemi',
          is_installed_by_user: true
        }
      ];
    },

    async init() {
      // 1. Kullanıcının kurduğu gerçek uygulamaları yerel depolamadan oku
      const cached = SafeStorage.getItem('ankora_xdg_apps');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          this.installedApps = (Array.isArray(parsed) && parsed.length > 0)
            ? parsed.filter(a => a && a.id)
            : this.getDefaultApps();
        } catch (e) {
          this.installedApps = this.getDefaultApps();
        }
      } else {
        this.installedApps = this.getDefaultApps();
      }

      // Bu sürümde gelen yerleşik uygulama eski önbelleklerde yok. Bir kez eklenir;
      // bayrak sayesinde kullanıcı sonradan sildiğinde geri gelmez.
      if (SafeStorage.getItem('ankora_builtin_widgets_added') !== 'true') {
        if (!this.installedApps.some(a => a.id === 'ayaz-widgets')) {
          const freshWidgetApp = this.getDefaultApps().find(a => a.id === 'ayaz-widgets');
          if (freshWidgetApp) this.installedApps.push(freshWidgetApp);
        }
        SafeStorage.setItem('ankora_builtin_widgets_added', 'true');
      }

      this.renderToDesktop();
      this.renderToStartMenu();
      AppPinManager.init();

      // Sistem XDG dizinlerini tara. İlk tarama ISO ile gelen sistem
      // uygulamalarını taban listeye yazar; sonraki taramalarda YENİ görünen
      // her kayıt (terminalden kurulan) başlat menüsüne ve masaüstüne eklenir.
      this.rescanXdgApps(true);
      if (!this._scanTimer) {
        this._scanTimer = setInterval(() => this.rescanXdgApps(false), 45000);
      }
    },

    seenIds() {
      try {
        const raw = SafeStorage.getItem('ankora_xdg_seen_ids');
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch (e) {
        return [];
      }
    },

    markSeen(id) {
      const seen = new Set(this.seenIds());
      seen.add(id);
      SafeStorage.setItem('ankora_xdg_seen_ids', JSON.stringify(Array.from(seen)));
    },

    async rescanXdgApps(firstScan) {
      try {
        const apps = await TauriBridge.invoke('scan_xdg_applications');
        if (!apps || !Array.isArray(apps)) return;

        const seen = new Set(this.seenIds());
        const known = new Set(this.installedApps.map(a => a.id));
        const fresh = [];
        let changed = false;

        apps.forEach(app => {
          if (!app || !app.id) return;

          if (app.is_installed_by_user) {
            const idx = this.installedApps.findIndex(a => a.id === app.id);
            if (idx >= 0) {
              this.installedApps[idx] = { ...this.installedApps[idx], ...app, is_installed_by_user: true };
            } else {
              this.installedApps.push({ ...app, is_installed_by_user: true, on_desktop: true });
              fresh.push(app);
            }
            changed = true;
            seen.add(app.id);
            return;
          }

          if (!seen.has(app.id)) {
            if (firstScan) {
              // İlk tarama: sistemle birlikte gelen uygulamalar bilinen
              // sayılır; masaüstü ilk açılışta yüzlerce simgeyle dolmaz.
              seen.add(app.id);
              return;
            }
            if (!known.has(app.id)) {
              // Sonradan kurulmuş bir uygulama (ör. `apt install ...`).
              this.installedApps.push({ ...app, is_installed_by_user: true, on_desktop: true });
              seen.add(app.id);
              fresh.push(app);
              changed = true;
            }
          }
        });

        SafeStorage.setItem('ankora_xdg_seen_ids', JSON.stringify(Array.from(seen)));
        if (changed) {
          SafeStorage.setItem('ankora_xdg_apps', JSON.stringify(this.installedApps));
          this.renderToDesktop();
          this.renderToStartMenu();
        }
        fresh.forEach(app => {
          Terminal.log(`[XDG] '${app.name}' bulundu; başlat menüsüne ve masaüstüne eklendi.`, 'success');
          if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
            ReportManager.showToast(`Yeni uygulama: ${app.name}`);
          }
        });
      } catch (err) {}
    },

    addApplication(app) {
      if (!app || !app.id) return;
      app.is_installed_by_user = true;
      const existingIdx = this.installedApps.findIndex(a => a.id === app.id);
      if (existingIdx >= 0) {
        this.installedApps[existingIdx] = app;
      } else {
        this.installedApps.push(app);
      }
      // Sonradan silinip terminalden yeniden kurulduğunda "yeni" sayılması
      // için bilinen uygulamalar listesine de yazılır.
      this.markSeen(app.id);

      SafeStorage.setItem('ankora_xdg_apps', JSON.stringify(this.installedApps));
      this.renderToDesktop();
      this.renderToStartMenu();
    },

    removeApplication(appId) {
      this.installedApps = this.installedApps.filter(a => a.id !== appId);
      this.removeAppFromAllGroups(appId);
      this.closeGroup();
      // Kayıt bilinenler listesinden de düşer: uygulama sonradan geri
      // kurulursa tarama onu yeniden bulur ve masaüstüne ekler.
      const seen = this.seenIds().filter(id => id !== appId);
      SafeStorage.setItem('ankora_xdg_seen_ids', JSON.stringify(seen));
      SafeStorage.setItem('ankora_xdg_apps', JSON.stringify(this.installedApps));
      this.renderToDesktop();
      this.renderToStartMenu();
    },

    // Masaüstü simgesini ekle veya kaldır. Uygulama listeden çıkmaz, yalnızca
    // masaüstünden gizlenir; başlat menüsünden geri getirilir.
    toggleDesktopIcon(appId) {
      const app = this.installedApps.find(a => a.id === appId);
      if (!app) return;
      app.on_desktop = app.on_desktop === false;
      if (app.on_desktop === false) this.removeAppFromAllGroups(appId);
      SafeStorage.setItem('ankora_xdg_apps', JSON.stringify(this.installedApps));
      this.renderToDesktop();
      this.renderToStartMenu();
    },

    // --- Masaüstü kategorileri (Android benzeri klasörler) ---
    GROUPS_KEY: 'ankora_desktop_groups',

    groupsLoad() {
      try {
        const raw = JSON.parse(SafeStorage.getItem(this.GROUPS_KEY) || '[]');
        if (!Array.isArray(raw)) return [];
        return raw
          .filter(g => g && typeof g.id === 'string' && g.id)
          .map(g => ({
            id: g.id,
            name: String(g.name || 'Kategori').slice(0, 40),
            items: Array.isArray(g.items) ? Array.from(new Set(g.items.filter(id => typeof id === 'string'))) : []
          }));
      } catch (e) {
        return [];
      }
    },

    groupsSave(groups) {
      SafeStorage.setItem(this.GROUPS_KEY, JSON.stringify(groups));
    },

    groupById(id) {
      return this.groupsLoad().find(g => g.id === id) || null;
    },

    groupForApp(appId) {
      return this.groupsLoad().find(g => g.items.indexOf(appId) !== -1) || null;
    },

    groupApps(group) {
      if (!group) return [];
      return group.items
        .map(id => this.installedApps.find(a => a.id === id && a.on_desktop !== false))
        .filter(Boolean);
    },

    cleanGroupName(name) {
      const clean = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return clean || 'Kategori';
    },

    createGroup(name, firstAppId) {
      const groups = this.groupsLoad();
      const group = {
        id: 'g-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: this.cleanGroupName(name),
        items: []
      };
      if (firstAppId && this.installedApps.some(a => a.id === firstAppId)) group.items.push(firstAppId);
      groups.push(group);
      this.groupsSave(groups);
      return group;
    },

    renameGroup(groupId, name) {
      const groups = this.groupsLoad();
      const group = groups.find(g => g.id === groupId);
      if (!group) return;
      group.name = this.cleanGroupName(name);
      this.groupsSave(groups);
      this.renderToDesktop();
      if (typeof DesktopFiles !== 'undefined' && DesktopFiles.refresh) DesktopFiles.refresh();
    },

    deleteGroup(groupId) {
      const groups = this.groupsLoad().filter(g => g.id !== groupId);
      this.groupsSave(groups);
      this.closeGroup();
      this.renderToDesktop();
      if (typeof DesktopFiles !== 'undefined' && DesktopFiles.refresh) DesktopFiles.refresh();
    },

    moveAppToGroup(appId, groupId) {
      if (!appId || appId.startsWith('group:')) return false;
      const app = this.installedApps.find(a => a.id === appId);
      const groups = this.groupsLoad();
      const target = groups.find(g => g.id === groupId);
      if (!app || !target) return false;
      if (app.on_desktop === false) {
        app.on_desktop = true;
        SafeStorage.setItem('ankora_xdg_apps', JSON.stringify(this.installedApps));
        this.renderToStartMenu();
      }
      groups.forEach(g => { g.items = g.items.filter(id => id !== appId); });
      target.items.push(appId);
      this.groupsSave(groups);
      this.closeGroup();
      this.renderToDesktop();
      if (typeof DesktopFiles !== 'undefined' && DesktopFiles.refresh) DesktopFiles.refresh();
      if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
        ReportManager.showToast(`'${app.name}' → '${target.name}' kategorisine taşındı.`);
      }
      return true;
    },

    removeAppFromGroup(appId, groupId) {
      const groups = this.groupsLoad();
      const target = groups.find(g => g.id === groupId);
      if (!target) return;
      target.items = target.items.filter(id => id !== appId);
      this.groupsSave(groups);
      this.closeGroup();
      this.renderToDesktop();
      if (typeof DesktopFiles !== 'undefined' && DesktopFiles.refresh) DesktopFiles.refresh();
      const app = this.installedApps.find(a => a.id === appId);
      if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
        ReportManager.showToast(`'${app ? app.name : 'Uygulama'}' masaüstüne döndü.`);
      }
    },

    removeAppFromAllGroups(appId) {
      const groups = this.groupsLoad();
      let changed = false;
      groups.forEach(g => {
        const before = g.items.length;
        g.items = g.items.filter(id => id !== appId);
        if (g.items.length !== before) changed = true;
      });
      if (changed) this.groupsSave(groups);
    },

    buildGroupTile(group) {
      const apps = this.groupApps(group);
      const el = document.createElement('div');
      el.className = 'desktop-item folder-item';
      el.dataset.appId = 'group:' + group.id;
      el.dataset.groupId = group.id;
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.title = `${group.name} (${apps.length} uygulama)\n• Çift tıkla aç\n• Sağ tıkla düzenle`;

      const icon = document.createElement('div');
      icon.className = 'item-icon folder-preview' + (apps.length ? '' : ' empty');
      if (!apps.length) {
        icon.innerHTML = '<svg class="glyph" aria-hidden="true"><use href="#ico-folder"></use></svg>';
      } else {
        apps.slice(0, 4).forEach(app => {
          const mini = document.createElement('span');
          mini.className = 'folder-mini';
          mini.innerHTML = this.getAppSvgIcon(app);
          IconResolver.tagIcon(mini, app);
          icon.appendChild(mini);
        });
      }

      const name = document.createElement('span');
      name.className = 'item-name';
      name.textContent = group.name;
      el.appendChild(icon);
      el.appendChild(name);

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.desktop-item').forEach(x => x.classList.remove('selected'));
        el.classList.add('selected');
      });
      el.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.openGroup(group.id);
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.openGroup(group.id);
        }
      });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showGroupContextMenu(e, group);
      });
      return el;
    },

    openGroup(groupId) {
      const group = this.groupById(groupId);
      const overlay = document.getElementById('desktop-folder-overlay');
      const grid = document.getElementById('desktop-folder-grid');
      const title = document.getElementById('desktop-folder-title');
      const count = document.getElementById('desktop-folder-count');
      if (!group || !overlay || !grid || !title) return;
      const apps = this.groupApps(group);
      this._groupReturnFocus = document.activeElement;
      this._openGroupId = groupId;
      title.textContent = group.name;
      if (count) count.textContent = apps.length ? `${apps.length} uygulama` : 'Henüz uygulama yok';
      grid.textContent = '';

      if (!apps.length) {
        const empty = document.createElement('div');
        empty.className = 'folder-empty';
        empty.textContent = 'Bir uygulamayı bu kategoriye taşımak için masaüstündeki simgesini klasörün üzerine sürükleyin.';
        grid.appendChild(empty);
      } else {
        apps.forEach(app => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'folder-app';
          btn.title = `${app.name}\n• Tıkla başlat\n• Sağ tıkla seçenekler`;
          const icon = document.createElement('div');
          icon.className = 'item-icon';
          icon.innerHTML = this.getAppSvgIcon(app);
          IconResolver.tagIcon(icon, app);
          const name = document.createElement('span');
          name.className = 'folder-app-name';
          name.textContent = app.name;
          const ejectBtn = document.createElement('span');
          ejectBtn.className = 'folder-app-eject';
          ejectBtn.title = 'Masaüstüne Çıkar';
          ejectBtn.textContent = '✕';
          ejectBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.removeAppFromGroup(app.id, group.id);
          });
          btn.appendChild(icon);
          btn.appendChild(name);
          btn.appendChild(ejectBtn);
          btn.addEventListener('click', () => this.launchApp(app));
          btn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showGroupAppMenu(e, app, group);
          });
          grid.appendChild(btn);
        });
      }

      overlay.hidden = false;
      IconResolver.upgradeScope(grid);
      const close = document.getElementById('desktop-folder-close');
      if (close) setTimeout(() => close.focus(), 30);
    },

    closeGroup() {
      const overlay = document.getElementById('desktop-folder-overlay');
      if (overlay && !overlay.hidden) {
        overlay.hidden = true;
        const back = this._groupReturnFocus;
        if (back && back.isConnected && typeof back.focus === 'function') back.focus();
      }
      this._openGroupId = null;
    },

    initGroupOverlay() {
      if (this._groupOverlayBound) return;
      this._groupOverlayBound = true;
      const overlay = document.getElementById('desktop-folder-overlay');
      const close = document.getElementById('desktop-folder-close');
      if (overlay) {
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) this.closeGroup();
        });
      }
      if (close) close.addEventListener('click', () => this.closeGroup());
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this._openGroupId) {
          e.stopPropagation();
          this.closeGroup();
        }
      });
      if (overlay) {
        overlay.addEventListener('keydown', (e) => {
          if (e.key !== 'Tab') return;
          const focusable = Array.from(overlay.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'));
          if (!focusable.length) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        });
      }
    },

    showGroupContextMenu(e, group) {
      let menu = document.getElementById('group-context-menu');
      if (!menu) {
        menu = document.createElement('div');
        menu.id = 'group-context-menu';
        menu.className = 'desktop-context-menu';
        document.body.appendChild(menu);
      }
      menu.innerHTML = `
        <div class="ctx-item" data-action="open"><span>Aç</span></div>
        <div class="ctx-item" data-action="rename"><span>Yeniden Adlandır</span></div>
        <div class="ctx-divider"></div>
        <div class="ctx-item ctx-danger" data-action="delete"><span>Kategoriyi Sil</span></div>
      `;
      const x = Math.min(e.clientX, window.innerWidth - 230);
      const y = Math.min(e.clientY, window.innerHeight - 170);
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
      menu.classList.add('open');
      const closeMenu = () => {
        menu.classList.remove('open');
        document.removeEventListener('click', closeMenu);
      };
      setTimeout(() => document.addEventListener('click', closeMenu), 10);
      menu.querySelectorAll('.ctx-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const act = btn.getAttribute('data-action');
          closeMenu();
          if (act === 'open') {
            this.openGroup(group.id);
          } else if (act === 'rename') {
            const name = prompt('Kategori adı:', group.name);
            if (name && name.trim()) this.renameGroup(group.id, name);
          } else if (act === 'delete') {
            const appCount = this.groupApps(group).length;
            if (!confirm(`'${group.name}' kategorisi silinsin mi? ${appCount ? 'İçindeki uygulamalar masaüstüne döner.' : ''}`)) return;
            this.deleteGroup(group.id);
          }
        });
      });
    },

    showGroupAppMenu(e, app, group) {
      let menu = document.getElementById('group-app-context-menu');
      if (!menu) {
        menu = document.createElement('div');
        menu.id = 'group-app-context-menu';
        menu.className = 'desktop-context-menu';
        document.body.appendChild(menu);
      }
      menu.innerHTML = `
        <div class="ctx-item" data-action="launch"><span>Uygulamayı Başlat</span></div>
        <div class="ctx-divider"></div>
        <div class="ctx-item" data-action="remove"><span>Masaüstüne Taşı (Kategoriden Çıkar)</span></div>
      `;
      const x = Math.min(e.clientX, window.innerWidth - 230);
      const y = Math.min(e.clientY, window.innerHeight - 150);
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
      menu.classList.add('open');
      const closeMenu = () => {
        menu.classList.remove('open');
        document.removeEventListener('click', closeMenu);
      };
      setTimeout(() => document.addEventListener('click', closeMenu), 10);
      menu.querySelectorAll('.ctx-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const act = btn.getAttribute('data-action');
          closeMenu();
          if (act === 'launch') this.launchApp(app);
          else if (act === 'remove') this.removeAppFromGroup(app.id, group.id);
        });
      });
    },

    renderToDesktop() {
      const container = document.getElementById('dynamic-desktop-icons');
      if (!container) return;
      container.innerHTML = '';
      // Çöp kutusu masaüstünde dâimî simgedir; XDG yeniden çiziminde kaybolmasın.
      if (typeof DesktopFiles !== 'undefined' && DesktopFiles.ensureTrashIcon) {
        DesktopFiles.ensureTrashIcon(container);
      }

      // Masaüstünde yalnızca masaüstüne eklenmiş uygulamalar durur. Başlat
      // menüsü bütün uygulamaları listeler, oradan geri eklenebilir.
      const groups = this.groupsLoad();
      const groupedIds = new Set();
      groups.forEach(g => g.items.forEach(id => groupedIds.add(id)));
      const onDesktop = this.installedApps.filter(a => a.on_desktop !== false && !groupedIds.has(a.id));
      if (onDesktop.length === 0 && groups.length === 0) {
        return;
      }

      const frag = document.createDocumentFragment();
      onDesktop.forEach(app => {
        const item = document.createElement('div');
        const cat = app.cat || 'util';
        item.className = `desktop-item ayaz-desktop-shortcut cat-${cat}`;
        item.tabIndex = 0;
        item.setAttribute('role', 'button');
        item.setAttribute('data-app-id', app.id);
        item.title = `${app.name} (${app.exec})\n${app.comment || ''}\n• Çift tıkla başlat\n• Sağ tıkla seçenekler`;

        const svgIcon = this.getAppSvgIcon(app);
        item.innerHTML = `
          <div class="item-icon">
            ${svgIcon}
            <span class="item-cat-dot"></span>
          </div>
          <span class="item-name">${escapeHtml(app.name)}</span>
        `;
        const deskIcon = item.querySelector('.item-icon');
        if (deskIcon) IconResolver.tagIcon(deskIcon, app);

        // Tek tık: Odak / Seçim
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          document.querySelectorAll('.desktop-item').forEach(el => el.classList.remove('selected'));
          item.classList.add('selected');
        });

        // Çift tık: Akıllı Başlatma (CLI -> Terminal, GUI -> launch_application)
        item.addEventListener('dblclick', async (e) => {
          e.stopPropagation();
          this.launchApp(app);
        });

        // Enter tuşu ile başlatma desteği
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.launchApp(app);
          }
        });

        // Sağ tık: Kısayol Özel Bağlam Menüsü
        item.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.showShortcutContextMenu(e, app);
        });

        frag.appendChild(item);
      });
      groups.forEach(group => frag.appendChild(this.buildGroupTile(group)));
      container.appendChild(frag);
      this.initGroupOverlay();
      this.layoutDesktopIcons(container);
      IconResolver.upgradeScope(container);
    },

    // Masaüstü simge ızgarası. Konumlar uygulama kimliğine göre {c, r} hücresi
    // olarak saklanır; ekran küçülürse taşan simge ilk boş hücreye kayar.
    ICON_CELL_W: 96,
    ICON_CELL_H: 104,

    _iconPositions() {
      try {
        const raw = JSON.parse(SafeStorage.getItem('ankora_icon_pos') || '{}');
        return raw && typeof raw === 'object' ? raw : {};
      } catch (_) {
        return {};
      }
    },

    _gridSize(container) {
      const w = (container && container.clientWidth > 0)
        ? container.clientWidth
        : (window.innerWidth ? window.innerWidth - 32 : 1280);
      const h = (container && container.clientHeight > 0)
        ? container.clientHeight
        : (window.innerHeight ? window.innerHeight - 80 : 720);
      const cols = Math.max(1, Math.floor(w / this.ICON_CELL_W));
      const rows = Math.max(1, Math.floor(h / this.ICON_CELL_H));
      return { cols, rows };
    },

    layoutDesktopIcons(container) {
      container = container || document.getElementById('dynamic-desktop-icons');
      if (!container) return;
      const { cols, rows } = this._gridSize(container);
      const saved = this._iconPositions();
      const used = new Set();
      const items = Array.from(container.querySelectorAll('.desktop-item'));
      const placed = new Map();

      items.forEach(el => {
        const p = saved[el.dataset.appId];
        if (p && p.c < cols && p.r < rows && !used.has(`${p.c},${p.r}`)) {
          used.add(`${p.c},${p.r}`);
          placed.set(el, p);
        }
      });
      // Konumu olmayanlar sütun sütun ilk boş hücreye dizilir.
      let c = 0, r = 0;
      items.forEach(el => {
        if (placed.has(el)) return;
        while (used.has(`${c},${r}`) && c < cols) {
          r++;
          if (r >= rows) { r = 0; c++; }
        }
        const p = { c: Math.min(c, cols - 1), r };
        used.add(`${p.c},${p.r}`);
        placed.set(el, p);
      });

      placed.forEach((p, el) => {
        el.style.left = `${p.c * this.ICON_CELL_W}px`;
        el.style.top = `${p.r * this.ICON_CELL_H}px`;
        el.dataset.cell = `${p.c},${p.r}`;
        if (!el._dragBound) this._bindIconDrag(el, container);
      });

      if (!this._iconResizeBound) {
        this._iconResizeBound = true;
        let t = null;
        window.addEventListener('resize', () => {
          clearTimeout(t);
          t = setTimeout(() => this.layoutDesktopIcons(), 150);
        });
      }
    },

    alignDesktopIcons() {
      SafeStorage.removeItem('ankora_icon_pos');
      this.layoutDesktopIcons();
      if (typeof ReportManager !== 'undefined') {
        ReportManager.showToast('Masaüstü simgeleri hizalandı.');
      }
    },

    // Masaüstü simgelerini seçilen ölçüte göre ızgaraya yeniden dizer:
    // name | size | type(date yerine tarih) Kullanıcı şikayeti üzerine
    // "Simgeleri Sırala" menüsünü desteklemek için eklendi.
    async sortDesktopIcons(criterion) {
      const container = document.getElementById('dynamic-desktop-icons');
      if (!container) return;
      const items = Array.from(container.querySelectorAll('.desktop-item'));
      if (!items.length) {
        this.layoutDesktopIcons(container);
        return;
      }

      // Gerçek dosya meta verisi (boyut/tür/tarih); uygulama simgelerinde yalnızca ad.
      let fileMeta = new Map();
      try {
        const dirPath = (typeof DesktopFiles !== 'undefined' && DesktopFiles.dir) ? DesktopFiles.dir : null;
        if (dirPath) {
          const res = await TauriBridge.invoke('list_directory', { path: dirPath });
          (res && res.items ? res.items : []).forEach(it => fileMeta.set(`file:${it.path}`, it));
        }
      } catch (e) {}

      const nameOf = (el) => {
        const n = el.querySelector('.item-name');
        return (n ? n.textContent : '').trim().toLocaleLowerCase('tr');
      };

      const collator = new Intl.Collator('tr', { numeric: true, sensitivity: 'base' });
      const sorters = {
        // Ad: herkes için alfabetik.
        name: (a, b) => collator.compare(nameOf(a), nameOf(b)),
        // Boyut: gerçek dosyalar ham boyuta göre; klasörler en üstte,
        // uygulamalar/çöp en sonda alfabetik.
        size: (a, b) => {
          const ra = this._sizeRank(a, fileMeta);
          const rb = this._sizeRank(b, fileMeta);
          if (ra !== rb) return rb - ra;
          return collator.compare(nameOf(a), nameOf(b));
        },
        // Tür: Klasörler → belgeler → uygulamalar → Çöp Kutusu, her grup içi ad sırası.
        type: (a, b) => {
          const ta = this._typeRank(a, fileMeta);
          const tb = this._typeRank(b, fileMeta);
          if (ta !== tb) return ta - tb;
          return collator.compare(nameOf(a), nameOf(b));
        },
        // Tarih: gerçek dosyalar için yeni → eski; uygulama simgeleri en sonda.
        date: (a, b) => {
          const ma = fileMeta.get(a.getAttribute('data-app-id') || '');
          const mb = fileMeta.get(b.getAttribute('data-app-id') || '');
          const ta = ma ? (ma.mtime || 0) : -1;
          const tb = mb ? (mb.mtime || 0) : -1;
          if (ta !== tb) return tb - ta;
          return collator.compare(nameOf(a), nameOf(b));
        }
      };

      const sorter = sorters[criterion] || sorters.name;
      const sorted = [...items].sort(sorter);

      // data-app-id bulunmayan öğeler (ör. Çöp Kutusu) için kalıcı konum
      // anahtarı türetilir; layoutDesktopIcons aynı anahtarla adresler.
      sorted.forEach((el) => {
        if (!el.getAttribute('data-app-id')) {
          el.dataset.appId = `sort:${el.querySelector('.item-name') ? el.querySelector('.item-name').textContent.trim() : 'item'}`;
        }
      });

      // Ölçüt sırasına göre ızgara hücrelerini (sütun sütun) yeniden ata.
      const { cols, rows } = this._gridSize(container);
      const saved = {};
      sorted.forEach((el, i) => {
        const c = Math.floor(i / rows) % Math.max(1, cols);
        const r = i % rows;
        saved[el.dataset.appId] = { c, r };
        el.dataset.cell = `${c},${r}`;
      });

      SafeStorage.setItem('ankora_icon_pos', JSON.stringify(saved));
      this.layoutDesktopIcons(container);
      if (typeof ReportManager !== 'undefined') {
        ReportManager.showToast(`Simgeler yeniden dizildi (${criterion === 'name' ? 'Ad' : criterion === 'size' ? 'Boyut' : criterion === 'type' ? 'Öğe Türü' : 'Tarih'}).`);
      }
    },

    _sizeRank(el, fileMeta) {
      const meta = fileMeta.get(el.getAttribute('data-app-id') || '');
      if (el.classList.contains('trash-item') || !meta) return -1;
      return meta.is_dir ? Number.MAX_SAFE_INTEGER : (meta.size_bytes || 0);
    },

    _typeRank(el, fileMeta) {
      if (el.classList.contains('trash-item')) return 3;
      const meta = fileMeta.get(el.getAttribute('data-app-id') || '');
      if (meta) return meta.is_dir ? 0 : 1;
      if (el.classList.contains('file-item')) return 1;
      return 2;
    },

    _bindIconDrag(el, container) {
      el._dragBound = true;
      el.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const startX = e.clientX;
        const startY = e.clientY;
        const origLeft = el.offsetLeft;
        const origTop = el.offsetTop;
        let dragging = false;

        const onMove = (ev) => {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          if (!dragging) {
            if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
            dragging = true;
            el.classList.add('icon-dragging');
          }
          el.style.left = `${origLeft + dx}px`;
          el.style.top = `${origTop + dy}px`;
        };

        const onUp = (ev) => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          if (!dragging) return;
          el.classList.remove('icon-dragging');
          // Bırakma sonrası gelen click seçim/başlatma tetiklemesin.
          const swallow = (ce) => { ce.stopPropagation(); ce.preventDefault(); };
          el.addEventListener('click', swallow, { capture: true, once: true });
          setTimeout(() => el.removeEventListener('click', swallow, true), 0);

          // Uygulama simgesi bir kategori klasörünün üzerine bırakıldıysa
          // ızgaraya oturtmadan doğrudan klasöre taşınır.
          const appId = el.dataset.appId || '';
          if (appId && !appId.startsWith('group:') && !appId.startsWith('file:')) {
            const folder = Array.from(container.querySelectorAll('.folder-item')).find(item => {
              const rect = item.getBoundingClientRect();
              return ev.clientX >= rect.left && ev.clientX <= rect.right
                && ev.clientY >= rect.top && ev.clientY <= rect.bottom;
            });
            if (folder && folder.dataset.groupId) {
              this.moveAppToGroup(appId, folder.dataset.groupId);
              return;
            }
          }

          const { cols, rows } = this._gridSize(container);
          const nc = Math.max(0, Math.min(cols - 1, Math.round(el.offsetLeft / this.ICON_CELL_W)));
          const nr = Math.max(0, Math.min(rows - 1, Math.round(el.offsetTop / this.ICON_CELL_H)));
          const saved = this._iconPositions();
          const [oc, or] = (el.dataset.cell || '0,0').split(',').map(Number);
          // Hedef hücre doluysa iki simge yer değiştirir.
          const other = Array.from(container.querySelectorAll('.desktop-item'))
            .find(o => o !== el && o.dataset.cell === `${nc},${nr}`);
          if (other) saved[other.dataset.appId] = { c: oc, r: or };
          // Ekrandaki diğer simgelerin konumu da sabitlenir, yeniden dizilmesinler.
          container.querySelectorAll('.desktop-item').forEach(o => {
            if (o === el || o === other || saved[o.dataset.appId]) return;
            const [c, r] = (o.dataset.cell || '0,0').split(',').map(Number);
            saved[o.dataset.appId] = { c, r };
          });
          saved[el.dataset.appId] = { c: nc, r: nr };
          SafeStorage.setItem('ankora_icon_pos', JSON.stringify(saved));
          this.layoutDesktopIcons(container);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    },

    renderToStartMenu() {
      const heading = document.getElementById('start-installed-heading');
      const countEl = document.getElementById('start-installed-count');
      const container = document.getElementById('dynamic-start-apps');
      if (!container) return;

      container.innerHTML = '';
      // Menü düzenleyiciden gizlenen uygulamalar menüde listelenmez.
      const menuApps = this.installedApps.filter(a => a.is_menu_hidden !== true);
      if (menuApps.length === 0) {
        if (heading) heading.style.display = 'none';
        container.style.display = 'none';
        return;
      }

      if (heading) heading.style.display = 'flex';
      if (countEl) countEl.textContent = `${menuApps.length} Uygulama`;
      container.style.display = 'grid';

      const frag = document.createDocumentFragment();
      menuApps.forEach(app => {
        const card = document.createElement('div');
        const cat = app.cat || 'util';
        card.className = `pinned-app-card dynamic-installed-app cat-${cat}`;
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('data-app-id', app.id);
        card.setAttribute('data-open', app.id);
        card.title = `${app.name} (${app.exec})\n${app.comment || ''}\n• Tıkla ve Başlat\n• Sağ tıkla seçenekler`;

        const svgIcon = this.getAppSvgIcon(app);
        card.innerHTML = `
          <div class="pinned-icon-box" style="background: rgba(37, 99, 235, 0.14); color: var(--accent-active);">
            ${svgIcon}
          </div>
          <div class="pinned-app-meta">
            <span class="app-title">${escapeHtml(app.name)}</span>
            <span class="app-desc">${escapeHtml(app.comment || (app.exec + ' yazılımı'))}</span>
          </div>
        `;
        const pinIcon = card.querySelector('.pinned-icon-box');
        if (pinIcon) IconResolver.tagIcon(pinIcon, app);

        card.addEventListener('click', () => {
          this.launchApp(app);
          const startFlyout = document.getElementById('start-flyout');
          const startBtn = document.getElementById('start-btn');
          if (startFlyout) startFlyout.classList.remove('open');
          if (startBtn) startBtn.classList.remove('active');
        });

        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.launchApp(app);
            const startFlyout = document.getElementById('start-flyout');
            const startBtn = document.getElementById('start-btn');
            if (startFlyout) startFlyout.classList.remove('open');
            if (startBtn) startBtn.classList.remove('active');
          }
        });

        card.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.showShortcutContextMenu(e, app);
        });

        frag.appendChild(card);
      });
      container.appendChild(frag);
      IconResolver.upgradeScope(container);
    },

    getAppSvgIcon(app) {
      const cat = (app.cat || '').toLowerCase();
      const id = (app.id || app.exec || '').toLowerCase();

      if (id === 'ankora-installer' || id.includes('install')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line><path d="M12 12v-2"></path><polyline points="9 10 12 13 15 10"></polyline></svg>`;
      }
      if (id === 'ankora-welcome' || id.includes('welcome')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="5" r="3"></circle><line x1="12" y1="22" x2="12" y2="8"></line><path d="M5 12H2a10 10 0 0 0 20 0h-3"></path></svg>`;
      }
      if (id.includes('fatih') || id.includes('kalem')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path></svg>`;
      }
      // Son kullanıcı uygulamaları: her biri ayırt edici çizgi simge alır.
      // (Kuruluysa IconResolver gerçek simgeyle yükseltir; bu yedek kalır.)
      if (id.includes('firefox')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"></circle><path d="M12 3a9 9 0 0 1 8.5 6c-2 1-4 1.5-6 1.5-3.5 0-6.5-2-7.5-5.5C8.5 3.7 10 3 12 3z"></path><circle cx="12" cy="12" r="3.5"></circle></svg>`;
      }
      if (id.includes('chromium')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="3.5"></circle><path d="M12 3v5.5M4.2 16.5l4.8-2.7M19.8 16.5l-4.8-2.7"></path></svg>`;
      }
      if (id.includes('telegram')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 2L11 13"></path><path d="M22 2l-7 20-4-9-9-4z"></path></svg>`;
      }
      if (id.includes('discord')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="7" width="20" height="11" rx="5"></rect><path d="M7 11v4M5 13h4"></path><circle cx="16" cy="12" r="0.6"></circle><circle cx="18" cy="14" r="0.6"></circle></svg>`;
      }
      if (id.includes('spotify')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"></circle><path d="M8 10.5c2.7-.8 5.5-.4 8 1.2M8.5 13.5c2-.6 4-.3 5.8.9M9 16.3c1.5-.4 3-.2 4.3.7"></path></svg>`;
      }
      if (id.includes('vscode') || id.includes('vscodium')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M10 9l-3 3 3 3M14 9l3 3-3 3"></path></svg>`;
      }
      if (id.includes('heroic') || id.includes('lutris')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 9h12a5 5 0 0 1 5 5c0 2.5-2 4-3.5 4-1 0-1.8-.7-2.3-1.7L15.5 13h-7l-1.7 3.3c-.5 1-1.3 1.7-2.3 1.7C3 18 1 16.5 1 14a5 5 0 0 1 5-5z"></path><path d="M7 12v3M5.5 13.5h3"></path></svg>`;
      }
      if (id.includes('steam')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10" cy="14" r="5"></circle><circle cx="18" cy="6" r="3"></circle><path d="M13 11l2.5-2.5"></path></svg>`;
      }
      if (id.includes('vlc')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2L7 22h10z"></path><path d="M12 2c-3 4-4.5 9-4.5 14M12 2c3 4 4.5 9 4.5 14"></path><path d="M5 22h14"></path></svg>`;
      }
      if (id.includes('onlyoffice')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2l9 5-9 5-9-5z"></path><path d="M3 12l9 5 9-5"></path><path d="M3 17l9 5 9-5"></path></svg>`;
      }
      if (id.includes('obsidian')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h12l4 6-10 12L2 9z"></path><path d="M2 9h20M12 21L8 9l4-6 4 6z"></path></svg>`;
      }
      if (id.includes('libreoffice-writer')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="M9 15l4-4 3 3-4 4H9z"></path></svg>`;
      }
      if (id.includes('libreoffice-calc')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M3 9h18M3 14.5h18M10 9v11M15 9v11"></path></svg>`;
      }
      if (id.includes('libreoffice-impress')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="4" width="20" height="13" rx="2"></rect><path d="M12 17v4M8 21h8"></path></svg>`;
      }
      if (id.includes('wine')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 2h8v6a4 4 0 0 1-8 0z"></path><path d="M12 12v9M8 21h8"></path></svg>`;
      }
      if (id.includes('gimp')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 5l5 5L8 21l-5-5z"></path><path d="M13 6l5 5"></path></svg>`;
      }
      if (id.includes('krita')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2s6 7 6 12a6 6 0 0 1-12 0c0-5 6-12 6-12z"></path></svg>`;
      }
      if (id.includes('inkscape')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2l4 8-4 12-4-12z"></path><circle cx="12" cy="10" r="1"></circle></svg>`;
      }
      if (id.includes('blender')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2l9 5v10l-9 5-9-5V7z"></path><path d="M12 12l9-5M12 12L3 7M12 12v10"></path></svg>`;
      }
      if (id.includes('kdenlive') || id.includes('shotcut')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M7 4v16M17 4v16M2 9h5M2 15h5M17 9h5M17 15h5"></path></svg>`;
      }
      if (id.includes('obs')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="2"></circle><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9M4.6 4.6a10.5 10.5 0 0 0 0 14.8M19.4 4.6a10.5 10.5 0 0 1 0 14.8"></path></svg>`;
      }
      if (id.includes('audacity') || id.includes('sox')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12h20"></path><path d="M5 12v0M7 9v6M11 4v16M15 8v8M19 10v4"></path></svg>`;
      }
      if (id.includes('thunderbird')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M22 7l-10 6L2 7"></path></svg>`;
      }
      if (id.includes('filezilla')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><path d="M12 10v6M9.5 13.5L12 16l2.5-2.5"></path></svg>`;
      }
      if (id.includes('qbittorrent') || id.includes('transmission') || id.includes('aria2')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v7M8.5 11.5L12 15l3.5-3.5"></path></svg>`;
      }
      if (id.includes('gparted')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="6" width="20" height="12" rx="2"></rect><circle cx="7" cy="14" r="1"></circle><path d="M18 8v4"></path></svg>`;
      }
      if (id.includes('timeshift')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 4v5h5"></path><path d="M12 7v5l3 2"></path></svg>`;
      }
      if (id.includes('htop') || id.includes('btop') || id.includes('glances') || id.includes('iotop') || id.includes('iftop')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 20v-6M12 20V6M19 20v-9"></path></svg>`;
      }
      if (id.includes('neofetch') || id.includes('fastfetch') || id.includes('inxi')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M7 9l3 3-3 3M13 15h4"></path></svg>`;
      }
      if (id.includes('scratch')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 2h4v3a2 2 0 1 0 2 2h3v4h-3a2 2 0 1 0-2 2v3h-4v-3a2 2 0 1 0-2-2H5V7h3a2 2 0 1 0 2-2z"></path></svg>`;
      }
      if (id.includes('meb')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="9" r="6"></circle><path d="M8.5 13.5L7 22l5-2.5L17 22l-1.5-8.5"></path><path d="M10 9l1.5 1.5L15 7"></path></svg>`;
      }
      if (id.includes('gcompris')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="8" r="4"></circle><rect x="13" y="13" width="8" height="8" rx="1"></rect></svg>`;
      }
      if (id.includes('tuxmath')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="2" width="14" height="20" rx="2"></rect><path d="M8 6h8"></path><path d="M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01"></path></svg>`;
      }
      if (id.includes('tuxtype')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="6" width="20" height="12" rx="2"></rect><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"></path></svg>`;
      }
      if (id.includes('stellarium')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8-6.1-3.4-6.1 3.4 1.4-6.8L2.2 9.1l6.9-.8z"></path></svg>`;
      }
      if (id.includes('geogebra')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l10 18H2z"></path><circle cx="12" cy="15" r="2.5"></circle></svg>`;
      }
      if (id.includes('xournal')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 3l4 4L8 20l-5 1 1-5z"></path><path d="M15 5l4 4"></path></svg>`;
      }
      if (id.includes('evince') || id.includes('calibre') || id.includes('zathura')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5z"></path><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"></path></svg>`;
      }
      if (id.includes('antigravity') || id.includes('opencode')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"></path></svg>`;
      }
      if (id === 'ayaz-files' || id.includes('file')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
      }
      if (id === 'ayaz-term' || id.includes('term')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>`;
      }
      if (id === 'ankora-store' || id.includes('store') || id.includes('package')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>`;
      }
      if (id.includes('brave') || id === 'ankora-browser' || id.includes('browser')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z"></path><path d="M9 12l2 2 4-4"></path></svg>`;
      }
      if (id.includes('screenshot') || id.includes('scrot') || id.includes('snip')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>`;
      }
      if (id === 'ankora-office' || id.includes('office')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
      }
      if (id === 'ayaz-widgets' || id.includes('widget')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="8" height="8" rx="2"></rect><rect x="13" y="3" width="8" height="5" rx="2"></rect><rect x="13" y="10" width="8" height="11" rx="2"></rect><rect x="3" y="13" width="8" height="8" rx="2"></rect></svg>`;
      }

      if (id.includes('vlc') || id.includes('mpv') || id.includes('audio') || id.includes('media') || cat === 'media') {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
      }
      if (id.includes('git') || id.includes('code') || id.includes('vim') || id.includes('rust') || id.includes('go') || cat === 'dev') {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`;
      }
      if (id.includes('net') || id.includes('curl') || id.includes('wget') || id.includes('ip') || id.includes('shark') || cat === 'net') {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;
      }
      if (id.includes('office') || id.includes('writer') || id.includes('calc') || id.includes('doc') || cat === 'office') {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
      }
      if (id.includes('gimp') || id.includes('inkscape') || id.includes('krita') ||
          id.includes('blender') || id.includes('image') || cat === 'graphics') {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="M21 15l-5-5L5 21"></path></svg>`;
      }
      if (id.includes('sys') || id.includes('htop') || id.includes('top') || id.includes('parted') || cat === 'sys') {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>`;
      }
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>`;
    },

    async launchApp(app) {
      if (!app) return;
      if (app.id === 'brave-browser' || app.exec === 'brave-browser') {
        Terminal.log('[AYAZ BAŞLATICI] Brave Browser başlatılıyor...', 'cmd');
        try {
          await TauriBridge.invoke('launch_application', { exec: 'brave-browser' });
          ReportManager.showToast('Brave Web Tarayıcı başlatıldı.');
          return;
        } catch (e) {
          // Canlı ortamda kurulu değilse pencereye yönlendir
          WindowManager.open('win-browser');
          return;
        }
      }
      if (app.targetWindow || (app.exec && app.exec.startsWith('internal:'))) {
        const winId = app.targetWindow || app.exec.replace('internal:', '');
        const winEl = document.getElementById(winId);
        if (winEl) {
          WindowManager.open(winEl);
          return;
        }
      }
      const cliTools = [
        'htop', 'btop', 'top', 'neovim', 'nvim', 'vim', 'vi', 'nano', 'tmux',
        'ranger', 'mc', 'midnight-commander', 'bat', 'fzf', 'tree', 'jq',
        'strace', 'ltrace', 'shellcheck', 'ripgrep', 'rg', 'rsync', 'fd-find',
        'fd', 'gdb', 'valgrind', 'emacs-nox', 'python3', 'python3-pip', 'npm',
        'cargo', 'rustc', 'golang', 'ninja-build', 'cmake', 'sqlite3', 'sox', 'ffmpeg', 'git'
      ];
      const execName = (app.exec || app.id || '').toLowerCase();
      const isCli = cliTools.includes(execName);

      if (isCli) {
        WindowManager.open('win-terminal');
        Terminal.log(`[AYAZ BAŞLATICI] '${app.name}' terminal ortamında yürütülüyor: ${app.exec}`, 'cmd');
        try {
          await Terminal.runCommand(app.exec || app.id);
        } catch (e) {
          Terminal.log(`[BAŞLATMA BİLGİ] ${e}`, 'muted');
        }
      } else {
        Terminal.log(`[AYAZ BAŞLATICI] '${app.name}' yerel uygulama olarak başlatılıyor: ${app.exec}`, 'cmd');
        try {
          await TauriBridge.invoke('launch_application', { exec: app.exec });
          Terminal.log(`[AYAZ OK] ${app.name} başlatıldı.`, 'success');
        } catch (e) {
          Terminal.log(`[BAŞLATMA HATASI] ${e}`, 'error');
        }
      }
    },

    showShortcutContextMenu(e, app) {
      let menu = document.getElementById('shortcut-context-menu');
      if (!menu) {
        menu = document.createElement('div');
        menu.id = 'shortcut-context-menu';
        menu.className = 'desktop-context-menu shortcut-context-menu';
        document.body.appendChild(menu);
      }

      const groups = this.groupsLoad();
      const groupRows = groups.map(g => `
        <div class="ctx-item" data-action="group-move" data-group-id="${escapeHtml(g.id)}">
          <span>${escapeHtml(g.name)}</span>
        </div>`).join('');
      const groupSection = `
        <div class="context-menu-category">Kategoriye Taşı</div>
        ${groupRows}
        <div class="ctx-item" data-action="group-new"><span>Yeni Kategori…</span></div>
      `;

      menu.innerHTML = `
        <div class="ctx-item" data-action="launch">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          <span>Uygulamayı Başlat</span>
        </div>
        <div class="ctx-item" data-action="term">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
          <span>Terminalde Aç</span>
        </div>
        <div class="ctx-item" data-action="store">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
          <span>Mağazada Göster</span>
        </div>
        <div class="ctx-item" data-action="pin-toggle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 17v5M9 3h6l1 7 3 3h-4l-1 4h-4l-1-4H5l3-3z"></path></svg>
          <span>${(typeof AppPinManager !== 'undefined' && AppPinManager.isPinnedMenu(app.id)) ? 'Başlat Menüsünden Kaldır' : 'Başlat Menüsüne Sabitle'}</span>
        </div>
        <div class="ctx-item" data-action="taskbar-toggle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="17" width="18" height="4" rx="1"></rect><rect x="5" y="10" width="14" height="4" rx="1"></rect></svg>
          <span>${(typeof AppPinManager !== 'undefined' && AppPinManager.isPinnedTaskbar(app.id)) ? 'Araç Çubundan Kaldır' : 'Araç Çubuna Ekle'}</span>
        </div>
        <div class="ctx-item" data-action="desktop-toggle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="13" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line>${
            app.on_desktop === false
              ? '<line x1="12" y1="8" x2="12" y2="13"></line><line x1="9.5" y1="10.5" x2="14.5" y2="10.5"></line>'
              : '<line x1="9.5" y1="10.5" x2="14.5" y2="10.5"></line>'
          }</svg>
          <span>${app.on_desktop === false ? 'Masaüstüne Ekle' : 'Masaüstünden Kaldır'}</span>
        </div>
        ${groupSection}
        <div class="ctx-divider"></div>
        <div class="ctx-item ctx-danger" data-action="uninstall">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          <span>Masaüstünden ve Sistemden Kaldır</span>
        </div>
      `;

      const x = Math.min(e.clientX, window.innerWidth - 250);
      const menuHeight = 360 + groups.length * 28;
      const y = Math.min(e.clientY, Math.max(8, window.innerHeight - menuHeight));
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
      menu.classList.add('open');

      const closeMenu = () => {
        menu.classList.remove('open');
        document.removeEventListener('click', closeMenu);
      };
      setTimeout(() => document.addEventListener('click', closeMenu), 10);

      menu.querySelectorAll('.ctx-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const act = btn.getAttribute('data-action');
          closeMenu();
          if (act === 'launch') {
            this.launchApp(app);
          } else if (act === 'term') {
            WindowManager.open('win-terminal');
            Terminal.runCommand(app.exec || app.id);
          } else if (act === 'store') {
            WindowManager.open('win-store');
            const searchInput = document.getElementById('store-search');
            if (searchInput) {
              searchInput.value = app.id;
              searchInput.dispatchEvent(new Event('input'));
            }
          } else if (act === 'pin-toggle') {
            AppPinManager.toggleMenuPin(app.id);
          } else if (act === 'taskbar-toggle') {
            AppPinManager.toggleTaskbarPin(app);
          } else if (act === 'desktop-toggle') {
            this.toggleDesktopIcon(app.id);
          } else if (act === 'group-move') {
            this.moveAppToGroup(app.id, btn.getAttribute('data-group-id'));
          } else if (act === 'group-new') {
            const name = prompt('Yeni kategori adı:', 'Yeni Kategori');
            if (name && name.trim()) {
              const group = this.createGroup(name);
              this.moveAppToGroup(app.id, group.id);
            }
          } else if (act === 'uninstall') {
            StoreManager.uninstallPackageById(app.id);
          }
        });
      });
    }
  };

  // ============================================================================
  // 2b. MASAÜSTÜ DOSYALARI (~/Desktop içindeki gerçek dosyalar simge olarak
  // dizilir; indirilen dosya Masaüstüne düştüğünde burada görünür).
  // ============================================================================
  // 2b. PANEL TERCİHLERİ — alt panel kişiselleştirme (yükseklik, saat, içerik).
  // localStorage'da kalıcıdır; uygulama yerel CSS değişkeni + gövde sınıfları
  // ile yapılır, Rust tarafında değişiklik gerekmez.
  // ============================================================================
  const PanelPrefs = {
    KEY: 'ayaz_panel_prefs',
    state: { height: 44, clock24: true, clockSeconds: false, showPins: true, showWsDots: true, showDate: false },
    _listeners: [],
    onChange(fn) { this._listeners.push(fn); },
    load() {
      try { Object.assign(this.state, JSON.parse(localStorage.getItem(this.KEY) || '{}')); } catch (e) {}
      this.apply();
    },
    save(patch) {
      Object.assign(this.state, patch || {});
      try { localStorage.setItem(this.KEY, JSON.stringify(this.state)); } catch (e) {}
      this.apply();
      this._listeners.forEach(fn => { try { fn(this.state); } catch (e) {} });
    },
    apply() {
      const h = Math.min(60, Math.max(32, parseInt(this.state.height, 10) || 44));
      document.documentElement.style.setProperty('--taskbar-height', `${h}px`);
      document.body.classList.toggle('panel-no-pins', !this.state.showPins);
      document.body.classList.toggle('panel-no-wsdots', !this.state.showWsDots);
    }
  };

  // Panel tercihleri arayüz bağlantısı (Ayarlar → Alt Panel & Saat)
  const PanelSettings = {
    _bound: false,
    render() {
      const st = PanelPrefs.state;
      const rng = document.getElementById('panel-height-range');
      const val = document.getElementById('panel-height-value');
      const toggles = [
        ['panel-clock24-toggle', 'clock24'],
        ['panel-seconds-toggle', 'clockSeconds'],
        ['panel-pins-toggle', 'showPins'],
        ['panel-wsdots-toggle', 'showWsDots'],
        ['panel-days-toggle', 'showDate'],
      ];
      const height = Math.min(60, Math.max(32, parseInt(st.height, 10) || 44));
      if (rng) rng.value = String(height);
      if (val) val.textContent = `${height} px`;
      toggles.forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (el) el.checked = !!st[key];
      });
      if (this._bound) return;
      this._bound = true;
      toggles.forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => PanelPrefs.save({ [key]: el.checked }));
      });
      if (rng) {
        rng.addEventListener('input', () => { if (val) val.textContent = `${rng.value} px`; });
        rng.addEventListener('change', () => PanelPrefs.save({ height: parseInt(rng.value, 10) }));
      }
    }
  };

  // ============================================================================
  const DesktopFiles = {
    dir: null,

    fileGlyph(name, isDir) {
      if (isDir) return 'ico-folder';
      const ext = String(name).split('.').pop().toLowerCase();
      if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'].includes(ext)) return 'ico-image';
      if (['pdf', 'txt', 'md', 'doc', 'docx', 'odt'].includes(ext)) return 'ico-file-text';
      if (['mp3', 'ogg', 'wav', 'flac'].includes(ext)) return 'ico-music';
      if (['mp4', 'mkv', 'webm', 'avi'].includes(ext)) return 'ico-film';
      return 'ico-file';
    },

    async refresh() {
      const container = document.getElementById('dynamic-desktop-icons');
      if (!container) return;
      container.querySelectorAll('.desktop-item.file-item').forEach(el => el.remove());
      // Kullanıcı şikayeti — çöp kutusu masaüstünde hiç görünmüyordu.
      this.ensureTrashIcon(container);
      try {
        if (!this.dir) {
          const d = await TauriBridge.invoke('get_xdg_user_dirs', {});
          if (d && d.desktop) this.dir = d.desktop;
        }
        if (!this.dir) return;
        const res = await TauriBridge.invoke('list_directory', { path: this.dir });
        const items = (res && res.items ? res.items : []).filter(it => !it.is_hidden);
        if (!items.length) return;
        const frag = document.createDocumentFragment();
        items.forEach(it => {
          const el = document.createElement('div');
          el.className = 'desktop-item file-item cat-util';
          el.tabIndex = 0;
          el.setAttribute('role', 'button');
          el.setAttribute('data-app-id', `file:${it.path}`);
          el.title = `${it.name}\n• Çift tıkla aç`;
          const glyph = this.fileGlyph(it.name, it.is_dir);
          el.innerHTML = `
            <div class="item-icon">
              <svg class="glyph" aria-hidden="true"><use href="#${glyph}"></use></svg>
            </div>
            <span class="item-name">${escapeHtml(it.name)}</span>
          `;
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.desktop-item').forEach(x => x.classList.remove('selected'));
            el.classList.add('selected');
          });
          el.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this.openItem(it);
          });
          el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              this.openItem(it);
            }
          });
          el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            DesktopFiles.showItemMenu(e, it);
          });
          frag.appendChild(el);
        });
        container.appendChild(frag);
        if (typeof XdgDesktopEngine !== 'undefined' && XdgDesktopEngine.layoutDesktopIcons) {
          XdgDesktopEngine.layoutDesktopIcons(container);
        }
      } catch (e) {}
    },

    // Masaüstünde kalıcı çöp kutusu simgesi; çift tık dosya yöneticisinin
    // çöp görünümünü açar.
    ensureTrashIcon(container) {
      const existing = container.querySelector('.desktop-item.trash-item');
      if (existing) return;
      const el = document.createElement('div');
      el.className = 'desktop-item trash-item cat-util';
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.title = 'Çöp Kutusu\n• Çift tıkla aç';
      el.innerHTML = `
        <div class="item-icon">
          <svg class="glyph" aria-hidden="true"><use href="#ico-trash"></use></svg>
        </div>
        <span class="item-name">Çöp Kutusu</span>
      `;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.desktop-item').forEach(x => x.classList.remove('selected'));
        el.classList.add('selected');
      });
      el.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.openTrash();
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.openTrash();
        }
      });
      container.appendChild(el);
    },

    openTrash() {
      if (typeof FileManager !== 'undefined' && FileManager.loadTrash) {
        FileManager.loadTrash();
      }
      WindowManager.open('win-files');
    },

    async openItem(it) {
      try {
        if (it.is_dir) {
          if (typeof FileManager !== 'undefined' && FileManager.loadDirectory) {
            FileManager.loadDirectory(it.path);
          }
          WindowManager.open('win-files');
        } else {
          await TauriBridge.invoke('open_path', { path: it.path });
        }
      } catch (err) {
        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast(`Açılamadı: ${err.message || err}`, 'error');
        }
      }
    },

    // Masaüstündeki gerçek klasör/belge simgeleri için sağ-tık menüsü.
    // Dosya yöneticisi menüsündeki özellikler masaüstüne de taşındı:
    // Kes / Kopyala / Şuraya Kopyala / Kısayol Oluştur / Özellikler.
    showItemMenu(ev, item) {
      let menu = document.getElementById('desktop-file-context-menu');
      if (!menu) {
        menu = document.createElement('div');
        menu.id = 'desktop-file-context-menu';
        menu.className = 'desktop-context-menu';
        menu.innerHTML = `
          <div class="ctx-item" data-act="open">
            <span>Aç</span>
          </div>
          <div class="ctx-item" data-act="reveal">
            <span>Dosya Yöneticisinde Göster</span>
          </div>
          <div class="ctx-divider"></div>
          <div class="ctx-item" data-act="cut">
            <span>Kes</span>
          </div>
          <div class="ctx-item" data-act="copy">
            <span>Kopyala</span>
          </div>
          <div class="ctx-item" data-act="copy-to">
            <span>Şuraya Kopyala...</span>
          </div>
          <div class="ctx-divider"></div>
          <div class="ctx-item" data-act="shortcut">
            <span>Kısayol Oluştur</span>
          </div>
          <div class="ctx-item" data-act="rename">
            <span>Yeniden Adlandır</span>
          </div>
          <div class="ctx-divider"></div>
          <div class="ctx-item ctx-danger" data-act="trash">
            <span>Çöp Kutusuna Taşı</span>
          </div>
          <div class="ctx-item ctx-danger" data-act="permanently-delete">
            <span>Tamamen Sil</span>
          </div>
          <div class="ctx-divider"></div>
          <div class="ctx-item" data-act="properties">
            <span>Özellikler</span>
          </div>
        `;
        document.body.appendChild(menu);
        menu.addEventListener('click', (e) => {
          const act = e.target.closest('.ctx-item')?.getAttribute('data-act');
          menu.classList.remove('open');
          const target = this._menuTarget;
          if (!act || !target) return;
          if (act === 'open') {
            DesktopFiles.openItem(target);
          } else if (act === 'reveal') {
            const dirPath = target.is_dir
              ? target.path
              : String(target.path).replace(/\/[^/]+$/, '') || DesktopFiles.dir;
            if (typeof FileManager !== 'undefined' && FileManager.loadDirectory) {
              FileManager.loadDirectory(dirPath);
            }
            WindowManager.open('win-files');
          } else if (act === 'cut' || act === 'copy') {
            // Masaüstü panosu: dosya yöneticisinin panosuyla ortak geçer.
            if (typeof FileManager !== 'undefined') {
              const picks = (Array.isArray(FileManager.selectedItems) && FileManager.selectedItems.length > 1)
                ? FileManager.selectedItems.slice()
                : [target];
              FileManager.clipboard = picks;
              FileManager.clipboardOp = act === 'cut' ? 'cut' : 'copy';
              ReportManager.showToast(act === 'cut' ? `${picks.length} öge kesildi.` : `${picks.length} öge panoya kopyalandı.`);
            }
          } else if (act === 'copy-to') {
            if (typeof FileManager !== 'undefined' && FileManager.promptCopyTo) {
              FileManager.promptCopyTo(target);
            }
          } else if (act === 'shortcut') {
            if (typeof FileManager !== 'undefined' && FileManager.createShortcut) {
              FileManager.createShortcut(target);
            }
          } else if (act === 'rename') {
            const newName = prompt('Yeni ad:', target.name);
            if (newName && newName.trim() && newName.trim() !== target.name) {
              const parent = String(target.path).replace(/\/[^/]+$/, '');
              TauriBridge.invoke('move_path', { sourcePath: target.path, destPath: `${parent}/${newName.trim()}` })
                .then(() => DesktopFiles.refresh())
                .catch(err => ReportManager.showToast(`Yeniden adlandırılamadı: ${err.message || err}`, 'error'));
            }
          } else if (act === 'trash') {
            TauriBridge.invoke('move_to_trash', { path: target.path })
              .then(() => {
                ReportManager.showToast(`'${target.name}' çöp kutusuna taşındı.`);
                DesktopFiles.refresh();
              })
              .catch(err => ReportManager.showToast(`Silinemedi: ${err.message || err}`, 'error'));
          } else if (act === 'permanently-delete') {
            if (!confirm(`'${target.name}' kalıcı olarak silinsin mi? Bu işlem geri alınamaz!`)) return;
            TauriBridge.invoke('delete_file', { path: target.path })
              .then(() => {
                ReportManager.showToast('Öge kalıcı olarak silindi.');
                DesktopFiles.refresh();
              })
              .catch(err => ReportManager.showToast(`Silinemedi: ${err.message || err}`, 'error'));
          } else if (act === 'properties') {
            if (typeof FileManager !== 'undefined' && FileManager.promptProperties) {
              FileManager.promptProperties(target);
            }
          }
        });
      }
      this._menuTarget = item;
      const rect = {
        x: Math.min(ev.clientX, window.innerWidth - 240),
        y: Math.min(ev.clientY, window.innerHeight - 200),
      };
      menu.style.left = `${rect.x}px`;
      menu.style.top = `${rect.y}px`;
      menu.classList.add('open');
      const close = (e) => {
        if (!menu.contains(e.target)) {
          menu.classList.remove('open');
          document.removeEventListener('click', close);
        }
      };
      setTimeout(() => document.addEventListener('click', close), 0);
    }
  };

  // ============================================================================
  // 3. YAZILIM MAĞAZASI (GERÇEK DEBIAN .DEB & XDG ENTEGRASYONU)
  // ============================================================================
  const StoreManager = {
    packages: [
      // 0. FLATHUB MODERN UYGULAMALAR (SANDBOX)
      { id: 'flatpak-spotify', name: 'Spotify Müzik & Podcast', flatpak: 'com.spotify.Client', desc: 'Milyonlarca şarkı, albüm ve podcast dinleme akış platformu', cat: 'media', size: '180 MB', featured: true, installed: false },
      { id: 'flatpak-discord', name: 'Discord Sesli & Yazılı Sohbet', flatpak: 'com.discordapp.Discord', desc: 'Oyuncular ve topluluklar için kristal netliğinde sesli ve yazılı iletişim', cat: 'net', size: '120 MB', installed: false },
      { id: 'flatpak-vscode', name: 'Visual Studio Code IDE', flatpak: 'com.visualstudio.code', desc: 'Gelişmiş eklenti ve hata ayıklama destekli modern kod editörü', cat: 'dev', size: '240 MB', featured: true, installed: false },
      { id: 'flatpak-telegram', name: 'Telegram Desktop', flatpak: 'org.telegram.desktop', desc: 'Hızlı, şifreli ve senkronize bulut mesajlaşma istemcisi', cat: 'net', size: '85 MB', featured: true, installed: false },
      { id: 'flatpak-heroic', name: 'Heroic Games Launcher (Epic & GOG)', flatpak: 'com.heroicgameslauncher.hgl', desc: 'Epic Games ve GOG kütüphaneleri için açık kaynak Linux başlatıcı', cat: 'util', size: '110 MB', installed: false },
      { id: 'flatpak-lutris', name: 'Lutris Açık Oyun Yöneticisi', flatpak: 'net.lutris.Lutris', desc: 'Tüm emülatör, Windows ve Linux oyunlarını tek çatıda toplayan kütüphane', cat: 'util', size: '95 MB', installed: false },
      { id: 'flatpak-onlyoffice', name: 'ONLYOFFICE Desktop Editors', flatpak: 'org.onlyoffice.desktopeditors', desc: 'Microsoft Office belgeleriyle %100 uyumlu modern ofis paketi', cat: 'office', size: '320 MB', installed: false },
      { id: 'flatpak-obsidian', name: 'Obsidian Not & Bilgi Tabanı', flatpak: 'md.obsidian.Obsidian', desc: 'Markdown tabanlı, bağlantılı ikinci beyin ve kişisel not bankası', cat: 'office', size: '130 MB', installed: false },
      { id: 'flatpak-zoom', name: 'Zoom Video Konferans', flatpak: 'us.zoom.Zoom', desc: 'Ders, toplantı ve görüntülü görüşme için resmî Zoom masaüstü istemcisi', cat: 'net', size: '260 MB', installed: false },

      // 1. POPÜLER & TEMEL UYGULAMALAR (FLAGSHIP)
      { id: 'firefox-esr', name: 'Firefox ESR Web Tarayıcısı', deb: 'firefox-esr', desc: 'Mozilla güvenli, gizlilik odaklı ve hızlı web tarayıcısı', cat: 'net', size: '78 MB', featured: true, installed: false },
      { id: 'chromium', name: 'Chromium Web Tarayıcı', deb: 'chromium', desc: 'Google açık kaynak motorlu yüksek performanslı modern tarayıcı', cat: 'net', size: '124 MB', featured: true, installed: false },
      { id: 'vlc', name: 'VLC Media Player', deb: 'vlc', desc: 'Tüm ses ve video formatlarını sorunsuz oynatan evrensel medya oynatıcısı', cat: 'media', size: '64 MB', featured: true, installed: false },
      { id: 'mpv', name: 'MPV Video Oynatıcı', deb: 'mpv', desc: 'Donanım hızlandırmalı, düşük sistem kaynağı tüketen minimalist oynatıcı', cat: 'media', size: '22 MB', installed: false },
      { id: 'gimp', name: 'GIMP Profesyonel Görsel Düzenleyici', deb: 'gimp', desc: 'Katman, fırça ve filtre destekli açık kaynak Photoshop alternatifi', cat: 'graphics', size: '112 MB', installed: false },
      { id: 'inkscape', name: 'Inkscape Vektörel Çizim & İllüstrasyon', deb: 'inkscape', desc: 'SVG standartlarında profesyonel vektör grafik ve logo tasarım stüdyosu', cat: 'graphics', size: '98 MB', installed: false },
      { id: 'blender', name: 'Blender 3D Modelleme & Animasyon', deb: 'blender', desc: 'Endüstri standardı 3D modelleme, render, VFX ve animasyon paketi', cat: 'graphics', size: '310 MB', installed: false },
      { id: 'libreoffice', name: 'LibreOffice Eksiksiz Ofis Paketi', deb: 'libreoffice', desc: 'Kelime işlemci (Writer), hesap tablosu (Calc) ve sunum (Impress)', cat: 'office', size: '340 MB', featured: true, installed: false },
      { id: 'audacity', name: 'Audacity Ses Kayıt & Düzenleyici', deb: 'audacity', desc: 'Çok kanallı profesyonel podcast, müzik ve ses düzenleme aracı', cat: 'media', size: '42 MB', installed: false },
      { id: 'obs-studio', name: 'OBS Studio Canlı Yayın & Ekran Kaydedici', deb: 'obs-studio', desc: 'YouTube/Twitch canlı yayın ve ekran yakalama yazılımı', cat: 'media', size: '92 MB', installed: false },
      { id: 'kdenlive', name: 'Kdenlive Video Kurgu & Montaj', deb: 'kdenlive', desc: 'Çok kanallı profesyonel zaman çizelgeli video montaj stüdyosu', cat: 'media', size: '115 MB', installed: false },
      { id: 'geany', name: 'Geany Hafif Kod Editörü & IDE', deb: 'geany', desc: 'Hızlı açılan, sözdizimi renklendirmeli ve derleme destekli kod editörü', cat: 'dev', size: '14 MB', installed: false },
      { id: 'gparted', name: 'GParted Disk & Bölüm Yöneticisi', deb: 'gparted', desc: 'Sabit disk ve USB bölümlerini görsel olarak biçimlendirme ve boyutlandırma', cat: 'sys', size: '24 MB', installed: false },
      { id: 'transmission-gtk', name: 'Transmission Torrent İndirici', deb: 'transmission-gtk', desc: 'Sistemi yormayan sade ve güvenli BitTorrent istemcisi', cat: 'net', size: '10 MB', installed: false },
      { id: 'filezilla', name: 'FileZilla FTP/SFTP İstemcisi', deb: 'filezilla', desc: 'Sunuculara güvenli dosya yükleme ve indirme arayüzü', cat: 'net', size: '16 MB', installed: false },
      { id: 'flameshot', name: 'Flameshot Gelişmiş Ekran Görüntüsü', deb: 'flameshot', desc: 'Ekran kesiti alıp ok, metin ve bulanıklık ekleyen pratik araç', cat: 'graphics', size: '18 MB', installed: false },
      { id: 'evince', name: 'Evince PDF & Belge Okuyucu', deb: 'evince', desc: 'PDF, PostScript ve e-kitapları anında açan hafif görüntüleyici', cat: 'office', size: '18 MB', featured: true, installed: false },
      { id: 'htop', name: 'Htop Renkli Süreç Monitörü', deb: 'htop', desc: 'İşlemci çekirdekleri, bellek ve çalışan süreçleri canlı izleme', cat: 'sys', size: '2 MB', installed: false },
      { id: 'btop', name: 'Btop Zengin Donanım Monitörü', deb: 'btop', desc: 'Modern görsel grafiklerle donanım yükünü gösteren monitör', cat: 'sys', size: '6 MB', installed: false },
      { id: 'git', name: 'Git Kaynak Kod Sürüm Kontrolü', deb: 'git', desc: 'Yazılım geliştiriciler için endüstri standardı kod versiyon kontrol sistemi', cat: 'dev', size: '36 MB', installed: false },
      { id: 'python3', name: 'Python 3 Programlama Dili', deb: 'python3', desc: 'Modern yapay zeka, veri analitiği ve otomasyon dili', cat: 'dev', size: '16 MB', installed: false },
      { id: 'p7zip-full', name: '7-Zip Yüksek Sıkıştırmalı Arşivleyici', deb: 'p7zip-full', desc: 'ZIP, 7z, TAR ve RAR arşivlerini açma ve sıkıştırma aracı', cat: 'util', size: '5 MB', installed: false },
      { id: 'brave', name: 'Brave Hızlı & Gizli Tarayıcı', deb: 'brave-browser', vendor: 'brave', desc: 'Reklam ve izleyici engelleyicisi yerleşik; resmî deposundan kurulur', cat: 'net', size: '150 MB', featured: true, installed: false },
      { id: 'helium', name: 'Helium Hafif Web Tarayıcı', deb: 'helium-bin', vendor: 'helium', desc: 'ungoogle-chromium temelli, gizlilik odaklı hafif masaüstü tarayıcısı', cat: 'net', size: '130 MB', installed: false },
      { id: 'timeshift', name: 'Timeshift Sistem Yedekleme & Anlık Görüntü', deb: 'timeshift', desc: 'Sistem kararsızlığına karşı tek tıkla geri dönüş ve kurtarma noktası oluşturucu', cat: 'sys', size: '15 MB', installed: false },
      { id: 'steam', name: 'Steam Dijital Oyun Platformu', deb: 'steam-installer', desc: 'Valve resmi Linux oyun mağazası, Proton ve topluluk kütüphanesi', cat: 'util', size: '22 MB', installed: false },
      { id: 'wine', name: 'Wine Windows Uyumluluk Katmanı', deb: 'wine', desc: 'Windows programlarını ve oyunlarını emülasyonsuz yerel hızda çalıştırma', cat: 'util', size: '140 MB', installed: false },
      { id: 'neofetch', name: 'Neofetch Sistem Bilgi Kartı', deb: 'neofetch', desc: 'Terminal açılışında dağıtım logosu ve donanım özetini gösteren klasik araç', cat: 'sys', size: '1 MB', installed: false },
      { id: 'antigravity', name: 'Antigravity Yapay Zekâ IDE', deb: 'antigravity', vendor: 'antigravity', desc: 'Google’ın ajan öncesi dönem için tasarladığı ajan destekli kod editörü', cat: 'dev', size: '420 MB', installed: false },
      { id: 'opencode-desktop', name: 'OpenCode Masaüstü (AI Kod Ajanı)', deb: '', extUrl: 'https://opencode.ai', desc: 'Terminal, masaüstü ve IDE eklentisi olarak çalışan açık kaynak yapay zekâ kod ajanı', cat: 'dev', size: 'Site', installed: false },

      // 1b. OKUL & EĞİTİM (sınıfta doğrudan işe yarar)
      { id: 'fatih-kalem', name: 'Fatih Kalem 2 (Akıllı Tahta)', deb: 'fatih-kalem', desc: 'Etkileşimli tahtalar için ekran kalemi; ekrandaki her şeyin üzerine çizim, ders notu ve vurgu yapma aracı', cat: 'office', size: '2 MB', featured: true, installed: false },
      { id: 'meb-cert', name: 'MEB Okul Ağı Sertifikası', action: 'meb-cert', desc: 'Okul internetindeki güvenlik uyarılarını bitirir; resmi MEB adresinden indirip sistem ve tarayıcı güven deposuna kurar', cat: 'net', size: '1 MB', featured: true, installed: false },
      { id: 'scratch', name: 'Scratch 3 (Güncel Sürüm)', flatpak: 'org.scratch.Scratch', desc: 'Blok tabanlı kodlama ile oyun ve animasyon yapmayı öğreten güncel Scratch masaüstü sürümü', cat: 'dev', size: '180 MB', featured: true, installed: false },
      { id: 'gcompris', name: 'GCompris Eğitim Paketi', deb: 'gcompris', desc: '2-10 yaş için 100ü aşkın eğitsel etkinlik: okuma, matematik, fen ve bilgisayar kullanımı', cat: 'util', size: '95 MB', featured: true, installed: false },
      { id: 'tuxmath', name: 'TuxMath Matematik Oyunu', deb: 'tuxmath', desc: 'Dört işlemi arcade oyunuyla öğreten eğlenceli matematik alıştırması', cat: 'util', size: '18 MB', installed: false },
      { id: 'stellarium', name: 'Stellarium planetaryumu', deb: 'stellarium', desc: 'Fen ve astronomi dersleri için gerçek zamanlı gökyüzü ve gezegen simülasyonu', cat: 'graphics', size: '110 MB', installed: false },
      { id: 'geogebra', name: 'GeoGebra Matematik', flatpak: 'org.geogebra.GeoGebra', desc: 'Geometri, cebir ve grafik çizimleri için ders standardı etkileşimli matematik aracı', cat: 'office', size: '120 MB', installed: false },
      { id: 'tuxtype', name: 'TuxTyping Klavye Öğretmeni', deb: 'tuxtype', desc: 'On parmak hızlı yazmayı oyunla öğreten klavye alıştırma programı', cat: 'util', size: '22 MB', installed: false },


      // 2. ORTAM & MEDYA (MEDIA)
      { id: 'handbrake', name: 'HandBrake Video Dönüştürücü', deb: 'handbrake', desc: 'Videoları optimize edilmiş modern biçimlere (H.264, H.265, AV1) dönüştürücü', cat: 'media', size: '36 MB', installed: false },
      { id: 'ffmpeg', name: 'FFmpeg Multimedya Çatısı', deb: 'ffmpeg', desc: 'Her türlü ses ve video biçimini çözme, kodlama ve dönüştürme kiti', cat: 'media', size: '48 MB', installed: false },
      { id: 'sox', name: 'SoX Ses İşleme Çatısı', deb: 'sox', desc: 'Ses dosyalarını dönüştürme ve efekt uygulama komut satırı isviçre çakısı', cat: 'media', size: '6 MB', installed: false },
      { id: 'rhythmbox', name: 'Rhythmbox Müzik Çalar', deb: 'rhythmbox', desc: 'Müzik koleksiyonu yönetimi, internet radyoları ve podcast oynatıcısı', cat: 'media', size: '28 MB', installed: false },
      { id: 'clementine', name: 'Clementine Müzik Çalar', deb: 'clementine', desc: 'Hızlı arama ve zengin müzik arşivi düzenleme yetenekli çalar', cat: 'media', size: '34 MB', installed: false },
      { id: 'audacious', name: 'Audacious Hafif Müzik Çalar', deb: 'audacious', desc: 'Winamp benzeri arayüzü ve düşük RAM kullanımıyla bilinen ses oynatıcı', cat: 'media', size: '12 MB', installed: false },
      { id: 'shotcut', name: 'Shotcut Video Editörü', deb: 'shotcut', desc: '4K destekli, çok formatlı timeline video montaj yazılımı', cat: 'media', size: '86 MB', installed: false },
      { id: 'peek', name: 'Peek GIF Kaydedici', deb: 'peek', desc: 'Seçili masaüstü alanını anında yüksek kaliteli animasyonlu GIF olarak kaydetme', cat: 'media', size: '8 MB', installed: false },
      { id: 'flac', name: 'FLAC Kayıpsız Ses Kodlayıcı', deb: 'flac', desc: 'Stüdyo kalitesinde kayıpsız ses sıkıştırma araç kiti', cat: 'media', size: '3 MB', installed: false },
      { id: 'vorbis-tools', name: 'Ogg Vorbis Ses Araçları', deb: 'vorbis-tools', desc: 'Ogg formatında ses kodlama, etiketleme ve oynatma araçları', cat: 'media', size: '4 MB', installed: false },

      // 3. GRAFİK & TASARIM (GRAPHICS)
      { id: 'krita', name: 'Krita Dijital Boyama', deb: 'krita', desc: 'İllüstratörler ve konsept sanatçıları için çizim ve doku fırçaları', cat: 'graphics', size: '140 MB', installed: false },
      { id: 'darktable', name: 'Darktable Fotoğraf İşleme', deb: 'darktable', desc: 'Fotoğrafçılar için profesyonel RAW görüntü geliştirme ve kataloglama', cat: 'graphics', size: '64 MB', installed: false },
      { id: 'rawtherapee', name: 'RawTherapee RAW Geliştirici', deb: 'rawtherapee', desc: 'Yüksek bit derinliğinde tahribatsız RAW fotoğraf renk laboratuvarı', cat: 'graphics', size: '52 MB', installed: false },
      { id: 'imagemagick', name: 'ImageMagick Görsel Kiti', deb: 'imagemagick', desc: 'Toplu resim boyutlandırma, dönüştürme ve işleme komut satırı aracı', cat: 'graphics', size: '36 MB', installed: false },
      { id: 'graphviz', name: 'Graphviz Grafik Çizici', deb: 'graphviz', desc: 'DOT dili ile ağ şemaları, algoritmik diyagramlar ve soy ağaçları çizme', cat: 'graphics', size: '14 MB', installed: false },
      { id: 'scrot', name: 'Scrot Ekran Yakalayıcı', deb: 'scrot', desc: 'X11 ekran görüntüsü alma komut satırı aracı', cat: 'graphics', size: '1 MB', installed: false },
      { id: 'feh', name: 'Feh Hafif Resim Görüntüleyici', deb: 'feh', desc: 'Düşük bellek tüketen hızlı fotoğraf slayt ve masaüstü aracı', cat: 'graphics', size: '3 MB', installed: false },
      { id: 'viewnior', name: 'Viewnior Hızlı Görsel Görüntüleyici', deb: 'viewnior', desc: 'Zarif ve sade GTK fotoğraf albümü görüntüleyicisi', cat: 'graphics', size: '4 MB', installed: false },
      { id: 'dia', name: 'Dia Teknik Diyagram Çizici', deb: 'dia', desc: 'UML, elektronik devre ve ağ mimarisi çizim yazılımı', cat: 'graphics', size: '26 MB', installed: false },
      { id: 'mypaint', name: 'MyPaint Dijital Eskiz', deb: 'mypaint', desc: 'Basınca duyarlı sonsuz tuval eskiz ve fırça simülasyonu', cat: 'graphics', size: '30 MB', installed: false },

      // 4. AĞ & İNTERNET (NET)
      { id: 'thunderbird', name: 'Thunderbird E-Posta İstemcisi', deb: 'thunderbird', desc: 'E-posta, takvim, adres defteri ve RSS besleme yöneticisi', cat: 'net', size: '82 MB', installed: false },
      { id: 'qbittorrent', name: 'qBittorrent İndirme Yöneticisi', deb: 'qbittorrent', desc: 'Reklamsız, açık kaynaklı, hafif BitTorrent dosya paylaşım istemcisi', cat: 'net', size: '28 MB', installed: false },
      { id: 'curl', name: 'cURL Veri Aktarım Aracı', deb: 'curl', desc: 'HTTP, HTTPS, FTP ve onlarca protokol üzerinden veri çekme aracı', cat: 'net', size: '4 MB', installed: false },
      { id: 'wget', name: 'Wget Ağ İndiricisi', deb: 'wget', desc: 'Web sitelerinden dosya ve ayna indirme komut satırı aracı', cat: 'net', size: '3 MB', installed: false },
      { id: 'aria2', name: 'Aria2 Hızlı İndirici', deb: 'aria2', desc: 'Çoklu bağlantı ve parçalı yüksek hızlı indirme motoru', cat: 'net', size: '6 MB', installed: false },
      { id: 'nmap', name: 'Nmap Ağ Güvenlik Tarayıcısı', deb: 'nmap', desc: 'Ağ keşfi, port tarama ve güvenlik açıklarını teftiş etme aracı', cat: 'net', size: '28 MB', installed: false },
      { id: 'wireshark', name: 'Wireshark Paket Analizörü', deb: 'wireshark', desc: 'Canlı ağ trafiğini yakalayan ve protokol seviyesinde analiz eden araç', cat: 'net', size: '62 MB', installed: false },
      { id: 'tcpdump', name: 'Tcpdump Ağ Dinleyici', deb: 'tcpdump', desc: 'Komut satırında paket başlıklarını yakalayıp filtreleme aracı', cat: 'net', size: '3 MB', installed: false },
      { id: 'netcat-openbsd', name: 'Netcat Ağ Soket Aracı', deb: 'netcat-openbsd', desc: 'TCP ve UDP soketleri üzerinden doğrudan veri okuma ve yazma', cat: 'net', size: '1 MB', installed: false },
      { id: 'iperf3', name: 'iPerf3 Bant Genişliği Testi', deb: 'iperf3', desc: 'Ağ verimini ve maksimum TCP/UDP bant genişliğini ölçen araç', cat: 'net', size: '2 MB', installed: false },
      { id: 'whois', name: 'Whois Sorgulayıcı', deb: 'whois', desc: 'Alan adı ve IP bloğu tescil kayıtlarını RFC standardında sorgulama', cat: 'net', size: '1 MB', installed: false },
      { id: 'mtr-tiny', name: 'MTR Ağ Tanı Aracı', deb: 'mtr-tiny', desc: 'Ping ve traceroute yeteneklerini tek raporda birleştiren teşhis aracı', cat: 'net', size: '2 MB', installed: false },
      { id: 'dnsutils', name: 'DNS Araçları (Dig / Nslookup)', deb: 'dnsutils', desc: 'Alan adı sunucusu kayıtlarını ayrıntılı sorgulama ve test kiti', cat: 'net', size: '4 MB', installed: false },
      { id: 'openssh-client', name: 'OpenSSH Güvenli Kabuk İstemcisi', deb: 'openssh-client', desc: 'Uzak sunuculara şifreli terminal erişimi ve tünelleme', cat: 'net', size: '8 MB', installed: false },

      // 5. OFİS & ÜRETKENLİK (OFFICE)
      { id: 'libreoffice-writer', name: 'LibreOffice Writer', deb: 'libreoffice-writer', desc: 'DOCX ve ODT belgeleri için profesyonel kelime işlemci', cat: 'office', size: '88 MB', installed: false },
      { id: 'libreoffice-calc', name: 'LibreOffice Calc', deb: 'libreoffice-calc', desc: 'XLSX ve ODS tabloları için gelişmiş formül ve grafik hesap tablosu', cat: 'office', size: '76 MB', installed: false },
      { id: 'libreoffice-impress', name: 'LibreOffice Impress', deb: 'libreoffice-impress', desc: 'Etkileyici görsel geçişlere sahip sunum hazırlama yazılımı', cat: 'office', size: '54 MB', installed: false },
      { id: 'zathura', name: 'Zathura Minimalist PDF Okuyucu', deb: 'zathura', desc: 'Vim klavye kısayollarına sahip düşük bellek tüketen PDF okuyucu', cat: 'office', size: '6 MB', installed: false },
      { id: 'calibre', name: 'Calibre E-Kitap Yöneticisi', deb: 'calibre', desc: 'EPUB, MOBI ve PDF kütüphane arşivi ve format dönüştürücüsü', cat: 'office', size: '110 MB', installed: false },
      { id: 'xournalpp', name: 'Xournal++ Not Alma & El Yazısı', deb: 'xournalpp', desc: 'Kalem desteği ile PDF üzerine çizim ve serbest el yazısı not aracı', cat: 'office', size: '24 MB', featured: true, installed: false },
      { id: 'tesseract-ocr', name: 'Tesseract OCR Optik Karakter Tanıma', deb: 'tesseract-ocr', desc: 'Taranan görsel ve resimlerden metinleri otomatik çıkaran yapay zeka aracı', cat: 'office', size: '32 MB', installed: false },
      { id: 'pandoc', name: 'Pandoc Evrensel Belge Dönüştürücü', deb: 'pandoc', desc: 'Markdown, LaTeX, DOCX, HTML ve PDF arasında biçim dönüştürme', cat: 'office', size: '44 MB', installed: false },
      { id: 'ghostscript', name: 'Ghostscript PDF/PS İşleme Motoru', deb: 'ghostscript', desc: 'PDF sıkıştırma, birleştirme ve PostScript yorumlayıcı aracı', cat: 'office', size: '36 MB', installed: false },

      // 6. SİSTEM & YÖNETİM (SYS)
      { id: 'iotop', name: 'Iotop Disk Girdi/Çıktı Monitörü', deb: 'iotop', desc: 'Hangi sürecin diski ne kadar okuyup yazdığını canlı izleyen araç', cat: 'sys', size: '2 MB', installed: false },
      { id: 'iftop', name: 'Iftop Ağ Bant Genişliği Monitörü', deb: 'iftop', desc: 'Ağ bağlantılarında IP bazında anlık veri transferi takipçisi', cat: 'sys', size: '2 MB', installed: false },
      { id: 'ncdu', name: 'Ncdu Disk Alan Analizörü', deb: 'ncdu', desc: 'Dizinlerin diskte ne kadar yer kapladığını hızla gösteren konsol aracı', cat: 'sys', size: '1 MB', installed: false },
      { id: 'fastfetch', name: 'Fastfetch Hızlı Sistem Bilgisi', deb: 'fastfetch', desc: 'C ile yazılmış, milisaniyeler içinde donanım ve OS özeti çıkaran araç', cat: 'sys', size: '4 MB', installed: false },
      { id: 'inxi', name: 'Inxi Donanım Raporlama Aracı', deb: 'inxi', desc: 'İşlemci, ekran kartı, anakart ve ses yongaları hakkında ayrıntılı rapor', cat: 'sys', size: '3 MB', installed: false },
      { id: 'lshw', name: 'Lshw Donanım Listesi', deb: 'lshw', desc: 'Tüm donanım bileşenlerini XML veya JSON biçiminde döken teftiş aracı', cat: 'sys', size: '4 MB', installed: false },
      { id: 'pciutils', name: 'PCI Araçları (lspci)', deb: 'pciutils', desc: 'Anakart üzerindeki tüm PCI ve PCIe donanımlarını listeleme', cat: 'sys', size: '2 MB', installed: false },
      { id: 'usbutils', name: 'USB Araçları (lsusb)', deb: 'usbutils', desc: 'Bağlı tüm harici USB aygıtlarını ve veriyolu hızlarını listeleme', cat: 'sys', size: '2 MB', installed: false },
      { id: 'smartmontools', name: 'S.M.A.R.T. Disk Sağlık Denetleyicisi', deb: 'smartmontools', desc: 'SSD ve sabit disklerin ömür, sıcaklık ve hata sektörlerini takip etme', cat: 'sys', size: '3 MB', installed: false },
      { id: 'memtest86+', name: 'Memtest86+ RAM Test Aracı', deb: 'memtest86+', desc: 'Bellek donanımında kararsızlık ve hücre bozulmalarını tarama', cat: 'sys', size: '2 MB', installed: false },
      { id: 'sysstat', name: 'Sysstat Sistem İstatistikleri (sar/iostat)', deb: 'sysstat', desc: 'İşletim sistemi performans sayaçları ve geçmiş kullanım loglayıcı', cat: 'sys', size: '5 MB', installed: false },
      { id: 'glances', name: 'Glances Kapsamlı Sistem Gözlemcisi', deb: 'glances', desc: 'Web tabanlı veya konsolda çalışan istemci-sunucu sistem monitörü', cat: 'sys', size: '14 MB', installed: false },
      { id: 'flatpak', name: 'Flatpak Uygulama Mağazası', deb: 'flatpak', desc: 'Sandbox içinde çalışan evrensel Linux uygulama mağazası altyapısı', cat: 'sys', size: '26 MB', installed: false },
      { id: 'synaptic', name: 'Synaptic Grafik Paket Yöneticisi', deb: 'synaptic', desc: 'Depo paketlerini gruplar hâlinde arayıp kurup kaldırabileceğiniz klasik arayüz', cat: 'sys', size: '12 MB', installed: false },

      // 7. ARAÇLAR & YARDIMCILAR (UTIL)
      { id: 'tmux', name: 'Tmux Terminal Çoklayıcı', deb: 'tmux', desc: 'Tek terminal penceresinde bölünmüş paneller ve kalıcı arka plan oturumları', cat: 'util', size: '4 MB', installed: false },
      { id: 'screen', name: 'GNU Screen Oturum Yöneticisi', deb: 'screen', desc: 'Kopmayan SSH oturumları ve arka plan terminal yönetimi', cat: 'util', size: '3 MB', installed: false },
      { id: 'zsh', name: 'Zsh Gelişmiş Kabuk', deb: 'zsh', desc: 'Gelişmiş sekme tamamlama, tema ve eklenti destekli güçlü kabuk', cat: 'util', size: '12 MB', installed: false },
      { id: 'fish', name: 'Fish Akıllı Etkileşimli Kabuk', deb: 'fish', desc: 'Yazarken syntax highlighting ve otomatik öneriler sunan modern kabuk', cat: 'util', size: '16 MB', installed: false },
      { id: 'unrar-free', name: 'Unrar Çıkarıcı', deb: 'unrar-free', desc: 'RAR arşiv paketlerini dizine açma ve çıkarma aracı', cat: 'util', size: '1 MB', installed: false },
      { id: 'zip', name: 'Zip Arşivleyici', deb: 'zip', desc: 'Standart ZIP arşivleri oluşturma ve şifreleme komut satırı aracı', cat: 'util', size: '2 MB', installed: false },
      { id: 'unzip', name: 'Unzip Arşiv Açıcı', deb: 'unzip', desc: 'ZIP arşivlerini hızlıca dışa aktarma aracı', cat: 'util', size: '2 MB', installed: false },
      { id: 'tar', name: 'GNU Tar Arşiv Paketi', deb: 'tar', desc: 'Bant arşivi ve dosya paketleme standart UNIX yazılımı', cat: 'util', size: '3 MB', installed: false },
      { id: 'rsync', name: 'Rsync Hızlı Dosya Eşitleyici', deb: 'rsync', desc: 'Delta algoritması ile yalnızca değişen baytları aktaran senkronizasyon aracı', cat: 'util', size: '3 MB', installed: false },
      { id: 'tree', name: 'Tree Dizin Ağacı Çizici', deb: 'tree', desc: 'Dizin ve alt dosyaları renkli ağaç grafiği şeklinde listeleme', cat: 'util', size: '1 MB', installed: false },
      { id: 'fzf', name: 'FZF Komut Satırı Bulanık Arama', deb: 'fzf', desc: 'Dosyalar, komut geçmişi ve metinler arasında gerçek zamanlı fuzzy arama', cat: 'util', size: '4 MB', installed: false },
      { id: 'ripgrep', name: 'Ripgrep Hızlı Metin Tarayıcı (rg)', deb: 'ripgrep', desc: 'Büyük kod depolarında saniyeler içinde regex arayan Rust tabanlı araç', cat: 'util', size: '6 MB', installed: false },
      { id: 'bat', name: 'Bat Renkli Cat Alternatifi', deb: 'bat', desc: 'Git entegrasyonlu ve sözdizimi renklendirmeli dosya okuyucu', cat: 'util', size: '5 MB', installed: false },
      { id: 'fd-find', name: 'FD Hızlı Dosya Arama', deb: 'fd-find', desc: 'Find komutuna kıyasla kat kat hızlı ve kullanıcı dostu arama aracı', cat: 'util', size: '3 MB', installed: false },
      { id: 'midnight-commander', name: 'Midnight Commander (MC)', deb: 'midnight-commander', desc: 'Klasik Norton Commander tarzı çift panelli konsol dosya yöneticisi', cat: 'util', size: '10 MB', installed: false },
      { id: 'ranger', name: 'Ranger Konsol Dosya Yöneticisi', deb: 'ranger', desc: 'Vim tuş takımı ve önizleme panellerine sahip terminal dosya tarayıcısı', cat: 'util', size: '6 MB', installed: false },

      // 8. KATEGORİ GENİŞLETMESİ — mağaza kapsamı genişletildi (oyun, ses, disk, güvenlik, iletişim)
      // 8a. OYUNLAR
      { id: 'supertuxkart', name: 'SuperTuxKart Yarış Oyunu', deb: 'supertuxkart', desc: 'Serbest ve açık kaynak, aile dostu karting yarış oyunu', cat: 'util', size: '600 MB', installed: false },
      { id: 'supertux', name: 'SuperTux 2D Platform Oyunu', deb: 'supertux', desc: 'Tux kahramanlı, klasik yan kaydırmalı platform macerası', cat: 'util', size: '120 MB', installed: false },
      { id: '0ad', name: "0 A.D. Strateji Oyunu", deb: '0ad', desc: 'Antik savaş temalı, açık kaynak gerçek zamanlı strateji', cat: 'util', size: '900 MB', installed: false },
      { id: 'flatpak-openboard', name: 'Openboard Eğitim Tahtası', flatpak: 'ch.openboard.OpenBoard', desc: 'Ders için etkileşimli akıllı tahta yazılımı', cat: 'dev', size: '150 MB', installed: false },

      // 8b. SES & PRODÜKSİYON
      { id: 'ardour', name: 'Ardour Profesyonel DAW', deb: 'ardour', desc: 'Çok kanallı kayıt ve miksaj için endüstri seviyesi dijital ses iş istasyonu', cat: 'media', size: '130 MB', installed: false },
      { id: 'rosegarden', name: 'Rosegarden MIDI Stüdyosu', deb: 'rosegarden', desc: 'MIDI dizme ve nota yazımı için müzik stüdyosu', cat: 'media', size: '40 MB', installed: false },

      // 8c. DİSK & SİSTEM ARAÇLARI
      { id: 'gnome-disk-utility', name: 'GNOME Disks (Diskler)', deb: 'gnome-disk-utility', desc: 'Diskleri bölümlendirme, biçimlendirme ve SMART durumunu görsel arayüzden yönetme', cat: 'sys', size: '12 MB', installed: false },
      { id: 'baobab', name: 'Baobab Disk Kullanım Analizi', deb: 'baobab', desc: 'Disk alanını halka grafikli görselleştirip büyük klasörleri bulma', cat: 'sys', size: '6 MB', installed: false },
      { id: 'bleachbit', name: 'BleachBit Sistem Temizleyici', deb: 'bleachbit', desc: 'Gereksiz önbellek ve geçmiş dosyalarını güvenle temizleyen araç', cat: 'sys', size: '5 MB', installed: false },

      // 8d. GÜVENLİK & AĞ
      { id: 'torbrowser-launcher', name: 'Tor Browser Başlatıcısı', deb: 'torbrowser-launcher', desc: 'Tor Browser kurulumunu ve güncellemelerini yöneten başlatıcı', cat: 'net', size: '4 MB', installed: false },
      { id: 'nextcloud-desktop', name: 'Nextcloud Masaüstü Eşitleme', deb: 'nextcloud-desktop', desc: 'Kendi bulut sunucunuzla dosya senkronizasyon istemcisi', cat: 'net', size: '30 MB', installed: false },
      { id: 'remmina', name: 'Remmina Uzak Masaüstü İstemcisi', deb: 'remmina', desc: 'RDP, VNC ve SSH oturumlarını tek arayüzden yönetme', cat: 'net', size: '18 MB', installed: false },
      { id: 'flatpak-flatseal', name: 'Flatseal Flatpak İzin Yöneticisi', flatpak: 'com.github.tchx84.Flatseal', desc: 'Flatpak uygulamalarının sandbox izinlerini görsel denetleme', cat: 'sys', size: '12 MB', installed: false },

      // 8e. İLETİŞİM & GÜNLÜK İŞLER
      { id: 'flatpak-signal', name: 'Signal Private Messenger', flatpak: 'org.signal.Signal', desc: 'Uçtan uca şifreli, gizlilik odaklı mesajlaşma uygulaması', cat: 'net', size: '160 MB', installed: false },
      { id: 'evolution', name: 'Evolution E-Posta & Ajanda', deb: 'evolution', desc: 'E-posta, takvim, görev ve kişi yönetiminin tamamını içeren istemci', cat: 'office', size: '110 MB', installed: false },
      { id: 'anki', name: 'Anki Bilgi Kartları (Öğrenme)', deb: 'anki', desc: 'Aralıklı tekrar yöntemiyle kelime ve ders çalışma aracı', cat: 'office', size: '90 MB', installed: false },
      { id: 'ghostwriter', name: 'ghostwriter Odaklanmış Metin Düzenleyici', deb: 'ghostwriter', desc: 'Markdown için bölümsüz, odaklanmış yazma ortamı', cat: 'office', size: '8 MB', installed: false },

      // 8f. GELİŞTİRME & GRAFİK
      { id: 'flatpak-freecad', name: 'FreeCAD 3D CAD', flatpak: 'org.freecad.FreeCAD', desc: 'Makine tasarımı ve teknik çizim için açık kaynak 3B CAD', cat: 'dev', size: '450 MB', installed: false },

      // 9. KAPSAM GENİŞLETMESİ II — toplam 40 yeni uygulama (mağaza derinliği)
      // 9a. MEDYA & SES (8)
      { id: 'openshot', name: 'OpenShot Video Düzenleyici', deb: 'openshot', desc: 'Sürükle-bırak zaman çizgeli, yeni başlayan dostu video kurgu yazılımı', cat: 'media', size: '95 MB', installed: false },
      { id: 'celluloid', name: 'Celluloid Hafif Video Oynatıcı', deb: 'celluloid', desc: 'mpv motorlu, temiz GTK arayüzlü modern film oynatıcı', cat: 'media', size: '9 MB', installed: false },
      { id: 'smplayer', name: 'SMPlayer Gelişmiş Oynatıcı', deb: 'smplayer', desc: 'Altyazı arama, hız ayarı ve oynatma konumu hatırlama destekli çalar', cat: 'media', size: '18 MB', installed: false },
      { id: 'kodi', name: 'Kodi Medya Merkezi', deb: 'kodi', desc: 'Filmler, diziler ve müzikler için kütüphane tabanlı medya merkezi', cat: 'media', size: '120 MB', installed: false },
      { id: 'strawberry', name: 'Strawberry Müzik Koleksiyonu', deb: 'strawberry', desc: 'koleksiyon yönetimine odaklı modern müzik çalar', cat: 'media', size: '30 MB', installed: false },
      { id: 'gpodder', name: 'gPodder Podcast Yöneticisi', deb: 'gpodder', desc: 'Podcast aboneliği, indirme ve senkronizasyon istemcisi', cat: 'media', size: '12 MB', installed: false },
      { id: 'flatpak-easyeffects', name: 'EasyEffects Ses İşleme', flatpak: 'com.github.wwmm.easyeffects', desc: 'Giriş/çıkış için ekolayzer, kompresör ve limiter ile sistem sesini işleyin', cat: 'media', size: '40 MB', installed: false },
      { id: 'easytag', name: 'EasyTAG Müzik Etiket Düzenleyici', deb: 'easytag', desc: 'MP3 ve FLAC dosyaların toplu etiketleme ve albüm kapağı aracı', cat: 'media', size: '9 MB', installed: false },

      // 9b. GRAFİK & TİPOGRAFİ (5)
      { id: 'kolourpaint', name: 'KolourPaint Boyama Aracı', deb: 'kolourpaint', desc: 'Paint tarzı basit ve hızlı resim düzenleme aracı', cat: 'graphics', size: '11 MB', installed: false },
      { id: 'fontforge', name: 'FontForge Yazı Tipi Düzenleyici', deb: 'fontforge', desc: 'Kendi yazı tiplerini tasarlayıp TTF/OTF olarak çıkarır', cat: 'graphics', size: '40 MB', installed: false },
      { id: 'scribus', name: 'Scribus Masaüstü Yayıncılık', deb: 'scribus', desc: 'Broşür, dergi ve dergi plakı için profesyonel sayfa dizgisi', cat: 'graphics', size: '85 MB', installed: false },
      { id: 'digikam', name: 'digiKam Fotoğraf Kütüphanesi', deb: 'digikam', desc: 'Yüz tanıma ve etiketli, büyük fotoğraf koleksiyonlu koleksiyon arayüzü', cat: 'graphics', size: '220 MB', installed: false },
      { id: 'geeqie', name: 'Geeqie Hızlı Görsel Tarayıcı', deb: 'geeqie', desc: 'hafif, okunabilir arayüzlü hızlı görsel görüntüleyici', cat: 'graphics', size: '10 MB', installed: false },

      // 9c. DİSK & SİSTEM (9)
      { id: 'lm-sensors', name: 'LM-Sensors Donanım Sensörleri', deb: 'lm-sensors', desc: 'CPU sıcaklığı, fan hızı ve voltaj değerlerini okuma kiti', cat: 'sys', size: '2 MB', installed: false },
      { id: 'gsmartcontrol', name: 'GSmartControl Disk Taraması', deb: 'gsmartcontrol', desc: 'Disk S.M.A.R.T. değerlerini grafik arayüzden inceleme aracı', cat: 'sys', size: '6 MB', installed: false },
      { id: 'testdisk', name: 'TestDisk & PhotoRec Veri Kurtarma', deb: 'testdisk', desc: 'Silinmiş bölümleri onarır, kaybolan dosyaları kurtarır', cat: 'sys', size: '6 MB', installed: false },
      { id: 'clonezilla', name: 'Clonezilla Disk Klonlama', deb: 'clonezilla', desc: 'Bütün diski ya da bölümleri imaj hâlinde klonlama aracı', cat: 'sys', size: '230 MB', installed: false },
      { id: 'veracrypt', name: 'VeraCrypt Disk Şifreleme', deb: 'veracrypt', desc: 'Şifreli kap ve tam disk şifrelemesi için açık kaynak araç', cat: 'sys', size: '70 MB', installed: false },
      { id: 'cryptsetup', name: 'Cryptsetup LUKS Araçları', deb: 'cryptsetup', desc: 'LUKS şifreli bölümleri oluşturma ve açma araç seti', cat: 'sys', size: '8 MB', installed: false },
      { id: 'borgbackup', name: 'BorgBackup Dedüp Yedek', deb: 'borgbackup', desc: 'Dedüpülasyonlu, şifreli, sıkıştırılmış yedekleme çözümü', cat: 'sys', size: '9 MB', installed: false },
      { id: 'duplicity', name: 'Duplicity Şifreli Yedek', deb: 'duplicity', desc: 'Şifreli artımlı yedeği uzak sunuculara yedekleme aracı', cat: 'sys', size: '7 MB', installed: false },
      { id: 'grsync', name: 'Grsync rsync Grafik Arayüzü', deb: 'grsync', desc: 'rsync görevlerini profil olarak kaydedip tek tıkla çalıştırma', cat: 'sys', size: '4 MB', installed: false },

      // 9d. İLETİŞİM & AĞ (6)
      { id: 'gajim', name: 'Gajim XMPP Sohbet', deb: 'gajim', desc: 'Açık standart XMPP mesajlaşma istemcisine modern arayüz', cat: 'net', size: '16 MB', installed: false },
      { id: 'hexchat', name: 'HexChat IRC İstemcisi', deb: 'hexchat', desc: 'Kanal favorileri ve eklentilerle zengin klasik IRC istemcisi', cat: 'net', size: '12 MB', installed: false },
      { id: 'mumble', name: 'Mumble Düşük Gecikmeli Sesli', deb: 'mumble', desc: 'Oyun toplulukları için düşük gecikmeli sesli konuşma yazılımı', cat: 'net', size: '14 MB', installed: false },
      { id: 'linphone', name: 'Linphone VoIP & Görüntülü', deb: 'linphone', desc: 'SIP temelli ücretsiz arama ve görüntülü konuşma istemcisi', cat: 'net', size: '50 MB', installed: false },
      { id: 'syncthing', name: 'Syncthing Cihazlar Arası Eşitleme', deb: 'syncthing', desc: 'Web arayüzlü, sunucusuz sürekli dosya senkronizasyonu', cat: 'net', size: '30 MB', installed: false },
      { id: 'weechat', name: 'WeeChat Modüler Sohbet', deb: 'weechat', desc: 'Eklenti sistemi güçlendirmesine açık terminal sohbeti', cat: 'net', size: '7 MB', installed: false },

      // 9e. BİLGİSAYAR & MATEMATİK (6)
      { id: 'neovim', name: 'Neovim Modüler Düzenleyici', deb: 'neovim', desc: 'Lua eklenti ekosistemiyle zenginleşen Vim akışına uygun editör', cat: 'dev', size: '15 MB', installed: false },
      { id: 'emacs', name: 'GNU Emacs Genişletilebilir Editör', deb: 'emacs', desc: 'Org-modu, Magit ve yüzlerce paketle genişletilebilir editör', cat: 'dev', size: '110 MB', installed: false },
      { id: 'meld', name: 'Meld Dosya Karşılaştırma', deb: 'meld', desc: 'Dosya ve klasörleri yan yana karşılaştırma ve birleştirme aracı', cat: 'dev', size: '10 MB', installed: false },
      { id: 'gnome-builder', name: 'GNOME Builder IDE', deb: 'gnome-builder', desc: 'GTK/GNOME projesi için entegre geliştirme ortamı', cat: 'dev', size: '35 MB', installed: false },
      { id: 'zeal', name: 'Zeal Çevrimdışı Dokümantasyon', deb: 'zeal', desc: '150 dil için çevrimdışı API dokümantasyon tarayıcısı', cat: 'dev', size: '12 MB', installed: false },
      { id: 'gdb', name: 'GNU Debugger (GDB)', deb: 'gdb', desc: 'C/C++/Rust programlarını gdb hata ayıklama ortamı', cat: 'dev', size: '7 MB', installed: false },

      // 9f. BİLİM & VERİ & OFİS (6)
      { id: 'valgrind', name: 'Valgrind Bellek Analizör', deb: 'valgrind', desc: 'Bellek sızması ve veri yarışı çakışmaları bulucu', cat: 'dev', size: '50 MB', installed: false },
      { id: 'octave', name: 'GNU Octave Bilimsel Hesap', deb: 'octave', desc: 'Matlab uyumlu sözdizimli matris ve sayısal hesap ortamı', cat: 'dev', size: '190 MB', installed: false },
      { id: 'wxmaxima', name: 'wxMaxima Cebirsel Hesap', deb: 'wxmaxima', desc: 'maxima sembolik matematik motorunun grafik arayüzü', cat: 'office', size: '14 MB', installed: false },
      { id: 'maxima', name: 'Maxima Sembolik Matematik', deb: 'maxima', desc: 'Türev, integral ve denklem çözümü motoru', cat: 'office', size: '220 MB', installed: false },
      { id: 'gnuplot', name: 'Gnuplot Fonksiyon Çizim', deb: 'gnuplot', desc: 'Bilimsel veri ve fonksiyon grafikleri çizim aracı', cat: 'dev', size: '12 MB', installed: false },
      { id: 'sqlitebrowser', name: 'DB Browser for SQLite', deb: 'sqlitebrowser', desc: 'SQLite veritabanlarını tablo görünümünde inceleme ve düzenleme', cat: 'dev', size: '10 MB', installed: false },
    ],
    tableBody: null,
    // Açılışta kafa karıştırmayan kısa liste; tamamı "Tümü" sekmesinde.
    currentCat: 'featured',
    currentSource: 'all',

    init() {
      // Kaydedilmiş kurulu paketleri yükle
      const savedInstalled = SafeStorage.getItem('ankora_installed_pkg_ids');
      if (savedInstalled) {
        try {
          const ids = JSON.parse(savedInstalled);
          if (Array.isArray(ids)) {
            this.packages.forEach(p => {
              if (ids.includes(p.id)) p.installed = true;
            });
          }
        } catch (e) {}
      }

      this.tableBody = document.getElementById('store-grid') || document.getElementById('store-table-body');
      const searchInput = document.getElementById('store-search');
      const filterBtns = document.querySelectorAll('.store-filter-btn');
      const sourceBtns = document.querySelectorAll('.store-source-btn');

      filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          filterBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.currentCat = btn.getAttribute('data-cat');
          this.render(searchInput ? searchInput.value : '');
        });
      });

      sourceBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          sourceBtns.forEach(b => {
            b.classList.remove('active');
            b.removeAttribute('style');
          });
          btn.classList.add('active');
          this.currentSource = btn.getAttribute('data-source');
          this.render(searchInput ? searchInput.value : '');
        });
      });

      if (searchInput) {
        let storeSearchTimer = 0;
        searchInput.addEventListener('input', (e) => {
          const value = e.target.value;
          clearTimeout(storeSearchTimer);
          storeSearchTimer = setTimeout(() => this.render(value), 120);
        });
      }

      this.render();

      // APT kurulu paketleri sorgula
      TauriBridge.invoke('list_installed_deb_packages').then((list) => {
        if (!Array.isArray(list)) return;
        const installed = new Set(list.map(s => String(s).trim()));
        let changed = false;
        this.packages.forEach(p => {
          if (!p.installed && p.deb && installed.has(p.deb)) {
            p.installed = true;
            changed = true;
          }
        });
        if (changed) {
          this.saveInstalledState();
          this.render(document.getElementById('store-search') ? document.getElementById('store-search').value : '');
        }
      }).catch(() => {});

      // Flatpak kurulu paketleri sorgula
      TauriBridge.invoke('list_installed_flatpaks').then((list) => {
        if (!Array.isArray(list)) return;
        const installedFp = new Set(list.map(s => String(s).trim()));
        let changed = false;
        this.packages.forEach(p => {
          if (!p.installed && p.flatpak && installedFp.has(p.flatpak)) {
            p.installed = true;
            changed = true;
          }
        });
        if (changed) {
          this.saveInstalledState();
          this.render(document.getElementById('store-search') ? document.getElementById('store-search').value : '');
        }
      }).catch(() => {});
    },

    saveInstalledState() {
      const ids = [...new Set(this.packages.filter(p => p.installed).map(p => p.id))];
      SafeStorage.setItem('ankora_installed_pkg_ids', JSON.stringify(ids));
    },

    render(query = '') {
      if (!this.tableBody) return;
      this.tableBody.innerHTML = '';

      const frag = document.createDocumentFragment();
      const q = query.toLowerCase();
      const seen = new Set();
      const filtered = this.packages.filter(p => {
        const matchSource = this.currentSource === 'all'
          || (this.currentSource === 'flathub' && Boolean(p.flatpak))
          || (this.currentSource === 'apt' && Boolean(!p.flatpak));
        const matchCat = this.currentCat === 'all'
          || (this.currentCat === 'featured' && Boolean(p.featured))
          || p.cat === this.currentCat;
        const matchQ = p.name.toLowerCase().includes(q)
          || (p.deb && p.deb.toLowerCase().includes(q))
          || (p.flatpak && p.flatpak.toLowerCase().includes(q))
          || p.desc.toLowerCase().includes(q);
        if (!matchSource || !matchCat || !matchQ) return false;
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });

      // Ana ekran: arama boşsa ve hiçbir filtre seçilmemişse store-home
      // (Editörün Seçimi + tüm uygulamalar) düzeni kullanılır.
      if (!query && this.currentCat === 'all' && this.currentSource === 'all') {
        this.buildStoreHome(frag, filtered);
      } else {
        filtered.forEach(pkg => {
          frag.appendChild(this.buildStoreCard(pkg));
        });
      }
      this.tableBody.appendChild(frag);
      IconResolver.upgradeScope(this.tableBody);
    },

    // Mağaza ana ekranı: arama boş ve filtre kapalıyken önce "Öne Çıkan"
    // büyük kartlarla açılır; altında tüm uygulamalar listelenir.
    // Arama veya kategori seçilince eski düz liste döner.
    buildStoreHome(frag, filtered) {
      const featured = this.packages.filter(p => p.featured).slice(0, 8);
      const home = document.createElement('div');
      home.className = 'store-home';
      home.innerHTML = `
        <div class="store-home-hero">
          <div class="store-home-hero-glow"></div>
          <div class="store-home-hero-content">
            <div class="store-home-hero-badge">
              <svg class="glyph" aria-hidden="true" style="width:13px;height:13px;"><use href="#ico-zap"></use></svg>
              <span>Resmî Ankora Havuzu</span>
            </div>
            <h2>Ankora Yazılım Merkezi</h2>
            <p>Hızlı, güvenli ve doğrulanmış paketler. Devuan depoları, Flathub ve resmî sistem araçları tek çatı altında.</p>
          </div>
          <div class="store-home-hero-meta">
            <span class="store-home-count">${this.packages.length} paket hazır</span>
          </div>
        </div>
      `;

      const featuredSection = document.createElement('div');
      featuredSection.className = 'store-home-section';
      featuredSection.innerHTML = `
        <div class="store-section-title">
          <span>Öne Çıkan Uygulamalar</span>
          <p>Günlük işler, medya ve üretkenlik için önerilenler</p>
        </div>
      `;
      const fGrid = document.createElement('div');
      fGrid.className = 'store-grid store-grid-featured';
      featured.forEach(p => fGrid.appendChild(this.buildStoreCard(p, true)));
      featuredSection.appendChild(fGrid);
      home.appendChild(featuredSection);

      const restSection = document.createElement('div');
      restSection.className = 'store-home-section';
      restSection.innerHTML = `
        <div class="store-section-title">
          <span>Tüm Uygulamalar</span>
          <p>Kategori ve kaynak filtrelerini kullanarak inceleyin</p>
        </div>
      `;
      const rGrid = document.createElement('div');
      rGrid.className = 'store-grid';
      filtered.filter(p => !featured.some(f => f.id === p.id)).forEach(p => rGrid.appendChild(this.buildStoreCard(p)));
      restSection.appendChild(rGrid);
      home.appendChild(restSection);

      frag.appendChild(home);
    },

    buildStoreCard(pkg, big = false) {
      const card = document.createElement('article');
      card.className = big ? 'store-card store-card-featured' : 'store-card';
      const isFlatpak = Boolean(pkg.flatpak);
      const pkgSub = pkg.flatpak || pkg.deb || (pkg.action === 'meb-cert' ? 'mebcert' : '');
      const sourceLabel = isFlatpak ? 'Flathub' : (pkg.action === 'meb-cert' ? 'Sistem' : (pkg.vendor ? 'Resmî' : 'APT'));
      const sourceClass = isFlatpak ? 'badge-flatpak' : (pkg.action === 'meb-cert' ? 'badge-cert' : 'badge-apt');

      card.innerHTML = `
        <div class="store-card-head">
          <div class="store-card-icon-wrap">
            <span class="store-card-icon">${XdgDesktopEngine.getAppSvgIcon({ id: pkg.id, exec: pkgSub, cat: pkg.cat })}</span>
          </div>
          <div class="store-card-titles">
            <div class="store-card-name" title="${escapeHtml(pkg.name)}">${escapeHtml(pkg.name)}</div>
            <div class="store-card-meta-line">
              <span class="store-card-source ${sourceClass}">${sourceLabel}</span>
              ${pkg.size ? `<span class="store-card-size">${escapeHtml(pkg.size)}</span>` : ''}
            </div>
          </div>
        </div>
        <p class="store-card-desc" title="${escapeHtml(pkg.desc)}">${escapeHtml(pkg.desc)}</p>
        <div class="pkg-progress-bar" id="prog-${pkg.id}"></div>
        <div class="store-card-actions">
          ${pkg.extUrl ? `
            <button class="btn-pkg btn-pkg-site" id="btn-site-${pkg.id}">Resmî Site</button>
          ` : pkg.installed ? `
            ${pkg.action === 'meb-cert' ? '' : `<button class="btn-pkg btn-pkg-open" id="btn-open-${pkg.id}">Aç</button>`}
            <button class="btn-pkg installed" id="btn-pkg-${pkg.id}">Kaldır</button>
          ` : `
            <button class="btn-pkg" id="btn-pkg-${pkg.id}">Kur</button>
          `}
        </div>
      `;

      const iconBox = card.querySelector('.store-card-icon');
      if (iconBox) IconResolver.tagIcon(iconBox, { id: pkg.id, exec: pkgSub, deb: pkg.deb, flatpak: pkg.flatpak });

      const btn = card.querySelector('.btn-pkg:not(.btn-pkg-open):not(.btn-pkg-site)');
      if (btn) {
        btn.addEventListener('click', () => this.togglePackage(pkg, card));
      }

      const btnSite = card.querySelector('.btn-pkg-site');
      if (btnSite) {
        btnSite.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await TauriBridge.invoke('open_url', { url: pkg.extUrl });
            Terminal.log(`[AĞ] ${pkg.name} resmî sitesi açılıyor: ${pkg.extUrl}`, 'cmd');
          } catch (err) {
            Terminal.log(`[ERR] Resmî site açılamadı: ${err}`, 'error');
          }
        });
      }

      const btnOpen = card.querySelector('.btn-pkg-open');
      if (btnOpen) {
        btnOpen.addEventListener('click', (e) => {
          e.stopPropagation();
          this.launchPackage(pkg);
        });
      }

      return card;
    },

    async launchPackage(pkg) {
      Terminal.log(`[UYGULAMA BAŞLATILIYOR] ${pkg.name}...`, 'cmd');
      try {
        if (pkg.action === 'meb-cert') {
          await TauriBridge.invoke('install_meb_certificate', {});
          Terminal.log(`[BAŞARILI] ${pkg.name} yenilendi.`, 'success');
          return;
        }
        if (pkg.flatpak) {
          await TauriBridge.invoke('launch_application', { exec: `flatpak run ${pkg.flatpak}` });
        } else {
          await TauriBridge.invoke('launch_application', { exec: pkg.deb });
        }
        Terminal.log(`[BAŞARILI] ${pkg.name} başlatıldı.`, 'success');
      } catch (err) {
        Terminal.log(`[BAŞLATMA BİLGİSİ] ${err}`, 'muted');
      }
    },

    // Aynı paket mağazada birden fazla satırda listeleniyor; id ile aramak
    // her zaman ilk satırı bulur. Durum, tetikleyen satırdan okunmalı.
    syncInstalledState(pkgId, installed) {
      this.packages.forEach(p => {
        if (p.id === pkgId) p.installed = installed;
      });
    },

    async togglePackage(pkg, row = null) {
      const btn = row ? row.querySelector('.btn-pkg:not(.btn-pkg-open)')
                      : document.getElementById(`btn-pkg-${pkg.id}`);
      const prog = row ? row.querySelector('.pkg-progress-bar')
                       : document.getElementById(`prog-${pkg.id}`);

      // Sistem eylemleri (MEB sertifikası): paket yok, onaylı yardımcı
      // betik çalışır. Kaldırma, yalnızca yerel durumu sıfırlar.
      if (pkg.action === 'meb-cert') {
        if (pkg.installed) {
          if (btn) { btn.disabled = true; btn.textContent = 'Kaldırılıyor...'; }
          Terminal.log('[SİSTEM] MEB kök sertifikası sistemden ve tarayıcı depolarından kaldırılıyor...', 'cmd');
          try {
            const msg = await TauriBridge.invoke('remove_meb_certificate', {});
            this.syncInstalledState(pkg.id, false);
            this.saveInstalledState();
            Terminal.log(`[BAŞARILI] ${msg || 'MEB sertifikası kaldırıldı.'}`, 'success');
            ReportManager.showToast('MEB sertifikası kaldırıldı.');
            this.render(document.getElementById('store-search')?.value || '');
          } catch (err) {
            if (btn) { btn.disabled = false; btn.textContent = 'Kaldır'; }
            Terminal.log(`[ERR] MEB sertifika kaldırma hatası: ${err}`, 'error');
            ReportManager.showToast(`Kaldırma hatası: ${err.message || err}`, 'error');
          }
          return;
        }
        if (btn) { btn.disabled = true; btn.textContent = 'Kuruluyor...'; }
        Terminal.log('[SİSTEM] MEB okul ağı sertifikası resmi adresten kuruluyor...', 'cmd');
        try {
          const msg = await TauriBridge.invoke('install_meb_certificate', {});
          this.syncInstalledState(pkg.id, true);
          this.saveInstalledState();
          Terminal.log(`[BAŞARILI] ${msg || 'MEB sertifikası kuruldu.'}`, 'success');
          ReportManager.showToast('MEB sertifikası kuruldu; tarayıcı güven deposu güncellendi.');
          this.render(document.getElementById('store-search')?.value || '');
        } catch (err) {
          if (btn) { btn.disabled = false; btn.textContent = 'Kur'; }
          Terminal.log(`[ERR] MEB sertifika hatası: ${err}`, 'error');
          ReportManager.showToast(`Kurulum hatası: ${err.message || err}`, 'error');
        }
        return;
      }

      if (pkg.flatpak) {
        if (pkg.installed) {
          if (btn) { btn.disabled = true; btn.textContent = 'Kaldırılıyor...'; }
          Terminal.log(`[FLATPAK] flatpak uninstall -y ${pkg.flatpak} yürütülüyor...`, 'cmd');
          try {
            await TauriBridge.invoke('remove_flatpak_app', { appId: pkg.flatpak });
            this.syncInstalledState(pkg.id, false);
            this.saveInstalledState();
            XdgDesktopEngine.removeApplication(pkg.id);
            Terminal.log(`[FLATPAK] '${pkg.name}' (${pkg.flatpak}) kaldırıldı.`, 'success');
            ReportManager.showToast(`${pkg.name} kaldırıldı.`);
            this.render(document.getElementById('store-search')?.value || '');
          } catch (err) {
            if (btn) { btn.disabled = false; btn.textContent = 'Kaldır'; }
            Terminal.log(`[ERR] Flatpak kaldırma hatası: ${err}`, 'error');
            ReportManager.showToast(`Kaldırılamadı: ${err.message || err}`, 'error');
          }
        } else {
          if (btn) { btn.disabled = true; btn.textContent = 'İndiriliyor...'; }
          Terminal.log(`[FLATPAK] flatpak install -y flathub ${pkg.flatpak} yürütülüyor...`, 'cmd');
          try {
            await TauriBridge.invoke('install_flatpak_app', { appId: pkg.flatpak });
            this.syncInstalledState(pkg.id, true);
            this.saveInstalledState();
            XdgDesktopEngine.addApplication({
              id: pkg.id,
              name: pkg.name,
              exec: `flatpak run ${pkg.flatpak}`,
              cat: pkg.cat,
              comment: pkg.desc,
              is_installed_by_user: true
            });
            XdgDesktopEngine.rescanXdgApps(false);
            Terminal.log(`[FLATPAK] '${pkg.name}' (${pkg.flatpak}) başarıyla kuruldu ve masaüstüne eklendi!`, 'success');
            ReportManager.showToast(`${pkg.name} kuruldu ve masaüstüne eklendi!`);
            this.render(document.getElementById('store-search')?.value || '');
          } catch (err) {
            if (btn) { btn.disabled = false; btn.textContent = 'Kur'; }
            Terminal.log(`[ERR] Flatpak kurulum hatası: ${err}`, 'error');
            ReportManager.showToast(`Kurulum hatası: ${err.message || err}`, 'error');
          }
        }
        return;
      }

      if (pkg.installed) {
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Kaldırılıyor...';
        }
        Terminal.log(`[APT] sudo apt-get remove -y -- ${pkg.deb} yürütülüyor...`, 'cmd');

        try {
          await TauriBridge.invoke('remove_deb_package', { packageName: pkg.deb });
          this.syncInstalledState(pkg.id, false);
          if (btn) {
            btn.disabled = false;
            btn.classList.remove('installed');
            btn.textContent = 'Kur';
          }
          this.saveInstalledState();
          XdgDesktopEngine.removeApplication(pkg.id);
          Terminal.log(`[APT] '${pkg.name}' (${pkg.deb}) başarıyla kaldırıldı.`, 'success');
          this.render(document.getElementById('store-search')?.value || '');
        } catch (err) {
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Kaldır';
          }
          Terminal.log(`[ERR] Kaldırma başarısız: ${err}`, 'error');
          ReportManager.showToast(`Kaldırılamadı: ${err.message || err}`, 'error');
          setTimeout(() => this.render(document.getElementById('store-search')?.value || ''), 1600);
        }
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.textContent = 'İndiriliyor...';
      }
      Terminal.log(pkg.vendor
        ? `[DEPO] ${pkg.vendor} resmî deposu hazırlanıp '${pkg.deb}' kuruluyor...`
        : `[APT] sudo apt-get install -y -- ${pkg.deb} yürütülüyor...`, 'cmd');

      let val = 0;
      const interval = setInterval(() => {
        val += 20;
        if (prog) prog.style.width = `${val}%`;
        if (val >= 100) clearInterval(interval);
      }, 100);

      try {
        // vendor girdileri (Brave/Helium/Antigravity) root-owned
        // ayaz-pkg-helper'ın vendor eylemiyle; diğerleri normal apt akışıyla kurulur.
        const xdgApp = pkg.vendor
          ? await TauriBridge.invoke('install_vendor_package', { vendor: pkg.vendor })
          : await TauriBridge.invoke('install_deb_package', { packageName: pkg.deb });
        this.syncInstalledState(pkg.id, true);
        if (prog) prog.style.width = '0%';

        this.saveInstalledState();

        // Host, .desktop dosyasından kimliği ve görünen adı çözer; onu yok
        // sayarsak kayıt başka bir id ile eklenir ve sonraki taramada menüde
        // iki kez görünür. .deb dosya adı ikon olarak kullanılamaz.
        const resolved = xdgApp || {};
        XdgDesktopEngine.addApplication({
          id: resolved.id || pkg.id,
          name: resolved.name || pkg.name,
          exec: resolved.exec || pkg.deb,
          cat: resolved.cat || pkg.cat,
          comment: resolved.comment || pkg.desc,
          is_installed_by_user: true
        });
        XdgDesktopEngine.rescanXdgApps(false);

        Terminal.log(`[XDG OK] ${resolved.name || pkg.name} kuruldu ve masaüstüne eklendi.`, 'success');
        ReportManager.showToast(`${resolved.name || pkg.name} kuruldu; masaüstüne eklendi.`);
        this.render(document.getElementById('store-search')?.value || '');
      } catch (err) {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Kur';
        }
        if (prog) prog.style.width = '0%';
        Terminal.log(`[ERR] Kurulum başarısız: ${err}`, 'error');
        ReportManager.showToast(`Kurulum başarısız: ${err.message || err}`, 'error');
        setTimeout(() => this.render(document.getElementById('store-search')?.value || ''), 1600);
      }
    },

    async uninstallPackageById(pkgId) {
      const pkg = this.packages.find(p => p.id === pkgId);
      if (pkg) {
        await this.togglePackage(pkg);
      } else {
        XdgDesktopEngine.removeApplication(pkgId);
      }
    }
  };

  // Rust tarafındaki EXACT_ALLOWED_COMMANDS + ALLOWED_UTILITIES ile eşleşmeli.
  // Tab tamamlaması bu listeden beslenir.
  const TERMINAL_COMMANDS = [
    'help', 'clear', 'sync',
    'uname', 'whoami', 'uptime', 'date', 'hostname', 'id', 'arch', 'w', 'who',
    'ls', 'pwd', 'cat', 'echo', 'head', 'tail', 'grep', 'wc',
    'free', 'df', 'ps', 'top', 'which', 'lscpu', 'lsblk', 'cal',
    'apt-get', 'apt-cache',
  ];

  const TERMINAL_HELP = [
    'Çıktı doğrudan sistem kabuğundan gelir. İzin verilenler:',
    '',
    'Sistem   uname -a, uptime, whoami, hostname, id, date, arch, w, who, lscpu',
    'Bellek   free -h, ps aux, top -b -n 1, sync',
    'Disk     df -h, ls, ls -la, lsblk',
    'Dosya    cat/head/tail/grep/wc — mutlak yol yalnız izinli telemetri dosyaları, pwd',
    'Paket    apt-get update, apt-get clean, apt-cache search <ad>',
    'Kabuk    echo, clear, help',
    '',
    'Tab komut adını tamamlar, ↑ ↓ geçmişe gider, "Sistem Terminali" xterm açar.',
    'Kabuk metakarakterleri (; | & > ` $) ve liste dışı ikililer reddedilir.',
  ];

  // ============================================================================
  // 4. GERÇEK WEBKIT BASH TERMİNALİ (LIVE SHELL ENGINE)
  // ============================================================================
  const Terminal = {
    input: null,
    logs: null,
    viewport: null,
    history: [],
    hIndex: -1,

    init() {
      this.input = document.getElementById('term-input');
      this.logs = document.getElementById('term-logs');
      this.viewport = document.getElementById('term-viewport');

      // Kalıcı terminal geçmişini yükle
      try {
        const cached = SafeStorage.getItem('ankora_term_history');
        if (cached) {
          this.history = JSON.parse(cached);
          this.hIndex = this.history.length;
        }
      } catch (e) {
        this.history = [];
      }

      if (!this.input) return;

      this.input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          const raw = this.input.value.trim();
          if (!raw) return;
          this.input.value = '';
          await this.runCommand(raw);
        } else if (e.key === 'ArrowUp') {
          if (this.hIndex > 0) {
            this.hIndex--;
            this.input.value = this.history[this.hIndex];
          }
        } else if (e.key === 'ArrowDown') {
          if (this.hIndex < this.history.length - 1) {
            this.hIndex++;
            this.input.value = this.history[this.hIndex];
          } else {
            this.hIndex = this.history.length;
            this.input.value = '';
          }
        } else if (e.key === 'Tab') {
          e.preventDefault();
          this.complete();
        }
      });

      // Terminal hızlı komut çipleri
      document.querySelectorAll('.term-chip-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const cmd = btn.getAttribute('data-cmd');
          if (cmd) this.runCommand(cmd);
        });
      });

      const btnClearLogs = document.getElementById('btn-term-clear-logs');
      if (btnClearLogs) {
        btnClearLogs.addEventListener('click', () => {
          if (this.logs) this.logs.innerHTML = '';
        });
      }

      const btnSysTerm = document.getElementById('btn-sys-term');
      if (btnSysTerm) {
        btnSysTerm.addEventListener('click', () => {
          this.openSystemTerminal();
        });
      }
    },

    saveHistory() {
      try {
        if (this.history.length > 100) {
          this.history = this.history.slice(-100);
        }
        SafeStorage.setItem('ankora_term_history', JSON.stringify(this.history));
      } catch (e) {}
    },

    // Yazılan ilk kelimeyi izinli komut listesinden ve geçmişten tamamlar.
    complete() {
      if (!this.input) return;
      const typed = this.input.value;
      if (/\s/.test(typed)) return;
      const fromHistory = this.history.map(h => h.split(/\s+/)[0]);
      const words = Array.from(new Set(TERMINAL_COMMANDS.concat(fromHistory)));
      const hits = words.filter(w => w.startsWith(typed) && w !== typed).sort();
      if (hits.length === 1) {
        this.input.value = hits[0] + ' ';
      } else if (hits.length > 1) {
        this.log(`ankora@ankora-os:~$ ${typed}`, 'cmd');
        this.log(hits.join('  '), 'muted');
      }
    },

    // Sistemde kurulu terminal emülatörünü bulup ayrı pencerede açar.
    async openSystemTerminal() {
      try {
        await TauriBridge.invoke('launch_interactive_terminal', { command: null });
        this.log('Sistem terminali canlı pencerede açıldı (xterm / x-terminal-emulator).', 'success');
        return 'xterm';
      } catch (e) {
        this.log(`Sistem terminali açılamadı: ${e.message || e}`, 'error');
        return null;
      }
    },

    async runCommand(command) {
      const clean = (command || '').trim();
      if (!clean) return '';

      this.log(`ankora@ankora-os:~$ ${clean}`, 'cmd');
      this.history.push(clean);
      this.hIndex = this.history.length;
      this.saveHistory();

      const parts = clean.split(/\s+/);
      let verb = parts[0].toLowerCase();
      let targetVerb = verb;
      if (verb === 'sudo' && parts.length > 1) {
        targetVerb = parts[1].toLowerCase();
      }

      if (clean.toLowerCase() === 'clear') {
        if (this.logs) this.logs.innerHTML = '';
        return '';
      }

      // `help` Rust beyaz listesinde değil, kabuk tarafında karşılanır.
      if (verb === 'help') {
        TERMINAL_HELP.forEach(line => this.log(line, 'muted'));
        return '';
      }

      // Etkileşimli TUI programları (nano, vim, htop vb.) otomatik olarak gerçek sistem terminalinde çalıştırılır
      const interactiveCmds = [
        'nano', 'vim', 'vi', 'emacs', 'htop', 'top', 'btop', 'iotop',
        'less', 'more', 'man', 'alsamixer', 'nmtui', 'mc', 'ranger',
        'watch', 'journalctl', 'gdb', 'ssh', 'tmux', 'screen', 'python3', 'python',
        'bash', 'sh'
      ];

      if (interactiveCmds.includes(targetVerb)) {
        this.log(`Etkileşimli TUI aracı tespit edildi (${targetVerb}). Canlı etkileşimli sistem terminalinde açılıyor...`, 'cmd');
        try {
          await TauriBridge.invoke('launch_interactive_terminal', { command: clean });
          this.log(`✓ '${clean}' harici sistem terminali penceresinde başarıyla açıldı.`, 'success');
          return '';
        } catch (e) {
          this.log(`Terminal başlatılamadı: ${e.message || e}`, 'error');
          return '';
        }
      }

      try {
        const out = await TauriBridge.invoke('run_terminal_command', { command: clean });
        if (out) this.log(out, 'muted');
        return out;
      } catch (err) {
        this.log(String(err), 'error');
        throw err;
      }
    },

    log(text, type = 'muted') {
      if (!this.logs) return;
      // DOM eleman sayısını 150 ile sınırla (Bellek sızıntısı önleme)
      while (this.logs.children.length >= 150) {
        this.logs.removeChild(this.logs.firstChild);
      }
      const row = document.createElement('div');
      row.className = `term-row ${type}`;
      row.textContent = text;
      this.logs.appendChild(row);
      if (this.viewport) this.viewport.scrollTop = this.viewport.scrollHeight;
    }
  };

  // ============================================================================
  // ANKORA DOSYA YÖNETİCİSİ (NATIVE FILE MANAGER ENGINE)
  // ============================================================================
  const FileManager = {
    currentPath: '',
    userHome: '',
    items: [],
    selectedItem: null,
    // Ctrl + tık ile çoklu seçim (pano işlemleri bunu kullanır).
    selectedItems: [],
    // Gerçek XDG kullanıcı dizinleri (yerel ad/Türkçe ad farkını kapatır).
    xdgDirs: null,
    // Kopyala/kes panosu: [{path, name, is_dir}] + op ('copy' | 'cut')
    clipboard: [],
    clipboardOp: null,
    // Görünüm durumu: simge/liste/sıkı; sıralama; gizli dosyalar; zoom (-2..+3)
    viewMode: 'icons',
    sortKey: 'name',
    sortDir: 'asc',
    showHidden: false,
    zoom: 0,

    // UI dillerine uygun insan-tarih biçimi.
    formatTimestamp(ts) {
      if (!ts) return '-';
      try {
        return new Date(ts * 1000).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
      } catch (e) { return String(ts); }
    },

    // Boyutu okunur biçimde biçimler (byte -> KB/MB/GB).
    formatBytes(b) {
      if (!b && b !== 0) return '-';
      if (b < 1024) return `${b} B`;
      if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
      if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
      if (b < 1024 * 1024 * 1024 * 1024) return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
      return `${(b / 1024 / 1024 / 1024 / 1024).toFixed(2)} TB`;
    },

    // Mevcut sıralama/görünüm tercihini uygulayarak görünür ögeleri döndürür.
    visibleSorted(items) {
      let list = this.showHidden ? items.slice() : items.filter(it => !it.is_hidden);
      const dir = this.sortDir === 'desc' ? -1 : 1;
      const key = this.sortKey;
      list.sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        let r = 0;
        if (key === 'size') r = (a.size_bytes || 0) - (b.size_bytes || 0);
        else if (key === 'mtime') r = (a.mtime || 0) - (b.mtime || 0);
        else if (key === 'ext') r = String(a.ext || '').localeCompare(String(b.ext || ''), 'tr');
        else r = String(a.name || '').localeCompare(String(b.name || ''), 'tr', { sensitivity: 'base' });
        return r * dir;
      });
      return list;
    },

    applyViewMode() {
      const grid = document.getElementById('files-grid');
      if (!grid) return;
      grid.classList.toggle('files-mode-list', this.viewMode === 'list');
      grid.classList.toggle('files-mode-compact', this.viewMode === 'compact');
      const scale = 1 + this.zoom * 0.15;
      grid.style.setProperty('--files-card-scale', String(scale));
      const content = document.getElementById('files-content-area');
      if (content) content.style.fontSize = `${Math.round(100 * scale)}%`;
    },

    toggleHiddenFiles() {
      this.showHidden = !this.showHidden;
      this.refresh();
      ReportManager?.showToast(this.showHidden ? 'Gizli dosyalar gösteriliyor.' : 'Gizli dosyalar gizlendi.');
    },

    setSort(key) {
      if (this.sortKey === key) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortKey = key;
        this.sortDir = 'asc';
      }
      this.refresh();
    },

    zoomFiles(delta) {
      this.zoom = Math.max(-2, Math.min(3, this.zoom + delta));
      this.applyViewMode();
    },

    resetZoom() {
      this.zoom = 0;
      this.applyViewMode();
    },

    setViewMode(mode) {
      this.viewMode = mode;
      this.applyViewMode();
    },

    init() {
      // Gerçek klasör adları önden çözülür (İndirilenler/Downloads farkı).
      this.prefetchXdgDirs();
      const btnUp = document.getElementById('btn-files-up');
      const btnRefresh = document.getElementById('btn-files-refresh');
      const btnNewFolder = document.getElementById('btn-files-new-folder');
      const btnOpenTerm = document.getElementById('btn-files-open-term');

      if (btnUp) btnUp.addEventListener('click', () => this.navigateUp());
      if (btnRefresh) btnRefresh.addEventListener('click', () => this.refresh());
      if (btnNewFolder) btnNewFolder.addEventListener('click', () => this.promptNewFolder());
      if (btnOpenTerm) btnOpenTerm.addEventListener('click', () => this.openTerminalHere());

      document.querySelectorAll('.files-sidebar-item').forEach(item => {
        item.addEventListener('click', () => {
          document.querySelectorAll('.files-sidebar-item').forEach(i => i.classList.remove('active'));
          item.classList.add('active');
          const p = item.getAttribute('data-path');
          if (p === 'home') this.loadDirectory('');
          else if (p === 'trash') this.loadTrash();
          else if (p === 'network') this.promptNetworkShare();
          else if (['desktop', 'downloads', 'docs', 'pics', 'music', 'videos'].includes(p)) {
            // XDG dizinleri backend'den okunur; sistem dili İngilizce de olsa
            // Türkçe de olsa kenar çubuğu gerçek klasöre gider.
            const key = { desktop: 'desktop', downloads: 'download', docs: 'documents', pics: 'pictures', music: 'music', videos: 'videos' }[p];
            const hit = this.xdgDirs && this.xdgDirs[key];
            if (hit) {
              this.loadDirectory(hit);
              return;
            }
            const trMap = {
              desktop: 'Masaüstü',
              downloads: 'İndirilenler',
              docs: 'Belgeler',
              pics: 'Resimler',
              music: 'Müzik',
              videos: 'Videolar'
            };
            this.loadDirectory(this.userHome ? `${this.userHome}/${trMap[p]}` : trMap[p]);
          } else if (p) {
            this.loadDirectory(p);
          }
        });
      });

      this.initFileMenus();
      this.initEmptyAreaMenu();
      this.initProgressListener();
      this.loadDirectory('');
    },

    // Üst menü çubuğu (Dosya / Düzenle / Görünüm / Hakkında).
    initFileMenus() {
      const bar = document.getElementById('files-menubar');
      if (!bar) return;
      bar.querySelectorAll('.files-menu-trigger').forEach(trigger => {
        trigger.addEventListener('click', () => {
          const name = trigger.getAttribute('data-menu');
          bar.querySelectorAll('.files-menu-trigger').forEach(t => t.classList.toggle('open-menu', t === trigger));
          this.showTopMenu(name, trigger);
        });
      });
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.files-menubar')) {
          bar.querySelectorAll('.files-menu-trigger.open-menu').forEach(t => t.classList.remove('open-menu'));
          document.getElementById('files-top-menu')?.remove();
        }
      });
    },

    // Menü çubuğu açılır menüsü: Öğeleri sırala vs. içerik dinamik kurulu.
    showTopMenu(name, trigger) {
      const old = document.getElementById('files-top-menu');
      if (old) old.remove();
      const rect = trigger.getBoundingClientRect();
      const menu = document.createElement('div');
      menu.id = 'files-top-menu';
      menu.className = 'desktop-context-menu files-top-menu open';
      let items = '';
      if (name === 'file') {
        items = `
          <div class="ctx-item" data-act="new-folder"><span>Klasör Oluştur</span></div>
          <div class="ctx-item" data-act="new-doc"><span>Belge Oluştur</span></div>
          <div class="ctx-item" data-act="new-file"><span>Dosya Oluştur</span></div>
          <div class="ctx-item" data-act="term"><span>Burada Terminal Aç</span></div>
          <div class="ctx-divider"></div>
          <div class="ctx-item" data-act="props-here"><span>Özellikler</span></div>
          <div class="ctx-item" data-act="close"><span>Kapat</span></div>
        `;
      } else if (name === 'edit') {
        items = `
          <div class="ctx-item" data-act="copy"><span>Kopyala</span></div>
          <div class="ctx-item" data-act="paste"><span>Yapıştır</span></div>
          <div class="ctx-item" data-act="cut"><span>Kes</span></div>
          <div class="ctx-divider"></div>
          <div class="ctx-item" data-act="trash"><span>Çöpe Taşı</span></div>
          <div class="ctx-item" data-act="delete"><span>Tamamen Sil</span></div>
          <div class="ctx-divider"></div>
          <div class="ctx-item" data-act="shortcut"><span>Kısayol Oluştur</span></div>
        `;
      } else if (name === 'view') {
        items = `
          <div class="context-menu-category">Öğeleri Sırala</div>
          <div class="ctx-item" data-act="sort-name"><span>Ad</span></div>
          <div class="ctx-item" data-act="sort-size"><span>Boyut</span></div>
          <div class="ctx-item" data-act="sort-ext"><span>Tür</span></div>
          <div class="ctx-item" data-act="sort-mtime"><span>Tarih</span></div>
          <div class="ctx-item" data-act="sort-dir-toggle"><span>Artan / Azalan (${this.sortDir === 'asc' ? 'artan' : 'azalan'})</span></div>
          <div class="ctx-divider"></div>
          <div class="ctx-item" data-act="zoom-in"><span>Yaklaştır</span></div>
          <div class="ctx-item" data-act="zoom-out"><span>Uzaklaştır</span></div>
          <div class="ctx-item" data-act="zoom-reset"><span>Olağan Boyut</span></div>
          <div class="ctx-divider"></div>
          <div class="ctx-item" data-act="view-icons"><span>Simge Görünümü</span></div>
          <div class="ctx-item" data-act="view-list"><span>Liste Görünümü</span></div>
          <div class="ctx-item" data-act="view-compact"><span>Sıkı Görünüm</span></div>
          <div class="ctx-item" data-act="hidden"><span>Gizli dosyaları göster (Ctrl+H)</span></div>
        `;
      } else if (name === 'about') {
        items = `
          <div class="ctx-item" data-act="about"><span>Ankora Linux Hakkında</span></div>
        `;
      }
      menu.innerHTML = items;
      document.body.appendChild(menu);
      const w = menu.offsetWidth || 220;
      menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - w - 10))}px`;
      menu.style.top = `${rect.bottom + 4}px`;

      menu.querySelectorAll('.ctx-item').forEach(el => {
        el.addEventListener('click', () => {
          menu.remove();
          document.querySelectorAll('.files-menu-trigger.open-menu').forEach(t => t.classList.remove('open-menu'));
          const act = el.getAttribute('data-act');
          this.handleMenuAction(act);
        });
      });
    },

    handleMenuAction(act) {
      switch (act) {
        case 'new-folder': this.promptNewFolder(); break;
        case 'new-doc': this.promptCreateFile('Yeni Belge', 'doc'); break;
        case 'new-file': this.promptCreateFile('Yeni Dosya', 'file'); break;
        case 'term': this.openTerminalHere(); break;
        case 'props-here': this.promptProperties(this.selectedItem || { name: this.currentPath || '/', path: this.currentPath || '/', is_dir: true }); break;
        case 'close': WindowManager.close('win-files'); break;
        case 'copy': this.clipboardAdd('copy'); break;
        case 'cut': this.clipboardAdd('cut'); break;
        case 'paste': this.pasteClipboard(); break;
        case 'trash':
          if (this.selectedItem) this.moveToTrash(this.selectedItem.path);
          else ReportManager?.showToast('Önce bir öge seçin.', 'error');
          break;
        case 'delete':
          if (this.selectedItem) this.permanentDelete(this.selectedItem);
          else ReportManager?.showToast('Önce bir öge seçin.', 'error');
          break;
        case 'shortcut': this.createShortcut(this.selectedItem); break;
        case 'sort-name': this.setSort('name'); break;
        case 'sort-size': this.setSort('size'); break;
        case 'sort-ext': this.setSort('ext'); break;
        case 'sort-mtime': this.setSort('mtime'); break;
        case 'sort-dir-toggle': this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc'; this.refresh(); break;
        case 'zoom-in': this.zoomFiles(1); break;
        case 'zoom-out': this.zoomFiles(-1); break;
        case 'zoom-reset': this.resetZoom(); break;
        case 'view-icons': this.setViewMode('icons'); break;
        case 'view-list': this.setViewMode('list'); break;
        case 'view-compact': this.setViewMode('compact'); break;
        case 'hidden': this.toggleHiddenFiles(); break;
        case 'about':
          WindowManager.open('win-telemetry');
          break;
      }
    },

    // Klasör/belge oluştur: hem boş-alan sağ tığı hem Dosya menüsünden.
    async promptCreateFile(kind, what) {
      const name = prompt(what === 'doc' ? 'Belge adı: (ör. Notlar.md)' : 'Dosya adı:', what === 'doc' ? 'Yeni Belge.md' : 'Yeni Dosya.txt');
      if (!name || !name.trim()) return;
      const clean = name.trim().replace(/[\\/:*?"<>|\0]/g, '-');
      let content = '';
      const target = `${this.currentPath === '/' ? '' : this.currentPath}/${clean}`;
      if (what === 'doc') {
        if (clean.toLowerCase().endsWith('.md')) content = `# ${clean.replace(/\.[^.]+$/, '')}\n\n`;
        else if (clean.toLowerCase().endsWith('.html')) content = '<!DOCTYPE html>\n<html lang="tr">\n<head><meta charset="utf-8"><title>Belge</title></head>\n<body>\n\n</body>\n</html>\n';
        else content = '';
      }
      try {
        await TauriBridge.invoke('write_text_file', { path: target, content });
        ReportManager?.showToast(`'${clean}' oluşturuldu.`);
        this.refresh();
      } catch (e) {
        // write_text_file yoksa fallback: dosya üstünde touch benzeri create_folder mekanizması kullanılamaz; hata göster.
        ReportManager?.showToast(`Oluşturulamadı: ${e.message || e}`, 'error');
      }
    },

    // Seçili ögeyi(leri) panoya ekler ('copy' | 'cut').
    clipboardAdd(op) {
      const picks = (Array.isArray(this.selectedItems) && this.selectedItems.length > 1)
        ? this.selectedItems.slice()
        : (this.selectedItem ? [this.selectedItem] : []);
      if (!picks.length) {
        ReportManager?.showToast('Önce bir öge seçin.', 'error');
        return;
      }
      this.clipboard = picks;
      this.clipboardOp = op;
      ReportManager?.showToast(op === 'cut'? `${this.clipboard.length} öge kesildi (yapıştırmayı bekliyor).`: `${this.clipboard.length} öge panoya kopyalandı.`);
      this.updateClipboardStatus();
    },

    updateClipboardStatus() {
      const el = document.getElementById('files-status-selected');
      if (!el) return;
      if (!this.clipboard.length) {
        el.textContent = '';
        return;
      }
      const suffix = this.clipboardOp === 'cut' ? 'kesildi' : 'kopyalandı';
      el.textContent = `${this.clipboard.length} öge ${suffix}`;
    },

    async pasteClipboard() {
      if (!this.clipboard.length) {
        ReportManager?.showToast('Panoda öge yok.', 'error');
        return;
      }
      if (this.isTrashView) {
        ReportManager?.showToast('Çöp kutusunun içine yapıştırılamaz.', 'error');
        return;
      }
      const wasCut = this.clipboardOp === 'cut';
      for (const entry of this.clipboard) {
        try {
          // Çöp kutusu görünümümce currentPath güncellenmez; o durumda ev
          // dizini hedeflenir, pano taşıma hedefi buzdolabı olmasın.
          const res = await TauriBridge.invoke('copy_path_c', {
            sourcePath: entry.path,
            destPath: this.currentPath || this.userHome,
            moveOp: wasCut
          });
          ReportManager?.showToast(res || 'İşlem tamamlandı.');
        } catch (e) {
          ReportManager?.showToast(`İşlem başarısız: ${e.message || e}`, 'error');
        }
      }
      if (wasCut) { this.clipboard = []; this.clipboardOp = null; }
      this.updateClipboardStatus();
      this.refresh();
    },

    async createShortcut(item) {
      if (!item || this.isTrashView) {
        ReportManager?.showToast('Kısayol için önce bir öge seçin.', 'error');
        return;
      }
      // Masaüstü XDG adı İngilizce olabilir: gerçek dizin adı XDG'den alınır.
      const deskDir = (this.xdgDirs && this.xdgDirs.desktop) || `${this.userHome}/Masaüstü`;
      const base = item.name.replace(/\s+/g, ' ').trim();
      const candidates = [base, `${base} (bağ)`, `${base} (bağ)2`, `${base} (bağ)3`];
      for (const leaf of candidates) {
        const link = `${deskDir}/${leaf}`;
        try {
          await TauriBridge.invoke('create_symlink', { sourcePath: item.path, linkPath: link });
          ReportManager?.showToast(`Kısayol oluşturuldu: ${link}`);
          DesktopFiles?.refresh?.();
          return;
        } catch (e) {
          // Aynı adlı kısayol var: sonraki adı dene.
        }
      }
      ReportManager?.showToast('Kısayol oluşturulamadı: uygun ad yok.', 'error');
    },

    async permanentDelete(item) {
      if (!item) return;
      if (!confirm(`'${item.name}' kalıcı olarak silinsin mi? Bu işlem geri alınamaz!`)) return;
      try {
        await TauriBridge.invoke('delete_file', { path: item.path });
        ReportManager?.showToast('Öge kalıcı olarak silindi.');
        if (this.isTrashView) this.loadTrash();
        else this.refresh();
      } catch (e) {
        ReportManager?.showToast(`Silinemedi: ${e.message || e}`, 'error');
      }
    },

    // Boş alana sağ tık: klasör/belge oluştur, yapıştır, sırala, zoom, görünüm,
    // terminal, özellikler. (Kullanıcı istek listesi: klasör-boş-alan menüsü.)
    initEmptyAreaMenu() {
      const area = document.getElementById('files-content-area');
      if (!area) return;
      area.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.files-item-card')) return;
        e.preventDefault();
        this.showEmptyAreaContextMenu(e);
      });
    },

    showEmptyAreaContextMenu(e) {
      let menu = document.getElementById('files-empty-context-menu');
      if (!menu) {
        menu = document.createElement('div');
        menu.id = 'files-empty-context-menu';
        menu.className = 'desktop-context-menu file-context-menu';
        document.body.appendChild(menu);
      }
      menu.innerHTML = `
        <div class="ctx-item" data-act="new-folder"><svg class="glyph"><use href="#ico-folder"></use></svg><span>Klasör Oluştur</span></div>
        <div class="ctx-item" data-act="new-doc"><svg class="glyph"><use href="#ico-file-text"></use></svg><span>Belge Oluştur</span></div>
        <div class="ctx-item" data-act="new-file"><svg class="glyph"><use href="#ico-file"></use></svg><span>Dosya Oluştur</span></div>
        <div class="ctx-divider"></div>
        <div class="ctx-item" data-act="paste"><svg class="glyph"><use href="#ico-copy"></use></svg><span>Yapıştır</span></div>
        <div class="ctx-divider"></div>
        <div class="context-menu-category">Öğeleri Sırala</div>
        <div class="ctx-item" data-act="sort-name"><span>Ad</span></div>
        <div class="ctx-item" data-act="sort-size"><span>Boyut</span></div>
        <div class="ctx-item" data-act="sort-ext"><span>Tür</span></div>
        <div class="ctx-item" data-act="sort-mtime"><span>Tarih</span></div>
        <div class="ctx-item" data-act="sort-dir-toggle"><span>Artan / Azalan (${this.sortDir === 'asc' ? 'artan' : 'azalan'})</span></div>
        <div class="ctx-divider"></div>
        <div class="ctx-item" data-act="zoom-in"><span>Yaklaştır</span></div>
        <div class="ctx-item" data-act="zoom-out"><span>Uzaklaştır</span></div>
        <div class="ctx-item" data-act="zoom-reset"><span>Olağan Boyut</span></div>
        <div class="ctx-divider"></div>
        <div class="ctx-item" data-act="view-icons"><span>Simge Görünümü</span></div>
        <div class="ctx-item" data-act="view-list"><span>Liste Görünümü</span></div>
        <div class="ctx-item" data-act="view-compact"><span>Sıkı Görünüm</span></div>
        <div class="ctx-item" data-act="hidden"><span>Gizli Dosyalar</span></div>
        <div class="ctx-divider"></div>
        <div class="ctx-item" data-act="term"><svg class="glyph"><use href="#ico-terminal"></use></svg><span>Burada Terminal Aç</span></div>
        <div class="ctx-item" data-act="props-here"><svg class="glyph"><use href="#ico-settings"></use></svg><span>Özellikler</span></div>
      `;
      const x = Math.min(e.clientX, window.innerWidth - 250);
      const y = Math.min(e.clientY, window.innerHeight - 400);
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
      menu.classList.add('open');
      const closeMenu = () => {
        menu.classList.remove('open');
        document.removeEventListener('click', closeMenu);
      };
      setTimeout(() => document.addEventListener('click', closeMenu), 10);
      menu.querySelectorAll('.ctx-item').forEach(btn => {
        btn.addEventListener('click', () => {
          closeMenu();
          this.handleMenuAction(btn.getAttribute('data-act'));
        });
      });
    },

    // Kopyalama/taşıma canlı ilerleme: "0.4 MB / 12.0 MB — 3 sn" (hata listesi #5).
    initProgressListener() {
      if (!window.__TAURI__ || !window.__TAURI__.event) return;
      this._progStart = 0;
      this._progLast = 0;
      window.__TAURI__.event.listen('fs-progress', (event) => {
        const now = Date.now();
        // 5 saniye sessizlik yeni işlem sayılır: süre sayacı sıfırlanır.
        if (!this._progLast || now - this._progLast > 5000) this._progStart = now;
        this._progLast = now;
        const p = event.payload || {};
        if (!p.op) return;
        const elapsed = Math.round((now - this._progStart) / 1000);
        const msg = p.op === 'print'
          ? p.current
          : `${this.formatBytes(p.bytes_done)} / ${this.formatBytes(p.total_bytes)} — ${p.files_done}/${p.total_files} öge — ${elapsed} sn`;
        const el = document.getElementById('files-status-count');
        if (el) el.textContent = msg;
      });
    },

    // XDG dizinlerini önden çeker; Dosyalar açılmadan hazır olur.
    prefetchXdgDirs() {
      if (this.xdgDirs) return Promise.resolve(this.xdgDirs);
      return TauriBridge.invoke('get_xdg_user_dirs', {})
        .then(d => {
          if (d && d.home) {
            this.xdgDirs = d;
            this.userHome = d.home;
          }
          return this.xdgDirs;
        })
        .catch(() => null);
    },

    async loadDirectory(dirPath) {
      this.isTrashView = false;
      const breadcrumbs = document.getElementById('files-breadcrumbs');
      const grid = document.getElementById('files-grid');
      const statusCount = document.getElementById('files-status-count');
      const statusSelected = document.getElementById('files-status-selected');

      try {
        const res = await TauriBridge.invoke('list_directory', { path: dirPath });
        if (!res) return;

        if (res.home_dir) this.userHome = res.home_dir;
        this.currentPath = res.current_path || dirPath;
        this.items = res.items || [];
        // Gizli (nokta ile başlayan) ögeler dosya yöneticisinde listelenmez;
        // gizli yapılandırma dosyaları "boş/gereksiz" satırlar gibi görünüyordu.
        const visibleItems = this.visibleSorted(this.items);
        this.selectedItem = null;

        if (breadcrumbs) {
          breadcrumbs.innerHTML = '';
          const parts = this.currentPath.split('/').filter(Boolean);
          
          const rootCrumb = document.createElement('span');
          rootCrumb.className = `files-crumb ${parts.length === 0 ? 'active' : ''}`;
          rootCrumb.textContent = '/';
          rootCrumb.title = 'Kök Dizin (/)';
          rootCrumb.addEventListener('click', () => this.loadDirectory('/'));
          breadcrumbs.appendChild(rootCrumb);

          let builtPath = '';
          parts.forEach((part, idx) => {
            builtPath += '/' + part;
            const targetPath = builtPath;

            const sep = document.createElement('span');
            sep.className = 'files-crumb-sep';
            sep.textContent = '›';
            breadcrumbs.appendChild(sep);

            const crumb = document.createElement('span');
            crumb.className = `files-crumb ${idx === parts.length - 1 ? 'active' : ''}`;
            crumb.textContent = part;
            crumb.title = targetPath;
            crumb.addEventListener('click', () => this.loadDirectory(targetPath));
            breadcrumbs.appendChild(crumb);
          });
        }

        if (statusCount) {
          statusCount.textContent = `${visibleItems.length} öge`;
        }
        if (statusSelected) {
          statusSelected.textContent = 'Seçili öge yok';
        }

        if (grid) {
          grid.innerHTML = '';
          if (visibleItems.length === 0) {
            const emptyNotice = document.createElement('div');
            emptyNotice.className = 'files-empty-state';
            emptyNotice.innerHTML = `
              <div style="font-size: 38px; opacity: 0.5; margin-bottom: 8px;"><svg class="glyph" aria-hidden="true"><use href="#ico-folder-open"></use></svg></div>
              <div style="font-size: 13px; font-weight: 600; color: var(--text-secondary);">Bu klasör boş</div>
              <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 4px;">"Yeni Klasör" butonunu kullanarak yeni dizin ekleyebilirsiniz.</div>
            `;
            grid.appendChild(emptyNotice);
            return;
          }

          const frag = document.createDocumentFragment();
          visibleItems.forEach(item => {
            const card = document.createElement('div');
            card.className = 'files-item-card';
            card.title = `${item.name} (${item.size_str || '-'})`;
            card.draggable = true;

            let icon = '<svg class="glyph" aria-hidden="true"><use href="#ico-file"></use></svg>';
            let badge = '';
            if (item.is_dir) {
              icon = '<svg class="glyph" aria-hidden="true"><use href="#ico-folder"></use></svg>';
            } else if (item.ext === 'deb') {
              icon = '<svg class="glyph" aria-hidden="true"><use href="#ico-package"></use></svg>';
              badge = '<span class="file-card-badge deb">DEB PAKET</span>';
            } else if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(item.ext)) {
              icon = '<svg class="glyph" aria-hidden="true"><use href="#ico-image"></use></svg>';
            } else if (['pdf', 'doc', 'docx', 'odt'].includes(item.ext)) {
              icon = '<svg class="glyph" aria-hidden="true"><use href="#ico-file-text"></use></svg>';
            } else if (['txt', 'md', 'json', 'js', 'py', 'sh', 'css', 'html', 'c', 'cpp', 'rs'].includes(item.ext)) {
              icon = '<svg class="glyph" aria-hidden="true"><use href="#ico-edit"></use></svg>';
            } else if (['zip', 'tar', 'gz', 'xz', '7z', 'bz2'].includes(item.ext)) {
              icon = '<svg class="glyph" aria-hidden="true"><use href="#ico-archive"></use></svg>';
              badge = '<span class="file-card-badge" style="background:rgba(234,179,8,0.2);color:#fde047;border-color:rgba(234,179,8,0.3);">ARŞİV</span>';
            } else if (['mp3', 'ogg', 'wav', 'flac'].includes(item.ext)) {
              icon = '<svg class="glyph" aria-hidden="true"><use href="#ico-music"></use></svg>';
            } else if (['mp4', 'mkv', 'avi', 'webm', 'mov'].includes(item.ext)) {
              icon = '<svg class="glyph" aria-hidden="true"><use href="#ico-film"></use></svg>';
            }

            card.innerHTML = `
              <div class="files-item-icon">${icon}</div>
              <div class="files-item-name">${escapeHtml(item.name)}</div>
              <div class="files-item-size">${escapeHtml(item.size_str || (item.is_dir ? 'Klasör' : '-'))}</div>
              ${badge}
            `;

            // Sürükle-Bırak (Drag & Drop)
            card.addEventListener('dragstart', (e) => {
              e.dataTransfer.setData('text/plain', item.path);
            });

            if (item.is_dir) {
              card.addEventListener('dragover', (e) => {
                e.preventDefault();
                card.classList.add('drag-over');
              });
              card.addEventListener('dragleave', () => {
                card.classList.remove('drag-over');
              });
              card.addEventListener('drop', async (e) => {
                e.preventDefault();
                card.classList.remove('drag-over');
                const srcPath = e.dataTransfer.getData('text/plain');
                if (srcPath && srcPath !== item.path) {
                  await this.moveItem(srcPath, item.path);
                }
              });
            }

            card.addEventListener('click', (e) => {
              e.stopPropagation();
              if (e.ctrlKey || e.metaKey) {
                // Ctrl ile çoklu seçim: seçili listede varsa çıkar, yoksa ekle.
                this.selectedItems = this.selectedItems || [];
                const exists = this.selectedItems.findIndex(i => i.path === item.path);
                if (exists === -1) {
                  this.selectedItems.push(item);
                  card.classList.add('selected');
                } else {
                  this.selectedItems.splice(exists, 1);
                  card.classList.remove('selected');
                }
                this.selectedItem = item;
                if (statusSelected) {
                  statusSelected.textContent = this.selectedItems.length > 1
                    ? `${this.selectedItems.length} öge seçili`
                    : `${item.name} (${item.is_dir ? 'Klasör' : item.size_str})`;
                }
                return;
              }
              document.querySelectorAll('.files-item-card').forEach(c => c.classList.remove('selected'));
              card.classList.add('selected');
              this.selectedItem = item;
              this.selectedItems = [item];
              if (statusSelected) {
                statusSelected.textContent = `${item.name} (${item.is_dir ? 'Klasör' : item.size_str})`;
              }
            });

            card.addEventListener('dblclick', (e) => {
              e.stopPropagation();
              this.openItem(item);
            });

            // Sağ Tık Özel Dosya Bağlam Menüsü
            card.addEventListener('contextmenu', (e) => {
              e.preventDefault();
              e.stopPropagation();
              this.showFileContextMenu(e, item);
            });

            frag.appendChild(card);
          });
          grid.appendChild(frag);
        }
        this.applyViewMode();

      } catch (err) {
        Terminal.log(`[DOSYA HATASI] Dizin okunamadı: ${err}`, 'error');
        // Dizin bulunamadığında arka planda sessizce ev dizinine düşülüyordu;
        // kullanıcı her klasörde aynı dosyaları görüyordu.
        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast(`Klasör açılamadı: ${err.message || err}`, 'error');
        }
      }
    },

    async openItem(item) {
      if (item.is_dir) {
        this.loadDirectory(item.path);
        return;
      }

      // 1. Debian paketi (.deb) tıklanınca doğrudan kur ve aç
      if (item.ext === 'deb') {
        const doInstall = confirm(`'${item.name}' Debian paketi kurulsun mu?\n\nBu işlem paketi sisteminize kuracak ve başlatılabilir hale getirecektir.`);
        if (doInstall) {
          Terminal.log(`[DEB KURULUMU] ${item.path}...`, 'cmd');
          try {
            await TauriBridge.invoke('open_path', { path: item.path });
            Terminal.log(`[DEB BAŞARILI] '${item.name}' kurulum komutu gönderildi.`, 'success');
          } catch (e) {
            Terminal.log(`[DEB HATASI] ${e}`, 'error');
          }
        }
        return;
      }

      // 2. Metin, Kod ve Konfigürasyon Dosyaları
      const codeExts = ['txt', 'md', 'json', 'js', 'py', 'sh', 'css', 'html', 'log', 'conf', 'ini', 'yml', 'yaml'];
      if (codeExts.includes(item.ext)) {
        try {
          const doc = await TauriBridge.invoke('read_document_file', { filePath: item.path });
          // Arka uç {file_name, file_type, content} nesnesi döndürür; nesnenin
          // kendisi textarea'ya yazılsaydı içerik "[object Object]" görünüyordu.
          const text = (doc && typeof doc === 'object') ? doc.content : doc;
          if (text !== undefined && text !== null && typeof NotepadManager !== 'undefined' && NotepadManager.textarea) {
            NotepadManager.textarea.value = String(text);
            NotepadManager.updateCounts();
            WindowManager.open('win-notepad');
            Terminal.log(`[NOT DEFTERİ] '${item.name}' açıldı.`, 'muted');
            return;
          }
        } catch (e) {
          Terminal.log(`[NOT DEFTERİ] Dosya açılamadı: ${e}`, 'error');
          if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
            ReportManager.showToast(`Dosya açılamadı: ${e.message || e}`, 'error');
          }
          return;
        }
      }

      // 3. Görsel Dosyalar — Office çerçevesinde data URI olarak gösterilir
      if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(item.ext)) {
        try {
          const doc = await TauriBridge.invoke('read_document_file', { filePath: item.path });
          if (doc && doc.file_type === 'image') {
            OfficeManager.renderDocument(doc);
            WindowManager.open('win-office');
            Terminal.log(`[GÖRSEL] '${item.name}' görüntülendi.`, 'muted');
          } else if (doc && typeof doc === 'object') {
            OfficeManager.renderDocument(doc);
            WindowManager.open('win-office');
          }
        } catch (e) {
          Terminal.log(`[GÖRSEL] Dosya açılamadı: ${e}`, 'error');
          if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
            ReportManager.showToast(`Görsel açılamadı: ${e.message || e}`, 'error');
          }
        }
        return;
      }

      // 4. PDF Dosyaları — yola bağlı harici açıcı yerine Office çerçevesinde
      //    gömülü olarak render edilir (dış açıcı ISO'da kurulu değil).
      if (item.ext === 'pdf') {
        try {
          const doc = await TauriBridge.invoke('read_document_file', { filePath: item.path });
          if (doc && typeof doc === 'object') {
            OfficeManager.renderDocument(doc);
            WindowManager.open('win-office');
            Terminal.log(`[OFİS] '${item.name}' Office ile açıldı.`, 'success');
          }
        } catch (e) {
          Terminal.log(`[OFİS] PDF açılamadı: ${e}`, 'error');
          if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
            ReportManager.showToast(`PDF açılamadı: ${e.message || e}`, 'error');
          }
        }
        return;
      }

      // 5. Diğer dosyalar
      Terminal.log(`[AÇILIYOR] ${item.name}...`, 'cmd');
      try {
        await TauriBridge.invoke('open_path', { path: item.path });
        Terminal.log(`[BAŞARILI] ${item.name} açıldı.`, 'success');
      } catch (e) {
        Terminal.log(`[HATA] Dosya açılamadı: ${e}`, 'error');
        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast(`Dosya açılamadı: ${e.message || e}`, 'error');
        }
      }
    },

    async promptNewFolder() {
      const folderName = prompt('Yeni Klasör Adı:', 'Yeni Klasör');
      if (!folderName || !folderName.trim()) return;

      const cleanName = folderName.trim().replace(/[\\/:*?"<>|\0]/g, '');
      if (!cleanName) {
        alert('Geçersiz klasör adı!');
        return;
      }

      const targetPath = (this.currentPath.endsWith('/') ? this.currentPath : this.currentPath + '/') + cleanName;
      Terminal.log(`[KLASÖR] '${targetPath}' oluşturuluyor...`, 'cmd');

      try {
        await TauriBridge.invoke('create_folder', { path: targetPath });
        Terminal.log(`[KLASÖR] '${cleanName}' başarıyla oluşturuldu.`, 'success');
        await this.refresh();
      } catch (err) {
        Terminal.log(`[HATA] Klasör oluşturulamadı: ${err}`, 'error');
        alert(`Klasör oluşturulamadı: ${err}`);
      }
    },

    navigateUp() {
      if (!this.currentPath || this.currentPath === '/' || this.currentPath === '') return;
      const parts = this.currentPath.split('/').filter(Boolean);
      parts.pop();
      const parentPath = parts.length === 0 ? '/' : '/' + parts.join('/');
      this.loadDirectory(parentPath);
    },

    refresh() {
      if (this.isTrashView) {
        this.loadTrash();
      } else {
        this.loadDirectory(this.currentPath || this.userHome || '/home/ankora');
      }
    },

    openTerminalHere() {
      WindowManager.open('win-terminal');
      if (Terminal && Terminal.runCommand) {
        Terminal.runCommand(`cd "${this.currentPath}"`);
      }
    },

    async loadTrash() {
      this.isTrashView = true;
      const breadcrumbs = document.getElementById('files-breadcrumbs');
      const grid = document.getElementById('files-grid');
      const statusCount = document.getElementById('files-status-count');
      const statusSelected = document.getElementById('files-status-selected');

      if (breadcrumbs) {
        breadcrumbs.innerHTML = '<span class="files-crumb active">🗑️ Çöp Kutusu (Trash)</span>';
      }

      if (grid) {
        grid.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">Çöp kutusu yükleniyor...</div>';
      }

      try {
        const items = await TauriBridge.invoke('list_trash') || [];
        this.items = items;
        this.selectedItem = null;

        if (statusCount) statusCount.textContent = `${items.length} öge`;
        if (statusSelected) statusSelected.textContent = 'Seçili öge yok';

        if (!grid) return;
        grid.innerHTML = '';

        const banner = document.createElement('div');
        banner.className = 'trash-banner';
        banner.innerHTML = `
          <span>🗑️ <strong>Çöp Kutusu</strong> (${items.length} öge) — Silinen dosyalar burada saklanır.</span>
          <button class="btn-pkg" id="btn-empty-trash-action" style="background:#ef4444;border:none;color:#fff;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:11.5px;font-weight:600;">Çöpü Boşalt</button>
        `;
        banner.querySelector('#btn-empty-trash-action').addEventListener('click', () => this.emptyTrash());
        grid.appendChild(banner);

        if (items.length === 0) {
          const emptyNotice = document.createElement('div');
          emptyNotice.className = 'files-empty-state';
          emptyNotice.innerHTML = `
            <div style="font-size: 38px; opacity: 0.5; margin-bottom: 8px;">🗑️</div>
            <div style="font-size: 13px; font-weight: 600; color: var(--text-secondary);">Çöp Kutusu Boş</div>
            <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 4px;">Silinen dosyalarınız burada güvenle saklanır.</div>
          `;
          grid.appendChild(emptyNotice);
          return;
        }

        const frag = document.createDocumentFragment();
        items.forEach(item => {
          const card = document.createElement('div');
          card.className = 'files-item-card';
          card.title = `${item.name} (${item.size_str || '-'})`;

          let icon = '<svg class="glyph" aria-hidden="true"><use href="#ico-file"></use></svg>';
          if (item.is_dir) {
            icon = '<svg class="glyph" aria-hidden="true"><use href="#ico-folder"></use></svg>';
          }

          card.innerHTML = `
            <div class="files-item-icon">${icon}</div>
            <div class="files-item-name">${escapeHtml(item.name)}</div>
            <div class="files-item-size">${escapeHtml(item.size_str || (item.is_dir ? 'Klasör' : '-'))}</div>
            <button class="btn-restore-item" style="margin-top:6px;font-size:10.5px;padding:3px 8px;background:rgba(37,99,235,0.2);color:#93c5fd;border:1px solid rgba(59,130,246,0.3);border-radius:4px;cursor:pointer;">Geri Yükle</button>
          `;

          card.querySelector('.btn-restore-item').addEventListener('click', (e) => {
            e.stopPropagation();
            this.restoreTrashItem(item.name);
          });

          card.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.files-item-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            this.selectedItem = item;
            if (statusSelected) {
              statusSelected.textContent = `${item.name} (${item.is_dir ? 'Klasör' : item.size_str})`;
            }
          });

          card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showFileContextMenu(e, item);
          });

          frag.appendChild(card);
        });
        grid.appendChild(frag);

      } catch (err) {
        Terminal.log(`[ÇÖP KUTUSU HATASI] ${err}`, 'error');
        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast('Çöp kutusu listelenemedi: ' + err, 'error');
        }
      }
    },

    async emptyTrash() {
      if (!confirm('Çöp kutusundaki tüm dosyaları kalıcı olarak silmek istediğinizden emin misiniz?')) return;
      try {
        const res = await TauriBridge.invoke('empty_trash');
        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast(res || 'Çöp kutusu boşaltıldı.');
        }
        this.loadTrash();
      } catch (e) {
        alert('Çöp kutusu boşaltılamadı: ' + e);
      }
    },

    async restoreTrashItem(fileName) {
      try {
        const res = await TauriBridge.invoke('restore_trash_item', { fileName });
        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast(res || 'Dosya geri yüklendi.');
        }
        this.loadTrash();
      } catch (e) {
        alert('Geri yüklenemedi: ' + e);
      }
    },

    async moveToTrash(filePath) {
      try {
        await TauriBridge.invoke('move_to_trash', { path: filePath });
        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast('Öge çöp kutusuna taşındı.');
        }
        this.refresh();
      } catch (e) {
        alert('Çöpe taşınamadı: ' + e);
      }
    },

    async moveItem(srcPath, destDir) {
      try {
        await TauriBridge.invoke('move_path', { sourcePath: srcPath, destPath: destDir });
        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast('Öge taşındı.');
        }
        this.refresh();
      } catch (e) {
        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast('Taşınamadı: ' + e, 'error');
        }
      }
    },

    async extractArchive(archivePath) {
      if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
        ReportManager.showToast('📦 Arşiv çıkartılıyor...');
      }
      try {
        const res = await TauriBridge.invoke('extract_archive', { archivePath });
        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast(res || 'Arşiv çıkarıldı.');
        }
        this.refresh();
      } catch (e) {
        alert('Arşiv çıkartılamadı: ' + e);
      }
    },

    async createArchive(sourcePath, type = 'zip') {
      if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
        ReportManager.showToast('📦 Arşiv oluşturuluyor...');
      }
      try {
        const res = await TauriBridge.invoke('create_archive', { sourcePath, archiveType: type });
        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast(res || 'Arşiv oluşturuldu.');
        }
        this.refresh();
      } catch (e) {
        alert('Arşiv oluşturulamadı: ' + e);
      }
    },

    promptNetworkShare() {
      const uri = prompt(
        'Ağ Paylaşımına Bağlan (SMB / SFTP / FTP / NFS):\nÖrnek:\n  smb://192.168.1.100/paylasim\n  sftp://kullanici@sunucu/var/www\n\nAdres:',
        'smb://192.168.1.'
      );
      if (!uri || !uri.trim()) return;
      const cleanUri = uri.trim();
      Terminal.log(`[AĞ BAĞLANTISI] ${cleanUri} bağlanılıyor...`, 'cmd');
      if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
        ReportManager.showToast(`Ağ paylaşımına bağlanılıyor: ${cleanUri}`);
      }
      TauriBridge.invoke('open_path', { path: cleanUri })
        .then(() => {
          if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
            ReportManager.showToast('Ağ bağlantısı açıldı.');
          }
        })
        .catch(err => {
          Terminal.log(`[AĞ HATASI] ${err}`, 'error');
          alert('Ağ paylaşımına bağlanılamadı: ' + err);
        });
    },

    showFileContextMenu(e, item) {
      let menu = document.getElementById('file-context-menu');
      if (!menu) {
        menu = document.createElement('div');
        menu.id = 'file-context-menu';
        menu.className = 'desktop-context-menu file-context-menu';
        document.body.appendChild(menu);
      }

      const isArchive = ['zip', 'tar', 'gz', 'xz', '7z', 'bz2', 'tgz', 'txz'].includes(item.ext);
      const isTrash = this.isTrashView;
      const isImage = ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(item.ext);
      const isDesktopEntry = (!item.is_dir && item.ext === 'desktop');
      const isExecutableFile = (!item.is_dir && item.ext === 'sh');
      let menuHtml = '';

      if (isTrash) {
        menuHtml = `
          <div class="ctx-item" data-action="restore">
            <svg class="glyph"><use href="#ico-refresh"></use></svg>
            <span>Ögeyi Geri Yükle</span>
          </div>
          <div class="ctx-divider"></div>
          <div class="ctx-item ctx-danger" data-action="permanent-delete">
            <svg class="glyph"><use href="#ico-x"></use></svg>
            <span>Kalıcı Olarak Sil</span>
          </div>
        `;
      } else {
        menuHtml = `
          <div class="ctx-item" data-action="open">
            <svg class="glyph"><use href="#ico-folder-open"></use></svg>
            <span>${item.is_dir ? 'Aç' : 'Aç (Varsayılan Uygulama)'}</span>
          </div>
          ${!item.is_dir ? `
          <div class="ctx-item" data-action="open-with">
            <svg class="glyph"><use href="#ico-settings"></use></svg>
            <span>Birlikte Aç...</span>
          </div>
          ` : ''}
          ${isDesktopEntry ? `
          <div class="ctx-item" data-action="set-default-app">
            <svg class="glyph"><use href="#ico-package"></use></svg>
            <span>Varsayılan Uygulama Olarak Ata</span>
          </div>
          ` : ''}
          ${isImage ? `
          <div class="ctx-item" data-action="set-wallpaper">
            <svg class="glyph"><use href="#ico-image"></use></svg>
            <span>Masaüstü Arka Planı Yap</span>
          </div>
          ` : ''}
          <div class="ctx-divider"></div>
          <div class="ctx-item" data-action="cut">
            <svg class="glyph"><use href="#ico-x"></use></svg>
            <span>Kes</span>
          </div>
          <div class="ctx-item" data-action="fps-copy">
            <svg class="glyph"><use href="#ico-copy"></use></svg>
            <span>Kopyala</span>
          </div>
          <div class="ctx-item" data-action="copy-to">
            <svg class="glyph"><use href="#ico-inbox"></use></svg>
            <span>Şuraya Kopyala...</span>
          </div>
          <div class="ctx-item" data-action="shortcut">
            <svg class="glyph"><use href="#ico-zap"></use></svg>
            <span>Kısayol Oluştur</span>
          </div>
          <div class="ctx-divider"></div>
          <div class="ctx-item" data-action="rename">
            <svg class="glyph"><use href="#ico-edit"></use></svg>
            <span>Yeniden Adlandır</span>
          </div>
          ${isArchive ? `
          <div class="ctx-item" data-action="extract">
            <svg class="glyph"><use href="#ico-archive"></use></svg>
            <span>Arşivi Buraya Çıkar</span>
          </div>
          ` : ''}
          <div class="ctx-item" data-action="archive-zip">
            <svg class="glyph"><use href="#ico-archive"></use></svg>
            <span>Arşiv Oluştur (ZIP)</span>
          </div>
          <div class="ctx-item" data-action="archive-tar">
            <svg class="glyph"><use href="#ico-archive"></use></svg>
            <span>Arşiv Oluştur (TAR.GZ)</span>
          </div>
          <div class="ctx-divider"></div>
          <div class="ctx-item ctx-danger" data-action="trash">
            <svg class="glyph"><use href="#ico-trash"></use></svg>
            <span>Çöp Kutusuna Taşı</span>
          </div>
          <div class="ctx-item ctx-danger" data-action="permanent-delete">
            <svg class="glyph"><use href="#ico-x"></use></svg>
            <span>Tamamen Sil</span>
          </div>
          ${!item.is_dir ? `
          <div class="ctx-item" data-action="print">
            <svg class="glyph"><use href="#ico-file-text"></use></svg>
            <span>Dosyayı Yazdır</span>
          </div>
          <div class="ctx-item" data-action="email">
            <svg class="glyph"><use href="#ico-inbox"></use></svg>
            <span>E-posta Gönder</span>
          </div>
          ` : `
          <div class="ctx-item" data-action="email">
            <svg class="glyph"><use href="#ico-inbox"></use></svg>
            <span>E-posta Gönder</span>
          </div>
          <div class="ctx-item" data-action="open-term-here-inside">
            <svg class="glyph"><use href="#ico-terminal"></use></svg>
            <span>Burada Terminal Aç</span>
          </div>
          `}
          <div class="ctx-divider"></div>
          <div class="ctx-item" data-action="open-term-here">
            <svg class="glyph"><use href="#ico-terminal"></use></svg>
            <span>Burada Uçbirim Aç</span>
          </div>
          <div class="ctx-item" data-action="open-as-root">
            <svg class="glyph"><use href="#ico-lock"></use></svg>
            <span>Yönetici Olarak Aç</span>
          </div>
          <div class="ctx-item" data-action="copy-path">
            <svg class="glyph"><use href="#ico-copy"></use></svg>
            <span>Dosya Yolunu Kopyala</span>
          </div>
          <div class="ctx-divider"></div>
          <div class="ctx-item" data-action="properties">
            <svg class="glyph"><use href="#ico-settings"></use></svg>
            <span>Özellikler</span>
          </div>
        `;
      }

      menu.innerHTML = menuHtml;

      const x = Math.min(e.clientX, window.innerWidth - 250);
      const y = Math.min(e.clientY, window.innerHeight - 400);
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
      menu.classList.add('open');

      const closeMenu = () => {
        menu.classList.remove('open');
        document.removeEventListener('click', closeMenu);
      };
      setTimeout(() => document.addEventListener('click', closeMenu), 10);

      menu.querySelectorAll('.ctx-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const act = btn.getAttribute('data-action');
          closeMenu();
          switch (act) {
            case 'open': this.openItem(item); break;
            case 'open-with': this.promptOpenWith(item); break;
            case 'set-default-app':
              TauriBridge.invoke('set_as_default_app', { appPath: item.path })
                .then(msg => ReportManager?.showToast(msg || 'Varsayılan uygulama atandı.'))
                .catch(err => ReportManager?.showToast(`Atanamadı: ${err.message || err}`, 'error'));
              break;
            case 'set-wallpaper':
              TauriBridge.invoke('set_desktop_wallpaper', { filePath: item.path })
                .then(msg => {
                  if (typeof ThemeManager !== 'undefined' && ThemeManager.setCustomWallpaper) {
                    ThemeManager.setCustomWallpaper(item.path);
                  }
                  ReportManager?.showToast(msg || 'Duvar kağıdı güncellendi.');
                })
                .catch(err => ReportManager?.showToast(`Hata: ${err.message || err}`, 'error'));
              break;
            case 'cut':
              this.selectedItem = item;
              this.clipboardAdd('cut');
              break;
            case 'fps-copy':
              this.selectedItem = item;
              this.clipboardAdd('copy');
              break;
            case 'copy-to': this.promptCopyTo(item); break;
            case 'shortcut': this.createShortcut(item); break;
            case 'rename': this.promptRename(item); break;
            case 'open-term-here': {
              const targetDir = item.is_dir ? item.path : (item.path.substring(0, item.path.lastIndexOf('/')) || '/');
              WindowManager.open('win-terminal');
              if (typeof Terminal !== 'undefined' && Terminal.runCommand) {
                Terminal.runCommand(`cd "${targetDir}"`);
              }
              break;
            }
            case 'open-term-here-inside':
              WindowManager.open('win-terminal');
              if (typeof Terminal !== 'undefined' && Terminal.runCommand) {
                Terminal.runCommand(`cd "${item.path}"`);
              }
              break;
            case 'open-as-root':
              TauriBridge.invoke('launch_application', { exec: `pkexec xdg-open "${item.path}"` })
                .catch(() => {
                  TauriBridge.invoke('launch_application', { exec: `sudo -A xdg-open "${item.path}"` })
                    .catch(err => ReportManager?.showToast(`Yönetici olarak açılamadı: ${err.message || err}`, 'error'));
                });
              break;
            case 'restore': this.restoreTrashItem(item.name); break;
            case 'extract': this.extractArchive(item.path); break;
            case 'archive-zip': this.createArchive(item.path, 'zip'); break;
            case 'archive-tar': this.createArchive(item.path, 'tar.gz'); break;
            case 'copy-path':
              navigator.clipboard.writeText(item.path).then(() => {
                ReportManager?.showToast('Dosya yolu panoya kopyalandı.');
              });
              break;
            case 'trash': this.moveToTrash(item.path); break;
            case 'permanent-delete': this.permanentDelete(item); break;
            case 'print':
              TauriBridge.invoke('print_file', { path: item.path })
                .then(msg => ReportManager?.showToast(msg || 'Yazdırılıyor...'))
                .catch(err => ReportManager?.showToast(`Yazdırılamadı: ${err.message || err}`, 'error'));
              break;
            case 'email':
              TauriBridge.invoke('email_file', { path: item.path })
                .then(msg => ReportManager?.showToast(msg || 'E-posta uygulaması açıldı.'))
                .catch(err => ReportManager?.showToast(`E-posta açılamadı: ${err.message || err}`, 'error'));
              break;
            case 'properties': this.promptProperties(item); break;
          }
        });
      });
    },

    // Yeniden adlandır: masaüstü dosyalarındaki move_path yolu kullanılır.
    async promptRename(item) {
      if (!item) return;
      const name = prompt('Yeni ad:', item.name);
      if (!name || !name.trim() || name.trim() === item.name) return;
      const clean = name.trim().replace(/[\\/:*?"<>|\0]/g, '-');
      const dir = item.path.substring(0, item.path.lastIndexOf('/')) || '/';
      const dest = `${dir}/${clean}`;
      try {
        await TauriBridge.invoke('move_path', { sourcePath: item.path, destPath: dest });
        ReportManager?.showToast(`'${item.name}' → '${clean}'`);
        this.refresh();
        DesktopFiles?.refresh?.();
      } catch (e) {
        ReportManager?.showToast(`Yeniden adlandırılamadı: ${e.message || e}`, 'error');
      }
    },

    // "Şuraya Kopyala": küçük dizin seçici (masaüstü/ana dizin/USB/dizin dolaş).
    async promptCopyTo(item) {
      const prev = document.getElementById('modal-copy-to');
      if (prev) prev.remove();

      const overlay = document.createElement('div');
      overlay.id = 'modal-copy-to';
      overlay.className = 'modal-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:99990;';
      overlay.innerHTML = `
        <div style="background:var(--bg-panel,#16181d);border:1px solid rgba(255,255,255,0.12);border-radius:12px;min-width:440px;max-width:560px;max-height:70vh;display:flex;flex-direction:column;overflow:hidden;">
          <div style="padding:14px 16px 8px;font-weight:700;font-size:14px;">Şuraya Kopyala — ${escapeHtml(item.name)}</div>
          <div id="copyto-quick" style="display:flex;flex-wrap:wrap;gap:6px;padding:0 16px 8px;"></div>
          <div id="copyto-crumb" style="padding:0 16px 8px;font-size:12px;color:var(--text-secondary,#9aa3b2);"></div>
          <div id="copyto-list" style="flex:1;overflow-y:auto;padding:4px 8px;"></div>
          <div style="display:flex;gap:8px;justify-content:flex-end;padding:10px 14px;border-top:1px solid rgba(255,255,255,0.08);">
            <button id="copyto-cancel" style="padding:6px 14px;border-radius:6px;border:1px solid rgba(255,255,255,0.14);background:transparent;color:inherit;cursor:pointer;">İptal</button>
            <button id="copyto-ok" style="padding:6px 14px;border-radius:6px;border:none;background:#2563eb;color:#fff;cursor:pointer;font-weight:600;">Buraya Kopyala</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      let currentDir = this.currentPath || this.userHome || '/';
      const listEl = overlay.querySelector('#copyto-list');
      const crumbEl = overlay.querySelector('#copyto-crumb');
      const close = () => overlay.remove();

      // Hızlı hedefler: XDG klasörleri + bağlı diskler (USB ve dahili bölümler).
      // Aksi hâlde iletişim yalnız mevcut dizinin altına bakar; masaüstü,
      // USB ve ikinci disk hiç görünmez.
      const quickEl = overlay.querySelector('#copyto-quick');
      const quickTargets = [];
      const xdg = this.xdgDirs || {};
      [['Masaüstü', xdg.desktop], ['Belgeler', xdg.documents], ['Resimler', xdg.pictures], ['İndirilenler', xdg.download]]
        .forEach(([label, dir]) => { if (dir) quickTargets.push([label, dir]); });
      try {
        const drives = await TauriBridge.invoke('get_removable_drives');
        (drives || []).forEach(d => {
          if (d.mountpoint) quickTargets.push([d.label || d.name || 'Disk', d.mountpoint]);
        });
      } catch (e) {}
      quickTargets.forEach(([label, dir]) => {
        const chip = document.createElement('button');
        chip.className = 'copyto-quick-chip';
        chip.textContent = label;
        chip.title = dir;
        chip.addEventListener('click', () => browse(dir));
        quickEl.appendChild(chip);
      });

      const browse = async (dir) => {
        currentDir = dir;
        crumbEl.textContent = dir;
        listEl.innerHTML = '<div style="padding:10px;color:var(--text-muted);font-size:12px;">Yükleniyor...</div>';
        try {
          const res = await TauriBridge.invoke('list_directory', { path: dir });
          listEl.innerHTML = '';
          const dirs = (res.items || []).filter(it => it.is_dir && !it.is_hidden).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
          if (dir !== '/') {
            const up = document.createElement('div');
            up.className = 'copyto-row';
            up.innerHTML = '<span style="padding:6px 8px;font-size:12.5px;cursor:pointer;">↩ Üst Dizin</span>';
            up.addEventListener('click', () => browse(dir.split('/').slice(0, -1).join('/') || '/'));
            listEl.appendChild(up);
          }
          dirs.forEach(d => {
            const row = document.createElement('div');
            row.className = 'copyto-row';
            row.innerHTML = `<span style="padding:6px 8px;font-size:12.5px;cursor:pointer;">📁 ${escapeHtml(d.name)}</span>`;
            row.addEventListener('click', () => browse(d.path));
            listEl.appendChild(row);
          });
          if (!dirs.length && dir === '/') {
            listEl.insertAdjacentHTML('beforeend', '<div style="padding:10px;color:var(--text-muted);font-size:12px;">Alt klasör yok.</div>');
          }
        } catch (err) {
          listEl.innerHTML = `<div style="padding:10px;color:#f87171;font-size:12px;">Klasör okunamadı: ${escapeHtml(String(err.message || err))}</div>`;
        }
      };

      overlay.querySelector('#copyto-cancel').addEventListener('click', close);
      overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
      overlay.querySelector('#copyto-ok').addEventListener('click', async () => {
        close();
        try {
          await TauriBridge.invoke('copy_path_c', { sourcePath: item.path, destPath: currentDir, moveOp: false });
          ReportManager?.showToast(`'${item.name}' kopyalandı: ${currentDir}`);
          this.refresh();
        } catch (err) {
          ReportManager?.showToast(`Kopyalanamadı: ${err.message || err}`, 'error');
        }
      });
      browse(currentDir);
    },

    // "Özellikler" iletşim penceresi: Genel + Simge + İzinler sekmeleri.
    async promptProperties(item) {
      if (!item || !item.path) return;
      const prev = document.getElementById('modal-file-props');
      if (prev) prev.remove();
      const overlay = document.createElement('div');
      overlay.id = 'modal-file-props';
      overlay.className = 'modal-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:99990;';
      overlay.innerHTML = `
        <div style="background:var(--bg-panel,#16181d);border:1px solid rgba(255,255,255,0.12);border-radius:12px;width:520px;max-height:76vh;display:flex;flex-direction:column;overflow:hidden;">
          <div style="padding:14px 16px;font-weight:700;font-size:14px;display:flex;align-items:center;gap:8px;">
            <svg class="glyph"><use href="#ico-file"></use></svg><span>Özellikler — ${escapeHtml(item.name)}</span>
          </div>
          <div class="props-tabs" style="display:flex;gap:4px;padding:0 16px;border-bottom:1px solid rgba(255,255,255,0.08);">
            <button class="props-tab active" data-tab="general" style="padding:8px 14px;background:none;border:none;border-bottom:2px solid #2563eb;color:inherit;font-size:12.5px;font-weight:600;cursor:pointer;">Genel</button>
            <button class="props-tab" data-tab="icon" style="padding:8px 14px;background:none;border:none;border-bottom:2px solid transparent;color:var(--text-secondary);font-size:12.5px;cursor:pointer;">Simge</button>
            <button class="props-tab" data-tab="perms" style="padding:8px 14px;background:none;border:none;border-bottom:2px solid transparent;color:var(--text-secondary);font-size:12.5px;cursor:pointer;">İzinler</button>
          </div>
          <div id="props-body" style="flex:1;overflow-y:auto;padding:14px 16px;font-size:12.5px;line-height:1.7;">Yükleniyor...</div>
          <div style="display:flex;gap:8px;justify-content:flex-end;padding:10px 14px;border-top:1px solid rgba(255,255,255,0.08);">
            <button id="props-cancel" style="padding:6px 14px;border-radius:6px;border:1px solid rgba(255,255,255,0.14);background:transparent;color:inherit;cursor:pointer;">Kapat</button>
            <button id="props-save" style="padding:6px 14px;border-radius:6px;border:none;background:#2563eb;color:#fff;cursor:pointer;font-weight:600;">Kaydet</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const bodyEl = overlay.querySelector('#props-body');
      const close = () => overlay.remove();
      overlay.querySelector('#props-cancel').addEventListener('click', close);
      overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
      overlay.querySelectorAll('.props-tab').forEach(tb => {
        tb.addEventListener('click', () => {
          overlay.querySelectorAll('.props-tab').forEach(o => {
            o.classList.remove('active');
            o.style.borderBottomColor = 'transparent';
          });
          tb.classList.add('active');
          tb.style.borderBottomColor = '#2563eb';
          this.renderPropsTab(tb.getAttribute('data-tab'), overlay, item);
        });
      });

      let stat = null;
      try {
        stat = await TauriBridge.invoke('file_stat', { path: item.path });
      } catch (e) {
        bodyEl.innerHTML = `<div style="color:#f87171;">Öge bilgisi okunamadı: ${escapeHtml(String(e.message || e))}</div>`;
        return;
      }
      let usage = null;
      try {
        usage = item.is_dir ? await TauriBridge.invoke('path_fs_usage', { path: item.path }) : null;
      } catch (e) { usage = null; }

      overlay._stat = stat;
      overlay._usage = usage;
      overlay.querySelector('#props-save').addEventListener('click', async () => {
        try {
          const access = overlay.querySelector('input[name="props-access"]:checked')
            || overlay.querySelector('#props-body input[name="props-access"]:checked');
          const execBoxEl = overlay.querySelector('#props-executable');
          const promises = [];
          if (access) {
            // Sahibin izin hanesi değişir; grup/öteki basamaklar korunur.
            const digit = access.value === 'none' ? '0' : access.value === 'read' ? '4' : access.value === 'write' ? '2' : '6';
            const perms = String(stat.perms || '600').padStart(3, '0').slice(-3);
            const newMode = digit + perms.slice(1);
            if (newMode !== perms) {
              promises.push(TauriBridge.invoke('set_file_permissions', { path: item.path, mode: newMode }));
            }
          }
          if (execBoxEl && !item.is_dir) {
            const wantExec = execBoxEl.checked;
            if (wantExec !== !!stat.executable) {
              promises.push(TauriBridge.invoke('set_file_executable', { path: item.path, executable: wantExec }));
            }
          }
          const results = await Promise.all(promises);
          results.forEach(r => ReportManager?.showToast(r || 'Güncellendi.'));
          close();
          this.refresh();
        } catch (e) {
          ReportManager?.showToast(`Kaydedilemedi: ${e.message || e}`, 'error');
        }
      });
      this.renderPropsTab('general', overlay, item);
    },

    // Özellikler sekmelerinin gövdesi: Genel / Simge / İzinler.
    renderPropsTab(tab, overlay, item) {
      const close_prop = () => overlay.remove();
      const stat = overlay._stat || {};
      const bodyEl = overlay.querySelector('#props-body');
      if (tab === 'general') {
        const rows = [
          ['Ad', stat.name || item.name],
          ['Tür', stat.is_dir ? (stat.child_count ? `Klasör (${stat.child_count} nesne)` : 'Klasör') : (stat.kind || 'Dosya')],
          ['Konum', (item.path || '').substring(0, item.path.lastIndexOf('/')) || '/'],
          ['Oluşturulma Tarihi', this.formatTimestamp(stat.ctime)],
          ['Değiştirilme Tarihi', this.formatTimestamp(stat.mtime)],
          ['Dosya Boyutu', `${this.formatBytes(stat.size)} (${stat.size} bayt)`],
        ];
        if (!item.is_dir) {
          rows.push(['İçerik', `1 dosya`]);
        }
        let html = '<table style="width:100%;border-collapse:collapse;">';
        rows.forEach(([k, v]) => {
          html += `<tr><td style="padding:4px 10px 4px 0;color:var(--text-secondary);white-space:nowrap;width:150px;">${k}</td><td style="padding:4px 0;word-break:break-all;">${escapeHtml(String(v ?? '-'))}</td></tr>`;
        });
        // Klasör veya kök: kapasite satırı.
        try {
          const u = overlay._usage;
          if (u === null && !item.is_dir) {
            // dosya için de üzerinde bulunduğu küme bilgisi faydalıdır.
          }
        } catch (e) {}
        html += '</table>';
        if (item.is_dir || !item.path || item.path === '/') {
          html += `<div style="margin-top:10px;padding:8px 10px;background:rgba(255,255,255,0.05);border-radius:8px;">
            <div style="font-weight:600;margin-bottom:4px;">Bağlı Olduğu Disk</div>
            <div id="props-fs" style="color:var(--text-secondary);">Okunuyor...</div>
          </div>`;
        }
        bodyEl.innerHTML = html;
        if (item.is_dir) {
          TauriBridge.invoke('path_fs_usage', { path: item.path })
            .then(u => {
              const el = document.getElementById('props-fs');
              if (el) el.innerHTML = `Kapasite: <b>${this.formatBytes(u.total)}</b> — Kullanım: <b>${this.formatBytes(u.used)} dolu</b>, <b>${this.formatBytes(u.free)} boş</b>`;
            })
            .catch(() => {});
        }
      } else if (tab === 'icon') {
        bodyEl.innerHTML = `
          <div style="margin-bottom:8px;">Bu öge için özel simge seçin (dosya yöneticisinde geçerlidir):</div>
          <div id="props-icon-grid" style="display:flex;gap:8px;flex-wrap:wrap;"></div>
        `;
        const choices = ['ico-folder', 'ico-file', 'ico-file-text', 'ico-image', 'ico-music', 'ico-film', 'ico-archive', 'ico-package', 'ico-trash', 'ico-terminal'];
        const iconStoreKey = 'ankora_file_icons';
        const grid = bodyEl.querySelector('#props-icon-grid');
        choices.forEach(c => {
          const b = document.createElement('button');
          b.title = c;
          b.style.cssText = 'width:42px;height:42px;border-radius:10px;border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.05);cursor:pointer;display:flex;align-items:center;justify-content:center;';
          b.innerHTML = `<svg class="glyph" style="width:20px;height:20px;"><use href="#${c}"></use></svg>`;
          b.addEventListener('click', () => {
            const store = JSON.parse(SafeStorage.getItem(iconStoreKey) || '{}');
            store[item.path] = c;
            SafeStorage.setItem(iconStoreKey, JSON.stringify(store));
            ReportManager?.showToast('Simge güncellendi.');
            this.refresh();
            close_prop();
          });
          grid.appendChild(b);
        });
        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'Varsayılana Dön';
        clearBtn.style.cssText = 'margin-top:10px;padding:6px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.14);background:transparent;color:inherit;cursor:pointer;';
        clearBtn.addEventListener('click', () => {
          const store = JSON.parse(SafeStorage.getItem(iconStoreKey) || '{}');
          delete store[item.path];
          SafeStorage.setItem(iconStoreKey, JSON.stringify(store));
          ReportManager?.showToast('Simge sıfırlandı.');
          this.refresh();
          close_prop();
        });
        bodyEl.appendChild(clearBtn);
      } else {
        const perms = stat.perms || '';
        const ownerPerms = (perms[0] || '0');
        const exec = !!stat.executable;
        const modeMap = { '0': 'none', '4': 'read', '2': 'write', '6': 'rw' };
        const curAccess = modeMap[ownerPerms] || 'rw';
        bodyEl.innerHTML = `
          <div style="margin-bottom:8px;"><span style="color:var(--text-secondary);">Sahibi:</span> <b>${escapeHtml(stat.owner || '-')}</b></div>
          <div style="margin-bottom:6px;font-weight:600;">Erişim</div>
          <div id="props-perms-group" style="display:flex;flex-direction:column;gap:6px;">
            ${[['none', 'Hiçbiri'], ['read', 'Yalnızca Okuma'], ['write', 'Yalnızca Yazma'], ['rw', 'Okuma & Yazma']]
              .map(([v, lbl]) => `
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                  <input type="radio" name="props-access" value="${v}" ${curAccess === v ? 'checked' : ''}>
                  <span>${lbl}</span>
                </label>
              `).join('')}
          </div>
          ${!item.is_dir ? `
          <label style="display:flex;align-items:center;gap:8px;margin-top:12px;cursor:pointer;">
            <input type="checkbox" id="props-executable" ${exec ? 'checked' : ''}>
            <span>Bu dosyanın program olarak çalışmasına izin ver</span>
          </label>
          ` : ''}
          ${item.is_dir ? '' : ''}
        `;
        bodyEl._curAccess = curAccess;
      }
    },

    async promptOpenWith(item) {
      const modal = document.getElementById('modal-open-with');
      const listEl = document.getElementById('open-with-apps-list');
      const titleEl = document.getElementById('open-with-title');
      const subEl = document.getElementById('open-with-subtitle');
      const inputCustom = document.getElementById('open-with-custom-cmd');
      const btnCustom = document.getElementById('btn-open-with-custom');
      const btnClose = document.getElementById('btn-close-open-with');

      if (!modal || !listEl) return;

      if (titleEl) titleEl.textContent = `Birlikte Aç — ${item.name}`;
      if (subEl) subEl.textContent = `'${item.name}' dosyasını açmak için bir uygulama seçin:`;
      if (inputCustom) inputCustom.value = '';

      modal.style.display = 'flex';

      const closeModal = () => {
        modal.style.display = 'none';
        btnClose?.removeEventListener('click', closeModal);
      };
      btnClose?.addEventListener('click', closeModal);

      listEl.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px 0;">Uygulamalar taranıyor...</div>';

      try {
        const apps = await TauriBridge.invoke('get_open_with_apps', { filePath: item.path });
        listEl.innerHTML = '';

        if (!Array.isArray(apps) || apps.length === 0) {
          listEl.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px 0;">Bu dosya türü için ilişkili uygulama bulunamadı. Aşağıdan özel bir komut yazabilirsiniz.</div>';
        } else {
          apps.forEach(app => {
            const row = document.createElement('div');
            row.className = 'open-with-app-row';
            row.innerHTML = `
              <div class="open-with-app-name">${escapeHtml(app.name)}</div>
              ${app.is_default ? '<span class="open-with-app-badge">Varsayılan</span>' : ''}
            `;
            row.addEventListener('click', () => {
              closeModal();
              const cmd = `${app.exec} "${item.path}"`;
              TauriBridge.invoke('launch_application', { exec: cmd })
                .then(() => ReportManager?.showToast(`${app.name} ile açıldı.`))
                .catch(err => ReportManager?.showToast(`Açılamadı: ${err.message || err}`, 'error'));
            });
            listEl.appendChild(row);
          });
        }
      } catch (err) {
        listEl.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px 0;">Uygulama listesi alınamadı.</div>';
      }

      if (btnCustom && inputCustom) {
        btnCustom.onclick = () => {
          const val = inputCustom.value.trim();
          if (!val) return;
          closeModal();
          const cmd = val.includes('%f') ? val.replace('%f', `"${item.path}"`) : `${val} "${item.path}"`;
          TauriBridge.invoke('launch_application', { exec: cmd })
            .then(() => ReportManager?.showToast('Özel komutla başlatıldı.'))
            .catch(err => ReportManager?.showToast(`Başlatılamadı: ${err.message || err}`, 'error'));
        };
      }
    }
  };

  // ============================================================================
  // 5. ANKORA OFFICE (GERÇEK PDF & BELGE GÖRÜNTÜLEYİCİ)
  // ============================================================================
  const OfficeManager = {
    pdfFrame: null,
    textFrame: null,
    filePicker: null,
    metaFilename: null,
    metaFilesize: null,

    init() {
      this.pdfFrame = document.getElementById('office-pdf-frame');
      this.textFrame = document.getElementById('office-text-frame');
      this.filePicker = document.getElementById('office-file-picker');
      this.metaFilename = document.getElementById('office-filename');
      this.metaFilesize = document.getElementById('office-filesize');

      const btnOpen = document.getElementById('btn-office-open');
      const btnSamplePdf = document.getElementById('btn-office-sample-pdf');
      const btnSampleDoc = document.getElementById('btn-office-sample-doc');
      const btnPrint = document.getElementById('btn-office-print');

      if (btnOpen && this.filePicker) {
        btnOpen.addEventListener('click', () => this.filePicker.click());
        this.filePicker.addEventListener('change', (e) => this.handleLocalFile(e.target.files[0]));
      }

      if (btnSamplePdf) {
        btnSamplePdf.addEventListener('click', () => this.loadSamplePdf());
      }

      if (btnSampleDoc) {
        btnSampleDoc.addEventListener('click', () => this.loadSampleText());
      }

      if (btnPrint && this.pdfFrame) {
        btnPrint.addEventListener('click', () => {
          try {
            this.pdfFrame.contentWindow.print();
          } catch (e) {
            window.print();
          }
        });
      }

      const btnCloseDoc = document.getElementById('btn-office-close-doc');
      if (btnCloseDoc) {
        btnCloseDoc.addEventListener('click', () => {
          this.clearFrame();
          const winOffice = document.getElementById('win-office');
          if (winOffice && typeof WindowManager !== 'undefined') {
            WindowManager.close(winOffice);
          }
          Terminal.log('[OFFICE] Belge ve pencere kapatıldı, WebKit bellek tamponu boşaltıldı.', 'cmd');
        });
      }

      // Başlangıçta örnek PDF yükle
      this.loadSamplePdf();
    },

    clearFrame() {
      if (this.pdfFrame) {
        this.pdfFrame.src = 'about:blank';
        this.pdfFrame.style.display = 'none';
      }
      if (this.textFrame) {
        this.textFrame.textContent = '';
        this.textFrame.style.display = 'none';
      }
      if (this.metaFilename) this.metaFilename.textContent = 'Belge Kapatıldı';
      if (this.metaFilesize) this.metaFilesize.textContent = '0 KB';
    },

    async loadSamplePdf() {
      try {
        const doc = await TauriBridge.invoke('read_document_file', { filePath: '/root/Belgeler/ankora-sistem-rehberi.pdf' });
        this.renderDocument(doc);
      } catch (err) {}
    },

    loadSampleText() {
      const doc = {
        file_name: 'kiosk-ayarlari.md',
        file_type: 'text',
        file_size: 1420,
        content: `# Ankora Linux 3.6 Kiosk Yapılandırma Raporu\n\n- Taban: Devuan Daedalus (SysVinit)\n- Çekirdek: Linux 6.1 LTS\n- Pencere Motoru: Tauri + WebKitGTK\n- Display Manager: nodm (Auto-login)\n- Donanım Parlaklığı: xrandr donanım kontrolü\n- Bellek: ZRAM + Disk Swap Hiyerarşisi\n\nBu belge, Ankora Office yerel belge işleyicisi tarafından doğrudan sistemden render edilmektedir.`
      };
      this.renderDocument(doc);
    },

    handleLocalFile(file) {
      if (!file) return;

      const ext = file.name.split('.').pop().toLowerCase();
      const reader = new FileReader();

      if (ext === 'pdf') {
        reader.onload = () => {
          this.renderDocument({
            file_name: file.name,
            file_type: 'pdf',
            file_size: file.size,
            content: reader.result
          });
        };
        reader.readAsDataURL(file);
      } else {
        reader.onload = () => {
          this.renderDocument({
            file_name: file.name,
            file_type: 'text',
            file_size: file.size,
            content: reader.result
          });
        };
        reader.readAsText(file);
      }
    },

    renderDocument(doc) {
      if (!doc || typeof doc !== 'object') return;
      if (this.metaFilename) this.metaFilename.textContent = doc.file_name;
      if (this.metaFilesize) this.metaFilesize.textContent = `${((doc.file_size || 0) / 1024).toFixed(1)} KB`;

      if (doc.file_type === 'pdf') {
        if (this.pdfFrame) {
          this.pdfFrame.style.display = 'block';
          this.pdfFrame.src = doc.content;
        }
        if (this.textFrame) this.textFrame.style.display = 'none';
      } else if (doc.file_type === 'image') {
        // Görsel data URI olarak aynı çerçevede gösterilir; WebKit URI'yi
        // tek başına görüntüleyerek açar.
        if (this.pdfFrame) {
          this.pdfFrame.style.display = 'block';
          this.pdfFrame.src = doc.content;
        }
        if (this.textFrame) this.textFrame.style.display = 'none';
      } else {
        if (this.pdfFrame) this.pdfFrame.style.display = 'none';
        if (this.textFrame) {
          this.textFrame.style.display = 'block';
          this.textFrame.textContent = doc.content;
        }
      }
    },

    openDocumentByName(name) {
      if (!name) return;
      if (name.endsWith('.pdf')) {
        this.loadSamplePdf();
      } else if (name === 'kiosk-ayarlari.md') {
        this.loadSampleText();
      } else {
        this.renderDocument({
          file_name: name,
          file_type: 'text',
          file_size: 4096,
          content: `# Ankora Linux 3.6 - Sürüm Notları (Daedalus)\n\n- Taban: Devuan GNU/Linux 5.0 (Daedalus)\n- İnit Sistemi: SysVinit (systemd-free, ultra-lightweight)\n- Arayüz: Tauri 1.5 + Monokrom Minimalist DE\n- Çekirdek: Linux 6.1.0-22-amd64\n\nSistem kararlılığı ve minimum RAM tüketimi garanti edilmektedir.`
        });
      }
    }
  };

  // ============================================================================
  // 6. ANKORA AI (OTONOM AJAN, KULLANICI API BAĞLANTISI & GÜVENLİK ONAY SİSTEMİ)
  // ============================================================================
  // Bağlantılar: ajanın soru anında okuduğu yerel bağlamlar. Dış hesap
  // bağlantıları (GitHub/Gmail) kaldırıldı; yalnız yerel veriler.
  const LinksManager = {
    KEYS: {
      todo: 'ankora_link_todo',
      browser: 'ankora_link_browser'
    },
    state: {
      todo: false, browser: false
    },

    init() {
      const s = this.state;
      s.todo = SafeStorage.getItem(this.KEYS.todo) === '1';
      s.browser = SafeStorage.getItem(this.KEYS.browser) === '1';

      const bind = (id, key) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.checked = s[key];
        el.addEventListener('change', () => {
          s[key] = Boolean(el.checked);
          SafeStorage.setItem(this.KEYS[key], s[key] ? '1' : '0');
          ReportManager?.showToast(`Bağlantı: ${el.closest('.ai-link-row')?.querySelector('span')?.textContent || key} ${s[key] ? 'açıldı' : 'kapatıldı'}`);
        });
      };
      bind('lk-todo-toggle', 'todo');
      bind('lk-browser-toggle', 'browser');
    },

    // Eski sürümde Google/GitHub hesapları için ayrılan şifreli kasa
    // girdileri artık kullanılmıyor; kasadan temizlenir.
    cleanupSecrets() {
      ['link_gh_pat', 'link_gmail_pass'].forEach(p => {
        TauriBridge.invoke('delete_ai_credential', { provider: p }).catch(() => {});
      });
    },

    todoContext() {
      if (!this.state.todo) return '';
      try {
        const items = JSON.parse(SafeStorage.getItem('ankora_todo_items') || '[]') || [];
        if (!items.length) return '';
        const lines = items
          .filter(i => !i.done)
          .slice(0, 12)
          .map(i => `- ${i.t}`);
        if (!lines.length) return '\n[Görevler: tüm görevler tamam]\n';
        return `\n[Kullanıcının açık görevleri]\n${lines.join('\n')}\n`;
      } catch (e) {
        return '';
      }
    },

    async contextFor() {
      return this.todoContext();
    }
  };

  const AIAgent = {
    feed: null,
    input: null,
    pendingCommand: null,
    pendingToken: null,
    provider: 'ollama',
    mode: 'sysadmin',
    model: 'qwen2.5:0.5b',
    endpoint: 'http://127.0.0.1:11434/api/generate',
    apiKey: '',
    includeTelemetry: true,
    watchScreen: false,
    miniFeed: null,
    history: [],
    detectProviderAndModel(key, forcedProvider = 'auto') {
      const k = (key || '').trim();
      const forced = (forcedProvider || 'auto').toLowerCase();
      if (forced === 'ollama' || (!k && forced === 'auto')) {
        return {
          provider: 'ollama',
          model: 'qwen2.5:0.5b',
          endpoint: 'http://127.0.0.1:11434/api/generate',
          label: 'Ollama (Yerel / Çevrimdışı)'
        };
      }
      if (forced === 'gemini' || (forced === 'auto' && k.startsWith('AIza'))) {
        return {
          provider: 'gemini',
          model: 'gemini-2.0-flash',
          endpoint: 'https://generativelanguage.googleapis.com/v1beta',
          label: 'Google Gemini (Gemini 2.0 Flash)'
        };
      }
      if (forced === 'groq' || (forced === 'auto' && k.startsWith('gsk_'))) {
        return {
          provider: 'groq',
          model: 'llama-3.3-70b-versatile',
          endpoint: 'https://api.groq.com/openai/v1/chat/completions',
          label: 'Groq Cloud (Llama 3.3 70B)'
        };
      }
      if (forced === 'openrouter' || (forced === 'auto' && (k.startsWith('sk-ant-') || k.startsWith('sk-or-')))) {
        return {
          provider: 'openrouter',
          model: 'anthropic/claude-3.5-sonnet',
          endpoint: 'https://openrouter.ai/api/v1/chat/completions',
          label: 'OpenRouter (Claude 3.5)'
        };
      }
      if (forced === 'openai' || (forced === 'auto' && k.startsWith('sk-'))) {
        return {
          provider: 'openai',
          model: 'gpt-4o-mini',
          endpoint: 'https://api.openai.com/v1/chat/completions',
          label: 'OpenAI (GPT-4o mini)'
        };
      }
      return {
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta',
        label: 'Özel / Evrensel API'
      };
    },

    async connectSingleKey(rawKey) {
      const key = (rawKey || '').trim();
      const provSelect = document.getElementById('ai-provider-select');
      const selectedProv = provSelect ? provSelect.value : 'auto';

      if (!key && selectedProv !== 'ollama') return;

      if (selectedProv === 'ollama' && !key) {
        await this.disconnectKey();
        return;
      }

      this.activeKey = key;
      const detection = this.detectProviderAndModel(key, selectedProv);
      this.provider = detection.provider;
      this.model = detection.model;
      this.endpoint = detection.endpoint;

      try {
        await TauriBridge.invoke('save_ai_credential', { provider: this.provider, apiKey: key });
      } catch (e) {
        Terminal.log(`[AI GÜVENLİK] Anahtar kaydedilemedi: ${e}`, 'error');
      }

      SafeStorage.setItem('ankora_ai_provider', this.provider);
      SafeStorage.setItem('ankora_ai_model', this.model);
      SafeStorage.setItem('ankora_ai_endpoint', this.endpoint);
      // Anahtar yalnızca bu oturumun belleğinde tutulur: tarayıcı deposuna
      // yazılan anahtar her script tarafından okunabilirdi. Sayfa
      // yenilendiğinde arka uç kendi kasasından çözer.

      this.updateBadges();

      const inputKey = document.getElementById('ai-cfg-key');
      if (inputKey) {
        inputKey.value = '';
        inputKey.placeholder = `•••••••• (${detection.label} Aktif)`;
      }

      const welcomeInput = document.getElementById('welcome-api-key-input');
      if (welcomeInput) {
        welcomeInput.value = '';
        welcomeInput.placeholder = `✓ ${detection.label} Aktif`;
      }
      const welcomeStatus = document.getElementById('welcome-key-status-label');
      if (welcomeStatus) {
        welcomeStatus.textContent = `✓ Bağlandı: ${detection.label}`;
      }

      const btnDisconnect = document.getElementById('btn-disconnect-ai-key');
      if (btnDisconnect) btnDisconnect.style.display = 'inline-block';

      const drawer = document.getElementById('ai-config-drawer');
      if (drawer) drawer.classList.remove('open');

      this.appendMsg('bot', `✓ Tek API Anahtarı ile Başarıyla Bağlandı!\n• Sağlayıcı: ${detection.label}\n• Model: ${this.model}\n• Güvenlik Durumu: Şifreli kasada koruma altında ✓\nDevuan Linux çekirdeği üzerinde otonom ajanınız hazır.`);
      Terminal.log(`[AI BAĞLANTI] ${detection.label} (${this.model}) bağlandı.`, 'success');
    },

    async disconnectKey() {
      this.activeKey = null;
      try {
        await TauriBridge.invoke('delete_ai_credential', { provider: this.provider });
      } catch (e) {}

      this.provider = 'ollama';
      this.model = 'qwen2.5:0.5b';
      this.endpoint = 'http://127.0.0.1:11434/api/generate';

      SafeStorage.setItem('ankora_ai_provider', 'ollama');
      SafeStorage.setItem('ankora_ai_model', 'qwen2.5:0.5b');
      SafeStorage.setItem('ankora_ai_endpoint', this.endpoint);

      this.updateBadges();

      const inputKey = document.getElementById('ai-cfg-key');
      if (inputKey) {
        inputKey.value = '';
        inputKey.placeholder = 'API Anahtarınızı yapıştırın (AIzaSy..., sk-..., gsk_...)';
      }

      const welcomeInput = document.getElementById('welcome-api-key-input');
      if (welcomeInput) {
        welcomeInput.value = '';
        welcomeInput.placeholder = 'API Anahtarı...';
      }
      const welcomeStatus = document.getElementById('welcome-key-status-label');
      if (welcomeStatus) {
        welcomeStatus.textContent = 'Tek API Anahtarıyla Bağlan (Gemini, Groq, OpenAI)';
      }

      const btnDisconnect = document.getElementById('btn-disconnect-ai-key');
      if (btnDisconnect) btnDisconnect.style.display = 'none';

      this.appendMsg('bot', 'API anahtarı kaldırıldı. Sistem çevrimdışı yerel Ollama / kural tabanlı teftiş moduna döndü.');
      Terminal.log('[AI BAĞLANTI] API anahtarı temizlendi, yerel moda dönüldü.', 'cmd');
    },

    init() {
      this.feed = document.getElementById('ai-feed');
      this.input = document.getElementById('ai-prompt-input');
      this.miniFeed = document.getElementById('ai-mini-feed');
      const btnSend = document.getElementById('btn-ai-submit');
      const quickBtns = document.querySelectorAll('.ai-tag-btn');

      // 1. Kaydedilmiş API & Ajan Tercihlerini Yükle
      this.provider = SafeStorage.getItem('ankora_ai_provider') || 'ollama';
      this.mode = SafeStorage.getItem('ankora_ai_mode') || 'sysadmin';
      this.model = SafeStorage.getItem('ankora_ai_model') || (this.provider === 'ollama' ? 'qwen2.5:0.5b' : 'gemini-2.0-flash');
      this.endpoint = SafeStorage.getItem('ankora_ai_endpoint') || 'http://127.0.0.1:11434/api/generate';
      this.includeTelemetry = SafeStorage.getItem('ankora_ai_ctx') !== '0';
      this.activeKey = null;
      SafeStorage.removeItem('ankora_ai_key');

      const inputKey = document.getElementById('ai-cfg-key');
      const btnDisconnect = document.getElementById('btn-disconnect-ai-key');
      const modeSelect = document.getElementById('ai-mode-select');
      const provSelect = document.getElementById('ai-provider-select');
      const ctxToggle = document.getElementById('ai-ctx-toggle');
      const btnExport = document.getElementById('btn-ai-export');

      if (modeSelect) {
        modeSelect.value = this.mode;
        modeSelect.addEventListener('change', () => {
          this.mode = modeSelect.value || 'sysadmin';
          SafeStorage.setItem('ankora_ai_mode', this.mode);
          this.updateBadges();
        });
      }

      if (provSelect) {
        provSelect.value = this.provider === 'ollama' ? 'ollama' : 'auto';
        provSelect.addEventListener('change', () => {
          if (provSelect.value === 'ollama') {
            this.provider = 'ollama';
            this.model = 'qwen2.5:0.5b';
            this.endpoint = 'http://127.0.0.1:11434/api/generate';
            SafeStorage.setItem('ankora_ai_provider', 'ollama');
            this.updateBadges();
          }
        });
      }

      if (ctxToggle) {
        ctxToggle.checked = this.includeTelemetry;
        ctxToggle.addEventListener('change', () => {
          this.includeTelemetry = Boolean(ctxToggle.checked);
          SafeStorage.setItem('ankora_ai_ctx', this.includeTelemetry ? '1' : '0');
        });
      }

      // Ekranı İzle: kullanıcı talep ederse her sorudan önce kare alınır
      const screenToggle = document.getElementById('ai-screen-toggle');
      if (screenToggle) {
        this.watchScreen = SafeStorage.getItem('ankora_ai_watch') === '1';
        screenToggle.checked = this.watchScreen;
        screenToggle.addEventListener('change', () => {
          this.watchScreen = Boolean(screenToggle.checked);
          SafeStorage.setItem('ankora_ai_watch', this.watchScreen ? '1' : '0');
          if (typeof window.syncAiMiniWatch === 'function') window.syncAiMiniWatch();
          if (this.watchScreen) {
            this.appendMsg('bot', 'Ekran izleme açıldı. Bundan sonra her soruda ekran karesi alınır ve bulut modeline gönderilir; kimseyle paylaşılırken önden ayrıca onay istenmez. Yerel Ollama metin modeli görüntüyü işleyemez.');
          }
        });
      }

      // Mini balon İzle düğmesini kayıttan başlat
      this.watchScreen = SafeStorage.getItem('ankora_ai_watch') === '1';
      if (typeof window.syncAiMiniWatch === 'function') window.syncAiMiniWatch();

      if (btnExport) {
        btnExport.addEventListener('click', () => this.exportReport());
      }

      // Backend güvenli depoda anahtar kontrolü
      TauriBridge.invoke('has_ai_credential', { provider: this.provider }).then(hasKey => {
        if (hasKey) {
          if (inputKey) inputKey.placeholder = `•••••••• (${this.provider.toUpperCase()} Aktif)`;
          if (btnDisconnect) btnDisconnect.style.display = 'inline-block';
          const welcomeStatus = document.getElementById('welcome-key-status-label');
          if (welcomeStatus) welcomeStatus.textContent = `✓ Bağlı: ${this.provider.toUpperCase()} (${this.model})`;
        }
      }).catch(() => {});

      this.updateBadges();

      // 2. Yapılandırma Paneli (Drawer) Açma/Kapama
      const btnToggleConfig = document.getElementById('btn-toggle-ai-config');
      const drawer = document.getElementById('ai-config-drawer');
      if (btnToggleConfig && drawer) {
        btnToggleConfig.addEventListener('click', () => {
          drawer.classList.toggle('open');
        });
      }

      // 3. API Anahtarı Göster / Gizle Toggle Butonu
      const btnToggleKey = document.getElementById('btn-toggle-key-view');
      if (btnToggleKey && inputKey) {
        btnToggleKey.addEventListener('click', () => {
          inputKey.type = inputKey.type === 'password' ? 'text' : 'password';
        });
      }

      // 4. Tek Tıkla API Anahtarı Kaydetme
      const btnSaveCfg = document.getElementById('btn-save-ai-cfg');
      if (btnSaveCfg && inputKey) {
        btnSaveCfg.addEventListener('click', () => {
          const val = inputKey.value.trim();
          const sel = provSelect ? provSelect.value : 'auto';
          if ((val && !val.includes('••••')) || sel === 'ollama') {
            this.connectSingleKey(val);
          }
        });
        inputKey.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            const val = inputKey.value.trim();
            if (val && !val.includes('••••')) {
              this.connectSingleKey(val);
            }
          }
        });
      }

      // 5. Bağlantıyı Kes Butonu
      if (btnDisconnect) {
        btnDisconnect.addEventListener('click', () => {
          this.disconnectKey();
        });
      }

      if (btnSend && this.input) {
        btnSend.addEventListener('click', () => this.submit());
        this.input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') this.submit();
        });
      }

      const btnClearChat = document.getElementById('btn-ai-clear-chat');
      if (btnClearChat && this.feed) {
        btnClearChat.addEventListener('click', () => {
          this.history = [];
          this.feed.innerHTML = `
            <div class="ai-entry bot">
              <span class="ai-avatar" aria-hidden="true"><img src="logo.svg" alt=""></span>
              <div class="ai-body">
                <p>Geçmiş temizlendi. Yeni bir sorgu yazarak devam edebilirsin.</p>
              </div>
            </div>
          `;
          if (this.miniFeed) this.miniFeed.innerHTML = '';
          Terminal.log('[AI] Sohbet geçmişi ve DOM önbelleği temizlendi.', 'cmd');
        });
      }

      quickBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const q = btn.getAttribute('data-query');
          if (q) this.handleQuery(q);
        });
      });

      // Onay Modalı İşleyicileri
      const modal = document.getElementById('confirm-modal');
      const btnConfirm = document.getElementById('btn-modal-confirm');
      const btnCancel = document.getElementById('btn-modal-cancel');

      if (btnConfirm && modal) {
        btnConfirm.addEventListener('click', async () => {
          modal.classList.remove('open');
          if (this.pendingCommand) {
            const cmd = this.pendingCommand;
            const token = this.pendingToken || '';
            this.pendingCommand = null;
            this.pendingToken = null;
            this.appendMsg('user', `[ONAYLANDI]: ${cmd}`);

            try {
              const res = await TauriBridge.invoke('execute_agent_confirmed_action', { command: cmd, token: token });
              this.appendMsg('bot', `Sistem komutu başarıyla çalıştırıldı:\n\`\`\`\n${res || 'Tamamlandı.'}\n\`\`\``);
              Terminal.log(`[AI EXEC] ${cmd}: Başarılı`, 'success');
            } catch (err) {
              this.appendMsg('bot', `Komut yürütme hatası: ${err}`);
              Terminal.log(`[AI ERR] ${err}`, 'error');
            }
          }
        });
      }

      if (btnCancel && modal) {
        btnCancel.addEventListener('click', () => {
          modal.classList.remove('open');
          this.pendingCommand = null;
          this.pendingToken = null;
          this.appendMsg('bot', 'İşlem kullanıcı tarafından iptal edildi.');
        });
      }
    },

    updateBadges() {
      const badgeProv = document.getElementById('ai-current-provider-badge');
      const badgeMode = document.getElementById('ai-current-mode-badge');
      const ind = document.getElementById('ai-status-indicator');
      const modeSelect = document.getElementById('ai-mode-select');

      const provMap = {
        ollama: 'Ollama (Yerel)',
        openai: 'OpenAI (GPT)',
        gemini: 'Google Gemini',
        groq: 'Groq Cloud',
        openrouter: 'OpenRouter',
        custom: 'Özel API'
      };

      const modeMap = {
        sysadmin: 'Sistem Teftiş Ajanı',
        doctor: 'Sistem Doktoru',
        developer: 'Geliştirici Asistanı',
        general: 'Genel Sistem Asistanı'
      };

      if (badgeProv) badgeProv.textContent = provMap[this.provider] || this.provider.toUpperCase();
      const miniStatus = document.getElementById('ai-mini-status');
      if (miniStatus) miniStatus.textContent = provMap[this.provider] || this.provider.toUpperCase();
      if (badgeMode) {
        badgeMode.innerHTML = `<svg class="btn-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:12px;height:12px;display:inline-block;vertical-align:-1px;margin-right:4px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>${escapeHtml(modeMap[this.mode] || this.mode)}`;
      }
      if (modeSelect && modeSelect.value !== this.mode) {
        modeSelect.value = this.mode;
      }
      if (ind) {
        ind.textContent = 'Bağlı / Hazır';
        ind.className = 'status-pill online';
      }
    },

    submit() {
      if (!this.input) return;
      const text = this.input.value.trim();
      if (!text) return;
      this.input.value = '';
      this.handleQuery(text);
    },

    appendMsg(role, text) {
      if (!this.feed) return null;

      // DOM mesaj sayısını 30 ile sınırla (RAM tasarrufu)
      while (this.feed.children.length >= 30) {
        this.feed.removeChild(this.feed.firstChild);
      }

      const rawText = String(text ?? '');
      this.history.push({ role, text: rawText, ts: new Date().toISOString() });
      if (this.history.length > 40) this.history.shift();

      const entry = document.createElement('div');
      entry.className = `ai-entry ${role === 'user' ? 'user' : 'bot'}`;

      if (role !== 'user') {
        const avatar = document.createElement('span');
        avatar.className = 'ai-avatar';
        avatar.setAttribute('aria-hidden', 'true');
        const logo = document.createElement('img');
        logo.src = 'logo.svg';
        logo.alt = '';
        avatar.appendChild(logo);
        entry.appendChild(avatar);
      }

      const body = document.createElement('div');
      body.className = 'ai-body';

      const header = document.createElement('div');
      header.className = 'ai-msg-header';

      const author = document.createElement('span');
      author.className = 'ai-author';
      author.textContent = role === 'user' ? 'Kullanıcı' : 'Ankora AI';
      header.appendChild(author);

      if (role === 'bot' && rawText.length > 0 && !rawText.startsWith('Ajan düşünülüyor')) {
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'ai-copy-btn';
        copyBtn.textContent = 'Kopyala';
        copyBtn.addEventListener('click', () => {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(rawText).then(() => {
              copyBtn.textContent = 'Kopyalandı';
              setTimeout(() => { copyBtn.textContent = 'Kopyala'; }, 1500);
            }).catch(() => {});
          }
        });
        header.appendChild(copyBtn);
      }

      body.appendChild(header);

      // Güvenli kod bloğu ayrıştırma (yalnız textContent kullanılır, XSS riski sıfır)
      const segments = rawText.split(/```([\s\S]*?)```/g);
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (!seg) continue;
        if (i % 2 === 1) {
          const pre = document.createElement('pre');
          pre.className = 'ai-code-block';
          pre.textContent = seg.replace(/^[a-zA-Z0-9_-]+\n/, '').trim();
          body.appendChild(pre);
        } else {
          const p = document.createElement('p');
          p.style.whiteSpace = 'pre-wrap';
          p.textContent = seg.trim();
          body.appendChild(p);
        }
      }

      entry.appendChild(body);

      this.feed.appendChild(entry);
      this.feed.scrollTop = this.feed.scrollHeight;

      // Mini sohbet yansıması: yükleniyor göstergesi yansıtılmaz
      if (!rawText.startsWith('Ajan düşünülüyor') && entry.querySelector('.ai-typing') === null) {
        this.mirror(role, rawText);
      }
      return entry;
    },

    mirror(role, text) {
      if (!this.miniFeed) return;
      while (this.miniFeed.children.length >= 20) {
        this.miniFeed.removeChild(this.miniFeed.firstChild);
      }
      const el = document.createElement('div');
      el.className = `ai-mini-entry ${role === 'user' ? 'm-user' : 'm-bot'}`;
      el.textContent = String(text ?? '');
      this.miniFeed.appendChild(el);
      this.miniFeed.scrollTop = this.miniFeed.scrollHeight;
    },

    mirrorInfo(text) {
      if (!this.miniFeed) return;
      const el = document.createElement('div');
      el.className = 'ai-mini-entry m-info';
      el.textContent = String(text ?? '');
      this.miniFeed.appendChild(el);
      this.miniFeed.scrollTop = this.miniFeed.scrollHeight;
    },

    showTyping() {
      if (!this.feed) return null;
      const entry = document.createElement('div');
      entry.className = 'ai-entry bot';
      const avatar = document.createElement('span');
      avatar.className = 'ai-avatar';
      avatar.setAttribute('aria-hidden', 'true');
      const logo = document.createElement('img');
      logo.src = 'logo.svg';
      logo.alt = '';
      avatar.appendChild(logo);
      const body = document.createElement('div');
      body.className = 'ai-body';
      const bubble = document.createElement('div');
      bubble.className = 'ai-typing';
      bubble.setAttribute('aria-label', 'Ajan yanıt hazırlıyor');
      for (let i = 0; i < 3; i++) bubble.appendChild(document.createElement('i'));
      body.appendChild(bubble);
      entry.appendChild(avatar);
      entry.appendChild(body);
      this.feed.appendChild(entry);
      this.feed.scrollTop = this.feed.scrollHeight;
      return entry;
    },

    appendShot(b64) {
      if (!this.feed || !b64) return;
      const chip = document.createElement('div');
      chip.className = 'ai-shot-chip';
      const img = document.createElement('img');
      img.src = `data:image/png;base64,${b64}`;
      img.alt = 'Ajanın gördüğü ekran karesi';
      const label = document.createElement('span');
      label.textContent = 'Ekran karesi ajana gönderildi';
      chip.appendChild(img);
      chip.appendChild(label);
      this.feed.appendChild(chip);
      this.feed.scrollTop = this.feed.scrollHeight;
    },

    async exportReport() {
      const lines = [
        `# Ankora AI Sistem Asistanı — Oturum ve Teşhis Raporu`,
        `- Tarih: ${new Date().toISOString()}`,
        `- Sağlayıcı: ${this.provider} (${this.model})`,
        `- Ajan Modu: ${this.mode}`,
        ``
      ];
      try {
        const tele = await TauriBridge.invoke('get_system_telemetry');
        if (tele) {
          lines.push(`## Canlı Sistem Telemetrisi`);
          lines.push(`- İşletim Sistemi: ${tele.os_name}`);
          lines.push(`- Çekirdek: ${tele.kernel}`);
          lines.push(`- İnit: ${tele.init_system}`);
          lines.push(`- Bellek: ${tele.memory_used_mb} / ${tele.memory_total_mb} MB`);
          lines.push(`- CPU Çekirdek: ${tele.cpu_cores}`);
          lines.push(``);
        }
      } catch (e) {}

      lines.push(`## Sohbet ve Teşhis Geçmişi`);
      for (const item of this.history) {
        lines.push(`### ${item.role === 'user' ? 'Kullanıcı' : 'Ankora AI'} (${item.ts})`);
        lines.push(item.text);
        lines.push(``);
      }

      const content = lines.join('\n');
      try {
        const dirs = await TauriBridge.invoke('get_xdg_user_dirs');
        const target = `${(dirs && dirs.desktop) ? dirs.desktop : '/home/ankora/Masaüstü'}/ankora-ai-rapor.md`;
        await TauriBridge.invoke('write_text_file', { path: target, content });
        this.appendMsg('bot', `Rapor masaüstüne kaydedildi: ${target}`);
        return;
      } catch (e) {}

      try {
        const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ankora-ai-rapor.md';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {}
    },

    parseActionDirective(rawText) {
      const m = String(rawText || '').match(/<<<ACTION:([^|>]+)\|([^>]+)>>>/);
      if (!m) {
        return { reply: rawText, has_action: false, action_command: null, action_desc: null };
      }
      const cmd = m[1].trim();
      const desc = m[2].trim();
      const clean = String(rawText).replace(m[0], '').trim();
      return {
        reply: clean,
        has_action: true,
        action_command: cmd,
        action_desc: desc
      };
    },

    async handleQuery(text, options = {}) {
      const clean = String(text || '').trim();
      if (!clean) return;
      const display = String(options.displayText || clean);

      // Doğal dil çok adımlı plan: "X'i kur ve saat 05'te ..." gibi
      // istekler model yanıtından önce adım adım onay kartına dönüşür.
      if (!options.skipPlan) {
        const plan = this.buildPlan(clean);
        if (plan) {
          this.appendMsg('user', display);
          this.renderPlanCard(plan);
          return;
        }
      }

      // Yerel TODO komutu: "TODO'ya süt al ekle", "görev ekle: raporu bitir".
      // Model çağrısı yapılmaz; görev listesine doğrudan yazılır.
      if (!options.skipPlan) {
        const todoReply = this.tryAddTodo(clean);
        if (todoReply) {
          this.appendMsg('user', display);
          this.appendMsg('bot', todoReply);
          return;
        }
      }

      this.appendMsg('user', display);
      const loadingEntry = this.showTyping();

      let res = null;
      let teleContext = '';
      if (this.includeTelemetry) {
        try {
          const t = await TauriBridge.invoke('get_system_telemetry');
          if (t) {
            teleContext = `[Sistem: ${t.os_name} | Kernel: ${t.kernel} | Init: ${t.init_system} | RAM: ${t.memory_used_mb}/${t.memory_total_mb} MB | CPU: ${t.cpu_cores} çekirdek]`;
          }
        } catch (e) {}
      }

      // Ekran izleme: kullanıcı açıktıysa son kare alınır ve yalnızca
      // görüntü işleyebilen bulut modellerine gönderilir.
      // Yerel Ollama yolu metin modeliyle sınırlıdır.
      let shotB64 = null;
      if (this.watchScreen || options.forceShot) {
        if (options.forceShot && !this.watchScreen) window.flashAiWatchWave?.();
        try {
          const shot = await TauriBridge.invoke('take_screenshot', {
            mode: 'fullscreen',
            delay: 0,
            save_to_disk: false,
            copy_clipboard: false
          });
          if (shot && shot.image_b64) {
            shotB64 = shot.image_b64;
            this.appendShot(shot.image_b64);
          } else {
            throw new Error(shot ? 'görüntü verisi boş döndü' : 'yanıt boş');
          }
        } catch (shotErr) {
          if (loadingEntry && loadingEntry.parentNode) loadingEntry.parentNode.removeChild(loadingEntry);
          this.appendMsg('bot', `⚠ Ekran görüntüsü alınamadı: ${shotErr}\nEkran yakalama aracını (scrot) ve X11 oturumunu kontrol edin.`);
          return;
        }
        if (!this.activeKey && !['openai', 'gemini', 'openrouter'].includes(this.provider)) {
          this.appendMsg('bot', 'Not: Ekran izleme, görüntüyü işleyebilen bulut sağlayıcıya (Gemini, OpenAI, OpenRouter) API anahtarıyla bağlanınca çalışır. Yerel Ollama yolu metin modeliyle sınırlıdır.');
        }
      }

      // Kuverler (Bağlantılar): GitHub/Gmail/Görev bağı etkinse bağlam toplanır.
      let linkContext = '';
      if (LinksManager) {
        try { linkContext = await LinksManager.contextFor(text); } catch (e) {}
      }

      // 1. Eğer Tauri mevcutsa yerel arka uç üzerinden güvenli istek dene
      if (TauriBridge.isAvailable) {
        try {
          res = await TauriBridge.invoke('query_local_ai', {
            prompt: `${linkContext}\n\n${text}`.trim(),
            provider: this.provider,
            endpoint: this.endpoint,
            apiKey: this.activeKey || '',
            model: this.model,
            agentMode: this.mode
          });
        } catch (invokeErr) {
          // Tauri arka uçta hata alındıysa ve kullanıcı anahtarı varsa aşağıda doğrudan API'yi dene
          if (!this.activeKey) {
            if (loadingEntry && loadingEntry.parentNode) loadingEntry.parentNode.removeChild(loadingEntry);
            this.appendMsg('bot', `⚠ Ajan Bağlantı Hatası:\n${invokeErr}`);
            return;
          }
        }
      }

      // 2. Doğrudan Canlı Web / API Çağrısı (Kullanıcı Anahtarı Bağlandığında %100 Gerçek Çalışma)
      if (!res && this.activeKey) {
        const key = this.activeKey.trim();
        const prov = this.provider.toLowerCase();
        const sysPromptBase = this.mode === 'developer'
          ? 'Sen Ankora Linux 3.6 ortamında çalışan kıdemli bir Rust, Linux ve Tauri geliştiricisisin.'
          : (this.mode === 'doctor'
            ? 'Sen Ankora Sistem Doktorusun. Devuan Daedalus (SysVinit) üzerinde bellek, disk, ZRAM, süreç ve güvenlik sorunlarını teşhis edip çözüm sunarsın.'
            : 'Sen Ankora Linux 3.6 (Daedalus / SysVinit) sistem yöneticisi ve yapay zeka asistanısın. Kullanıcıya Türkçe, net ve teknik olarak kusursuz yanıtlar ver.');
        const fullSysPrompt = `${sysPromptBase}\n${teleContext}\n${shotB64 ? '[Kullanıcı güncel bir ekran karesi paylaştı; soruyu görüntüyle birlikte değerlendir.]' : ''}\n${linkContext}\nEğer güvenli bir tanı komutu önermek istersen yanıtın sonuna <<<ACTION:komut|açıklama>>> ekle (Yalnızca: df -h /, free -h, uname -a, uptime, swapon --show, ip -br addr, lscpu, lsblk, ps aux, /usr/local/bin/ankora-doctor).`;

        try {
          if (prov === 'groq' && shotB64) {
            this.mirrorInfo('Not: Groq metin modeli görüntü işleyemez; soru metin olarak gönderildi.');
          }
          if (prov === 'gemini') {
            const aiModel = this.model || 'gemini-2.0-flash';
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent`;

            const resp = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': key
              },
              body: JSON.stringify({
                contents: [{
                  parts: shotB64
                    ? [
                        { text: `${fullSysPrompt}\n\nKullanıcı: ${text}` },
                        { inline_data: { mime_type: 'image/png', data: shotB64 } }
                      ]
                    : [{ text: `${fullSysPrompt}\n\nKullanıcı: ${text}` }]
                }]
              })
            });

            if (!resp.ok) {
              const errTxt = await resp.text();
              throw new Error(`Google Gemini Hatası (HTTP ${resp.status}): ${errTxt}`);
            }

            const json = await resp.json();
            const replyTxt = json.candidates?.[0]?.content?.parts?.[0]?.text || 'Gemini yanıtı alınamadı.';
            res = this.parseActionDirective(replyTxt);

          } else if (prov === 'groq') {
            const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
              },
              body: JSON.stringify({
                model: this.model || 'llama-3.3-70b-versatile',
                messages: [
                  { role: 'system', content: fullSysPrompt },
                  { role: 'user', content: text }
                ],
                temperature: 0.3
              })
            });
            if (!resp.ok) throw new Error(`Groq API Hatası (HTTP ${resp.status})`);
            const json = await resp.json();
            res = this.parseActionDirective(json.choices?.[0]?.message?.content || '');

          } else if (prov === 'openai') {
            const userMsg = shotB64
              ? [
                  { type: 'text', text },
                  { type: 'image_url', image_url: { url: `data:image/png;base64,${shotB64}` } }
                ]
              : text;
            const resp = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
              },
              body: JSON.stringify({
                model: this.model || 'gpt-4o-mini',
                messages: [
                  { role: 'system', content: fullSysPrompt },
                  { role: 'user', content: userMsg }
                ],
                temperature: 0.3
              })
            });
            if (!resp.ok) throw new Error(`OpenAI API Hatası (HTTP ${resp.status})`);
            const json = await resp.json();
            res = this.parseActionDirective(json.choices?.[0]?.message?.content || '');

          } else if (prov === 'openrouter') {
            const userMsg = shotB64
              ? [
                  { type: 'text', text },
                  { type: 'image_url', image_url: { url: `data:image/png;base64,${shotB64}` } }
                ]
              : text;
            const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
              },
              body: JSON.stringify({
                model: this.model || 'meta-llama/llama-3.3-70b-instruct',
                messages: [
                  { role: 'system', content: fullSysPrompt },
                  { role: 'user', content: userMsg }
                ]
              })
            });
            if (!resp.ok) throw new Error(`OpenRouter API Hatası (HTTP ${resp.status})`);
            const json = await resp.json();
            res = this.parseActionDirective(json.choices?.[0]?.message?.content || '');
          }
        } catch (fetchErr) {
          if (loadingEntry && loadingEntry.parentNode) loadingEntry.parentNode.removeChild(loadingEntry);
          this.appendMsg('bot', `⚠ Canlı API Servis Hatası:\n${fetchErr.message || fetchErr}\n\nLütfen API anahtarınızın kotasını ve model parametrelerini kontrol edin.`);
          return;
        }
      }

      // 3. Fallback yanıtı (anahtar yoksa veya çevrimdışıysa)
      if (!res) {
        res = await TauriBridge.fallback('query_local_ai', {
          prompt: text,
          provider: this.provider,
          model: this.model,
          agent_mode: this.mode,
          api_key: this.activeKey || ''
        });
      }

      if (loadingEntry && loadingEntry.parentNode) {
        loadingEntry.parentNode.removeChild(loadingEntry);
      }

      if (res) {
        this.appendMsg('bot', res.reply);
        if (res.has_action && res.action_command) {
          this.renderActionCard(res.action_command, res.action_desc, res.action_token);
        }
        // Tarayıcı kuveri: yanıt hemen altına "web'de ara" çipi.
        if (LinksManager.state.browser) this.appendBrowserChip(text);
      }
    },

    appendBrowserChip(query) {
      if (!this.feed || !query) return;
      const chip = document.createElement('button');
      chip.className = 'ai-browser-chip';
      chip.type = 'button';
      chip.textContent = 'Tarayıcıda Ara';
      chip.addEventListener('click', () => {
        try {
          WindowManager.open('win-browser');
          BrowserManager.navigate(`https://duckduckgo.com/?q=${encodeURIComponent(query.slice(0, 300))}`);
          ReportManager?.showToast('Sorgu tarayıcıda açılıyor...');
        } catch (e) {
          ReportManager?.showToast(`Tarayıcı açılamadı: ${e.message || e}`, 'error');
        }
      });
      this.feed.appendChild(chip);
      this.feed.scrollTop = this.feed.scrollHeight;
    },

    renderActionCard(command, desc, token) {
      if (!this.feed) return;
      const card = document.createElement('div');
      card.className = 'action-proposal-card';

      const strong = document.createElement('strong');
      strong.textContent = '⚠ Sistem Eylemi Yetkisi Gerekiyor:';

      const span = document.createElement('span');
      span.textContent = desc || 'Aşağıdaki sistem komutu yürütülecek:';

      const code = document.createElement('code');
      code.textContent = command;

      const btn = document.createElement('button');
      btn.className = 'btn-pkg';
      btn.style.cssText = 'align-self: flex-start; margin-top: 4px; background: var(--text-primary); color: var(--bg-deep);';
      btn.textContent = 'Onayla ve Çalıştır';
      btn.addEventListener('click', () => {
        this.promptSecurityConfirm(command, desc, token);
      });

      card.appendChild(strong);
      card.appendChild(span);
      card.appendChild(code);
      card.appendChild(btn);

      this.feed.appendChild(card);
      this.feed.scrollTop = this.feed.scrollHeight;
    },

    // Tek tuş "Bak ve anlat": ekran karesini alıp ekrandaki hatayı/dialogu
    // açıklar. Ekranı İzle tercihini kalıcı açmaz; yalnız bu sorgu için
    // görüntü gönderir ve dalgalı çerçeveyi kısa süre gösterir.
    lookAndTell() {
      return this.handleQuery(
        'Şu anki ekranımda ne kaymıyor? Ekrandaki hata mesajını, uyarı penceresini veya terminal çıktısını açıkla; nedenini ve adım adım çözümünü Türkçe anlat.',
        { forceShot: true, flash: true, skipPlan: true }
      );
    },

    // "TODO'ya X ekle" / "görev ekle: X" kalıbını yerelde yakalar.
    // Zaman verilmişse görev saatine göre bugüne (geçtiyse yarına) yazılır.
    tryAddTodo(text) {
      const t = String(text || '').trim();
      if (!t) return null;
      if (!/(todo|yapılacak|görev)/i.test(t)) return null;
      if (!/\bekle\b/i.test(t)) return null;

      let label = t
        .replace(/\b(todo|yapılacaklar|yapılacak|görevler|görev)(?:'?[a-zçğıöşü]+)?\b/gi, ' ')
        .replace(/\b(listesine|listeme|listesini|listemize|listeye)\b/gi, ' ')
        .replace(/\bekle\b/gi, ' ')
        .replace(/^[\s,:;\-–]+|[\s,:;\-–]+$/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (!label || label.length < 2) return null;

      const now = new Date();
      let at = null;
      const withTime = label.match(/(?:saat\s*)?\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/i);
      if (withTime) {
        const hh = parseInt(withTime[1], 10);
        const mm = parseInt(withTime[2], 10);
        at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
        if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
        const cleaned = label.replace(withTime[0], '').replace(/^[\s,:;\-–]+|[\s,:;\-–]+$/g, '').trim();
        if (cleaned) label = cleaned;
      }

      const prefix = at
        ? `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')} · `
        : '';
      const entry = { t: `${prefix}${label}`, done: false };
      if (at) entry.at = at.toISOString();

      if (typeof WidgetManager !== 'undefined' && WidgetManager.todoLoad) {
        const items = WidgetManager.todoLoad();
        items.push(entry);
        WidgetManager.todoSave(items);
        if (WidgetManager.todoRender) WidgetManager.todoRender();
      } else {
        try {
          const items = JSON.parse(SafeStorage.getItem('ankora_todo_items') || '[]') || [];
          items.push(entry);
          SafeStorage.setItem('ankora_todo_items', JSON.stringify(items.slice(0, 30)));
        } catch (e) {}
      }
      if (typeof window.refreshDayPlan === 'function') window.refreshDayPlan();
      return at
        ? `${label} görevi ${prefix.trim().replace(' ·', '')} için yapılacaklara eklendi.`
        : `${label} yapılacaklara eklendi.`;
    },

    // Doğal dil planı: yalnız "kur/yükle" + ikinci bir adım (zaman, ve, sonra)
    // birlikte geldiğinde devreye girer. Tek komutlar normal ajana gider.
    buildPlan(text) {
      const raw = String(text || '').trim();
      const t = raw.toLowerCase();
      if (!t || raw.length > 400) return null;
      const hasInstall = /\b(kur|kurar|yükle|yükler|kurmak)\b/.test(t);
      if (!hasInstall) return null;

      const clauses = raw.split(/\bve\b|\bsonra\b|\bardından\b|,|;/i);
      const steps = [];
      const seenPkgs = new Set();

      clauses.forEach((clause) => {
        if (!/\b(kur|kurar|yükle|yükler|kurmak)\b/i.test(clause)) return;
        if (typeof StoreManager === 'undefined' || !Array.isArray(StoreManager.packages)) return;
        const m = clause.match(/([A-Za-zÇĞİÖŞÜçğıöşü0-9][A-Za-zÇĞİÖŞÜçğıöşü0-9 .&+-]{0,30}?)(?:['’][A-Za-zÇĞİÖŞÜçğıöşü]+)?\s*(?:kur|yükle)/i);
        const target = m ? m[1].trim().toLowerCase()
          .replace(/\b(uygulamasını|uygulamasini|programını|programini|paketini)\b/g, '')
          .trim() : '';
        if (!target) return;
        const pkg = StoreManager.packages.find((p) => {
          if (!p.flatpak && !p.deb && p.action !== 'meb-cert') return false;
          const n = p.name.toLowerCase();
          return n.startsWith(target) || n.includes(target)
            || p.id === target
            || (p.deb && p.deb.toLowerCase() === target)
            || (p.flatpak && p.flatpak.toLowerCase() === target);
        });
        if (pkg && seenPkgs.has(pkg.id)) return;
        if (pkg) seenPkgs.add(pkg.id);
        steps.push({
          kind: 'install',
          title: pkg ? `${pkg.name} kurulumu` : `"${m[1].trim()}" kurulumu`,
          detail: pkg
            ? (pkg.action === 'meb-cert'
                ? 'Sistem sertifikası · MEB'
                : (pkg.flatpak ? `Flatpak · ${pkg.flatpak}` : `APT · ${pkg.deb || pkg.id}`))
            : 'Mağazada eşleşen paket bulunamadı',
          pkg: pkg || null,
          ready: Boolean(pkg)
        });
      });

      // Zaman: "05:00", "05.00", "05'te", "saat 5"
      const timeMatch =
        raw.match(/\b(?:saat\s*)?([01]?\d|2[0-3])\s*[:.]\s*([0-5]\d)\b/) ||
        raw.match(/\b([01]?\d|2[0-3])\s*['’]\s*te\b/i) ||
        raw.match(/\bsaat\s*([01]?\d|2[0-3])\b/i);
      if (timeMatch) {
        const hh = parseInt(timeMatch[1], 10);
        const mm = parseInt(timeMatch[2] || '0', 10);
        let label = raw.slice((timeMatch.index || 0) + timeMatch[0].length);
        label = label
          .replace(/\b(bana\s+)?(söyle|soyle|bildir|haber\s+ver)\b/gi, '')
          .replace(/\b(yapıp|yapip|yap|etsin|et)\b/gi, '')
          .replace(/^[\s,.;:]+|[\s,.;:]+$/g, '')
          .trim();
        if (!label) label = 'Planlı hatırlatma';
        steps.push({
          kind: 'remind',
          title: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} hatırlatıcısı`,
          detail: label,
          when: { hh, mm },
          ready: true
        });
      }

      if (steps.length < 2) return null;
      return { text: raw, steps };
    },

    renderPlanCard(plan) {
      if (!this.feed || !plan) return;

      // Plan kartı tam sohbet akışında yaşar; mini balondan tetiklendiyse
      // kullanıcı adımları görebilsin diye AI penceresi açılır.
      const aiWin = document.getElementById('win-ai');
      if (!aiWin || !aiWin.classList.contains('open')) {
        if (typeof WindowManager !== 'undefined' && WindowManager.open) {
          WindowManager.open('win-ai');
        }
        if (typeof window.toggleAiMiniChat === 'function') window.toggleAiMiniChat(false);
      }

      const card = document.createElement('div');
      card.className = 'ai-plan-card';

      const title = document.createElement('strong');
      title.textContent = `Çok adımlı plan · ${plan.steps.length} adım`;
      const hint = document.createElement('span');
      hint.className = 'ai-plan-hint';
      hint.textContent = 'Her adımı ayrı onayla; sıradaki adım ancak önceki bitince açılır.';
      card.appendChild(title);
      card.appendChild(hint);

      const rows = [];
      plan.steps.forEach((step, idx) => {
        const row = document.createElement('div');
        row.className = 'ai-plan-step' + (step.ready ? '' : ' disabled');

        const num = document.createElement('span');
        num.className = 'ai-plan-num';
        num.textContent = String(idx + 1);

        const body = document.createElement('div');
        body.className = 'ai-plan-body';
        const name = document.createElement('span');
        name.className = 'ai-plan-title';
        name.textContent = step.title;
        const detail = document.createElement('span');
        detail.className = 'ai-plan-detail';
        detail.textContent = step.detail;
        body.appendChild(name);
        body.appendChild(detail);

        const status = document.createElement('span');
        status.className = 'ai-plan-status';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-pkg ai-plan-approve';
        btn.textContent = 'Onayla';
        btn.disabled = true;

        row.appendChild(num);
        row.appendChild(body);
        row.appendChild(status);
        row.appendChild(btn);
        card.appendChild(row);
        rows.push({ row, btn, status, step });
      });

      this.feed.appendChild(card);
      this.feed.scrollTop = this.feed.scrollHeight;

      const unlock = (start = 0) => {
        for (let i = start; i < rows.length; i++) {
          if (rows[i].btn.dataset.done === '1') continue;
          rows[i].btn.disabled = !rows[i].step.ready;
          return;
        }
      };
      unlock(0);

      rows.forEach((entry, idx) => {
        entry.btn.addEventListener('click', async () => {
          if (entry.btn.dataset.done === '1') return;
          entry.btn.disabled = true;
          entry.btn.textContent = 'Çalışıyor...';
          try {
            const msg = await this.executePlanStep(entry.step);
            entry.btn.dataset.done = '1';
            entry.btn.textContent = '✓ Tamam';
            entry.row.classList.add('done');
            entry.status.textContent = msg;
            this.mirrorInfo(`✓ ${entry.step.title}: ${msg}`);
            unlock(idx + 1);
          } catch (err) {
            entry.btn.disabled = false;
            entry.btn.textContent = 'Yeniden Dene';
            entry.status.textContent = `Hata: ${err.message || err}`;
            this.mirrorInfo(`✕ ${entry.step.title}: ${err.message || err}`);
          }
        });
      });

      this.mirrorInfo(`Plan hazır: ${plan.steps.map(s => s.title).join(' → ')}`);
    },

    async executePlanStep(step) {
      if (step.kind === 'install') {
        if (!step.pkg) throw new Error('Mağazada eşleşen paket yok');
        if (step.pkg.installed) return 'zaten kurulu';
        if (typeof StoreManager === 'undefined' || !StoreManager.togglePackage) {
          throw new Error('Mağaza yöneticisi kullanılamıyor');
        }
        await StoreManager.togglePackage(step.pkg);
        if (!step.pkg.installed) throw new Error('kurulum tamamlanmadı');
        if (typeof StoreManager.saveInstalledState === 'function') StoreManager.saveInstalledState();
        return 'kuruldu';
      }
      if (step.kind === 'remind') {
        return this.scheduleReminder(step.when, step.detail);
      }
      return 'atlandı';
    },

    scheduleReminder(when, label) {
      const now = new Date();
      const hh = when && Number.isFinite(when.hh) ? when.hh : 9;
      const mm = when && Number.isFinite(when.mm) ? when.mm : 0;
      const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
      if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);

      const clock = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      const entry = {
        t: `${clock} · ${label}`,
        done: false,
        at: target.toISOString()
      };

      if (typeof WidgetManager !== 'undefined' && WidgetManager.todoLoad) {
        const items = WidgetManager.todoLoad();
        items.push(entry);
        WidgetManager.todoSave(items);
        if (WidgetManager.todoRender) WidgetManager.todoRender();
      } else {
        try {
          const items = JSON.parse(SafeStorage.getItem('ankora_todo_items') || '[]') || [];
          items.push(entry);
          SafeStorage.setItem('ankora_todo_items', JSON.stringify(items.slice(0, 30)));
        } catch (e) {}
      }
      if (typeof window.refreshDayPlan === 'function') window.refreshDayPlan();

      const delay = target.getTime() - now.getTime();
      if (delay > 0 && delay <= 24 * 60 * 60 * 1000) {
        setTimeout(() => {
          ReportManager?.showToast(`⏰ Hatırlatıcı: ${label}`);
          this.appendMsg('bot', `⏰ Hatırlatıcı zamanı: ${label} (${clock})`);
          if (typeof window.refreshDayPlan === 'function') window.refreshDayPlan();
        }, delay);
      }
      return `${clock} için görev listesine eklendi`;
    },

    // Mini balona sürüklenen dosya: metin tabanlıysa içerik okunur ve
    // "özetle / XML'e çevir / düzenini düzelt" seçenekleri sunulur.
    bindFileDrop(el) {
      if (!el || el.dataset.dropBound === '1') return;
      el.dataset.dropBound = '1';
      let depth = 0;

      el.addEventListener('dragenter', (e) => {
        e.preventDefault();
        depth++;
        el.classList.add('drop-active');
        this.mirrorInfo('Dosyayı bırak: özetle, XML\'e çevir veya düzenini düzelt.');
      });
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      });
      el.addEventListener('dragleave', () => {
        depth = Math.max(0, depth - 1);
        if (depth === 0) el.classList.remove('drop-active');
      });
      el.addEventListener('drop', async (e) => {
        e.preventDefault();
        depth = 0;
        el.classList.remove('drop-active');
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!file) return;
        try {
          await this.handleDroppedFile(file);
        } catch (err) {
          this.mirrorInfo(`Dosya işlenemedi: ${err.message || err}`);
          ReportManager?.showToast(`Dosya işlenemedi: ${err.message || err}`, 'error');
        }
      });
    },

    async handleDroppedFile(file) {
      const name = file.name || 'dosya';
      const ext = (name.split('.').pop() || '').toLowerCase();
      const textExts = ['txt', 'md', 'xml', 'json', 'yaml', 'yml', 'ini', 'conf', 'log', 'js', 'css', 'html', 'htm', 'py', 'sh', 'csv', 'ts', 'rs'];
      if (!textExts.includes(ext)) {
        this.mirrorInfo(`${name}: yalnız metin dosyaları (${textExts.join(', ')}) özetlenebilir.`);
        ReportManager?.showToast('Bu dosya türü metin olarak okunamıyor.', 'error');
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        this.mirrorInfo(`${name}: dosya 2 MB'dan büyük, özet için çok büyük.`);
        return;
      }

      const text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Dosya okunamadı'));
        reader.readAsText(file);
      });

      const clipped = text.length > 14000 ? `${text.slice(0, 14000)}\n\n[... kısaltıldı ...]` : text;
      this.showFileActions(name, clipped, file.size);
      this.mirrorInfo(`📄 ${name} hazır · ${Math.max(1, Math.round(file.size / 1024))} KB`);
    },

    showFileActions(name, content, size) {
      if (!this.miniFeed) return;
      const card = document.createElement('div');
      card.className = 'ai-mini-file-card';
      const head = document.createElement('span');
      head.className = 'ai-mini-file-name';
      head.textContent = `📄 ${name} · ${Math.max(1, Math.round(size / 1024))} KB`;
      card.appendChild(head);

      const makePrompt = (instruction) => `Aşağıdaki dosyanın adı "${name}". ${instruction}\n\n\`\`\`\n${content}\n\`\`\``;
      const actions = [
        ['Özetle', 'İçeriğini Türkçe, kısa ve madde madde özetle.'],
        ["XML'e çevir", 'İçeriğin yapısını koruyarak geçerli ve okunaklı bir XML belgesine dönüştür. Yalnız XML çıktısı ver.'],
        ['Düzenini düzelt', 'Biçimlendirmesini/boşluklarını düzelt, hatalı yapıları düzenle ve düzeltilmiş tam metni ver.']
      ];
      const row = document.createElement('div');
      row.className = 'ai-mini-file-actions';
      actions.forEach(([label, instruction]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ai-mini-file-btn';
        btn.textContent = label;
        btn.addEventListener('click', () => {
          card.remove();
          this.handleQuery(makePrompt(instruction), {
            skipPlan: true,
            displayText: `📄 ${name} → ${label}`
          });
        });
        row.appendChild(btn);
      });
      card.appendChild(row);
      this.miniFeed.appendChild(card);
      this.miniFeed.scrollTop = this.miniFeed.scrollHeight;
    },

    promptSecurityConfirm(cmd, desc, token) {
      const modal = document.getElementById('confirm-modal');
      const cmdEl = document.getElementById('confirm-cmd');
      const descEl = document.getElementById('confirm-desc');

      if (!modal || !cmdEl) return;
      this.pendingCommand = cmd;
      this.pendingToken = token || null;
      cmdEl.textContent = cmd;
      if (descEl) descEl.textContent = desc || 'Aşağıdaki kabuk komutu çalıştırılacaktır:';
      modal.classList.add('open');
    }
  };

  // ============================================================================
  // 7. ANKORA KARŞILAYICI (WELCOME MANAGER - DESKTOP PREVIEW)
  // ============================================================================
  const WelcomeManager = {
    async init() {
      // 1. Tema Değiştirici (Sun / Moon Switch)
      const themeToggle = document.getElementById('welcome-theme-toggle');
      if (themeToggle) {
        themeToggle.addEventListener('click', () => {
          const isLight = document.body.classList.contains('theme-light');
          ThemeManager.setTheme(isLight ? 'theme-dark' : 'theme-light');
        });
      }

      // 2. Paket Yükleyici Butonu ("Yükle")
      const btnStore = document.getElementById('welcome-btn-store');
      if (btnStore) {
        btnStore.addEventListener('click', () => {
          WindowManager.open('win-store');
        });
      }

      // Sistem Yapılandırması Butonu ("Aç")
      const btnSettings = document.getElementById('welcome-btn-settings');
      if (btnSettings) {
        btnSettings.addEventListener('click', () => {
          WindowManager.open('win-settings');
        });
      }

      // 3. Tek API Anahtarı ile AI Bağlantısı ("Bağla")
      const inputKey = document.getElementById('welcome-api-key-input');
      const btnSaveKey = document.getElementById('welcome-btn-save-key');
      const statusLabel = document.getElementById('welcome-key-status-label');

      const triggerConnect = () => {
        if (!inputKey) return;
        const key = inputKey.value.trim();
        if (key && !key.includes('••••')) {
          AIAgent.connectSingleKey(key);
        } else if (!key) {
          if (statusLabel) {
            statusLabel.textContent = 'Lütfen geçerli bir API anahtarı girin.';
            setTimeout(() => {
              statusLabel.textContent = 'Tek API Anahtarıyla Bağlan (Gemini, Groq, OpenAI)';
            }, 3000);
          }
        }
      };

      if (btnSaveKey) {
        btnSaveKey.addEventListener('click', triggerConnect);
      }
      if (inputKey) {
        inputKey.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') triggerConnect();
        });
      }

      // 3.1 Kilit Ekranı PIN Ayarı (İlk Açılış)
      const inputLockPin = document.getElementById('welcome-lock-pin-input');
      const btnSaveLockPin = document.getElementById('welcome-btn-save-pin');
      const lockStatusLabel = document.getElementById('welcome-lock-status-label');

      const triggerSavePin = async () => {
        if (!inputLockPin) return;
        const pin = inputLockPin.value.trim();
        if (pin && pin.length >= 3) {
          const res = await LockManager.setPin(null, pin);
          if (res.success) {
            if (lockStatusLabel) {
              lockStatusLabel.textContent = `✓ Kilit PIN'i güncellendi (${pin.length} karakter)`;
              lockStatusLabel.style.color = '#10b981';
            }
            inputLockPin.value = '';
            inputLockPin.placeholder = '✓ Aktif';
            if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
              ReportManager.showToast("Kilit PIN'i güvenli kasaya kaydedildi!");
            }
          } else {
            alert(res.error || 'PIN kaydedilemedi.');
          }
        } else {
          alert('Lütfen en az 3 karakterden oluşan bir PIN veya parola girin.');
        }
      };

      if (btnSaveLockPin) btnSaveLockPin.addEventListener('click', triggerSavePin);
      if (inputLockPin) {
        inputLockPin.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') triggerSavePin();
        });
      }

      // 4. Terminal Butonu ("Aç")
      const btnTerm = document.getElementById('welcome-btn-term');
      if (btnTerm) {
        btnTerm.addEventListener('click', () => {
          WindowManager.open('win-terminal');
        });
      }

      // 5. Güncelleyici Butonu ("Denetle")
      const btnUpdate = document.getElementById('welcome-btn-update');
      if (btnUpdate) {
        btnUpdate.addEventListener('click', () => {
          WindowManager.open('win-updater');
          UpdaterManager.checkForUpdates();
        });
      }

      // 6. Başlangıçta Göster Checkbox'ı
      const chkStartup = document.getElementById('chk-show-on-startup');
      if (chkStartup) {
        const savedPref = SafeStorage.getItem('ankora_show_welcome_startup');
        if (savedPref !== null) {
          chkStartup.checked = savedPref === 'true';
        } else {
          chkStartup.checked = true;
        }
        chkStartup.addEventListener('change', async (e) => {
          SafeStorage.setItem('ankora_show_welcome_startup', e.target.checked ? 'true' : 'false');
          try {
            await TauriBridge.invoke('set_first_run_completed', { dontShowAgain: !e.target.checked });
          } catch (err) {}
        });
      }

      // 7. Gelişmiş Ayarlar Bağlantısı
      const btnAdvSettings = document.getElementById('btn-open-advanced-settings');
      if (btnAdvSettings) {
        btnAdvSettings.addEventListener('click', () => {
          WindowManager.open('win-settings');
        });
      }

      // 8. API Anahtar Durumunu Ekrana Yansıt
      try {
        const hasKey = await TauriBridge.invoke('has_ai_credential', { provider: AIAgent.provider });
        if (hasKey) {
          if (inputKey) inputKey.placeholder = `✓ ${AIAgent.provider.toUpperCase()} Aktif`;
          if (statusLabel) statusLabel.textContent = `✓ Bağlı: ${AIAgent.provider.toUpperCase()} (${AIAgent.model})`;
        }
      } catch (e) {}

      // 9. Masaüstü Açılışında Karşılayıcıyı Göster (Varsayılan olarak ilk açılışta açık)
      const savedWelcomePref = SafeStorage.getItem('ankora_show_welcome_startup');
      const shouldShow = savedWelcomePref === null || savedWelcomePref === 'true';
      if (shouldShow) {
        setTimeout(() => WindowManager.open('win-welcome'), 250);
      }
    }
  };

  // ============================================================================
  // 8. KURULUM ARACI (INSTALLER WIZARD)
  // ============================================================================
  const InstallerWizard = {
    selectedDisk: null,

    async init() {
      const step1Next = document.getElementById('btn-step1-next');
      const step2Prev = document.getElementById('btn-step2-prev');
      const step2Next = document.getElementById('btn-step2-next');
      const step3Prev = document.getElementById('btn-step3-prev');
      const btnStart = document.getElementById('btn-start-real-install');
      const btnReboot = document.getElementById('btn-installer-reboot');

      if (step1Next) step1Next.addEventListener('click', () => this.goToStep(2));
      if (step2Prev) step2Prev.addEventListener('click', () => this.goToStep(1));
      if (step2Next) step2Next.addEventListener('click', () => this.goToStep(3));
      if (step3Prev) step3Prev.addEventListener('click', () => this.goToStep(2));

      if (btnStart) {
        btnStart.addEventListener('click', () => this.runInstall());
      }

      if (btnReboot) {
        btnReboot.addEventListener('click', async () => {
          Terminal.log('[KURULUM] Sistem yeniden başlatılıyor...', 'cmd');
          try {
            await TauriBridge.invoke('system_reboot');
          } catch (e) {
            ReportManager.showToast(`Yeniden başlatılamadı: ${e.message || e}`);
          }
        });
      }

      await this.loadDisks();
    },

    async loadDisks() {
      const box = document.getElementById('disk-selection-box');
      if (!box) return;

      const step1Next = document.getElementById('btn-step1-next');

      try {
        const disks = await TauriBridge.invoke('get_storage_devices');
        box.innerHTML = '';

        if (!disks || disks.length === 0) {
          this.selectedDisk = null;
          box.innerHTML = `
            <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">
              ⚠️ Kurulum yapılabilecek uygun bir sabit disk veya depolama sürücüsü bulunamadı.<br>
              <span style="font-size: 11px; opacity: 0.7;">Canlı USB medyası koruma altındadır ve üzerine kurulum yapılamaz.</span>
            </div>
          `;
          if (step1Next) step1Next.disabled = true;
          return;
        }

        if (step1Next) step1Next.disabled = false;

        const existingValid = disks.some(d => d.path === this.selectedDisk);
        if (!existingValid && disks.length > 0) {
          this.selectedDisk = disks[0].path;
        }
        const activeDisk = this.selectedDisk;

        disks.forEach((d) => {
          const isActive = d.path === activeDisk;
          const card = document.createElement('div');
          card.className = `disk-card ${isActive ? 'active' : ''}`;
          card.innerHTML = `
            <div class="disk-meta">
              <strong>${escapeHtml(d.path)} — ${escapeHtml(d.model)}</strong>
              <span>Aygıt: ${escapeHtml(d.name)} | Boyut: ${escapeHtml(d.size_gb)} GB</span>
            </div>
            <div class="disk-capacity">${escapeHtml(d.size_gb)} GB</div>
          `;
          card.addEventListener('click', () => {
            document.querySelectorAll('.disk-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            this.selectedDisk = d.path;
            const sumDisk = document.getElementById('sum-disk');
            if (sumDisk) sumDisk.textContent = d.path;
          });
          box.appendChild(card);
        });
        const sumDisk = document.getElementById('sum-disk');
        if (sumDisk && this.selectedDisk) sumDisk.textContent = this.selectedDisk;
      } catch (e) {
        box.innerHTML = `<div style="padding: 20px; color: var(--danger, #ef4444); text-align: center;">Disk tarama hatası: ${escapeHtml(e.message || e)}</div>`;
        if (step1Next) step1Next.disabled = true;
      }
    },

    goToStep(num) {
      if (num === 2) {
        if (!this.selectedDisk) {
          alert('Lütfen kurulum yapılacak bir hedef disk seçin!');
          return;
        }
      }
      if (num === 3) {
        const u = document.getElementById('inst-username')?.value?.trim();
        const h = document.getElementById('inst-hostname')?.value?.trim() || 'ankora-pc';
        const p = document.getElementById('inst-password')?.value?.trim();
        if (!u || !p) {
          alert('Lütfen kullanıcı adı ve parola belirleyin!');
          return;
        }
        const sumDisk = document.getElementById('sum-disk');
        const sumUser = document.getElementById('sum-user');
        const sumHost = document.getElementById('sum-host');
        if (sumDisk) sumDisk.textContent = this.selectedDisk || 'Seçilmedi';
        if (sumUser) sumUser.textContent = u;
        if (sumHost) sumHost.textContent = h;
        const sumRegion = document.getElementById('sum-region');
        if (sumRegion) {
          const kbSel = document.getElementById('inst-keyboard');
          const langSel = document.getElementById('inst-language');
          const tzSel = document.getElementById('inst-timezone');
          const kbTxt = kbSel ? kbSel.options[kbSel.selectedIndex].text : 'Türkçe Q';
          const langTxt = langSel ? langSel.options[langSel.selectedIndex].text : 'Türkçe';
          const tzTxt = tzSel ? tzSel.options[tzSel.selectedIndex].text : 'İstanbul';
          sumRegion.textContent = `${kbTxt} • ${langTxt} • ${tzTxt}`;
        }
      }
      document.querySelectorAll('.step-node').forEach((n, idx) => n.classList.toggle('active', idx + 1 === num));
      document.querySelectorAll('.wizard-pane').forEach((p, idx) => p.classList.toggle('active', idx + 1 === num));
    },

    async runInstall() {
      if (!this.selectedDisk) {
        alert('Lütfen önce kurulum yapılacak hedef diski seçin!');
        this.goToStep(1);
        return;
      }

      const u = document.getElementById('inst-username')?.value?.trim();
      const p = document.getElementById('inst-password')?.value?.trim();
      const fn = document.getElementById('inst-fullname')?.value?.trim() || u;
      const hn = document.getElementById('inst-hostname')?.value?.trim() || 'ankora-pc';
      const auto = document.getElementById('inst-autologin')?.checked ?? false;
      const rLang = document.getElementById('inst-language')?.value || 'tr_TR.UTF-8';
      const rKb = document.getElementById('inst-keyboard')?.value || 'tr';
      const rTz = document.getElementById('inst-timezone')?.value || 'Europe/Istanbul';

      if (!u || !p) {
        alert('Kullanıcı adı ve parola boş bırakılamaz!');
        this.goToStep(2);
        return;
      }

      this.goToStep(4);
      const progress = document.getElementById('inst-wizard-progress');
      const logs = document.getElementById('installer-logs-view');
      const finishNav = document.getElementById('installer-finish-nav');

      const append = (msg, cls = 'muted') => {
        if (!logs) return;
        const row = document.createElement('div');
        row.className = `term-row ${cls}`;
        row.textContent = msg;
        logs.appendChild(row);
        logs.scrollTop = logs.scrollHeight;
      };

      append(`[1/5] Hedef disk hazırlanıyor: ${this.selectedDisk}...`);
      if (progress) progress.style.width = '15%';

      try {
        append(`[2/5] Hibrit GPT bölüm tablosu (BIOS + UEFI) ve dosya sistemleri oluşturuluyor...`);
        if (progress) progress.style.width = '35%';

        const res = await TauriBridge.invoke('execute_system_installation', {
          payload: {
            target_disk: this.selectedDisk,
            fullname: fn,
            username: u,
            hostname: hn,
            password: p,
            autologin: auto,
            timezone: rTz,
            keyboard_layout: rKb,
            language: rLang
          }
        });

        if (progress) progress.style.width = '100%';
        append(`[3/5] Canlı kök sistem dosyaları hedef diske başarıyla kopyalandı.`);
        append(`[4/5] GRUB önyükleyici (UEFI + BIOS) ve sistem yapılandırması tamamlandı.`);
        append(`[5/5] ${res}`, 'cmd');
        if (finishNav) finishNav.style.display = 'flex';
      } catch (err) {
        if (progress) progress.style.backgroundColor = 'var(--danger, #ef4444)';
        append(`[KURULUM HATASI] ${err.message || err}`, 'error');
        ReportManager.showToast(`Kurulum hatası: ${err.message || err}`);
      }
    }
  };

  // ============================================================================
  // AYARLAR & SAAT
  // ============================================================================
  // ============================================================================
  // TEMA & KİŞİSELLEŞTİRME YÖNETİCİSİ (THEME MANAGER)
  // ============================================================================
  const ThemeManager = {
    currentTheme: 'theme-dark',
    // Açık temaları ayrı liste olarak yürüt; GTK tarafına da bunlar 'isDark=false' gider.
    LIGHT_THEMES: ['theme-light', 'theme-arctic', 'theme-cinar', 'theme-meltem'],
    // TÜM SİSTEM TEMA PAKETLERİ: Bir tema seçildiğinde yalnızca pencere
    // renkleri değil, eşleşen duvar kağıdı + ikon seti + vurgu rengi de
    // birlikte uygulanır (kullanıcı "bütün sistemin teması değişsin" isteği).
    // 'ankora_theme_fullsystem' kaydı ile kapatılabilir.
    THEME_BUNDLES: {
      'theme-dark':      { wallpaper: 'wallpaper-nordic.svg',        iconset: 'nordic',   accent: '#2563eb' },
      'theme-light':     { wallpaper: 'wallpaper-aurora.svg',        iconset: 'outline',  accent: '#059669' },
      'theme-midnight':  { wallpaper: 'wallpaper-obsidian.svg',      iconset: 'ink',      accent: '#7c3aed' },
      'theme-nord':      { wallpaper: 'wallpaper-zenith.svg',        iconset: 'nordic',   accent: '#ffffff' },
      'theme-evergreen': { wallpaper: 'wallpaper-topo.svg',          iconset: 'emerald',  accent: '#059669' },
      'theme-ember':     { wallpaper: 'wallpaper-matrix.svg',        iconset: 'sunset',   accent: '#ea580c' },
      'theme-arctic':    { wallpaper: 'wallpaper-abstract-lines.svg',iconset: 'pastel',   accent: '#059669' },
      'theme-cinar':     { wallpaper: 'wallpaper-cinar.svg',         iconset: 'outline',  accent: '#3f6b45' },
      'theme-meltem':    { wallpaper: 'wallpaper-meltem.svg',        iconset: 'outline',  accent: '#0d7a8c' },
      'theme-kor':       { wallpaper: 'wallpaper-kor.svg',           iconset: 'sunset',   accent: '#e08a3c' },
      'theme-dem':       { wallpaper: 'wallpaper-dem.svg',           iconset: 'monokrom', accent: '#d64545' },
      'theme-bogaz':     { wallpaper: 'wallpaper-bogaz.svg',         iconset: 'ink',      accent: '#c9a24b' },
      'theme-ayna':      { wallpaper: 'wallpaper-ayna.svg',          iconset: 'monokrom', accent: '#06b6d4' }
    },

    isFullSystemTheme() {
      // Varsayılan: açık (kullanıcı isteği: tema tüm sistemi kapsasın).
      return SafeStorage.getItem('ankora_theme_fullsystem') !== 'false';
    },
    currentAccent: '#2563eb',
    currentWallpaper: 'wallpaper-nordic.svg',
    currentRadius: '6px',
    currentGlass: 'solid',
    currentTaskbarAlign: 'left',
    currentTaskbarHeight: '44px',
    currentAnimSpeed: 'smooth',

    init() {
      // 1. Kaydedilmiş tercihleri yükle
      const savedTheme = SafeStorage.getItem('ankora_theme_mode') || 'theme-dark';
      const savedAccent = SafeStorage.getItem('ankora_accent_color') || '#2563eb';
      const savedWp = SafeStorage.getItem('ankora_wallpaper') || 'wallpaper-nordic.svg';
      const savedRadius = SafeStorage.getItem('ankora_corner_radius') || '6px';
      const savedGlass = SafeStorage.getItem('ankora_window_glass') || 'solid';
      const savedAlign = SafeStorage.getItem('ankora_taskbar_align') || 'center';
      const savedHeight = SafeStorage.getItem('ankora_taskbar_height') || '44px';
      const savedAnim = SafeStorage.getItem('ankora_anim_speed') || 'smooth';
      const savedIconSet = SafeStorage.getItem('ankora_icon_set') || 'monokrom';

      this.setTheme(savedTheme, false);
      this.setAccent(savedAccent, false);
      this.setWallpaper(savedWp, false);
      this.setCornerRadius(savedRadius, false);
      this.setWindowGlass(savedGlass, false);
      this.setTaskbarAlign(savedAlign, false);
      this.setTaskbarHeight(savedHeight, false);
      this.setAnimSpeed(savedAnim, false);
      this.setIconSet(savedIconSet, false);

      // "Tüm sistem teması" anahtarının kayıtlı durumunu geri yükle.
      const fsCheck = document.getElementById('chk-fullsystem-theme');
      if (fsCheck) {
        fsCheck.checked = this.isFullSystemTheme();
      }

      // Tema Kartı, Vurgu Butonu ve Kişiselleştirme Seçimleri
      document.addEventListener('click', (e) => {
        if (!e.target || typeof e.target.closest !== 'function') return;
        const themeCard = e.target.closest('.theme-card-choice');
        if (themeCard) {
          const theme = themeCard.getAttribute('data-theme');
          if (theme) this.setTheme(theme);
        }

        // "Tüm sistem teması" anahtarı (duvar kağıdı + ikon seti birlikte)
        const fsCheck = e.target.closest && e.target.closest('#chk-fullsystem-theme');
        if (fsCheck) {
          SafeStorage.setItem('ankora_theme_fullsystem', fsCheck.checked ? 'true' : 'false');
          Terminal.log(`[TEMA] Tüm sistem teması paketleri: ${fsCheck.checked ? 'AÇIK' : 'KAPALI (yalnızca pencere teması)'}`, 'cmd');
        }

        const accentBtn = e.target.closest('.accent-pill-btn');
        if (accentBtn) {
          const accent = accentBtn.getAttribute('data-accent');
          if (accent) this.setAccent(accent);
        }

        const wpCard = e.target.closest('.wp-thumb-card, .wp-card');
        if (wpCard) {
          const wp = wpCard.getAttribute('data-wp');
          if (wp) this.setWallpaper(wp);
        }

        // Pencere Kenarlık Kavisi (Border Radius)
        const radiusBtn = e.target.closest('#group-corner-radius .option-pill-btn');
        if (radiusBtn) {
          const r = radiusBtn.getAttribute('data-radius');
          if (r) this.setCornerRadius(r);
        }

        // Pencere Cam Saydamlığı (Glassmorphism)
        const glassBtn = e.target.closest('#group-window-blur .option-pill-btn');
        if (glassBtn) {
          const g = glassBtn.getAttribute('data-glass');
          if (g) this.setWindowGlass(g);
        }

        // Görev Çubuğu Yerleşimi (Alignment)
        const alignBtn = e.target.closest('#group-taskbar-align .option-pill-btn');
        if (alignBtn) {
          const a = alignBtn.getAttribute('data-align');
          if (a) this.setTaskbarAlign(a);
        }

        // Görev Çubuğu Boyutu (Height)
        const heightBtn = e.target.closest('#group-taskbar-size .option-pill-btn');
        if (heightBtn) {
          const h = heightBtn.getAttribute('data-height');
          if (h) this.setTaskbarHeight(h);
        }

        // Animasyon Seviyesi
        const animBtn = e.target.closest('#group-anim-speed .option-pill-btn');
        if (animBtn) {
          const s = animBtn.getAttribute('data-anim');
          if (s) this.setAnimSpeed(s);
        }

        // İkon Seti (Başlat menüsü / masaüstü / görev çubuğu simgeleri)
        const iconsetBtn = e.target.closest('#group-iconset .option-pill-btn');
        if (iconsetBtn) {
          const s = iconsetBtn.getAttribute('data-iconset');
          if (s) this.setIconSet(s);
        }
      });
    },

    setTheme(themeName, persist = true) {
      this.currentTheme = themeName;
      // Tüm theme-* sınıfları kaldırılır; geniş tema seti büyürken sabit
      // liste bakımı hata doğuruyordu.
      Array.from(document.body.classList)
        .filter(c => c.startsWith('theme-'))
        .forEach(c => document.body.classList.remove(c));
      if (themeName !== 'theme-dark') {
        document.body.classList.add(themeName);
      }

      document.querySelectorAll('.theme-card-choice').forEach(card => {
        card.classList.toggle('active', card.getAttribute('data-theme') === themeName);
      });

      if (persist) {
        SafeStorage.setItem('ankora_theme_mode', themeName);
        Terminal.log(`[TEMA] Sistem teması uygulandı: ${themeName}`, 'cmd');
      }

      // TÜM SİSTEM TEMA PAKETİ: Kullanıcı isteği üzerine tema değişimi
      // duvar kağıdı + ikon seti + vurgu rengini de birlikte geçirir.
      // Yanlış tetiklenmemesi için yalnız kullanıcı tıklamasında (persist)
      // ve "tüm sistem" anahtarı açıksa uygulanır.
      const bundle = this.THEME_BUNDLES && this.THEME_BUNDLES[themeName];
      if (bundle && persist && this.isFullSystemTheme()) {
        if (bundle.accent && bundle.accent !== this.currentAccent) {
          this.setAccent(bundle.accent);
        }
        if (bundle.iconset) {
          this.setIconSet(bundle.iconset);
        }
        if (bundle.wallpaper) {
          this.setWallpaper(bundle.wallpaper);
          // X kök penceresi + ~/.config/ankora/wallpaper kalıcı kaydı:
          // dosya adı gönderilir; Rust /usr/share/ayaz altından çözer.
          TauriBridge.invoke('set_desktop_wallpaper', { filePath: bundle.wallpaper })
            .then(() => Terminal.log(`[TEMA] Sistem duvar kağıdı pakete göre değişti: ${bundle.wallpaper}`, 'success'))
            .catch(() => {});
        }
        Terminal.log(`[TEMA] Tüm sistem teması paketi uygulandı: ${themeName} (simge: ${bundle.iconset}, kağıt: ${bundle.wallpaper})`, 'success');
      }

      // XSettings & GTK Tema Senkronizasyonu (xsettingsd, GTK-2/3/4, gsettings)
      const isDark = !this.LIGHT_THEMES.includes(themeName);
      TauriBridge.invoke('sync_desktop_theme', { isDark, accent: this.currentAccent || '#2563eb' }).catch(() => {});
    },

    setAccent(colorHex, persist = true) {
      this.currentAccent = colorHex;
      if (document.documentElement && document.documentElement.style && document.documentElement.style.setProperty) {
        document.documentElement.style.setProperty('--accent-active', colorHex);
        document.documentElement.style.setProperty('--border-active-window', colorHex);
      }
      if (document.body && document.body.style && document.body.style.setProperty) {
        document.body.style.setProperty('--accent-active', colorHex);
        document.body.style.setProperty('--border-active-window', colorHex);
      }
      document.querySelectorAll('.accent-pill-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-accent') === colorHex);
      });

      if (persist) {
        SafeStorage.setItem('ankora_accent_color', colorHex);
        Terminal.log(`[VURGU] Sistem vurgu rengi değiştirildi: ${colorHex}`, 'cmd');
      }

      const isDark = (this.LIGHT_THEMES || ['theme-light']).includes(this.currentTheme);
      TauriBridge.invoke('sync_desktop_theme', { isDark, accent: colorHex }).catch(() => {});
    },

    setWallpaper(wpFile, persist = true) {
      this.currentWallpaper = wpFile;
      const elWp = document.getElementById('desktop-wallpaper');
      if (elWp && wpFile) {
        elWp.style.backgroundImage = `url('${wpFile}')`;
      }

      document.querySelectorAll('.wp-thumb-card, .wp-card').forEach(card => {
        card.classList.toggle('active', card.getAttribute('data-wp') === wpFile);
      });

      if (persist) {
        SafeStorage.setItem('ankora_wallpaper', wpFile);
        Terminal.log(`[DUVAR KAĞIDI] Arka plan güncellendi: ${wpFile}`, 'cmd');
      }
    },

    setCornerRadius(radius, persist = true) {
      this.currentRadius = radius;
      document.documentElement.style.setProperty('--radius-window', radius);
      document.documentElement.style.setProperty('--radius-ui', radius === '0px' ? '0px' : (radius === '12px' ? '8px' : '6px'));

      document.querySelectorAll('#group-corner-radius .option-pill-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-radius') === radius);
      });

      if (persist) {
        SafeStorage.setItem('ankora_corner_radius', radius);
        Terminal.log(`[KİŞİSELLEŞTİRME] Pencere kavis yarıçapı: ${radius}`, 'cmd');
      }
    },

    setWindowGlass(glassMode, persist = true) {
      this.currentGlass = glassMode;
      document.body.classList.remove('glass-solid', 'glass-balanced', 'glass-high');
      document.body.classList.add(`glass-${glassMode}`);

      document.querySelectorAll('#group-window-blur .option-pill-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-glass') === glassMode);
      });

      if (persist) {
        SafeStorage.setItem('ankora_window_glass', glassMode);
        Terminal.log(`[KİŞİSELLEŞTİRME] Pencere cam saydamlığı: ${glassMode}`, 'cmd');
      }
    },

    setTaskbarAlign(align, persist = true) {
      this.currentTaskbarAlign = align;
      const tb = document.querySelector('.taskbar');
      if (align === 'left') {
        document.body.classList.add('taskbar-align-left');
        if (tb) tb.classList.add('align-left');
      } else {
        document.body.classList.remove('taskbar-align-left');
        if (tb) tb.classList.remove('align-left');
      }

      document.querySelectorAll('#group-taskbar-align .option-pill-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-align') === align);
      });

      if (persist) {
        SafeStorage.setItem('ankora_taskbar_align', align);
        Terminal.log(`[KİŞİSELLEŞTİRME] Görev çubuğu yerleşimi: ${align === 'left' ? 'Sol Hizalı' : 'Ortalanmış'}`, 'cmd');
      }
    },

    setTaskbarHeight(height, persist = true) {
      this.currentTaskbarHeight = height;
      document.documentElement.style.setProperty('--taskbar-height', height);

      document.querySelectorAll('#group-taskbar-size .option-pill-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-height') === height);
      });

      if (persist) {
        SafeStorage.setItem('ankora_taskbar_height', height);
        Terminal.log(`[KİŞİSELLEŞTİRME] Görev çubuğu yüksekliği: ${height}`, 'cmd');
      }
    },

    setAnimSpeed(animMode, persist = true) {
      this.currentAnimSpeed = animMode;
      document.body.classList.remove('anim-smooth', 'anim-fast', 'anim-none');
      document.body.classList.add(`anim-${animMode}`);

      document.querySelectorAll('#group-anim-speed .option-pill-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-anim') === animMode);
      });

      if (persist) {
        SafeStorage.setItem('ankora_anim_speed', animMode);
        Terminal.log(`[KİŞİSELLEŞTİRME] Arayüz animasyon hızı: ${animMode}`, 'cmd');
      }
    },

    setIconSet(setName, persist = true) {
      this.currentIconSet = setName;
      document.documentElement.setAttribute('data-iconset', setName);

      document.querySelectorAll('#group-iconset .option-pill-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-iconset') === setName);
      });

      if (typeof XdgDesktopEngine !== 'undefined') {
        if (typeof XdgDesktopEngine.renderToStartMenu === 'function') XdgDesktopEngine.renderToStartMenu();
        if (typeof XdgDesktopEngine.renderToDesktop === 'function') XdgDesktopEngine.renderToDesktop();
      }

      if (persist) {
        SafeStorage.setItem('ankora_icon_set', setName);
        Terminal.log(`[İKON SETİ] Uygulama simgeleri setine geçildi: ${setName}`, 'cmd');
      }
    }
  };

  // ============================================================================
  // GELİŞMİŞ SİSTEM AYARLARI (7 PANE SETTINGS MANAGER)
  // ============================================================================
  const SettingsManager = {
    // Ekran modları xrandr'den okunur; sunucu liste döndürmezse HTML'deki
    // sabit seçenekler olduğu gibi kalır.
    async loadDisplayModes() {
      const selMode = document.getElementById('ctrl-resolution');
      const selRate = document.getElementById('ctrl-refresh-rate');
      if (!selMode) return;

      let info = null;
      try {
        info = await TauriBridge.invoke('get_display_modes');
      } catch (e) {
        info = null;
      }

      // Önerilen (native) çözünürlüğe dönüş — kurulu sistemde bulanık görünen
      // ekranı bu düğme kurtarır. Dinamik mod listesi yoksa da bağlanır.
      const btnPreferred = document.getElementById('btn-preferred-mode');
      if (btnPreferred) {
        btnPreferred.onclick = async () => {
          if (!info || !info.preferred_mode) {
            ReportManager.showToast('Ekranın önerilen çözünürlüğü bulunamadı.');
            return;
          }
          try {
            const res = await TauriBridge.invoke('set_display_mode', {
              mode: 'preferred', rate: '', output: info.output
            });
            const after = (res && typeof res === 'object') ? Number(res.revert_after) || 0 : 0;
            this.startRevertCountdown(after);
          } catch (e) {
            ReportManager.showToast(`Ekran modu uygulanamadı: ${e.message || e}`);
          }
        };
      }

      const apply = async (rate) => {
        try {
          const res = await TauriBridge.invoke('set_display_mode', {
            mode: selMode.value, rate, output: info ? info.output : ''
          });
          // Sunucu onay süresi döndürürse geri alma çubuğu açılır; süre
          // dolarsa sistem eski moda kendisi döner.
          const after = (res && typeof res === 'object') ? Number(res.revert_after) || 0 : 0;
          this.startRevertCountdown(after);
        } catch (e) {
          ReportManager.showToast(`Ekran modu uygulanamadı: ${e.message || e}`);
        }
      };

      if (!info || !Array.isArray(info.modes) || info.modes.length === 0) {
        selMode.onchange = () => {
          apply(selRate?.value || '');
        };
        if (selRate) selRate.onchange = () => apply(selRate.value);
        return;
      }

      const fillRates = (modeObj) => {
        if (!selRate) return;
        selRate.innerHTML = '';
        if (!modeObj) return;
        (modeObj.rates || []).forEach(r => {
          const opt = document.createElement('option');
          opt.value = r;
          opt.textContent = `${parseFloat(r)} Hz`;
          if (r === info.current_rate) opt.selected = true;
          selRate.appendChild(opt);
        });
      };

      selMode.innerHTML = '';
      info.modes.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.mode;
        const tags = [];
        if (m.current) tags.push('aktif');
        if (m.preferred || m.mode === info.preferred_mode) tags.push('önerilen');
        opt.textContent = `${m.mode.replace('x', ' x ')}${tags.length ? ` (${tags.join(', ')})` : ''}`;
        if (m.mode === info.current_mode) opt.selected = true;
        selMode.appendChild(opt);
        if (m.current) fillRates(m);
      });

      selMode.onchange = () => {
        const nextMode = info.modes.find(m => m.mode === selMode.value);
        fillRates(nextMode);
        if (nextMode && selRate && selRate.value) apply(selRate.value);
      };
      if (selRate) selRate.onchange = () => apply(selRate.value);

      this.loadMultiMonitors();
    },

    // --- Çözünürlük onay / geri alma akışı (ekran boş kalmasın diye) ---
    revertTimer: null,

    startRevertCountdown(sec) {
      const bar = document.getElementById('display-revert-bar');
      const label = document.getElementById('display-revert-label');
      if (!bar) return;
      if (this.revertTimer) {
        clearInterval(this.revertTimer);
        this.revertTimer = null;
      }
      if (!sec) {
        bar.style.display = 'none';
        return;
      }
      let left = sec;
      const tick = () => {
        if (label) {
          label.textContent = `Ekran modu uygulandı — ${left} saniye içinde onaylanmazsa eski haline dönecek.`;
        }
      };
      tick();
      bar.style.display = 'flex';
      this.revertTimer = setInterval(() => {
        left -= 1;
        if (left <= 0) {
          clearInterval(this.revertTimer);
          this.revertTimer = null;
          bar.style.display = 'none';
          ReportManager.showToast('Ekran modu onaylanmadı; önceki çözünürlüğe geri dönüldü.');
          this.loadDisplayModes();
          return;
        }
        tick();
      }, 1000);
    },

    async confirmDisplayMode() {
      if (this.revertTimer) {
        clearInterval(this.revertTimer);
        this.revertTimer = null;
      }
      const bar = document.getElementById('display-revert-bar');
      if (bar) bar.style.display = 'none';
      try {
        await TauriBridge.invoke('confirm_display_mode');
        ReportManager.showToast('Ekran ayarı kalıcı olarak kaydedildi.');
      } catch (e) {
        ReportManager.showToast(`Onay gönderilemedi: ${e.message || e}`);
      }
    },

    async revertDisplayModeNow() {
      if (this.revertTimer) {
        clearInterval(this.revertTimer);
        this.revertTimer = null;
      }
      try {
        await TauriBridge.invoke('revert_display_mode');
        const bar = document.getElementById('display-revert-bar');
        if (bar) bar.style.display = 'none';
        ReportManager.showToast('Önceki ekran çözünürlüğüne dönüldü.');
        this.loadDisplayModes();
      } catch (e) {
        ReportManager.showToast(`Geri alınamadı: ${e.message || e}`);
      }
    },

    // --- Çoklu Monitör Durumu ve Yapılandırması ---
    async loadMultiMonitors() {
      const lblStatus = document.getElementById('label-multi-monitor-status');
      const boxDetected = document.getElementById('box-detected-monitors');
      const listDetected = document.getElementById('list-detected-monitors');
      const selLayout = document.getElementById('ctrl-multi-monitor-layout');
      const btnApply = document.getElementById('btn-apply-multimonitor');

      if (!lblStatus) return;

      try {
        const data = await TauriBridge.invoke('get_all_monitors');
        if (data && Array.isArray(data.monitors)) {
          const connected = data.monitors.filter(m => m.connected);
          lblStatus.textContent = `${connected.length} ekran bağlı (Birincil: ${data.primary_output || 'Bilinmiyor'})`;

          if (boxDetected && listDetected) {
            boxDetected.style.display = 'block';
            listDetected.innerHTML = '';
            data.monitors.forEach(m => {
              const badge = document.createElement('span');
              badge.style.cssText = `padding:3px 8px;border-radius:4px;font-size:11px;background:${m.connected ? 'rgba(56,189,248,0.15)' : 'rgba(255,255,255,0.05)'};color:${m.connected ? '#38bdf8' : 'var(--text-muted)'};border:1px solid ${m.connected ? 'rgba(56,189,248,0.3)' : 'transparent'};`;
              badge.textContent = `${m.name}: ${m.connected ? (m.current_mode || 'Bağlı') + (m.is_primary ? ' [Birincil]' : '') : 'Bağlı Değil'}`;
              listDetected.appendChild(badge);
            });
          }

          if (btnApply && selLayout) {
            btnApply.onclick = async () => {
              const layout = selLayout.value;
              btnApply.disabled = true;
              btnApply.textContent = 'Uygulanıyor...';
              try {
                const res = await TauriBridge.invoke('set_multi_monitor_layout', { layout });
                ReportManager.showToast(String(res || 'Ekran düzeni uygulandı.'));
                setTimeout(() => this.loadMultiMonitors(), 1000);
              } catch (err) {
                ReportManager.showToast(`Hata: ${err.message || err}`);
              } finally {
                btnApply.disabled = false;
                btnApply.textContent = 'Uygula';
              }
            };
          }
        }
      } catch (e) {
        if (lblStatus) lblStatus.textContent = 'Ekran taraması yapılamadı';
      }
    },

    // Hakkında paneli telemetrisi; hem açılışta hem pane her açıldığında tazelenir.
    async fillTelemetry() {
      try {
        const tele = await TauriBridge.invoke('get_system_telemetry');
        if (!tele) return;
        document.querySelectorAll('#tele-os').forEach(el => el.textContent = tele.os_name);
        document.querySelectorAll('#tele-init').forEach(el => el.textContent = tele.init_system);
        document.querySelectorAll('#tele-kernel').forEach(el => el.textContent = tele.kernel);
        document.querySelectorAll('#tele-mem').forEach(el => {
          el.textContent = `${(tele.memory_used_mb / 1024).toFixed(1)} / ${(tele.memory_total_mb / 1024).toFixed(1)} GB`;
        });
      } catch (e) {}
    },

    // Depolama panelindeki disk ve ZRAM kartları gerçek df/zram verisiyle
    // doldurulur; HTML'deki sabit örnek değerler yer tutucuydu.
    async fillStorage() {
      let st = null;
      try {
        st = await TauriBridge.invoke('get_storage_stats');
      } catch (e) {
        st = null;
      }

      const setCard = (labelId, fillId, used, total, unitDiv) => {
        const label = document.getElementById(labelId);
        const fill = document.getElementById(fillId);
        if (!label || !fill) return;
        if (!st || !total) {
          label.textContent = 'Bilgi okunamadı';
          fill.style.width = '0%';
          return;
        }
        const usedU = used / unitDiv;
        const totalU = total / unitDiv;
        const pct = Math.max(0, Math.min(100, Math.round((used / total) * 100)));
        label.textContent = `${usedU.toFixed(1)} GB kullanılıyor / ${totalU.toFixed(1)} GB toplam (%${pct})`;
        fill.style.width = `${pct}%`;
      };

      setCard('label-disk-usage', 'fill-disk-bar', st ? st.disk_used : 0, st ? st.disk_total : 0, 1073741824);
      setCard('label-zram-usage', 'fill-zram-bar', st ? st.zram_used : 0, st ? st.zram_total : 0, 1073741824);

      // RAM kartı her açılışta telemetriyle tazelenir.
      try {
        const tele = await TauriBridge.invoke('get_system_telemetry');
        if (tele) {
          const ramLabel = document.getElementById('label-ram-settings-usage');
          const ramFill = document.getElementById('fill-ram-settings-bar');
          const usedGb = tele.memory_used_mb / 1024;
          const totalGb = tele.memory_total_mb / 1024;
          if (ramLabel) ramLabel.textContent = `${tele.memory_used_mb} MB / ${totalGb.toFixed(1)} GB (%${((usedGb / totalGb) * 100).toFixed(1)} Kullanımda)`;
          if (ramFill) ramFill.style.width = `${Math.max(2, Math.min(100, (usedGb / totalGb) * 100))}%`;
        }
      } catch (e) {}
    },

    // Ses düzeyi amixer/pactl üzerinden okunur ve yazılır (bkz. main/backend).
    async loadVolume() {
      const slider = document.getElementById('ctrl-volume');
      const label = document.getElementById('volume-val-label');
      const hint = document.getElementById('volume-hint');
      if (!slider) return;
      try {
        const level = await TauriBridge.invoke('get_volume');
        const v = Math.max(0, Math.min(100, parseInt(level, 10) || 0));
        slider.value = String(v);
        if (label) label.textContent = `%${v}`;
        const qsVol = document.getElementById('quick-volume-slider');
        const qsVolLabel = document.getElementById('quick-volume-label');
        if (qsVol) qsVol.value = String(v);
        if (qsVolLabel) qsVolLabel.textContent = `%${v}`;
        const trayVol = document.getElementById('tray-volume-btn');
        if (trayVol) trayVol.title = `Ses Çıkışı: %${v}`;
        slider.disabled = false;
        if (hint) hint.textContent = '';
      } catch (e) {
        slider.disabled = true;
        if (label) label.textContent = '—';
        if (hint) hint.textContent = 'Ses sistemi bulunamadı';
      }
    },

    // --- Bölge & Dil: saat dilimi + klavye düzeni + sistem dili ---
    // Köprü yoksa (önizleme) sessizce yer tutucu bırakılır; hata yutulmaz,
    // kullanıcıya bildirilir.
    async loadRegionSettings() {
      const selLang = document.getElementById('ctrl-region-language');
      const selKb = document.getElementById('ctrl-region-keyboard');
      const selTz = document.getElementById('ctrl-region-timezone');
      const lblTime = document.getElementById('label-region-time');
      if (!selLang || !selKb || !selTz) return;
      try {
        const r = await TauriBridge.invoke('get_region_settings');
        if (!r) return;
        if (Array.isArray(r.available_timezones) && r.available_timezones.length) {
          const cur = selTz.value;
          selTz.innerHTML = '';
          r.available_timezones.forEach((z) => {
            const o = document.createElement('option');
            o.value = z;
            o.textContent = z === 'Europe/Istanbul' ? 'İstanbul (Europe/Istanbul)' : z;
            selTz.appendChild(o);
          });
          if (r.timezone && Array.from(selTz.options).some(o => o.value === r.timezone)) {
            selTz.value = r.timezone;
          } else if (cur && Array.from(selTz.options).some(o => o.value === cur)) {
            selTz.value = cur;
          }
        } else if (r.timezone && !Array.from(selTz.options).some(o => o.value === r.timezone)) {
          const o = document.createElement('option');
          o.value = r.timezone;
          o.textContent = r.timezone;
          selTz.appendChild(o);
          selTz.value = r.timezone;
        }
        if (r.language && Array.from(selLang.options).some(o => o.value === r.language)) {
          selLang.value = r.language;
        }
        if (r.keyboard_layout && Array.from(selKb.options).some(o => o.value === r.keyboard_layout)) {
          selKb.value = r.keyboard_layout;
        }
        if (lblTime) lblTime.textContent = r.local_time ? `Şu an: ${r.local_time} (${r.timezone})` : `Bölge: ${r.timezone}`;
      } catch (e) {
        if (lblTime) lblTime.textContent = `Bölge bilgisi okunamadı: ${e.message || e}`;
      }
    },

    initRegionControls() {
      const btnSave = document.getElementById('btn-region-save');
      const btnSync = document.getElementById('btn-region-sync-time');
      const toast = (msg, kind) => {
        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast(msg, kind);
        }
      };
      if (btnSync && !btnSync.dataset.bound) {
        btnSync.dataset.bound = '1';
        btnSync.addEventListener('click', async () => {
          btnSync.disabled = true;
          btnSync.textContent = 'Eşitleniyor…';
          try {
            const now = await TauriBridge.invoke('sync_time_ntp');
            const lblTime = document.getElementById('label-region-time');
            if (lblTime) lblTime.textContent = now ? `Şu an: ${now}` : 'Saat eşitlendi.';
            toast(now ? `Sistem saati: ${now}` : 'Saat eşitlendi.');
            if (typeof Terminal !== 'undefined') Terminal.log(`[SAAT] NTP eşitleme: ${now}`, 'cmd');
          } catch (e) {
            toast(`Saat eşitlenemedi: ${e.message || e}`, 'error');
          } finally {
            btnSync.disabled = false;
            btnSync.textContent = 'İnternet ile Eşitle';
          }
        });
      }
      if (btnSave && !btnSave.dataset.bound) {
        btnSave.dataset.bound = '1';
        btnSave.addEventListener('click', async () => {
          const selLang = document.getElementById('ctrl-region-language');
          const selKb = document.getElementById('ctrl-region-keyboard');
          const selTz = document.getElementById('ctrl-region-timezone');
          btnSave.disabled = true;
          btnSave.textContent = 'Kaydediliyor…';
          const done = [];
          const failed = [];
          try {
            await TauriBridge.invoke('set_timezone', { timezone: selTz ? selTz.value : 'Europe/Istanbul' });
            done.push('saat dilimi');
          } catch (e) { failed.push(`saat dilimi: ${e.message || e}`); }
          try {
            await TauriBridge.invoke('set_keyboard_layout', { layout: selKb ? selKb.value : 'tr' });
            done.push('klavye');
          } catch (e) { failed.push(`klavye: ${e.message || e}`); }
          try {
            await TauriBridge.invoke('set_system_language', { language: selLang ? selLang.value : 'tr_TR.UTF-8' });
            done.push('sistem dili');
          } catch (e) { failed.push(`dil: ${e.message || e}`); }
          btnSave.disabled = false;
          btnSave.textContent = 'Kaydet';
          if (done.length) toast(`Kaydedildi: ${done.join(', ')}.`);
          failed.forEach((f) => toast(f, 'error'));
          if (typeof Terminal !== 'undefined') {
            Terminal.log(`[BÖLGE] Kaydet: ok=[${done.join(', ')}] hata=[${failed.join('; ')}]`, done.length ? 'cmd' : 'error');
          }
          this.loadRegionSettings();
        });
      }
    },

    // --- Dokunmatik Ekran (Faz Tahta): kalibrasyon + ekran klavyesi ---
    initTouchControls() {
      const lbl = document.getElementById('label-touch-status');
      const touch = (typeof TouchHelpers !== 'undefined' && TouchHelpers.isTouch())
        || (typeof document !== 'undefined' && document.body.classList.contains('has-touch'));
      if (lbl) {
        lbl.textContent = touch
          ? 'Dokunmatik giriş etkin. Uzun basım sağ tık menüsünü açar.'
          : 'Dokunmatik giriş algılanamadı. USB dokunmatik çerçevenin takılı olduğunu denetleyin.';
      }
      const btnCal = document.getElementById('btn-touch-calibrate');
      if (btnCal) {
        btnCal.onclick = async () => {
          try {
            await TauriBridge.invoke('launch_application', { exec: 'xinput_calibrator' });
            ReportManager.showToast('Kalibrasyon aracı açıldı; hedeflere parmağınla dokun.');
          } catch (e) {
            ReportManager.showToast(`Kalibrasyon açılamadı: ${e.message || e}`, 'error');
          }
        };
      }
      const btnKb = document.getElementById('btn-touch-keyboard');
      if (btnKb) {
        btnKb.onclick = async () => {
          try {
            await TauriBridge.invoke('launch_application', { exec: 'onboard' });
          } catch (e) {
            ReportManager.showToast(`Ekran klavyesi açılamadı: ${e.message || e}`, 'error');
          }
        };
      }
      const btnEta = document.getElementById('btn-touch-eta');
      if (btnEta) {
        btnEta.onclick = async () => {
          try {
            await TauriBridge.invoke('launch_application', { exec: 'eta-touchdrv --calibrate-gui' });
            ReportManager.showToast('ETA dokunmatik sürücüsü açıldı.');
          } catch (e) {
            ReportManager.showToast(`ETA sürücüsü açılamadı: ${e.message || e}`, 'error');
          }
        };
      }
    },

    async init() {
      // Çözünürlük onay çubuğu düğmeleri (kepçe: tek bağlama, tekrarsız)
      const btnKeep = document.getElementById('btn-display-keep');
      if (btnKeep) btnKeep.addEventListener('click', () => this.confirmDisplayMode());
      this.initTouchControls();
      const btnRevert = document.getElementById('btn-display-revert');
      if (btnRevert) btnRevert.addEventListener('click', () => this.revertDisplayModeNow());

      // 1. Sol Navigasyon Sekme Değişimi
      const navItems = document.querySelectorAll('.settings-nav-item');
      const panes = document.querySelectorAll('.settings-pane');

      navItems.forEach(item => {
        item.addEventListener('click', () => {
          const targetPaneId = item.getAttribute('data-pane');
          navItems.forEach(n => n.classList.remove('active'));
          item.classList.add('active');

          panes.forEach(p => {
            p.classList.toggle('active', p.id === targetPaneId);
          });

          if (targetPaneId === 'pane-set-display') this.loadDisplayModes();
          if (targetPaneId === 'pane-set-storage') this.fillStorage();
          if (targetPaneId === 'pane-set-about') this.fillTelemetry();
          if (targetPaneId === 'pane-set-audio') {
            this.loadVolume();
            if (typeof AudioDeviceManager !== 'undefined') AudioDeviceManager.refreshDevices();
          }
          if (targetPaneId === 'pane-set-bluetooth' && typeof BluetoothManager !== 'undefined') BluetoothManager.checkStatus();
          if (targetPaneId === 'pane-set-shortcuts' && typeof ShortcutManager !== 'undefined') ShortcutManager.renderSettings();
          if (targetPaneId === 'pane-set-recovery' && typeof SnapshotManager !== 'undefined') SnapshotManager.loadSnapshots();
          if (targetPaneId === 'pane-set-region') this.loadRegionSettings();
          if (targetPaneId === 'pane-set-panel' && typeof PanelSettings !== 'undefined') PanelSettings.render();
        });
      });

      // 2. Arama Filtresi (Türkçe harf duyarsız evrensel eşleme)
      const filterInput = document.getElementById('settings-filter');
      if (filterInput) {
        filterInput.addEventListener('input', (e) => {
          const q = typeof launcherNorm === 'function' ? launcherNorm(e.target.value) : e.target.value.toLowerCase().trim();
          navItems.forEach(item => {
            const text = typeof launcherNorm === 'function' ? launcherNorm(item.textContent) : item.textContent.toLowerCase();
            item.style.display = text.includes(q) ? 'flex' : 'none';
          });
          const first = document.querySelector('.settings-nav-item:not([style*="display: none"])');
          if (first && q) first.click();
        });
      }

      // 3. Parlaklık ve Gece Işığı (yeniden başlatmada korunur, QS ile tam senkron)
      const sliderBrightness = document.getElementById('ctrl-brightness');
      const labelBrightness = document.getElementById('brightness-val-label');
      const dimmer = document.getElementById('screen-dimmer');
      const applyBrightness = (val) => {
        if (labelBrightness) labelBrightness.textContent = `%${val}`;
        if (dimmer) dimmer.style.opacity = ((100 - val) / 100 * 0.75).toString();
        const quickBright = document.getElementById('quick-brightness-slider');
        const quickBrightLabel = document.getElementById('quick-brightness-label');
        if (quickBright) quickBright.value = String(val);
        if (quickBrightLabel) quickBrightLabel.textContent = `%${val}`;
        TauriBridge.invoke('set_brightness', { level: val }).catch(() => {});
      };
      if (sliderBrightness) {
        const savedBrightness = SafeStorage.getItem('ankora_brightness');
        if (savedBrightness !== null) {
          sliderBrightness.value = savedBrightness;
          applyBrightness(parseInt(savedBrightness, 10) || 100);
        }
        sliderBrightness.addEventListener('input', (e) => {
          const val = parseInt(e.target.value, 10);
          SafeStorage.setItem('ankora_brightness', String(val));
          applyBrightness(val);
        });
      }

      const chkNight = document.getElementById('ctrl-night');
      const qsNight = document.getElementById('qs-nightlight-toggle');
      const qsNightSub = document.getElementById('qs-nightlight-sub');
      const nightScreen = document.getElementById('screen-night');
      const updateNightState = (enabled) => {
        if (nightScreen) {
          nightScreen.style.opacity = enabled ? '0.35' : '0';
          nightScreen.style.background = enabled ? 'rgba(245, 158, 11, 0.35)' : 'transparent';
        }
        if (chkNight) chkNight.checked = enabled;
        if (qsNight) qsNight.classList.toggle('active', enabled);
        if (qsNightSub) qsNightSub.textContent = enabled ? 'Açık' : 'Kapalı';
        SafeStorage.setItem('ankora_night_light', enabled ? '1' : '0');
      };
      if (chkNight || qsNight) {
        const nightOn = SafeStorage.getItem('ankora_night_light') === '1';
        updateNightState(nightOn);
        if (chkNight) {
          chkNight.addEventListener('change', (e) => {
            updateNightState(e.target.checked);
            Terminal.log(`[EKRAN] Gece ışığı filtresi: ${e.target.checked ? 'Etkin' : 'Kapalı'}`, 'cmd');
          });
        }
        if (qsNight && !qsNight.dataset.bound) {
          qsNight.dataset.bound = '1';
          qsNight.addEventListener('click', () => {
            const next = SafeStorage.getItem('ankora_night_light') !== '1';
            updateNightState(next);
            Terminal.log(`[EKRAN] Gece Işığı (Mavi Işık Filtresi): ${next ? 'Etkin' : 'Kapalı'}`, 'cmd');
          });
        }
      }

      // 3b. Arayüz Ölçekleme (DPI) & UI Zoom
      const selScale = document.getElementById('ctrl-scaling');
      if (selScale && !selScale.dataset.bound) {
        selScale.dataset.bound = '1';
        const savedScale = SafeStorage.getItem('ankora_display_scale');
        if (savedScale && Array.from(selScale.options).some(o => o.value === savedScale)) {
          selScale.value = savedScale;
          const factor = Number(savedScale) / 100;
          document.documentElement.style.zoom = String(factor);
          TauriBridge.invoke('set_display_scale', { percent: Number(savedScale) }).catch(() => {});
        }
        selScale.addEventListener('change', async () => {
          const val = Number(selScale.value);
          SafeStorage.setItem('ankora_display_scale', String(val));
          document.documentElement.style.zoom = String(val / 100);
          try {
            await TauriBridge.invoke('set_display_scale', { percent: val });
          } catch (e) {
            ReportManager.showToast(`Ölçek uygulanamadı: ${e.message || e}`);
          }
        });
      }

      // 4. Ses Düzeyi (gerçek ALSA/PulseVolume: get_volume / set_volume)
      const sliderVol = document.getElementById('ctrl-volume');
      const labelVol = document.getElementById('volume-val-label');
      if (sliderVol) {
        this.loadVolume();
        let volTimer = 0;
        sliderVol.addEventListener('input', (e) => {
          const val = parseInt(e.target.value, 10);
          if (labelVol) labelVol.textContent = `%${val}`;
          const qsVol = document.getElementById('quick-volume-slider');
          const qsVolLabel = document.getElementById('quick-volume-label');
          if (qsVol) qsVol.value = String(val);
          if (qsVolLabel) qsVolLabel.textContent = `%${val}`;
          const trayVol = document.getElementById('tray-volume-btn');
          if (trayVol) trayVol.title = `Ses Çıkışı: %${val}`;
          clearTimeout(volTimer);
          volTimer = setTimeout(async () => {
            try {
              await TauriBridge.invoke('set_volume', { level: val });
            } catch (err) {
              if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
                ReportManager.showToast(`Ses düzeyi ayarlanamadı: ${err.message || err}`, 'error');
              }
            }
          }, 150);
        });
      }

      // Rahatsız Etme: sıradan bildirimleri gizler, hatalar her zaman görünür.
      const chkDnd = document.getElementById('ctrl-dnd');
      if (chkDnd) {
        chkDnd.checked = SafeStorage.getItem('ankora_dnd') === '1';
        chkDnd.addEventListener('change', (e) => {
          SafeStorage.setItem('ankora_dnd', e.target.checked ? '1' : '0');
          if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
            ReportManager.showToast(e.target.checked
              ? 'Rahatsız Etme açık: sıradan bildirimler gizlenecek.'
              : 'Rahatsız Etme kapalı: bildirimler gösterilecek.');
          }
        });
      }

      // 4b. Güç Politikası — DPMS zaman aşımı ve CPU frekans profili
      const selTimeout = document.getElementById('ctrl-screen-timeout');
      if (selTimeout) {
        const savedDpms = SafeStorage.getItem('ankora_dpms_secs');
        if (savedDpms !== null) {
          selTimeout.value = savedDpms;
          TauriBridge.invoke('set_dpms_timeout', { seconds: parseInt(savedDpms, 10) || 0 }).catch(() => {});
        }
        selTimeout.addEventListener('change', async (e) => {
          const secs = parseInt(e.target.value, 10) || 0;
          SafeStorage.setItem('ankora_dpms_secs', String(secs));
          try {
            await TauriBridge.invoke('set_dpms_timeout', { seconds: secs });
            if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
              ReportManager.showToast(secs === 0
                ? 'Ekran karartması kapatıldı.'
                : `Hareketsizlikte ekran ${Math.round(secs / 60)} dakika sonra kararacak.`);
            }
          } catch (err) {
            if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
              ReportManager.showToast(`Ekran zaman aşımı ayarlanamadı: ${err.message || err}`, 'error');
            }
          }
        });
      }

      const selProfile = document.getElementById('ctrl-power-profile');
      if (selProfile) {
        const savedProfile = SafeStorage.getItem('ankora_cpu_profile');
        if (savedProfile && Array.from(selProfile.options).some(o => o.value === savedProfile)) {
          selProfile.value = savedProfile;
          TauriBridge.invoke('set_cpu_governor', { profile: savedProfile }).catch(() => {});
        }
        selProfile.addEventListener('change', async (e) => {
          const profile = e.target.value;
          try {
            await TauriBridge.invoke('set_cpu_governor', { profile });
            SafeStorage.setItem('ankora_cpu_profile', profile);
            if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
              ReportManager.showToast(`İşlemci profili: ${selProfile.options[selProfile.selectedIndex].text}`);
            }
          } catch (err) {
            if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
              ReportManager.showToast(err.message || String(err), 'error');
            }
            e.target.value = SafeStorage.getItem('ankora_cpu_profile') || 'balanced';
          }
        });
      }

      // 5. Wi-Fi taraması RadioManager'e bağlı (gerçek nmcli taraması);
      //    buradaki sahte sayaç kaldırıldı.

      // 5b. Bölge & Dil (saat dilimi, klavye düzeni, sistem dili)
      this.initRegionControls();

      // 6. Temizlik Araçları (APT & /tmp)
      const btnCleanApt = document.getElementById('btn-clean-apt');
      if (btnCleanApt) {
        btnCleanApt.addEventListener('click', async () => {
          btnCleanApt.textContent = 'Temizleniyor...';
          btnCleanApt.disabled = true;
          try {
            await TauriBridge.invoke('run_terminal_command', { command: 'apt-get clean' });
            Terminal.log('[TEMİZLİK] APT paket önbelleği temizlendi.', 'cmd');
            btnCleanApt.textContent = 'Temizlendi ✓';
            if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
              ReportManager.showToast('APT paket önbelleği temizlendi.');
            }
            setTimeout(() => { btnCleanApt.textContent = 'Önbelleği Temizle'; btnCleanApt.disabled = false; }, 2000);
          } catch (e) {
            btnCleanApt.textContent = 'Önbelleği Temizle';
            btnCleanApt.disabled = false;
            Terminal.log(`[TEMİZLİK] APT önbelleği temizlenemedi: ${e}`, 'error');
            if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
              ReportManager.showToast(`APT önbelleği temizlenemedi: ${e.message || e}`, 'error');
            }
          }
        });
      }

      const btnCleanTmp = document.getElementById('btn-clean-tmp');
      if (btnCleanTmp) {
        btnCleanTmp.addEventListener('click', async () => {
          btnCleanTmp.textContent = 'Temizleniyor...';
          btnCleanTmp.disabled = true;
          try {
            await TauriBridge.invoke('run_terminal_command', { command: 'rm -rf /tmp/*' });
            Terminal.log('[TEMİZLİK] /tmp dizini boşaltıldı.', 'cmd');
            btnCleanTmp.textContent = 'Temizlendi ✓';
            if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
              ReportManager.showToast('/tmp dizini boşaltıldı.');
            }
            setTimeout(() => { btnCleanTmp.textContent = 'Geçicileri Temizle'; btnCleanTmp.disabled = false; }, 2000);
          } catch (e) {
            btnCleanTmp.textContent = 'Geçicileri Temizle';
            btnCleanTmp.disabled = false;
            Terminal.log(`[TEMİZLİK] /tmp temizlenemedi: ${e}`, 'error');
            if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
              ReportManager.showToast(`/tmp temizlenemedi: ${e.message || e}`, 'error');
            }
          }
        });
      }

      // 7. Güncellemeleri Denetle (Hakkında panelindeki sonuç yazısı + GUI güncelleyici)
      const btnUpdate = document.getElementById('btn-check-updates');
      if (btnUpdate) {
        btnUpdate.addEventListener('click', async () => {
          const titleEl = document.getElementById('update-status-title');
          const descEl = document.getElementById('update-status-desc');
          btnUpdate.disabled = true;
          if (titleEl) titleEl.textContent = 'Güncellemeler denetleniyor…';
          if (descEl) descEl.textContent = 'GitHub sürümü ve sürüm notları sorgulanıyor.';
          try {
            const info = await TauriBridge.invoke('check_de_update');
            const latest = info && info.latest_version ? String(info.latest_version).replace(/^v/i, '') : '';
            if (info && info.has_update) {
              if (titleEl) titleEl.textContent = `Yeni sürüm mevcut: v${latest}`;
              if (descEl) descEl.textContent = `Kurulu sürüm v${info.current_version} • Güncelleme Güncelleyici'den kurulabilir.`;
              WindowManager.open('win-updater');
              UpdaterManager.checkForUpdates();
            } else {
              if (titleEl) titleEl.textContent = 'Sisteminiz güncel ✓';
              if (descEl) descEl.textContent = `Kurulu sürüm v${info ? info.current_version : UpdaterManager.currentVersion} • Denetim: ${new Date().toLocaleString('tr-TR')}`;
            }
          } catch (e) {
            if (titleEl) titleEl.textContent = 'Denetleme başarısız';
            if (descEl) descEl.textContent = e.message || String(e);
            Terminal.log(`[GÜNCELLEME] Denetleme hatası: ${e}`, 'error');
          } finally {
            btnUpdate.disabled = false;
          }
        });
      }

      // 8. Telemetri — kilit/PIN bağlamalarını bekletmemek için arkadan gelir
      this.fillTelemetry();
      // Ses düzeyi açılışta okunur; tepsi etiketi ve hızlı ayar kaydırıcısı
      // gerçek değerle başlar (HTML'deki %84 yer tutucuydu).
      this.loadVolume();

      // 9. Kilit Ekranı ve Güvenlik Ayarları
      const inputCurPin = document.getElementById('settings-current-pin');
      const inputNewPin = document.getElementById('settings-new-pin');
      const inputConfirmPin = document.getElementById('settings-confirm-pin');
      const btnSavePin = document.getElementById('btn-save-settings-pin');
      const pinStatus = document.getElementById('settings-pin-status');
      const selectAutoLock = document.getElementById('settings-autolock-select');
      const btnTestLock = document.getElementById('btn-test-lock-now');

      if (btnSavePin) {
        btnSavePin.addEventListener('click', async () => {
          const current = (inputCurPin?.value || '').trim();
          const next = (inputNewPin?.value || '').trim();
          const confirm = (inputConfirmPin?.value || '').trim();

          if (next.length < 4) {
            if (pinStatus) {
              pinStatus.textContent = 'Yeni PIN en az 4 karakter olmalıdır!';
              pinStatus.style.color = '#ef4444';
            }
            return;
          }

          if (next !== confirm) {
            if (pinStatus) {
              pinStatus.textContent = 'Yeni PIN ve onay eşleşmiyor!';
              pinStatus.style.color = '#ef4444';
            }
            return;
          }

          btnSavePin.disabled = true;
          btnSavePin.textContent = 'Kaydediliyor...';

          try {
            const res = await LockManager.setPin(current, next);
            if (res.success) {
              if (pinStatus) {
                pinStatus.textContent = 'PIN başarıyla güncellendi!';
                pinStatus.style.color = '#10b981';
              }
              if (inputCurPin) inputCurPin.value = '';
              if (inputNewPin) inputNewPin.value = '';
              if (inputConfirmPin) inputConfirmPin.value = '';
              if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
                ReportManager.showToast("Kilit PIN'i güvenli kasada güncellendi!");
              }
            } else {
              if (pinStatus) {
                pinStatus.textContent = res.error || 'Mevcut PIN doğrulanamadı!';
                pinStatus.style.color = '#ef4444';
              }
            }
          } catch (e) {
            if (pinStatus) {
              pinStatus.textContent = `Hata: ${e}`;
              pinStatus.style.color = '#ef4444';
            }
          } finally {
            btnSavePin.disabled = false;
            btnSavePin.textContent = "PIN'i Güncelle";
          }
        });
      }

      if (btnTestLock) {
        btnTestLock.addEventListener('click', () => {
          if (typeof LockManager !== 'undefined') {
            LockManager.lock();
          }
        });
      }

      if (selectAutoLock) {
        const savedMins = SafeStorage.getItem('ankora_autolock_mins', '0');
        selectAutoLock.value = savedMins;
        selectAutoLock.addEventListener('change', (e) => {
          const mins = parseInt(e.target.value, 10) || 0;
          SafeStorage.setItem('ankora_autolock_mins', String(mins));
          if (typeof LockManager !== 'undefined') {
            LockManager.autoLockMinutes = mins;
            LockManager.setupAutoLock();
          }
          if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
            ReportManager.showToast(`Otomatik kilit süresi: ${mins === 0 ? 'Kapalı' : mins + ' dk'}`);
          }
        });
      }

      const chkLockStartup = document.getElementById('settings-lock-on-startup');
      if (chkLockStartup) {
        // PIN ayarlıysa açılışta kilitleme varsayılan olarak açıktır; kullanıcı
        // yalnızca bilinçli olarak kapattığında ('0') devre dışı kalır.
        chkLockStartup.checked = SafeStorage.getItem('ankora_lock_on_startup') !== '0';
        chkLockStartup.addEventListener('change', () => {
          SafeStorage.setItem('ankora_lock_on_startup', chkLockStartup.checked ? '1' : '0');
          if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
            ReportManager.showToast(chkLockStartup.checked
              ? 'Açılışta kilit açık. PIN ayarlıysa oturum kilitli başlar.'
              : 'Açılışta kilit kapatıldı.');
          }
        });
      }

      const chkDynamicIsland = document.getElementById('settings-dynamic-island');
      if (chkDynamicIsland) {
        chkDynamicIsland.checked = SafeStorage.getItem('ankora_dynamic_island') !== '0';
        chkDynamicIsland.addEventListener('change', () => {
          if (typeof DynamicIsland !== 'undefined' && DynamicIsland.setEnabled) {
            DynamicIsland.setEnabled(chkDynamicIsland.checked);
          } else {
            SafeStorage.setItem('ankora_dynamic_island', chkDynamicIsland.checked ? '1' : '0');
          }
        });
      }
    }
  };

  // ============================================================================
  // EVRENSEL BAŞLATICI ARAMASI (LAUNCHER SEARCH)
  // ============================================================================

  // Türkçe küçük harfe indirger, harf dönüşümlerini ve ayraçları uygular:
  // "magaza" ile "Mağaza", "wifi" ile "Wi-Fi" aynı anahtara düşer.
  const launcherNorm = (s) => (s || '')
    .toLocaleLowerCase('tr')
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/ı/g, 'i').replace(/â/g, 'a')
    .replace(/[\s\-_.()/,:]+/g, '');

  // Arama kutusu doluken menünün kendi bölümleri gizlenir ve tek sonuç listesi
  // açılır. Profil ile güç eylemleri her durumda erişilebilir kalır.
  const LauncherSearch = {
    sectionSel: '.start-section-heading, #start-pinned-grid, #dynamic-start-apps, .start-dual-section',
    hits: [],

    // Kaynaklar her sorguda DOM'dan okunur; sabitlenenler, kurulu uygulamalar,
    // son belgeler, kısayollar, masaüstü simgeleri ve ayar panelleri bu yolla
    // ayrı bir kayıt tablosu olmadan güncel kalır.
    collect() {
      const items = [];
      const push = (title, desc, kind, run) => {
        const t = (title || '').replace(/\s+/g, ' ').trim();
        if (t) items.push({ title: t, desc: (desc || '').trim(), kind, run });
      };

      // Sabit kartlar pencere kimliği, kurulu uygulama kartları XDG kimliği
      // taşır; XDG kartlarında WindowManager.open hedefi bulamaz.
      document.querySelectorAll('.pinned-app-card[data-open]').forEach(card => {
        const target = card.getAttribute('data-open');
        const appId = card.getAttribute('data-app-id');
        push(card.querySelector('.app-title')?.textContent || card.textContent,
          card.querySelector('.app-desc')?.textContent, 'Uygulama', () => {
            const app = appId ? XdgDesktopEngine.installedApps.find(a => a.id === appId) : null;
            if (app) XdgDesktopEngine.launchApp(app);
            else if (target) WindowManager.open(target);
          });
      });

      document.querySelectorAll('.recent-doc-row[data-file]').forEach(row => {
        const file = row.getAttribute('data-file');
        push(row.textContent, 'Son kullanılan belge', 'Belge', () => {
          WindowManager.open('win-office');
          OfficeManager.openDocumentByName(file);
        });
      });

      document.querySelectorAll('.shortcut-action-row').forEach(row => {
        const open = row.getAttribute('data-open');
        const action = row.getAttribute('data-action');
        push(row.textContent, 'Hızlı kısayol', 'Kısayol', () => {
          if (open) {
            WindowManager.open(open);
          } else if (action === 'quick-clean') {
            WindowManager.open('win-terminal');
            Terminal.runCommand('apt-get clean && rm -rf /tmp/*');
          }
        });
      });

      // Masaüstü simgeleri data-app-id taşır; XDG motoru üzerinden başlar.
      document.querySelectorAll('.desktop-item[data-app-id]').forEach(item => {
        const app = XdgDesktopEngine.installedApps.find(a => a.id === item.getAttribute('data-app-id'));
        push(item.textContent, 'Masaüstü simgesi', 'Masaüstü', () => {
          if (app) XdgDesktopEngine.launchApp(app);
        });
      });

      document.querySelectorAll('.settings-nav-item').forEach(item => {
        const pane = item.getAttribute('data-pane');
        push(item.textContent, 'Sistem ayarları', 'Ayar', () => {
          WindowManager.open('win-settings');
          if (pane) {
            setTimeout(() => document.querySelector(`.settings-nav-item[data-pane="${pane}"]`)?.click(), 60);
          }
        });
      });

      return items;
    },

    // Toplama taraması (querySelectorAll sürüleri) her tuş vuruşunda
    // tekrarlanmasın; bir saniyelik taze sonuç arama için yeterli.
    collectCached() {
      if (this._collected && Date.now() - this._collectedAt < 1000) return this._collected;
      this._collected = this.collect();
      this._collectedAt = Date.now();
      return this._collected;
    },

    render(value) {
      const box = document.getElementById('start-search-results');
      const flyout = document.getElementById('start-flyout');
      if (!box || !flyout) return;

      const query = (value || '').trim();
      const sections = flyout.querySelectorAll(this.sectionSel);

      if (!query) {
        box.hidden = true;
        box.textContent = '';
        this.hits = [];
        sections.forEach(el => { el.style.display = ''; });
        return;
      }

      sections.forEach(el => { el.style.display = 'none'; });
      box.hidden = false;

      const nq = launcherNorm(query);
      this.hits = this.collectCached().filter(it =>
        launcherNorm(it.title).includes(nq) || launcherNorm(it.desc).includes(nq)
      ).slice(0, 8);

      if (this.hits.length === 0) {
        box.innerHTML = '<div class="search-empty">Eşleşen sonuç yok</div>';
        return;
      }

      box.innerHTML = this.hits.map((it, i) => `
        <div class="search-result-row" role="option" data-i="${i}" tabindex="-1">
          <span class="result-glyph">${it.title.trim().charAt(0).toLocaleUpperCase('tr')}</span>
          <span class="result-text">
            <span class="result-title">${it.title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>
            <span class="result-desc">${(it.desc || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>
          </span>
          <span class="result-kind">${it.kind}</span>
        </div>`).join('');
    },

    run(index) {
      const hit = this.hits[index];
      if (!hit) return;
      hit.run();
      // Sorgu ve gizli bölümler temiz kalmaz: bir sonraki açılış normal menüdür.
      const input = document.getElementById('start-search');
      if (input) {
        input.value = '';
        this.render('');
      }
      const flyout = document.getElementById('start-flyout');
      const startBtn = document.getElementById('start-btn');
      flyout?.classList.remove('open');
      startBtn?.classList.remove('active');
    }
  };

  function initDesktopControls() {
    // Çalışma alanı noktaları menüden bağımsız, ilk açılışta çizilir.
    WorkspaceManager.syncDots();

    // Genel görünümde kart dışına tıklamak da kapatır; dinleyici bir kez,
    // çağrı başına eklenirse biriken tıklamalar açık kalmayı engellerdi.
    document.getElementById('workspace-overview')?.addEventListener('click', (e) => {
      if (!e.target.closest('.overview-card')) WorkspaceManager.closeOverview();
    });

    const startBtn = document.getElementById('start-btn');
    const startFlyout = document.getElementById('start-flyout');
    const startSearch = document.getElementById('start-search');
    const calFlyout = document.getElementById('calendar-flyout');

    let toggleQuickSettings = () => {};
    let toggleCalendar = () => {};

    const toggleStart = (forceState) => {
      if (!startFlyout) return;
      const isOpen = typeof forceState === 'boolean' ? forceState : !startFlyout.classList.contains('open');
      startFlyout.classList.toggle('open', isOpen);
      if (startBtn) startBtn.classList.toggle('active', isOpen);
      try {
        TauriBridge.invoke('set_desktop_layer', { above: isOpen }).catch(() => {});
      } catch (e) {}
      if (startSearch) {
        // Menü her açılışta temiz başlar: önceki sorgu alttaki bölümleri gizli
        // bırakmasın.
        if (!isOpen) startSearch.value = '';
        LauncherSearch.render(startSearch.value);
      }
      if (isOpen && startSearch) {
        setTimeout(() => {
          try { startSearch.focus(); } catch (err) {}
        }, 50);
      }
    };

    if (startBtn) {
      startBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleStart();
      });
    }

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.desktop-item')) {
        document.querySelectorAll('.desktop-item.selected').forEach(el => el.classList.remove('selected'));
      }
      if (startFlyout && startFlyout.classList.contains('open')) {
        if (!startFlyout.contains(e.target) && (!startBtn || !startBtn.contains(e.target))) {
          toggleStart(false);
        }
      }
    });

    // Klavye Kısayolları (Super/Meta ve Esc)
    document.addEventListener('keydown', (e) => {
      // Esc -> Başlat menüsünü, hızlı ayarları, takvimi, genel görünümü ve bağlam menüsünü kapat
      if (e.key === 'Escape') {
        toggleStart(false);
        toggleQuickSettings(false);
        toggleCalendar(false);
        WorkspaceManager.closeOverview();
        if (typeof NotificationCenter !== 'undefined' && NotificationCenter.closeDrawer) {
          NotificationCenter.closeDrawer();
        }
        const ctx = document.getElementById('desktop-context-menu');
        if (ctx) ctx.classList.remove('open');
        const tabMenu = document.getElementById('taskbar-tab-menu');
        if (tabMenu) tabMenu.classList.remove('open');
        const snapMenu = document.getElementById('snap-layouts-menu');
        if (snapMenu) snapMenu.classList.remove('open');
        return;
      }

      // Süper tuşunun WebKit'e ulaşmadığı ortamlar için ikiz mod: Ctrl + Alt.
      // Mevcut Ctrl+Alt+R/S/M/T kısayollarıyla çakışmaz (yalnız oklar, N ve Tab).
      const wsMod = (e.metaKey && e.ctrlKey) || (e.ctrlKey && e.altKey);

      // Sol/Sağ -> çalışma alanları arasında geç
      if (wsMod && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        if (e.key === 'ArrowRight') WorkspaceManager.next(); else WorkspaceManager.prev();
        return;
      }

      // N -> yeni çalışma alanı
      if (wsMod && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        WorkspaceManager.grow();
        return;
      }

      // Tab -> açık pencerelerin genel görünümü.
      // WebKitGTK bazı ortamlarda Ctrl+Alt+Tab olayını sayfaya hiç ulaştırmıyor
      // (v7 testinde Space okundu, Tab okunamadı); bu yüzden e.code ile ikiz
      // Ctrl+Alt+G (G = Genel Görünüm) de bağlandı. e.code tuş yerleşiminden
      // bağımsızdır.
      if (wsMod && (e.code === 'Tab' || e.code === 'KeyG')) {
        e.preventDefault();
        WorkspaceManager.toggleOverview();
        return;
      }

      // Terminal: Ctrl + Alt + T veya Super + Enter
      if ((e.ctrlKey && e.altKey && (e.key === 't' || e.key === 'T')) || (e.metaKey && e.key === 'Enter')) {
        e.preventDefault();
        WindowManager.open('win-terminal');
        return;
      }

      // Dosya Yöneticisi: Super + E (Masaüstü Standardı)
      if (e.metaKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        WindowManager.open('win-files');
        return;
      }

      // Ofis Uygulaması: Super + O
      if (e.metaKey && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        WindowManager.open('win-office');
        return;
      }

      // Masaüstünü Göster / Gizle: Super + D
      if (e.metaKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        WindowManager.toggleShowDesktop();
        return;
      }

      // PrintScreen artık ScreenshotManager'ın global dinleyicisinde
      // anında yakalama (quickCapture) olarak işlenir — çift dinleyici
      // bug nediyle buradan kaldırıldı.

      // Aktif Pencereyi Kapat: Alt + F4
      if (e.altKey && e.key === 'F4') {
        e.preventDefault();
        const activeWin = WindowManager.windows.find(w => w.classList.contains('active') && w.classList.contains('open'));
        if (activeWin) {
          WindowManager.close(activeWin);
        }
        return;
      }

      // Ayarlar: Super + ,
      if (e.metaKey && e.key === ',') {
        e.preventDefault();
        WindowManager.open('win-settings');
        return;
      }

      // Gerçek Kilit Ekranı: Super + L
      if (e.metaKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        if (typeof LockManager !== 'undefined') {
          LockManager.lock();
        }
        return;
      }

      // Ctrl + Space veya tekil Super/Meta tuşu -> Başlat Menüsü Toggle.
      // Meta yalnızca keyup'ta (aşağıdaki ayrı dinleyicide) değerlendirilir;
      // basılı tutunca otomatik tekrar menüyü açıp kapamayıp buga sokmuyordu.
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault();
        toggleStart();
      }
    });

    // Super (Meta) yalnızca kısa ve tekil basışta menüyü açar; tuş basılı
    // tutulup başka bir tuşla birleşime girerse menü tetiklenmez.
    let superDownAt = 0;
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Meta' && !e.repeat) {
        superDownAt = Date.now();
      } else {
        superDownAt = 0;
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Meta' && superDownAt > 0 && Date.now() - superDownAt < 600) {
        toggleStart();
      }
      superDownAt = 0;
    });

    // 1. Sabitlenmiş Uygulamalar (Pinned Apps Grid)
    document.querySelectorAll('.pinned-app-card').forEach(card => {
      card.addEventListener('click', () => {
        const launch = card.getAttribute('data-launch');
        const target = card.getAttribute('data-open');
        if (launch) {
          TauriBridge.invoke('launch_application', { exec: launch })
            .then(() => ReportManager.showToast('Uygulama başlatıldı.'))
            .catch((err) => ReportManager.showToast(`Başlatılamadı: ${err.message || err}`));
        } else if (target) {
          WindowManager.open(target);
        }
        toggleStart(false);
      });
    });

    // 2. Son Kullanılan Belgeler
    document.querySelectorAll('.recent-doc-row').forEach(row => {
      row.addEventListener('click', () => {
        const fileName = row.getAttribute('data-file');
        WindowManager.open('win-office');
        OfficeManager.openDocumentByName(fileName);
        toggleStart(false);
      });
    });

    // 3. Hızlı Kısayollar
    document.querySelectorAll('.shortcut-action-row').forEach(row => {
      row.addEventListener('click', () => {
        const action = row.getAttribute('data-action');
        const target = row.getAttribute('data-open');
        if (target) {
          WindowManager.open(target);
        } else if (action === 'quick-clean') {
          WindowManager.open('win-terminal');
          Terminal.runCommand('apt-get clean && rm -rf /tmp/*');
        }
        toggleStart(false);
      });
    });

    // 3b. PANEL (GÖREV ÇUBUĞU) SAĞ TIK + SABİTLENMİŞ UYGULAMA MENÜSÜ
    // Panelin boş alanına sağ tık hızlı ayarlar/panel ayarlarını açar;
    // pince sağ tık "Aç / Panelden Kaldır (Gizle)" menüsü verir.
    const taskbarEl = document.getElementById('taskbar');

    window.showPinContextMenu = (e, pinBtn) => {
      e.preventDefault();
      e.stopPropagation();
      // Sabit simge + Başlat düğmesindeki menüleri kapatan tek menü noktası.
      document.querySelectorAll('.desktop-context-menu.open, .taskbar-tab-menu.open')
        .forEach(m => m.classList.remove('open'));
      const old = document.getElementById('pin-context-menu');
      if (old) old.remove();

      const menu = document.createElement('div');
      menu.id = 'pin-context-menu';
      menu.className = 'desktop-context-menu';

      const isDynamic = pinBtn.classList.contains('taskbar-dynamic-pin');
      const isAI = pinBtn.id === 'quick-ai-btn';
      menu.innerHTML = `
        <div class="ctx-item" data-act="open"><span>Aç</span></div>
        ${isDynamic ? `<div class="ctx-item" data-act="unpin"><span>Panelden Kaldır</span></div>` : ''}
        ${!isDynamic && !isAI ? `<div class="ctx-item" data-act="hide"><span>Panelden Gizle</span></div>` : ''}
        <div class="ctx-item" data-act="settings"><span>Panel Ayarları</span></div>
      `;
      document.body.appendChild(menu);
      const x = Math.min(e.clientX, window.innerWidth - 200);
      const y = Math.min(e.clientY, window.innerHeight - 160);
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
      menu.classList.add('open');

      const closeMenu = (ev) => {
        if (!menu.contains(ev.target)) {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }
      };
      setTimeout(() => document.addEventListener('click', closeMenu), 0);

      menu.addEventListener('click', (ev) => {
        const act = ev.target.closest('.ctx-item')?.getAttribute('data-act');
        if (!act) return;
        menu.remove();
        document.removeEventListener('click', closeMenu);
        if (act === 'open') {
          pinBtn.click();
        } else if (act === 'unpin') {
          const pinId = pinBtn.dataset && pinBtn.dataset.pinInternal;
          if (typeof AppPinManager !== 'undefined' && pinId) {
            const pins = AppPinManager.read(AppPinManager.TASKBAR_KEY);
            const pin = pins.find(p => p.id === pinId);
            if (pin) AppPinManager.toggleTaskbarPin(pin);
          }
        } else if (act === 'hide') {
          const hidden = JSON.parse(SafeStorage.getItem('ankora_hidden_pins') || '[]');
          if (!hidden.includes(pinBtn.id)) hidden.push(pinBtn.id);
          SafeStorage.setItem('ankora_hidden_pins', JSON.stringify(hidden));
          pinBtn.style.display = 'none';
          ReportManager?.showToast('Simge panelden gizlendi. Geri getirmek için Ayarlar > Alt Panel.');
        } else if (act === 'settings') {
          WindowManager.open('win-settings');
          document.querySelector('.settings-nav-item[data-pane="pane-set-panel"]')?.click();
        }
      });
    };

    // Gizlenmiş sabit pinler oturum açılışında uygulanır
    try {
      const hiddenPins = JSON.parse(SafeStorage.getItem('ankora_hidden_pins') || '[]');
      hiddenPins.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
    } catch (e) {}

    if (taskbarEl) {
      taskbarEl.addEventListener('contextmenu', (e) => {
        const pin = e.target.closest('.taskbar-pin-btn');
        if (pin) {
          window.showPinContextMenu(e, pin);
          return;
        }
        const interactive = e.target.closest('button, .task-tab, .tray-cell, .tray-status-island, .tray-icon-btn, .taskbar-ws-dots');
        if (interactive) return;
        e.preventDefault();
        if (typeof toggleQuickSettings === 'function') toggleQuickSettings();
        else if (qsFlyout) qsFlyout.classList.toggle('open');
      });
    }

    // 4. Evrensel Arama (LauncherSearch)
    if (startSearch) {
      let launcherSearchTimer = 0;
      let selectedResultIndex = -1;

      startSearch.addEventListener('input', (e) => {
        const value = e.target.value;
        selectedResultIndex = -1;
        clearTimeout(launcherSearchTimer);
        launcherSearchTimer = setTimeout(() => LauncherSearch.render(value), 100);
      });

      startSearch.addEventListener('keydown', (e) => {
        const rows = Array.from(document.querySelectorAll('#start-search-results .search-result-row'));
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (rows.length === 0) return;
          selectedResultIndex = (selectedResultIndex + 1) % rows.length;
          rows.forEach((r, idx) => r.classList.toggle('active', idx === selectedResultIndex));
          rows[selectedResultIndex]?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (rows.length === 0) return;
          selectedResultIndex = (selectedResultIndex - 1 + rows.length) % rows.length;
          rows.forEach((r, idx) => r.classList.toggle('active', idx === selectedResultIndex));
          rows[selectedResultIndex]?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
          clearTimeout(launcherSearchTimer);
          if (selectedResultIndex >= 0 && rows[selectedResultIndex]) {
            rows[selectedResultIndex].click();
          } else {
            LauncherSearch.render(startSearch.value);
            document.querySelector('#start-search-results .search-result-row')?.click();
          }
          selectedResultIndex = -1;
        }
      });

      document.getElementById('start-search-results')?.addEventListener('click', (e) => {
        const row = e.target.closest('.search-result-row');
        if (row) LauncherSearch.run(parseInt(row.getAttribute('data-i'), 10));
      });
    }

    // 5. Görev Çubuğu Hızlı Başlatıcı İkonları (Taskbar Quick Pins)
    const pinMap = [
      { id: 'quick-term-btn', win: 'win-terminal' },
      { id: 'quick-files-btn', win: 'win-files' },
      { id: 'quick-ayaz-browser-btn', win: 'win-browser' },
      { id: 'quick-brave-btn', launch: 'brave-browser' },
      { id: 'quick-browser-btn', win: 'win-browser' },
      { id: 'quick-screenshot-btn', win: 'win-screenshot' },
      { id: 'quick-store-btn', win: 'win-store' },
      { id: 'quick-calc-btn', win: 'win-calc' },
      { id: 'quick-settings-btn', win: 'win-settings' },
      // ARM: Karşılama simgesi "masaüstünü göster" yerine karşılama
      // penceresini açar; açık pencere kaybolmuş/boş ekranda gibi hissedilmesin.
      { id: 'tray-anchor-btn', action: 'welcome' }
    ];

    pinMap.forEach(item => {
      const el = document.getElementById(item.id);
      if (el) {
        el.addEventListener('click', () => {
          if (item.launch) {
            TauriBridge.invoke('launch_application', { exec: item.launch })
              .then(() => ReportManager.showToast('Brave Browser başlatıldı.'))
              .catch((err) => ReportManager.showToast(`Başlatılamadı: ${err.message || err}`));
            return;
          }
          if (item.action === 'show-desktop') {
            WindowManager.toggleShowDesktop();
            return;
          }
          // Karşılama (greeter): açık pencereyi yok etmeden karşılama penceresi
          // açılır; masa zaten bomboşsa (tıklayınca küçültülmüş pencereler varsa)
          // önceki pencereler geri getirilir.
          if (item.action === 'welcome') {
            const winsOpen = [...document.querySelectorAll('.window.open')]
              .some(w => !w.classList.contains('minimized'));
            if (!winsOpen && WindowManager._desktopHidden) {
              WindowManager.toggleShowDesktop();
            }
            WindowManager.open('win-welcome');
            return;
          }
          if (item.win) {
            WindowManager.open(item.win);
          }
        });
      }
    });

    const btnLaunchBrave = document.getElementById('btn-launch-brave-direct');
    if (btnLaunchBrave) {
      btnLaunchBrave.addEventListener('click', async () => {
        Terminal.log('[AYAZ] Brave Browser başlatılıyor...', 'cmd');
        try {
          await TauriBridge.invoke('launch_application', { exec: 'brave-browser' });
          ReportManager.showToast('Brave Web Tarayıcı başlatıldı.');
        } catch (e) {
          ReportManager.showToast(`Brave başlatılamadı: ${e.message || e}`);
        }
      });
    }

    const btnShowAllApps = document.getElementById('btn-show-all-apps');
    if (btnShowAllApps) {
      btnShowAllApps.addEventListener('click', () => {
        WindowManager.open('win-store');
        toggleStart(false);
      });
    }

    // 5. AYAZ DE HIZLI AYARLAR & EYLEM MERKEZİ (QUICK SETTINGS FLYOUT)
    const qsFlyout = document.getElementById('quick-settings-popover');
    const trayStatusIsland = document.getElementById('tray-status-island');
    const trayWifiBtn = document.getElementById('tray-wifi-btn');
    const trayVolBtn = document.getElementById('tray-volume-btn');
    const trayBatteryBtn = document.getElementById('tray-battery-btn');

    toggleQuickSettings = (forceState) => {
      if (!qsFlyout) return;
      const isOpen = typeof forceState === 'boolean' ? forceState : !qsFlyout.classList.contains('open');
      qsFlyout.classList.toggle('open', isOpen);
      if (isOpen && calFlyout) calFlyout.classList.remove('open');
    };

    // 5b. ANKORA AI MINI SOHBET (Görev Çubuğu Üstü Hızlı Sohbet)
    const aiMiniFlyout = document.getElementById('ai-mini-popover');
    const aiMiniBtn = document.getElementById('quick-ai-btn');

    window.toggleAiMiniChat = (forceState) => {
      if (!aiMiniFlyout) return;
      const isOpen = typeof forceState === 'boolean' ? forceState : !aiMiniFlyout.classList.contains('open');
      aiMiniFlyout.classList.toggle('open', isOpen);
      if (isOpen) {
        if (qsFlyout) qsFlyout.classList.remove('open');
        if (calFlyout) calFlyout.classList.remove('open');
        if (AIAgent.miniFeed && AIAgent.miniFeed.children.length === 0) {
          AIAgent.miniFeed.innerHTML = `
            <div class="ai-mini-entry m-bot">Merhaba. Buradan ajanla hızlıca yazışabilirsin; tam ayarlar ve eylem kartları için "Pencere" düğmesiyle tam ekrana geç.</div>
          `;
        }
        const miniInput = document.getElementById('ai-mini-input');
        if (miniInput) miniInput.focus();
      }
      if (typeof window.syncAiMiniWatch === 'function') window.syncAiMiniWatch();
      const userWindow = document.getElementById('win-ai');
      const winToggle = userWindow ? document.getElementById('ai-screen-toggle') : null;
      if (winToggle) winToggle.checked = AIAgent.watchScreen;
    };

    // Ekranı İzle açıkken ekranın çevresinde akan dalgalı mavi çizgi.
    // Tek tuş "Bak ve anlat" ise yalnız kısa süre yanıp söner.
    let aiWaveTimer = 0;
    window.setAiWatchWave = (on) => {
      const wave = document.getElementById('ai-watch-wave');
      if (!wave) return;
      if (on) {
        if (aiWaveTimer) { clearTimeout(aiWaveTimer); aiWaveTimer = 0; }
        wave.hidden = false;
      } else if (!AIAgent.watchScreen) {
        wave.hidden = true;
      }
    };
    window.flashAiWatchWave = (ms = 2600) => {
      const wave = document.getElementById('ai-watch-wave');
      if (!wave) return;
      if (aiWaveTimer) clearTimeout(aiWaveTimer);
      wave.hidden = false;
      aiWaveTimer = setTimeout(() => {
        aiWaveTimer = 0;
        if (!AIAgent.watchScreen) wave.hidden = true;
      }, ms);
    };

    // Mini balondaki "İzle" düğmesi, tam penceredeki anahtarla aynı
    // ankora_ai_watch tercihini paylaşır; ikisi hep senkron çalışır.
    window.syncAiMiniWatch = () => {
      const btn = document.getElementById('ai-mini-screen-toggle');
      if (btn) {
        btn.classList.toggle('active', AIAgent.watchScreen);
        btn.setAttribute('aria-pressed', AIAgent.watchScreen ? 'true' : 'false');
      }
      const status = document.getElementById('ai-mini-status');
      if (status) status.textContent = AIAgent.watchScreen ? 'Hazır · Ekranda İzliyor' : 'Hazır';
      window.setAiWatchWave(AIAgent.watchScreen);
    };

    if (aiMiniBtn && aiMiniFlyout) {
      const miniWatchBtn = document.getElementById('ai-mini-screen-toggle');
      if (miniWatchBtn) {
        miniWatchBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          AIAgent.watchScreen = !AIAgent.watchScreen;
          SafeStorage.setItem('ankora_ai_watch', AIAgent.watchScreen ? '1' : '0');
          const winToggle = document.getElementById('ai-screen-toggle');
          if (winToggle) winToggle.checked = AIAgent.watchScreen;
          window.syncAiMiniWatch();
          ReportManager?.showToast(AIAgent.watchScreen
            ? 'Ekran izleme: açık — her soruda ekran karesi ajana gider.'
            : 'Ekran izleme: kapalı.');
        });
      }
      aiMiniBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.toggleAiMiniChat();
      });

      // Sürükle-bırak: dosyayı mini balona bırak → özetle / XML / düzenle.
      AIAgent.bindFileDrop(aiMiniFlyout);

      // Görev çubuğundaki göz düğmesi: tek tuş "Bak ve anlat".
      const aiLookBtn = document.getElementById('quick-ai-look-btn');
      if (aiLookBtn) {
        aiLookBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          window.toggleAiMiniChat(true);
          AIAgent.lookAndTell();
        });
      }

      document.addEventListener('click', (e) => {
        if (!aiMiniFlyout.classList.contains('open')) return;
        if (!aiMiniFlyout.contains(e.target) && !aiMiniBtn.contains(e.target)) {
          window.toggleAiMiniChat(false);
        }
      });

      const miniInput = document.getElementById('ai-mini-input');
      const btnMiniSend = document.getElementById('btn-ai-mini-send');
      const miniSend = () => {
        if (!miniInput) return;
        const text = miniInput.value.trim();
        if (!text) return;
        miniInput.value = '';
        AIAgent.handleQuery(text);
      };
      if (btnMiniSend) btnMiniSend.addEventListener('click', miniSend);
      if (miniInput) {
        miniInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') miniSend();
        });
      }

      const btnMiniExpand = document.getElementById('btn-ai-mini-expand');
      if (btnMiniExpand) {
        btnMiniExpand.addEventListener('click', () => {
          window.toggleAiMiniChat(false);
          WindowManager.open('win-ai');
        });
      }
    }


    [trayStatusIsland, trayWifiBtn, trayVolBtn, trayBatteryBtn].forEach(el => {
      if (el) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleQuickSettings();
        });
      }
    });

    // 5.1 Hızlı Aç/Kapa Düğmeleri (Toggles)
    const qsWifi = document.getElementById('qs-wifi-toggle');
    if (qsWifi) {
      qsWifi.addEventListener('click', () => {
        const isActive = qsWifi.classList.toggle('active');
        const sub = qsWifi.querySelector('.qs-tile-sub');
        if (sub) sub.textContent = isActive ? 'Bağlı' : 'Kapalı';
        Terminal.log(`[AĞ] Wi-Fi: ${isActive ? 'Etkinleştirildi' : 'Devre Dışı'}`, 'cmd');
      });
    }

    const qsBt = document.getElementById('qs-bt-toggle');
    if (qsBt) {
      qsBt.addEventListener('click', () => {
        const isActive = qsBt.classList.toggle('active');
        const sub = qsBt.querySelector('.qs-tile-sub');
        if (sub) sub.textContent = isActive ? 'Açık' : 'Kapalı';
        Terminal.log(`[BLUETOOTH] Adaptör: ${isActive ? 'Açık' : 'Kapalı'}`, 'cmd');
      });
    }

    // qs-nightlight-toggle artık SettingsManager.updateNightState ile tam senkron yönetilir

    const qsTheme = document.getElementById('qs-theme-toggle');
    if (qsTheme) {
      qsTheme.addEventListener('click', () => {
        const lights = (typeof ThemeManager.LIGHT_THEMES !== 'undefined') ? ThemeManager.LIGHT_THEMES : ['theme-light'];
        const isLight = lights.some(cls => document.body.classList.contains(cls));
        ThemeManager.setTheme(isLight ? 'theme-dark' : 'theme-light');
        const sub = document.getElementById('qs-theme-sub');
        if (sub) sub.textContent = isLight ? 'Koyu Mod' : 'Açık Mod';
        qsTheme.classList.toggle('active', !isLight);
      });
    }

    const qsFocus = document.getElementById('qs-focus-toggle');
    if (qsFocus) {
      qsFocus.addEventListener('click', () => {
        const isActive = qsFocus.classList.toggle('active');
        const sub = document.getElementById('qs-focus-sub');
        if (sub) sub.textContent = isActive ? 'Açık' : 'Kapalı';
        Terminal.log(`[ODAKLANMA] Bildirim kalkanı: ${isActive ? 'Açık (Sessiz mod)' : 'Kapalı'}`, 'cmd');
      });
    }

    const qsBattery = document.getElementById('qs-battery-saver');
    if (qsBattery) {
      qsBattery.addEventListener('click', () => {
        const isActive = qsBattery.classList.toggle('active');
        const sub = document.getElementById('qs-saver-sub');
        if (sub) sub.textContent = isActive ? 'Açık' : 'Kapalı';
        Terminal.log(`[GÜÇ] Pil tasarruf modu: ${isActive ? 'Devrede' : 'Standart'}`, 'cmd');
      });
    }

    // 5.2 Ses ve Parlaklık Kaydırıcıları
    const quickVolSlider = document.getElementById('quick-volume-slider');
    const quickVolLabel = document.getElementById('quick-volume-label');
    const btnMuteVol = document.getElementById('btn-mute-volume');

    if (quickVolSlider) {
      let quickVolTimer = 0;
      quickVolSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        if (quickVolLabel) quickVolLabel.textContent = `%${val}`;
        if (trayVolBtn) trayVolBtn.title = `Ses Çıkışı: %${val}`;
        const settingsVol = document.getElementById('ctrl-volume');
        const settingsVolLabel = document.getElementById('volume-val-label');
        if (settingsVol) settingsVol.value = val;
        if (settingsVolLabel) settingsVolLabel.textContent = `%${val}`;
        clearTimeout(quickVolTimer);
        quickVolTimer = setTimeout(() => {
          TauriBridge.invoke('set_volume', { level: parseInt(val, 10) }).catch((err) => {
            ReportManager.showToast(`Ses düzeyi ayarlanamadı: ${err.message || err}`, 'error');
          });
        }, 150);
      });
    }

    if (btnMuteVol && quickVolSlider) {
      let prevVol = '84';
      btnMuteVol.addEventListener('click', () => {
        if (quickVolSlider.value !== '0') {
          prevVol = quickVolSlider.value;
          quickVolSlider.value = '0';
        } else {
          quickVolSlider.value = prevVol;
        }
        quickVolSlider.dispatchEvent(new Event('input'));
      });
    }

    const quickBrightSlider = document.getElementById('quick-brightness-slider');
    const quickBrightLabel = document.getElementById('quick-brightness-label');
    const screenDimmer = document.getElementById('screen-dimmer');

    if (quickBrightSlider) {
      let quickBrightTimer = 0;
      quickBrightSlider.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        if (quickBrightLabel) quickBrightLabel.textContent = `%${val}`;
        if (screenDimmer) {
          const dimPct = ((100 - val) / 100) * 0.75;
          screenDimmer.style.opacity = dimPct.toFixed(2);
        }
        // Ayarlar panelindeki kaydırıcı ve kalıcılık bu değere bağlı.
        const settingsBright = document.getElementById('ctrl-brightness');
        const settingsBrightLabel = document.getElementById('brightness-val-label');
        if (settingsBright) settingsBright.value = String(val);
        if (settingsBrightLabel) settingsBrightLabel.textContent = `%${val}`;
        SafeStorage.setItem('ankora_brightness', String(val));
        clearTimeout(quickBrightTimer);
        quickBrightTimer = setTimeout(() => {
          TauriBridge.invoke('set_brightness', { level: val }).catch(() => {});
        }, 200);
      });
    }

    const btnQsSettings = document.getElementById('btn-qs-settings');
    if (btnQsSettings) {
      btnQsSettings.addEventListener('click', () => {
        WindowManager.open('win-settings');
        toggleQuickSettings(false);
      });
    }

    const btnQsUpdater = document.getElementById('btn-qs-updater');
    if (btnQsUpdater) {
      btnQsUpdater.addEventListener('click', () => {
        WindowManager.open('win-updater');
        toggleQuickSettings(false);
      });
    }

    // 5.3 AYAZ DE TAKVİM & BİLDİRİM MERKEZİ (CALENDAR FLYOUT)
    toggleCalendar = (forceState) => {
      if (!calFlyout) return;
      const isOpen = typeof forceState === 'boolean' ? forceState : !calFlyout.classList.contains('open');
      calFlyout.classList.toggle('open', isOpen);
      if (isOpen && qsFlyout) qsFlyout.classList.remove('open');
      if (isOpen) {
        renderCalendar();
        renderTodayPlan();
      }
    };

    let calYear = new Date().getFullYear();
    let calMonth = new Date().getMonth();

    const renderCalendar = () => {
      const grid = document.getElementById('cal-grid');
      const title = document.getElementById('cal-month-title');
      if (!grid || !title) return;

      const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
      title.textContent = `${months[calMonth]} ${calYear}`;

      grid.innerHTML = `
        <span class="cal-day-name">Pz</span>
        <span class="cal-day-name">Sa</span>
        <span class="cal-day-name">Ça</span>
        <span class="cal-day-name">Pe</span>
        <span class="cal-day-name">Cu</span>
        <span class="cal-day-name">Ct</span>
        <span class="cal-day-name">Pz</span>
      `;

      const firstDayIndex = new Date(calYear, calMonth, 1).getDay();
      const offset = (firstDayIndex === 0 ? 7 : firstDayIndex) - 1;
      const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
      const prevMonthDays = new Date(calYear, calMonth, 0).getDate();

      // Önceki aydan taşan günler
      for (let i = offset - 1; i >= 0; i--) {
        const d = document.createElement('span');
        d.className = 'cal-day-num muted';
        d.textContent = String(prevMonthDays - i);
        grid.appendChild(d);
      }

      // Bu ayın günleri
      const today = new Date();
      for (let day = 1; day <= daysInMonth; day++) {
        const d = document.createElement('span');
        d.className = 'cal-day-num';
        if (day === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear()) {
          d.classList.add('today');
        }
        d.textContent = String(day);
        grid.appendChild(d);
      }
    };

    // "Bugün Ne Var": TODO widget'ındaki açık görevler + varsa saatleri.
    // Takvim açıldığında ve görevler değiştiğinde tazelenir.
    const renderTodayPlan = () => {
      const list = document.getElementById('cal-today-list');
      const count = document.getElementById('cal-today-count');
      if (!list) return;

      let items = [];
      try {
        items = JSON.parse(SafeStorage.getItem('ankora_todo_items') || '[]') || [];
      } catch (e) { items = []; }

      const now = new Date();
      const sameDay = (d) => d && !isNaN(d.getTime())
        && d.getFullYear() === now.getFullYear()
        && d.getMonth() === now.getMonth()
        && d.getDate() === now.getDate();

      const open = items.filter(it => !it.done).map(it => {
        const text = String(it.t || '');
        const at = it.at ? new Date(it.at) : null;
        let clock = '';
        if (at && !isNaN(at.getTime())) {
          clock = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
        } else {
          const m = text.match(/^(\d{1,2}:\d{2})\s*·?/);
          if (m) clock = m[1];
        }
        return { text, clock, at };
      }).filter(it => !it.at || sameDay(it.at));

      open.sort((a, b) => {
        if (a.clock && b.clock) return a.clock.localeCompare(b.clock);
        if (a.clock) return -1;
        if (b.clock) return 1;
        return a.text.localeCompare(b.text, 'tr');
      });

      list.textContent = '';
      if (!open.length) {
        const empty = document.createElement('div');
        empty.className = 'cal-today-empty';
        empty.textContent = 'Bugün için açık görev yok.';
        list.appendChild(empty);
      } else {
        open.slice(0, 8).forEach(it => {
          const row = document.createElement('div');
          row.className = 'cal-today-item';
          if (it.clock) {
            const clock = document.createElement('span');
            clock.className = 'cal-today-clock';
            clock.textContent = it.clock;
            row.appendChild(clock);
          }
          const label = document.createElement('span');
          label.textContent = it.text.replace(/^\d{1,2}:\d{2}\s*·?\s*/, '') || it.text;
          row.appendChild(label);
          list.appendChild(row);
        });
      }
      if (count) count.textContent = open.length ? `${open.length} açık` : 'temiz';
    };
    window.refreshDayPlan = () => {
      try {
        renderTodayPlan();
        if (typeof WidgetManager !== 'undefined' && WidgetManager.paintDayPlan) {
          WidgetManager.paintDayPlan();
        }
      } catch (e) {}
    };

    const calPrev = document.getElementById('cal-prev-month');
    const calNext = document.getElementById('cal-next-month');
    if (calPrev) {
      calPrev.addEventListener('click', (e) => {
        e.stopPropagation();
        calMonth--;
        if (calMonth < 0) { calMonth = 11; calYear--; }
        renderCalendar();
      });
    }
    if (calNext) {
      calNext.addEventListener('click', (e) => {
        e.stopPropagation();
        calMonth++;
        if (calMonth > 11) { calMonth = 0; calYear++; }
        renderCalendar();
      });
    }

    const btnClearNotifs = document.getElementById('btn-clear-notifs');
    if (btnClearNotifs) {
      btnClearNotifs.addEventListener('click', (e) => {
        e.stopPropagation();
        const list = document.getElementById('cal-notif-list');
        if (list) {
          list.innerHTML = '<div style="padding:10px;text-align:center;font-size:11px;color:var(--text-muted);">Yeni bildirim yok.</div>';
        }
      });
    }


    // Genel Dış Tıklama İle Menüleri Kapatma (Dismiss Outside Clicks)
    document.addEventListener('click', (e) => {
      if (qsFlyout && !qsFlyout.contains(e.target) && trayStatusIsland && !trayStatusIsland.contains(e.target)) {
        qsFlyout.classList.remove('open');
      }
      if (calFlyout && !calFlyout.contains(e.target) && trayClock && !trayClock.contains(e.target)) {
        calFlyout.classList.remove('open');
      }
      const snapMenu = document.getElementById('snap-layouts-menu');
      if (snapMenu && !snapMenu.contains(e.target)) {
        snapMenu.classList.remove('open');
      }
    });

    // 6. Güç ve Kilit Aksiyonları (Gerçek Linux Kapatma & Yeniden Başlatma)
    // 6. Güç ve Kilit Aksiyonları — PowerDialog üzerinden onaylı yürütülür

    const lockBtns = [document.getElementById('btn-lock')].filter(Boolean);
    lockBtns.forEach(btn => {
      if (btn) {
        btn.addEventListener('click', () => {
          toggleStart(false);
          if (typeof LockManager !== 'undefined') {
            LockManager.lock();
          }
        });
      }
    });

    // 7. Saat ve Tarih (Desktop Preview: 16:48 | Sal, 24 Eki 2023)
    const trayClock = document.getElementById('tray-clock');
    if (trayClock) {
      trayClock.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCalendar();
      });
    }

    const updateTime = () => {
      const now = new Date();
      if (!trayClock) return;

      // Saat biçimi panel tercihlerine (12/24 saat, saniye, kısa tarih) uyar.
      const prefs = (typeof PanelPrefs !== 'undefined' && PanelPrefs.state) || { clock24: true, clockSeconds: false, showDate: false };
      let hh = now.getHours();
      let suffix = '';
      if (!prefs.clock24) {
        suffix = hh >= 12 ? ' PM' : ' AM';
        hh = hh % 12 || 12;
      }
      const h = prefs.clock24 ? String(hh).padStart(2, '0') : String(hh);
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      const days = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
      const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
      const dayStr = days[now.getDay()];
      const dateNum = now.getDate();
      const monthStr = months[now.getMonth()];
      const yearNum = now.getFullYear();
      const timeStr = `${h}:${m}${prefs.clockSeconds ? `:${s}` : ''}${suffix}`;

      // Saniyede bir aynı metni yazmak boşuna biçimlendirme çalıştırır.
      // Bu metinler ancak dakika ya da gün değişince değişir.
      // Çubukta yalnız saat durur; tam tarih takvim popover'unda yazılı.
      const clockStr = prefs.showDate ? `${timeStr} • ${dateNum} ${monthStr}` : timeStr;
      if (trayClock.textContent !== clockStr) trayClock.textContent = clockStr;

      const bigTime = document.getElementById('cal-time-big');
      if (bigTime && bigTime.textContent !== timeStr) bigTime.textContent = timeStr;

      const fullStr = `${dateNum} ${monthStr} ${yearNum}, ${dayStr}`;
      const fullDate = document.getElementById('cal-date-full');
      if (fullDate && fullDate.textContent !== fullStr) fullDate.textContent = fullStr;
    };
    setInterval(updateTime, 1000);
    updateTime();

    // 8. Masaüstü Sağ Tık Bağlam Menüsü (Desktop Context Menu)
    const desktop = document.getElementById('desktop-workspace') || document.querySelector('.desktop-workspace');
    let ctxMenu = document.getElementById('desktop-context-menu');
    if (desktop && !ctxMenu) {
      ctxMenu = document.createElement('div');
      ctxMenu.id = 'desktop-context-menu';
      ctxMenu.className = 'desktop-context-menu';
      ctxMenu.innerHTML = `
        <div class="ctx-item" data-action="term">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
          <span>Yeni Terminal Aç</span>
        </div>
        <div class="ctx-item" data-action="office">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
          <span>Ankora Office</span>
        </div>
        <div class="ctx-item" data-action="updater">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
          <span>Ayaz Güncelleyici</span>
        </div>
        <div class="ctx-item" data-action="wallpaper">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
          <span>Duvar Kağıdını Değiştir</span>
        </div>
        <div class="ctx-divider"></div>
        <div class="ctx-item" data-action="toggle-icons">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
          <span>Masaüstü Simgelerini Gizle / Göster</span>
        </div>
        <div class="ctx-item" data-action="settings">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          <span>Sistem Ayarları</span>
        </div>
      `;
      document.body.appendChild(ctxMenu);
    }

    // Menünün işareti index.html'de hazır duruyor; bu yüzden oluşturma bloğu
    // çoğu oturumda hiç çalışmaz. Dinleyiciler ayrı blokta, menü varsa bağlanır.
    if (desktop && ctxMenu) {
      desktop.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.window') || e.target.closest('#taskbar') || e.target.closest('#start-flyout')) return;
        e.preventDefault();
        const x = Math.min(e.clientX, window.innerWidth - 240);
        const y = Math.min(e.clientY, window.innerHeight - 250);
        ctxMenu.style.left = `${x}px`;
        ctxMenu.style.top = `${y}px`;
        ctxMenu.classList.add('open');
        // Alt menü her açılışta kapalı başlar.
        ctxMenu.querySelectorAll('.ctx-submenu-list').forEach(l => l.classList.remove('open'));
      });

      // Alt menü tetikleyicisi: hover + tık. Konum, tetikleyicinin sağ yanına
      // hesaplanır; ekran sağına taşarsa sola açılır.
      ctxMenu.querySelectorAll('.ctx-item.ctx-submenu').forEach(trig => {
        const list = ctxMenu.querySelector(`#submenu-${trig.getAttribute('data-submenu')}`);
        if (!list) return;
        const openSub = () => {
          const rect = trig.getBoundingClientRect();
          const menuRect = ctxMenu.getBoundingClientRect();
          list.style.left = `${trig.offsetWidth - 6}px`;
          list.style.top = `${Math.max(0, rect.top - menuRect.top - 6)}px`;
          const w = list.offsetWidth || 170;
          if (window.innerWidth - rect.right < w) list.style.left = `${-w - 8}px`;
          list.classList.add('open');
        };
        trig.addEventListener('mouseenter', openSub);
        trig.addEventListener('click', () => {
          if (list.classList.contains('open')) {
            list.classList.remove('open');
          } else {
            openSub();
          }
        });
        list.addEventListener('mouseleave', () => list.classList.remove('open'));
      });

      document.addEventListener('click', (e) => {
        if (ctxMenu && !ctxMenu.contains(e.target)) {
          ctxMenu.classList.remove('open');
          ctxMenu.querySelectorAll('.ctx-submenu-list').forEach(l => l.classList.remove('open'));
        }
      });

      ctxMenu.querySelectorAll('.ctx-item').forEach(item => {
        item.addEventListener('click', () => {
          const act = item.getAttribute('data-action');
          ctxMenu.classList.remove('open');
          if (act === 'files') {
            WindowManager.open('win-files');
          } else if (act === 'new-folder') {
            const folderName = prompt('Masaüstünde yeni klasör adı:', 'Yeni Klasör');
            if (folderName && folderName.trim()) {
              const clean = folderName.trim().replace(/[\\/:*?"<>|\0]/g, '');
              if (clean) {
                const home = (typeof DesktopFiles !== 'undefined' && DesktopFiles.dir)
                  ? DesktopFiles.dir
                  : ((typeof FileManager !== 'undefined' && FileManager.userHome) ? FileManager.userHome : '/home/ankora');
                const fullPath = `${home}/${clean}`;
                TauriBridge.invoke('create_folder', { path: fullPath })
                  .then(() => {
                    Terminal.log(`[MASAÜSTÜ] Klasör oluşturuldu: ${clean}`, 'success');
                    if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
                      ReportManager.showToast(`'${clean}' klasörü masaüstünde oluşturuldu.`);
                    }
                    if (typeof FileManager !== 'undefined') FileManager.refresh();
                    if (typeof DesktopFiles !== 'undefined' && DesktopFiles.refresh) DesktopFiles.refresh();
                  })
                  .catch((err) => {
                    alert(`Klasör oluşturulamadı: ${err.message || err}`);
                  });
              }
            }
          } else if (act === 'new-text') {
            const docName = prompt('Yeni metin belgesi adı:', 'Yeni Belge.txt');
            if (docName && docName.trim()) {
              const clean = docName.trim().replace(/[\\/:*?"<>|\0]/g, '');
              if (clean) {
                const home = (typeof DesktopFiles !== 'undefined' && DesktopFiles.dir)
                  ? DesktopFiles.dir
                  : ((typeof FileManager !== 'undefined' && FileManager.userHome) ? FileManager.userHome : '/home/ankora');
                const fullPath = `${home}/${clean}`;
                TauriBridge.invoke('write_text_file', { path: fullPath, content: '' })
                  .then(() => {
                    Terminal.log(`[MASAÜSTÜ] Metin belgesi oluşturuldu: ${clean}`, 'success');
                    if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
                      ReportManager.showToast(`'${clean}' belgesi masaüstünde oluşturuldu.`);
                    }
                    if (typeof FileManager !== 'undefined') FileManager.refresh();
                    if (typeof DesktopFiles !== 'undefined' && DesktopFiles.refresh) DesktopFiles.refresh();
                  })
                  .catch(() => {
                    WindowManager.open('win-notepad');
                  });
              }
            }
          } else if (act === 'new-group') {
            const groupName = prompt('Masaüstü kategorisi adı:', 'Yeni Kategori');
            if (groupName && groupName.trim() && typeof XdgDesktopEngine !== 'undefined') {
              const group = XdgDesktopEngine.createGroup(groupName);
              XdgDesktopEngine.renderToDesktop();
              if (typeof DesktopFiles !== 'undefined' && DesktopFiles.refresh) DesktopFiles.refresh();
              ReportManager?.showToast(`'${group.name}' kategorisi oluşturuldu. Uygulamaları üzerine sürükleyin.`);
            }
          } else if (act === 'term') {
            WindowManager.open('win-terminal');
          } else if (act === 'paste-desktop') {
            const clips = (typeof FileManager !== 'undefined' && Array.isArray(FileManager.clipboard)) ? FileManager.clipboard : [];
            if (!clips.length) {
              ReportManager?.showToast('Panoda öge yok.', 'error');
            } else {
              const dest = (typeof DesktopFiles !== 'undefined' && DesktopFiles.dir) ? DesktopFiles.dir : '';
              const wasCut = FileManager.clipboardOp === 'cut';
              if (dest) {
                clips.forEach(cl => {
                  TauriBridge.invoke('copy_path_c', { sourcePath: cl.path, destPath: dest, moveOp: wasCut })
                    .then(m => ReportManager?.showToast(m || 'Yapıştırıldı.'))
                    .catch(err => ReportManager?.showToast(`Yapıştırılamadı: ${err.message || err}`, 'error'));
                });
                if (wasCut) { FileManager.clipboard = []; FileManager.clipboardOp = null; }
                setTimeout(() => { if (typeof DesktopFiles !== 'undefined' && DesktopFiles.refresh) DesktopFiles.refresh(); }, 400);
              } else {
                ReportManager?.showToast('Masaüstü dizini çözülemedi.', 'error');
              }
            }
          } else if (act === 'align-icons') {
            if (typeof XdgDesktopEngine !== 'undefined') {
              XdgDesktopEngine.alignDesktopIcons();
            }
          } else if (act === 'auto-arrange') {
            if (typeof XdgDesktopEngine !== 'undefined') {
              XdgDesktopEngine.sortDesktopIcons('name');
            }
          } else if (act === 'sort-icons') {
            const criterion = item.getAttribute('data-criterion') || 'name';
            if (typeof XdgDesktopEngine !== 'undefined') {
              XdgDesktopEngine.sortDesktopIcons(criterion);
            }
          } else if (act === 'wallpaper') {
            WindowManager.open('win-settings');
            document.querySelector('.settings-nav-item[data-pane="pane-set-theme"]')?.click();
          } else if (act === 'display') {
            WindowManager.open('win-settings');
            document.querySelector('.settings-nav-item[data-pane="pane-set-display"]')?.click();
          } else if (act === 'settings') {
            WindowManager.open('win-settings');
          } else if (act === 'toggle-icons') {
            const icons = document.getElementById('dynamic-desktop-icons');
            if (icons) {
              const isHidden = icons.style.display === 'none';
              icons.style.display = isHidden ? '' : 'none';
              if (isHidden && typeof XdgDesktopEngine !== 'undefined') XdgDesktopEngine.layoutDesktopIcons(icons);
              Terminal.log(`[MASAÜSTÜ] Simgeler: ${isHidden ? 'Görünür' : 'Gizlendi'}`, 'cmd');
            }
          }
        });
      });
    }
  }

  // ============================================================================
  // 10b. BAŞLAT MENÜSÜ DÜZENLEYİCİ (START MENU EDITOR)
  // ============================================================================
  const MenuEditor = {
    init() {
      const win = document.getElementById('win-menu-editor');
      if (!win) return;

      const btnRescan = document.getElementById('me-btn-rescan');
      const search = document.getElementById('me-search');
      if (btnRescan) {
        btnRescan.addEventListener('click', async () => {
          btnRescan.disabled = true;
          try {
            let ok = false;
            if (typeof XdgDesktopEngine !== 'undefined' && XdgDesktopEngine.rescanXdgApps) {
              await XdgDesktopEngine.rescanXdgApps(false);
              ok = true;
            }
            ReportManager.showToast(ok ? 'Uygulama listesi tarandı.' : 'Tarama başlatılamadı.');
          } catch (e) {
            ReportManager.showToast(`Tarama hatası: ${e.message || e}`);
          } finally {
            btnRescan.disabled = false;
          }
          this.render();
        });
      }
      if (search) {
        search.addEventListener('input', () => this.render());
      }

      // WindowManager.open("win-menu-editor") ilk açılışta liste doldursun.
      win.addEventListener('transitionend', () => {
        if (win.classList.contains('open')) this.render();
      }, { once: false });

      // Kurulum listesi değişince menü düzenleyicisi açıkken tabloyu tazele.
      document.addEventListener('ayaz-apps-changed', () => {
        if (win.classList.contains('open')) this.render();
      });
    },

    open() {
      WindowManager.open('win-menu-editor');
      setTimeout(() => this.render(), 120);
    },

    render() {
      const listEl = document.getElementById('me-list');
      const statusEl = document.getElementById('me-footer-status');
      const search = document.getElementById('me-search');
      if (!listEl || typeof XdgDesktopEngine === 'undefined') return;

      const q = (search ? search.value : '').trim().toLocaleLowerCase('tr');
      listEl.innerHTML = '';

      const apps = (XdgDesktopEngine.installedApps || []).filter(a => !q || a.name.toLocaleLowerCase('tr').includes(q));

      if (!apps.length) {
        listEl.innerHTML = '<div style="padding: 18px; text-align: center; color: var(--text-muted, #64748b); font-size: 12px;">Uygulama bulunamadı.</div>';
        if (statusEl) statusEl.textContent = '—';
        return;
      }

      const frag = document.createDocumentFragment();
      apps.forEach(app => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;';

        const nameCell = document.createElement('div');
        nameCell.style.cssText = 'flex:1;min-width:0;';
        nameCell.innerHTML = `<div style="font-size:12.5px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(app.name)}</div>
          <div style="font-size:10.5px;color:var(--text-muted,#64748b);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(app.exec || app.id)}</div>`;

        const btnMenu = document.createElement('button');
        btnMenu.className = 'btn btn-secondary btn-sm';
        btnMenu.style.cssText = 'padding:5px 10px;font-size:11px;';
        const menuHidden = app.is_menu_hidden === true;
        btnMenu.textContent = menuHidden ? 'Menüde Göster' : 'Menüde Gizle';
        btnMenu.addEventListener('click', () => {
          this.setAppFlag(app, 'is_menu_hidden', !menuHidden);
        });

        const btnDesk = document.createElement('button');
        btnDesk.className = 'btn btn-secondary btn-sm';
        btnDesk.style.cssText = 'padding:5px 10px;font-size:11px;';
        const onDesk = app.on_desktop !== false;
        btnDesk.textContent = onDesk ? 'Masaüstünden Kaldır' : 'Masaüstüne Ekle';
        btnDesk.addEventListener('click', () => {
          this.setAppFlag(app, 'on_desktop', onDesk ? false : true);
        });

        const btnDel = document.createElement('button');
        btnDel.className = 'btn btn-secondary btn-sm ctx-danger';
        btnDel.style.cssText = 'padding:5px 10px;font-size:11px;color:#ef4444;';
        btnDel.title = 'Kısayolu (masaüstü + başlat menüsü girdisi) kaldırır';
        btnDel.textContent = 'Kısayolu Kaldır';
        btnDel.addEventListener('click', () => {
          if (!confirm(`'${app.name}' kısayolu kaldırılsın mı? (Mağaza kurulumluysa paket de kaldırılır)`)) return;
          try {
            if (typeof XdgDesktopEngine !== 'undefined' && XdgDesktopEngine.removeApplication) {
              XdgDesktopEngine.removeApplication(app.id);
              ReportManager.showToast(`'${app.name}' kısayolu kaldırıldı.`);
              document.dispatchEvent(new CustomEvent('ayaz-apps-changed'));
            }
          } catch (e) {
            ReportManager.showToast(`Kaldırma hatası: ${e.message || e}`);
          }
        });

        row.appendChild(nameCell);
        row.appendChild(btnMenu);
        row.appendChild(btnDesk);
        row.appendChild(btnDel);
        frag.appendChild(row);
      });
      listEl.appendChild(frag);

      if (statusEl) statusEl.textContent = `${apps.length} uygulama listede görünüyor.`;
    },

    setAppFlag(app, key, value) {
      if (typeof XdgDesktopEngine === 'undefined') return;
      XdgDesktopEngine.installedApps.forEach(a => {
        if (a.id === app.id) a[key] = value;
      });
      try { SafeStorage.setItem('ankora_xdg_apps', JSON.stringify(XdgDesktopEngine.installedApps)); } catch (e) {}
      if (typeof XdgDesktopEngine.renderToStartMenu === 'function') XdgDesktopEngine.renderToStartMenu();
      if (typeof XdgDesktopEngine.renderToDesktop === 'function') XdgDesktopEngine.renderToDesktop();
      ReportManager.showToast(`'${app.name}' güncellendi.`);
      this.render();
    }
  };

  // ============================================================================
  // 10c. SİSTEM KULLANICI YÖNETİCİSİ (USERS MANAGER)
  // Kullanıcı listesi/ekleme/kaldırma Rust üzerindeki güvenli onaylı
  // komutlar (list_system_users / system_user_add / system_user_remove)
  // üzerinden yürütülür; terminal beyaz listesi budaklı kalmaz.
  // ============================================================================
  const UsersManager = {
    users: [],
    currentUserId: null,

    async init() {
      const btnRefresh = document.getElementById('btn-users-refresh');
      const btnAdd = document.getElementById('btn-user-add');
      if (btnRefresh) btnRefresh.addEventListener('click', () => this.refresh());
      if (btnAdd) btnAdd.addEventListener('click', () => this.addUser());

      // Ayarlar penceresi açıldığında kullanıcı listesi tazele.
      const win = document.getElementById('win-settings');
      if (win) {
        win.addEventListener('transitionend', () => {
          if (win.classList.contains('open')) this.refresh();
        }, { once: false });
        win.addEventListener('click', (e) => {
          if (e.target.closest('.settings-nav-item[data-pane="pane-set-users"]')) {
            setTimeout(() => this.refresh(), 120);
          }
        });
      }
      this.refresh();
    },

    async refresh() {
      const labelCurrent = document.getElementById('users-current-info');
      const statusEl = document.getElementById('users-list-status');
      const listEl = document.getElementById('users-list');
      if (!listEl) return;

      try {
        const me = await TauriBridge.invoke('system_user_info', {});
        this.currentUserId = me ? me.username : null;
        if (labelCurrent) {
          labelCurrent.textContent = `${me.username} (UID ${me.uid})${me.full_name ? ' — ' + me.full_name : ''}; ${me.in_sudo_group ? 'Yönetici grubunda (sudo)' : 'Standart kullanıcı'}`;
        }
      } catch (e) {
        if (labelCurrent) labelCurrent.textContent = 'Bilgi alınamadı: ' + (e.message || e);
      }

      try {
        const users = await TauriBridge.invoke('list_system_users');
        this.users = Array.isArray(users) ? users : [];
        if (statusEl) statusEl.textContent = `${this.users.length} kullanıcı hesabı bulundu.`;

        listEl.innerHTML = '';
        if (!this.users.length) {
          listEl.innerHTML = '<div style="padding:10px;color:var(--text-muted,#64748b);font-size:12px;text-align:center;">Kullanıcı hesabı görünmüyor.</div>';
          return;
        }

        this.users.forEach(u => {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;';

          const info = document.createElement('div');
          info.style.cssText = 'flex:1;min-width:0;';
          info.innerHTML = `<div style="font-size:12.5px;font-weight:600;color:#fff;">${escapeHtml(u.username)}${u.is_current ? ' <span style="font-weight:400;font-size:10.5px;color:#38bdf8;">(bu oturum)</span>' : ''}${u.in_sudo_group ? ' <span style="font-weight:400;font-size:10.5px;color:#fbbf24;">sudo</span>' : ''}</div>
            <div style="font-size:10.5px;color:var(--text-muted,#64748b);">UID ${u.uid} · ${escapeHtml(u.shell || '')}</div>`;

          const btnDel = document.createElement('button');
          btnDel.className = 'btn btn-secondary btn-sm';
          btnDel.style.cssText = 'padding:5px 10px;font-size:11px;color:#ef4444;';
          btnDel.textContent = 'Kaldır';
          btnDel.disabled = !!u.is_current;
          btnDel.title = u.is_current ? 'Aktif oturum kullanıcı hesabı kaldırılamaz.' : 'Kullanıcı hesabını ve ev dizinini kaldırır';
          btnDel.addEventListener('click', async () => {
            if (!confirm(`'${u.username}' kullanıcı hesabı ve ev dizini kaldırılsın mı?`)) return;
            try {
              const msg = await TauriBridge.invoke('system_user_remove', { username: u.username });
              ReportManager.showToast(msg || 'Kullanıcı kaldırıldı.');
              this.refresh();
            } catch (err) {
              ReportManager.showToast(`Kaldırılamadı: ${err.message || err}`);
            }
          });

          row.appendChild(info);
          row.appendChild(btnDel);
          listEl.appendChild(row);
        });
      } catch (e) {
        if (statusEl) statusEl.textContent = 'Liste alınamadı: ' + (e.message || e);
      }
    },

    async addUser() {
      const nameEl = document.getElementById('ctrl-user-name');
      const passEl = document.getElementById('ctrl-user-pass');
      const fullEl = document.getElementById('ctrl-user-fullname');
      if (!nameEl || !passEl) return;

      const username = (nameEl.value || '').trim();
      const password = passEl.value || '';
      const fullName = (fullEl && fullEl.value || '').trim();

      if (!username) { ReportManager.showToast('Kullanıcı adı boş olamaz.'); return; }
      if (!password) { ReportManager.showToast('Parola boş olamaz.'); return; }

      try {
        const msg = await TauriBridge.invoke('system_user_add', { username, password, fullName: fullName || null });
        ReportManager.showToast(msg || 'Kullanıcı oluşturuldu.');
        nameEl.value = '';
        passEl.value = '';
        if (fullEl) fullEl.value = '';
        this.refresh();
      } catch (e) {
        ReportManager.showToast(`Kullanıcı oluşturulamadı: ${e.message || e}`);
      }
    }
  };

  // Başlat menüsü sağ tık menüsü (#start-menu-context)
  {
    const startFlyout = document.getElementById('start-flyout');
    const startCtx = document.getElementById('start-menu-context');
    if (startFlyout && startCtx) {
      startFlyout.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.pinned-app-card, .dynamic-installed-app')) return;
        e.preventDefault();
        startCtx.querySelectorAll('.ctx-submenu-list').forEach(l => l.classList.remove('open'));
        const x = Math.min(e.clientX, window.innerWidth - 240);
        const y = Math.min(e.clientY, window.innerHeight - 130);
        startCtx.style.left = `${x}px`;
        startCtx.style.top = `${y}px`;
        startCtx.classList.add('open');
      });
      // Kalıcı menü boyutu oturum açılışında uygulanır
      try {
        const savedScale = SafeStorage.getItem('ankora_menu_size');
        if (savedScale) document.querySelectorAll('.start-flyout').forEach(f => { f.style.zoom = savedScale; });
      } catch (e) {}
      document.addEventListener('click', (e) => {
        if (!startCtx.contains(e.target)) startCtx.classList.remove('open');
      });
      startCtx.querySelectorAll('.ctx-item').forEach(item => {
        item.addEventListener('click', () => {
          const act = item.getAttribute('data-action');
          startCtx.classList.remove('open');
          if (act === 'menu-editor') {
            MenuEditor.open();
          } else if (act === 'menu-size') {
            const level = prompt('Menü boyutu: 1 = Küçük, 2 = Olağan, 3 = Büyük', '2');
            const scaleMap = { '1': '0.85', '2': '1', '3': '1.18' };
            const scale = scaleMap[String(level).trim()] || '1';
            document.querySelectorAll('.start-flyout').forEach(f => { f.style.zoom = scale; });
            SafeStorage.setItem('ankora_menu_size', scale);
            ReportManager.showToast(`Menü boyutu: ${scale === '1' ? 'Olağan' : (scale === '0.85' ? 'Küçük' : 'Büyük')}`);
          } else if (act === 'menu-rescan') {
            if (typeof XdgDesktopEngine !== 'undefined' && XdgDesktopEngine.rescanXdgApps) {
              XdgDesktopEngine.rescanXdgApps(false);
              ReportManager.showToast('Uygulama listesi taranıyor…');
            }
          }
        });
      });
    }
  }

  // ============================================================================
  // 11. ANKORA GÜNCELLEYİCİ (ANKORA DE UPDATE MANAGER)
  // ============================================================================
  const UpdaterManager = {
    currentVersion: '3.7.0',
    latestRelease: null,

    init() {
      const btnCheck = document.getElementById('btn-updater-check');
      const btnApply = document.getElementById('btn-updater-apply');
      const btnRestart = document.getElementById('btn-updater-restart');

      if (btnCheck) {
        btnCheck.addEventListener('click', () => this.checkForUpdates());
      }

      if (btnApply) {
        btnApply.addEventListener('click', () => this.applyUpdate());
      }

      if (btnRestart) {
        btnRestart.addEventListener('click', () => this.restartDesktop());
      }

      const btnApt = document.getElementById('btn-updater-apt');
      if (btnApt) {
        btnApt.addEventListener('click', async () => {
          btnApt.disabled = true;
          btnApt.textContent = 'Paket Listesi Denetleniyor...';
          Terminal.log('[APT] Sistem paket güncellemeleri kontrol ediliyor (apt-get update)...', 'cmd');
          try {
            // Terminal beyaz listesi yerine onaylı root_command köprüsü:
            // "Güvenlik İlkesi İhlali" uyarısı artık beklenmez.
            const out = await TauriBridge.invoke('system_update_apt', { doUpgrade: false });
            if (out) Terminal.log(out, 'muted');
            Terminal.log('[APT] Paket depoları başarıyla güncellendi.', 'success');
            alert('Sistem paket listeleri (Debian/Devuan depoları) başarıyla güncellendi.');
          } catch (e) {
            Terminal.log(`[APT HATA] ${e.message || e}`, 'muted');
            ReportManager.showToast(`Paket listesi güncellenemedi: ${e.message || e}`);
          } finally {
            btnApt.disabled = false;
            btnApt.textContent = 'Sistem Paketlerini Denetle (APT)';
          }
        });
      }

      const btnUpgrade = document.getElementById('btn-updater-upgrade');
      if (btnUpgrade) {
        btnUpgrade.addEventListener('click', async () => {
          btnUpgrade.disabled = true;
          btnUpgrade.textContent = 'Sistem Yükseltiliyor...';
          Terminal.log('[APT] Tüm sistem yükseltmesi başlatılıyor (apt-get update && apt-get upgrade -y)...', 'cmd');
          try {
            const out = await TauriBridge.invoke('system_update_apt', { doUpgrade: true });
            if (out) Terminal.log(out, 'muted');
            Terminal.log('[APT] Tüm paketler başarıyla en son sürüme yükseltildi.', 'success');
            alert('Tüm Ankora Linux sistem paketleri başarıyla yükseltildi.');
          } catch (e) {
            Terminal.log(`[APT HATA] ${e.message || e}`, 'muted');
            ReportManager.showToast(`Sistem yükseltilemedi: ${e.message || e}`);
          } finally {
            btnUpgrade.disabled = false;
            btnUpgrade.textContent = 'Tüm Sistemi Güncelle (Upgrade)';
          }
        });
      }

      // Tauri olay dinleyicisi (canlı indirme ve kurulum yüzdesi)
      if (typeof window !== 'undefined' && window.__TAURI__ && window.__TAURI__.event) {
        window.__TAURI__.event.listen('update-progress', (event) => {
          this.handleProgress(event.payload);
        });
      }
    },

    async checkForUpdates() {
      const badge = document.getElementById('updater-status-badge');
      const heroIcon = document.getElementById('updater-hero-icon');
      const btnCheck = document.getElementById('btn-updater-check');
      const btnApply = document.getElementById('btn-updater-apply');
      const btnRestart = document.getElementById('btn-updater-restart');
      const notesBox = document.getElementById('updater-notes-box');
      const currVerEl = document.getElementById('updater-curr-ver');
      const latestVerEl = document.getElementById('updater-latest-ver');
      const dateEl = document.getElementById('updater-release-date');
      const progressSec = document.getElementById('updater-progress-section');

      if (progressSec) progressSec.style.display = 'none';
      if (btnRestart) btnRestart.style.display = 'none';

      if (badge) {
        badge.className = 'updater-badge checking';
        badge.textContent = 'Denetleniyor...';
      }
      if (btnCheck) {
        btnCheck.disabled = true;
        btnCheck.textContent = 'Kontrol Ediliyor...';
      }

      try {
        const info = await TauriBridge.invoke('check_de_update');
        this.latestRelease = info;

        if (currVerEl) currVerEl.textContent = `v${info.current_version}`;
        if (latestVerEl) latestVerEl.textContent = info.latest_version ? `v${info.latest_version.replace(/^v/i, '')}` : '—';
        if (dateEl && info.published_at) {
          const d = new Date(info.published_at);
          dateEl.textContent = isNaN(d.getTime()) ? '' : `Yayın: ${d.toLocaleDateString('tr-TR')}`;
        }

        if (info.has_update) {
          if (badge) {
            badge.className = 'updater-badge update-available';
            badge.textContent = 'Yeni Sürüm Mevcut';
          }
          if (heroIcon) heroIcon.className = 'updater-hero-icon update-available';

          if (notesBox) {
            notesBox.innerHTML = `
              <div style="margin-bottom: 8px;">
                <strong style="font-size: 13px; color: #f59e0b;">${escapeHtml(info.release_name || 'Yeni Sürüm')}</strong>
                <span style="font-size: 11px; color: var(--text-secondary); margin-left: 8px;">
                  ${info.package_size_bytes ? `(${(info.package_size_bytes / 1048576).toFixed(1)} MB .deb paketi)` : ''}
                </span>
              </div>
              <div class="updater-notes-text">${this.formatMarkdown(info.release_notes)}</div>
            `;
          }

          if (btnApply && info.download_url) {
            btnApply.style.display = 'inline-block';
            btnApply.disabled = false;
            btnApply.textContent = `v${info.latest_version.replace(/^v/i, '')} Sürümüne Güncelle`;
          }

          // GitHub release'te .deb asset yoksa güncelleme uygulanamaz;
          // kullanıcıyı sürüm sayfasına yönlendir (ghost "Tekrar Dene".
          if (!info.download_url && notesBox) {
            notesBox.innerHTML += `
              <div class="updater-notes-text" style="margin-top:10px; color: var(--text-secondary);">
                ⚠ Bu sürüm için indirilebilir Ayaz DE (.deb) paketi bulunamadı; dünyada yalnızca tam ISO yayınlanmış. Sürüm sayfasından yeni ISO'yu indirebilir veya Taşıma penceresinden taşımak için kurulum yapabilirsin.
              </div>`;
            Terminal.log('[GÜNCELLEME] Bu sürümde .deb paketi yok; tam ISO çıktısı bekleniyor.', 'error');
          }

          Terminal.log(`[GÜNCELLEME] Yeni Ayaz DE sürümü yayınlandı: v${info.latest_version}`, 'cmd');
        } else {
          if (badge) {
            badge.className = 'updater-badge up-to-date';
            badge.textContent = 'Sistem Güncel ✓';
          }
          if (heroIcon) heroIcon.className = 'updater-hero-icon up-to-date';

          if (notesBox) {
            notesBox.innerHTML = `
              <div class="updater-notes-placeholder">
                <strong style="color: #10b981;">✓ Ayaz Masaüstü Ortamı En Son Sürümde</strong><br><br>
                ${escapeHtml(info.release_notes || 'Tüm bileşenler en son kararlı sürümle çalışıyor.')}
              </div>
            `;
          }

          if (btnApply) btnApply.style.display = 'none';
          Terminal.log('[GÜNCELLEME] Ayaz DE güncel. Bekleyen güncelleme yok.', 'cmd');
        }
      } catch (err) {
        if (badge) {
          badge.className = 'updater-badge';
          badge.textContent = 'Bağlantı Hatası';
        }
        if (notesBox) {
          notesBox.innerHTML = `
            <div class="updater-notes-placeholder" style="color: #ef4444;">
              <strong>Sunucuya Bağlanılamadı</strong><br><br>
              ${escapeHtml(err.message || String(err))}
            </div>
          `;
        }
        Terminal.log(`[GÜNCELLEME HATASI] ${err.message || err}`, 'error');
      } finally {
        if (btnCheck) {
          btnCheck.disabled = false;
          btnCheck.textContent = 'Güncellemeleri Denetle';
        }
      }
    },

    async applyUpdate() {
      if (!this.latestRelease || !this.latestRelease.download_url) {
        Terminal.log('[GÜNCELLEME] İndirilecek .deb paketi bulunamadı.', 'error');
        return;
      }

      const btnCheck = document.getElementById('btn-updater-check');
      const btnApply = document.getElementById('btn-updater-apply');
      const progressSec = document.getElementById('updater-progress-section');
      const progressFill = document.getElementById('updater-progress-fill');
      const progressLabel = document.getElementById('updater-progress-label');
      const progressPct = document.getElementById('updater-progress-pct');

      if (progressSec) progressSec.style.display = 'flex';
      if (btnCheck) btnCheck.disabled = true;
      if (btnApply) {
        btnApply.disabled = true;
        btnApply.textContent = 'Kuruluyor...';
      }

      Terminal.log(`[GÜNCELLEME] v${this.latestRelease.latest_version} paketi indiriliyor ve kuruluyor...`, 'cmd');

      try {
        await TauriBridge.invoke('download_and_apply_de_update', {
          downloadUrl: this.latestRelease.download_url,
          expectedSha256: this.latestRelease.expected_sha256 || null,
          sha256Url: this.latestRelease.sha256_url || null,
          expectedVersion: this.latestRelease.latest_version || null
        });

        if (progressFill) progressFill.style.width = '100%';
        if (progressPct) progressPct.textContent = '100%';
        if (progressLabel) progressLabel.textContent = 'Güncelleme başarıyla tamamlandı!';

        if (btnApply) btnApply.style.display = 'none';
        const btnRestart = document.getElementById('btn-updater-restart');
        if (btnRestart) btnRestart.style.display = 'inline-block';

        Terminal.log('[GÜNCELLEME] Ayaz DE başarıyla güncellendi. Masaüstünün yeniden başlatılması önerilir.', 'cmd');
      } catch (err) {
        if (progressLabel) progressLabel.textContent = `Hata: ${err}`;
        if (btnApply) {
          btnApply.disabled = false;
          btnApply.textContent = 'Tekrar Dene';
        }
        Terminal.log(`[GÜNCELLEME HATASI] ${err}`, 'error');
      } finally {
        if (btnCheck) btnCheck.disabled = false;
      }
    },

    handleProgress(payload) {
      if (!payload) return;
      const progressSec = document.getElementById('updater-progress-section');
      const progressFill = document.getElementById('updater-progress-fill');
      const progressLabel = document.getElementById('updater-progress-label');
      const progressPct = document.getElementById('updater-progress-pct');

      if (progressSec) progressSec.style.display = 'flex';
      if (progressFill) progressFill.style.width = `${payload.percent}%`;
      if (progressPct) progressPct.textContent = `${payload.percent}%`;
      if (progressLabel && payload.message) progressLabel.textContent = payload.message;
    },

    async restartDesktop() {
      Terminal.log('[SİSTEM] Ayaz DE yeniden başlatılıyor...', 'cmd');
      try {
        await TauriBridge.invoke('restart_desktop_process');
      } catch (e) {
        window.location.reload();
      }
    },

    formatMarkdown(text) {
      if (!text) return '';
      let html = escapeHtml(text);
      html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
      html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
      html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      html = html.replace(/^\* (.*$)/gim, '<li>$1</li>');
      html = html.replace(/^- (.*$)/gim, '<li>$1</li>');
      html = html.replace(/\n/g, '<br>');
      return html;
    }
  };

  // ============================================================================
  // 12. GÖREV YÖNETİCİSİ (WIN-TASKMGR - TASK MANAGER)
  // ============================================================================
  const TaskManager = {
    // Liste başlangıçta boştur; ilk tick() sistemden gerçek süreçleri çeker.
    processes: [],
    loadError: null,
    timer: null,
    selectedPid: null,

    init() {
      this.tableBody = document.getElementById('taskmgr-proc-tbody');
      this.valCpu = document.getElementById('taskmgr-cpu-val');
      this.barCpu = document.getElementById('taskmgr-cpu-bar');
      this.valMem = document.getElementById('taskmgr-mem-val');
      this.barMem = document.getElementById('taskmgr-mem-bar');
      this.subMem = document.getElementById('taskmgr-mem-sub');
      this.valDisk = document.getElementById('taskmgr-disk-val');
      this.barDisk = document.getElementById('taskmgr-disk-bar');
      this.subDisk = document.getElementById('taskmgr-disk-sub');
      this.valProc = document.getElementById('taskmgr-proc-count');

      const searchInput = document.getElementById('taskmgr-search');
      if (searchInput) {
        let taskSearchTimer = 0;
        searchInput.addEventListener('input', () => {
          const value = searchInput.value;
          clearTimeout(taskSearchTimer);
          taskSearchTimer = setTimeout(() => this.render(value), 120);
        });
      }

      const btnRefresh = document.getElementById('taskmgr-btn-refresh');
      if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
          this.tick();
          Terminal.log('[GÖREV YÖNETİCİSİ] Süreç tablosu yenilendi.', 'cmd');
        });
      }

      const btnOptimize = document.getElementById('taskmgr-btn-optimize');
      if (btnOptimize) {
        btnOptimize.addEventListener('click', () => {
          MemoryManager.optimizeRam();
        });
      }

      const btnKill = document.getElementById('taskmgr-btn-kill');
      if (btnKill) {
        btnKill.addEventListener('click', async () => {
          if (!this.selectedPid) return;
          const pid = this.selectedPid;
          const target = this.processes.find(p => p.pid === pid);
          btnKill.disabled = true;
          try {
            const msg = await TauriBridge.invoke('kill_process', { pid });
            ReportManager.showToast(msg || `Sonlandırıldı: PID ${pid}`);
            Terminal.log(`[GÖREV YÖNETİCİSİ] ${msg || `Sonlandırıldı: PID ${pid}`} (${target ? target.name : ''})`, 'muted');
          } catch (err) {
            ReportManager.showToast(`Sonlandırılamadı: ${err.message || err}`);
          } finally {
            this.selectedPid = null;
            await this.tick();
          }
        });
      }

      this.render();

      const winTaskmgr = document.getElementById('win-taskmgr');
      if (winTaskmgr) {
        const observer = new MutationObserver(() => {
          if (winTaskmgr.classList.contains('open')) {
            if (!this.timer) {
              this.timer = setInterval(() => this.tick(), 2500);
              this.tick();
            }
          } else {
            if (this.timer) {
              clearInterval(this.timer);
              this.timer = null;
            }
          }
        });
        observer.observe(winTaskmgr, { attributes: true, attributeFilter: ['class'] });
      }
    },

    async tick() {
      // Arka planda (sekme gizliyken) IPC ve tablo çizimi beklemesin.
      if (document.hidden) return;
      try {
        const [tele, procs] = await Promise.all([
          TauriBridge.invoke('get_system_telemetry'),
          TauriBridge.invoke('get_processes')
        ]);
        this.loadError = null;
        this.applyTelemetry(tele);
        if (Array.isArray(procs)) {
          this.processes = procs;
          if (this.valProc) this.valProc.textContent = `${procs.length} Aktif`;
        }
      } catch (err) {
        this.loadError = err.message || String(err);
        if (this.valProc) this.valProc.textContent = '—';
      }
      const search = document.getElementById('taskmgr-search');
      this.render(search ? search.value : '');
    },

    applyTelemetry(tele) {
      if (!tele) return;

      const cpu = typeof tele.cpu_percent === 'number' ? Math.round(tele.cpu_percent) : null;
      if (this.valCpu) this.valCpu.textContent = cpu === null ? '—' : `${cpu}%`;
      if (this.barCpu) this.barCpu.style.width = `${cpu || 0}%`;

      const usedMb = tele.memory_used_mb || 0;
      const totalMb = tele.memory_total_mb || 1;
      const memPct = Math.min(100, Math.round((usedMb / totalMb) * 100));
      if (this.valMem) this.valMem.textContent = `${memPct}%`;
      if (this.barMem) this.barMem.style.width = `${memPct}%`;
      if (this.subMem) this.subMem.textContent = `${usedMb} MB / ${(totalMb / 1024).toFixed(1)} GB Kullanımda`;

      if (typeof tele.disk_percent === 'number') {
        if (this.valDisk) this.valDisk.textContent = `${tele.disk_percent}%`;
        if (this.barDisk) this.barDisk.style.width = `${tele.disk_percent}%`;
        if (this.subDisk) this.subDisk.textContent = `${tele.disk_used_gb} GB / ${tele.disk_total_gb} GB`;
      } else {
        if (this.valDisk) this.valDisk.textContent = '—';
        if (this.barDisk) this.barDisk.style.width = '0%';
        if (this.subDisk) this.subDisk.textContent = 'Bilgi yok';
      }
    },

    render(query = '') {
      if (!this.tableBody) return;
      this.tableBody.innerHTML = '';

      // 2,5 sn'lik otomatik yenilemede satırlar fragment ile tek seferde girer.
      const frag = document.createDocumentFragment();

      if (this.loadError) {
        const errRow = document.createElement('tr');
        errRow.innerHTML = `<td colspan="6" style="padding:14px; color:#f59e0b;">Süreç listesi okunamadı: ${escapeHtml(this.loadError)}</td>`;
        this.tableBody.appendChild(errRow);
        return;
      }
      if (this.processes.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = '<td colspan="6" style="padding:14px; color:#94a3b8;">Henüz süreç okunmadı…</td>';
        this.tableBody.appendChild(emptyRow);
        return;
      }

      const q = query.toLowerCase().trim();

      const filtered = this.processes.filter(p => {
        return !q || p.name.toLowerCase().includes(q) || String(p.pid).includes(q) || p.user.toLowerCase().includes(q);
      });

      filtered.forEach(p => {
        const tr = document.createElement('tr');
        if (this.selectedPid === p.pid) tr.style.background = 'rgba(37, 99, 235, 0.15)';
        tr.style.cursor = 'pointer';

        const statusColor = p.status === 'Zombi' ? '#ef4444'
          : (p.status === 'Çalışıyor' ? '#10b981' : '#94a3b8');
        const memMb = typeof p.mem_mb === 'number' ? p.mem_mb : 0;

        tr.innerHTML = `
          <td class="mono">${p.pid}</td>
          <td><strong>${escapeHtml(p.name)}</strong></td>
          <td class="mono">${escapeHtml(p.user)}</td>
          <td class="mono">${p.cpu}%</td>
          <td class="mono">${memMb.toFixed(1)} MB</td>
          <td><span style="font-size: 10.5px; color: ${statusColor};">● ${escapeHtml(p.status || 'Bilinmiyor')}</span></td>
        `;

        tr.addEventListener('click', () => {
          this.selectedPid = p.pid;
          const btnKill = document.getElementById('taskmgr-btn-kill');
          if (btnKill) btnKill.disabled = false;
          this.render(query);
        });

        frag.appendChild(tr);
      });
      this.tableBody.appendChild(frag);
    }
  };

  // ============================================================================
  // 13. NOT DEFTERİ (WIN-NOTEPAD - TEXT EDITOR)
  // ============================================================================
  const NotepadManager = {
    init() {
      this.textarea = document.getElementById('notepad-textarea');
      this.wordCountEl = document.getElementById('notepad-stat-words');
      this.charCountEl = document.getElementById('notepad-stat-chars');
      this.saveIndicator = document.getElementById('notepad-save-indicator');

      const saved = SafeStorage.getItem('ankora_notepad_content');
      if (saved && this.textarea) {
        this.textarea.value = saved;
        this.updateCounts();
      }

      if (this.textarea) {
        this.textarea.addEventListener('input', () => {
          this.updateCounts();
          SafeStorage.setItem('ankora_notepad_content', this.textarea.value);
          if (this.saveIndicator) {
            this.saveIndicator.textContent = 'Kaydedildi ✓';
            this.saveIndicator.style.color = '#10b981';
          }
        });
      }

      const btnNew = document.getElementById('notepad-btn-new');
      if (btnNew) {
        btnNew.addEventListener('click', () => {
          if (this.textarea && this.textarea.value.trim().length > 0) {
            if (confirm('Mevcut not temizlenecek. Devam etmek istiyor musunuz?')) {
              this.textarea.value = '';
              this.updateCounts();
              SafeStorage.removeItem('ankora_notepad_content');
            }
          }
        });
      }

      const btnSave = document.getElementById('notepad-btn-save');
      if (btnSave) {
        btnSave.addEventListener('click', async () => {
          const content = this.textarea ? this.textarea.value : '';
          const home = (typeof FileManager !== 'undefined' && FileManager.userHome) ? FileManager.userHome : '/home/ankora';
          const savePath = `${home}/Masaüstü/ankora-not.txt`;
          try {
            await TauriBridge.invoke('write_text_file', { path: savePath, content });
            if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
              ReportManager.showToast('Not masaüstüne kaydedildi: ankora-not.txt');
            }
            Terminal.log(`[NOT DEFTERİ] Not kaydedildi: ${savePath}`, 'success');
            if (typeof FileManager !== 'undefined') FileManager.refresh();
          } catch (_) {
            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'ankora-not.txt';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            Terminal.log('[NOT DEFTERİ] Not dosyası indirildi: ankora-not.txt', 'success');
          }
        });
      }

      const btnCopy = document.getElementById('notepad-btn-copy');
      if (btnCopy) {
        btnCopy.addEventListener('click', async () => {
          if (!this.textarea) return;
          try {
            await navigator.clipboard.writeText(this.textarea.value);
            btnCopy.textContent = 'Kopyalandı ✓';
            setTimeout(() => { btnCopy.textContent = 'Kopyala'; }, 1800);
          } catch (e) {
            this.textarea.select();
            document.execCommand('copy');
          }
        });
      }

      const btnClear = document.getElementById('notepad-btn-clear');
      if (btnClear) {
        btnClear.addEventListener('click', () => {
          if (this.textarea) {
            this.textarea.value = '';
            this.updateCounts();
            SafeStorage.removeItem('ankora_notepad_content');
          }
        });
      }
    },

    updateCounts() {
      if (!this.textarea) return;
      const text = this.textarea.value;
      const chars = text.length;
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      if (this.charCountEl) this.charCountEl.textContent = `${chars} karakter`;
      if (this.wordCountEl) this.wordCountEl.textContent = `${words} kelime`;
    }
  };

  // ============================================================================
  // 14. HESAP MAKİNESİ (WIN-CALC - CALCULATOR)
  // ============================================================================
  const CalcManager = {
    current: '0',
    history: '',
    operator: null,
    prevValue: null,
    resetCurrentOnNextNum: false,

    init() {
      this.displayCurrent = document.getElementById('calc-current');
      this.displayHistory = document.getElementById('calc-history');
      this.updateDisplay();

      document.querySelectorAll('.calc-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const val = btn.getAttribute('data-val');
          const act = btn.getAttribute('data-action');

          if (val !== null) {
            this.inputNum(val);
          } else if (act) {
            this.handleAction(act);
          }
          this.updateDisplay();
        });
      });

      window.addEventListener('keydown', (e) => {
        const winCalc = document.getElementById('win-calc');
        if (!winCalc || !winCalc.classList.contains('active')) return;

        if (e.key >= '0' && e.key <= '9') {
          this.inputNum(e.key);
          this.updateDisplay();
        } else if (e.key === '.' || e.key === ',') {
          this.inputNum('.');
          this.updateDisplay();
        } else if (e.key === '+') {
          this.handleAction('add');
          this.updateDisplay();
        } else if (e.key === '-') {
          this.handleAction('subtract');
          this.updateDisplay();
        } else if (e.key === '*') {
          this.handleAction('multiply');
          this.updateDisplay();
        } else if (e.key === '/') {
          e.preventDefault();
          this.handleAction('divide');
          this.updateDisplay();
        } else if (e.key === 'Enter' || e.key === '=') {
          e.preventDefault();
          this.handleAction('equals');
          this.updateDisplay();
        } else if (e.key === 'Backspace') {
          this.handleAction('backspace');
          this.updateDisplay();
        } else if (e.key === 'Escape') {
          this.handleAction('c');
          this.updateDisplay();
        }
      });
    },

    inputNum(n) {
      if (this.resetCurrentOnNextNum) {
        this.current = (n === '.') ? '0.' : n;
        this.resetCurrentOnNextNum = false;
        return;
      }
      if (n === '.') {
        if (!this.current.includes('.')) {
          this.current += '.';
        }
      } else {
        this.current = (this.current === '0') ? n : this.current + n;
      }
    },

    handleAction(action) {
      const curNum = parseFloat(this.current) || 0;

      switch (action) {
        case 'c':
          this.current = '0';
          this.history = '';
          this.prevValue = null;
          this.operator = null;
          this.resetCurrentOnNextNum = false;
          break;

        case 'ce':
          this.current = '0';
          break;

        case 'backspace':
          if (this.current.length > 1) {
            this.current = this.current.slice(0, -1);
          } else {
            this.current = '0';
          }
          break;

        case 'negate':
          this.current = String(-curNum);
          break;

        case 'percent':
          this.current = String(curNum / 100);
          break;

        case 'reciprocal':
          if (curNum === 0) {
            this.current = 'Tanımsız';
            this.resetCurrentOnNextNum = true;
          } else {
            this.current = String(parseFloat((1 / curNum).toFixed(8)));
          }
          break;

        case 'square':
          this.current = String(parseFloat((curNum * curNum).toFixed(8)));
          break;

        case 'sqrt':
          if (curNum < 0) {
            this.current = 'Geçersiz';
            this.resetCurrentOnNextNum = true;
          } else {
            this.current = String(parseFloat(Math.sqrt(curNum).toFixed(8)));
          }
          break;

        case 'add':
        case 'subtract':
        case 'multiply':
        case 'divide':
          const opSymbols = { add: '+', subtract: '−', multiply: '×', divide: '÷' };
          if (this.operator && this.prevValue !== null && !this.resetCurrentOnNextNum) {
            this.compute();
          } else {
            this.prevValue = curNum;
          }
          this.operator = action;
          this.history = `${this.prevValue} ${opSymbols[action]}`;
          this.resetCurrentOnNextNum = true;
          break;

        case 'equals':
          if (this.operator && this.prevValue !== null) {
            const opSymbols = { add: '+', subtract: '−', multiply: '×', divide: '÷' };
            const opSym = opSymbols[this.operator] || '';
            const secondVal = curNum;
            this.compute();
            this.history = `${this.prevValue} ${opSym} ${secondVal} =`;
            this.prevValue = null;
            this.operator = null;
            this.resetCurrentOnNextNum = true;
          }
          break;
      }
    },

    compute() {
      const a = this.prevValue;
      const b = parseFloat(this.current) || 0;
      let res = 0;

      switch (this.operator) {
        case 'add': res = a + b; break;
        case 'subtract': res = a - b; break;
        case 'multiply': res = a * b; break;
        case 'divide':
          if (b === 0) {
            this.current = 'Tanımsız';
            this.prevValue = null;
            this.operator = null;
            return;
          }
          res = a / b;
          break;
      }
      this.current = String(parseFloat(res.toFixed(8)));
      this.prevValue = res;
    },

    updateDisplay() {
      if (this.displayCurrent) this.displayCurrent.textContent = this.current;
      if (this.displayHistory) this.displayHistory.textContent = this.history;
    }
  };

  // ============================================================================
  // ANKORA WEB TARAYICI YÖNETİCİSİ (EMBEDDED WEBKIT BROWSER - AYAZ DE)
  // ============================================================================
  const BrowserManager = {
    iframe: null,
    urlInput: null,
    history: ['https://duckduckgo.com'],
    historyIndex: 0,
    loadingBar: null,
    fallbackCard: null,
    loadMask: null,
    watchdog: null,
    timedOut: false,

    init() {
      this.iframe = document.getElementById('browser-iframe');
      this.urlInput = document.getElementById('browser-url-input');
      this.loadingBar = document.getElementById('browser-loading-bar');
      this.fallbackCard = document.getElementById('browser-fallback-card');
      this.loadMask = document.getElementById('browser-load-mask');
      // Sayfa doğrudan siteye açılsaydı X-Frame-Options çerçeveyi kapatır;
      // ilk yükleme de köprü üzerinden yapılır.
      // Host, köprü dışına çıkan geçişleri iptal edip hedefi buraya bildirir;
      // böylece bağlantı, form ve JavaScript geçişleri tek yoldan ilerler.
      window.__ayazProxyNav = (uri) => { if (uri) this.navigate(uri); };
      if (this.iframe) {
        this.startLoading();
        this.iframe.src = this.toProxy(this.history[this.historyIndex]);
      }

      const btnGo = document.getElementById('btn-browser-go');
      const btnBack = document.getElementById('btn-browser-back');
      const btnFwd = document.getElementById('btn-browser-fwd');
      const btnReload = document.getElementById('btn-browser-reload');
      const btnHome = document.getElementById('btn-browser-home');
      const btnSearchMode = document.getElementById('btn-browser-search-mode');
      const btnRefresh = document.getElementById('btn-browser-refresh');

      if (this.urlInput) {
        this.urlInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.navigate(this.urlInput.value);
          }
        });
        this.urlInput.addEventListener('focus', () => {
          this.urlInput.select();
        });
      }

      if (btnGo) {
        btnGo.addEventListener('click', () => {
          if (this.urlInput) this.navigate(this.urlInput.value);
        });
      }

      if (btnBack) {
        btnBack.addEventListener('click', () => this.goBack());
      }

      if (btnFwd) {
        btnFwd.addEventListener('click', () => this.goForward());
      }

      if (btnReload) {
        btnReload.addEventListener('click', () => this.reload());
      }

      if (btnHome) {
        btnHome.addEventListener('click', () => this.navigate('https://duckduckgo.com'));
      }

      if (btnRefresh) {
        btnRefresh.addEventListener('click', () => this.reload());
      }

      if (btnSearchMode) {
        btnSearchMode.addEventListener('click', () => {
          if (this.urlInput) {
            this.urlInput.value = '';
            this.urlInput.placeholder = 'DuckDuckGo ile ara...';
            this.urlInput.focus();
          }
        });
      }

      const btnExternal = document.getElementById('btn-browser-external');
      if (btnExternal) {
        btnExternal.addEventListener('click', () => this.openExternal());
        // Canlı ISO'da sistem tarayıcısı yoktur; çalışmayan bir denetim
        // gösterilmez. Sorgu kendiliğinden başarısız olursa buton kalır.
        TauriBridge.invoke('system_browser_available')
          .then(ok => { if (ok === false) btnExternal.style.display = 'none'; })
          .catch(() => {});
      }

      const btnFallbackExternal = document.getElementById('btn-browser-fallback-external');
      if (btnFallbackExternal) {
        btnFallbackExternal.addEventListener('click', () => this.openExternal());
      }

      // Bookmark Chips
      const chips = document.querySelectorAll('.bookmark-chip[data-url]');
      chips.forEach(chip => {
        chip.addEventListener('click', () => {
          chips.forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          const targetUrl = chip.getAttribute('data-url');
          if (targetUrl) this.navigate(targetUrl);
        });
      });

      // Iframe Load Event
      if (this.iframe) {
        this.iframe.addEventListener('load', () => {
          // Sayaç dolmuş ama sayfa sonunda yine gelmişse: hata kartı
          // içeriğin üstünde kalmasın.
          if (this.timedOut && this.fallbackCard) {
            this.timedOut = false;
            this.fallbackCard.style.display = 'none';
          }
          this.finishLoading();
        });
      }
    },

    // Adres çubuğunda gerçek URL durur; yerel test sunucusu varsa proxy üzerinden, Tauri'de doğrudan yüklenir.
    toProxy(url) {
      if (typeof window !== 'undefined' && window.location.origin.includes('49152')) {
        return `/proxy?url=${encodeURIComponent(url)}`;
      }
      return url;
    },

    navigate(input) {
      if (!input || !input.trim()) return;
      let target = input.trim();

      // Akıllı URL / Arama tespiti
      const isUrl = /^(https?:\/\/|[a-z0-9-]+\.[a-z]{2,})/i.test(target) && !target.includes(' ');
      if (!isUrl) {
        target = `https://duckduckgo.com/?q=${encodeURIComponent(target)}`;
      } else if (!/^https?:\/\//i.test(target)) {
        target = `https://${target}`;
      }

      if (this.urlInput) this.urlInput.value = target;

      // Geçmiş güncelleme
      if (this.history[this.historyIndex] !== target) {
        this.history = this.history.slice(0, this.historyIndex + 1);
        this.history.push(target);
        this.historyIndex = this.history.length - 1;
      }

      this.startLoading();

      if (this.iframe) {
        if (this.fallbackCard) this.fallbackCard.style.display = 'none';
        try {
          this.iframe.src = this.toProxy(target);
        } catch (err) {
          console.warn('[TARAYICI] Navigasyon hatası:', err);
          if (this.fallbackCard) this.fallbackCard.style.display = 'flex';
          this.finishLoading();
        }
      }

      // Yer imi aktifliğini güncelle
      const chips = document.querySelectorAll('.bookmark-chip[data-url]');
      chips.forEach(c => {
        c.classList.toggle('active', c.getAttribute('data-url') === target);
      });
    },

    // Bazı siteler çerçevelenmeyi reddeder ve yerleşik görüntüleyici boş kalır;
    // aynı adres sistem tarayıcısında sorunsuz açılır.
    openExternal() {
      const url = (this.urlInput && this.urlInput.value.trim()) || this.history[this.historyIndex];
      if (!url) return;
      TauriBridge.invoke('open_url', { url })
        .then(() => ReportManager.showToast('Sistem tarayıcısında açılıyor...'))
        .catch((err) => ReportManager.showToast(`Açılamadı: ${err.message || err}`));
    },

    goBack() {
      if (this.historyIndex > 0) {
        this.historyIndex--;
        const url = this.history[this.historyIndex];
        if (this.urlInput) this.urlInput.value = url;
        this.startLoading();
        if (this.iframe) this.iframe.src = this.toProxy(url);
      }
    },

    goForward() {
      if (this.historyIndex < this.history.length - 1) {
        this.historyIndex++;
        const url = this.history[this.historyIndex];
        if (this.urlInput) this.urlInput.value = url;
        this.startLoading();
        if (this.iframe) this.iframe.src = this.toProxy(url);
      }
    },

    reload() {
      if (this.iframe) {
        const cur = this.iframe.src;
        this.iframe.src = '';
        // about:blank yüklemesi load olayını erken tetikler; sayaç ve maske
        // gerçek hedef yazılırken başlatılır.
        setTimeout(() => {
          this.startLoading();
          this.iframe.src = cur;
        }, 50);
      }
    },

    startLoading() {
      if (this.loadingBar) {
        this.loadingBar.style.width = '35%';
        this.loadingBar.style.opacity = '1';
        setTimeout(() => {
          if (this.loadingBar && this.loadingBar.style.opacity === '1') {
            this.loadingBar.style.width = '75%';
          }
        }, 300);
      }
      // Yükleniyor maske: köprü yanıt verene kadar kullanıcı boş beyaz
      // alan görmez.
      if (this.loadMask) {
        const txt = document.getElementById('browser-load-mask-text');
        if (txt) txt.textContent = 'Sayfa yükleniyor…';
        this.loadMask.style.display = 'flex';
      }
      // Bekleme sayacı: köprü/sunucu yanıt vermezse süre sonunda hata
      // kartına düşülür, ekran boş beyaz kalmaz.
      if (this.watchdog) clearTimeout(this.watchdog);
      this.watchdog = setTimeout(() => this.onLoadTimeout(), 25000);
    },

    onLoadTimeout() {
      if (this.watchdog) {
        clearTimeout(this.watchdog);
        this.watchdog = null;
      }
      if (this.loadMask) this.loadMask.style.display = 'none';
      this.finishLoading();
      if (this.fallbackCard) {
        const title = document.getElementById('browser-fallback-title');
        const desc = document.getElementById('browser-fallback-desc');
        if (title) title.textContent = 'Sayfa yüklenemedi';
        if (desc) {
          desc.textContent = 'Köprü yanıt vermedi; ağ bağlantısı yavaş veya kopuk olabilir. Yeniden deneyebilir ya da sayfayı sistem tarayıcısında açabilirsiniz.';
        }
        this.timedOut = true;
        this.fallbackCard.style.display = 'flex';
      }
    },

    finishLoading() {
      if (this.watchdog) {
        clearTimeout(this.watchdog);
        this.watchdog = null;
      }
      if (this.loadMask) this.loadMask.style.display = 'none';
      if (this.loadingBar) {
        this.loadingBar.style.width = '100%';
        setTimeout(() => {
          if (this.loadingBar) {
            this.loadingBar.style.opacity = '0';
            setTimeout(() => {
              if (this.loadingBar) this.loadingBar.style.width = '0%';
            }, 200);
          }
        }, 200);
      }
    }
  };

  // ============================================================================
  // BELLEK (RAM) OPTİMİZASYON VE CANLI TELEMETRİ YÖNETİCİSİ (MEMORY MANAGER)
  // ============================================================================
  const MemoryManager = {
    isEcoMode: false,
    pollTimer: null,

    init() {

      // 1. Eco RAM Modu Tercihini Yükle
      // Kayıtlı tercih yoksa ve sistem belleği 4 GB altındaysa Eco varsayılan açık:
      // blur ve gölge katmanları düşük RAM'de en pahalı bileşenlerdır.
      const savedEcoRaw = SafeStorage.getItem('ankora_eco_ram_mode');
      this.setEcoMode(savedEcoRaw === 'true', false);
      if (savedEcoRaw === null) {
        TauriBridge.invoke('get_system_telemetry').then((tele) => {
          if (tele && typeof tele.memory_total_mb === 'number' && tele.memory_total_mb > 0 && tele.memory_total_mb < 4096) {
            this.setEcoMode(true, true);
          }
        }).catch(() => {});
      }

      const chkEco = document.getElementById('chk-eco-ram-mode');
      if (chkEco) {
        chkEco.checked = this.isEcoMode;
        chkEco.addEventListener('change', (e) => {
          this.setEcoMode(e.target.checked, true);
        });
      }

      // 2. Ayarlar Penceresi RAM Temizleme Butonu
      const btnCleanRam = document.getElementById('btn-clean-ram');
      if (btnCleanRam) {
        btnCleanRam.addEventListener('click', () => {
          this.optimizeRam();
        });
      }

      // 3. Periyodik Hafif Telemetre Sorgusu (5 saniyede bir, sayfa odakta iken)
      this.updateTelemetry();
      this.pollTimer = setInterval(() => {
        if (!document.hidden) {
          this.updateTelemetry();
        }
      }, 5000);

      // 4. Otomatik Akıllı Bellek Budayıcı (Background Auto Memory Reaper)
      // Sistem uzun süre açık kaldığında WebKitGTK bellek birikmesini önlemek için
      // 5 dakikada bir veya sayfa gizlendiğinde/boşta iken sessizce optimize eder.
      setInterval(() => {
        this.autoReapMemory();
      }, 5 * 60 * 1000);

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.autoReapMemory();
        }
      });
    },

    setEcoMode(enabled, persist = true) {
      this.isEcoMode = enabled;
      document.body.classList.toggle('eco-ram-mode', enabled);
      if (persist) {
        SafeStorage.setItem('ankora_eco_ram_mode', enabled ? 'true' : 'false');
        Terminal.log(`[BELLEK] Ultra Düşük RAM Modu: ${enabled ? 'Etkin (Bulanıklıklar ve GPU katmanları kapatıldı)' : 'Normal'}`, 'cmd');
      }
      const chkEco = document.getElementById('chk-eco-ram-mode');
      if (chkEco && chkEco.checked !== enabled) {
        chkEco.checked = enabled;
      }
    },

    async updateTelemetry() {
      try {
        const tele = await TauriBridge.invoke('get_system_telemetry');
        if (!tele) return;

        // Pil: sistemde pil yoksa (masaüstü/VM) grup ve QS footer'ı gizlenir;
        // yüzdeler /sys'ten okunan gerçek değerlerdir, süre tahmini üretilmez.
        const pctBatt = tele.battery_percent;
        const statusMap = {
          Charging: 'Şarj oluyor', Discharging: 'Boşalıyor',
          Full: 'Dolu', 'Not charging': 'Şarj olmuyor'
        };
        const stName = statusMap[tele.battery_status] || tele.battery_status || '';
        const batGroup = document.getElementById('tray-battery-btn');
        if (batGroup) {
          if (typeof pctBatt === 'number') {
            batGroup.style.display = '';
            const pctText = batGroup.querySelector('.battery-pct-text');
            if (pctText) pctText.textContent = `${pctBatt}%`;
            batGroup.title = stName ? `Pil Durumu: %${pctBatt} (${stName})` : `Pil Durumu: %${pctBatt}`;
          } else {
            batGroup.style.display = 'none';
          }
        }
        const qsBattBox = document.getElementById('qs-battery-status');
        const qsBattText = document.getElementById('qs-battery-text');
        if (qsBattBox) {
          if (typeof pctBatt === 'number') {
            qsBattBox.style.display = '';
            if (qsBattText) {
              qsBattText.textContent = stName ? `%${pctBatt} Kalan Pil (${stName})` : `%${pctBatt} Kalan Pil`;
            }
          } else {
            qsBattBox.style.display = 'none';
          }
        }

        const usedMb = tele.memory_used_mb || 110;
        const totalMb = tele.memory_total_mb || 8192;
        const pct = Math.min(100, Math.round((usedMb / totalMb) * 100));

        // Ayarlar Penceresi Güncelleme
        const labelSettings = document.getElementById('label-ram-settings-usage');
        const fillSettings = document.getElementById('fill-ram-settings-bar');
        if (labelSettings) {
          labelSettings.textContent = `${usedMb > 1024 ? (usedMb / 1024).toFixed(1) + ' GB' : usedMb + ' MB'} / ${(totalMb / 1024).toFixed(1)} GB (%${pct} Kullanımda)`;
        }
        if (fillSettings) {
          fillSettings.style.width = `${Math.max(4, pct)}%`;
          fillSettings.style.background = pct >= 80 ? '#ef4444' : (pct >= 50 ? '#f59e0b' : 'var(--accent-active)');
        }

        // Masaüstü widget katmanı da bu sorguyu kullanır; ayrı bir sayaç açılmaz.
        WidgetManager.onTelemetry(tele, pct);
      } catch (err) {}
    },

    async optimizeRam() {
      const btnCleanRam = document.getElementById('btn-clean-ram');
      if (btnCleanRam) {
        btnCleanRam.disabled = true;
        btnCleanRam.textContent = 'Boşaltılıyor...';
      }

      // DOM ve Bellek Temizliği
      // 1. Terminal çıktı satırlarını 50 satıra indir
      if (Terminal && Terminal.logs) {
        while (Terminal.logs.children.length > 50) {
          Terminal.logs.removeChild(Terminal.logs.firstChild);
        }
      }

      // 2. Ofis penceresi kapalıysa iframe'i boşalt
      const winOffice = document.getElementById('win-office');
      if (winOffice && !winOffice.classList.contains('open')) {
        OfficeManager.clearFrame();
      }

      // 3. AI mesaj listesini hafiflet
      if (AIAgent && AIAgent.feed) {
        while (AIAgent.feed.children.length > 15) {
          AIAgent.feed.removeChild(AIAgent.feed.firstChild);
        }
      }

      let freedMb = 48;
      try {
        const res = await TauriBridge.invoke('optimize_system_memory');
        if (res && res.freed_mb) freedMb = res.freed_mb;
      } catch (e) {}

      Terminal.log(`[BELLEK] Sistem ve uygulama önbellekleri boşaltıldı. Yaklaşık ${freedMb} MB bellek serbest bırakıldı.`, 'success');

      if (btnCleanRam) {
        btnCleanRam.textContent = `Temizlendi (${freedMb} MB) ✓`;
        setTimeout(() => {
          btnCleanRam.innerHTML = '<svg class="glyph" aria-hidden="true"><use href="#ico-zap"></use></svg> RAM\'i Boşalt';
          btnCleanRam.disabled = false;
        }, 2000);
      }

      setTimeout(() => {
        this.updateTelemetry();
      }, 2500);
    },

    async autoReapMemory() {
      // 1. Terminal çıktı satırlarını sınırla
      if (Terminal && Terminal.logs && Terminal.logs.children.length > 50) {
        while (Terminal.logs.children.length > 50) {
          Terminal.logs.removeChild(Terminal.logs.firstChild);
        }
      }

      // 2. Kapalıysa ofis ve tarayıcı önbelleklerini boşalt
      const winOffice = document.getElementById('win-office');
      if (winOffice && !winOffice.classList.contains('open') && typeof OfficeManager !== 'undefined') {
        OfficeManager.clearFrame();
      }

      // 3. AI mesaj listesini hafiflet
      if (AIAgent && AIAgent.feed && AIAgent.feed.children.length > 15) {
        while (AIAgent.feed.children.length > 15) {
          AIAgent.feed.removeChild(AIAgent.feed.firstChild);
        }
      }

      // 4. Rust tarafındaki malloc_trim ve çekirdek bellek havuzunu tetikle
      try {
        await TauriBridge.invoke('optimize_system_memory');
      } catch (e) {}
    }
  };

  // ============================================================================
  // 17. KLAVYE KISAYOL YÖNETİCİSİ (SHORTCUT MANAGER - TAM ÖZELLEŞTİRİLEBİLİR)
  // ============================================================================
  const ShortcutManager = {
    defaults: [
      { id: 'start_menu', name: 'Başlat Menüsü Aç/Kapat', keys: 'Super' },
      { id: 'terminal', name: 'Uçbirim (Terminal) Başlat', keys: 'Ctrl+Alt+T' },
      { id: 'files', name: 'Dosya Yöneticisi', keys: 'Super+E' },
      { id: 'browser', name: 'Web Tarayıcı (Brave/Ayaz)', keys: 'Super+B' },
      { id: 'taskmgr', name: 'Görev Yöneticisi', keys: 'Ctrl+Shift+Escape' },
      { id: 'settings', name: 'Sistem Ayarları', keys: 'Ctrl+Alt+S' },
      { id: 'clipboard', name: 'Pano Geçmişi (Clipboard)', keys: 'Super+V' },
      { id: 'show_desktop', name: 'Masaüstünü Göster/Gizle', keys: 'Super+D' },
      { id: 'ram_clean', name: 'Hızlı RAM Temizleme', keys: 'Ctrl+Alt+R' },
      { id: 'quick_search', name: 'Evrensel Arama (Spotlight)', keys: 'Alt+Space' },
      { id: 'snap_left', name: 'Pencereyi Sola Yasla (Aero Snap)', keys: 'Super+Left' },
      { id: 'snap_right', name: 'Pencereyi Sağa Yasla (Aero Snap)', keys: 'Super+Right' },
      { id: 'snap_up', name: 'Pencereyi Büyüt / Yukarı Yasla', keys: 'Super+Up' },
      { id: 'snap_down', name: 'Pencereyi Küçült / Aşağı Yasla', keys: 'Super+Down' },
      { id: 'notif_drawer', name: 'Bildirim Merkezi Paneli', keys: 'Super+N' },
      { id: 'lock_screen', name: 'Ekranı Kilitle', keys: 'Super+L' },
      { id: 'screenshot', name: 'Ekran Görüntüsü Al', keys: 'PrintScreen' }
    ],

    shortcuts: [],
    recordingId: null,

    init() {
      this.load();
      const btnReset = document.getElementById('btn-reset-shortcuts');
      if (btnReset) {
        btnReset.addEventListener('click', () => this.resetDefaults());
      }
    },

    load() {
      const saved = SafeStorage.getItem('ankora_custom_shortcuts');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.shortcuts = this.defaults.map(def => {
              const f = parsed.find(p => p.id === def.id);
              return f ? { ...def, keys: f.keys } : def;
            });
            return;
          }
        } catch (e) {}
      }
      this.shortcuts = JSON.parse(JSON.stringify(this.defaults));
    },

    save() {
      SafeStorage.setItem('ankora_custom_shortcuts', JSON.stringify(this.shortcuts));
      if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
        ReportManager.showToast('Klavye kısayolları kaydedildi.');
      }
    },

    resetDefaults() {
      if (confirm('Tüm klavye kısayolları varsayılan değerlerine sıfırlansın mı?')) {
        this.shortcuts = JSON.parse(JSON.stringify(this.defaults));
        this.save();
        this.renderSettings();
      }
    },

    renderSettings() {
      const container = document.getElementById('shortcuts-list-container');
      if (!container) return;
      container.innerHTML = '';

      this.shortcuts.forEach(sc => {
        const row = document.createElement('div');
        row.className = 'shortcut-item-row';
        const isRec = this.recordingId === sc.id;
        row.innerHTML = `
          <div class="shortcut-info">
            <span class="shortcut-title">${escapeHtml(sc.name)}</span>
            <span class="shortcut-desc">Eylem: ${escapeHtml(sc.id)}</span>
          </div>
          <div class="shortcut-action-wrap">
            <span class="shortcut-key-badge ${isRec ? 'recording' : ''}">${isRec ? 'Tuşa Basın...' : escapeHtml(sc.keys)}</span>
            <button class="btn-pkg btn-edit-shortcut" style="padding:4px 10px;font-size:11px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#cbd5e1;border-radius:4px;cursor:pointer;">${isRec ? 'İptal' : 'Değiştir'}</button>
          </div>
        `;

        const btnEdit = row.querySelector('.btn-edit-shortcut');
        btnEdit.addEventListener('click', () => {
          if (this.recordingId === sc.id) {
            this.recordingId = null;
            this.renderSettings();
          } else {
            this.recordKey(sc.id);
          }
        });

        container.appendChild(row);
      });
    },

    recordKey(id) {
      this.recordingId = id;
      this.renderSettings();
      if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
        ReportManager.showToast('Yeni tuş kombinasyonuna basın (örn: Ctrl+Alt+K)... (Çıkmak için Esc)');
      }

      const onKeyDownCapture = (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (e.key === 'Escape') {
          this.recordingId = null;
          window.removeEventListener('keydown', onKeyDownCapture, true);
          this.renderSettings();
          return;
        }

        if (['Control', 'Alt', 'Shift', 'Meta', 'OS'].includes(e.key)) {
          return;
        }

        const parts = [];
        if (e.ctrlKey) parts.push('Ctrl');
        if (e.altKey) parts.push('Alt');
        if (e.shiftKey) parts.push('Shift');
        if (e.metaKey) parts.push('Super');

        let keyName = e.key;
        if (keyName === ' ') keyName = 'Space';
        else if (keyName === 'ArrowLeft') keyName = 'Left';
        else if (keyName === 'ArrowRight') keyName = 'Right';
        else if (keyName === 'ArrowUp') keyName = 'Up';
        else if (keyName === 'ArrowDown') keyName = 'Down';
        else if (keyName.length === 1) keyName = keyName.toUpperCase();
        parts.push(keyName);

        const newCombination = parts.join('+');
        const target = this.shortcuts.find(s => s.id === this.recordingId);
        if (target) {
          target.keys = newCombination;
          this.save();
        }

        this.recordingId = null;
        window.removeEventListener('keydown', onKeyDownCapture, true);
        this.renderSettings();
      };

      window.addEventListener('keydown', onKeyDownCapture, true);
    },

    matches(e, keyComboStr) {
      if (!keyComboStr) return false;
      const parts = keyComboStr.split('+').map(p => p.trim().toLowerCase());
      
      const hasCtrl = parts.includes('ctrl') || parts.includes('control');
      const hasAlt = parts.includes('alt');
      const hasShift = parts.includes('shift');
      const hasSuper = parts.includes('super') || parts.includes('meta') || parts.includes('win');

      const nonModifiers = parts.filter(p => !['ctrl', 'control', 'alt', 'shift', 'super', 'meta', 'win'].includes(p));

      if (nonModifiers.length === 0 && hasSuper) {
        return (e.key === 'Meta' || e.key === 'OS') && !e.ctrlKey && !e.altKey && !e.shiftKey;
      }

      if (e.ctrlKey !== hasCtrl) return false;
      if (e.altKey !== hasAlt) return false;
      if (e.shiftKey !== hasShift) return false;
      if (e.metaKey !== hasSuper) return false;

      if (nonModifiers.length === 0) return false;

      const mainKey = nonModifiers[0].toLowerCase();
      let eventKey = (e.key || '').toLowerCase();
      let eventCode = (e.code || '').toLowerCase();

      if (mainKey === 'space') return eventKey === ' ' || eventCode === 'space';
      if (mainKey === 'escape' || mainKey === 'esc') return eventKey === 'escape';
      if (mainKey === 'printscreen' || mainKey === 'prntscrn') return eventKey === 'printscreen' || eventCode === 'printscreen';
      if (mainKey === 'left' || mainKey === 'arrowleft') return eventKey === 'arrowleft' || eventCode === 'arrowleft';
      if (mainKey === 'right' || mainKey === 'arrowright') return eventKey === 'arrowright' || eventCode === 'arrowright';
      if (mainKey === 'up' || mainKey === 'arrowup') return eventKey === 'arrowup' || eventCode === 'arrowup';
      if (mainKey === 'down' || mainKey === 'arrowdown') return eventKey === 'arrowdown' || eventCode === 'arrowdown';

      return eventKey === mainKey || eventCode === 'key' + mainKey || eventCode === 'digit' + mainKey;
    },

    dispatch(id) {
      switch (id) {
        case 'start_menu': {
          const btn = document.getElementById('start-btn');
          if (btn) btn.click();
          break;
        }
        case 'terminal':
          WindowManager.open('win-terminal');
          break;
        case 'files':
          WindowManager.open('win-files');
          break;
        case 'clipboard':
          if (typeof ClipboardManager !== 'undefined') ClipboardManager.toggle();
          break;
        case 'show_desktop':
          WindowManager.toggleShowDesktop();
          break;
        case 'browser':
          TauriBridge.invoke('launch_application', { exec: 'brave-browser' })
            .then(() => ReportManager?.showToast('Brave Browser başlatıldı.'))
            .catch(() => WindowManager.open('win-browser'));
          break;
        case 'taskmgr':
          WindowManager.open('win-taskmgr');
          break;
        case 'settings':
          WindowManager.open('win-settings');
          break;
        case 'ram_clean':
          if (typeof MemoryManager !== 'undefined') MemoryManager.optimizeRam();
          break;
        case 'quick_search':
        case 'spotlight':
          if (typeof SpotlightManager !== 'undefined') {
            SpotlightManager.toggle();
          } else {
            const startBtn = document.getElementById('start-btn');
            if (startBtn) startBtn.click();
            setTimeout(() => document.getElementById('start-search')?.focus(), 60);
          }
          break;
        case 'snap_left':
          WindowManager.snapActive('left');
          break;
        case 'snap_right':
          WindowManager.snapActive('right');
          break;
        case 'snap_up':
          WindowManager.snapActive('up');
          break;
        case 'snap_down':
          WindowManager.snapActive('down');
          break;
        case 'notif_drawer':
          if (typeof NotificationManager !== 'undefined') {
            NotificationManager.toggleDrawer();
          }
          break;
        case 'lock_screen':
          if (typeof LockScreenManager !== 'undefined') LockScreenManager.lock();
          break;
        case 'screenshot':
          if (typeof ScreenshotManager !== 'undefined' && !ScreenshotManager._captureBusy) {
            ScreenshotManager._captureBusy = true;
            ScreenshotManager.quickCapture().finally(() => { ScreenshotManager._captureBusy = false; });
          }
          break;
      }
    },

    handleKeyDown(e) {
      if (this.recordingId) return true;
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      const isInput = activeTag === 'input' || activeTag === 'textarea' || document.activeElement?.isContentEditable;

      for (const sc of this.shortcuts) {
        if (this.matches(e, sc.keys)) {
          if (isInput && !e.ctrlKey && !e.altKey && !e.metaKey) {
            continue;
          }
          e.preventDefault();
          this.dispatch(sc.id);
          return true;
        }
      }
      return false;
    }
  };

  // Global Klavye Kısayolları (Keyboard Shortcuts)
  window.addEventListener('keydown', (e) => {
    // 1. Özelleştirilebilir Kısayol Yöneticisi Kontrolü
    if (typeof ShortcutManager !== 'undefined' && ShortcutManager.handleKeyDown(e)) {
      return;
    }

    // 2. Süper / Windows Tuşu Fallback
    if (e.key === 'Meta' || e.key === 'OS') {
      const startBtn = document.getElementById('start-btn');
      if (startBtn) startBtn.click();
    }
    // Donanım Medya Tuşları: Ses Artırma
    else if (e.key === 'AudioVolumeUp') {
      e.preventDefault();
      TauriBridge.invoke('get_volume').then((cur) => {
        const nxt = Math.min(100, (typeof cur === 'number' ? cur : 50) + 5);
        TauriBridge.invoke('set_volume', { level: nxt });
        ReportManager?.showToast(`🔊 Ses: %${nxt}`);
      }).catch(() => {});
    }
    // Donanım Medya Tuşları: Ses Azaltma
    else if (e.key === 'AudioVolumeDown') {
      e.preventDefault();
      TauriBridge.invoke('get_volume').then((cur) => {
        const nxt = Math.max(0, (typeof cur === 'number' ? cur : 50) - 5);
        TauriBridge.invoke('set_volume', { level: nxt });
        ReportManager?.showToast(`🔉 Ses: %${nxt}`);
      }).catch(() => {});
    }
    // Donanım Medya Tuşları: Sessize Alma
    else if (e.key === 'AudioVolumeMute') {
      e.preventDefault();
      TauriBridge.invoke('get_volume').then((cur) => {
        const nxt = (cur > 0) ? 0 : 50;
        TauriBridge.invoke('set_volume', { level: nxt });
        ReportManager?.showToast(nxt === 0 ? '🔇 Ses Kapatıldı' : `🔊 Ses: %${nxt}`);
      }).catch(() => {});
    }
    // Donanım Medya Tuşları: Ekran Parlaklığı Artırma
    else if (e.key === 'BrightnessUp') {
      e.preventDefault();
      TauriBridge.invoke('set_brightness', { level: 90 }).then(() => {
        ReportManager?.showToast('☀️ Parlaklık Artırıldı');
      }).catch(() => {});
    }
    // Donanım Medya Tuşları: Ekran Parlaklığı Azaltma
    else if (e.key === 'BrightnessDown') {
      e.preventDefault();
      TauriBridge.invoke('set_brightness', { level: 40 }).then(() => {
        ReportManager?.showToast('🔅 Parlaklık Azaltıldı');
      }).catch(() => {});
    }
    // Esc: başlangıç menüsü ve genel görünüm kapatma initDesktopControls
    // dinleyicisinde tek elden yapılır; burada tekrarı yok.
  });

  // ============================================================================
  // ANKORA LOCK SCREEN MANAGER (NATIVE GÜVENLİ KİLİT & X11 OTURUM KORUMASI) - BULGU #3 GİDERİLDİ
  // ============================================================================
  const LockManager = {
    overlay: null,
    input: null,
    errorMsg: null,
    isLocked: false,
    _locking: false,
    autoLockTimer: null,
    autoLockMinutes: 0,
    lastActivityTime: Date.now(),

    async init() {
      this.overlay = document.getElementById('screen-lock');
      this.input = document.getElementById('lock-password-input');
      this.errorMsg = document.getElementById('lock-error-msg');

      if (!this.overlay) return;

      // Backend native hash yapılandırmasını kontrol et
      try {
        const configured = await TauriBridge.invoke('is_lock_configured');
        const welcomeStatus = document.getElementById('welcome-lock-status-label');
        if (welcomeStatus) {
          welcomeStatus.textContent = configured
            ? 'Kilit şifresi: Ayarlandı ✓'
            : 'Kilit şifresi: Henüz Ayarlanmadı';
          welcomeStatus.style.color = configured ? '#10b981' : '#f59e0b';
        }
      } catch (e) {}

      // Otomatik kilit süresi ayarını yükle
      const savedAutoLock = SafeStorage.getItem('ankora_autolock_mins');
      if (savedAutoLock !== null) {
        this.autoLockMinutes = parseInt(savedAutoLock, 10) || 0;
        this.setupAutoLock();
      }

      // Kilit Saati ve Tarihi Güncelleme. Kilit ekranı kapalıyken saniyelik
      // DOM yazımı gereksiz iş üretir; saat yalnız ekrandayken tazelenir.
      this.updateClock();
      setInterval(() => {
        if (this.overlay && this.overlay.classList.contains('show')) this.updateClock();
      }, 1000);

      // Kilit açıkken klavye yalnız kilit formuna gider: arka plandaki
      // kısayollar, terminal ve gizli pencereler tuş yutamaz. xtrlock bunu
      // X seviyesinde yapar ama PIN girişini de boğduğu için kullanılmıyor;
      // aynı koruma burada DOM seviyesinde, formu serbest bırakarak sağlanır.
      const keyGuard = (e) => {
        if (!this.isLocked || !this.overlay) return;
        if (this.overlay.contains(e.target)) return;
        e.stopPropagation();
        e.preventDefault();
      };
      document.addEventListener('keydown', keyGuard, true);
      document.addEventListener('keyup', keyGuard, true);

      // Form Gönderimi (Kilidi Aç)
      const form = document.getElementById('lock-auth-form');
      if (form) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          this.unlock();
        });
      }

      const btnSubmit = document.getElementById('btn-lock-submit');
      if (btnSubmit) {
        btnSubmit.addEventListener('click', (e) => {
          e.preventDefault();
          this.unlock();
        });
      }

      // Parolayı Göster / Gizle Butonu
      const btnEye = document.getElementById('btn-lock-toggle-pass');
      if (btnEye && this.input) {
        btnEye.addEventListener('click', () => {
          const isPass = this.input.type === 'password';
          this.input.type = isPass ? 'text' : 'password';
          btnEye.innerHTML = isPass
            ? '<svg class="glyph" aria-hidden="true"><use href="#ico-eye-off"></use></svg>'
            : '<svg class="glyph" aria-hidden="true"><use href="#ico-eye"></use></svg>';
        });
      }

      // Kilit Ekranı Güç Butonları (Gerçek Linux Kapatma & Yeniden Başlatma)
      const btnRestart = document.getElementById('lock-btn-restart');
      if (btnRestart) {
        btnRestart.addEventListener('click', async () => {
          try {
            await TauriBridge.invoke('system_reboot');
          } catch (err) {
            // Yedek komut izin listesinden geçmez; kilit ekranında görünür hatadır.
            this.showError(`Yeniden başlatılamadı: ${err.message || err}`);
          }
        });
      }

      const btnShutdown = document.getElementById('lock-btn-shutdown');
      if (btnShutdown) {
        btnShutdown.addEventListener('click', async () => {
          try {
            await TauriBridge.invoke('system_poweroff');
          } catch (err) {
            // Yedek komut izin listesinden geçmez; kilit ekranında görünür hatadır.
            this.showError(`Kapatılamadı: ${err.message || err}`);
          }
        });
      }

      // Klavye Kısayolu: Super+L veya Ctrl+Alt+L ile doğrudan kilitleme
      document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey && e.altKey && e.key.toLowerCase() === 'l') || (e.metaKey && e.key.toLowerCase() === 'l')) {
          e.preventDefault();
          this.lock();
        }
      });

      // Kullanıcı Etkinliği (Boşta Kalma Tespiti)
      ['mousedown', 'mousemove', 'keydown', 'touchstart'].forEach(evt => {
        document.addEventListener(evt, () => this.resetActivityTimer(), { passive: true });
      });
    },

    updateClock() {
      const timeEl = document.getElementById('lock-clock-time');
      const dateEl = document.getElementById('lock-clock-date');
      if (!timeEl || !dateEl) return;

      const now = new Date();
      const timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      if (timeEl.textContent !== timeStr) timeEl.textContent = timeStr;

      const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
      const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
      const dateStr = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
      if (dateEl.textContent !== dateStr) dateEl.textContent = dateStr;
    },

    // Görünürlük stil sayfasına bırakılmaz: kilit ekranı `.show` sınıfına ve
    // sayfadaki CSS'e mahkûm olmasın. Açılışta geçiş de kapatılır; WebKitGTK
    // katmanı opacity'yi 0'da dondurursa ekran hiç gelmez.
    showOverlay() {
      this.overlay.classList.add('show');
      const s = this.overlay.style;
      s.setProperty('display', 'flex', 'important');
      s.setProperty('opacity', '1', 'important');
      s.setProperty('visibility', 'visible', 'important');
      s.setProperty('pointer-events', 'auto', 'important');
      s.setProperty('transform', 'none', 'important');
      s.setProperty('transition', 'none', 'important');
      s.zIndex = '2147483000';
    },

    hideOverlay() {
      this.overlay.classList.remove('show');
      this.overlay.style.cssText = '';
    },

    async lock() {
      // Super+L iki ayrı keydown dinleyicisinden geçebiliyor (masaüstü
      // kısayolu + kilit yöneticisi); ikinci çağrı ikinci kilidi
      // doğuruyordu. is_lock_configured çağrısı asenkron olduğu için beklerken
      // de ikinci bir lock() başlayabilir, o yüzden ayrı bir kilit bayrağı var.
      if (!this.overlay || this.isLocked || this._locking) return;
      this._locking = true;
      try {
        // Eğer henüz PIN ayarlanmamışsa kullanıcıyı uyar
        let configured = false;
        try {
          configured = await TauriBridge.invoke('is_lock_configured');
        } catch (e) {
          Terminal.log(`[KİLİT] Kilit yapılandırması sorulamadı: ${e}`, 'error');
        }
        if (!configured) {
          if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
            ReportManager.showToast("Önce Ayarlar veya Hoş Geldiniz ekranından bir kilit PIN'i belirleyin.");
          }
          if (typeof WindowManager !== 'undefined') {
            WindowManager.open('win-welcome');
          }
          return;
        }

        this.isLocked = true;
        this.updateClock();
        this.showOverlay();
        const watchWave = document.getElementById('ai-watch-wave');
        if (watchWave) watchWave.hidden = true;
        try {
          TauriBridge.invoke('set_desktop_layer', { above: true }).catch(() => {});
        } catch (e) {}
        if (this.errorMsg) {
          this.errorMsg.textContent = '';
          this.errorMsg.classList.remove('show', 'success');
        }
        if (this.input) {
          this.input.value = '';
          setTimeout(() => { if (this.input) this.input.focus(); }, 150);
        }
        Terminal.log('[GÜVENLİK] Oturum kilitlendi (kiosk kilidi).', 'cmd');
      } finally {
        this._locking = false;
      }
    },

    async unlock() {
      if (!this.input) return;
      const entered = this.input.value.trim();

      const btnSubmit = document.getElementById('btn-lock-submit');
      if (btnSubmit) btnSubmit.disabled = true;

      try {
        const ok = await TauriBridge.invoke('verify_lock_credentials', { pin: entered });
        if (ok) {
          this.isLocked = false;
          this.hideOverlay();
          if (typeof window.syncAiMiniWatch === 'function') window.syncAiMiniWatch();
          try {
            TauriBridge.invoke('set_desktop_layer', { above: false }).catch(() => {});
          } catch (e) {}
          this.input.value = '';
          // X11 girişi xtrlock'ta yakalanır: süreç kapatılmazsa imleç kilit
          // simgesinde kalır ve masaüstünde hiçbir yere tıklanamaz.
          try {
            await TauriBridge.invoke('unlock_x11_session');
          } catch (e) {
            Terminal.log(`[KİLİT] X11 kilidi açılamadı: ${e}`, 'error');
          }
          Terminal.log('[GÜVENLİK] Kilit açıldı. Hoş geldiniz.', 'cmd');
          this.resetActivityTimer();
        } else {
          this.showError('Hatalı PIN veya Parola! Lütfen tekrar deneyin.');
          this.input.classList.add('error-shake');
          setTimeout(() => {
            if (this.input) this.input.classList.remove('error-shake');
          }, 500);
          this.input.select();
        }
      } catch (err) {
        this.showError(`Kilit Hatası: ${err}`);
        this.input.classList.add('error-shake');
        setTimeout(() => {
          if (this.input) this.input.classList.remove('error-shake');
        }, 500);
      } finally {
        if (btnSubmit) btnSubmit.disabled = false;
      }
    },

    showError(msg, isError = true) {
      if (!this.errorMsg) return;
      this.errorMsg.textContent = msg;
      this.errorMsg.classList.toggle('success', !isError);
      this.errorMsg.classList.add('show');
    },

    async setPin(currentPin, newPin) {
      if (!newPin || newPin.length < 4) {
        return { success: false, error: 'Yeni PIN en az 4 karakter olmalıdır.' };
      }
      try {
        await TauriBridge.invoke('set_lock_credentials', {
          currentPin: currentPin || null,
          newPin: newPin,
          current_pin: currentPin || null,
          new_pin: newPin
        });
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    },

    setupAutoLock() {
      if (this.autoLockTimer) clearInterval(this.autoLockTimer);
      if (this.autoLockMinutes <= 0) return;
      this.lastActivityTime = Date.now();
      this.autoLockTimer = setInterval(() => {
        if (!this.isLocked && this.autoLockMinutes > 0) {
          const idleTime = Date.now() - (this.lastActivityTime || Date.now());
          if (idleTime >= this.autoLockMinutes * 60 * 1000) {
            this.lock();
          }
        }
      }, 10000);
    },

    resetActivityTimer() {
      this.lastActivityTime = Date.now();
    }
  };

  // ============================================================================
  // ANKORA DİNAMİK ADA (DYNAMIC ISLAND & AKILLI CAM KAPSÜL)
  // ============================================================================
  const DynamicIsland = {
    KEY: 'ankora_dynamic_island',
    el: null,
    timer: null,
    expanded: false,

    init() {
      this.el = document.getElementById('dynamic-island');
      const container = document.getElementById('dynamic-island-container');
      if (!this.el || !container) return;

      const enabled = this.isEnabled();
      container.style.display = enabled ? 'flex' : 'none';

      // Ayarlar toggle bağlantısı
      const chk = document.getElementById('settings-dynamic-island');
      if (chk) {
        chk.checked = enabled;
        chk.addEventListener('change', () => {
          this.setEnabled(chk.checked);
        });
      }

      // Kapsüle tıklayınca genişletme
      this.el.addEventListener('click', (e) => {
        if (e.target.closest('#di-card-close')) {
          this.collapse();
          return;
        }
        if (this.el.classList.contains('state-toast') || this.el.classList.contains('state-progress')) {
          return;
        }
        if (!this.expanded) {
          this.expand();
        }
      });

      // Dışarı tıklayınca kapatma
      document.addEventListener('click', (e) => {
        if (this.expanded && !e.target.closest('#dynamic-island-container')) {
          this.collapse();
        }
      });

      // Escape tuşuyla kapatma
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.expanded) {
          this.collapse();
        }
      });

      // Kontrol butonları
      const btnKalem = document.getElementById('di-btn-fatih-kalem');
      if (btnKalem) {
        btnKalem.addEventListener('click', (e) => {
          e.stopPropagation();
          this.collapse();
          this.launchFatihKalem();
        });
      }

      const btnRam = document.getElementById('di-btn-ram-eco');
      if (btnRam) {
        btnRam.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await TauriBridge.invoke('optimize_system_memory');
            this.flash('Bellek optimize edildi', 'success');
          } catch (err) {
            this.flash('Bellek temizlendi', 'info');
          }
          this.collapse();
        });
      }

      const btnWeather = document.getElementById('di-btn-weather');
      if (btnWeather) {
        btnWeather.addEventListener('click', (e) => {
          e.stopPropagation();
          this.collapse();
          WindowManager.open('win-widgets');
        });
      }

      const btnAi = document.getElementById('di-btn-ai-assist');
      if (btnAi) {
        btnAi.addEventListener('click', (e) => {
          e.stopPropagation();
          this.collapse();
          WindowManager.open('win-ai');
        });
      }

      const btnLock = document.getElementById('di-btn-lock');
      if (btnLock) {
        btnLock.addEventListener('click', (e) => {
          e.stopPropagation();
          this.collapse();
          if (typeof LockManager !== 'undefined' && LockManager.lock) {
            LockManager.lock();
          }
        });
      }

      // Canlı sistem telemetrisi (hafif, 4 saniyede bir)
      setInterval(() => this.updateTelemetry(), 4000);
      this.updateTelemetry();
    },

    isEnabled() {
      return SafeStorage.getItem(this.KEY) !== '0';
    },

    setEnabled(enabled) {
      SafeStorage.setItem(this.KEY, enabled ? '1' : '0');
      const container = document.getElementById('dynamic-island-container');
      if (container) container.style.display = enabled ? 'flex' : 'none';
      if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
        ReportManager.showToast(enabled ? 'Dinamik Ada etkinleştirildi.' : 'Dinamik Ada kapatıldı.');
      }
    },

    expand() {
      if (!this.el) return;
      this.expanded = true;
      this.el.classList.add('state-expanded');
      this.updateTelemetry();
    },

    collapse() {
      if (!this.el) return;
      this.expanded = false;
      this.el.classList.remove('state-expanded');
    },

    flash(msg, kind = 'info', duration = 3400) {
      if (!this.el || !this.isEnabled()) return;
      clearTimeout(this.timer);
      const toastText = document.getElementById('di-toast-text');
      const toastIcon = document.getElementById('di-toast-icon');
      if (toastText) toastText.textContent = msg;
      if (toastIcon) {
        toastIcon.textContent = kind === 'error' ? '⚠️' : (kind === 'success' ? '✓' : 'ℹ');
      }

      this.el.classList.remove('state-idle', 'state-expanded', 'state-progress', 'state-ai');
      this.el.classList.add('state-toast', `toast-${kind}`);

      this.timer = setTimeout(() => {
        this.el.classList.remove('state-toast', `toast-${kind}`);
        if (!this.expanded) this.el.classList.add('state-idle');
      }, duration);
    },

    pulseAi(text = 'AI İşlemde', duration = 3000) {
      if (!this.el || !this.isEnabled()) return;
      clearTimeout(this.timer);
      const aiText = document.getElementById('di-ai-text');
      if (aiText) aiText.textContent = text;
      this.el.classList.remove('state-idle', 'state-expanded', 'state-toast', 'state-progress');
      this.el.classList.add('state-ai');

      this.timer = setTimeout(() => {
        this.el.classList.remove('state-ai');
        if (!this.expanded) this.el.classList.add('state-idle');
      }, duration);
    },

    showDownload(filename, percent = 100) {
      if (!this.el || !this.isEnabled()) return;
      clearTimeout(this.timer);
      const label = document.getElementById('di-prog-label');
      const fill = document.getElementById('di-prog-fill');
      const pct = document.getElementById('di-prog-percent');
      if (label) label.textContent = filename || 'İndiriliyor';
      if (fill) fill.style.width = `${percent}%`;
      if (pct) pct.textContent = `${percent}%`;

      this.el.classList.remove('state-idle', 'state-expanded', 'state-toast', 'state-ai');
      this.el.classList.add('state-progress');

      this.timer = setTimeout(() => {
        this.el.classList.remove('state-progress');
        if (!this.expanded) this.el.classList.add('state-idle');
      }, 3500);
    },

    updateTelemetry() {
      if (!this.isEnabled()) return;
      TauriBridge.invoke('get_system_telemetry').then((data) => {
        if (!data) return;
        const cpuEl = document.getElementById('di-footer-cpu');
        const ramEl = document.getElementById('di-footer-ram');
        const subEl = document.getElementById('di-idle-sub');
        const pulseDot = document.getElementById('di-pulse-dot');
        const weatherBtn = document.getElementById('di-btn-weather-text');

        if (cpuEl && data.cpu_usage !== undefined) cpuEl.textContent = `CPU: %${Math.round(data.cpu_usage)}`;
        if (ramEl && data.ram_used_mb) ramEl.textContent = `RAM: ${Math.round(data.ram_used_mb)} MB`;
        if (subEl && data.ram_used_mb) subEl.textContent = `${Math.round(data.ram_used_mb)} MB`;
        if (pulseDot) {
          pulseDot.style.background = (data.cpu_usage > 75) ? '#ef4444' : (data.cpu_usage > 40 ? '#f59e0b' : '#10b981');
        }

        const tempEl = document.getElementById('dw-weather-temp');
        if (weatherBtn && tempEl && tempEl.textContent !== '--') {
          weatherBtn.textContent = `${tempEl.textContent}°C`;
        }
      }).catch(() => {});
    },

    launchFatihKalem() {
      Terminal.log('[FATİH KALEM] Akıllı tahta ve ekran kalemi başlatılıyor...', 'cmd');
      TauriBridge.invoke('launch_application', { exec: 'fatih-kalem' })
        .then(() => {
          this.flash('Fatih Kalem başlatıldı', 'success');
        })
        .catch((err) => {
          TauriBridge.invoke('launch_application', { exec: 'python3 -m fatihkalem' })
            .then(() => this.flash('Fatih Kalem başlatıldı', 'success'))
            .catch(() => {
              this.flash('Fatih Kalem başlatılamadı: ' + err, 'error');
            });
        });
    }
  };

  // ============================================================================
  // ANKORA REPORT MANAGER (HATA BİLDİRİMİ, SİSTEM TANILAMA & TOPLULUK İLETİŞİMİ)
  // ============================================================================
  const ReportManager = {
    forumUrl: 'https://ankalab.flarum.cloud',
    siteUrl: 'https://ankora-linux.github.io',
    telemetry: null,
    _toastTimeout: null,

    init() {
      const btnOpenForum = document.getElementById('btn-open-forum');
      const btnCopyForum = document.getElementById('btn-copy-forum');
      const btnOpenSite = document.getElementById('btn-open-site');
      const btnCopySite = document.getElementById('btn-copy-site');
      const btnCopyReport = document.getElementById('btn-copy-report');
      const btnPostForum = document.getElementById('btn-post-forum');
      const btnRefreshTelemetry = document.getElementById('btn-refresh-telemetry');

      const selectCategory = document.getElementById('report-category');
      const inputSubject = document.getElementById('report-subject');
      const textareaDetails = document.getElementById('report-details');
      const chkIncludeTelemetry = document.getElementById('report-include-telemetry');

      // Topluluk Forumu Açma & Kopyalama
      if (btnOpenForum) {
        btnOpenForum.addEventListener('click', () => this.openUrl(this.forumUrl));
      }
      if (btnCopyForum) {
        btnCopyForum.addEventListener('click', () => this.copyToClipboard(this.forumUrl, 'Forum adresi kopyalandı!'));
      }

      // Resmi Web Sitesi Açma & Kopyalama
      if (btnOpenSite) {
        btnOpenSite.addEventListener('click', () => this.openUrl(this.siteUrl));
      }
      if (btnCopySite) {
        btnCopySite.addEventListener('click', () => this.copyToClipboard(this.siteUrl, 'Web sitesi adresi kopyalandı!'));
      }

      // Canlı Rapor Güncelleme Dinleyicileri
      [selectCategory, inputSubject, textareaDetails, chkIncludeTelemetry].forEach(el => {
        if (el) {
          el.addEventListener('input', () => this.updateReportPreview());
          el.addEventListener('change', () => this.updateReportPreview());
        }
      });

      // Telemetri Yenileme Butonu
      if (btnRefreshTelemetry) {
        btnRefreshTelemetry.addEventListener('click', async () => {
          await this.loadTelemetry();
          this.updateReportPreview();
          this.showToast('Sistem tanılama verileri güncellendi.');
        });
      }

      // Raporu Panoya Kopyalama Butonu
      if (btnCopyReport) {
        btnCopyReport.addEventListener('click', () => {
          const reportText = this.generateReportMarkdown();
          this.copyToClipboard(reportText, 'Tanılama raporu panoya kopyalandı!');
        });
      }

      // Forumda Başlık Aç Butonu
      if (btnPostForum) {
        btnPostForum.addEventListener('click', () => {
          const reportText = this.generateReportMarkdown();
          this.copyToClipboard(reportText, 'Rapor kopyalandı! Forum sayfası açılıyor...');
          setTimeout(() => {
            this.openUrl(this.forumUrl);
          }, 350);
        });
      }

      // İlk telemetri yüklemesi
      this.loadTelemetry().then(() => {
        this.updateReportPreview();
      });
    },

    async loadTelemetry() {
      try {
        const tel = await TauriBridge.invoke('get_system_telemetry');
        if (tel) {
          this.telemetry = tel;
          return;
        }
      } catch (e) {}

      // Standart Devuan Kiosk Telemetri Fallback
      this.telemetry = {
        os_name: 'Devuan GNU/Linux 5 (daedalus)',
        kernel: 'Linux 6.1.0-22-amd64',
        init_system: 'SysVinit (systemd-free)',
        memory_used_mb: 1140,
        memory_total_mb: 8192,
        cpu_cores: (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4,
        uptime_seconds: 3600
      };
    },

    generateReportMarkdown() {
      const categoryEl = document.getElementById('report-category');
      const subjectEl = document.getElementById('report-subject');
      const detailsEl = document.getElementById('report-details');
      const chkTel = document.getElementById('report-include-telemetry');

      const category = categoryEl ? categoryEl.options[categoryEl.selectedIndex]?.text : 'Genel';
      const subject = (subjectEl && subjectEl.value.trim()) || 'Konu belirtilmedi';
      const details = (detailsEl && detailsEl.value.trim()) || 'Açıklama girilmedi.';
      const includeTelemetry = chkTel ? chkTel.checked : true;

      const dateStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

      let md = `### [Ankora Report] ${subject}\n\n`;
      md += `**Kategori:** ${category}\n`;
      md += `**Tarih / Saat:** ${dateStr} UTC\n\n`;
      md += `#### Açıklama & Yeniden Oluşturma Adımları\n${details}\n\n`;

      if (includeTelemetry && this.telemetry) {
        const memPercent = Math.round((this.telemetry.memory_used_mb / Math.max(1, this.telemetry.memory_total_mb)) * 100);
        const uptimeHours = Math.floor(this.telemetry.uptime_seconds / 3600);
        const uptimeMins = Math.floor((this.telemetry.uptime_seconds % 3600) / 60);

        md += `#### Sistem Tanılama Verileri\n`;
        md += `\`\`\`yaml\n`;
        md += `İşletim Sistemi : ${this.telemetry.os_name}\n`;
        md += `Masaüstü Ortamı : Ayaz DE v3.7.0 (Ankora Kiosk / X11)\n`;
        md += `Çekirdek (Kernel): ${this.telemetry.kernel}\n`;
        md += `İnit Sistemi     : ${this.telemetry.init_system}\n`;
        md += `CPU Çekirdek     : ${this.telemetry.cpu_cores} İş parçacığı\n`;
        md += `Bellek (RAM)     : ${this.telemetry.memory_used_mb} MB / ${this.telemetry.memory_total_mb} MB (%${memPercent})\n`;
        md += `Çalışma Süresi   : ${uptimeHours} sa ${uptimeMins} dk\n`;
        md += `Kullanıcı Ajanı  : ${typeof navigator !== 'undefined' ? navigator.userAgent : 'WebKitGTK'}\n`;
        md += `Ekran Çözünürlüğü: ${typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'N/A'}\n`;
        md += `\`\`\`\n\n`;
        md += `---\n*Topluluk Forumu: https://ankalab.flarum.cloud | Resmi Web Sitesi: https://ankora-linux.github.io*`;
      }

      return md;
    },

    updateReportPreview() {
      const previewEl = document.getElementById('report-preview-text');
      if (previewEl) {
        previewEl.textContent = this.generateReportMarkdown();
      }
    },

    async copyToClipboard(text, successMessage = 'Kopyalandı!') {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        this.showToast(successMessage);
      } catch (err) {
        this.showToast('Panoya kopyalama başarısız oldu.');
      }
    },

    // kind: 'info' sıradan bildirim, 'error' hata. Rahatsız Etme modu açıkken
    // yalnızca hata bildirimleri ekrana çıkar; diğerleri Terminal'e yazılır.
    showToast(message, kind = 'info') {
      if (kind !== 'error' && SafeStorage.getItem('ankora_dnd') === '1') {
        Terminal.log(`[BİLDİRİM (sessiz)] ${message}`, 'muted');
        return;
      }
      // Toast aynı zamanda bildirim merkezine de düşer; aksi hâlde
      // kullanıcı merkezde hiçbir şey görmez (test geri bildirimi #5).
      try {
        if (typeof NotificationManager !== 'undefined' && NotificationManager.pushLocal) {
          NotificationManager.pushLocal(message);
        }
      } catch (e) {}
      try {
        if (typeof DynamicIsland !== 'undefined' && DynamicIsland.flash) {
          DynamicIsland.flash(message, kind);
        }
      } catch (e) {}
      let toast = document.getElementById('ayaz-global-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'ayaz-global-toast';
        toast.className = 'ayaz-toast-notification';
        document.body.appendChild(toast);
      }
      toast.textContent = message;
      toast.classList.add('show');
      clearTimeout(this._toastTimeout);
      this._toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
      }, 2600);
    },

    openUrl(url) {
      try {
        if (typeof BrowserManager !== 'undefined' && typeof WindowManager !== 'undefined') {
          const winBrowser = document.getElementById('win-browser');
          if (winBrowser) {
            WindowManager.open(winBrowser);
            BrowserManager.navigate(url);
            this.showToast(`${url} açılıyor...`);
            return;
          }
        }
      } catch (e) {}

      try {
        window.open(url, '_blank');
      } catch (e) {}
    }
  };

  // ============================================================================
  // MASAÜSTÜ WIDGET YÖNETİCİSİ (KONTROL PANELİ + SAĞ ÜST KATMAN)
  // ============================================================================
  const WidgetManager = {
    storageKey: 'ankora_desktop_widgets',

    // Hem Widget Merkezi satırlarını hem masaüstü kartlarını bu liste besler.
    defs: [
      {
        id: 'clock',
        title: 'Saat ve Tarih',
        hint: 'Büyük saat, altında günün tarihi'
      },
      {
        id: 'weather',
        title: 'Hava Durumu',
        hint: 'Seçili şehir için anlık durum ve üç günlük tahmin'
      },
      {
        id: 'system',
        title: 'Bellek ve Çalışma Süresi',
        hint: 'RAM çubuğu, çekirdek sayısı, açık kalma süresi'
      },
      {
        id: 'distro',
        title: 'Sistem Künyesi',
        hint: 'Dağıtım adı, çekirdek ve init sistemi'
      },
      {
        id: 'disk',
        title: 'Depolama Doluluğu',
        hint: 'Kök disk ve zram kullanım çubuğu'
      },
      {
        id: 'network',
        title: 'Ağ Durumu',
        hint: 'Bağlantı, arayüz ve IP adresi'
      },
      {
        id: 'todo',
        title: 'Yapılacaklar',
        hint: 'Kalem ekle/düzenle; yerelde kalıcı'
      },
      {
        id: 'mini-cal',
        title: 'Mini Takvim',
        hint: 'Bu ayın günleri, bugün vurgulu'
      },
      {
        id: 'dayplan',
        title: 'Günün Planı',
        hint: 'Bugünün açık görevleri ve saatleri'
      }
    ],

    TODO_KEY: 'ankora_todo_items',
    WEATHER_CITY_KEY: 'ankora_weather_city',
    WEATHER_CACHE_KEY: 'ankora_weather_cache',
    WEATHER_FRESH_MS: 15 * 60 * 1000,

    enabled: [],
    layer: null,
    clockTimer: null,
    lastTelemetry: null,
    lastPct: null,

    init() {
      this.layer = document.getElementById('desktop-widgets');
      this.enabled = this.load();
      // Hava durumu sonradan eklendi. Widget katmanını zaten kullanan
      // kullanıcıda bir kez görünür olur; tüm widget'ları kapatanlara dokunmaz.
      if (this.enabled.length > 0
          && SafeStorage.getItem('ankora_weather_widget_added') !== '1') {
        if (!this.isEnabled('weather')) {
          this.enabled.push('weather');
          this.save();
        }
        SafeStorage.setItem('ankora_weather_widget_added', '1');
      }
      this.renderPanel();
      this.renderLayer();

      // Sekme arkadayken dakika sayacı boşa uyanmasın.
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.stopClock();
          return;
        }
        if (this.isEnabled('clock')) this.startClock();
        if (this.isEnabled('weather') && document.getElementById('dw-weather-temp')) {
          const cache = this.weatherCache();
          if (!this._weatherAt || Date.now() - this._weatherAt >= this.WEATHER_FRESH_MS) this.loadWeather();
          else if (cache) this.paintWeather(cache.data, cache.city, cache.at);
        }
      });
    },

    load() {
      const fallback = ['clock', 'weather', 'system'];
      const raw = SafeStorage.getItem(this.storageKey);
      if (!raw) return fallback;
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return fallback;
        const known = this.defs.map(d => d.id);
        return parsed.filter(id => known.indexOf(id) !== -1);
      } catch (e) {
        return fallback;
      }
    },

    save() {
      SafeStorage.setItem(this.storageKey, JSON.stringify(this.enabled));
    },

    isEnabled(id) {
      return this.enabled.indexOf(id) !== -1;
    },

    toggle(id) {
      if (!this.defs.some(d => d.id === id)) return;
      if (this.isEnabled(id)) {
        this.enabled = this.enabled.filter(x => x !== id);
      } else {
        this.enabled.push(id);
      }
      this.save();
      this.renderLayer();
      this.syncClock();

      const box = document.getElementById('wg-' + id);
      if (box) box.checked = this.isEnabled(id);
    },

    renderPanel() {
      const list = document.getElementById('widget-toggle-list');
      if (!list) return;
      list.textContent = '';

      this.defs.forEach(def => {
        const row = document.createElement('label');
        row.className = 'widget-row';
        row.htmlFor = 'wg-' + def.id;

        const box = document.createElement('input');
        box.type = 'checkbox';
        box.id = 'wg-' + def.id;
        box.checked = this.isEnabled(def.id);
        box.addEventListener('change', () => this.toggle(def.id));

        const text = document.createElement('span');
        text.className = 'widget-row-text';

        const title = document.createElement('span');
        title.className = 'widget-row-title';
        title.textContent = def.title;

        const hint = document.createElement('span');
        hint.className = 'widget-row-hint';
        hint.textContent = def.hint;

        text.appendChild(title);
        text.appendChild(hint);
        row.appendChild(box);
        row.appendChild(text);
        list.appendChild(row);
      });
    },

    renderLayer() {
      if (!this.layer) return;
      this.layer.textContent = '';
      this.layer.hidden = this.enabled.length === 0;

      this.defs.forEach(def => {
        if (!this.isEnabled(def.id)) return;
        const card = document.createElement('section');
        card.className = 'desk-widget';
        card.setAttribute('aria-label', def.title);
        card.appendChild(this.buildCard(def.id));
        this.layer.appendChild(card);
      });

      this.paintClock();
      this.syncExtras();
      if (this.lastTelemetry) this.onTelemetry(this.lastTelemetry, this.lastPct);
    },

    buildCard(id) {
      const wrap = document.createElement('div');
      wrap.className = 'dw-body';

      if (id === 'clock') {
        wrap.appendChild(this.make('div', 'dw-time', 'dw-clock-time', '--:--'));
        wrap.appendChild(this.make('div', 'dw-date', 'dw-clock-date', ''));
        return wrap;
      }

      if (id === 'weather') {
        this.buildWeather(wrap);
        return wrap;
      }

      if (id === 'system') {
        wrap.appendChild(this.make('div', 'dw-head', null, 'Bellek'));

        const meter = document.createElement('div');
        meter.className = 'dw-meter';
        meter.setAttribute('role', 'img');
        const fill = document.createElement('span');
        fill.className = 'dw-meter-fill lvl-ok';
        fill.id = 'dw-sys-fill';
        fill.style.width = '0%';
        meter.appendChild(fill);
        wrap.appendChild(meter);

        const rows = document.createElement('div');
        rows.className = 'dw-rows';
        rows.appendChild(this.make('span', null, 'dw-sys-ram', '—'));
        rows.appendChild(this.make('span', null, 'dw-sys-cores', '—'));
        wrap.appendChild(rows);

        wrap.appendChild(this.make('div', 'dw-sub', 'dw-sys-uptime', '—'));
        return wrap;
      }

      if (id === 'disk') {
        this.buildDisk(wrap);
        return wrap;
      }

      if (id === 'network') {
        this.buildNetwork(wrap);
        return wrap;
      }

      if (id === 'todo') {
        this.buildTodo(wrap);
        return wrap;
      }

      if (id === 'mini-cal') {
        this.buildMiniCal(wrap);
        return wrap;
      }

      if (id === 'dayplan') {
        this.buildDayPlan(wrap);
        return wrap;
      }

      // distro
      wrap.appendChild(this.make('div', 'dw-head', null, 'Sistem'));
      const meta = document.createElement('div');
      meta.className = 'dw-meta';
      [['Dağıtım', 'dw-distro-os'], ['Çekirdek', 'dw-distro-kernel'], ['Init', 'dw-distro-init']]
        .forEach(pair => {
          const line = document.createElement('div');
          line.className = 'dw-meta-line';
          line.appendChild(this.make('span', 'dw-meta-key', null, pair[0]));
          line.appendChild(this.make('span', 'dw-meta-val', pair[1], '—'));
          meta.appendChild(line);
        });
      wrap.appendChild(meta);
      return wrap;
    },

    // --- Hava durumu: Open-Meteo, API anahtarsız. Şehir seçimi yerelde. ---
    buildWeather(wrap) {
      const box = this.make('div', 'dw-weather');
      const top = this.make('div', 'dw-weather-top');
      const main = this.make('div', 'dw-weather-main');

      const temp = document.createElement('div');
      temp.className = 'dw-weather-temp';
      temp.innerHTML = '<span id="dw-weather-temp">--</span><span class="unit">°</span>';
      main.appendChild(temp);
      main.appendChild(this.make('div', 'dw-weather-place', 'dw-weather-place', 'Ankara'));

      const icon = this.make('div', 'dw-weather-icon');
      icon.id = 'dw-weather-icon';
      icon.appendChild(this.weatherIconNode(2, true));

      top.appendChild(main);
      top.appendChild(icon);
      box.appendChild(top);
      box.appendChild(this.make('div', 'dw-weather-desc', 'dw-weather-desc', 'Yükleniyor…'));

      const meta = this.make('div', 'dw-weather-meta');
      meta.appendChild(this.make('span', null, 'dw-weather-high', 'En yüksek —'));
      meta.appendChild(this.make('span', null, 'dw-weather-low', 'En düşük —'));
      meta.appendChild(this.make('span', null, 'dw-weather-wind', 'Rüzgâr —'));
      box.appendChild(meta);
      box.appendChild(this.make('div', 'dw-weather-days', 'dw-weather-days'));

      const weatherActions = this.make('div', 'dw-weather-actions');
      const cityBtn = document.createElement('button');
      cityBtn.type = 'button';
      cityBtn.className = 'dw-weather-city-btn';
      cityBtn.textContent = 'Şehir değiştir';
      const refreshBtn = document.createElement('button');
      refreshBtn.type = 'button';
      refreshBtn.className = 'dw-weather-refresh-btn';
      refreshBtn.title = 'Hava durumunu hemen yenile';
      refreshBtn.textContent = '↻';
      refreshBtn.addEventListener('click', () => {
        refreshBtn.classList.add('rotating');
        this.loadWeather(true).finally(() => {
          setTimeout(() => refreshBtn.classList.remove('rotating'), 600);
        });
      });
      weatherActions.appendChild(cityBtn);
      weatherActions.appendChild(refreshBtn);
      box.appendChild(weatherActions);

      const search = this.make('div', 'dw-weather-search');
      search.id = 'dw-weather-search';
      search.hidden = true;
      const row = this.make('div', 'dw-weather-search-row');
      const input = document.createElement('input');
      input.type = 'search';
      input.id = 'dw-weather-city-input';
      input.placeholder = 'Şehir adı';
      input.autocomplete = 'off';
      input.setAttribute('aria-label', 'Hava durumu için şehir ara');
      const go = document.createElement('button');
      go.type = 'button';
      go.textContent = 'Ara';
      row.appendChild(input);
      row.appendChild(go);
      search.appendChild(row);
      search.appendChild(this.make('div', 'dw-weather-results', 'dw-weather-results'));
      box.appendChild(search);
      box.appendChild(this.make('div', 'dw-weather-status', 'dw-weather-status'));

      const toggle = () => {
        search.hidden = !search.hidden;
        if (!search.hidden) setTimeout(() => input.focus(), 0);
      };
      cityBtn.addEventListener('click', toggle);
      go.addEventListener('click', () => this.searchWeatherCity());
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          this.searchWeatherCity();
        } else if (e.key === 'Escape') {
          e.stopPropagation();
          search.hidden = true;
        }
      });

      wrap.appendChild(box);
      this.loadWeather();
    },

    weatherIconSvg(code, isDay) {
      const c = Number(code);
      const open = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
      const close = '</svg>';
      const sun = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
      const moon = '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>';
      const cloud = '<path d="M17 18H7a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17.2 9.5 4.25 4.25 0 0 1 17 18z"/>';
      const partly = '<circle cx="8.5" cy="8" r="2.6"/><path d="M8.5 2.5v1.2M3.1 8h1.2M4.7 4.2l.9.9M12.3 4.2l-.9.9M2.8 12.5l.9-.9"/><path d="M18 19H9a3.5 3.5 0 0 1-.4-6.98A4.8 4.8 0 0 1 18 13.2 3 3 0 0 1 18 19z"/>';
      const partlyNight = '<path d="M11.5 4.4A6.5 6.5 0 0 0 5 12.2a5 5 0 0 0 1.5 6.8"/><path d="M18 19H9a3.5 3.5 0 0 1-.4-6.98A4.8 4.8 0 0 1 18 13.2 3 3 0 0 1 18 19z"/>';

      if (c === 0) return open + (isDay ? sun : moon) + close;
      if (c === 1 || c === 2) return open + (isDay ? partly : partlyNight) + close;
      if (c === 3) return open + cloud + close;
      if (c === 45 || c === 48) return open + cloud + '<path d="M6 21h12M8 23h8"/>' + close;
      if (c >= 51 && c <= 57) return open + cloud + '<path d="M8 20l-.6 1.2M12 20l-.6 1.2M16 20l-.6 1.2"/>' + close;
      if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return open + cloud + '<path d="M8 20l-.8 1.6M12 20l-.8 1.6M16 20l-.8 1.6"/>' + close;
      if ((c >= 71 && c <= 77) || c === 85 || c === 86) return open + cloud + '<path d="M8 20h.01M12 20h.01M16 20h.01M8 22h.01M12 22h.01M16 22h.01"/>' + close;
      if (c >= 95) return open + cloud + '<path d="M12 19l-1.5 2.5h3L12 24"/>' + close;
      return open + cloud + close;
    },

    weatherKind(code) {
      const c = Number(code);
      if (c === 0) return 'sun';
      if (c === 1 || c === 2) return 'cloud';
      if (c === 45 || c === 48) return 'cloud';
      if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return 'rain';
      if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
      if (c >= 95) return 'storm';
      return 'cloud';
    },

    weatherLabel(code) {
      const c = Number(code);
      if (c === 0) return 'Açık';
      if (c === 1) return 'Az bulutlu';
      if (c === 2) return 'Parçalı bulutlu';
      if (c === 3) return 'Kapalı';
      if (c === 45 || c === 48) return 'Sisli';
      if (c >= 51 && c <= 57) return 'Çisenti';
      if (c >= 61 && c <= 67) return 'Yağmurlu';
      if (c >= 71 && c <= 77) return 'Karlı';
      if (c >= 80 && c <= 82) return 'Sağanak yağış';
      if (c === 85 || c === 86) return 'Kar sağanağı';
      if (c >= 95) return 'Fırtına';
      return 'Bulutlu';
    },

    weatherIconNode(code, isDay) {
      const holder = document.createElement('span');
      holder.innerHTML = this.weatherIconSvg(code, isDay);
      return holder.firstElementChild || holder;
    },

    weatherCity() {
      try {
        const raw = JSON.parse(SafeStorage.getItem(this.WEATHER_CITY_KEY) || 'null');
        if (raw && raw.name && Number.isFinite(raw.lat) && Number.isFinite(raw.lon)) return raw;
      } catch (e) {}
      return { name: 'Ankara', lat: 39.9334, lon: 32.8597, country: 'Türkiye' };
    },

    weatherCache() {
      try {
        const raw = JSON.parse(SafeStorage.getItem(this.WEATHER_CACHE_KEY) || 'null');
        return raw && raw.data && raw.at ? raw : null;
      } catch (e) {
        return null;
      }
    },

    async fetchJson(url, timeout) {
      const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const timer = setTimeout(() => { if (ctrl) ctrl.abort(); }, timeout || 9000);
      try {
        const res = await fetch(url, { signal: ctrl ? ctrl.signal : undefined, cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
      } finally {
        clearTimeout(timer);
      }
    },

    async loadWeather(force) {
      const city = this.weatherCity();
      const cache = this.weatherCache();
      const now = Date.now();
      if (!force && cache && cache.city && cache.city.name === city.name
          && cache.city.lat === city.lat && cache.city.lon === city.lon
          && now - cache.at < this.WEATHER_FRESH_MS) {
        this._weatherAt = cache.at;
        this.paintWeather(cache.data, cache.city, cache.at);
        return;
      }

      const token = (this._weatherToken || 0) + 1;
      this._weatherToken = token;
      this.setWeatherStatus('Güncelleniyor…');
      const url = 'https://api.open-meteo.com/v1/forecast'
        + '?latitude=' + encodeURIComponent(city.lat)
        + '&longitude=' + encodeURIComponent(city.lon)
        + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day'
        + '&daily=weather_code,temperature_2m_max,temperature_2m_min'
        + '&timezone=auto&forecast_days=3';

      try {
        const data = await this.fetchJson(url, 9000);
        if (token !== this._weatherToken) return;
        if (!data || !data.current || !data.daily) throw new Error('Eksik veri');
        this._weatherAt = Date.now();
        SafeStorage.setItem(this.WEATHER_CACHE_KEY, JSON.stringify({ at: this._weatherAt, city, data }));
        this.paintWeather(data, city, this._weatherAt);
        this.setWeatherStatus('');
      } catch (e) {
        if (token !== this._weatherToken) return;
        const sameCity = cache && cache.city && cache.city.name === city.name
          && cache.city.lat === city.lat && cache.city.lon === city.lon;
        if (sameCity) {
          this._weatherAt = cache.at;
          this.paintWeather(cache.data, cache.city, cache.at);
          const t = new Date(cache.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
          this.setWeatherStatus(`Güncellenemedi; ${t} verisi gösteriliyor.`);
        } else {
          this.setWeatherStatus('Hava durumu alınamadı. Bağlantıyı denetleyin.', true);
        }
      }
    },

    paintWeather(data, city, at) {
      const cur = data.current || {};
      const daily = data.daily || {};
      const code = Number(cur.weather_code);
      const tempEl = document.getElementById('dw-weather-temp');
      if (tempEl) tempEl.textContent = Number.isFinite(Number(cur.temperature_2m)) ? String(Math.round(Number(cur.temperature_2m))) : '--';

      const place = document.getElementById('dw-weather-place');
      if (place) {
        place.textContent = city.name || '—';
        place.title = [city.name, city.admin1, city.country].filter(Boolean).join(', ');
      }

      const icon = document.getElementById('dw-weather-icon');
      if (icon) {
        icon.className = 'dw-weather-icon wx-' + this.weatherKind(code);
        icon.textContent = '';
        icon.appendChild(this.weatherIconNode(code, cur.is_day !== 0));
      }

      const desc = document.getElementById('dw-weather-desc');
      if (desc) {
        const feels = Number(cur.apparent_temperature);
        desc.textContent = this.weatherLabel(code)
          + (Number.isFinite(feels) ? ` · Hissedilen ${Math.round(feels)}°` : '');
      }

      const max = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[0] : null;
      const min = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[0] : null;
      const high = document.getElementById('dw-weather-high');
      if (high) high.textContent = 'En yüksek ' + (Number.isFinite(Number(max)) ? Math.round(Number(max)) + '°' : '—');
      const low = document.getElementById('dw-weather-low');
      if (low) low.textContent = 'En düşük ' + (Number.isFinite(Number(min)) ? Math.round(Number(min)) + '°' : '—');
      const wind = document.getElementById('dw-weather-wind');
      if (wind) {
        const w = Number(cur.wind_speed_10m);
        wind.textContent = 'Rüzgâr ' + (Number.isFinite(w) ? Math.round(w) + ' km/sa' : '—');
      }

      const daysEl = document.getElementById('dw-weather-days');
      if (daysEl && Array.isArray(daily.time)) {
        daysEl.textContent = '';
        daily.time.slice(0, 3).forEach((iso, idx) => {
          const day = document.createElement('div');
          day.className = 'dw-weather-day';
          let label = '';
          if (idx === 0) label = 'Bugün';
          else if (idx === 1) label = 'Yarın';
          else {
            const d = new Date(iso + 'T12:00:00');
            label = isNaN(d.getTime()) ? '' : d.toLocaleDateString('tr-TR', { weekday: 'short' });
          }
          day.appendChild(this.make('span', null, null, label));
          const dCode = Array.isArray(daily.weather_code) ? daily.weather_code[idx] : code;
          const iWrap = this.make('span', 'wx-' + this.weatherKind(dCode));
          iWrap.appendChild(this.weatherIconNode(dCode, true));
          day.appendChild(iWrap);
          const maxD = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[idx] : null;
          const minD = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[idx] : null;
          const temps = document.createElement('span');
          temps.className = 'day-temp';
          temps.innerHTML = (Number.isFinite(Number(maxD)) ? Math.round(Number(maxD)) + '°' : '—')
            + ' <small>' + (Number.isFinite(Number(minD)) ? Math.round(Number(minD)) + '°' : '') + '</small>';
          day.appendChild(temps);
          daysEl.appendChild(day);
        });
      }

      if (at) {
        const iconBtn = document.querySelector('.dw-weather-city-btn');
        if (iconBtn) iconBtn.title = 'Son güncelleme: ' + new Date(at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      }
    },

    setWeatherStatus(text, isError) {
      const el = document.getElementById('dw-weather-status');
      if (!el) return;
      el.textContent = text || '';
      el.classList.toggle('error', !!isError);
    },

    async searchWeatherCity() {
      const input = document.getElementById('dw-weather-city-input');
      const resultsEl = document.getElementById('dw-weather-results');
      if (!input || !resultsEl) return;
      const q = (input.value || '').trim();
      if (q.length < 2) {
        this.setWeatherStatus('En az iki harf yazın.', true);
        return;
      }
      this.setWeatherStatus('Aranıyor…');
      resultsEl.textContent = '';
      try {
        const url = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(q)
          + '&count=6&language=tr&format=json';
        const data = await this.fetchJson(url, 8000);
        const list = (data && Array.isArray(data.results)) ? data.results : [];
        if (!list.length) {
          this.setWeatherStatus('Şehir bulunamadı.', true);
          return;
        }
        this.setWeatherStatus('');
        list.forEach(r => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'dw-weather-result';
          const parts = [r.name];
          if (r.admin1 && r.admin1 !== r.name) parts.push(r.admin1);
          if (r.country) parts.push(r.country);
          btn.textContent = parts.join(', ');
          btn.title = btn.textContent;
          btn.addEventListener('click', () => {
            const city = {
              name: r.name,
              lat: Number(r.latitude),
              lon: Number(r.longitude),
              admin1: r.admin1 || '',
              country: r.country || ''
            };
            if (!Number.isFinite(city.lat) || !Number.isFinite(city.lon)) return;
            SafeStorage.setItem(this.WEATHER_CITY_KEY, JSON.stringify(city));
            const search = document.getElementById('dw-weather-search');
            if (search) search.hidden = true;
            resultsEl.textContent = '';
            this.loadWeather(true);
          });
          resultsEl.appendChild(btn);
        });
        if (resultsEl.firstElementChild) resultsEl.firstElementChild.focus();
      } catch (e) {
        this.setWeatherStatus('Şehir araması başarısız oldu.', true);
      }
    },

    // --- Genişletilmiş widget gövde ve yenileme akışları ---
    buildDisk(wrap) {
      wrap.appendChild(this.make('div', 'dw-head', null, 'Depolama'));
      const meter = document.createElement('div');
      meter.className = 'dw-meter';
      const fill = this.make('span', 'dw-meter-fill lvl-ok', 'dw-disk-fill', '');
      fill.style.width = '0%';
      meter.appendChild(fill);
      wrap.appendChild(meter);
      wrap.appendChild(this.make('div', 'dw-rows', 'dw-disk-info', '—'));
      wrap.appendChild(this.make('div', 'dw-sub', 'dw-disk-zram', 'zram: —'));
    },

    buildNetwork(wrap) {
      wrap.appendChild(this.make('div', 'dw-head', null, 'Ağ'));
      const meta = document.createElement('div');
      meta.className = 'dw-meta';
      [['Durum', 'dw-net-state'], ['Arayüz', 'dw-net-iface'], ['IP', 'dw-net-ip']]
        .forEach(pair => {
          const line = document.createElement('div');
          line.className = 'dw-meta-line';
          line.appendChild(this.make('span', 'dw-meta-key', null, pair[0]));
          line.appendChild(this.make('span', 'dw-meta-val', pair[1], '—'));
          meta.appendChild(line);
        });
      wrap.appendChild(meta);
    },

    buildTodo(wrap) {
      wrap.appendChild(this.make('div', 'dw-head', null, 'Yapılacaklar'));
      const form = document.createElement('div');
      form.className = 'dw-todo-form';
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'dw-todo-input';
      input.placeholder = 'Yeni kalem…';
      input.className = 'dw-todo-input';
      input.setAttribute('aria-label', 'Yeni yapılacak kalemi');
      const add = document.createElement('button');
      add.type = 'button';
      add.id = 'dw-todo-add';
      add.textContent = '+';
      add.setAttribute('aria-label', 'Kalem ekle');
      add.className = 'dw-todo-add';
      add.addEventListener('click', () => this.todoAdd(input));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.todoAdd(input); }
      });
      form.appendChild(input);
      form.appendChild(add);
      wrap.appendChild(form);
      wrap.appendChild(this.make('ul', 'dw-todo-list', 'dw-todo-list'));
      this.todoRender();
    },

    todoLoad() {
      try { return JSON.parse(SafeStorage.getItem(this.TODO_KEY) || '[]') || []; }
      catch (e) { return []; }
    },

    todoSave(items) {
      SafeStorage.setItem(this.TODO_KEY, JSON.stringify(items.slice(0, 30)));
      if (typeof window.refreshDayPlan === 'function') window.refreshDayPlan();
    },

    todoAdd(input) {
      const text = (input.value || '').trim();
      if (!text) return;
      const items = this.todoLoad();
      items.push({ t: text.slice(0, 120), done: false });
      input.value = '';
      this.todoSave(items);
      this.todoRender();
    },

    todoRender() {
      const list = document.getElementById('dw-todo-list');
      if (!list) return;
      list.textContent = '';
      this.todoLoad().forEach((it, idx) => {
        const li = document.createElement('li');
        li.className = 'dw-todo-item' + (it.done ? ' done' : '');
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = !!it.done;
        box.setAttribute('aria-label', 'Kalem tamamlandı');
        box.addEventListener('change', () => {
          const arr = this.todoLoad();
          if (arr[idx]) { arr[idx].done = box.checked; this.todoSave(arr); this.todoRender(); }
        });
        const label = document.createElement('span');
        label.textContent = it.t;
        const del = document.createElement('button');
        del.type = 'button';
        del.textContent = '×';
        del.setAttribute('aria-label', 'Kalemi sil');
        del.className = 'dw-todo-del';
        del.addEventListener('click', () => {
          const arr = this.todoLoad();
          arr.splice(idx, 1);
          this.todoSave(arr);
          this.todoRender();
        });
        li.appendChild(box);
        li.appendChild(label);
        li.appendChild(del);
        list.appendChild(li);
      });
    },

    buildDayPlan(wrap) {
      wrap.appendChild(this.make('div', 'dw-head', null, 'Günün Planı'));
      const now = new Date();
      wrap.appendChild(this.make('div', 'dw-sub', 'dw-day-date',
        now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })));
      const list = this.make('ul', 'dw-day-list', 'dw-day-list');
      wrap.appendChild(list);
      this.paintDayPlan(list);
    },

    paintDayPlan(root) {
      const list = root || document.getElementById('dw-day-list');
      if (!list) return;
      const now = new Date();
      const sameDay = (d) => d && !isNaN(d.getTime())
        && d.getFullYear() === now.getFullYear()
        && d.getMonth() === now.getMonth()
        && d.getDate() === now.getDate();

      const open = this.todoLoad().filter(it => !it.done).map(it => {
        const text = String(it.t || '');
        const at = it.at ? new Date(it.at) : null;
        let clock = '';
        if (at && !isNaN(at.getTime())) {
          clock = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
        } else {
          const m = text.match(/^(\d{1,2}:\d{2})\s*·?/);
          if (m) clock = m[1];
        }
        return { text, clock, at };
      }).filter(it => !it.at || sameDay(it.at));

      open.sort((a, b) => {
        if (a.clock && b.clock) return a.clock.localeCompare(b.clock);
        if (a.clock) return -1;
        if (b.clock) return 1;
        return a.text.localeCompare(b.text, 'tr');
      });

      list.textContent = '';
      if (!open.length) {
        const empty = this.make('li', 'dw-day-empty', null, 'Bugün açık görev yok.');
        list.appendChild(empty);
        return;
      }
      open.slice(0, 6).forEach(it => {
        const li = document.createElement('li');
        li.className = 'dw-day-item';
        if (it.clock) {
          const clock = this.make('span', 'dw-day-clock', null, it.clock);
          li.appendChild(clock);
        }
        const label = this.make('span', null, null,
          it.text.replace(/^\d{1,2}:\d{2}\s*·?\s*/, '') || it.text);
        li.appendChild(label);
        list.appendChild(li);
      });
    },

    buildMiniCal(wrap) {
      wrap.appendChild(this.make('div', 'dw-head', null, 'Takvim'));
      wrap.appendChild(this.make('div', 'dw-cal-head', 'dw-cal-title', ''));
      const grid = document.createElement('div');
      grid.className = 'dw-cal-grid';
      grid.id = 'dw-cal-grid';
      wrap.appendChild(grid);
      this.paintMiniCal();
    },

    paintMiniCal() {
      const now = new Date();
      const title = document.getElementById('dw-cal-title');
      const grid = document.getElementById('dw-cal-grid');
      if (!grid) return;
      if (title) {
        title.textContent = now.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
      }
      grid.textContent = '';
      const days = ['P', 'S', 'Ç', 'P', 'C', 'C', 'P'];
      days.forEach(d => {
        const cell = this.make('span', 'dw-cal-dow', null, d);
        grid.appendChild(cell);
      });
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const startCol = first.getDay(); // 0: Pazar
      const total = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      for (let i = 0; i < startCol; i++) grid.appendChild(this.make('span', 'dw-cal-blank', null, ''));
      for (let d = 1; d <= total; d++) {
        const cell = this.make('span', 'dw-cal-day', null, String(d));
        if (d === now.getDate()) cell.classList.add('today');
        grid.appendChild(cell);
      }
    },

    paintDisk() {
      const fill = document.getElementById('dw-disk-fill');
      if (!fill) return;
      TauriBridge.invoke('get_storage_stats').then(st => {
        if (!st || !st.disk_total) return;
        const pct = Math.round((st.disk_used / st.disk_total) * 100) || 0;
        fill.style.width = pct + '%';
        fill.className = 'dw-meter-fill ' + (pct >= 90 ? 'lvl-high' : pct >= 75 ? 'lvl-mid' : 'lvl-ok');
        const info = document.getElementById('dw-disk-info');
        if (info) {
          const toGB = b => (b / 1073741824).toFixed(1);
          info.textContent = `${toGB(st.disk_used)} / ${toGB(st.disk_total)} GB — %${pct}`;
        }
        const zramEl = document.getElementById('dw-disk-zram');
        if (zramEl && st.zram_total) {
          const toMB = b => Math.round(b / 1048576);
          zramEl.textContent = `zram: ${toMB(st.zram_used)} / ${toMB(st.zram_total)} MB`;
        }
      }).catch(() => {});
    },

    paintNetwork() {
      const stateEl = document.getElementById('dw-net-state');
      if (!stateEl) return;
      TauriBridge.invoke('get_network_info').then(inf => {
        const ok = !!(inf && inf.connected);
        stateEl.textContent = ok ? 'Bağlı' : 'Bağlı değil';
        const iface = document.getElementById('dw-net-iface');
        if (iface) iface.textContent = inf && inf.interface ? inf.interface : '—';
        const ip = document.getElementById('dw-net-ip');
        if (ip) ip.textContent = inf && inf.ip ? inf.ip : '—';
      }).catch(() => {});
    },

    // Yeni widgetların kendi yenile döngüsü: görünürken 5 dakikada bir.
    syncExtras() {
      if (this._extrasTimer) {
        clearInterval(this._extrasTimer);
        this._extrasTimer = null;
      }
      if (!this.isEnabled('disk') && !this.isEnabled('network') && !this.isEnabled('weather')) return;
      const tick = () => {
        if (document.hidden) return;
        this.paintDisk();
        this.paintNetwork();
        if (this.isEnabled('weather') && document.getElementById('dw-weather-temp')) {
          if (!this._weatherAt || Date.now() - this._weatherAt >= this.WEATHER_FRESH_MS) this.loadWeather();
        }
      };
      if (this.isEnabled('disk') && document.getElementById('dw-disk-fill')) this.paintDisk();
      if (this.isEnabled('network') && document.getElementById('dw-net-state')) this.paintNetwork();
      this._extrasTimer = setInterval(tick, 300000);
    },

    make(tag, cls, id, text) {
      const el = document.createElement(tag);
      if (cls) el.className = cls;
      if (id) el.id = id;
      el.textContent = text;
      return el;
    },

    // Saat yalnızca dakika sınırında uyanır: günde bir düzine kez, tek zamanlayıcı.
    startClock() {
      if (this.clockTimer) return;
      const now = new Date();
      this.paintClock();
      const wait = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
      this.clockTimer = setTimeout(() => {
        this.clockTimer = null;
        this.paintClock();
        if (this.isEnabled('clock') && !document.hidden) this.startClock();
      }, wait);
    },

    stopClock() {
      if (this.clockTimer) {
        clearTimeout(this.clockTimer);
        this.clockTimer = null;
      }
    },

    syncClock() {
      this.stopClock();
      if (this.isEnabled('clock') && !document.hidden) this.startClock();
    },

    paintClock() {
      const timeEl = document.getElementById('dw-clock-time');
      const dateEl = document.getElementById('dw-clock-date');
      if (!timeEl && !dateEl) return;

      const now = new Date();
      const pad = n => (n < 10 ? '0' : '') + n;
      if (timeEl) timeEl.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes());
      if (dateEl) {
        dateEl.textContent = now.toLocaleDateString('tr-TR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long'
        });
      }
    },

    onTelemetry(tele, pct) {
      if (!tele) return;
      this.lastTelemetry = tele;
      if (typeof pct === 'number') this.lastPct = pct;

      const fill = document.getElementById('dw-sys-fill');
      if (fill) {
        const v = Math.max(0, Math.min(100, this.lastPct || 0));
        fill.style.width = v + '%';
        fill.className = 'dw-meter-fill ' + (v >= 85 ? 'lvl-high' : v >= 65 ? 'lvl-mid' : 'lvl-ok');
      }

      const ram = document.getElementById('dw-sys-ram');
      if (ram) {
        const used = tele.memory_used_mb || 0;
        const total = tele.memory_total_mb || 0;
        ram.textContent = total
          ? (used / 1024).toFixed(1) + ' / ' + (total / 1024).toFixed(1) + ' GB'
          : '—';
      }

      const cores = document.getElementById('dw-sys-cores');
      if (cores) cores.textContent = tele.cpu_cores ? tele.cpu_cores + ' çekirdek' : '—';

      const up = document.getElementById('dw-sys-uptime');
      if (up) up.textContent = 'Açık: ' + this.formatUptime(tele.uptime_seconds);

      const os = document.getElementById('dw-distro-os');
      if (os) os.textContent = tele.os_name || '—';
      const kernel = document.getElementById('dw-distro-kernel');
      if (kernel) kernel.textContent = tele.kernel || '—';
      const init = document.getElementById('dw-distro-init');
      if (init) init.textContent = tele.init_system || '—';
    },

    formatUptime(seconds) {
      if (!seconds || seconds < 1) return '—';
      const total = Math.floor(seconds);
      const d = Math.floor(total / 86400);
      const h = Math.floor((total % 86400) / 3600);
      const m = Math.floor((total % 3600) / 60);
      if (d > 0) return d + ' gün ' + h + ' sa';
      if (h > 0) return h + ' sa ' + m + ' dk';
      return m + ' dk';
    }
  };

  // ============================================================================
  // GERÇEK AĞ DURUMU: Wi-Fi / Bluetooth radyoları ve ağ panosu
  // ============================================================================
  const RadioManager = {
    busy: false,

    init() {
      const qsWifi = document.getElementById('qs-wifi-toggle');
      const qsBt = document.getElementById('qs-bt-toggle');
      if (qsWifi) qsWifi.addEventListener('click', () => this.toggle('wifi'));
      if (qsBt) qsBt.addEventListener('click', () => this.toggle('bluetooth'));

      const scanBtn = document.getElementById('btn-wifi-scan');
      if (scanBtn) scanBtn.addEventListener('click', () => this.scan(true));

      // Ağ panosu her geçişte sistemden tazelenir.
      document.querySelectorAll('.settings-nav-item').forEach(item => {
        item.addEventListener('click', () => {
          if (item.getAttribute('data-pane') === 'pane-set-network') {
            setTimeout(() => this.refreshPane(), 80);
          }
        });
      });

      this.startNetworkWatcher();
      this.loadState();
    },

    // Bağlantı durumu düzenli aralıklarla izlenir: Ethernet takıldığında
    // masaüstü sessiz kalıyordu, kullanıcı bağlantıyı göremiyordu. Geçişlerde
    // bildirim düşer, tepsi ve kilit ekranı etiketi gerçek duruma döner.
    startNetworkWatcher() {
      if (this._watchTimer) return;
      this._netState = null;

      const poll = async () => {
        let info = null;
        try {
          info = await TauriBridge.invoke('get_network_info');
        } catch (err) {
          info = null;
        }
        const connected = !!(info && info.connected);
        const iface = info && info.interface ? String(info.interface) : '';
        const ip = info && info.ip ? String(info.ip) : '';
        const key = `${connected}|${iface}|${ip}`;

        if (this._netState === null) {
          this._netState = key;
        } else if (this._netState !== key) {
          const wasConnected = this._netState.indexOf('true|') === 0;
          this._netState = key;
          if (connected && !wasConnected) {
            const kind = /^(eth|enp|ens|eno|em\d)/.test(iface) ? 'Ethernet' : 'Ağ';
            ReportManager.showToast(`${kind} bağlantısı kuruldu: ${iface} — ${ip}`);
            Terminal.log(`[AĞ] ${iface} arayüzüne ${ip} adresi atandı.`, 'success');
          } else if (!connected && wasConnected) {
            ReportManager.showToast('Ağ bağlantısı kesildi.', 'error');
            Terminal.log('[AĞ] Bağlantı kesildi.', 'error');
          }
        }

        // Kullanıcı şikayeti — kablolu (Ethernet) bağlanınca da panelde
        // Wi-Fi simgesi gösteriliyordu. Arayüz adından fiziksel tür çözülür:
        // eth*/enp*/ens*/eno*/em* kablolu; wlan*/wl*/ra* vb. kablosuz sayılır.
        const tray = document.getElementById('tray-wifi-btn');
        if (tray) {
          const isWired = connected && /^(eth|enp|ens|eno|em\d)/.test(iface);
          tray.classList.toggle('net-on', connected);
          tray.classList.toggle('net-off', !connected);
          tray.classList.toggle('net-wired', isWired);
          tray.title = connected
            ? (isWired ? `Kablolu Ağ (Ethernet): ${iface} — ${ip}` : `Kablosuz Ağ (Wi-Fi): ${iface} — ${ip}`)
            : 'Ağa bağlı değil';
        }
        const lockPill = document.getElementById('lock-wifi-status');
        if (lockPill) lockPill.textContent = connected ? 'Ağa bağlı' : 'Çevrimdışı';
      };

      poll();
      this._watchTimer = setInterval(poll, 10000);
    },

    async loadState() {
      try {
        this.renderState(await TauriBridge.invoke('get_radio_state'));
      } catch (err) {
        this.renderState(null);
      }
    },

    renderState(st) {
      const qsWifi = document.getElementById('qs-wifi-toggle');
      const qsBt = document.getElementById('qs-bt-toggle');
      const subOf = (el) => (el ? el.querySelector('.qs-tile-sub') : null);

      if (!st || !st.available) {
        if (qsWifi) {
          qsWifi.classList.remove('active');
          qsWifi.disabled = true;
          qsWifi.title = 'Ağ yöneticisi bulunamadı (nmcli/rfkill kurulu değil)';
        }
        if (subOf(qsWifi)) subOf(qsWifi).textContent = 'Yönetici yok';
        if (qsBt) {
          qsBt.classList.remove('active');
          qsBt.disabled = true;
          qsBt.title = 'Ağ/bluetooth yöneticisi bulunamadı (nmcli/rfkill kurulu değil)';
        }
        if (subOf(qsBt)) subOf(qsBt).textContent = 'Yönetici yok';
        const trayWifi = document.getElementById('tray-wifi-btn');
        if (trayWifi) trayWifi.title = 'Kablosuz Ağ (Wi-Fi): yönetici bulunamadı';
        return;
      }

      if (qsWifi) {
        qsWifi.disabled = false;
        qsWifi.classList.toggle('active', !!st.wifi_enabled);
        qsWifi.title = st.wifi_enabled ? 'Wi-Fi Ağını Kapat' : 'Wi-Fi Ağını Aç';
      }
      if (subOf(qsWifi)) {
        subOf(qsWifi).textContent = !st.wifi_enabled ? 'Kapalı' : (st.wifi_ssid || 'Açık');
      }
      if (qsBt) {
        qsBt.disabled = false;
        qsBt.classList.toggle('active', !!st.bluetooth_enabled);
        qsBt.title = st.bluetooth_enabled ? "Bluetooth'u Kapat" : "Bluetooth'u Aç";
      }
      if (subOf(qsBt)) subOf(qsBt).textContent = st.bluetooth_enabled ? 'Açık' : 'Kapalı';

      const trayWifi = document.getElementById('tray-wifi-btn');
      if (trayWifi) {
        trayWifi.title = !st.wifi_enabled ? 'Kablosuz Ağ (Wi-Fi): Kapalı'
          : (st.wifi_ssid ? `Kablosuz Ağ (Wi-Fi): ${st.wifi_ssid}` : 'Kablosuz Ağ (Wi-Fi): Açık');
      }
    },

    async toggle(kind) {
      if (this.busy) return;
      this.busy = true;
      try {
        // İstenen durum düğmeden değil, sistem durumundan türetilir.
        const before = await TauriBridge.invoke('get_radio_state');
        const wasEnabled = kind === 'wifi' ? !!before.wifi_enabled : !!before.bluetooth_enabled;
        const after = await TauriBridge.invoke('set_radio_state', { kind, enabled: !wasEnabled });
        this.renderState(after);
        if (kind === 'wifi') {
          if (!after.wifi_enabled) this.renderWifiList([]);
          else this.scan(false);
          Terminal.log(`[AĞ] Wi-Fi ${after.wifi_enabled ? 'etkin' : 'devre dışı'}.`, 'cmd');
        } else {
          Terminal.log(`[BLUETOOTH] Adaptör ${after.bluetooth_enabled ? 'açık' : 'kapalı'}.`, 'cmd');
        }
      } catch (err) {
        ReportManager.showToast(`${kind === 'wifi' ? 'Wi-Fi' : 'Bluetooth'} değiştirilemedi: ${err.message || err}`);
        this.loadState();
      } finally {
        this.busy = false;
      }
    },

    async refreshPane() {
      await this.loadState();
      await this.loadNetInfo();
      await this.scan(false);
    },

    async loadNetInfo() {
      const name = document.getElementById('net-banner-name');
      const detail = document.getElementById('net-banner-detail');
      const tag = document.getElementById('net-banner-tag');
      const set = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
      };
      try {
        const info = await TauriBridge.invoke('get_network_info');
        const maskOf = (p) => {
          if (!p || p < 1 || p > 32) return '—';
          const v = (0xFFFFFFFF << (32 - p)) >>> 0;
          return [24, 16, 8, 0].map(s => (v >>> s) & 255).join('.');
        };
        if (info && info.connected) {
          if (name) name.textContent = `${info.interface} — ${info.ip}/${info.prefix}`;
          if (detail) detail.textContent = info.gateway
            ? `Ağ geçidi ${info.gateway} • ${info.dns.length} DNS sunucusu`
            : 'Ağ geçidi bulunamadı';
          if (tag) tag.style.display = '';
          set('net-cell-ip', info.ip || '—');
          set('net-cell-gw', info.gateway || '—');
          set('net-cell-mask', `/${info.prefix} (${maskOf(info.prefix)})`);
          set('net-cell-dns', (info.dns && info.dns.length) ? info.dns.join(', ') : '—');
        } else {
          if (name) name.textContent = 'Bağlı arayüz yok';
          if (detail) detail.textContent = 'IPv4 adresi atanmış bir arayüz algılanmadı.';
          if (tag) tag.style.display = 'none';
          set('net-cell-ip', '—');
          set('net-cell-gw', '—');
          set('net-cell-mask', '—');
          set('net-cell-dns', '—');
        }
      } catch (err) {
        if (name) name.textContent = 'Ağ bilgisi okunamadı';
        if (detail) detail.textContent = err.message || String(err);
        if (tag) tag.style.display = 'none';
      }
    },

    async scan(rescan) {
      const list = document.getElementById('wifi-network-list');
      const btn = document.getElementById('btn-wifi-scan');
      if (!list) return;
      if (btn) {
        btn.disabled = true;
        btn.textContent = rescan ? 'Taranıyor…' : 'Yükleniyor…';
      }
      try {
        const networks = await TauriBridge.invoke('scan_wifi_networks');
        this.renderWifiList(Array.isArray(networks) ? networks : []);
      } catch (err) {
        this.renderWifiList(null, err.message || String(err));
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Ağları Tara';
        }
      }
    },

    renderWifiList(networks, errorText) {
      const list = document.getElementById('wifi-network-list');
      if (!list) return;
      list.textContent = '';
      const note = (text) => {
        const row = document.createElement('div');
        row.className = 'wifi-row';
        const meta = document.createElement('div');
        meta.className = 'wifi-row-meta';
        const span = document.createElement('span');
        span.textContent = text;
        meta.appendChild(span);
        row.appendChild(meta);
        list.appendChild(row);
      };
      if (errorText) {
        note(errorText);
        return;
      }
      if (!networks || networks.length === 0) {
        note('Kablosuz ağ görünmüyor. Wi-Fi açıkken "Ağları Tara" ile yeniden deneyin.');
        return;
      }
      networks.forEach(n => {
        const row = document.createElement('div');
        row.className = 'wifi-row' + (n.active ? ' connected' : '');
        const meta = document.createElement('div');
        meta.className = 'wifi-row-meta';
        const strong = document.createElement('strong');
        strong.textContent = n.ssid;
        const sub = document.createElement('span');
        sub.textContent = n.active ? `Bağlı • Sinyal %${n.signal}` : `Sinyal %${n.signal}`;
        meta.appendChild(strong);
        meta.appendChild(sub);
        row.appendChild(meta);
        if (!n.active) {
          const btn = document.createElement('button');
          btn.className = 'btn-pkg-sm';
          btn.textContent = 'Bağlan';
          btn.addEventListener('click', () => this.connect(n.ssid, btn));
          row.appendChild(btn);
        }
        list.appendChild(row);
      });
    },

    async connect(ssid, btn) {
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Bağlanıyor…';
      }
      try {
        let msg;
        try {
          msg = await TauriBridge.invoke('wifi_connect', { ssid });
        } catch (firstErr) {
          const errStr = String(firstErr.message || firstErr);
          if (errStr.includes('parol') || errStr.includes('Secrets') || errStr.includes('password') || errStr.includes('şifre')) {
            const pass = prompt(`"${ssid}" kablosuz ağı için parolayı girin:`);
            if (pass === null) {
              if (btn) { btn.disabled = false; btn.textContent = 'Bağlan'; }
              return;
            }
            msg = await TauriBridge.invoke('wifi_connect', { ssid, password: pass });
          } else {
            throw firstErr;
          }
        }
        ReportManager.showToast(msg || `Bağlanıldı: ${ssid}`);
        await this.loadState();
        await this.scan(false);
      } catch (err) {
        ReportManager.showToast(`Bağlanılamadı: ${err.message || err}`, 'error');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Bağlan';
        }
      }
    }
  };

  // ============================================================================
  // OTURUM: AÇILIŞTA GERİ YÜKLEME, ÇÖKME SAYAÇI VE GÜVENLİ KİP
  // ============================================================================
  const SessionManager = {
    storageKey: 'ankora_session_state',
    runningKey: 'ankora_session_running',
    crashKey: 'ankora_crash_count',
    crashCount: 0,
    restored: false,
    saveTimer: null,

    // boot() içinde ilk çağrılır: önceki açılışın nasıl bittiğini okur ve
    // temiz çıkış işaretini bağlar. Kayıtlar yalnız restore() çalıştıktan
    // sonra yazılır; aksi hâlde geri yüklemeden önceki boş açılış eski
    // oturumun yerine yazabilirdi.
    begin() {
      try {
        if (SafeStorage.getItem(this.runningKey) === '1') {
          this.crashCount = (parseInt(SafeStorage.getItem(this.crashKey) || '0', 10) || 0) + 1;
          SafeStorage.setItem(this.crashKey, String(this.crashCount));
        } else {
          this.crashCount = 0;
          SafeStorage.removeItem(this.crashKey);
        }
        SafeStorage.setItem(this.runningKey, '1');
      } catch (err) {}

      // Sürükleme ve boyutlandırma bitiminde son geometri kaydedilir.
      document.addEventListener('mouseup', () => this.touch());
      window.addEventListener('pagehide', () => this.shutdown());

      // Kapanış sırasında (sayfa boşaltılırken ya da masaüstü oturumu
      // SIGTERM ile biterken) temiz çıkış işareti konur.
      window.__ayazCleanExit = () => {
        try {
          SafeStorage.setItem(this.runningKey, '0');
          SafeStorage.removeItem(this.crashKey);
        } catch (err) {}
      };
    },

    shutdown() {
      this.saveNow();
      if (typeof window.__ayazCleanExit === 'function') window.__ayazCleanExit();
    },

    touch() {
      if (!this.restored) return;
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.saveNow(), 400);
    },

    saveNow() {
      if (!this.restored) return;
      try {
        const wins = [];
        WindowManager.windows.forEach(win => {
          // Kurulum sihirbazı bir sonraki açılışta kendiliğinden dönmez.
          if (!win.classList.contains('open') || win.id === 'win-installer') return;
          wins.push({
            id: win.id,
            ws: parseInt(win.getAttribute('data-ws'), 10) || 1,
            min: win.classList.contains('minimized'),
            max: win.classList.contains('maximized'),
            left: win.style.left,
            top: win.style.top,
            width: win.style.width,
            height: win.style.height
          });
        });
        const active = document.querySelector('.window.active:not(.minimized)');
        SafeStorage.setItem(this.storageKey, JSON.stringify({
          v: 1,
          ws: WorkspaceManager.active,
          wsCount: WorkspaceManager.count,
          active: active ? active.id : null,
          wins
        }));
      } catch (err) {}
    },

    restore() {
      let state = null;
      try {
        const raw = SafeStorage.getItem(this.storageKey);
        if (raw) state = JSON.parse(raw);
      } catch (err) { state = null; }
      this.restored = true;
      if (!state || state.v !== 1 || !Array.isArray(state.wins)) return;

      // Art arda iki beklenmedik kapanış: pencereler bu açılışta geri
      // yüklenmez, güvenli kip bildirimi çıkar.
      if (this.crashCount >= 2) {
        this.showSafeNotice(state);
        return;
      }
      this.apply(state);
    },

    apply(state) {
      state.wins.forEach(w => {
        const win = document.getElementById(w.id);
        if (!win || !win.classList.contains('window')) return;
        ['left', 'top', 'width', 'height'].forEach(prop => {
          const val = w[prop];
          if (typeof val === 'string' && val) win.style[prop] = this.clampGeometry(prop, val);
        });
        win.classList.add('open');
        win.classList.toggle('minimized', !!w.min);
        win.classList.toggle('maximized', !!w.max);
        win.setAttribute('data-ws', String(w.ws || 1));
      });

      if (state.wsCount) {
        WorkspaceManager.count = Math.min(Math.max(1, state.wsCount), WorkspaceManager.max);
      }
      WorkspaceManager.set(state.ws || WorkspaceManager.active);
      WindowManager.syncTabs();

      const focus = state.active ? document.getElementById(state.active) : null;
      if (focus && focus.classList.contains('open') &&
          !focus.classList.contains('minimized') && !focus.classList.contains('ws-hide')) {
        WindowManager.bringToFront(focus);
      }
    },

    // Ekran çözünürlüğü değişmişse piksel değerleri ekrana sıkıştırılır;
    // vw/vh/calc gibi göreli değerler kendilikinden uyar.
    clampGeometry(prop, val) {
      if (!/^-?\d+(\.\d+)?px$/.test(val)) return val;
      const n = parseFloat(val);
      if (prop === 'left') return `${Math.max(0, Math.min(n, window.innerWidth - 120))}px`;
      if (prop === 'top') return `${Math.max(0, Math.min(n, window.innerHeight - 100))}px`;
      if (prop === 'width') return `${Math.max(300, n)}px`;
      if (prop === 'height') return `${Math.max(260, n)}px`;
      return val;
    },

    showSafeNotice(state) {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.id = 'safe-mode-notice';
      backdrop.innerHTML = `
        <div class="modal-sheet">
          <div class="modal-title">Güvenli kip</div>
          <p style="font-size: 12px; color: var(--text-secondary);" id="safe-mode-desc"></p>
          <div class="modal-actions">
            <button class="btn-pkg" id="safe-mode-dismiss">Boş devam et</button>
            <button class="btn-pkg" id="safe-mode-restore" style="background: var(--text-primary); color: var(--bg-deep);">Pencereleri geri yükle</button>
          </div>
        </div>`;
      backdrop.querySelector('#safe-mode-desc').textContent =
        `Son iki açılış beklenmedik şekilde bitti (toplam ${this.crashCount} beklenmedik kapanış). ` +
        'Pencereler bu açılışta geri yüklenmedi.';
      document.body.appendChild(backdrop);
      const close = (restoreWindows) => {
        SafeStorage.removeItem(this.crashKey);
        backdrop.remove();
        if (restoreWindows) this.apply(state);
      };
      backdrop.querySelector('#safe-mode-dismiss').addEventListener('click', () => close(false));
      backdrop.querySelector('#safe-mode-restore').addEventListener('click', () => close(true));
      requestAnimationFrame(() => backdrop.classList.add('open'));
    }
  };

  // SİSTEMİ ÇALIŞTIR (HATA İZOLASYONLU VE DOM GÜVENCELİ BOOTSTRAP)
  function safeInit(name, fn) {
    try {
      const result = fn();
      // async init'lerde rejection try/catch'e düşmez; ayrıca dinlenmesi gerekir
      if (result && typeof result.catch === 'function') {
        result.catch(err => {
          console.warn(`[ANKORA BAŞLATMA UYARISI] ${name} modülü başlatılamadı (async):`, err);
        });
      }
    } catch (err) {
      console.warn(`[ANKORA BAŞLATMA UYARISI] ${name} modülü başlatılamadı:`, err);
    }
  }


  // ============================================================================
  // EKRAN GÖRÜNTÜSÜ ALMA ARACI (SCREENSHOT MANAGER)
  // ============================================================================
  const ScreenshotManager = {
    currentMode: 'fullscreen',
    currentDelay: 0,
    saveToDisk: true,
    copyClipboard: true,
    lastCapturedPath: null,

    init() {
      // 1. Mod seçimleri
      document.querySelectorAll('#win-screenshot .ss-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#win-screenshot .ss-mode-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.currentMode = btn.getAttribute('data-mode') || 'fullscreen';
        });
      });

      // 2. Gecikme seçimleri
      document.querySelectorAll('#win-screenshot .ss-delay-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#win-screenshot .ss-delay-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.currentDelay = parseInt(btn.getAttribute('data-delay') || '0', 10);
        });
      });

      // 3. Yakalama eylemi
      const btnCapture = document.getElementById('ss-btn-capture');
      if (btnCapture) {
        btnCapture.addEventListener('click', () => this.capture());
      }

      // 4. Kayıt/pano tercih kutuları (Rust'a olduğu gibi iletilir)
      const optSave = document.getElementById('ss-opt-save');
      if (optSave) {
        optSave.addEventListener('change', () => {
          this.saveToDisk = !!optSave.checked;
        });
      }
      const optClipboard = document.getElementById('ss-opt-clipboard');
      if (optClipboard) {
        optClipboard.addEventListener('change', () => {
          this.copyClipboard = !!optClipboard.checked;
        });
      }

      // 4b. Panoya Kopyala: gerçek base64 görseli PNG olarak panoya taşır.
      const btnCopy = document.getElementById('ss-btn-copy');
      if (btnCopy) {
        btnCopy.addEventListener('click', async () => {
          try {
            const prevImg = document.getElementById('ss-preview-img');
            const src = prevImg && prevImg.src ? prevImg.src : null;
            if (!src) {
              ReportManager.showToast('Kopyalanacak görüntü yok.');
              return;
            }
            const blob = await (await fetch(src)).blob();
            if (navigator.clipboard && window.ClipboardItem) {
              await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
            } else {
              throw new Error('clipboard unsupported');
            }
            ReportManager.showToast('Ekran görüntüsü panoya kopyalandı.');
          } catch (e) {
            ReportManager.showToast('Panoya kopyalanamadı (tarayıcı izni reddetti).');
          }
        });
      }

      const btnOpenDir = document.getElementById('ss-btn-open-dir');
      if (btnOpenDir) {
        btnOpenDir.addEventListener('click', async () => {
          try {
            // Rust köprüsü xdg-user-dir PICTURES üzerinden gerçek Resimler
            // klasörünü güvenli biçimde açar (terminal beyaz listesine tabi değil).
            await TauriBridge.invoke('open_pictures_folder');
          } catch (e) {
            ReportManager.showToast('Resimler klasörü açılamadı.');
          }
        });
      }

      // 5. Global Klavye Kısayolları (Super+Shift+S)
      // PrintScreen burada bağlanmaz: ShortcutManager hem kullanıcı
      // özelleştirmesini yönetir hem de tek tetikleme garantisi verir.
      // Odak başka penceredeyse OS seviyesi kayıt (Rust setup) devreye girer.
      window.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key.toLowerCase() === 's' || e.code === 'KeyS')) {
          e.preventDefault();
          WindowManager.open('win-screenshot');
        }
      });
    },

    async quickCapture() {
      ReportManager.showToast('Ekran görüntüsü alınıyor...');
      try {
        const res = await TauriBridge.invoke('take_screenshot', {
          mode: 'fullscreen',
          delay: 0,
          save_to_disk: true,
          copy_clipboard: true
        });
        ReportManager.showToast(`Ekran görüntüsü kaydedildi: ${res.file_name || 'Ekran-Goruntusu.png'}`);
      } catch (err) {
        ReportManager.showToast(`Ekran görüntüsü alınamadı: ${err.message || err}`);
      }
    },

    async capture() {
      const btnCapture = document.getElementById('ss-btn-capture');
      const prevBox = document.getElementById('ss-preview-box');
      const prevImg = document.getElementById('ss-preview-img');
      const statusText = document.getElementById('ss-status-text');

      if (this.currentDelay > 0) {
        if (btnCapture) btnCapture.disabled = true;
        let remaining = this.currentDelay;
        if (statusText) statusText.textContent = `${remaining} saniye sonra yakalanacak...`;
        const timer = setInterval(() => {
          remaining--;
          if (remaining > 0) {
            if (statusText) statusText.textContent = `${remaining} saniye sonra yakalanacak...`;
          } else {
            clearInterval(timer);
          }
        }, 1000);
      }

      try {
        const res = await TauriBridge.invoke('take_screenshot', {
          mode: this.currentMode,
          delay: this.currentDelay,
          save_to_disk: this.saveToDisk,
          copy_clipboard: this.copyClipboard
        });

        this.lastCapturedPath = res.file_path;
        if (statusText) statusText.textContent = `Yakalandı: ${res.file_name || 'Başarılı'}`;
        if (prevBox) prevBox.style.display = 'flex';
        if (prevImg && res.image_b64) {
          prevImg.src = `data:image/png;base64,${res.image_b64}`;
          prevImg.style.display = 'block';
        }
        ReportManager.showToast(`📸 Ekran görüntüsü yakalandı: ${res.file_name || ''}`);
      } catch (e) {
        if (statusText) statusText.textContent = `Hata: ${e.message || e}`;
        ReportManager.showToast(`Ekran görüntüsü hatası: ${e.message || e}`);
      } finally {
        if (btnCapture) btnCapture.disabled = false;
      }
    }
  };

  // ============================================================================
  // SİSTEM GÜÇ VE ÇIKIŞ YÖNETİCİSİ (POWER MANAGER)
  // ============================================================================
  const PowerManager = {
    init() {
      const btnShutdown = document.getElementById('btn-shutdown');
      if (btnShutdown) {
        btnShutdown.addEventListener('click', () => this.confirmPower('shutdown'));
      }

      const btnRestart = document.getElementById('btn-restart');
      if (btnRestart) {
        btnRestart.addEventListener('click', () => this.confirmPower('reboot'));
      }

      const btnSuspend = document.getElementById('btn-suspend');
      if (btnSuspend) {
        btnSuspend.addEventListener('click', () => this.confirmPower('suspend'));
      }

      const btnLogout = document.getElementById('btn-logout');
      if (btnLogout) {
        btnLogout.addEventListener('click', () => this.confirmPower('logout'));
      }

      const lockRestart = document.getElementById('lock-btn-restart');
      if (lockRestart) {
        lockRestart.addEventListener('click', () => this.executeAction('reboot'));
      }

      const lockShutdown = document.getElementById('lock-btn-shutdown');
      if (lockShutdown) {
        lockShutdown.addEventListener('click', () => this.executeAction('shutdown'));
      }

      const lockSuspend = document.getElementById('lock-btn-suspend');
      if (lockSuspend) {
        lockSuspend.addEventListener('click', () => this.executeAction('suspend'));
      }

      const modal = document.getElementById('modal-power-dialog');
      if (modal) {
        modal.querySelectorAll('.power-modal-item').forEach(btn => {
          btn.addEventListener('click', () => {
            const action = btn.getAttribute('data-action');
            if (action === 'cancel') {
              this.closeModal();
            } else if (action) {
              this.executeAction(action);
            }
          });
        });

        const cancelBtn = modal.querySelector('.power-modal-cancel');
        if (cancelBtn) {
          cancelBtn.addEventListener('click', () => this.closeModal());
        }

        modal.addEventListener('click', (e) => {
          if (e.target === modal) this.closeModal();
        });
      }
    },

    showDialog(action = 'shutdown') {
      this.confirmPower(action);
    },

    confirmPower(action) {
      const modal = document.getElementById('modal-power-dialog');
      if (modal) {
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
      } else {
        this.executeAction(action);
      }
    },

    closeModal() {
      const modal = document.getElementById('modal-power-dialog');
      if (modal) {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
      }
    },

    async executeAction(action) {
      this.closeModal();
      Terminal.log(`[GÜÇ] İşlem yürütülüyor: ${action}`, 'cmd');

      try {
        switch (action) {
          case 'shutdown':
            ReportManager.showToast('Sistem kapatılıyor...');
            await TauriBridge.invoke('system_poweroff');
            break;
          case 'reboot':
            ReportManager.showToast('Sistem yeniden başlatılıyor...');
            await TauriBridge.invoke('system_reboot');
            break;
          case 'suspend':
            ReportManager.showToast('Sistem askıya alınıyor...');
            await TauriBridge.invoke('system_suspend');
            break;
          case 'logout':
            ReportManager.showToast('Oturum kapatılıyor...');
            await TauriBridge.invoke('system_logout');
            break;
          case 'lock':
            if (typeof LockManager !== 'undefined') {
              LockManager.lock();
            }
            break;
          default:
            break;
        }
      } catch (err) {
        ReportManager.showToast(`Güç işlemi hatası: ${err.message || err}`);
      }
    }
  };

  // ============================================================================
  // ANKORA PANO GEÇMİŞİ YÖNETİCİSİ (SUPER + V CLIPBOARD MANAGER)
  // ============================================================================
  const ClipboardManager = {
    history: [],
    maxItems: 20,
    isOpen: false,
    _lastText: '',

    init() {
      try {
        const stored = SafeStorage.getItem('ankora_clipboard_history');
        if (stored) this.history = JSON.parse(stored);
      } catch (e) {
        this.history = [];
      }

      const btnClear = document.getElementById('btn-clipboard-clear');
      if (btnClear) {
        btnClear.addEventListener('click', (e) => {
          e.stopPropagation();
          this.history = [];
          this.save();
          this.render();
          ReportManager?.showToast('Pano geçmişi temizlendi.');
        });
      }

      document.addEventListener('click', (e) => {
        const flyout = document.getElementById('clipboard-flyout');
        if (this.isOpen && flyout && !flyout.contains(e.target)) {
          this.close();
        }
      });

      this.pollClipboard();
      setInterval(() => this.pollClipboard(), 3000);
    },

    save() {
      try {
        SafeStorage.setItem('ankora_clipboard_history', JSON.stringify(this.history.slice(0, this.maxItems)));
      } catch (e) {}
    },

    async pollClipboard() {
      if (document.hidden || (window.LockManager && window.LockManager.isLocked)) return;
      try {
        const text = await TauriBridge.invoke('get_clipboard_text');
        if (text && typeof text === 'string' && text.trim().length > 0 && text !== this._lastText) {
          this._lastText = text;
          this.add(text);
        }
      } catch (e) {}
    },

    add(text) {
      if (!text || !text.trim()) return;
      const trimmed = text.trim();
      this.history = this.history.filter(item => item !== trimmed);
      this.history.unshift(trimmed);
      if (this.history.length > this.maxItems) {
        this.history = this.history.slice(0, this.maxItems);
      }
      this.save();
      if (this.isOpen) this.render();
    },

    toggle() {
      if (this.isOpen) this.close(); else this.open();
    },

    open() {
      const flyout = document.getElementById('clipboard-flyout');
      if (!flyout) return;
      this.render();
      flyout.style.display = 'flex';
      this.isOpen = true;
    },

    close() {
      const flyout = document.getElementById('clipboard-flyout');
      if (flyout) flyout.style.display = 'none';
      this.isOpen = false;
    },

    render() {
      const container = document.getElementById('clipboard-items-list');
      if (!container) return;
      container.innerHTML = '';

      if (this.history.length === 0) {
        container.innerHTML = '<div style="color:#64748b;font-size:12px;text-align:center;padding:24px 0;">Henüz kopyalanan metin yok</div>';
        return;
      }

      this.history.forEach((text) => {
        const item = document.createElement('div');
        item.style.cssText = 'padding:8px 10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:8px;font-size:12px;color:#e2e8f0;cursor:pointer;white-space:pre-wrap;word-break:break-all;max-height:64px;overflow:hidden;transition:background 0.15s;';
        item.textContent = text.length > 120 ? text.substring(0, 120) + '...' : text;
        item.title = text;
        item.addEventListener('mouseenter', () => {
          item.style.background = 'rgba(56,189,248,0.15)';
          item.style.borderColor = 'rgba(56,189,248,0.3)';
        });
        item.addEventListener('mouseleave', () => {
          item.style.background = 'rgba(255,255,255,0.04)';
          item.style.borderColor = 'rgba(255,255,255,0.07)';
        });
        item.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await TauriBridge.invoke('set_clipboard_text', { text });
            if (navigator.clipboard) await navigator.clipboard.writeText(text);
          } catch (err) {}
          ReportManager?.showToast('Seçilen metin panoya kopyalandı.');
          this.close();
        });
        container.appendChild(item);
      });
    }
  };

  // ============================================================================
  // ANKORA ÇIKARILABİLİR SÜRÜCÜ VE USB İZLEYİCİSİ (USB AUTO-MOUNT & NOTIFICATION)
  // ============================================================================
  const UsbDriveWatcher = {
    knownDrives: new Set(),
    _timer: null,

    init() {
      this.pollDrives(true);
      this._timer = setInterval(() => this.pollDrives(false), 4000);
    },

    async pollDrives(isFirst) {
      if (document.hidden && !isFirst) return;
      try {
        const drives = await TauriBridge.invoke('get_removable_drives');
        if (!Array.isArray(drives)) return;

        const currentNames = new Set(drives.map(d => d.name));

        if (!isFirst) {
          drives.forEach(d => {
            if (!this.knownDrives.has(d.name)) {
              const label = d.label || d.name;
              ReportManager?.showToast(`USB Sürücü algılandı: ${label} (${d.size || ''})`);
              if (d.mountpoint) {
                const filesWin = document.getElementById('win-files');
                if (filesWin && filesWin.classList.contains('open')) {
                  FileManager?.loadDirectory(d.mountpoint);
                }
              }
            }
          });
        }

        this.knownDrives = currentNames;
        this.updateFilesSidebar(drives);
      } catch (e) {}
    },

    updateFilesSidebar(drives) {
      // Doğru hedef: "Sürücüler & Ağ" başlığının içindeki statik öğelerin
      // altındaki dinamik kapsayıcı. (Eskiden '.files-sidebar-section'
      // aranmıştı; bu sınıf hiçbir yerde yoktu ve disk listesi asla
      // çizilemiyordu — kullanıcı şikayeti.)
      const sidebar = document.getElementById('side-nav-usb-drives')
        || document.getElementById('side-nav-drives')
        || document.querySelector('.files-sidebar');
      if (!sidebar) return;

      sidebar.querySelectorAll('.usb-dynamic-drive').forEach(el => el.remove());

      drives.forEach(d => {
        if (!d.mountpoint) return;
        const isRemovable = d.removable !== false;
        const item = document.createElement('div');
        item.className = 'files-sidebar-item usb-dynamic-drive';
        item.setAttribute('data-path', d.mountpoint);
        item.style.cssText = isRemovable
          ? 'color:#38bdf8;font-weight:500;'
          : 'color:var(--text-secondary, #9aa3b2);font-weight:500;opacity:0.92;';
        item.innerHTML = `<svg class="files-sidebar-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"></path><line x1="8" y1="12" x2="8.01" y2="12"></line><line x1="12" y1="12" x2="12.01" y2="12"></line></svg><span>${escapeHtml(d.label || d.name)}</span>`;
        item.title = isRemovable
          ? `${d.label} (${d.size})\nBağlantı: ${d.mountpoint}\n• Tıkla: Aç\n• Sağ tık: Güvenle Çıkar`
          : `${d.label} (${d.size}) — Dahili disk (${d.fstype || 'bilinmeyen dosya sistemi'})\nBağlantı: ${d.mountpoint}\n• Tıkla: Aç`;
        item.addEventListener('click', () => {
          document.querySelectorAll('.files-sidebar-item').forEach(i => i.classList.remove('active'));
          item.classList.add('active');
          FileManager?.loadDirectory(d.mountpoint);
        });
        sidebar.appendChild(item);
        // "Güvenle çıkar" yalnızca harici (USB vb.) aygıtlar için anlamlıdır;
        // dahili disklerde çıkarılamaz, sağ tık sessizce yok sayılır.
        if (!isRemovable) return;
        item.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          TauriBridge.invoke('unmount_drive', { device: d.name })
            .then(msg => {
              ReportManager?.showToast(msg || 'Sürücü çıkarıldı.');
              setTimeout(() => this.pollDrives(false), 500);
            })
            .catch(err => ReportManager?.showToast(`Çıkarılamadı: ${err.message || err}`));
        });
      });
    }
  };

  // ============================================================================
  // 19. BİLDİRİM SUNUCUSU & BİLDİRİM MERKEZİ (NOTIFICATION MANAGER)
  // ============================================================================
  const NotificationManager = {
    notifications: [],
    seenIds: new Set(),
    pollInterval: null,
    // Toast'lardan merkeze yansıyan kayıtlar; backend yoklolmasını ezmesin
    localExtras: [],

    init() {
      const btnTray = document.getElementById('tray-btn-notifications');
      const drawer = document.getElementById('notification-center-drawer');
      const btnClose = document.getElementById('btn-close-notif-drawer');
      const btnClear = document.getElementById('btn-clear-all-notifs');
      this.dismissedIds = this.dismissedIds || new Set();
      this._booted = false;

      if (btnTray) {
        btnTray.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleDrawer();
        });
      }

      if (btnClose) {
        btnClose.addEventListener('click', () => this.closeDrawer());
      }

      if (btnClear) {
        btnClear.addEventListener('click', () => this.clearAll());
      }

      // Çekmece dışına tıklandığında otomatik kapatma
      document.addEventListener('click', (e) => {
        if (!drawer || drawer.hidden) return;
        if (!drawer.contains(e.target) && (!btnTray || !btnTray.contains(e.target))) {
          this.closeDrawer();
        }
      });

      // İlk bildirim çekme ve düzenli yoklama (4.5 sn)
      this.poll();
      this.pollInterval = setInterval(() => this.poll(), 4500);

      // Oturum başlangıcı bildirimi: çekmecede hiç kayıt yoksa kullanıcı
      // merkezin çalıştığını göremez; her oturumda kısa bir bilgi düşürülür.
      // (hata #5: bildirimler merkeze yansıyıp görünür hale gelir)
      try {
        TauriBridge.invoke('send_desktop_notification', {
          appName: 'Ayaz DE',
          summary: 'Bildirim Merkezi hazır',
          body: 'Sistem bildirimleri bu oturum boyunca burada toplanacak.',
        }).catch(() => {});
      } catch (e) { /* sessiz */ }
    },

    toggleDrawer() {
      const drawer = document.getElementById('notification-center-drawer');
      if (!drawer) return;
      if (drawer.classList.contains('open')) {
        this.closeDrawer();
      } else {
        this.openDrawer();
      }
    },

    openDrawer() {
      const drawer = document.getElementById('notification-center-drawer');
      if (!drawer) return;
      drawer.hidden = false;
      void drawer.offsetWidth;
      drawer.classList.add('open');
      this.markAllAsRead();
      if (typeof MprisManager !== 'undefined' && MprisManager.update) {
        MprisManager.update();
      }
    },

    closeDrawer() {
      const drawer = document.getElementById('notification-center-drawer');
      if (!drawer) return;
      drawer.classList.remove('open');
      setTimeout(() => {
        if (!drawer.classList.contains('open')) drawer.hidden = true;
      }, 250);
    },

    async poll() {
      try {
          let list = await TauriBridge.invoke('get_system_notifications');
          if (Array.isArray(list)) {
            // Toast'lardan merkeze yazılan yerel kayıtlar çekmecenin parçasıdır;
            // backend listesi bunları ezmesin diye sonuna eklenir.
            list = list.concat(this.localExtras || []);
          // Kullanıcı çekmeceden kaldırdığı bildirimleri geri getirme.
          if (this.dismissedIds.size > 0) {
            list = list.filter(n => !this.dismissedIds.has(n.id));
          }
          if (!this._booted) {
            // İlk yoklamada geçmiş bildirimler sessizce işaretlenir; yalnızca
            // oturum süresince gelen yeni bildirimler ekranda müjdelenir.
            this._booted = true;
            list.forEach(n => this.seenIds.add(n.id));
          } else {
            list.forEach(n => {
              if (!this.seenIds.has(n.id)) {
                this.seenIds.add(n.id);
                this.showDesktopToast(n);
              }
            });
          }
          this.notifications = list;
          this.updateBadge();
          this.renderList();
        }
      } catch (e) {
        // Fallback
      }
    },

    showDesktopToast(n) {
      if (SafeStorage.getItem('ankora_dnd') === '1') return;
      const title = this.notifTitle(n);
      const body = n.body || '';
      const app = n.app_name ? `[${n.app_name}] ` : '';
      if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
        ReportManager.showToast(`${app}${title}${body ? ': ' + body : ''}`);
      }
    },

    notifTitle(n) {
      return (n && (n.summary || n.title)) || 'Bildirim';
    },

    // Bildirim merkezi: toast'la açıklanan olayın merkeze de düşmesi.
    // (Kullanıcı şikayeti: bildirim merkezinde hiçbir şey görünmüyordu.)
    pushLocal(summary, body = '', appName = 'Ayaz DE') {
      const t = String(summary || 'Bildirim');
      let bodyPart = String(body || '');
      // showToast tek metin dizesiyle çağrılır; "[App] Başlık: Gövde" biçimini ayrıştır.
      if (!bodyPart) {
        const m = t.match(/^\[([^\]]+)\]\s*([^:]+)(?::\s*)?(.*)$/);
        if (m) {
          appName = m[1];
          if (m[3]) {
            var title = m[2].trim();
            bodyPart = m[3].trim();
            return this.pushLocalRaw(title, bodyPart, appName);
          }
          return this.pushLocalRaw(m[2].trim(), '', appName);
        }
      }
      return this.pushLocalRaw(t, bodyPart, appName);
    },

    pushLocalRaw(summary, body, appName) {
      const id = `local-${Date.now()}-${(this._localSeq = (this._localSeq || 0) + 1)}`;
      const item = {
        id,
        summary,
        body,
        app_name: appName,
        timestamp: Math.floor(Date.now() / 1000),
        read: false
      };
      this.localExtras.push(item);
      if (this.localExtras.length > 20) this.localExtras.shift();
      this.seenIds.add(id);
      this.updateBadge();
      this.renderList();
    },

    updateBadge() {
      const badge = document.getElementById('tray-notif-badge');
      if (!badge) return;
      const unreadCount = this.notifications.filter(n => !n.read).length;
      if (unreadCount > 0) {
        badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        badge.style.display = 'inline-flex';
      } else {
        badge.style.display = 'none';
      }
    },

    markAllAsRead() {
      this.notifications.forEach(n => { n.read = true; });
      this.updateBadge();
      this.renderList();
      // Okundu durumu Rust tarafında kalıcılaştırılır; yoklama geri getirmez.
      try {
        TauriBridge.invoke('mark_notifications_read').catch(() => {});
      } catch (e) {}
    },

    async clearAll() {
      try {
        await TauriBridge.invoke('clear_system_notifications');
      } catch (e) {}
      this.notifications = [];
      this.seenIds.clear();
      if (this.dismissedIds) this.dismissedIds.clear();
      this.updateBadge();
      this.renderList();
      if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
        ReportManager.showToast('Tüm bildirimler temizlendi.');
      }
    },

    removeNotification(id) {
      this.notifications = this.notifications.filter(n => n.id !== id);
      if (this.dismissedIds) this.dismissedIds.add(id);
      this.updateBadge();
      this.renderList();
    },

    renderList() {
      const container = document.getElementById('notif-items-container');
      const emptyState = document.getElementById('notif-empty-state');
      if (!container) return;

      const items = container.querySelectorAll('.notif-card-item');
      items.forEach(el => el.remove());

      if (this.notifications.length === 0) {
        if (emptyState) emptyState.style.display = 'flex';
        return;
      }

      if (emptyState) emptyState.style.display = 'none';

      const sorted = [...this.notifications].reverse();

      sorted.forEach(n => {
        const card = document.createElement('div');
        card.className = 'notif-card-item';
        card.style.cssText = 'padding:12px 14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;display:flex;flex-direction:column;gap:5px;position:relative;margin-bottom:8px;transition:background 0.15s ease;';

        const timeStr = n.timestamp
          ? (typeof n.timestamp === 'number'
              ? new Date(n.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : String(n.timestamp).slice(0, 5))
          : '';

        card.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:11px;font-weight:600;color:var(--accent-active,#38bdf8);background:rgba(56,189,248,0.12);padding:2px 6px;border-radius:4px;">${escapeHtml(n.app_name || 'Sistem')}</span>
              <span style="font-size:10px;color:var(--text-muted,#94a3b8);">${escapeHtml(timeStr)}</span>
            </div>
            <button class="btn-dismiss-single-notif" style="background:none;border:none;color:var(--text-muted,#64748b);font-size:13px;cursor:pointer;padding:2px 6px;border-radius:3px;" title="Kaldır">✕</button>
          </div>
          <div style="font-size:12.5px;font-weight:600;color:var(--text-primary,#fff);margin-top:2px;">${escapeHtml(this.notifTitle(n) === 'Bildirim' ? '' : this.notifTitle(n))}</div>
          <div style="font-size:11.5px;color:var(--text-secondary,#cbd5e1);line-height:1.4;word-break:break-word;">${escapeHtml(n.body || '')}</div>
        `;

        const btnDismiss = card.querySelector('.btn-dismiss-single-notif');
        btnDismiss?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeNotification(n.id);
        });

        container.appendChild(card);
      });
    },

    async notify(summary, body = '', appName = 'AyazDE', icon = 'dialog-information') {
      try {
        await TauriBridge.invoke('send_desktop_notification', {
          summary,
          body,
          appName: appName,
          icon: icon
        });
      } catch (e) {
        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast(`${summary}: ${body}`);
        }
      }
      setTimeout(() => this.poll(), 300);
    }
  };

  // ============================================================================
  // 20. GELİŞMİŞ SES AYGITLARI YÖNETİCİSİ (AUDIO DEVICE MANAGER)
  // ============================================================================
  const AudioDeviceManager = {
    init() {
      const sinkSelect = document.getElementById('select-audio-sink');
      const sourceSelect = document.getElementById('select-audio-source');

      if (sinkSelect) {
        sinkSelect.addEventListener('change', (e) => {
          const val = e.target.value;
          if (!val) return;
          TauriBridge.invoke('set_default_audio_device', { name: val, isSink: true, deviceName: val, kind: 'sink' })
            .then(() => {
              if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
                ReportManager.showToast('Ses çıkış aygıtı değiştirildi: ' + e.target.options[e.target.selectedIndex].text);
              }
            })
            .catch(err => {
              if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
                ReportManager.showToast('Aygıt seçilemedi: ' + (err.message || err), 'error');
              }
            });
        });
      }

      if (sourceSelect) {
        sourceSelect.addEventListener('change', (e) => {
          const val = e.target.value;
          if (!val) return;
          TauriBridge.invoke('set_default_audio_device', { name: val, isSink: false, deviceName: val, kind: 'source' })
            .then(() => {
              if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
                ReportManager.showToast('Mikrofon giriş aygıtı değiştirildi: ' + e.target.options[e.target.selectedIndex].text);
              }
            })
            .catch(err => {
              if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
                ReportManager.showToast('Mikrofon seçilemedi: ' + (err.message || err), 'error');
              }
            });
        });
      }

      this.refreshDevices();
    },

    async refreshDevices() {
      try {
        const res = await TauriBridge.invoke('get_audio_devices');
        let sinks = [];
        let sources = [];
        if (Array.isArray(res)) {
          sinks = res.filter(d => d.is_sink);
          sources = res.filter(d => !d.is_sink);
        } else if (res && typeof res === 'object') {
          sinks = Array.isArray(res.sinks) ? res.sinks : [];
          sources = Array.isArray(res.sources) ? res.sources : [];
        }
        const sinkSelect = document.getElementById('select-audio-sink');
        const sourceSelect = document.getElementById('select-audio-source');
        if (sinkSelect && sinks.length > 0) {
          sinkSelect.innerHTML = sinks.map(s => `
            <option value="${escapeHtml(s.name)}" ${s.is_default ? 'selected' : ''}>
              ${escapeHtml(s.description || s.name)}
            </option>
          `).join('');
        }

        if (sourceSelect && sources.length > 0) {
          sourceSelect.innerHTML = sources.map(s => `
            <option value="${escapeHtml(s.name)}" ${s.is_default ? 'selected' : ''}>
              ${escapeHtml(s.description || s.name)}
            </option>
          `).join('');
        }
      } catch (e) {
        // Fallback
      }
    }
  };

  // ============================================================================
  // 21. BLUETOOTH YÖNETİCİSİ (BLUETOOTH MANAGER)
  // ============================================================================
  const BluetoothManager = {
    status: { is_available: false, is_powered: false, devices: [] },
    isScanning: false,

    init() {
      const togglePower = document.getElementById('toggle-bt-power');
      const btnScan = document.getElementById('btn-bt-scan');

      if (togglePower) {
        togglePower.addEventListener('change', (e) => {
          this.togglePower(e.target.checked);
        });
      }

      if (btnScan) {
        btnScan.addEventListener('click', () => {
          this.scan();
        });
      }

      this.checkStatus();
    },

    async checkStatus() {
      try {
        const res = await TauriBridge.invoke('get_bluetooth_status');
        if (res && typeof res === 'object') {
          this.status = res;
          this.render();
        }
      } catch (e) {
        this.status = { is_available: false, is_powered: false, devices: [] };
        this.render();
      }
    },

    async togglePower(enable) {
      try {
        await TauriBridge.invoke('toggle_bluetooth', { enable, powered: Boolean(enable) });
        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast(enable ? 'Bluetooth etkinleştirildi.' : 'Bluetooth kapatıldı.');
        }
        setTimeout(() => this.checkStatus(), 500);
      } catch (e) {
        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast('Bluetooth durumu değiştirilemedi: ' + (e.message || e), 'error');
        }
        this.checkStatus();
      }
    },

    async scan() {
      if (this.isScanning) return;
      this.isScanning = true;
      const btnScan = document.getElementById('btn-bt-scan');
      if (btnScan) {
        btnScan.disabled = true;
        btnScan.textContent = 'Aranıyor...';
      }

      try {
        const devs = await TauriBridge.invoke('scan_bluetooth', { enable: true });
        if (Array.isArray(devs)) {
          this.status.devices = devs;
        }
        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast('Bluetooth taraması tamamlandı.');
        }
        await this.checkStatus();
      } catch (e) {
        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast('Tarama hatası: ' + (e.message || e), 'error');
        }
      } finally {
        this.isScanning = false;
        if (btnScan) {
          btnScan.disabled = false;
          btnScan.textContent = 'Cihaz Ara';
        }
      }
    },

    async connect(address, name) {
      if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
        ReportManager.showToast(`${name || address} cihazına bağlanılıyor...`);
      }
      try {
        const msg = await TauriBridge.invoke('connect_bluetooth_device', { address });
        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast(msg || 'Bağlantı başarılı!');
        }
        setTimeout(() => this.checkStatus(), 1200);
      } catch (e) {
        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast('Bağlantı hatası: ' + (e.message || e), 'error');
        }
      }
    },

    async disconnect(address, name) {
      try {
        const msg = await TauriBridge.invoke('disconnect_bluetooth_device', { address });
        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast(msg || 'Bağlantı kesildi.');
        }
        setTimeout(() => this.checkStatus(), 1200);
      } catch (e) {
        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast('Hata: ' + (e.message || e), 'error');
        }
      }
    },

    render() {
      const desc = document.getElementById('bt-status-desc');
      const toggle = document.getElementById('toggle-bt-power');
      const list = document.getElementById('bt-devices-list');
      if (!list) return;

      if (!this.status.is_available) {
        if (desc) desc.textContent = 'Bluetooth adaptörü bulunamadı veya BlueZ servisi kapalı.';
        if (toggle) {
          toggle.checked = false;
          toggle.disabled = true;
        }
        list.innerHTML = '<div style="color:var(--text-muted,#94a3b8);font-size:12px;padding:8px 0;">Sistemde kullanılabilir bir Bluetooth adaptörü algılanamadı.</div>';
        return;
      }

      if (!this.status.is_powered) {
        if (desc) desc.textContent = 'Bluetooth adaptörü kapalı.';
        if (toggle) {
          toggle.checked = false;
          toggle.disabled = false;
        }
        list.innerHTML = '<div style="color:var(--text-muted,#94a3b8);font-size:12px;padding:8px 0;">Bluetooth kapalı. Aygıtları taramak ve bağlanmak için açın.</div>';
        return;
      }

      if (desc) desc.textContent = 'Bluetooth açık ve hazır.';
      if (toggle) {
        toggle.checked = true;
        toggle.disabled = false;
      }

      const devs = this.status.devices || [];
      if (devs.length === 0) {
        list.innerHTML = '<div style="color:var(--text-muted,#94a3b8);font-size:12px;padding:8px 0;">Eşleşmiş cihaz yok. "Cihaz Ara" butonuna basarak yakındaki cihazları keşfedin.</div>';
        return;
      }

      list.innerHTML = '';
      devs.forEach(d => {
        const row = document.createElement('div');
        row.className = 'bt-device-row';

        const isConnected = Boolean(d.is_connected ?? d.connected);
        let badgeStyle = 'background:rgba(255,255,255,0.08);color:var(--text-secondary,#cbd5e1);';
        let badgeText = 'Eşleşti';
        if (isConnected) {
          badgeStyle = 'background:rgba(34,197,94,0.15);color:#4ade80;border:1px solid rgba(34,197,94,0.3);';
          badgeText = 'Bağlı';
        }

        row.innerHTML = `
          <div class="bt-device-meta">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="bt-device-name">${escapeHtml(d.name || 'Bilinmeyen Cihaz')}</span>
              <span style="font-size:10px;padding:1px 6px;border-radius:4px;${badgeStyle}">${badgeText}</span>
            </div>
            <span class="bt-device-addr">${escapeHtml(d.address)}</span>
          </div>
          <div style="display:flex;gap:6px;">
            ${isConnected 
              ? `<button class="btn-pkg btn-bt-disconnect" style="padding:4px 10px;font-size:11px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.25);color:#f87171;border-radius:4px;cursor:pointer;">Bağlantıyı Kes</button>`
              : `<button class="btn-pkg btn-pkg-primary btn-bt-connect" style="padding:4px 10px;font-size:11px;border-radius:4px;cursor:pointer;">Bağlan</button>`
            }
          </div>
        `;

        const btnConn = row.querySelector('.btn-bt-connect');
        btnConn?.addEventListener('click', () => this.connect(d.address, d.name));

        const btnDisc = row.querySelector('.btn-bt-disconnect');
        btnDisc?.addEventListener('click', () => this.disconnect(d.address, d.name));

        list.appendChild(row);
      });
    }
  };

  // ============================================================================
  // 22. EVRENSEL HIZLI ARAMA (SPOTLIGHT / KRUNNER - ALT+SPACE)
  // ============================================================================
  const SpotlightManager = {
    overlay: null,
    input: null,
    results: null,
    isOpen: false,
    selectedIndex: 0,
    currentItems: [],
    searchTimer: null,

    init() {
      this.overlay = document.getElementById('spotlight-overlay');
      this.input = document.getElementById('spotlight-input');
      this.results = document.getElementById('spotlight-results');

      if (!this.overlay || !this.input || !this.results) return;

      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) this.close();
      });

      this.input.addEventListener('keydown', (e) => this.handleKeyDown(e));
      this.input.addEventListener('input', () => {
        clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => this.search(this.input.value), 40);
      });
    },

    open() {
      if (!this.overlay || !this.input) return;
      this.isOpen = true;
      this.overlay.style.display = 'flex';
      this.input.value = '';
      this.selectedIndex = 0;
      this.input.focus();
      this.renderDefaults();
      try {
        TauriBridge.invoke('set_desktop_layer', { above: true }).catch(() => {});
      } catch (e) {}
    },

    close() {
      if (!this.overlay || !this.input) return;
      this.isOpen = false;
      this.overlay.style.display = 'none';
      this.input.blur();
      try {
        TauriBridge.invoke('set_desktop_layer', { above: false }).catch(() => {});
      } catch (e) {}
    },

    toggle() {
      if (this.isOpen) {
        this.close();
      } else {
        this.open();
      }
    },

    handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.currentItems.length > 0) {
          this.selectedIndex = (this.selectedIndex + 1) % this.currentItems.length;
          this.updateActiveItem();
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.currentItems.length > 0) {
          this.selectedIndex = (this.selectedIndex - 1 + this.currentItems.length) % this.currentItems.length;
          this.updateActiveItem();
        }
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (this.currentItems.length > 0 && this.currentItems[this.selectedIndex]) {
          const item = this.currentItems[this.selectedIndex];
          this.close();
          item.onSelect();
        }
      }
    },

    evaluateMath(expr) {
      const clean = expr.trim();
      if (!clean) return null;
      if (!/^[\d\s\+\-\*\/\%\^\(\)\.\,e]+$/i.test(clean)) return null;
      if (!/[\+\-\*\/\%\^]/.test(clean)) return null;
      try {
        const sanitized = clean.replace(/,/g, '.');
        const tokens = sanitized.match(/\d+(?:\.\d+)?|[+\-*/%^()]/g);
        if (!tokens || tokens.join('').replace(/\s+/g, '') !== sanitized.replace(/\s+/g, '')) return null;

        let pos = 0;
        function parsePrimary() {
          let token = tokens[pos];
          if (token === '(') {
            pos++;
            let res = parseExpr();
            if (tokens[pos] === ')') pos++;
            return res;
          }
          if (token === '+' || token === '-') {
            pos++;
            let num = parsePrimary();
            return token === '-' ? -num : num;
          }
          pos++;
          return parseFloat(token);
        }
        function parseFactor() {
          let left = parsePrimary();
          while (pos < tokens.length && tokens[pos] === '^') {
            pos++;
            let right = parsePrimary();
            left = Math.pow(left, right);
          }
          return left;
        }
        function parseTerm() {
          let left = parseFactor();
          while (pos < tokens.length && (tokens[pos] === '*' || tokens[pos] === '/' || tokens[pos] === '%')) {
            let op = tokens[pos++];
            let right = parseFactor();
            if (op === '*') left *= right;
            else if (op === '/') left = right === 0 ? NaN : left / right;
            else if (op === '%') left %= right;
          }
          return left;
        }
        function parseExpr() {
          let left = parseTerm();
          while (pos < tokens.length && (tokens[pos] === '+' || tokens[pos] === '-')) {
            let op = tokens[pos++];
            let right = parseTerm();
            if (op === '+') left += right;
            else if (op === '-') left -= right;
          }
          return left;
        }
        const val = parseExpr();
        if (typeof val === 'number' && !isNaN(val) && isFinite(val)) {
          return Math.round(val * 1000000) / 1000000;
        }
      } catch (e) {}
      return null;
    },

    renderDefaults() {
      const items = [
        {
          title: 'Uçbirim (Terminal)',
          subtitle: 'Sistem komut satırı ve araçlar (Ctrl+Alt+T)',
          badge: 'UYGULAMA',
          iconSvg: '<polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line>',
          onSelect: () => WindowManager.open('win-terminal')
        },
        {
          title: 'Dosya Yöneticisi',
          subtitle: 'Kişisel dosyalar ve depolama birimleri (Super+E)',
          badge: 'UYGULAMA',
          iconSvg: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>',
          onSelect: () => WindowManager.open('win-files')
        },
        {
          title: 'Sistem Ayarları',
          subtitle: 'Ekran, tema, ses, ağ ve cihaz tercihleri (Ctrl+Alt+S)',
          badge: 'SİSTEM',
          iconSvg: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>',
          onSelect: () => WindowManager.open('win-settings')
        },
        {
          title: 'Görev Yöneticisi',
          subtitle: 'İşlemler, RAM, CPU ve disk monitörü (Ctrl+Shift+Esc)',
          badge: 'SİSTEM',
          iconSvg: '<line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line>',
          onSelect: () => WindowManager.open('win-taskmgr')
        }
      ];
      this.currentItems = items;
      this.selectedIndex = 0;
      this.renderItems();
    },

    async search(rawQuery) {
      const q = (rawQuery || '').trim();
      if (!q) {
        this.renderDefaults();
        return;
      }

      const items = [];

      // 1. Matematiksel İfade Değerlendirme
      const mathVal = this.evaluateMath(q);
      if (mathVal !== null) {
        items.push({
          title: `= ${mathVal}`,
          subtitle: `Hesaplama sonucu — Enter'a basarak panoya kopyalayın`,
          badge: 'HESAPLAMA',
          iconSvg: '<line x1="4" y1="9" x2="20" y2="9"></line><line x1="4" y1="15" x2="20" y2="15"></line><line x1="10" y1="3" x2="10" y2="21"></line><line x1="14" y1="3" x2="14" y2="21"></line>',
          onSelect: () => {
            navigator.clipboard.writeText(String(mathVal)).then(() => {
              if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
                ReportManager.showToast(`Sonuç panoya kopyalandı: ${mathVal}`);
              }
            });
          }
        });
      }

      // 2. Kabuk Komutu Çalıştırma (> veya $ ile başlarsa)
      if (q.startsWith('>') || q.startsWith('$')) {
        const cmd = q.slice(1).trim();
        if (cmd) {
          items.push({
            title: `Komut Çalıştır: ${cmd}`,
            subtitle: `Terminal penceresinde yürüt`,
            badge: 'UÇBİRİM',
            iconSvg: '<polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line>',
            onSelect: () => {
              WindowManager.open('win-terminal');
              if (typeof Terminal !== 'undefined' && Terminal.runCommand) {
                Terminal.runCommand(cmd);
              }
            }
          });
        }
      }

      const normQ = typeof launcherNorm === 'function' ? launcherNorm(q) : q.toLowerCase();

      // 3. Uygulamalar Araması (XdgDesktopEngine)
      if (typeof XdgDesktopEngine !== 'undefined') {
        const allApps = [
          ...(XdgDesktopEngine.getDefaultApps ? XdgDesktopEngine.getDefaultApps() : []),
          ...(XdgDesktopEngine.installedApps || [])
        ];

        const matchedApps = allApps.filter(app => {
          const name = typeof launcherNorm === 'function' ? launcherNorm(app.name || '') : (app.name || '').toLowerCase();
          const comment = typeof launcherNorm === 'function' ? launcherNorm(app.comment || '') : (app.comment || '').toLowerCase();
          const exec = (app.exec || '').toLowerCase();
          return name.includes(normQ) || comment.includes(normQ) || exec.includes(normQ);
        });

        matchedApps.slice(0, 6).forEach(app => {
          items.push({
            title: app.name,
            subtitle: app.comment || app.exec || 'Uygulama',
            badge: 'UYGULAMA',
            iconSvg: '<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>',
            onSelect: () => XdgDesktopEngine.launchApp(app)
          });
        });
      }

      // 4. Ayarlar Hızlı Geçişleri
      const settingPanes = [
        { name: 'Ekran & Çözünürlük Ayarları', id: 'pane-set-display', terms: ['ekran', 'cozunurluk', 'display', 'monitör'] },
        { name: 'Duvar Kağıdı & Görünüm Ayarları', id: 'pane-set-theme', terms: ['tema', 'duvar kagidi', 'arka plan', 'wallpaper'] },
        { name: 'Ses & Bildirim Ayarları', id: 'pane-set-audio', terms: ['ses', 'audio', 'hoparlor', 'mikrofon', 'volume', 'sound'] },
        { name: 'Bluetooth Aygıtları', id: 'pane-set-bluetooth', terms: ['bluetooth', 'bt', 'kulaklik', 'kablosuz'] },
        { name: 'Klavye Kısayolları', id: 'pane-set-shortcuts', terms: ['kisayol', 'klavye', 'shortcuts', 'tus'] },
        { name: 'Bölge & Dil (Saat, Klavye, Sistem Dili)', id: 'pane-set-region', terms: ['bolge', 'dil', 'saat', 'zaman', 'klavye duzeni', 'keyboard layout', 'timezone', 'locale', 'language', 'saat dilimi', 'istanbul'] },
        { name: 'Depolama & Disk Yönetimi', id: 'pane-set-storage', terms: ['depolama', 'disk', 'storage', 'hdd', 'ssd'] },
        { name: 'Güç & Kiosk Modu', id: 'pane-set-power', terms: ['guc', 'power', 'pil', 'kiosk', 'uyku'] },
        { name: 'Sistem Bilgisi & Telemetri', id: 'pane-set-about', terms: ['sistem', 'hakkinda', 'surum', 'about', 'ankora'] }
      ];

      settingPanes.forEach(sp => {
        const matches = sp.terms.some(t => normQ.includes(t) || t.includes(normQ));
        if (matches) {
          items.push({
            title: sp.name,
            subtitle: `Sistem Ayarları sekmesini doğrudan aç`,
            badge: 'AYARLAR',
            iconSvg: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>',
            onSelect: () => {
              WindowManager.open('win-settings');
              const navItem = document.querySelector(`.settings-nav-item[data-pane="${sp.id}"]`);
              if (navItem) navItem.click();
            }
          });
        }
      });

      // 5. Hızlı Dosya Araması (IPC)
      if (q.length >= 2 && !q.startsWith('>') && !q.startsWith('$')) {
        try {
          const files = await TauriBridge.invoke('spotlight_search_files', { query: q, maxResults: 8 });
          if (Array.isArray(files)) {
            files.forEach(f => {
              items.push({
                title: f.name,
                subtitle: `${f.path}${f.size_str ? ` • ${f.size_str}` : (f.size_human ? ` • ${f.size_human}` : '')}`,
                badge: f.is_dir ? 'KLASÖR' : 'DOSYA',
                iconSvg: f.is_dir 
                  ? '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>'
                  : '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline>',
                onSelect: () => {
                  if (f.is_dir) {
                    WindowManager.open('win-files');
                    if (typeof FileManager !== 'undefined' && FileManager.loadDirectory) {
                      FileManager.loadDirectory(f.path);
                    }
                  } else {
                    TauriBridge.invoke('launch_application', { exec: `xdg-open "${f.path}"` })
                      .catch(() => {
                        WindowManager.open('win-files');
                        const dir = f.path.substring(0, f.path.lastIndexOf('/'));
                        if (typeof FileManager !== 'undefined' && FileManager.loadDirectory) {
                          FileManager.loadDirectory(dir || '/');
                        }
                      });
                  }
                }
              });
            });
          }
        } catch (e) {}
      }

      this.currentItems = items;
      this.selectedIndex = 0;
      this.renderItems();
    },

    renderItems() {
      if (!this.results) return;
      this.results.innerHTML = '';

      if (this.currentItems.length === 0) {
        this.results.innerHTML = `
          <div style="padding: 24px; text-align: center; color: var(--text-muted, #94a3b8); font-size: 13px;">
            Eşleşen sonuç bulunamadı.
          </div>
        `;
        return;
      }

      this.currentItems.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = `spotlight-item ${idx === this.selectedIndex ? 'active' : ''}`;
        row.innerHTML = `
          <div class="spotlight-item-icon">
            <svg class="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:20px;height:20px;">
              ${item.iconSvg}
            </svg>
          </div>
          <div class="spotlight-item-info">
            <span class="spotlight-item-name">${escapeHtml(item.title)}</span>
            <span class="spotlight-item-sub">${escapeHtml(item.subtitle)}</span>
          </div>
          <span class="spotlight-item-badge">${escapeHtml(item.badge)}</span>
        `;

        row.addEventListener('click', () => {
          this.close();
          item.onSelect();
        });

        row.addEventListener('mouseenter', () => {
          this.selectedIndex = idx;
          this.updateActiveItem();
        });

        this.results.appendChild(row);
      });
    },

    updateActiveItem() {
      const items = this.results?.querySelectorAll('.spotlight-item');
      if (!items) return;
      items.forEach((el, idx) => {
        el.classList.toggle('active', idx === this.selectedIndex);
        if (idx === this.selectedIndex) {
          el.scrollIntoView({ block: 'nearest' });
        }
      });
    }
  };

  // ============================================================================
  // MPRIS D-BUS MEDYA KONTROLCÜSÜ (Brave, Spotify, VLC, mpv vb.)
  // ============================================================================
  const MprisManager = {
    pollTimer: null,
    currentStatus: null,

    init() {
      const btnPrev = document.getElementById('mpris-btn-prev');
      const btnPlay = document.getElementById('mpris-btn-play');
      const btnNext = document.getElementById('mpris-btn-next');

      if (btnPrev) {
        btnPrev.addEventListener('click', (e) => {
          e.stopPropagation();
          this.sendCommand('previous');
        });
      }
      if (btnPlay) {
        btnPlay.addEventListener('click', (e) => {
          e.stopPropagation();
          this.sendCommand('play-pause');
        });
      }
      if (btnNext) {
        btnNext.addEventListener('click', (e) => {
          e.stopPropagation();
          this.sendCommand('next');
        });
      }

      this.update();
      if (this.pollTimer) clearInterval(this.pollTimer);
      this.pollTimer = setInterval(() => this.update(), 4000);
    },

    async update() {
      try {
        const res = await TauriBridge.invoke('get_mpris_status');
        const card = document.getElementById('mpris-widget-card');
        if (!card) return;

        if (res && res.is_active && res.player_name) {
          this.currentStatus = res;
          card.style.display = 'flex';
          const titleEl = document.getElementById('mpris-title');
          const artistEl = document.getElementById('mpris-artist');
          const playBtn = document.getElementById('mpris-btn-play');
          const artBox = document.getElementById('mpris-art-box');

          if (titleEl) titleEl.textContent = res.title || 'Bilinmeyen Parça';
          if (artistEl) {
            const sub = [res.artist, res.player_name].filter(Boolean).join(' • ');
            artistEl.textContent = sub || 'Medya Oynatıcı';
          }
          if (playBtn) {
            const isPlaying = (res.playback_status || '').toLowerCase() === 'playing';
            playBtn.textContent = isPlaying ? '⏸' : '▶';
            playBtn.title = isPlaying ? 'Duraklat' : 'Oynat';
          }
          if (artBox && res.art_url && (res.art_url.startsWith('http') || res.art_url.startsWith('file://'))) {
            artBox.innerHTML = `<img src="${escapeHtml(res.art_url)}" alt="Albüm Kapağı" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">`;
          } else if (artBox && !artBox.querySelector('svg')) {
            artBox.innerHTML = '<svg class="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>';
          }
        } else {
          this.currentStatus = null;
          card.style.display = 'none';
        }
      } catch (err) {
        const card = document.getElementById('mpris-widget-card');
        if (card) card.style.display = 'none';
      }
    },

    async sendCommand(cmd) {
      try {
        await TauriBridge.invoke('send_mpris_command', { command: cmd });
        setTimeout(() => this.update(), 250);
      } catch (err) {
        console.warn('[MprisManager] Komut iletilemedi:', err);
      }
    }
  };

  // ============================================================================
  // STATUSNOTIFIERITEM (SNI) & SYSTRAY YÖNETİCİSİ (Discord, Telegram, Steam vb.)
  // ============================================================================
  const SystrayManager = {
    pollTimer: null,
    items: [],

    init() {
      this.refresh();
      if (this.pollTimer) clearInterval(this.pollTimer);
      this.pollTimer = setInterval(() => this.refresh(), 4000);
    },

    async refresh() {
      const container = document.getElementById('taskbar-systray-container');
      if (!container) return;

      try {
        const items = await TauriBridge.invoke('get_tray_items');
        if (!Array.isArray(items)) return;

        this.items = items;
        container.innerHTML = '';

        items.forEach(item => {
          const btn = document.createElement('button');
          btn.className = 'systray-item-btn';
          btn.title = item.title || item.tooltip || item.id || 'Tepsi Öğesi';
          btn.dataset.trayId = item.id || '';

          if (item.icon_path && (item.icon_path.startsWith('/') || item.icon_path.startsWith('data:'))) {
            const img = document.createElement('img');
            img.src = item.icon_path;
            img.alt = item.title || 'tray';
            img.style.width = '16px';
            img.style.height = '16px';
            img.style.objectFit = 'contain';
            btn.appendChild(img);
          } else {
            const span = document.createElement('span');
            span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="4" fill="currentColor"></circle></svg>';
            btn.appendChild(span);
          }

          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            TauriBridge.invoke('activate_tray_item', { service: item.service || item.id }).catch(() => {});
          });

          btn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            TauriBridge.invoke('context_menu_tray_item', { service: item.service || item.id }).catch(() => {});
          });

          container.appendChild(btn);
        });
      } catch (err) {
        // Hata durumunda sessiz kal
      }
    }
  };

  // ============================================================================
  // ANKORA FLASHER & USB BİÇİMLENDİRİCİ
  // ============================================================================
  const FlasherManager = {
    progressTimer: null,

    init() {
      const tabIso = document.getElementById('flasher-tab-iso');
      const tabFormat = document.getElementById('flasher-tab-format');
      const paneIso = document.getElementById('flasher-pane-iso');
      const paneFormat = document.getElementById('flasher-pane-format');

      if (tabIso && tabFormat && paneIso && paneFormat) {
        tabIso.addEventListener('click', () => {
          tabIso.classList.add('active');
          tabFormat.classList.remove('active');
          paneIso.style.display = 'flex';
          paneFormat.style.display = 'none';
        });

        tabFormat.addEventListener('click', () => {
          tabFormat.classList.add('active');
          tabIso.classList.remove('active');
          paneFormat.style.display = 'flex';
          paneIso.style.display = 'none';
          this.refreshFormatTargets();
        });
      }

      const btnBrowse = document.getElementById('btn-flasher-browse-iso');
      const isoInput = document.getElementById('flasher-iso-path');
      if (btnBrowse && isoInput) {
        btnBrowse.addEventListener('click', () => {
          const val = prompt('Lütfen yazdırılacak ISO dosyasının tam yolunu girin:', isoInput.value || '/home/live/Downloads/ankora-linux.iso');
          if (val && val.trim()) {
            isoInput.value = val.trim();
          }
        });
      }

      const btnRefresh = document.getElementById('btn-flasher-refresh-drives');
      if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
          this.refreshTargets();
          this.refreshFormatTargets();
        });
      }

      const btnStartFlash = document.getElementById('btn-flasher-start');
      if (btnStartFlash) {
        btnStartFlash.addEventListener('click', () => this.startFlash());
      }

      const btnStartFormat = document.getElementById('btn-format-start');
      if (btnStartFormat) {
        btnStartFormat.addEventListener('click', () => this.startFormat());
      }

      this.refreshTargets();
    },

    open() {
      WindowManager.open('win-flasher');
      this.refreshTargets();
      this.refreshFormatTargets();
    },

    async refreshTargets() {
      const select = document.getElementById('flasher-target-select');
      if (!select) return;

      select.innerHTML = '<option value="">USB sürücüler taranıyor...</option>';

      try {
        const targets = await TauriBridge.invoke('get_usb_flash_targets');
        select.innerHTML = '';

        if (!Array.isArray(targets) || targets.length === 0) {
          select.innerHTML = '<option value="">Uygun USB bellek bulunamadı (Sistem diskleri korunmuştur)</option>';
          return;
        }

        targets.forEach(t => {
          const opt = document.createElement('option');
          opt.value = t.path || t.name;
          const label = `${t.path || t.name} — ${t.vendor || ''} ${t.model || ''} (${t.size_human || ''})`.replace(/\s+/g, ' ').trim();
          opt.textContent = label;
          select.appendChild(opt);
        });
      } catch (err) {
        select.innerHTML = '<option value="">Sürücüler taranamadı</option>';
      }
    },

    async refreshFormatTargets() {
      const select = document.getElementById('format-target-select');
      if (!select) return;

      select.innerHTML = '<option value="">USB sürücüler taranıyor...</option>';

      try {
        const targets = await TauriBridge.invoke('get_usb_flash_targets');
        select.innerHTML = '';

        if (!Array.isArray(targets) || targets.length === 0) {
          select.innerHTML = '<option value="">Uygun USB bellek bulunamadı</option>';
          return;
        }

        targets.forEach(t => {
          const opt = document.createElement('option');
          opt.value = t.path || t.name;
          const label = `${t.path || t.name} — ${t.vendor || ''} ${t.model || ''} (${t.size_human || ''})`.replace(/\s+/g, ' ').trim();
          opt.textContent = label;
          select.appendChild(opt);
        });
      } catch (err) {
        select.innerHTML = '<option value="">Sürücüler taranamadı</option>';
      }
    },

    async startFlash() {
      const isoPath = document.getElementById('flasher-iso-path')?.value?.trim();
      const targetDev = document.getElementById('flasher-target-select')?.value;

      if (!isoPath) {
        alert('Lütfen geçerli bir ISO dosyası yolu belirtin.');
        return;
      }
      if (!targetDev) {
        alert('Lütfen hedef USB bellek seçin.');
        return;
      }

      const confirmMsg = `⚠️ DİKKAT!\n\n${targetDev} cihazındaki tüm veriler kalıcı olarak silinecek ve ISO kalıbı yazılacaktır.\n\nDevam etmek istiyor musunuz?`;
      if (!confirm(confirmMsg)) return;

      const progressWrap = document.getElementById('flasher-progress-wrap');
      const progressBar = document.getElementById('flasher-progress-bar');
      const progressStatus = document.getElementById('flasher-progress-status');
      const progressPct = document.getElementById('flasher-progress-pct');
      const btnStart = document.getElementById('btn-flasher-start');

      if (progressWrap) progressWrap.style.display = 'flex';
      if (progressBar) progressBar.style.width = '0%';
      if (progressStatus) progressStatus.textContent = 'Yazma işlemi başlatılıyor...';
      if (progressPct) progressPct.textContent = '0%';
      if (btnStart) btnStart.disabled = true;

      try {
        await TauriBridge.invoke('flash_iso_to_usb', {
          isoPath: isoPath,
          iso_path: isoPath,
          targetDevice: targetDev,
          target_device: targetDev
        });

        if (this.progressTimer) clearInterval(this.progressTimer);
        this.progressTimer = setInterval(async () => {
          try {
            const prog = await TauriBridge.invoke('get_flash_progress');
            if (!prog) return;

            const pct = Math.min(100, Math.max(0, Math.round(prog.percent || 0)));
            if (progressBar) progressBar.style.width = `${pct}%`;
            if (progressPct) progressPct.textContent = `${pct}%`;
            if (progressStatus) progressStatus.textContent = prog.message || prog.status || 'Yazılıyor...';

            if (prog.status === 'done' || pct >= 100) {
              clearInterval(this.progressTimer);
              if (btnStart) btnStart.disabled = false;
              if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
                ReportManager.showToast('ISO başarıyla USB belleğe yazdırıldı!');
              } else {
                alert('ISO başarıyla USB belleğe yazdırıldı!');
              }
            } else if (prog.status === 'error') {
              clearInterval(this.progressTimer);
              if (btnStart) btnStart.disabled = false;
              alert('Flaşlama hatası: ' + (prog.message || 'Bilinmeyen hata'));
            }
          } catch (e) {
            // İlerleme sorgulama hatası
          }
        }, 1200);

      } catch (err) {
        alert('İşlem başlatılamadı: ' + (err.message || err));
        if (btnStart) btnStart.disabled = false;
        if (progressWrap) progressWrap.style.display = 'none';
      }
    },

    async startFormat() {
      const targetDev = document.getElementById('format-target-select')?.value;
      const fsType = document.getElementById('format-fs-select')?.value || 'vfat';
      const label = document.getElementById('format-label-input')?.value?.trim() || 'ANKORA';

      if (!targetDev) {
        alert('Lütfen biçimlendirilecek USB sürücüyü seçin.');
        return;
      }

      const confirmMsg = `⚠️ DİKKAT!\n\n${targetDev} üzerindeki tüm veriler silinecek ve sürücü ${fsType.toUpperCase()} olarak biçimlendirilecektir.\n\nEmin misiniz?`;
      if (!confirm(confirmMsg)) return;

      const btnFormat = document.getElementById('btn-format-start');
      if (btnFormat) {
        btnFormat.disabled = true;
        btnFormat.textContent = 'Biçimlendiriliyor...';
      }

      try {
        const msg = await TauriBridge.invoke('format_usb_drive', {
          targetDevice: targetDev,
          target_device: targetDev,
          filesystem: fsType,
          label: label
        });

        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast(msg || 'USB sürücü başarıyla biçimlendirildi!');
        } else {
          alert(msg || 'USB sürücü başarıyla biçimlendirildi!');
        }
      } catch (err) {
        alert('Biçimlendirme başarısız: ' + (err.message || err));
      } finally {
        if (btnFormat) {
          btnFormat.disabled = false;
          btnFormat.textContent = 'Biçimlendir';
        }
        this.refreshTargets();
        this.refreshFormatTargets();
      }
    }
  };

  // ============================================================================
  // SİSTEM KURTARMA NOKTALARI (SNAPSHOT & ROLLBACK)
  // ============================================================================
  const SnapshotManager = {
    init() {
      const btnCreate = document.getElementById('btn-create-snapshot');
      if (btnCreate) {
        btnCreate.addEventListener('click', () => this.createSnapshot());
      }
    },

    async loadSnapshots() {
      const container = document.getElementById('snapshots-list-container');
      if (!container) return;

      container.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px 0;">Kurtarma noktaları yükleniyor...</div>';

      try {
        const snapshots = await TauriBridge.invoke('list_system_snapshots');
        container.innerHTML = '';

        if (!Array.isArray(snapshots) || snapshots.length === 0) {
          container.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:12px;background:rgba(255,255,255,0.02);border-radius:6px;border:1px dashed rgba(255,255,255,0.1);">Henüz bir kurtarma noktası oluşturulmamış. "Nokta Oluştur" butonuna basarak ilk kurtarma noktanızı kaydedebilirsiniz.</div>';
          return;
        }

        snapshots.forEach(s => {
          const card = document.createElement('div');
          card.className = 'snapshot-card';
          const name = s.name || s.id;
          const date = s.date_str || (s.timestamp ? new Date(s.timestamp * 1000).toLocaleString('tr-TR') : 'Bilinmiyor');
          const size = s.size_human || '0 KB';

          card.innerHTML = `
            <div class="snapshot-card-left">
              <div class="snapshot-title">${escapeHtml(name)}</div>
              <div class="snapshot-meta">
                <span>Tarih: ${escapeHtml(date)}</span>
                <span>• Boyut: ${escapeHtml(size)}</span>
                ${s.description ? `<span>• Açıklama: ${escapeHtml(s.description)}</span>` : ''}
              </div>
            </div>
            <div class="snapshot-card-actions">
              <button class="btn-pkg btn-snapshot-restore" data-id="${escapeHtml(s.id)}" style="padding:4px 10px;font-size:11px;cursor:pointer;">Geri Yükle</button>
              <button class="btn-pkg btn-snapshot-del" data-id="${escapeHtml(s.id)}" style="padding:4px 8px;font-size:11px;cursor:pointer;color:#f87171;">✕</button>
            </div>
          `;

          const btnRestore = card.querySelector('.btn-snapshot-restore');
          if (btnRestore) {
            btnRestore.addEventListener('click', () => this.restoreSnapshot(s.id, name));
          }

          const btnDel = card.querySelector('.btn-snapshot-del');
          if (btnDel) {
            btnDel.addEventListener('click', () => this.deleteSnapshot(s.id, name));
          }

          container.appendChild(card);
        });
      } catch (err) {
        container.innerHTML = `<div style="color:#f87171;font-size:12px;">Kurtarma noktaları listelenirken hata oluştu: ${escapeHtml(err.message || String(err))}</div>`;
      }
    },

    async createSnapshot() {
      const defaultName = 'Kurtarma Noktası ' + new Date().toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
      const name = prompt('Kurtarma noktası için bir açıklama girin:', defaultName);
      if (!name) return;

      const btnCreate = document.getElementById('btn-create-snapshot');
      if (btnCreate) {
        btnCreate.disabled = true;
        btnCreate.textContent = 'Oluşturuluyor...';
      }

      try {
        await TauriBridge.invoke('create_system_snapshot', {
          name: name.trim(),
          description: name.trim()
        });
        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast('Kurtarma noktası başarıyla kaydedildi!');
        } else {
          alert('Kurtarma noktası başarıyla kaydedildi!');
        }
        this.loadSnapshots();
      } catch (err) {
        alert('Kurtarma noktası oluşturulamadı: ' + (err.message || err));
      } finally {
        if (btnCreate) {
          btnCreate.disabled = false;
          btnCreate.textContent = '+ Nokta Oluştur';
        }
      }
    },

    async restoreSnapshot(id, name) {
      const confirmMsg = `⚠️ DİKKAT: "${name || id}" kurtarma noktasına dönülecek.\n\nSistem yapılandırması (/etc) ve paket durumları bu anlık kopyaya geri yüklenecektir.\n\nDevam etmek istiyor musunuz?`;
      if (!confirm(confirmMsg)) return;

      try {
        const msg = await TauriBridge.invoke('restore_system_snapshot', {
          snapshotId: id,
          snapshot_id: id
        });
        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast(msg || 'Sistem başarıyla geri yüklendi!');
        } else {
          alert(msg || 'Sistem başarıyla geri yüklendi!');
        }
      } catch (err) {
        alert('Geri yükleme hatası: ' + (err.message || err));
      }
    },

    async deleteSnapshot(id, name) {
      if (!confirm(`"${name || id}" kurtarma noktasını silmek istediğinize emin misiniz?`)) return;

      try {
        await TauriBridge.invoke('delete_system_snapshot', {
          snapshotId: id,
          snapshot_id: id
        });
        this.loadSnapshots();
      } catch (err) {
        alert('Silinemedi: ' + (err.message || err));
      }
    }
  };

  function boot() {
    // Oturum işareti en başta okunur: çökme sayacı ve geri yükleme
    // kararı diğer modüllerden önce belirlenir.
    safeInit('Session', () => SessionManager.begin());

    // 1. Temel pencere yöneticisini ve masaüstü kontrollerini ÖNCELİKLİ ve GARANTİ olarak başlat
    safeInit('WindowManager', () => WindowManager.init());
    safeInit('DesktopControls', () => initDesktopControls());
    safeInit('ThemeManager', () => ThemeManager.init());
    safeInit('PanelPrefs', () => PanelPrefs.load());

    // 2. Diğer sistem uygulamalarını ve arka plan servislerini bağımsız olarak güvenle çalıştır
    safeInit('XdgDesktopEngine', () => XdgDesktopEngine.init());
    safeInit('StoreManager', () => StoreManager.init());
    safeInit('Terminal', () => Terminal.init());
    safeInit('OfficeManager', () => OfficeManager.init());
    safeInit('FileManager', () => FileManager.init());
    safeInit('DesktopFiles', () => {
      DesktopFiles.refresh();
      // Masaüstü dosyaları (indirilenler dahil) en geç 30 sn içinde belirir.
      setInterval(() => {
        if (!document.hidden) DesktopFiles.refresh();
      }, 30000);
    });
    // Faz tahta ve dokunmatik dizüstü: parmak hedefleri + uzun-basım sağ tık.
    safeInit('Touch', () => {
      TouchHelpers.markTouchCapable();
      TouchHelpers.initLongPress();
    });
    safeInit('AIAgent', () => {
      AIAgent.init();
      LinksManager.init();
      LinksManager.cleanupSecrets();
    });
    safeInit('WelcomeManager', () => WelcomeManager.init());
    safeInit('InstallerWizard', () => InstallerWizard.init());
    safeInit('SettingsManager', () => SettingsManager.init());
    safeInit('UpdaterManager', () => UpdaterManager.init());
    safeInit('TaskManager', () => TaskManager.init());
    safeInit('NotepadManager', () => NotepadManager.init());
    safeInit('CalcManager', () => CalcManager.init());
    safeInit('BrowserManager', () => BrowserManager.init());
    safeInit('WidgetManager', () => WidgetManager.init());
    safeInit('MemoryManager', () => MemoryManager.init());
    safeInit('Radio', () => RadioManager.init());
    safeInit('ReportManager', () => ReportManager.init());
    safeInit('LockManager', () => LockManager.init());
    safeInit('ScreenshotManager', () => ScreenshotManager.init());
    safeInit('PowerManager', () => PowerManager.init());
    safeInit('ClipboardManager', () => ClipboardManager.init());
    safeInit('UsbDriveWatcher', () => UsbDriveWatcher.init());
    safeInit('ShortcutManager', () => ShortcutManager.init());
    safeInit('NotificationManager', () => NotificationManager.init());
    safeInit('AudioDeviceManager', () => AudioDeviceManager.init());
    safeInit('BluetoothManager', () => BluetoothManager.init());
    safeInit('SpotlightManager', () => SpotlightManager.init());
    safeInit('MprisManager', () => MprisManager.init());
    safeInit('SystrayManager', () => SystrayManager.init());
    safeInit('FlasherManager', () => FlasherManager.init());
    safeInit('SnapshotManager', () => SnapshotManager.init());
    safeInit('MenuEditor', () => MenuEditor.init());
    safeInit('UsersManager', () => UsersManager.init());
    safeInit('DynamicIsland', () => DynamicIsland.init());

    // 3. Kayıtlı oturum geri yüklenir; çökme sayacı eşiği aşıldıysa
    // SessionManager.restore bunu kendi içinde değerlendirir.
    safeInit('SessionRestore', () => SessionManager.restore());

    // Açılışta kilit: yalnız PIN gerçekten ayarlıysa. İlk açılışta PIN yoksa
    // kullanıcıyı kilitleyip Hoş Geldiniz penceresini zorla açmayız.
    safeInit('StartupLock', () => {
      if (SafeStorage.getItem('ankora_lock_on_startup') === '0') return;
      setTimeout(async () => {
        if (typeof LockManager === 'undefined' || !LockManager.overlay) return;
        if (LockManager.isLocked || LockManager.overlay.classList.contains('show')) return;
        let configured = false;
        try {
          configured = await TauriBridge.invoke('is_lock_configured');
        } catch (e) {
          return;
        }
        if (configured) LockManager.lock();
      }, 1200);
    });

    // Ayaz DE modüllerini pencere nesnesine bağla (test, otomasyon ve dış kontrol)
    window.AyazDE = {
      WindowManager,
      ThemeManager,
      ShortcutManager,
      NotificationManager,
      AudioDeviceManager,
      BluetoothManager,
      SpotlightManager,
      ScreenshotManager,
      PowerManager,
      ReportManager,
      InstallerWizard,
      UpdaterManager,
      TaskManager,
      AIAgent,
      Terminal,
      ClipboardManager,
      UsbDriveWatcher,
      MprisManager,
      SystrayManager,
      FlasherManager,
      SnapshotManager,
      DynamicIsland
    };
    window.DynamicIsland = DynamicIsland;
    window.WindowManager = WindowManager;
    window.ThemeManager = ThemeManager;
    window.ShortcutManager = ShortcutManager;
    window.NotificationManager = NotificationManager;
    window.AudioDeviceManager = AudioDeviceManager;
    window.BluetoothManager = BluetoothManager;
    window.SpotlightManager = SpotlightManager;
    window.ScreenshotManager = ScreenshotManager;
    window.PowerManager = PowerManager;
    window.ClipboardManager = ClipboardManager;
    window.UsbDriveWatcher = UsbDriveWatcher;
    window.MprisManager = MprisManager;
    window.SystrayManager = SystrayManager;
    window.FlasherManager = FlasherManager;
    window.SnapshotManager = SnapshotManager;
    window.MenuEditor = MenuEditor;
    window.UsersManager = UsersManager;
    window.XdgDesktopEngine = XdgDesktopEngine;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();


// Ayaz DE Modülü: desktop.js
// Görev çubuğu sabitlemeleri, XDG .desktop motoru, panel tercihleri ve masaüstü dosyaları
(() => {
  'use strict';

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

    // Pin kaydı yalnız kimlik taşısaydı yeniden çizimde uygulamanın simgesi
    // kayboluyor, panelde genel "bilinmeyen uygulama" glifi kalıyordu.
    resolveApp(app) {
      const list = (typeof XdgDesktopEngine !== 'undefined' && Array.isArray(XdgDesktopEngine.installedApps))
        ? XdgDesktopEngine.installedApps
        : [];
      const base = list.find(a => a && a.id === (app && app.id)) || {};
      const out = Object.assign({}, base, app || {});
      ['name', 'exec', 'icon', 'cat', 'deb', 'flatpak', 'desktopFile'].forEach(key => {
        if (!out[key] && base[key]) out[key] = base[key];
      });
      return out;
    },

    toggleTaskbarPin(app) {
      if (!app || !app.id) return;
      const pinned = this.isPinnedTaskbar(app.id);
      if (pinned) {
        this.write(this.TASKBAR_KEY, this.read(this.TASKBAR_KEY).filter(p => p.id !== app.id));
        ReportManager?.showToast('Panel simgesi kaldırıldı.');
      } else {
        const full = this.resolveApp(app);
        const pins = this.read(this.TASKBAR_KEY);
        pins.push({
          id: full.id,
          name: full.name || full.id,
          exec: full.exec || full.id,
          icon: full.icon || '',
          cat: full.cat || '',
          deb: full.deb || '',
          flatpak: full.flatpak || ''
        });
        this.write(this.TASKBAR_KEY, pins.slice(-8)); // panelde en fazla 8 özel simge
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
      section.replaceChildren();
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
        const pinBox = card.querySelector('.pinned-icon-box');
        if (pinBox) this.tagIcon?.(pinBox, app) || (window.IconResolver && window.IconResolver.tagIcon(pinBox, app));
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
      if (window.IconResolver) window.IconResolver.upgradeScope(section);
      if (window.StartMenuManager) window.StartMenuManager.refresh();
    },

    // Görev çubuğuna özel sabitlenen simgeler (statik pin'lerin önüne eklenir).
    renderTaskbarPins() {
      const host = document.querySelector('.taskbar-quick-pins');
      if (!host) return;
      host.querySelectorAll('.taskbar-dynamic-pin').forEach(el => el.remove());
      const pins = this.read(this.TASKBAR_KEY);
      pins.forEach(pin => {
        const app = this.resolveApp(pin);
        const btn = document.createElement('button');
        btn.className = 'taskbar-pin-btn taskbar-dynamic-pin';
        btn.title = `${pin.name || pin.id}\n\nSağ tık: seçenekler`;
        btn.dataset.pinInternal = pin.id;
        btn.dataset.pinExec = pin.exec || '';
        const placeholder = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="3"></rect><circle cx="12" cy="12" r="3"></circle></svg>';
        const iconSvg = (typeof IconResolver !== 'undefined' && IconResolver.getIconSvg)
          ? IconResolver.getIconSvg(app)
          : placeholder;
        btn.innerHTML = `<span class="taskbar-pin-icon">${iconSvg}</span>`;
        const iconBox = btn.querySelector('.taskbar-pin-icon');
        if (iconBox && typeof IconResolver !== 'undefined' && IconResolver.tagIcon) {
          IconResolver.tagIcon(iconBox, app);
        }
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
      // Paneldeki pin simgeleri de gerçek uygulama ikonuna yükseltilir.
      if (typeof IconResolver !== 'undefined' && IconResolver.upgradeScope) {
        IconResolver.upgradeScope(host);
      }
      try {
        window.dispatchEvent(new CustomEvent('ayaz:tabs-synced'));
      } catch (e) {}
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
          comment: 'Ankora Linux 5.0 Sabit Diske Kurulum Sihirbazı',
          isBuiltin: true,
          is_installed_by_user: true,
          on_desktop: true
        },
        {
          id: 'ayaz-files',
          name: 'Dosyalar',
          exec: 'internal:win-files',
          targetWindow: 'win-files',
          cat: 'util',
          comment: 'Dosya Yöneticisi ve Dizin Gezgini',
          isBuiltin: true,
          is_installed_by_user: true,
          on_desktop: true
        },
        {
          id: 'brave-browser',
          name: 'Brave Web Tarayıcı',
          exec: 'brave-browser',
          targetWindow: null,
          cat: 'net',
          comment: 'Hızlı, Gizlilik Odaklı Güvenli Web Tarayıcısı',
          isBuiltin: true,
          is_installed_by_user: true,
          on_desktop: true
        },
        {
          id: 'ankora-store',
          name: 'Yazılım Mağazası',
          exec: 'internal:win-store',
          targetWindow: 'win-store',
          cat: 'sys',
          comment: 'Paket Yöneticisi ve Uygulama Mağazası',
          isBuiltin: true,
          is_installed_by_user: true,
          on_desktop: true
        },
        {
          id: 'ankora-welcome',
          name: 'Ankora Karşılayıcı',
          exec: 'internal:win-welcome',
          targetWindow: 'win-welcome',
          cat: 'util',
          comment: 'Sisteme Genel Bakış ve Hoş Geldiniz Rehberi',
          isBuiltin: true,
          is_installed_by_user: true,
          on_desktop: false
        },
        {
          id: 'ayaz-term',
          name: 'Ayaz Uçbirim',
          exec: 'internal:win-terminal',
          targetWindow: 'win-terminal',
          cat: 'sys',
          comment: 'Güçlü Linux Uçbirimi ve Komut Satırı',
          isBuiltin: true,
          is_installed_by_user: true,
          on_desktop: false
        },
        {
          id: 'ankora-screenshot',
          name: 'Ekran Görüntüsü',
          exec: 'internal:win-screenshot',
          targetWindow: 'win-screenshot',
          cat: 'util',
          comment: 'Tam ekran, pencere veya serbest alan yakalama aracı',
          isBuiltin: true,
          is_installed_by_user: true,
          on_desktop: false
        },
        {
          id: 'ankora-office',
          name: 'Ankora Ofis',
          exec: 'internal:win-office',
          targetWindow: 'win-office',
          cat: 'office',
          comment: 'Belge Düzenleyici ve Not Defteri',
          isBuiltin: true,
          is_installed_by_user: true,
          on_desktop: false
        },
        {
          id: 'ayaz-widgets',
          name: 'Widget Merkezi',
          exec: 'internal:win-widgets',
          targetWindow: 'win-widgets',
          cat: 'util',
          comment: 'Saat ve sistem bilgisi bileşenlerini masaüstüne yerleştirir',
          isBuiltin: true,
          is_installed_by_user: true,
          on_desktop: false
        },
        {
          id: 'ankora-flasher',
          name: 'USB & ISO Yazıcı',
          exec: 'internal:win-flasher',
          targetWindow: 'win-flasher',
          cat: 'sys',
          comment: 'USB bellek biçimlendirici ve ISO kalıbı yazıcı',
          isBuiltin: true,
          is_installed_by_user: true,
          on_desktop: false
        },
        {
          id: 'fatih-kalem',
          name: 'Fatih Kalem',
          exec: 'fatih-kalem',
          targetWindow: null,
          cat: 'office',
          comment: 'Etkileşimli akıllı tahta ve ekran çizim/not kalemi',
          isBuiltin: true,
          is_installed_by_user: true,
          on_desktop: false
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

      // Masaüstü simge ve klasör kalabalığını temizleme:
      // Yalnızca 4 temel simge (Sistemi Kur, Dosyalar, Brave, Mağaza) ve Çöp Kutusu masaüstünde kalır.
      // Diğer tüm uygulamalar başlat menüsünde ve dock'ta yer alır.
      if (SafeStorage.getItem('ankora_desktop_cleaned_v2') !== 'true') {
        const keepOnDesk = new Set(['ankora-installer', 'ayaz-files', 'brave-browser', 'ankora-store']);
        this.installedApps.forEach(a => {
          if (!keepOnDesk.has(a.id) && a.exec && !a.exec.startsWith('file:')) {
            a.on_desktop = false;
          }
        });
        SafeStorage.setItem('ankora_xdg_apps', JSON.stringify(this.installedApps));
        SafeStorage.setItem('ankora_desktop_cleaned_v2', 'true');
      }

      this.renderToDesktop();
      this.renderToStartMenu();
      AppPinManager.init();

      // Sistem XDG dizinlerini tara. İlk tarama ISO ile gelen sistem
      // uygulamalarını taban listeye yazar; sonraki taramalarda YENİ görünen
      // her kayıt (terminalden kurulan) başlat menüsüne ve masaüstüne eklenir.
      this.rescanXdgApps(true);
      if (!this._scanTimer) {
        this._scanTimer = setInterval(() => {
          if (!document.hidden && !(window.LockManager && window.LockManager.isLocked)) {
            this.rescanXdgApps(false);
          }
        }, 120000);
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
        if (!apps || !Array.isArray(apps) || apps.length === 0) return false;

        const defaultIds = new Set(this.getDefaultApps().map(a => a.id));
        const seen = new Set(this.seenIds());
        const fresh = [];
        let changed = false;

        apps.forEach(app => {
          if (!app || !app.id) return;

          const idx = this.installedApps.findIndex(a =>
            a && (
              a.id === app.id ||
              (a.flatpak && a.flatpak === app.id) ||
              (a.deb && a.deb === app.id) ||
              (a.storeId && a.storeId === app.id)
            )
          );

          if (app.is_installed_by_user) {
            if (idx >= 0) {
              const prev = this.installedApps[idx];
              this.installedApps[idx] = {
                ...prev,
                ...app,
                is_installed_by_user: true,
                on_desktop: prev.on_desktop !== false
              };
            } else {
              this.installedApps.push({ ...app, is_installed_by_user: true, on_desktop: true });
              fresh.push(app);
            }
            changed = true;
            seen.add(app.id);
            return;
          }

          if (idx < 0) {
            // Sistemle gelen veya paket yöneticisinden kurulan XDG uygulaması (PulseAudio, vb.)
            let cat = 'util';
            if (Array.isArray(app.categories)) {
              const cats = app.categories.map(c => String(c).toLowerCase());
              if (cats.some(c => c.includes('audio') || c.includes('video') || c.includes('media'))) cat = 'media';
              else if (cats.some(c => c.includes('system') || c.includes('settings'))) cat = 'sys';
              else if (cats.some(c => c.includes('network') || c.includes('webbrowser'))) cat = 'net';
              else if (cats.some(c => c.includes('development') || c.includes('ide'))) cat = 'dev';
              else if (cats.some(c => c.includes('office') || c.includes('editor'))) cat = 'office';
            }
            // Masaüstünü doldurmamak için on_desktop: false, başlat menüsünde yüklü olarak listelenir
            this.installedApps.push({
              ...app,
              cat: app.cat || cat,
              is_installed_by_user: true,
              on_desktop: false
            });
            changed = true;
            if (!firstScan && !seen.has(app.id)) {
              fresh.push(app);
            }
          }
          seen.add(app.id);
        });

        SafeStorage.setItem('ankora_xdg_seen_ids', JSON.stringify(Array.from(seen)));
        // Sistemdeki gerçek XDG (/usr/share/applications) ile senkronize et:
        // Kaldırılan harici paketleri otomatik temizle (yerleşik iç ve varsayılan uygulamalar korunur).
        const activeIds = new Set(apps.map(a => a && a.id).filter(Boolean));
        const beforeLen = this.installedApps.length;
        this.installedApps = this.installedApps.filter(a => {
          if (!a) return false;
          if (a.targetWindow || (a.exec && String(a.exec).startsWith('internal:'))) return true;
          if (a.isBuiltin || defaultIds.has(a.id)) return true;
          return activeIds.has(a.id)
            || (a.flatpak && activeIds.has(a.flatpak))
            || (a.deb && activeIds.has(a.deb));
        });
        if (this.installedApps.length !== beforeLen) changed = true;

        if (changed) {
          if (typeof LauncherSearch !== 'undefined') LauncherSearch._collected = null;
          SafeStorage.setItem('ankora_xdg_apps', JSON.stringify(this.installedApps));
          this.renderToDesktop();
          this.renderToStartMenu();
          document.dispatchEvent(new CustomEvent('ayaz-apps-changed'));
        }
        if (typeof StoreManager !== 'undefined' && typeof StoreManager.syncWithXdg === 'function') {
          StoreManager.syncWithXdg(apps);
        }
        if (typeof DesktopFiles !== 'undefined' && typeof DesktopFiles.refresh === 'function') {
          DesktopFiles.refresh();
        }
        fresh.forEach(app => {
          Terminal.log(`[XDG] '${app.name}' bulundu; başlat menüsüne ve masaüstüne eklendi.`, 'success');
          if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
            ReportManager.showToast(`Yeni uygulama: ${app.name}`);
          }
        });
        return true;
      } catch (err) {
        return false;
      }
    },

    addApplication(app) {
      if (!app || !app.id) return;
      app.is_installed_by_user = true;
      if (app.on_desktop === undefined) app.on_desktop = true;
      const existingIdx = this.installedApps.findIndex(a =>
        a && (
          a.id === app.id ||
          (app.flatpak && a.flatpak === app.flatpak) ||
          (app.storeId && a.storeId === app.storeId)
        )
      );
      if (existingIdx >= 0) {
        this.installedApps[existingIdx] = { ...this.installedApps[existingIdx], ...app };
      } else {
        this.installedApps.push(app);
      }
      // Sonradan silinip terminalden yeniden kurulduğunda "yeni" sayılması
      // için bilinen uygulamalar listesine de yazılır.
      this.markSeen(app.id);
      if (typeof LauncherSearch !== 'undefined') LauncherSearch._collected = null;

      SafeStorage.setItem('ankora_xdg_apps', JSON.stringify(this.installedApps));
      this.renderToDesktop();
      this.renderToStartMenu();
      document.dispatchEvent(new CustomEvent('ayaz-apps-changed'));
    },

    removeApplication(appId, debName = null, flatpakId = null) {
      const matchesTarget = (a) => {
        if (!a || a.isBuiltin) return false;
        if (a.id === appId || a.storeId === appId) return true;
        if (debName && (a.deb === debName || a.id === debName || a.exec === debName)) return true;
        if (flatpakId && (a.flatpak === flatpakId || a.id === flatpakId || (a.exec && String(a.exec).includes(flatpakId)))) return true;
        return false;
      };
      const removedIds = this.installedApps.filter(matchesTarget).map(a => a.id);
      const dropIds = new Set([appId, ...removedIds].concat(debName ? [debName] : []).concat(flatpakId ? [flatpakId] : []));
      this.installedApps = this.installedApps.filter(a => !matchesTarget(a));
      dropIds.forEach(id => this.removeAppFromAllGroups(id));
      this.closeGroup();
      // Kayıt bilinenler listesinden de düşer: uygulama sonradan geri
      // kurulursa tarama onu yeniden bulur ve masaüstüne ekler.
      const seen = this.seenIds().filter(id => !dropIds.has(id));
      SafeStorage.setItem('ankora_xdg_seen_ids', JSON.stringify(seen));
      SafeStorage.setItem('ankora_xdg_apps', JSON.stringify(this.installedApps));
      if (typeof LauncherSearch !== 'undefined') LauncherSearch._collected = null;
      this.renderToDesktop();
      this.renderToStartMenu();
      document.dispatchEvent(new CustomEvent('ayaz-apps-changed'));
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
      const picker = document.getElementById('desktop-folder-picker');
      const btnAddApp = document.getElementById('desktop-folder-add-app');
      const btnRename = document.getElementById('desktop-folder-rename');
      if (!group || !overlay || !grid || !title) return;
      const apps = this.groupApps(group);
      this._groupReturnFocus = document.activeElement;
      this._openGroupId = groupId;
      title.textContent = group.name;
      if (count) count.textContent = apps.length ? `${apps.length} uygulama` : 'Henüz uygulama yok';
      if (picker) {
        picker.hidden = true;
        picker.style.display = 'none';
        picker.replaceChildren();
      }
      if (btnRename) {
        btnRename.onclick = () => {
          const next = prompt('Kategori adı:', group.name);
          if (next && next.trim()) {
            this.renameGroup(group.id, next);
            this.openGroup(group.id);
          }
        };
      }
      if (btnAddApp && picker) {
        btnAddApp.onclick = () => {
          const opening = picker.hidden;
          picker.replaceChildren();
          if (!opening) {
            picker.hidden = true;
            picker.style.display = 'none';
            return;
          }
          const inGroup = new Set(group.items);
          const candidates = (this.installedApps || []).filter(a => a && a.id && !inGroup.has(a.id));
          if (!candidates.length) {
            const note = document.createElement('span');
            note.style.cssText = 'font-size:12px;color:var(--text-muted,#9aa3b2);';
            note.textContent = 'Eklenebilecek başka uygulama bulunamadı.';
            picker.appendChild(note);
          } else {
            candidates.slice(0, 36).forEach(cand => {
              const chip = document.createElement('button');
              chip.type = 'button';
              chip.className = 'btn-pkg-sm';
              chip.textContent = `+ ${cand.name}`;
              chip.addEventListener('click', () => {
                this.moveAppToGroup(cand.id, group.id);
                this.openGroup(group.id);
              });
              picker.appendChild(chip);
            });
          }
          picker.hidden = false;
          picker.style.display = 'flex';
        };
      }
      grid.textContent = '';

      if (!apps.length) {
        const empty = document.createElement('div');
        empty.className = 'folder-empty';
        empty.textContent = 'Yukarıdan "+ Uygulama Ekle" düğmesine tıklayın veya masaüstü simgelerini bu kategorinin üzerine sürükleyin.';
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
      container.replaceChildren();
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

        // Farede tek tık seçer (Windows standardı), çift tık açar; dokunmatik ekranda tek dokunuş açar.
        let _downX = 0, _downY = 0, _downPointer = 'mouse';
        item.addEventListener('pointerdown', (e) => {
          _downX = e.clientX;
          _downY = e.clientY;
          _downPointer = e.pointerType || 'mouse';
        }, { passive: true });

        item.addEventListener('click', (e) => {
          e.stopPropagation();
          if (e.ctrlKey || e.metaKey) {
            item.classList.toggle('selected');
            return;
          }
          document.querySelectorAll('.desktop-item').forEach(el => el.classList.remove('selected'));
          item.classList.add('selected');
          if (e.button !== 0 || e.shiftKey) return;
          if (_downPointer !== 'touch' && !document.body.classList.contains('has-touch')) return;
          if (Math.hypot(e.clientX - _downX, e.clientY - _downY) > 8) return;
          const now = Date.now();
          if (item._lastLaunchAt && now - item._lastLaunchAt < 650) return;
          item._lastLaunchAt = now;
          this.launchApp(app);
        });

        // Çift tık: Akıllı Başlatma (debounced; tek tık zaten başlattıysa tekrar etmez)
        item.addEventListener('dblclick', async (e) => {
          e.stopPropagation();
          const now = Date.now();
          if (item._lastLaunchAt && now - item._lastLaunchAt < 650) return;
          item._lastLaunchAt = now;
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
      const rect = (container && typeof container.getBoundingClientRect === 'function')
        ? container.getBoundingClientRect()
        : null;
      const topOffset = (rect && Number.isFinite(rect.top) && rect.top >= 0) ? rect.top : 48;
      const leftOffset = (rect && Number.isFinite(rect.left) && rect.left >= 0) ? rect.left : 24;
      const viewportW = Math.max(320, (window.innerWidth || 1280) - leftOffset - 24);
      const viewportH = Math.max(120, (window.innerHeight || 720) - topOffset - 78);
      const w = (container && container.clientWidth > 0)
        ? Math.min(container.clientWidth, viewportW)
        : viewportW;
      const h = (container && container.clientHeight > 0)
        ? Math.min(container.clientHeight, viewportH)
        : viewportH;
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
        if (p && p.c >= 0 && p.c < cols && p.r >= 0 && p.r < rows && !used.has(`${p.c},${p.r}`)) {
          used.add(`${p.c},${p.r}`);
          placed.set(el, p);
        }
      });
      // Konumu olmayanlar veya ekran/yüz sınırını aşanlar sütun sütun ilk boş hücreye dizilir.
      let c = 0, r = 0;
      items.forEach(el => {
        if (placed.has(el)) return;
        while (used.has(`${c},${r}`) && c < cols) {
          r++;
          if (r >= rows) { r = 0; c++; }
        }
        const safeC = Math.min(c, Math.max(0, cols - 1));
        const safeR = Math.min(r, Math.max(0, rows - 1));
        const p = { c: safeC, r: safeR };
        used.add(`${p.c},${p.r}`);
        placed.set(el, p);
        r++;
        if (r >= rows) { r = 0; c++; }
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
          // Gerçek dosya/klasör simgesi başka bir gerçek masaüstü klasörünün üzerine bırakıldıysa taşınır.
          if (appId.startsWith('file:') && el.dataset.filePath) {
            const destFolder = Array.from(container.querySelectorAll('.desktop-item.file-item[data-is-dir="1"]')).find(item => {
              if (item === el) return false;
              const rect = item.getBoundingClientRect();
              return ev.clientX >= rect.left && ev.clientX <= rect.right
                && ev.clientY >= rect.top && ev.clientY <= rect.bottom;
            });
            if (destFolder && destFolder.dataset.filePath && typeof FileManager !== 'undefined' && FileManager.moveItem) {
              FileManager.moveItem(el.dataset.filePath, destFolder.dataset.filePath)
                .then(() => { if (typeof DesktopFiles !== 'undefined') DesktopFiles.refresh(); });
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

      container.replaceChildren();
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
      if (window.StartMenuManager) window.StartMenuManager.refresh();
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
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><polygon points="10.2 10.2 15.5 8.5 13.8 13.8 8.5 15.5 10.2 10.2"></polygon></svg>`;
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
      if (id === 'settings' || id === 'ayaz-settings' || id.includes('setting')) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M4 12h16M4 17h16"></path><circle cx="14.5" cy="7" r="2"></circle><circle cx="8" cy="12" r="2"></circle><circle cx="16" cy="17" r="2"></circle></svg>`;
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
          WindowManager.ensureDesktopLayer(false);
          await TauriBridge.invoke('launch_application', { exec: 'brave-browser' });
          setTimeout(() => WindowManager.refreshNativeWindows(true), 600);
          setTimeout(() => WindowManager.refreshNativeWindows(true), 1800);
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
        'htop', 'btop', 'top', 'neovim', 'nvim', 'vim', 'vi', 'nano', 'tmux', 'screen',
        'ranger', 'mc', 'midnight-commander', 'bat', 'fzf', 'tree', 'jq', 'zsh', 'fish',
        'strace', 'ltrace', 'shellcheck', 'ripgrep', 'rg', 'rsync', 'fd-find', 'cloc',
        'fd', 'gdb', 'valgrind', 'emacs-nox', 'python3', 'python3-pip', 'npm',
        'cargo', 'rustc', 'golang', 'ninja-build', 'cmake', 'sqlite3', 'sox', 'ffmpeg', 'git',
        'neofetch', 'screenfetch', 'inxi', 'lshw', 'ncdu', 'iotop', 'iftop', 'wavemon',
        'cpupower', 'speedtest-cli', 'hexedit', 'dhex', 'mutt', 'irssi', 'lftp',
        'chkrootkit', 'rkhunter', 'powertop', 'lsscsi', 'dmidecode', 'ethtool', 'hdparm'
      ];
      const execParts = String(app.exec || app.id || '').trim().split(/\s+/);
      const execBase = (execParts[0] || '').split('/').pop().toLowerCase();
      const isCli = cliTools.includes(execBase) || cliTools.includes(String(app.id || '').toLowerCase());

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
          WindowManager.ensureDesktopLayer(false);
          await TauriBridge.invoke('launch_application', { exec: app.exec });
          setTimeout(() => WindowManager.refreshNativeWindows(true), 600);
          setTimeout(() => WindowManager.refreshNativeWindows(true), 1800);
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
        <div class="ctx-item" data-action="run-program">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>
          <span>Program olarak çalıştır</span>
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
          <span>${(app._pinned || (typeof AppPinManager !== 'undefined' && AppPinManager.isPinnedMenu(app.id))) ? 'Sabitlemeden Kaldır' : 'Başlat Menüsüne Sabitle'}</span>
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
          if (act === 'launch' || act === 'run-program') {
            if (act === 'run-program' && app.desktopFile && String(app.desktopFile).endsWith('.desktop') && !app.targetWindow) {
              const rawExec = String(app.exec || app.id || '').trim();
              TauriBridge.invoke('launch_application', { exec: rawExec }).catch(() => this.launchApp(app));
            } else {
              this.launchApp(app);
            }
          } else if (act === 'term') {
            WindowManager.open('win-terminal');
            Terminal.runCommand(app.exec || app.id);
          } else if (act === 'store') {
            WindowManager.open('win-store');
            const matchedPkg = (typeof StoreManager !== 'undefined' && StoreManager.findPackageForApp)
              ? StoreManager.findPackageForApp(app.id, app)
              : null;
            if (matchedPkg && typeof StoreManager.openDetail === 'function') {
              StoreManager.openDetail(matchedPkg);
            } else {
              const searchInput = document.getElementById('store-search');
              if (searchInput) {
                const q = app.storeId || app.deb || app.flatpak || app.name || app.id;
                searchInput.value = q;
                if (typeof StoreManager !== 'undefined') StoreManager.render(q);
              }
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
            StoreManager.uninstallPackageById(app.id, app);
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
      try {
        const raw = localStorage.getItem(this.KEY);
        if (raw) {
          Object.assign(this.state, JSON.parse(raw));
        } else {
          const legacyH = parseInt(SafeStorage.getItem('ankora_taskbar_height'), 10);
          if (legacyH >= 32 && legacyH <= 60) this.state.height = legacyH;
        }
      } catch (e) {}
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
      const dockH = Math.round(h * 1.36);
      const dockBtn = Math.max(32, dockH - 14);
      const dockIcon = Math.max(24, dockH - 20);
      const tbIcon = Math.min(36, Math.max(20, h - 16));
      const rootStyle = document.documentElement.style;
      rootStyle.setProperty('--taskbar-height', `${h}px`);
      rootStyle.setProperty('--dock-height', `${dockH}px`);
      rootStyle.setProperty('--dock-btn-size', `${dockBtn}px`);
      rootStyle.setProperty('--dock-icon-size', `${dockIcon}px`);
      rootStyle.setProperty('--taskbar-icon-size', `${tbIcon}px`);
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
        rng.addEventListener('input', () => {
          const liveH = Math.min(60, Math.max(32, parseInt(rng.value, 10) || 44));
          if (val) val.textContent = `${liveH} px`;
          if (typeof ThemeManager !== 'undefined' && ThemeManager.setTaskbarHeight) {
            ThemeManager.setTaskbarHeight(`${liveH}px`, false);
          }
        });
        rng.addEventListener('change', () => {
          const finalH = Math.min(60, Math.max(32, parseInt(rng.value, 10) || 44));
          PanelPrefs.save({ height: finalH });
          if (typeof ThemeManager !== 'undefined' && ThemeManager.setTaskbarHeight) {
            ThemeManager.setTaskbarHeight(`${finalH}px`, true);
          }
        });
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
        const xdgDesktopStems = new Set();
        if (typeof XdgDesktopEngine !== 'undefined' && Array.isArray(XdgDesktopEngine.installedApps)) {
          XdgDesktopEngine.installedApps.forEach(a => {
            if (!a || a.on_desktop === false) return;
            if (a.id) xdgDesktopStems.add(String(a.id).toLowerCase());
            if (a.flatpak) xdgDesktopStems.add(String(a.flatpak).toLowerCase());
            if (a.deb) xdgDesktopStems.add(String(a.deb).toLowerCase());
            if (a.desktopFile) {
              const base = String(a.desktopFile).split('/').pop().replace(/\.desktop$/i, '').toLowerCase();
              if (base) xdgDesktopStems.add(base);
            }
          });
        }
        const items = (res && res.items ? res.items : []).filter(it => {
          const name = String((it && it.name) || '').trim();
          // "." / ".." ve gizli dosyalar masaüstünde simge olarak görünmesin.
          if (!name || name === '.' || name === '..' || name.startsWith('.')) return false;
          if (name.toLowerCase().endsWith('.desktop')) {
            const stem = name.slice(0, -8).toLowerCase();
            if (xdgDesktopStems.has(stem)) return false;
          }
          return !it.is_hidden;
        });
        if (!items.length) return;
        const frag = document.createDocumentFragment();
        items.forEach(it => {
          const el = document.createElement('div');
          el.className = 'desktop-item file-item cat-util';
          el.tabIndex = 0;
          el.setAttribute('role', 'button');
          el.setAttribute('data-app-id', `file:${it.path}`);
          el.dataset.filePath = it.path;
          el.dataset.fileName = it.name;
          el.dataset.isDir = it.is_dir ? '1' : '0';
          el.title = `${it.name}\n• Çift tıkla aç`;
          const glyph = this.fileGlyph(it.name, it.is_dir);
          el.innerHTML = `
            <div class="item-icon">
              <svg class="glyph" aria-hidden="true"><use href="#${glyph}"></use></svg>
            </div>
            <span class="item-name">${escapeHtml(it.name)}</span>
          `;
          let _fDownX = 0, _fDownY = 0, _fDownPtr = 'mouse';
          el.addEventListener('pointerdown', (e) => {
            _fDownX = e.clientX;
            _fDownY = e.clientY;
            _fDownPtr = e.pointerType || 'mouse';
          }, { passive: true });
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.ctrlKey || e.metaKey) {
              el.classList.toggle('selected');
              return;
            }
            document.querySelectorAll('.desktop-item').forEach(x => x.classList.remove('selected'));
            el.classList.add('selected');
            if (e.button !== 0 || e.shiftKey) return;
            if (_fDownPtr !== 'touch' && !document.body.classList.contains('has-touch')) return;
            if (Math.hypot(e.clientX - _fDownX, e.clientY - _fDownY) > 8) return;
            const now = Date.now();
            if (el._lastOpenAt && now - el._lastOpenAt < 650) return;
            el._lastOpenAt = now;
            this.openItem(it);
          });
          el.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            const now = Date.now();
            if (el._lastOpenAt && now - el._lastOpenAt < 650) return;
            el._lastOpenAt = now;
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
      el.setAttribute('data-app-id', 'sys:trash');
      el.title = 'Çöp Kutusu\n• Çift tıkla aç';
      el.innerHTML = `
        <div class="item-icon">
          <img class="real-app-icon" src="icons/linux/trash.svg" alt="" draggable="false">
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
          const ext = (it.name || it.path || '').split('.').pop()?.toLowerCase();
          if (ext === 'desktop') {
            await TauriBridge.invoke('execute_desktop_program', { path: it.path });
            return;
          }
          if (ext === 'deb' || ext === 'appimage') {
            if (typeof PackageInstallerManager !== 'undefined') {
              PackageInstallerManager.open(it.path);
              return;
            }
          }
          if ((ext === 'exe' || ext === 'msi') && typeof FileManager !== 'undefined' && FileManager.promptWindowsExecutable) {
            await FileManager.promptWindowsExecutable(it);
            return;
          }
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
          <div class="ctx-item" data-act="run-program">
            <span>Program olarak çalıştır</span>
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
          } else if (act === 'run-program') {
            TauriBridge.invoke('execute_desktop_program', { path: target.path })
              .then((msg) => ReportManager?.showToast(msg || 'Program olarak çalıştırıldı.'))
              .catch((err) => ReportManager?.showToast(`Çalıştırılamadı: ${err.message || err}`, 'error'));
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

  Object.assign(window, { AppPinManager, XdgDesktopEngine, PanelPrefs, PanelSettings, DesktopFiles });
})();

// Ayaz DE Modülü: shell-ui.js
// Başlat Menüsü, başlatıcı araması, masaüstü denetimleri, Menü Düzenleyici ve Kullanıcılar
(() => {
  'use strict';

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

  // Klasik İki Sütunlu Dağıtım Uygulama Menüsü Yöneticisi (Kategori Filtresi)
  const START_MENU_CAT_LABELS = {
    favorites: 'Sık Kullanılanlar',
    all: 'Tüm Uygulamalar',
    internet: 'İnternet & Ağ',
    office: 'Ofis & Belgeler',
    media: 'Çoklu Ortam & Grafik',
    dev: 'Geliştirme & Terminal',
    games: 'Oyun',
    system: 'Sistem Araçları',
    settings: 'Ayarlar & Tercihler'
  };

  const StartMenuManager = {
    activeCat: 'favorites',
    initialized: false,

    resolveDynamicCat(card) {
      const appId = card.getAttribute('data-app-id') || '';
      const appObj = (typeof XdgDesktopEngine !== 'undefined' && Array.isArray(XdgDesktopEngine.installedApps))
        ? XdgDesktopEngine.installedApps.find(a => a.id === appId)
        : null;
      const rawCat = String((appObj && appObj.cat) || '').toLowerCase();
      const rawCats = Array.isArray(appObj && appObj.categories)
        ? appObj.categories.map(c => String(c).toLowerCase()).join(' ')
        : '';
      const hay = `${appId.toLowerCase()} ${rawCat} ${rawCats} ${card.className.toLowerCase()}`;

      if (hay.includes('game') || hay.includes('steam') || hay.includes('heroic') || hay.includes('lutris') || hay.includes('wine') || hay.includes('proton') || hay.includes('supertux') || hay.includes('minetest')) return 'games';
      if (rawCat === 'net' || hay.includes('network') || hay.includes('webbrowser') || hay.includes('firefox') || hay.includes('chromium') || hay.includes('telegram') || hay.includes('discord') || hay.includes('zoom') || hay.includes('thunderbird')) return 'internet';
      if (rawCat === 'dev' || hay.includes('development') || hay.includes('ide') || hay.includes('vscode') || hay.includes('vscodium')) return 'dev';
      if (rawCat === 'office' || hay.includes('office') || hay.includes('onlyoffice') || hay.includes('libreoffice') || hay.includes('obsidian')) return 'office';
      if (rawCat === 'media' || rawCat === 'graphics' || hay.includes('audio') || hay.includes('video') || hay.includes('graphics') || hay.includes('vlc') || hay.includes('mpv') || hay.includes('spotify') || hay.includes('gimp') || hay.includes('inkscape') || hay.includes('kdenlive') || hay.includes('obs')) return 'media';
      if (hay.includes('settings') || hay.includes('preferences') || hay.includes('controlcenter')) return 'settings';
      return 'system';
    },

    matchesStaticCat(card, cat, hiddenSet) {
      const key = card.getAttribute('data-open') || card.getAttribute('data-launch') || (card.querySelector('.app-title')?.textContent || '').trim();
      const isHiddenFav = hiddenSet.has(key);
      if (cat === 'all') return true;
      const cats = (card.getAttribute('data-cats') || '').split(/\s+/).filter(Boolean);
      if (cat === 'favorites') return !isHiddenFav && cats.includes('favorites');
      return cats.includes(cat);
    },

    selectCategory(cat) {
      this.activeCat = START_MENU_CAT_LABELS[cat] ? cat : 'favorites';
      document.querySelectorAll('#start-cat-sidebar .start-cat-btn').forEach(btn => {
        const isSel = btn.getAttribute('data-cat') === this.activeCat;
        btn.classList.toggle('active', isSel);
        btn.setAttribute('aria-selected', isSel ? 'true' : 'false');
      });
      this.refresh();
    },

    refresh() {
      const staticGrid = document.getElementById('start-pinned-grid');
      if (!staticGrid) return;

      let hiddenList = [];
      try {
        hiddenList = JSON.parse(SafeStorage.getItem('ankora_hidden_static_pins') || '[]');
        if (!Array.isArray(hiddenList)) hiddenList = [];
      } catch (e) {
        hiddenList = [];
      }
      const hiddenSet = new Set(hiddenList);

      const staticCards = Array.from(staticGrid.querySelectorAll(':scope > .pinned-app-card'));
      const dynGrid = document.getElementById('dynamic-start-apps');
      const dynHeading = document.getElementById('start-installed-heading');
      const dynCountEl = document.getElementById('start-installed-count');
      const dynCards = dynGrid ? Array.from(dynGrid.querySelectorAll(':scope > .pinned-app-card')) : [];
      const userPinSection = document.getElementById('ankora-menu-pins');

      // Sol kenar çubuğu kategori sayaçlarını güncelle
      const counts = {
        favorites: userPinSection ? userPinSection.querySelectorAll('.pinned-app-card').length : 0,
        all: staticCards.length + dynCards.length,
        internet: 0, office: 0, media: 0, dev: 0, games: 0, system: 0, settings: 0
      };
      staticCards.forEach(card => {
        const cats = (card.getAttribute('data-cats') || '').split(/\s+/).filter(Boolean);
        const key = card.getAttribute('data-open') || card.getAttribute('data-launch') || (card.querySelector('.app-title')?.textContent || '').trim();
        if (cats.includes('favorites') && !hiddenSet.has(key)) counts.favorites++;
        Object.keys(counts).forEach(k => {
          if (k !== 'favorites' && k !== 'all' && cats.includes(k)) counts[k]++;
        });
      });
      dynCards.forEach(card => {
        const mapped = this.resolveDynamicCat(card);
        card.dataset.menuCat = mapped;
        if (counts[mapped] !== undefined) counts[mapped]++;
      });
      Object.entries(counts).forEach(([k, v]) => {
        const badge = document.querySelector(`.cat-count[data-cat-count="${k}"]`);
        if (badge) badge.textContent = v > 0 ? String(v) : '';
      });

      const cat = this.activeCat || 'favorites';
      let visibleCount = 0;

      if (userPinSection) {
        const pinCount = userPinSection.querySelectorAll('.pinned-app-card').length;
        const showPins = cat === 'favorites' && pinCount > 0;
        userPinSection.style.display = showPins ? 'grid' : 'none';
        if (showPins) visibleCount += pinCount;
      }

      let visibleStatic = 0;
      staticCards.forEach(card => {
        const show = this.matchesStaticCat(card, cat, hiddenSet);
        card.style.display = show ? 'flex' : 'none';
        if (show) { visibleStatic++; visibleCount++; }
      });
      staticGrid.style.display = visibleStatic > 0 ? 'grid' : 'none';

      let visibleDyn = 0;
      dynCards.forEach(card => {
        const mapped = card.dataset.menuCat || this.resolveDynamicCat(card);
        const show = cat === 'all' || (cat !== 'favorites' && mapped === cat);
        card.style.display = show ? 'flex' : 'none';
        if (show) { visibleDyn++; visibleCount++; }
      });

      if (dynGrid) {
        dynGrid.style.display = visibleDyn > 0 ? 'grid' : 'none';
      }
      if (dynHeading) {
        dynHeading.style.display = visibleDyn > 0 ? 'flex' : 'none';
      }
      if (dynCountEl) {
        dynCountEl.textContent = `${visibleDyn} Uygulama`;
      }

      const emptyBox = document.getElementById('start-empty-cat');
      if (emptyBox) {
        emptyBox.hidden = visibleCount > 0;
      }

      const titleEl = document.getElementById('start-active-cat-title');
      const countEl = document.getElementById('start-active-cat-count');
      const allBtn = document.getElementById('btn-show-all-apps');
      if (titleEl) titleEl.textContent = START_MENU_CAT_LABELS[cat] || 'Uygulamalar';
      if (countEl) countEl.textContent = `${visibleCount} Uygulama`;
      if (allBtn) allBtn.textContent = cat === 'all' ? 'Sık Kullanılanlar' : 'Tümü >';
    },

    init() {
      if (this.initialized) {
        this.refresh();
        return;
      }
      this.initialized = true;
      const sidebar = document.getElementById('start-cat-sidebar');
      if (sidebar) {
        sidebar.querySelectorAll('.start-cat-btn[data-cat]').forEach(btn => {
          btn.addEventListener('click', () => {
            this.selectCategory(btn.getAttribute('data-cat'));
          });
        });
      }
      this.refresh();
    }
  };
  window.StartMenuManager = StartMenuManager;

  // Arama kutusu doluken menünün kendi bölümleri gizlenir ve tek sonuç listesi
  // açılır. Profil ile güç eylemleri her durumda erişilebilir kalır.
  const LauncherSearch = {
    sectionSel: '.start-distro-body',
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

      // Sabit kartlar pencere kimliği, harici başlatıcı veya kurulu uygulama
      // kimliği taşır; XDG ve harici başlatıcılar doğrudan açılır.
      const seenAppTitles = new Set();
      document.querySelectorAll('.pinned-app-card').forEach(card => {
        const target = card.getAttribute('data-open');
        const launch = card.getAttribute('data-launch');
        const appId = card.getAttribute('data-app-id');
        const title = card.querySelector('.app-title')?.textContent || card.textContent;
        const normTitle = launcherNorm(title);
        if (normTitle) seenAppTitles.add(normTitle);
        push(title, card.querySelector('.app-desc')?.textContent, 'Uygulama', () => {
          const app = appId ? XdgDesktopEngine.installedApps.find(a => a.id === appId) : null;
          if (app) XdgDesktopEngine.launchApp(app);
          else if (launch) TauriBridge.invoke('launch_application', { exec: launch }).catch(() => {});
          else if (target) WindowManager.open(target);
        });
      });

      if (typeof XdgDesktopEngine !== 'undefined' && Array.isArray(XdgDesktopEngine.installedApps)) {
        XdgDesktopEngine.installedApps.forEach(app => {
          if (!app || app.is_menu_hidden) return;
          const normTitle = launcherNorm(app.name || app.id || '');
          if (!normTitle || seenAppTitles.has(normTitle)) return;
          seenAppTitles.add(normTitle);
          push(app.name || app.id, app.comment || app.exec || 'Uygulama', 'Uygulama', () => {
            XdgDesktopEngine.launchApp(app);
          });
        });
      }

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
          <span class="result-glyph">${escapeHtml(it.title.trim().charAt(0).toLocaleUpperCase('tr'))}</span>
          <span class="result-text">
            <span class="result-title">${escapeHtml(it.title)}</span>
            <span class="result-desc">${escapeHtml(it.desc || '')}</span>
          </span>
          <span class="result-kind">${escapeHtml(it.kind || '')}</span>
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
      document.querySelectorAll('.bostan-start-btn, .bakir-start-btn, .civata-btn-apps').forEach(btn => {
        btn.classList.toggle('active', isOpen);
      });
      try {
        if (typeof WindowManager !== 'undefined') {
          if (isOpen) WindowManager.ensureDesktopLayer(true);
          else WindowManager.checkAllMinimizedOrClosed();
        } else {
          TauriBridge.invoke('set_desktop_layer', { above: isOpen }).catch(() => {});
        }
      } catch (e) {}
      if (isOpen) {
        StartMenuManager.init();
      }
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
    window.toggleStartMenu = toggleStart;

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
        const isTrigger = e.target.closest('#start-btn, .face-dock-app[data-app-id="start"], .face-brand-label, .bostan-start-btn, .bostan-nav-apps, .bakir-start-btn, .civata-btn-apps, .civata-brand, .ayaz-start-trigger');
        if (!startFlyout.contains(e.target) && !isTrigger) {
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
        if (typeof NotificationManager !== 'undefined' && NotificationManager.closeDrawer) {
          NotificationManager.closeDrawer();
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

      // Hızlı Çalıştır / Arama: Super + R (Windows Çalıştır alışkanlığı)
      if (e.metaKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        if (typeof SpotlightManager !== 'undefined' && SpotlightManager.open) {
          SpotlightManager.open();
        }
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

    // 1. Sabitlenmiş Uygulamalar (Pinned Apps Grid) + "Sabitlemeden Kaldır" bağlam menüsü
    const STATIC_UNPIN_KEY = 'ankora_unpinned_static_cards';
    const readHiddenStaticPins = () => {
      try {
        const arr = JSON.parse(SafeStorage.getItem(STATIC_UNPIN_KEY) || '[]');
        return Array.isArray(arr) ? arr : [];
      } catch (e) { return []; }
    };
    const writeHiddenStaticPins = (arr) => {
      SafeStorage.setItem(STATIC_UNPIN_KEY, JSON.stringify(arr));
    };
    const cardPinKey = (card) => card.getAttribute('data-open') || card.getAttribute('data-launch') || (card.querySelector('.app-title')?.textContent || '').trim();
    const syncStaticPinnedVisibility = () => {
      StartMenuManager.refresh();
    };
    StartMenuManager.init();

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

      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        let menu = document.getElementById('start-pin-ctx-menu');
        if (!menu) {
          menu = document.createElement('div');
          menu.id = 'start-pin-ctx-menu';
          menu.className = 'desktop-context-menu';
          document.body.appendChild(menu);
        }
        const launch = card.getAttribute('data-launch');
        const target = card.getAttribute('data-open');
        const key = cardPinKey(card);
        menu.innerHTML = `
          <div class="ctx-item" data-act="open"><span>Aç / Başlat</span></div>
          <div class="ctx-item ctx-danger" data-act="unpin"><span>Sabitlemeden Kaldır</span></div>
        `;
        menu.style.left = `${Math.min(e.clientX, window.innerWidth - 210)}px`;
        menu.style.top = `${Math.min(e.clientY, window.innerHeight - 100)}px`;
        menu.classList.add('open');
        const closeMenu = () => {
          menu.classList.remove('open');
          document.removeEventListener('click', closeMenu);
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 10);
        menu.querySelectorAll('.ctx-item').forEach(btn => {
          btn.addEventListener('click', () => {
            const act = btn.getAttribute('data-act');
            closeMenu();
            if (act === 'open') {
              if (launch) TauriBridge.invoke('launch_application', { exec: launch }).catch(() => {});
              else if (target) WindowManager.open(target);
              toggleStart(false);
            } else if (act === 'unpin' && key) {
              const hidden = readHiddenStaticPins();
              if (!hidden.includes(key)) hidden.push(key);
              writeHiddenStaticPins(hidden);
              syncStaticPinnedVisibility();
              ReportManager?.showToast('Uygulama sabitlemeden kaldırıldı.');
            }
          });
        });
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
          Terminal.runCommand('apt-get clean');
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
      btnShowAllApps.addEventListener('click', async () => {
        const nextCat = StartMenuManager.activeCat === 'all' ? 'favorites' : 'all';
        StartMenuManager.selectCategory(nextCat);
        if (nextCat === 'all' && typeof XdgDesktopEngine !== 'undefined' && XdgDesktopEngine.rescanXdgApps) {
          await XdgDesktopEngine.rescanXdgApps(false).catch(() => {});
        }
      });
    }

    document.getElementById('btn-start-open-store')?.addEventListener('click', () => {
      WindowManager.open('win-store');
      toggleStart(false);
    });
    document.getElementById('btn-empty-open-store')?.addEventListener('click', () => {
      WindowManager.open('win-store');
      toggleStart(false);
    });

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
      const faceBubble = document.getElementById('face-ai-bubble');
      if (faceBubble) {
        faceBubble.classList.toggle('active', isOpen);
        faceBubble.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      }
      if (aiMiniBtn) {
        aiMiniBtn.classList.toggle('active', isOpen);
        aiMiniBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      }
      if (isOpen) {
        if (qsFlyout) qsFlyout.classList.remove('open');
        if (calFlyout) calFlyout.classList.remove('open');
        if (AIAgent.miniFeed && AIAgent.miniFeed.children.length === 0) {
          AIAgent.miniFeed.innerHTML = `
            <div class="ai-mini-entry m-bot">Ankora AI hazır. Uygulama açtırabilir ("Terminali aç"), yüz değiştirebilir ("Bakır yüzüne geç"), paket kurulum planı oluşturabilir ("VLC kur") veya sistem doktorunu çalıştırabilirsin.</div>
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
      const winWatchBtn = document.getElementById('btn-ai-composer-watch');
      if (winWatchBtn) {
        winWatchBtn.classList.toggle('active', AIAgent.watchScreen);
        winWatchBtn.setAttribute('aria-pressed', AIAgent.watchScreen ? 'true' : 'false');
      }
      const sideWatchBtn = document.getElementById('btn-ai-sidebar-watch');
      if (sideWatchBtn) {
        sideWatchBtn.classList.toggle('watching', AIAgent.watchScreen);
      }
      const status = document.getElementById('ai-mini-status');
      if (status) status.textContent = AIAgent.watchScreen ? 'İzliyor' : 'Hazır';
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
        const isAiTrigger = e.target.closest('#quick-ai-btn, #face-ai-bubble, .civata-ai-btn, #confirm-modal');
        if (!aiMiniFlyout.contains(e.target) && !isAiTrigger) {
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

      const btnMiniPlus = document.getElementById('btn-ai-mini-plus');
      const miniQuick = document.getElementById('ai-mini-quick-actions');
      if (btnMiniPlus && miniQuick) {
        btnMiniPlus.addEventListener('click', () => {
          miniQuick.hidden = !miniQuick.hidden;
        });
      }

      const btnMiniModel = document.getElementById('ai-mini-model-pill');
      if (btnMiniModel) {
        btnMiniModel.addEventListener('click', () => {
          window.toggleAiMiniChat(false);
          WindowManager.open('win-ai');
          const drawer = document.getElementById('ai-config-drawer');
          if (drawer) drawer.classList.add('open');
        });
      }

      const btnMiniMode = document.getElementById('ai-mini-mode-pill');
      if (btnMiniMode) {
        btnMiniMode.addEventListener('click', () => {
          const modes = ['sysadmin', 'doctor', 'developer', 'general'];
          const idx = modes.indexOf(AIAgent.mode);
          AIAgent.mode = modes[(idx + 1) % modes.length];
          SafeStorage.setItem('ankora_ai_mode', AIAgent.mode);
          AIAgent.updateBadges();
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
    // qs-wifi-toggle ve qs-bt-toggle artık RadioManager.init() içinde gerçek
    // sistem durumuyla yönetilir (çift dinleyici çakışması önlenir).
    // qs-nightlight-toggle artık SettingsManager.updateNightState ile tam senkron yönetilir

    const qsTheme = document.getElementById('qs-theme-toggle');
    if (qsTheme) {
      qsTheme.addEventListener('click', () => {
        ThemeManager.toggleLightDark();
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
          screenDimmer.style.display = dimPct > 0.005 ? 'block' : 'none';
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

      if (typeof DesktopWidgets !== 'undefined' && DesktopWidgets.paintClock) {
        DesktopWidgets.paintClock();
      }
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
        <div class="ctx-item" data-action="toggle-dynamic-island">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="6" rx="3"></rect><circle cx="8" cy="6" r="1" fill="currentColor"></circle><line x1="12" y1="6" x2="16" y2="6"></line></svg>
          <span>Dinamik Ada / Kapsülü Aç / Kapat</span>
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

      const resolveDesktopDir = async () => {
        if (typeof DesktopFiles !== 'undefined' && DesktopFiles.dir) return DesktopFiles.dir;
        try {
          const xdg = await TauriBridge.invoke('get_xdg_user_dirs', {});
          if (xdg && xdg.desktop) {
            if (typeof DesktopFiles !== 'undefined') DesktopFiles.dir = xdg.desktop;
            return xdg.desktop;
          }
        } catch (err) {}
        const homeRoot = (typeof FileManager !== 'undefined' && FileManager.userHome) ? FileManager.userHome : '/home/ankora';
        return `${homeRoot.replace(/\/+$/, '')}/Masaüstü`;
      };

      const nextDesktopLeaf = async (deskDir, desiredName) => {
        let existing = new Set();
        try {
          const res = await TauriBridge.invoke('list_directory', { path: deskDir });
          (res && res.items ? res.items : []).forEach(it => {
            if (it && it.name) existing.add(String(it.name).toLocaleLowerCase('tr'));
          });
        } catch (err) {}
        if (!existing.has(desiredName.toLocaleLowerCase('tr'))) return desiredName;
        const dotIdx = desiredName.lastIndexOf('.');
        const hasExt = dotIdx > 0;
        const stem = hasExt ? desiredName.slice(0, dotIdx) : desiredName;
        const ext = hasExt ? desiredName.slice(dotIdx) : '';
        for (let n = 2; n <= 99; n++) {
          const cand = `${stem} (${n})${ext}`;
          if (!existing.has(cand.toLocaleLowerCase('tr'))) return cand;
        }
        return `${stem} (${Date.now().toString().slice(-4)})${ext}`;
      };

      const createDesktopFolderFlow = async () => {
        const deskDir = await resolveDesktopDir();
        const defName = await nextDesktopLeaf(deskDir, 'Yeni Klasör');
        const folderName = prompt('Masaüstünde yeni klasör adı:', defName);
        if (!folderName || !folderName.trim()) return;
        const clean = folderName.trim().replace(/[\\/:*?"<>|\0]/g, '');
        if (!clean) {
          ReportManager?.showToast('Geçersiz klasör adı.', 'error');
          return;
        }
        const finalName = await nextDesktopLeaf(deskDir, clean);
        const fullPath = `${deskDir.replace(/\/+$/, '')}/${finalName}`;
        try {
          await TauriBridge.invoke('create_folder', { path: fullPath });
          Terminal.log(`[MASAÜSTÜ] Klasör oluşturuldu: ${finalName}`, 'success');
          ReportManager?.showToast(`'${finalName}' klasörü masaüstünde oluşturuldu.`);
          if (typeof FileManager !== 'undefined') FileManager.refresh();
          if (typeof DesktopFiles !== 'undefined' && DesktopFiles.refresh) DesktopFiles.refresh();
        } catch (err) {
          ReportManager?.showToast(`Klasör oluşturulamadı: ${err.message || err}`, 'error');
        }
      };

      // Masaüstü seçili simge kısayolları (F2, Delete, Shift+Delete, Ctrl+Shift+N, Ctrl+V)
      document.addEventListener('keydown', (e) => {
        const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) return;
        const activeWin = document.querySelector('.window.open.active');
        if (activeWin) return;
        const selEl = document.querySelector('#dynamic-desktop-icons .desktop-item.selected');
        const key = (e.key || '').toLowerCase();

        if (e.ctrlKey && e.shiftKey && key === 'n') {
          e.preventDefault();
          createDesktopFolderFlow();
          return;
        }
        if (e.ctrlKey && !e.altKey && key === 'v') {
          const pasteItem = ctxMenu.querySelector('[data-action="paste-desktop"]');
          if (pasteItem && typeof FileManager !== 'undefined' && Array.isArray(FileManager.clipboard) && FileManager.clipboard.length) {
            e.preventDefault();
            pasteItem.click();
          }
          return;
        }
        if (!selEl) return;

        if (e.key === 'F2') {
          e.preventDefault();
          if (selEl.classList.contains('file-item') && selEl.dataset.filePath && typeof FileManager !== 'undefined') {
            FileManager.promptRename({ name: selEl.dataset.fileName || '', path: selEl.dataset.filePath });
          } else if (selEl.classList.contains('folder-item') && selEl.dataset.groupId && typeof XdgDesktopEngine !== 'undefined') {
            const grp = XdgDesktopEngine.groupById(selEl.dataset.groupId);
            if (grp) {
              const next = prompt('Kategori adı:', grp.name);
              if (next && next.trim()) XdgDesktopEngine.renameGroup(grp.id, next);
            }
          }
        } else if (e.key === 'Delete') {
          e.preventDefault();
          if (selEl.classList.contains('file-item') && selEl.dataset.filePath) {
            const p = selEl.dataset.filePath;
            const nm = selEl.dataset.fileName || 'Öge';
            if (e.shiftKey) {
              if (!confirm(`'${nm}' kalıcı olarak silinsin mi? Bu işlem geri alınamaz!`)) return;
              TauriBridge.invoke('delete_file', { path: p })
                .then(() => { ReportManager?.showToast('Öge kalıcı olarak silindi.'); DesktopFiles?.refresh?.(); })
                .catch(err => ReportManager?.showToast(`Silinemedi: ${err.message || err}`, 'error'));
            } else {
              TauriBridge.invoke('move_to_trash', { path: p })
                .then(() => { ReportManager?.showToast(`'${nm}' çöp kutusuna taşındı.`); DesktopFiles?.refresh?.(); })
                .catch(err => ReportManager?.showToast(`Silinemedi: ${err.message || err}`, 'error'));
            }
          } else if (selEl.classList.contains('folder-item') && selEl.dataset.groupId && typeof XdgDesktopEngine !== 'undefined') {
            const grp = XdgDesktopEngine.groupById(selEl.dataset.groupId);
            if (grp && confirm(`'${grp.name}' kategorisi silinsin mi?`)) {
              XdgDesktopEngine.deleteGroup(grp.id);
            }
          }
        }
      });

      ctxMenu.querySelectorAll('.ctx-item').forEach(item => {
        item.addEventListener('click', () => {
          const act = item.getAttribute('data-action');
          ctxMenu.classList.remove('open');
          if (act === 'files') {
            WindowManager.open('win-files');
          } else if (act === 'new-folder') {
            createDesktopFolderFlow();
          } else if (act === 'new-text') {
            (async () => {
              const deskDir = await resolveDesktopDir();
              const defName = await nextDesktopLeaf(deskDir, 'Yeni Belge.txt');
              const docName = prompt('Yeni metin belgesi adı:', defName);
              if (!docName || !docName.trim()) return;
              const clean = docName.trim().replace(/[\\/:*?"<>|\0]/g, '');
              if (!clean) return;
              const finalName = await nextDesktopLeaf(deskDir, clean);
              const fullPath = `${deskDir.replace(/\/+$/, '')}/${finalName}`;
              try {
                await TauriBridge.invoke('write_text_file', { path: fullPath, content: '' });
                Terminal.log(`[MASAÜSTÜ] Metin belgesi oluşturuldu: ${finalName}`, 'success');
                ReportManager?.showToast(`'${finalName}' belgesi masaüstünde oluşturuldu.`);
                if (typeof FileManager !== 'undefined') FileManager.refresh();
                if (typeof DesktopFiles !== 'undefined' && DesktopFiles.refresh) DesktopFiles.refresh();
              } catch (err) {
                WindowManager.open('win-notepad');
              }
            })();
          } else if (act === 'new-group') {
            const groupName = prompt('Uygulama kategorisi adı:', 'Yeni Kategori');
            if (groupName && groupName.trim() && typeof XdgDesktopEngine !== 'undefined') {
              const group = XdgDesktopEngine.createGroup(groupName);
              XdgDesktopEngine.renderToDesktop();
              if (typeof DesktopFiles !== 'undefined' && DesktopFiles.refresh) DesktopFiles.refresh();
              ReportManager?.showToast(`'${group.name}' kategorisi oluşturuldu. Çift tıklayarak içinden "+ Uygulama Ekle" diyebilirsiniz.`);
            }
          } else if (act === 'term') {
            WindowManager.open('win-terminal');
          } else if (act === 'paste-desktop') {
            const clips = (typeof FileManager !== 'undefined' && Array.isArray(FileManager.clipboard)) ? FileManager.clipboard : [];
            if (!clips.length) {
              ReportManager?.showToast('Panoda öge yok.', 'error');
            } else {
              (async () => {
                const dest = await resolveDesktopDir();
                const wasCut = FileManager.clipboardOp === 'cut';
                for (const cl of clips) {
                  try {
                    const m = await TauriBridge.invoke('copy_path_c', { sourcePath: cl.path, destPath: dest, moveOp: wasCut });
                    ReportManager?.showToast(m || 'Yapıştırıldı.');
                  } catch (err) {
                    ReportManager?.showToast(`Yapıştırılamadı: ${err.message || err}`, 'error');
                  }
                }
                if (wasCut) { FileManager.clipboard = []; FileManager.clipboardOp = null; }
                if (typeof DesktopFiles !== 'undefined' && DesktopFiles.refresh) DesktopFiles.refresh();
              })();
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
          } else if (act === 'toggle-dynamic-island') {
            if (typeof DynamicIsland !== 'undefined') {
              DynamicIsland.toggleEnabled();
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
      listEl.replaceChildren();

      const apps = (XdgDesktopEngine.installedApps || []).filter(a => !q || a.name.toLocaleLowerCase('tr').includes(q));

      if (!apps.length) {
        listEl.innerHTML = '<div style="padding: 18px; text-align: center; color: var(--text-muted, #64748b); font-size: 12px;">Uygulama bulunamadı.</div>';
        if (statusEl) statusEl.textContent = '—';
        return;
      }

      const frag = document.createDocumentFragment();
      apps.forEach(app => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg-surface, rgba(128,128,128,0.08));border:1px solid var(--border-subtle, rgba(128,128,128,0.2));border-radius:8px;';

        const nameCell = document.createElement('div');
        nameCell.style.cssText = 'flex:1;min-width:0;';
        nameCell.innerHTML = `<div style="font-size:12.5px;font-weight:600;color:var(--text-primary, inherit);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(app.name)}</div>
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
      if (key === 'on_desktop' && value === false && XdgDesktopEngine.removeAppFromAllGroups) {
        XdgDesktopEngine.removeAppFromAllGroups(app.id);
      }
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

        listEl.replaceChildren();
        if (!this.users.length) {
          listEl.innerHTML = '<div style="padding:10px;color:var(--text-muted,#64748b);font-size:12px;text-align:center;">Kullanıcı hesabı görünmüyor.</div>';
          return;
        }

        this.users.forEach(u => {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;';

          const info = document.createElement('div');
          info.style.cssText = 'flex:1;min-width:0;';
          info.innerHTML = `<div style="font-size:12.5px;font-weight:600;color:var(--text-primary);">${escapeHtml(u.username)}${u.is_current ? ' <span style="font-weight:400;font-size:10.5px;color:var(--accent-active);">(bu oturum)</span>' : ''}${u.in_sudo_group ? ' <span style="font-weight:400;font-size:10.5px;color:#fbbf24;">sudo</span>' : ''}</div>
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

  Object.assign(window, { launcherNorm, START_MENU_CAT_LABELS, StartMenuManager, LauncherSearch, initDesktopControls, MenuEditor, UsersManager });
})();

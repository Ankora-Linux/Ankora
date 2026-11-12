(() => {
  'use strict';

  // ============================================================================
  // AYAZ DE · ARAYÜZ YÜZLERİ / FACES YÖNETİCİSİ (FaceManager)
  // Antislop UI Mimarisi: 2 (Bakır), 3 (Bostan), 8 (Cıvata)
  // ============================================================================

  const FaceManager = {
    currentFace: 'default',

    init() {
      // 1. Kabuk DOM kapsayıcılarını oluştur
      this.ensureShellContainers();

      // 2. Kayıtlı yüzü yükle (varsayılan: 'default')
      const savedFace = (window.SafeStorage && window.SafeStorage.getItem('ankora_face')) || 'default';
      this.setFace(savedFace, false);

      // 3. Ayarlar paneli kart seçimlerini dinle
      document.addEventListener('click', (e) => {
        if (!e.target || typeof e.target.closest !== 'function') return;
        const faceCard = e.target.closest('.face-card-choice');
        if (faceCard) {
          const face = faceCard.getAttribute('data-face');
          if (face) this.setFace(face, true);
        }
      });

      // 4. Pencere sekme senkronizasyonu olayını dinle
      window.addEventListener('ayaz:tabs-synced', () => {
        this.syncRunningState();
      });

      window.addEventListener('ayaz:weather-updated', () => {
        this.updateWeatherHero();
      });

      // 5. Periyodik saat & hava durumu güncellemesi
      this.startClock();

      // 6. Başlangıç senkronizasyonu
      setTimeout(() => this.syncRunningState(), 300);
    },

    ensureShellContainers() {
      if (!document.getElementById('face-top-panel')) {
        const topPanel = document.createElement('header');
        topPanel.id = 'face-top-panel';
        document.body.appendChild(topPanel);
      }

      if (!document.getElementById('face-bottom-dock')) {
        const dock = document.createElement('nav');
        dock.id = 'face-bottom-dock';
        document.body.appendChild(dock);
      }

      if (!document.getElementById('face-desk-hero')) {
        const hero = document.createElement('div');
        hero.id = 'face-desk-hero';
        document.body.appendChild(hero);
      }

      if (!document.getElementById('face-meta-note')) {
        const meta = document.createElement('div');
        meta.id = 'face-meta-note';
        document.body.appendChild(meta);
      }

      // Görev çubuğu gizlenen yüzlerde (2/3/8) AI için tek giriş noktası:
      // sağ üstte küçük Ankora AI balonu. Yüz paletini CSS'ten alır.
      if (!document.getElementById('face-ai-bubble')) {
        const bubble = document.createElement('button');
        bubble.id = 'face-ai-bubble';
        bubble.type = 'button';
        bubble.className = 'face-ai-bubble';
        bubble.title = 'Ankora AI';
        bubble.setAttribute('aria-label', 'Ankora AI asistanını aç');
        bubble.innerHTML = '<svg class="face-ai-glyph" viewBox="0 0 24 24" aria-hidden="true"><use href="#ico-bot"></use></svg><span class="face-ai-text">Ankora AI</span>';
        bubble.addEventListener('click', () => {
          if (typeof WindowManager !== 'undefined' && WindowManager.open) {
            WindowManager.open('win-ai');
          }
        });
        document.body.appendChild(bubble);
      }
    },

    setFace(faceId, persist = true) {
      this.currentFace = String(faceId);
      document.documentElement.setAttribute('data-face', this.currentFace);
      document.body.setAttribute('data-face', this.currentFace);

      // Ayarlar kartları active durumunu güncelle
      document.querySelectorAll('.face-card-choice').forEach(card => {
        card.classList.toggle('active', card.getAttribute('data-face') === this.currentFace);
      });

      if (persist && window.SafeStorage) {
        window.SafeStorage.setItem('ankora_face', this.currentFace);
        if (window.Terminal && window.Terminal.log) {
          window.Terminal.log(`[ARAYÜZ YÜZÜ] Yeni mimari yüz uygulandı: ${this.currentFace}`, 'success');
        }
      }

      this.renderFaceShell();
      if (window.XdgDesktopEngine && typeof window.XdgDesktopEngine.layoutDesktopIcons === 'function') {
        window.XdgDesktopEngine.layoutDesktopIcons();
        requestAnimationFrame(() => window.XdgDesktopEngine.layoutDesktopIcons());
      }
    },

    renderFaceShell() {
      const topPanel = document.getElementById('face-top-panel');
      const dock = document.getElementById('face-bottom-dock');
      const hero = document.getElementById('face-desk-hero');
      const meta = document.getElementById('face-meta-note');
      if (!topPanel || !dock || !hero || !meta) return;

      topPanel.innerHTML = '';
      dock.innerHTML = '';
      hero.innerHTML = '';
      meta.innerHTML = '';

      if (this.currentFace === 'default') {
        const island = document.getElementById('dynamic-island-container');
        if (island) island.style.removeProperty('display');
        return;
      }
      // Dinamik Ada (Kapsül) kontrolü
      const island = document.getElementById('dynamic-island-container');
      if (island) {
        island.style.setProperty('display', this.currentFace === 'default' ? 'flex' : 'none', 'important');
      }


      if (this.currentFace === '2') {
        this.renderBakir(topPanel, dock, meta);
      } else if (this.currentFace === '3') {
        this.renderBostan(topPanel, dock, hero);
      } else if (this.currentFace === '8') {
        this.renderCivata(topPanel, dock, hero);
      }

      this.updateClockDisplay();
      this.syncRunningState();
      if (window.MprisManager && window.MprisManager.currentStatus) {
        this.updateMediaBar(window.MprisManager.currentStatus);
      }
    },

    getLiveWeatherSnippet() {
      try {
        const raw = JSON.parse(window.SafeStorage?.getItem('ankora_weather_cache') || 'null');
        if (raw && raw.data && raw.city) {
          const cur = raw.data.current || {};
          const city = raw.city.name || 'Ankara';
          const temp = Number.isFinite(Number(cur.temperature_2m)) ? Math.round(Number(cur.temperature_2m)) : 14;
          return { city, temp, ok: true };
        }
      } catch (e) {}
      return { city: 'Ankara', temp: 14, ok: false };
      },

    updateWeatherHero() {
      const wx = this.getLiveWeatherSnippet();
      const bW = document.querySelector('.bostan-hero-weather');
      if (bW) bW.innerHTML = `${wx.city}'da <b>${wx.temp}°</b>, güncel hava durumu · serin esinti`;
      const cW = document.querySelector('.civata-hero-weather');
      if (cW) cW.innerHTML = `${wx.city} <b>${wx.temp}°</b>, güncel hava durumu`;
    },

    ensureMediaBar(topPanel) {
      if (!topPanel) return null;
      const existing = topPanel.querySelector('.face-media-bar');
      if (existing) return existing;

      const bar = document.createElement('div');
      bar.className = 'face-media-bar';
      bar.style.display = 'none';
      bar.innerHTML = `
        <button type="button" class="face-media-btn" data-mpris="previous" title="Önceki Parça" aria-label="Önceki parça">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg>
        </button>
        <button type="button" class="face-media-btn face-media-toggle" data-mpris="play-pause" title="Oynat / Duraklat" aria-label="Oynat veya duraklat">
          <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        </button>
        <button type="button" class="face-media-btn" data-mpris="next" title="Sonraki Parça" aria-label="Sonraki parça">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>
        </button>
        <div class="face-media-meta">
          <span class="face-media-title"></span>
          <span class="face-media-artist"></span>
        </div>
        <span class="face-media-progress"><span class="face-media-progress-bar"></span></span>
      `;
      bar.querySelectorAll('[data-mpris]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const cmd = btn.getAttribute('data-mpris');
          if (window.MprisManager && cmd) window.MprisManager.sendCommand(cmd);
        });
      });
      topPanel.appendChild(bar);
      return bar;
    },

    updateMediaBar(status) {
      const bar = document.querySelector('.face-media-bar');
      if (!bar) return;
      if (!status) {
        bar.style.display = 'none';
        return;
      }
      bar.style.display = 'flex';
      const title = bar.querySelector('.face-media-title');
      const artist = bar.querySelector('.face-media-artist');
      const toggle = bar.querySelector('.face-media-toggle');
      if (title) title.textContent = status.title || 'Bilinmeyen Parça';
      if (artist) {
        artist.textContent = [status.artist, status.player_name].filter(Boolean).join(' · ') || 'Medya';
      }
      if (toggle) {
        const playing = String(status.playback_status || '').toLowerCase() === 'playing';
        toggle.innerHTML = playing
          ? '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>'
          : '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
      }
    },

    // ------------------------------------------------------------------------
    // YÜZ 2: BAKIR
    // ------------------------------------------------------------------------
    renderBakir(topPanel, dock, meta) {
      this.ensureMediaBar(topPanel);
      // 1. Üst Panel: Çalışma Alanları + Kapsül Saat/Tarih + Tepsi
      const wsGroup = document.createElement('div');
      wsGroup.className = 'face-ws-group';
      const activeWs = (window.WorkspaceManager && window.WorkspaceManager.active) || 1;
      for (let i = 1; i <= 4; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `face-ws-btn${i === activeWs ? ' active' : ''}`;
        btn.textContent = String(i);
        btn.title = `Çalışma Alanı ${i}`;
        btn.addEventListener('click', () => {
          if (window.WorkspaceManager) window.WorkspaceManager.set(i);
          wsGroup.querySelectorAll('.face-ws-btn').forEach((b, idx) => {
            b.classList.toggle('active', idx + 1 === i);
          });
        });
        wsGroup.appendChild(btn);
      }
      topPanel.appendChild(wsGroup);

      // Kapsül Saat / Tarih
      const cap = document.createElement('div');
      cap.className = 'face-clock-capsule';
      cap.innerHTML = `<span class="bakir-cap-date"></span><span class="bakir-cap-time"></span>`;
      cap.title = 'Saat ve Takvim (Açmak için tıkla)';
      cap.addEventListener('click', () => {
        const clk = document.getElementById('tray-clock');
        if (clk) clk.click();
      });
      topPanel.appendChild(cap);

      // Spacer
      const sp = document.createElement('div');
      sp.className = 'face-panel-spacer';
      topPanel.appendChild(sp);

      // Tepsi
      const tray = document.createElement('div');
      tray.className = 'face-tray-group';
      tray.innerHTML = `
        <span class="tray-click-wifi" title="Ağ Durumu" style="cursor:pointer;">
          <svg width="15" height="15" viewBox="0 0 24 24"><path d="M4 15a11 11 0 0 1 16 0M7.5 18a6 6 0 0 1 9 0"/><circle cx="12" cy="20.4" r=".9"/></svg>
        </span>
        <span class="tray-click-audio" title="Ses Durumu" style="cursor:pointer;">
          <svg width="15" height="15" viewBox="0 0 24 24"><rect x="4" y="10" width="2.4" height="8"/><rect x="9" y="7" width="2.4" height="11"/><rect x="14" y="9" width="2.4" height="9"/></svg>
        </span>
        <span style="font-size:12px;cursor:pointer;" title="Klavye Yerleşimi">tr</span>
        <span class="bakir-tray-time" style="font-size:12px;"></span>
      `;
      tray.querySelector('.tray-click-wifi').addEventListener('click', () => {
        const el = document.getElementById('tray-wifi-btn') || document.getElementById('tray-status-island');
        if (el) el.click();
      });
      tray.querySelector('.tray-click-audio').addEventListener('click', () => {
        const el = document.getElementById('tray-volume-btn') || document.getElementById('tray-status-island');
        if (el) el.click();
      });
      topPanel.appendChild(tray);

      // 2. Alt Dock: Temel Uygulamalar
      const apps = [
        { id: 'start', title: 'Başlat Menüsü', icon: '<circle cx="8" cy="8" r="3.4"/><rect x="9.4" y="9.4" width="7.6" height="7.6"/>', action: (e) => this.toggleStartMenu(e) },
        { id: 'files', winId: 'win-files', title: 'Dosyalar', icon: '<path d="M3 7h6l2 2h10v10H3z"/>', action: () => this.openApp('win-files') },
        { id: 'brave', winId: 'win-browser', title: 'Brave Web Tarayıcısı', icon: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c-3 4-3 12 0 16M12 4c3 4 3 12 0 16"/>', action: () => this.launchOrToggleBrave() },
        { id: 'store', winId: 'win-store', title: 'Yazılım Mağazası', icon: '<path d="M5 8l7-4 7 4-7 4zM12 12v8M5 16l7 4 7-4M5 8v8l7 4 7-4V8"/>', action: () => this.openApp('win-store') },
        { id: 'settings', winId: 'win-settings', title: 'Sistem Ayarları', icon: '<path d="M5 8h14l-1 10H6zM9 8V6a3 3 0 0 1 6 0v2"/>', action: () => this.openApp('win-settings') },
        { id: 'terminal', winId: 'win-terminal', title: 'Uçbirim (Terminal)', icon: '<rect x="4" y="5" width="16" height="14"/><path d="M7 9.5l3 2.5-3 2.5M12 15h5"/>', action: () => this.openApp('win-terminal') }
      ];

      apps.forEach(app => {
        const btn = document.createElement('span');
        btn.className = 'face-dock-app';
        btn.setAttribute('data-app-id', app.id);
        if (app.winId) btn.setAttribute('data-win-id', app.winId);
        btn.title = app.title;
        btn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24">${app.icon}</svg>`;
        btn.addEventListener('click', (e) => app.action(e));
        dock.appendChild(btn);
      });

      // 3. Masaüstü Metanotu
      meta.textContent = 'ankora / oturum: canlı · çekirdek 6.1';
    },

    // ------------------------------------------------------------------------
    // YÜZ 3: BOSTAN
    // ------------------------------------------------------------------------
    renderBostan(topPanel, dock, hero) {
      this.ensureMediaBar(topPanel);
      // 1. Üst Bar: Ankora Markası + Menü + Tarih
      const brand = document.createElement('b');
      brand.className = 'face-brand-label';
      brand.textContent = 'Ankora';
      brand.title = 'Başlat Menüsü';
      brand.addEventListener('click', (e) => this.toggleStartMenu(e));
      topPanel.appendChild(brand);

      const menu = document.createElement('nav');
      menu.className = 'face-top-menu';
      menu.innerHTML = `
        <span class="bostan-nav-apps">Uygulamalar</span>
        <span class="bostan-nav-settings">Görünüm &amp; Ayarlar</span>
      `;
      menu.querySelector('.bostan-nav-apps').addEventListener('click', (e) => this.toggleStartMenu(e));
      menu.querySelector('.bostan-nav-settings').addEventListener('click', () => this.openApp('win-settings'));
      topPanel.appendChild(menu);

      const clk = document.createElement('div');
      clk.className = 'face-top-clock-serif bostan-top-date';
      topPanel.appendChild(clk);

      // 2. Sağ Üst Dev Serif Saat & Hava Durumu
      const bostanWx = this.getLiveWeatherSnippet();
      hero.innerHTML = `
        <div class="bostan-hero-time">
          <span class="bostan-live-time"></span><small class="bostan-live-day"></small>
        </div>
        <p class="bostan-hero-weather">
          ${bostanWx.city}'da <b>${bostanWx.temp}°</b>, açık akşam · serin esinti
        </p>
      `;

      // 3. Alt Yeşil Kapsül Dock
      const apps = [
        { id: 'start', title: 'Başlat Menüsü', icon: '<circle cx="8" cy="8" r="3.4"/><rect x="9.4" y="9.4" width="7.6" height="7.6"/>', action: (e) => this.toggleStartMenu(e) },
        { id: 'files', winId: 'win-files', title: 'Dosyalar', icon: '<path d="M3 7h6l2 2h10v10H3z"/>', action: () => this.openApp('win-files') },
        { id: 'brave', winId: 'win-browser', title: 'Brave Web Tarayıcısı', icon: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c-3 4-3 12 0 16M12 4c3 4 3 12 0 16"/>', action: () => this.launchOrToggleBrave() },
        { id: 'store', winId: 'win-store', title: 'Yazılım Mağazası', icon: '<path d="M5 8l7-4 7 4-7 4zM12 12v8M5 16l7 4 7-4M5 8v8l7 4 7-4V8"/>', action: () => this.openApp('win-store') },
        { id: 'terminal', winId: 'win-terminal', title: 'Uçbirim (Terminal)', icon: '<rect x="4" y="5" width="16" height="14"/><path d="M7 9.5l3 2.5-3 2.5M12 15h5"/>', action: () => this.openApp('win-terminal') },
        { id: 'settings', winId: 'win-settings', title: 'Sistem Ayarları', icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1z"/>', action: () => this.openApp('win-settings') }
      ];

      apps.forEach(app => {
        const btn = document.createElement('span');
        btn.className = 'face-dock-app';
        btn.setAttribute('data-app-id', app.id);
        if (app.winId) btn.setAttribute('data-win-id', app.winId);
        btn.title = app.title;
        btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24">${app.icon}</svg>`;
        btn.addEventListener('click', (e) => app.action(e));
        dock.appendChild(btn);
      });
    },

    // ------------------------------------------------------------------------
    // YÜZ 8: CIVATA
    // ------------------------------------------------------------------------
    renderCivata(topPanel, dock, hero) {
      // 1. Üst Siyah Teknik Çubuk (30px)
      topPanel.innerHTML = `
        <b class="civata-brand" title="Başlat Menüsü">Ankora</b>
        <span class="civata-nav-item civata-btn-apps">uygulamalar</span>
        <span class="civata-nav-item civata-btn-wins">açık pencereler <em class="civata-highlight civata-open-count">0</em></span>
        <div class="civata-running-tabs" id="civata-running-tabs"></div>
        <div style="flex:1;"></div>
        <span class="civata-nav-item civata-btn-ai" style="margin-right:12px;">ada: <em class="civata-highlight">genişletilmiş</em></span>
        <span class="civata-top-datetime"></span>
      `;
      this.ensureMediaBar(topPanel);

      topPanel.querySelector('.civata-brand').addEventListener('click', (e) => this.toggleStartMenu(e));
      topPanel.querySelector('.civata-btn-apps').addEventListener('click', (e) => this.toggleStartMenu(e));
      topPanel.querySelector('.civata-btn-wins').addEventListener('click', () => {
        if (window.WorkspaceManager && window.WorkspaceManager.toggleOverview) {
          window.WorkspaceManager.toggleOverview();
        }
      });
      topPanel.querySelector('.civata-btn-ai').addEventListener('click', () => this.openApp('win-ai'));

      // 2. Sol Dev Display Saat & Hava Durumu
      const civataWx = this.getLiveWeatherSnippet();
      hero.innerHTML = `
        <div class="civata-hero-time">
          <span class="civata-live-time"></span>
          <small class="civata-live-sub"></small>
        </div>
        <p class="civata-hero-weather">
          ${civataWx.city} <b>${civataWx.temp}°</b>, açık akşam · bu gece 6°
        </p>
      `;

      // 3. Alt Teknik Dock (Cıvata)
      if (dock) {
        const apps = [
          { id: 'start', title: 'Başlat Menüsü', icon: '<circle cx="8" cy="8" r="3.4"/><rect x="9.4" y="9.4" width="7.6" height="7.6"/>', action: (e) => this.toggleStartMenu(e) },
          { id: 'files', winId: 'win-files', title: 'Dosyalar', icon: '<path d="M3 7h6l2 2h10v10H3z"/>', action: () => this.openApp('win-files') },
          { id: 'brave', winId: 'win-browser', title: 'Brave Web Tarayıcısı', icon: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c-3 4-3 12 0 16M12 4c3 4 3 12 0 16"/>', action: () => this.launchOrToggleBrave() },
          { id: 'store', winId: 'win-store', title: 'Yazılım Mağazası', icon: '<path d="M5 8l7-4 7 4-7 4zM12 12v8M5 16l7 4 7-4M5 8v8l7 4 7-4V8"/>', action: () => this.openApp('win-store') },
          { id: 'terminal', winId: 'win-terminal', title: 'Uçbirim (Terminal)', icon: '<rect x="4" y="5" width="16" height="14"/><path d="M7 9.5l3 2.5-3 2.5M12 15h5"/>', action: () => this.openApp('win-terminal') },
          { id: 'settings', winId: 'win-settings', title: 'Sistem Ayarları', icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1z"/>', action: () => this.openApp('win-settings') }
        ];

        apps.forEach(app => {
          const btn = document.createElement('span');
          btn.className = 'face-dock-app';
          btn.setAttribute('data-app-id', app.id);
          if (app.winId) btn.setAttribute('data-win-id', app.winId);
          btn.title = app.title;
          btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24">${app.icon}</svg>`;
          btn.addEventListener('click', (e) => app.action(e));
          dock.appendChild(btn);
        });
      }
    },

    // ------------------------------------------------------------------------
    // YARDIMCILAR & ETKİLEŞİM
    // ------------------------------------------------------------------------
    async launchOrToggleBrave() {
      const wm = window.WindowManager;
      const nativeWins = (wm && Array.isArray(wm.nativeWindows)) ? wm.nativeWindows : [];
      const braveNative = nativeWins.find(nw => {
        const hay = `${nw.app_name || ''} ${nw.wm_class || ''} ${nw.title || ''}`.toLowerCase();
        return hay.includes('brave');
      });

      if (braveNative && window.TauriBridge) {
        if (braveNative.is_active) {
          window.TauriBridge.invoke('minimize_native_window', { id: braveNative.id }).catch(() => {});
        } else {
          if (wm && typeof wm.ensureDesktopLayer === 'function') wm.ensureDesktopLayer(false);
          window.TauriBridge.invoke('activate_native_window', { id: braveNative.id }).catch(() => {});
        }
        setTimeout(() => {
          if (wm && typeof wm.refreshNativeWindows === 'function') wm.refreshNativeWindows(true);
        }, 250);
        return;
      }

      if (window.XdgDesktopEngine && typeof window.XdgDesktopEngine.launchApp === 'function') {
        await window.XdgDesktopEngine.launchApp({ id: 'brave-browser', name: 'Brave Web Tarayıcı', exec: 'brave-browser' });
        if (wm && typeof wm.refreshNativeWindows === 'function') {
          setTimeout(() => wm.refreshNativeWindows(true), 600);
          setTimeout(() => wm.refreshNativeWindows(true), 1800);
        }
        return;
      }

      this.openApp('win-browser');
    },
    toggleStartMenu(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (typeof window.toggleStartMenu === 'function') {
        window.toggleStartMenu();
      } else {
        const flyout = document.getElementById('start-flyout');
        const startBtn = document.getElementById('start-btn');
        if (!flyout) return;
        const isOpen = !flyout.classList.contains('open');
        flyout.classList.toggle('open', isOpen);
        if (startBtn) startBtn.classList.toggle('active', isOpen);
      }
    },

    openApp(winId) {
      if (window.WindowManager && typeof window.WindowManager.open === 'function') {
        const win = document.getElementById(winId);
        if (win && win.classList.contains('open')) {
          if (win.classList.contains('minimized')) {
            win.classList.remove('minimized');
            window.WindowManager.bringToFront(win);
          } else if (win.classList.contains('active')) {
            window.WindowManager.minimize(win);
          } else {
            window.WindowManager.bringToFront(win);
          }
        } else {
          window.WindowManager.open(winId);
        }
      }
    },

    syncRunningState() {
      if (this.currentFace === 'default') return;

      const wm = window.WindowManager;
      const openWins = Array.from(document.querySelectorAll('.window.open:not(.ws-hide)'));
      const nativeWins = (wm && Array.isArray(wm.nativeWindows)) ? wm.nativeWindows : [];
      const dock = document.getElementById('face-bottom-dock');

      const staticWinIds = new Set();
      if (dock) {
        dock.querySelectorAll('.face-dock-dynamic, .face-dock-sep').forEach(el => el.remove());

        dock.querySelectorAll('.face-dock-app:not(.face-dock-dynamic)').forEach(btn => {
          const appId = btn.getAttribute('data-app-id');
          const winId = btn.getAttribute('data-win-id');
          if (winId) staticWinIds.add(winId);

          if (appId === 'brave') {
            const win = winId ? document.getElementById(winId) : null;
            const internalOpen = !!(win && win.classList.contains('open') && !win.classList.contains('ws-hide'));
            const internalActive = !!(internalOpen && win.classList.contains('active') && !win.classList.contains('minimized'));
            const braveNative = nativeWins.filter(nw => {
              const hay = `${nw.app_name || ''} ${nw.wm_class || ''} ${nw.title || ''}`.toLowerCase();
              return hay.includes('brave');
            });
            const nativeOpen = braveNative.length > 0;
            const nativeActive = braveNative.some(nw => nw.is_active);
            btn.classList.toggle('running', internalOpen || nativeOpen);
            btn.classList.toggle('active', internalActive || nativeActive);
            return;
          }

          if (!winId) return;
          const win = document.getElementById(winId);
          const isOpen = win && win.classList.contains('open') && !win.classList.contains('ws-hide');
          const isActive = isOpen && win.classList.contains('active') && !win.classList.contains('minimized');

          btn.classList.toggle('running', !!isOpen);
          btn.classList.toggle('active', !!isActive);
        });

        // Statik dock dışında kalan sabitlenmiş görev çubuğu uygulamaları, açık iç pencereler ve tüm harici X11 pencereleri
        const extraInternalWins = openWins.filter(w => !staticWinIds.has(w.id));
        const pins = (window.AppPinManager && typeof window.AppPinManager.read === 'function')
          ? window.AppPinManager.read(window.AppPinManager.TASKBAR_KEY)
          : [];
        const extraPins = pins.filter(pin => {
          const id = String(pin.id || '').toLowerCase();
          const exec = String(pin.exec || '').toLowerCase();
          if (id.includes('brave') || exec.includes('brave')) return false;
          if (exec.startsWith('internal:') && staticWinIds.has(exec.replace('internal:', ''))) return false;
          return true;
        });

        if (extraPins.length > 0 || extraInternalWins.length > 0 || nativeWins.length > 0) {
          const sep = document.createElement('span');
          sep.className = 'face-dock-sep';
          sep.setAttribute('aria-hidden', 'true');
          dock.appendChild(sep);
        }

        // 1) Sabitlenmiş ek uygulamalar (açık pencerelerle eşleşenler çifte gösterilmez)
        const matchedWinIds = new Set();
        const matchedNativeIds = new Set();

        extraPins.forEach(pin => {
          const resolved = (window.AppPinManager && window.AppPinManager.resolveApp)
            ? window.AppPinManager.resolveApp(pin)
            : pin;
          const pinExec = String(resolved.exec || '');
          const pinIdL = String(resolved.id || '').toLowerCase();
          const pinExecL = pinExec.toLowerCase();

          let matchedInternal = null;
          let matchedNative = null;
          if (pinExec.startsWith('internal:')) {
            const targetWinId = pinExec.replace('internal:', '');
            matchedInternal = extraInternalWins.find(w => w.id === targetWinId) || null;
          } else {
            matchedNative = nativeWins.find(nw => {
              const hay = `${nw.app_name || ''} ${nw.wm_class || ''} ${nw.title || ''}`.toLowerCase();
              return (pinIdL && hay.includes(pinIdL)) || (pinExecL && hay.includes(pinExecL));
            }) || null;
          }

          if (matchedInternal) matchedWinIds.add(matchedInternal.id);
          if (matchedNative) matchedNativeIds.add(matchedNative.id);

          const isRunning = !!(matchedInternal || matchedNative);
          const isActive = Boolean(
            (matchedInternal && matchedInternal.classList.contains('active') && !matchedInternal.classList.contains('minimized')) ||
            (matchedNative && matchedNative.is_active)
          );

          const btn = document.createElement('span');
          btn.className = `face-dock-app face-dock-dynamic face-dock-pin${isRunning ? ' running' : ''}${isActive ? ' active' : ''}`;
          btn.setAttribute('data-app-id', resolved.id || '');
          if (matchedInternal) btn.setAttribute('data-win-id', matchedInternal.id);
          if (matchedNative) btn.setAttribute('data-native-id', matchedNative.id);
          btn.title = `${resolved.name || resolved.id || 'Uygulama'}${isRunning ? ' (Açık)' : ''}\nSağ tık: seçenekler`;
          const iconSvg = (window.IconResolver && window.IconResolver.getIconSvg)
            ? window.IconResolver.getIconSvg(resolved)
            : `<span class="face-dock-letter">${String(resolved.name || '?').charAt(0).toUpperCase()}</span>`;
          btn.innerHTML = iconSvg;
          if (window.IconResolver && window.IconResolver.tagIcon) {
            window.IconResolver.tagIcon(btn, resolved);
          }
          btn.addEventListener('click', () => {
            if (matchedInternal) {
              this.openApp(matchedInternal.id);
            } else if (matchedNative) {
              if (matchedNative.is_active) {
                if (window.TauriBridge) window.TauriBridge.invoke('minimize_native_window', { id: matchedNative.id }).catch(() => {});
              } else {
                if (wm && typeof wm.ensureDesktopLayer === 'function') wm.ensureDesktopLayer(false);
                if (window.TauriBridge) window.TauriBridge.invoke('activate_native_window', { id: matchedNative.id }).catch(() => {});
              }
              setTimeout(() => {
                if (wm && typeof wm.refreshNativeWindows === 'function') wm.refreshNativeWindows(true);
              }, 250);
            } else if (pinExec.startsWith('internal:')) {
              this.openApp(pinExec.replace('internal:', ''));
            } else if (window.XdgDesktopEngine && window.XdgDesktopEngine.launchApp) {
              window.XdgDesktopEngine.launchApp(resolved);
            } else if (window.TauriBridge) {
              window.TauriBridge.invoke('launch_application', { exec: pinExec || resolved.id }).catch(() => {});
            }
          });
          btn.addEventListener('contextmenu', (e) => {
            if (!wm || typeof wm.showTabMenu !== 'function') return;
            e.preventDefault();
            e.stopPropagation();
            const items = [];
            if (matchedInternal) {
              items.push({ label: matchedInternal.classList.contains('minimized') ? 'Geri yükle' : 'Küçült', run: () => this.openApp(matchedInternal.id) });
              items.push({ label: 'Kapat', danger: true, run: () => wm.close(matchedInternal) });
            } else if (matchedNative) {
              items.push({ label: matchedNative.is_active ? 'Küçült' : 'Öne getir', run: () => {
                if (matchedNative.is_active) {
                  window.TauriBridge?.invoke('minimize_native_window', { id: matchedNative.id }).catch(() => {});
                } else {
                  wm.ensureDesktopLayer?.(false);
                  window.TauriBridge?.invoke('activate_native_window', { id: matchedNative.id }).catch(() => {});
                }
              }});
              items.push({ label: 'Kapat', danger: true, run: () => window.TauriBridge?.invoke('close_native_window', { id: matchedNative.id }).catch(() => {}) });
            } else {
              items.push({ label: 'Aç', run: () => btn.click() });
            }
            if (window.AppPinManager && window.AppPinManager.toggleTaskbarPin) {
              items.push({ label: 'Docktan kaldır', run: () => {
                window.AppPinManager.toggleTaskbarPin(resolved);
                this.syncRunningState();
              }});
            }
            wm.showTabMenu(e, items);
          });
          dock.appendChild(btn);
        });

        // 2) Statik ve sabit dock'ta yer almayan açık iç pencereler (Notlar, Ankora AI, Hesap Makinesi vb.)
        extraInternalWins.filter(w => !matchedWinIds.has(w.id)).forEach(win => {
          const titleSpan = win.querySelector('.window-meta span');
          const title = titleSpan ? titleSpan.textContent.split(/ [—–-] /)[0].trim() : (win.id || 'Pencere');
          const svg = win.querySelector('.window-meta svg');
          const isActive = win.classList.contains('active') && !win.classList.contains('minimized');

          const btn = document.createElement('span');
          btn.className = `face-dock-app face-dock-dynamic running${isActive ? ' active' : ''}`;
          btn.setAttribute('data-win-id', win.id);
          btn.title = title;
          btn.innerHTML = svg
            ? svg.outerHTML
            : `<span class="face-dock-letter">${title.charAt(0).toLocaleUpperCase('tr')}</span>`;
          btn.addEventListener('click', () => this.openApp(win.id));
          btn.addEventListener('auxclick', (e) => {
            if (e.button === 1 && wm) {
              e.preventDefault();
              wm.close(win);
            }
          });
          btn.addEventListener('contextmenu', (e) => {
            if (!wm || typeof wm.showTabMenu !== 'function') return;
            e.preventDefault();
            e.stopPropagation();
            wm.showTabMenu(e, [
              { label: win.classList.contains('minimized') ? 'Geri yükle' : 'Küçült', run: () => this.openApp(win.id) },
              { label: win.classList.contains('maximized') ? 'Eski boyut' : 'Büyüt', run: () => wm.toggleMaximize(win) },
              { label: 'Kapat', danger: true, run: () => wm.close(win) }
            ]);
          });
          dock.appendChild(btn);
        });

        // 3) Sabit dock dışı açık harici X11 pencereleri (Brave, VLC, LibreOffice, GIMP vb.)
        nativeWins.filter(nw => !matchedNativeIds.has(nw.id)).forEach(nw => {
          const rawTitle = nw.title || nw.app_name || 'Uygulama';
          const shortTitle = rawTitle.split(/ [—–-] /).pop().trim().substring(0, 28) || nw.app_name || 'Uygulama';
          const appKey = String(nw.app_name || nw.wm_class || shortTitle).toLowerCase();
          const letter = String(nw.app_name || shortTitle || '?').charAt(0).toLocaleUpperCase('tr');

          const btn = document.createElement('span');
          btn.className = `face-dock-app face-dock-dynamic face-dock-native native-task-tab running${nw.is_active ? ' active' : ''}`;
          btn.setAttribute('data-native-id', nw.id);
          btn.setAttribute('data-app-id', appKey);
          btn.title = `${rawTitle} (${nw.app_name || 'X11'})`;

          const matchedApp = (window.XdgDesktopEngine && Array.isArray(window.XdgDesktopEngine.installedApps))
            ? window.XdgDesktopEngine.installedApps.find(a => {
                const aid = String(a.id || '').toLowerCase();
                const aexec = String(a.exec || '').toLowerCase();
                return aid.includes(appKey) || appKey.includes(aid) || (aexec && appKey.includes(aexec));
              })
            : null;
          const iconTarget = matchedApp || { id: appKey, name: nw.app_name || shortTitle };
          const iconSvg = (window.IconResolver && typeof window.IconResolver.getIconSvg === 'function')
            ? window.IconResolver.getIconSvg(iconTarget)
            : `<span class="face-dock-letter">${letter}</span>`;
          btn.innerHTML = iconSvg;
          if (window.IconResolver && typeof window.IconResolver.tagIcon === 'function') {
            window.IconResolver.tagIcon(btn, iconTarget);
          }

          const refresh = (ms) => setTimeout(() => {
            if (wm && typeof wm.refreshNativeWindows === 'function') wm.refreshNativeWindows(true);
          }, ms);
          const activate = () => {
            if (wm && typeof wm.ensureDesktopLayer === 'function') wm.ensureDesktopLayer(false);
            if (window.TauriBridge) window.TauriBridge.invoke('activate_native_window', { id: nw.id }).catch(() => {});
            refresh(250);
          };
          const minimize = () => {
            if (window.TauriBridge) window.TauriBridge.invoke('minimize_native_window', { id: nw.id }).catch(() => {});
            refresh(250);
          };
          const close = () => {
            if (window.TauriBridge) window.TauriBridge.invoke('close_native_window', { id: nw.id }).catch(() => {});
            refresh(400);
          };

          btn.addEventListener('click', () => (nw.is_active ? minimize() : activate()));
          btn.addEventListener('auxclick', (e) => {
            if (e.button === 1) {
              e.preventDefault();
              close();
            }
          });
          btn.addEventListener('contextmenu', (e) => {
            if (!wm || typeof wm.showTabMenu !== 'function') return;
            e.preventDefault();
            e.stopPropagation();
            wm.showTabMenu(e, [
              { label: 'Öne getir', run: activate },
              { label: 'Küçült', run: minimize },
              { label: 'Kapat', danger: true, run: close }
            ]);
          });
          dock.appendChild(btn);
        });

        if (window.IconResolver && typeof window.IconResolver.upgradeScope === 'function') {
          window.IconResolver.upgradeScope(dock);
        }
      }

      // Yüz 8: Açık pencere sayısı ve üst çubuk sekme hapları
      const countEl = document.querySelector('.civata-open-count');
      if (countEl) {
        countEl.textContent = String(openWins.length + nativeWins.length);
      }

      const civataTabs = document.getElementById('civata-running-tabs');
      if (civataTabs) {
        civataTabs.replaceChildren();
        openWins.forEach(win => {
          const titleSpan = win.querySelector('.window-meta span');
          const title = titleSpan ? titleSpan.textContent.split(/ [—–-] /)[0].trim() : 'Pencere';
          const isActive = win.classList.contains('active') && !win.classList.contains('minimized');
          const pill = document.createElement('button');
          pill.type = 'button';
          pill.className = `civata-tab-pill${isActive ? ' active' : ''}`;
          pill.title = title;
          pill.textContent = title.substring(0, 22);
          pill.addEventListener('click', () => this.openApp(win.id));
          civataTabs.appendChild(pill);
        });

        nativeWins.forEach(nw => {
          const rawTitle = nw.title || nw.app_name || 'Uygulama';
          const shortTitle = rawTitle.split(/ [—–-] /).pop().trim().substring(0, 22) || nw.app_name || 'Uygulama';
          const pill = document.createElement('button');
          pill.type = 'button';
          pill.className = `civata-tab-pill native-task-tab${nw.is_active ? ' active' : ''}`;
          pill.setAttribute('data-native-id', nw.id);
          pill.title = `${rawTitle} (${nw.app_name || 'X11'})`;
          pill.textContent = shortTitle;
          pill.addEventListener('click', () => {
            if (nw.is_active) {
              if (window.TauriBridge) window.TauriBridge.invoke('minimize_native_window', { id: nw.id }).catch(() => {});
            } else {
              if (wm && typeof wm.ensureDesktopLayer === 'function') wm.ensureDesktopLayer(false);
              if (window.TauriBridge) window.TauriBridge.invoke('activate_native_window', { id: nw.id }).catch(() => {});
            }
            setTimeout(() => {
              if (wm && typeof wm.refreshNativeWindows === 'function') wm.refreshNativeWindows(true);
            }, 250);
          });
          civataTabs.appendChild(pill);
        });
      }
    },

    startClock() {
      const tick = () => {
        this.updateClockDisplay();
      };
      tick();
      setInterval(tick, 1000);
    },

    updateClockDisplay() {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

      const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
      const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

      const dayName = days[now.getDay()];
      const dayNum = now.getDate();
      const monthName = months[now.getMonth()];

      // Yüz 2
      const bakirDate = document.querySelector('.bakir-cap-date');
      const bakirTime = document.querySelector('.bakir-cap-time');
      const bakirTrayTime = document.querySelector('.bakir-tray-time');
      if (bakirDate) bakirDate.innerHTML = `${dayName} <b>${dayNum} ${monthName}</b>`;
      if (bakirTime) bakirTime.textContent = timeStr;
      if (bakirTrayTime) bakirTrayTime.textContent = timeStr;

      // Yüz 3
      const bostanDate = document.querySelector('.bostan-top-date');
      const bostanLiveTime = document.querySelector('.bostan-live-time');
      const bostanLiveDay = document.querySelector('.bostan-live-day');
      if (bostanDate) bostanDate.textContent = `${dayNum} ${monthName} ${dayName}`;
      if (bostanLiveTime) bostanLiveTime.textContent = timeStr;
      if (bostanLiveDay) bostanLiveDay.textContent = dayName;

      // Yüz 8
      const civataTop = document.querySelector('.civata-top-datetime');
      const civataLiveTime = document.querySelector('.civata-live-time');
      const civataLiveSub = document.querySelector('.civata-live-sub');
      if (civataTop) civataTop.textContent = `${dayNum} ${monthName} ${dayName} ${timeStr}`;
      if (civataLiveTime) civataLiveTime.textContent = timeStr;
      if (civataLiveSub) civataLiveSub.textContent = `${dayName}, ${dayNum} ${monthName}`;
    }
  };

  window.FaceManager = FaceManager;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => FaceManager.init());
  } else {
    FaceManager.init();
  }

})();

(() => {
  'use strict';

  // ============================================================================
  // AYAZ DE · ARAYÜZ YÜZLERİ / FACES YÖNETİCİSİ (FaceManager)
  // Antislop UI Mimarisi: default (Arduvaz), 2 (Bakır), 3 (Bostan), 8 (Cıvata) + legacy (4.7)
  // ============================================================================

  const FaceManager = {
    currentFace: '3',

    init() {
      // 1. Kabuk DOM kapsayıcılarını oluştur
      this.ensureShellContainers();

      // 2. Kayıtlı yüzü yükle (varsayılan: Bostan '3')
      const savedFace = (window.SafeStorage && window.SafeStorage.getItem('ankora_face')) || '3';
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

      // Tüm yüzlerde sağ altta küçük Ankora AI konuşma balonu:
      // yüz paletini CSS'ten alır, tıklandığında mini sohbet penceresini açar.
      if (!document.getElementById('face-ai-bubble')) {
        const bubble = document.createElement('button');
        bubble.id = 'face-ai-bubble';
        bubble.type = 'button';
        bubble.className = 'face-ai-bubble';
        bubble.title = 'Ankora AI Konuşma Balonu';
        bubble.setAttribute('aria-label', 'Ankora AI konuşma balonunu aç');
        bubble.setAttribute('aria-expanded', 'false');
        bubble.setAttribute('aria-controls', 'ai-mini-popover');
        bubble.innerHTML = '<img class="face-ai-logo" src="logo.svg" width="16" height="16" alt="" aria-hidden="true"><span class="face-ai-text">Ankora AI</span>';
        bubble.addEventListener('click', (e) => {
          e.stopPropagation();
          if (typeof window.toggleAiMiniChat === 'function') {
            window.toggleAiMiniChat();
          } else if (typeof WindowManager !== 'undefined' && WindowManager.open) {
            WindowManager.open('win-ai');
          }
        });
        document.body.appendChild(bubble);
      }
    },

    setFace(faceId, persist = true, syncTheme = true) {
      let id = String(faceId || '3');
      if (!['default', 'legacy', '2', '3', '8'].includes(id)) id = '3';
      this.currentFace = id;
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

      if (persist && syncTheme && window.ThemeManager && typeof window.ThemeManager.setTheme === 'function') {
        const isFull = typeof window.ThemeManager.isFullSystemTheme === 'function'
          ? window.ThemeManager.isFullSystemTheme()
          : true;
        if (isFull) {
          const faceThemes = {
            default: 'theme-dark',
            '2': 'theme-bakir',
            '3': 'theme-bostan',
            '8': 'theme-civata',
            legacy: 'theme-classic-dark'
          };
          const targetTheme = faceThemes[this.currentFace];
          if (targetTheme && window.ThemeManager.currentTheme !== targetTheme) {
            window.ThemeManager.setTheme(targetTheme, true);
          }
        }
      }

      this.renderFaceShell();
      if (window.XdgDesktopEngine && typeof window.XdgDesktopEngine.layoutDesktopIcons === 'function') {
        window.XdgDesktopEngine.layoutDesktopIcons();
        requestAnimationFrame(() => window.XdgDesktopEngine.layoutDesktopIcons());
      }
      if (window.WindowManager && typeof window.WindowManager.clampAllWindows === 'function') {
        window.WindowManager.clampAllWindows();
        requestAnimationFrame(() => window.WindowManager.clampAllWindows());
      }
      if (window.TauriBridge && typeof window.TauriBridge.invoke === 'function') {
        const tbH = (window.ThemeManager && parseInt(window.ThemeManager.currentTaskbarHeight, 10))
          || parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-height'), 10)
          || 40;
        const isPanelTop = document.body.classList.contains('panel-top');
        let margins = { top: 0, bottom: tbH };
        if (this.currentFace === 'default') {
          margins = isPanelTop ? { top: tbH, bottom: 0 } : { top: 0, bottom: tbH };
        } else if (this.currentFace === 'legacy') {
          margins = { top: 0, bottom: tbH };
        } else {
          const fm = { '2': [34, 70], '3': [36, 68], '8': [32, 42] }[this.currentFace];
          if (fm) margins = { top: fm[0], bottom: fm[1] };
        }
        window.TauriBridge.invoke('set_openbox_margins', margins).catch(() => {});
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

      if (this.currentFace === 'default' || this.currentFace === 'legacy') {
        const island = document.getElementById('dynamic-island-container');
        if (island) {
          const diEnabled = window.DynamicIsland && typeof window.DynamicIsland.isEnabled === 'function'
            ? window.DynamicIsland.isEnabled()
            : false;
          island.style.display = diEnabled ? 'flex' : 'none';
        }
        return;
      }
      // Dinamik Ada (Kapsül) 2/3/8 yüzlerinde gizlenir; kendi üst panelleri vardır.
      const island = document.getElementById('dynamic-island-container');
      if (island) {
        island.style.setProperty('display', 'none', 'important');
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
      const safeCity = String(wx.city || 'Ankara').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      const bW = document.querySelector('.bostan-hero-weather');
      if (bW) bW.innerHTML = `${safeCity}'da <b>${wx.temp}°</b>, güncel hava durumu · serin esinti`;
      const cW = document.querySelector('.civata-hero-weather');
      if (cW) cW.innerHTML = `${safeCity} <b>${wx.temp}°</b>, güncel hava durumu`;
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
    // YÜZ 2: BAKIR (34px Sıcak Grafit Üst Çubuk + Merkezlenmiş Mat Alt Dock)
    // ------------------------------------------------------------------------
    renderBakir(topPanel, dock, meta) {
      if (meta) meta.textContent = '';

      const leftGroup = document.createElement('div');
      leftGroup.className = 'bakir-panel-left';

      const startBtn = document.createElement('button');
      startBtn.type = 'button';
      startBtn.className = 'bakir-start-btn ayaz-start-trigger';
      startBtn.title = 'Uygulamalar Menüsü (Ctrl + Boşluk)';
      startBtn.setAttribute('aria-label', 'Uygulamalar menüsünü aç');
      startBtn.innerHTML = `<img src="logo.svg" alt="" width="15" height="15" class="face-brand-logo" aria-hidden="true"><span>Uygulamalar</span>`;
      startBtn.addEventListener('click', (e) => this.toggleStartMenu(e));
      leftGroup.appendChild(startBtn);

      const activePill = document.createElement('span');
      activePill.className = 'bakir-win-pill';
      activePill.id = 'bakir-active-title';
      activePill.textContent = 'Ankora Linux';
      leftGroup.appendChild(activePill);

      const wsGroup = document.createElement('div');
      wsGroup.className = 'face-ws-group';
      wsGroup.setAttribute('role', 'group');
      wsGroup.setAttribute('aria-label', 'Çalışma Alanları');
      const activeWs = (window.WorkspaceManager && window.WorkspaceManager.active) || 1;
      for (let i = 1; i <= 4; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `face-ws-btn${i === activeWs ? ' active' : ''}`;
        btn.setAttribute('data-ws', String(i));
        btn.textContent = String(i);
        btn.title = `Çalışma Alanı ${i}`;
        btn.setAttribute('aria-label', `Çalışma Alanı ${i}`);
        btn.addEventListener('click', () => {
          if (window.WorkspaceManager) window.WorkspaceManager.set(i);
          wsGroup.querySelectorAll('.face-ws-btn').forEach((b, idx) => {
            b.classList.toggle('active', idx + 1 === i);
          });
        });
        wsGroup.appendChild(btn);
      }
      leftGroup.appendChild(wsGroup);
      topPanel.appendChild(leftGroup);

      const sp = document.createElement('div');
      sp.className = 'face-panel-spacer';
      topPanel.appendChild(sp);
      this.ensureMediaBar(topPanel);

      const tray = document.createElement('div');
      tray.className = 'face-tray-group';
      tray.innerHTML = `
        <button type="button" class="bakir-tray-btn tray-click-wifi" title="Ağ Durumu ve Hızlı Ayarlar" aria-label="Ağ ve Hızlı Ayarlar">
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15a11 11 0 0 1 16 0M7.5 18a6 6 0 0 1 9 0"/><circle cx="12" cy="20.4" r=".9"/></svg>
        </button>
        <button type="button" class="bakir-tray-btn tray-click-audio" title="Ses ve Parlaklık" aria-label="Ses ve Parlaklık">
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="2.4" height="8"/><rect x="9" y="7" width="2.4" height="11"/><rect x="14" y="9" width="2.4" height="9"/></svg>
        </button>
        <span class="bakir-tray-tag" title="Klavye Yerleşimi">TR</span>
        <button type="button" class="bakir-tray-time" title="Takvim ve Bildirimler" aria-label="Saat ve Takvim"></button>
      `;
      tray.querySelector('.tray-click-wifi').addEventListener('click', (e) => {
        e.stopPropagation();
        const el = document.getElementById('tray-wifi-btn') || document.getElementById('tray-status-island');
        if (el) el.click();
      });
      tray.querySelector('.tray-click-audio').addEventListener('click', (e) => {
        e.stopPropagation();
        const el = document.getElementById('tray-volume-btn') || document.getElementById('tray-status-island');
        if (el) el.click();
      });
      tray.querySelector('.bakir-tray-time').addEventListener('click', (e) => {
        e.stopPropagation();
        const clk = document.getElementById('tray-clock');
        if (clk) clk.click();
      });
      topPanel.appendChild(tray);

      // Alt Bakır Dock (Merkezlenmiş 50px Mat Şerit)
      const apps = [
        { id: 'files', winId: 'win-files', title: 'Dosyalar', icon: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.3l2 2.2H19.5A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>', action: () => this.openApp('win-files') },
        { id: 'brave', winId: 'win-browser', title: 'Brave Web Tarayıcısı', icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polygon points="10.2 10.2 15.5 8.5 13.8 13.8 8.5 15.5 10.2 10.2"/>', action: () => this.launchOrToggleBrave() },
        { id: 'store', winId: 'win-store', title: 'Ankora Mağaza', icon: '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>', action: () => this.openApp('win-store') },
        { id: 'terminal', winId: 'win-terminal', title: 'Terminal', icon: '<rect x="3" y="4.5" width="18" height="15" rx="1.5"/><path d="M7.5 9.5l3 2.5-3 2.5M12.5 15h4.5"/>', action: () => this.openApp('win-terminal') },
        { id: 'settings', winId: 'win-settings', title: 'Sistem Ayarları', icon: '<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="14.5" cy="7" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="17" r="2"/>', action: () => this.openApp('win-settings') },
        { sep: true },
        { id: 'start', title: 'Uygulama Menüsü', icon: '<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/>', action: (e) => this.toggleStartMenu(e) }
      ];

      apps.forEach(app => {
        if (app.sep) {
          const sep = document.createElement('span');
          sep.className = 'face-dock-sep-static';
          sep.setAttribute('aria-hidden', 'true');
          dock.appendChild(sep);
          return;
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'face-dock-app';
        btn.setAttribute('data-app-id', app.id);
        if (app.winId) btn.setAttribute('data-win-id', app.winId);
        btn.title = app.title;
        btn.setAttribute('aria-label', app.title);
        btn.innerHTML = `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${app.icon}</svg>`;
        btn.addEventListener('click', (e) => app.action(e));
        dock.appendChild(btn);
      });
    },

    // ------------------------------------------------------------------------
    // YÜZ 3: BOSTAN (36px Aydınlık Keten Üst Çubuk + Kompakt Alt Kapsül Dock)
    // ------------------------------------------------------------------------
    renderBostan(topPanel, dock, hero) {
      if (hero) hero.innerHTML = '';

      const leftGroup = document.createElement('div');
      leftGroup.className = 'bostan-panel-left';

      const startBtn = document.createElement('button');
      startBtn.type = 'button';
      startBtn.className = 'bostan-start-btn ayaz-start-trigger';
      startBtn.title = 'Uygulamalar Menüsü (Ctrl + Boşluk)';
      startBtn.setAttribute('aria-label', 'Uygulamalar menüsünü aç');
      startBtn.innerHTML = `<img src="logo.svg" alt="" width="15" height="15" class="face-brand-logo" aria-hidden="true"><span>Uygulamalar</span>`;
      startBtn.addEventListener('click', (e) => this.toggleStartMenu(e));
      leftGroup.appendChild(startBtn);

      const wsGroup = document.createElement('div');
      wsGroup.className = 'bostan-ws-group';
      wsGroup.setAttribute('role', 'group');
      wsGroup.setAttribute('aria-label', 'Çalışma Alanları');
      const activeWs = (window.WorkspaceManager && window.WorkspaceManager.active) || 1;
      for (let i = 1; i <= 4; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `face-ws-btn${i === activeWs ? ' active' : ''}`;
        btn.setAttribute('data-ws', String(i));
        btn.textContent = String(i);
        btn.title = `Çalışma Alanı ${i}`;
        btn.setAttribute('aria-label', `Çalışma Alanı ${i}`);
        btn.addEventListener('click', () => {
          if (window.WorkspaceManager) window.WorkspaceManager.set(i);
          wsGroup.querySelectorAll('.face-ws-btn').forEach((b, idx) => {
            b.classList.toggle('active', idx + 1 === i);
          });
        });
        wsGroup.appendChild(btn);
      }
      leftGroup.appendChild(wsGroup);

      const topNote = document.createElement('span');
      topNote.className = 'bostan-top-note';
      topNote.id = 'bostan-active-title';
      topNote.textContent = 'Bostan Yüzü · Aydınlık Çalışma Ortamı';
      leftGroup.appendChild(topNote);

      topPanel.appendChild(leftGroup);

      const sp = document.createElement('div');
      sp.style.flex = '1';
      topPanel.appendChild(sp);

      this.ensureMediaBar(topPanel);

      const tray = document.createElement('div');
      tray.className = 'bostan-tray-group';
      tray.innerHTML = `
        <button type="button" class="bostan-tray-btn bostan-tray-wifi" title="Ağ &amp; Hızlı Ayarlar" aria-label="Ağ ve Hızlı Ayarlar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14a11 11 0 0 1 16 0"></path><path d="M7.5 17.5a6 6 0 0 1 9 0"></path><circle cx="12" cy="20.4" r="1" fill="currentColor"></circle></svg>
        </button>
        <button type="button" class="bostan-tray-btn bostan-tray-audio" title="Ses &amp; Parlaklık" aria-label="Ses ve Parlaklık">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
        </button>
        <button type="button" class="bostan-tray-note bostan-tray-settings" title="Görünüm ve Ayarlar">Ayarlar</button>
      `;
      tray.querySelector('.bostan-tray-wifi').addEventListener('click', (e) => {
        e.stopPropagation();
        const el = document.getElementById('tray-wifi-btn') || document.getElementById('tray-status-island');
        if (el) el.click();
      });
      tray.querySelector('.bostan-tray-audio').addEventListener('click', (e) => {
        e.stopPropagation();
        const el = document.getElementById('tray-volume-btn') || document.getElementById('tray-status-island');
        if (el) el.click();
      });
      tray.querySelector('.bostan-tray-settings').addEventListener('click', () => this.openApp('win-settings'));

      const clk = document.createElement('button');
      clk.type = 'button';
      clk.className = 'bostan-top-clock bostan-top-date';
      clk.title = 'Takvim ve Bildirimler';
      clk.setAttribute('aria-label', 'Saat ve Takvim');
      clk.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetClk = document.getElementById('tray-clock');
        if (targetClk) targetClk.click();
      });
      tray.appendChild(clk);
      topPanel.appendChild(tray);

      // Alt Kompakt Kapsül Dock (Prototip ile 1:1)
      const apps = [
        { id: 'files', winId: 'win-files', title: 'Dosyalar', icon: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.3l2 2.2H19.5A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>', action: () => this.openApp('win-files') },
        { id: 'brave', winId: 'win-browser', title: 'Brave Web Tarayıcısı', icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polygon points="10.2 10.2 15.5 8.5 13.8 13.8 8.5 15.5 10.2 10.2"/>', action: () => this.launchOrToggleBrave() },
        { id: 'store', winId: 'win-store', title: 'Yazılım Mağazası', icon: '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>', action: () => this.openApp('win-store') },
        { id: 'terminal', winId: 'win-terminal', title: 'Terminal', icon: '<rect x="3" y="4.5" width="18" height="15" rx="1.5"/><path d="M7.5 9.5l3 2.5-3 2.5M12.5 15h4.5"/>', action: () => this.openApp('win-terminal') },
        { id: 'settings', winId: 'win-settings', title: 'Sistem Ayarları', icon: '<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="14.5" cy="7" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="17" r="2"/>', action: () => this.openApp('win-settings') }
      ];

      apps.forEach(app => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'face-dock-app';
        btn.setAttribute('data-app-id', app.id);
        if (app.winId) btn.setAttribute('data-win-id', app.winId);
        btn.title = app.title;
        btn.setAttribute('aria-label', app.title);
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${app.icon}</svg>`;
        btn.addEventListener('click', (e) => app.action(e));
        dock.appendChild(btn);
      });
    },

    // ------------------------------------------------------------------------
    // YÜZ 8: CIVATA (32px Teknik Kâğıt Üst Çubuk + 42px Alt Araç Şeridi)
    // ------------------------------------------------------------------------
    renderCivata(topPanel, dock, hero) {
      if (hero) hero.innerHTML = '';

      topPanel.innerHTML = `
        <button type="button" class="civata-brand civata-sys-tag ayaz-start-trigger" title="Ankora / Uygulamalar" aria-label="Ankora menüsünü aç">
          <img src="logo.svg" alt="" width="14" height="14" class="face-brand-logo" aria-hidden="true">
          <span>ANKORA/08</span>
        </button>
        <button type="button" class="civata-bar-btn civata-btn-apps ayaz-start-trigger">UYGULAMALAR</button>
        <button type="button" class="civata-bar-btn civata-btn-wins" title="Açık pencereler genel görünümü">PENCERE: <strong class="civata-open-count">0</strong></button>
        <div class="civata-running-tabs" id="civata-running-tabs"></div>
        <div style="flex:1;"></div>
        <div class="civata-media-slot"></div>
        <button type="button" class="civata-tray-btn civata-btn-ai" title="Ankora AI" aria-label="Ankora AI">AI</button>
        <button type="button" class="civata-tray-btn civata-btn-wifi" title="Ağ &amp; Hızlı Ayarlar" aria-label="Ağ ve Hızlı Ayarlar">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="M4 14a11 11 0 0 1 16 0"></path><path d="M7.5 17.5a6 6 0 0 1 9 0"></path><circle cx="12" cy="20.4" r="1" fill="currentColor"></circle></svg>
        </button>
        <button type="button" class="civata-tray-btn civata-btn-audio" title="Ses &amp; Parlaklık" aria-label="Ses ve Parlaklık">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
        </button>
        <button type="button" class="civata-top-datetime" title="Takvim ve Bildirimler" aria-label="Saat ve Takvim"></button>
      `;
      const mediaSlot = topPanel.querySelector('.civata-media-slot');
      const mediaBar = this.ensureMediaBar(topPanel);
      if (mediaSlot && mediaBar && mediaBar.parentNode === topPanel) {
        topPanel.insertBefore(mediaBar, mediaSlot);
        mediaSlot.remove();
      } else if (mediaSlot) {
        mediaSlot.remove();
      }

      topPanel.querySelector('.civata-brand').addEventListener('click', (e) => this.toggleStartMenu(e));
      topPanel.querySelector('.civata-btn-apps').addEventListener('click', (e) => this.toggleStartMenu(e));
      topPanel.querySelector('.civata-btn-wins').addEventListener('click', () => {
        if (window.WorkspaceManager && window.WorkspaceManager.toggleOverview) {
          window.WorkspaceManager.toggleOverview();
        }
      });
      topPanel.querySelector('.civata-btn-ai').addEventListener('click', () => this.openApp('win-ai'));
      topPanel.querySelector('.civata-btn-wifi').addEventListener('click', (e) => {
        e.stopPropagation();
        const el = document.getElementById('tray-wifi-btn') || document.getElementById('tray-status-island');
        if (el) el.click();
      });
      topPanel.querySelector('.civata-btn-audio').addEventListener('click', (e) => {
        e.stopPropagation();
        const el = document.getElementById('tray-volume-btn') || document.getElementById('tray-status-island');
        if (el) el.click();
      });
      topPanel.querySelector('.civata-top-datetime').addEventListener('click', (e) => {
        e.stopPropagation();
        const clk = document.getElementById('tray-clock');
        if (clk) clk.click();
      });

      // Alt Teknik Araç Şeridi (Prototip ile 1:1)
      if (dock) {
        const apps = [
          { id: 'files', winId: 'win-files', label: '[1] DOSYALAR', title: 'Dosyalar', action: () => this.openApp('win-files') },
          { id: 'brave', winId: 'win-browser', label: '[2] BRAVE', title: 'Brave Web Tarayıcısı', action: () => this.launchOrToggleBrave() },
          { id: 'store', winId: 'win-store', label: '[3] MAĞAZA', title: 'Yazılım Mağazası', action: () => this.openApp('win-store') },
          { id: 'terminal', winId: 'win-terminal', label: '[4] TERMİNAL', title: 'Uçbirim (Terminal)', action: () => this.openApp('win-terminal') },
          { id: 'settings', winId: 'win-settings', label: '[5] AYARLAR', title: 'Sistem Ayarları', action: () => this.openApp('win-settings') },
          { id: 'start', label: '[0] MENÜ', title: 'Uygulamalar Menüsü', action: (e) => this.toggleStartMenu(e) }
        ];

        apps.forEach(app => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'face-dock-app';
          btn.setAttribute('data-app-id', app.id);
          if (app.winId) btn.setAttribute('data-win-id', app.winId);
          btn.title = app.title;
          btn.setAttribute('aria-label', app.title);
          btn.innerHTML = `<span class="civata-strip-label">${app.label}</span>`;
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
        if (braveNative.is_active && !(wm && wm._isLayerAbove)) {
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
      const flyoutOpen = !!document.getElementById('start-flyout')?.classList.contains('open');
      document.querySelectorAll('.bostan-start-btn, .bakir-start-btn, .civata-btn-apps').forEach(btn => {
        btn.classList.toggle('active', flyoutOpen);
      });
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
      if (this.currentFace === 'default' || this.currentFace === 'legacy') return;

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

          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `face-dock-app face-dock-dynamic face-dock-pin${isRunning ? ' running' : ''}${isActive ? ' active' : ''}`;
          btn.setAttribute('data-app-id', resolved.id || '');
          if (matchedInternal) btn.setAttribute('data-win-id', matchedInternal.id);
          if (matchedNative) btn.setAttribute('data-native-id', matchedNative.id);
          const pinLabel = resolved.name || resolved.id || 'Uygulama';
          btn.title = `${pinLabel}${isRunning ? ' (Açık)' : ''}\nSağ tık: seçenekler`;
          btn.setAttribute('aria-label', pinLabel);
          const iconSvg = (window.IconResolver && window.IconResolver.getIconSvg)
            ? window.IconResolver.getIconSvg(resolved)
            : `<span class="face-dock-letter">${String(resolved.name || '?').charAt(0).toUpperCase()}</span>`;
          btn.innerHTML = iconSvg;
          if (window.IconResolver && window.IconResolver.tagIcon) {
            window.IconResolver.tagIcon(btn, resolved);
          }
          if (this.currentFace === '8') {
            const lbl = document.createElement('span');
            lbl.className = 'civata-strip-label';
            lbl.textContent = pinLabel.substring(0, 14).toLocaleUpperCase('tr');
            btn.appendChild(lbl);
          }
          btn.addEventListener('click', () => {
            if (matchedInternal) {
              this.openApp(matchedInternal.id);
            } else if (matchedNative) {
              if (matchedNative.is_active && !(wm && wm._isLayerAbove)) {
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

          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `face-dock-app face-dock-dynamic running${isActive ? ' active' : ''}`;
          btn.setAttribute('data-win-id', win.id);
          btn.title = title;
          btn.setAttribute('aria-label', title);
          if (this.currentFace === '8') {
            btn.innerHTML = `<span class="civata-strip-label">${title.substring(0, 14).replace(/[<>&"']/g, '').toLocaleUpperCase('tr')}</span>`;
          } else {
            btn.innerHTML = svg
              ? svg.outerHTML
              : `<span class="face-dock-letter">${title.charAt(0).toLocaleUpperCase('tr')}</span>`;
          }
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

          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `face-dock-app face-dock-dynamic face-dock-native native-task-tab running${nw.is_active ? ' active' : ''}`;
          btn.setAttribute('data-native-id', nw.id);
          btn.setAttribute('data-app-id', appKey);
          btn.title = `${rawTitle} (${nw.app_name || 'X11'})`;
          btn.setAttribute('aria-label', shortTitle);

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
          if (this.currentFace === '8') {
            const lbl = document.createElement('span');
            lbl.className = 'civata-strip-label';
            lbl.textContent = shortTitle.substring(0, 14).toLocaleUpperCase('tr');
            btn.appendChild(lbl);
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

      const activeNative = nativeWins.find(nw => nw.is_active);
      const activeInternal = openWins.find(w => w.classList.contains('active') && !w.classList.contains('minimized'))
        || openWins.find(w => !w.classList.contains('minimized'));
      let activeTitle = '';
      if (activeNative) {
        const rawT = activeNative.title || activeNative.app_name || '';
        activeTitle = rawT.split(/ [—–-] /).pop().trim().substring(0, 32);
      } else if (activeInternal) {
        const spanT = activeInternal.querySelector('.window-meta span');
        activeTitle = spanT ? spanT.textContent.split(/ [—–-] /)[0].trim().substring(0, 32) : '';
      }
      const bostanTitle = document.getElementById('bostan-active-title');
      if (bostanTitle) bostanTitle.textContent = activeTitle || 'Bostan Yüzü · Aydınlık Çalışma Ortamı';
      const bakirTitle = document.getElementById('bakir-active-title');
      if (bakirTitle) bakirTitle.textContent = activeTitle || 'Ankora Linux';

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
      const bakirTrayTime = document.querySelector('.bakir-tray-time');
      if (bakirTrayTime) {
        bakirTrayTime.textContent = timeStr;
        bakirTrayTime.title = `${dayNum} ${monthName} ${dayName} · Takvim ve Bildirimler`;
      }

      // Yüz 3
      const bostanDate = document.querySelector('.bostan-top-date');
      if (bostanDate) {
        bostanDate.textContent = timeStr;
        bostanDate.title = `${dayNum} ${monthName} ${dayName} · Takvim ve Bildirimler`;
      }

      // Yüz 8
      const civataTop = document.querySelector('.civata-top-datetime');
      if (civataTop) {
        civataTop.textContent = timeStr;
        civataTop.title = `${dayNum} ${monthName} ${dayName} · Takvim ve Bildirimler`;
      }
    }
  };

  window.FaceManager = FaceManager;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => FaceManager.init());
  } else {
    FaceManager.init();
  }

})();

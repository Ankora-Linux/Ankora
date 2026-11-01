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
        this.renderCivata(topPanel, hero);
      }

      this.updateClockDisplay();
      this.syncRunningState();
    },

    // ------------------------------------------------------------------------
    // YÜZ 2: BAKIR
    // ------------------------------------------------------------------------
    renderBakir(topPanel, dock, meta) {
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
        { id: 'brave', winId: 'win-browser', title: 'Brave Web Tarayıcısı', icon: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c-3 4-3 12 0 16M12 4c3 4 3 12 0 16"/>', action: () => this.openApp('win-browser') },
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
        if (window.IconResolver && app.id !== 'start') {
          window.IconResolver.tagIcon(btn, { id: app.id, exec: app.id, icon: app.id });
        }
        dock.appendChild(btn);
      });
      if (window.IconResolver) window.IconResolver.upgradeScope(dock);

      // 3. Masaüstü Metanotu
      meta.textContent = 'ankora / oturum: canlı · çekirdek 6.1';
    },

    // ------------------------------------------------------------------------
    // YÜZ 3: BOSTAN
    // ------------------------------------------------------------------------
    renderBostan(topPanel, dock, hero) {
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
      hero.innerHTML = `
        <div class="bostan-hero-time">
          <span class="bostan-live-time"></span><small class="bostan-live-day"></small>
        </div>
        <p class="bostan-hero-weather">
          Ankara'da <b>14°</b>, açık akşam · serin esinti
        </p>
      `;

      // 3. Alt Yeşil Kapsül Dock
      const apps = [
        { id: 'start', title: 'Başlat Menüsü', icon: '<circle cx="8" cy="8" r="3.4"/><rect x="9.4" y="9.4" width="7.6" height="7.6"/>', action: (e) => this.toggleStartMenu(e) },
        { id: 'files', winId: 'win-files', title: 'Dosyalar', icon: '<path d="M3 7h6l2 2h10v10H3z"/>', action: () => this.openApp('win-files') },
        { id: 'brave', winId: 'win-browser', title: 'Brave Web Tarayıcısı', icon: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c-3 4-3 12 0 16M12 4c3 4 3 12 0 16"/>', action: () => this.openApp('win-browser') },
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
        if (window.IconResolver && app.id !== 'start') {
          window.IconResolver.tagIcon(btn, { id: app.id, exec: app.id, icon: app.id });
        }
        dock.appendChild(btn);
      });
      if (window.IconResolver) window.IconResolver.upgradeScope(dock);
    },

    // ------------------------------------------------------------------------
    // YÜZ 8: CIVATA
    // ------------------------------------------------------------------------
    renderCivata(topPanel, hero) {
      // 1. Üst Siyah Teknik Çubuk (30px)
      topPanel.innerHTML = `
        <b class="civata-brand" title="Başlat Menüsü">Ankora</b>
        <span class="civata-nav-item civata-btn-apps">uygulamalar</span>
        <span class="civata-nav-item civata-btn-wins">açık pencereler <em class="civata-highlight civata-open-count">0</em></span>
        <div style="flex:1;"></div>
        <span class="civata-nav-item civata-btn-ai" style="margin-right:12px;">ada: <em class="civata-highlight">genişletilmiş</em></span>
        <span class="civata-top-datetime"></span>
      `;

      topPanel.querySelector('.civata-brand').addEventListener('click', (e) => this.toggleStartMenu(e));
      topPanel.querySelector('.civata-btn-apps').addEventListener('click', (e) => this.toggleStartMenu(e));
      topPanel.querySelector('.civata-btn-wins').addEventListener('click', () => {
        if (window.WorkspaceManager && window.WorkspaceManager.toggleOverview) {
          window.WorkspaceManager.toggleOverview();
        }
      });
      topPanel.querySelector('.civata-btn-ai').addEventListener('click', () => this.openApp('win-ai'));

      // 2. Sol Dev Display Saat & Hava Durumu
      hero.innerHTML = `
        <div class="civata-hero-time">
          <span class="civata-live-time"></span>
          <small class="civata-live-sub"></small>
        </div>
        <p class="civata-hero-weather">
          Ankara <b>14°</b>, açık akşam · bu gece 6°
        </p>
      `;
    },

    // ------------------------------------------------------------------------
    // YARDIMCILAR & ETKİLEŞİM
    // ------------------------------------------------------------------------
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

      const openWins = Array.from(document.querySelectorAll('.window.open'));
      const activeWin = document.querySelector('.window.open.active:not(.minimized)');

      // Yüz 2 & 3: Dock göstergelerini güncelle
      document.querySelectorAll('#face-bottom-dock .face-dock-app').forEach(btn => {
        const winId = btn.getAttribute('data-win-id');
        if (!winId) return;
        const win = document.getElementById(winId);
        const isOpen = win && win.classList.contains('open');
        const isActive = win && win.classList.contains('active') && !win.classList.contains('minimized');

        btn.classList.toggle('running', !!isOpen);
        btn.classList.toggle('active', !!isActive);
      });

      // Yüz 8: Açık pencere sayısı
      const countEl = document.querySelector('.civata-open-count');
      if (countEl) {
        countEl.textContent = String(openWins.length);
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

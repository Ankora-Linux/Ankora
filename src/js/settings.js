// Ayaz DE Modülü: settings.js
// Karşılayıcı, Kurulum Sihirbazı, Tema Yöneticisi, Stüdyo ve Sistem Ayarları
(() => {
  'use strict';

  // ============================================================================
  // 7. ANKORA KARŞILAYICI (WELCOME MANAGER - DESKTOP PREVIEW)
  // ============================================================================
  const WelcomeManager = {
    async init() {
      // 1. Tema Değiştirici (Sun / Moon Switch)
      const themeToggle = document.getElementById('welcome-theme-toggle');
      if (themeToggle) {
        themeToggle.addEventListener('click', () => {
          ThemeManager.toggleLightDark();
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
    _installing: false,
    _progressUnlisten: null,

    async init() {
      const step1Next = document.getElementById('btn-step1-next');
      const btnRefresh = document.getElementById('btn-refresh-disks');
      const step2Prev = document.getElementById('btn-step2-prev');
      const step2Next = document.getElementById('btn-step2-next');
      const step3Prev = document.getElementById('btn-step3-prev');
      const btnStart = document.getElementById('btn-start-real-install');
      const btnRetry = document.getElementById('btn-installer-retry');
      const btnReboot = document.getElementById('btn-installer-reboot');

      if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
          btnRefresh.disabled = true;
          this.loadDisks().finally(() => { btnRefresh.disabled = false; });
        });
      }
      if (step1Next) step1Next.addEventListener('click', () => this.goToStep(2));
      if (step2Prev) step2Prev.addEventListener('click', () => this.goToStep(1));
      if (step2Next) step2Next.addEventListener('click', () => this.goToStep(3));
      if (step3Prev) step3Prev.addEventListener('click', () => this.goToStep(2));

      if (btnStart) {
        btnStart.addEventListener('click', () => this.runInstall());
      }
      if (btnRetry) {
        btnRetry.addEventListener('click', () => {
          if (!this._installing) this.goToStep(1);
        });
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
        box.replaceChildren();

        if (!disks || disks.length === 0) {
          this.selectedDisk = null;
          box.innerHTML = `
            <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">
              Kurulum yapılabilecek uygun bir sabit disk veya depolama sürücüsü bulunamadı.<br>
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
      if (this._installing) return;
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

      this._installing = true;
      const btnStart = document.getElementById('btn-start-real-install');
      if (btnStart) btnStart.disabled = true;

      this.goToStep(4);
      const progress = document.getElementById('inst-wizard-progress');
      const logs = document.getElementById('installer-logs-view');
      const finishNav = document.getElementById('installer-finish-nav');
      const btnRetry = document.getElementById('btn-installer-retry');
      const btnReboot = document.getElementById('btn-installer-reboot');
      const execTitle = document.getElementById('inst-exec-title');
      const execDesc = document.getElementById('inst-exec-desc');

      if (logs) logs.replaceChildren();
      if (finishNav) finishNav.style.display = 'none';
      if (btnRetry) btnRetry.style.display = 'none';
      if (btnReboot) btnReboot.style.display = '';
      if (execTitle) execTitle.textContent = 'Ankora Linux Kuruluyor...';
      if (execDesc) execDesc.textContent = 'Lütfen bekleyin, canlı imaj hedef diske kopyalanıyor.';
      if (progress) {
        progress.style.backgroundColor = '';
        progress.style.width = '5%';
      }

      const append = (msg, cls = 'muted') => {
        if (!logs) return;
        const row = document.createElement('div');
        row.className = `term-row ${cls}`;
        row.textContent = msg;
        logs.appendChild(row);
        logs.scrollTop = logs.scrollHeight;
      };

      if (this._progressUnlisten) {
        try { this._progressUnlisten(); } catch (e) {}
        this._progressUnlisten = null;
      }
      if (window.__TAURI__?.event?.listen) {
        try {
          this._progressUnlisten = await window.__TAURI__.event.listen('install-progress', (ev) => {
            const d = ev?.payload || {};
            if (progress && Number.isFinite(Number(d.percent))) {
              progress.style.width = `${Math.max(5, Math.min(100, Number(d.percent)))}%`;
            }
            if (d.message) append(d.message, d.level || 'muted');
          });
        } catch (e) {}
      }

      append(`Hedef disk hazırlanıyor: ${this.selectedDisk}...`);
      if (progress) progress.style.width = '10%';

      try {
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
        if (execTitle) execTitle.textContent = 'Kurulum Tamamlandı';
        if (execDesc) execDesc.textContent = 'Sistemi yeniden başlatıp USB belleği çıkarabilirsiniz.';
        append(`${res}`, 'cmd');
        if (finishNav) finishNav.style.display = 'flex';
        if (btnRetry) btnRetry.style.display = 'none';
        if (btnReboot) btnReboot.style.display = '';
      } catch (err) {
        if (progress) progress.style.backgroundColor = 'var(--danger, #ef4444)';
        if (execTitle) execTitle.textContent = 'Kurulum Başarısız Oldu';
        if (execDesc) execDesc.textContent = 'Hata ayrıntıları aşağıdadır; diski kontrol edip tekrar deneyebilirsiniz.';
        append(`[KURULUM HATASI] ${err.message || err}`, 'error');
        ReportManager.showToast(`Kurulum hatası: ${err.message || err}`);
        if (finishNav) finishNav.style.display = 'flex';
        if (btnReboot) btnReboot.style.display = 'none';
        if (btnRetry) btnRetry.style.display = '';
      } finally {
        this._installing = false;
        if (btnStart) btnStart.disabled = false;
        if (this._progressUnlisten) {
          try { this._progressUnlisten(); } catch (e) {}
          this._progressUnlisten = null;
        }
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
    currentTheme: 'theme-bostan',
    // Açık temaları ayrı liste olarak yürüt; GTK tarafına da bunlar 'isDark=false' gider.
    LIGHT_THEMES: ['theme-light', 'theme-arctic', 'theme-bostan', 'theme-civata'],
    // TÜM SİSTEM TEMA PAKETLERİ: Bir tema seçildiğinde yalnızca pencere
    // renkleri değil, eşleşen duvar kağıdı + ikon seti + vurgu rengi de
    // birlikte uygulanır (kullanıcı "bütün sistemin teması değişsin" isteği).
    // 'ankora_theme_fullsystem' kaydı ile kapatılabilir.
    THEME_BUNDLES: {
      'theme-dark':         { wallpaper: 'wallpaper-arduvaz.jpg',      iconset: 'monokrom', accent: '#cc5d35' },
      'theme-light':        { wallpaper: 'wallpaper-arduvaz-acik.jpg', iconset: 'outline',  accent: '#b84a24' },
      'theme-bakir':        { wallpaper: 'wallpaper-bakir.jpg',        iconset: 'monokrom', accent: '#d1794f' },
      'theme-bostan':       { wallpaper: 'wallpaper-bostan.jpg',       iconset: 'outline',  accent: '#3b7230' },
      'theme-civata':       { wallpaper: 'wallpaper-civata.jpg',       iconset: 'monokrom', accent: '#1d4ed8' },
      // Yayımlanan 4.7 Klasik Temalar (isteğe bağlı korundu)
      'theme-classic-dark': { wallpaper: 'wallpaper-kobalt.jpg',       iconset: 'nordic',   accent: '#2563eb' },
      'theme-midnight':     { wallpaper: 'wallpaper-kozmik.jpg',       iconset: 'ink',      accent: '#3b82f6' },
      'theme-nord':         { wallpaper: 'wallpaper-gece-yolu.jpg',    iconset: 'nordic',   accent: '#ffffff' },
      'theme-evergreen':    { wallpaper: 'wallpaper-sonbahar-sisi.jpg', iconset: 'emerald', accent: '#059669' },
      'theme-ember':        { wallpaper: 'wallpaper-bakir.jpg',        iconset: 'sunset',   accent: '#ea580c' },
      'theme-arctic':       { wallpaper: 'wallpaper-karli-safak.jpg',  iconset: 'pastel',   accent: '#059669' },
      'theme-cumhuriyet':   { wallpaper: 'wallpaper-kozmik.jpg',       iconset: 'monokrom', accent: '#e23744' }
    },

    isFullSystemTheme() {
      // Varsayılan: açık (kullanıcı isteği: tema tüm sistemi kapsasın).
      return SafeStorage.getItem('ankora_theme_fullsystem') !== 'false';
    },
    currentAccent: '#3b7230',
    currentWallpaper: 'wallpaper-bostan.jpg',
    currentRadius: '6px',
    currentGlass: 'solid',
    currentTaskbarAlign: 'left',
    currentTaskbarHeight: '44px',
    currentPanelPos: 'bottom',
    currentAnimSpeed: 'smooth',

    init() {
      // 1. Kaydedilmiş tercihleri yükle (kaldırılmış tema ID'leri Bostan'a düşer; 'theme-custom' korunur)
      const rawSavedTheme = SafeStorage.getItem('ankora_theme_mode') || 'theme-bostan';
      const savedTheme = (rawSavedTheme === 'theme-custom' || this.THEME_BUNDLES[rawSavedTheme]) ? rawSavedTheme : 'theme-bostan';
      const savedAccent = SafeStorage.getItem('ankora_accent_color') || '#3b7230';
      const legacySvgToNatural = {
        'wallpaper-bostan.svg': 'wallpaper-bostan.jpg',
        'wallpaper-bakir.svg': 'wallpaper-bakir.jpg',
        'wallpaper-arduvaz.svg': 'wallpaper-arduvaz.jpg',
        'wallpaper-arduvaz-acik.svg': 'wallpaper-arduvaz-acik.jpg',
        'wallpaper-civata.svg': 'wallpaper-civata.jpg'
      };
      const rawSavedWp = SafeStorage.getItem('ankora_wallpaper') || 'wallpaper-bostan.jpg';
      const savedWp = legacySvgToNatural[rawSavedWp] || rawSavedWp;
      if (legacySvgToNatural[rawSavedWp]) {
        SafeStorage.setItem('ankora_wallpaper', savedWp);
      }
      const savedRadius = SafeStorage.getItem('ankora_corner_radius') || '6px';
      const savedGlass = SafeStorage.getItem('ankora_window_glass') || 'solid';
      const savedAlign = SafeStorage.getItem('ankora_taskbar_align') || 'left';
      const savedHeight = SafeStorage.getItem('ankora_taskbar_height') || '44px';
      const savedPanelPos = SafeStorage.getItem('ankora_panel_pos') || 'bottom';
      const savedAnim = SafeStorage.getItem('ankora_anim_speed') || 'smooth';
      const savedIconSet = SafeStorage.getItem('ankora_icon_set') || 'outline';

      this.setTheme(savedTheme, false);
      this.setAccent(savedAccent, false);
      this.setWallpaper(savedWp, false);
      this.setCornerRadius(savedRadius, false);
      this.setWindowGlass(savedGlass, false);
      this.setTaskbarAlign(savedAlign, false);
      this.setTaskbarHeight(savedHeight, false);
      this.setPanelPos(savedPanelPos, false);
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

        // Panel Konumu (Alt / Üst - Arduvaz Yüzü)
        const panelPosBtn = e.target.closest('#group-panel-position .option-pill-btn');
        if (panelPosBtn) {
          const p = panelPosBtn.getAttribute('data-panel-pos');
          if (p) this.setPanelPos(p);
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

    setTheme(themeName, persist = true, applyBundle = false) {
      if (themeName !== 'theme-custom' && !this.THEME_BUNDLES[themeName]) {
        themeName = 'theme-bostan';
      }
      this.currentTheme = themeName;
      // Tüm theme-* sınıfları kaldırılır; yalnızca aktif tema eklenir.
      Array.from(document.body.classList)
        .filter(c => c.startsWith('theme-'))
        .forEach(c => document.body.classList.remove(c));
      if (themeName !== 'theme-dark') {
        document.body.classList.add(themeName);
      }
      const isLight = this.LIGHT_THEMES.includes(themeName);
      document.body.classList.toggle('is-light-theme', isLight);
      document.documentElement.classList.toggle('is-light-theme', isLight);
      document.querySelectorAll('.theme-card-choice').forEach(card => {
        card.classList.toggle('active', card.getAttribute('data-theme') === themeName);
      });

      const qsThemeBtn = document.getElementById('qs-theme-toggle');
      const qsThemeSub = document.getElementById('qs-theme-sub');
      if (qsThemeBtn) qsThemeBtn.classList.toggle('active', isLight);
      if (qsThemeSub) qsThemeSub.textContent = isLight ? 'Açık Mod' : 'Koyu Mod';

      if (persist) {
        SafeStorage.setItem('ankora_theme_mode', themeName);
        Terminal.log(`[TEMA] Sistem teması uygulandı: ${themeName}`, 'cmd');
      }

      // Açık/koyu tema ile yüz mimarisinin çakışmasını önle (ör. Bostan üstünde koyu tema)
      if (persist && themeName !== 'theme-custom' && window.FaceManager && typeof window.FaceManager.setFace === 'function') {
        const curFace = window.FaceManager.currentFace;
        let syncedFace = null;
        if (!isLight && (curFace === '3' || curFace === '8')) {
          syncedFace = themeName === 'theme-bakir' ? '2' : (themeName === 'theme-classic-dark' ? 'legacy' : 'default');
        } else if (isLight && curFace === '2') {
          syncedFace = themeName === 'theme-bostan' ? '3' : (themeName === 'theme-civata' ? '8' : 'default');
        }
        if (syncedFace && syncedFace !== curFace) {
          window.FaceManager.setFace(syncedFace, true, false);
        }
      }

      // TÜM SİSTEM TEMA PAKETİ: Kullanıcı isteği üzerine tema değişimi
      // duvar kağıdı + ikon seti + vurgu rengini de birlikte geçirir.
      // Yanlış tetiklenmemesi için yalnız kullanıcı tıklamasında (persist)
      // ve "tüm sistem" anahtarı açıksa uygulanır.
      const bundle = this.THEME_BUNDLES && this.THEME_BUNDLES[themeName];
      if (bundle && (persist || applyBundle) && (this.isFullSystemTheme() || applyBundle)) {
        if (bundle.accent && bundle.accent !== this.currentAccent) {
          this.setAccent(bundle.accent, persist);
        }
        if (bundle.iconset) {
          this.setIconSet(bundle.iconset, persist);
        }
        if (bundle.wallpaper) {
          this.setWallpaper(bundle.wallpaper, persist);
        }
        if (persist) {
          Terminal.log(`[TEMA] Tüm sistem teması paketi uygulandı: ${themeName} (simge: ${bundle.iconset}, kağıt: ${bundle.wallpaper})`, 'success');
        }
      }

      // XSettings & GTK Tema Senkronizasyonu (xsettingsd, GTK-2/3/4, gsettings)
      const isDark = !this.LIGHT_THEMES.includes(themeName);
      TauriBridge.invoke('sync_desktop_theme', { isDark, accent: this.currentAccent || '#3b7230' }).catch(() => {});
    },

    toggleLightDark() {
      const curFace = (window.FaceManager && window.FaceManager.currentFace) || '3';
      const isLight = document.body.classList.contains('is-light-theme')
        || this.LIGHT_THEMES.includes(this.currentTheme);
      if ((curFace === '3' || curFace === '8') && window.FaceManager && typeof window.FaceManager.setFace === 'function') {
        window.FaceManager.setFace('2', true);
        return;
      }
      if (curFace === '2' && window.FaceManager && typeof window.FaceManager.setFace === 'function') {
        window.FaceManager.setFace('3', true);
        return;
      }
      this.setTheme(isLight ? 'theme-dark' : 'theme-light', true);
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

      const isDark = !(this.LIGHT_THEMES || ['theme-light']).includes(this.currentTheme);
      TauriBridge.invoke('sync_desktop_theme', { isDark, accent: colorHex }).catch(() => {});
    },

    setWallpaper(wpFile, persist = true) {
      if (!wpFile || typeof wpFile !== 'string') return;
      // M3: CSS injection engeli - tırnak, ters eğik çizgi ve parantez karakterlerini temizle
      const cleanWp = wpFile.replace(/["'\\()]/g, '').trim();
      this.currentWallpaper = cleanWp;
      const elWp = document.getElementById('desktop-wallpaper');
      if (elWp && cleanWp) {
        const darkSvgNames = ['wallpaper.svg', 'wallpaper-topo.svg', 'wallpaper-nordic.svg'];
        const wpBase = cleanWp.split('/').pop().toLowerCase();
        elWp.classList.toggle('is-svg-wp', darkSvgNames.includes(wpBase));
        elWp.style.backgroundImage = `url("${encodeURI(cleanWp)}")`;
      }

      document.querySelectorAll('.wp-thumb-card, .wp-card').forEach(card => {
        card.classList.toggle('active', card.getAttribute('data-wp') === cleanWp);
      });

      if (persist) {
        SafeStorage.setItem('ankora_wallpaper', cleanWp);
        TauriBridge.invoke('set_desktop_wallpaper', { filePath: cleanWp }).catch(() => {});
        Terminal.log(`[DUVAR KAĞIDI] Arka plan güncellendi: ${cleanWp}`, 'cmd');
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
      const h = Math.min(60, Math.max(32, parseInt(height, 10) || 44));
      const cleanHeight = `${h}px`;
      const dockH = Math.round(h * 1.36);
      const dockBtn = Math.max(32, dockH - 14);
      const dockIcon = Math.max(24, dockH - 20);
      const tbIcon = Math.min(36, Math.max(20, h - 16));

      this.currentTaskbarHeight = cleanHeight;
      const rootStyle = document.documentElement.style;
      rootStyle.setProperty('--taskbar-height', cleanHeight);
      rootStyle.setProperty('--dock-height', `${dockH}px`);
      rootStyle.setProperty('--dock-btn-size', `${dockBtn}px`);
      rootStyle.setProperty('--dock-icon-size', `${dockIcon}px`);
      rootStyle.setProperty('--taskbar-icon-size', `${tbIcon}px`);

      // Ayarlar > Alt Panel & Saat kaydırıcısı ile Kişiselleştirme düğmelerini senkronize tut
      if (typeof PanelPrefs !== 'undefined' && PanelPrefs.state) {
        PanelPrefs.state.height = h;
        if (persist) {
          try { localStorage.setItem(PanelPrefs.KEY, JSON.stringify(PanelPrefs.state)); } catch (e) {}
        }
      }
      const rng = document.getElementById('panel-height-range');
      const val = document.getElementById('panel-height-value');
      if (rng && rng.value !== String(h)) rng.value = String(h);
      if (val) val.textContent = `${h} px`;

      document.querySelectorAll('#group-taskbar-size .option-pill-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-height') === cleanHeight);
      });

      if (typeof WindowManager !== 'undefined' && typeof WindowManager.clampAllWindows === 'function') {
        WindowManager.clampAllWindows();
      }
      if (typeof TauriBridge !== 'undefined' && typeof TauriBridge.invoke === 'function') {
        const curFace = (window.FaceManager && window.FaceManager.currentFace) || '3';
        let margins = null;
        if (curFace === 'default' || curFace === 'legacy') {
          const isTop = curFace === 'default' && this.currentPanelPos === 'top';
          margins = { top: isTop ? h : 0, bottom: isTop ? 0 : h };
        } else if (curFace === '3') {
          margins = { top: 28, bottom: dockH + 16 };
        } else if (curFace === '2') {
          margins = { top: 32, bottom: dockH + 16 };
        } else if (curFace === '8') {
          margins = { top: 46, bottom: 0 };
        }
        if (margins) TauriBridge.invoke('set_openbox_margins', margins).catch(() => {});
      }

      if (persist) {
        SafeStorage.setItem('ankora_taskbar_height', cleanHeight);
        Terminal.log(`[KİŞİSELLEŞTİRME] Alt panel / dock yüksekliği: ${cleanHeight}`, 'cmd');
      }
    },

    setPanelPos(pos, persist = true) {
      const cleanPos = pos === 'top' ? 'top' : 'bottom';
      this.currentPanelPos = cleanPos;
      document.documentElement.classList.toggle('panel-top', cleanPos === 'top');
      document.body.classList.toggle('panel-top', cleanPos === 'top');

      document.querySelectorAll('#group-panel-position .option-pill-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-panel-pos') === cleanPos);
      });

      if (typeof XdgDesktopEngine !== 'undefined' && typeof XdgDesktopEngine.layoutDesktopIcons === 'function') {
        XdgDesktopEngine.layoutDesktopIcons();
        requestAnimationFrame(() => XdgDesktopEngine.layoutDesktopIcons());
      }
      if (typeof WindowManager !== 'undefined' && typeof WindowManager.clampAllWindows === 'function') {
        WindowManager.clampAllWindows();
        requestAnimationFrame(() => WindowManager.clampAllWindows());
      }
      if (window.FaceManager && window.FaceManager.currentFace === 'default' && typeof TauriBridge !== 'undefined' && typeof TauriBridge.invoke === 'function') {
        const tbH = parseInt(this.currentTaskbarHeight, 10) || 40;
        TauriBridge.invoke('set_openbox_margins', {
          top: cleanPos === 'top' ? tbH : 0,
          bottom: cleanPos === 'bottom' ? tbH : 0
        }).catch(() => {});
      }

      if (persist) {
        SafeStorage.setItem('ankora_panel_pos', cleanPos);
        Terminal.log(`[KİŞİSELLEŞTİRME] Panel konumu: ${cleanPos === 'top' ? 'Üst' : 'Alt'}`, 'cmd');
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
  // TEMA STÜDYOSU (STUDIO: GALERI + KENDI TEMA PAKETI)
  // ============================================================================
  const Studio = {
    STUDIO_THEME_IDS: ['theme-dark', 'theme-light', 'theme-bakir', 'theme-bostan', 'theme-civata'],

    // Galeri ürünü: yalnız ThemeManager.setTheme çağırır; kendisi CSS yazmaz.
    lastRemoteWarned: null,
    status(msg, isError) {
      const el = document.getElementById('studio-status');
      if (!el) return;
      el.textContent = msg;
      el.style.color = isError ? 'var(--accent-active, #e0553a)' : 'var(--text-muted)';
    },

    open() {
      WindowManager.open('win-studio');
      setTimeout(() => {
        this.renderThemeList();
        // Editör boşsa kayıtlı özel temayı geri yükleyip kaldığı yerden düzenletir.
        const ta = document.getElementById('studio-css');
        if (ta && !ta.value.trim()) this.loadSavedToEditor();
      }, 60);
    },

    swatchFor(themeId) {
      const b = (typeof ThemeManager !== 'undefined' && ThemeManager.THEME_BUNDLES[themeId]) || {};
      return { accent: b.accent || '#2563eb' };
    },

    renderThemeList() {
      const list = document.getElementById('studio-theme-list');
      if (!list || typeof ThemeManager === 'undefined') return;
      const META = {
        'theme-dark':   { name: 'Arduvaz Koyu', desc: 'Mat kömür ve terakota vurgu',    bg: '#15171a' },
        'theme-light':  { name: 'Arduvaz Açık', desc: 'Sıcak keten ve koyu mürekkep',  bg: '#eae7df' },
        'theme-bakir':  { name: 'Bakır',        desc: 'Grafit ve sıcak bakır vurgu',    bg: '#141519' },
        'theme-bostan': { name: 'Bostan',       desc: 'Adaçayı yeşili, mat açık',       bg: '#e6ebd8' },
        'theme-civata': { name: 'Cıvata',       desc: 'Teknik kâğıt, is ve kobalt',     bg: '#fcfcf9' }
      };
      const current = ThemeManager.currentTheme;
      list.replaceChildren();
      this.STUDIO_THEME_IDS.forEach(id => {
        const m = META[id] || { name: id, desc: '', bg: '#16171b' };
        const item = document.createElement('div');
        item.className = 'studio-theme-item' + (current === id ? ' active' : '');
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');
        const sw = document.createElement('span');
        sw.className = 'studio-theme-swatch';
        sw.style.background = m.bg;
        sw.style.borderBottom = `3px solid ${(this.swatchFor(id).accent)}`;
        item.appendChild(sw);
        const info = document.createElement('div');
        const strong = document.createElement('b');
        strong.textContent = m.name;
        const span = document.createElement('span');
        span.textContent = m.desc;
        info.appendChild(strong);
        info.appendChild(span);
        item.appendChild(info);
        const go = () => {
          ThemeManager.setTheme(id);
          list.querySelectorAll('.studio-theme-item').forEach(x => x.classList.remove('active'));
          item.classList.add('active');
          this.status(`"${m.name}" tüm sisteme uygulandı.`);
        };
        item.addEventListener('click', go);
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
        });
        list.appendChild(item);
      });
    },

    cssTemplate() {
      // Stüdyo şablonu: eksiksiz değişken listesi; eksik değişken temanın
      // sızmasına yol açtığı için tam blok zorunlu.
      return 'body.theme-custom {\n' +
        '  --bg-deep: #0c0d12;\n' +
        '  --bg-base: #16171b;\n' +
        '  --bg-panel: #1b1c22;\n' +
        '  --bg-surface: #24252d;\n' +
        '  --bg-surface-hover: #2e3039;\n' +
        '  --bg-surface-active: #393b45;\n' +
        '  --border-subtle: rgba(255, 255, 255, 0.08);\n' +
        '  --border-medium: rgba(255, 255, 255, 0.15);\n' +
        '  --border-focus: rgba(255, 255, 255, 0.38);\n' +
        '  --border-active-window: #c9754f;\n' +
        '  --border-highlight: #ece7db;\n' +
        '  --text-primary: #ece7db;\n' +
        '  --text-secondary: #a8a396;\n' +
        '  --text-muted: #8d887c;\n' +
        '  --text-inverse: #16171b;\n' +
        '  --accent-white: #ece7db;\n' +
        '  --accent-gray: #79756a;\n' +
        '  --accent-active: #c9754f;\n' +
        '  --surface-flyout: #1c1d23;\n' +
        '  --taskbar-bg: rgba(22, 23, 27, 0.92);\n' +
        '  --desktop-bg: #0e0f13;\n' +
        '  --glass-taskbar: rgba(26, 27, 32, 0.7);\n' +
        '  --glass-flyout: rgba(26, 27, 32, 0.78);\n' +
        '}\n';
    },

    normalizeCss(raw) {
      const src = (raw || '').trim();
      if (!src) return '';
      // Kullanıcı yalnız değişkenleri yazarsa sarmala; blok yazılmışsa doğrudan al.
      if (/body\.theme-custom\s*\{/.test(src)) return src;
      return 'body.theme-custom {\n' + src + '\n}\n';
    },

    applyCustomCss(css, name) {
      let el = document.getElementById('user-theme-css');
      if (!el) {
        el = document.createElement('style');
        el.id = 'user-theme-css';
        document.head.appendChild(el);
      }
      el.textContent = css;
      if (typeof ThemeManager !== 'undefined') {
        ThemeManager.setTheme('theme-custom', false);
        ThemeManager.currentTheme = 'theme-custom';
        SafeStorage.setItem('ankora_theme_mode', 'theme-custom');
      }
      SafeStorage.setItem('ankora_custom_theme_css', css);
      const usedName = (name || '').trim();
      if (usedName) SafeStorage.setItem('ankora_custom_theme_name', usedName);
      else SafeStorage.removeItem('ankora_custom_theme_name');
      Terminal.log(`[TEMA STÜDYOSU] Özel tema uygulandı${usedName ? ': ' + usedName : ''}`, 'success');
      this.status(`Özel tema uygulandı${usedName ? ': ' + usedName : ''}. Değişiklik oturum kaydına alınabilir.`);
    },

    validate(css) {
      if (!css) return 'CSS alanı boş. Şablonu yükleyip düzenleyin.';
      const open = (css.match(/\{/g) || []).length;
      const close = (css.match(/\}/g) || []).length;
      if (open === 0 || open !== close) return 'CSS dengesiz: { ve } sayıları eşit değil.';
      if (!/body\.theme-custom/.test(css)) return 'Blok "body.theme-custom" seçicisiyle başlamalı. Şablonu yükleyin.';
      // Uzak kaynak taraması: yalnız uyarı, engel değil; kullanıcının kendi
      // teması olabilir ama izleme pikseli de olabilir.
      if (/url\(\s*['"]?https?:/i.test(css) || /@import/i.test(css)) {
        return 'UZAK KAYNAK UYARISI: CSS https url veya @import içeriyor; bu tema ağa bağlanabilir. Yine de uygulamak için Uygula\'ya ikinci kez basın.';
      }
      return null;
    },

    applyFromEditor() {
      const name = (document.getElementById('studio-name') || {}).value || '';
      const css = this.normalizeCss((document.getElementById('studio-css') || {}).value);
      const err = this.validate(css);
      if (err) {
        // Uzak kaynak uyarısında ikinci onay pas geçişi: kullanıcı aynı
        // içeriği bilerek uygularsa engel kalkar.
        const isWarn = err.indexOf('UZAK') === 0;
        if (isWarn && this.lastRemoteWarned === css) {
          this.applyCustomCss(css, name);
          return;
        }
        if (isWarn) this.lastRemoteWarned = css;
        this.status(err, true); return;
      }
      this.lastRemoteWarned = null;

      this.applyCustomCss(css, name);

      const radius = ((document.getElementById('studio-radius') || {}).value || '').trim();
      if (radius && /^\d+(px)$/.test(radius) && typeof ThemeManager !== 'undefined') {
        ThemeManager.setCornerRadius(radius);
      }

      const wpPath = ((document.getElementById('studio-wallpaper') || {}).value || '').trim();
      if (wpPath) {
        const isBundled = /^wallpaper[\w-]*\.(svg|jpg|png)$/.test(wpPath.split('/').pop());
        if (isBundled && typeof ThemeManager !== 'undefined') {
          ThemeManager.setWallpaper(wpPath);
        }
        TauriBridge.invoke('set_desktop_wallpaper', { filePath: wpPath })
          .then(() => this.status(`Özel tema uygulandı; masaüstü duvar kağıdı güncellendi.`))
          .catch(() => this.status('Özel tema uygulandı ama duvar kağıdı bulunamadı: yolu kontrol edin.', true));
      }
    },

    fillTemplate() {
      const ta = document.getElementById('studio-css');
      if (!ta) return;
      ta.value = this.cssTemplate();
      this.status('Şablon yüklendi; değişkenleri düzenleyip Uygula dedikten sonra geçerli olur.');
    },

    loadSavedToEditor() {
      const css = SafeStorage.getItem('ankora_custom_theme_css');
      if (!css) return;
      const ta = document.getElementById('studio-css');
      if (ta) ta.value = css;
      const nameEl = document.getElementById('studio-name');
      if (nameEl) nameEl.value = SafeStorage.getItem('ankora_custom_theme_name') || '';
    },

    saveSession() {
      // Uygulamadan bağımsız: editördeki içeriği oturum kaydına alır; Uygula
      // devreye almaya ayrıdır, kayıt yalnız biriktirme işidir.
      const ta = document.getElementById('studio-css');
      const css = this.normalizeCss(ta ? ta.value : '');
      if (!css) { this.status('Kaydedilecek içerik yok; önce şablonu yükleyin ya da CSS yazın.', true); return; }
      const name = (document.getElementById('studio-name') || {}).value || '';
      if (name.trim()) SafeStorage.setItem('ankora_custom_theme_name', name.trim());
      this.status('İçerik oturum kaydına alındı; Uygula ile devreye alınır.');
    },

    exportToClipboard() {
      const name = (document.getElementById('studio-name') || {}).value || '';
      const css = (document.getElementById('studio-css') || {}).value || '';
      const manifest = {
        name: name || 'isimsiz-tema',
        css: this.normalizeCss(css),
        wallpaper: (document.getElementById('studio-wallpaper') || {}).value || '',
        radius: (document.getElementById('studio-radius') || {}).value || '',
        format: 'ankora-theme/1'
      };
      TauriBridge.invoke('set_clipboard_text', { text: JSON.stringify(manifest, null, 2) })
        .then(() => this.status('Tema manifest panoya alındı.'))
        .catch(() => this.status('Panoya yazılamadı; metni elle seçip kopyalayın.', true));
    },

    async applyFromParsed(manifest) {
      if (!manifest || typeof manifest !== 'object' || manifest.format !== 'ankora-theme/1') {
        this.status('Manifest biçimi anlaşılamadı: "format":"ankora-theme/1" alanı şart.', true);
        return;
      }
      if (manifest.name) document.getElementById('studio-name').value = manifest.name;
      const ta = document.getElementById('studio-css');
      ta.value = this.normalizeCss(manifest.css || '');
      if (manifest.wallpaper) document.getElementById('studio-wallpaper').value = manifest.wallpaper;
      if (manifest.radius) document.getElementById('studio-radius').value = manifest.radius;
      const css = this.normalizeCss(manifest.css || '');
      const err = this.validate(css);
      if (err) {
        const isWarn = err.indexOf('UZAK') === 0;
        if (isWarn && this.lastRemoteWarned === css) {
          this.applyCustomCss(css, manifest.name || '');
        } else {
          if (isWarn) this.lastRemoteWarned = css;
          this.status(err, true);
          return;
        }
      } else {
        this.applyCustomCss(css, manifest.name || '');
      }
      const wp = (manifest.wallpaper || '').trim();
      if (wp) {
        if (/^wallpaper[\w-]*\.(svg|jpg|png)$/.test(wp.split('/').pop()) && typeof ThemeManager !== 'undefined') {
          ThemeManager.setWallpaper(wp);
        }
        TauriBridge.invoke('set_desktop_wallpaper', { filePath: wp }).catch(() => {});
      }
      if (manifest.radius && /^\d+(px)$/.test(manifest.radius) && typeof ThemeManager !== 'undefined') {
        ThemeManager.setCornerRadius(manifest.radius);
      }
    },

    applyFromClipboard() {
      const ta = document.getElementById('studio-css');
      if (!ta) return;
      const useClipboard = typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText;
      if (!useClipboard) {
        this.status('Panodan okuma izni yok; içeriği alana yapıştırıp Uygula\'ya basın.', true);
        return;
      }
      navigator.clipboard.readText().then(txt => {
        let manifest = null;
        try { manifest = JSON.parse(txt); } catch (e) { manifest = null; }
        if (manifest) { this.applyFromParsed(manifest); return; }
        // Manifest değilse düz CSS kabul et: alana aktar, Uygula'yı kullanıcıya bırak.
        ta.value = txt;
        this.status('Panodaki düz CSS alana aktarıldı; Uygula ile geçerli temanın üstüne biner.');
      }).catch(() => {
        this.status('Panodan okunamadı; içeriği alana yapıştırıp Uygula\'ya basın.', true);
      });
    },

    async applyFromFileContent(filePath) {
      try {
        const res = await TauriBridge.invoke('read_theme_file', { filePath });
        let manifest = null;
        try { manifest = JSON.parse(res.content); } catch (e) { manifest = null; }
        if (manifest) { await this.applyFromParsed(manifest); return; }
        // Manifest değilse düz CSS kabul et.
        const css = this.normalizeCss(res.content);
        const err = this.validate(css);
        if (err) {
          const isWarn = err.indexOf('UZAK') === 0;
          if (isWarn && this.lastRemoteWarned === css) {
            this.applyCustomCss(css, '');
            this.status('CSS dosyasından özel tema uygulandı (uzak kaynak uyarısı onaylandı).');
          } else {
            if (isWarn) this.lastRemoteWarned = css;
            this.status(err, true);
            return;
          }
        } else {
          this.applyCustomCss(css, '');
          this.status('CSS dosyasından özel tema uygulandı.');
        }
      } catch (e) {
        this.status('Tema dosyası okunamadı: ' + (e.message || e), true);
      }
    },

    importFromFile() {
      const path = window.prompt('Tema dosyasının tam yolu (.css veya .json):', '/home/ankora/Belgeler/temam.css');
      if (!path) return;
      this.applyFromFileContent(path.trim());
    },

    clearCustom() {
      const el = document.getElementById('user-theme-css');
      if (el) el.textContent = '';
      SafeStorage.removeItem('ankora_custom_theme_css');
      SafeStorage.removeItem('ankora_custom_theme_name');
      // Geri dönüş: varsayılan Bostan teması açılır.
      if (typeof ThemeManager !== 'undefined') ThemeManager.setTheme('theme-bostan');
      this.renderThemeList();
      this.status('Özel tema kaldırıldı; varsayılan Bostan temasına dönüldü.');
    },

    init() {
      const openBtn = document.getElementById('btn-open-studio');
      if (openBtn) openBtn.addEventListener('click', () => this.open());
      const bind = (id, fn) => {
        const b = document.getElementById(id);
        if (b) b.addEventListener('click', fn);
      };
      bind('btn-studio-apply', () => this.applyFromEditor());
      bind('btn-studio-template', () => this.fillTemplate());
      bind('btn-studio-save', () => this.saveSession());
      bind('btn-studio-export', () => this.exportToClipboard());
      bind('btn-studio-paste', () => this.applyFromClipboard());
      bind('btn-studio-import', () => this.importFromFile());
      bind('btn-studio-clear', () => this.clearCustom());

      // Oturum geri döndüğü: kayıtlı özel tema varsa enjuan norengi
      const saved = SafeStorage.getItem('ankora_custom_theme_css');
      if (saved && SafeStorage.getItem('ankora_theme_mode') === 'theme-custom') {
        let el = document.getElementById('user-theme-css');
        if (!el) {
          el = document.createElement('style');
          el.id = 'user-theme-css';
          document.head.appendChild(el);
        }
        el.textContent = saved;
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
        selRate.replaceChildren();
        if (!modeObj) return;
        (modeObj.rates || []).forEach(r => {
          const opt = document.createElement('option');
          opt.value = r;
          opt.textContent = `${parseFloat(r)} Hz`;
          if (r === info.current_rate) opt.selected = true;
          selRate.appendChild(opt);
        });
      };

      selMode.replaceChildren();
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
            listDetected.replaceChildren();
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
        const currentVer = (typeof UpdaterManager !== 'undefined' && UpdaterManager.currentVersion) ? UpdaterManager.currentVersion : '5.0.0';
        document.querySelectorAll('#tele-de').forEach(el => el.textContent = `Ayaz DE ${currentVer}`);
        document.querySelectorAll('#tele-iso').forEach(el => el.textContent = `ankora-linux-${currentVer}-ayaz-amd64.iso`);
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
          selTz.replaceChildren();
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
        if (dimmer) {
          const dimOpacity = ((100 - val) / 100) * 0.75;
          dimmer.style.display = dimOpacity > 0.005 ? 'block' : 'none';
          dimmer.style.opacity = dimOpacity.toString();
        }
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
          nightScreen.style.display = enabled ? 'block' : 'none';
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
        chkDynamicIsland.checked = SafeStorage.getItem('ankora_dynamic_island') === '1';
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

  Object.assign(window, { WelcomeManager, InstallerWizard, ThemeManager, Studio, SettingsManager });
})();

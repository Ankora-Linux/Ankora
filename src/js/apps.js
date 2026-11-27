// Ayaz DE Modülü: apps.js
// Güncelleyici, Görev Yöneticisi, Not Defteri, Hesap Makinesi, Tarayıcı, Bellek, Kısayollar, Kilit Ekranı, Dinamik Ada ve Raporlama
(() => {
  'use strict';

  // ============================================================================
  // 11. ANKORA GÜNCELLEYİCİ (ANKORA DE UPDATE MANAGER)
  // ============================================================================
  const UpdaterManager = {
    currentVersion: '5.0.0',
    latestRelease: null,

    init() {
      const currVerInit = document.getElementById('updater-curr-ver');
      if (currVerInit) currVerInit.textContent = `v${this.currentVersion}`;
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
      TauriBridge.listen('update-progress', (event) => {
        this.handleProgress(event.payload);
      });
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
        if (progressLabel) progressLabel.textContent = 'Paket kuruldu. Yeni sürümün devreye girmesi için oturumu yeniden başlatın.';

        if (btnApply) btnApply.style.display = 'none';
        const btnRestart = document.getElementById('btn-updater-restart');
        if (btnRestart) btnRestart.style.display = 'inline-block';

        Terminal.log('[GÜNCELLEME] Paket kuruldu. Yeni sürümün devreye girmesi için oturumu yeniden başlatın.', 'cmd');
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
      // Arka planda (sekme gizliyken) veya pencere sürüklenirken IPC/DOM çizimi beklemesin.
      if (document.hidden || document.body.classList.contains('is-dragging')) return;
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
      this.tableBody.replaceChildren();

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
        const token = window.__AYAZ_IPC_TOKEN__ || '';
        const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
        return `/proxy?url=${encodeURIComponent(url)}${tokenParam}`;
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
        this.iframe.src = 'about:blank';
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

      // Render modu: 3D hızlandırmasız VM / yazılım ekran kartı tespit edilirse
      // ağır backdrop-filter blur ve geniş gölgeler devre dışı bırakılır (60 FPS).
      TauriBridge.invoke('get_render_mode').then((mode) => {
        const isSw = String(mode || '').trim().toLowerCase() === 'software';
        document.body.classList.toggle('render-software', isSw);
      }).catch(() => {});

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
        if (!document.hidden && !document.body.classList.contains('is-dragging')) {
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
      if (AIAgent && AIAgent.miniFeed) {
        while (AIAgent.miniFeed.children.length > 15) {
          AIAgent.miniFeed.removeChild(AIAgent.miniFeed.firstChild);
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
      if (AIAgent && AIAgent.miniFeed && AIAgent.miniFeed.children.length > 15) {
        while (AIAgent.miniFeed.children.length > 15) {
          AIAgent.miniFeed.removeChild(AIAgent.miniFeed.firstChild);
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
      container.replaceChildren();

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
          if (typeof LockManager !== 'undefined') LockManager.lock();
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
        ReportManager?.showToast(`Ses: %${nxt}`);
      }).catch(() => {});
    }
    // Donanım Medya Tuşları: Ses Azaltma
    else if (e.key === 'AudioVolumeDown') {
      e.preventDefault();
      TauriBridge.invoke('get_volume').then((cur) => {
        const nxt = Math.max(0, (typeof cur === 'number' ? cur : 50) - 5);
        TauriBridge.invoke('set_volume', { level: nxt });
        ReportManager?.showToast(`Ses: %${nxt}`);
      }).catch(() => {});
    }
    // Donanım Medya Tuşları: Sessize Alma
    else if (e.key === 'AudioVolumeMute') {
      e.preventDefault();
      TauriBridge.invoke('get_volume').then((cur) => {
        const nxt = (cur > 0) ? 0 : 50;
        TauriBridge.invoke('set_volume', { level: nxt });
        ReportManager?.showToast(nxt === 0 ? 'Ses Kapatıldı' : `Ses: %${nxt}`);
      }).catch(() => {});
    }
    // Donanım Medya Tuşları: Ekran Parlaklığı Artırma
    else if (e.key === 'BrightnessUp') {
      e.preventDefault();
      TauriBridge.invoke('set_brightness', { level: 90 }).then(() => {
        ReportManager?.showToast('Parlaklık Artırıldı');
      }).catch(() => {});
    }
    // Donanım Medya Tuşları: Ekran Parlaklığı Azaltma
    else if (e.key === 'BrightnessDown') {
      e.preventDefault();
      TauriBridge.invoke('set_brightness', { level: 40 }).then(() => {
        ReportManager?.showToast('Parlaklık Azaltıldı');
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

      // Ayarlar ve Hızlı Ayarlar toggle senkronizasyonu
      const chk = document.getElementById('settings-dynamic-island');
      if (chk) {
        chk.checked = enabled;
        chk.addEventListener('change', () => {
          this.setEnabled(chk.checked);
        });
      }
      const qsTile = document.getElementById('qs-island-toggle');
      const qsSub = document.getElementById('qs-island-sub');
      if (qsTile) qsTile.classList.toggle('active', enabled);
      if (qsSub) qsSub.textContent = enabled ? 'Açık' : 'Kapalı';

      // Kapsüle tıklayınca aç/kapat (toggle)
      this.el.addEventListener('click', (e) => {
        if (e.target.closest('#di-card-close')) {
          this.collapse();
          return;
        }
        if (e.target.closest('.di-card-btn') || e.target.closest('.di-footer-lock-btn')) {
          return;
        }
        if (this.el.classList.contains('state-toast') || this.el.classList.contains('state-progress')) {
          return;
        }
        if (this.expanded) {
          this.collapse();
        } else {
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
      const btnDisable = document.getElementById('di-btn-disable');
      if (btnDisable) {
        btnDisable.addEventListener('click', (e) => {
          e.stopPropagation();
          this.collapse();
          this.setEnabled(false);
        });
      }

      // Kapsül üzerine sağ tık bağlam menüsü
      this.el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showContextMenu(e);
      });

      // Hızlı ayarlar (Quick Settings) Dinamik Ada anahtarı
      const qsIslandBtn = document.getElementById('qs-island-toggle');
      if (qsIslandBtn) {
        qsIslandBtn.addEventListener('click', () => {
          this.toggleEnabled();
        });
      }

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
      // MPRIS Medya kontrolleri dinleyicileri
      document.getElementById('di-media-btn-prev')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof MprisManager !== 'undefined') MprisManager.sendCommand('previous');
      });
      document.getElementById('di-media-btn-play')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof MprisManager !== 'undefined') MprisManager.sendCommand('play-pause');
      });
      document.getElementById('di-media-btn-next')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof MprisManager !== 'undefined') MprisManager.sendCommand('next');
      });


      // Canlı sistem telemetrisi (düşük RAM/CPU için gizliyken duraklar, 6 saniyede bir)
      setInterval(() => {
        if (!document.hidden && !(window.LockManager && window.LockManager.isLocked)) {
          this.updateTelemetry();
        }
      }, 6000);
      this.updateTelemetry();
    },

    isEnabled() {
      return SafeStorage.getItem(this.KEY) === '1';
    },

    toggleEnabled() {
      this.setEnabled(!this.isEnabled());
    },

    setEnabled(enabled) {
      SafeStorage.setItem(this.KEY, enabled ? '1' : '0');
      const container = document.getElementById('dynamic-island-container');
      if (container) container.style.display = enabled ? 'flex' : 'none';
      if (!enabled && this.expanded) this.collapse();

      const chk = document.getElementById('settings-dynamic-island');
      if (chk) chk.checked = enabled;

      const qsTile = document.getElementById('qs-island-toggle');
      const qsSub = document.getElementById('qs-island-sub');
      if (qsTile) qsTile.classList.toggle('active', enabled);
      if (qsSub) qsSub.textContent = enabled ? 'Açık' : 'Kapalı';

      if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
        ReportManager.showToast(enabled ? 'Dinamik Kapsül açıldı.' : 'Dinamik Kapsül kapatıldı (Ayarlar veya Hızlı Ayarlar\'dan tekrar açılabilir).');
      }
    },

    showContextMenu(e) {
      let menu = document.getElementById('di-context-menu');
      if (!menu) {
        menu = document.createElement('div');
        menu.id = 'di-context-menu';
        menu.className = 'desktop-context-menu';
        document.body.appendChild(menu);
      }
      menu.innerHTML = `
        <div class="ctx-item" data-action="expand"><span>Hızlı Denetim Kartını Aç</span></div>
        <div class="ctx-item" data-action="settings"><span>Dinamik Ada Ayarları</span></div>
        <div class="ctx-divider"></div>
        <div class="ctx-item ctx-danger" data-action="disable"><span>Kapsülü Kapat / Gizle</span></div>
      `;
      const x = Math.min(e.clientX, window.innerWidth - 220);
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
          if (act === 'expand') {
            this.expand();
          } else if (act === 'settings') {
            WindowManager.open('win-settings');
          } else if (act === 'disable') {
            this.setEnabled(false);
          }
        });
      });
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
    setMediaStatus(status) {
      if (!this.el || !this.isEnabled()) return;
      const isTransient = this.el.classList.contains('state-toast') ||
                          this.el.classList.contains('state-progress') ||
                          this.el.classList.contains('state-ai') ||
                          this.expanded;

      if (!status || !status.is_active || !status.player_name) {
        this.el.classList.remove('state-media', 'playing');
        if (!isTransient && !this.el.classList.contains('state-idle')) {
          this.el.classList.add('state-idle');
        }
        return;
      }

      const titleEl = document.getElementById('di-media-title');
      const artistEl = document.getElementById('di-media-artist');
      const playIcon = document.getElementById('di-media-play-icon');

      if (titleEl) titleEl.textContent = status.title || 'Müzik Çalıyor';
      if (artistEl) {
        const sub = [status.artist, status.player_name].filter(Boolean).join(' · ');
        artistEl.textContent = sub || 'Medya';
      }

      const isPlaying = (status.playback_status || '').toLowerCase() === 'playing';
      if (playIcon) {
        playIcon.innerHTML = isPlaying
          ? '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>'
          : '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
      }

      this.el.classList.toggle('playing', isPlaying);

      if (!isTransient) {
        this.el.classList.remove('state-idle');
        this.el.classList.add('state-media');
      }
    },


    flash(msg, kind = 'info', duration = 3200) {
      if (!this.el || !this.isEnabled()) return;
      clearTimeout(this.timer);
      const toastText = document.getElementById('di-toast-text');
      const toastSvg = document.getElementById('di-toast-svg');
      if (toastText) toastText.textContent = msg;
      if (toastSvg) {
        const iconId = kind === 'error' ? '#ico-alert' : (kind === 'success' ? '#ico-check' : '#ico-info');
        toastSvg.innerHTML = `<use href="${iconId}"></use>`;
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
        const idleCpu = document.getElementById('di-idle-cpu');
        const idleRam = document.getElementById('di-idle-ram');
        const cardCpu = document.getElementById('di-footer-cpu');
        const cardRam = document.getElementById('di-footer-ram');
        const weatherBtn = document.getElementById('di-btn-weather-text');

        const cpuText = data.cpu_usage !== undefined ? `CPU %${Math.round(data.cpu_usage)}` : 'CPU %--';
        const ramText = data.ram_used_mb ? (data.ram_used_mb >= 1024 ? `RAM ${(data.ram_used_mb / 1024).toFixed(1)} GB` : `RAM ${Math.round(data.ram_used_mb)} MB`) : 'RAM --';

        if (idleCpu) idleCpu.textContent = cpuText;
        if (idleRam) idleRam.textContent = ramText;
        if (cardCpu) cardCpu.textContent = cpuText;
        if (cardRam) cardRam.textContent = ramText;

        const idleWeather = document.getElementById('di-idle-weather');
        const tempEl = document.getElementById('dw-weather-temp');
        if (idleWeather && tempEl && tempEl.textContent && tempEl.textContent !== '--') {
          idleWeather.textContent = `${tempEl.textContent}°C`;
        }
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
        os_name: 'Devuan GNU/Linux 6 (excalibur)',
        kernel: 'Linux 6.12.0-amd64',
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
        md += `Masaüstü Ortamı : Ayaz DE v5.0.0 (Ankora Kiosk / X11)\n`;
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
      // Toast aynı zamanda bildirim merkezine de düşer
      try {
        if (typeof NotificationManager !== 'undefined' && NotificationManager.pushLocal) {
          NotificationManager.pushLocal(message);
        }
      } catch (e) {}

      // Eğer Dinamik Ada etkinse bildirimi ada içinde göster; çift bildirim/slop oluşmasın
      if (typeof DynamicIsland !== 'undefined' && DynamicIsland.isEnabled && DynamicIsland.isEnabled()) {
        DynamicIsland.flash(message, kind);
        return;
      }

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

  Object.assign(window, { UpdaterManager, TaskManager, NotepadManager, CalcManager, BrowserManager, MemoryManager, ShortcutManager, LockManager, DynamicIsland, ReportManager });
})();

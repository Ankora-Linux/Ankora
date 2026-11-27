// Ayaz DE Modülü: files.js
// Uçbirim, Dosya Yöneticisi, Ofis PDF görüntüleyici ve .deb/AppImage paket yükleyici
(() => {
  'use strict';

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
          if (this.logs) this.logs.replaceChildren();
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
        if (this.logs) this.logs.replaceChildren();
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
      this.initPathBarEditor();
      this.initKeyboardShortcuts();
      this.initProgressListener();
      this.loadDirectory('');
    },

    initPathBarEditor() {
      const bar = document.getElementById('files-path-bar');
      if (!bar) return;
      bar.addEventListener('click', (e) => {
        if (e.target.closest('.files-crumb') || e.target.closest('.files-path-input')) return;
        this.openPathEditor();
      });
    },

    openPathEditor() {
      const bar = document.getElementById('files-path-bar');
      const crumbs = document.getElementById('files-breadcrumbs');
      if (!bar || !crumbs) return;
      if (bar.querySelector('.files-path-input')) {
        bar.querySelector('.files-path-input').select();
        return;
      }
      crumbs.style.display = 'none';
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'files-path-input';
      inp.value = this.currentPath || this.userHome || '/';
      inp.style.cssText = 'flex:1;min-width:120px;background:transparent;border:none;outline:none;color:inherit;font-size:12.5px;font-family:inherit;';
      const close = () => {
        inp.remove();
        crumbs.style.display = '';
      };
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          let target = inp.value.trim().replace(/\\+/g, '/');
          if (target === '~' || target.startsWith('~/')) {
            const h = this.userHome || '/home/ankora';
            target = target === '~' ? h : `${h}${target.slice(1)}`;
          }
          close();
          if (target) this.loadDirectory(target);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          close();
        }
      });
      inp.addEventListener('blur', close);
      bar.appendChild(inp);
      inp.focus();
      inp.select();
    },

    getSelectedTargets() {
      if (Array.isArray(this.selectedItems) && this.selectedItems.length > 0) {
        return this.selectedItems.slice();
      }
      return this.selectedItem ? [this.selectedItem] : [];
    },

    selectAllVisible() {
      const cards = Array.from(document.querySelectorAll('#files-grid .files-item-card'));
      if (!cards.length) return;
      const visible = this.visibleSorted(this.items || []);
      this.selectedItems = visible.slice();
      this.selectedItem = visible[visible.length - 1] || null;
      cards.forEach(c => c.classList.add('selected'));
      const statusSelected = document.getElementById('files-status-selected');
      if (statusSelected) {
        statusSelected.textContent = `${this.selectedItems.length} öge seçili`;
      }
    },

    async trashSelected() {
      const picks = this.getSelectedTargets();
      if (!picks.length) {
        ReportManager?.showToast('Önce bir öge seçin.', 'error');
        return;
      }
      if (this.isTrashView) {
        await this.permanentDeleteSelected();
        return;
      }
      let okCount = 0;
      for (const it of picks) {
        try {
          await TauriBridge.invoke('move_to_trash', { path: it.path });
          okCount++;
        } catch (e) {
          ReportManager?.showToast(`Çöpe taşınamadı (${it.name}): ${e.message || e}`, 'error');
        }
      }
      if (okCount > 0) {
        ReportManager?.showToast(okCount > 1 ? `${okCount} öge çöp kutusuna taşındı.` : 'Öge çöp kutusuna taşındı.');
        this.refresh();
        DesktopFiles?.refresh?.();
      }
    },

    async permanentDeleteSelected() {
      const picks = this.getSelectedTargets();
      if (!picks.length) {
        ReportManager?.showToast('Önce bir öge seçin.', 'error');
        return;
      }
      const msg = picks.length > 1
        ? `Seçili ${picks.length} öge kalıcı olarak silinsin mi? Bu işlem geri alınamaz!`
        : `'${picks[0].name}' kalıcı olarak silinsin mi? Bu işlem geri alınamaz!`;
      if (!confirm(msg)) return;
      let okCount = 0;
      for (const it of picks) {
        try {
          await TauriBridge.invoke('delete_file', { path: it.path });
          okCount++;
        } catch (e) {
          ReportManager?.showToast(`Silinemedi (${it.name}): ${e.message || e}`, 'error');
        }
      }
      if (okCount > 0) {
        ReportManager?.showToast(okCount > 1 ? `${okCount} öge kalıcı olarak silindi.` : 'Öge kalıcı olarak silindi.');
        if (this.isTrashView) this.loadTrash();
        else this.refresh();
        DesktopFiles?.refresh?.();
      }
    },

    initKeyboardShortcuts() {
      if (this._keysBound) return;
      this._keysBound = true;
      document.addEventListener('keydown', (e) => {
        const winFiles = document.getElementById('win-files');
        if (!winFiles || !winFiles.classList.contains('open') || !winFiles.classList.contains('active')) return;
        const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) return;

        const key = (e.key || '').toLowerCase();
        if (e.ctrlKey && e.shiftKey && key === 'n') {
          e.preventDefault();
          this.promptNewFolder();
        } else if (e.ctrlKey && !e.altKey && key === 'h') {
          e.preventDefault();
          this.toggleHiddenFiles();
        } else if ((e.ctrlKey && !e.altKey && key === 'l') || (e.altKey && key === 'd')) {
          e.preventDefault();
          this.openPathEditor();
        } else if (e.ctrlKey && !e.altKey && key === 'a') {
          e.preventDefault();
          this.selectAllVisible();
        } else if (e.ctrlKey && !e.altKey && key === 'c') {
          e.preventDefault();
          this.clipboardAdd('copy');
        } else if (e.ctrlKey && !e.altKey && key === 'x') {
          e.preventDefault();
          this.clipboardAdd('cut');
        } else if (e.ctrlKey && !e.altKey && key === 'v') {
          e.preventDefault();
          this.pasteClipboard();
        } else if (e.key === 'F2') {
          e.preventDefault();
          if (this.selectedItem && !this.isTrashView) this.promptRename(this.selectedItem);
        } else if (e.key === 'Delete') {
          e.preventDefault();
          if (e.shiftKey) this.permanentDeleteSelected();
          else this.trashSelected();
        } else if (e.key === 'F5' || (e.ctrlKey && key === 'r')) {
          e.preventDefault();
          this.refresh();
        } else if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowUp')) {
          e.preventDefault();
          this.navigateUp();
        } else if (e.key === 'Enter' && this.selectedItem && !this.isTrashView) {
          e.preventDefault();
          this.openItem(this.selectedItem);
        }
      });
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
          this.trashSelected();
          break;
        case 'delete':
          this.permanentDeleteSelected();
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
          WindowManager.open('win-settings');
          document.querySelector('.settings-nav-item[data-pane="pane-set-about"]')?.click();
          break;
      }
    },

    nextUniqueLeaf(baseName) {
      const existing = new Set((this.items || []).map(it => String(it.name || '').toLocaleLowerCase('tr')));
      if (!existing.has(baseName.toLocaleLowerCase('tr'))) return baseName;
      const dotIdx = baseName.lastIndexOf('.');
      const hasExt = dotIdx > 0;
      const stem = hasExt ? baseName.slice(0, dotIdx) : baseName;
      const ext = hasExt ? baseName.slice(dotIdx) : '';
      for (let n = 2; n <= 99; n++) {
        const cand = `${stem} (${n})${ext}`;
        if (!existing.has(cand.toLocaleLowerCase('tr'))) return cand;
      }
      return `${stem} (${Date.now().toString().slice(-4)})${ext}`;
    },

    // Klasör/belge oluştur: hem boş-alan sağ tığı hem Dosya menüsünden.
    async promptCreateFile(kind, what) {
      if (this.isTrashView) {
        ReportManager?.showToast('Çöp kutusunun içinde yeni dosya oluşturulamaz.', 'error');
        return;
      }
      const defName = this.nextUniqueLeaf(what === 'doc' ? 'Yeni Belge.md' : 'Yeni Dosya.txt');
      const name = prompt(what === 'doc' ? 'Belge adı: (ör. Notlar.md)' : 'Dosya adı:', defName);
      if (!name || !name.trim()) return;
      const clean = this.nextUniqueLeaf(name.trim().replace(/[\\/:*?"<>|\0]/g, '-'));
      let content = '';
      const baseDir = this.currentPath || this.userHome || '/home/ankora';
      const target = `${baseDir === '/' ? '' : baseDir}/${clean}`;
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
      area.addEventListener('click', (e) => {
        if (e.target.closest('.files-item-card')) return;
        document.querySelectorAll('#files-grid .files-item-card.selected').forEach(c => c.classList.remove('selected'));
        this.selectedItem = null;
        this.selectedItems = [];
        const statusSelected = document.getElementById('files-status-selected');
        if (statusSelected) statusSelected.textContent = this.clipboard.length ? '' : 'Seçili öge yok';
      });
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
      // Tauri olay dinleyicisi (fs-progress)
      TauriBridge.listen('fs-progress', (event) => {
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
        this.selectedItems = [];

        if (breadcrumbs) {
          breadcrumbs.replaceChildren();
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
          grid.replaceChildren();
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
              icon = '<img class="files-native-folder-icon" src="icons/linux/folder.svg" width="38" height="38" alt="" draggable="false">';
            } else if (item.ext === 'deb') {
              icon = '<svg class="glyph" aria-hidden="true"><use href="#ico-package"></use></svg>';
              badge = '<span class="file-card-badge deb">DEB PAKET</span>';
            } else if (item.ext === 'exe' || item.ext === 'msi') {
              icon = '<svg class="glyph" aria-hidden="true"><use href="#ico-package"></use></svg>';
              badge = '<span class="file-card-badge" style="background:rgba(59,130,246,0.18);color:#60a5fa;border-color:rgba(59,130,246,0.3);">WIN UYG</span>';
            } else if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(item.ext)) {
              icon = '<svg class="glyph" aria-hidden="true"><use href="#ico-image"></use></svg>';
            } else if (['pdf', 'doc', 'docx', 'odt'].includes(item.ext)) {
              icon = '<svg class="glyph" aria-hidden="true"><use href="#ico-file-text"></use></svg>';
            } else if (['txt', 'md', 'csv', 'json', 'xml', 'toml', 'js', 'ts', 'tsx', 'jsx', 'py', 'sh', 'css', 'html', 'c', 'cpp', 'h', 'rs', 'go', 'java', 'sql'].includes(item.ext)) {
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

      // 1. Paket Dosyaları (.deb ve .AppImage): Görsel Paket Yükleyici penceresini aç
      if (item.ext === 'deb' || item.ext === 'appimage') {
        if (typeof PackageInstallerManager !== 'undefined') {
          PackageInstallerManager.open(item.path);
          return;
        }
      }

      // 1b. Windows Çalıştırılabilirleri (.exe / .msi): Wine yönlendirmesi
      if (item.ext === 'exe' || item.ext === 'msi') {
        await this.promptWindowsExecutable(item);
        return;
      }

      // 2. Metin, Kod ve Konfigürasyon Dosyaları
      const codeExts = ['txt', 'md', 'csv', 'json', 'xml', 'toml', 'js', 'ts', 'tsx', 'jsx', 'py', 'sh', 'css', 'html', 'log', 'conf', 'ini', 'yml', 'yaml', 'c', 'cpp', 'h', 'rs', 'go', 'java', 'sql'];
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

    async promptWindowsExecutable(item) {
      if (!item || !item.path) return;
      try {
        await TauriBridge.invoke('launch_application', { exec: `wine "${item.path}"` });
        ReportManager?.showToast(`'${item.name}' Wine ile başlatılıyor...`);
      } catch (e) {
        const msg = String(e && (e.message || e) || '');
        const installWine = confirm(
          `'${item.name}' bir Windows (.${item.ext || 'exe'}) dosyasıdır.\n\n` +
          `Linux üzerinde doğrudan çalışmaz, ancak Ankora Mağaza'daki Wine uyumluluk katmanı ile çalıştırabilirsiniz.\n\n` +
          `(${msg || 'Wine kurulu değil'})\n\n` +
          `Ankora Mağaza'da Wine sayfasını açmak ister misiniz?`
        );
        if (installWine) {
          WindowManager.open('win-store');
          const sInput = document.getElementById('store-search-input') || document.getElementById('store-search');
          if (sInput) {
            sInput.value = 'wine';
            sInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      }
    },

    async promptNewFolder() {
      if (this.isTrashView) {
        ReportManager?.showToast('Çöp kutusunun içinde yeni klasör oluşturulamaz.', 'error');
        return;
      }
      const defName = this.nextUniqueLeaf('Yeni Klasör');
      const folderName = prompt('Yeni Klasör Adı:', defName);
      if (!folderName || !folderName.trim()) return;

      const cleanName = folderName.trim().replace(/[\\/:*?"<>|\0]/g, '');
      if (!cleanName) {
        ReportManager?.showToast('Geçersiz klasör adı.', 'error');
        return;
      }
      const existing = (this.items || []).some(it => String(it.name || '').toLocaleLowerCase('tr') === cleanName.toLocaleLowerCase('tr'));
      const finalName = existing ? this.nextUniqueLeaf(cleanName) : cleanName;

      const baseDir = this.currentPath || this.userHome || '/home/ankora';
      const targetPath = (baseDir.endsWith('/') ? baseDir : baseDir + '/') + finalName;
      Terminal.log(`[KLASÖR] '${targetPath}' oluşturuluyor...`, 'cmd');

      try {
        await TauriBridge.invoke('create_folder', { path: targetPath });
        Terminal.log(`[KLASÖR] '${finalName}' başarıyla oluşturuldu.`, 'success');
        if (finalName !== cleanName) {
          ReportManager?.showToast(`'${cleanName}' zaten var olduğu için '${finalName}' oluşturuldu.`);
        } else {
          ReportManager?.showToast(`'${finalName}' klasörü oluşturuldu.`);
        }
        await this.refresh();
        DesktopFiles?.refresh?.();
      } catch (err) {
        Terminal.log(`[HATA] Klasör oluşturulamadı: ${err}`, 'error');
        ReportManager?.showToast(`Klasör oluşturulamadı: ${err}`, 'error');
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

    openTerminalHere(dirOverride) {
      const targetDir = dirOverride || this.currentPath || this.userHome || '/home/ankora';
      TauriBridge.invoke('launch_interactive_terminal', { command: null, cwd: targetDir })
        .then(() => {
          Terminal.log(`[TERMİNAL] '${targetDir}' konumunda sistem terminali açıldı.`, 'success');
          ReportManager?.showToast(`Terminal açıldı: ${targetDir}`);
        })
        .catch(() => {
          WindowManager.open('win-terminal');
          Terminal.log(`[TERMİNAL] Çalışma dizini: ${targetDir}`, 'muted');
        });
    },

    async loadTrash() {
      this.isTrashView = true;
      const breadcrumbs = document.getElementById('files-breadcrumbs');
      const grid = document.getElementById('files-grid');
      const statusCount = document.getElementById('files-status-count');
      const statusSelected = document.getElementById('files-status-selected');

      if (breadcrumbs) {
        breadcrumbs.innerHTML = '<span class="files-crumb active">Çöp Kutusu</span>';
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
        grid.replaceChildren();

        const banner = document.createElement('div');
        banner.className = 'trash-banner';
        banner.innerHTML = `
          <span><strong>Çöp Kutusu</strong> (${items.length} öge): Silinen dosyalar burada saklanır.</span>
          <button class="btn-pkg" id="btn-empty-trash-action" style="background:#ef4444;border:none;color:#fff;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:11.5px;font-weight:600;">Çöpü Boşalt</button>
        `;
        banner.querySelector('#btn-empty-trash-action').addEventListener('click', () => this.emptyTrash());
        grid.appendChild(banner);

        if (items.length === 0) {
          const emptyNotice = document.createElement('div');
          emptyNotice.className = 'files-empty-state';
          emptyNotice.innerHTML = `
            <div style="opacity: 0.45; margin-bottom: 10px;"><svg class="glyph" style="width:32px;height:32px;" aria-hidden="true"><use href="#ico-trash"></use></svg></div>
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
            icon = '<img class="files-native-folder-icon" src="icons/linux/folder.svg" width="38" height="38" alt="" draggable="false">';
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
        ReportManager.showToast('Arşiv çıkartılıyor...');
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
        ReportManager.showToast('Arşiv oluşturuluyor...');
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
              this.openTerminalHere(targetDir);
              break;
            }
            case 'open-term-here-inside':
              this.openTerminalHere(item.path);
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
          listEl.replaceChildren();
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
            row.innerHTML = `<span style="padding:6px 8px;font-size:12.5px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;"><svg class="glyph" style="width:14px;height:14px;" aria-hidden="true"><use href="#ico-folder"></use></svg>${escapeHtml(d.name)}</span>`;
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
            <svg class="glyph"><use href="#ico-file"></use></svg><span>Özellikler: ${escapeHtml(item.name)}</span>
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
        listEl.replaceChildren();

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
      const candidates = [];
      try {
        const dirs = await TauriBridge.invoke('get_xdg_user_dirs');
        if (dirs && dirs.documents) {
          candidates.push(`${dirs.documents.replace(/\/+$/, '')}/ankora-sistem-rehberi.pdf`);
        }
        if (dirs && dirs.home) {
          candidates.push(`${dirs.home.replace(/\/+$/, '')}/Belgeler/ankora-sistem-rehberi.pdf`);
        }
      } catch (e) {}
      candidates.push('/home/ankora/Belgeler/ankora-sistem-rehberi.pdf');
      candidates.push('/root/Belgeler/ankora-sistem-rehberi.pdf');
      const seen = new Set();
      for (const filePath of candidates) {
        if (seen.has(filePath)) continue;
        seen.add(filePath);
        try {
          const doc = await TauriBridge.invoke('read_document_file', { filePath });
          if (doc) {
            this.renderDocument(doc);
            return;
          }
        } catch (err) {}
      }
    },

    loadSampleText() {
      const doc = {
        file_name: 'kiosk-ayarlari.md',
        file_type: 'text',
        file_size: 1420,
        content: `# Ankora Linux 5.0 Kiosk Yapılandırma Raporu\n\n- Taban: Devuan 6 Excalibur (SysVinit)\n- Çekirdek: Linux 6.12 LTS\n- Pencere Motoru: Tauri 2 + WebKitGTK 4.1\n- Display Manager: nodm (Auto-login)\n- Donanım Parlaklığı: xrandr donanım kontrolü\n- Bellek: ZRAM + Disk Swap Hiyerarşisi\n\nBu belge, Ankora Office yerel belge işleyicisi tarafından doğrudan sistemden açılır.`
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
          content: `# Ankora Linux 5.0 - Sürüm Notları (Excalibur)\n\n- Taban: Devuan GNU/Linux 6 (Excalibur)\n- İnit Sistemi: SysVinit (systemd-free)\n- Arayüz: Tauri 2 (WebKitGTK 4.1) ve Ayaz Masaüstü Ortamı\n- Çekirdek: Linux 6.12 LTS\n\nSistem durumu ve kaynak kullanımı Ayarlar > Hakkında ekranından izlenir.`
        });
      }
    }
  };

  // ============================================================================
  // AYAZ PAKET YÜKLEYİCİ (.deb ve .AppImage Grafiksel Kurulum Yöneticisi)
  // ============================================================================
  const PackageInstallerManager = {
    currentPath: null,
    currentMeta: null,
    appimageInstalled: false,

    async open(filePath) {
      if (!filePath) return;
      this.currentPath = filePath;
      this.currentMeta = null;
      this.appimageInstalled = false;

      WindowManager.open('win-pkg-installer');

      const nameEl = document.getElementById('pkg-inst-name');
      const verEl = document.getElementById('pkg-inst-version');
      const sizeEl = document.getElementById('pkg-inst-size');
      const dependsEl = document.getElementById('pkg-inst-depends');
      const descEl = document.getElementById('pkg-inst-desc');
      const progWrap = document.getElementById('pkg-inst-progress-wrap');
      const btnAction = document.getElementById('btn-pkg-inst-action');
      const errBox = document.getElementById('pkg-inst-error');

      const fn = filePath.split('/').pop() || 'paket';
      if (nameEl) nameEl.textContent = fn;
      if (verEl) verEl.textContent = 'Paket inceleniyor...';
      if (sizeEl) sizeEl.textContent = '';
      if (dependsEl) dependsEl.textContent = '';
      if (errBox) {
        errBox.hidden = true;
        errBox.textContent = '';
      }
      if (descEl) descEl.textContent = 'Paket yapısı ve bağımlılıklar okunuyor, lütfen bekleyin...';
      if (progWrap) progWrap.style.display = 'none';
      if (btnAction) {
        btnAction.disabled = true;
        btnAction.textContent = 'Hazırlanıyor...';
      }

      try {
        const meta = await TauriBridge.invoke('inspect_package_file', { filePath });
        this.currentMeta = meta;

        if (nameEl) nameEl.textContent = meta.name || fn;
        if (verEl) verEl.textContent = `Sürüm: ${meta.version} · Mimari: ${meta.arch}`;
        if (sizeEl) sizeEl.textContent = `Dosya Boyutu: ${meta.size_human}`;
        if (dependsEl) {
          dependsEl.textContent = meta.depends ? `Bağımlılık: ${meta.depends}` : '';
          dependsEl.title = meta.depends || '';
          dependsEl.hidden = !meta.depends;
        }
        if (descEl) descEl.textContent = meta.description || 'Açıklama bulunamadı.';

        if (btnAction) {
          btnAction.disabled = false;
          if (meta.pkg_type === 'appimage') {
            btnAction.textContent = 'Kur ve Menüye Ekle';
          } else {
            btnAction.textContent = 'Paketi Kur';
          }
        }
      } catch (err) {
        if (verEl) verEl.textContent = 'Paket okunamadı';
        if (descEl) descEl.textContent = `Paket bilgileri alınamadı: ${err.message || err}`;
        if (btnAction) {
          btnAction.disabled = true;
          btnAction.textContent = 'Geçersiz Paket';
        }
      }

      if (btnAction) {
        btnAction.onclick = () => this.executeAction();
      }
    },

    showError(err) {
      const box = document.getElementById('pkg-inst-error');
      if (!box) return;
      const raw = err && err.message ? err.message : String(err);
      box.textContent = raw;
      box.hidden = false;
    },

    async executeAction() {
      if (!this.currentPath || !this.currentMeta) return;
      const btnAction = document.getElementById('btn-pkg-inst-action');
      const btnCancel = document.getElementById('btn-pkg-inst-cancel');
      const progWrap = document.getElementById('pkg-inst-progress-wrap');
      const progLabel = document.getElementById('pkg-inst-status-label');
      const progPct = document.getElementById('pkg-inst-status-pct');
      const errBox = document.getElementById('pkg-inst-error');

      if (this.currentMeta.pkg_type === 'appimage') {
        // Kurulduysa ikinci tıklama uygulamayı başlatır.
        if (this.appimageInstalled) {
          try {
            await TauriBridge.invoke('open_path', { path: this.currentPath });
            if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
              ReportManager.showToast('AppImage uygulaması başlatıldı.', 'success');
            }
            WindowManager.close('win-pkg-installer');
          } catch (e) {
            this.showError(e);
            if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
              ReportManager.showToast(`Çalıştırılamadı: ${e.message || e}`, 'error');
            }
          }
          return;
        }

        if (errBox) errBox.hidden = true;
        if (btnAction) {
          btnAction.disabled = true;
          btnAction.textContent = 'Kuruluyor...';
        }
        if (btnCancel) btnCancel.disabled = true;
        if (progWrap) progWrap.style.display = 'flex';
        if (progLabel) progLabel.textContent = 'AppImage ~/.local/bin içine kopyalanıyor...';
        if (progPct) progPct.textContent = 'Uygulama menüsü hazırlanıyor';

        try {
          const msg = await TauriBridge.invoke('install_appimage', { filePath: this.currentPath });
          this.appimageInstalled = true;
          if (progLabel) progLabel.textContent = 'Kurulum tamamlandı!';
          if (progPct) progPct.textContent = 'Menüye eklendi';
          if (btnAction) {
            btnAction.disabled = false;
            btnAction.textContent = 'Uygulamayı Başlat';
          }
          if (btnCancel) btnCancel.disabled = false;
          if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
            ReportManager.showToast(msg || 'AppImage kuruldu.', 'success');
          }
          if (typeof XdgDesktopEngine !== 'undefined' && XdgDesktopEngine.scanApplications) {
            XdgDesktopEngine.scanApplications();
          }
        } catch (err) {
          if (progLabel) progLabel.textContent = 'Kurulum başarısız oldu.';
          if (progPct) progPct.textContent = 'Hata';
          if (btnAction) {
            btnAction.disabled = false;
            btnAction.textContent = 'Tekrar Dene';
          }
          if (btnCancel) btnCancel.disabled = false;
          this.showError(err);
          if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
            ReportManager.showToast('AppImage kurulumu başarısız.', 'error');
          }
        }
        return;
      }

      // .deb kurulum akışı
      if (errBox) errBox.hidden = true;
      if (btnAction) {
        btnAction.disabled = true;
        btnAction.textContent = 'Kuruluyor...';
      }
      if (btnCancel) btnCancel.disabled = true;
      if (progWrap) progWrap.style.display = 'flex';
      if (progLabel) progLabel.textContent = 'Sistem paket yöneticisi çalışıyor...';
      if (progPct) progPct.textContent = 'Bağımlılıklar yapılandırılıyor';

      try {
        await TauriBridge.invoke('install_local_deb_package', { filePath: this.currentPath });
        if (progLabel) progLabel.textContent = 'Kurulum tamamlandı!';
        if (progPct) progPct.textContent = 'Hazır';

        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast(`${this.currentMeta.name} başarıyla kuruldu!`, 'success');
        }
        if (typeof XdgDesktopEngine !== 'undefined' && XdgDesktopEngine.scanApplications) {
          XdgDesktopEngine.scanApplications();
        }

        setTimeout(() => {
          WindowManager.close('win-pkg-installer');
          if (btnCancel) btnCancel.disabled = false;
          if (btnAction) btnAction.disabled = false;
        }, 1200);
      } catch (err) {
        if (progLabel) progLabel.textContent = 'Kurulum başarısız oldu.';
        if (progPct) progPct.textContent = 'Hata';
        if (btnAction) {
          btnAction.disabled = false;
          btnAction.textContent = 'Tekrar Dene';
        }
        if (btnCancel) btnCancel.disabled = false;
        this.showError(err);
        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast(`Kurulum hatası: ${err.message || err}`, 'error');
        }
      }
    }
  };

  Object.assign(window, { TERMINAL_COMMANDS, TERMINAL_HELP, Terminal, FileManager, OfficeManager, PackageInstallerManager });
})();

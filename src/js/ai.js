// Ayaz DE Modülü: ai.js
// Ankora AI ajanı, yerel bağlam kuverleri ve Ollama model yöneticisi
(() => {
  'use strict';

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
    hasSavedKey: false,
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
          model: 'gemini-2.5-flash',
          endpoint: 'https://generativelanguage.googleapis.com/v1beta',
          label: 'Google Gemini (Gemini 2.5 Flash)'
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
        model: 'gemini-2.5-flash',
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
      this.hasSavedKey = true;
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
      this.hasSavedKey = false;
      const providers = Array.from(new Set([this.provider, 'gemini', 'groq', 'openai', 'openrouter'].filter(Boolean)));
      for (const prov of providers) {
        if (prov === 'ollama' || prov === 'auto') continue;
        try {
          await TauriBridge.invoke('delete_ai_credential', { provider: prov });
        } catch (e) {}
      }

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
      this.model = SafeStorage.getItem('ankora_ai_model') || (this.provider === 'ollama' ? 'qwen2.5:0.5b' : 'gemini-2.5-flash');
      if (this.provider === 'gemini' && this.model === 'gemini-2.0-flash') {
        this.model = 'gemini-2.5-flash';
        SafeStorage.setItem('ankora_ai_model', this.model);
      }
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
        this.hasSavedKey = Boolean(hasKey);
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
      const aiWin = document.getElementById('win-ai');
      if (btnToggleConfig && drawer) {
        btnToggleConfig.addEventListener('click', () => {
          drawer.classList.toggle('open');
        });
      }

      // Antigravity Workspace Kenar Çubuğu & Composer Kontrolleri
      const btnSidebarToggle = document.getElementById('btn-ai-sidebar-toggle');
      if (btnSidebarToggle && aiWin) {
        btnSidebarToggle.addEventListener('click', () => {
          aiWin.classList.toggle('sidebar-collapsed');
        });
      }
      const btnNewChat = document.getElementById('btn-ai-new-chat');
      const btnClearRef = document.getElementById('btn-ai-clear-chat');
      if (btnNewChat && btnClearRef) {
        btnNewChat.addEventListener('click', () => btnClearRef.click());
      }
      const btnSidebarSettings = document.getElementById('btn-ai-sidebar-settings');
      if (btnSidebarSettings && drawer) {
        btnSidebarSettings.addEventListener('click', () => {
          drawer.classList.toggle('open');
        });
      }
      const btnComposerModel = document.getElementById('btn-ai-composer-model');
      if (btnComposerModel && drawer) {
        btnComposerModel.addEventListener('click', () => {
          drawer.classList.add('open');
          const secConn = document.getElementById('ai-sec-connection');
          if (secConn) secConn.open = true;
        });
      }
      const btnComposerPlus = document.getElementById('btn-ai-composer-plus');
      const quickRow = document.getElementById('ai-quick-row');
      if (btnComposerPlus && quickRow) {
        btnComposerPlus.addEventListener('click', () => {
          quickRow.hidden = !quickRow.hidden;
        });
      }
      const toggleWatchFromUi = () => {
        this.watchScreen = !this.watchScreen;
        SafeStorage.setItem('ankora_ai_watch', this.watchScreen ? '1' : '0');
        if (screenToggle) screenToggle.checked = this.watchScreen;
        if (typeof window.syncAiMiniWatch === 'function') window.syncAiMiniWatch();
      };
      const btnSidebarWatch = document.getElementById('btn-ai-sidebar-watch');
      if (btnSidebarWatch) btnSidebarWatch.addEventListener('click', toggleWatchFromUi);
      const btnComposerWatch = document.getElementById('btn-ai-composer-watch');
      if (btnComposerWatch) btnComposerWatch.addEventListener('click', toggleWatchFromUi);

      const modeOrder = ['sysadmin', 'doctor', 'developer', 'general'];
      const applyMode = (nextMode) => {
        if (!modeOrder.includes(nextMode)) return;
        this.mode = nextMode;
        SafeStorage.setItem('ankora_ai_mode', this.mode);
        if (modeSelect) modeSelect.value = this.mode;
        this.updateBadges();
      };
      document.querySelectorAll('#ai-ag-sidebar [data-ai-mode]').forEach(btn => {
        btn.addEventListener('click', () => applyMode(btn.getAttribute('data-ai-mode')));
      });
      const btnComposerMode = document.getElementById('btn-ai-composer-mode');
      if (btnComposerMode) {
        btnComposerMode.addEventListener('click', () => {
          const idx = modeOrder.indexOf(this.mode);
          applyMode(modeOrder[(idx + 1) % modeOrder.length]);
        });
      }
      document.querySelectorAll('#ai-ag-sidebar [data-ai-prompt]').forEach(btn => {
        btn.addEventListener('click', () => {
          const p = btn.getAttribute('data-ai-prompt');
          if (p) this.handleQuery(p);
        });
      });

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
          if (this.miniFeed) this.miniFeed.replaceChildren();
          Terminal.log('[AI] Sohbet geçmişi ve DOM önbelleği temizlendi.', 'cmd');
        });
      }

      quickBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const q = btn.getAttribute('data-query');
          if (q) this.handleQuery(q);
        });
      });
      document.querySelectorAll('#ai-mini-quick-actions .ai-mini-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const p = chip.getAttribute('data-prompt');
          if (p) this.handleQuery(p);
        });
      });

      if (typeof OllamaManager !== 'undefined') {
        OllamaManager.init();
      }


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

      const modeShortMap = {
        sysadmin: 'Sistem Teftiş',
        doctor: 'Doktor',
        developer: 'Geliştirici',
        general: 'Genel'
      };

      const provLabel = provMap[this.provider] || String(this.provider || 'ollama').toUpperCase();
      if (badgeProv) badgeProv.textContent = provLabel;
      const miniStatus = document.getElementById('ai-mini-status');
      if (miniStatus) miniStatus.textContent = provLabel;
      if (badgeMode) {
        badgeMode.innerHTML = `<svg class="btn-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:12px;height:12px;display:inline-block;vertical-align:-1px;margin-right:4px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>${escapeHtml(modeMap[this.mode] || this.mode)}`;
      }
      const compModelLbl = document.getElementById('ai-composer-model-label');
      if (compModelLbl) {
        compModelLbl.textContent = this.model ? `${provLabel.split(' ')[0]} · ${this.model}` : provLabel;
      }
      const miniModelLbl = document.getElementById('ai-mini-model-label');
      if (miniModelLbl) {
        miniModelLbl.textContent = this.model ? `${provLabel.split(' ')[0]} · ${this.model}` : provLabel;
      }
      const compModeLbl = document.getElementById('ai-composer-mode-label');
      if (compModeLbl) compModeLbl.textContent = modeShortMap[this.mode] || this.mode;
      const miniModeLbl = document.getElementById('ai-mini-mode-label');
      if (miniModeLbl) miniModeLbl.textContent = modeShortMap[this.mode] || this.mode;

      document.querySelectorAll('#ai-ag-sidebar [data-ai-mode]').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-ai-mode') === this.mode);
      });

      if (modeSelect && modeSelect.value !== this.mode) {
        modeSelect.value = this.mode;
      }
      if (ind) {
        ind.textContent = 'Bağlı / Hazır';
        ind.className = 'status-pill online';
      }
    },

    appendFormattedInline(container, text) {
      const tokens = String(text ?? '').split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g);
      tokens.forEach(tok => {
        if (!tok) return;
        if (tok.startsWith('`') && tok.endsWith('`') && tok.length > 2) {
          const code = document.createElement('code');
          code.className = 'ai-inline-code';
          code.textContent = tok.slice(1, -1);
          container.appendChild(code);
        } else if (tok.startsWith('**') && tok.endsWith('**') && tok.length > 4) {
          const strong = document.createElement('strong');
          strong.textContent = tok.slice(2, -2);
          container.appendChild(strong);
        } else {
          container.appendChild(document.createTextNode(tok));
        }
      });
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

      // Güvenli kod bloğu ayrıştırma (yalnız DOM düğümleri ve textContent kullanılır, XSS riski sıfır)
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
          if (role === 'user') {
            p.textContent = seg.trim();
          } else {
            this.appendFormattedInline(p, seg.trim());
          }
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
      if (role === 'user') {
        el.textContent = String(text ?? '');
      } else {
        this.appendFormattedInline(el, String(text ?? ''));
      }
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
      const m = String(rawText || '').match(/<<<ACTION:([\s\S]*?)>>>/);
      if (!m) {
        return { reply: rawText, has_action: false, action_command: null, action_desc: null };
      }
      const inner = m[1].trim();
      const clean = String(rawText).replace(m[0], '').trim();
      if (inner.startsWith('{')) {
        try {
          const parsed = JSON.parse(inner);
          const cmd = String(parsed.command || '').trim();
          const desc = String(parsed.desc || 'Sistem bakım komutu').trim();
          if (cmd) {
            return {
              reply: clean,
              has_action: true,
              action_command: cmd,
              action_desc: desc
            };
          }
        } catch (e) {}
      }
      const pipeIdx = inner.indexOf('|');
      if (pipeIdx > 0) {
        const cmd = inner.slice(0, pipeIdx).trim();
        const desc = inner.slice(pipeIdx + 1).trim();
        if (cmd) {
          return {
            reply: clean,
            has_action: true,
            action_command: cmd,
            action_desc: desc || 'Sistem bakım komutu'
          };
        }
      }
      return { reply: rawText, has_action: false, action_command: null, action_desc: null };
    },

    generateFallbackDiagnostic(prompt) {
      const q = String(prompt || '').toLowerCase().trim();
      let reply = '';
      let has_action = false;
      let action_command = null;
      let action_desc = null;

      if (q.includes('doktor') || q.includes('doctor') || q.includes('onar') || q.includes('sağlık') || q.includes('bakım')) {
        reply = `**Ankora Sistem Doktoru Teşhis Raporu:**\n\n` +
          `• **Paket Bütünlüğü:** Bozuk veya eksik dpkg/apt paketleri doğrulanacak.\n` +
          `• **Bellek & ZRAM:** Sıkıştırılmış lz4 ZRAM takas havuzu ve çekirdek önbellekleri kontrol edilecek.\n` +
          `• **Sistem İzinleri:** /tmp ve kritik sudoers yapılandırmaları teftiş edilecek.\n` +
          `• **Uygulama Sandbox:** Flatpak ve sistem depoları taranacak.\n\n` +
          `Tespit edilen sistem sorunlarını ve önbellek artıklarını güvenli biçimde onarmak için aşağıdaki eylemi onaylayabilirsiniz:`;
        has_action = true;
        action_command = '/usr/local/bin/ankora-doctor';
        action_desc = 'Ankora Sistem Doktoru kapsamlı bakım ve onarımını çalıştır';
      } else if (q.includes('plan') || q.includes('günün planı') || q.includes('işler') || q.includes('yapılacak')) {
        reply = `**Ankora Linux Günlük Çalışma Planı:**\n\n` +
          `• **Sistem Bakımı:** Paket depolarını güncelle ve güvenlik yamalarını kontrol et (\`apt-get update\`).\n` +
          `• **Bellek ve ZRAM Durumu:** Canlı bellek tüketimini ve takas alanını gözden geçir (\`free -h\`).\n` +
          `• **Depolama Sağlığı:** Kök dizin (\`/\`) ve ev dizini (\`/home\`) boş alanını denetle (\`df -h\`).\n` +
          `• **Üretkenlik:** Ankora Mağaza'dan araçlarını hazırla, Ayaz DE çalışma alanlarını organize et.\n\n` +
          `*Not: Görev listene yeni bir iş eklemek için "görev ekle: [iş adı]" yazabilirsin.*`;
      } else if (q.includes('durum') || q.includes('sistem') || q.includes('bellek') || q.includes('ram') || q.includes('cpu')) {
        reply = `**Canlı Sistem Durumu & Telemetri:**\n\n` +
          `• **İşletim Sistemi:** Ankora Linux 5.0.0 (Devuan 6 Excalibur amd64)\n` +
          `• **Masaüstü Ortamı:** Ayaz DE (Rust + WebKitGTK)\n` +
          `• **İnit & Hizmet Sistemi:** SysVinit (Düşük kaynak tüketimli)\n` +
          `• **Çekirdek:** Linux LTS x86_64\n` +
          `• **Güvenlik & İzolasyon:** Bubblewrap (bwrap) + Kısıtlı IPC, yerel anahtar kasası\n\n` +
          `Disk ve bellek doluluk oranlarını canlı sorgulamak için aşağıdaki komutu onaylayabilirsiniz.`;
        has_action = true;
        action_command = 'df -h / && free -m';
        action_desc = 'Disk ve bellek kullanımını sorgula';
      } else if (q.includes('öner') || q.includes('uygulama') || q.includes('mağaza') || q.includes('program')) {
        reply = `**Ankora Mağaza'dan Önerilen Uygulamalar:**\n\n` +
          `• **İnternet:** Brave Browser, Chromium, Telegram Desktop, Thunderbird\n` +
          `• **Geliştirme:** VS Code, Geany, Code::Blocks, DBeaver, Meld, Git GUI\n` +
          `• **Tasarım & Medya:** Krita, Inkscape, Blender, GIMP, VLC, OBS Studio\n` +
          `• **Eğitim:** Fatih Kalem 2, GeoGebra, GCompris, Kalzium, Stellarium\n` +
          `• **Sistem:** GParted, Timeshift, BleachBit, Htop, Btop, Screenfetch\n\n` +
          `Uygulamaları tek tıkla kurmak için Yazılım Mağazası'nı açabilirsiniz.`;
      } else if (q.includes('uçbirim') || q.includes('terminal') || q.includes('komut') || q.includes('bash')) {
        reply = `**Hızlı Uçbirim Komut Rehberi:**\n\n` +
          `• Sistem güncelleme: \`sudo apt update && sudo apt upgrade -y\`\n` +
          `• Bellek durumu: \`free -h\`\n` +
          `• Disk alanı: \`df -h /\`\n` +
          `• Süreç izleme: \`btop\` veya \`htop\`\n` +
          `• Sistem doktoru teşhisi: \`/usr/local/bin/ankora-doctor\``;
        has_action = true;
        action_command = 'free -h';
        action_desc = 'Bellek durumunu terminalde göster';
      } else {
        reply = `Ankora AI Yerel Asistanı hazır.\n\n` +
          `Sorgunuz: "${prompt}"\n\n` +
          `• Sistem durumunu sorgulamak için: "Sistem durumu"\n` +
          `• Günün planı ve görevler için: "Günün planı"\n` +
          `• Uygulama tavsiyeleri için: "Uygulama öner"\n` +
          `• Terminal komutları için: "Uçbirim komutları"\n\n` +
          `*Gelişmiş bulut modellerine (Gemini, Groq, OpenAI, Claude) bağlanmak için üstteki 'API Ayarları' butonunu kullanabilirsiniz.*`;
      }

      return {
        reply,
        has_action,
        action_command,
        action_desc,
        action_token: has_action ? 'fallback-token' : null
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
        const desktopReply = this.tryDesktopAgentAction(clean);
        if (desktopReply) {
          this.appendMsg('user', display);
          this.appendMsg('bot', desktopReply);
          return;
        }
      }

      this.appendMsg('user', display);
      const recentHistory = this.history
        .slice(-7, -1)
        .filter(h => h && h.text && !String(h.text).startsWith('Ajan düşünülüyor'))
        .map(h => ({ role: h.role === 'user' ? 'user' : 'bot', text: String(h.text).slice(0, 800) }));
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
            saveToDisk: false,
            save_to_disk: false,
            copyClipboard: false,
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
        const isOllamaVision = this.provider === 'ollama' && /vl|vision|llava|moondream|minicpm|bakllava|gemma3/i.test(this.model || '');
        if (!['openai', 'gemini', 'openrouter'].includes(this.provider) && !isOllamaVision) {
          this.appendMsg('bot', 'Not: Ekran izleme, görüntüyü işleyebilen bulut sağlayıcıya (Gemini, OpenAI, OpenRouter) veya görüş destekli yerel modele (llava/gemma3/vision) bağlanınca pixel düzeyinde analiz yapar.');
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
            agentMode: this.mode,
            imageB64: shotB64 || '',
            image_b64: shotB64 || '',
            history: recentHistory
          });
        } catch (invokeErr) {
          // Bulut sağlayıcıda gerçek anahtar kayıtlıysa API hatasını gizleme, kullanıcıya net göster
          if (this.provider !== 'ollama' && (this.activeKey || this.hasSavedKey)) {
            if (loadingEntry && loadingEntry.parentNode) loadingEntry.parentNode.removeChild(loadingEntry);
            this.appendMsg('bot', `⚠ ${this.provider.toUpperCase()} API Hatası:\n${invokeErr}\n\nAPI anahtarınızı, internet bağlantınızı veya model adını Ayarlar çekmecesinden doğrulayın.`);
            return;
          }
          if (!this.activeKey) {
            res = this.generateFallbackDiagnostic(text);
          }
        }
      }

      // 2. Doğrudan Canlı Web / API Çağrısı (Kullanıcı Anahtarı Bağlandığında %100 Gerçek Çalışma)
      if (!res && this.activeKey) {
        const key = this.activeKey.trim();
        const prov = this.provider.toLowerCase();
        const sysPromptBase = this.mode === 'developer'
          ? 'Sen Ankora Linux 5.0 ortamında çalışan kıdemli bir Rust, Linux ve Tauri geliştiricisisin.'
          : (this.mode === 'doctor'
            ? 'Sen Ankora Sistem Doktorusun. Devuan 6 Excalibur (SysVinit) üzerinde bellek, disk, ZRAM, süreç ve güvenlik sorunlarını teşhis edip çözüm sunarsın.'
            : 'Sen Ankora Linux 5.0 (Devuan 6 Excalibur / SysVinit) sistem yöneticisi ve yapay zeka asistanısın. Kullanıcıya Türkçe, net ve teknik olarak doğru yanıtlar ver.');
        const fullSysPrompt = `${sysPromptBase}\n${teleContext}\n${shotB64 ? '[Kullanıcı güncel bir ekran karesi paylaştı; soruyu görüntüyle birlikte değerlendir.]' : ''}\n${linkContext}\nEğer güvenli bir tanı komutu önermek istersen yanıtın sonuna <<<ACTION:komut|açıklama>>> ekle (Yalnızca: df -h /, df -h / && free -m, free -h, uname -a, uptime, swapon --show, ip -br addr, lscpu, lsblk, ps aux, top -b -n 1, apt-get clean && rm -rf /tmp/*, /usr/local/bin/ankora-doctor, sync).`;

        try {
          if (prov === 'groq' && shotB64) {
            this.mirrorInfo('Not: Groq metin modeli görüntü işleyemez; soru metin olarak gönderildi.');
          }
          if (prov === 'gemini') {
            const aiModel = this.model || 'gemini-2.5-flash';
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent`;
            const geminiContents = recentHistory.map(h => ({
              role: h.role === 'user' ? 'user' : 'model',
              parts: [{ text: h.text }]
            }));
            geminiContents.push({
              role: 'user',
              parts: shotB64
                ? [
                    { text },
                    { inline_data: { mime_type: 'image/png', data: shotB64 } }
                  ]
                : [{ text }]
            });

            const resp = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': key
              },
              body: JSON.stringify({
                system_instruction: { parts: [{ text: fullSysPrompt }] },
                contents: geminiContents
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
                  ...recentHistory.map(h => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.text })),
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
                  ...recentHistory.map(h => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.text })),
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
                  ...recentHistory.map(h => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.text })),
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

      if (!res && !this.activeKey) {
        res = this.generateFallbackDiagnostic(text);
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
      if (this.feed) {
        const card = document.createElement('div');
        card.className = 'action-proposal-card';

        const strong = document.createElement('strong');
        strong.textContent = '⚠ Sistem Eylemi Yetkisi Gerekiyor:';

        const span = document.createElement('span');
        span.textContent = desc || 'Aşağıdaki sistem komutu yürütülecek:';

        const code = document.createElement('code');
        code.textContent = command;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-pkg';
        btn.style.cssText = 'align-self: flex-start; margin-top: 4px; background: var(--accent-active); border-color: var(--accent-active); color: var(--on-accent, #ffffff);';
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
      }

      // Mini sohbet balonundan çalışan kullanıcılar için etkileşimli onay kartı
      if (this.miniFeed) {
        const mCard = document.createElement('div');
        mCard.className = 'ai-mini-action-card';

        const mDesc = document.createElement('div');
        mDesc.className = 'ai-mini-action-desc';
        mDesc.textContent = desc || 'Sistem eylemi hazır';

        const mCode = document.createElement('code');
        mCode.className = 'ai-mini-action-cmd';
        mCode.textContent = command;

        const mBtn = document.createElement('button');
        mBtn.type = 'button';
        mBtn.className = 'ai-mini-action-btn';
        mBtn.textContent = 'Onayla ve Çalıştır';
        mBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.promptSecurityConfirm(command, desc, token);
        });

        mCard.appendChild(mDesc);
        mCard.appendChild(mCode);
        mCard.appendChild(mBtn);
        this.miniFeed.appendChild(mCard);
        this.miniFeed.scrollTop = this.miniFeed.scrollHeight;
      }
    },

    // Tek tuş "Bak ve anlat": ekran karesini alıp ekrandaki hatayı/dialogu
    // açıklar. Ekranı İzle tercihini kalıcı açmaz; yalnız bu sorgu için
    // görüntü gönderir ve dalgalı çerçeveyi kısa süre gösterir.
    lookAndTell() {
      return this.handleQuery(
        'Şu anki ekranımda ne görünüyor? Ekrandaki hata mesajını, uyarı penceresini veya terminal çıktısını açıkla; nedenini ve adım adım çözümünü Türkçe anlat.',
        { forceShot: true, flash: true, skipPlan: true }
      );
    },

    // Masaüstü Ajanı: güvenli arayüz ve uygulama eylemlerini (pencere açma, yüz/tema geçişi, gece ışığı) doğrudan uygular.
    tryDesktopAgentAction(text) {
      const t = String(text || '').toLowerCase().trim();
      if (!t || t.length > 160) return null;

      // 1. Arayüz yüzü veya açık/koyu mod geçişi
      if (/(yüzüne|yuzune|temasına|temasina|görünümüne|gorunumune|moda|moduna)\s*(geç|gec|dön|don|çevir|cevir|uygula|aç|ac)(?=$|[\s.,!?])/.test(t)) {
        if (/(bostan)/.test(t) && window.FaceManager) {
          window.FaceManager.setFace('3', true, true);
          return 'Masaüstü yüzü **Yüz 3 · Bostan** olarak değiştirildi.';
        }
        if (/(bakır|bakir)/.test(t) && window.FaceManager) {
          window.FaceManager.setFace('2', true, true);
          return 'Masaüstü yüzü **Yüz 2 · Bakır** olarak değiştirildi.';
        }
        if (/(cıvata|civata)/.test(t) && window.FaceManager) {
          window.FaceManager.setFace('8', true, true);
          return 'Masaüstü yüzü **Yüz 8 · Cıvata** olarak değiştirildi.';
        }
        if (/(arduvaz)/.test(t) && window.FaceManager) {
          window.FaceManager.setFace('default', true, true);
          return 'Masaüstü yüzü **Yüz 1 · Arduvaz** olarak değiştirildi.';
        }
        if (/(klasik|4\.7|legacy)/.test(t) && window.FaceManager) {
          window.FaceManager.setFace('legacy', true, true);
          return 'Masaüstü yüzü **4.7 Klasik** olarak değiştirildi.';
        }
        if (/(koyu|karanlık|dark)/.test(t) && window.FaceManager) {
          window.FaceManager.setFace('2', true, true);
          return 'Koyu masaüstü moduna (**Bakır**) geçildi.';
        }
        if (/(açık|acik|aydınlık|light)/.test(t) && window.FaceManager) {
          window.FaceManager.setFace('3', true, true);
          return 'Aydınlık masaüstü moduna (**Bostan**) geçildi.';
        }
      }

      // 2. Gece ışığı aç/kapat
      if (/(gece\s*ışığ|gece\s*isig|mavi\s*ışık)/.test(t) && /(?:^|\s)(aç|ac|kapat|kapa|etkinleştir)(?=$|[\s.,!?])/.test(t)) {
        const wantOn = /(?:^|\s)(aç|ac|etkinleştir)(?=$|[\s.,!?])/.test(t) && !/(?:^|\s)(kapat|kapa)(?=$|[\s.,!?])/.test(t);
        const nlBtn = document.getElementById('qs-nightlight-toggle');
        if (nlBtn) {
          const isCurrentlyOn = nlBtn.classList.contains('active');
          if (isCurrentlyOn !== wantOn) nlBtn.click();
          return wantOn ? 'Gece Işığı filtresi etkinleştirildi.' : 'Gece Işığı filtresi kapatıldı.';
        }
      }

      // 3. Yerleşik uygulama açma komutları
      if (/(?:^|\s)(aç|ac|başlat|baslat|göster|goster)(?=$|[\s.,!?])/.test(t)) {
        const appRoutes = [
          { re: /(dosya\s*yönetic|dosyalar)/, id: 'win-files', label: 'Dosyalar' },
          { re: /(terminal|uçbirim|ucbirim|konsol)/, id: 'win-terminal', label: 'Terminal' },
          { re: /(mağaza|magaza|yazılım\s*merkezi|uygulama\s*mağaz)/, id: 'win-store', label: 'Ankora Yazılım Merkezi' },
          { re: /(sistem\s*ayar|ayarlar)/, id: 'win-settings', label: 'Sistem Ayarları' },
          { re: /(kurulum|sistemi\s*kur|installer)/, id: 'win-installer', label: 'Ankora Kurulum Aracı' },
          { re: /(hesap\s*makinesi|calc)/, id: 'win-calc', label: 'Hesap Makinesi' },
          { re: /(not\s*defteri|notepad)/, id: 'win-notepad', label: 'Not Defteri' },
          { re: /(tarayıcı|tarayici|browser)/, id: 'win-browser', label: 'Ayaz Tarayıcı' },
          { re: /(görev\s*yönetic|süreç\s*izle|taskmgr)/, id: 'win-taskmgr', label: 'Görev Yöneticisi' },
          { re: /(güncelleyici|guncelleyici|updater)/, id: 'win-updater', label: 'Ayaz Güncelleyici' },
          { re: /(ekran\s*görüntü|ekran\s*goruntu|screenshot)/, id: 'win-screenshot', label: 'Ekran Görüntüsü Aracı' },
          { re: /(ofis|belge\s*görüntü|office)/, id: 'win-office', label: 'Ankora Ofis' },
          { re: /(usb\s*yaz|iso\s*yaz|flasher)/, id: 'win-flasher', label: 'USB & ISO Yazıcı' },
          { re: /(menü\s*düzenle|menu\s*duzenle)/, id: 'win-menu-editor', label: 'Menü Düzenleyici' },
          { re: /(tema\s*stüdyo|stüdyo|studio)/, id: 'win-studio', label: 'Tema Stüdyosu' }
        ];
        for (const r of appRoutes) {
          if (r.re.test(t) && typeof WindowManager !== 'undefined' && WindowManager.open) {
            WindowManager.open(r.id);
            Terminal.log(`[AI AJAN] Uygulama açıldı: ${r.label} (${r.id})`, 'success');
            return `**${r.label}** penceresi açıldı.`;
          }
        }
      }
      return null;
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

      const readyInstalls = steps.filter(s => s.kind === 'install' && s.ready);
      if (steps.length < 2 && readyInstalls.length < 1) return null;
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
      this.mirrorInfo(`${name} hazır · ${Math.max(1, Math.round(file.size / 1024))} KB`);
    },

    showFileActions(name, content, size) {
      if (!this.miniFeed) return;
      const card = document.createElement('div');
      card.className = 'ai-mini-file-card';
      const head = document.createElement('span');
      head.className = 'ai-mini-file-name';
      head.textContent = `${name} · ${Math.max(1, Math.round(size / 1024))} KB`;
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
            displayText: `${name}: ${label}`
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
  // OLLAMA YEREL MODEL YÖNETİCİSİ (Tek Tıkla Model İndirme ve Seçim)
  // ============================================================================
  const OllamaManager = {
    RECOMMENDED: [
      { id: 'qwen2.5:0.5b', name: 'Qwen 2.5 (0.5B)', desc: 'En hafif seçenek; 4 GB ve altı bellekli sınıf bilgisayarlar için varsayılan.', size: '398 MB' },
      { id: 'qwen2.5-coder:1.5b', name: 'Qwen 2.5 Coder (1.5B)', desc: 'Kodlama, otomasyon ve sistem teftişi için optimize edilmiş hafif model.', size: '986 MB' },
      { id: 'llama3.2:1b', name: 'Llama 3.2 (1B)', desc: 'Meta’nın hızlı ve akıcı hafif dil modeli; günlük diyalog ve Türkçe desteği.', size: '1.3 GB' },
      { id: 'gemma2:2b', name: 'Gemma 2 (2B)', desc: 'Google kompakt, yüksek akıl yürütme kabiliyetli hafif genel model.', size: '1.6 GB' }
    ],

    installedModels: new Set(),
    installedCount: 0,
    customModels: [],
    isServiceOnline: false,
    installBusy: false,

    init() {
      const btnRefresh = document.getElementById('btn-refresh-ollama');
      if (btnRefresh) {
        btnRefresh.addEventListener('click', () => this.render());
      }
      const btnInstall = document.getElementById('btn-install-ollama');
      if (btnInstall) {
        btnInstall.addEventListener('click', () => this.install());
      }
      const secOllama = document.getElementById('ai-sec-ollama');
      if (secOllama) {
        secOllama.addEventListener('toggle', () => {
          if (secOllama.open) this.render();
        });
      }
      this.render();
    },

    async checkService() {
      try {
        const resp = await fetch('http://127.0.0.1:11434/api/tags', { method: 'GET', signal: AbortSignal.timeout(2500) });
        if (resp.ok) {
          const data = await resp.json();
          this.installedModels.clear();
          const recIds = new Set(this.RECOMMENDED.map(r => r.id));
          this.customModels = [];
          const list = Array.isArray(data.models) ? data.models : [];
          this.installedCount = list.length;
          list.forEach(m => {
            if (!m || !m.name) return;
            this.installedModels.add(m.name);
            const baseName = m.name.split(':')[0];
            if (baseName) this.installedModels.add(baseName);
            if (!recIds.has(m.name)) {
              const sizeMb = m.size ? `${Math.round(m.size / (1024 * 1024))} MB` : 'Yerel';
              this.customModels.push({
                id: m.name,
                name: m.name,
                desc: 'Kullanıcı tarafından indirilen yerel Ollama modeli.',
                size: sizeMb
              });
            }
          });
          this.isServiceOnline = true;
          return true;
        }
      } catch (e) {}
      this.installedCount = 0;
      this.customModels = [];
      this.isServiceOnline = false;
      return false;
    },

    async render() {
      const statusText = document.getElementById('ai-ollama-status-text');
      const listEl = document.getElementById('ai-ollama-models-list');
      if (!listEl) return;

      const online = await this.checkService();
      const installRow = document.getElementById('ai-ollama-install-row');
      const installBtn = document.getElementById('btn-install-ollama');
      const installNote = document.getElementById('ai-ollama-install-note');
      if (installRow) installRow.hidden = online;
      if (installBtn && !this.installBusy) installBtn.disabled = false;

      if (!online) {
        if (statusText) statusText.innerHTML = '<span style="color:#f59e0b;">Ollama çevrimdışı (127.0.0.1:11434 bulunamadı)</span>';
        if (installNote) {
          installNote.textContent = 'Yerel modeller için Ollama motoru gerekir. Kurulum yönetici onayı ister ve tek seferliktir.';
        }
        listEl.innerHTML = '<div style="font-size:11px;color:var(--text-muted,#94a3b8);padding:6px;">Motor kurulu değilse yukarıdaki düğmeyle kurabilir; kurulumdan sonra modeller burada listelenir.</div>';
        return;
      }

      if (statusText) {
        statusText.innerHTML = `<span style="color:var(--success,#10b981);">Ollama Aktif</span> · ${this.installedCount} yerel model hazır`;
      }

      listEl.replaceChildren();
      const currentModel = SafeStorage.getItem('ankora_ai_model') || 'qwen2.5:0.5b';
      const allModels = [...this.RECOMMENDED, ...this.customModels];

      allModels.forEach(mod => {
        const isInstalled = this.installedModels.has(mod.id);
        const isActive = (SafeStorage.getItem('ankora_ai_provider') === 'ollama') && (currentModel === mod.id);

        const card = document.createElement('div');
        card.className = 'ai-ollama-card';
        card.style.cssText = 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:8px 10px;display:flex;align-items:center;justify-content:space-between;gap:8px;';

        card.innerHTML = `
          <div style="min-width:0;flex:1;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:12px;font-weight:600;color:var(--text-primary,#f8fafc);">${escapeHtml(mod.name)}</span>
              <span style="font-size:10px;padding:1px 5px;background:rgba(255,255,255,0.08);border-radius:4px;color:var(--text-muted,#94a3b8);">${escapeHtml(mod.size)}</span>
              ${isActive ? '<span style="font-size:10px;padding:1px 5px;background:rgba(16,185,129,0.2);color:#34d399;border-radius:4px;font-weight:500;">Etkin</span>' : ''}
            </div>
            <div style="font-size:10.5px;color:var(--text-muted,#94a3b8);margin-top:2px;line-height:1.3;">${escapeHtml(mod.desc)}</div>
            <div class="ollama-dl-prog" id="prog-${mod.id.replace(/[^a-z0-9]/g, '-')}" style="display:none;margin-top:4px;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;">
              <div class="ollama-dl-bar" style="height:100%;background:var(--accent-active,#38bdf8);width:0%;"></div>
            </div>
          </div>
          <div style="flex:none;">
            ${isActive ? '<button type="button" class="btn-pkg-sm" disabled style="opacity:0.6;font-size:11px;padding:4px 10px;">Seçili</button>' : (
              isInstalled
                ? `<button type="button" class="btn-pkg-sm btn-select-ollama" data-model="${mod.id}" style="font-size:11px;padding:4px 10px;">Etkinleştir</button>`
                : `<button type="button" class="btn-pkg-sm btn-download-ollama" data-model="${mod.id}" style="font-size:11px;padding:4px 10px;">İndir</button>`
            )}
          </div>
        `;
        listEl.appendChild(card);
      });

      listEl.querySelectorAll('.btn-select-ollama').forEach(btn => {
        btn.addEventListener('click', () => {
          const modId = btn.getAttribute('data-model');
          if (modId) {
            SafeStorage.setItem('ankora_ai_provider', 'ollama');
            SafeStorage.setItem('ankora_ai_model', modId);
            if (typeof AIAgent !== 'undefined') {
              AIAgent.provider = 'ollama';
              AIAgent.model = modId;
              AIAgent.updateBadges();
            }
            if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
              ReportManager.showToast(`Yerel model seçildi: ${modId}`, 'success');
            }
            this.render();
          }
        });
      });

      listEl.querySelectorAll('.btn-download-ollama').forEach(btn => {
        btn.addEventListener('click', () => {
          const modId = btn.getAttribute('data-model');
          if (modId) this.downloadModel(modId, btn);
        });
      });
    },

    async install() {
      if (this.installBusy) return;
      const btn = document.getElementById('btn-install-ollama');
      const note = document.getElementById('ai-ollama-install-note');
      const statusText = document.getElementById('ai-ollama-status-text');
      this.installBusy = true;
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Kuruluyor...';
      }
      if (note) {
        note.textContent = 'Resmî arşiv indiriliyor ve sha256 özeti doğrulanıyor. İşlem birkaç dakika sürebilir.';
      }
      if (statusText) statusText.textContent = 'Ollama kuruluyor...';

      try {
        const msg = await TauriBridge.invoke('install_ollama');
        if (statusText) statusText.textContent = 'Kurulum bitti, servis denetleniyor...';
        await this.checkService();
        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast(msg || 'Ollama kuruldu.', 'success');
        }
        await this.render();
      } catch (err) {
        const detail = err && err.message ? err.message : String(err);
        if (statusText) statusText.textContent = 'Kurulum tamamlanamadı';
        if (note) note.textContent = detail.slice(0, 320);
        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast('Ollama kurulumu başarısız.', 'error');
        }
      } finally {
        this.installBusy = false;
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Ollama'yı Kur";
        }
      }
    },

    async downloadModel(modelId, btnEl) {
      btnEl.disabled = true;
      btnEl.textContent = 'İndiriliyor...';
      const cleanId = modelId.replace(/[^a-z0-9]/g, '-');
      const progWrap = document.getElementById(`prog-${cleanId}`);
      const progBar = progWrap?.querySelector('.ollama-dl-bar');
      if (progWrap) progWrap.style.display = 'block';

      try {
        const resp = await fetch('http://127.0.0.1:11434/api/pull', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: modelId })
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const reader = resp.body?.getReader();
        const decoder = new TextDecoder();
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            chunk.split('\n').filter(Boolean).forEach(line => {
              try {
                const j = JSON.parse(line);
                if (j.total && j.completed && progBar) {
                  const pct = Math.min(100, Math.round((j.completed / j.total) * 100));
                  progBar.style.width = `${pct}%`;
                  btnEl.textContent = `%${pct}`;
                }
              } catch (e) {}
            });
          }
        }

        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast(`${modelId} başarıyla indirildi.`, 'success');
        }
        await this.checkService();
        this.render();
      } catch (err) {
        btnEl.disabled = false;
        btnEl.textContent = 'Hata (Tekrar)';
        if (typeof ReportManager !== 'undefined' && ReportManager.showToast) {
          ReportManager.showToast(`Model indirilemedi: ${err.message || err}`, 'error');
        }
      }
    }
  };

  Object.assign(window, { LinksManager, AIAgent, OllamaManager });
})();

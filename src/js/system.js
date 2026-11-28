// Ayaz DE Modülü: system.js
// Masaüstü araç takımları, Ağ/Radyo, Oturum, Ekran Görüntüsü, Güç, Pano, USB, Bildirimler, Ses, Bluetooth, Spotlight, MPRIS, Systray, Flasher ve Anlık Görüntü
(() => {
  'use strict';

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

      // Sekme/ekran durumu değiştiğinde saat ve hava durumunu senkronize et.
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          if (this.isEnabled('clock')) {
            this.paintClock();
            this.startClock();
          }
          if (this.isEnabled('weather') && document.getElementById('dw-weather-temp')) {
            const cache = this.weatherCache();
            if (!this._weatherAt || Date.now() - this._weatherAt >= this.WEATHER_FRESH_MS) this.loadWeather();
            else if (cache) this.paintWeather(cache.data, cache.city, cache.at);
          }
        }
      });
      window.addEventListener('focus', () => {
        if (this.isEnabled('clock')) {
          this.paintClock();
          this.startClock();
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
      meta.appendChild(this.make('span', null, 'dw-weather-high', 'En yüksek -'));
      meta.appendChild(this.make('span', null, 'dw-weather-low', 'En düşük -'));
      meta.appendChild(this.make('span', null, 'dw-weather-wind', 'Rüzgâr -'));
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
      if (high) high.textContent = 'En yüksek ' + (Number.isFinite(Number(max)) ? Math.round(Number(max)) + '°' : '-');
      const low = document.getElementById('dw-weather-low');
      if (low) low.textContent = 'En düşük ' + (Number.isFinite(Number(min)) ? Math.round(Number(min)) + '°' : '-');
      const wind = document.getElementById('dw-weather-wind');
      if (wind) {
        const w = Number(cur.wind_speed_10m);
        wind.textContent = 'Rüzgâr ' + (Number.isFinite(w) ? Math.round(w) + ' km/sa' : '-');
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
      try {
        window.dispatchEvent(new CustomEvent('ayaz:weather-updated', { detail: { data, city } }));
      } catch (e) {}
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

    // Saat widget'ı: sistem saatiyle tam senkronize, kaymasız zamanlayıcı
    startClock() {
      if (this.clockTimer) clearInterval(this.clockTimer);
      this.paintClock();
      this.clockTimer = setInterval(() => {
        if (!this.isEnabled('clock')) {
          this.stopClock();
          return;
        }
        this.paintClock();
      }, 1000);
    },

    stopClock() {
      if (this.clockTimer) {
        clearInterval(this.clockTimer);
        this.clockTimer = null;
      }
    },

    syncClock() {
      this.stopClock();
      if (this.isEnabled('clock')) this.startClock();
    },

    paintClock() {
      const timeEl = document.getElementById('dw-clock-time');
      const dateEl = document.getElementById('dw-clock-date');
      if (!timeEl && !dateEl) return;

      const now = new Date();
      const pad = n => (n < 10 ? '0' : '') + n;
      const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      if (timeEl && timeEl.textContent !== timeStr) timeEl.textContent = timeStr;
      if (dateEl) {
        const dateStr = now.toLocaleDateString('tr-TR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long'
        });
        if (dateEl.textContent !== dateStr) dateEl.textContent = dateStr;
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
        const secRaw = (n.security || '').trim();
        const isOpen = !secRaw || secRaw === '--';
        const secLabel = isOpen ? 'Açık ağ' : secRaw;
        const savedLabel = n.saved ? ' • Kayıtlı' : '';
        sub.textContent = n.active
          ? `Bağlı • Sinyal %${n.signal} • ${secLabel}`
          : `Sinyal %${n.signal} • ${secLabel}${savedLabel}`;
        meta.appendChild(strong);
        meta.appendChild(sub);
        row.appendChild(meta);
        if (!n.active) {
          const btn = document.createElement('button');
          btn.className = 'btn-pkg-sm';
          btn.textContent = 'Bağlan';
          btn.addEventListener('click', () => this.connect(n, btn));
          row.appendChild(btn);
        }
        list.appendChild(row);
      });
    },

    promptWifiPassword(ssid, security, initialError) {
      return new Promise((resolve) => {
        const modal = document.getElementById('modal-wifi-password');
        const ssidEl = document.getElementById('wifi-modal-ssid');
        const secEl = document.getElementById('wifi-modal-sec');
        const input = document.getElementById('wifi-modal-password');
        const toggleBtn = document.getElementById('btn-wifi-toggle-pass');
        const errEl = document.getElementById('wifi-modal-error');
        const btnConnect = document.getElementById('btn-wifi-modal-connect');
        const btnCancel = document.getElementById('btn-wifi-modal-cancel');
        const btnClose = document.getElementById('btn-wifi-modal-close');

        if (!modal || !input || !btnConnect || !btnCancel) {
          resolve(null);
          return;
        }

        if (ssidEl) ssidEl.textContent = ssid;
        if (secEl) secEl.textContent = (security && security !== '--') ? security : 'Şifreli';
        input.value = '';
        input.type = 'password';
        if (toggleBtn) toggleBtn.textContent = 'Göster';
        if (errEl) {
          if (initialError) {
            errEl.textContent = initialError;
            errEl.style.display = 'block';
          } else {
            errEl.textContent = '';
            errEl.style.display = 'none';
          }
        }

        const cleanup = (val) => {
          modal.style.display = 'none';
          btnConnect.removeEventListener('click', onSubmit);
          btnCancel.removeEventListener('click', onCancel);
          if (btnClose) btnClose.removeEventListener('click', onCancel);
          if (toggleBtn) toggleBtn.removeEventListener('click', onToggle);
          input.removeEventListener('keydown', onKey);
          modal.removeEventListener('click', onBackdrop);
          document.removeEventListener('keydown', onEsc);
          resolve(val);
        };

        const onSubmit = () => {
          const val = input.value;
          if (!val) {
            if (errEl) {
              errEl.textContent = 'Lütfen kablosuz ağ parolasını girin.';
              errEl.style.display = 'block';
            }
            input.focus();
            return;
          }
          cleanup(val);
        };
        const onCancel = () => cleanup(null);
        const onToggle = () => {
          const show = input.type === 'password';
          input.type = show ? 'text' : 'password';
          toggleBtn.textContent = show ? 'Gizle' : 'Göster';
          input.focus();
        };
        const onKey = (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSubmit();
          }
        };
        const onBackdrop = (e) => {
          if (e.target === modal) onCancel();
        };
        const onEsc = (e) => {
          if (e.key === 'Escape') onCancel();
        };

        btnConnect.addEventListener('click', onSubmit);
        btnCancel.addEventListener('click', onCancel);
        if (btnClose) btnClose.addEventListener('click', onCancel);
        if (toggleBtn) toggleBtn.addEventListener('click', onToggle);
        input.addEventListener('keydown', onKey);
        modal.addEventListener('click', onBackdrop);
        document.addEventListener('keydown', onEsc);

        modal.style.display = 'flex';
        setTimeout(() => input.focus(), 30);
      });
    },

    async connect(network, btn) {
      const ssid = typeof network === 'string' ? network : (network && network.ssid) || '';
      const sec = (network && network.security) ? String(network.security).trim() : '';
      const isSecured = Boolean(sec && sec !== '--');
      const isSaved = Boolean(network && network.saved);
      if (!ssid) return;

      const setBusy = (busy) => {
        if (!btn) return;
        btn.disabled = busy;
        btn.textContent = busy ? 'Bağlanıyor…' : 'Bağlan';
      };

      let password;
      if (isSecured && !isSaved) {
        password = await this.promptWifiPassword(ssid, sec, '');
        if (password === null) return;
      }

      setBusy(true);
      try {
        let msg;
        try {
          msg = await TauriBridge.invoke(
            'wifi_connect',
            password !== undefined ? { ssid, password } : { ssid }
          );
        } catch (firstErr) {
          const errStr = String(firstErr.message || firstErr);
          const needsPass = /parol|secrets|password|şifre|key-mgmt|no-secrets|authentication/i.test(errStr);
          if (needsPass) {
            setBusy(false);
            const retryPass = await this.promptWifiPassword(
              ssid,
              sec || 'Şifreli',
              password !== undefined ? errStr : ''
            );
            if (retryPass === null) return;
            setBusy(true);
            msg = await TauriBridge.invoke('wifi_connect', { ssid, password: retryPass });
          } else {
            throw firstErr;
          }
        }
        ReportManager.showToast(msg || `Bağlanıldı: ${ssid}`);
        await this.loadState();
        await this.scan(false);
      } catch (err) {
        ReportManager.showToast(`Bağlanılamadı: ${err.message || err}`, 'error');
        setBusy(false);
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
        ReportManager.showToast(`Ekran görüntüsü yakalandı: ${res.file_name || ''}`);
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
      // Başlat menüsü, hızlı ayarlar, takvim, AI mini balon ve bağlam menülerini otomatik kapat
      try {
        if (typeof window.toggleStartMenu === 'function') window.toggleStartMenu(false);
        else document.getElementById('start-flyout')?.classList.remove('open');
        document.getElementById('start-btn')?.classList.remove('active');
        document.getElementById('quick-settings-popover')?.classList.remove('open');
        document.getElementById('calendar-flyout')?.classList.remove('open');
        document.getElementById('ai-mini-popover')?.classList.remove('open');
        document.querySelectorAll('.desktop-context-menu.open, .taskbar-tab-menu.open').forEach(m => m.classList.remove('open'));
        if (typeof WindowManager !== 'undefined' && WindowManager.ensureDesktopLayer) {
          WindowManager.ensureDesktopLayer(true);
        }
      } catch (e) {}

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
      if (typeof WindowManager !== 'undefined' && typeof WindowManager.checkAllMinimizedOrClosed === 'function') {
        WindowManager.checkAllMinimizedOrClosed();
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
      setInterval(() => {
        if (!document.hidden && !(window.LockManager && window.LockManager.isLocked)) {
          this.pollClipboard();
        }
      }, 5000);
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
      container.replaceChildren();

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
      this._timer = setInterval(() => this.pollDrives(false), 7000);
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
        const hasMount = !!d.mountpoint;
        const isRemovable = d.removable !== false;
        const item = document.createElement('div');
        item.className = 'files-sidebar-item usb-dynamic-drive';
        item.setAttribute('data-path', d.mountpoint || d.name);
        item.style.cssText = isRemovable
          ? 'color:var(--accent-active, #38bdf8);font-weight:500;'
          : 'color:var(--text-secondary, #9aa3b2);font-weight:500;opacity:0.92;';
        const fsTag = d.fstype ? ` (${d.fstype.toUpperCase()})` : '';
        const statusHint = hasMount ? '' : ' · Bağla';
        item.innerHTML = `<svg class="files-sidebar-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"></path><line x1="8" y1="12" x2="8.01" y2="12"></line><line x1="12" y1="12" x2="12.01" y2="12"></line></svg><span>${escapeHtml((d.label || d.name) + statusHint)}</span>`;
        item.title = hasMount
          ? (isRemovable
            ? `${d.label} (${d.size})${fsTag}\nBağlantı: ${d.mountpoint}\n• Tıkla: Aç\n• Sağ tık: Güvenle Çıkar`
            : `${d.label} (${d.size}) — Dahili disk${fsTag}\nBağlantı: ${d.mountpoint}\n• Tıkla: Aç`)
          : `${d.label} (${d.size})${fsTag}\nHenüz bağlı değil — Tıkla ve bağla`;
        item.addEventListener('click', async () => {
          document.querySelectorAll('.files-sidebar-item').forEach(i => i.classList.remove('active'));
          item.classList.add('active');
          if (d.mountpoint) {
            FileManager?.loadDirectory(d.mountpoint);
            return;
          }
          try {
            ReportManager?.showToast(`Disk bağlanıyor: ${d.label || d.name}...`);
            const mp = await TauriBridge.invoke('mount_drive', { device: d.name });
            if (mp) {
              d.mountpoint = mp;
              ReportManager?.showToast(`Bağlandı: ${mp}`);
              this.pollDrives(false);
              FileManager?.loadDirectory(mp);
            }
          } catch (err) {
            ReportManager?.showToast(`Disk bağlanamadı: ${err.message || err}`, 'error');
          }
        });
        sidebar.appendChild(item);
        // "Güvenle çıkar" yalnızca bağlı harici (USB vb.) aygıtlar için anlamlıdır.
        if (!isRemovable || !hasMount) return;
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

      // İlk bildirim çekme ve düzenli yoklama (6 sn, sekme gizliyken atlanır)
      this.poll();
      this.pollInterval = setInterval(() => {
        if (!document.hidden && !(window.LockManager && window.LockManager.isLocked)) this.poll();
      }, 6000);

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
          if (this.dismissedIds && this.dismissedIds.size > 0) {
            list = list.filter(n => !this.dismissedIds.has(n.id));
          }
          if (this.clearedAllTimestamp) {
            list = list.filter(n => {
              const notifTime = n.timestamp ? (n.timestamp > 1e11 ? n.timestamp : n.timestamp * 1000) : 0;
              return !notifTime || notifTime > this.clearedAllTimestamp;
            });
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
      if (!this.dismissedIds) this.dismissedIds = new Set();
      this.notifications.forEach(n => {
        if (n && n.id) this.dismissedIds.add(n.id);
      });
      this.clearedAllTimestamp = Date.now();
      this.localExtras = [];
      this.notifications = [];
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

      list.replaceChildren();
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
      if (typeof WindowManager !== 'undefined' && WindowManager.ensureDesktopLayer) {
        WindowManager.ensureDesktopLayer(true);
      } else {
        try {
          TauriBridge.invoke('set_desktop_layer', { above: true }).catch(() => {});
        } catch (e) {}
      }
    },

    close() {
      if (!this.overlay || !this.input) return;
      this.isOpen = false;
      this.overlay.style.display = 'none';
      this.input.blur();
      if (typeof LockManager !== 'undefined' && LockManager.isLocked) {
        if (typeof WindowManager !== 'undefined' && WindowManager.ensureDesktopLayer) {
          WindowManager.ensureDesktopLayer(true, true);
        }
        return;
      }
      if (typeof WindowManager !== 'undefined' && WindowManager.syncDesktopLayer) {
        WindowManager.syncDesktopLayer();
      } else {
        try {
          TauriBridge.invoke('set_desktop_layer', { above: false }).catch(() => {});
        } catch (e) {}
      }
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
        const mergedApps = [];
        const seenAppKeys = new Set();
        [
          ...(XdgDesktopEngine.installedApps || []),
          ...(XdgDesktopEngine.getDefaultApps ? XdgDesktopEngine.getDefaultApps() : [])
        ].forEach(app => {
          if (!app) return;
          const key = app.id || app.name;
          if (!key || seenAppKeys.has(key)) return;
          seenAppKeys.add(key);
          mergedApps.push(app);
        });

        const matchedApps = mergedApps.filter(app => {
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
                    TauriBridge.invoke('open_path', { path: f.path })
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
      this.results.replaceChildren();

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
    tickTimer: null,
    currentStatus: null,
    selectedPlayer: '',
    lastArtUrl: '',
    basePos: 0,
    baseAt: 0,

    init() {
      this.selectedPlayer = SafeStorage.getItem('ankora_mpris_player') || '';

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
      this.pollTimer = setInterval(() => {
        if (!document.hidden && !document.body.classList.contains('is-dragging') && !(window.LockManager && window.LockManager.isLocked)) this.update();
      }, 5000);
      if (this.tickTimer) clearInterval(this.tickTimer);
      this.tickTimer = setInterval(() => {
        if (!document.hidden && !document.body.classList.contains('is-dragging') && this.isPlaying()) this.paintProgress();
      }, 1000);
    },

    isPlaying() {
      return !!this.currentStatus &&
        String(this.currentStatus.playback_status || '').toLowerCase() === 'playing';
    },

    currentPosition() {
      if (!this.currentStatus) return 0;
      const pos = Number(this.basePos) || 0;
      const elapsed = this.isPlaying() ? (Date.now() - this.baseAt) / 1000 : 0;
      const total = Number(this.currentStatus.length_sec) || 0;
      const raw = pos + Math.max(0, elapsed);
      return total > 0 ? Math.min(raw, total) : Math.max(0, raw);
    },

    paintProgress() {
      const status = this.currentStatus;
      if (!status) return;
      const total = Number(status.length_sec) || 0;
      const pct = total > 0 ? Math.min(100, (this.currentPosition() / total) * 100) : 0;
      const adaBar = document.getElementById('di-media-progress-bar');
      const cardBar = document.getElementById('mpris-progress-bar');
      const faceBar = document.querySelector('.face-media-progress-bar');
      [adaBar, cardBar].forEach(el => {
        if (el) el.style.width = `${pct.toFixed(1)}%`;
      });
      if (faceBar) faceBar.style.width = `${pct.toFixed(1)}%`;
    },

    renderPlayers(players) {
      const box = document.getElementById('mpris-players');
      if (!box) return;
      const list = Array.isArray(players) ? players : [];
      if (list.length < 2) {
        box.replaceChildren();
        box.hidden = true;
        return;
      }
      box.hidden = false;
      box.replaceChildren();
      const makePill = (label, value, title) => {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'mpris-player-pill';
        const isActive = value === this.selectedPlayer ||
          (!this.selectedPlayer && this.currentStatus && this.currentStatus.player_name === value);
        pill.classList.toggle('active', !!isActive);
        pill.textContent = label;
        pill.title = title || label;
        pill.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectedPlayer = value;
          if (value) {
            SafeStorage.setItem('ankora_mpris_player', value);
          } else {
            SafeStorage.removeItem('ankora_mpris_player');
          }
          this.update();
        });
        box.appendChild(pill);
      };
      makePill('Otomatik', '', 'Çalan oynatıcıyı kendisi seçer');
      list.forEach(p => {
        const name = String(p.player_name || '').split('.instance')[0];
        makePill(name, p.player_name, `${
          p.title ? p.title + ' · ' : ''
        }${p.artist || p.player_name}`);
      });
    },

    async update() {
      try {
        const params = this.selectedPlayer ? { player: this.selectedPlayer } : {};
        const res = await TauriBridge.invoke('get_mpris_status', params);

        // Seçili oynatıcı artık yoksa otomatik seçime dön.
        if (this.selectedPlayer && res && Array.isArray(res.players)
            && res.players.length > 0
            && !res.players.some(p => p.player_name === this.selectedPlayer)) {
          this.selectedPlayer = '';
          SafeStorage.removeItem('ankora_mpris_player');
        }

        this.currentStatus = (res && res.is_active) ? res : null;
        this.basePos = res ? (Number(res.position_sec) || 0) : 0;
        this.baseAt = Date.now();

        this.renderPlayers(res ? res.players : []);
        this.paintProgress();

        if (typeof DynamicIslandManager !== 'undefined' && DynamicIslandManager.setMediaStatus) {
          DynamicIslandManager.setMediaStatus(res);
        }
        if (typeof window.FaceManager !== 'undefined' && window.FaceManager.updateMediaBar) {
          window.FaceManager.updateMediaBar(this.currentStatus);
        }

        const card = document.getElementById('mpris-widget-card');
        if (!card) return;

        if (this.currentStatus) {
          card.style.display = 'flex';
          const titleEl = document.getElementById('mpris-title');
          const artistEl = document.getElementById('mpris-artist');
          const playBtn = document.getElementById('mpris-btn-play');
          const artBox = document.getElementById('mpris-art-box');
          const status = this.currentStatus;

          if (titleEl) titleEl.textContent = status.title || 'Bilinmeyen Parça';
          if (artistEl) {
            const sub = [status.artist, status.player_name].filter(Boolean).join(' • ');
            artistEl.textContent = sub || 'Medya Oynatıcı';
          }
          if (playBtn) {
            const playing = this.isPlaying();
            playBtn.textContent = playing ? '⏸' : '▶';
            playBtn.title = playing ? 'Duraklat' : 'Oynat';
          }
          if (artBox) {
            const art = status.art_url || '';
            const usable = art.startsWith('http') || art.startsWith('file://');
            if (usable && art !== this.lastArtUrl) {
              this.lastArtUrl = art;
              artBox.innerHTML = `<img src="${escapeHtml(art)}" alt="Albüm Kapağı" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">`;
            } else if (!usable && this.lastArtUrl) {
              this.lastArtUrl = '';
              artBox.innerHTML = '<svg class="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>';
            }
          }
        } else {
          card.style.display = 'none';
        }
      } catch (err) {
        this.currentStatus = null;
        if (typeof DynamicIslandManager !== 'undefined' && DynamicIslandManager.setMediaStatus) {
          DynamicIslandManager.setMediaStatus(null);
        }
        if (typeof window.FaceManager !== 'undefined' && window.FaceManager.updateMediaBar) {
          window.FaceManager.updateMediaBar(null);
        }
        const card = document.getElementById('mpris-widget-card');
        if (card) card.style.display = 'none';
      }
    },

    async sendCommand(cmd) {
      try {
        const payload = { command: cmd };
        if (this.selectedPlayer) payload.player = this.selectedPlayer;
        await TauriBridge.invoke('send_mpris_command', payload);
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
      this.pollTimer = setInterval(() => {
        if (!document.hidden && !(window.LockManager && window.LockManager.isLocked)) {
          this.refresh();
        }
      }, 4000);
    },

    async refresh() {
      const container = document.getElementById('taskbar-systray-container');
      if (!container) return;

      try {
        const items = await TauriBridge.invoke('get_tray_items');
        if (!Array.isArray(items)) return;

        this.items = items;
        container.replaceChildren();

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
        select.replaceChildren();

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
        select.replaceChildren();

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
        container.replaceChildren();

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

  Object.assign(window, { WidgetManager, RadioManager, SessionManager, safeInit, ScreenshotManager, PowerManager, ClipboardManager, UsbDriveWatcher, NotificationManager, AudioDeviceManager, BluetoothManager, SpotlightManager, MprisManager, SystrayManager, FlasherManager, SnapshotManager });
})();

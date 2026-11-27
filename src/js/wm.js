// Ayaz DE Modülü: wm.js
// Pencere yöneticisi ve sanal çalışma alanları
(() => {
  'use strict';

  // ============================================================================
  // 1. GERÇEK TAURI NATIVE WINDOW MANAGER
  // ============================================================================
  const WindowManager = {
    highestZ: 30,
    windows: [],
    nativeWindows: [],
    _desktopHidden: false,
    tabsContainer: null,
    _isLayerAbove: false,
    // Tembel render: kapatılıp DOM'dan çıkarılan pencereler açılışta geri takılır.
    detached: new Map(),

    getWorkArea() {
      const rootCs = getComputedStyle(document.documentElement);
      let top = parseInt(rootCs.getPropertyValue('--workarea-top'), 10);
      let bottom = parseInt(rootCs.getPropertyValue('--workarea-bottom'), 10);
      top = Number.isFinite(top) ? top : 0;
      const tbVar = parseInt(rootCs.getPropertyValue('--taskbar-height'), 10);
      bottom = Number.isFinite(bottom) ? bottom : (Number.isFinite(tbVar) ? tbVar : 40);

      const taskbar = document.getElementById('taskbar');
      if (taskbar && getComputedStyle(taskbar).display !== 'none') {
        const tbRect = taskbar.getBoundingClientRect();
        if (document.body.classList.contains('panel-top') || tbRect.top < window.innerHeight * 0.5) {
          if (tbRect.bottom > top) top = Math.ceil(tbRect.bottom);
          if (document.body.classList.contains('panel-top')) bottom = 0;
        } else {
          const usedBottom = Math.ceil(window.innerHeight - tbRect.top);
          if (usedBottom > bottom && usedBottom < window.innerHeight * 0.35) bottom = usedBottom;
        }
      }

      const topPanel = document.getElementById('face-top-panel');
      if (topPanel && getComputedStyle(topPanel).display !== 'none') {
        const tpRect = topPanel.getBoundingClientRect();
        if (tpRect.bottom > top) top = Math.ceil(tpRect.bottom);
      }
      const dock = document.getElementById('face-bottom-dock');
      if (dock && getComputedStyle(dock).display !== 'none') {
        const dRect = dock.getBoundingClientRect();
        if (dRect.height > 0 && dRect.top < window.innerHeight) {
          const usedBottom = Math.ceil(window.innerHeight - dRect.top);
          if (usedBottom > bottom && usedBottom < window.innerHeight * 0.35) bottom = usedBottom;
        }
      }
      const width = Math.max(320, window.innerWidth);
      const height = Math.max(260, window.innerHeight - top - bottom);
      return { top, bottom, width, height };
    },

    clampWindow(win) {
      if (!win || !win.classList.contains('open') || win.classList.contains('maximized')) return;
      const wa = this.getWorkArea();
      const minTop = wa.top + 6;
      const maxTop = Math.max(minTop, window.innerHeight - wa.bottom - 44);
      const rect = win.getBoundingClientRect();
      const curTop = parseFloat(win.style.top);
      const curLeft = parseFloat(win.style.left);
      const effectiveTop = Number.isFinite(curTop) ? curTop : rect.top;
      const effectiveLeft = Number.isFinite(curLeft) ? curLeft : rect.left;

      const maxAvailH = Math.max(260, wa.height - 12);
      if (rect.height > maxAvailH) {
        win.style.height = `${maxAvailH}px`;
      }
      const clampedTop = Math.max(minTop, Math.min(effectiveTop, maxTop));
      const maxLeft = Math.max(0, wa.width - Math.min(rect.width || 300, 160));
      const clampedLeft = Math.max(0, Math.min(effectiveLeft, maxLeft));

      win.style.top = `${Math.round(clampedTop)}px`;
      win.style.left = `${Math.round(clampedLeft)}px`;
    },

    clampAllWindows() {
      this.windows.forEach(w => {
        if (w.classList.contains('open')) this.clampWindow(w);
      });
    },

    ensureDesktopLayer(above, force = false) {
      if (above && !force && this._isLayerAbove === true) return;
      this._isLayerAbove = Boolean(above);
      TauriBridge.invoke('set_desktop_layer', { above: Boolean(above) }).catch(() => {});
    },

    checkAllMinimizedOrClosed() {
      const hasActive = this.windows.some(w => w.classList.contains('open') && !w.classList.contains('minimized'));
      if (!hasActive) {
        this.ensureDesktopLayer(false);
      }
    },

    syncDesktopLayer() {
      const hasActive = this.windows.some(w => w.classList.contains('open') && !w.classList.contains('minimized'));
      this.ensureDesktopLayer(hasActive);
    },

    init() {
      // Tauri 2 masaüstü kabuk penceresinin sürüklenmesini engelle:
      // iç pencere başlıkları DOM üzerinden yönetilir.
      const dragRegionAttr = ['data', 'tauri', 'drag', 'region'].join('-');
      document.querySelectorAll(`[${dragRegionAttr}]`).forEach((el) => {
        el.removeAttribute(dragRegionAttr);
      });
      window.addEventListener('scroll', () => {
        if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
      }, { passive: true });
      window.addEventListener('resize', () => this.clampAllWindows(), { passive: true });
      this.windows = Array.from(document.querySelectorAll('.window'));
      this.tabsContainer = document.getElementById('running-tabs');
      setInterval(() => {
        if (!document.hidden && !document.body.classList.contains('is-dragging') && !(window.LockManager && window.LockManager.isLocked)) {
          this.refreshNativeWindows();
        }
      }, 2500);
      this.refreshNativeWindows();

      const wp = document.getElementById('desktop-wallpaper');
      if (wp) {
        wp.addEventListener('click', () => {
          this.checkAllMinimizedOrClosed();
        });
      }
      const tb = document.getElementById('taskbar');
      if (tb) {
        tb.addEventListener('mousedown', (e) => {
          if (!e.target.closest('.task-tab') && !e.target.closest('#start-btn')) {
            this.checkAllMinimizedOrClosed();
          }
        });
      }

      // Pencere düğmeleri belge düzeyinde dinlenir: init'ten sonra eklenen
      // pencereler de kapat/küçült/büyüt düğmelerine yanıt verir.
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('.ctrl-btn');
        if (!btn) return;
        const w = btn.closest('.window');
        if (!w) return;
        e.stopPropagation();
        if (!this.windows.includes(w)) this.windows.push(w);
        if (btn.classList.contains('close')) this.close(w);
        else if (btn.classList.contains('min')) this.minimize(w);
        else if (btn.classList.contains('max')) this.toggleMaximize(w);
      }, true);

      this.windows.forEach(win => {
        win.addEventListener('mousedown', () => this.bringToFront(win));

        const btnMax = win.querySelector('.ctrl-btn.max');
        if (btnMax) {
          btnMax.addEventListener('mouseenter', () => {
            const menu = document.getElementById('snap-layouts-menu');
            if (!menu) return;
            const bRect = btnMax.getBoundingClientRect();
            menu.style.top = `${bRect.bottom + 6}px`;
            menu.style.left = `${Math.max(10, bRect.right - 240)}px`;
            menu.classList.add('open');
            this.activeSnapTargetWin = win;
          });
          btnMax.addEventListener('mouseleave', () => {
            const menu = document.getElementById('snap-layouts-menu');
            if (!menu) return;
            setTimeout(() => {
              if (!menu.matches(':hover') && !btnMax.matches(':hover')) {
                menu.classList.remove('open');
              }
            }, 250);
          });
        }

        // Yüksek Performanslı ve Akıcı Pencere Sürükleme (GPU / rAF Dragging + Ayaz DE Edge Snapping)
        const header = win.querySelector('.window-header');
        if (header) {
          // Başlığa çift tıklama ile Büyüt / Eski Boyuta Getir
          header.addEventListener('dblclick', (e) => {
            if (e.target.closest('.window-controls')) return;
            this.toggleMaximize(win);
          });

          header.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            if (e.target.closest('.window-controls')) return;
            e.preventDefault();

            this.bringToFront(win);
            win.style.willChange = 'transform';

            let wasMax = win.classList.contains('maximized');
            const snapGhost = document.getElementById('snap-ghost-indicator') || document.getElementById('window-snap-preview');
            const rect = win.getBoundingClientRect();
            let startLeft = rect.left;
            let startTop = rect.top;
            let shiftX = e.clientX - startLeft;
            let shiftY = e.clientY - startTop;

            const wa = this.getWorkArea();
            const sw = wa.width;
            const sh = wa.height;
            const minTop = wa.top + 4;
            const maxLeft = Math.max(0, sw - 80);
            const maxTop = Math.max(minTop, window.innerHeight - wa.bottom - 44);

            let rafId = null;
            let targetX = startLeft;
            let targetY = startTop;
            let activeSnap = null;
            let renderedSnap = null;
            let draggingActive = false;

            const updateSnapGhost = (nextSnap) => {
              if (nextSnap === renderedSnap) return;
              renderedSnap = nextSnap;
              if (!snapGhost) return;
              if (!nextSnap) {
                snapGhost.classList.remove('visible');
                snapGhost.style.display = 'none';
                return;
              }
              snapGhost.style.display = 'block';
              const halfW = sw * 0.5;
              const halfH = sh * 0.5;
              if (nextSnap === 'corner-tl') {
                snapGhost.style.left = '4px';
                snapGhost.style.top = `${wa.top + 4}px`;
                snapGhost.style.width = `${halfW - 8}px`;
                snapGhost.style.height = `${halfH - 8}px`;
              } else if (nextSnap === 'corner-tr') {
                snapGhost.style.left = `${halfW + 4}px`;
                snapGhost.style.top = `${wa.top + 4}px`;
                snapGhost.style.width = `${halfW - 8}px`;
                snapGhost.style.height = `${halfH - 8}px`;
              } else if (nextSnap === 'corner-bl') {
                snapGhost.style.left = '4px';
                snapGhost.style.top = `${wa.top + halfH + 4}px`;
                snapGhost.style.width = `${halfW - 8}px`;
                snapGhost.style.height = `${halfH - 8}px`;
              } else if (nextSnap === 'corner-br') {
                snapGhost.style.left = `${halfW + 4}px`;
                snapGhost.style.top = `${wa.top + halfH + 4}px`;
                snapGhost.style.width = `${halfW - 8}px`;
                snapGhost.style.height = `${halfH - 8}px`;
              } else if (nextSnap === 'left') {
                snapGhost.style.left = '4px';
                snapGhost.style.top = `${wa.top + 4}px`;
                snapGhost.style.width = `${halfW - 8}px`;
                snapGhost.style.height = `${sh - 8}px`;
              } else if (nextSnap === 'right') {
                snapGhost.style.left = `${halfW + 4}px`;
                snapGhost.style.top = `${wa.top + 4}px`;
                snapGhost.style.width = `${halfW - 8}px`;
                snapGhost.style.height = `${sh - 8}px`;
              } else if (nextSnap === 'top') {
                snapGhost.style.left = '4px';
                snapGhost.style.top = `${wa.top + 4}px`;
                snapGhost.style.width = `${sw - 8}px`;
                snapGhost.style.height = `${sh - 8}px`;
              }
              snapGhost.classList.add('visible');
            };

            const applyPos = () => {
              const dx = Math.round(targetX - startLeft);
              const dy = Math.round(targetY - startTop);
              win.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
              updateSnapGhost(activeSnap);
              rafId = null;
            };

            const onMouseMove = (moveEvent) => {
              if (!draggingActive) {
                if (Math.abs(moveEvent.clientX - e.clientX) < 5 && Math.abs(moveEvent.clientY - e.clientY) < 5) return;
                draggingActive = true;
                if (wasMax) {
                  const preW = parseFloat(win.dataset.preMaxW) || Math.min(840, sw * 0.75);
                  const preH = parseFloat(win.dataset.preMaxH) || Math.min(520, sh * 0.75);
                  const ratio = Math.max(0.1, Math.min(0.9, e.clientX / sw));
                  this.toggleMaximize(win);
                  win.style.width = `${preW}px`;
                  win.style.height = `${preH}px`;
                  shiftX = preW * ratio;
                  shiftY = 18;
                  startLeft = Math.max(0, Math.min(moveEvent.clientX - shiftX, maxLeft));
                  startTop = Math.max(minTop, Math.min(moveEvent.clientY - shiftY, maxTop));
                  wasMax = false;
                }
                win.style.left = `${Math.round(startLeft)}px`;
                win.style.top = `${Math.round(startTop)}px`;
                document.body.classList.add('is-dragging');
                win.classList.add('is-dragging');
              }

              targetX = Math.max(0, Math.min(moveEvent.clientX - shiftX, maxLeft));
              targetY = Math.max(minTop, Math.min(moveEvent.clientY - shiftY, maxTop));

              // Ayaz DE Akıcı Köşe ve Kenar Kenetleme Algılayıcı (Aero Snap)
              const cx = moveEvent.clientX;
              const cy = moveEvent.clientY;
              if (cx < 20 && cy < wa.top + 35) activeSnap = 'corner-tl';
              else if (cx > sw - 20 && cy < wa.top + 35) activeSnap = 'corner-tr';
              else if (cx < 20 && cy > window.innerHeight - wa.bottom - 36) activeSnap = 'corner-bl';
              else if (cx > sw - 20 && cy > window.innerHeight - wa.bottom - 36) activeSnap = 'corner-br';
              else if (cx < 18) activeSnap = 'left';
              else if (cx > sw - 18) activeSnap = 'right';
              else if (cy <= wa.top + 14) activeSnap = 'top';
              else activeSnap = null;

              if (!rafId) {
                rafId = requestAnimationFrame(applyPos);
              }
            };

            const onMouseUp = () => {
              if (rafId) cancelAnimationFrame(rafId);
              document.body.classList.remove('is-dragging');
              win.classList.remove('is-dragging');
              win.style.willChange = '';
              updateSnapGhost(null);

              document.removeEventListener('mousemove', onMouseMove);
              document.removeEventListener('mouseup', onMouseUp);

              if (!draggingActive) return;

              win.style.transition = 'none';
              win.style.transform = '';
              win.style.left = `${Math.round(targetX)}px`;
              win.style.top = `${Math.round(targetY)}px`;
              void win.offsetWidth;
              win.style.transition = '';

              // Snapping Eylemini Uygula
              if (activeSnap === 'left') {
                this.snapWindow(win, 'left-half');
              } else if (activeSnap === 'right') {
                this.snapWindow(win, 'right-half');
              } else if (activeSnap === 'top') {
                this.toggleMaximize(win);
              } else if (activeSnap === 'corner-tl') {
                this.snapWindow(win, 'corner-tl');
              } else if (activeSnap === 'corner-tr') {
                this.snapWindow(win, 'corner-tr');
              } else if (activeSnap === 'corner-bl') {
                this.snapWindow(win, 'corner-bl');
              } else if (activeSnap === 'corner-br') {
                this.snapWindow(win, 'corner-br');
              }
            };

            document.addEventListener('mousemove', onMouseMove, { passive: true });
            document.addEventListener('mouseup', onMouseUp, { once: true });
          });

          // Dokunmatik sürükleme: tek parmak başlıkta pencereyi taşır.
          // Fare yolu aynen korunur; dokunmatik yalnızca konum uygular
          // (kenetleme fareye özeldir). touch-action: none CSS'te tanımlı.
          header.addEventListener('touchstart', (e) => {
            if (e.target.closest('.window-controls')) return;
            if (e.touches.length !== 1) return;
            this.bringToFront(win);
            win.style.willChange = 'transform';
            const t = e.touches[0];
            const rect = win.getBoundingClientRect();
            const startLeft = rect.left;
            const startTop = rect.top;
            const offX = t.clientX - startLeft;
            const offY = t.clientY - startTop;
            const wa = this.getWorkArea();
            const minTop = wa.top + 4;
            const maxLeft = Math.max(0, wa.width - 80);
            const maxTop = Math.max(minTop, window.innerHeight - wa.bottom - 44);
            let targetX = startLeft;
            let targetY = startTop;
            let touchRaf = null;
            let moved = false;

            const applyTouchPos = () => {
              const dx = Math.round(targetX - startLeft);
              const dy = Math.round(targetY - startTop);
              win.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
              touchRaf = null;
            };

            const onTouchMove = (me) => {
              if (me.touches.length !== 1) return;
              if (me.cancelable) me.preventDefault();
              const m = me.touches[0];
              if (!moved) {
                moved = true;
                win.style.left = `${Math.round(startLeft)}px`;
                win.style.top = `${Math.round(startTop)}px`;
                document.body.classList.add('is-dragging');
                win.classList.add('is-dragging');
              }
              targetX = Math.max(0, Math.min(m.clientX - offX, maxLeft));
              targetY = Math.max(minTop, Math.min(m.clientY - offY, maxTop));
              if (!touchRaf) touchRaf = requestAnimationFrame(applyTouchPos);
            };
            const onTouchEnd = () => {
              if (touchRaf) cancelAnimationFrame(touchRaf);
              header.removeEventListener('touchmove', onTouchMove);
              document.body.classList.remove('is-dragging');
              win.classList.remove('is-dragging');
              win.style.willChange = '';
              if (moved) {
                win.style.transition = 'none';
                win.style.transform = '';
                win.style.left = `${Math.round(targetX)}px`;
                win.style.top = `${Math.round(targetY)}px`;
                void win.offsetWidth;
                win.style.transition = '';
                if (typeof SessionManager !== 'undefined') SessionManager.touch();
              }
            };
            header.addEventListener('touchmove', onTouchMove, { passive: false });
            header.addEventListener('touchend', onTouchEnd, { once: true });
            header.addEventListener('touchcancel', onTouchEnd, { once: true });
          }, { passive: true });
        }

        // Pencere Boyutlandırma Tutamacı (Resize Handle)
        if (!win.querySelector('.window-resize-handle')) {
          const handle = document.createElement('div');
          handle.className = 'window-resize-handle';
          handle.title = 'Yeniden Boyutlandır';
          win.appendChild(handle);

          handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.bringToFront(win);

            const startW = win.offsetWidth;
            const startH = win.offsetHeight;
            const startX = e.clientX;
            const startY = e.clientY;
            let resizeRaf = null;
            let targetW = startW;
            let targetH = startH;
            let resizingActive = false;

            const applyResize = () => {
              win.style.width = `${targetW}px`;
              win.style.height = `${targetH}px`;
              resizeRaf = null;
            };

            const onResizeMove = (moveEvent) => {
              if (win.classList.contains('maximized')) return;
              if (!resizingActive) {
                resizingActive = true;
                document.body.classList.add('is-dragging');
                win.classList.add('is-dragging');
              }
              targetW = Math.max(300, startW + (moveEvent.clientX - startX));
              targetH = Math.max(260, startH + (moveEvent.clientY - startY));
              if (!resizeRaf) {
                resizeRaf = requestAnimationFrame(applyResize);
              }
            };

            const onResizeUp = () => {
              if (resizeRaf) cancelAnimationFrame(resizeRaf);
              document.body.classList.remove('is-dragging');
              win.classList.remove('is-dragging');
              document.removeEventListener('mousemove', onResizeMove);
              document.removeEventListener('mouseup', onResizeUp);
            };

            document.addEventListener('mousemove', onResizeMove, { passive: true });
            document.addEventListener('mouseup', onResizeUp, { once: true });
          });

          // Dokunmatik boyutlandırma: tutamaç tek parmakla sürüklenir.
          handle.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1 || win.classList.contains('maximized')) return;
            e.preventDefault();
            this.bringToFront(win);
            const t = e.touches[0];
            const startW = win.offsetWidth;
            const startH = win.offsetHeight;
            const startX = t.clientX;
            const startY = t.clientY;
            let touchResizeRaf = null;
            let targetW = startW;
            let targetH = startH;
            let resizingActive = false;

            const applyTouchResize = () => {
              win.style.width = `${targetW}px`;
              win.style.height = `${targetH}px`;
              touchResizeRaf = null;
            };
            const onTouchMove = (me) => {
              if (me.touches.length !== 1) return;
              if (me.cancelable) me.preventDefault();
              const m = me.touches[0];
              if (!resizingActive) {
                resizingActive = true;
                document.body.classList.add('is-dragging');
                win.classList.add('is-dragging');
              }
              targetW = Math.max(300, startW + (m.clientX - startX));
              targetH = Math.max(260, startH + (m.clientY - startY));
              if (!touchResizeRaf) touchResizeRaf = requestAnimationFrame(applyTouchResize);
            };
            const onTouchEnd = () => {
              if (touchResizeRaf) cancelAnimationFrame(touchResizeRaf);
              handle.removeEventListener('touchmove', onTouchMove);
              document.body.classList.remove('is-dragging');
              win.classList.remove('is-dragging');
              if (typeof SessionManager !== 'undefined') SessionManager.touch();
            };
            handle.addEventListener('touchmove', onTouchMove, { passive: false });
            handle.addEventListener('touchend', onTouchEnd, { once: true });
            handle.addEventListener('touchcancel', onTouchEnd, { once: true });
          }, { passive: false });
        }
      });

      const snapMenu = document.getElementById('snap-layouts-menu');
      if (snapMenu) {
        snapMenu.addEventListener('mouseleave', () => {
          snapMenu.classList.remove('open');
        });
        snapMenu.querySelectorAll('.snap-zone').forEach(zone => {
          zone.addEventListener('click', (e) => {
            e.stopPropagation();
            const snapType = zone.getAttribute('data-snap');
            if (this.activeSnapTargetWin && snapType) {
              this.snapWindow(this.activeSnapTargetWin, snapType);
            }
            snapMenu.classList.remove('open');
          });
        });
      }
    },

    bringToFront(winInput) {
      const win = typeof winInput === 'string' ? document.getElementById(winInput) : winInput;
      if (!win) return;
      // z-index sayacı önceki tasarımda sınırsızdı; açık pencereler
      // 6000+ katmana çıkınca panel flyout'ları ve bağlam menüleri pencere
      // ARKASINDA kalıyordu. Pencere katmanı 9000'te tavanlanır; tavana
      // gelindiğinde açık pencereler göreli sırası korunarak yeniden sıkışır.
      const Z_WINDOW_MAX = 9000;
      if (this.highestZ >= Z_WINDOW_MAX - 1) {
        const openWins = this.windows
          .filter(w => w.classList.contains('open'))
          .map(w => ({ w, z: parseInt(w.style.zIndex, 10) || 20 }))
          .sort((a, b) => a.z - b.z);
        openWins.forEach((entry, i) => {
          entry.w.style.zIndex = String(20 + i);
          this.highestZ = 20 + i;
        });
      }
      this.highestZ++;
      win.style.zIndex = Math.min(this.highestZ, Z_WINDOW_MAX);
      this.windows.forEach(w => w.classList.remove('active'));
      win.classList.add('active');
      this.syncTabs();
      this.ensureDesktopLayer(true);
    },

    open(winId) {
      const targetId = typeof winId === 'string' ? winId : (winId && winId.id ? winId.id : null);
      if (targetId && this.detached && this.detached.has(targetId)) {
        const det = this.detached.get(targetId);
        this.detached.delete(targetId);
        if (det.cont) {
          if (det.next && det.next.parentNode === det.cont) {
            det.cont.insertBefore(det.el, det.next);
          } else {
            det.cont.appendChild(det.el);
          }
        }
      }
      const win = typeof winId === 'string' ? document.getElementById(winId) : winId;
      if (!win) return;

      WorkspaceManager.adopt(win);
      win.classList.remove('minimized');
      win.classList.add('open');
      this.clampWindow(win);
      this.bringToFront(win);
      this.syncTabs();

      if ((winId === 'win-installer' || (win && win.id === 'win-installer')) && typeof InstallerWizard !== 'undefined') {
        InstallerWizard.loadDisks();
      }

      if (winId === 'win-updater' && typeof UpdaterManager !== 'undefined' && !UpdaterManager.latestRelease) {
        UpdaterManager.checkForUpdates();
      }
      SessionManager.touch();
    },

    close(winInput) {
      const win = typeof winInput === 'string' ? document.getElementById(winInput) : winInput;
      if (!win) return;
      win.classList.remove('open');
      win.classList.remove('active');
      try {
        if (win.id === 'win-office' && typeof OfficeManager !== 'undefined') {
          OfficeManager.clearFrame();
        }
        if (win.id === 'win-browser') {
          const frame = document.getElementById('browser-iframe') || document.getElementById('browser-frame');
          if (frame) frame.src = 'about:blank';
        }
        // Kapanan pencere sonrası ekranda kalan en üst pencereye odaklan
        const nextActive = this.getActiveWindow();
        if (nextActive) {
          this.bringToFront(nextActive);
        } else {
          this.syncTabs();
          this.checkAllMinimizedOrClosed();
        }
        SessionManager.touch();
        // Tembel render: kapanış 30 sn sonra hâlâ açık değilse eleman DOM'dan
        // çıkarılır; iframe kaynakları boşaltılır. Açılışta open() geri takar.
        if (win.id && !this.detached.has(win.id)) {
          setTimeout(() => {
            if (win.classList.contains('open')) return;
            const cont = win.parentNode;
            if (!cont) return;
            try {
              win.querySelectorAll('iframe').forEach(f => { f.src = 'about:blank'; });
            } catch (e2) { /* iframe erişimi olmadıysa boş ver */ }
            this.detached.set(win.id, { el: win, cont, next: win.nextSibling });
            win.remove();
            this.syncTabs();
          }, 30 * 1000);
        }
      } catch (err) {
        console.warn('[WindowManager.close]', err);
        this.syncTabs();
      }
    },

    minimize(winInput) {
      const win = typeof winInput === 'string' ? document.getElementById(winInput) : winInput;
      if (!win) return;
      win.classList.add('minimized');
      win.classList.remove('active');
      try {
        const nextActive = this.getActiveWindow();
        if (nextActive) {
          this.bringToFront(nextActive);
        } else {
          this.syncTabs();
          this.checkAllMinimizedOrClosed();
        }
        SessionManager.touch();
      } catch (err) {
        console.warn('[WindowManager.minimize]', err);
        this.syncTabs();
      }
    },

    toggleMaximize(winInput) {
      const win = typeof winInput === 'string' ? document.getElementById(winInput) : winInput;
      if (!win) return;
      if (!win.classList.contains('maximized')) {
        win.dataset.preMaxW = win.style.width || `${win.offsetWidth}px`;
        win.dataset.preMaxH = win.style.height || `${win.offsetHeight}px`;
        win.dataset.preMaxLeft = win.style.left || `${win.offsetLeft}px`;
        win.dataset.preMaxTop = win.style.top || `${win.offsetTop}px`;
        win.classList.add('maximized');
      } else {
        win.classList.remove('maximized');
        if (win.dataset.preMaxW) {
          win.style.width = win.dataset.preMaxW;
          win.style.height = win.dataset.preMaxH;
          win.style.left = win.dataset.preMaxLeft;
          win.style.top = win.dataset.preMaxTop;
        }
        this.clampWindow(win);
      }
      const maxBtn = win.querySelector('.ctrl-btn.max');
      if (maxBtn) {
        const isMax = win.classList.contains('maximized');
        maxBtn.textContent = isMax ? '❐' : '□';
        maxBtn.title = isMax ? 'Eski Boyut' : 'Büyüt';
      }
      this.bringToFront(win);
      SessionManager.touch();
    },

    snapWindow(win, layout) {
      if (!win) return;
      win.classList.remove('maximized');
      win.classList.remove('minimized');
      win.classList.add('open');
      this.bringToFront(win);

      const wa = this.getWorkArea();
      const wt = wa.top;
      const sw = wa.width;
      const sh = wa.height;

      switch(layout) {
        case 'left-half':
          win.style.left = '0px';
          win.style.top = `${wt}px`;
          win.style.width = `${sw * 0.5}px`;
          win.style.height = `${sh}px`;
          break;
        case 'right-half':
          win.style.left = `${sw * 0.5}px`;
          win.style.top = `${wt}px`;
          win.style.width = `${sw * 0.5}px`;
          win.style.height = `${sh}px`;
          break;
        case 'left-focus':
          win.style.left = '0px';
          win.style.top = `${wt}px`;
          win.style.width = `${sw * 0.7}px`;
          win.style.height = `${sh}px`;
          break;
        case 'right-sidebar':
          win.style.left = `${sw * 0.7}px`;
          win.style.top = `${wt}px`;
          win.style.width = `${sw * 0.3}px`;
          win.style.height = `${sh}px`;
          break;
        case 'col-left':
          win.style.left = '0px';
          win.style.top = `${wt}px`;
          win.style.width = `${sw * 0.25}px`;
          win.style.height = `${sh}px`;
          break;
        case 'col-center':
          win.style.left = `${sw * 0.25}px`;
          win.style.top = `${wt}px`;
          win.style.width = `${sw * 0.5}px`;
          win.style.height = `${sh}px`;
          break;
        case 'col-right':
          win.style.left = `${sw * 0.75}px`;
          win.style.top = `${wt}px`;
          win.style.width = `${sw * 0.25}px`;
          win.style.height = `${sh}px`;
          break;
        case 'corner-tl':
          win.style.left = '0px';
          win.style.top = `${wt}px`;
          win.style.width = `${sw * 0.5}px`;
          win.style.height = `${sh * 0.5}px`;
          break;
        case 'corner-tr':
          win.style.left = `${sw * 0.5}px`;
          win.style.top = `${wt}px`;
          win.style.width = `${sw * 0.5}px`;
          win.style.height = `${sh * 0.5}px`;
          break;
        case 'corner-bl':
          win.style.left = '0px';
          win.style.top = `${wt + sh * 0.5}px`;
          win.style.width = `${sw * 0.5}px`;
          win.style.height = `${sh * 0.5}px`;
          break;
        case 'corner-br':
          win.style.left = `${sw * 0.5}px`;
          win.style.top = `${wt + sh * 0.5}px`;
          win.style.width = `${sw * 0.5}px`;
          win.style.height = `${sh * 0.5}px`;
          break;
      }
      SessionManager.touch();
    },

    getActiveWindow() {
      const openWins = this.windows.filter(w => w.classList.contains('open') && !w.classList.contains('minimized'));
      if (openWins.length === 0) return null;
      return openWins.reduce((max, w) => {
        const z = parseInt(w.style.zIndex || '0', 10);
        const maxZ = parseInt(max.style.zIndex || '0', 10);
        return z > maxZ ? w : max;
      }, openWins[0]);
    },

    snapActive(direction) {
      const win = this.getActiveWindow();
      if (!win) return;
      if (direction === 'left') this.snapWindow(win, 'left-half');
      else if (direction === 'right') this.snapWindow(win, 'right-half');
      else if (direction === 'up') {
        if (!win.classList.contains('maximized')) this.toggleMaximize(win);
      } else if (direction === 'down') {
        if (win.classList.contains('maximized')) this.toggleMaximize(win);
        else this.minimize(win);
      }
    },

    cascadeWindows() {
      const openWins = this.windows.filter(w => w.classList.contains('open') && !w.classList.contains('minimized'));
      if (openWins.length === 0) return;
      const count = openWins.length;
      const wa = this.getWorkArea();
      const sw = wa.width;
      const sh = wa.height;

      if (count === 1) {
        openWins[0].style.left = '10vw';
        openWins[0].style.top = `${wa.top + Math.round(sh * 0.06)}px`;
        openWins[0].style.width = '80vw';
        openWins[0].style.height = `${Math.round(sh * 0.8)}px`;
      } else if (count === 2) {
        this.snapWindow(openWins[0], 'left-half');
        this.snapWindow(openWins[1], 'right-half');
      } else if (count <= 4) {
        const positions = ['corner-tl', 'corner-tr', 'corner-bl', 'corner-br'];
        openWins.forEach((w, i) => this.snapWindow(w, positions[i % 4]));
      } else {
        openWins.forEach((w, i) => {
          w.style.left = `${30 + i * 40}px`;
          w.style.top = `${wa.top + 18 + i * 36}px`;
          w.style.width = '60vw';
          w.style.height = '60vh';
          this.bringToFront(w);
        });
      }
      SessionManager.touch();
    },

    syncTabs() {
      if (!this.tabsContainer) return;
      // Getir/odak gibi olaylar her seferinde syncTabs çağırıyor; küme
      // değişmediyse tüm çubuğu tahrip etme yerine aynı çizimde kal.
      // Yerel pencereler de imzaya girer, yoksa yalnızca onlar değiştiğinde
      // erken dönüş yüzünden sekmeleri hiç çizilmiyordu.
      const sig = this.windows.map(w => {
        const meta = w.querySelector('.window-meta span');
        return [
          w.id,
          w.classList.contains('open') && !w.classList.contains('ws-hide') ? 1 : 0,
          w.classList.contains('active') ? 1 : 0,
          w.classList.contains('minimized') ? 1 : 0,
          meta ? meta.textContent : ''
        ].join('|');
      }).join('\n') + '\n#' + (this.nativeWindows || []).map(n => `${n.id}|${n.is_active}|${n.title}`).join('\n');
      if (sig === this._tabsSig) return;
      this._tabsSig = sig;
      this.tabsContainer.replaceChildren();

      const makeTab = (title, active, iconHtml, tip) => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = `task-tab${active ? ' active' : ''}`;
        tab.title = tip || title;
        tab.innerHTML = `<span class="task-tab-icon">${iconHtml}</span><span class="task-tab-label">${escapeHtml(title)}</span>`;
        return tab;
      };

      this.windows.forEach(win => {
        // Başka çalışma alanındaki açık pencereler görev çubuğunda görünmez;
        // oralara dönüş noktalarla yapılır.
        if (!win.classList.contains('open') || win.classList.contains('ws-hide')) return;
        const titleSpan = win.querySelector('.window-meta span');
        const title = titleSpan ? titleSpan.textContent.split('—')[0].trim() : 'Pencere';
        const svg = win.querySelector('.window-meta svg');
        const isActive = win.classList.contains('active') && !win.classList.contains('minimized');
        const tab = makeTab(title, isActive, svg ? svg.outerHTML : '');
        if (win.classList.contains('minimized')) tab.classList.add('minimized');

        const toggle = () => {
          if (win.classList.contains('minimized')) {
            win.classList.remove('minimized');
            this.bringToFront(win);
          } else if (win.classList.contains('active')) {
            this.minimize(win);
          } else {
            this.bringToFront(win);
          }
        };
        tab.addEventListener('click', toggle);
        tab.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); this.close(win); } });
        tab.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.showTabMenu(e, [
            { label: win.classList.contains('minimized') ? 'Geri yükle' : 'Küçült', run: () => win.classList.contains('minimized') ? toggle() : this.minimize(win) },
            { label: win.classList.contains('maximized') ? 'Eski boyut' : 'Büyüt', run: () => this.toggleMaximize(win) },
            { label: 'Kapat', danger: true, run: () => this.close(win) }
          ]);
        });
        this.tabsContainer.appendChild(tab);
      });

      // Gerçek X11 Yerel Uygulama Pencereleri Görev Çubuğunda Listelenir
      (this.nativeWindows || []).forEach(nw => {
        const shortTitle = (nw.title || nw.app_name || 'Uygulama').split(/ [—–-] /).pop().trim().substring(0, 28) || nw.app_name;
        const appKey = String(nw.app_name || nw.wm_class || shortTitle).toLowerCase();
        const letter = escapeHtml((nw.app_name || '?').charAt(0).toUpperCase());
        const matchedApp = (typeof XdgDesktopEngine !== 'undefined' && Array.isArray(XdgDesktopEngine.installedApps))
          ? XdgDesktopEngine.installedApps.find(a => {
              const aid = String(a.id || '').toLowerCase();
              const aexec = String(a.exec || '').toLowerCase();
              return aid.includes(appKey) || appKey.includes(aid) || (aexec && appKey.includes(aexec));
            })
          : null;
        const iconTarget = matchedApp || { id: appKey, name: nw.app_name || shortTitle };
        const iconHtml = (typeof IconResolver !== 'undefined' && typeof IconResolver.getIconSvg === 'function')
          ? IconResolver.getIconSvg(iconTarget)
          : `<span class="task-tab-letter">${letter}</span>`;
        const tab = makeTab(shortTitle, nw.is_active, iconHtml, `${nw.title} (${nw.app_name})`);
        tab.classList.add('native-task-tab');
        tab.setAttribute('data-native-id', nw.id);
        const iconSpan = tab.querySelector('.task-tab-icon');
        if (iconSpan && typeof IconResolver !== 'undefined' && typeof IconResolver.tagIcon === 'function') {
          IconResolver.tagIcon(iconSpan, iconTarget);
        }
        const refresh = (ms) => setTimeout(() => this.refreshNativeWindows(true), ms);
        const activate = () => {
          this.ensureDesktopLayer(false);
          TauriBridge.invoke('activate_native_window', { id: nw.id }).catch(() => {});
          refresh(250);
        };
        const minimize = () => {
          TauriBridge.invoke('minimize_native_window', { id: nw.id }).catch(() => {});
          refresh(250);
        };
        const close = () => {
          TauriBridge.invoke('close_native_window', { id: nw.id }).catch(() => {});
          refresh(400);
        };
        tab.addEventListener('click', () => {
          const ayazHasFocus = typeof document.hasFocus === 'function' && document.hasFocus();
          if (nw.is_active && !this._isLayerAbove && !ayazHasFocus) minimize();
          else activate();
        });
        tab.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); close(); } });
        tab.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.showTabMenu(e, [
            { label: 'Öne getir', run: activate },
            { label: 'Küçült', run: minimize },
            { label: 'Kapat', danger: true, run: close }
          ]);
        });
        this.tabsContainer.appendChild(tab);
      });
      if (typeof IconResolver !== 'undefined' && typeof IconResolver.upgradeScope === 'function') {
        IconResolver.upgradeScope(this.tabsContainer);
      }
      try {
        window.dispatchEvent(new CustomEvent('ayaz:tabs-synced'));
      } catch (e) {}
    },

    // Görev çubuğu sekmesi sağ tık menüsü. Tek örnek; dışarı tıklayınca,
    // Esc ile ya da bir seçim yapılınca kapanır.
    showTabMenu(e, items) {
      let menu = document.getElementById('taskbar-tab-menu');
      if (!menu) {
        menu = document.createElement('div');
        menu.id = 'taskbar-tab-menu';
        menu.className = 'taskbar-tab-menu';
        menu.setAttribute('role', 'menu');
        document.body.appendChild(menu);
        const hide = () => menu.classList.remove('open');
        document.addEventListener('mousedown', (ev) => { if (!menu.contains(ev.target)) hide(); });
        document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') hide(); });
        window.addEventListener('blur', hide);
      }
      menu.replaceChildren();
      items.forEach(it => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'menuitem');
        b.className = it.danger ? 'danger' : '';
        b.textContent = it.label;
        b.addEventListener('click', () => { menu.classList.remove('open'); it.run(); });
        menu.appendChild(b);
      });
      menu.classList.add('open');
      const w = menu.offsetWidth;
      const h = menu.offsetHeight;
      menu.style.left = `${Math.max(6, Math.min(e.clientX - w / 2, window.innerWidth - w - 6))}px`;
      menu.style.top = `${Math.max(6, e.clientY - h - 10)}px`;
    },

    async refreshNativeWindows(force) {
      if (document.hidden || (window.LockManager && window.LockManager.isLocked)) return;
      try {
        const wins = await TauriBridge.invoke('get_native_windows');
        if (Array.isArray(wins)) {
          const prevSig = (this.nativeWindows || []).map(w => `${w.id}:${w.is_active}:${w.title}`).join('|');
          const newSig = wins.map(w => `${w.id}:${w.is_active}:${w.title}`).join('|');
          if (force || prevSig !== newSig) {
            this.nativeWindows = wins;
            this.syncTabs();
          }
        }
      } catch (e) {}
    },

    toggleShowDesktop() {
      this._desktopHidden = !this._desktopHidden;
      if (this._desktopHidden) {
        this.windows.forEach(w => {
          if (w.classList.contains('open')) w.classList.add('minimized');
        });
        TauriBridge.invoke('minimize_all_windows').catch(() => {});
      } else {
        this.windows.forEach(w => {
          if (w.classList.contains('open')) w.classList.remove('minimized');
        });
      }
      this.syncTabs();
    }
  };

  // ============================================================================
  // 1b. SANAL ÇALIŞMA ALANLARI (VIRTUAL DESKS)
  // ============================================================================
  const WorkspaceManager = {
    active: 1,
    count: 4,
    max: 6,

    // Yeni açılan pencere, kullanıcının o an bulunduğu alanda belirir.
    adopt(win) {
      win.setAttribute('data-ws', String(this.active));
      win.classList.remove('ws-hide');
    },

    set(n) {
      this.active = Math.min(Math.max(1, n || 1), this.max);
      document.querySelectorAll('.window.open').forEach(win => {
        const ws = parseInt(win.getAttribute('data-ws'), 10) || 1;
        win.classList.toggle('ws-hide', ws !== this.active);
      });
      TauriBridge.invoke('set_native_workspace', { index: this.active - 1 }).catch(() => {});
      this.syncDots();
      if (typeof WindowManager !== 'undefined') WindowManager.syncTabs();
      SessionManager.touch();
    },

    next() { this.set(this.active + 1 > this.max ? 1 : this.active + 1); },
    prev() { this.set(this.active - 1 < 1 ? this.max : this.active - 1); },

    // Ctrl + Super + N: boş bir alan açılır; alan sayısı maksimuma kadar büyür.
    grow() {
      if (this.count >= this.max) return;
      this.count += 1;
      this.set(this.count);
    },

    syncDots() {
      const host = document.getElementById('taskbar-ws-dots');
      if (host) {
        host.replaceChildren();
        for (let i = 1; i <= this.count; i++) {
          const dot = document.createElement('button');
          dot.type = 'button';
          dot.className = `ws-dot${i === this.active ? ' active' : ''}`;
          dot.textContent = String(i);
          dot.title = `Masaüstü ${i} (Tıkla ve Geç)`;
          dot.setAttribute('aria-label', `Masaüstü ${i}`);
          dot.setAttribute('aria-current', i === this.active ? 'true' : 'false');
          dot.addEventListener('click', () => this.set(i));
          host.appendChild(dot);
        }
      }
      document.querySelectorAll('.face-ws-btn').forEach(btn => {
        const ws = Number(btn.getAttribute('data-ws') || btn.textContent);
        btn.classList.toggle('active', ws === this.active);
      });
    },

    toggleOverview() {
      const ov = document.getElementById('workspace-overview');
      const grid = document.getElementById('overview-grid');
      if (!ov || !grid) return;
      if (!ov.hidden) { this.closeOverview(); return; }

      grid.textContent = '';
      const wins = WindowManager.windows.filter(w =>
        w.classList.contains('open') && !w.classList.contains('ws-hide'));
      const nativeWins = Array.isArray(WindowManager.nativeWindows) ? WindowManager.nativeWindows : [];

      if (wins.length === 0 && nativeWins.length === 0) {
        grid.innerHTML = '<div class="overview-empty">Açık pencere yok</div>';
      }

      wins.forEach(win => {
        const titleSpan = win.querySelector('.window-meta span');
        const title = titleSpan ? titleSpan.textContent.split('—')[0].trim() : 'Pencere';
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'overview-card';
        card.innerHTML = '<span class="overview-glyph"></span><span class="overview-title"></span>';
        card.querySelector('.overview-glyph').textContent = title.charAt(0).toLocaleUpperCase('tr');
        card.querySelector('.overview-title').textContent = title;
        card.addEventListener('click', () => {
          this.closeOverview();
          win.classList.remove('minimized');
          WindowManager.bringToFront(win);
        });
        grid.appendChild(card);
      });

      nativeWins.forEach(nw => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `overview-card ${nw.is_active ? 'active' : ''}`;
        const title = (nw.title || nw.app_name || 'Uygulama').split('—')[0].trim();
        card.innerHTML = '<span class="overview-glyph" style="background:var(--accent-primary);color:#fff;"></span><span class="overview-title"></span>';
        card.querySelector('.overview-glyph').textContent = (nw.app_name || title).charAt(0).toLocaleUpperCase('tr');
        card.querySelector('.overview-title').textContent = title;
        card.title = `${nw.title} (${nw.app_name})`;
        card.addEventListener('click', () => {
          this.closeOverview();
          if (typeof WindowManager !== 'undefined' && WindowManager.ensureDesktopLayer) {
            WindowManager.ensureDesktopLayer(false);
          }
          TauriBridge.invoke('activate_native_window', { id: nw.id }).catch(() => {});
        });
        grid.appendChild(card);
      });

      ov.hidden = false;
    },

    closeOverview() {
      const ov = document.getElementById('workspace-overview');
      if (ov) ov.hidden = true;
    }
  };

  Object.assign(window, { WindowManager, WorkspaceManager });
})();

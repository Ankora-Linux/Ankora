// Ayaz DE Ana Başlatıcı (Orchestrator)
// Tüm alt modüller src/js/*.js altında sorumluluklarına göre ayrılmıştır.
(() => {
  'use strict';

  function boot() {
    // Oturum işareti en başta okunur: çökme sayacı ve geri yükleme
    // kararı diğer modüllerden önce belirlenir.
    safeInit('Session', () => SessionManager.begin());

    // 1. Temel pencere yöneticisini ve masaüstü kontrollerini ÖNCELİKLİ ve GARANTİ olarak başlat
    safeInit('WindowManager', () => WindowManager.init());
    safeInit('DesktopControls', () => initDesktopControls());
    safeInit('ThemeManager', () => ThemeManager.init());
    safeInit('Studio', () => Studio.init());
    safeInit('PanelPrefs', () => PanelPrefs.load());

    // 2. Diğer sistem uygulamalarını ve arka plan servislerini bağımsız olarak güvenle çalıştır
    safeInit('XdgDesktopEngine', () => XdgDesktopEngine.init());
    safeInit('StoreManager', () => StoreManager.init());
    safeInit('Terminal', () => Terminal.init());
    safeInit('OfficeManager', () => OfficeManager.init());
    safeInit('FileManager', () => FileManager.init());
    safeInit('DesktopFiles', () => {
      DesktopFiles.refresh();
      // Masaüstü dosyaları (indirilenler dahil) en geç 30 sn içinde belirir.
      setInterval(() => {
        if (!document.hidden) DesktopFiles.refresh();
      }, 30000);
    });
    // Faz tahta ve dokunmatik dizüstü: parmak hedefleri + uzun-basım sağ tık.
    safeInit('Touch', () => {
      TouchHelpers.markTouchCapable();
      TouchHelpers.initLongPress();
    });
    safeInit('AIAgent', () => {
      AIAgent.init();
      LinksManager.init();
      LinksManager.cleanupSecrets();
    });
    safeInit('WelcomeManager', () => WelcomeManager.init());
    safeInit('InstallerWizard', () => InstallerWizard.init());
    safeInit('SettingsManager', () => SettingsManager.init());
    safeInit('UpdaterManager', () => UpdaterManager.init());
    safeInit('TaskManager', () => TaskManager.init());
    safeInit('NotepadManager', () => NotepadManager.init());
    safeInit('CalcManager', () => CalcManager.init());
    safeInit('BrowserManager', () => BrowserManager.init());
    safeInit('WidgetManager', () => WidgetManager.init());
    safeInit('MemoryManager', () => MemoryManager.init());
    safeInit('Radio', () => RadioManager.init());
    safeInit('ReportManager', () => ReportManager.init());
    safeInit('LockManager', () => LockManager.init());
    safeInit('ScreenshotManager', () => ScreenshotManager.init());
    safeInit('PowerManager', () => PowerManager.init());
    safeInit('ClipboardManager', () => ClipboardManager.init());
    safeInit('UsbDriveWatcher', () => UsbDriveWatcher.init());
    safeInit('ShortcutManager', () => ShortcutManager.init());
    safeInit('NotificationManager', () => NotificationManager.init());
    safeInit('AudioDeviceManager', () => AudioDeviceManager.init());
    safeInit('BluetoothManager', () => BluetoothManager.init());
    safeInit('SpotlightManager', () => SpotlightManager.init());
    safeInit('MprisManager', () => MprisManager.init());
    safeInit('SystrayManager', () => SystrayManager.init());
    safeInit('FlasherManager', () => FlasherManager.init());
    safeInit('SnapshotManager', () => SnapshotManager.init());
    safeInit('MenuEditor', () => MenuEditor.init());
    safeInit('UsersManager', () => UsersManager.init());
    safeInit('DynamicIsland', () => DynamicIsland.init());

    // 3. Kayıtlı oturum geri yüklenir; çökme sayacı eşiği aşıldıysa
    // SessionManager.restore bunu kendi içinde değerlendirir.
    safeInit('SessionRestore', () => SessionManager.restore());

    // Açılışta kilit: yalnız PIN gerçekten ayarlıysa. İlk açılışta PIN yoksa
    // kullanıcıyı kilitleyip Hoş Geldiniz penceresini zorla açmayız.
    safeInit('StartupLock', () => {
      if (SafeStorage.getItem('ankora_lock_on_startup') === '0') return;
      setTimeout(async () => {
        if (typeof LockManager === 'undefined' || !LockManager.overlay) return;
        if (LockManager.isLocked || LockManager.overlay.classList.contains('show')) return;
        let configured = false;
        try {
          configured = await TauriBridge.invoke('is_lock_configured');
        } catch (e) {
          return;
        }
        if (configured) LockManager.lock();
      }, 1200);
    });

    // Ayaz DE modüllerini pencere nesnesine bağla (test, otomasyon ve dış kontrol)
    window.AyazDE = {
      WindowManager,
      ThemeManager,
      ShortcutManager,
      NotificationManager,
      AudioDeviceManager,
      BluetoothManager,
      SpotlightManager,
      ScreenshotManager,
      PowerManager,
      ReportManager,
      InstallerWizard,
      UpdaterManager,
      TaskManager,
      AIAgent,
      Terminal,
      ClipboardManager,
      UsbDriveWatcher,
      MprisManager,
      SystrayManager,
      FlasherManager,
      SnapshotManager,
      StoreManager,
      DynamicIsland
    };
    window.DynamicIsland = DynamicIsland;
    window.WindowManager = WindowManager;
    window.StoreManager = StoreManager;
    window.ThemeManager = ThemeManager;
    window.Studio = Studio;
    window.ShortcutManager = ShortcutManager;
    window.NotificationManager = NotificationManager;
    window.AudioDeviceManager = AudioDeviceManager;
    window.BluetoothManager = BluetoothManager;
    window.SpotlightManager = SpotlightManager;
    window.ScreenshotManager = ScreenshotManager;
    window.PowerManager = PowerManager;
    window.ClipboardManager = ClipboardManager;
    window.UsbDriveWatcher = UsbDriveWatcher;
    window.MprisManager = MprisManager;
    window.SystrayManager = SystrayManager;
    window.FlasherManager = FlasherManager;
    window.SnapshotManager = SnapshotManager;
    window.MenuEditor = MenuEditor;
    window.UsersManager = UsersManager;
    window.XdgDesktopEngine = XdgDesktopEngine;
    window.WorkspaceManager = WorkspaceManager;
    window.AppPinManager = AppPinManager;
    window.SafeStorage = SafeStorage;
    window.TauriBridge = TauriBridge;
    window.WeatherManager = (typeof WeatherManager !== 'undefined') ? WeatherManager : null;
    window.ReportManager = (typeof ReportManager !== 'undefined') ? ReportManager : null;
    window.IconResolver = IconResolver;

    // Satır içi onclick kaldırıldı (CSP: script-src 'self').
    // Paket yükleyici "İptal" düğmesi burada bağlanır.
    const pkgCancelBtn = document.getElementById('btn-pkg-inst-cancel');
    if (pkgCancelBtn) {
      pkgCancelBtn.addEventListener('click', () => WindowManager.close('win-pkg-installer'));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

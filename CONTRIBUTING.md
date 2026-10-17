# CONTRIBUTING.md

Teşekkürler — Ankora Linux projesine katkıda bulunmak istiyorsun! Bu belge, katkı sürecini ve temel kuralları açıklar. Proje dosyalarına (src/, src-tauri/, scripts/ vb.) doğrudan müdahale etmeden önce bu kurallara uy:

1. Sorun (issue) açma
   - Yeni bir hata bildirimi veya özellik isteği için GitHub Issues kullanın.
   - Hata bildirirken tekrar üretilebilir adımları, beklenen ve görülen davranışı, kullanılan ISO/versiyon bilgilerini ekleyin.

2. İletişim ve tartışma
   - Büyük değişiklik önerileri (mimari, paketleme, dağıtım akışı) öncesinde bir RFC/issue açın ve taslak tartışın.

3. Fork ve PR akışı
   - Depoyu fork edin.
   - Özelliğinizi ayrı bir branch'te geliştirin (ör. feature/ayar-paneli veya fix/iso-build).
   - Küçük ve odaklı commit'ler yapın; PR açıklamasında amaç, test adımları ve etkilenebilecek alanları belirtin.

4. Kod ve betik ekleme / değiştirme
   - Proje kaynak dosyalarına dokunmadan önce ilgili yöneticilerle konuşun (AGENTS.md'deki yönergelere uyun).
   - Yeni betikler eklerken `bash -n` ile basit sözdizimi kontrolü yapın.
   - JavaScript tarafında (`src/`) değişiklik yapıyorsanız, mümkün olduğunda `node --check` ile doğrulayın.

5. Test ve doğrulama
   - Değişikliklerin yerel olarak derlenip çalıştığından emin olun: `cargo tauri dev` veya `cargo tauri build --bundles deb`.
   - ISO iş akışlarını etkileyecek değişikliklerde ilgili CI workflow'u güncelleyin veya maintainer'ları bilgilendirin.

6. Stil ve lisans
   - Kod lisansı: GPL-3.0 (LICENSE dosyasına bakın).
   - Commit mesajları açık ve İngilizce/Türkçe kısa açıklama içerebilir; büyük projelerde İngilizce tercih edin.

7. İnceleme ve kabul
   - PR'lar en az bir maintainer tarafından incelenecektir.
   - Güvenlik, paketleme ve dağıtımla ilgili değişiklikler daha sıkı incelenecektir.

Teşekkürler! Katkılarınızı bekliyoruz.

#!/usr/bin/env node
// Mağaza veri bütünlük testi: src/app.js içindeki gerçek `packages`
// dizisini çıkarıp değerlendirir, son kullanıcı kurallarını denetler.
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
const m = src.match(/packages: \[([\s\S]*?)\n    \],\n    tableBody: null,/);
if (!m) {
  console.error('[HATA] packages dizisi bulunamadı');
  process.exit(1);
}
let packages;
try {
  packages = eval('[' + m[1] + '\n]');
} catch (e) {
  console.error('[HATA] packages değerlendirilemedi:', e.message);
  process.exit(1);
}

const fail = [];
const ok = (name, cond, detail = '') => {
  console.log(`[${cond ? 'OK  ' : 'HATA'}] ${name}${detail ? ': ' + detail : ''}`);
  if (!cond) fail.push(name);
};

const CATS = new Set(['dev', 'media', 'graphics', 'net', 'office', 'sys', 'util']);
ok('mağaza: kayıt sayısı > 50', packages.length > 50, String(packages.length));

const bad = packages.filter(p => !p.id || !p.name || !p.desc || !p.cat || !p.size);
ok('mağaza: zorunlu alanlar dolu', bad.length === 0, bad.map(p => p.id).join(','));

const badCat = packages.filter(p => !CATS.has(p.cat));
ok('mağaza: kategori kümesi geçerli', badCat.length === 0, badCat.map(p => p.id).join(','));

const noPath = packages.filter(p => !p.deb && !p.flatpak && !p.vendor && !p.action && !p.extUrl);
ok('mağaza: her kaydın kurulum yolu var', noPath.length === 0, noPath.map(p => p.id).join(','));

const featured = packages.filter(p => p.featured);
ok('mağaza: öne çıkan sayısı >= 10', featured.length >= 10, String(featured.length));

const seen = new Set();
const dupFeatured = featured.filter(p => seen.has(p.id) ? true : (seen.add(p.id), false));
ok('mağaza: öne çıkanlarda çift kayıt yok', dupFeatured.length === 0, dupFeatured.map(p => p.id).join(','));

// Mağazada aynı id iki kez yazılmışsa ilk kayıt görünür; içerik aynı olmalı.
const byId = new Map();
const dupContent = [];
for (const p of packages) {
  if (byId.has(p.id)) {
    const q = byId.get(p.id);
    if (q.name !== p.name || q.desc !== p.desc) dupContent.push(p.id);
  } else byId.set(p.id, p);
}
ok('mağaza: çift id içerikleri tutarlı', dupContent.length === 0, [...new Set(dupContent)].join(','));

if (fail.length) {
  console.error(`MAĞAZA VERİ TESTİ: ${fail.length} başarısız`);
  process.exit(1);
}
console.log('MAĞAZA VERİ TESTİ: geçti.');

/**
 * emlakjet.js
 * Emlakjet ofis sayfasından ilan çekme modülü.
 *
 * Emlakjet public sayfa — cookie veya BrowserWindow gerekmez.
 * session.fetch() ile doğrudan HTML çekilir.
 */

const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');
const browserFetcher = require('../browser-fetcher');

const OFFICE_URL = 'https://www.emlakjet.com/emlak-ofisleri-detay/ozgu-invest-gayrimenkul-1479777/';
const BASE_URL = 'https://www.emlakjet.com';

/**
 * Ofis sayfasını çek ve ilanları parse et.
 * @param {string} cacheDir - Resim cache dizini
 * @returns {Promise<Array>} İlan listesi
 */
async function scrapeOffice(cacheDir) {
  console.log('[emlakjet] Ofis sayfası çekiliyor...');

  // Emlakjet React/Next.js uygulaması — İlan verileri JavaScript ile yükleniyor.
  // fetchSimple() JS çalıştırmaz, bu yüzden doğrudan BrowserWindow kullanıyoruz.
  const result = await browserFetcher.fetchPage(OFFICE_URL, { timeout: 60000, waitMs: 4000 });
  const html = result.html;

  // Debug: HTML kaydet
  const debugPath = path.join(cacheDir, '_debug_emlakjet.html');
  try { fs.writeFileSync(debugPath, html); } catch {}
  console.log(`[emlakjet] HTML: ${html.length} karakter, debug: ${debugPath}`);

  // İlanları parse et
  const listings = parseListings(html);
  console.log(`[emlakjet] ${listings.length} ilan bulundu`);

  if (listings.length === 0) return [];

  // Resimleri indir
  await downloadAllImages(listings, cacheDir);

  return listings;
}

/**
 * HTML'den ilan listesini çıkar.
 * a[href*="/ilan/"] linkleri üzerinden — class isimlerine bağımlılık yok.
 */
function parseListings(html) {
  const $ = cheerio.load(html);
  const listings = [];
  const seen = new Set();

  // Tüm ilan linklerini bul
  const allLinks = $('a[href*="/ilan/"]');
  console.log(`[emlakjet] Toplam /ilan/ link sayısı: ${allLinks.length}`);

  allLinks.each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href') || '';

    // URL'den ilan ID'si çıkar: /ilan/slug-text-19173045 veya /ilan/slug-19173045/detail
    const idMatch = href.match(/-(\d{5,})(?:\/|$)/);
    if (!idMatch) return;

    const sourceId = idMatch[1];

    // Aynı ilan birden fazla link ile karşılaşabilir — deduplicate
    if (seen.has(sourceId)) return;
    seen.add(sourceId);

    // Link'in etrafındaki kart container'ı bul (parent div)
    // Emlakjet obfuscated classlar kullanıyor, bu yüzden parent'a çıkıp orada arıyoruz
    const $card = $el.closest('div').parent().closest('div');

    // Başlık: 1) img alt, 2) link title, 3) link text, 4) card text
    // Emlakjet'te başlık img'nin alt attribute'unda: alt="Özgü'den ..."
    let title = '';
    const imgWithAlt = $el.parent().find('img[alt]');
    if (imgWithAlt.length) {
      title = imgWithAlt.first().attr('alt') || '';
    }
    if (!title) {
      title = $el.attr('title') || $el.text().trim();
    }
    if (!title) {
      // Slug'dan başlık türet: ozgu-den-zafertepe-de-... → Ozgu Den Zafertepe De ...
      const slugMatch = href.match(/\/ilan\/(.+?)(?:-\d{5,})/);
      if (slugMatch) {
        title = slugMatch[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      }
    }

    // Fiyat: parent container'daki tüm text'te TL ara
    const cardText = $card.length ? $card.text() : $el.parent().parent().text();
    const priceMatch = cardText.match(/([\d.,]+)\s*TL/);
    let price = null;
    if (priceMatch) {
      const cleaned = priceMatch[1].replace(/[.,]/g, '');
      price = parseInt(cleaned, 10) || null;
    }

    // Resim: img.lazy veya img[src*="emlakjet"] — parent container'da ara
    const parentScope = $el.parent().parent().parent();
    const imgEl = parentScope.find('img[src*="emlakjet"], img[src*="imaj"], img.lazy, img.loaded').first();
    let thumbnail = '';
    if (imgEl.length) {
      thumbnail = imgEl.attr('src') || imgEl.attr('data-src') || '';

      if (thumbnail.includes('1px-transparent') || thumbnail.includes('placeholder') || thumbnail.includes('data:image')) {
        thumbnail = '';
      }
    }
    // Fallback: link içindeki img
    if (!thumbnail) {
      const innerImg = $el.find('img').first();
      thumbnail = innerImg.attr('src') || innerImg.attr('data-src') || '';
      if (thumbnail.includes('1px-transparent') || thumbnail.includes('placeholder')) thumbnail = '';
    }

    // Satılık/Kiralık tespit
    const titleLower = (title || '').toLowerCase();
    const listingType = titleLower.includes('kiralık') ? 'kiralik' : 'satilik';

    // Oda bilgisi
    const roomMatch = cardText.match(/(\d\+\d)/);
    const roomCount = roomMatch ? roomMatch[1] : '';

    // m² bilgisi
    const areaMatch = cardText.match(/([\d.,]+)\s*m²/);
    let area = null;
    if (areaMatch) {
      area = parseFloat(areaMatch[1].replace(',', '.')) || null;
    }

    // URL oluştur
    const sourceUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;

    listings.push({
      source_id: sourceId,
      source_url: sourceUrl,
      title: (title || 'İsimsiz İlan').substring(0, 200),
      price,
      currency: 'TL',
      listing_type: listingType,
      property_type: '',
      room_count: roomCount,
      area_m2: area,
      thumbnail,
      images: [],
    });
  });

  // İlk 3 ilanı logla
  listings.slice(0, 3).forEach((l, i) => {
    console.log(`[emlakjet] İlan ${i + 1}: ID=${l.source_id} "${l.title.substring(0, 40)}" ${l.price || '?'} TL`);
  });

  return listings;
}

/**
 * Tüm ilanların resimlerini indir.
 */
async function downloadAllImages(listings, cacheDir) {
  console.log(`[emlakjet] ${listings.length} ilanın resimleri indiriliyor...`);

  for (const listing of listings) {
    if (!listing.thumbnail) continue;

    const dir = path.join(cacheDir, `ej_${listing.source_id}`);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    try {
      const imgBuffer = await browserFetcher.downloadImage(listing.thumbnail);
      if (imgBuffer && imgBuffer.length > 500) { // 500 byte'tan küçükse placeholder olabilir
        const localPath = path.join(dir, 'img_0.jpg');
        fs.writeFileSync(localPath, imgBuffer);
        listing.images = [{ image_url: listing.thumbnail, local_path: localPath }];
      }
    } catch (e) {
      console.error(`[emlakjet] Resim indirme hatası (${listing.source_id}):`, e.message);
    }
  }
}

module.exports = { scrapeOffice };

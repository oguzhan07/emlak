/**
 * sahibinden.js
 * Sahibinden.com ofis sayfasından ilan çekme modülü.
 *
 * Sahibinden Cloudflare koruması kullanıyor — BrowserWindow gerekli.
 * Challenge tespit edilince pencere kullanıcıya gösterilir.
 * Detay sayfaları paralel çekilir (3 concurrent).
 */

const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');
const browserFetcher = require('../browser-fetcher');

const OFFICE_URL = 'https://ozguinvestgayrimenkul.sahibinden.com/';
const BASE_URL = 'https://www.sahibinden.com';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms + Math.random() * 1000));
}

/**
 * Ofis sayfasını çek, tüm ilanları topla, detay sayfalarını paralel çek.
 * @param {string} cacheDir - Resim cache dizini
 * @returns {Promise<Array>} İlan listesi
 */
async function scrapeOffice(cacheDir) {
  console.log('[sahibinden] Ofis sayfası çekiliyor...');

  const allListingStubs = [];
  let pageUrl = OFFICE_URL;
  let pageNum = 0;
  const MAX_PAGES = 10; // Sonsuz döngü koruması

  // Ofis sayfalarını sırayla çek (sayfalama)
  while (pageUrl && pageNum < MAX_PAGES) {
    pageNum++;
    console.log(`[sahibinden] Sayfa ${pageNum}: ${pageUrl}`);

    const { html, finalUrl } = await browserFetcher.fetchPage(pageUrl, {
      timeout: 120000,
      waitMs: 3000,
      loginUrl: 'https://www.sahibinden.com/giris',
    });

    // Debug: HTML kaydet
    const debugPath = path.join(cacheDir, `_debug_sahibinden_${pageNum}.html`);
    try { fs.writeFileSync(debugPath, html); } catch {}
    console.log(`[sahibinden] Sayfa ${pageNum}: ${html.length} karakter, finalUrl: ${finalUrl}`);

    // Hata sayfası kontrolü: title veya içerikte "hata" varsa dur
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const pageTitle = (titleMatch ? titleMatch[1] : '').toLowerCase();
    if (pageTitle.includes('hata') || pageTitle.includes('engel') || html.length < 30000 && html.includes('hata sayfası')) {
      console.error(`[sahibinden] Hata/engel sayfası tespit edildi: "${titleMatch ? titleMatch[1] : ''}"`);
      throw new Error('Sahibinden hata sayfası döndü. Lütfen Ayarlar\'dan Sahibinden\'e giriş yapın veya daha sonra tekrar deneyin.');
    }

    // Doğrulama: Gerçekten ofis sayfasında mıyız?
    // finalUrl veya HTML içinde ofis adı olmalı
    const isOfficePage = finalUrl.includes('ozguinvestgayrimenkul') ||
      html.includes('ozguinvestgayrimenkul') ||
      html.includes('Özgü Invest') || html.includes('ÖZGÜ INVEST') ||
      html.includes('Özgü İnvest') || html.includes('özgü invest');
    if (!isOfficePage) {
      console.error(`[sahibinden] Ofis sayfası değil! finalUrl: ${finalUrl}`);
      throw new Error('Sahibinden ofis sayfasına erişilemiyor. Başka bir sayfaya yönlendirildiniz.');
    }

    // Sayfadaki ilanları parse et
    const { listings, nextPage } = parseOfficePage(html);
    console.log(`[sahibinden] Sayfa ${pageNum}: ${listings.length} ilan bulundu`);
    allListingStubs.push(...listings);

    // İlan bulunamadıysa devam etme (hata sayfası olabilir)
    if (listings.length === 0) {
      console.log(`[sahibinden] Sayfa ${pageNum}'da ilan yok, sayfalama durduruluyor`);
      break;
    }

    // Sonraki sayfa
    pageUrl = nextPage;
    if (pageUrl) await delay(2000);
  }

  if (allListingStubs.length === 0) {
    console.log('[sahibinden] Hiç ilan bulunamadı');
    return [];
  }

  console.log(`[sahibinden] Toplam ${allListingStubs.length} ilan bulundu, resimler indiriliyor...`);

  // Ofis sayfasından gelen bilgiler yeterli — detay sayfası açmaya gerek yok.
  // Detay sayfası için her ilan için ayrı BrowserWindow açmak çok yavaş ve
  // Cloudflare'ı tekrar tetikler. Başlık, fiyat, konum, m², oda, resim zaten ofis sayfasında var.
  const fullListings = [];
  for (const stub of allListingStubs) {
    // Thumbnail'i indir
    const images = await downloadImages(
      stub.source_id,
      stub.thumbnail ? [stub.thumbnail] : [],
      cacheDir
    );

    // Konum parse: "Kütahya / Merkez" → city + district
    const locationParts = (stub.location_text || '').split('/').map(s => s.trim());

    fullListings.push({
      source_id: stub.source_id,
      source_url: stub.source_url,
      title: stub.title,
      description: '',
      price: stub.price,
      currency: 'TL',
      listing_type: stub.listing_type || 'satilik',
      property_type: '',
      room_count: stub.room_count || '',
      area_m2: stub.area_m2 || null,
      gross_area_m2: null,
      floor_number: null,
      total_floors: null,
      building_age: null,
      heating_type: '',
      bathroom_count: null,
      city: locationParts[0] || '',
      district: locationParts[1] || '',
      neighborhood: '',
      has_balcony: 0,
      has_elevator: 0,
      has_parking: 0,
      has_furnished: 0,
      is_in_complex: 0,
      images,
    });
  }

  console.log(`[sahibinden] ${fullListings.length} ilan hazır`);
  return fullListings;
}

/**
 * Ofis sayfası HTML'inden ilan listesi çıkar.
 * Sahibinden yeni yapı: div.classified (eski searchResultsItem yerine)
 * @param {string} html
 * @returns {{ listings: Array, nextPage: string|null }}
 */
function parseOfficePage(html) {
  const $ = cheerio.load(html);
  const listings = [];

  // YENİ YAPI: div.classified (galeri görünümü)
  // ESKİ YAPI (fallback): .searchResultsItem, tr[class*="searchResult"]
  let cards = $('div.classified[data-box-url]');

  if (cards.length === 0) {
    // Fallback: eski yapı
    cards = $('.searchResultsItem, .searchResultsLargeThumbnailItem, tr[class*="searchResult"]');
    console.log(`[sahibinden] Yeni yapı bulunamadı, eski yapı deneniyor: ${cards.length} kart`);
  } else {
    console.log(`[sahibinden] Yeni yapı (div.classified): ${cards.length} kart`);
  }

  cards.each((_, el) => {
    const $el = $(el);

    // Reklam/banner atla
    if ($el.hasClass('nativeAd') || $el.hasClass('searchResultsBanner') || $el.hasClass('searchResultsPromotion')) {
      return;
    }

    // URL: data-box-url veya a[href*="/ilan/"]
    const href = $el.attr('data-box-url') || $el.find('a[href*="/ilan/"]').first().attr('href') || '';
    if (!href || !href.includes('/ilan/')) return;

    // ID çıkar: ...-1309535169/detay veya .../1309535169
    const idMatch = href.match(/(\d{5,})(?:\/|$)/);
    if (!idMatch) return;
    const sourceId = idMatch[1];

    // Başlık: p.title a veya a[title]
    let title = $el.find('p.title a').text().trim()
      || $el.find('a[href*="/ilan/"]').first().attr('title')
      || $el.find('a[href*="/ilan/"]').first().text().trim()
      || '';
    if (!title) return;

    // Fiyat: p.price (yeni yapı) veya td.searchResultsPriceValue span (eski yapı)
    let priceText = $el.find('p.price').first().text().trim()
      || $el.find('td.searchResultsPriceValue span').first().text().trim()
      || '';
    priceText = priceText.replace(/[^\d]/g, '');
    const price = priceText ? parseInt(priceText, 10) : null;

    // Konum: p.location veya .searchResultsLocationValue
    const location = ($el.find('p.location').text().trim()
      || $el.find('.searchResultsLocationValue, td.searchResultsLocationValue').text().trim()
      || '').replace(/\s+/g, ' ');

    // Oda sayısı: p.rooms
    const roomCount = $el.find('p.rooms').text().trim() || '';

    // m²: p.m2
    const m2Text = $el.find('p.m2').text().trim() || '';
    const areaMatch = m2Text.match(/([\d.,]+)/);
    const area = areaMatch ? parseFloat(areaMatch[1].replace(',', '.')) : null;

    // Thumbnail: ilan fotoğrafı (titleIcon değil)
    const thumbnail = $el.find('.searchResultsLargeThumbnail img, img.s-image').first().attr('src')
      || $el.find('img[src*="shbdn"], img[src*="sahibinden"]').first().attr('src')
      || $el.find('img').not('.titleIcon').first().attr('src')
      || $el.find('img').not('.titleIcon').first().attr('data-src')
      || '';

    // Satılık/Kiralık: breadcrumb-badge veya title
    const badge = $el.find('.breadcrumb-badge').text().trim().toLowerCase();
    const listingType = (badge.includes('kiralik') || badge.includes('kiralık') || title.toLowerCase().includes('kiralık'))
      ? 'kiralik' : 'satilik';

    // URL düzelt
    const sourceUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;

    listings.push({
      source_id: sourceId,
      source_url: sourceUrl,
      title: title.substring(0, 200),
      price,
      listing_type: listingType,
      room_count: roomCount,
      area_m2: area,
      location_text: location,
      thumbnail,
    });
  });

  // Sonraki sayfa — ofis domain'inde kalmalı (www.sahibinden.com değil)
  const OFFICE_BASE = 'https://ozguinvestgayrimenkul.sahibinden.com';
  const nextLink = $('a[title="Sonraki"], .prevNextBut a:contains("Sonraki"), a.next-page').attr('href');
  let nextPage = null;
  if (nextLink) {
    if (nextLink.startsWith('http')) {
      // Absolute URL — ofis domain'inde mi kontrol et
      nextPage = nextLink.includes('ozguinvestgayrimenkul') ? nextLink : null;
    } else {
      // Relative URL — ofis domain'iyle birleştir
      nextPage = `${OFFICE_BASE}${nextLink}`;
    }
  }

  return { listings, nextPage };
}

/**
 * Detay sayfası HTML'inden ilan detaylarını çıkar.
 * @param {string} html
 * @returns {object} Detay bilgileri
 */
function parseDetailPage(html) {
  const $ = cheerio.load(html);
  const detail = {};

  // Açıklama
  detail.description = $('#classifiedDescription, .classifiedDescription').text().trim();

  // Resimler: script tag'lerinden URL çıkar (en iyi kalite)
  detail.images = [];
  $('script').each((_, script) => {
    const text = $(script).html() || '';
    const urlMatches = text.match(/https?:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s]*)?/gi);
    if (urlMatches && urlMatches.length > 2) {
      const uniqueUrls = [...new Set(urlMatches)]
        .filter(u => !u.includes('logo') && !u.includes('icon') && !u.includes('/s/'))
        .map(u => u.replace(/\/s\//g, '/x5/').replace(/\/t\//g, '/x5/'));
      if (uniqueUrls.length > detail.images.length) {
        detail.images = uniqueUrls.slice(0, 20);
      }
    }
  });

  // Resim fallback: img tag'leri
  if (detail.images.length === 0) {
    $('img[src*="/ilan/"], .classifiedDetailMainPhoto img, .classifiedGallery img').each((_, el) => {
      let src = $(el).attr('src') || $(el).attr('data-src') || '';
      if (src && !src.includes('placeholder') && !src.includes('logo')) {
        src = src.replace(/\/s\//g, '/x5/');
        detail.images.push(src);
      }
    });
  }

  // Özellikler: etiket-değer çiftleri
  const features = {};
  $('.classifiedInfoList li, .classifiedInfo li, ul.classifiedAttrList li, .uiDetailPageAttributeList li').each((_, el) => {
    const label = $(el).find('strong, .txt').first().text().trim().replace(':', '');
    const value = $(el).find('span').last().text().trim();
    if (label && value) features[label] = value;
  });

  // Özellikleri alanlara eşle
  detail.room_count = features['Oda Sayısı'] || features['Oda sayısı'] || '';
  detail.area_m2 = parseFloat(features['Net m²'] || features['m² (Net)'] || '0') || null;
  detail.gross_area_m2 = parseFloat(features['Brüt m²'] || features['m² (Brüt)'] || '0') || null;
  detail.floor_number = parseInt(features['Bulunduğu Kat'] || '0') || null;
  detail.total_floors = parseInt(features['Kat Sayısı'] || '0') || null;
  detail.building_age = parseInt(features['Bina Yaşı'] || '0') || null;
  detail.heating_type = features['Isıtma'] || features['Isınma Tipi'] || '';
  detail.bathroom_count = parseInt(features['Banyo Sayısı'] || '0') || null;
  detail.property_type = features['Emlak Tipi'] || features['Kategori'] || '';

  // Satılık/Kiralık
  const pageTitle = $('h1, .classifiedDetailTitle').text().toLowerCase();
  detail.listing_type = pageTitle.includes('kiralık') ? 'kiralik' : 'satilik';

  // Konum: breadcrumb'dan
  const locationParts = [];
  $('.classifiedDetailPath a, .breadcrumb a').each((_, el) => {
    locationParts.push($(el).text().trim());
  });
  if (locationParts.length >= 3) {
    detail.city = locationParts[locationParts.length - 3] || '';
    detail.district = locationParts[locationParts.length - 2] || '';
    detail.neighborhood = locationParts[locationParts.length - 1] || '';
  }

  // Boolean özellikler: body text'ten
  const allText = $('body').text().toLowerCase();
  detail.has_balcony = allText.includes('balkon') ? 1 : 0;
  detail.has_elevator = allText.includes('asansör') ? 1 : 0;
  detail.has_parking = allText.includes('otopark') ? 1 : 0;
  detail.has_furnished = allText.includes('eşyalı') ? 1 : 0;
  detail.is_in_complex = (allText.includes('site içi') || allText.includes('site içerisinde')) ? 1 : 0;

  return detail;
}

/**
 * Bir ilanın resimlerini indir ve cache'e kaydet.
 * @param {string} sourceId
 * @param {string[]} imageUrls
 * @param {string} cacheDir
 * @returns {Promise<Array<{ image_url, local_path }>>}
 */
async function downloadImages(sourceId, imageUrls, cacheDir) {
  if (!imageUrls || imageUrls.length === 0) return [];

  const dir = path.join(cacheDir, sourceId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const images = [];
  const maxImages = Math.min(imageUrls.length, 10);

  for (let i = 0; i < maxImages; i++) {
    try {
      const imgBuffer = await browserFetcher.downloadImage(imageUrls[i]);
      if (imgBuffer && imgBuffer.length > 500) {
        const ext = imageUrls[i].match(/\.(jpg|jpeg|png|webp)/i)?.[1] || 'jpg';
        const localPath = path.join(dir, `img_${i}.${ext}`);
        fs.writeFileSync(localPath, imgBuffer);
        images.push({ image_url: imageUrls[i], local_path: localPath });
      }
    } catch (e) {
      console.error(`[sahibinden] Resim ${i} indirme hatası (${sourceId}):`, e.message);
    }
  }

  return images;
}

module.exports = { scrapeOffice };

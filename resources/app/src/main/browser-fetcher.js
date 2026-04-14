/**
 * browser-fetcher.js
 * Electron BrowserWindow ile sayfa çekme modülü.
 *
 * Tasarım prensipleri:
 * - Her fetch için AYRI BrowserWindow (paylaşılan pencere yok, kilitlenme yok)
 * - Anti-detection script enjeksiyonu YOK (Turnstile bozulmasın)
 * - Header interception YOK (Electron zaten gerçek Chrome)
 * - Challenge tespit edilince pencere kullanıcıya gösterilir
 */

const { BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');

let _chromeUa = null;
function getChromeUA() {
  if (!_chromeUa) {
    // main.js tarafından temizlenmiş olan aktif UA'yı al
    _chromeUa = session.defaultSession.getUserAgent();
  }
  return _chromeUa;
}

// Debug log
const LOG_FILE = path.join(require('os').tmpdir(), 'emlak-debug.log');
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
  console.log(line);
}

// Uygulama başlarken log dosyasını sıfırla
try { fs.writeFileSync(LOG_FILE, `=== Emlak Debug Log - ${new Date().toISOString()} ===\n`); } catch {}

let mainWindowRef = null;

function setMainWindow(win) {
  mainWindowRef = win;
}

/**
 * Sayfa challenge (Cloudflare / Sahibinden engeli) kontrolü.
 * Sadece title ve URL bazlı — HTML parse yok, hızlı.
 */
function isChallengePage(title, url) {
  const t = (title || '').toLowerCase();
  const u = (url || '').toLowerCase();

  // Cloudflare challenge
  if (
    t.includes('just a moment') ||
    t.includes('moment') && t.includes('lütfen') ||
    t.includes('checking') ||
    t.includes('kontrol') ||
    u.includes('challenge') ||
    u.includes('checkloading')
  ) {
    return 'cloudflare';
  }

  // Sahibinden hata/engel sayfası
  if (t.includes('hata') || t.includes('engel') || t.includes('erişim')) {
    return 'sahibinden';
  }

  return false;
}

/**
 * HTML içinde engel kontrolü (title ile yakalanamayan durumlar için).
 * Sadece ilk 5000 karakter kontrol edilir.
 */
function isBlockedHtml(html) {
  const h = (html || '').substring(0, 5000).toLowerCase();

  if (
    h.includes('cf-challenge') ||
    h.includes('cf-turnstile') ||
    h.includes('basılı tutun') ||
    h.includes('press and hold') ||
    h.includes('bağlantınız kontrol ediliyor')
  ) {
    return 'cloudflare';
  }

  if (
    h.includes('olağan dışı erişim') ||
    h.includes('olagan disi erisim') ||
    h.includes('unusual access') ||
    h.includes('hata sayfası') ||
    h.includes('hata sayfa')
  ) {
    return 'sahibinden';
  }

  return false;
}

/**
 * Tek bir URL'yi BrowserWindow ile çeker.
 * Challenge varsa:
 *   - loginUrl verilmişse → giriş sayfasına yönlendirir
 *   - Kullanıcı giriş yapınca → otomatik olarak hedef URL'ye gider
 *   - Hedef sayfa yüklenince → HTML çeker ve döner
 *
 * @param {string} url - Çekilecek URL
 * @param {object} options - { timeout, waitMs, loginUrl }
 * @returns {Promise<{ html: string, finalUrl: string }>}
 */
const puppeteer = require('puppeteer-core');

function getChromePath() {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Google Chrome veya Edge bilgisayarınızda bulunamadı.');
}

/**
 * URL'yi gerçek Google Chrome ile başlatıp çeker (Cloudflare'ı atlatmak için).
 */
async function fetchPage(url, options = {}) {
  const { timeout = 120000, waitMs = 3000, loginUrl = null } = options;
  log(`[fetchPage] Puppeteer ile başlatılıyor: ${url}`);

  const executablePath = getChromePath();
  const browser = await puppeteer.launch({
    executablePath,
    headless: false,
    defaultViewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
    userDataDir: path.join(require('os').tmpdir(), 'emlak-chrome-profile'),
    args: [
      '--start-maximized', 
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  try {
    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    page.setDefaultNavigationTimeout(timeout);

    if (loginUrl) {
      log(`[fetchPage] Önce giriş sayfasına yönlendiriliyor: ${loginUrl}`);
      try { 
        await page.goto(loginUrl, { waitUntil: 'domcontentloaded' }); 
        await new Promise(r => setTimeout(r, 4000));
      } catch {}
    }

    log(`[fetchPage] Hedef URL'ye gidiliyor... ${url}`);
    try { await page.goto(url, { waitUntil: 'domcontentloaded' }); } catch {}

    let elapsedTime = 0;
    while (elapsedTime < timeout) {
      let title = '';
      let currentUrl = '';
      try {
        title = (await page.title() || '').toLowerCase();
        currentUrl = (page.url() || '').toLowerCase();
      } catch (err) {
        log(`[fetchPage] Sayfa yenileniyor (context destroyed), bekleniyor...`);
        await new Promise(r => setTimeout(r, 2000));
        elapsedTime += 2000;
        continue;
      }

      const isBlocked = title.includes('just a moment') ||
                        title.includes('moment') ||
                        title.includes('lütfen') ||
                        title.includes('checking') ||
                        currentUrl.includes('checkloading');

      const isLoginPage = currentUrl.includes('/giris') || currentUrl.includes('/login');

      if (!isBlocked && !isLoginPage) {
        log(`[fetchPage] Doğrulama başarılı veya gerekmedi, sayfa çekiliyor...`);
        await new Promise(r => setTimeout(r, waitMs));
        const html = await page.content();
        const finalUrl = page.url();
        await browser.close();
        log(`[fetchPage] OK: ${finalUrl.substring(0, 80)} (${html.length} karakter)`);
        return { html, finalUrl };
      }

      log(`[fetchPage] Engel/Giriş ekranında bekleniyor... (${title}) | url: ${currentUrl.substring(0,40)}`);
      await new Promise(r => setTimeout(r, 3000));
      elapsedTime += 3000;
    }

    await browser.close();
    throw new Error('Zaman aşımı (2 dakika). Doğrulama başarısız oldu.');
  } catch (e) {
    try { await browser.close(); } catch {}
    log(`[fetchPage] HATA: ${e.message}`);
    throw e;
  }
}

/**
 * Birden fazla URL'yi paralel çeker (concurrency limiti ile).
 *
 * @param {string[]} urls
 * @param {object} options - { concurrency: 3, timeout: 30000, waitMs: 2000 }
 * @returns {Promise<Array<{ url, result?, error? }>>}
 */
async function fetchPageBatch(urls, options = {}) {
  const { concurrency = 3, timeout = 30000, waitMs = 2000 } = options;
  const results = [];
  let index = 0;

  async function worker() {
    while (index < urls.length) {
      const i = index++;
      const url = urls[i];
      try {
        const result = await fetchPage(url, { timeout, waitMs });
        results[i] = { url, result };
      } catch (error) {
        results[i] = { url, error: error.message };
        log(`[fetchPageBatch] Hata (${url.substring(0, 50)}): ${error.message}`);
      }
      // Rate limit: istekler arası 1.5-2.5sn bekle
      await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));
    }
  }

  // N adet worker başlat
  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

/**
 * Resim indir (BrowserWindow kullanmadan, session.fetch ile).
 *
 * @param {string} url
 * @returns {Promise<Buffer|null>}
 */
async function downloadImage(url) {
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) return null;

  try {
    const response = await session.defaultSession.fetch(url, {
      headers: { 'User-Agent': getChromeUA() }
    });
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer);
  } catch (e) {
    log(`[downloadImage] Hata: ${url.substring(0, 60)} — ${e.message}`);
    return null;
  }
}

/**
 * URL'yi BrowserWindow olmadan, session.fetch ile çeker.
 * Cloudflare koruması olmayan siteler için (Emlakjet gibi).
 *
 * @param {string} url
 * @returns {Promise<string>} HTML
 */
async function fetchSimple(url) {
  log(`[fetchSimple] ${url}`);
  const response = await session.defaultSession.fetch(url, {
    headers: {
      'User-Agent': getChromeUA(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const html = await response.text();
  log(`[fetchSimple] OK: ${html.length} karakter`);
  return html;
}

function cleanup() {
  // Tüm açık pencereler Electron tarafından otomatik kapatılır
  log('[cleanup] browser-fetcher temizlendi');
}

module.exports = {
  fetchPage,
  fetchPageBatch,
  fetchSimple,
  downloadImage,
  cleanup,
  setMainWindow,
};

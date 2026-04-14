const { app, BrowserWindow, ipcMain, dialog, session, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// Windows ortamında çalıştırılabilir dosya olarak açıldığında console.log EPIPE hatası vermesini engelle
process.on('uncaughtException', (err) => {
  if (err.code === 'EPIPE' || (err.message && err.message.includes('EPIPE'))) return;
  console.error('Beklenmeyen Hata:', err);
});

const database = require('./database');
const cookieManager = require('./scraper/cookie-manager');
const sahibindenScraper = require('./scraper/sahibinden');
const emlakjetScraper = require('./scraper/emlakjet');
const imageGenerator = require('./image-generator');
const fileManager = require('./file-manager');
const browserFetcher = require('./browser-fetcher');

// Disable automation detection BEFORE app is ready
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
app.commandLine.appendSwitch('disable-features', 'AutomationControlled');

let mainWindow;
let loginWindow;

let CHROME_UA = '';

const DATA_DIR = path.join(app.getPath('userData'), 'data');
const CACHE_DIR = path.join(DATA_DIR, 'cache', 'listings');

function ensureDirectories() {
  [DATA_DIR, CACHE_DIR, path.join(app.getPath('userData'), 'output')].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 800,
    title: 'Özgü Invest Gayrimenkul',
    icon: path.join(__dirname, '..', '..', 'assets', 'logo', 'logo_navy_on_white.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.setMenuBarVisibility(false);
}

// ─── IPC: Database ───────────────────────────────────────────────

ipcMain.handle('db:getProfile', () => database.getProfile());
ipcMain.handle('db:saveProfile', (_, profile) => database.saveProfile(profile));

ipcMain.handle('db:getListings', (_, filters) => database.getListings(filters));
ipcMain.handle('db:getListing', (_, id) => database.getListing(id));
ipcMain.handle('db:saveListing', (_, listing) => database.saveListing(listing));
ipcMain.handle('db:deleteListing', (_, id) => database.deleteListing(id));
ipcMain.handle('db:getListingImages', (_, listingId) => database.getListingImages(listingId));

// ─── IPC: Authentication ─────────────────────────────────────────

ipcMain.handle('auth:openLogin', async (_, site) => {
  return new Promise((resolve) => {
    loginWindow = new BrowserWindow({
      width: 1100,
      height: 800,
      parent: mainWindow,
      modal: true,
      title: `${site === 'sahibinden' ? 'Sahibinden.com' : 'Emlakjet.com'} — Giriş yapıp pencereyi kapatın`,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    // Sadece UA ayarla — header interception YOK, anti-detection YOK
    // Electron zaten gerçek Chromium, Turnstile böyle çalışır
    loginWindow.webContents.setUserAgent(CHROME_UA);

    const loginUrl = site === 'sahibinden'
      ? 'https://www.sahibinden.com/giris'
      : 'https://www.emlakjet.com/giris/';

    loginWindow.loadURL(loginUrl);

    loginWindow.on('closed', async () => {
      try {
        const siteUrl = site === 'sahibinden' ? 'https://www.sahibinden.com' : 'https://www.emlakjet.com';
        const cookies = await session.defaultSession.cookies.get({ url: siteUrl });

        if (cookies.length > 3) {
          await cookieManager.saveCookies(site, cookies);
          console.log(`[auth] ${site}: ${cookies.length} cookie kaydedildi`);
          loginWindow = null;
          resolve({ success: true });
        } else {
          loginWindow = null;
          resolve({ success: false });
        }
      } catch (e) {
        console.error(`[auth] ${site}: Cookie kaydetme hatası:`, e.message);
        loginWindow = null;
        resolve({ success: false });
      }
    });
  });
});

ipcMain.handle('auth:checkStatus', async (_, site) => {
  return cookieManager.hasValidCookies(site);
});

// ─── IPC: Scraping ──────────────────────────────────────────────

/**
 * Cookie'leri DB'den Electron session'a yükle.
 */
async function restoreSessionCookies(site) {
  const savedCookies = await cookieManager.getCookies(site);
  if (!savedCookies || savedCookies.length === 0) return false;

  const siteUrl = site === 'sahibinden' ? 'https://www.sahibinden.com' : 'https://www.emlakjet.com';
  let restored = 0;

  for (const cookie of savedCookies) {
    try {
      await session.defaultSession.cookies.set({
        url: siteUrl,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain || undefined,
        path: cookie.path || '/',
        secure: cookie.secure || false,
        httpOnly: cookie.httpOnly || false,
        sameSite: cookie.sameSite || 'unspecified',
        expirationDate: cookie.expirationDate || undefined,
      });
      restored++;
    } catch {}
  }

  console.log(`[refresh] ${site}: ${restored}/${savedCookies.length} cookie yüklendi`);
  return restored > 0;
}

/**
 * Scrape sonrası taze cookie'leri DB'ye kaydet.
 */
async function saveSessionCookies(site) {
  try {
    const siteUrl = site === 'sahibinden' ? 'https://www.sahibinden.com' : 'https://www.emlakjet.com';
    const freshCookies = await session.defaultSession.cookies.get({ url: siteUrl });
    await cookieManager.saveCookies(site, freshCookies);
  } catch {}
}

ipcMain.handle('scraper:refresh', async () => {
  const results = { sahibinden: null, emlakjet: null, errors: [] };

  // Sahibinden ve Emlakjet'i SIRALI çek (Aynı anda Chrome UserDataDir kilidi yememesi için)
  
  // --- Sahibinden ---
  const sahibindenPromise = (async () => {
    const hasCookies = await restoreSessionCookies('sahibinden');
    if (!hasCookies) {
      throw new Error('Önce Ayarlar\'dan Sahibinden\'e giriş yapın.');
    }
    console.log('[refresh] Sahibinden başlıyor...');
    const listings = await sahibindenScraper.scrapeOffice(CACHE_DIR);
    console.log(`[refresh] Sahibinden: ${listings.length} ilan çekildi`);
    const sync = database.syncListings('sahibinden', listings);
    await saveSessionCookies('sahibinden');
    return sync;
  })();
  
  const [sahibindenResult] = await Promise.allSettled([sahibindenPromise]);

  // --- Emlakjet (cookie gerekmez) ---
  const emlakjetPromise = (async () => {
    console.log('[refresh] Emlakjet başlıyor...');
    const listings = await emlakjetScraper.scrapeOffice(CACHE_DIR);
    console.log(`[refresh] Emlakjet: ${listings.length} ilan çekildi`);
    return database.syncListings('emlakjet', listings);
  })();

  const [emlakjetResult] = await Promise.allSettled([emlakjetPromise]);

  // Sonuçları topla
  if (sahibindenResult.status === 'fulfilled') {
    results.sahibinden = sahibindenResult.value;
  } else {
    results.errors.push(`Sahibinden: ${sahibindenResult.reason.message}`);
    console.error('[refresh] Sahibinden hatası:', sahibindenResult.reason.message);
    await saveSessionCookies('sahibinden'); // Challenge geçilmiş olabilir
  }

  if (emlakjetResult.status === 'fulfilled') {
    results.emlakjet = emlakjetResult.value;
  } else {
    results.errors.push(`Emlakjet: ${emlakjetResult.reason.message}`);
    console.error('[refresh] Emlakjet hatası:', emlakjetResult.reason.message);
  }

  return results;
});

// ─── IPC: Image Generation ──────────────────────────────────────

ipcMain.handle('generator:generate', async (_, { templatePath, data, width, height }) => {
  return imageGenerator.generate(templatePath, data, width, height);
});

ipcMain.handle('generator:save', async (_, { buffer, defaultName }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Görseli Kaydet',
    defaultPath: path.join(app.getPath('pictures'), defaultName || 'gorsel.png'),
    filters: [{ name: 'PNG Görsel', extensions: ['png'] }]
  });
  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, Buffer.from(buffer));
    return result.filePath;
  }
  return null;
});

// ─── IPC: File Operations ───────────────────────────────────────

ipcMain.handle('file:pickImage', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Görsel Seç',
    filters: [{ name: 'Görseller', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    properties: ['openFile']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('file:pickImages', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Görselleri Seç',
    filters: [{ name: 'Görseller', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    properties: ['openFile', 'multiSelections']
  });
  if (!result.canceled) return result.filePaths;
  return [];
});

ipcMain.handle('file:imageToBase64', async (_, filePath) => {
  return fileManager.imageToBase64(filePath);
});

ipcMain.handle('file:getAssetsPath', () => {
  return path.join(__dirname, '..', '..', 'assets');
});

ipcMain.handle('file:getTemplatesPath', () => {
  return path.join(__dirname, '..', 'templates');
});

ipcMain.handle('file:listTemplates', async () => {
  const fs = require('fs');
  const templatesDir = path.join(__dirname, '..', '..', '..', '..', 'özgü-görseller');
  try {
    const files = fs.readdirSync(templatesDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
    return files.map(f => path.join(templatesDir, f));
  } catch (e) {
    console.error('Template listing error:', e);
    return [];
  }
});

ipcMain.handle('file:getTemplateCatalog', async () => {
  const fs = require('fs');
  const catalogPath = path.join(__dirname, '..', '..', '..', '..', 'template-catalog.json');
  try {
    const data = fs.readFileSync(catalogPath, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    console.error('Catalog read error:', e);
    return [];
  }
});

// ─── App Lifecycle ──────────────────────────────────────────────

app.whenReady().then(async () => {
  // DİNAMİK UA TEMİZLİĞİ: Gerçek Electron Chrome sürümü kullanılır, sadece "Electron" isimleri silinir.
  // Sabit UA kullanmak yetenek uyuşmazlığı nedeniyle Turnstile'ı bozar.
  const rawUa = session.defaultSession.getUserAgent();
  CHROME_UA = rawUa.replace(/Electron\/[\d\.]+\s*/, '').replace(/ozgu-invest-emlak\/[\d\.]+\s*/, '');
  session.defaultSession.setUserAgent(CHROME_UA);

  ensureDirectories();
  await database.initialize(path.join(DATA_DIR, 'emlak.db'));
  createMainWindow();
  browserFetcher.setMainWindow(mainWindow);

});

app.on('window-all-closed', () => {
  browserFetcher.cleanup();
  imageGenerator.cleanup();
  app.quit();
});

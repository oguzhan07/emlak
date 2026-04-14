/**
 * cookie-manager.js
 * Oturum cookie'lerini şifreli olarak veritabanında saklar.
 * AES-256-GCM şifreleme, makine bilgisinden türetilen anahtar.
 */

const crypto = require('crypto');
const os = require('os');
const database = require('../database');

// Makine bilgisinden şifreleme anahtarı türet
const KEY_SOURCE = `ozgu-emlak-${os.hostname()}-${os.userInfo().username}`;
const KEY = crypto.createHash('sha256').update(KEY_SOURCE).digest();
const ALGORITHM = 'aes-256-gcm';

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

function decrypt(data) {
  const [ivHex, tagHex, encrypted] = data.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Cookie listesini şifreli olarak DB'ye kaydet.
 * @param {string} site - 'sahibinden' | 'emlakjet'
 * @param {Array} cookies - Electron cookie nesneleri
 */
async function saveCookies(site, cookies) {
  if (!cookies || cookies.length < 3) {
    console.log(`[cookie] ${site}: Cookie sayısı az (${cookies?.length || 0}), kayıt atlandı`);
    return;
  }
  const json = JSON.stringify(cookies);
  const encrypted = encrypt(json);
  database.saveCookieData(site, encrypted);
  console.log(`[cookie] ${site}: ${cookies.length} cookie kaydedildi`);
}

/**
 * DB'den şifreli cookie'leri oku ve çöz.
 * @param {string} site
 * @returns {Array|null}
 */
async function getCookies(site) {
  const encrypted = database.getCookieData(site);
  if (!encrypted) return null;
  try {
    const json = decrypt(encrypted);
    return JSON.parse(json);
  } catch (e) {
    console.error(`[cookie] ${site}: Çözme hatası —`, e.message);
    return null;
  }
}

/**
 * Cookie listesini HTTP header formatına çevir.
 * @param {Array} cookies
 * @returns {string}
 */
function getCookieHeader(cookies) {
  if (!cookies || !Array.isArray(cookies)) return '';
  return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

/**
 * Geçerli cookie var mı kontrol et.
 * Emlakjet için her zaman true (public sayfa).
 * @param {string} site
 * @returns {Promise<boolean>}
 */
async function hasValidCookies(site) {
  // Emlakjet public sayfa — cookie gerekmez
  if (site === 'emlakjet') return true;

  const cookies = await getCookies(site);
  return cookies !== null && cookies.length > 0;
}

module.exports = {
  saveCookies,
  getCookies,
  getCookieHeader,
  hasValidCookies,
};

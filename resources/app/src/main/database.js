const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

let db;
let dbPath;

async function initialize(filepath) {
  dbPath = filepath;
  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  migrate();
  save();
}

function save() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

function migrate() {
  db.run(`
    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      photo_path TEXT DEFAULT '',
      instagram TEXT DEFAULT '',
      facebook TEXT DEFAULT '',
      twitter TEXT DEFAULT '',
      website TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL CHECK (source IN ('sahibinden', 'emlakjet', 'manual')),
      source_id TEXT,
      source_url TEXT,
      title TEXT NOT NULL DEFAULT '',
      description TEXT DEFAULT '',
      price REAL,
      currency TEXT DEFAULT 'TL',
      listing_type TEXT DEFAULT 'satilik',
      property_type TEXT DEFAULT '',
      room_count TEXT DEFAULT '',
      area_m2 REAL,
      gross_area_m2 REAL,
      floor_number INTEGER,
      total_floors INTEGER,
      building_age INTEGER,
      heating_type TEXT DEFAULT '',
      bathroom_count INTEGER,
      city TEXT DEFAULT '',
      district TEXT DEFAULT '',
      neighborhood TEXT DEFAULT '',
      address TEXT DEFAULT '',
      latitude REAL,
      longitude REAL,
      is_swap INTEGER DEFAULT 0,
      is_credit_eligible INTEGER DEFAULT 0,
      facing TEXT DEFAULT '',
      is_in_complex INTEGER DEFAULT 0,
      has_balcony INTEGER DEFAULT 0,
      has_elevator INTEGER DEFAULT 0,
      has_parking INTEGER DEFAULT 0,
      has_furnished INTEGER DEFAULT 0,
      listing_date TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      raw_html TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS listing_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER NOT NULL,
      image_url TEXT DEFAULT '',
      local_path TEXT DEFAULT '',
      display_order INTEGER DEFAULT 0,
      is_primary INTEGER DEFAULT 0,
      FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS session_cookies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site TEXT NOT NULL UNIQUE,
      cookie_data TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // Create unique index
  const indexExists = db.exec("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_listings_source'");
  if (indexExists.length === 0 || indexExists[0].values.length === 0) {
    db.run(`CREATE INDEX IF NOT EXISTS idx_listings_source ON listings(source, source_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_listings_active ON listings(is_active)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_listing_images_listing ON listing_images(listing_id)`);
  }

  // Ensure default profile row exists
  const profileExists = db.exec("SELECT id FROM user_profile WHERE id = 1");
  if (profileExists.length === 0 || profileExists[0].values.length === 0) {
    db.run("INSERT INTO user_profile (id, first_name, last_name) VALUES (1, '', '')");
  }

  save();
}

// ─── Profile ────────────────────────────────────────────────────

function getProfile() {
  const result = db.exec("SELECT * FROM user_profile WHERE id = 1");
  if (result.length === 0 || result[0].values.length === 0) return null;
  const cols = result[0].columns;
  const vals = result[0].values[0];
  const profile = {};
  cols.forEach((c, i) => profile[c] = vals[i]);
  return profile;
}

function saveProfile(profile) {
  db.run(`
    UPDATE user_profile SET
      first_name = ?, last_name = ?, phone = ?, email = ?, address = ?,
      photo_path = ?, instagram = ?, facebook = ?, twitter = ?, website = ?,
      updated_at = datetime('now')
    WHERE id = 1
  `, [
    profile.first_name || '', profile.last_name || '', profile.phone || '',
    profile.email || '', profile.address || '', profile.photo_path || '',
    profile.instagram || '', profile.facebook || '', profile.twitter || '',
    profile.website || ''
  ]);
  save();
  return getProfile();
}

// ─── Listings ───────────────────────────────────────────────────

function rowToObject(columns, values) {
  const obj = {};
  columns.forEach((c, i) => obj[c] = values[i]);
  return obj;
}

function getListings(filters = {}) {
  let query = "SELECT * FROM listings WHERE is_active = 1";
  const params = [];

  if (filters.source) {
    query += " AND source = ?";
    params.push(filters.source);
  }
  if (filters.listing_type) {
    query += " AND listing_type = ?";
    params.push(filters.listing_type);
  }
  if (filters.search) {
    query += " AND (title LIKE ? OR description LIKE ?)";
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  query += " ORDER BY created_at DESC";

  const result = db.exec(query, params);
  if (result.length === 0) return [];
  return result[0].values.map(v => rowToObject(result[0].columns, v));
}

function getListing(id) {
  const result = db.exec("SELECT * FROM listings WHERE id = ?", [id]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  const listing = rowToObject(result[0].columns, result[0].values[0]);
  listing.images = getListingImages(id);
  return listing;
}

function saveListing(listing) {
  // sql.js throws on undefined values - coerce to null
  const str = (v) => v != null ? String(v) : '';
  const num = (v) => v != null && v !== '' ? Number(v) : null;
  const bool = (v) => v ? 1 : 0;

  if (listing.id) {
    // Update
    db.run(`
      UPDATE listings SET
        title = ?, description = ?, price = ?, currency = ?, listing_type = ?,
        property_type = ?, room_count = ?, area_m2 = ?, gross_area_m2 = ?,
        floor_number = ?, total_floors = ?, building_age = ?, heating_type = ?,
        bathroom_count = ?, city = ?, district = ?, neighborhood = ?, address = ?,
        is_swap = ?, is_credit_eligible = ?, facing = ?, is_in_complex = ?,
        has_balcony = ?, has_elevator = ?, has_parking = ?, has_furnished = ?,
        listing_date = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [
      str(listing.title), str(listing.description), num(listing.price), listing.currency || 'TL',
      str(listing.listing_type), str(listing.property_type), str(listing.room_count),
      num(listing.area_m2), num(listing.gross_area_m2), num(listing.floor_number),
      num(listing.total_floors), num(listing.building_age), str(listing.heating_type),
      num(listing.bathroom_count), str(listing.city), str(listing.district), str(listing.neighborhood),
      str(listing.address), bool(listing.is_swap), bool(listing.is_credit_eligible),
      str(listing.facing), bool(listing.is_in_complex), bool(listing.has_balcony),
      bool(listing.has_elevator), bool(listing.has_parking),
      bool(listing.has_furnished), str(listing.listing_date), listing.id
    ]);

    // Update images if provided
    if (listing.images) {
      db.run("DELETE FROM listing_images WHERE listing_id = ?", [listing.id]);
      insertImages(listing.id, listing.images);
    }

    save();
    return getListing(listing.id);
  } else {
    // Insert
    db.run(`
      INSERT INTO listings (source, source_id, source_url, title, description, price,
        currency, listing_type, property_type, room_count, area_m2, gross_area_m2,
        floor_number, total_floors, building_age, heating_type, bathroom_count,
        city, district, neighborhood, address, is_swap, is_credit_eligible, facing,
        is_in_complex, has_balcony, has_elevator, has_parking, has_furnished, listing_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      listing.source || 'manual', listing.source_id || null, listing.source_url || null,
      str(listing.title), str(listing.description), num(listing.price), listing.currency || 'TL',
      str(listing.listing_type), str(listing.property_type), str(listing.room_count),
      num(listing.area_m2), num(listing.gross_area_m2), num(listing.floor_number),
      num(listing.total_floors), num(listing.building_age), str(listing.heating_type),
      num(listing.bathroom_count), str(listing.city), str(listing.district), str(listing.neighborhood),
      str(listing.address), bool(listing.is_swap), bool(listing.is_credit_eligible),
      str(listing.facing), bool(listing.is_in_complex), bool(listing.has_balcony),
      bool(listing.has_elevator), bool(listing.has_parking),
      bool(listing.has_furnished), str(listing.listing_date)
    ]);

    const idResult = db.exec("SELECT last_insert_rowid() as id");
    const newId = idResult[0].values[0][0];

    if (listing.images) {
      insertImages(newId, listing.images);
    }

    save();
    return getListing(newId);
  }
}

function insertImages(listingId, images) {
  images.forEach((img, index) => {
    db.run(`
      INSERT INTO listing_images (listing_id, image_url, local_path, display_order, is_primary)
      VALUES (?, ?, ?, ?, ?)
    `, [listingId, img.image_url || '', img.local_path || '', index, index === 0 ? 1 : 0]);
  });
}

function deleteListing(id) {
  db.run("DELETE FROM listing_images WHERE listing_id = ?", [id]);
  db.run("DELETE FROM listings WHERE id = ?", [id]);
  save();
  return true;
}

function getListingImages(listingId) {
  const result = db.exec(
    "SELECT * FROM listing_images WHERE listing_id = ? ORDER BY display_order",
    [listingId]
  );
  if (result.length === 0) return [];
  return result[0].values.map(v => rowToObject(result[0].columns, v));
}

// ─── Sync (for scrapers) ────────────────────────────────────────

function syncListings(source, scrapedListings) {
  let added = 0, updated = 0, removed = 0;

  // Güvenlik: scraper boş dönerse mevcut ilanları silme
  const existing = db.exec(
    "SELECT id, source_id FROM listings WHERE source = ? AND is_active = 1",
    [source]
  );
  const existingMap = new Map();
  if (existing.length > 0) {
    existing[0].values.forEach(v => existingMap.set(v[1], v[0]));
  }

  if (scrapedListings.length === 0 && existingMap.size > 0) {
    console.log(`[syncListings] ${source}: Scraper boş döndü, ${existingMap.size} mevcut ilan korunuyor`);
    return { added: 0, updated: 0, removed: 0 };
  }

  const scrapedIds = new Set(scrapedListings.map(l => l.source_id));

  // Kaldırılan ilanları deaktif et
  for (const [sourceId, dbId] of existingMap) {
    if (!scrapedIds.has(sourceId)) {
      db.run("UPDATE listings SET is_active = 0, updated_at = datetime('now') WHERE id = ?", [dbId]);
      removed++;
    }
  }

  // Yeni/güncellenen ilanları kaydet
  for (const listing of scrapedListings) {
    listing.source = source;
    if (existingMap.has(listing.source_id)) {
      listing.id = existingMap.get(listing.source_id);
      saveListing(listing);
      updated++;
    } else {
      saveListing(listing);
      added++;
    }
  }

  save();
  console.log(`[syncListings] ${source}: +${added} / ↻${updated} / -${removed}`);
  return { added, updated, removed };
}

// ─── Cookies (stored in DB) ─────────────────────────────────────

function getCookieData(site) {
  const result = db.exec("SELECT cookie_data FROM session_cookies WHERE site = ?", [site]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return result[0].values[0][0];
}

function saveCookieData(site, data) {
  const existing = db.exec("SELECT id FROM session_cookies WHERE site = ?", [site]);
  if (existing.length > 0 && existing[0].values.length > 0) {
    db.run("UPDATE session_cookies SET cookie_data = ?, updated_at = datetime('now') WHERE site = ?", [data, site]);
  } else {
    db.run("INSERT INTO session_cookies (site, cookie_data) VALUES (?, ?)", [site, data]);
  }
  save();
}

function clearSourceListings(source) {
  const ids = db.exec("SELECT id FROM listings WHERE source = ?", [source]);
  if (ids.length > 0) {
    ids[0].values.forEach(([id]) => {
      db.run("DELETE FROM listing_images WHERE listing_id = ?", [id]);
    });
  }
  db.run("DELETE FROM listings WHERE source = ?", [source]);
  save();
  const count = ids.length > 0 ? ids[0].values.length : 0;
  console.log(`[db] ${source}: ${count} ilan silindi`);
  return count;
}

module.exports = {
  initialize,
  getProfile,
  saveProfile,
  getListings,
  getListing,
  saveListing,
  deleteListing,
  getListingImages,
  syncListings,
  clearSourceListings,
  getCookieData,
  saveCookieData
};

/**
 * header.js
 * Header: logo, profil bilgileri, yenile butonu, ayarlar butonu.
 */

const HeaderModule = {
  async init() {
    // Logo
    const logo = document.getElementById('header-logo');
    logo.src = AppState.assetsPath.replace(/\\/g, '/') + '/logo/logo_white_transparent.png';

    // Profil yükle
    await this.loadProfile();

    // Ayarlar butonu
    document.getElementById('btn-settings').addEventListener('click', () => {
      SettingsModule.open();
    });

    // Profil tıklama → ayarlar
    document.getElementById('header-profile').addEventListener('click', () => {
      SettingsModule.open();
    });

    // Yenile butonu
    document.getElementById('btn-refresh').addEventListener('click', () => this.refresh());

    // Profil güncellenince header'ı güncelle
    EventBus.on('profile-updated', () => this.loadProfile());
  },

  async loadProfile() {
    const profile = await window.api.getProfile();
    AppState.profile = profile;

    const nameEl = document.getElementById('header-profile-name');
    const phoneEl = document.getElementById('header-profile-phone');
    const photoEl = document.getElementById('header-profile-photo');

    if (profile && (profile.first_name || profile.last_name)) {
      nameEl.textContent = `${profile.first_name} ${profile.last_name}`.trim();
      phoneEl.textContent = profile.phone || '';
    } else {
      nameEl.textContent = 'Profil Ayarla';
      phoneEl.textContent = '';
    }

    if (profile && profile.photo_path) {
      const base64 = await window.api.imageToBase64(profile.photo_path);
      photoEl.src = base64 || getPlaceholderAvatar();
    } else {
      photoEl.src = getPlaceholderAvatar();
    }
  },

  async refresh() {
    const btn = document.getElementById('btn-refresh');
    btn.classList.add('refreshing');
    btn.disabled = true;
    showToast('İlanlar güncelleniyor...', 'info');

    try {
      const results = await window.api.refreshListings();
      const messages = [];

      // Sahibinden sonucu
      if (results.sahibinden) {
        const s = results.sahibinden;
        messages.push(`Sahibinden: +${s.added} yeni, ${s.updated} güncellendi, ${s.removed} kaldırıldı`);
      }

      // Emlakjet sonucu
      if (results.emlakjet) {
        const e = results.emlakjet;
        messages.push(`Emlakjet: +${e.added} yeni, ${e.updated} güncellendi, ${e.removed} kaldırıldı`);
      }

      // Hatalar
      if (results.errors.length > 0) {
        showToast(results.errors.join('\n'), 'error', 6000);
      }

      // Başarı mesajı
      if (messages.length > 0) {
        showToast(messages.join('\n'), 'success', 5000);
      } else if (results.errors.length === 0) {
        showToast('Bağlantı bulunamadı. Ayarlar\'dan giriş yapın.', 'info');
      }

      // Listeyi yenile
      await ListingPanel.loadListings();
    } catch (e) {
      showToast('Güncelleme hatası: ' + (e.message || 'Bilinmeyen hata'), 'error', 5000);
    } finally {
      btn.classList.remove('refreshing');
      btn.disabled = false;
    }
  }
};

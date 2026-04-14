const SettingsModule = {
  async init() {
    document.getElementById('btn-change-photo').addEventListener('click', async () => {
      const path = await window.api.pickImage();
      if (path) {
        document.getElementById('settings-photo').src = await window.api.imageToBase64(path);
        document.getElementById('settings-photo').dataset.path = path;
      }
    });

    document.getElementById('btn-save-settings').addEventListener('click', () => this.save());

    document.getElementById('btn-login-sahibinden').addEventListener('click', async () => {
      const result = await window.api.openLogin('sahibinden');
      if (result.success) {
        showToast('Sahibinden.com bağlantısı kuruldu!', 'success');
        this.checkAuthStatus();
      }
    });

    document.getElementById('btn-login-emlakjet').addEventListener('click', async () => {
      const result = await window.api.openLogin('emlakjet');
      if (result.success) {
        showToast('Emlakjet.com bağlantısı kuruldu!', 'success');
        this.checkAuthStatus();
      }
    });
  },

  async open() {
    // Fill form with current profile
    const profile = await window.api.getProfile();
    if (profile) {
      document.getElementById('settings-firstname').value = profile.first_name || '';
      document.getElementById('settings-lastname').value = profile.last_name || '';
      document.getElementById('settings-phone').value = profile.phone || '';
      document.getElementById('settings-email').value = profile.email || '';
      document.getElementById('settings-address').value = profile.address || '';
      document.getElementById('settings-instagram').value = profile.instagram || '';
      document.getElementById('settings-facebook').value = profile.facebook || '';
      document.getElementById('settings-twitter').value = profile.twitter || '';
      document.getElementById('settings-website').value = profile.website || '';

      const photoEl = document.getElementById('settings-photo');
      if (profile.photo_path) {
        photoEl.src = await window.api.imageToBase64(profile.photo_path);
        photoEl.dataset.path = profile.photo_path;
      } else {
        photoEl.src = getPlaceholderAvatar();
        photoEl.dataset.path = '';
      }
    }

    await this.checkAuthStatus();
    openModal('modal-settings');
  },

  async checkAuthStatus() {
    const sahibindenStatus = document.getElementById('auth-status-sahibinden');
    const emlakjetStatus = document.getElementById('auth-status-emlakjet');

    const shConnected = await window.api.checkAuthStatus('sahibinden');
    const ejConnected = await window.api.checkAuthStatus('emlakjet');

    if (shConnected) {
      sahibindenStatus.textContent = '● Bağlı';
      sahibindenStatus.classList.add('connected');
    } else {
      sahibindenStatus.textContent = '● Bağlı Değil';
      sahibindenStatus.classList.remove('connected');
    }

    if (ejConnected) {
      emlakjetStatus.textContent = '● Bağlı';
      emlakjetStatus.classList.add('connected');
    } else {
      emlakjetStatus.textContent = '● Bağlı Değil';
      emlakjetStatus.classList.remove('connected');
    }
  },

  async save() {
    const profile = {
      first_name: document.getElementById('settings-firstname').value,
      last_name: document.getElementById('settings-lastname').value,
      phone: document.getElementById('settings-phone').value,
      email: document.getElementById('settings-email').value,
      address: document.getElementById('settings-address').value,
      photo_path: document.getElementById('settings-photo').dataset.path || '',
      instagram: document.getElementById('settings-instagram').value,
      facebook: document.getElementById('settings-facebook').value,
      twitter: document.getElementById('settings-twitter').value,
      website: document.getElementById('settings-website').value,
    };

    await window.api.saveProfile(profile);
    AppState.profile = profile;
    EventBus.emit('profile-updated');
    closeModal('modal-settings');
    showToast('Profil kaydedildi', 'success');
  }
};

// ─── Event Bus ──────────────────────────────────────────────────
const EventBus = {
  _listeners: {},
  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  },
  off(event, fn) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(f => f !== fn);
  },
  emit(event, data) {
    if (!this._listeners[event]) return;
    this._listeners[event].forEach(fn => fn(data));
  }
};

// ─── Formatters ─────────────────────────────────────────────────
function formatPrice(price, currency = 'TL') {
  if (!price && price !== 0) return '';
  return new Intl.NumberFormat('tr-TR').format(price) + ' ' + currency;
}

function formatArea(m2) {
  if (!m2) return '';
  return m2 + ' m²';
}

// ─── Toast ──────────────────────────────────────────────────────
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(40px)';
    toast.style.transition = '0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─── Modal helpers ──────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function initModalClose(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.querySelector('.modal-overlay')?.addEventListener('click', () => closeModal(modalId));
  
  // Tüm 'modal-close' sınıfları ve İptal/Cancel belirten butonlar için kapatıcı ata
  const closers = modal.querySelectorAll('.modal-close, [id$="cancel"], [id*="cancel-"]');
  closers.forEach(closer => {
    // Avoid double binding or replacing their custom logic if they have it, but for our simple cancels, it's fine.
    closer.addEventListener('click', () => closeModal(modalId));
  });
}

// ─── Placeholder image ─────────────────────────────────────────
function getPlaceholderImage() {
  return 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" fill="#E4E7EC"><rect width="200" height="150"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#98A2B3" font-size="14" font-family="sans-serif">Görsel Yok</text></svg>'
  );
}

function getPlaceholderAvatar() {
  return 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" fill="#2A3F6A"><rect width="80" height="80"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#C5A355" font-size="28" font-family="sans-serif">?</text></svg>'
  );
}

// ─── App State ──────────────────────────────────────────────────
const AppState = {
  profile: null,
  selectedTemplate: null,
  selectedListing: null,
  selectedOccasion: null,
  assetsPath: '',
  templatesPath: '',
};

// ─── Initialize ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {

  // ══════════════════════════════════════════════════════════
  // PHASE 1: Kritik UI bağlamaları — bunlar ASLA başarısız olmaz
  // ══════════════════════════════════════════════════════════

  // Tab switching
  const tabs = document.querySelectorAll('.main-tab');
  const tabContents = document.querySelectorAll('.main-tab-content');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.getAttribute('data-target');
      document.getElementById(target).classList.add('active');
    });
  });

  // Modal close handlers — overlay click + × butonları + iptal butonları
  initModalClose('modal-settings');
  initModalClose('modal-listing-form');
  initModalClose('modal-listing-detail');
  initModalClose('modal-preview');
  initModalClose('modal-studio');
  initModalClose('modal-editor');

  // Generate button
  const btnGenerate = document.getElementById('btn-generate');
  btnGenerate.addEventListener('click', () => {
    if (AppState.selectedOccasion) {
      PreviewModule.generateOccasion(AppState.selectedOccasion);
    } else if (AppState.selectedTemplate && AppState.selectedListing) {
      PreviewModule.generateListing(AppState.selectedTemplate, AppState.selectedListing);
    }
  });

  EventBus.on('selection-changed', updateGenerateButton);

  // ══════════════════════════════════════════════════════════
  // PHASE 2: Modül başlatma — her biri try-catch ile sarmalı
  // ══════════════════════════════════════════════════════════

  try {
    AppState.assetsPath = await window.api.getAssetsPath();
  } catch (e) {
    console.error('Assets path alınamadı:', e);
  }

  try {
    AppState.templatesPath = await window.api.getTemplatesPath();
  } catch (e) {
    console.error('Templates path alınamadı:', e);
  }

  // Her modülü bağımsız olarak başlat
  const modules = [
    ['HeaderModule', () => HeaderModule.init()],
    ['SettingsModule', () => SettingsModule.init()],
    ['ListingPanel', () => ListingPanel.init()],
    ['TemplatePanel', () => TemplatePanel.init()],
    ['OccasionPanel', () => OccasionPanel.init()],
    ['ListingForm', () => ListingForm.init()],
    ['PreviewModule', () => PreviewModule.init()],
    ['StudioManager', () => StudioManager.init()],
  ];

  for (const [name, initFn] of modules) {
    try {
      await initFn();
    } catch (e) {
      console.error(`${name} başlatma hatası:`, e);
    }
  }

  console.log('Uygulama başlatma tamamlandı.');
});

function updateGenerateButton() {
  const btn = document.getElementById('btn-generate');
  if (AppState.selectedOccasion) {
    btn.classList.remove('hidden');
    btn.querySelector('span').textContent = 'Özel Gün Görseli Üret';
  } else if (AppState.selectedTemplate && AppState.selectedListing) {
    btn.classList.remove('hidden');
    btn.querySelector('span').textContent = 'İlan Görseli Üret';
  } else {
    btn.classList.add('hidden');
  }
}

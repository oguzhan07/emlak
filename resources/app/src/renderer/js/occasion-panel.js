const OCCASION_CATALOG = [
  { id: 'yilbasi', name: 'Yılbaşı', date: '01-01', file: 'occasions/yilbasi.html' },
  { id: 'sevgililer-gunu', name: 'Sevgililer Günü', date: '02-14', file: 'occasions/sevgililer-gunu.html' },
  { id: 'kadinlar-gunu', name: 'Dünya Kadınlar Günü', date: '03-08', file: 'occasions/kadinlar-gunu.html' },
  { id: 'canakkale', name: 'Çanakkale Zaferi', date: '03-18', file: 'occasions/canakkale.html' },
  { id: 'nisan-23', name: '23 Nisan', date: '04-23', file: 'occasions/nisan-23.html' },
  { id: 'mayis-1', name: '1 Mayıs', date: '05-01', file: 'occasions/mayis-1.html' },
  { id: 'anneler-gunu', name: 'Anneler Günü', date: '05-11', file: 'occasions/anneler-gunu.html' },
  { id: 'mayis-19', name: '19 Mayıs', date: '05-19', file: 'occasions/mayis-19.html' },
  { id: 'babalar-gunu', name: 'Babalar Günü', date: '06-15', file: 'occasions/babalar-gunu.html' },
  { id: 'agustos-30', name: '30 Ağustos Zafer Bayramı', date: '08-30', file: 'occasions/agustos-30.html' },
  { id: 'ekim-29', name: '29 Ekim Cumhuriyet Bayramı', date: '10-29', file: 'occasions/ekim-29.html' },
  { id: 'kasim-10', name: '10 Kasım Atatürk\'ü Anma', date: '11-10', file: 'occasions/kasim-10.html' },
  { id: 'cocuk-haklari', name: 'Dünya Çocuk Hakları Günü', date: '11-20', file: 'occasions/cocuk-haklari.html' },
  { id: 'ogretmenler-gunu', name: 'Öğretmenler Günü', date: '11-24', file: 'occasions/ogretmenler-gunu.html' },
  { id: 'ramazan-bayrami', name: 'Ramazan Bayramı', date: null, file: 'occasions/ramazan-bayrami.html' },
  { id: 'kurban-bayrami', name: 'Kurban Bayramı', date: null, file: 'occasions/kurban-bayrami.html' },
  { id: 'kandil-mevlid', name: 'Mevlid Kandili', date: null, file: 'occasions/kandil.html' },
  { id: 'kandil-regaib', name: 'Regaib Kandili', date: null, file: 'occasions/kandil.html' },
  { id: 'kandil-mirac', name: 'Miraç Kandili', date: null, file: 'occasions/kandil.html' },
  { id: 'kandil-berat', name: 'Berat Kandili', date: null, file: 'occasions/kandil.html' },
  { id: 'kandil-kadir', name: 'Kadir Gecesi', date: null, file: 'occasions/kandil.html' },
];

const OccasionPanel = {
  async init() {
    this.render();
  },

  isUpcoming(dateStr) {
    if (!dateStr) return false;
    const now = new Date();
    const [month, day] = dateStr.split('-').map(Number);
    const occasionDate = new Date(now.getFullYear(), month - 1, day);
    const diff = occasionDate - now;
    return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
  },

  render() {
    const grid = document.getElementById('occasion-grid');
    grid.innerHTML = OCCASION_CATALOG.map(o => {
      const isSelected = AppState.selectedOccasion && AppState.selectedOccasion.id === o.id;
      const upcoming = this.isUpcoming(o.date);
      return `
        <div class="template-card occasion-card ${isSelected ? 'selected' : ''}" data-occasion-id="${o.id}" title="${o.name}">
          <div class="card-icon occasion-icon">🎉</div>
          <div class="card-title">${o.name}</div>
          ${upcoming ? '<span class="occasion-badge">Yakında!</span>' : ''}
          ${o.date ? `<span class="template-size">${o.date.split('-').reverse().join('/')}</span>` : ''}
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.template-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.occasionId;
        const occasion = OCCASION_CATALOG.find(o => o.id === id);
        AppState.selectedOccasion = occasion;
        AppState.selectedTemplate = null;
        this.render();
        try { TemplatePanel.render(); } catch(e) {} // deselect template
        EventBus.emit('selection-changed');
      });
    });
  }
};

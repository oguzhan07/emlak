const TEMPLATE_CATALOG = {
  listings: [
    { id: 'square-hero', name: 'Kare - Tek Fotoğraf', file: 'listings/square-hero.html', width: 1080, height: 1080, category: 'Kare' },
    { id: 'square-grid4', name: 'Kare - 4 Fotoğraf', file: 'listings/square-grid4.html', width: 1080, height: 1080, category: 'Kare' },
    { id: 'square-collage', name: 'Kare - Kolaj', file: 'listings/square-collage.html', width: 1080, height: 1080, category: 'Kare' },
    { id: 'square-features', name: 'Kare - Özellikler', file: 'listings/square-features.html', width: 1080, height: 1080, category: 'Kare' },
    { id: 'portrait-hero', name: 'Dikey - Tek Fotoğraf', file: 'listings/portrait-hero.html', width: 1080, height: 1350, category: 'Dikey' },
    { id: 'portrait-collage', name: 'Dikey - Kolaj', file: 'listings/portrait-collage.html', width: 1080, height: 1350, category: 'Dikey' },
    { id: 'story-hero', name: 'Story - Tek Fotoğraf', file: 'listings/story-hero.html', width: 1080, height: 1920, category: 'Story' },
    { id: 'story-split', name: 'Story - Bölünmüş', file: 'listings/story-split.html', width: 1080, height: 1920, category: 'Story' },
    { id: 'landscape-hero', name: 'Yatay - Tek Fotoğraf', file: 'listings/landscape-hero.html', width: 1920, height: 1080, category: 'Yatay' },
    { id: 'landscape-grid', name: 'Yatay - Grid', file: 'listings/landscape-grid.html', width: 1920, height: 1080, category: 'Yatay' },
    { id: 'ratio34-hero', name: '3:4 - Tek Fotoğraf', file: 'listings/ratio34-hero.html', width: 1080, height: 1440, category: '3:4' },
    { id: 'ratio34-collage', name: '3:4 - Kolaj', file: 'listings/ratio34-collage.html', width: 1080, height: 1440, category: '3:4' },
  ]
};

const TemplatePanel = {
  async init() {
    this.render();
  },

  render() {
    const grid = document.getElementById('template-grid');
    if (!grid) return; // Grid element doesn't exist in current layout
    grid.innerHTML = TEMPLATE_CATALOG.listings.map(t => {
      const isSelected = AppState.selectedTemplate && AppState.selectedTemplate.id === t.id;
      const aspectClass = t.width > t.height ? 'landscape' : (t.width < t.height ? 'portrait' : '');
      return `
        <div class="template-card ${isSelected ? 'selected' : ''}" data-template-id="${t.id}" title="${t.name}">
          <div class="card-icon aspect-${t.category.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'default'}">✨</div>
          <div class="card-title">${t.name}</div>
          <span class="template-size">${t.category}</span>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.template-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.templateId;
        const template = TEMPLATE_CATALOG.listings.find(t => t.id === id);
        AppState.selectedTemplate = template;
        AppState.selectedOccasion = null;
        this.render();
        OccasionPanel.render(); // deselect occasion
        EventBus.emit('selection-changed');
      });
    });
  }
};

/**
 * listing-panel.js
 * Sağ panelde ilan kartlarını listeler, arama/filtre, detay modal, ilan seçimi.
 */

const ListingPanel = {
  listings: [],

  async init() {
    await this.loadListings();

    // Arama (debounce 300ms)
    let searchTimer;
    document.getElementById('listing-search').addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => this.filterAndRender(), 300);
    });

    // Filtreler
    document.getElementById('filter-source').addEventListener('change', () => this.filterAndRender());
    document.getElementById('filter-type').addEventListener('change', () => this.filterAndRender());

    // Yeni ilan ekle butonu
    document.getElementById('btn-add-listing').addEventListener('click', () => {
      ListingForm.openNew();
    });

    // Detay modal butonları
    document.getElementById('btn-delete-listing').addEventListener('click', () => this.deleteSelected());
    document.getElementById('btn-edit-listing').addEventListener('click', () => this.editSelected());
    document.getElementById('btn-select-listing').addEventListener('click', () => this.selectFromDetail());
  },

  async loadListings() {
    try {
      this.listings = await window.api.getListings({});
    } catch (e) {
      console.error('İlan yükleme hatası:', e);
      this.listings = [];
    }
    this.filterAndRender();
  },

  filterAndRender() {
    const search = (document.getElementById('listing-search').value || '').toLowerCase();
    const source = document.getElementById('filter-source').value;
    const type = document.getElementById('filter-type').value;

    let filtered = this.listings;

    if (search) {
      filtered = filtered.filter(l =>
        (l.title || '').toLowerCase().includes(search) ||
        (l.description || '').toLowerCase().includes(search) ||
        (l.city || '').toLowerCase().includes(search) ||
        (l.district || '').toLowerCase().includes(search)
      );
    }
    if (source) filtered = filtered.filter(l => l.source === source);
    if (type) filtered = filtered.filter(l => l.listing_type === type);

    this.render(filtered);
  },

  render(listings) {
    const container = document.getElementById('listing-list');

    if (listings.length === 0) {
      container.innerHTML = `
        <div class="listing-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          <p>Henüz ilan bulunmuyor.<br>Yenile butonuyla online ilanları çekin veya + ile manuel ekleyin.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = listings.map(listing => {
      const isSelected = AppState.selectedListing && AppState.selectedListing.id === listing.id;
      return `
        <div class="listing-card ${isSelected ? 'selected' : ''}" data-id="${listing.id}">
          <img class="listing-card-image" src="${getPlaceholderImage()}" data-listing-id="${listing.id}" alt="">
          <div class="listing-card-info">
            <div>
              <div class="listing-card-title">${listing.title || 'İsimsiz İlan'}</div>
              <div class="listing-card-price">${formatPrice(listing.price, listing.currency)}</div>
            </div>
            <div class="listing-card-meta">
              ${listing.room_count ? `<span>🏠 ${listing.room_count}</span>` : ''}
              ${listing.area_m2 ? `<span>📐 ${formatArea(listing.area_m2)}</span>` : ''}
              ${listing.city ? `<span>📍 ${listing.district ? listing.district + ', ' : ''}${listing.city}</span>` : ''}
              <span class="source-badge ${listing.source}">${listing.source}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Resimleri async yükle (batch)
    this.loadCardImages(listings);

    // Tıklama Eylemleri
    container.querySelectorAll('.listing-card').forEach(card => {
      // Tek tık: seçili efekti + AppState güncelle
      card.addEventListener('click', async () => {
        container.querySelectorAll('.listing-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        try {
          const listing = await window.api.getListing(parseInt(card.dataset.id));
          AppState.selectedListing = listing;
          AppState.selectedOccasion = null;
          EventBus.emit('selection-changed');
        } catch(e) {
          console.error('İlan seçim hatası:', e);
        }
      });
      // Çift tık: stüdyoyu aç
      card.addEventListener('dblclick', () => {
        StudioManager.open(parseInt(card.dataset.id));
      });
    });
  },

  async loadCardImages(listings) {
    // 5'erli batch ile yükle (hepsini sırayla değil)
    const batchSize = 5;
    for (let i = 0; i < listings.length; i += batchSize) {
      const batch = listings.slice(i, i + batchSize);
      await Promise.all(batch.map(async (listing) => {
        try {
          const images = await window.api.getListingImages(listing.id);
          if (images.length > 0 && images[0].local_path) {
            const base64 = await window.api.imageToBase64(images[0].local_path);
            if (base64) {
              const img = document.querySelector(`img[data-listing-id="${listing.id}"]`);
              if (img) img.src = base64;
            }
          }
        } catch {}
      }));
    }
  },

  _currentDetailId: null,

  async openDetail(id) {
    this._currentDetailId = id;

    let listing;
    try {
      listing = await window.api.getListing(id);
    } catch (e) {
      showToast('İlan detayı yüklenemedi', 'error');
      return;
    }
    if (!listing) return;

    document.getElementById('detail-title').textContent = listing.title || 'İlan Detayı';

    const body = document.getElementById('detail-body');
    const images = listing.images || [];

    // Galeri
    let galleryHtml = '';
    if (images.length > 0) {
      const imageSrcs = await Promise.all(images.map(async img => {
        if (img.local_path) {
          return await window.api.imageToBase64(img.local_path) || getPlaceholderImage();
        }
        return img.image_url || getPlaceholderImage();
      }));
      galleryHtml = `<div class="detail-gallery">${imageSrcs.map(src => `<img src="${src}" alt="">`).join('')}</div>`;
    }

    // Bilgi tablosu
    const infoItems = [
      ['Fiyat', formatPrice(listing.price, listing.currency)],
      ['Tür', listing.listing_type === 'kiralik' ? 'Kiralık' : 'Satılık'],
      ['Emlak Tipi', listing.property_type],
      ['Oda Sayısı', listing.room_count],
      ['Net m²', formatArea(listing.area_m2)],
      ['Brüt m²', formatArea(listing.gross_area_m2)],
      ['Kat', listing.floor_number != null ? `${listing.floor_number}/${listing.total_floors || '?'}` : ''],
      ['Bina Yaşı', listing.building_age],
      ['Isınma', listing.heating_type],
      ['Banyo', listing.bathroom_count],
      ['Cephe', listing.facing],
      ['İl', listing.city],
      ['İlçe', listing.district],
      ['Mahalle', listing.neighborhood],
      ['Balkon', listing.has_balcony ? 'Var' : ''],
      ['Asansör', listing.has_elevator ? 'Var' : ''],
      ['Otopark', listing.has_parking ? 'Var' : ''],
      ['Eşyalı', listing.has_furnished ? 'Evet' : ''],
      ['Site İçi', listing.is_in_complex ? 'Evet' : ''],
    ].filter(([, v]) => v && v !== '0' && v !== 'null');

    body.innerHTML = `
      ${galleryHtml}
      <div class="detail-info-grid">
        ${infoItems.map(([label, value]) => `
          <div class="detail-info-item">
            <span class="label">${label}</span>
            <span class="value">${value}</span>
          </div>
        `).join('')}
      </div>
      ${listing.description ? `<div class="detail-description">${listing.description}</div>` : ''}
    `;

    // Düzenle butonu sadece manuel ilanlar için
    document.getElementById('btn-edit-listing').style.display = listing.source === 'manual' ? '' : 'none';

    openModal('modal-listing-detail');
  },

  async deleteSelected() {
    if (!this._currentDetailId) return;

    try {
      await window.api.deleteListing(this._currentDetailId);
      closeModal('modal-listing-detail');

      if (AppState.selectedListing && AppState.selectedListing.id === this._currentDetailId) {
        AppState.selectedListing = null;
        EventBus.emit('selection-changed');
      }

      await this.loadListings();
      showToast('İlan silindi', 'success');
    } catch (e) {
      showToast('Silme hatası: ' + e.message, 'error');
    }
  },

  editSelected() {
    if (!this._currentDetailId) return;
    closeModal('modal-listing-detail');
    ListingForm.openEdit(this._currentDetailId);
  },

  async selectFromDetail() {
    if (!this._currentDetailId) return;

    try {
      const listing = await window.api.getListing(this._currentDetailId);
      AppState.selectedListing = listing;
      AppState.selectedOccasion = null;
      closeModal('modal-listing-detail');
      this.filterAndRender();
      EventBus.emit('selection-changed');
      showToast(`"${listing.title}" seçildi`, 'info');
    } catch (e) {
      showToast('Seçim hatası: ' + e.message, 'error');
    }
  }
};

/**
 * listing-form.js
 * Manuel ilan ekleme/düzenleme formu.
 * Tüm alanlar sahibinden.com ilan formuyla uyumlu.
 */

const ListingForm = {
  _editId: null,
  _images: [], // { path, base64 }

  init() {
    document.getElementById('btn-add-images').addEventListener('click', async () => {
      const paths = await window.api.pickImages();
      for (const p of paths) {
        const base64 = await window.api.imageToBase64(p);
        if (base64) {
          this._images.push({ path: p, base64 });
        }
      }
      this.renderImagePreviews();
    });

    document.getElementById('btn-save-listing').addEventListener('click', () => this.save());
    document.getElementById('btn-cancel-listing').addEventListener('click', () => closeModal('modal-listing-form'));
  },

  openNew() {
    this._editId = null;
    this._images = [];
    document.getElementById('listing-form-title').textContent = 'Yeni İlan Ekle';
    this.clearForm();
    this.renderImagePreviews();
    openModal('modal-listing-form');
  },

  async openEdit(id) {
    let listing;
    try {
      listing = await window.api.getListing(id);
    } catch (e) {
      showToast('İlan yüklenemedi', 'error');
      return;
    }
    if (!listing) return;

    this._editId = id;
    this._images = [];
    document.getElementById('listing-form-title').textContent = 'İlanı Düzenle';

    // Form alanlarını doldur
    document.getElementById('lf-title').value = listing.title || '';
    document.getElementById('lf-listing-type').value = listing.listing_type || 'satilik';
    document.getElementById('lf-property-type').value = listing.property_type || '';
    document.getElementById('lf-price').value = listing.price || '';
    document.getElementById('lf-room-count').value = listing.room_count || '';
    document.getElementById('lf-area').value = listing.area_m2 || '';
    document.getElementById('lf-gross-area').value = listing.gross_area_m2 || '';
    document.getElementById('lf-floor').value = listing.floor_number || '';
    document.getElementById('lf-total-floors').value = listing.total_floors || '';
    document.getElementById('lf-building-age').value = listing.building_age || '';
    document.getElementById('lf-bathroom').value = listing.bathroom_count || '';
    document.getElementById('lf-heating').value = listing.heating_type || '';
    document.getElementById('lf-facing').value = listing.facing || '';
    document.getElementById('lf-city').value = listing.city || '';
    document.getElementById('lf-district').value = listing.district || '';
    document.getElementById('lf-neighborhood').value = listing.neighborhood || '';
    document.getElementById('lf-address').value = listing.address || '';
    document.getElementById('lf-description').value = listing.description || '';
    document.getElementById('lf-balcony').checked = !!listing.has_balcony;
    document.getElementById('lf-elevator').checked = !!listing.has_elevator;
    document.getElementById('lf-parking').checked = !!listing.has_parking;
    document.getElementById('lf-furnished').checked = !!listing.has_furnished;
    document.getElementById('lf-complex').checked = !!listing.is_in_complex;
    document.getElementById('lf-swap').checked = !!listing.is_swap;
    document.getElementById('lf-credit').checked = !!listing.is_credit_eligible;

    // Mevcut resimleri yükle
    if (listing.images) {
      for (const img of listing.images) {
        if (img.local_path) {
          const base64 = await window.api.imageToBase64(img.local_path);
          if (base64) {
            this._images.push({ path: img.local_path, base64 });
          }
        }
      }
    }
    this.renderImagePreviews();

    openModal('modal-listing-form');
  },

  clearForm() {
    const textFields = ['lf-title', 'lf-price', 'lf-area', 'lf-gross-area', 'lf-floor',
      'lf-total-floors', 'lf-building-age', 'lf-bathroom', 'lf-city', 'lf-district',
      'lf-neighborhood', 'lf-address', 'lf-description'];
    textFields.forEach(id => document.getElementById(id).value = '');

    document.getElementById('lf-listing-type').value = 'satilik';
    document.getElementById('lf-property-type').value = '';
    document.getElementById('lf-room-count').value = '';
    document.getElementById('lf-heating').value = '';
    document.getElementById('lf-facing').value = '';

    ['lf-balcony', 'lf-elevator', 'lf-parking', 'lf-furnished', 'lf-complex', 'lf-swap', 'lf-credit']
      .forEach(id => document.getElementById(id).checked = false);
  },

  renderImagePreviews() {
    const container = document.getElementById('lf-images-preview');
    container.innerHTML = this._images.map((img, i) => `
      <div class="img-thumb">
        <img src="${img.base64}" alt="">
        <button class="remove-img" data-index="${i}">&times;</button>
      </div>
    `).join('');

    container.querySelectorAll('.remove-img').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._images.splice(parseInt(btn.dataset.index), 1);
        this.renderImagePreviews();
      });
    });
  },

  async save() {
    const title = document.getElementById('lf-title').value.trim();
    if (!title) {
      showToast('İlan başlığı gerekli', 'error');
      return;
    }

    const listing = {
      id: this._editId || null, // null, undefined değil — sql.js uyumlu
      source: 'manual',
      title,
      description: document.getElementById('lf-description').value || '',
      price: parseFloat(document.getElementById('lf-price').value) || null,
      listing_type: document.getElementById('lf-listing-type').value || 'satilik',
      property_type: document.getElementById('lf-property-type').value || '',
      room_count: document.getElementById('lf-room-count').value || '',
      area_m2: parseFloat(document.getElementById('lf-area').value) || null,
      gross_area_m2: parseFloat(document.getElementById('lf-gross-area').value) || null,
      floor_number: parseInt(document.getElementById('lf-floor').value) || null,
      total_floors: parseInt(document.getElementById('lf-total-floors').value) || null,
      building_age: parseInt(document.getElementById('lf-building-age').value) || null,
      heating_type: document.getElementById('lf-heating').value || '',
      bathroom_count: parseInt(document.getElementById('lf-bathroom').value) || null,
      facing: document.getElementById('lf-facing').value || '',
      city: document.getElementById('lf-city').value || '',
      district: document.getElementById('lf-district').value || '',
      neighborhood: document.getElementById('lf-neighborhood').value || '',
      address: document.getElementById('lf-address').value || '',
      listing_date: '', // Boş string — sql.js undefined hatası önlenir
      has_balcony: document.getElementById('lf-balcony').checked,
      has_elevator: document.getElementById('lf-elevator').checked,
      has_parking: document.getElementById('lf-parking').checked,
      has_furnished: document.getElementById('lf-furnished').checked,
      is_in_complex: document.getElementById('lf-complex').checked,
      is_swap: document.getElementById('lf-swap').checked,
      is_credit_eligible: document.getElementById('lf-credit').checked,
      images: this._images.map(img => ({ local_path: img.path, image_url: '' })),
    };

    try {
      await window.api.saveListing(listing);
      closeModal('modal-listing-form');
      await ListingPanel.loadListings();
      showToast(this._editId ? 'İlan güncellendi' : 'İlan eklendi', 'success');
    } catch (e) {
      showToast('Kayıt hatası: ' + (e.message || 'Bilinmeyen hata'), 'error', 5000);
      console.error('İlan kayıt hatası:', e);
      // Modal kapanmaz — kullanıcı tekrar deneyebilir
    }
  }
};

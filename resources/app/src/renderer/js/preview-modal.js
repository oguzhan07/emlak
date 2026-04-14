const PreviewModule = {
  _currentBuffer: null,
  _currentName: '',

  init() {
    document.getElementById('btn-download').addEventListener('click', () => this.download());
    document.getElementById('btn-regenerate').addEventListener('click', () => {
      if (AppState.selectedOccasion) {
        this.generateOccasion(AppState.selectedOccasion);
      } else if (AppState.selectedTemplate && AppState.selectedListing) {
        this.generateListing(AppState.selectedTemplate, AppState.selectedListing);
      }
    });
  },

  async generateListing(template, listing) {
    openModal('modal-preview');
    document.getElementById('preview-container').classList.add('hidden');
    document.getElementById('preview-loading').classList.remove('hidden');

    try {
      // Prepare template data
      const profile = AppState.profile || {};
      const images = listing.images || [];

      // Convert images to base64
      const imageBase64 = [];
      for (const img of images) {
        if (img.local_path) {
          const b64 = await window.api.imageToBase64(img.local_path);
          if (b64) imageBase64.push(b64);
        }
      }

      // Profile photo
      let profilePhoto = getPlaceholderAvatar();
      if (profile.photo_path) {
        profilePhoto = await window.api.imageToBase64(profile.photo_path) || profilePhoto;
      }

      // Logo
      const logoPath = AppState.assetsPath.replace(/\\/g, '/') + '/logo/logo_white_transparent.png';
      const logoBase64 = await window.api.imageToBase64(logoPath.replace(/\//g, '\\'));
      const logoNavyPath = AppState.assetsPath.replace(/\\/g, '/') + '/logo/logo_navy_on_white.png';
      const logoNavyBase64 = await window.api.imageToBase64(logoNavyPath.replace(/\//g, '\\'));

      // Features list
      const features = [];
      if (listing.room_count) features.push(listing.room_count);
      if (listing.area_m2) features.push(listing.area_m2 + ' m²');
      if (listing.floor_number != null) features.push(listing.floor_number + '. Kat');
      if (listing.bathroom_count) features.push(listing.bathroom_count + ' Banyo');
      if (listing.has_balcony) features.push('Balkon');
      if (listing.has_elevator) features.push('Asansör');
      if (listing.has_parking) features.push('Otopark');
      if (listing.is_in_complex) features.push('Site İçi');
      if (listing.heating_type) features.push(listing.heating_type);

      const data = {
        // Listing data
        title: listing.title || '',
        price: formatPrice(listing.price, listing.currency),
        priceRaw: listing.price,
        listingType: listing.listing_type === 'kiralik' ? 'KİRALIK' : 'SATILIK',
        propertyType: listing.property_type || '',
        roomCount: listing.room_count || '',
        area: listing.area_m2 ? listing.area_m2 + ' m²' : '',
        grossArea: listing.gross_area_m2 ? listing.gross_area_m2 + ' m²' : '',
        floor: listing.floor_number != null ? listing.floor_number + '. Kat' : '',
        buildingAge: listing.building_age != null ? listing.building_age + ' Yaşında' : '',
        heating: listing.heating_type || '',
        bathroom: listing.bathroom_count ? listing.bathroom_count + ' Banyo' : '',
        location: [listing.neighborhood, listing.district, listing.city].filter(Boolean).join(', '),
        city: listing.city || '',
        district: listing.district || '',
        neighborhood: listing.neighborhood || '',
        description: listing.description || '',
        features,

        // Images
        images: imageBase64,
        primaryImage: imageBase64[0] || getPlaceholderImage(),

        // Profile data
        agentName: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
        agentPhone: profile.phone || '',
        agentPhoto: profilePhoto,
        agentEmail: profile.email || '',
        agentInstagram: profile.instagram || '',
        agentFacebook: profile.facebook || '',
        agentAddress: profile.address || '',
        agentWebsite: profile.website || '',

        // Brand
        logo: logoBase64 || '',
        logoNavy: logoNavyBase64 || '',
      };

      const templatePath = AppState.templatesPath.replace(/\\/g, '/') + '/' + template.file;

      const buffer = await window.api.generateImage({
        templatePath: templatePath.replace(/\//g, '\\'),
        data,
        width: template.width,
        height: template.height,
      });

      this._currentBuffer = buffer;
      this._currentName = `${listing.title || 'ilan'}_${template.id}.png`;

      const blob = new Blob([buffer], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      document.getElementById('preview-image').src = url;
      document.getElementById('preview-container').classList.remove('hidden');
      document.getElementById('preview-loading').classList.add('hidden');
    } catch (e) {
      document.getElementById('preview-loading').classList.add('hidden');
      showToast('Görsel üretim hatası: ' + e.message, 'error');
      console.error(e);
    }
  },

  async generateOccasion(occasion) {
    openModal('modal-preview');
    document.getElementById('preview-container').classList.add('hidden');
    document.getElementById('preview-loading').classList.remove('hidden');

    try {
      const profile = AppState.profile || {};

      let profilePhoto = getPlaceholderAvatar();
      if (profile.photo_path) {
        profilePhoto = await window.api.imageToBase64(profile.photo_path) || profilePhoto;
      }

      const logoPath = AppState.assetsPath + '\\logo\\logo_white_transparent.png';
      const logoBase64 = await window.api.imageToBase64(logoPath);
      const logoNavyPath = AppState.assetsPath + '\\logo\\logo_navy_on_white.png';
      const logoNavyBase64 = await window.api.imageToBase64(logoNavyPath);

      const data = {
        occasionName: occasion.name,
        occasionId: occasion.id,
        agentName: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
        agentPhone: profile.phone || '',
        agentPhoto: profilePhoto,
        agentInstagram: profile.instagram || '',
        agentFacebook: profile.facebook || '',
        agentAddress: profile.address || '',
        agentWebsite: profile.website || '',
        logo: logoBase64 || '',
        logoNavy: logoNavyBase64 || '',
      };

      const templatePath = AppState.templatesPath + '\\' + occasion.file;

      const buffer = await window.api.generateImage({
        templatePath,
        data,
        width: 1080,
        height: 1080,
      });

      this._currentBuffer = buffer;
      this._currentName = `${occasion.name.replace(/\s+/g, '_')}.png`;

      const blob = new Blob([buffer], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      document.getElementById('preview-image').src = url;
      document.getElementById('preview-container').classList.remove('hidden');
      document.getElementById('preview-loading').classList.add('hidden');
    } catch (e) {
      document.getElementById('preview-loading').classList.add('hidden');
      showToast('Görsel üretim hatası: ' + e.message, 'error');
      console.error(e);
    }
  },

  async download() {
    if (!this._currentBuffer) return;
    const path = await window.api.saveImage({
      buffer: this._currentBuffer,
      defaultName: this._currentName,
    });
    if (path) {
      showToast('Görsel kaydedildi: ' + path, 'success', 4000);
    }
  }
};

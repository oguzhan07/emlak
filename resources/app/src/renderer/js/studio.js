/**
 * studio.js
 * Sürükle - Bırak (Canva tipi) Şablon Motoru ve Stüdyo Yöneticisi
 * Tam editör deneyimi: zoom, döndürme, flip, fit modu, sayısal giriş, köşe tutamaçları
 */

const StudioManager = {
  currentListing: null,
  templates: [],
  templateCatalog: [],
  _activeCategory: null, // null = tümü
  activeTemplateBase64: null,

  // Editor state
  _imageState: { zoom: 100, rotation: 0, flipX: false, flipY: false, fitMode: 'cover', x: 100, y: 100, w: 600, h: 400 },
  _dragCleanup: null,
  _resizeCleanup: null,
  _selectedDraggable: null,

  init() {
    document.getElementById('btn-studio-delete').addEventListener('click', () => this.deleteListing());
    document.getElementById('btn-studio-edit').addEventListener('click', () => this.editListing());
    document.getElementById('btn-editor-cancel').addEventListener('click', () => closeModal('modal-editor'));

    // Kategori butonları (Tümü, Kare, Dikey, Story, Yatay)
    document.querySelectorAll('.studio-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;

        // "all" veya aynı butona tekrar tıklanırsa filtreyi kaldır
        if (cat === 'all' || this._activeCategory === cat) {
          this._activeCategory = null;
        } else {
          this._activeCategory = cat;
        }

        // Active class güncelle
        document.querySelectorAll('.studio-cat-btn').forEach(b => b.classList.remove('active'));
        if (this._activeCategory) {
          btn.classList.add('active');
        } else {
          // Tümü butonunu aktif yap
          const allBtn = document.querySelector('.studio-cat-btn[data-cat="all"]');
          if (allBtn) allBtn.classList.add('active');
        }

        this.renderTemplates();
      });
    });
  },

  async deleteListing() {
    if (!this.currentListing) return;
    try {
      await window.api.deleteListing(this.currentListing.id);
      closeModal('modal-studio');
      if (AppState.selectedListing && AppState.selectedListing.id === this.currentListing.id) {
        AppState.selectedListing = null;
        EventBus.emit('selection-changed');
      }
      await ListingPanel.loadListings();
      showToast('İlan silindi', 'success');
    } catch (e) {
      showToast('Silme hatası: ' + e.message, 'error');
    }
  },

  editListing() {
    if (!this.currentListing) return;
    closeModal('modal-studio');
    ListingForm.openEdit(this.currentListing.id);
  },

  async open(listingId) {
    try {
      this.currentListing = await window.api.getListing(listingId);
    } catch (e) {
      console.error('İlan yükleme hatası:', e);
      showToast('İlan yüklenemedi: ' + (e.message || ''), 'error');
      return;
    }

    if (!this.currentListing) {
      showToast('İlan bulunamadı', 'error');
      return;
    }

    // --- Sol Panel (İlan Detayları) ---
    document.getElementById('studio-listing-name').textContent = this.currentListing.title || 'İsimsiz İlan';
    document.getElementById('studio-listing-price').textContent = formatPrice(this.currentListing.price, this.currentListing.currency);

    const featuresDiv = document.getElementById('studio-listing-features');
    if (featuresDiv) {
      const fList = [
        ['İlan Türü', this.currentListing.listing_type === 'kiralik' ? 'Kiralık' : 'Satılık'],
        ['Emlak Tipi', this.currentListing.property_type],
        ['Oda Sayısı', this.currentListing.room_count],
        ['Net m²', formatArea(this.currentListing.area_m2)],
        ['Brüt m²', formatArea(this.currentListing.gross_area_m2)],
        ['Kat', this.currentListing.floor_number != null ? `${this.currentListing.floor_number} / ${this.currentListing.total_floors||'?'}` : ''],
        ['Bina Yaşı', this.currentListing.building_age != null ? this.currentListing.building_age + ' Yaşında' : ''],
        ['Banyo', this.currentListing.bathroom_count],
        ['Isınma', this.currentListing.heating_type],
        ['Cephe', this.currentListing.facing],
        ['İl / İlçe', `${this.currentListing.city || ''} ${this.currentListing.district ? '/ '+this.currentListing.district : ''}`.trim()],
        ['Mahalle', this.currentListing.neighborhood],
        ['Balkon', this.currentListing.has_balcony ? 'Var' : ''],
        ['Asansör', this.currentListing.has_elevator ? 'Var' : ''],
        ['Otopark', this.currentListing.has_parking ? 'Var' : ''],
        ['Eşyalı', this.currentListing.has_furnished ? 'Evet' : ''],
        ['Site İçi', this.currentListing.is_in_complex ? 'Evet' : ''],
        ['Kaynak', this.currentListing.source === 'manual' ? 'Manuel' : this.currentListing.source],
      ].filter(([, v]) => v && v !== '0' && v !== 'null' && v !== '/' && v !== '');

      featuresDiv.innerHTML = fList.map(([l, v]) => `
        <div class="studio-feature-item">
          <span class="label">${l}</span>
          <span class="value">${v}</span>
        </div>
      `).join('');
    }

    // --- Kapak Fotoğrafı ---
    let heroSrc = getPlaceholderImage();
    try {
      if (this.currentListing.images && this.currentListing.images.length > 0) {
        const firstImg = this.currentListing.images[0];
        if (firstImg.local_path) {
           heroSrc = await window.api.imageToBase64(firstImg.local_path) || getPlaceholderImage();
        } else {
           heroSrc = firstImg.image_url || getPlaceholderImage();
        }
      }
    } catch (e) {
      console.error('Kapak fotoğrafı yükleme hatası:', e);
    }
    document.getElementById('studio-listing-image').src = heroSrc;
    this.currentListing._heroImageSrc = heroSrc;

    // --- Şablon Önizlemeleri ve Katalog Yükleme ---
    try {
      if (this.templates.length === 0) {
        this.templates = await window.api.listTemplates();
      }
    } catch (e) {
      console.error('Şablon listesi yükleme hatası:', e);
      this.templates = [];
    }

    try {
      if (this.templateCatalog.length === 0) {
        this.templateCatalog = await window.api.getTemplateCatalog();
      }
    } catch (e) {
      console.error('Katalog yükleme hatası:', e);
      this.templateCatalog = [];
    }

    // *** Modal'ı her durumda aç ***
    openModal('modal-studio');
    this.renderTemplates();
  },

  _getCategoryForTemplate(templatePath) {
    // Dosya adına göre katalogdan kategori bul
    const fileName = templatePath.replace(/\\/g, '/').split('/').pop();
    const entry = this.templateCatalog.find(e => e.file === fileName);
    return entry ? entry.category : '';
  },

  async renderTemplates() {
    const grid = document.getElementById('studio-templates-grid');
    if (this.templates.length === 0) {
       grid.innerHTML = '<div style="color:var(--text-tertiary); padding:20px;">Özgü-Görseller bulunamadı. Lütfen "win-unpacked/özgü-görseller" klasörünü kontrol edin.</div>';
       return;
    }

    // Kategori filtresi uygula
    let filtered = this.templates;
    if (this._activeCategory) {
      const catMap = { kare: 'Kare', dikey: 'Dikey', story: 'Story', yatay: 'Yatay' };
      const targetCat = catMap[this._activeCategory] || '';
      filtered = this.templates.filter(tpath => {
        const cat = this._getCategoryForTemplate(tpath);
        return cat === targetCat;
      });
    }

    if (filtered.length === 0) {
      grid.innerHTML = '<div style="color:var(--text-tertiary); padding:20px; text-align:center;">Bu kategoride şablon bulunamadı.</div>';
      return;
    }

    grid.innerHTML = '<div class="spinner"></div>';

    let html = '';
    for (let i = 0; i < filtered.length; i++) {
        let localPath = filtered[i].replace(/\\/g, '\\\\');
        html += `
          <div class="studio-template-card" data-tpath="${localPath}" data-idx="${i}">
            <div class="studio-card-thumb" style="width:100%; height:140px; display:flex; align-items:center; justify-content:center; color:var(--navy); background:var(--bg-sunken);">
               <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
            </div>
          </div>
        `;
    }
    grid.innerHTML = html;

    // Önizleme panelini temizle
    this._resetPreviewPanel();

    // Her kart için: tıklama → editör, hover → önizleme
    grid.querySelectorAll('.studio-template-card').forEach(card => {
      card.addEventListener('click', () => {
        StudioManager.openEditor(card.dataset.tpath);
      });
      card.addEventListener('mouseenter', () => {
        // Aktif previewing sınıfı
        grid.querySelectorAll('.studio-template-card').forEach(c => c.classList.remove('previewing'));
        card.classList.add('previewing');
        // b64 cache varsa göster, yoksa yükle
        const idx = parseInt(card.dataset.idx);
        const cachedB64 = card.dataset.b64;
        if (cachedB64) {
          this._showPreview(cachedB64);
        }
      });
      card.addEventListener('mouseleave', () => {
        card.classList.remove('previewing');
      });
    });

    // Görselleri async olarak yükle (5'erli batch) + cache + preview güncelle
    const batchSize = 5;
    for (let i = 0; i < filtered.length; i += batchSize) {
      const batch = filtered.slice(i, i + batchSize);
      await Promise.all(batch.map(async (tpath, batchIdx) => {
        const globalIdx = i + batchIdx;
        try {
          const b64 = await window.api.imageToBase64(tpath);
          const card = grid.querySelector(`.studio-template-card[data-idx="${globalIdx}"]`);
          if (card) {
            const thumb = card.querySelector('.studio-card-thumb');
            if (thumb) {
              thumb.innerHTML = '';
              thumb.style.background = `url('${b64}') center/cover no-repeat`;
            }
            card.dataset.b64 = b64;
            // Eğer bu kart şu an hover ediliyorsa preview'ı güncelle
            if (card.classList.contains('previewing')) {
              this._showPreview(b64);
            }
          }
        } catch(e) {}
      }));
    }
  },

  _resetPreviewPanel() {
    const wrap = document.getElementById('studio-preview-wrap');
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="studio-preview-placeholder">
        <svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <path d="M21 15l-5-5L5 21"/>
        </svg>
        <p>Şablonun üzerine gelin</p>
      </div>
    `;
  },

  _showPreview(b64src) {
    const wrap = document.getElementById('studio-preview-wrap');
    if (!wrap) return;
    // Eğer zaten img varsa src güncelle, yoksa oluştur
    let img = wrap.querySelector('img');
    if (!img) {
      wrap.innerHTML = '';
      img = document.createElement('img');
      wrap.appendChild(img);
    }
    img.src = b64src;
  },

  // ═══════════════════════════════════════════════════════════════
  // EDITOR
  // ═══════════════════════════════════════════════════════════════

  _resetImageState() {
    this._imageState = { zoom: 100, rotation: 0, flipX: false, flipY: false, fitMode: 'cover', x: 100, y: 100, w: 600, h: 400 };
  },

  _updateImageTransform() {
    const s = this._imageState;
    const edImg = document.querySelector('.editor-listing-image');
    if (!edImg) return;

    const scaleVal = s.zoom / 100;
    const flipXVal = s.flipX ? -1 : 1;
    const flipYVal = s.flipY ? -1 : 1;
    edImg.style.transform = `scale(${scaleVal * flipXVal}, ${scaleVal * flipYVal}) rotate(${s.rotation}deg)`;
    edImg.style.objectFit = s.fitMode;
  },

  _updateImageContainer() {
    const s = this._imageState;
    const imgBox = document.getElementById('editor-image-box');
    if (!imgBox) return;
    imgBox.style.left = s.x + 'px';
    imgBox.style.top = s.y + 'px';
    imgBox.style.width = s.w + 'px';
    imgBox.style.height = s.h + 'px';
  },

  _syncSidebarFromState() {
    const s = this._imageState;
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

    setVal('ec-zoom', s.zoom);
    setTxt('ec-zoom-val', s.zoom + '%');
    setVal('ec-rotation', s.rotation);
    setTxt('ec-rotation-val', s.rotation + '°');
    setVal('ec-pos-x', Math.round(s.x));
    setVal('ec-pos-y', Math.round(s.y));
    setVal('ec-width', Math.round(s.w));
    setVal('ec-height', Math.round(s.h));

    // Fit mode buttons
    document.querySelectorAll('.ec-fit-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.fit === s.fitMode);
    });
  },

  _bindSidebarControls() {
    const self = this;
    const s = () => self._imageState;

    // Zoom slider
    const zoomSlider = document.getElementById('ec-zoom');
    if (zoomSlider) {
      zoomSlider.addEventListener('input', () => {
        s().zoom = parseInt(zoomSlider.value);
        self._updateImageTransform();
        self._syncSidebarFromState();
      });
    }

    // Rotation slider
    const rotSlider = document.getElementById('ec-rotation');
    if (rotSlider) {
      rotSlider.addEventListener('input', () => {
        s().rotation = parseInt(rotSlider.value);
        self._updateImageTransform();
        self._syncSidebarFromState();
      });
    }

    // Rotate buttons
    document.getElementById('ec-rotate-left')?.addEventListener('click', () => {
      s().rotation = ((s().rotation - 90) + 360) % 360;
      if (s().rotation > 180) s().rotation -= 360;
      self._updateImageTransform();
      self._syncSidebarFromState();
    });
    document.getElementById('ec-rotate-right')?.addEventListener('click', () => {
      s().rotation = (s().rotation + 90) % 360;
      if (s().rotation > 180) s().rotation -= 360;
      self._updateImageTransform();
      self._syncSidebarFromState();
    });

    // Flip buttons
    document.getElementById('ec-flip-x')?.addEventListener('click', () => {
      s().flipX = !s().flipX;
      self._updateImageTransform();
    });
    document.getElementById('ec-flip-y')?.addEventListener('click', () => {
      s().flipY = !s().flipY;
      self._updateImageTransform();
    });

    // Fit mode buttons
    document.querySelectorAll('.ec-fit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        s().fitMode = btn.dataset.fit;
        self._updateImageTransform();
        self._syncSidebarFromState();
      });
    });

    // Position/size numeric inputs
    const numInputHandler = (id, prop) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        const val = parseInt(el.value);
        if (!isNaN(val)) {
          s()[prop] = val;
          self._updateImageContainer();
        }
      });
    };
    numInputHandler('ec-pos-x', 'x');
    numInputHandler('ec-pos-y', 'y');
    numInputHandler('ec-width', 'w');
    numInputHandler('ec-height', 'h');

    // Reset all
    document.getElementById('ec-reset-all')?.addEventListener('click', () => {
      self._resetImageState();
      self._updateImageTransform();
      self._updateImageContainer();
      self._syncSidebarFromState();
    });

    // Mouse wheel zoom on image container
    const imgBox = document.getElementById('editor-image-box');
    if (imgBox) {
      imgBox.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY < 0 ? 10 : -10;
        s().zoom = Math.max(50, Math.min(300, s().zoom + delta));
        self._updateImageTransform();
        self._syncSidebarFromState();
      }, { passive: false });

      // Double click to cycle fit modes
      imgBox.addEventListener('dblclick', (e) => {
        if (e.target.closest('span[contenteditable="true"]')) return;
        const modes = ['cover', 'contain', 'fill'];
        const idx = modes.indexOf(s().fitMode);
        s().fitMode = modes[(idx + 1) % modes.length];
        self._updateImageTransform();
        self._syncSidebarFromState();
        showToast('Sığdırma: ' + s().fitMode, 'info', 1000);
      });
    }
  },

  async openEditor(templatePath) {
    showToast('Editör yükleniyor...', 'info', 1000);
    openModal('modal-editor');
    const container = document.getElementById('editor-canvas-container');
    container.innerHTML = '<div class="spinner"></div>';

    // Clean up previous listeners
    if (this._dragCleanup) { this._dragCleanup(); this._dragCleanup = null; }
    if (this._resizeCleanup) { this._resizeCleanup(); this._resizeCleanup = null; }

    this._resetImageState();

    const b64Template = await window.api.imageToBase64(templatePath);
    if(!b64Template) return showToast('Şablon okunamadı', 'error');

    const img = new Image();
    img.onload = () => {
        const nativeWidth = img.width;
        const nativeHeight = img.height;

        const viewportHeight = window.innerHeight * 0.72;
        const scale = viewportHeight / nativeHeight;

        container.style.width = (nativeWidth * scale) + 'px';
        container.style.height = (nativeHeight * scale) + 'px';

        const priceStr = formatPrice(this.currentListing.price, this.currentListing.currency);
        const titleStr = this.currentListing.title || '';
        const roomStr = this.currentListing.room_count || '1+1';
        const areaStr = this.currentListing.area_m2 ? this.currentListing.area_m2 + ' m\u00B2' : '';
        const locationStr = [this.currentListing.district, this.currentListing.city].filter(Boolean).join(', ');

        const s = this._imageState;

        container.innerHTML = `
          <div id="capture-area" style="width: ${nativeWidth}px; height: ${nativeHeight}px; position:absolute; top:0; left:0; transform-origin: top left; transform: scale(${scale}); background: url('${b64Template}') center/cover;">

             <!-- Image box with resize handles -->
             <div class="draggable" id="editor-image-box" style="position:absolute; left:${s.x}px; top:${s.y}px; width:${s.w}px; height:${s.h}px; overflow:hidden; border:2px dashed rgba(255,255,255,0.5);">
                <img class="editor-listing-image" src="${this.currentListing._heroImageSrc}" style="width:100%; height:100%; object-fit:${s.fitMode}; pointer-events:none; transform-origin:center; transform:scale(1);" />
                <!-- Resize handles -->
                <div class="resize-handle corner tl" data-handle="tl"></div>
                <div class="resize-handle corner tr" data-handle="tr"></div>
                <div class="resize-handle corner bl" data-handle="bl"></div>
                <div class="resize-handle corner br" data-handle="br"></div>
                <div class="resize-handle edge tm" data-handle="tm"></div>
                <div class="resize-handle edge bm" data-handle="bm"></div>
                <div class="resize-handle edge ml" data-handle="ml"></div>
                <div class="resize-handle edge mr" data-handle="mr"></div>
             </div>

             <!-- Drag: Fiyat -->
             <div class="draggable" style="position:absolute; left:100px; top:600px; color:#fff; font-size:60px; font-weight:900; background:rgba(0,0,0,0.5); padding:10px 20px; border-radius:10px;">
                <span contenteditable="true" style="outline:none;">${priceStr}</span>
             </div>

             <!-- Drag: Başlık -->
             <div class="draggable" style="position:absolute; left:100px; top:700px; color:#C5A355; font-size:40px; font-weight:bold; background:rgba(0,0,0,0.5); padding:10px 20px; border-radius:10px;">
                <span contenteditable="true" style="outline:none;">${titleStr}</span>
             </div>

             <!-- Drag: Oda -->
             <div class="draggable" style="position:absolute; left:100px; top:800px; color:#fff; font-size:40px; font-weight:bold; background:rgba(0,0,0,0.5); padding:10px 20px; border-radius:10px;">
                <span contenteditable="true" style="outline:none;">\u{1F6CF}\uFE0F</span> <span contenteditable="true" style="outline:none;">${roomStr}</span>
             </div>

             ${areaStr ? `
             <div class="draggable" style="position:absolute; left:100px; top:870px; color:#fff; font-size:36px; font-weight:bold; background:rgba(0,0,0,0.5); padding:10px 20px; border-radius:10px;">
                <span contenteditable="true" style="outline:none;">\u{1F4D0}</span> <span contenteditable="true" style="outline:none;">${areaStr}</span>
             </div>` : ''}

             ${locationStr ? `
             <div class="draggable" style="position:absolute; left:100px; top:940px; color:#fff; font-size:36px; font-weight:bold; background:rgba(0,0,0,0.5); padding:10px 20px; border-radius:10px;">
                <span contenteditable="true" style="outline:none;">\u{1F4CD}</span> <span contenteditable="true" style="outline:none;">${locationStr}</span>
             </div>` : ''}

          </div>
        `;

        // Setup drag, resize, sidebar
        this.makeDraggable();
        this.makeResizable();
        this._bindSidebarControls();
        this._syncSidebarFromState();

        document.getElementById('btn-editor-download').onclick = () => this.downloadImage();
    };
    img.src = b64Template;
  },

  // ═══ DRAG SYSTEM ═══
  makeDraggable() {
    let activeElement = null;
    let initialX, initialY, xOffset, yOffset;
    const self = this;

    const captureArea = document.getElementById('capture-area');
    if (!captureArea) return;

    function getScale() {
      const m = captureArea.style.transform.match(/scale\(([^)]+)\)/);
      return m ? parseFloat(m[1]) : 1;
    }

    function dragStart(e) {
      // Skip resize handles, controls, editable spans
      if (e.target.closest('.resize-handle')) return;
      if (e.target.closest('span[contenteditable="true"]')) return;

      const draggable = e.target.closest('.draggable');
      if (!draggable) return;

      activeElement = draggable;
      const scale = getScale();

      xOffset = parseFloat(activeElement.style.left) || 0;
      yOffset = parseFloat(activeElement.style.top) || 0;
      initialX = e.clientX / scale - xOffset;
      initialY = e.clientY / scale - yOffset;
      activeElement.style.cursor = 'grabbing';
    }

    function drag(e) {
      if (!activeElement) return;
      e.preventDefault();
      const scale = getScale();
      const newX = e.clientX / scale - initialX;
      const newY = e.clientY / scale - initialY;
      activeElement.style.left = newX + 'px';
      activeElement.style.top = newY + 'px';

      // Sync sidebar if this is the image box
      if (activeElement.id === 'editor-image-box') {
        self._imageState.x = newX;
        self._imageState.y = newY;
        self._syncSidebarFromState();
      }
    }

    function dragEnd() {
      if (activeElement) activeElement.style.cursor = 'grab';
      activeElement = null;
    }

    captureArea.addEventListener('mousedown', dragStart, false);
    document.addEventListener('mousemove', drag, false);
    document.addEventListener('mouseup', dragEnd, false);

    this._dragCleanup = () => {
      document.removeEventListener('mousemove', drag, false);
      document.removeEventListener('mouseup', dragEnd, false);
    };
  },

  // ═══ RESIZE SYSTEM (Corner/Edge Handles) ═══
  makeResizable() {
    const self = this;
    let activeHandle = null;
    let startX, startY, startLeft, startTop, startW, startH, shiftHeld;

    const captureArea = document.getElementById('capture-area');
    if (!captureArea) return;

    function getScale() {
      const m = captureArea.style.transform.match(/scale\(([^)]+)\)/);
      return m ? parseFloat(m[1]) : 1;
    }

    function handleDown(e) {
      const handle = e.target.closest('.resize-handle');
      if (!handle) return;
      e.stopPropagation();
      e.preventDefault();

      activeHandle = handle.dataset.handle;
      const imgBox = document.getElementById('editor-image-box');
      if (!imgBox) return;

      const scale = getScale();
      startX = e.clientX / scale;
      startY = e.clientY / scale;
      startLeft = parseFloat(imgBox.style.left) || 0;
      startTop = parseFloat(imgBox.style.top) || 0;
      startW = parseFloat(imgBox.style.width) || 600;
      startH = parseFloat(imgBox.style.height) || 400;
      shiftHeld = e.shiftKey;
    }

    function handleMove(e) {
      if (!activeHandle) return;
      e.preventDefault();

      const imgBox = document.getElementById('editor-image-box');
      if (!imgBox) return;

      const scale = getScale();
      const dx = e.clientX / scale - startX;
      const dy = e.clientY / scale - startY;
      const aspect = startW / startH;
      const shift = e.shiftKey;

      let newX = startLeft, newY = startTop, newW = startW, newH = startH;

      switch (activeHandle) {
        case 'br':
          newW = Math.max(50, startW + dx);
          newH = shift ? newW / aspect : Math.max(50, startH + dy);
          break;
        case 'bl':
          newW = Math.max(50, startW - dx);
          newH = shift ? newW / aspect : Math.max(50, startH + dy);
          newX = startLeft + (startW - newW);
          break;
        case 'tr':
          newW = Math.max(50, startW + dx);
          newH = shift ? newW / aspect : Math.max(50, startH - dy);
          newY = startTop + (startH - newH);
          break;
        case 'tl':
          newW = Math.max(50, startW - dx);
          newH = shift ? newW / aspect : Math.max(50, startH - dy);
          newX = startLeft + (startW - newW);
          newY = startTop + (startH - newH);
          break;
        case 'tm':
          newH = Math.max(50, startH - dy);
          newY = startTop + (startH - newH);
          break;
        case 'bm':
          newH = Math.max(50, startH + dy);
          break;
        case 'ml':
          newW = Math.max(50, startW - dx);
          newX = startLeft + (startW - newW);
          break;
        case 'mr':
          newW = Math.max(50, startW + dx);
          break;
      }

      imgBox.style.left = newX + 'px';
      imgBox.style.top = newY + 'px';
      imgBox.style.width = newW + 'px';
      imgBox.style.height = newH + 'px';

      self._imageState.x = newX;
      self._imageState.y = newY;
      self._imageState.w = newW;
      self._imageState.h = newH;
      self._syncSidebarFromState();
    }

    function handleUp() {
      activeHandle = null;
    }

    captureArea.addEventListener('mousedown', handleDown, true);
    document.addEventListener('mousemove', handleMove, false);
    document.addEventListener('mouseup', handleUp, false);

    this._resizeCleanup = () => {
      document.removeEventListener('mousemove', handleMove, false);
      document.removeEventListener('mouseup', handleUp, false);
    };
  },

  // ═══ DOWNLOAD ═══
  async downloadImage() {
    const captureArea = document.getElementById('capture-area');
    if (!captureArea || !window.html2canvas) {
        showToast('Kütüphane hatası!', 'error');
        return;
    }

    // Hide UI elements for clean capture
    const draggables = captureArea.querySelectorAll('.draggable');
    draggables.forEach(d => {
       d.style.resize = 'none';
       d.style.border = 'none';
    });
    const handles = captureArea.querySelectorAll('.resize-handle');
    handles.forEach(h => h.style.display = 'none');
    // Remove contenteditable outlines
    const editables = captureArea.querySelectorAll('[contenteditable="true"]');
    editables.forEach(el => el.style.outline = 'none');

    showToast('Yüksek kalitede çıktı alınıyor...', 'info');

    const oldTransform = captureArea.style.transform;
    captureArea.style.transform = 'scale(1)';

    try {
      const canvas = await window.html2canvas(captureArea, {
        useCORS: true,
        scale: 2,
        allowTaint: true,
        backgroundColor: null
      });

      const link = document.createElement('a');
      link.download = `ozgu-gorsel-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast('Görsel başarıyla indi!', 'success');
      closeModal('modal-editor');
    } catch(e) {
      showToast('Hata: ' + e.message, 'error');
    } finally {
      captureArea.style.transform = oldTransform;
      // Restore UI elements
      draggables.forEach(d => {
         if(d.querySelector('.editor-listing-image')) d.style.border = '2px dashed rgba(255,255,255,0.5)';
      });
      handles.forEach(h => h.style.display = '');
      editables.forEach(el => el.style.outline = '');
    }
  }
};

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Database - Profile
  getProfile: () => ipcRenderer.invoke('db:getProfile'),
  saveProfile: (profile) => ipcRenderer.invoke('db:saveProfile', profile),

  // Database - Listings
  getListings: (filters) => ipcRenderer.invoke('db:getListings', filters),
  getListing: (id) => ipcRenderer.invoke('db:getListing', id),
  saveListing: (listing) => ipcRenderer.invoke('db:saveListing', listing),
  deleteListing: (id) => ipcRenderer.invoke('db:deleteListing', id),
  getListingImages: (listingId) => ipcRenderer.invoke('db:getListingImages', listingId),

  // Authentication
  openLogin: (site) => ipcRenderer.invoke('auth:openLogin', site),
  checkAuthStatus: (site) => ipcRenderer.invoke('auth:checkStatus', site),

  // Scraping
  refreshListings: () => ipcRenderer.invoke('scraper:refresh'),

  // Image Generation
  generateImage: (opts) => ipcRenderer.invoke('generator:generate', opts),
  saveImage: (opts) => ipcRenderer.invoke('generator:save', opts),

  // File Operations
  pickImage: () => ipcRenderer.invoke('file:pickImage'),
  pickImages: () => ipcRenderer.invoke('file:pickImages'),
  imageToBase64: (path) => ipcRenderer.invoke('file:imageToBase64', path),
  getAssetsPath: () => ipcRenderer.invoke('file:getAssetsPath'),
  getTemplatesPath: () => ipcRenderer.invoke('file:getTemplatesPath'),
  listTemplates: () => ipcRenderer.invoke('file:listTemplates'),
  getTemplateCatalog: () => ipcRenderer.invoke('file:getTemplateCatalog')
});

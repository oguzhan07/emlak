const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

let generatorWindow = null;

function getGeneratorWindow() {
  if (generatorWindow && !generatorWindow.isDestroyed()) {
    return generatorWindow;
  }

  generatorWindow = new BrowserWindow({
    show: false,
    width: 1080,
    height: 1080,
    webPreferences: {
      offscreen: true,
      contextIsolation: false,
      nodeIntegration: false,
    },
    frame: false,
    transparent: false,
    enableLargerThanScreen: true,
  });

  return generatorWindow;
}

async function generate(templatePath, data, width, height) {
  const win = getGeneratorWindow();

  // Resize to template dimensions
  win.setSize(width, height);
  win.webContents.setZoomFactor(1);

  // Read template HTML
  let html = fs.readFileSync(templatePath, 'utf-8');

  // Load template
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  // Inject data into template
  await win.webContents.executeJavaScript(`
    (function(data) {
      // Fill text fields
      document.querySelectorAll('[data-field]').forEach(el => {
        const field = el.getAttribute('data-field');
        if (data[field] !== undefined && data[field] !== null) {
          if (el.tagName === 'IMG') {
            el.src = data[field];
          } else if (el.style !== undefined && (field.includes('Image') || field.includes('image') || field.includes('Photo') || field.includes('photo'))) {
            el.style.backgroundImage = 'url(' + data[field] + ')';
          } else {
            el.textContent = data[field];
          }
        }
      });

      // Fill background images
      document.querySelectorAll('[data-bg]').forEach(el => {
        const field = el.getAttribute('data-bg');
        if (data[field]) {
          el.style.backgroundImage = 'url(' + data[field] + ')';
        }
      });

      // Handle visibility
      document.querySelectorAll('[data-show-if]').forEach(el => {
        const field = el.getAttribute('data-show-if');
        if (!data[field]) {
          el.style.display = 'none';
        }
      });

      // Handle feature lists
      const featureList = document.querySelector('[data-features]');
      if (featureList && data.features && Array.isArray(data.features)) {
        featureList.innerHTML = data.features.map(f =>
          '<div class="feature-item"><span class="feature-icon">✓</span> ' + f + '</div>'
        ).join('');
      }

      // Handle multiple images
      document.querySelectorAll('[data-image-index]').forEach(el => {
        const index = parseInt(el.getAttribute('data-image-index'));
        if (data.images && data.images[index]) {
          if (el.tagName === 'IMG') {
            el.src = data.images[index];
          } else {
            el.style.backgroundImage = 'url(' + data.images[index] + ')';
          }
        }
      });
    })(${JSON.stringify(data)});
  `);

  // Wait for images to load
  await win.webContents.executeJavaScript(`
    new Promise(resolve => {
      const images = document.querySelectorAll('img');
      const bgElements = document.querySelectorAll('[style*="background-image"]');
      if (images.length === 0 && bgElements.length === 0) return resolve();

      let loaded = 0;
      const total = images.length;
      if (total === 0) return resolve();

      const checkDone = () => { if (++loaded >= total) setTimeout(resolve, 200); };
      images.forEach(img => {
        if (img.complete) checkDone();
        else {
          img.onload = checkDone;
          img.onerror = checkDone;
        }
      });

      setTimeout(resolve, 5000); // Timeout after 5s
    });
  `);

  // Small delay for final rendering
  await new Promise(r => setTimeout(r, 300));

  // Capture at 2x for high quality
  const image = await win.webContents.capturePage({
    x: 0,
    y: 0,
    width: width,
    height: height,
  });

  return image.toPNG();
}

function cleanup() {
  if (generatorWindow && !generatorWindow.isDestroyed()) {
    generatorWindow.close();
    generatorWindow = null;
  }
}

module.exports = { generate, cleanup };

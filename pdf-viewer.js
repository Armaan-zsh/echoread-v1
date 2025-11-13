// --- PDF VIEWER v11.1 (WORKING + MINIMAL FEATURES) ---

// --- 1. GET UI ELEMENTS ---
let pdfDoc = null;
let currentPageNum = 1;
let totalPages = 0;
let tesseractWorker = null;
let ocrInitialized = false;
let loadedPages = new Set();
let isLoading = false;
let currentZoom = 1.0;

// --- PERSISTENT STATE VARIABLES ---
let isFontToggled = false;
let currentLineHeight = 1.6;
let currentLetterSpacing = 0;
let isEinkMode = false;
let isAmoledMode = false;
let currentContrast = 3;
let isFullscreen = false;
let isOcrMode = false;
let isPageRendering = false;

const pageNumDisplay = document.getElementById('page-num');
const ocrStatus = document.getElementById('ocr-status');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const pageInput = document.getElementById('page-input');
const scrollContainer = document.getElementById('pages-scroll-container');

// --- Get All Controls ---
const fontToggleBtn = document.getElementById('font-toggle-btn');
const einkToggleBtn = document.getElementById('eink-toggle-btn');
const amoledToggleBtn = document.getElementById('amoled-toggle-btn');
const lineHeightSlider = document.getElementById('line-height-slider');
const letterSpacingSlider = document.getElementById('letter-spacing-slider');
const contrastSlider = document.getElementById('contrast-slider');
const zoomInBtn = document.getElementById('zoom-in-btn');
const zoomOutBtn = document.getElementById('zoom-out-btn');
const zoomLevel = document.getElementById('zoom-level');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const viewModeBtn = document.getElementById('view-mode-btn');
const goBackBtn = document.getElementById('go-back-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const savePdfLibraryBtn = document.getElementById('save-pdf-library-btn');

const urlParams = new URLSearchParams(window.location.search);
let pdfUrl = urlParams.get('url');
if (pdfUrl) pdfUrl = decodeURIComponent(pdfUrl);

// --- 2. DEFINE FUNCTIONS ---

// Simple direct PDF loading (WORKING VERSION)
async function loadPdfDirect(fileUrl) {
  const response = await fetch(fileUrl);
  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  return pdfjsLib.getDocument(uint8Array).promise;
}

// Append page to scroll container (ORIGINAL WORKING VERSION)
async function appendPage(num) {
  if (loadedPages.has(num) || isLoading || num > totalPages) return;
  
  isLoading = true;
  loadedPages.add(num);
  
  try {
    ocrStatus.textContent = `Loading page ${num}...`;
    
    // Create page container
    const pageDiv = document.createElement('div');
    pageDiv.className = 'pdf-page';
    pageDiv.id = `page-${num}`;
    pageDiv.setAttribute('data-page', num);
    
    const page = await pdfDoc.getPage(num);
    const textContent = await page.getTextContent();
    let pageText = "";
    
    if (textContent && textContent.items.length > 0) {
      for (const item of textContent.items) {
        pageText += item.str + " ";
        if (item.hasEOL) { pageText += "<br>"; }
      }
    }

    if (pageText.trim().length < 50) { // SCANNED PDF
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const scale = 2.0 * currentZoom;
      const viewport = page.getViewport({ scale: scale });
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      canvas.style.maxWidth = '100%';
      canvas.style.height = 'auto';
      
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      pageDiv.appendChild(canvas);
      
      // OCR for scanned pages
      if (!ocrInitialized) {
        await initializeOcr();
      }
      
      if (ocrInitialized && tesseractWorker) {
        try {
          const { data: { text } } = await tesseractWorker.recognize(canvas);
          const textDiv = document.createElement('div');
          textDiv.className = 'textLayer ocr-text';
          textDiv.innerHTML = text.replace(/\n/g, '<br>');
          textDiv.style.display = 'none'; // Hidden by default
          pageDiv.appendChild(textDiv);
          
          // Apply persistent styles
          applyCurrentStyles(textDiv);
        } catch (ocrErr) {
          console.error('OCR recognition failed:', ocrErr);
        }
      }
    } else { // DIGITAL PDF
      const textDiv = document.createElement('div');
      textDiv.className = 'textLayer';
      textDiv.innerHTML = pageText;
      pageDiv.appendChild(textDiv);
      
      // Apply persistent styles
      applyCurrentStyles(textDiv);
    }
    
    scrollContainer.appendChild(pageDiv);
    ocrStatus.textContent = `Page ${num} loaded`;
    
  } catch (err) {
    console.error(`Error loading page ${num}:`, err);
    ocrStatus.textContent = `Error loading page ${num}`;
  }
  
  isLoading = false;
}

// Keep original renderPage for button navigation
async function renderPage(num) {
  // Prevent invalid page numbers or concurrent rendering
  if (num < 1 || num > totalPages || isPageRendering) return;
  
  isPageRendering = true;
  
  try {
    const pageElement = document.getElementById(`page-${num}`);
    if (pageElement) {
      pageElement.scrollIntoView({ behavior: 'smooth' });
      currentPageNum = num;
      pageNumDisplay.textContent = `Page ${currentPageNum} / ${totalPages}`;
    } else {
      // Load missing pages in sequence
      const missingPages = [];
      for (let i = 1; i <= num; i++) {
        if (!loadedPages.has(i)) {
          missingPages.push(i);
        }
      }
      
      // Load all missing pages
      for (const pageNum of missingPages) {
        await appendPage(pageNum);
      }
      
      // Now scroll to target page
      setTimeout(() => {
        const targetElement = document.getElementById(`page-${num}`);
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: 'smooth' });
          currentPageNum = num;
          pageNumDisplay.textContent = `Page ${currentPageNum} / ${totalPages}`;
        }
      }, 200);
    }
  } finally {
    isPageRendering = false;
  }
}

async function initializeOcr() {
  try {
    ocrStatus.textContent = "Loading OCR engine (one-time setup)...";
    
    if (!window.Tesseract) {
      throw new Error('Tesseract not loaded');
    }
    
    tesseractWorker = await window.Tesseract.createWorker();
    await tesseractWorker.loadLanguage('eng');
    await tesseractWorker.initialize('eng');
    ocrInitialized = true;
    ocrStatus.textContent = "OCR engine ready.";
  } catch (err) {
    console.error("OCR failed:", err);
    ocrInitialized = false;
    tesseractWorker = null;
    ocrStatus.textContent = "OCR unavailable. Showing images only.";
  }
}

// Setup scroll listener with throttling
function setupScrollListener() {
  let scrollTimeout;
  
  window.addEventListener('scroll', () => {
    // Clear previous timeout
    clearTimeout(scrollTimeout);
    
    // Set new timeout to prevent excessive calls
    scrollTimeout = setTimeout(() => {
      const scrollTop = window.pageYOffset;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      
      // Load next page when 80% scrolled (only if not already loading)
      if (!isLoading && scrollTop + windowHeight >= documentHeight * 0.8) {
        const nextPage = Math.max(...Array.from(loadedPages)) + 1;
        if (nextPage <= totalPages) {
          appendPage(nextPage);
        }
      }
      
      // Update current page based on visible page
      const pages = document.querySelectorAll('.pdf-page');
      for (const page of pages) {
        const rect = page.getBoundingClientRect();
        if (rect.top <= windowHeight / 2 && rect.bottom >= windowHeight / 2) {
          const pageNum = parseInt(page.getAttribute('data-page'));
          if (pageNum !== currentPageNum) {
            currentPageNum = pageNum;
            pageNumDisplay.textContent = `Page ${currentPageNum} / ${totalPages}`;
          }
          break;
        }
      }
    }, 100); // 100ms throttle
  });
}



// Apply persistent styles to any text element
function applyCurrentStyles(textElement) {
  textElement.style.fontSize = `${14 * currentZoom}px`;
  textElement.style.fontFamily = isFontToggled ? 'OpenDyslexic, sans-serif' : '';
  textElement.style.lineHeight = currentLineHeight;
  textElement.style.letterSpacing = `${currentLetterSpacing}px`;
}

// Apply styles to all existing text layers
function applyStylesToAllText() {
  const textLayers = document.querySelectorAll('.textLayer');
  textLayers.forEach(layer => applyCurrentStyles(layer));
}

// Simple view mode toggle
function toggleViewMode() {
  const canvases = document.querySelectorAll('canvas');
  const textLayers = document.querySelectorAll('.textLayer:not(.ocr-text)');
  const ocrTexts = document.querySelectorAll('.ocr-text');
  
  if (document.body.classList.contains('ocr-mode')) {
    // Switch to PDF mode
    canvases.forEach(canvas => canvas.style.display = 'block');
    textLayers.forEach(layer => layer.style.display = 'block');
    ocrTexts.forEach(ocr => ocr.style.display = 'none');
    viewModeBtn.textContent = 'OCR Mode';
    document.body.classList.remove('ocr-mode');
  } else {
    // Switch to OCR mode
    canvases.forEach(canvas => canvas.style.display = 'none');
    textLayers.forEach(layer => layer.style.display = 'none');
    ocrTexts.forEach(ocr => ocr.style.display = 'block');
    viewModeBtn.textContent = 'PDF Mode';
    document.body.classList.add('ocr-mode');
  }
}

// --- Accessibility Control Logic ---
function setupAccessibilityControls() {
    const pageContainer = document.getElementById('page-container');

    fontToggleBtn.addEventListener('click', () => {
        isFontToggled = !isFontToggled;
        fontToggleBtn.textContent = isFontToggled ? 'Normal Font' : 'Toggle Font';
        applyStylesToAllText();
    });
    
    einkToggleBtn.addEventListener('click', () => {
        document.body.classList.remove('amoled-mode');
        amoledToggleBtn.textContent = 'AMOLED Mode';
        
        document.body.classList.toggle('eink-mode');
        if (document.body.classList.contains('eink-mode')) {
            einkToggleBtn.textContent = 'Exit E Ink';
            document.body.className = document.body.className.replace(/contrast-\d/g, '');
            document.body.classList.add(`contrast-${contrastSlider.value}`);
        } else {
            einkToggleBtn.textContent = 'E Ink Mode';
            document.body.className = document.body.className.replace(/contrast-\d/g, '');
        }
    });
    
    amoledToggleBtn.addEventListener('click', () => {
        document.body.classList.remove('eink-mode');
        einkToggleBtn.textContent = 'E Ink Mode';
        
        document.body.classList.toggle('amoled-mode');
        if (document.body.classList.contains('amoled-mode')) {
            amoledToggleBtn.textContent = 'Exit AMOLED';
            document.body.className = document.body.className.replace(/contrast-\d/g, '');
            document.body.classList.add(`contrast-${contrastSlider.value}`);
        } else {
            amoledToggleBtn.textContent = 'AMOLED Mode';
            document.body.className = document.body.className.replace(/contrast-\d/g, '');
        }
    });

    lineHeightSlider.addEventListener('input', (e) => {
        currentLineHeight = e.target.value;
        applyStylesToAllText();
    });

    letterSpacingSlider.addEventListener('input', (e) => {
        currentLetterSpacing = e.target.value;
        applyStylesToAllText();
    });
    
    contrastSlider.addEventListener('input', (e) => {
        if (document.body.classList.contains('eink-mode') || document.body.classList.contains('amoled-mode')) {
            document.body.className = document.body.className.replace(/contrast-\d/g, '');
            document.body.classList.add(`contrast-${e.target.value}`);
        }
    });
    
    // Simple zoom controls
    zoomInBtn.addEventListener('click', () => {
        currentZoom = Math.min(currentZoom + 0.25, 3.0);
        zoomLevel.textContent = Math.round(currentZoom * 100) + '%';
        applyStylesToAllText();
    });
    
    zoomOutBtn.addEventListener('click', () => {
        currentZoom = Math.max(currentZoom - 0.25, 0.5);
        zoomLevel.textContent = Math.round(currentZoom * 100) + '%';
        applyStylesToAllText();
    });
    
    // Fullscreen toggle
    fullscreenBtn.addEventListener('click', () => {
        document.body.classList.toggle('fullscreen-mode');
        if (document.body.classList.contains('fullscreen-mode')) {
            fullscreenBtn.textContent = 'Exit Fullscreen';
        } else {
            fullscreenBtn.textContent = 'Fullscreen';
        }
    });
    
    // View mode toggle
    viewModeBtn.addEventListener('click', toggleViewMode);
    
    // Save to library
    savePdfLibraryBtn.addEventListener('click', () => {
        const title = document.title || 'PDF Document';
        const textLayers = document.querySelectorAll('.textLayer');
        let content = '';
        textLayers.forEach(layer => {
            content += layer.textContent + ' ';
        });
        
        const item = {
            id: Date.now(),
            title: title,
            url: pdfUrl,
            type: 'pdf',
            content: content.substring(0, 500) + '...',
            savedAt: new Date().toISOString()
        };
        
        chrome.storage.local.get(['echoread_library'], (result) => {
            const library = result.echoread_library || [];
            library.unshift(item);
            chrome.storage.local.set({ echoread_library: library }, () => {
                alert('PDF saved to library!');
            });
        });
    });
    
    // Go back to normal PDF viewer
    goBackBtn.addEventListener('click', () => {
        location.href = pdfUrl;
    });
    
    // Settings panel toggle
    settingsBtn.addEventListener('click', () => {
        settingsPanel.classList.toggle('settings-hidden');
    });
    
    // Close settings when clicking outside
    document.addEventListener('click', (e) => {
        if (!settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) {
            settingsPanel.classList.add('settings-hidden');
        }
    });
}

// --- 3. MAIN STARTUP FUNCTION ---
async function initializePdfViewer() {
  try {
    ocrStatus.textContent = "Preparing PDF...";
    
    // Direct loading for all PDFs (WORKING VERSION)
    pdfDoc = await loadPdfDirect(pdfUrl);

    totalPages = pdfDoc.numPages;
    pageInput.max = totalPages;
    
    // Setup controls *before* rendering
    setupAccessibilityControls();
    setupScrollListener();
    
    // Load first page
    await appendPage(1);
    currentPageNum = 1;
    pageNumDisplay.textContent = `Page 1 / ${totalPages}`;

  } catch (err) {
    console.error("PDF loading failed:", err);
    ocrStatus.innerHTML = `<h2>Error</h2><p>${err.message}</p>`;
  }
}

// --- 4. EVENT LISTENERS & START ---
prevBtn.addEventListener('click', () => { 
  if (isPageRendering) return;
  if (currentPageNum > 1) renderPage(currentPageNum - 1); 
});
nextBtn.addEventListener('click', () => { 
  if (isPageRendering) return;
  if (currentPageNum < totalPages) renderPage(currentPageNum + 1); 
});

// Page input functionality
pageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    if (isPageRendering) return;
    const pageNum = parseInt(pageInput.value);
    if (pageNum >= 1 && pageNum <= totalPages) {
      renderPage(pageNum);
    }
    pageInput.value = '';
  }
});

if (pdfUrl) {
  initializePdfViewer();
} else {
  ocrStatus.innerHTML = "<h2>Error</h2><p>No PDF URL provided</p>";
  document.getElementById('nav-bar').style.display = 'none';
}
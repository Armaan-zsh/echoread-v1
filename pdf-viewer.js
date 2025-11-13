// --- PDF VIEWER v11.0 (RESTORED WITH ALL FEATURES) ---

// --- 1. GET UI ELEMENTS ---
let pdfDoc = null;
let currentPageNum = 1;
let totalPages = 0;
let tesseractWorker = null;
let ocrInitialized = false;
let loadedPages = new Set();
let isLoading = false;

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

// Append page to scroll container
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
      const scale = 2.0; // High quality rendering
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
          textDiv.className = 'textLayer';
          textDiv.innerHTML = text.replace(/\n/g, '<br>');
          pageDiv.appendChild(textDiv);
        } catch (ocrErr) {
          console.error('OCR recognition failed:', ocrErr);
        }
      }
    } else { // DIGITAL PDF
      const textDiv = document.createElement('div');
      textDiv.className = 'textLayer';
      textDiv.innerHTML = pageText;
      pageDiv.appendChild(textDiv);
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
  const pageElement = document.getElementById(`page-${num}`);
  if (pageElement) {
    pageElement.scrollIntoView({ behavior: 'smooth' });
    currentPageNum = num;
    pageNumDisplay.textContent = `Page ${currentPageNum} / ${totalPages}`;
  } else {
    await appendPage(num);
    setTimeout(() => renderPage(num), 100);
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

// Setup scroll listener
function setupScrollListener() {
  window.addEventListener('scroll', () => {
    const scrollTop = window.pageYOffset;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    
    // Load next page when 80% scrolled
    if (scrollTop + windowHeight >= documentHeight * 0.8) {
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
  });
}

// --- Accessibility Control Logic ---
function setupAccessibilityControls() {
    const pageContainer = document.getElementById('page-container');

    fontToggleBtn.addEventListener('click', () => {
        const textLayers = document.querySelectorAll('.textLayer');
        textLayers.forEach(layer => {
            if (layer.style.fontFamily.includes('OpenDyslexic')) {
                layer.style.fontFamily = '';
                fontToggleBtn.textContent = 'Toggle Font';
            } else {
                layer.style.fontFamily = 'OpenDyslexic, sans-serif';
                fontToggleBtn.textContent = 'Normal Font';
            }
        });
    });
    
    einkToggleBtn.addEventListener('click', () => {
        // Turn off AMOLED mode first
        document.body.classList.remove('amoled-mode');
        amoledToggleBtn.textContent = 'AMOLED Mode';
        
        document.body.classList.toggle('eink-mode');
        if (document.body.classList.contains('eink-mode')) {
            einkToggleBtn.textContent = 'Exit E Ink';
            // Apply default contrast level
            document.body.className = document.body.className.replace(/contrast-\d/g, '');
            document.body.classList.add(`contrast-${contrastSlider.value}`);
        } else {
            einkToggleBtn.textContent = 'E Ink Mode';
            // Remove contrast classes
            document.body.className = document.body.className.replace(/contrast-\d/g, '');
        }
    });
    
    amoledToggleBtn.addEventListener('click', () => {
        // Turn off E Ink mode first
        document.body.classList.remove('eink-mode');
        einkToggleBtn.textContent = 'E Ink Mode';
        
        document.body.classList.toggle('amoled-mode');
        if (document.body.classList.contains('amoled-mode')) {
            amoledToggleBtn.textContent = 'Exit AMOLED';
            // Apply default contrast level
            document.body.className = document.body.className.replace(/contrast-\d/g, '');
            document.body.classList.add(`contrast-${contrastSlider.value}`);
        } else {
            amoledToggleBtn.textContent = 'AMOLED Mode';
            // Remove contrast classes
            document.body.className = document.body.className.replace(/contrast-\d/g, '');
        }
    });

    lineHeightSlider.addEventListener('input', (e) => {
        pageContainer.style.lineHeight = e.target.value;
    });

    letterSpacingSlider.addEventListener('input', (e) => {
        pageContainer.style.letterSpacing = `${e.target.value}px`;
    });
    
    contrastSlider.addEventListener('input', (e) => {
        if (document.body.classList.contains('eink-mode') || document.body.classList.contains('amoled-mode')) {
            // Remove old contrast class and add new one
            document.body.className = document.body.className.replace(/contrast-\d/g, '');
            document.body.classList.add(`contrast-${e.target.value}`);
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
prevBtn.addEventListener('click', () => { if (currentPageNum > 1) renderPage(currentPageNum - 1); });
nextBtn.addEventListener('click', () => { if (currentPageNum < totalPages) renderPage(currentPageNum + 1); });

// Page input functionality
pageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
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
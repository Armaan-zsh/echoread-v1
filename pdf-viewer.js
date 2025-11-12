// --- PDF VIEWER v11.0 (Streaming + Controls) ---

// --- 1. GET UI ELEMENTS ---
let pdfDoc = null;
let currentPageNum = 1;
let totalPages = 0;
let tesseractWorker = null;
let ocrInitialized = false;

const pageNumDisplay = document.getElementById('page-num');
const textContentLayer = document.getElementById('text-content-layer');
const ocrStatus = document.getElementById('ocr-status');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const pageInput = document.getElementById('page-input');
const canvas = document.getElementById('pdf-canvas');
const ctx = canvas.getContext('2d');

// --- NEW: Get Accessibility Controls
const fontToggleBtn = document.getElementById('font-toggle-btn');
const lineHeightSlider = document.getElementById('line-height-slider');
const letterSpacingSlider = document.getElementById('letter-spacing-slider');

const urlParams = new URLSearchParams(window.location.search);
let pdfUrl = urlParams.get('url');
if (pdfUrl) pdfUrl = decodeURIComponent(pdfUrl);

// --- 2. DEFINE FUNCTIONS ---

// Simple direct PDF loading
async function loadPdfDirect(fileUrl) {
  const response = await fetch(fileUrl);
  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  return pdfjsLib.getDocument(uint8Array).promise;
}


async function performOcr(pageNum) {
  try {
    ocrStatus.textContent = `Running OCR on page ${pageNum}...`;
    const { data: { text } } = await tesseractWorker.recognize(canvas);
    
    textContentLayer.innerHTML = text.replace(/\n/g, '<br>');
    canvas.style.display = 'none'; 
    textContentLayer.style.display = 'block';
    ocrStatus.textContent = `Page ${pageNum} loaded (from Scan).`;
  } catch (err) {
    console.error('OCR failed:', err);
    ocrStatus.textContent = `OCR error on page ${pageNum}: ${err.message}. Showing image.`;
  }
}

async function initializeOcr() {
  try {
    ocrStatus.textContent = "Loading OCR engine (one-time setup)...";
    
    tesseractWorker = await window.Tesseract.createWorker();
    await tesseractWorker.loadLanguage('eng');
    await tesseractWorker.initialize('eng');
    ocrInitialized = true;
  } catch (err) {
    console.error("OCR failed:", err);
    ocrStatus.textContent = "OCR unavailable. Showing images only.";
  }
}

async function renderPage(num) {
  try {
    textContentLayer.innerHTML = "";
    textContentLayer.style.display = 'none';
    canvas.style.display = 'none';
    ocrStatus.textContent = `Loading page ${num}...`;
    prevBtn.disabled = true;
    nextBtn.disabled = true;

    const page = await pdfDoc.getPage(num);
    
    const textContent = await page.getTextContent();
    let pageText = "";
    if (textContent && textContent.items.length > 0) {
      for (const item of textContent.items) {
        pageText += item.str + " ";
        if (item.hasEOL) { pageText += "<br>"; }
      }
    }

    if (pageText.trim().length < 50) { // It's a SCANNED PDF
      ocrStatus.textContent = `Digital text not found. Preparing scan...`;
      
      const viewport = page.getViewport({ scale: 1.5 });
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      
      canvas.style.display = 'block';
      ocrStatus.textContent = `Image loaded. OCR in progress...`;
      
      if (!ocrInitialized) {
        await initializeOcr();
      }
      
      await performOcr(num);

    } else { // It's a DIGITAL PDF
      textContentLayer.innerHTML = pageText;
      textContentLayer.style.display = 'block';
      if (pdfDoc.transport && !pdfDoc.transport.done) {
         ocrStatus.textContent = `Page ${num} loaded (Digital) - Background load in progress...`;
      } else {
         ocrStatus.textContent = `Page ${num} loaded (Digital).`;
      }
    }
    
    currentPageNum = num;
    pageNumDisplay.textContent = `Page ${currentPageNum} / ${totalPages}`;
    prevBtn.disabled = (currentPageNum <= 1);
    nextBtn.disabled = (currentPageNum >= totalPages);
    
    window.scrollTo(0, 0);
    
  } catch (err) {
    console.error(`Error rendering page ${num}:`, err);
    ocrStatus.textContent = `Error on page ${num}: ${err.message}`;
  }
}

// --- NEW: Accessibility Control Logic ---
function setupAccessibilityControls() {
    const pageContainer = document.getElementById('page-container');

    fontToggleBtn.addEventListener('click', () => {
        pageContainer.classList.toggle('opendyslexic-font');
        if (pageContainer.classList.contains('opendyslexic-font')) {
            pageContainer.style.fontFamily = 'OpenDyslexic, sans-serif';
        } else {
            pageContainer.style.fontFamily = 'sans-serif';
        }
    });

    lineHeightSlider.addEventListener('input', (e) => {
        pageContainer.style.lineHeight = e.target.value;
    });

    letterSpacingSlider.addEventListener('input', (e) => {
        pageContainer.style.letterSpacing = `${e.target.value}px`;
    });
}


// --- 3. MAIN STARTUP FUNCTION ---
async function initializePdfViewer() {
  try {
    ocrStatus.textContent = "Preparing PDF...";
    
    // Worker is loaded via HTML script tag
    // pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.js');

    // Direct loading for all PDFs
    pdfDoc = await loadPdfDirect(pdfUrl);

    totalPages = pdfDoc.numPages;
    pageInput.max = totalPages;
    
    // Setup controls *before* rendering
    setupAccessibilityControls();
    
    await renderPage(1);

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
// --- PDF VIEWER v12.0 (Aesthetic + Streaming + Controls) ---

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
const canvas = document.getElementById('pdf-canvas');
const ctx = canvas.getContext('2d');
const pageContainer = document.getElementById('page-container');

// --- NEW: Accessibility Controls
const fontToggleBtn = document.getElementById('font-toggle-btn');
const lineHeightSlider = document.getElementById('line-height-slider');
const letterSpacingSlider = document.getElementById('letter-spacing-slider');
const eInkBtn = document.getElementById('e-ink-btn');

const urlParams = new URLSearchParams(window.location.search);
let pdfUrl = urlParams.get('url');
if (pdfUrl) pdfUrl = decodeURIComponent(pdfUrl);

// --- 2. DEFINE FUNCTIONS ---

// Streaming Loader for "file:///" (The "Slow" Bug Fix)
async function loadLocalPdfWithStreaming(fileUrl) {
  ocrStatus.textContent = "Fetching local file...";
  
  const response = await fetch(fileUrl);
  const total = parseInt(response.headers.get('content-length'), 10);
  const reader = response.body.getReader();
  
  ocrStatus.textContent = "Sipping first chunk (64KB)...";
  const { value: firstChunk } = await reader.read();
  const initialData = new Uint8Array(firstChunk);
  
  const transport = new pdfjsLib.PDFDataRangeTransport(total, initialData);
  
  (async () => {
    let loaded = initialData.length;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        transport.onDataRangeLoad(loaded, total);
        break;
      }
      const chunk = new Uint8Array(value);
      transport.onDataRange(loaded, chunk);
      loaded += chunk.length;
      ocrStatus.textContent = `Loading PDF in background... (${Math.round(loaded/total*100)}%)`;
    }
  })();
  
  return pdfjsLib.getDocument({
    range: transport,
    url: null 
  }).promise;
}


async function performOcr(pageNum) {
  try {
    ocrStatus.textContent = `Running OCR on page ${pageNum}...`;
    // We render the canvas first for Tesseract
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    pageContainer.style.width = `${viewport.width}px`; // Set page width
    
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    
    const { data: { text } } = await tesseractWorker.recognize(canvas);
    
    // This is different: We just dump the text. It won't be aligned.
    // This is the trade-off for scanned PDFs.
    textContentLayer.innerHTML = text.replace(/\n/g, '<br>');
    textContentLayer.style.display = 'block';
    textContentLayer.style.color = '#333'; // Make OCR text visible
    canvas.style.display = 'none'; // Hide canvas
    
    ocrStatus.textContent = `Page ${pageNum} loaded (from Scan).`;
  } catch (err) {
    console.error('OCR failed:', err);
    ocrStatus.textContent = `OCR error on page ${pageNum}: ${err.message}.`;
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
    textContentLayer.innerHTML = ""; // Clear old text layer
    ocrStatus.textContent = `Loading page ${num}...`;
    prevBtn.disabled = true;
    nextBtn.disabled = true;

    const page = await pdfDoc.getPage(num);
    const viewport = page.getViewport({ scale: 1.5 }); // Use a standard scale

    // --- NEW: Set Page Dimensions ---
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    textContentLayer.style.height = `${viewport.height}px`;
    textContentLayer.style.width = `${viewport.width}px`;
    pageContainer.style.width = `${viewport.width}px`;
    
    // --- Render BOTH Canvas AND Text Layer ---
    
    // 1. Render the Canvas (the "picture" of the page)
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    
    // 2. Render the Text Layer (the "selectable" text)
    // This is the "Aesthetic" fix
    const textContent = await page.getTextContent();
    if (textContent.items.length === 0) {
      // SCANNED PDF: Fallback to OCR
      ocrStatus.textContent = `Digital text not found. Preparing scan...`;
      canvas.style.display = 'block';
      
      if (!ocrInitialized) {
        await initializeOcr();
      }
      await performOcr(num);
      
    } else {
      // DIGITAL PDF: Use the real text renderer
      ocrStatus.textContent = `Page ${num} loaded (Digital).`;
      canvas.style.display = 'block'; // Show canvas
      textContentLayer.style.display = 'block'; // Show text layer

      // This is the "magic" function
      await pdfjsLib.renderTextLayer({
          textContentSource: textContent,
          container: textContentLayer,
          viewport: viewport,
          textDivs: []
      }).promise;
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
    fontToggleBtn.addEventListener('click', () => {
        pageContainer.classList.toggle('opendyslexic-font');
        if (pageContainer.classList.contains('opendyslexic-font')) {
            pageContainer.style.fontFamily = 'OpenDyslexic, sans-serif';
        } else {
            pageContainer.style.fontFamily = 'sans-serif';
        }
    });

    lineHeightSlider.addEventListener('input', (e) => {
        // This will now control the *custom* text layer, not the whole page
        textContentLayer.style.lineHeight = e.target.value;
    });

    letterSpacingSlider.addEventListener('input', (e) => {
        textContentLayer.style.letterSpacing = `${e.target.value}px`;
    });
    
    eInkBtn.addEventListener('click', () => {
        document.body.classList.toggle('e-ink-mode');
        // We also need to re-render the text layer for E-Ink
        renderPage(currentPageNum); 
    });
}


// --- 3. MAIN STARTUP FUNCTION ---
async function initializePdfViewer() {
  try {
    ocrStatus.textContent = "Preparing PDF...";
    
    // Worker is loaded via HTML script tag
    // pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.js');

    // --- Streaming Logic ---
    if (pdfUrl.startsWith('file://')) {
      ocrStatus.textContent = "Optimizing local PDF for fast loading...";
      pdfDoc = await loadLocalPdfWithStreaming(pdfUrl);
    } else {
      ocrStatus.textContent = "Loading web PDF...";
      pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;
    }
    // --- END NEW LOGIC ---

    totalPages = pdfDoc.numPages;
    
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

if (pdfUrl) {
  initializePdfViewer();
} else {
  ocrStatus.innerHTML = "<h2>Error</h2><p>No PDF URL provided</p>";
  document.getElementById('nav-bar').style.display = 'none';
}

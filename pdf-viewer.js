// --- PDF VIEWER v7.0 (FIXED FOR CHROME EXTENSIONS) ---
// NO MORE MODULE IMPORTS - using legacy PDF.js build

// UI Elements
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

// Get URL SAFELY (fixed double-encoding)
const urlParams = new URLSearchParams(window.location.search);
let pdfUrl = urlParams.get('url');
if (pdfUrl) pdfUrl = decodeURIComponent(pdfUrl);

// Fix for chrome-extension:// URLs
if (pdfUrl && pdfUrl.startsWith('chrome-extension://')) {
  pdfUrl = pdfUrl.replace(/%3A/g, ':').replace(/%2F/g, '/');
}

// NEW: Convert extension URLs to blobs
async function convertExtensionUrlToBlob(url) {
  if (!url.startsWith('chrome-extension://')) return url;
  
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (err) {
    console.error("Blob conversion failed:", err);
    throw new Error(`Could not load PDF: ${err.message}`);
  }
}

// Simple direct PDF loading
async function loadPdfDirect(fileUrl) {
  const response = await fetch(fileUrl);
  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  return pdfjsLib.getDocument(uint8Array).promise;
}

// Initialize with proper URL handling
async function initializePdfViewer() {
  try {
    ocrStatus.textContent = "Preparing PDF...";
    
    // Worker is loaded via HTML script tag
    
    // Handle all URL types with direct loading
    let finalUrl = pdfUrl;
    if (pdfUrl.startsWith('chrome-extension://')) {
      finalUrl = await convertExtensionUrlToBlob(pdfUrl);
    }
    
    // Direct loading for all PDFs
    pdfDoc = await loadPdfDirect(finalUrl);
    totalPages = pdfDoc.numPages;
    
    await renderPage(1);
  } catch (err) {
    console.error("PDF loading failed:", err);
    ocrStatus.innerHTML = `<h2>Error</h2><p>${err.message}</p>`;
  }
}

// Tesseract is loaded via HTML script tag

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

    // Check if it's a scanned PDF
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
      ocrStatus.textContent = `Page ${num} loaded (Digital).`;
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

// Event listeners
prevBtn.addEventListener('click', () => { if (currentPageNum > 1) renderPage(currentPageNum - 1); });
nextBtn.addEventListener('click', () => { if (currentPageNum < totalPages) renderPage(currentPageNum + 1); });

// Start app
if (pdfUrl) {
  initializePdfViewer();
} else {
  ocrStatus.innerHTML = "<h2>Error</h2><p>No PDF URL provided</p>";
  document.getElementById('nav-bar').style.display = 'none';
}
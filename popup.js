// --- Get ALL our new controls ---
const pdfControls = document.getElementById('pdf-controls');
const htmlControls = document.getElementById('html-controls');
const statusMessage = document.getElementById('status-message');
const convertPdfBtn = document.getElementById('convert-pdf-btn');

const cleanViewBtn = document.getElementById('clean-view-btn');
const fontToggleBtn = document.getElementById('font-toggle-btn');
const lineHeightSlider = document.getElementById('line-height-slider');
const letterSpacingSlider = document.getElementById('letter-spacing-slider');

// --- Helper function to set the status message ---
function setStatus(message) {
  htmlControls.style.display = 'none';
  pdfControls.style.display = 'none';
  statusMessage.style.display = 'block';
  statusMessage.innerHTML = `<p>${message}</p>`;
}

// --- Main "main" function ---
document.addEventListener('DOMContentLoaded', () => {
  setStatus("Checking page...");

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0] || !tabs[0].url) {
      setStatus("Cannot access this tab.");
      return;
    }
    const url = tabs[0].url;

    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      function: () => true
    }, (results) => {
      if (chrome.runtime.lastError || !results || results.length === 0) {
        setStatus("EchoRead cannot run on this protected page.");
      } else if (url.endsWith('.pdf')) {
        pdfControls.style.display = 'block';
        htmlControls.style.display = 'none';
        statusMessage.style.display = 'none';
      } else {
        htmlControls.style.display = 'block';
        pdfControls.style.display = 'none';
        statusMessage.style.display = 'none';
      }
    });
  });
});


// --- PDF CONVERSION LOGIC (NEW v4.1 "HYBRID ENGINE") ---
convertPdfBtn.addEventListener('click', () => {
  convertPdfBtn.textContent = 'Loading Engine...';
  convertPdfBtn.disabled = true;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      files: ['pdf.mjs', 'tesseract.min.js']
    }, () => {
      chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        function: initializeOcrPdfViewer,
        args: [
          chrome.runtime.getURL('pdf.worker.mjs'),
          chrome.runtime.getURL('eng.traineddata')
        ]
      });
    });
  });
});

// This function is now the "Hybrid Engine"
async function initializeOcrPdfViewer(workerUrl, langDataUrl) {
  // 1. Setup PDF.js and load the document
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  const loadingTask = pdfjsLib.getDocument(window.location.href);
  const pdf = await loadingTask.promise;

  // 2. Create the HTML for our new "Viewer"
  const newHtml = `
    <html>
    <head>
      <title>EchoRead OCR - ${pdf.numPages} Page PDF</title>
      <style>
        body { background: #f5f5f5; padding-top: 80px; font-family: sans-serif; }
        #page-container {
          background: white; margin: 20px auto; max-width: 800px;
          min-height: 80vh; box-shadow: 0 0 10px rgba(0,0,0,0.1); padding: 40px;
        }
        .textLayer { line-height: 1.6; font-size: 18px; white-space: pre-wrap; }
        #ocr-status { font-size: 14px; font-style: italic; color: #555; text-align: center; }
        #nav-bar {
          position: fixed; top: 0; left: 0; width: 100%; background: #333;
          color: white; display: flex; justify-content: center; align-items: center;
          padding: 10px; z-index: 9999; box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        }
        #nav-bar button { font-size: 16px; padding: 8px 16px; margin: 0 10px; cursor: pointer; }
        #nav-bar button:disabled { background: #777; cursor: not-allowed; }
        #page-num { font-size: 18px; font-weight: bold; }
        #pdf-canvas { display: none; }
      </style>
    </head>
    <body>
      <div id="nav-bar">
        <button id="prev-btn">Previous</button>
        <span id="page-num">Loading...</span>
        <button id="next-btn">Next</button>
      </div>
      <div id="page-container">
        <div id="ocr-status">Initializing...</div>
        <div id="text-content-layer" class="textLayer"></div>
      </div>
      <canvas id="pdf-canvas"></canvas>

      <script src="${chrome.runtime.getURL('pdf.mjs')}"></script>
      <script src="${chrome.runtime.getURL('tesseract.min.js')}"></script>
      
      <script>
        // --- JIT + HYBRID OCR SCRIPT (Embedded in new page) ---
        let pdfDoc = null;
        let currentPageNum = 1;
        let totalPages = ${pdf.numPages};
        let tesseractWorker = null; // Will be created "lazily"
        let ocrInitialized = false;

        const pageNumDisplay = document.getElementById('page-num');
        const textContentLayer = document.getElementById('text-content-layer');
        const ocrStatus = document.getElementById('ocr-status');
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        const canvas = document.getElementById('pdf-canvas');
        
        async function initializePdf() {
          try {
            // 1. Initialize PDF.js (FAST)
            ocrStatus.textContent = "Loading PDF document...";
            pdfjsLib.GlobalWorkerOptions.workerSrc = "${chrome.runtime.getURL('pdf.worker.mjs')}";
            const loadingTask = pdfjsLib.getDocument(window.location.href);
            pdfDoc = await loadingTask.promise;
            
            // 2. Render the first page (FAST)
            await renderPage(1);
            
            // 3. Pre-load the OCR engine in the background (SLOW)
            // This won't block the user from reading!
            initializeOcr();

          } catch (err) {
            console.error(err);
            ocrStatus.innerHTML = \`<h2>Fatal Error</h2><p>\${err.message}</p>\`;
          }
        }
        
        // This function now runs in the background
        async function initializeOcr() {
          try {
            ocrStatus.textContent = "Loading OCR engine in background...";
            tesseractWorker = await Tesseract.createWorker({
              workerPath: chrome.runtime.getURL('tesseract.min.js'),
              langPath: '',
              corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.0.0/tesseract-core.wasm.js',
            });
            await tesseractWorker.loadLanguage("${langDataUrl}");
            await tesseractWorker.initialize('eng');
            ocrInitialized = true;
            ocrStatus.textContent = "OCR engine ready if needed.";
          } catch (err) {
            console.error("OCR Engine failed to load:", err);
            ocrStatus.textContent = "OCR engine failed to load. Scanned PDFs will not work.";
          }
        }
        
        // --- THIS IS THE NEW "SMART" FUNCTION ---
        async function renderPage(num) {
          try {
            // 1. Set loading state
            textContentLayer.innerHTML = "";
            ocrStatus.textContent = \`Loading page \${num}... \`;
            prevBtn.disabled = true;
            nextBtn.disabled = true;

            const page = await pdfDoc.getPage(num);
            
            // 2. --- TRY "EASY WAY" FIRST ---
            const textContent = await page.getTextContent();
            let pageText = "";
            if (textContent && textContent.items.length > 0) {
              for (const item of textContent.items) {
                pageText += item.str + " ";
                if (item.hasEOL) { pageText += "<br>"; }
              }
            }

            // 3. --- CHECK IF "EASY WAY" FAILED ---
            // If the text is too short, it's probably a scanned image.
            if (pageText.trim().length < 50) {
              ocrStatus.textContent = \`Digital text not found. Falling back to OCR... (This will be slow)\`;
              
              // Check if OCR engine is ready
              if (!ocrInitialized) {
                ocrStatus.textContent = \`Waiting for OCR engine to load... (This happens once)\`;
                await initializeOcr(); // Wait for it if it's not ready
              }
              
              // 4. --- RUN "HARD WAY" (OCR) ---
              ocrStatus.textContent = \`Running OCR on page \${num}... \`;
              const ctx = canvas.getContext('2d');
              const viewport = page.getViewport({ scale: 1.5 });
              canvas.height = viewport.height;
              canvas.width = viewport.width;
              await page.render({ canvasContext: ctx, viewport: viewport }).promise;
              
              const { data: { text } } = await tesseractWorker.recognize(canvas);
              pageText = text; // Overwrite with the OCR text
              ocrStatus.textContent = \`Page \${num} loaded (from Scan).\`;
            } else {
              ocrStatus.textContent = \`Page \${num} loaded (Digital).\`;
            }
            
            // 5. Display the final text (either digital or OCR)
            textContentLayer.innerHTML = pageText;
            
            // 6. Update UI
            currentPageNum = num;
            pageNumDisplay.textContent = \`Page \${currentPageNum} / \${totalPages}\`;
            prevBtn.disabled = (currentPageNum <= 1);
            nextBtn.disabled = (currentPageNum >= totalPages);
            
            window.scrollTo(0, 0);
            
          } catch (err) {
            console.error(\`Error rendering page \${num}:\`, err);
            ocrStatus.textContent = \`Error on page \${num}: \${err.message}\`;
          }
        }
        
        // Add button event listeners
        prevBtn.addEventListener('click', () => { if (currentPageNum > 1) renderPage(currentPageNum - 1); });
        nextBtn.addEventListener('click', () => { if (currentPageNum < totalPages) renderPage(currentPageNum + 1); });
        
        // Kick off the whole process
        initializePdf();
      </script>
    </body>
    </html>
  `;

  // 3. Replace the page with our new viewer
  document.open();
  document.write(newHtml);
  document.close();
}


// --- ALL OUR OLD HTML-PAGE FUNCTIONS (No changes) ---
// (These are for blogs and normal sites)

cleanViewBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, files: ['readability.js'] }, () => {
      if (chrome.runtime.lastError) return;
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        function: parseArticleWithReadability,
        args: [tabs[0].url]
      });
    });
  });
});

function parseArticleWithReadability(pageUrl) {
  window.scrollTo(0, document.body.scrollHeight);
  setTimeout(() => {
    const documentClone = document.cloneNode(true);
    const article = new Readability(documentClone, { charThreshold: 500, pageUrl: pageUrl }).parse();
    if (article && article.content) {
      const newHtml = `
        <html><head><title>${article.title}</title><base href="${pageUrl}">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; color: #1a1a1a; padding: 2% 10%; margin: 0; font-size: 20px; line-height: 1.6; max-width: 800px; margin: 0 auto; }
          h1, h2, h3 { line-height: 1.2; } img, video, figure { max-width: 100%; height: auto; } a { color: #007bff; text-decoration: none; } a:hover { text-decoration: underline; }
        </style></head>
        <body><h1>${article.title}</h1>${article.content}</body></html>
      `;
      document.open();
      document.write(newHtml);
      document.close();
    } else {
      alert("Sorry, EchoRead couldn't find an article on this page.");
    }
  }, 1000);
}

fontToggleBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, function: toggleDyslexicFont });
  });
});

function toggleDyslexicFont() {
  const FONT_NAME = 'OpenDyslexic';
  const FONT_URL = chrome.runtime.getURL('OpenDyslexic-Regular.otf');
  const STYLE_ID = 'echoread-font-style-sheet';
  const existingStyleSheet = document.getElementById(STYLE_ID);
  if (existingStyleSheet) {
    existingStyleSheet.remove();
  } else {
    const css = `
      @font-face { font-family: '${FONT_NAME}'; src: url('${FONT_URL}'); }
      * { font-family: '${FONT_NAME}', sans-serif !important; }
    `;
    const styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }
}

lineHeightSlider.addEventListener('input', (e) => {
  const newHeight = e.target.value;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      function: (height) => {
        const STYLE_ID = 'echoread-line-height-style';
        let styleEl = document.getElementById(STYLE_ID);
        if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = STYLE_ID; document.head.appendChild(styleEl); }
        styleEl.textContent = `* { line-height: ${height} !important; }`;
      },
      args: [newHeight]
    });
  });
});

letterSpacingSlider.addEventListener('input', (e) => {
  const newSpacing = e.target.value;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      function: (spacing) => {
        const STYLE_ID = 'echoread-letter-spacing-style';
        let styleEl = document.getElementById(STYLE_ID);
        if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = STYLE_ID; document.head.appendChild(styleEl); }
        styleEl.textContent = `* { letter-spacing: ${spacing}px !important; }`;
      },
      args: [newSpacing]
    });
  });
});

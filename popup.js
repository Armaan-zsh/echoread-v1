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

    // Asynchronous check for protected pages
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      function: () => true // Simple, safe check
    }, (results) => {
      if (chrome.runtime.lastError || !results || results.length === 0) {
        setStatus("EchoRead cannot run on this protected page.");
      } else if (url.endsWith('.pdf')) {
        // It's a PDF! Show PDF controls.
        pdfControls.style.display = 'block';
        htmlControls.style.display = 'none';
        statusMessage.style.display = 'none';
      } else {
        // It's a normal HTML page.
        htmlControls.style.display = 'block';
        pdfControls.style.display = 'none';
        statusMessage.style.display = 'none';
      }
    });
  });
});


// --- PDF CONVERSION LOGIC (NEW v4.0 "BEAST MODE" with OCR) ---
convertPdfBtn.addEventListener('click', () => {
  convertPdfBtn.textContent = 'Loading Engine...';
  convertPdfBtn.disabled = true;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    
    // Inject BOTH libraries: pdf.js and tesseract.js
    chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      files: ['pdf.mjs', 'tesseract.min.js']
    }, () => {
      // Now, inject our viewer-builder
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
          background: white;
          margin: 20px auto;
          max-width: 800px;
          min-height: 80vh;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
          padding: 40px;
        }
        .textLayer { line-height: 1.6; font-size: 18px; white-space: pre-wrap; }
        #ocr-status { font-size: 14px; font-style: italic; color: #555; text-align: center; }
        #nav-bar {
          position: fixed; top: 0; left: 0;
          width: 100%;
          background: #333;
          color: white;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 10px;
          z-index: 9999;
          box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        }
        #nav-bar button { font-size: 16px; padding: 8px 16px; margin: 0 10px; cursor: pointer; }
        #nav-bar button:disabled { background: #777; cursor: not-allowed; }
        #page-num { font-size: 18px; font-weight: bold; }
        /* This is the invisible canvas for rendering */
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
        <div id="ocr-status">Initializing OCR Engine...</div>
        <div id="text-content-layer" class="textLayer"></div>
      </div>
      
      <canvas id="pdf-canvas"></canvas>

      <script src="${chrome.runtime.getURL('pdf.mjs')}"></script>
      <script src="${chrome.runtime.getURL('tesseract.min.js')}"></script>
      
      <script>
        // --- JIT + OCR SCRIPT (Embedded in new page) ---
        let pdfDoc = null;
        let currentPageNum = 1;
        let totalPages = ${pdf.numPages};
        let tesseractWorker = null;

        const pageNumDisplay = document.getElementById('page-num');
        const textContentLayer = document.getElementById('text-content-layer');
        const ocrStatus = document.getElementById('ocr-status');
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        const canvas = document.getElementById('pdf-canvas');
        const ctx = canvas.getContext('2d');

        async function initialize() {
          try {
            // 1. Initialize Tesseract Worker
            ocrStatus.textContent = "Loading OCR Engine (eng.traineddata)...";
            tesseractWorker = await Tesseract.createWorker({
              workerPath: chrome.runtime.getURL('tesseract.min.js'),
              langPath: '', // We will provide the URL directly
              corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.0.0/tesseract-core.wasm.js',
            });
            await tesseractWorker.loadLanguage(langDataUrl); // Use the provided lang data URL
            await tesseractWorker.initialize('eng');
            ocrStatus.textContent = "OCR Engine Ready.";

            // 2. Initialize PDF.js
            pdfjsLib.GlobalWorkerOptions.workerSrc = "${chrome.runtime.getURL('pdf.worker.mjs')}";
            const loadingTask = pdfjsLib.getDocument(window.location.href);
            pdfDoc = await loadingTask.promise;
            
            // 3. Render the first page
            renderPage(1);

          } catch (err) {
            console.error(err);
            ocrStatus.innerHTML = \`<h2>Fatal Error</h2><p>\${err.message}</p>\`;
          }
        }
        
        async function renderPage(num) {
          try {
            // 1. Set loading state
            textContentLayer.innerHTML = "";
            ocrStatus.textContent = \`Loading page \${num}... \`;
            prevBtn.disabled = true;
            nextBtn.disabled = true;

            // 2. Get PDF page and render it to invisible canvas
            const page = await pdfDoc.getPage(num);
            const viewport = page.getViewport({ scale: 1.5 }); // 1.5x scale for better OCR
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            await page.render({ canvasContext: ctx, viewport: viewport }).promise;

            // 3. Feed canvas image to Tesseract
            ocrStatus.textContent = \`Running OCR on page \${num}... (This is the 'hard' part)\`;
            const { data: { text } } = await tesseractWorker.recognize(canvas);
            
            // 4. Display the recognized text
            textContentLayer.innerHTML = text; // Tesseract text has line breaks!
            
            // 5. Update UI
            currentPageNum = num;
            pageNumDisplay.textContent = \`Page \${currentPageNum} / \${totalPages}\`;
            ocrStatus.textContent = \`Page \${num} loaded via OCR.\`;
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
        initialize();
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

// --- Get ALL our new controls ---
const pdfControls = document.getElementById('pdf-controls');
const htmlControls = document.getElementById('html-controls');
const convertPdfBtn = document.getElementById('convert-pdf-btn');

const cleanViewBtn = document.getElementById('clean-view-btn');
const fontToggleBtn = document.getElementById('font-toggle-btn');
const lineHeightSlider = document.getElementById('line-height-slider');
const letterSpacingSlider = document.getElementById('letter-spacing-slider');

// --- Helper function to handle errors ---
function handleScriptingError() {
  if (chrome.runtime.lastError) {
    console.warn(`EchoRead: Could not run on this page. ${chrome.runtime.lastError.message}`);
    // You could also alert the user, but a silent fail is cleaner.
    // alert("EchoRead cannot run on this protected page (e.g., Chrome Web Store, Google pages).");
    return true; // Indicates an error
  }
  return false; // No error
}

// --- Main "main" function ---
document.addEventListener('DOMContentLoaded', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0] || !tabs[0].url) return; // Failsafe for empty tabs
    
    const currentTab = tabs[0];
    const url = currentTab.url;

    // Check if it's a PDF
    if (url.endsWith('.pdf')) {
      pdfControls.classList.remove('hidden');
      htmlControls.classList.add('hidden');
    } else {
      // Check if it's a restricted page (like chrome:// or https://chrome.google.com)
      if (url.startsWith('chrome://') || url.startsWith('https://chrome.google.com') || url.startsWith('https://aistudio.google.com')) {
        // It's a protected page, hide everything
        pdfControls.classList.add('hidden');
        htmlControls.classList.add('hidden');
        // You could show a "disabled" message here
      } else {
        // It's a normal HTML page
        pdfControls.classList.add('hidden');
        htmlControls.classList.remove('hidden');
      }
    }
  });
});


// --- PDF CONVERSION LOGIC (Now with error handling) ---
convertPdfBtn.addEventListener('click', () => {
  convertPdfBtn.textContent = 'Loading PDF...';
  convertPdfBtn.disabled = true;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      files: ['pdf.js'] // In your repo, this is 'pdf.mjs'
    }, () => {
      if (handleScriptingError()) return; // <-- ERROR CHECK
      
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        function: initializePdfViewer,
        args: [
          chrome.runtime.getURL('pdf.worker.mjs'), // 'pdf.worker.mjs'
          chrome.runtime.getURL('viewer.css') // This was 'viewer.mjs' in your repo, but CSS is better
        ]
      });
    });
  });
});

// ... (The 'initializePdfViewer' function is unchanged) ...
// (Pasting it here for completeness)
async function initializePdfViewer(workerUrl, cssUrl) {
  // 1. Setup PDF.js and load the document
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  const loadingTask = pdfjsLib.getDocument(window.location.href);
  const pdf = await loadingTask.promise;

  // 2. Create the HTML for our new "Viewer"
  const newHtml = `
    <html>
    <head>
      <title>EchoRead - ${pdf.numPages} Page PDF</title>
      ${cssUrl.endsWith('.css') ? `<link rel="stylesheet" href="${cssUrl}">` : ''}
      <style>
        body { background: #f5f5f5; padding-top: 80px; font-family: sans-serif; }
        #page-container { background: white; margin: 20px auto; max-width: 800px; min-height: 80vh; box-shadow: 0 0 10px rgba(0,0,0,0.1); padding: 40px; }
        .textLayer { line-height: 1.6; font-size: 18px; }
        #nav-bar { position: fixed; top: 0; left: 0; width: 100%; background: #333; color: white; display: flex; justify-content: center; align-items: center; padding: 10px; z-index: 9999; box-shadow: 0 2px 5px rgba(0,0,0,0.3); }
        #nav-bar button { font-size: 16px; padding: 8px 16px; margin: 0 10px; cursor: pointer; }
        #nav-bar button:disabled { background: #777; cursor: not-allowed; }
        #page-num { font-size: 18px; font-weight: bold; }
      </style>
    </head>
    <body>
      <div id="nav-bar">
        <button id="prev-btn">Previous</button>
        <span id="page-num">Loading...</span>
        <button id="next-btn">Next</button>
      </div>
      <div id="page-container"><div id="text-content-layer" class="textLayer"><h1>Loading Page 1...</h1></div></div>
      <script>
        // Global variables for this new page
        let pdfDoc = null;
        let currentPageNum = 1;
        let totalPages = ${pdf.numPages};
        
        // Get our new UI elements
        const pageNumDisplay = document.getElementById('page-num');
        const textContentLayer = document.getElementById('text-content-layer');
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        
        // This is our core "Just-In-Time" function
        async function renderPage(num) {
          try {
            const page = await pdfDoc.getPage(num);
            const textContent = await page.getTextContent();
            
            let pageText = "";
            for (const item of textContent.items) {
              pageText += item.str + " ";
              if (item.hasEOL) { pageText += "<br>"; }
            }
            
            textContentLayer.innerHTML = pageText;
            
            currentPageNum = num;
            pageNumDisplay.textContent = \`Page \${currentPageNum} / \${totalPages}\`;
            prevBtn.disabled = (currentPageNum <= 1);
            nextBtn.disabled = (currentPageNum >= totalPages);
            window.scrollTo(0, 0);
            
          } catch (err) {
            console.error('Error rendering page:', err);
            textContentLayer.innerHTML = \`<h2>Error loading page \${num}</h2><p>\${err.message}</p>\`;
          }
        }
        
        // Add button event listeners
        prevBtn.addEventListener('click', () => { if (currentPageNum > 1) renderPage(currentPageNum - 1); });
        nextBtn.addEventListener('click', () => { if (currentPageNum < totalPages) renderPage(currentPageNum + 1); });
        
        // KICK IT OFF
        (async function() {
          try {
            const script = document.createElement('script');
            script.src = "${chrome.runtime.getURL('pdf.mjs')}"; // Using 'pdf.mjs' from your repo
            document.head.appendChild(script);
            
            script.onload = async () => {
              pdfjsLib.GlobalWorkerOptions.workerSrc = "${chrome.runtime.getURL('pdf.worker.mjs')}";
              const loadingTask = pdfjsLib.getDocument(window.location.href);
              pdfDoc = await loadingTask.promise;
              renderPage(1);
            }
          } catch (err) { console.error('Failed to load PDF lib:', err); }
        })();
      </script>
    </body>
    </html>
  `;

  // 3. Replace the page with our new viewer
  document.open();
  document.write(newHtml);
  document.close();
}

// --- HTML PAGE FUNCTIONS (Now with error handling) ---

cleanViewBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, files: ['readability.js'] }, () => {
      if (handleScriptingError()) return; // <-- ERROR CHECK
      
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        function: parseArticleWithReadability,
        args: [tabs[0].url]
      }, () => handleScriptingError()); // <-- ERROR CHECK
    });
  });
});
// ... (parseArticleWithReadability function is unchanged) ...
function parseArticleWithReadability(pageUrl) {
  window.scrollTo(0, document.body.scrollHeight);
  setTimeout(() => {
    const documentClone = document.cloneNode(true);
    const article = new Readability(documentClone, { charThreshold: 500, pageUrl: pageUrl }).parse();
    if (article && article.content) {
      const newHtml = `
        <html>
        <head>
          <title>${article.title}</title>
          <base href="${pageUrl}">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; color: #1a1a1a; padding: 2% 10%; margin: 0; font-size: 20px; line-height: 1.6; max-width: 800px; margin: 0 auto; }
            h1, h2, h3 { line-height: 1.2; } img, video, figure { max-width: 100%; height: auto; } a { color: #007bff; text-decoration: none; } a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <h1>${article.title}</h1>
          ${article.content}
        </body>
        </html>
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
    chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, function: toggleDyslexicFont }, () => {
      handleScriptingError(); // <-- ERROR CHECK
    });
  });
});
// ... (toggleDyslexicFont function is unchanged) ...
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
    }, () => handleScriptingError()); // <-- ERROR CHECK
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
    }, () => handleScriptingError()); // <-- ERROR CHECK
  });
});

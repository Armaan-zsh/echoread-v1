// --- Get ALL our new controls ---
const pdfControls = document.getElementById('pdf-controls');
const htmlControls = document.getElementById('html-controls');
const convertPdfBtn = document.getElementById('convert-pdf-btn');

const cleanViewBtn = document.getElementById('clean-view-btn');
const fontToggleBtn = document.getElementById('font-toggle-btn');
const lineHeightSlider = document.getElementById('line-height-slider');
const letterSpacingSlider = document.getElementById('letter-spacing-slider');

// --- This is our "main" function. It runs as soon as the popup opens ---
document.addEventListener('DOMContentLoaded', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    const url = currentTab.url;

    if (url.endsWith('.pdf')) {
      pdfControls.classList.remove('hidden');
      htmlControls.classList.add('hidden');
    } else {
      pdfControls.classList.add('hidden');
      htmlControls.classList.remove('hidden');
    }
  });
});


// --- PDF CONVERSION LOGIC (NEW v2.1) ---
convertPdfBtn.addEventListener('click', () => {
  convertPdfBtn.textContent = 'Converting...';
  convertPdfBtn.disabled = true;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      files: ['pdf.js']
    }, () => {
      chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        function: parsePdf, // This is our new, smarter function
        args: [
          chrome.runtime.getURL('pdf.worker.mjs'),
          chrome.runtime.getURL('viewer.css')
        ]
      });
    });
  });
});

// This function now builds the page in real-time
async function parsePdf(workerUrl, cssUrl) {
  // 1. Setup PDF.js
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  const loadingTask = pdfjsLib.getDocument(window.location.href);
  const pdf = await loadingTask.promise;

  // 2. Create the NEW HTML shell with a progress bar
  document.open();
  document.write(`
    <html>
    <head>
      <title>EchoRead - ${pdf.numPages} Page PDF</title>
      <link rel="stylesheet" href="${cssUrl}">
      <style>
        body { background: #f5f5f5; padding: 20px; font-family: sans-serif; }
        .page { background: white; margin: 20px auto; max-width: 800px; box-shadow: 0 0 10px rgba(0,0,0,0.1); padding: 40px; }
        .textLayer { line-height: 1.6; font-size: 18px; }
        
        /* Progress Bar Styles */
        #progress-container {
          position: fixed; top: 0; left: 0;
          width: 100%; height: 20px;
          background: #ccc; z-index: 9999;
        }
        #progress-bar {
          width: 0%; height: 100%;
          background: #007bff;
          color: white; text-align: center;
          font-weight: bold;
          line-height: 20px;
          transition: width 0.2s ease;
        }
      </style>
    </head>
    <body>
      <div id="progress-container">
        <div id="progress-bar">0%</div>
      </div>
      <h1 style="text-align: center;">Converting PDF...</h1>
      <h2 style="text-align: center;">(Total ${pdf.numPages} pages)</h2>
      <div id="pdf-content"></div>
    </body>
    </html>
  `);

  // 3. Get the elements we just created
  const progressBar = document.getElementById('progress-bar');
  const contentDiv = document.getElementById('pdf-content');

  // 4. Loop through every page, one by one
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    let pageText = "";
    for (const item of textContent.items) {
      pageText += item.str + " ";
      if (item.hasEOL) { pageText += "<br>"; }
    }
    
    // Add this page's content to the screen
    const pageHtml = `
      <div class="page" id="page-${i}">
        <h3>Page ${i}</h3>
        <div class="textLayer">${pageText}</div>
      </div>
    `;
    contentDiv.innerHTML += pageHtml;

    // 5. UPDATE THE PROGRESS BAR
    const percent = Math.round((i / pdf.numPages) * 100);
    progressBar.style.width = percent + '%';
    progressBar.textContent = percent + '%';
  }

  // 6. Finish
  progressBar.textContent = 'Complete!';
  progressBar.style.background = '#28a745'; // Green
  document.close();
}


// --- ALL OUR OLD HTML-PAGE FUNCTIONS (No changes) ---

// --- 1. "Clean View" Button ---
cleanViewBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    chrome.scripting.executeScript({ target: { tabId: currentTab.id }, files: ['Readability.js'] }, () => {
      chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        function: parseArticleWithReadability,
        args: [currentTab.url]
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

// --- 2. Font Toggle Button ---
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

// --- 3. Spacing Sliders ---
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

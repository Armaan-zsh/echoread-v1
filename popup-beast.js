//
//  popup-beast.js - UNIFIED BEAST MODE
//  Combines PDF + HTML reading with themes and library
//

const pdfControls = document.getElementById('pdf-controls');
const htmlControls = document.getElementById('html-controls');
const statusMessage = document.getElementById('status-message');
const convertPdfBtn = document.getElementById('convert-pdf-btn');

const cleanViewBtn = document.getElementById('clean-view-btn');
const fontToggleBtn = document.getElementById('font-toggle-btn');
const lineHeightSlider = document.getElementById('line-height-slider');
const letterSpacingSlider = document.getElementById('letter-spacing-slider');

// Beast Mode Controls
const einkToggleBtn = document.getElementById('eink-toggle-btn');
const amoledToggleBtn = document.getElementById('amoled-toggle-btn');
const contrastSlider = document.getElementById('contrast-slider');
const saveToLibraryBtn = document.getElementById('save-to-library-btn');
const savePdfBtn = document.getElementById('save-pdf-btn');
const viewLibraryBtn = document.getElementById('view-library-btn');
const viewLibraryBtnPdf = document.getElementById('view-library-btn-pdf');

function setStatus(message) {
  htmlControls.style.display = 'none';
  pdfControls.style.display = 'none';
  statusMessage.style.display = 'block';
  statusMessage.innerHTML = `<p>${message}</p>`;
}

document.addEventListener('DOMContentLoaded', () => {
  setStatus("Checking page...");
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0] || !tabs[0].url) {
      setStatus("Cannot access this tab.");
      return;
    }
    const url = tabs[0].url;

    // 1. Check for PDF first.
    if (url.endsWith('.pdf')) {
      pdfControls.style.display = 'block';
      htmlControls.style.display = 'none';
      statusMessage.style.display = 'none';
      return;
    }

    // 2. Check if we are *already* in our viewer.
    if (url.startsWith(chrome.runtime.getURL('pdf-viewer.html'))) {
      setStatus("You are already in EchoRead PDF Viewer!");
      return;
    }
    
    // 3. If not a PDF, check for protected pages.
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      function: () => true
    }, (results) => {
      if (chrome.runtime.lastError || !results || results.length === 0) {
        setStatus("EchoRead cannot run on this protected page.");
      } else {
        htmlControls.style.display = 'block';
        pdfControls.style.display = 'none';
        statusMessage.style.display = 'none';
      }
    });
  });
});

// PDF CONVERSION BUTTON
convertPdfBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    const pdfUrl = currentTab.url;
    
    // Redirect to our dedicated PDF viewer
    const viewerUrl = chrome.runtime.getURL(`pdf-viewer.html?url=${encodeURIComponent(pdfUrl)}`);
    chrome.tabs.update(currentTab.id, { url: viewerUrl });
  });
});

// --- HTML PAGE FUNCTIONS ---

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

// --- BEAST MODE: E INK & AMOLED THEMES ---

einkToggleBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, function: toggleEinkMode });
  });
});

amoledToggleBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, function: toggleAmoledMode });
  });
});

contrastSlider.addEventListener('input', (e) => {
  const contrast = e.target.value;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      function: updateContrast,
      args: [contrast]
    });
  });
});

function toggleEinkMode() {
  const STYLE_ID = 'echoread-eink-mode';
  let styleEl = document.getElementById(STYLE_ID);
  
  if (styleEl) {
    styleEl.remove();
  } else {
    // Remove AMOLED first
    const amoledEl = document.getElementById('echoread-amoled-mode');
    if (amoledEl) amoledEl.remove();
    
    const css = `
      * { 
        background: #E9E3D2 !important; 
        color: #333333 !important; 
        border-color: #D8D3C3 !important;
      }
      a { color: #8B4513 !important; }
      img, video { filter: sepia(0.3) !important; }
    `;
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }
}

function toggleAmoledMode() {
  const STYLE_ID = 'echoread-amoled-mode';
  let styleEl = document.getElementById(STYLE_ID);
  
  if (styleEl) {
    styleEl.remove();
  } else {
    // Remove E Ink first
    const einkEl = document.getElementById('echoread-eink-mode');
    if (einkEl) einkEl.remove();
    
    const css = `
      * { 
        background: #000000 !important; 
        color: #ffffff !important; 
        border-color: #333333 !important;
      }
      a { color: #66B3FF !important; }
      img, video { filter: invert(1) !important; }
    `;
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }
}

function updateContrast(level) {
  const einkEl = document.getElementById('echoread-eink-mode');
  const amoledEl = document.getElementById('echoread-amoled-mode');
  
  if (einkEl) {
    const colors = {
      1: { bg: '#E9E3D2', text: '#555555' },
      2: { bg: '#E5DFC8', text: '#444444' },
      3: { bg: '#E1DBBE', text: '#333333' },
      4: { bg: '#DDD7B4', text: '#222222' },
      5: { bg: '#D8D3C3', text: '#000000' }
    };
    const color = colors[level];
    einkEl.textContent = `* { background: ${color.bg} !important; color: ${color.text} !important; }`;
  }
  
  if (amoledEl) {
    const colors = {
      1: '#cccccc', 2: '#dddddd', 3: '#eeeeee', 4: '#f5f5f5', 5: '#ffffff'
    };
    amoledEl.textContent = `* { background: #000000 !important; color: ${colors[level]} !important; }`;
  }
}

// --- BEAST MODE: SAVE TO LIBRARY ---

saveToLibraryBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, files: ['readability.js'] }, () => {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        function: saveArticleToLibrary,
        args: [tabs[0].url, tabs[0].title]
      });
    });
  });
});

savePdfBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const pdfUrl = tabs[0].url;
    const pdfTitle = tabs[0].title || 'PDF Document';
    
    const item = {
      id: Date.now(),
      title: pdfTitle,
      url: pdfUrl,
      type: 'pdf',
      content: 'PDF file - open in EchoRead viewer to read',
      savedAt: new Date().toISOString()
    };
    
    chrome.runtime.sendMessage({
      action: 'saveToLibrary',
      item: item
    }, (response) => {
      if (response && response.success) {
        alert('PDF saved to library!');
      } else {
        alert('Failed to save PDF');
      }
    });
  });
});

function saveArticleToLibrary(pageUrl, pageTitle) {
  const documentClone = document.cloneNode(true);
  const article = new Readability(documentClone, { charThreshold: 500, pageUrl: pageUrl }).parse();
  
  if (article && article.content) {
    const item = {
      id: Date.now(),
      title: article.title || pageTitle,
      url: pageUrl,
      type: 'article',
      content: article.textContent || article.content.replace(/<[^>]*>/g, ''),
      savedAt: new Date().toISOString()
    };
    
    // Send message to background script to save
    chrome.runtime.sendMessage({
      action: 'saveToLibrary',
      item: item
    }, (response) => {
      if (response && response.success) {
        alert('Article saved to library!');
      } else {
        alert('Failed to save article');
      }
    });
  } else {
    alert('Could not extract article content');
  }
}

// --- LIBRARY VIEWER ---

if (viewLibraryBtn) {
  viewLibraryBtn.addEventListener('click', openLibrary);
}
if (viewLibraryBtnPdf) {
  viewLibraryBtnPdf.addEventListener('click', openLibrary);
}

function openLibrary() {
  chrome.runtime.sendMessage({ action: 'openLibrary' });
}
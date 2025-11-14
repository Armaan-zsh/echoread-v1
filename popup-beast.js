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
  // Check if already in focus mode
  if (document.getElementById('echoread-focus-mode')) {
    // Exit focus mode
    const styleEl = document.getElementById('echoread-focus-mode');
    styleEl.remove();
    return;
  }
  
  window.scrollTo(0, document.body.scrollHeight);
  setTimeout(() => {
    const documentClone = document.cloneNode(true);
    const reader = new Readability(documentClone, { charThreshold: 500, pageUrl: pageUrl });
    const article = reader.parse();
    
    if (article && article.content) {
      // Find the main content element in the original DOM
      const contentSelectors = [
        'article', '[role="main"]', '.post-content', '.entry-content', 
        '.article-content', '.content', '.post', '.article-body',
        'main', '.main-content', '#content', '#main'
      ];
      
      let mainElement = null;
      for (const selector of contentSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          if (el.textContent.length > 500) {
            mainElement = el;
            break;
          }
        }
        if (mainElement) break;
      }
      
      if (mainElement) {
        applySurgicalFocus(mainElement);
      } else {
        alert("Could not identify main content area for focus mode.");
      }
    } else {
      alert("Sorry, EchoRead couldn't find an article on this page.");
    }
  }, 1000);
}

function applySurgicalFocus(mainElement) {
  // Create focus mode CSS - just hide distractions
  const focusCSS = `
    /* Hide ALL possible distracting elements */
    nav, header, footer, aside, sidebar, menu, form,
    [role="banner"], [role="navigation"], [role="complementary"], [role="contentinfo"],
    .nav, .navbar, .header, .footer, .sidebar, .aside, .menu, .navigation,
    .advertisement, .ad, .ads, .social, .share, .sharing, .follow,
    .comments, .related, .recommended, .popup, .modal, .overlay, .dropdown,
    .sticky, .fixed, .floating, .toast, .notification, .alert, .banner,
    .breadcrumb, .pagination, .tags, .categories, .meta, .byline,
    .author-bio, .newsletter, .subscribe, .cta, .call-to-action,
    iframe, .widget, .embed, .plugin, .addon,
    [class*="ad-"], [id*="ad-"], [class*="ads-"], [id*="ads-"],
    [class*="nav"], [id*="nav"], [class*="menu"], [id*="menu"],
    [class*="header"], [id*="header"], [class*="footer"], [id*="footer"],
    [class*="sidebar"], [id*="sidebar"], [class*="widget"], [id*="widget"],
    [style*="position: fixed"], [style*="position: sticky"],
    [style*="z-index: 9"], [style*="z-index: 1"] {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      height: 0 !important;
      width: 0 !important;
      overflow: hidden !important;
      position: absolute !important;
      left: -9999px !important;
      top: -9999px !important;
    }
    
    /* Target common website structures */
    body > div:not(.echoread-focused):not([class*="content"]):not([id*="content"]),
    body > section:not(.echoread-focused):not([class*="content"]):not([id*="content"]),
    body > article:not(.echoread-focused) > *:not([class*="content"]):not([id*="content"]) {
      display: none !important;
    }
    
    /* Show and center only the main content area */
    .echoread-focused {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      position: relative !important;
      max-width: 800px !important;
      margin: 40px auto !important;
      padding: 20px !important;
      z-index: 999999 !important;
      background: white !important;
      box-shadow: 0 0 20px rgba(0,0,0,0.1) !important;
    }
    
    /* Ensure all content within is visible */
    .echoread-focused * {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      position: static !important;
    }
    
    /* Clean body background */
    body {
      background: #f5f5f5 !important;
      overflow-x: hidden !important;
    }
  `;
  
  // Add focus mode styles
  const styleEl = document.createElement('style');
  styleEl.id = 'echoread-focus-mode';
  styleEl.textContent = focusCSS;
  document.head.appendChild(styleEl);
  
  // Just mark the main element and center it
  mainElement.classList.add('echoread-focused');
  
  // Scroll to the content
  mainElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    
    chrome.storage.local.get(['echoread_library'], (result) => {
      const library = result.echoread_library || [];
      const item = {
        id: Date.now(),
        title: pdfTitle,
        url: pdfUrl,
        type: 'pdf',
        content: 'PDF file - open in EchoRead viewer to read',
        savedAt: new Date().toISOString()
      };
      
      library.unshift(item);
      chrome.storage.local.set({ echoread_library: library }, () => {
        alert('PDF saved to library!');
      });
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
    
    chrome.storage.local.get(['echoread_library'], (result) => {
      const library = result.echoread_library || [];
      library.unshift(item);
      chrome.storage.local.set({ echoread_library: library }, () => {
        alert('Article saved to library!');
      });
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
  chrome.tabs.create({ url: chrome.runtime.getURL('library.html') });
}
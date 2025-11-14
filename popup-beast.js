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
  // Create focus mode CSS
  const focusCSS = `
    /* Hide everything first */
    body > * {
      display: none !important;
    }
    
    /* Also hide fixed/sticky elements */
    [style*="position: fixed"], [style*="position: sticky"],
    .fixed, .sticky, .floating {
      display: none !important;
    }
    
    /* Hide ALL distractions completely */
    nav, header, footer, aside, sidebar, menu,
    [role="banner"], [role="navigation"], [role="complementary"], [role="contentinfo"],
    .nav, .navbar, .header, .footer, .sidebar, .aside, .menu,
    .advertisement, .ad, .ads, .social, .share, .sharing,
    .comments, .related, .recommended, .popup, .modal, .overlay,
    .sticky, .fixed, .floating, .toast, .notification,
    .breadcrumb, .pagination, .tags, .categories,
    .author-bio, .newsletter, .subscribe, .cta,
    iframe[src*="ads"], iframe[src*="doubleclick"],
    [class*="ad-"], [id*="ad-"], [class*="ads-"], [id*="ads-"],
    [class*="banner"], [class*="promo"], [class*="widget"] {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      position: absolute !important;
      left: -9999px !important;
    }
    
    /* Show body and html */
    html, body {
      visibility: visible !important;
      background: #f8f9fa !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow-x: hidden !important;
    }
    
    /* Focus container */
    .echoread-focus-container {
      display: block !important;
      visibility: visible !important;
      padding: 40px 20px !important;
      background: #f8f9fa !important;
      min-height: 100vh !important;
    }
    
    /* Center and focus the main content */
    .echoread-focused-content {
      visibility: visible !important;
      display: block !important;
      max-width: 800px !important;
      margin: 0 auto !important;
      padding: 40px !important;
      background: white !important;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1) !important;
      border-radius: 8px !important;
    }
    
    /* Show all children of focused content */
    .echoread-focused-content * {
      visibility: visible !important;
    }
    
    /* Improve readability */
    .echoread-focused-content {
      line-height: 1.6 !important;
      font-size: 18px !important;
    }
    
    .echoread-focused-content img {
      max-width: 100% !important;
      height: auto !important;
      margin: 20px 0 !important;
    }
  `;
  
  // Add focus mode styles
  const styleEl = document.createElement('style');
  styleEl.id = 'echoread-focus-mode';
  styleEl.textContent = focusCSS;
  document.head.appendChild(styleEl);
  
  // Mark the main element as focused
  mainElement.classList.add('echoread-focused-content');
  
  // Create a new container for just the content
  const focusContainer = document.createElement('div');
  focusContainer.className = 'echoread-focus-container';
  focusContainer.style.cssText = `
    display: block !important;
    visibility: visible !important;
    position: relative !important;
    z-index: 999999 !important;
  `;
  
  // Clone the main content to avoid breaking the original
  const contentClone = mainElement.cloneNode(true);
  contentClone.className = 'echoread-focused-content';
  focusContainer.appendChild(contentClone);
  
  // Add to body
  document.body.appendChild(focusContainer);
  
  // Scroll to the focused content
  focusContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
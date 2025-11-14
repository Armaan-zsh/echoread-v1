// Background script for EchoRead extension

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveToLibrary') {
    // Save item to library
    chrome.storage.local.get(['echoread_library'], (result) => {
      const library = result.echoread_library || [];
      library.unshift(request.item);
      
      chrome.storage.local.set({ echoread_library: library }, () => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError });
        } else {
          sendResponse({ success: true });
        }
      });
    });
    return true; // Keep message channel open for async response
  }
  
  if (request.action === 'openLibrary') {
    // Open library in new tab
    chrome.tabs.create({ url: chrome.runtime.getURL('library.html') });
    sendResponse({ success: true });
  }
});
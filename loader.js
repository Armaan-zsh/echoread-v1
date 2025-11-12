//
//  loader.js
//  This is the "Bulletproof Loader" (v5.8)
//  It loads AND verifies.
//

(async function() {
  const status = document.getElementById('main-loading-status');

  // Helper function to load a classic script
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
      document.head.appendChild(script);
    });
  }

  // --- THIS IS THE NEW "POLLING" FUNCTION ---
  // It waits for a global variable to exist.
  function waitForGlobal(varName, retries = 20) { // 2 seconds
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const check = () => {
        if (window[varName]) {
          resolve();
        } else if (attempts >= retries) {
          reject(new Error(`'${varName}' was not defined on window. Check if the script loaded.`));
        } else {
          attempts++;
          setTimeout(check, 100); // Check again in 100ms
        }
      };
      check();
    });
  }
  // --- END NEW FUNCTION ---

  try {
    // --- STEP 1: LOAD PDF.js AND *WAIT* ---
    status.textContent = 'Loading PDF Library...';
    await loadScript(chrome.runtime.getURL('pdf.js'));
    await waitForGlobal('pdfjsLib'); // This is the fix
    console.log('EchoRead: pdf.js loaded. pdfjsLib is NOW defined.');
    
    // Set the workerSrc immediately
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.js');

    // --- STEP 2: LOAD TESSERACT AND *WAIT* ---
    status.textContent = 'Loading OCR Engine...';
    await loadScript(chrome.runtime.getURL('tesseract.min.js'));
    await waitForGlobal('Tesseract'); // This is the fix
    console.log('EchoRead: tesseract.min.js loaded. Tesseract is NOW defined.');

    // --- STEP 3: LOAD OUR VIEWER ---
    status.textContent = 'Loading Viewer...';
    // We use the 'startEchoReadViewer' function from v5.7 to prevent the *next* race condition
    await loadScript(chrome.runtime.getURL('pdf-viewer.js'));
    await waitForGlobal('startEchoReadViewer');
    console.log('EchoRead: pdf-viewer.js loaded.');

    // --- STEP 4: START THE APP ---
    // Now that all 3 scripts are loaded and verified, run the app.
    await window.startEchoReadViewer();
    
    status.style.display = 'none'; // Hide the loading message

  } catch (err) {
    console.error('EchoRead Loader Failed:', err);
    status.textContent = `EchoRead Loader Failed: ${err.message}`;
    status.style.color = 'red';
  }
})();

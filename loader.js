//
//  loader.js
//  This is the "Bootstrap Loader" (Option 1).
//

(async function() {
  const status = document.getElementById('main-loading-status');

  // Helper function to load a classic script (like Tesseract)
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
      document.head.appendChild(script);
    });
  }

  // Helper function to load an ES Module (like pdf.mjs)
  async function loadModule(url) {
    try {
      // Dynamic import() is the modern way to load modules
      const module = await import(url);
      
      // We MUST attach its contents to the 'window'
      // so our 'pdf-viewer.js' (a classic script) can find it.
      window.pdfjsLib = module; // This creates the global 'pdfjsLib'
      
    } catch (err) {
      throw new Error(`Failed to load module: ${url}. ${err.message}`);
    }
  }

  try {
    status.textContent = 'Loading PDF Library...';
    await loadModule(chrome.runtime.getURL('pdf.mjs'));
    console.log('EchoRead: pdf.mjs loaded. pdfjsLib is NOW defined.');
    
    // Set the workerSrc immediately
    if (window.pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.mjs');
    }

    status.textContent = 'Loading OCR Engine...';
    await loadScript(chrome.runtime.getURL('tesseract.min.js'));
    console.log('EchoRead: tesseract.min.js loaded. Tesseract is NOW defined.');

    status.textContent = 'Loading Viewer...';
    await loadScript(chrome.runtime.getURL('pdf-viewer.js'));
    console.log('EchoRead: pdf-viewer.js loaded. The viewer will now start.');

    // The 'pdf-viewer.js' file will now run and take over
    status.style.display = 'none'; // Hide the loading message

  } catch (err) {
    console.error('EchoRead Loader Failed:', err);
    status.textContent = `EchoRead Loader Failed: ${err.message}`;
    status.style.color = 'red';
  }
})();

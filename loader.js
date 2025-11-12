//
//  loader.js
//  This is the "Bootstrap Loader" (v5.7 - The "Race Condition" Fix)
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

  try {
    status.textContent = 'Loading PDF Library...';
    
    await loadScript(chrome.runtime.getURL('pdf.js'));
    console.log('EchoRead: pdf.js loaded. pdfjsLib is NOW defined.');
    
    if (window.pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.js');
    } else {
        throw new Error('pdfjsLib was not defined on window. Check if pdf.js loaded.');
    }

    status.textContent = 'Loading OCR Engine...';
    await loadScript(chrome.runtime.getURL('tesseract.min.js'));
    console.log('EchoRead: tesseract.min.js loaded. Tesseract is NOW defined.');

    status.textContent = 'Loading Viewer...';
    await loadScript(chrome.runtime.getURL('pdf-viewer.js'));
    console.log('EchoRead: pdf-viewer.js loaded. The viewer will now start.');

    // --- THIS IS THE FIX ---
    // Now that all scripts are loaded, we can safely
    // call the function inside 'pdf-viewer.js'.
    if (window.startEchoReadViewer) {
      await window.startEchoReadViewer();
    } else {
      throw new Error('pdf-viewer.js did not define startEchoReadViewer');
    }
    // --- END FIX ---
    
    status.style.display = 'none';

  } catch (err) {
    console.error('EchoRead Loader Failed:', err);
    status.textContent = `EchoRead Loader Failed: ${err.message}`;
    status.style.color = 'red';
  }
})();

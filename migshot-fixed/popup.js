document.getElementById('archiveBtn').addEventListener('click', async () => {
  const archiveBtn = document.getElementById('archiveBtn');
  const error = document.getElementById('error');
  
  error.classList.remove('show');
  archiveBtn.disabled = true;
  archiveBtn.textContent = 'Select area...';
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Start the selection process
    chrome.runtime.sendMessage({ 
      action: 'capture', 
      tabId: tab.id
    }, (response) => {
      if (chrome.runtime.lastError) {
        showError(chrome.runtime.lastError.message);
        archiveBtn.disabled = false;
        archiveBtn.textContent = '📦 Archive This Post';
        return;
      }
      
      // Selection UI is now active on the page
      archiveBtn.textContent = '✓ Selection started!';
      archiveBtn.style.background = 'linear-gradient(135deg, #9B9565 0%, #7a7550 100%)';
      
      setTimeout(() => {
        window.close(); // Close popup so user can see selection
      }, 500);
    });
    
  } catch (err) {
    showError(err.message);
    archiveBtn.disabled = false;
    archiveBtn.textContent = '📦 Archive This Post';
  }
});

function showError(message) {
  const error = document.getElementById('error');
  error.textContent = message;
  error.classList.add('show');
}

document.getElementById('openArchiveBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('archive.html') });
});

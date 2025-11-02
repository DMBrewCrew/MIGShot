document.getElementById('archiveBtn').addEventListener('click', async () => {
  const archiveBtn = document.getElementById('archiveBtn');
  const error = document.getElementById('error');
  
  error.classList.remove('show');
  archiveBtn.disabled = true;
  archiveBtn.textContent = 'Archiving...';
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url.includes('facebook.com') && !tab.url.includes('instagram.com')) {
      throw new Error('Please navigate to a Facebook or Instagram post first');
    }
    
    chrome.runtime.sendMessage({ action: 'capture', tabId: tab.id }, async (response) => {
      if (chrome.runtime.lastError) {
        showError(chrome.runtime.lastError.message);
        archiveBtn.disabled = false;
        archiveBtn.textContent = '📦 Archive This Post';
        return;
      }
      
      if (response.error) {
        showError(response.error);
        archiveBtn.disabled = false;
        archiveBtn.textContent = '📦 Archive This Post';
      } else {
        await saveToArchive(response.data);
        
        archiveBtn.textContent = '✓ Archived!';
        archiveBtn.style.backgroundColor = '#42b72a';
        
        setTimeout(() => {
          archiveBtn.style.backgroundColor = '';
          archiveBtn.disabled = false;
          archiveBtn.textContent = '📦 Archive This Post';
        }, 1500);
      }
    });
    
  } catch (err) {
    showError(err.message);
    archiveBtn.disabled = false;
    archiveBtn.textContent = '📦 Archive This Post';
  }
});

async function saveToArchive(data) {
  try {
    const result = await chrome.storage.local.get(['captures']);
    const captures = result.captures || [];
    
    captures.unshift({
      url: data.url,
      screenshot: data.screenshot,
      date: null,  // No date yet
      dateBadge: null,  // Will be generated when user adds date
      platform: data.platform || 'facebook',  // Store platform
      capturedAt: Date.now()
    });
    
    await chrome.storage.local.set({ captures });
    
  } catch (error) {
    console.error('Failed to save to archive:', error);
    throw new Error('Failed to save to archive');
  }
}

function showError(message) {
  const error = document.getElementById('error');
  error.textContent = message;
  error.classList.add('show');
}

document.getElementById('openArchiveBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('archive.html') });
});

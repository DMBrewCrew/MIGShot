// Monitor for date elements and enable button when ready
let isMonitoring = false;
let monitorInterval = null;
let lastUrl = '';
let lastDetectedDate = '';

// Start monitoring for date elements
function startDateMonitoring() {
  if (isMonitoring) return;
  
  isMonitoring = true;
  const archiveBtn = document.getElementById('archiveBtn');
  archiveBtn.disabled = true;
  archiveBtn.textContent = '⏳ Waiting for date to load...';
  
  // Check every 500ms for date elements
  monitorInterval = setInterval(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url.includes('facebook.com')) {
      clearInterval(monitorInterval);
      isMonitoring = false;
      archiveBtn.disabled = false;
      archiveBtn.textContent = '📦 Archive This Post';
      return;
    }
    
    // Check if URL changed (arrow navigation)
    if (lastUrl && lastUrl !== tab.url) {
      console.log('URL changed - waiting for NEW date to load...');
      console.log('Old URL:', lastUrl);
      console.log('New URL:', tab.url);
      lastUrl = tab.url;
      archiveBtn.textContent = '⏳ Arrow detected - loading new post...';
      return; // Keep waiting, don't enable button yet
    }
    
    lastUrl = tab.url;
    
    // Actually try to EXTRACT the date, don't just check if elements exist
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // Try to extract actual date using the same logic as background.js
        let dateText = '';
        
        // Strategy 1: aria-labelledby
        const ariaElements = document.querySelectorAll('[aria-labelledby]');
        for (const elem of ariaElements) {
          const labelId = elem.getAttribute('aria-labelledby');
          if (labelId) {
            const labelElement = document.getElementById(labelId);
            if (labelElement) {
              const text = labelElement.textContent?.trim();
              if (text && /20\d{2}/.test(text) && text.length < 200) {
                dateText = text;
                break;
              }
            }
          }
        }
        
        // Strategy 2: data-utime (Unix timestamp)
        if (!dateText) {
          const timestamps = document.querySelectorAll('[data-utime]');
          if (timestamps.length > 0) {
            const utime = timestamps[0].getAttribute('data-utime');
            const date = new Date(parseInt(utime) * 1000);
            if (!isNaN(date.getTime())) {
              dateText = date.toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              });
            }
          }
        }
        
        // Strategy 3: title attributes with dates
        if (!dateText) {
          const titleElements = document.querySelectorAll('[title]');
          for (const elem of titleElements) {
            const title = elem.getAttribute('title');
            if (title && /20\d{2}/.test(title) && title.length < 200) {
              dateText = title;
              break;
            }
          }
        }
        
        return dateText;
      }
    });
    
    if (result && result.result) {
      const dateText = result.result;
      
      // If we extracted a valid date and it's DIFFERENT from last one
      if (dateText && dateText !== lastDetectedDate && dateText !== 'Date not found') {
        clearInterval(monitorInterval);
        isMonitoring = false;
        lastDetectedDate = dateText;
        archiveBtn.disabled = false;
        archiveBtn.textContent = '📦 Archive This Post';
        console.log('Valid date extracted:', dateText, '- button enabled');
      } else if (dateText && !lastDetectedDate) {
        // First load
        clearInterval(monitorInterval);
        isMonitoring = false;
        lastDetectedDate = dateText;
        archiveBtn.disabled = false;
        archiveBtn.textContent = '📦 Archive This Post';
        console.log('Initial date extracted:', dateText, '- button enabled');
      }
    }
  }, 500);
}

// Handle archive button click - captures and saves directly
document.getElementById('archiveBtn').addEventListener('click', async () => {
  const archiveBtn = document.getElementById('archiveBtn');
  const error = document.getElementById('error');
  
  // Reset UI
  error.classList.remove('show');
  archiveBtn.disabled = true;
  archiveBtn.textContent = 'Archiving...';
  
  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Check if we're on Facebook
    if (!tab.url.includes('facebook.com')) {
      throw new Error('Please navigate to a Facebook post first');
    }
    
    // Send message to background script to capture
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
        // Save directly to archive
        await saveToArchive(response.data);
        
        // Show success briefly
        archiveBtn.textContent = '✓ Archived!';
        archiveBtn.style.backgroundColor = '#42b72a';
        
        setTimeout(() => {
          archiveBtn.style.backgroundColor = '';
          // Start monitoring for next date load
          startDateMonitoring();
        }, 1000);
      }
    });
    
  } catch (err) {
    showError(err.message);
    archiveBtn.disabled = false;
    archiveBtn.textContent = '📦 Archive This Post';
  }
});

// Save capture to archive
async function saveToArchive(data) {
  try {
    // Get existing captures
    const result = await chrome.storage.local.get(['captures']);
    const captures = result.captures || [];
    
    // Add new capture
    captures.unshift({
      date: data.date,
      url: data.url,
      screenshot: data.screenshot,
      dateBadge: data.dateBadge,
      capturedAt: Date.now()
    });
    
    // Save to storage
    await chrome.storage.local.set({ captures });
    
  } catch (error) {
    console.error('Failed to save to archive:', error);
    throw new Error('Failed to save to archive');
  }
}

// Show error message
function showError(message) {
  const error = document.getElementById('error');
  error.textContent = message;
  error.classList.add('show');
}

// Handle "Open Archive" button
document.getElementById('openArchiveBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('archive.html') });
});

// Start monitoring when popup opens
startDateMonitoring();

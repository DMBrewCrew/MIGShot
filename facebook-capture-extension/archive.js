let captures = [];

function isCurrentYear(dateString) {
  if (!dateString) return false;
  try {
    const parts = dateString.split('/');
    if (parts.length === 3) {
      const year = parseInt(parts[2]);
      return year === new Date().getFullYear();
    }
    return false;
  } catch (error) {
    return false;
  }
}

async function loadCaptures() {
  const result = await chrome.storage.local.get(['captures']);
  captures = result.captures || [];
  displayCaptures();
  updateStats();
}

function displayCaptures() {
  const capturesList = document.getElementById('capturesList');
  const emptyState = document.getElementById('emptyState');
  const copyAllBtn = document.getElementById('copyAllBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');
  
  if (captures.length === 0) {
    capturesList.innerHTML = '';
    emptyState.style.display = 'block';
    copyAllBtn.disabled = true;
    clearAllBtn.disabled = true;
    return;
  }
  
  emptyState.style.display = 'none';
  copyAllBtn.disabled = false;
  clearAllBtn.disabled = false;
  
  capturesList.innerHTML = captures.map((capture, index) => {
    const captureDate = new Date(capture.capturedAt);
    const timeString = captureDate.toLocaleString();
    const hasDate = capture.date !== null;
    const show2025Badge = hasDate && isCurrentYear(capture.date);
    
    // Get platform info (default to facebook for old captures)
    const platform = capture.platform || 'facebook';
    const platformLabel = platform === 'instagram' ? 'IG' : 'FB';
    const platformColor = platform === 'instagram' ? '#E4405F' : '#1877f2';
    
    return `
      <div class="capture-card" data-index="${index}">
        <div class="capture-header">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="platform-badge" style="background: ${platformColor};">${platformLabel}</span>
            <span class="capture-number">Capture #${captures.length - index}</span>
          </div>
          <span class="capture-time">${timeString}</span>
        </div>
        
        <div class="capture-content">
          <img src="${capture.screenshot}" alt="Screenshot" class="capture-screenshot">
          
          <div class="capture-details">
            <div class="detail-item">
              <div class="detail-label">Post Date</div>
              <div class="date-input-wrapper">
                <input type="text" 
                       class="date-input" 
                       data-index="${index}" 
                       value="${hasDate ? capture.date : ''}" 
                       placeholder="MM/DD/YYYY">
                <button class="btn-save-date" data-index="${index}">Save Date</button>
              </div>
              ${show2025Badge ? `<img src="${capture.dateBadge}" alt="Date badge" class="date-badge-preview">` : ''}
            </div>
            
            <div class="detail-item">
              <div class="detail-label">Post URL</div>
              <div class="detail-value"><a href="${capture.url}" target="_blank">${capture.url}</a></div>
            </div>
          </div>
        </div>
        
        <div class="capture-actions">
          <button class="btn btn-success btn-small copy-capture-btn" data-index="${index}">
            Copy This Capture
          </button>
          <button class="btn btn-danger btn-small delete-capture-btn" data-index="${index}">
            Delete
          </button>
        </div>
      </div>
    `;
  }).join('');
  
  // Add event listeners for date save buttons
  document.querySelectorAll('.btn-save-date').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const index = parseInt(e.target.dataset.index);
      await saveDate(index);
    });
  });
  
  // Add event listeners for copy/delete
  document.querySelectorAll('.copy-capture-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      copySingleCapture(index);
    });
  });
  
  document.querySelectorAll('.delete-capture-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      deleteCapture(index);
    });
  });
}

async function saveDate(index) {
  const input = document.querySelector(`input.date-input[data-index="${index}"]`);
  const dateStr = input.value.trim();
  
  if (!dateStr) {
    showNotification('Please enter a date', true);
    return;
  }
  
  // Validate date format (MM/DD/YYYY)
  const datePattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const match = dateStr.match(datePattern);
  
  if (!match) {
    showNotification('Please use MM/DD/YYYY format', true);
    return;
  }
  
  const month = parseInt(match[1]);
  const day = parseInt(match[2]);
  const year = parseInt(match[3]);
  
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2004 || year > 2100) {
    showNotification('Invalid date', true);
    return;
  }
  
  // Update capture
  captures[index].date = dateStr;
  
  // Generate date badge only if 2025
  if (isCurrentYear(dateStr)) {
    const response = await chrome.runtime.sendMessage({ 
      action: 'generateDateBadge', 
      date: dateStr 
    });
    captures[index].dateBadge = response.dateBadge;
  } else {
    captures[index].dateBadge = null;
  }
  
  await chrome.storage.local.set({ captures });
  displayCaptures();
  showNotification(`Date saved: ${dateStr}`);
}

function updateStats() {
  const stats = document.getElementById('stats');
  const withDates = captures.filter(c => c.date).length;
  const without = captures.length - withDates;
  stats.textContent = `Total: ${captures.length} | With dates: ${withDates} | Without: ${without}`;
}

async function copySingleCapture(index) {
  const capture = captures[index];
  
  try {
    const showBadge = capture.date && isCurrentYear(capture.date);
    
    let html = `<img src="${capture.screenshot}" style="max-width: 100%; height: auto;">`;
    
    if (showBadge && capture.dateBadge) {
      html += `<p style="margin: 10px 0;"><img src="${capture.dateBadge}" style="max-width: 300px; height: auto;"></p>`;
    }
    
    html += `<p style="margin: 10px 0;"><a href="${capture.url}">${capture.url}</a></p>`;
    
    const text = capture.url;
    const blob = new Blob([html], { type: 'text/html' });
    const textBlob = new Blob([text], { type: 'text/plain' });
    
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': blob,
        'text/plain': textBlob
      })
    ]);
    
    const badgeStatus = showBadge ? ' (with date badge)' : '';
    showNotification('Capture copied' + badgeStatus + '!');
  } catch (error) {
    console.error('Copy failed:', error);
    showNotification('Failed to copy', true);
  }
}

async function copyAllCaptures() {
  if (captures.length === 0) return;
  
  try {
    const htmlParts = captures.map(capture => {
      const showBadge = capture.date && isCurrentYear(capture.date);
      
      let html = `<img src="${capture.screenshot}" style="max-width: 100%; height: auto;">`;
      
      if (showBadge && capture.dateBadge) {
        html += `<p style="margin: 10px 0;"><img src="${capture.dateBadge}" style="max-width: 300px; height: auto;"></p>`;
      }
      
      html += `<p style="margin: 10px 0;"><a href="${capture.url}">${capture.url}</a></p><p style="margin: 20px 0;"></p>`;
      
      return html;
    });
    
    const html = htmlParts.join('\n');
    const textParts = captures.map(capture => `${capture.url}\n`);
    const text = textParts.join('\n');
    
    const blob = new Blob([html], { type: 'text/html' });
    const textBlob = new Blob([text], { type: 'text/plain' });
    
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': blob,
        'text/plain': textBlob
      })
    ]);
    
    const badgeCount = captures.filter(c => c.date && isCurrentYear(c.date)).length;
    const badgeInfo = badgeCount > 0 ? ` (${badgeCount} with date badges)` : '';
    
    showNotification(`All ${captures.length} captures copied${badgeInfo}!`);
  } catch (error) {
    console.error('Copy all failed:', error);
    showNotification('Failed to copy all', true);
  }
}

async function deleteCapture(index) {
  if (confirm('Delete this capture?')) {
    captures.splice(index, 1);
    await chrome.storage.local.set({ captures });
    displayCaptures();
    updateStats();
    showNotification('Capture deleted.');
  }
}

async function clearAll() {
  if (confirm(`Delete all ${captures.length} captures? This cannot be undone.`)) {
    captures = [];
    await chrome.storage.local.set({ captures: [] });
    displayCaptures();
    updateStats();
    showNotification('Archive cleared.');
  }
}

function showNotification(message, isError = false) {
  const notification = document.getElementById('notification');
  notification.textContent = message;
  notification.style.backgroundColor = isError ? '#e74c3c' : '#42b72a';
  notification.classList.add('show');
  
  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

document.getElementById('copyAllBtn').addEventListener('click', copyAllCaptures);
document.getElementById('clearAllBtn').addEventListener('click', clearAll);

loadCaptures();

// Load and display all captures
let captures = [];

// Helper function to check if date is from current year
function isCurrentYear(dateString) {
  try {
    // dateString is in MM/DD/YYYY format
    const parts = dateString.split('/');
    if (parts.length === 3) {
      const year = parseInt(parts[2]);
      const currentYear = new Date().getFullYear();
      return year === currentYear;
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
    
    return `
      <div class="capture-card" data-index="${index}">
        <div class="capture-header">
          <span class="capture-number">Capture #${captures.length - index}</span>
          <span class="capture-time">Captured: ${timeString}</span>
        </div>
        
        <div class="capture-content">
          <img src="${capture.screenshot}" alt="Screenshot" class="capture-screenshot">
          
          <div class="capture-details">
            <div class="detail-item">
              <div class="detail-label">Date Badge</div>
              <img src="${capture.dateBadge}" alt="Date badge" class="date-badge-preview">
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
  
  // Add event listeners
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

function updateStats() {
  const stats = document.getElementById('stats');
  stats.textContent = `Total Captures: ${captures.length}`;
}

// Copy a single capture in Word-ready format
async function copySingleCapture(index) {
  const capture = captures[index];
  
  try {
    // Check if post is from current year
    const showBadge = isCurrentYear(capture.date);
    
    // Create HTML with screenshot, conditionally date badge, and URL as hyperlink
    let html = `
      <img src="${capture.screenshot}" style="max-width: 100%; height: auto;">`;
    
    // Only include date badge if from current year
    if (showBadge) {
      html += `
      <p style="margin: 10px 0;"><img src="${capture.dateBadge}" style="max-width: 300px; height: auto;"></p>`;
    }
    
    // Add URL as clickable hyperlink
    html += `
      <p style="margin: 10px 0;"><a href="${capture.url}">${capture.url}</a></p>
    `;
    
    // Create plain text version (just URL)
    const text = capture.url;
    
    // Write both HTML and text to clipboard
    const blob = new Blob([html], { type: 'text/html' });
    const textBlob = new Blob([text], { type: 'text/plain' });
    
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': blob,
        'text/plain': textBlob
      })
    ]);
    
    const badgeStatus = showBadge ? ' (with date badge)' : ' (no badge - older post)';
    showNotification('Capture copied' + badgeStatus + '! Paste into Word.');
  } catch (error) {
    console.error('Copy failed:', error);
    showNotification('Failed to copy. Try again.', true);
  }
}

// Copy all captures
async function copyAllCaptures() {
  if (captures.length === 0) return;
  
  try {
    // Build HTML with all captures: screenshot + conditional date badge + URL hyperlink
    const htmlParts = captures.map(capture => {
      const showBadge = isCurrentYear(capture.date);
      
      let html = `
      <img src="${capture.screenshot}" style="max-width: 100%; height: auto;">`;
      
      // Only include date badge if from current year
      if (showBadge) {
        html += `
      <p style="margin: 10px 0;"><img src="${capture.dateBadge}" style="max-width: 300px; height: auto;"></p>`;
      }
      
      // Add URL as clickable hyperlink
      html += `
      <p style="margin: 10px 0;"><a href="${capture.url}">${capture.url}</a></p>
      <p style="margin: 20px 0;"></p>`;
      
      return html;
    });
    
    const html = htmlParts.join('\n');
    
    // Create plain text version (just URLs)
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
    
    // Count how many have badges
    const badgeCount = captures.filter(c => isCurrentYear(c.date)).length;
    const badgeInfo = badgeCount > 0 ? ` (${badgeCount} with date badges)` : ' (no badges - all older posts)';
    
    showNotification(`All ${captures.length} captures copied${badgeInfo}! Paste into Word.`);
  } catch (error) {
    console.error('Copy all failed:', error);
    showNotification('Failed to copy all. Try again.', true);
  }
}

// Delete a single capture
async function deleteCapture(index) {
  if (confirm('Delete this capture?')) {
    captures.splice(index, 1);
    await chrome.storage.local.set({ captures });
    displayCaptures();
    updateStats();
    showNotification('Capture deleted.');
  }
}

// Clear all captures
async function clearAll() {
  if (confirm(`Delete all ${captures.length} captures? This cannot be undone.`)) {
    captures = [];
    await chrome.storage.local.set({ captures: [] });
    displayCaptures();
    updateStats();
    showNotification('Archive cleared.');
  }
}

// Show notification
function showNotification(message, isError = false) {
  const notification = document.getElementById('notification');
  notification.textContent = message;
  notification.style.backgroundColor = isError ? '#e74c3c' : '#42b72a';
  notification.classList.add('show');
  
  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

// Event listeners
document.getElementById('copyAllBtn').addEventListener('click', copyAllCaptures);
document.getElementById('clearAllBtn').addEventListener('click', clearAll);

// Load captures on page load
loadCaptures();

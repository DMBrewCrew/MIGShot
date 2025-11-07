let captures = [];
let currentFilter = 'all'; // Track which tab is active

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
  renderTabs();
  displayCaptures();
  updateStats();
}

function renderTabs() {
  const tabsContainer = document.getElementById('tabs');
  
  if (captures.length === 0) {
    tabsContainer.style.display = 'none';
    return;
  }
  
  // Get unique platforms from captures
  const platformCounts = {};
  captures.forEach(capture => {
    const platform = capture.platform || 'Unknown';
    platformCounts[platform] = (platformCounts[platform] || 0) + 1;
  });
  
  // Sort platforms alphabetically
  const platforms = Object.keys(platformCounts).sort();
  
  // Build tabs HTML
  let tabsHTML = `<button class="tab ${currentFilter === 'all' ? 'active' : ''}" data-filter="all">
    All <span class="tab-count">(${captures.length})</span>
  </button>`;
  
  platforms.forEach(platform => {
    const count = platformCounts[platform];
    const isActive = currentFilter === platform;
    tabsHTML += `<button class="tab ${isActive ? 'active' : ''}" data-filter="${platform}">
      ${platform} <span class="tab-count">(${count})</span>
    </button>`;
  });
  
  tabsContainer.innerHTML = tabsHTML;
  tabsContainer.style.display = 'flex';
  
  // Add click listeners to tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const filter = e.target.closest('.tab').dataset.filter;
      currentFilter = filter;
      renderTabs();
      displayCaptures();
    });
  });
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
  
  // Filter captures based on current tab
  const filteredCaptures = currentFilter === 'all' 
    ? captures 
    : captures.filter(c => c.platform === currentFilter);
  
  if (filteredCaptures.length === 0) {
    capturesList.innerHTML = '<div style="padding: 40px; text-align: center; color: #999;">No captures for this platform yet.</div>';
    return;
  }
  
  // Display in REVERSE order (newest first at top, oldest last at bottom)
  const reversedForDisplay = [...filteredCaptures].reverse();
  
  capturesList.innerHTML = reversedForDisplay.map((capture, displayIndex) => {
    // Find original index in full captures array
    const originalIndex = captures.indexOf(capture);
    
    const captureDate = new Date(capture.capturedAt);
    const timeString = captureDate.toLocaleString();
    const hasDate = capture.date !== null;
    const show2025Badge = hasDate && isCurrentYear(capture.date);
    
    // Get platform info
    const platform = capture.platform || 'Unknown';
    
    // Only the first (newest) capture is expanded by default (when viewing "All")
    const isFirstInView = displayIndex === 0;
    const collapsedClass = isFirstInView ? '' : 'collapsed';
    
    // Capture number: newest (at end of array) gets highest number
    // originalIndex 0 (oldest) = #1, originalIndex N (newest) = #N+1
    const captureNumber = originalIndex + 1;
    
    return `
      <div class="capture-card ${collapsedClass}" data-index="${originalIndex}" draggable="true">
        <div class="capture-header">
          <div style="display: flex; align-items: center; gap: 10px;">
            <button class="collapse-btn" title="Expand/Collapse">▼</button>
            <span class="drag-handle" style="cursor: move; font-size: 16px; color: #999;">⋮⋮</span>
            <span class="platform-badge" style="background: #2B5F6F;">${platform}</span>
            ${capture.isAboutPage ? '<span class="platform-badge" style="background: #9b59b6;">📄 About Page</span>' : ''}
            <span class="capture-number">Capture #${captureNumber}</span>
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
                       data-index="${originalIndex}" 
                       value="${hasDate ? capture.date : ''}" 
                       placeholder="MM/DD/YYYY">
                <button class="btn-save-date" data-index="${originalIndex}">Save Date</button>
              </div>
              ${show2025Badge ? `<img src="${capture.dateBadge}" alt="Date badge" class="date-badge-preview">` : ''}
            </div>
            
            <div class="detail-item">
              <div class="detail-label">About Page</div>
              <label style="display: flex; align-items: center; font-size: 12px; cursor: pointer;">
                <input type="checkbox" 
                       class="about-page-checkbox" 
                       data-index="${originalIndex}" 
                       ${capture.isAboutPage ? 'checked' : ''}
                       style="margin-right: 6px; cursor: pointer; width: 14px; height: 14px; accent-color: #9b59b6;">
                <span>Mark as About Page</span>
              </label>
            </div>
            
            <div class="detail-item">
              <div class="detail-label">Post URL</div>
              <div class="detail-value"><a href="${capture.url}" target="_blank">${capture.url}</a></div>
            </div>
          </div>
        </div>
        
        <div class="capture-actions">
          <button class="btn btn-success btn-small copy-capture-btn" data-index="${originalIndex}">
            Copy This Capture
          </button>
          <button class="btn btn-small edit-capture-btn" data-index="${originalIndex}" style="background: linear-gradient(135deg, #9B9565 0%, #7a7550 100%); color: white;">
            ✏️ Edit Image
          </button>
          <button class="btn btn-danger btn-small delete-capture-btn" data-index="${originalIndex}">
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
  
  // Add event listeners for About Page checkboxes
  document.querySelectorAll('.about-page-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', async (e) => {
      const index = parseInt(e.target.dataset.index);
      await toggleAboutPage(index, e.target.checked);
    });
  });
  
  // Add event listeners for copy/delete
  document.querySelectorAll('.copy-capture-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      copySingleCapture(index);
    });
  });
  
  document.querySelectorAll('.edit-capture-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      openImageEditor(index);
    });
  });
  
  document.querySelectorAll('.delete-capture-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      deleteCapture(index);
    });
  });
  
  // Add collapse button listeners
  document.querySelectorAll('.collapse-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // Don't trigger drag
      const card = e.target.closest('.capture-card');
      card.classList.toggle('collapsed');
    });
  });
  
  // Add drag and drop functionality
  setupDragAndDrop();
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
  renderTabs();
  displayCaptures();
  showNotification(`Date saved: ${dateStr}`);
}

async function toggleAboutPage(index, isChecked) {
  captures[index].isAboutPage = isChecked;
  await chrome.storage.local.set({ captures });
  renderTabs();
  displayCaptures();
  updateStats();
  showNotification(isChecked ? 'Marked as About Page' : 'Unmarked as About Page');
}

function updateStats() {
  const stats = document.getElementById('stats');
  const withDates = captures.filter(c => c.date).length;
  const without = captures.length - withDates;
  const aboutPages = captures.filter(c => c.isAboutPage).length;
  
  let statsText = `Total: ${captures.length} | With dates: ${withDates} | Without: ${without}`;
  if (aboutPages > 0) {
    statsText += ` | About Pages: ${aboutPages}`;
  }
  
  stats.textContent = statsText;
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
    // Get captures in DOM order (respects manual reordering)
    const captureCards = Array.from(document.querySelectorAll('.capture-card'));
    const orderedCaptures = captureCards.map(card => {
      const index = parseInt(card.dataset.index);
      return captures[index];
    });
    
    // REVERSE for pasting (oldest first, newest last)
    const reversedCaptures = [...orderedCaptures].reverse();
    
    const htmlParts = reversedCaptures.map(capture => {
      const showBadge = capture.date && isCurrentYear(capture.date);
      
      let html = `<img src="${capture.screenshot}" style="max-width: 100%; height: auto;">`;
      
      if (showBadge && capture.dateBadge) {
        html += `<p style="margin: 10px 0;"><img src="${capture.dateBadge}" style="max-width: 300px; height: auto;"></p>`;
      }
      
      html += `<p style="margin: 10px 0;"><a href="${capture.url}">${capture.url}</a></p><p style="margin: 20px 0;"></p>`;
      
      return html;
    });
    
    const html = htmlParts.join('\n');
    const textParts = reversedCaptures.map(capture => `${capture.url}\n`);
    const text = textParts.join('\n');
    
    const blob = new Blob([html], { type: 'text/html' });
    const textBlob = new Blob([text], { type: 'text/plain' });
    
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': blob,
        'text/plain': textBlob
      })
    ]);
    
    const badgeCount = reversedCaptures.filter(c => c.date && isCurrentYear(c.date)).length;
    const badgeInfo = badgeCount > 0 ? ` (${badgeCount} with date badges)` : '';
    const filterInfo = currentFilter === 'all' ? '' : ` from ${currentFilter}`;
    
    showNotification(`${reversedCaptures.length} capture${reversedCaptures.length !== 1 ? 's' : ''}${filterInfo} copied in chronological order${badgeInfo}!`);
  } catch (error) {
    console.error('Copy all failed:', error);
    showNotification('Failed to copy all', true);
  }
}

// Drag and drop functionality
let draggedElement = null;

function setupDragAndDrop() {
  const cards = document.querySelectorAll('.capture-card');
  
  cards.forEach(card => {
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragover', handleDragOver);
    card.addEventListener('drop', handleDrop);
    card.addEventListener('dragend', handleDragEnd);
  });
}

function handleDragStart(e) {
  draggedElement = this;
  this.style.opacity = '0.4';
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.dataTransfer.dropEffect = 'move';
  
  // Add visual indicator
  const afterElement = getDragAfterElement(e.currentTarget.parentElement, e.clientY);
  if (afterElement == null) {
    e.currentTarget.parentElement.appendChild(draggedElement);
  } else {
    e.currentTarget.parentElement.insertBefore(draggedElement, afterElement);
  }
  
  return false;
}

function handleDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }
  return false;
}

function handleDragEnd(e) {
  this.style.opacity = '1';
  // Numbers stay with their captures - no renumbering
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.capture-card:not(.dragging)')];
  
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}


async function deleteCapture(index) {
  if (confirm('Delete this capture?')) {
    captures.splice(index, 1);
    await chrome.storage.local.set({ captures });
    renderTabs(); // Refresh tabs after deletion
    displayCaptures();
    updateStats();
    showNotification('Capture deleted.');
  }
}

async function clearAll() {
  if (confirm(`Delete all ${captures.length} captures? This cannot be undone.`)) {
    captures = [];
    currentFilter = 'all'; // Reset filter
    await chrome.storage.local.set({ captures: [] });
    renderTabs();
    displayCaptures();
    updateStats();
    showNotification('Archive cleared.');
  }
}

function showNotification(message, isError = false) {
  const notification = document.getElementById('notification');
  notification.textContent = message;
  notification.style.background = isError ? 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)' : 'linear-gradient(135deg, #9B9565 0%, #7a7550 100%)';
  notification.classList.add('show');
  
  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

document.getElementById('copyAllBtn').addEventListener('click', copyAllCaptures);
document.getElementById('clearAllBtn').addEventListener('click', clearAll);

// Image Editor Variables
let editorCanvas, editorCtx;
let currentEditIndex = null;
let currentTool = null;
let isDrawing = false;
let drawHistory = [];
let currentStroke = [];

// Arrow drawing
let arrowStart = null;

// Initialize editor
function initializeEditor() {
  editorCanvas = document.getElementById('editorCanvas');
  editorCtx = editorCanvas.getContext('2d');
  
  // Tool selection
  document.getElementById('highlightTool').addEventListener('click', () => {
    selectTool('highlight');
  });
  
  document.getElementById('arrowTool').addEventListener('click', () => {
    selectTool('arrow');
  });
  
  document.getElementById('undoBtn').addEventListener('click', undoLastAction);
  document.getElementById('clearBtn').addEventListener('click', clearAllEdits);
  document.getElementById('cancelEditBtn').addEventListener('click', closeEditor);
  document.getElementById('saveEditBtn').addEventListener('click', saveEditedImage);
  
  // Canvas events
  editorCanvas.addEventListener('mousedown', handleCanvasMouseDown);
  editorCanvas.addEventListener('mousemove', handleCanvasMouseMove);
  editorCanvas.addEventListener('mouseup', handleCanvasMouseUp);
}

function selectTool(tool) {
  currentTool = tool;
  
  // Update button states
  document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
  
  if (tool === 'highlight') {
    document.getElementById('highlightTool').classList.add('active');
    editorCanvas.style.cursor = 'crosshair';
  } else if (tool === 'arrow') {
    document.getElementById('arrowTool').classList.add('active');
    editorCanvas.style.cursor = 'crosshair';
  }
}

function openImageEditor(index) {
  // Open editor in new tab with the capture index
  const editorUrl = chrome.runtime.getURL('editor.html') + '?index=' + index;
  window.open(editorUrl, '_blank');
}

function closeEditor() {
  document.getElementById('editorModal').classList.remove('show');
  currentEditIndex = null;
  currentTool = null;
  
  // Reset canvas styling
  editorCanvas.style.width = '';
  editorCanvas.style.height = '';
}

function handleCanvasMouseDown(e) {
  if (!currentTool) {
    showNotification('Please select a tool first', true);
    return;
  }
  
  const rect = editorCanvas.getBoundingClientRect();
  const scale = parseFloat(editorCanvas.dataset.scale) || 1;
  
  // Convert display coordinates to actual canvas coordinates
  const x = (e.clientX - rect.left) / scale;
  const y = (e.clientY - rect.top) / scale;
  
  if (currentTool === 'highlight') {
    isDrawing = true;
    currentStroke = [{ x, y }];
    
    // Check if shift is held for straight lines
    if (e.shiftKey && drawHistory.length > 0) {
      // Find last highlight point to draw straight line from
      for (let i = drawHistory.length - 1; i >= 0; i--) {
        if (drawHistory[i].type === 'highlight' && drawHistory[i].points.length > 0) {
          const lastPoint = drawHistory[i].points[drawHistory[i].points.length - 1];
          currentStroke = [lastPoint, { x, y }];
          break;
        }
      }
    }
  } else if (currentTool === 'arrow') {
    arrowStart = { x, y };
  }
}

function handleCanvasMouseMove(e) {
  if (!currentTool) return;
  
  const rect = editorCanvas.getBoundingClientRect();
  const scale = parseFloat(editorCanvas.dataset.scale) || 1;
  
  // Convert display coordinates to actual canvas coordinates
  const x = (e.clientX - rect.left) / scale;
  const y = (e.clientY - rect.top) / scale;
  
  if (currentTool === 'highlight' && isDrawing) {
    // Add point to current stroke
    if (e.shiftKey && currentStroke.length > 0) {
      // Shift held - update last point for straight line
      currentStroke = [currentStroke[0], { x, y }];
    } else {
      // Normal drawing - add points
      currentStroke.push({ x, y });
    }
    
    // IMMEDIATE FEEDBACK - redraw everything including current stroke
    redrawCanvas();
    drawHighlightStroke(currentStroke, true); // true = preview mode
  } else if (currentTool === 'arrow' && arrowStart) {
    // Preview arrow
    redrawCanvas();
    drawArrow(arrowStart.x, arrowStart.y, x, y, true);
  }
}

function handleCanvasMouseUp(e) {
  if (!currentTool) return;
  
  const rect = editorCanvas.getBoundingClientRect();
  const scale = parseFloat(editorCanvas.dataset.scale) || 1;
  
  // Convert display coordinates to actual canvas coordinates
  const x = (e.clientX - rect.left) / scale;
  const y = (e.clientY - rect.top) / scale;
  
  if (currentTool === 'highlight' && isDrawing) {
    isDrawing = false;
    if (currentStroke.length > 0) {
      // Save the stroke to history
      drawHistory.push({
        type: 'highlight',
        points: [...currentStroke] // Copy array
      });
      currentStroke = [];
      redrawCanvas(); // Final redraw
    }
  } else if (currentTool === 'arrow' && arrowStart) {
    drawHistory.push({
      type: 'arrow',
      start: arrowStart,
      end: { x, y }
    });
    arrowStart = null;
    redrawCanvas();
  }
}

function drawHighlightStroke(points, isPreview = false) {
  if (points.length < 1) return;
  
  // Save the current composite operation
  const previousComposite = editorCtx.globalCompositeOperation;
  
  // Use MULTIPLY blend mode - this is the KEY to Snipping Tool's readable highlights!
  // Multiply keeps black text dark while coloring the light background
  // This prevents the "washed out" effect that makes text hard to read
  editorCtx.globalCompositeOperation = 'multiply';
  
  // Snipping Tool yellow with proper opacity
  // #FFEB3B (255, 235, 59) at 35% opacity is the sweet spot
  editorCtx.strokeStyle = 'rgba(255, 235, 59, 0.35)';
  editorCtx.lineWidth = 20; // 18-22px range for that authentic marker feel
  editorCtx.lineCap = 'round';
  editorCtx.lineJoin = 'round';
  
  if (points.length === 1) {
    // Single point - draw a circle
    editorCtx.beginPath();
    editorCtx.arc(points[0].x, points[0].y, 10, 0, Math.PI * 2);
    editorCtx.fillStyle = 'rgba(255, 235, 59, 0.35)';
    editorCtx.fill();
  } else {
    editorCtx.beginPath();
    editorCtx.moveTo(points[0].x, points[0].y);
    
    for (let i = 1; i < points.length; i++) {
      editorCtx.lineTo(points[i].x, points[i].y);
    }
    
    editorCtx.stroke();
  }
  
  // Restore the previous composite operation
  editorCtx.globalCompositeOperation = previousComposite;
}

function drawArrow(fromX, fromY, toX, toY, isPreview = false) {
  const headLength = 15; // Length of arrow head
  const dx = toX - fromX;
  const dy = toY - fromY;
  const angle = Math.atan2(dy, dx);
  
  editorCtx.strokeStyle = '#e74c3c'; // Red
  editorCtx.fillStyle = '#e74c3c';
  editorCtx.lineWidth = 3;
  editorCtx.lineCap = 'round';
  
  // Draw arrow line
  editorCtx.beginPath();
  editorCtx.moveTo(fromX, fromY);
  editorCtx.lineTo(toX, toY);
  editorCtx.stroke();
  
  // Draw arrow head
  editorCtx.beginPath();
  editorCtx.moveTo(toX, toY);
  editorCtx.lineTo(
    toX - headLength * Math.cos(angle - Math.PI / 6),
    toY - headLength * Math.sin(angle - Math.PI / 6)
  );
  editorCtx.lineTo(
    toX - headLength * Math.cos(angle + Math.PI / 6),
    toY - headLength * Math.sin(angle + Math.PI / 6)
  );
  editorCtx.closePath();
  editorCtx.fill();
}

function redrawCanvas() {
  const capture = captures[currentEditIndex];
  const img = new Image();
  img.onload = function() {
    // Clear and redraw image at actual size
    editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
    editorCtx.drawImage(img, 0, 0);
    
    // Redraw all history
    drawHistory.forEach(action => {
      if (action.type === 'highlight') {
        drawHighlightStroke(action.points);
      } else if (action.type === 'arrow') {
        drawArrow(action.start.x, action.start.y, action.end.x, action.end.y);
      }
    });
  };
  img.src = capture.screenshot;
}

function undoLastAction() {
  if (drawHistory.length > 0) {
    drawHistory.pop();
    redrawCanvas();
    showNotification('Undo successful');
  } else {
    showNotification('Nothing to undo', true);
  }
}

function clearAllEdits() {
  if (confirm('Clear all edits?')) {
    drawHistory = [];
    redrawCanvas();
    showNotification('All edits cleared');
  }
}

async function saveEditedImage() {
  if (drawHistory.length === 0) {
    showNotification('No edits to save', true);
    return;
  }
  
  // Convert canvas to base64
  const editedImageData = editorCanvas.toDataURL('image/png');
  
  // Update capture
  captures[currentEditIndex].screenshot = editedImageData;
  await chrome.storage.local.set({ captures });
  
  closeEditor();
  renderTabs();
  displayCaptures();
  showNotification('Image updated successfully!');
}

// Initialize editor when page loads
// Editor initialization no longer needed - editor opens in new tab
// initializeEditor();

loadCaptures();

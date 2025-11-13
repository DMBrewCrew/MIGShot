// Global state
let allCaptures = [];
let allCases = [];
let currentCaseKey = null; // Format: "caseName|||caseMIG" or "uncategorized"
let currentSubject = null;
let currentPlatform = 'all';

// Helper function to check if date is current year
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

// Initialize archive
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  renderCaseDropdown();
  setupEventListeners();
  setupAutoRefresh();
});

// Load all data from storage
async function loadData() {
  const result = await chrome.storage.local.get(['captures', 'cases']);
  allCaptures = result.captures || [];
  allCases = result.cases || [];
  
  // Update stats
  document.getElementById('stats').textContent = `Total: ${allCaptures.length} capture${allCaptures.length !== 1 ? 's' : ''}`;
}

// Setup auto-refresh when storage changes
function setupAutoRefresh() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.captures) {
      const oldLength = changes.captures.oldValue?.length || 0;
      const newLength = changes.captures.newValue?.length || 0;
      
      if (newLength > oldLength) {
        // New capture(s) added
        showToast(`✓ ${newLength - oldLength} new capture(s) added!`);
        loadData().then(() => {
          renderCurrentView();
        });
      } else if (newLength < oldLength) {
        // Capture(s) deleted
        loadData().then(() => {
          renderCurrentView();
        });
      }
    }
  });
}

// Organize captures by case/subject/platform
function organizeCaptures() {
  const organized = {
    cases: {},
    uncategorized: []
  };
  
  allCaptures.forEach((capture, index) => {
    capture.originalIndex = index;
    
    if (capture.caseName && capture.caseMIG && capture.subjectName) {
      const caseKey = `${capture.caseName}|||${capture.caseMIG}`;
      
      if (!organized.cases[caseKey]) {
        organized.cases[caseKey] = {
          caseName: capture.caseName,
          caseMIG: capture.caseMIG,
          subjects: {}
        };
      }
      
      if (!organized.cases[caseKey].subjects[capture.subjectName]) {
        organized.cases[caseKey].subjects[capture.subjectName] = {};
      }
      
      const platform = capture.platform || 'Other';
      if (!organized.cases[caseKey].subjects[capture.subjectName][platform]) {
        organized.cases[caseKey].subjects[capture.subjectName][platform] = [];
      }
      
      organized.cases[caseKey].subjects[capture.subjectName][platform].push(capture);
    } else {
      organized.uncategorized.push(capture);
    }
  });
  
  return organized;
}

// Render case dropdown
function renderCaseDropdown() {
  const dropdown = document.getElementById('caseDropdown');
  const organized = organizeCaptures();
  
  dropdown.innerHTML = '';
  
  // Add uncategorized option if exists
  if (organized.uncategorized.length > 0) {
    const option = document.createElement('option');
    option.value = 'uncategorized';
    option.textContent = `📂 Uncategorized Captures (${organized.uncategorized.length})`;
    dropdown.appendChild(option);
  }
  
  // Add cases
  Object.entries(organized.cases).forEach(([caseKey, caseData]) => {
    const option = document.createElement('option');
    option.value = caseKey;
    const captureCount = Object.values(caseData.subjects).reduce((sum, subject) => {
      return sum + Object.values(subject).reduce((subSum, captures) => subSum + captures.length, 0);
    }, 0);
    option.textContent = `📁 ${caseData.caseName} (${caseData.caseMIG}) - ${captureCount} captures`;
    dropdown.appendChild(option);
  });
  
  // If nothing, show empty state
  if (dropdown.children.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No captures yet';
    dropdown.appendChild(option);
    return;
  }
  
  // Select first option and render
  currentCaseKey = dropdown.children[0].value;
  dropdown.value = currentCaseKey;
  renderSubjectTabs();
}

// Render subject tabs
function renderSubjectTabs() {
  const container = document.getElementById('subjectTabs');
  container.innerHTML = '';
  
  if (!currentCaseKey || currentCaseKey === 'uncategorized') {
    container.classList.add('hidden');
    currentSubject = null;
    renderPlatformTabs();
    return;
  }
  
  container.classList.remove('hidden');
  const organized = organizeCaptures();
  const caseData = organized.cases[currentCaseKey];
  
  if (!caseData) return;
  
  // Find primary subject
  const caseInfo = allCases.find(c => `${c.name}|||${c.mig}` === currentCaseKey);
  const primarySubject = caseInfo?.primarySubject || caseData.caseName;
  
  // Create tab for each subject
  Object.keys(caseData.subjects).forEach(subjectName => {
    const tab = document.createElement('button');
    tab.className = 'subject-tab';
    tab.textContent = subjectName;
    
    if (subjectName === primarySubject) {
      const badge = document.createElement('span');
      badge.className = 'subject-badge';
      badge.textContent = 'PRIMARY';
      tab.appendChild(badge);
    }
    
    tab.addEventListener('click', () => {
      document.querySelectorAll('.subject-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentSubject = subjectName;
      renderPlatformTabs();
    });
    
    container.appendChild(tab);
  });
  
  // Select first subject
  if (container.children.length > 0) {
    currentSubject = Object.keys(caseData.subjects)[0];
    container.children[0].classList.add('active');
    renderPlatformTabs();
  }
}

// Render platform tabs
function renderPlatformTabs() {
  const container = document.getElementById('platformTabs');
  container.innerHTML = '';
  
  const organized = organizeCaptures();
  let platforms = {};
  
  if (currentCaseKey === 'uncategorized') {
    // Get platforms from uncategorized
    organized.uncategorized.forEach(capture => {
      const platform = capture.platform || 'Other';
      platforms[platform] = (platforms[platform] || 0) + 1;
    });
  } else if (currentCaseKey && currentSubject) {
    // Get platforms from current case/subject
    const caseData = organized.cases[currentCaseKey];
    if (caseData && caseData.subjects[currentSubject]) {
      platforms = Object.keys(caseData.subjects[currentSubject]).reduce((acc, platform) => {
        acc[platform] = caseData.subjects[currentSubject][platform].length;
        return acc;
      }, {});
    }
  }
  
  // Calculate total
  const total = Object.values(platforms).reduce((sum, count) => sum + count, 0);
  
  // Add "All" tab
  const allTab = document.createElement('button');
  allTab.className = 'platform-tab' + (currentPlatform === 'all' ? ' active' : '');
  allTab.innerHTML = `All <span class="platform-count">(${total})</span>`;
  allTab.addEventListener('click', () => {
    document.querySelectorAll('.platform-tab').forEach(t => t.classList.remove('active'));
    allTab.classList.add('active');
    currentPlatform = 'all';
    renderCaptures();
  });
  container.appendChild(allTab);
  
  // Add platform tabs
  Object.entries(platforms).sort().forEach(([platform, count]) => {
    const tab = document.createElement('button');
    tab.className = 'platform-tab' + (currentPlatform === platform ? ' active' : '');
    tab.innerHTML = `${getPlatformIcon(platform)} ${platform} <span class="platform-count">(${count})</span>`;
    tab.addEventListener('click', () => {
      document.querySelectorAll('.platform-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentPlatform = platform;
      renderCaptures();
    });
    container.appendChild(tab);
  });
  
  // Add Copy All button
  const copyAllBtn = document.createElement('button');
  copyAllBtn.className = 'btn btn-success btn-small';
  copyAllBtn.textContent = '📋 Copy All';
  copyAllBtn.style.marginLeft = 'auto';
  copyAllBtn.addEventListener('click', copyAllCurrentView);
  container.appendChild(copyAllBtn);
  
  // Render captures
  renderCaptures();
}

// Get platform icon
function getPlatformIcon(platform) {
  const icons = {
    'Facebook': '📘',
    'Instagram': '📷',
    'TikTok': '🎵',
    'Twitter': '🐦',
    'X': '❌',
    'LinkedIn': '💼',
    'YouTube': '📺',
    'Other': '🌐'
  };
  return icons[platform] || '🌐';
}

// Get filtered captures based on current selections
function getFilteredCaptures() {
  const organized = organizeCaptures();
  let filtered = [];
  
  if (currentCaseKey === 'uncategorized') {
    filtered = organized.uncategorized;
  } else if (currentCaseKey && currentSubject) {
    const caseData = organized.cases[currentCaseKey];
    if (caseData && caseData.subjects[currentSubject]) {
      if (currentPlatform === 'all') {
        // All platforms
        Object.values(caseData.subjects[currentSubject]).forEach(captures => {
          filtered.push(...captures);
        });
      } else {
        // Specific platform
        filtered = caseData.subjects[currentSubject][currentPlatform] || [];
      }
    }
  }
  
  // Filter by platform if not "all"
  if (currentPlatform !== 'all' && currentCaseKey === 'uncategorized') {
    filtered = filtered.filter(c => (c.platform || 'Other') === currentPlatform);
  }
  
  return filtered;
}

// Render captures (v6.7 style cards)
function renderCaptures() {
  const container = document.getElementById('capturesContainer');
  const filtered = getFilteredCaptures();
  
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <div class="empty-text">No captures found</div>
        <div class="empty-subtext">Try selecting a different case, subject, or platform</div>
      </div>
    `;
    return;
  }
  
  // Reverse for display (newest first)
  const reversed = [...filtered].reverse();
  
  container.innerHTML = '';
  
  reversed.forEach((capture, displayIndex) => {
    const card = createCaptureCard(capture, displayIndex);
    container.appendChild(card);
  });
  
  // Setup drag and drop
  setupDragAndDrop();
}

// Setup drag and drop for reordering
function setupDragAndDrop() {
  const cards = document.querySelectorAll('.capture-card');
  
  cards.forEach(card => {
    const dragHandle = card.querySelector('.drag-handle');
    
    dragHandle.addEventListener('mousedown', () => {
      card.setAttribute('draggable', 'true');
    });
    
    card.addEventListener('dragstart', (e) => {
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      card.setAttribute('draggable', 'false');
    });
    
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      const dragging = document.querySelector('.dragging');
      if (!dragging) return;
      
      const cards = [...document.querySelectorAll('.capture-card:not(.dragging)')];
      const nextCard = cards.find(c => {
        const box = c.getBoundingClientRect();
        const offset = e.clientY - box.top - box.height / 2;
        return offset < 0;
      });
      
      const container = document.getElementById('capturesContainer');
      if (nextCard) {
        container.insertBefore(dragging, nextCard);
      } else {
        container.appendChild(dragging);
      }
    });
    
    card.addEventListener('drop', async (e) => {
      e.preventDefault();
      await saveReorderedCaptures();
    });
  });
}

// Save reordered captures
async function saveReorderedCaptures() {
  const cards = document.querySelectorAll('.capture-card');
  const newOrder = [];
  
  // Get the current filtered captures
  const filtered = getFilteredCaptures();
  const reversedFiltered = [...filtered].reverse();
  
  // Build new order based on card positions
  cards.forEach(card => {
    const index = parseInt(card.getAttribute('data-index'));
    const capture = allCaptures[index];
    if (capture) {
      newOrder.push(index);
    }
  });
  
  // Reverse to match storage order (oldest first in array)
  newOrder.reverse();
  
  // Reorder only the filtered captures in the main array
  const reorderedFiltered = newOrder.map(idx => allCaptures[idx]);
  
  // Replace the filtered captures in their positions
  reversedFiltered.forEach((oldCapture, i) => {
    allCaptures[oldCapture.originalIndex] = reorderedFiltered[i];
  });
  
  await saveCaptures();
  showToast('✓ Order saved');
}

// Create capture card (v6.7 style)
function createCaptureCard(capture, displayIndex) {
  const card = document.createElement('div');
  card.className = 'capture-card' + (displayIndex !== 0 ? ' collapsed' : '');
  card.setAttribute('data-index', capture.originalIndex);
  
  const captureDate = new Date(capture.capturedAt);
  const timeString = captureDate.toLocaleString();
  const hasDate = capture.date !== null;
  const showBadge = hasDate && isCurrentYear(capture.date);
  const platform = capture.platform || 'Unknown';
  const captureNumber = capture.originalIndex + 1;
  const hasNotes = capture.notes && capture.notes.trim() !== '';
  
  card.innerHTML = `
    <div class="capture-header">
      <div class="capture-header-left">
        <button class="collapse-btn">▼</button>
        <span class="drag-handle">⋮⋮</span>
        <span class="platform-badge">${platform}</span>
        ${capture.isAboutPage ? '<span class="platform-badge" style="background: #9b59b6;">📄 About Page</span>' : ''}
        <span class="capture-number">Capture #${captureNumber}</span>
      </div>
      <span class="capture-time">${timeString}</span>
    </div>
    
    <div class="capture-content">
      <div class="capture-left">
        <img src="${capture.screenshot}" alt="Screenshot" class="capture-screenshot">
      </div>
      
      <div class="capture-center">
        <div class="detail-item">
          <div class="detail-label">Post Date</div>
          <div class="date-input-wrapper">
            <input type="text" 
                   class="date-input" 
                   data-index="${capture.originalIndex}" 
                   value="${hasDate ? capture.date : ''}" 
                   placeholder="MM/DD/YYYY">
            <button class="btn-save-date" data-index="${capture.originalIndex}">Save</button>
          </div>
          ${showBadge ? `<img src="${capture.dateBadge}" alt="Date badge" class="date-badge-preview">` : ''}
        </div>
        
        <div class="detail-item">
          <div class="detail-label">About Page</div>
          <label style="display: flex; align-items: center; font-size: 11px; cursor: pointer;">
            <input type="checkbox" 
                   class="about-page-checkbox" 
                   data-index="${capture.originalIndex}" 
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
      
      <div class="capture-right">
        <div class="capture-actions">
          <button class="btn btn-notes ${hasNotes ? 'has-notes' : ''} notes-btn" data-index="${capture.originalIndex}">
            ${hasNotes ? '📝 Edit Notes' : '➕ Add Notes'}
          </button>
          <button class="btn btn-success copy-btn" data-index="${capture.originalIndex}">
            📋 Copy
          </button>
          <button class="btn btn-gold edit-btn" data-index="${capture.originalIndex}">
            ✏️ Edit
          </button>
          <button class="btn btn-danger delete-btn" data-index="${capture.originalIndex}">
            🗑️ Delete
          </button>
        </div>
      </div>
    </div>
  `;
  
  // Add event listeners
  const collapseBtn = card.querySelector('.collapse-btn');
  collapseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    card.classList.toggle('collapsed');
  });
  
  const saveDateBtn = card.querySelector('.btn-save-date');
  saveDateBtn.addEventListener('click', () => saveDate(capture.originalIndex));
  
  const notesBtn = card.querySelector('.notes-btn');
  notesBtn.addEventListener('click', () => openNotesModal(capture.originalIndex));
  
  const aboutCheckbox = card.querySelector('.about-page-checkbox');
  aboutCheckbox.addEventListener('change', (e) => toggleAboutPage(capture.originalIndex, e.target.checked));
  
  const copyBtn = card.querySelector('.copy-btn');
  copyBtn.addEventListener('click', () => copySingleCapture(capture.originalIndex));
  
  const editBtn = card.querySelector('.edit-btn');
  editBtn.addEventListener('click', () => openEditor(capture.originalIndex));
  
  const deleteBtn = card.querySelector('.delete-btn');
  deleteBtn.addEventListener('click', () => deleteCapture(capture.originalIndex));
  
  return card;
}

// Render current view (used by auto-refresh)
function renderCurrentView() {
  renderCaseDropdown();
}

// Setup event listeners
function setupEventListeners() {
  // Case dropdown change
  document.getElementById('caseDropdown').addEventListener('change', (e) => {
    currentCaseKey = e.target.value;
    currentSubject = null;
    currentPlatform = 'all';
    renderSubjectTabs();
  });
  
  // Clear All button
  document.getElementById('clearAllBtn').addEventListener('click', clearAll);
}

// Save date
async function saveDate(index) {
  const input = document.querySelector(`input.date-input[data-index="${index}"]`);
  const dateStr = input.value.trim();
  
  if (!dateStr) {
    showToast('Please enter a date', true);
    return;
  }
  
  // Validate date format (MM/DD/YYYY)
  const datePattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const match = dateStr.match(datePattern);
  
  if (!match) {
    showToast('Please use MM/DD/YYYY format', true);
    return;
  }
  
  const month = parseInt(match[1]);
  const day = parseInt(match[2]);
  const year = parseInt(match[3]);
  
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2004 || year > 2100) {
    showToast('Invalid date', true);
    return;
  }
  
  // Update capture
  allCaptures[index].date = dateStr;
  
  // Generate date badge only if current year
  if (isCurrentYear(dateStr)) {
    const response = await chrome.runtime.sendMessage({ 
      action: 'generateDateBadge', 
      date: dateStr 
    });
    allCaptures[index].dateBadge = response.dateBadge;
  } else {
    allCaptures[index].dateBadge = null;
  }
  
  await saveCaptures();
  renderCaptures();
  showToast('✓ Date saved');
}

// Save notes
async function saveNotes(index) {
  const textarea = document.querySelector(`textarea.notes-textarea[data-index="${index}"]`);
  const notes = textarea.value.trim();
  
  allCaptures[index].notes = notes;
  await saveCaptures();
  showToast('✓ Notes saved');
}

// Open notes modal
function openNotesModal(index) {
  const capture = allCaptures[index];
  if (!capture) return;
  
  const hasNotes = capture.notes && capture.notes.trim() !== '';
  
  // Create modal
  const modal = document.createElement('div');
  modal.className = 'notes-modal';
  modal.innerHTML = `
    <div class="notes-modal-content">
      <div class="notes-modal-header">
        <div class="notes-modal-title">📝 Capture Notes</div>
        <button class="notes-modal-close">×</button>
      </div>
      <textarea class="notes-textarea" data-index="${index}" placeholder="Add notes about this capture...">${capture.notes || ''}</textarea>
      <div class="copy-option">
        <input type="checkbox" 
               id="includeNotesModal-${index}" 
               class="include-notes-checkbox"
               data-index="${index}"
               ${capture.includeNotesWhenCopying !== false ? 'checked' : ''}>
        <label for="includeNotesModal-${index}">Include these notes when copying this capture</label>
      </div>
      <div class="notes-modal-actions">
        <button class="btn btn-primary">💾 Save Notes</button>
        <button class="btn btn-danger">Cancel</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Focus textarea
  const textarea = modal.querySelector('.notes-textarea');
  textarea.focus();
  
  // Close handlers
  const closeModal = () => {
    modal.remove();
  };
  
  modal.querySelector('.notes-modal-close').addEventListener('click', closeModal);
  modal.querySelector('.btn-danger').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  // Save handler
  modal.querySelector('.btn-primary').addEventListener('click', async () => {
    const notes = textarea.value.trim();
    const checkbox = modal.querySelector('.include-notes-checkbox');
    
    allCaptures[index].notes = notes;
    // If notes exist, save the checkbox state. If empty notes, set to false.
    allCaptures[index].includeNotesWhenCopying = notes ? checkbox.checked : false;
    
    await saveCaptures();
    showToast('✓ Notes saved');
    closeModal();
    renderCaptures(); // Re-render to update button text
  });
  
  // Escape key to close
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

// Toggle about page
async function toggleAboutPage(index, isAboutPage) {
  allCaptures[index].isAboutPage = isAboutPage;
  await saveCaptures();
  renderCaptures();
  showToast(isAboutPage ? '✓ Marked as About Page' : '✓ Unmarked as About Page');
}

// Open editor
function openEditor(index) {
  const capture = allCaptures[index];
  if (!capture) return;
  
  chrome.tabs.create({ url: chrome.runtime.getURL(`editor.html?index=${index}`) });
}

// Delete capture
async function deleteCapture(index) {
  if (!confirm('Delete this capture?')) return;
  
  allCaptures.splice(index, 1);
  await saveCaptures();
  await loadData();
  renderCurrentView();
  showToast('✓ Deleted');
}

// Clear all captures
async function clearAll() {
  if (allCaptures.length === 0) {
    showToast('Archive is already empty', true);
    return;
  }
  
  if (!confirm(`Delete all ${allCaptures.length} captures? This cannot be undone!`)) {
    return;
  }
  
  allCaptures = [];
  await saveCaptures();
  await loadData();
  renderCaseDropdown();
  showToast('✓ Archive cleared');
}

// Copy single capture
async function copySingleCapture(index) {
  const capture = allCaptures[index];
  if (!capture) return;
  
  try {
    const showBadge = capture.date && isCurrentYear(capture.date);
    
    // Check the stored preference for including notes
    const includeNotes = capture.includeNotesWhenCopying === true;
    
    // Build HTML with separate images
    let html = `<img src="${capture.screenshot}" style="max-width: 100%; height: auto;">`;
    
    // Add date badge as separate image if exists
    if (showBadge && capture.dateBadge) {
      html += `<p style="margin: 10px 0;"><img src="${capture.dateBadge}" style="max-width: 300px; height: auto;"></p>`;
    }
    
    // Add clickable URL link (not on image)
    if (!capture.isAboutPage) {
      html += `<p style="margin: 10px 0;"><a href="${capture.url}">${capture.url}</a></p>`;
    }
    
    // Add notes if enabled and notes exist
    if (includeNotes && capture.notes && capture.notes.trim()) {
      html += `<p style="margin: 10px 0; padding: 10px; background: #f8f9fa; border-left: 3px solid #2B5F6F; font-size: 13px;"><strong>Notes:</strong> ${capture.notes}</p>`;
    }
    
    // Plain text version
    let text = capture.isAboutPage ? '' : capture.url;
    if (includeNotes && capture.notes && capture.notes.trim()) {
      text += (text ? '\n\n' : '') + 'Notes: ' + capture.notes;
    }
    
    const htmlBlob = new Blob([html], { type: 'text/html' });
    const textBlob = new Blob([text], { type: 'text/plain' });
    
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': htmlBlob,
        'text/plain': textBlob
      })
    ]);
    
    const badgeStatus = showBadge ? ' (with date badge)' : '';
    const notesStatus = includeNotes && capture.notes && capture.notes.trim() ? ' (with notes)' : '';
    showToast('✓ Copied to clipboard' + badgeStatus + notesStatus + '!');
  } catch (error) {
    console.error('Copy error:', error);
    showToast('❌ Copy failed', true);
  }
}

// Copy all captures in current view
async function copyAllCurrentView() {
  const filtered = getFilteredCaptures();
  
  if (filtered.length === 0) {
    showToast('No captures to copy', true);
    return;
  }
  
  try {
    // Reverse so oldest is first when pasted
    const reversed = [...filtered].reverse();
    
    const htmlParts = reversed.map(capture => {
      const showBadge = capture.date && isCurrentYear(capture.date);
      const includeNotes = capture.includeNotesWhenCopying === true;
      
      let html = `<img src="${capture.screenshot}" style="max-width: 100%; height: auto;">`;
      
      if (showBadge && capture.dateBadge) {
        html += `<p style="margin: 10px 0;"><img src="${capture.dateBadge}" style="max-width: 300px; height: auto;"></p>`;
      }
      
      if (!capture.isAboutPage) {
        html += `<p style="margin: 10px 0;"><a href="${capture.url}">${capture.url}</a></p>`;
      }
      
      // Add notes if enabled and notes exist
      if (includeNotes && capture.notes && capture.notes.trim()) {
        html += `<p style="margin: 10px 0; padding: 10px; background: #f8f9fa; border-left: 3px solid #2B5F6F; font-size: 13px;"><strong>Notes:</strong> ${capture.notes}</p>`;
      }
      
      html += `<p style="margin: 20px 0;"></p>`;
      
      return html;
    });
    
    const html = htmlParts.join('\n');
    
    const textParts = reversed.map(capture => {
      const includeNotes = capture.includeNotesWhenCopying === true;
      
      let text = capture.isAboutPage ? '' : capture.url;
      if (includeNotes && capture.notes && capture.notes.trim()) {
        text += (text ? '\n\n' : '') + 'Notes: ' + capture.notes;
      }
      return text;
    }).filter(t => t);
    
    const text = textParts.join('\n\n');
    
    const htmlBlob = new Blob([html], { type: 'text/html' });
    const textBlob = new Blob([text], { type: 'text/plain' });
    
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': htmlBlob,
        'text/plain': textBlob
      })
    ]);
    
    showToast(`✓ Copied ${filtered.length} capture${filtered.length !== 1 ? 's' : ''} to clipboard!`);
  } catch (error) {
    console.error('Copy all error:', error);
    showToast('❌ Copy failed', true);
  }
}

// Save captures to storage
async function saveCaptures() {
  try {
    await chrome.storage.local.set({ captures: allCaptures });
  } catch (error) {
    console.error('Save error:', error);
    showToast('❌ Save failed - storage full!', true);
  }
}

// Show toast notification
function showToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.className = 'toast' + (isError ? ' error' : '');
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.classList.add('show'), 10);
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

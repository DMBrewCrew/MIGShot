// Global state
let allCaptures = [];
let allCases = [];
let currentCaseKey = null; // Format: "caseName|||caseMIG" or "uncategorized"
let currentSubject = null;
let currentPlatform = null; // Will be set to first platform account when loading
let collapseStates = {}; // Track collapse state by capture index
let selectedCaptures = new Set(); // Track selected captures for bulk actions
let draggedCardIndex = null; // Track which card is being dragged for reordering

// Helper function to find capture by originalIndex (permanent ID)
// CRITICAL: After sorting, array positions != originalIndex
// Always use this function instead of findCaptureByIndex(index)
function findCaptureByIndex(originalIndex) {
  return allCaptures.find(c => c.originalIndex === originalIndex);
}

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

// Helper function to save current filter state to session storage
function saveFilterState() {
  const filterState = {
    caseKey: currentCaseKey,
    subject: currentSubject,
    platform: currentPlatform
  };
  sessionStorage.setItem('migshot-filter-state', JSON.stringify(filterState));
}

// Helper function to restore filter state from session storage
function restoreFilterState() {
  const saved = sessionStorage.getItem('migshot-filter-state');
  if (saved) {
    try {
      const filterState = JSON.parse(saved);
      
      // Set the case dropdown
      const caseDropdown = document.getElementById('caseDropdown');
      if (caseDropdown && filterState.caseKey) {
        const option = Array.from(caseDropdown.options).find(o => o.value === filterState.caseKey);
        if (option) {
          caseDropdown.value = filterState.caseKey;
          currentCaseKey = filterState.caseKey;
          
          // Render subject tabs and wait for them to be created
          renderSubjectTabs();
          
          // Set the subject if saved
          if (filterState.subject) {
            currentSubject = filterState.subject;
            const subjectTab = Array.from(document.querySelectorAll('.subject-tab'))
              .find(t => t.textContent.includes(filterState.subject));
            if (subjectTab) {
              document.querySelectorAll('.subject-tab').forEach(t => t.classList.remove('active'));
              subjectTab.classList.add('active');
            }
          }
          
          // Set the platform if saved
          if (filterState.platform) {
            currentPlatform = filterState.platform;
            // Platform tabs will be rendered and activated by renderPlatformTabs
            renderPlatformTabs();
          } else {
            renderPlatformTabs();
          }
          
          // Clear the saved state after restoring
          sessionStorage.removeItem('migshot-filter-state');
          return true;
        }
      }
    } catch (error) {
      console.error('Error restoring filter state:', error);
    }
  }
  return false;
}

// Initialize archive
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  renderCaseDropdown();
  
  // Try to restore filter state first, otherwise use defaults
  const restored = restoreFilterState();
  if (!restored) {
    // No saved state, proceed normally
    renderCaseDropdown();
  }
  
  setupEventListeners();
  setupAutoRefresh();
});

// Load all data from storage
async function loadData() {
  const result = await chrome.storage.local.get(['captures', 'cases', 'collapseStates']);
  allCaptures = result.captures || [];
  allCases = result.cases || [];
  collapseStates = result.collapseStates || {};
  
  // MIGRATION: Assign permanent originalIndex to captures that don't have it
  // originalIndex represents the capture's creation order and NEVER changes
  let needsIndexMigration = false;
  let nextIndex = 0;
  
  // First, find the highest existing originalIndex
  allCaptures.forEach(capture => {
    if (capture.originalIndex !== undefined) {
      nextIndex = Math.max(nextIndex, capture.originalIndex + 1);
    }
  });
  
  // Then assign originalIndex to captures that don't have it
  allCaptures.forEach(capture => {
    if (capture.originalIndex === undefined) {
      capture.originalIndex = nextIndex++;
      needsIndexMigration = true;
    }
  });
  
  // Save migrated data if needed
  if (needsIndexMigration) {
    await chrome.storage.local.set({ captures: allCaptures });
    console.log('Migration complete: originalIndex assigned');
  }
  
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

// Organize captures by case/subject/platform/account
function organizeCaptures() {
  const organized = {
    cases: {},
    uncategorized: []
  };
  
  allCaptures.forEach((capture, index) => {
    // originalIndex should NEVER be reassigned after initial creation
    // It represents the capture's permanent ID based on creation order
    
    // Backward compatibility: add default accountIdentifier if missing
    if (!capture.accountIdentifier) {
      capture.accountIdentifier = '1';
    }
    
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
      const platformAccount = `${platform}|||${capture.accountIdentifier}`;
      
      if (!organized.cases[caseKey].subjects[capture.subjectName][platformAccount]) {
        organized.cases[caseKey].subjects[capture.subjectName][platformAccount] = [];
      }
      
      organized.cases[caseKey].subjects[capture.subjectName][platformAccount].push(capture);
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
    option.textContent = `📁 ${caseData.caseName} - ${captureCount} captures`;
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
  let platformAccounts = {};
  
  if (currentCaseKey === 'uncategorized') {
    // Get platform/accounts from uncategorized
    organized.uncategorized.forEach(capture => {
      const platform = capture.platform || 'Other';
      const accountId = capture.accountIdentifier || '1';
      const key = `${platform}|||${accountId}`;
      platformAccounts[key] = (platformAccounts[key] || 0) + 1;
    });
  } else if (currentCaseKey && currentSubject) {
    // Get platform/accounts from current case/subject
    const caseData = organized.cases[currentCaseKey];
    if (caseData && caseData.subjects[currentSubject]) {
      platformAccounts = Object.keys(caseData.subjects[currentSubject]).reduce((acc, platformAccount) => {
        acc[platformAccount] = caseData.subjects[currentSubject][platformAccount].length;
        return acc;
      }, {});
    }
  }
  
  // Calculate total
  const total = Object.values(platformAccounts).reduce((sum, count) => sum + count, 0);
  
  // Get sorted platform accounts
  const sortedPlatformAccounts = Object.entries(platformAccounts).sort();
  
  // If no current platform selected or 'all', default to first platform account
  if (!currentPlatform || currentPlatform === 'all') {
    if (sortedPlatformAccounts.length > 0) {
      currentPlatform = sortedPlatformAccounts[0][0];
    }
  }
  
  // Add platform/account tabs
  sortedPlatformAccounts.forEach(([platformAccount, count]) => {
    const [platform, accountId] = platformAccount.split('|||');
    
    // Format display name - account "1" shows as just platform name, others show number
    let displayName = accountId === '1' ? platform : `${platform} ${accountId}`;
    
    const tab = document.createElement('button');
    tab.className = 'platform-tab' + (currentPlatform === platformAccount ? ' active' : '');
    tab.innerHTML = `${getPlatformIcon(platform)} ${displayName} <span class="platform-count">(${count})</span>`;
    tab.addEventListener('click', () => {
      document.querySelectorAll('.platform-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentPlatform = platformAccount;
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
    
    // Filter by platform/account if one is selected
    if (currentPlatform && currentPlatform !== 'all') {
      const [targetPlatform, targetAccount] = currentPlatform.split('|||');
      filtered = filtered.filter(c => {
        const capturePlatform = c.platform || 'Other';
        const captureAccount = c.accountIdentifier || '1';
        return capturePlatform === targetPlatform && captureAccount === targetAccount;
      });
    }
  } else if (currentCaseKey && currentSubject) {
    const caseData = organized.cases[currentCaseKey];
    if (caseData && caseData.subjects[currentSubject]) {
      if (currentPlatform) {
        // Specific platform/account (format: "Platform|||accountId")
        filtered = caseData.subjects[currentSubject][currentPlatform] || [];
      }
    }
  }
  
  // Sort by the sortOrders for THIS specific filter view
  const currentFilter = `${currentCaseKey}|||${currentSubject}|||${currentPlatform}`;
  
  filtered.sort((a, b) => {
    const aOrder = a.sortOrders?.[currentFilter];
    const bOrder = b.sortOrders?.[currentFilter];
    
    // If both have sort orders for this filter, use them
    if (aOrder !== undefined && bOrder !== undefined) {
      return aOrder - bOrder;
    }
    
    // If only one has a sort order, it comes first
    if (aOrder !== undefined) return -1;
    if (bOrder !== undefined) return 1;
    
    // If neither has sort order, fall back to creation time
    const aTime = a.capturedAt ? new Date(a.capturedAt).getTime() : 0;
    const bTime = b.capturedAt ? new Date(b.capturedAt).getTime() : 0;
    return aTime - bTime;
  });
  
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
    // Clear selections when no captures
    selectedCaptures.clear();
    updateBulkActionsBar();
    return;
  }
  
  // Reverse for display (newest first)
  const reversed = [...filtered].reverse();
  
  container.innerHTML = '';
  
  reversed.forEach((capture, displayIndex) => {
    const card = createCaptureCard(capture, displayIndex);
    container.appendChild(card);
    
    // Restore selected state if this capture was selected
    if (selectedCaptures.has(capture.originalIndex)) {
      const checkbox = card.querySelector('.capture-select-checkbox');
      checkbox.checked = true;
      card.classList.add('selected');
    }
  });
  
  // Update bulk actions bar
  updateBulkActionsBar();
  
  // Setup drag and drop
  setupDragAndDrop();
}

// Setup drag and drop for reordering
function setupDragAndDrop() {
  const container = document.getElementById('capturesContainer');
  const cards = document.querySelectorAll('.capture-card');
  
  // Add drop handler to container so it ALWAYS fires
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  
  container.addEventListener('drop', async (e) => {
    e.preventDefault();
    await saveReorderedCaptures();
  });
  
  cards.forEach(card => {
    const dragHandle = card.querySelector('.drag-handle');
    
    dragHandle.addEventListener('mousedown', () => {
      card.setAttribute('draggable', 'true');
    });
    
    card.addEventListener('dragstart', (e) => {
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      draggedCardIndex = parseInt(card.getAttribute('data-index'));
    });
    
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      card.setAttribute('draggable', 'false');
      draggedCardIndex = null;
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
  });
}

// Save reordered captures - SIMPLE: each filtered view has its own order
async function saveReorderedCaptures() {
  // Get current filter context
  const currentFilter = `${currentCaseKey}|||${currentSubject}|||${currentPlatform}`;
  
  // Get all cards in current DOM order (top to bottom on screen)
  const cards = Array.from(document.querySelectorAll('.capture-card'));
  
  // Reverse because display is newest-first, but storage is oldest-first
  const cardsBottomToTop = cards.reverse();
  
  // Assign new sort indices based on position
  cardsBottomToTop.forEach((card, position) => {
    const originalIndex = parseInt(card.getAttribute('data-index'));
    const capture = allCaptures.find(c => c.originalIndex === originalIndex);
    
    if (capture) {
      // Initialize sortOrders object if it doesn't exist
      if (!capture.sortOrders) {
        capture.sortOrders = {};
      }
      
      // Set sort position for this specific filter view
      capture.sortOrders[currentFilter] = position;
    }
  });
  
  await saveCaptures();
  showToast('✓ Order saved');
}


// Create capture card (v6.7 style)
function createCaptureCard(capture, displayIndex) {
  const card = document.createElement('div');
  // Apply stored collapse state
  const isCollapsed = collapseStates[capture.originalIndex] === true;
  card.className = isCollapsed ? 'capture-card collapsed' : 'capture-card';
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
        <input type="checkbox" class="capture-select-checkbox" data-index="${capture.originalIndex}" style="margin-right: 8px; cursor: pointer; width: 16px; height: 16px; accent-color: #2B5F6F;">
        <button class="collapse-btn">▼</button>
        <span class="drag-handle">⋮⋮</span>
        <span class="platform-badge">${platform}</span>
        ${capture.isAboutPage ? '<span class="platform-badge" style="background: #9b59b6;">🔗 No Link</span>' : ''}
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
  const checkbox = card.querySelector('.capture-select-checkbox');
  checkbox.addEventListener('change', (e) => {
    e.stopPropagation();
    if (checkbox.checked) {
      selectedCaptures.add(capture.originalIndex);
      card.classList.add('selected');
    } else {
      selectedCaptures.delete(capture.originalIndex);
      card.classList.remove('selected');
    }
    updateBulkActionsBar();
  });
  
  const collapseBtn = card.querySelector('.collapse-btn');
  collapseBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    card.classList.toggle('collapsed');
    // Save collapse state
    collapseStates[capture.originalIndex] = card.classList.contains('collapsed');
    await chrome.storage.local.set({ collapseStates: collapseStates });
  });
  
  const saveDateBtn = card.querySelector('.btn-save-date');
  saveDateBtn.addEventListener('click', () => saveDate(capture.originalIndex));
  
  const notesBtn = card.querySelector('.notes-btn');
  notesBtn.addEventListener('click', () => openNotesModal(capture.originalIndex));
  
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
    currentPlatform = null; // Will be set to first platform when rendering tabs
    renderSubjectTabs();
  });
  
  // Clear All button
  document.getElementById('clearAllBtn').addEventListener('click', clearAll);
  
  // Delete Case button
  document.getElementById('deleteCaseBtn').addEventListener('click', deleteCurrentCase);
  
  // Collapse/Expand All button
  document.getElementById('toggleCollapseBtn').addEventListener('click', toggleCollapseAll);
  
  // Bulk actions
  document.getElementById('selectAllCheckbox').addEventListener('change', (e) => {
    if (e.target.checked) {
      selectAllCaptures();
    } else {
      deselectAllCaptures();
    }
  });
  
  document.getElementById('bulkMoveBtn').addEventListener('click', () => {
    if (selectedCaptures.size > 0) {
      openBulkMoveModal();
    }
  });
  
  document.getElementById('bulkNoLinkBtn').addEventListener('click', () => {
    if (selectedCaptures.size > 0) {
      handleBulkNoLink();
    }
  });
  
  document.getElementById('deselectAllBtn').addEventListener('click', deselectAllCaptures);
}

// Update bulk actions bar visibility and count
function updateBulkActionsBar() {
  const bar = document.getElementById('bulkActionsBar');
  const count = document.getElementById('selectedCount');
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');
  const noLinkBtn = document.getElementById('bulkNoLinkBtn');
  
  if (selectedCaptures.size > 0) {
    bar.classList.remove('hidden');
    count.textContent = `${selectedCaptures.size} selected`;
    
    // Update select all checkbox state
    const filtered = getFilteredCaptures();
    selectAllCheckbox.checked = selectedCaptures.size === filtered.length;
    
    // Check if all selected captures are marked as No Link
    let allMarkedAsNoLink = true;
    let anyMarkedAsNoLink = false;
    
    selectedCaptures.forEach(index => {
      const capture = findCaptureByIndex(index);
      if (capture && capture.isAboutPage) {
        anyMarkedAsNoLink = true;
      } else {
        allMarkedAsNoLink = false;
      }
    });
    
    // Update button based on selection state
    if (allMarkedAsNoLink) {
      noLinkBtn.textContent = '🔗 Unmark as No Link';
      noLinkBtn.style.background = '#6c757d';
    } else {
      noLinkBtn.textContent = '🔗 Mark as No Link';
      noLinkBtn.style.background = '#9b59b6';
    }
  } else {
    bar.classList.add('hidden');
    selectAllCheckbox.checked = false;
  }
}

// Select all captures in current view
function selectAllCaptures() {
  const filtered = getFilteredCaptures();
  filtered.forEach(capture => {
    selectedCaptures.add(capture.originalIndex);
  });
  
  // Update UI
  document.querySelectorAll('.capture-select-checkbox').forEach(checkbox => {
    checkbox.checked = true;
    checkbox.closest('.capture-card').classList.add('selected');
  });
  
  updateBulkActionsBar();
}

// Deselect all captures
function deselectAllCaptures() {
  selectedCaptures.clear();
  
  // Update UI
  document.querySelectorAll('.capture-select-checkbox').forEach(checkbox => {
    checkbox.checked = false;
    checkbox.closest('.capture-card').classList.remove('selected');
  });
  
  updateBulkActionsBar();
}

// Toggle collapse/expand all captures
async function toggleCollapseAll() {
  const cards = document.querySelectorAll('.capture-card');
  const btn = document.getElementById('toggleCollapseBtn');
  
  if (cards.length === 0) return;
  
  // Check if ANY card is expanded (not collapsed)
  let anyExpanded = false;
  cards.forEach(card => {
    if (!card.classList.contains('collapsed')) {
      anyExpanded = true;
    }
  });
  
  // If any are expanded, collapse all. If all are collapsed, expand all.
  const shouldCollapse = anyExpanded;
  
  // Apply state to all cards
  cards.forEach(card => {
    const index = parseInt(card.getAttribute('data-index'));
    if (shouldCollapse) {
      card.classList.add('collapsed');
      collapseStates[index] = true;
    } else {
      card.classList.remove('collapsed');
      collapseStates[index] = false;
    }
  });
  
  // Update button text
  btn.textContent = shouldCollapse ? '📋 Expand All' : '📋 Collapse All';
  
  // Save collapse states
  await chrome.storage.local.set({ collapseStates });
}

// Open bulk move modal
function openBulkMoveModal() {
  if (selectedCaptures.size === 0) return;
  
  // Get all selected captures - filter out any undefined ones
  const selectedCapturesArray = Array.from(selectedCaptures)
    .map(index => findCaptureByIndex(index))
    .filter(c => c !== undefined && c !== null);
  
  // Check if we have any valid captures
  if (selectedCapturesArray.length === 0) {
    showToast('⚠️ No valid captures selected', 'error');
    selectedCaptures.clear();
    updateBulkActionsBar();
    return;
  }
  
  const platforms = new Set(selectedCapturesArray.map(c => c.platform));
  
  // Validation: all must be from same platform
  if (platforms.size > 1) {
    showToast('⚠️ Cannot move captures from different platforms together', 'error');
    return;
  }
  
  // Get platform from selected captures (all same now)
  const platform = selectedCapturesArray[0].platform || 'Other';
  const firstCapture = selectedCapturesArray[0];
  
  // Validation: all must have same case/subject
  const cases = new Set(selectedCapturesArray.map(c => c.caseName));
  const subjects = new Set(selectedCapturesArray.map(c => c.subjectName));
  
  if (cases.size > 1 || subjects.size > 1) {
    showToast('⚠️ All captures must be from the same case and subject', 'error');
    return;
  }
  
  // Get all accounts for this platform/subject
  const organized = organizeCaptures();
  const accounts = new Set();
  
  if (firstCapture.caseName && firstCapture.caseMIG && firstCapture.subjectName) {
    const caseKey = `${firstCapture.caseName}|||${firstCapture.caseMIG}`;
    const caseData = organized.cases[caseKey];
    
    if (caseData && caseData.subjects[firstCapture.subjectName]) {
      Object.keys(caseData.subjects[firstCapture.subjectName]).forEach(platformAccount => {
        const [plat, account] = platformAccount.split('|||');
        if (plat === platform) {
          accounts.add(account);
        }
      });
    }
  }
  
  // Sort accounts
  const sortedAccounts = Array.from(accounts).sort((a, b) => {
    const aNum = parseInt(a);
    const bNum = parseInt(b);
    if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
    if (!isNaN(aNum)) return -1;
    if (!isNaN(bNum)) return 1;
    return a.localeCompare(b);
  });
  
  // Calculate next account number
  const numericAccounts = sortedAccounts.filter(a => !isNaN(a)).map(a => parseInt(a));
  let nextNumber = 1;
  while (numericAccounts.includes(nextNumber)) {
    nextNumber++;
  }
  const nextAccountId = nextNumber.toString();
  const nextDisplayName = nextNumber === 1 ? platform : `${platform} ${nextNumber}`;
  
  // Build account list HTML
  let accountListHTML = '';
  sortedAccounts.forEach(account => {
    const displayName = account === '1' ? platform : `${platform} ${account}`;
    accountListHTML += `
      <div class="account-option" data-account="${account}">
        ${displayName}
      </div>
    `;
  });
  
  // Create modal
  const modal = document.createElement('div');
  modal.className = 'notes-modal';
  modal.innerHTML = `
    <div class="notes-modal-content" style="max-width: 500px; min-width: 400px;">
      <div class="notes-modal-header">
        <div class="notes-modal-title">Move ${selectedCaptures.size} ${platform} Capture${selectedCaptures.size !== 1 ? 's' : ''}</div>
        <button class="notes-modal-close">×</button>
      </div>
      <div style="margin-bottom: 16px; font-size: 14px; color: #666;">
        Select destination account:
      </div>
      <div class="account-list">
        ${accountListHTML}
      </div>
      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e0e0e0;">
        <button id="bulkMakeNewBtn" class="btn btn-primary" data-account="${nextAccountId}" style="width: 100%; padding: 12px;">
          ➕ Make New (${nextDisplayName})
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close handlers
  const closeModal = () => {
    modal.remove();
  };
  
  modal.querySelector('.notes-modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  // Account selection handlers
  modal.querySelectorAll('.account-option').forEach(option => {
    option.addEventListener('click', async () => {
      const newAccountId = option.getAttribute('data-account');
      closeModal();
      await handleBulkAccountChange(newAccountId);
    });
  });
  
  // Make New button handler
  const makeNewBtn = modal.querySelector('#bulkMakeNewBtn');
  makeNewBtn.addEventListener('click', async () => {
    const newAccountId = makeNewBtn.getAttribute('data-account');
    closeModal();
    await handleBulkAccountChange(newAccountId);
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

// Handle bulk account change
async function handleBulkAccountChange(newAccountId) {
  const count = selectedCaptures.size;
  
  // Update all selected captures
  selectedCaptures.forEach(index => {
    const capture = findCaptureByIndex(index);
    if (capture) {
      capture.accountIdentifier = newAccountId;
      // IMPORTANT: Clear sortOrders since captures are moving to a new filter view
      capture.sortOrders = {};
    }
  });
  
  await saveCaptures();
  
  // Clear selection
  selectedCaptures.clear();
  
  // Save filter state before reload
  saveFilterState();
  
  // Refresh
  showToast(`✓ Moved ${count} capture${count !== 1 ? 's' : ''} - refreshing...`);
  setTimeout(() => {
    location.reload();
  }, 800);
}

// Handle bulk mark/unmark as No Link
async function handleBulkNoLink() {
  const count = selectedCaptures.size;
  
  // Check if all selected are marked as No Link
  let allMarkedAsNoLink = true;
  let validCount = 0;
  
  selectedCaptures.forEach(index => {
    const capture = findCaptureByIndex(index);
    if (capture) {
      validCount++;
      if (!capture.isAboutPage) {
        allMarkedAsNoLink = false;
      }
    }
  });
  
  // If no valid captures, clear selection and return
  if (validCount === 0) {
    selectedCaptures.clear();
    updateBulkActionsBar();
    showToast('⚠️ No valid captures selected', 'error');
    return;
  }
  
  // Toggle: if all marked, unmark them; otherwise mark them
  const newState = !allMarkedAsNoLink;
  
  selectedCaptures.forEach(index => {
    const capture = findCaptureByIndex(index);
    if (capture) {
      capture.isAboutPage = newState;
    }
  });
  
  await saveCaptures();
  
  // Clear selection
  selectedCaptures.clear();
  
  // Refresh to update UI
  const action = newState ? 'Marked' : 'Unmarked';
  showToast(`✓ ${action} ${validCount} capture${validCount !== 1 ? 's' : ''} as No Link`);
  renderCaptures();
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
  
  // Find capture once
  const capture = findCaptureByIndex(index);
  if (!capture) return;
  
  // Update capture
  capture.date = dateStr;
  
  // Generate date badge only if current year
  if (isCurrentYear(dateStr)) {
    const response = await chrome.runtime.sendMessage({ 
      action: 'generateDateBadge', 
      date: dateStr 
    });
    capture.dateBadge = response.dateBadge;
  } else {
    capture.dateBadge = null;
  }
  
  await saveCaptures();
  renderCaptures();
  showToast('✓ Date saved');
}

// Save notes
async function saveNotes(index) {
  const textarea = document.querySelector(`textarea.notes-textarea[data-index="${index}"]`);
  const notes = textarea.value.trim();
  
  const capture = findCaptureByIndex(index);
  if (!capture) return;
  
  capture.notes = notes;
  await saveCaptures();
  showToast('✓ Notes saved');
}

// Open notes modal
function openNotesModal(index) {
  const capture = findCaptureByIndex(index);
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
    
    findCaptureByIndex(index).notes = notes;
    // If notes exist, save the checkbox state. If empty notes, set to false.
    findCaptureByIndex(index).includeNotesWhenCopying = notes ? checkbox.checked : false;
    
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
  findCaptureByIndex(index).isAboutPage = isAboutPage;
  await saveCaptures();
  renderCaptures();
  showToast(isAboutPage ? '✓ Marked as No Link' : '✓ Unmarked as No Link');
}

// Open editor
function openEditor(index) {
  const capture = findCaptureByIndex(index);
  if (!capture) return;
  
  chrome.tabs.create({ url: chrome.runtime.getURL(`editor.html?index=${index}`) });
}

// Delete capture
async function deleteCapture(index) {
  if (!confirm('Delete this capture?')) return;
  
  // Find the capture by originalIndex
  const capture = findCaptureByIndex(index);
  if (!capture) {
    showToast('⚠️ Capture not found', 'error');
    return;
  }
  
  // Find its actual position in the array and delete it
  const arrayIndex = allCaptures.findIndex(c => c.originalIndex === index);
  if (arrayIndex !== -1) {
    allCaptures.splice(arrayIndex, 1);
    await saveCaptures();
    showToast('✓ Deleted - refreshing...');
    
    // Save filter state before reload
    saveFilterState();
    
    // Refresh the page after a short delay
    setTimeout(() => {
      location.reload();
    }, 800);
  } else {
    showToast('⚠️ Could not delete capture', 'error');
  }
}

// Delete current case
async function deleteCurrentCase() {
  // Check if a case is selected
  if (!currentCaseKey || currentCaseKey === 'uncategorized') {
    showToast('⚠️ No case selected to delete', 'error');
    return;
  }
  
  // Parse case key to get name and MIG
  const [caseName, caseMIG] = currentCaseKey.split('|||');
  
  // Count captures in this case
  const caseCaptures = allCaptures.filter(c => 
    c.caseName === caseName && c.caseMIG === caseMIG
  );
  
  if (caseCaptures.length === 0) {
    showToast('⚠️ Case has no captures to delete', 'error');
    return;
  }
  
  // Create confirmation modal
  const modal = document.createElement('div');
  modal.className = 'notes-modal';
  modal.innerHTML = `
    <div class="notes-modal-content" style="max-width: 500px;">
      <div class="notes-modal-header">
        <div class="notes-modal-title">⚠️ Delete Case</div>
        <button class="notes-modal-close">×</button>
      </div>
      <div style="margin-bottom: 20px; color: #555; font-size: 14px; line-height: 1.6;">
        <p style="margin-bottom: 12px;">
          Delete case <strong>${caseName} (${caseMIG})</strong>?
        </p>
        <p style="margin-bottom: 12px;">
          This will delete <strong>${caseCaptures.length} capture${caseCaptures.length !== 1 ? 's' : ''}</strong> from this case.
        </p>
        <p style="color: #e74c3c; font-weight: 600;">
          This action cannot be undone!
        </p>
      </div>
      <div class="notes-modal-actions">
        <button class="btn btn-danger" id="confirmDeleteCase">Delete Case</button>
        <button class="btn btn-primary" id="cancelDeleteCase">Cancel</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close handlers
  const closeModal = () => {
    modal.remove();
  };
  
  modal.querySelector('.notes-modal-close').addEventListener('click', closeModal);
  modal.querySelector('#cancelDeleteCase').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  // Delete handler
  modal.querySelector('#confirmDeleteCase').addEventListener('click', async () => {
    modal.remove();
    
    // Filter out all captures from this case
    allCaptures = allCaptures.filter(c => 
      !(c.caseName === caseName && c.caseMIG === caseMIG)
    );
    
    // Remove case from cases list
    allCases = allCases.filter(c => 
      !(c.name === caseName && c.mig === caseMIG)
    );
    
    // Save updated data
    await chrome.storage.local.set({ 
      captures: allCaptures,
      cases: allCases
    });
    
    // Check if this was the current case in storage
    const storageResult = await chrome.storage.local.get(['currentCase']);
    const storedCase = storageResult.currentCase;
    if (storedCase && storedCase.name === caseName && storedCase.mig === caseMIG) {
      await chrome.storage.local.remove('currentCase');
    }
    
    showToast('✓ Case deleted - refreshing...');
    
    // Refresh the page after a short delay
    setTimeout(() => {
      location.reload();
    }, 1000);
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

// Clear all captures
async function clearAll() {
  if (allCaptures.length === 0) {
    showToast('Archive is already empty', true);
    return;
  }
  
  // Check if user wants to skip warnings
  const result = await chrome.storage.local.get(['skipClearWarning']);
  const skipWarning = result.skipClearWarning || false;
  
  if (!skipWarning) {
    // Create custom confirmation modal
    const modal = document.createElement('div');
    modal.className = 'notes-modal';
    modal.innerHTML = `
      <div class="notes-modal-content" style="max-width: 500px;">
        <div class="notes-modal-header">
          <div class="notes-modal-title">⚠️ Wipe Archive</div>
          <button class="notes-modal-close">×</button>
        </div>
        <div style="margin-bottom: 20px; color: #555; font-size: 14px; line-height: 1.6;">
          <p style="margin-bottom: 12px;">
            This will <strong>delete all ${allCaptures.length} captures</strong> and <strong>erase all Cases</strong>.
          </p>
          <p style="color: #e74c3c; font-weight: 600;">
            This action cannot be undone!
          </p>
        </div>
        <div class="copy-option" style="margin-bottom: 20px;">
          <input type="checkbox" id="dontWarnAgain">
          <label for="dontWarnAgain">Don't warn me again</label>
        </div>
        <div class="notes-modal-actions">
          <button class="btn btn-danger">Wipe Archive</button>
          <button class="btn btn-primary">Cancel</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Return a promise to handle the user's choice
    return new Promise((resolve) => {
      const closeModal = () => {
        modal.remove();
        resolve(false);
      };
      
      modal.querySelector('.notes-modal-close').addEventListener('click', closeModal);
      modal.querySelector('.btn-primary').addEventListener('click', closeModal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });
      
      modal.querySelector('.btn-danger').addEventListener('click', async () => {
        const dontWarn = modal.querySelector('#dontWarnAgain').checked;
        if (dontWarn) {
          await chrome.storage.local.set({ skipClearWarning: true });
        }
        modal.remove();
        
        // Actually clear the data - including currentCase
        allCaptures = [];
        allCases = [];
        await chrome.storage.local.set({ captures: [], cases: [] });
        await chrome.storage.local.remove('currentCase');
        showToast('✓ Archive cleared - refreshing...');
        
        // Refresh the page after a short delay
        setTimeout(() => {
          location.reload();
        }, 1000);
      });
    });
  } else {
    // Skip warning, clear directly - including currentCase
    allCaptures = [];
    allCases = [];
    await chrome.storage.local.set({ captures: [], cases: [] });
    await chrome.storage.local.remove('currentCase');
    showToast('✓ Archive cleared - refreshing...');
    
    // Refresh the page after a short delay
    setTimeout(() => {
      location.reload();
    }, 1000);
  }
}

// Copy single capture
async function copySingleCapture(index) {
  const capture = findCaptureByIndex(index);
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
      html += `<p style="margin: 10px 0;">${capture.notes}</p>`;
    }
    
    // Plain text version
    let text = capture.isAboutPage ? '' : capture.url;
    if (includeNotes && capture.notes && capture.notes.trim()) {
      text += (text ? '\n\n' : '') + capture.notes;
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
    // Use filtered as-is - already in chronological order (oldest first)
    const htmlParts = filtered.map(capture => {
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
        html += `<p style="margin: 10px 0;">${capture.notes}</p>`;
      }
      
      html += `<p style="margin: 20px 0;"></p>`;
      
      return html;
    });
    
    const html = htmlParts.join('\n');
    
    const textParts = filtered.map(capture => {
      const includeNotes = capture.includeNotesWhenCopying === true;
      
      let text = capture.isAboutPage ? '' : capture.url;
      if (includeNotes && capture.notes && capture.notes.trim()) {
        text += (text ? '\n\n' : '') + capture.notes;
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

// Open move account modal
function openMoveAccountModal(index) {
  const capture = findCaptureByIndex(index);
  if (!capture) return;
  
  const platform = capture.platform || 'Other';
  const currentAccount = capture.accountIdentifier || '1';
  
  // Get all accounts for this platform/subject
  const organized = organizeCaptures();
  const accounts = new Set();
  
  if (capture.caseName && capture.caseMIG && capture.subjectName) {
    const caseKey = `${capture.caseName}|||${capture.caseMIG}`;
    const caseData = organized.cases[caseKey];
    
    if (caseData && caseData.subjects[capture.subjectName]) {
      // Find all platform/account combinations for this subject
      Object.keys(caseData.subjects[capture.subjectName]).forEach(platformAccount => {
        const [plat, account] = platformAccount.split('|||');
        if (plat === platform) {
          accounts.add(account);
        }
      });
    }
  }
  
  // Always include current account
  accounts.add(currentAccount);
  
  // Sort accounts (numbers first, then alphanumeric)
  const sortedAccounts = Array.from(accounts).sort((a, b) => {
    const aNum = parseInt(a);
    const bNum = parseInt(b);
    if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
    if (!isNaN(aNum)) return -1;
    if (!isNaN(bNum)) return 1;
    return a.localeCompare(b);
  });
  
  // Calculate next account number
  const numericAccounts = sortedAccounts.filter(a => !isNaN(a)).map(a => parseInt(a));
  let nextNumber = 1;
  while (numericAccounts.includes(nextNumber)) {
    nextNumber++;
  }
  const nextAccountId = nextNumber.toString();
  const nextDisplayName = nextNumber === 1 ? platform : `${platform} ${nextNumber}`;
  
  // Build account list HTML
  let accountListHTML = '';
  sortedAccounts.forEach(account => {
    const displayName = account === '1' ? platform : `${platform} ${account}`;
    const isCurrent = account === currentAccount;
    accountListHTML += `
      <div class="account-option ${isCurrent ? 'current' : ''}" data-account="${account}">
        ${displayName} ${isCurrent ? '<span style="color: #9B9565; font-weight: bold;">(Current)</span>' : ''}
      </div>
    `;
  });
  
  // Create modal
  const modal = document.createElement('div');
  modal.className = 'notes-modal';
  modal.innerHTML = `
    <div class="notes-modal-content" style="max-width: 500px; min-width: 400px;">
      <div class="notes-modal-header">
        <div class="notes-modal-title">Move to Account</div>
        <button class="notes-modal-close">×</button>
      </div>
      <div style="margin-bottom: 16px; font-size: 14px; color: #666;">
        Select an existing account or create a new one:
      </div>
      <div class="account-list">
        ${accountListHTML}
      </div>
      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e0e0e0;">
        <button id="makeNewBtn" class="btn btn-primary" data-account="${nextAccountId}" style="width: 100%; padding: 12px;">
          ➕ Make New (${nextDisplayName})
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close handlers
  const closeModal = () => {
    modal.remove();
  };
  
  modal.querySelector('.notes-modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  // Account selection handlers for existing accounts
  modal.querySelectorAll('.account-option').forEach(option => {
    option.addEventListener('click', async () => {
      const newAccountId = option.getAttribute('data-account');
      if (newAccountId === currentAccount) {
        showToast('Already in this account', true);
        return;
      }
      closeModal();
      await handleAccountChange(index, newAccountId);
    });
  });
  
  // Make New button handler
  const makeNewBtn = modal.querySelector('#makeNewBtn');
  makeNewBtn.addEventListener('click', async () => {
    const newAccountId = makeNewBtn.getAttribute('data-account');
    closeModal();
    await handleAccountChange(index, newAccountId);
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

// Handle account change
async function handleAccountChange(index, newAccountId) {
  const capture = findCaptureByIndex(index);
  if (!capture) return;
  
  // Update capture with the new account identifier
  capture.accountIdentifier = newAccountId;
  
  // IMPORTANT: Clear sortOrders since the capture is moving to a new filter view
  // It will get a new sort position when the user reorders in the new view
  capture.sortOrders = {};
  
  await saveCaptures();
  
  // Save filter state before reload
  saveFilterState();
  
  // Refresh to show updated organization
  showToast('✓ Moved to account - refreshing...');
  setTimeout(() => {
    location.reload();
  }, 800);
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

// Open Matchbox modal
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

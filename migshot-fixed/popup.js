// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Load current case state
  await loadCaseState();
  
  // Set up event listeners
  setupEventListeners();
});

// Load and display current case state
async function loadCaseState() {
  const result = await chrome.storage.local.get(['currentCase', 'cases']);
  const currentCase = result.currentCase;
  const cases = result.cases || [];
  
  if (currentCase && currentCase.name && currentCase.mig) {
    // Show active case state
    document.getElementById('noCaseState').classList.add('hidden');
    document.getElementById('activeCaseState').classList.remove('hidden');
    
    // Populate case dropdown
    const caseSelect = document.getElementById('caseSelect');
    caseSelect.innerHTML = '';
    
    cases.forEach(caseData => {
      const option = document.createElement('option');
      option.value = `${caseData.name}|||${caseData.mig}`;
      option.textContent = `${caseData.name} (${caseData.mig})`;
      if (caseData.name === currentCase.name && caseData.mig === currentCase.mig) {
        option.selected = true;
      }
      caseSelect.appendChild(option);
    });
    
    // Add "New Case..." option
    const newCaseOption = document.createElement('option');
    newCaseOption.value = '_new_case_';
    newCaseOption.textContent = '➕ New Case...';
    caseSelect.appendChild(newCaseOption);
    
    // Populate subject dropdown
    const subjectSelect = document.getElementById('subjectSelect');
    subjectSelect.innerHTML = '';
    
    // Find the case in cases array to get subjects
    const caseData = cases.find(c => c.name === currentCase.name && c.mig === currentCase.mig);
    if (caseData && caseData.subjects) {
      caseData.subjects.forEach((subject, index) => {
        const option = document.createElement('option');
        option.value = subject;
        option.textContent = subject + (index === 0 ? ' (Primary)' : '');
        if (subject === currentCase.currentSubject) {
          option.selected = true;
        }
        subjectSelect.appendChild(option);
      });
      
      // Add "Add Associate..." option
      const addOption = document.createElement('option');
      addOption.value = '_add_associate_';
      addOption.textContent = '➕ Add Associate...';
      subjectSelect.appendChild(addOption);
    }
  } else {
    // Show no case state
    document.getElementById('noCaseState').classList.remove('hidden');
    document.getElementById('activeCaseState').classList.add('hidden');
  }
}

// Set up all event listeners
function setupEventListeners() {
  // New Case button (no case state)
  document.getElementById('newCaseBtn')?.addEventListener('click', showNewCaseModal);
  
  // Open Archive buttons
  document.getElementById('openArchiveBtn')?.addEventListener('click', openArchive);
  document.getElementById('openArchiveBtn2')?.addEventListener('click', openArchive);
  
  // Case dropdown change
  document.getElementById('caseSelect')?.addEventListener('change', handleCaseChange);
  
  // Subject dropdown change
  document.getElementById('subjectSelect')?.addEventListener('change', handleSubjectChange);
  
  // New Case Modal
  document.getElementById('cancelNewCaseBtn')?.addEventListener('click', hideNewCaseModal);
  document.getElementById('createCaseBtn')?.addEventListener('click', handleCreateCase);
  
  // Add Associate Modal
  document.getElementById('cancelAddAssociateBtn')?.addEventListener('click', hideAddAssociateModal);
  document.getElementById('addAssociateConfirmBtn')?.addEventListener('click', handleAddAssociate);
  
  // Close modals on overlay click
  document.getElementById('newCaseModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'newCaseModal') hideNewCaseModal();
  });
  document.getElementById('addAssociateModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'addAssociateModal') hideAddAssociateModal();
  });
  
  // Enter key to submit modals
  document.getElementById('caseMIGInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleCreateCase();
  });
  document.getElementById('associateNameInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleAddAssociate();
  });
}

// Show New Case Modal
function showNewCaseModal() {
  document.getElementById('newCaseModal').classList.add('show');
  document.getElementById('caseNameInput').value = '';
  document.getElementById('caseMIGInput').value = '';
  document.getElementById('caseNameInput').focus();
}

function hideNewCaseModal() {
  document.getElementById('newCaseModal').classList.remove('show');
}

// Handle Create Case
async function handleCreateCase() {
  const name = document.getElementById('caseNameInput').value.trim();
  const mig = document.getElementById('caseMIGInput').value.trim();
  
  if (!name || !mig) {
    showError('Please fill in both Name and MIG#');
    return;
  }
  
  // Validate MIG format (#####-#)
  const migPattern = /^\d{5}-\d$/;
  if (!migPattern.test(mig)) {
    showError('MIG# must be in format: #####-# (e.g., 12345-1)');
    return;
  }
  
  // Create new case
  const newCase = {
    name: name,
    mig: mig,
    subjects: [name], // Primary subject is the case name
    primarySubject: name
  };
  
  // Add to cases array
  const result = await chrome.storage.local.get(['cases']);
  const cases = result.cases || [];
  
  // Check if case already exists
  const existingCase = cases.find(c => c.name === name && c.mig === mig);
  if (existingCase) {
    // Case exists, just set it as current
    await chrome.storage.local.set({
      currentCase: {
        name: name,
        mig: mig,
        currentSubject: name
      }
    });
  } else {
    // New case, add it
    cases.push(newCase);
    await chrome.storage.local.set({
      cases: cases,
      currentCase: {
        name: name,
        mig: mig,
        currentSubject: name
      }
    });
  }
  
  hideNewCaseModal();
  await loadCaseState();
  showSuccess('Case created: ' + name);
}

// Show Add Associate Modal
async function showAddAssociateModal() {
  const result = await chrome.storage.local.get(['currentCase']);
  const currentCase = result.currentCase;
  
  if (!currentCase) {
    showError('No active case');
    return;
  }
  
  document.getElementById('addAssociateCaseName').textContent = currentCase.name;
  document.getElementById('addAssociateModal').classList.add('show');
  document.getElementById('associateNameInput').value = '';
  document.getElementById('associateNameInput').focus();
}

function hideAddAssociateModal() {
  document.getElementById('addAssociateModal').classList.remove('show');
}

// Handle Add Associate
async function handleAddAssociate() {
  const associateName = document.getElementById('associateNameInput').value.trim();
  
  if (!associateName) {
    showError('Please enter associate name');
    return;
  }
  
  const result = await chrome.storage.local.get(['currentCase', 'cases']);
  const currentCase = result.currentCase;
  const cases = result.cases || [];
  
  if (!currentCase) {
    showError('No active case');
    return;
  }
  
  // Find the case
  const caseIndex = cases.findIndex(c => c.name === currentCase.name && c.mig === currentCase.mig);
  if (caseIndex === -1) {
    showError('Case not found');
    return;
  }
  
  // Add associate to subjects if not already there
  if (!cases[caseIndex].subjects.includes(associateName)) {
    cases[caseIndex].subjects.push(associateName);
  }
  
  // Update storage and switch to new associate
  await chrome.storage.local.set({
    cases: cases,
    currentCase: {
      ...currentCase,
      currentSubject: associateName
    }
  });
  
  hideAddAssociateModal();
  await loadCaseState();
  showSuccess('Associate added: ' + associateName);
}

// Handle Case Change
async function handleCaseChange(e) {
  const selectedValue = e.target.value;
  
  // If "New Case..." selected, show new case modal
  if (selectedValue === '_new_case_') {
    showNewCaseModal();
    // Reload to reset dropdown
    await loadCaseState();
    return;
  }
  
  // Parse case info
  const [name, mig] = selectedValue.split('|||');
  
  // Find the case
  const result = await chrome.storage.local.get(['cases']);
  const cases = result.cases || [];
  const caseData = cases.find(c => c.name === name && c.mig === mig);
  
  if (caseData) {
    await chrome.storage.local.set({
      currentCase: {
        name: name,
        mig: mig,
        currentSubject: caseData.primarySubject
      }
    });
    
    await loadCaseState();
    showSuccess('Switched to: ' + name);
  }
}

// Handle Subject Change
async function handleSubjectChange(e) {
  const selectedValue = e.target.value;
  
  // If "Add Associate..." selected, show add associate modal
  if (selectedValue === '_add_associate_') {
    showAddAssociateModal();
    // Reload to reset dropdown
    await loadCaseState();
    return;
  }
  
  const result = await chrome.storage.local.get(['currentCase']);
  const currentCase = result.currentCase;
  
  if (currentCase) {
    await chrome.storage.local.set({
      currentCase: {
        ...currentCase,
        currentSubject: selectedValue
      }
    });
    showSuccess('Switched to: ' + selectedValue);
  }
}

// Open Archive
function openArchive() {
  chrome.tabs.create({ url: chrome.runtime.getURL('archive.html') });
}

// Show error message
function showError(message) {
  const errorEl = document.getElementById('error');
  errorEl.textContent = message;
  errorEl.classList.add('show');
  setTimeout(() => errorEl.classList.remove('show'), 5000);
}

// Show success message (reuse error element with different style)
function showSuccess(message) {
  const errorEl = document.getElementById('error');
  errorEl.textContent = '✓ ' + message;
  errorEl.style.background = '#d4edda';
  errorEl.style.color = '#155724';
  errorEl.style.borderLeft = '2px solid #28a745';
  errorEl.classList.add('show');
  setTimeout(() => {
    errorEl.classList.remove('show');
    // Reset styles
    errorEl.style.background = '';
    errorEl.style.color = '';
    errorEl.style.borderLeft = '';
  }, 3000);
}

// Content script for Facebook pages
// This runs in the context of Facebook pages

console.log('Facebook Post Capture extension loaded');

// Track state
let lastUrl = window.location.href;
let dateElementsAvailable = false;
let checkInterval = null;

// Check if date elements are available
function checkForDateElements() {
  const hasAriaLabelledBy = document.querySelectorAll('[aria-labelledby]').length > 0;
  const hasTimeElements = document.querySelectorAll('time, [data-utime]').length > 0;
  const hasTitleElements = document.querySelectorAll('[title]').length > 10;
  
  return hasAriaLabelledBy || hasTimeElements || hasTitleElements;
}

// Start monitoring for date elements
function startMonitoring() {
  console.log('Starting date element monitoring...');
  dateElementsAvailable = false;
  
  if (checkInterval) {
    clearInterval(checkInterval);
  }
  
  checkInterval = setInterval(() => {
    const available = checkForDateElements();
    
    if (available && !dateElementsAvailable) {
      console.log('✓ Date elements NOW available');
      dateElementsAvailable = true;
    } else if (!available && dateElementsAvailable) {
      console.log('✗ Date elements NO LONGER available');
      dateElementsAvailable = false;
    }
  }, 500);
}

// Monitor for URL changes (arrow navigation)
setInterval(() => {
  const currentUrl = window.location.href;
  
  if (currentUrl !== lastUrl) {
    console.log('URL changed - resetting date availability');
    console.log('Old:', lastUrl);
    console.log('New:', currentUrl);
    lastUrl = currentUrl;
    dateElementsAvailable = false;
    startMonitoring();
  }
}, 500);

// Start monitoring on load
startMonitoring();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkDateAvailability') {
    sendResponse({ available: dateElementsAvailable });
  } else if (request.action === 'ping') {
    sendResponse({ status: 'ready' });
  }
  return true;
});

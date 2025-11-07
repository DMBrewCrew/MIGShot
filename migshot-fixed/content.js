// Content script for Facebook and Instagram - Manual Area Selection
console.log('MIGShot v6.0 extension loaded');

// Detect current platform from hostname
function getPlatform() {
  const hostname = window.location.hostname;
  
  // Remove www. prefix
  const cleanHostname = hostname.replace(/^www\./, '');
  
  // Extract main domain name (remove TLD)
  // Example: facebook.com -> Facebook, tiktok.com -> TikTok
  const domainParts = cleanHostname.split('.');
  
  // Get the main part (second-to-last if multiple parts, otherwise first)
  let mainDomain = domainParts.length > 1 ? domainParts[domainParts.length - 2] : domainParts[0];
  
  // Capitalize first letter
  const platformName = mainDomain.charAt(0).toUpperCase() + mainDomain.slice(1);
  
  return platformName;
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startSelection') {
    startAreaSelection();
    sendResponse({ status: 'selection started' });
  } else if (request.action === 'ping') {
    sendResponse({ status: 'ready' });
  } else if (request.action === 'hideUserData') {
    hideUserData();
    sendResponse({ success: true });
  } else if (request.action === 'restoreUserData') {
    restoreUserData();
    sendResponse({ success: true });
  }
  return true;
});

// Area selection system
let selectionOverlay = null;
let selectionBox = null;
let startX = 0;
let startY = 0;
let isSelecting = false;

function startAreaSelection() {
  // Create overlay
  selectionOverlay = document.createElement('div');
  selectionOverlay.id = 'migshot-selection-overlay';
  selectionOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.4);
    z-index: 999999;
    cursor: crosshair;
  `;
  
  // Create selection box
  selectionBox = document.createElement('div');
  selectionBox.style.cssText = `
    position: fixed;
    border: 3px solid #2B5F6F;
    background: rgba(43, 95, 111, 0.1);
    display: none;
    z-index: 1000000;
    pointer-events: none;
  `;
  
  // Create instruction text
  const instructionText = document.createElement('div');
  instructionText.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #2B5F6F 0%, #1a3d48 100%);
    color: white;
    padding: 10px 20px;
    border-radius: 6px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    font-weight: 600;
    z-index: 1000001;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    backdrop-filter: blur(10px);
    border: 2px solid #9B9565;
  `;
  instructionText.textContent = 'Click and drag to select area • ESC to cancel';
  
  document.body.appendChild(selectionOverlay);
  document.body.appendChild(selectionBox);
  document.body.appendChild(instructionText);
  
  // Event listeners
  selectionOverlay.addEventListener('mousedown', handleMouseDown);
  selectionOverlay.addEventListener('mousemove', handleMouseMove);
  selectionOverlay.addEventListener('mouseup', handleMouseUp);
  document.addEventListener('keydown', handleKeyDown);
  
  // Store instruction text for cleanup
  selectionOverlay._instructionText = instructionText;
}

function handleMouseDown(e) {
  isSelecting = true;
  startX = e.clientX;
  startY = e.clientY;
  
  selectionBox.style.left = startX + 'px';
  selectionBox.style.top = startY + 'px';
  selectionBox.style.width = '0px';
  selectionBox.style.height = '0px';
  selectionBox.style.display = 'block';
}

function handleMouseMove(e) {
  if (!isSelecting) return;
  
  const currentX = e.clientX;
  const currentY = e.clientY;
  
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  
  selectionBox.style.left = left + 'px';
  selectionBox.style.top = top + 'px';
  selectionBox.style.width = width + 'px';
  selectionBox.style.height = height + 'px';
}

function handleMouseUp(e) {
  if (!isSelecting) return;
  
  isSelecting = false;
  
  const currentX = e.clientX;
  const currentY = e.clientY;
  
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  
  // Minimum selection size (50x50)
  if (width < 50 || height < 50) {
    cleanupSelection();
    alert('Selection too small. Please select a larger area.');
    return;
  }
  
  // Send bounds to background
  const bounds = {
    x: left,
    y: top,
    width: width,
    height: height,
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1
  };
  
  const platform = getPlatform();
  
  // Clean up UI
  cleanupSelection();
  
  // Send selection to background script
  chrome.runtime.sendMessage({
    action: 'captureSelection',
    bounds: bounds,
    platform: platform,
    url: window.location.href
  });
}

function handleKeyDown(e) {
  if (e.key === 'Escape') {
    cleanupSelection();
  }
}

function cleanupSelection() {
  isSelecting = false;
  
  if (selectionOverlay) {
    selectionOverlay.removeEventListener('mousedown', handleMouseDown);
    selectionOverlay.removeEventListener('mousemove', handleMouseMove);
    selectionOverlay.removeEventListener('mouseup', handleMouseUp);
    
    if (selectionOverlay._instructionText) {
      selectionOverlay._instructionText.remove();
    }
    
    selectionOverlay.remove();
    selectionOverlay = null;
  }
  
  if (selectionBox) {
    selectionBox.remove();
    selectionBox = null;
  }
  
  document.removeEventListener('keydown', handleKeyDown);
}

// Hide user-identifying elements before screenshot
function hideUserData() {
  console.log('MIGShot: Hiding user data');
  
  // Create style element to hide user data
  const style = document.createElement('style');
  style.id = 'migshot-hide-user-data';
  style.textContent = `
    /* Hide the profile picture dropdown at the top of comment section */
    div[aria-label="Available Voices"],
    div[aria-label*="Available Voices"] {
      display: none !important;
    }
    
    /* Hide only YOUR comment composer form (not other people's comments) */
    form[role="presentation"] {
      display: none !important;
    }
    
    /* Hide the comment input wrapper */
    div.x1r8uery.x1iyjqo2.x6ikm8r.x10wlt62.xyri2b {
      display: none !important;
    }
    
    /* Hide any SVG image with your profile picture in comment area */
    svg[aria-hidden="true"]:has(image[xlink\\:href*="fbcdn.net"]) {
      display: none !important;
    }
    
    /* Hide user profile picture in top right corner - Facebook */
    div[role="banner"] img[referrerpolicy="origin-when-cross-origin"],
    div[role="banner"] svg[aria-label*="Your profile"],
    div[aria-label*="Account Controls and Settings"] {
      display: none !important;
    }
    
    /* Hide the entire account menu area in top right */
    div[role="navigation"] > div > div:last-child > div:last-child {
      display: none !important;
    }
  `;
  
  document.head.appendChild(style);
  console.log('MIGShot: User data hidden');
}

// Restore user-identifying elements after screenshot
function restoreUserData() {
  console.log('MIGShot: Restoring user data');
  const style = document.getElementById('migshot-hide-user-data');
  if (style) {
    style.remove();
    console.log('MIGShot: User data restored');
  }
}

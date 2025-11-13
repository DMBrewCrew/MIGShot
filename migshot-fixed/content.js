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
  } else if (request.action === 'startRollingCapture') {
    startRollingCapture();
    sendResponse({ status: 'rolling capture started' });
  } else if (request.action === 'scrollToPosition') {
    window.scrollTo(0, request.scrollY);
    sendResponse({ status: 'scrolled' });
  } else if (request.action === 'hideFixedElements') {
    hideFixedElements();
    sendResponse({ success: true });
  } else if (request.action === 'restoreFixedElements') {
    restoreFixedElements();
    sendResponse({ success: true });
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

// Hide fixed/sticky elements (nav bars, headers, etc.) before rolling capture
function hideFixedElements() {
  console.log('MIGShot: Hiding fixed elements');
  
  // Create style element to hide fixed/sticky elements
  const style = document.createElement('style');
  style.id = 'migshot-hide-fixed-elements';
  style.textContent = `
    /* Hide all fixed and sticky positioned elements */
    *[style*="position: fixed"],
    *[style*="position:fixed"] {
      display: none !important;
    }
    
    /* Common fixed element selectors */
    header[style*="position"],
    nav[style*="position"],
    .fixed,
    .sticky {
      display: none !important;
    }
  `;
  
  document.head.appendChild(style);
  
  // Also manually hide elements with computed position fixed/sticky
  const allElements = document.querySelectorAll('*');
  allElements.forEach(el => {
    const style = window.getComputedStyle(el);
    if (style.position === 'fixed' || style.position === 'sticky') {
      el.setAttribute('data-migshot-was-fixed', style.position);
      el.style.setProperty('display', 'none', 'important');
    }
  });
  
  console.log('MIGShot: Fixed elements hidden');
}

// Restore fixed/sticky elements after rolling capture
function restoreFixedElements() {
  console.log('MIGShot: Restoring fixed elements');
  
  const style = document.getElementById('migshot-hide-fixed-elements');
  if (style) {
    style.remove();
  }
  
  // Restore manually hidden elements
  const hiddenElements = document.querySelectorAll('[data-migshot-was-fixed]');
  hiddenElements.forEach(el => {
    el.style.removeProperty('display');
    el.removeAttribute('data-migshot-was-fixed');
  });
  
  console.log('MIGShot: Fixed elements restored');
}

// Rolling capture system - Two-click approach
let rollingOverlay = null;
let rollingBox = null;
let rollingInstructionText = null;
let rollingState = 'idle'; // 'idle', 'waitingForFirstClick', 'waitingForSecondClick'
let firstClickData = null; // { x, y, scrollY }

function startRollingCapture() {
  rollingState = 'waitingForFirstClick';
  firstClickData = null;
  
  // Create overlay
  rollingOverlay = document.createElement('div');
  rollingOverlay.id = 'migshot-rolling-overlay';
  rollingOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(155, 149, 101, 0.2);
    z-index: 999999;
    cursor: crosshair;
  `;
  
  // Create selection box
  rollingBox = document.createElement('div');
  rollingBox.style.cssText = `
    position: absolute;
    border: 3px solid #9B9565;
    background: rgba(155, 149, 101, 0.15);
    display: none;
    z-index: 1000000;
    pointer-events: none;
  `;
  
  // Create instruction text
  rollingInstructionText = document.createElement('div');
  rollingInstructionText.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #9B9565 0%, #7a7550 100%);
    color: white;
    padding: 12px 24px;
    border-radius: 6px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    font-weight: 600;
    z-index: 1000001;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    backdrop-filter: blur(10px);
    border: 2px solid #2B5F6F;
    max-width: 600px;
    text-align: center;
  `;
  rollingInstructionText.innerHTML = '🔄 <strong>Step 1:</strong> Click top-left corner to mark start • ESC to cancel';
  
  document.body.appendChild(rollingOverlay);
  document.body.appendChild(rollingBox);
  document.body.appendChild(rollingInstructionText);
  
  // Event listeners
  rollingOverlay.addEventListener('click', handleRollingClick);
  document.addEventListener('keydown', handleRollingKeyDown);
}

function handleRollingClick(e) {
  if (rollingState === 'waitingForFirstClick') {
    // First click - mark top-left corner
    firstClickData = {
      x: e.clientX,
      y: e.clientY,
      scrollY: window.scrollY
    };
    
    // Show marker at click position
    rollingBox.style.position = 'absolute';
    rollingBox.style.left = (e.clientX + window.scrollX) + 'px';
    rollingBox.style.top = (e.clientY + window.scrollY) + 'px';
    rollingBox.style.width = '10px';
    rollingBox.style.height = '10px';
    rollingBox.style.display = 'block';
    rollingBox.style.background = '#9B9565';
    rollingBox.style.borderRadius = '50%';
    
    // Update state and instruction
    rollingState = 'waitingForSecondClick';
    rollingInstructionText.innerHTML = '🔄 <strong>Step 2:</strong> Scroll down manually, then click bottom-right corner to finish • ESC to cancel';
    
    console.log('Rolling capture: First click recorded at', firstClickData);
    
  } else if (rollingState === 'waitingForSecondClick') {
    // Second click - mark bottom-right corner and process
    const secondClickData = {
      x: e.clientX,
      y: e.clientY,
      scrollY: window.scrollY
    };
    
    console.log('Rolling capture: Second click recorded at', secondClickData);
    
    // Calculate bounds
    const startX = firstClickData.x;
    const startY = firstClickData.y + firstClickData.scrollY;
    const endX = secondClickData.x;
    const endY = secondClickData.y + secondClickData.scrollY;
    
    const left = Math.min(startX, endX);
    const right = Math.max(startX, endX);
    const top = Math.min(startY, endY);
    const bottom = Math.max(startY, endY);
    
    const width = right - left;
    const totalHeight = bottom - top;
    
    // Minimum selection size
    if (width < 50 || totalHeight < 50) {
      cleanupRollingCapture();
      alert('Selection too small. Please select a larger area.');
      return;
    }
    
    // Calculate segments with overlap
    // Professional tools use 100-150px overlap to ensure smooth stitching
    const viewportHeight = window.innerHeight;
    const overlapAmount = 150; // pixels of overlap between segments
    const segmentStep = viewportHeight - overlapAmount; // how far to scroll each time
    const topScrollY = Math.max(0, top - firstClickData.y);
    const topY = firstClickData.y; // Y offset where first segment starts (for crop calculation)
    const numSegments = Math.ceil(totalHeight / segmentStep);
    
    // Build segment data
    const segments = [];
    for (let i = 0; i < numSegments; i++) {
      // CRITICAL FIX: Account for first segment's crop offset!
      // Segment 0 is cropped at topY, so it captures from (scrollY + topY) to (scrollY + viewportHeight)
      // Subsequent segments must start where the previous ended minus overlap
      let segmentScrollY;
      if (i === 0) {
        segmentScrollY = topScrollY;
      } else {
        // First segment ends at absolute position: topScrollY + viewportHeight
        // But it started at: topScrollY + topY (due to crop)
        // So next segment should scroll to: (topScrollY + topY + viewportHeight) - overlap
        // For segment i: topScrollY + topY + (i * segmentStep)
        segmentScrollY = topScrollY + topY + (i * segmentStep);
      }
      
      // CRITICAL: First segment crops from user's click position
      // Subsequent segments crop from top of viewport (y=0) since content has scrolled up
      const segmentY = (i === 0) ? firstClickData.y : 0;
      
      // Each segment is full viewport height
      const segmentHeight = viewportHeight;
      
      segments.push({
        scrollY: segmentScrollY,
        bounds: {
          x: left,
          y: segmentY,
          width: width,
          height: segmentHeight,
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio || 1
        },
        // Include overlap info for stitching
        overlap: i === 0 ? 0 : overlapAmount, // First segment has no overlap
        isLast: i === numSegments - 1
      });
    }
    
    const platform = getPlatform();
    
    console.log('Rolling capture: Sending', segments.length, 'segments with', overlapAmount, 'px overlap');
    console.log('DEBUG - Viewport height:', viewportHeight);
    console.log('DEBUG - Total content height:', totalHeight);
    console.log('DEBUG - First click:', firstClickData);
    console.log('DEBUG - Second click:', secondClickData);
    console.log('DEBUG - Segment step:', segmentStep);
    console.log('DEBUG - Top scrollY:', topScrollY);
    console.log('DEBUG - Top Y offset (first segment crop):', topY);
    segments.forEach((seg, i) => {
      const absoluteStart = seg.scrollY + seg.bounds.y;
      const absoluteEnd = absoluteStart + seg.bounds.height;
      console.log(`DEBUG - Segment ${i}:`, {
        scrollY: seg.scrollY,
        cropY: seg.bounds.y,
        cropHeight: seg.bounds.height,
        absoluteStart: absoluteStart,
        absoluteEnd: absoluteEnd
      });
    });
    
    // Clean up UI
    cleanupRollingCapture();
    
    // Send rolling capture data to background
    chrome.runtime.sendMessage({
      action: 'captureRollingSelection',
      segments: segments,
      totalHeight: totalHeight,
      overlapAmount: overlapAmount,
      platform: platform,
      url: window.location.href
    });
  }
}

function handleRollingKeyDown(e) {
  if (e.key === 'Escape') {
    cleanupRollingCapture();
  }
}

function cleanupRollingCapture() {
  rollingState = 'idle';
  firstClickData = null;
  
  if (rollingOverlay) {
    rollingOverlay.removeEventListener('click', handleRollingClick);
    rollingOverlay.remove();
    rollingOverlay = null;
  }
  
  if (rollingBox) {
    rollingBox.remove();
    rollingBox = null;
  }
  
  if (rollingInstructionText) {
    rollingInstructionText.remove();
    rollingInstructionText = null;
  }
  
  document.removeEventListener('keydown', handleRollingKeyDown);
}

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
  } else if (request.action === 'scrollAndWait') {
    // Smart scroll waiting - wait for scroll to complete and content to render
    const targetY = request.scrollY;
    const beforeScrollY = window.scrollY;

    window.scrollTo(0, targetY);
    waitForScrollComplete(targetY).then(() => {
      const actualScrollY = window.scrollY;
      const actualDelta = actualScrollY - beforeScrollY;

      sendResponse({
        status: 'scroll complete',
        actualScrollY: actualScrollY,
        targetScrollY: targetY,
        scrollDelta: actualDelta,
        scrolledToTarget: Math.abs(actualScrollY - targetY) < 5
      });
    });
    return true; // Keep message channel open for async response
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
  } else if (request.action === 'updateProgress') {
    updateProgress(request.currentSegment, request.totalSegments);
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

// Smart scroll waiting - wait for scroll to stabilize and content to render
function waitForScrollComplete(targetY) {
  return new Promise((resolve) => {
    let lastY = window.scrollY;
    let stableCount = 0;
    const maxWaitTime = 2000; // Maximum 2 seconds wait
    const startTime = Date.now();

    const checkInterval = setInterval(() => {
      const currentY = window.scrollY;
      const elapsed = Date.now() - startTime;

      // Check if we've waited too long
      if (elapsed > maxWaitTime) {
        clearInterval(checkInterval);
        // Give a final small buffer for rendering
        setTimeout(resolve, 50);
        return;
      }

      // Check if scroll position is stable
      if (Math.abs(currentY - lastY) < 1) {
        stableCount++;
        // If stable for 3 checks (~30ms), consider it complete
        if (stableCount >= 3) {
          clearInterval(checkInterval);
          // Extra buffer for content rendering
          setTimeout(resolve, 50);
          return;
        }
      } else {
        stableCount = 0;
      }

      lastY = currentY;
    }, 10); // Check every 10ms
  });
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

// Rolling capture system - Auto-scroll approach (like Snagit/Greenshot)
let rollingOverlay = null;
let rollingBox = null;
let rollingInstructionText = null;
let rollingProgressBar = null;
let isRollingSelecting = false;
let rollingStartX = 0;
let rollingStartY = 0;

function startRollingCapture() {
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
    position: fixed;
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
  rollingInstructionText.innerHTML = '🔄 <strong>Rolling Screenshot:</strong> Click and drag to select area • ESC to cancel';

  document.body.appendChild(rollingOverlay);
  document.body.appendChild(rollingBox);
  document.body.appendChild(rollingInstructionText);

  // Event listeners
  rollingOverlay.addEventListener('mousedown', handleRollingMouseDown);
  rollingOverlay.addEventListener('mousemove', handleRollingMouseMove);
  rollingOverlay.addEventListener('mouseup', handleRollingMouseUp);
  document.addEventListener('keydown', handleRollingKeyDown);
}

function handleRollingMouseDown(e) {
  isRollingSelecting = true;
  rollingStartX = e.clientX;
  rollingStartY = e.clientY;

  rollingBox.style.left = rollingStartX + 'px';
  rollingBox.style.top = rollingStartY + 'px';
  rollingBox.style.width = '0px';
  rollingBox.style.height = '0px';
  rollingBox.style.display = 'block';
}

function handleRollingMouseMove(e) {
  if (!isRollingSelecting) return;

  const currentX = e.clientX;
  const currentY = e.clientY;

  const width = Math.abs(currentX - rollingStartX);
  const height = Math.abs(currentY - rollingStartY);
  const left = Math.min(rollingStartX, currentX);
  const top = Math.min(rollingStartY, currentY);

  rollingBox.style.left = left + 'px';
  rollingBox.style.top = top + 'px';
  rollingBox.style.width = width + 'px';
  rollingBox.style.height = height + 'px';
}

async function handleRollingMouseUp(e) {
  if (!isRollingSelecting) return;

  isRollingSelecting = false;

  const currentX = e.clientX;
  const currentY = e.clientY;

  const width = Math.abs(currentX - rollingStartX);
  const height = Math.abs(currentY - rollingStartY);
  const left = Math.min(rollingStartX, currentX);
  const top = Math.min(rollingStartY, currentY);

  // Minimum selection size (50x50)
  if (width < 50 || height < 50) {
    cleanupRollingCapture();
    alert('Selection too small. Please select a larger area.');
    return;
  }

  // Find the scrollable element at this position
  const elementAtPoint = document.elementFromPoint(left + width / 2, top + height / 2);
  const scrollableElement = findScrollableParent(elementAtPoint);

  console.log('Rolling capture: Selected area', { left, top, width, height });
  console.log('Rolling capture: Scrollable element:', scrollableElement);

  // Calculate total scrollable height
  let totalScrollHeight;
  let scrollElement;

  if (scrollableElement && scrollableElement !== document.documentElement && scrollableElement !== document.body) {
    // Found a scrollable container
    scrollElement = scrollableElement;
    totalScrollHeight = scrollElement.scrollHeight;
    console.log('Rolling capture: Using container scroll, height:', totalScrollHeight);
  } else {
    // Use page scroll
    scrollElement = null;
    totalScrollHeight = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight
    );
    console.log('Rolling capture: Using page scroll, height:', totalScrollHeight);
  }

  // Calculate how many segments we need
  const viewportHeight = window.innerHeight;
  const overlapAmount = 150; // pixels of overlap between segments
  const segmentStep = viewportHeight - overlapAmount;

  // Calculate the starting scroll position
  const initialScrollY = scrollElement ? scrollElement.scrollTop : window.scrollY;
  const selectionTopAbsolute = top + initialScrollY;

  // Calculate total height to capture (from top of selection to bottom of scrollable area)
  const remainingHeight = totalScrollHeight - selectionTopAbsolute;
  const captureHeight = Math.max(height, remainingHeight);
  const numSegments = Math.ceil(captureHeight / segmentStep);

  console.log('Rolling capture: Will capture', numSegments, 'segments');
  console.log('Rolling capture: Initial scroll:', initialScrollY);
  console.log('Rolling capture: Total scrollable height:', totalScrollHeight);
  console.log('Rolling capture: Capture height:', captureHeight);

  // Show progress indicator
  showProgressIndicator(numSegments);

  // Build segment data for auto-scroll
  const segments = [];
  for (let i = 0; i < numSegments; i++) {
    const segmentScrollY = initialScrollY + (i * segmentStep);
    const segmentY = (i === 0) ? top : 0; // First segment crops from selection top, others from viewport top

    segments.push({
      scrollY: segmentScrollY,
      bounds: {
        x: left,
        y: segmentY,
        width: width,
        height: viewportHeight,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio || 1
      },
      overlap: i === 0 ? 0 : overlapAmount,
      isLast: i === numSegments - 1,
      segmentIndex: i
    });
  }

  const platform = getPlatform();

  // Remove mouse event listeners
  rollingOverlay.removeEventListener('mousedown', handleRollingMouseDown);
  rollingOverlay.removeEventListener('mousemove', handleRollingMouseMove);
  rollingOverlay.removeEventListener('mouseup', handleRollingMouseUp);

  // Keep overlay visible during capture to show progress
  rollingInstructionText.innerHTML = '🔄 <strong>Capturing...</strong> Auto-scrolling and capturing segments';

  // Send rolling capture data to background with scrollElement info
  chrome.runtime.sendMessage({
    action: 'captureRollingSelection',
    segments: segments,
    totalHeight: captureHeight,
    overlapAmount: overlapAmount,
    platform: platform,
    url: window.location.href,
    useElementScroll: scrollElement !== null,
    scrollElementSelector: scrollElement ? getElementSelector(scrollElement) : null
  }, (response) => {
    // Capture complete, cleanup
    cleanupRollingCapture();
  });
}

// Find the scrollable parent of an element
function findScrollableParent(element) {
  if (!element || element === document.documentElement) {
    return document.documentElement;
  }

  const style = window.getComputedStyle(element);
  const isScrollable = (style.overflow === 'auto' || style.overflow === 'scroll' ||
                       style.overflowY === 'auto' || style.overflowY === 'scroll');

  if (isScrollable && element.scrollHeight > element.clientHeight) {
    return element;
  }

  return findScrollableParent(element.parentElement);
}

// Generate a selector for an element
function getElementSelector(element) {
  if (element.id) {
    return '#' + element.id;
  }

  if (element.className && typeof element.className === 'string') {
    const classes = element.className.trim().split(/\s+/).filter(c => c);
    if (classes.length > 0) {
      return element.tagName.toLowerCase() + '.' + classes.join('.');
    }
  }

  return element.tagName.toLowerCase();
}

// Show progress indicator
function showProgressIndicator(totalSegments) {
  if (rollingProgressBar) {
    rollingProgressBar.remove();
  }

  rollingProgressBar = document.createElement('div');
  rollingProgressBar.style.cssText = `
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    width: 400px;
    background: rgba(43, 95, 111, 0.95);
    border-radius: 8px;
    padding: 16px;
    z-index: 1000002;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  rollingProgressBar.innerHTML = `
    <div style="color: white; font-size: 12px; margin-bottom: 8px; text-align: center;">
      Capturing segment <span id="migshot-current-segment">0</span> of ${totalSegments}
    </div>
    <div style="width: 100%; height: 8px; background: rgba(255,255,255,0.2); border-radius: 4px; overflow: hidden;">
      <div id="migshot-progress-fill" style="width: 0%; height: 100%; background: linear-gradient(90deg, #9B9565 0%, #d4cc8e 100%); transition: width 0.3s ease;"></div>
    </div>
  `;

  document.body.appendChild(rollingProgressBar);
}

// Update progress indicator (called from background script via message)
function updateProgress(currentSegment, totalSegments) {
  const currentSegmentEl = document.getElementById('migshot-current-segment');
  const progressFillEl = document.getElementById('migshot-progress-fill');

  if (currentSegmentEl && progressFillEl) {
    currentSegmentEl.textContent = currentSegment;
    const percentage = (currentSegment / totalSegments) * 100;
    progressFillEl.style.width = percentage + '%';
  }
}

function handleRollingKeyDown(e) {
  if (e.key === 'Escape') {
    cleanupRollingCapture();
  }
}

function cleanupRollingCapture() {
  isRollingSelecting = false;

  if (rollingOverlay) {
    rollingOverlay.removeEventListener('mousedown', handleRollingMouseDown);
    rollingOverlay.removeEventListener('mousemove', handleRollingMouseMove);
    rollingOverlay.removeEventListener('mouseup', handleRollingMouseUp);
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

  if (rollingProgressBar) {
    rollingProgressBar.remove();
    rollingProgressBar = null;
  }

  document.removeEventListener('keydown', handleRollingKeyDown);
}

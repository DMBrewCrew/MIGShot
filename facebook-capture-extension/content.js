// Content script for Facebook and Instagram
console.log('MIGShot extension loaded');

// Detect current platform
function getPlatform() {
  const hostname = window.location.hostname;
  if (hostname.includes('instagram.com')) return 'instagram';
  if (hostname.includes('facebook.com')) return 'facebook';
  return 'unknown';
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getModalBounds') {
    const platform = getPlatform();
    const bounds = getModalBounds(platform);
    sendResponse({ bounds, platform });
  } else if (request.action === 'ping') {
    sendResponse({ status: 'ready' });
  }
  return true;
});

// Detect if we're viewing a post in a modal and get its bounds
function getModalBounds(platform) {
  if (platform === 'instagram') {
    return getInstagramModalBounds();
  } else if (platform === 'facebook') {
    return getFacebookModalBounds();
  }
  return null;
}

// Instagram modal detection
function getInstagramModalBounds() {
  console.log('Instagram: Detecting modal bounds');
  
  const modal = document.querySelector('div[role="dialog"]');
  
  if (!modal) {
    console.log('✓ No modal found - full page view, NO CROP');
    return null;
  }
  
  console.log('Found Instagram modal - looking for article element');
  
  // Instagram uses <article> tag for the full post content (image + comments)
  const article = modal.querySelector('article');
  
  if (article) {
    const rect = article.getBoundingClientRect();
    console.log('✓ Found article element:', Math.round(rect.width), 'x', Math.round(rect.height), 'at', Math.round(rect.x), ',', Math.round(rect.y));
    
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1
    };
  }
  
  console.log('⚠️ No article found, using fallback');
  const modalRect = modal.getBoundingClientRect();
  
  // Trim gray areas from sides
  const sideTrim = 64; // Based on debug: article starts at x=64
  const bottomTrim = 0;
  
  return {
    x: modalRect.x + sideTrim,
    y: modalRect.y + 24, // Based on debug: article starts at y=24
    width: modalRect.width - (sideTrim * 2),
    height: modalRect.height - bottomTrim,
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1
  };
}

// Facebook modal detection (existing logic)
function getFacebookModalBounds() {
  console.log('Facebook: Detecting modal bounds');
  
  // CRITICAL: Only /photo/ pages are full screen (no crop)
  // /posts/ URLs are feed modals (should crop)
  const url = window.location.href;
  const isFullPagePhoto = url.includes('/photo/') || url.includes('/videos/');
  
  if (isFullPagePhoto) {
    console.log('✓ Facebook full page photo/video - NO CROP (full screenshot)');
    return null;
  }
  
  // Check for dialog (modal)
  const dialogs = document.querySelectorAll('[role="dialog"]');
  
  if (dialogs.length === 0) {
    console.log('No Facebook dialog - full screen');
    return null;
  }
  
  console.log(`Found ${dialogs.length} dialogs - looking for post box to CROP`);
  
  // Strategy: Find the LARGEST white box that contains post content, then trim bottom
  let bestBox = null;
  let maxArea = 0;
  
  for (const dialog of dialogs) {
    const allDivs = dialog.querySelectorAll('div');
    
    for (const div of allDivs) {
      const rect = div.getBoundingClientRect();
      const styles = window.getComputedStyle(div);
      const bg = styles.backgroundColor;
      
      // Must be light/white background
      const isLight = bg.includes('255') || bg.includes('254') || bg.includes('253') || 
                     bg.includes('242') || bg.includes('250') || bg.includes('248');
      
      const bigEnough = rect.width > 500 && rect.height > 300;
      
      // Must contain actual post content (image, video, or text content)
      const hasContent = div.querySelector('img[src*="scontent"]') || 
                        div.querySelector('video') ||
                        (div.querySelector('div[dir="auto"]') && div.textContent.length > 50);
      
      const area = rect.width * rect.height;
      
      // Pick LARGEST box (to get full post with comments)
      if (isLight && bigEnough && hasContent && area > maxArea) {
        const aspectRatio = rect.height / rect.width;
        if (aspectRatio < 3) { // Not extremely tall
          maxArea = area;
          bestBox = rect;
          console.log('Found full post box:', rect.width, 'x', rect.height, 'bg:', bg);
        }
      }
    }
  }
  
  if (!bestBox) {
    console.log('No good content box found');
    return null;
  }
  
  // CRITICAL: Trim bottom padding/shadow (for feed modals and /posts/ URLs)
  const trimAmount = 225; // Adjust this value as needed
  
  console.log('✓ Using full post box (trimming', trimAmount, 'px from bottom)');
  console.log('  Original:', bestBox.width, 'x', bestBox.height);
  console.log('  Trimmed:', bestBox.width, 'x', (bestBox.height - trimAmount));
  
  return {
    x: bestBox.x,
    y: bestBox.y,
    width: bestBox.width,
    height: bestBox.height - trimAmount,  // Trim bottom
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1
  };
}

// Handle keyboard shortcut (Ctrl+M)
chrome.commands.onCommand.addListener((command) => {
  if (command === 'capture-post') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && (tabs[0].url.includes('facebook.com') || tabs[0].url.includes('instagram.com'))) {
        capturePost(tabs[0].id);
      }
    });
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'capture') {
    capturePost(request.tabId).then(data => {
      sendResponse({ data });
    }).catch(error => {
      sendResponse({ error: error.message });
    });
    return true;
  }
});

// Simple capture function - screenshot + URL (with optional cropping for modals)
async function capturePost(tabId) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab.url;
    
    // Detect platform from URL
    let platform = 'unknown';
    if (url.includes('facebook.com')) platform = 'facebook';
    else if (url.includes('instagram.com')) platform = 'instagram';
    
    console.log('Capturing post from:', platform, url);
    
    // Inject content script
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
    
    // Wait a moment for content script to load
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Get modal bounds and platform from content script
    const response = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: 'getModalBounds' }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('Could not get modal bounds:', chrome.runtime.lastError.message);
          resolve({ bounds: null, platform: platform });
        } else {
          resolve(response || { bounds: null, platform: platform });
        }
      });
    });
    
    const bounds = response.bounds;
    
    // Capture full screenshot
    const fullScreenshot = await chrome.tabs.captureVisibleTab(null, {
      format: 'png'
    });
    
    let finalScreenshot = fullScreenshot;
    
    // If we have modal bounds, crop the image
    if (bounds) {
      console.log('Cropping to modal bounds:', bounds);
      finalScreenshot = await cropImage(fullScreenshot, bounds);
    } else {
      console.log('No modal detected - using full screenshot');
    }
    
    return {
      url: url,
      screenshot: finalScreenshot,
      date: null,
      platform: platform  // Add platform info
    };
    
  } catch (error) {
    console.error('Capture error:', error);
    throw new Error('Failed to capture post: ' + error.message);
  }
}

// Crop image to modal bounds (using createImageBitmap for service worker compatibility)
async function cropImage(base64Image, bounds) {
  // Account for device pixel ratio (retina displays)
  const dpr = bounds.devicePixelRatio;
  const x = bounds.x * dpr;
  const y = bounds.y * dpr;
  const width = bounds.width * dpr;
  const height = bounds.height * dpr;
  
  // Convert base64 to blob
  const response = await fetch(base64Image);
  const blob = await response.blob();
  
  // Create ImageBitmap (works in service workers)
  const imageBitmap = await createImageBitmap(blob);
  
  // Create canvas for cropping
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  // Draw cropped portion
  ctx.drawImage(
    imageBitmap,
    x, y, width, height,  // source
    0, 0, width, height   // destination
  );
  
  // Convert to base64
  const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
  return await blobToBase64(croppedBlob);
}

// Generate date badge (only called when date exists and is 2025)
async function generateDateBadge(dateText) {
  const canvas = new OffscreenCanvas(150, 40);
  const ctx = canvas.getContext('2d');
  
  const gradient = ctx.createLinearGradient(0, 0, 0, 40);
  gradient.addColorStop(0, '#4267B2');
  gradient.addColorStop(1, '#365899');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 150, 40);
  
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.fillRect(0, 35, 150, 5);
  
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 6px Arial, sans-serif';
  ctx.fillText('POSTED ON', 75, 10);
  ctx.font = 'bold 16px Arial, sans-serif';
  ctx.fillText(dateText, 75, 25);
  
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return await blobToBase64(blob);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Expose generateDateBadge for archive to use
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'generateDateBadge') {
    generateDateBadge(request.date).then(badge => {
      sendResponse({ dateBadge: badge });
    });
    return true;
  }
});

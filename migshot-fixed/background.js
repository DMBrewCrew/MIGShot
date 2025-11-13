// Store current case info for keyboard shortcut captures
let pendingCaseInfo = null;

// Handle keyboard shortcut (Alt+S and Alt+Shift+F)
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'capture-post') {
    // Get current case before starting capture
    const result = await chrome.storage.local.get(['currentCase']);
    pendingCaseInfo = result.currentCase || null;
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        startCapture(tabs[0].id);
      }
    });
  } else if (command === 'rolling-capture') {
    // Get current case before starting rolling capture
    const result = await chrome.storage.local.get(['currentCase']);
    pendingCaseInfo = result.currentCase || null;
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        startRollingCapture(tabs[0].id);
      }
    });
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startCapture') {
    // Store case info for this capture
    pendingCaseInfo = request.caseInfo || null;
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        startCapture(tabs[0].id).then(() => {
          sendResponse({ status: 'started' });
        });
      }
    });
    return true;
  } else if (request.action === 'captureSelection') {
    // Received selection bounds from content script
    captureSelectedArea(sender.tab.id, request.bounds, request.platform, request.url).then(data => {
      sendResponse({ data });
    }).catch(error => {
      sendResponse({ error: error.message });
    });
    return true;
  } else if (request.action === 'captureRollingSelection') {
    // Received rolling capture data from content script
    captureRollingArea(sender.tab.id, request.segments, request.platform, request.url, request.overlapAmount).then(data => {
      sendResponse({ data });
    }).catch(error => {
      sendResponse({ error: error.message });
    });
    return true;
  }
});

// Start the capture process - check if content script loaded, then start selection UI
async function startCapture(tabId) {
  try {
    // Check if content script is already loaded
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      console.log('Content script already loaded');
    } catch (error) {
      // Content script not loaded, inject it
      console.log('Injecting content script');
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
      
      // Wait a moment for content script to load
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Tell content script to start area selection
    await chrome.tabs.sendMessage(tabId, { action: 'startSelection' });
    
  } catch (error) {
    console.error('Start capture error:', error);
  }
}

// Start the rolling capture process
async function startRollingCapture(tabId) {
  try {
    // Check if content script is already loaded
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      console.log('Content script already loaded');
    } catch (error) {
      // Content script not loaded, inject it
      console.log('Injecting content script');
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
      
      // Wait a moment for content script to load
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Tell content script to start rolling capture
    await chrome.tabs.sendMessage(tabId, { action: 'startRollingCapture' });
    
  } catch (error) {
    console.error('Start rolling capture error:', error);
  }
}

// Capture the selected area
async function captureSelectedArea(tabId, bounds, platform, url) {
  try {
    console.log('Capturing selected area:', bounds);
    
    // HIDE USER DATA before screenshot
    await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: 'hideUserData' }, () => {
        if (chrome.runtime.lastError) {
          console.log('Could not hide user data:', chrome.runtime.lastError.message);
        }
        resolve();
      });
    });
    
    // Wait for CSS to apply
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Capture full screenshot
    const fullScreenshot = await chrome.tabs.captureVisibleTab(null, {
      format: 'png'
    });
    
    // RESTORE USER DATA after screenshot
    await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: 'restoreUserData' }, () => {
        if (chrome.runtime.lastError) {
          console.log('Could not restore user data:', chrome.runtime.lastError.message);
        }
        resolve();
      });
    });
    
    // Crop to selected bounds
    const finalScreenshot = await cropImage(fullScreenshot, bounds);
    
    // Store in archive with case info
    const captureData = {
      url: url,
      screenshot: finalScreenshot,
      date: null,
      platform: platform,
      isAboutPage: false, // Default to false, can be changed in archive
      capturedAt: new Date().toISOString(),
      // Case management fields
      caseName: pendingCaseInfo?.name || null,
      caseMIG: pendingCaseInfo?.mig || null,
      subjectName: pendingCaseInfo?.currentSubject || null
    };
    
    // Clear pending case info after use
    const usedCaseInfo = pendingCaseInfo;
    pendingCaseInfo = null;
    
    const result = await chrome.storage.local.get(['captures']);
    const captures = result.captures || [];
    captures.push(captureData);
    
    try {
      await chrome.storage.local.set({ captures });
      console.log('Capture saved to archive with case:', usedCaseInfo);
    } catch (storageError) {
      console.error('Storage error:', storageError);
      throw new Error('Storage full! Please open Archive and delete some captures to free up space, then try again.');
    }
    
    return captureData;
    
  } catch (error) {
    console.error('Capture error:', error);
    throw new Error('Failed to capture: ' + error.message);
  }
}

// Analyze if a segment is mostly blank (>95% white/transparent pixels)
async function isBlankSegment(base64Image) {
  try {
    // Convert base64 to blob
    const response = await fetch(base64Image);
    const blob = await response.blob();

    // Create ImageBitmap
    const bitmap = await createImageBitmap(blob);

    // Create small canvas for sampling (don't need full resolution)
    const sampleSize = Math.min(bitmap.width, bitmap.height, 200);
    const canvas = new OffscreenCanvas(sampleSize, sampleSize);
    const ctx = canvas.getContext('2d');

    // Draw scaled-down version for faster analysis
    ctx.drawImage(bitmap, 0, 0, sampleSize, sampleSize);
    bitmap.close(); // Clean up bitmap

    // Get pixel data
    const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
    const pixels = imageData.data;

    let blankPixels = 0;
    const threshold = 250; // Near-white threshold (250-255)
    const totalPixels = pixels.length / 4;

    // Sample every 4th pixel for performance (still statistically significant)
    for (let i = 0; i < pixels.length; i += 16) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const a = pixels[i + 3];

      // Check if pixel is white or transparent
      if ((r > threshold && g > threshold && b > threshold) || a < 10) {
        blankPixels++;
      }
    }

    const sampledPixels = pixels.length / 16;
    const blankPercentage = blankPixels / sampledPixels;

    return blankPercentage > 0.95; // More than 95% blank
  } catch (error) {
    console.log('Error analyzing segment, assuming not blank:', error);
    return false; // If error, assume not blank to be safe
  }
}

// Capture rolling area by stitching multiple segments
async function captureRollingArea(tabId, segments, platform, url, overlapAmount = 150) {
  try {
    console.log('Capturing rolling area:', segments.length, 'segments with', overlapAmount, 'px overlap');
    
    // HIDE USER DATA and FIXED ELEMENTS before screenshots
    await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: 'hideUserData' }, () => {
        if (chrome.runtime.lastError) {
          console.log('Could not hide user data:', chrome.runtime.lastError.message);
        }
        resolve();
      });
    });
    
    await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: 'hideFixedElements' }, () => {
        if (chrome.runtime.lastError) {
          console.log('Could not hide fixed elements:', chrome.runtime.lastError.message);
        }
        resolve();
      });
    });
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Capture each segment
    // Note: Chrome has a rate limit of ~2 captures/second for captureVisibleTab
    const segmentImages = [];
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      // Update progress indicator
      await chrome.tabs.sendMessage(tabId, {
        action: 'updateProgress',
        currentSegment: i + 1,
        totalSegments: segments.length
      }).catch(() => {}); // Ignore errors if content script was removed

      // Scroll to the position and wait for completion
      await chrome.tabs.sendMessage(tabId, {
        action: 'scrollAndWait',
        scrollY: segment.scrollY
      });

      // Capture screenshot
      const screenshot = await chrome.tabs.captureVisibleTab(null, {
        format: 'png'
      });

      // Crop to bounds
      const croppedImage = await cropImage(screenshot, segment.bounds);

      // Check if segment is blank before adding
      const isBlank = await isBlankSegment(croppedImage);

      if (isBlank) {
        console.log(`Segment ${i + 1}/${segments.length} is blank, skipping`);
        // Update progress to show we skipped it
        await chrome.tabs.sendMessage(tabId, {
          action: 'updateProgress',
          currentSegment: i + 1,
          totalSegments: segments.length,
          skipped: true
        }).catch(() => {});
      } else {
        segmentImages.push(croppedImage);
        console.log(`Captured segment ${i + 1}/${segments.length}`);
      }

      // IMPORTANT: Wait between captures to respect Chrome's rate limit
      // Chrome allows ~2 captures/second, so wait 600ms between each
      if (i < segments.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 600));
      }
    }
    
    // RESTORE USER DATA and FIXED ELEMENTS after screenshots
    await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: 'restoreUserData' }, () => {
        if (chrome.runtime.lastError) {
          console.log('Could not restore user data:', chrome.runtime.lastError.message);
        }
        resolve();
      });
    });
    
    await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: 'restoreFixedElements' }, () => {
        if (chrome.runtime.lastError) {
          console.log('Could not restore fixed elements:', chrome.runtime.lastError.message);
        }
        resolve();
      });
    });
    
    // Check if we have any non-blank segments
    if (segmentImages.length === 0) {
      throw new Error('All segments were blank - nothing to capture!');
    }

    // Stitch images together
    const devicePixelRatio = segments[0]?.bounds?.devicePixelRatio || 1;
    const stitchedImage = await stitchImages(segmentImages, overlapAmount, devicePixelRatio);

    console.log(`Stitched ${segmentImages.length} non-blank segments (skipped ${segments.length - segmentImages.length} blank segments)`);
    
    // Store in archive with case info
    const captureData = {
      url: url,
      screenshot: stitchedImage,
      date: null,
      platform: platform,
      isAboutPage: false,
      capturedAt: new Date().toISOString(),
      caseName: pendingCaseInfo?.name || null,
      caseMIG: pendingCaseInfo?.mig || null,
      subjectName: pendingCaseInfo?.currentSubject || null
    };
    
    // Clear pending case info
    const usedCaseInfo = pendingCaseInfo;
    pendingCaseInfo = null;
    
    const result = await chrome.storage.local.get(['captures']);
    const captures = result.captures || [];
    captures.push(captureData);
    
    try {
      await chrome.storage.local.set({ captures });
      console.log('Rolling capture saved to archive with case:', usedCaseInfo);
    } catch (storageError) {
      console.error('Storage error:', storageError);
      throw new Error('Storage full! Please open Archive and delete some captures to free up space, then try again.');
    }
    
    return captureData;
    
  } catch (error) {
    console.error('Rolling capture error:', error);
    throw new Error('Failed to capture rolling area: ' + error.message);
  }
}

// Stitch multiple images vertically with overlap removal
async function stitchImages(base64Images, overlapAmount = 150, devicePixelRatio = 1) {
  if (base64Images.length === 1) {
    return base64Images[0];
  }
  
  console.log('Stitching', base64Images.length, 'images with', overlapAmount, 'px overlap at', devicePixelRatio, 'x DPR');
  
  // Load all images as bitmaps
  const imageBitmaps = [];

  for (const base64Image of base64Images) {
    const response = await fetch(base64Image);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    imageBitmaps.push(bitmap);
  }

  console.log('Loaded', imageBitmaps.length, 'image bitmaps for stitching');
  
  // Calculate total height with overlap removed
  // First image: full height
  // Subsequent images: full height minus overlap
  const overlapPixels = Math.floor(overlapAmount * devicePixelRatio); // Account for device pixel ratio
  
  let totalHeight = imageBitmaps[0].height; // First image full height
  for (let i = 1; i < imageBitmaps.length; i++) {
    totalHeight += (imageBitmaps[i].height - overlapPixels); // Subsequent images minus overlap
  }
  
  const maxWidth = Math.max(...imageBitmaps.map(b => b.width));
  
  console.log('Total stitched height:', totalHeight, 'px (removed', (overlapPixels * (imageBitmaps.length - 1)), 'px of overlap)');
  
  // Create canvas with calculated height
  const canvas = new OffscreenCanvas(maxWidth, totalHeight);
  const ctx = canvas.getContext('2d');
  
  // Draw images with overlap removed
  let currentY = 0;

  for (let i = 0; i < imageBitmaps.length; i++) {
    const bitmap = imageBitmaps[i];

    if (i === 0) {
      // First image: draw the entire image
      ctx.drawImage(bitmap, 0, 0);
      currentY += bitmap.height;
      console.log('Segment 0: Drew full image at y=0, height=', bitmap.height);
    } else {
      // Subsequent images: skip the overlap portion at the top
      // We draw only the non-overlapping part
      ctx.drawImage(
        bitmap,
        0, overlapPixels,                    // Source: start below overlap
        bitmap.width, bitmap.height - overlapPixels,  // Source: dimensions
        0, currentY,                         // Destination: current Y position
        bitmap.width, bitmap.height - overlapPixels   // Destination: dimensions
      );
      currentY += (bitmap.height - overlapPixels);
      console.log('Segment', i, ': Drew from y=', overlapPixels, 'height=', (bitmap.height - overlapPixels), 'at canvas y=', (currentY - (bitmap.height - overlapPixels)));
    }

    // Clean up bitmap memory immediately after drawing
    bitmap.close();
  }

  console.log('Memory cleanup: Closed', imageBitmaps.length, 'bitmaps');
  
  // Convert to base64
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return await blobToBase64(blob);
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

  // Clean up bitmap memory
  imageBitmap.close();

  // Convert to base64
  const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
  return await blobToBase64(croppedBlob);
}

// Generate date badge (only called when date exists and is 2025)
async function generateDateBadge(dateText) {
  const canvas = new OffscreenCanvas(150, 40);
  const ctx = canvas.getContext('2d');
  
  const gradient = ctx.createLinearGradient(0, 0, 0, 40);
  gradient.addColorStop(0, '#2B5F6F');
  gradient.addColorStop(1, '#1a3d48');
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

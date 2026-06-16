// Store current case info for keyboard shortcut captures
let pendingCaseInfo = null;

// Extract profile identifier from URL
function extractProfileFromURL(url, platform) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const pathname = urlObj.pathname;
    
    // Facebook
    if (hostname.includes('facebook.com')) {
      // IMPORTANT: Check ID parameter FIRST before pathname
      // Profile ID: facebook.com/profile.php?id=123456&sk=... - extract full ID before &
      const idParam = urlObj.searchParams.get('id');
      if (idParam) {
        // Return full ID (already extracted by searchParams, which stops at &)
        return idParam;
      }
      
      // Profile URL: facebook.com/username (only if no ID param found)
      const match = pathname.match(/^\/([^\/\?]+)/);
      if (match && match[1] && !['photo', 'photos', 'groups', 'pages', 'watch', 'marketplace', 'events', 'gaming', 'profile.php'].includes(match[1])) {
        return match[1];
      }
    }
    
    // Instagram
    if (hostname.includes('instagram.com')) {
      // Profile: instagram.com/username
      const match = pathname.match(/^\/([^\/\?]+)/);
      if (match && match[1] && !['p', 'tv', 'reel', 'reels', 'stories', 'explore'].includes(match[1])) {
        return match[1];
      }
    }
    
    // TikTok
    if (hostname.includes('tiktok.com')) {
      // Profile: tiktok.com/@username
      const match = pathname.match(/^\/@([^\/\?]+)/);
      if (match && match[1]) {
        return '@' + match[1];
      }
    }
    
    // Twitter/X
    if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
      // Profile: twitter.com/username
      const match = pathname.match(/^\/([^\/\?]+)/);
      if (match && match[1] && !['home', 'explore', 'notifications', 'messages', 'i', 'search'].includes(match[1])) {
        return match[1];
      }
    }
    
    // LinkedIn
    if (hostname.includes('linkedin.com')) {
      // Profile: linkedin.com/in/username
      const match = pathname.match(/^\/in\/([^\/\?]+)/);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    // YouTube
    if (hostname.includes('youtube.com')) {
      // Channel: youtube.com/@username or youtube.com/c/username
      const match = pathname.match(/^\/@([^\/\?]+)|^\/c\/([^\/\?]+)|^\/channel\/([^\/\?]+)/);
      if (match) {
        return match[1] || match[2] || match[3];
      }
    }
    
    return null; // Could not extract profile
  } catch (error) {
    console.error('Error extracting profile from URL:', error);
    return null;
  }
}

// Handle keyboard shortcut (Alt+S and Alt+Shift+F)
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'capture-post') {
    // Get current case before starting capture
    const result = await chrome.storage.local.get(['currentCase']);
    pendingCaseInfo = result.currentCase || null;
    
    // Check if case exists
    if (!pendingCaseInfo || !pendingCaseInfo.name || !pendingCaseInfo.mig) {
      // Set flag to show new case modal, then open popup
      await chrome.storage.local.set({ showNewCaseModal: true });
      chrome.action.openPopup();
      return;
    }
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        startCapture(tabs[0].id);
      }
    });
  } else if (command === 'rolling-capture') {
    // Get current case before starting rolling capture
    const result = await chrome.storage.local.get(['currentCase']);
    pendingCaseInfo = result.currentCase || null;
    
    // Check if case exists
    if (!pendingCaseInfo || !pendingCaseInfo.name || !pendingCaseInfo.mig) {
      // Set flag to show new case modal, then open popup
      await chrome.storage.local.set({ showNewCaseModal: true });
      chrome.action.openPopup();
      return;
    }
    
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
  } else if (request.action === 'captureViewport') {
    // Freeze-first: hide identifying elements, screenshot the visible viewport,
    // restore, and hand the image back so the content script can freeze it and
    // let the user draw the selection on the still image (no scroll/reflow race).
    captureFrozenViewport(sender.tab.id).then(image => {
      sendResponse({ image });
    }).catch(error => {
      sendResponse({ error: error.message });
    });
    return true;
  } else if (request.action === 'captureSelection') {
    // Received selection bounds + the frozen image from the content script.
    captureSelectedArea(sender.tab.id, request.bounds, request.platform, request.url, request.image).then(data => {
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

// Rate-limit-safe wrapper for captureVisibleTab. Chrome throttles this call to
// a few per second (MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND); on a throttle
// error we back off briefly and retry instead of silently losing the shot.
async function captureVisibleTabWithRetry(options, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await chrome.tabs.captureVisibleTab(null, options);
    } catch (err) {
      lastErr = err;
      const msg = (err && err.message) || '';
      if (!/MAX_CAPTURE_VISIBLE_TAB|exceeded|quota|too many/i.test(msg)) throw err;
      await new Promise(r => setTimeout(r, 350 * (i + 1)));
    }
  }
  throw lastErr;
}

// Freeze-first capture: hide identifying elements, screenshot the visible
// viewport, then restore. Returns the PNG data URL for the content script to
// freeze and let the user select on. Capturing BEFORE the user draws the box is
// what eliminates the scroll/reflow "wrong crop" race.
async function captureFrozenViewport(tabId) {
  await new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { action: 'hideUserData' }, () => {
      void chrome.runtime.lastError;  // page may block messaging; proceed
      resolve();
    });
  });
  // Let the hide CSS apply before the shot.
  await new Promise(resolve => setTimeout(resolve, 120));
  try {
    return await captureVisibleTabWithRetry({ format: 'png' });
  } finally {
    await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: 'restoreUserData' }, () => {
        void chrome.runtime.lastError;
        resolve();
      });
    });
  }
}

// Capture the selected area
async function captureSelectedArea(tabId, bounds, platform, url, image) {
  try {
    console.log('Capturing selected area:', bounds);

    // Harden against MV3 service-worker suspension during the user's selection:
    // if the in-memory case was lost, restore it from storage (source of truth).
    if (!pendingCaseInfo || !pendingCaseInfo.name || !pendingCaseInfo.mig) {
      const _cc = await chrome.storage.local.get(['currentCase']);
      if (_cc.currentCase) pendingCaseInfo = _cc.currentCase;
    }
    
    // Smart account selection: Always check for the highest account number for this platform
    let accountIdentifier = '1'; // Default
    
    if (pendingCaseInfo && pendingCaseInfo.name && pendingCaseInfo.mig && pendingCaseInfo.currentSubject) {
      // ALWAYS check existing captures to find highest account number for this platform
      // This ensures we pick up manually-created accounts (e.g., FB 3)
      const result = await chrome.storage.local.get(['captures']);
      const captures = result.captures || [];
      
      const platformAccounts = captures
        .filter(c => 
          c.caseName === pendingCaseInfo.name && 
          c.caseMIG === pendingCaseInfo.mig && 
          c.subjectName === pendingCaseInfo.currentSubject &&
          c.platform === platform
        )
        .map(c => parseInt(c.accountIdentifier) || 1);
      
      if (platformAccounts.length > 0) {
        accountIdentifier = Math.max(...platformAccounts).toString();
        console.log('Found highest account for', platform, ':', accountIdentifier);
      } else {
        console.log('No existing accounts for', platform, ', using default: 1');
      }
    }
    
    // Freeze-first: the viewport was already captured (with user data hidden)
    // BEFORE the user drew the selection — see captureFrozenViewport. We crop
    // that frozen image, so scrolling / lazy-load / reflow during the drag can't
    // change what gets captured.
    const fullScreenshot = image;
    if (!fullScreenshot) {
      throw new Error('No frozen screenshot was provided for the selection.');
    }

    // Crop to selected bounds
    const finalScreenshot = await cropImage(fullScreenshot, bounds);
    
    // Store in archive with case info and account
    const captureData = {
      url: url,
      screenshot: finalScreenshot,
      date: null,
      platform: platform,
      accountIdentifier: accountIdentifier,
      isAboutPage: false,
      capturedAt: new Date().toISOString(),
      sortOrders: {}, // Empty object - will be populated when user reorders
      // Case management fields
      caseName: pendingCaseInfo?.name || null,
      caseMIG: pendingCaseInfo?.mig || null,
      subjectName: pendingCaseInfo?.currentSubject || null
    };
    
    // Clear pending case info after use
    const usedCaseInfo = pendingCaseInfo;
    pendingCaseInfo = null;
    
    const storageResult = await chrome.storage.local.get(['captures']);
    const captures = storageResult.captures || [];
    captures.push(captureData);
    
    try {
      await chrome.storage.local.set({ captures });
      console.log('Capture saved to archive with case:', usedCaseInfo, 'account:', accountIdentifier);
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

// ============================================================================
// DUPLICATE DETECTION UTILITIES
// ============================================================================

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

// TECHNIQUE #1: Perceptual Hash (pHash) - Generate visual fingerprint
async function generatePerceptualHash(base64Image) {
  try {
    const response = await fetch(base64Image);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    // Resize to 8x8 for pHash (standard size)
    const hashSize = 8;
    const canvas = new OffscreenCanvas(hashSize, hashSize);
    const ctx = canvas.getContext('2d');

    // Convert to grayscale and resize
    ctx.drawImage(bitmap, 0, 0, hashSize, hashSize);
    bitmap.close();

    const imageData = ctx.getImageData(0, 0, hashSize, hashSize);
    const pixels = imageData.data;

    // Convert to grayscale values
    const gray = [];
    for (let i = 0; i < pixels.length; i += 4) {
      const grayValue = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
      gray.push(grayValue);
    }

    // Calculate average
    const avg = gray.reduce((a, b) => a + b, 0) / gray.length;

    // Generate hash: 1 if above average, 0 if below
    let hash = '';
    for (let i = 0; i < gray.length; i++) {
      hash += gray[i] > avg ? '1' : '0';
    }

    return hash;
  } catch (error) {
    console.log('Error generating perceptual hash:', error);
    return null;
  }
}

// Compare two perceptual hashes (Hamming distance)
function compareHashes(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) {
    return 0;
  }

  let differences = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) {
      differences++;
    }
  }

  // Return similarity percentage (0-100)
  const similarity = ((hash1.length - differences) / hash1.length) * 100;
  return similarity;
}

// TECHNIQUE #2: Overlap Region Verification
async function verifyOverlapMatch(image1, image2, overlapPixels) {
  try {
    const response1 = await fetch(image1);
    const blob1 = await response1.blob();
    const bitmap1 = await createImageBitmap(blob1);

    const response2 = await fetch(image2);
    const blob2 = await response2.blob();
    const bitmap2 = await createImageBitmap(blob2);

    // Extract bottom portion of image1
    const canvas1 = new OffscreenCanvas(bitmap1.width, overlapPixels);
    const ctx1 = canvas1.getContext('2d');
    ctx1.drawImage(
      bitmap1,
      0, bitmap1.height - overlapPixels,
      bitmap1.width, overlapPixels,
      0, 0,
      bitmap1.width, overlapPixels
    );

    // Extract top portion of image2
    const canvas2 = new OffscreenCanvas(bitmap2.width, overlapPixels);
    const ctx2 = canvas2.getContext('2d');
    ctx2.drawImage(
      bitmap2,
      0, 0,
      bitmap2.width, overlapPixels,
      0, 0,
      bitmap2.width, overlapPixels
    );

    bitmap1.close();
    bitmap2.close();

    // Compare the overlap regions
    const imageData1 = ctx1.getImageData(0, 0, canvas1.width, canvas1.height);
    const imageData2 = ctx2.getImageData(0, 0, canvas2.width, canvas2.height);

    // Calculate MSE between overlap regions
    const mse = calculateMSE(imageData1, imageData2);

    // Low MSE means good match (< 100 is excellent, < 500 is good)
    return mse;
  } catch (error) {
    console.log('Error verifying overlap:', error);
    return 0; // Assume good match on error
  }
}

// TECHNIQUE #3: Mean Squared Error (MSE) for pixel-level comparison
function calculateMSE(imageData1, imageData2) {
  const pixels1 = imageData1.data;
  const pixels2 = imageData2.data;

  if (pixels1.length !== pixels2.length) {
    return Infinity; // Images are different sizes
  }

  let sumSquaredDiff = 0;
  let count = 0;

  // Compare every pixel (sample every 4th pixel for performance)
  for (let i = 0; i < pixels1.length; i += 16) {
    const r1 = pixels1[i];
    const g1 = pixels1[i + 1];
    const b1 = pixels1[i + 2];

    const r2 = pixels2[i];
    const g2 = pixels2[i + 1];
    const b2 = pixels2[i + 2];

    const diff = (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
    sumSquaredDiff += diff;
    count++;
  }

  return sumSquaredDiff / count;
}

// TECHNIQUE #3b: Full image similarity using MSE
async function calculateImageSimilarity(image1, image2) {
  try {
    const response1 = await fetch(image1);
    const blob1 = await response1.blob();
    const bitmap1 = await createImageBitmap(blob1);

    const response2 = await fetch(image2);
    const blob2 = await response2.blob();
    const bitmap2 = await createImageBitmap(blob2);

    // Resize both to same small size for comparison
    const compareSize = 100;
    const canvas1 = new OffscreenCanvas(compareSize, compareSize);
    const ctx1 = canvas1.getContext('2d');
    ctx1.drawImage(bitmap1, 0, 0, compareSize, compareSize);

    const canvas2 = new OffscreenCanvas(compareSize, compareSize);
    const ctx2 = canvas2.getContext('2d');
    ctx2.drawImage(bitmap2, 0, 0, compareSize, compareSize);

    bitmap1.close();
    bitmap2.close();

    const imageData1 = ctx1.getImageData(0, 0, compareSize, compareSize);
    const imageData2 = ctx2.getImageData(0, 0, compareSize, compareSize);

    return calculateMSE(imageData1, imageData2);
  } catch (error) {
    console.log('Error calculating image similarity:', error);
    return Infinity;
  }
}

// TECHNIQUE #4: Histogram Comparison
async function generateHistogram(base64Image) {
  try {
    const response = await fetch(base64Image);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    // Resize for faster processing
    const sampleSize = 100;
    const canvas = new OffscreenCanvas(sampleSize, sampleSize);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, sampleSize, sampleSize);
    bitmap.close();

    const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
    const pixels = imageData.data;

    // Create histograms for R, G, B channels (16 bins each for speed)
    const bins = 16;
    const histogram = { r: new Array(bins).fill(0), g: new Array(bins).fill(0), b: new Array(bins).fill(0) };

    for (let i = 0; i < pixels.length; i += 4) {
      const rBin = Math.floor((pixels[i] / 256) * bins);
      const gBin = Math.floor((pixels[i + 1] / 256) * bins);
      const bBin = Math.floor((pixels[i + 2] / 256) * bins);

      histogram.r[rBin === bins ? bins - 1 : rBin]++;
      histogram.g[gBin === bins ? bins - 1 : gBin]++;
      histogram.b[bBin === bins ? bins - 1 : bBin]++;
    }

    return histogram;
  } catch (error) {
    console.log('Error generating histogram:', error);
    return null;
  }
}

// Compare two histograms using correlation
function compareHistograms(hist1, hist2) {
  if (!hist1 || !hist2) return 0;

  // Calculate correlation for each channel
  const correlationR = calculateCorrelation(hist1.r, hist2.r);
  const correlationG = calculateCorrelation(hist1.g, hist2.g);
  const correlationB = calculateCorrelation(hist1.b, hist2.b);

  // Average correlation across channels (0-100)
  return ((correlationR + correlationG + correlationB) / 3) * 100;
}

function calculateCorrelation(arr1, arr2) {
  const n = arr1.length;
  const sum1 = arr1.reduce((a, b) => a + b, 0);
  const sum2 = arr2.reduce((a, b) => a + b, 0);
  const mean1 = sum1 / n;
  const mean2 = sum2 / n;

  let numerator = 0;
  let denominator1 = 0;
  let denominator2 = 0;

  for (let i = 0; i < n; i++) {
    const diff1 = arr1[i] - mean1;
    const diff2 = arr2[i] - mean2;
    numerator += diff1 * diff2;
    denominator1 += diff1 ** 2;
    denominator2 += diff2 ** 2;
  }

  const denominator = Math.sqrt(denominator1 * denominator2);
  if (denominator === 0) return 0;

  return numerator / denominator;
}

// TECHNIQUE #5: Adaptive Overlap - Detect content type
async function determineOptimalOverlap(base64Image) {
  try {
    const response = await fetch(base64Image);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    const sampleSize = 100;
    const canvas = new OffscreenCanvas(sampleSize, sampleSize);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, sampleSize, sampleSize);
    bitmap.close();

    const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
    const pixels = imageData.data;

    // Calculate edge density (high edges = images/complex content, low edges = text)
    let edgeCount = 0;
    const edgeThreshold = 30;

    for (let y = 1; y < sampleSize - 1; y++) {
      for (let x = 1; x < sampleSize - 1; x++) {
        const idx = (y * sampleSize + x) * 4;
        const idxRight = (y * sampleSize + (x + 1)) * 4;
        const idxDown = ((y + 1) * sampleSize + x) * 4;

        // Simple edge detection
        const diffX = Math.abs(pixels[idx] - pixels[idxRight]);
        const diffY = Math.abs(pixels[idx] - pixels[idxDown]);

        if (diffX > edgeThreshold || diffY > edgeThreshold) {
          edgeCount++;
        }
      }
    }

    const edgeDensity = edgeCount / (sampleSize * sampleSize);

    // High edge density (> 0.15) = complex content, use more overlap (200px)
    // Low edge density (< 0.15) = mostly text, use less overlap (100px)
    if (edgeDensity > 0.15) {
      return { overlap: 200, contentType: 'complex' };
    } else {
      return { overlap: 100, contentType: 'simple' };
    }
  } catch (error) {
    console.log('Error determining optimal overlap:', error);
    return { overlap: 150, contentType: 'unknown' }; // Default
  }
}

// Capture rolling area by stitching multiple segments
async function captureRollingArea(tabId, segments, platform, url, overlapAmount = 100) {
  try {
    console.log('🚀 Starting rolling capture:', segments.length, 'segments');

    // Harden against MV3 service-worker suspension: restore the case from
    // storage (source of truth) if the in-memory copy was lost.
    if (!pendingCaseInfo || !pendingCaseInfo.name || !pendingCaseInfo.mig) {
      const _cc = await chrome.storage.local.get(['currentCase']);
      if (_cc.currentCase) pendingCaseInfo = _cc.currentCase;
    }

    // Hide fixed elements before screenshots
    await chrome.tabs.sendMessage(tabId, { action: 'hideFixedElements' }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 200));

    // Capture each segment - detect bottom dynamically
    const segmentImages = [];
    let lastActualScrollY = -1; // Track where we actually scrolled to in previous iteration

    try {
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];

        // Update progress
        await chrome.tabs.sendMessage(tabId, {
          action: 'updateProgress',
          currentSegment: i + 1,
          totalSegments: segments.length
        }).catch(() => {});

        // Scroll to position and check where we actually ended up
        const scrollResponse = await new Promise((resolve) => {
          chrome.tabs.sendMessage(tabId, {
            action: 'scrollAndWait',
            scrollY: segment.scrollY
          }, (response) => {
            resolve(response || { actualScrollY: segment.scrollY });
          });
        });

        const actualScrollY = scrollResponse.actualScrollY;
        
        // CRITICAL: Detect if we've hit the bottom
        // Two conditions that indicate we're at the bottom:
        
        // 1. We tried to scroll far but ended up significantly short
        const scrollDifference = segment.scrollY - actualScrollY;
        const hitBottom = scrollDifference > 100; // More than 100px short means we hit the bottom
        
        // 2. We're at the same position as last iteration (stuck at bottom)
        const stuckAtBottom = i > 0 && Math.abs(actualScrollY - lastActualScrollY) < 50;
        
        if ((hitBottom || stuckAtBottom) && i > 0) {
          // We've hit the bottom - this would be a duplicate of the previous position
          console.log(`🛑 Hit bottom at scroll ${actualScrollY}, requested ${segment.scrollY}. Stopping.`);
          
          // Update progress to show we're done (even though we didn't capture all planned segments)
          await chrome.tabs.sendMessage(tabId, {
            action: 'updateProgress',
            currentSegment: i, // We captured i segments (0-indexed, so i is the count)
            totalSegments: i  // Update total to match what we actually captured
          }).catch(() => {});
          
          break;
        }
        
        // Remember this position for next iteration
        lastActualScrollY = actualScrollY;

        // Small delay for page to settle after scroll
        await new Promise(resolve => setTimeout(resolve, 200));

        // Capture screenshot (rate-limit-safe)
        const screenshot = await captureVisibleTabWithRetry({ format: 'png' });

        // Crop to bounds
        const croppedImage = await cropImage(screenshot, segment.bounds);
        
        console.log(`✅ Segment ${i + 1}/${segments.length} captured at actual scroll: ${actualScrollY}`);
        segmentImages.push(croppedImage);

        // CRITICAL: Wait to respect Chrome's rate limit (2 captures per second max)
        // Wait 700ms between captures to stay safely under the limit
        if (i < segments.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 700));
        }
      }
    } finally {
      // ALWAYS restore fixed elements, even if capture fails
      await chrome.tabs.sendMessage(tabId, { action: 'restoreFixedElements' }).catch(() => {});
    }

    console.log(`📊 Captured ${segmentImages.length} segments successfully`);
    
    if (segmentImages.length === 0) {
      throw new Error('No segments captured!');
    }

    // Stitch images together with fixed overlap
    const devicePixelRatio = segments[0]?.bounds?.devicePixelRatio || 1;
    const stitchedImage = await stitchImages(segmentImages, overlapAmount, devicePixelRatio);

    console.log('✅ Rolling capture complete - stitched image created');

    // Smart account selection: Always check for the highest account number for this platform
    let accountIdentifier = '1'; // Default
    
    if (pendingCaseInfo && pendingCaseInfo.name && pendingCaseInfo.mig && pendingCaseInfo.currentSubject) {
      // ALWAYS check existing captures to find highest account number for this platform
      // This ensures we pick up manually-created accounts (e.g., FB 3)
      const result = await chrome.storage.local.get(['captures']);
      const captures = result.captures || [];
      
      const platformAccounts = captures
        .filter(c => 
          c.caseName === pendingCaseInfo.name && 
          c.caseMIG === pendingCaseInfo.mig && 
          c.subjectName === pendingCaseInfo.currentSubject &&
          c.platform === platform
        )
        .map(c => parseInt(c.accountIdentifier) || 1);
      
      if (platformAccounts.length > 0) {
        accountIdentifier = Math.max(...platformAccounts).toString();
        console.log('Rolling: Found highest account for', platform, ':', accountIdentifier);
      } else {
        console.log('Rolling: No existing accounts for', platform, ', using default: 1');
      }
    }

    // Store in archive
    const captureData = {
      url: url,
      screenshot: stitchedImage,
      date: null,
      platform: platform,
      accountIdentifier: accountIdentifier,
      isAboutPage: false,
      capturedAt: new Date().toISOString(),
      sortOrders: {},
      caseName: pendingCaseInfo?.name || null,
      caseMIG: pendingCaseInfo?.mig || null,
      subjectName: pendingCaseInfo?.currentSubject || null
    };
    
    // Clear pending case info
    const usedCaseInfo = pendingCaseInfo;
    pendingCaseInfo = null;

    const storageResult = await chrome.storage.local.get(['captures']);
    const captures = storageResult.captures || [];
    captures.push(captureData);
    
    try {
      await chrome.storage.local.set({ captures });
      console.log('Rolling capture saved with case:', usedCaseInfo, 'account:', accountIdentifier);
    } catch (storageError) {
      console.error('Storage error:', storageError);
      throw new Error('Storage full! Please delete some captures.');
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
  const canvas = new OffscreenCanvas(160, 45);
  const ctx = canvas.getContext('2d');
  
  // Main background gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, 45);
  gradient.addColorStop(0, '#256D96');
  gradient.addColorStop(1, '#1b5273');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 160, 45);

  // Accent bottom stripe
  ctx.fillStyle = '#00B0F0';
  ctx.fillRect(0, 40, 160, 5);
  
  // White text with shadow for better readability
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 1;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
  
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // "POSTED ON" text - small but readable
  ctx.font = 'bold 8px Arial, sans-serif';
  ctx.fillText('POSTED ON', 80, 12);
  
  // Date text - larger and bold
  ctx.font = 'bold 18px Arial, sans-serif';
  ctx.fillText(dateText, 80, 28);
  
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

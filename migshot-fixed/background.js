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
async function captureRollingArea(tabId, segments, platform, url, overlapAmount = 150) {
  try {
    console.log('🚀 Starting advanced rolling capture:', segments.length, 'segments with', overlapAmount, 'px overlap');
    console.log('🛡️ Duplicate detection enabled: pHash, MSE, Histogram, Overlap Verification, Adaptive Overlap');

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

    // Capture each segment with advanced duplicate detection
    const segmentImages = [];
    const segmentMetadata = []; // Store hashes and histograms
    let previousScrollY = null;
    let duplicatesSkipped = 0;
    let blanksSkipped = 0;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      // Update progress indicator
      await chrome.tabs.sendMessage(tabId, {
        action: 'updateProgress',
        currentSegment: i + 1,
        totalSegments: segments.length
      }).catch(() => {}); // Ignore errors if content script was removed

      // TECHNIQUE #6: Scroll Position Validation
      if (previousScrollY !== null) {
        const expectedDelta = segment.scrollY - previousScrollY;
        const minExpectedDelta = 50; // Minimum 50px movement required

        if (expectedDelta < minExpectedDelta) {
          console.log(`⚠️ Segment ${i + 1}: Scroll delta too small (${expectedDelta}px), likely duplicate - SKIPPING`);
          duplicatesSkipped++;
          continue;
        }
      }
      previousScrollY = segment.scrollY;

      // Scroll to the position and wait for completion
      const scrollResponse = await chrome.tabs.sendMessage(tabId, {
        action: 'scrollAndWait',
        scrollY: segment.scrollY
      });

      // Log scroll validation info
      if (scrollResponse && scrollResponse.scrollDelta !== undefined) {
        console.log(`📜 Scroll validation: target=${segment.scrollY}, actual=${scrollResponse.actualScrollY}, delta=${scrollResponse.scrollDelta}px`);

        // Additional check: if we didn't scroll enough from previous position
        if (previousScrollY !== null && scrollResponse.scrollDelta < 50) {
          console.log(`⚠️ Segment ${i + 1}: Actual scroll delta too small (${scrollResponse.scrollDelta}px) - SKIPPING`);
          duplicatesSkipped++;
          continue;
        }
      }

      // Capture screenshot
      const screenshot = await chrome.tabs.captureVisibleTab(null, {
        format: 'png'
      });

      // Crop to bounds
      const croppedImage = await cropImage(screenshot, segment.bounds);

      // EXISTING: Check if segment is blank
      const isBlank = await isBlankSegment(croppedImage);
      if (isBlank) {
        console.log(`⬜ Segment ${i + 1}/${segments.length} is blank - SKIPPING`);
        blanksSkipped++;
        continue;
      }

      // Generate analysis data for duplicate detection
      let shouldSkip = false;
      let skipReason = '';

      if (segmentImages.length > 0) {
        const previousImage = segmentImages[segmentImages.length - 1];
        const previousMetadata = segmentMetadata[segmentMetadata.length - 1];

        // TECHNIQUE #1: Perceptual Hash Comparison
        const currentHash = await generatePerceptualHash(croppedImage);
        if (currentHash && previousMetadata.hash) {
          const hashSimilarity = compareHashes(previousMetadata.hash, currentHash);
          if (hashSimilarity > 90) {
            shouldSkip = true;
            skipReason = `pHash similarity ${hashSimilarity.toFixed(1)}% (>90%)`;
          }
        }

        // TECHNIQUE #2: Overlap Region Verification (if not already skipped)
        if (!shouldSkip && overlapAmount > 0) {
          const overlapPixels = Math.floor(overlapAmount * (segment.bounds.devicePixelRatio || 1));
          const overlapMSE = await verifyOverlapMatch(previousImage, croppedImage, overlapPixels);

          // If overlap regions are too different (MSE > 1000), something's wrong
          // If overlap regions are TOO similar (MSE < 10), it's likely a duplicate
          if (overlapMSE < 10) {
            shouldSkip = true;
            skipReason = `Overlap MSE ${overlapMSE.toFixed(1)} - too similar (duplicate)`;
          }
        }

        // TECHNIQUE #3: Full Image MSE Similarity (if not already skipped)
        if (!shouldSkip) {
          const imageMSE = await calculateImageSimilarity(previousImage, croppedImage);
          if (imageMSE < 50) { // Very low MSE = nearly identical
            shouldSkip = true;
            skipReason = `Image MSE ${imageMSE.toFixed(1)} - nearly identical`;
          }
        }

        // TECHNIQUE #4: Histogram Comparison (if not already skipped)
        if (!shouldSkip) {
          const currentHistogram = await generateHistogram(croppedImage);
          if (currentHistogram && previousMetadata.histogram) {
            const histogramSimilarity = compareHistograms(previousMetadata.histogram, currentHistogram);
            if (histogramSimilarity > 95) {
              shouldSkip = true;
              skipReason = `Histogram similarity ${histogramSimilarity.toFixed(1)}% (>95%)`;
            }
          }
        }

        if (shouldSkip) {
          console.log(`🚫 Segment ${i + 1}/${segments.length} detected as DUPLICATE - ${skipReason} - SKIPPING`);
          duplicatesSkipped++;
          continue;
        }
      }

      // TECHNIQUE #5: Adaptive Overlap (for next iteration)
      // Determine optimal overlap for future segments based on content complexity
      const optimalOverlap = await determineOptimalOverlap(croppedImage);
      console.log(`✅ Segment ${i + 1}/${segments.length} captured (content: ${optimalOverlap.contentType}, suggested overlap: ${optimalOverlap.overlap}px)`);

      // Store segment and metadata
      segmentImages.push(croppedImage);
      segmentMetadata.push({
        hash: await generatePerceptualHash(croppedImage),
        histogram: await generateHistogram(croppedImage),
        optimalOverlap: optimalOverlap
      });

      // IMPORTANT: Wait between captures to respect Chrome's rate limit
      // Chrome allows ~2 captures/second, so wait 600ms between each
      if (i < segments.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 600));
      }
    }

    console.log(`📊 Capture Summary: ${segmentImages.length} segments kept, ${blanksSkipped} blanks skipped, ${duplicatesSkipped} duplicates skipped`);
    
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
      throw new Error('All segments were filtered out (blank or duplicates) - nothing to capture!');
    }

    // Stitch images together
    const devicePixelRatio = segments[0]?.bounds?.devicePixelRatio || 1;
    const stitchedImage = await stitchImages(segmentImages, overlapAmount, devicePixelRatio);

    console.log(`✨ Successfully stitched ${segmentImages.length} unique segments (filtered ${blanksSkipped} blanks + ${duplicatesSkipped} duplicates from ${segments.length} total)`);
    
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

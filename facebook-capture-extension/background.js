// Handle keyboard shortcut (Ctrl+M)
chrome.commands.onCommand.addListener((command) => {
  if (command === 'capture-post') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url.includes('facebook.com')) {
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
    return true; // Keep message channel open for async response
  }
});

// Main capture function
async function capturePost(tabId) {
  try {
    // Inject content script if needed (for dynamic execution)
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
    
    // Wait for page to actually have date elements loaded
    console.log('Waiting for date elements to load...');
    const [waitResult] = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: waitForDateElements
    });
    
    console.log('Wait result:', waitResult.result);
    
    // Get post data from content script
    const [postData] = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: extractPostData
    });
    
    if (!postData.result) {
      throw new Error('Failed to extract post data');
    }
    
    console.log('Date extraction result:', postData.result);
    
    // Capture screenshot of entire page
    const screenshot = await chrome.tabs.captureVisibleTab(null, {
      format: 'png'
    });
    
    // Generate date badge image
    const dateBadge = await generateDateBadge(postData.result.date);
    
    // Return all captured data
    return {
      date: postData.result.date,
      url: postData.result.url,
      screenshot: screenshot,
      dateBadge: dateBadge
    };
    
  } catch (error) {
    console.error('Capture error:', error);
    throw new Error('Failed to capture post: ' + error.message);
  }
}

// Wait for date elements to appear in the DOM
function waitForDateElements() {
  return new Promise((resolve) => {
    const maxWaitTime = 2000; // Quick 2 second check - content script is monitoring
    const checkInterval = 200; // Check every 200ms
    const startTime = Date.now();
    
    function checkForElements() {
      const elapsed = Date.now() - startTime;
      
      // Check for any date-related elements
      const hasAriaLabelledBy = document.querySelectorAll('[aria-labelledby]').length > 0;
      const hasTimeElements = document.querySelectorAll('time, [data-utime]').length > 0;
      const hasTitleElements = document.querySelectorAll('[title]').length > 10;
      
      console.log(`[${elapsed}ms] Checking... aria-labelledby: ${hasAriaLabelledBy}, time: ${hasTimeElements}, title: ${hasTitleElements}`);
      
      if (hasAriaLabelledBy || hasTimeElements || hasTitleElements) {
        console.log(`✓ Elements found after ${elapsed}ms`);
        resolve({ success: true, waitTime: elapsed });
      } else if (elapsed >= maxWaitTime) {
        console.log(`✗ Timeout after ${elapsed}ms - proceeding anyway`);
        resolve({ success: false, waitTime: elapsed });
      } else {
        setTimeout(checkForElements, checkInterval);
      }
    }
    
    checkForElements();
  });
}

// Generate a uniform date badge image
async function generateDateBadge(dateText) {
  // Create an offscreen canvas - 50% smaller than before
  const canvas = new OffscreenCanvas(150, 40);
  const ctx = canvas.getContext('2d');
  
  // Background with gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, 40);
  gradient.addColorStop(0, '#4267B2'); // Facebook blue
  gradient.addColorStop(1, '#365899'); // Darker blue
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 150, 40);
  
  // Add subtle shadow/depth
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.fillRect(0, 35, 150, 5);
  
  // Draw white text
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Top label
  ctx.font = 'bold 6px Arial, sans-serif';
  ctx.fillText('POSTED ON', 75, 10);
  
  // Date (larger)
  ctx.font = 'bold 16px Arial, sans-serif';
  ctx.fillText(dateText, 75, 25);
  
  // Convert canvas to blob then to base64
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return await blobToBase64(blob);
}

// Helper to convert blob to base64
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// This function will be injected and run in the page context
function extractPostData() {
  try {
    // Get current URL
    const url = window.location.href;
    
    // Extract date from Facebook post
    let date = null;
    let candidates = []; // Store all found dates with scores
    
    console.log('=== DATE EXTRACTION DEBUG START ===');
    console.log('Current URL:', url);
    
    // Strategy 0: Look for aria-labelledby (Facebook's obfuscation technique)
    const ariaLabelledByElements = document.querySelectorAll('[aria-labelledby]');
    console.log('Strategy 0: Found', ariaLabelledByElements.length, 'elements with aria-labelledby');
    
    for (const elem of ariaLabelledByElements) {
      const labelId = elem.getAttribute('aria-labelledby');
      if (labelId) {
        const labelElement = document.getElementById(labelId);
        if (labelElement) {
          const text = labelElement.textContent?.trim();
          if (text && text.length > 0 && text.length < 200) {
            console.log('  Checking aria-labelledby text:', text);
            const parsedDate = parseDateFromText(text);
            if (parsedDate && parsedDate.dateObj) {
              const now = new Date();
              const daysDiff = Math.floor((now - parsedDate.dateObj) / (1000 * 60 * 60 * 24));
              
              let score = 30;
              if (daysDiff > 1 && daysDiff < 10000) score += 10;
              if (text.match(/\d{4}/)) score += 5;
              
              console.log('  ✓ Found date via aria-labelledby:', parsedDate.formatted, 'score:', score);
              
              candidates.push({
                date: parsedDate.formatted,
                dateObj: parsedDate.dateObj,
                text: `aria-labelledby: ${text}`,
                score: score
              });
            }
          }
        }
      }
    }
    
    // Strategy 1: Look for time elements (common in dynamic content)
    const timeElements = document.querySelectorAll('time, abbr[data-utime], span[data-utime], [data-utime]');
    console.log('Strategy 1: Found', timeElements.length, 'time/timestamp elements');
    
    for (const elem of timeElements) {
      // Check for datetime attribute
      const datetime = elem.getAttribute('datetime');
      if (datetime) {
        console.log('  Checking datetime attribute:', datetime);
        try {
          const dateObj = new Date(datetime);
          if (!isNaN(dateObj.getTime())) {
            const formatted = formatDate(dateObj);
            console.log('  ✓ Found date via datetime:', formatted, 'score: 28');
            candidates.push({
              date: formatted,
              dateObj: dateObj,
              text: `datetime: ${datetime}`,
              score: 28
            });
          }
        } catch (e) {}
      }
      
      // Check for data-utime (Unix timestamp)
      const unixTime = parseInt(elem.getAttribute('data-utime'));
      if (unixTime && unixTime > 0) {
        const dateObj = new Date(unixTime * 1000);
        const formatted = formatDate(dateObj);
        console.log('  ✓ Found date via data-utime:', formatted, 'score: 25');
        
        const now = new Date();
        const daysDiff = Math.floor((now - dateObj) / (1000 * 60 * 60 * 24));
        
        let score = 25;
        if (daysDiff > 1 && daysDiff < 10000) score += 10;
        
        candidates.push({
          date: formatted,
          dateObj: dateObj,
          text: `data-utime: ${unixTime}`,
          score: score
        });
      }
      
      // Check visible text in time elements
      const text = elem.textContent?.trim();
      if (text && text.length > 4 && text.length < 100) {
        const parsedDate = parseDateFromText(text);
        if (parsedDate && parsedDate.dateObj) {
          console.log('  ✓ Found date in time element text:', parsedDate.formatted, 'score: 22');
          candidates.push({
            date: parsedDate.formatted,
            dateObj: parsedDate.dateObj,
            text: `time element: ${text}`,
            score: 22
          });
        }
      }
    }
    
    // Strategy 2: Look for elements with tooltip/title attributes
    const elementsWithTitles = document.querySelectorAll('[title], [aria-label]');
    console.log('Strategy 2: Found', elementsWithTitles.length, 'elements with title/aria-label');
    
    for (const elem of elementsWithTitles) {
      // Check title attribute (common for tooltips)
      const title = elem.getAttribute('title');
      if (title && title.length > 0 && title.length < 200) {
        const parsedDate = parseDateFromText(title);
        if (parsedDate && parsedDate.dateObj) {
          const now = new Date();
          const daysDiff = Math.floor((now - parsedDate.dateObj) / (1000 * 60 * 60 * 24));
          
          let score = 20; // High score for title attributes (these are hover tooltips!)
          if (daysDiff > 1 && daysDiff < 10000) score += 10; // Historical but reasonable
          if (title.match(/\d{4}/)) score += 5; // Has year
          
          candidates.push({
            date: parsedDate.formatted,
            dateObj: parsedDate.dateObj,
            text: `title: ${title}`,
            score: score
          });
        }
      }
      
      // Check aria-label attribute
      const ariaLabel = elem.getAttribute('aria-label');
      if (ariaLabel && ariaLabel.length > 0 && ariaLabel.length < 200) {
        const parsedDate = parseDateFromText(ariaLabel);
        if (parsedDate && parsedDate.dateObj) {
          const now = new Date();
          const daysDiff = Math.floor((now - parsedDate.dateObj) / (1000 * 60 * 60 * 24));
          
          let score = 15; // Good score for aria-label
          if (daysDiff > 1 && daysDiff < 10000) score += 10;
          if (ariaLabel.match(/\d{4}/)) score += 5;
          
          candidates.push({
            date: parsedDate.formatted,
            dateObj: parsedDate.dateObj,
            text: `aria-label: ${ariaLabel}`,
            score: score
          });
        }
      }
    }
    
    // Strategy 3: Look in visible link text (less reliable but still useful)
    const links = document.querySelectorAll('a[href*="?"]:not([href*="profile"]):not([href*="user"]), a[role="link"]');
    
    for (const link of links) {
      // Skip obvious navigation
      const href = link.getAttribute('href') || '';
      if (href.includes('/user/') || href.includes('/profile/') || href.includes('/groups/') || href.includes('/pages/')) {
        continue;
      }
      
      const visibleText = link.innerText?.trim() || '';
      
      if (visibleText && visibleText.length > 4 && visibleText.length < 100) {
        // Skip relative time
        const skipWords = ['active', 'online', 'ago', 'minutes', 'hours', 'yesterday', 'just now', 'updated'];
        if (skipWords.some(word => visibleText.toLowerCase().includes(word))) {
          continue;
        }
        
        const parsedDate = parseDateFromText(visibleText);
        if (parsedDate && parsedDate.dateObj) {
          const now = new Date();
          const daysDiff = Math.floor((now - parsedDate.dateObj) / (1000 * 60 * 60 * 24));
          
          let score = 5; // Lower score for visible text
          if (daysDiff > 1 && daysDiff < 10000) score += 5;
          if (visibleText.match(/\d{4}/)) score += 3;
          
          candidates.push({
            date: parsedDate.formatted,
            dateObj: parsedDate.dateObj,
            text: `visible: ${visibleText}`,
            score: score
          });
        }
      }
    }
    
    // Pick the best candidate
    if (candidates.length > 0) {
      console.log('Total candidates found:', candidates.length);
      
      // Sort by score (highest first)
      candidates.sort((a, b) => b.score - a.score);
      
      console.log('Top 3 candidates:');
      candidates.slice(0, 3).forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.date} (score: ${c.score}) - ${c.text.substring(0, 50)}`);
      });
      
      // Filter out future dates (posts can't be from the future)
      const now = new Date();
      const validCandidates = candidates.filter(c => c.dateObj <= now);
      
      // Also filter out dates that are too old to be reasonable (before 2000)
      const year2000 = new Date('2000-01-01');
      const reasonableCandidates = validCandidates.filter(c => c.dateObj >= year2000);
      
      if (reasonableCandidates.length > 0) {
        date = reasonableCandidates[0].date;
        console.log('✓ SELECTED DATE:', date, 'from', reasonableCandidates[0].text.substring(0, 50));
      } else if (validCandidates.length > 0) {
        // If no reasonable candidates, take the best valid one
        date = validCandidates[0].date;
        console.log('✓ SELECTED DATE (old):', date);
      }
    } else {
      console.log('✗ NO DATE CANDIDATES FOUND');
    }
    
    console.log('=== DATE EXTRACTION DEBUG END ===');
    console.log('Final result - Date:', date || 'Date not found', 'URL:', url);
    
    return {
      url: url,
      date: date || 'Date not found'
    };
    
  } catch (error) {
    console.error('Extract error:', error);
    return {
      url: window.location.href,
      date: 'Error extracting date'
    };
  }
  
  // Helper function to format date as MM/DD/YYYY
  function formatDate(dateObj) {
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const year = dateObj.getFullYear();
    return `${month}/${day}/${year}`;
  }
  
  // Helper function to parse date from text
  function parseDateFromText(text) {
    if (!text) return null;
    
    // Remove extra whitespace and normalize
    text = text.trim().replace(/\s+/g, ' ');
    
    // Skip non-date looking text
    if (text.length > 200) return null;
    if (!text.match(/\d{4}|\d{1,2}/)) return null; // Must have numbers
    
    // Skip relative time phrases
    const relativePatterns = ['ago', 'minute', 'hour', 'day', 'week', 'month', 'year', 'yesterday', 'today', 'just now'];
    const lowerText = text.toLowerCase();
    if (relativePatterns.some(pattern => lowerText.includes(pattern) && !lowerText.includes('at '))) {
      // Allow "at" because tooltip format is "December 12, 2015 at 3:30 PM"
      return null;
    }
    
    // Remove time portion if present (e.g., "at 3:30 PM")
    text = text.replace(/\s+at\s+\d{1,2}:\d{2}\s*(AM|PM|am|pm)?/i, '');
    
    // Remove day of week if present (e.g., "Monday, December 12, 2015")
    text = text.replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[,\s]+/i, '');
    
    // Remove ordinal indicators (1st, 2nd, 3rd, 4th, etc.) for easier parsing
    text = text.replace(/(\d+)(st|nd|rd|th)/gi, '$1');
    
    // Common Facebook date patterns (in order of preference/reliability)
    const patterns = [
      // "December, 12 2015" or "December 12, 2015" or "Dec 12 2015"
      /(\w+)[,\s]+(\d{1,2})[,\s]+(\d{4})/i,
      // "12 December 2015"
      /(\d{1,2})\s+(\w+)[,\s]+(\d{4})/i,
      // "2015-12-15" or "2015/12/15"
      /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/,
      // "12/15/2015" or "12-15-2015"
      /(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/,
    ];
    
    // Month name to number mapping
    const monthNames = {
      'january': 1, 'jan': 1,
      'february': 2, 'feb': 2,
      'march': 3, 'mar': 3,
      'april': 4, 'apr': 4,
      'may': 5,
      'june': 6, 'jun': 6,
      'july': 7, 'jul': 7,
      'august': 8, 'aug': 8,
      'september': 9, 'sep': 9, 'sept': 9,
      'october': 10, 'oct': 10,
      'november': 11, 'nov': 11,
      'december': 12, 'dec': 12
    };
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        try {
          let dateObj;
          
          // Check if first capture group is a month name
          if (match[1] && isNaN(match[1])) {
            // "Month Day, Year" format
            const monthName = match[1].toLowerCase();
            const monthNum = monthNames[monthName];
            if (monthNum) {
              const day = parseInt(match[2]);
              const year = parseInt(match[3]);
              if (day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
                dateObj = new Date(year, monthNum - 1, day);
              }
            }
          } 
          // Check if second capture group is a month name
          else if (match[2] && isNaN(match[2])) {
            // "Day Month, Year" format
            const day = parseInt(match[1]);
            const monthName = match[2].toLowerCase();
            const monthNum = monthNames[monthName];
            if (monthNum) {
              const year = parseInt(match[3]);
              if (day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
                dateObj = new Date(year, monthNum - 1, day);
              }
            }
          }
          // YYYY-MM-DD format
          else if (match[1] && match[1].length === 4) {
            const year = parseInt(match[1]);
            const month = parseInt(match[2]);
            const day = parseInt(match[3]);
            if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
              dateObj = new Date(year, month - 1, day);
            }
          }
          // MM/DD/YYYY format (US format)
          else {
            const first = parseInt(match[1]);
            const second = parseInt(match[2]);
            const year = parseInt(match[3]);
            
            // Try MM/DD/YYYY (US format) first
            if (first >= 1 && first <= 12 && second >= 1 && second <= 31 && year >= 1900 && year <= 2100) {
              dateObj = new Date(year, first - 1, second);
            }
            // If that doesn't make sense, try DD/MM/YYYY
            else if (second >= 1 && second <= 12 && first >= 1 && first <= 31 && year >= 1900 && year <= 2100) {
              dateObj = new Date(year, second - 1, first);
            }
          }
          
          // Validate and return both formatted and object
          if (dateObj && !isNaN(dateObj.getTime())) {
            return {
              formatted: formatDate(dateObj),
              dateObj: dateObj
            };
          }
        } catch (e) {
          continue;
        }
      }
    }
    
    return null;
  }
}

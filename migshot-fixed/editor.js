// Editor.js - Full tab image editor for MIGShot
//
// PERSISTENT MULTI-HIGHLIGHT & ARROW SYSTEM:
// - Highlights: Drawn to a mask canvas that accumulates all highlight strokes
//   Each new highlight ADDS to the mask, making all highlights persistent
// - Arrows: Stored in drawHistory array and redrawn on every canvas update
//   All arrows remain visible and persist across drawing operations
// - Both highlights and arrows support undo/redo through drawHistory
// - Multiple highlights and arrows can coexist simultaneously

let canvas, ctx;
let originalImage = null;
let currentTool = null;
let isDrawing = false;
let drawHistory = []; // Stores all highlights and arrows for persistence and undo
let currentStroke = [];
let arrowStart = null;
let captureIndex = null;
let currentZoom = 1;

// Mask canvas for highlights - accumulates all highlight strokes
let maskCanvas, maskCtx;
// Temp canvas for colorizing (created once, reused)
let tempCanvas, tempCtx;

// Initialize editor when page loads
document.addEventListener('DOMContentLoaded', initializeEditor);

async function initializeEditor() {
  try {
    canvas = document.getElementById('editorCanvas');
    ctx = canvas.getContext('2d');
    
    // Get capture index from URL params
    const urlParams = new URLSearchParams(window.location.search);
    captureIndex = parseInt(urlParams.get('index'));
    
    if (captureIndex === null || isNaN(captureIndex)) {
      showToast('Error: No image specified', 'error');
      setTimeout(() => window.close(), 2000);
      return;
    }
    
    // Load the capture from storage
    const result = await chrome.storage.local.get(['captures']);
    const captures = result.captures || [];
    
    if (captureIndex >= captures.length) {
      showToast('Error: Image not found', 'error');
      setTimeout(() => window.close(), 2000);
      return;
    }
    
    const capture = captures[captureIndex];
    
    // Load image
    const img = new Image();
    img.onload = function() {
      try {
        originalImage = img;
        canvas.width = img.width;
        canvas.height = img.height;
        
        // Create mask canvas
        maskCanvas = document.createElement('canvas');
        maskCanvas.width = img.width;
        maskCanvas.height = img.height;
        maskCtx = maskCanvas.getContext('2d');
        
        // Configure mask context
        maskCtx.lineCap = 'round';
        maskCtx.lineJoin = 'round';
        
        // Create temp canvas for colorizing (once)
        tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        tempCtx = tempCanvas.getContext('2d');
        
        // Draw initial image
        ctx.drawImage(img, 0, 0);
        
        // Hide loading, show canvas
        document.getElementById('loading').style.display = 'none';
        canvas.style.display = 'block';
        
        // Fit to window initially
        fitToWindow();
        
        // Set up event listeners
        setupEventListeners();
        
        // Select highlight tool by default
        selectTool('highlight');
        
        showToast('Image loaded. Select a tool to start editing.', 'success');
      } catch (error) {
        console.error('Error setting up canvas:', error);
        showToast('Error loading editor', 'error');
      }
    };
    
    img.onerror = function() {
      console.error('Image failed to load');
      showToast('Error loading image', 'error');
      setTimeout(() => window.close(), 2000);
    };
    
    img.src = capture.screenshot;
    
  } catch (error) {
    console.error('Initialization error:', error);
    showToast('Error initializing editor', 'error');
  }
}

function setupEventListeners() {
  // Tool selection
  document.getElementById('highlightTool').addEventListener('click', () => selectTool('highlight'));
  document.getElementById('arrowTool').addEventListener('click', () => selectTool('arrow'));
  
  // Action buttons
  document.getElementById('undoBtn').addEventListener('click', undoLastAction);
  document.getElementById('clearBtn').addEventListener('click', clearAllEdits);
  document.getElementById('cancelBtn').addEventListener('click', cancelEdit);
  document.getElementById('saveBtn').addEventListener('click', saveEditedImage);
  
  // Zoom controls
  document.getElementById('zoomIn').addEventListener('click', () => adjustZoom(1.2));
  document.getElementById('zoomOut').addEventListener('click', () => adjustZoom(0.8));
  document.getElementById('zoomFit').addEventListener('click', fitToWindow);
  
  // Canvas drawing events
  canvas.addEventListener('mousedown', handleCanvasMouseDown);
  canvas.addEventListener('mousemove', handleCanvasMouseMove);
  canvas.addEventListener('mouseup', handleCanvasMouseUp);
  canvas.addEventListener('mouseleave', handleCanvasMouseUp);
  
  // Touch support for tablets
  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboard);
}

function selectTool(tool) {
  currentTool = tool;
  
  // Update UI
  document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
  
  if (tool === 'highlight') {
    document.getElementById('highlightTool').classList.add('active');
    canvas.style.cursor = 'crosshair';
    document.getElementById('currentToolDisplay').textContent = 'Highlight';
  } else if (tool === 'arrow') {
    document.getElementById('arrowTool').classList.add('active');
    canvas.style.cursor = 'crosshair';
    document.getElementById('currentToolDisplay').textContent = 'Arrow';
  }
}

function handleCanvasMouseDown(e) {
  if (!currentTool) return;
  
  const rect = canvas.getBoundingClientRect();
  // Get actual canvas coordinates accounting for CSS scaling
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  
  isDrawing = true;
  
  if (currentTool === 'highlight') {
    currentStroke = [{x, y}];
  } else if (currentTool === 'arrow') {
    arrowStart = {x, y};
  }
}

function handleCanvasMouseMove(e) {
  if (!isDrawing) return;
  
  const rect = canvas.getBoundingClientRect();
  // Get actual canvas coordinates accounting for CSS scaling
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  
  if (currentTool === 'highlight') {
    currentStroke.push({x, y});
    
    // Redraw everything including preview
    redrawCanvas();
    drawHighlightStroke(currentStroke, true);
  } else if (currentTool === 'arrow' && arrowStart) {
    // Redraw and show arrow preview
    redrawCanvas();
    drawArrow(arrowStart.x, arrowStart.y, x, y, true);
  }
}

function handleCanvasMouseUp(e) {
  if (!isDrawing) return;

  const rect = canvas.getBoundingClientRect();
  // Get actual canvas coordinates accounting for CSS scaling
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  isDrawing = false;

  if (currentTool === 'highlight' && currentStroke.length > 0) {
    // Draw the final stroke to the mask (accumulates with previous highlights)
    // This makes highlights persistent - each new highlight adds to the mask
    drawHighlightStroke(currentStroke, false);

    // Store in history for undo/redo support
    drawHistory.push({
      type: 'highlight',
      points: [...currentStroke]
    });
    currentStroke = [];

    // Redraw canvas to show all persistent highlights and arrows
    redrawCanvas();
  } else if (currentTool === 'arrow' && arrowStart) {
    // Store arrow in history - arrows are also persistent
    drawHistory.push({
      type: 'arrow',
      start: {...arrowStart},
      end: {x, y}
    });
    arrowStart = null;

    // Redraw canvas to show all persistent highlights and arrows
    redrawCanvas();
  }

  updateActionCount();
}

// Touch event handlers
function handleTouchStart(e) {
  e.preventDefault();
  const touch = e.touches[0];
  const mouseEvent = new MouseEvent('mousedown', {
    clientX: touch.clientX,
    clientY: touch.clientY
  });
  canvas.dispatchEvent(mouseEvent);
}

function handleTouchMove(e) {
  e.preventDefault();
  const touch = e.touches[0];
  const mouseEvent = new MouseEvent('mousemove', {
    clientX: touch.clientX,
    clientY: touch.clientY
  });
  canvas.dispatchEvent(mouseEvent);
}

function handleTouchEnd(e) {
  e.preventDefault();
  const mouseEvent = new MouseEvent('mouseup', {});
  canvas.dispatchEvent(mouseEvent);
}

function drawHighlightStroke(points, isPreview = false) {
  if (points.length < 1) return;

  // For actual drawing (not preview), draw to mask
  // IMPORTANT: This accumulates on the mask - does not clear previous highlights
  if (!isPreview) {
    // Save mask context state
    maskCtx.save();

    // Draw to mask (stores coverage as alpha, not color)
    // This will ADD to existing mask content, making highlights persistent
    maskCtx.strokeStyle = 'rgba(0, 0, 0, 1)'; // Opaque black for mask
    maskCtx.lineWidth = 35;
    maskCtx.lineCap = 'round';
    maskCtx.lineJoin = 'round';

    if (points.length === 1) {
      // Single point - draw a circle
      maskCtx.beginPath();
      maskCtx.arc(points[0].x, points[0].y, 17.5, 0, Math.PI * 2);
      maskCtx.fillStyle = 'rgba(0, 0, 0, 1)';
      maskCtx.fill();
    } else {
      // Multiple points - draw a smooth stroke
      maskCtx.beginPath();
      maskCtx.moveTo(points[0].x, points[0].y);

      if (points.length === 2) {
        maskCtx.lineTo(points[1].x, points[1].y);
      } else {
        // Smooth the line with quadratic curves
        for (let i = 1; i < points.length - 1; i++) {
          const xc = (points[i].x + points[i + 1].x) / 2;
          const yc = (points[i].y + points[i + 1].y) / 2;
          maskCtx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }
        maskCtx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
      }

      maskCtx.stroke();
    }

    // Restore mask context state
    maskCtx.restore();
  }
  
  // For preview, draw directly to main canvas with transparency
  if (isPreview) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 35;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    if (points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
    } else if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, 17.5, 0, Math.PI * 2);
      ctx.fillStyle = '#FFD700';
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawArrow(startX, startY, endX, endY, isPreview = false) {
  ctx.save();
  
  // Arrow styling
  ctx.strokeStyle = isPreview ? 'rgba(255, 0, 0, 0.5)' : '#FF0000';
  ctx.fillStyle = isPreview ? 'rgba(255, 0, 0, 0.5)' : '#FF0000';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  
  // Draw the line
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  
  // Calculate arrowhead
  const angle = Math.atan2(endY - startY, endX - startX);
  const arrowLength = 20;
  const arrowAngle = Math.PI / 6;
  
  // Draw arrowhead
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(
    endX - arrowLength * Math.cos(angle - arrowAngle),
    endY - arrowLength * Math.sin(angle - arrowAngle)
  );
  ctx.lineTo(
    endX - arrowLength * Math.cos(angle + arrowAngle),
    endY - arrowLength * Math.sin(angle + arrowAngle)
  );
  ctx.closePath();
  ctx.fill();
  
  ctx.restore();
}

function redrawCanvas() {
  // Clear and redraw original image
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (originalImage) {
    ctx.drawImage(originalImage, 0, 0);
  }

  // Apply highlights from mask if there are any in history
  if (maskCanvas && tempCanvas && drawHistory.some(a => a.type === 'highlight')) {
    ctx.save();

    // Clear temp canvas
    tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);

    // Draw the mask to temp canvas
    tempCtx.drawImage(maskCanvas, 0, 0);

    // Keep only where mask has alpha, and color it yellow
    tempCtx.globalCompositeOperation = 'source-in';
    tempCtx.fillStyle = '#FFD700'; // Bright gold/yellow
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    // Now draw the colorized highlight to main canvas with multiply blend
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(tempCanvas, 0, 0);

    ctx.restore();
  }

  // Redraw arrows on top - ensures all arrows persist
  drawHistory.forEach(action => {
    if (action.type === 'arrow') {
      drawArrow(action.start.x, action.start.y, action.end.x, action.end.y);
    }
  });
}

function undoLastAction() {
  if (drawHistory.length > 0) {
    // Remove the most recent action (highlight or arrow)
    drawHistory.pop();

    // Clear mask and rebuild from remaining highlight history
    // This ensures all remaining highlights persist after undo
    if (maskCtx && maskCanvas) {
      maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

      // Redraw all remaining highlights to mask to maintain persistence
      drawHistory.forEach(action => {
        if (action.type === 'highlight') {
          // Redraw to mask (not preview) - rebuilds the persistent highlight layer
          drawHighlightStroke(action.points, false);
        }
      });
    }

    // Redraw canvas with all remaining persistent highlights and arrows
    redrawCanvas();
    updateActionCount();
    showToast('Action undone', 'success');
  }
}

function clearAllEdits() {
  if (drawHistory.length > 0) {
    if (confirm('Clear all edits? This cannot be undone.')) {
      // Clear all persistent highlights and arrows
      drawHistory = [];

      // Clear the mask canvas (removes all persistent highlights)
      if (maskCtx && maskCanvas) {
        maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      }

      // Redraw canvas with only the original image (no highlights or arrows)
      redrawCanvas();
      updateActionCount();
      showToast('All edits cleared', 'success');
    }
  }
}

function updateActionCount() {
  document.getElementById('actionCount').textContent = drawHistory.length;
}

async function saveEditedImage() {
  try {
    // Get the edited image data
    const editedDataUrl = canvas.toDataURL('image/png');
    
    // Load captures from storage
    const result = await chrome.storage.local.get(['captures']);
    const captures = result.captures || [];
    
    // Update the capture with edited image
    captures[captureIndex].screenshot = editedDataUrl;
    captures[captureIndex].edited = true;
    captures[captureIndex].editedAt = new Date().toISOString();
    
    // Save back to storage
    await chrome.storage.local.set({ captures });
    
    showToast('Image saved successfully!', 'success');
    
    // Close editor and return to archive
    setTimeout(() => {
      window.location.href = 'archive.html';
    }, 1000);
  } catch (error) {
    console.error('Error saving image:', error);
    showToast('Error saving image', 'error');
  }
}

function cancelEdit() {
  if (drawHistory.length > 0) {
    if (!confirm('Discard all changes?')) {
      return;
    }
  }
  window.location.href = 'archive.html';
}

// Zoom functions
function adjustZoom(factor) {
  const newZoom = currentZoom * factor;
  if (newZoom >= 0.1 && newZoom <= 5) {
    currentZoom = newZoom;
    // Use CSS transform for visual zoom only
    canvas.style.transform = `scale(${currentZoom})`;
    canvas.style.transformOrigin = 'center';
    document.getElementById('zoomLevel').textContent = Math.round(currentZoom * 100) + '%';
  }
}

function fitToWindow() {
  const container = document.querySelector('.canvas-container');
  const containerWidth = container.clientWidth - 40;
  const containerHeight = container.clientHeight - 40;
  
  const scaleX = containerWidth / canvas.width;
  const scaleY = containerHeight / canvas.height;
  currentZoom = Math.min(scaleX, scaleY, 1);
  
  canvas.style.transform = `scale(${currentZoom})`;
  canvas.style.transformOrigin = 'center';
  document.getElementById('zoomLevel').textContent = Math.round(currentZoom * 100) + '%';
}

// Keyboard shortcuts
function handleKeyboard(e) {
  if (e.ctrlKey || e.metaKey) {
    switch(e.key) {
      case 'z':
        e.preventDefault();
        undoLastAction();
        break;
      case 's':
        e.preventDefault();
        saveEditedImage();
        break;
      case '=':
      case '+':
        e.preventDefault();
        adjustZoom(1.2);
        break;
      case '-':
        e.preventDefault();
        adjustZoom(0.8);
        break;
      case '0':
        e.preventDefault();
        fitToWindow();
        break;
    }
  } else if (e.key === 'Escape') {
    cancelEdit();
  }
}

// Toast notification
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast ' + type;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

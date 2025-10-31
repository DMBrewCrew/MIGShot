# Facebook Post Capture Extension

A Chrome extension for capturing Facebook posts with screenshot, posting date, and URL for investigative documentation.

## Features

- 📸 **Full-screen screenshot** of the current page
- 📅 **Automatic date extraction** in MM/DD/YYYY format
- 🎨 **Generated date badge image** - uniform, professional date stamp for all platforms
- 🔗 **URL capture** of the current post
- ⌨️ **Keyboard shortcut** (Ctrl+M / Cmd+M on Mac) for quick capture
- 📋 **Easy copy-paste** - all data and images copy directly to clipboard
- 🎯 **Professional consistency** - date badges look identical across Facebook, Instagram, TikTok, etc.
- 💾 **Archive system** - save 10-30+ captures and copy them all at once
- 📁 **Persistent storage** - captures saved even after closing browser

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select the `facebook-capture-extension` folder
5. The extension icon should now appear in your toolbar

## 🚀 Usage

### Simple Workflow
1. Navigate to any Facebook post
2. Click the extension icon
3. Click "📦 Archive This Post" (or press Ctrl+M)
4. Post is automatically saved to archive
5. Click "📁 Open Archive" to view all captured posts
6. In the archive, click "Copy This Capture" or "Copy All Captures"
7. Paste into Word (Ctrl+V)

**What you get when pasting:**
- Screenshot of the post
- Date badge image (blue banner with posting date)
- Post URL

No text dates - just the professional date badge image!

## Using the Archive

### How It Works
- Every post you archive is automatically saved
- Click "📁 Open Archive" to view all your captures
- Archive persists between browser sessions
- No limits on number of captures (within browser storage)

### Copying from Archive
- **Copy This Capture** - Copies one post (screenshot + date badge image + URL)
- **Copy All Captures** - Copies all posts at once with line breaks
- Paste directly into Word - images and URLs paste perfectly

### Archive Management
- **View**: See all captures with thumbnails
- **Delete**: Remove individual captures or clear entire archive
- **Professional Format**: Date badge images ensure uniform appearance

## Pasting into Word Documents

After copying from archive:
1. Paste into Word (Ctrl+V or Cmd+V)
2. Each capture includes:
   - Screenshot (image)
   - Date badge (image with blue banner showing posting date)
   - URL (text hyperlink)
   - Line break separator

## Captured Data

The extension captures four pieces of information:

1. **Posting Date**: Extracted in MM/DD/YYYY format (as text)
2. **Date Badge Image**: A professionally generated image of the date - uniform across all platforms
3. **Post URL**: The complete URL of the current page
4. **Screenshot**: Full-screen capture of the visible area

All items can be copied directly to clipboard with one click and pasted into Word documents.

### Why a Generated Date Badge?

Instead of screenshotting the date from each platform (which would look different on Facebook, Instagram, TikTok, etc.), the extension generates a uniform, professional-looking date badge. This ensures:
- Consistent appearance across all social media platforms
- Professional look in investigative reports
- Clear, readable date stamps
- No platform-specific styling issues

## Facebook Date Extraction

The extension attempts to find posting dates using multiple methods:
- Unix timestamps (data-utime attribute)
- aria-label attributes
- Visible date text in various formats
- Common date patterns (January 15, 2024, etc.)

## Notes

- You must be logged into Facebook for the extension to work
- The extension only activates on facebook.com domains
- Screenshots capture the visible viewport area
- Date extraction works best on post pages rather than feed pages

## Troubleshooting

**"Date not found"**: 
- Make sure you're on an actual post page (not just the feed)
- Try scrolling to make sure the post date is visible
- Some post types may not have easily extractable dates

**Extension not working**:
- Make sure you're on facebook.com
- Check that the extension is enabled in chrome://extensions/
- Try refreshing the Facebook page

## Future Enhancements

- Direct Word document generation
- Custom date format options
- Multiple post batch capture
- Additional social media platform support

## Technical Details

- **Manifest Version**: 3
- **Permissions**: activeTab, scripting, tabs
- **Content Script**: Runs on facebook.com domains
- **Background Service Worker**: Coordinates capture process

## Version History

### v2.3.0 (Current)
- **SMALLER BADGES**: Date badge images now 50% smaller (150x40 instead of 300x80)
- **SMART BADGES**: Only show date badges for posts from current year
- **CLICKABLE URLS**: URLs paste as actual hyperlinks in Word (no manual formatting needed)
- Posts from previous years show: Screenshot + URL only (no badge)
- Posts from current year show: Screenshot + Date Badge + URL

### v2.2.0
- **SIMPLIFIED WORKFLOW**: One-click "Archive This Post" button
- **DATE BADGE ONLY**: Removed text dates - only professional date badge images
- Posts automatically save to archive (no preview/copy step)
- Cleaner UI with streamlined experience

### v2.1.0
- **FIXED**: Added `aria-labelledby` detection for date extraction
- Facebook uses `aria-labelledby` to point to hidden elements containing dates
- This fix handles Facebook's anti-scraping obfuscation technique
- Date extraction now works with obfuscated date HTML structures

### v2.0.0
- Archive system with persistent storage
- Date badge image generation
- Copy All functionality
- Keyboard shortcuts (Ctrl+M)

### v1.0.0
- Initial release
- Basic screenshot and date capture

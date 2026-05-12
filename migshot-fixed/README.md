# MIGShot v6.8.0 - Case Management Update

## 🆕 What's New in v6.8.0

### Case Management System
Complete organizational system for managing multiple investigations with proper MIG# tracking.

**Key Features:**
- **Create Cases**: Name + MIG# format (#####-#)
- **Add Associates**: Track multiple subjects per case (primary + associates)
- **Switch Cases**: Change active case anytime
- **Subject Dropdown**: Switch between subjects for capturing
- **Persistent Sessions**: Cases stay active until you manually switch

### Popup Changes
1. **No Active Case State**:
   - Shows "Create New Case" button
   - Can't capture until case is created

2. **Active Case State**:
   - Displays Case Name, MIG#, and current Subject
   - Subject dropdown to switch between people
   - Add Associate button
   - Change Case button
   - Archive This Post button

3. **Removed**:
   - "Mark as About Page" checkbox (removed from popup as requested)

### Storage Structure
Each capture now includes:
```javascript
{
  caseName: "Joe Smith",      // Case name
  caseMIG: "12345-1",          // MIG number
  subjectName: "Sally Smith",  // Who this capture is about
  platform: "Facebook",        // Detected platform
  url: "...",                  // Page URL
  screenshot: "...",           // Base64 image
  date: null,                  // Optional date
  isAboutPage: false,         // Can be toggled in archive
  capturedAt: "..."           // Timestamp
}
```

### Workflow
1. **First Time**: Click "New Case" → Enter Name & MIG# → Start capturing
2. **Capturing**: All screenshots auto-tagged with current case/subject
3. **Add Associate**: Click "Add Associate" → Enter name → Automatically switches to them
4. **Switch Subjects**: Use dropdown in popup
5. **Change Case**: Click "Change Case" → Select from list or create new

### Archive Display ✅ COMPLETED
The archive now shows the full three-tier hierarchy:
```
📁 Joe Smith (MIG-12345) [15 captures]
  👤 Joe Smith (Primary) [10 captures]
    📘 Facebook (5) 📷 Instagram (3) 🎵 TikTok (2)
  👤 Sally Smith [5 captures]
    📘 Facebook (3) 📷 Instagram (2)
```

**Features:**
- Collapsible cases and subjects (click to expand/collapse)
- Platform tabs within each subject
- Drag-and-drop reordering within platforms
- **📅 Date Entry** - Add/Edit post dates for each capture
- **📄 About Page Toggle** - Mark captures as About Pages
- Copy All organizes by Case → Subject → Platform
- New Case and Add Associate buttons at top
- Uncategorized section for old captures without case info

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select the `migshot-fixed` folder
5. Done!

## Usage

### Creating Your First Case
1. Click the MIGShot extension icon
2. Click "📁 New Case"
3. Enter:
   - **Name**: Primary subject (e.g., "Joe Smith")
   - **MIG#**: Case number in format #####-# (e.g., "12345-1")
4. Click "Start Case"

### Adding Associates
1. While on an active case, click "👤 Add Associate"
2. Enter the associate's name (e.g., "Sally Smith")
3. Click "Add & Capture"
4. Extension automatically switches to capturing for this associate

### Capturing Screenshots
1. Make sure you have an active case
2. Click "📦 Archive This Post" or press **Alt+S**
3. Click and drag to select the area
4. Screenshot is automatically tagged with Case/Subject/Platform

### Switching Between Subjects
- Use the **Subject dropdown** in the popup to quickly switch who you're capturing for
- The extension remembers your selection

### Changing Cases
1. Click "📁 Change Case"
2. Select from existing cases or create a new one
3. Automatically switches to that case's primary subject

### Adding Dates to Captures
Each capture card has a **📅 Add/Edit Date** button:
1. Click the date button on any capture
2. Enter the date (e.g., "January 15, 2025")
3. Click "Save Date"
4. Date appears as a badge and will be included when copying (unless marked as About Page)
5. To remove a date: Check "Clear date" checkbox

**Tip**: Click the date badge to quickly edit it!

### Marking as About Page
Each capture card has a **📄 About** button:
1. Click the About button on any capture
2. Toggle the "Mark as About Page" checkbox
3. About Pages will NOT include URL or date when copied
4. Perfect for profile screenshots where you only want the image

## Keyboard Shortcut
- **Alt+S**: Quick capture (uses current active case)

## Sphere Nexus Upload

MIGShot can push captures to the Sphere Nexus platform for inclusion
in IPR / IPRBG reports.

### Setup (one-time)

1. Right-click the MIGShot extension icon → **Options**.
2. Enter your Sphere URL (e.g. `http://127.0.0.1:8000`) and an API
   token (generate at `<sphere-url>/settings`).
3. Click **Test Connection** to confirm.
4. Click **Save Settings**. Chrome will request permission to reach
   that origin — approve.

### Per-case upload

In the archive, each case header shows:

- **⬆ Upload to Sphere (N)** — pushes the N un-uploaded captures for
  the active case. Successful captures get a green "✓ Uploaded" badge.
  Failures are listed in a summary modal at the end.
- **🗑 Clear Uploaded (M)** — after confirming, deletes M uploaded
  captures from local storage to free up Chrome's quota.

### TrackOps Case #

The case number on the New Case form is now the **TrackOps case
number** (e.g. `S00027-01`). This is the key Sphere uses to find the
claimant. For old cases whose case# is still a timestamp, use the
**✏️** pencil next to the case dropdown in the archive to update it.
All captures under that case are rewritten automatically.

## Technical Notes

- The case# on the New Case form is the TrackOps case number (e.g. `S00027-01`)
- Cases persist across browser sessions
- If no case is active, you'll be prompted to create one
- All captures are still stored with platform detection (Facebook, Instagram, TikTok, etc.)
- Storage uses Chrome's `unlimitedStorage` permission

## What's Coming Next

- Archive reorganization to display case/subject hierarchy
- Export entire case to Word document
- Quick actions: "Copy All for Case", "Export Case"
- Right-click context menus on cases

## Support

For issues or questions, contact:
- **Developer**: Anthony Klarich
- **Organization**: Marshall Investigative Group

---

© 2025 Anthony Klarich | Marshall Investigative Group

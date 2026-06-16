# Sphere MIGshot — freeze-first capture + Sphere rebrand

**Date:** 2026-06-16
**Status:** Approved (brainstorm)
**Repo:** migshot-repo (Chrome MV3 extension)

## Goal

Ship a new generation of the capture extension — **"Sphere MIGshot"** — that:
1. Fixes the "captures the wrong thing" bug with a **freeze-first** capture flow.
2. Rebrands to match **Sphere Nexus** (name, palette, icon, fonts).
3. Bundles three reliability **hardening** items.
4. Ships **in-place** so users keep their existing saved captures.

## Source layout (preserve the old version)

- New code lives in a **new folder: `migshot-repo/sphere-migshot/`** (copied from
  `migshot-fixed/`, then modified). The existing **`migshot-fixed/` is left
  untouched** as the backup of the old version on the D: drive.
- Work happens on branch `feat/sphere-migshot-rebrand`.

## 1. Capture architecture — freeze-first (the core fix)

**Root cause being fixed:** the manual box path records the selection as viewport
pixel coordinates at mouse-up, then `captureVisibleTab` runs ~200ms later (after a
layout-mutating `display:none` hide and a blind wait), and crops to the *stale*
coordinates. Any scroll / lazy-load / reflow in that window → wrong crop.

**New manual-box flow (photo, then crop):**
1. Trigger (`Alt+S` command or popup button) → content script asks background to
   capture.
2. Background: send `hideUserData` → `captureVisibleTab` (PNG of the current
   viewport) → `restoreUserData`.
3. Background returns the screenshot data URL to the content script.
4. Content script paints it as a **frozen, full-viewport fixed overlay** (rendered
   1:1 with the viewport) and runs the existing selection-box UI **on top of the
   frozen image**.
5. On mouse-up, the selected rectangle is **cropped from that exact captured
   image** (not the live page) and saved to the archive with the existing
   metadata/case fields.

Because the pixels are frozen before the user draws, scrolling, lazy-loading, and
the hide-reflow **cannot** move the target. Consequences:
- **No scroll-lock needed** — the overlay covers the page during selection.
- The `display:none` hide is now harmless (the user selects on the post-hide
  image), so no change needed there for correctness.
- DPR mapping is inherently consistent (image + bounds come from the same instant).

**Crop ownership:** the content script holds the captured data URL during
selection and performs the crop on a canvas, then sends only the final cropped
image to the background to save. This keeps the crop tied to the frozen image and
avoids any dependency on the MV3 service worker staying alive between steps.

**Tall-post / rolling capture is unchanged** — freeze-first governs only the
single-viewport box. The rolling/stitch path keeps its scroll-and-stitch logic;
the only tweak is replacing its fixed post-scroll 200ms wait with the existing
`waitForScrollComplete` stability check.

## 2. Hardening (bundled)

- **Rate-limit retry:** wrap `captureVisibleTab` in a small retry-with-backoff so a
  throttled call (Chrome's ~2 captures/sec cap) isn't silently dropped. The manual
  path currently has no retry.
- **Service-worker state:** audit the "current case" / `pendingCaseInfo` state; if
  it lives only in a background-script variable it can be lost when Chrome suspends
  the MV3 worker (→ a capture filed to the wrong/no case). Persist it in
  `chrome.storage` if it isn't already.
- **DPR crop check:** verify the crop's `devicePixelRatio` math is correct on
  zoomed / multi-monitor setups.

## 3. Rebrand (match Sphere Nexus)

- **Palette:** primary teal `#256D96`, accent cyan `#00B0F0`, accent-dark
  `#0098D4`, light `#E0F2FC`, bg-tint `#F0F8FE`; surfaces white, border `#e2e5ea`,
  text `#1a1f2e`/`#4a5568`/`#8896a6`. Replaces the current tan/olive
  (`#9B9565`/`#7a7550`) + `#2B5F6F` scheme everywhere (popup, options, editor,
  archive, and the in-page selection/rolling overlays).
- **Fonts:** `'DM Sans', system-ui, sans-serif` for UI; `'Bahnschrift SemiBold'`
  for headings (Windows system font; falls back gracefully). Bundle DM Sans woff2
  for fidelity.
- **Name:** manifest `name` → **"Sphere MIGshot"**, description updated; version
  bump to **8.0.0**.
- **Icon/logo:** use the **Sphere logo mark** (`sphere_mark.png` from Sphere Nexus)
  for `icons/icon16|48|128.png` and in the popup/header.
- **Hard constraint:** do **not** rename any `chrome.storage` keys — that is what
  preserves users' existing captures.

## 4. Identity & rollout (keep existing captures)

An unpacked extension with **no `key`** gets an ID derived from its **install
folder path**, and `chrome.storage` data is keyed to that ID. The current MIGShot
is keyless, so its data lives under a path-derived ID.

- **Stay keyless. Do NOT add a `key`** — adding one would give the extension a new
  ID and orphan everyone's existing captures.
- Data is preserved by installing **over the existing folder (same path)**: users
  replace the *contents* of their current extension folder with the new files
  (folder name can stay; the display name updates from the manifest) and hit
  **Reload** in `chrome://extensions`. Same path → same ID → captures intact.
- The **new `sphere-migshot/` folder is the source/dev copy on D: only** — it does
  not change the user's install path.
- Ship a distributable **`sphere-migshot.zip`** with a short README: "extract over
  your existing MIGShot folder (keep the same location), then Reload."
- The old `migshot-fixed/` source remains on D: as the rollback.

## 5. Testing / verification

- Load the unpacked `sphere-migshot/` in a real Chromium via Playwright
  (`--load-extension`, persistent context).
- **Key regression:** capture a box on a deliberately **scrolling / lazy-loading**
  test page and confirm the saved crop matches the selection even while the page is
  moving (it must, since pixels are frozen first).
- Sanity: a normal static-page capture crops correctly; rolling/stitch still works;
  popup/options/editor/archive render in the Sphere palette with the new name/icon.

## Out of scope

- Rewriting the rolling/stitch algorithm (only its settle-wait is touched).
- Any change to the Sphere Nexus upload feature already on this branch lineage.
- A capture export/import migration (same-path overwrite preserves data instead).

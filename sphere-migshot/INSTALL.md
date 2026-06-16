# Sphere MIGshot — install / update

Sphere MIGshot is the capture extension for Sphere Nexus reports. This version
adds **freeze-first capture** (it photographs the screen the instant you trigger
a capture, then you draw your box on that frozen image — so scrolling or the page
shifting can no longer make it grab the wrong thing), a **Sphere rebrand**, and
reliability hardening.

## Updating from an older MIGShot — KEEP your existing captures

Your saved captures are tied to the extension's **install folder location**. To
keep them, update *in place*:

1. Find your current MIGShot folder (the one you loaded under
   `chrome://extensions`).
2. **Replace its contents** with the files from this version — keep the **same
   folder name and location**. (Delete the old files inside it, copy these in.)
3. Go to `chrome://extensions`, find the extension, and click **Reload** (↻).

Because the folder path didn't change, the extension keeps the same identity and
**all your existing captures carry over**. It will now show as "Sphere MIGshot".

> ⚠️ Do **not** load this into a brand-new folder if you want to keep old
> captures — a new folder = a new extension with empty storage.

## Fresh install (new machine / no prior data)

1. `chrome://extensions` → turn on **Developer mode** (top right).
2. **Load unpacked** → select this `sphere-migshot` folder.

## Notes

- Capture hotkey: **Alt+S** (single shot) — same as before.
- Old `migshot-fixed/` is retained in the repo as the previous version.

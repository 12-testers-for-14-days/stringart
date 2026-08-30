# StringForge — String Art Generator

A clean, client-side string art generator designed for static hosting such as GitHub Pages.

## Features

- Drag-and-drop or file picker image upload.
- Pre-generation image quality gate: resolution, contrast, sharpness, and exposure checks.
- Image framing controls: zoom, horizontal/vertical offset, circle/square crop.
- String-art settings for nail count, string count, line weight, contrast balance, detail boost, minimum pin gap, candidate scan, inversion, edge preservation, and highlight protection.
- Presets: Balanced, Portrait, High detail, Fast draft.
- Greedy chord-selection algorithm that runs entirely in the browser.
- Large preview with pin overlay and live stats.
- Export exact pin sequence as `.txt` and `.json`.
- No backend, API key, or build step required.

## GitHub Pages

1. Create a new GitHub repository.
2. Upload `index.html`, `styles.css`, `app.js`, and `README.md`.
3. In GitHub, open **Settings → Pages**.
4. Select **Deploy from a branch**, choose the default branch and `/ (root)`.
5. Save. GitHub Pages will serve `index.html` directly.

## Notes on the algorithm

The app downsamples the prepared image to a compact analysis grid, converts it into a darkness target, then greedily selects the next nail-to-nail chord that best reduces the remaining local darkness deficit. A minimum pin gap and recent-pin exclusion prevent unstable short jumps. The sequence is deterministic for a given image/settings state.

For production improvements, consider adding a Web Worker for the generator loop, optional off-grid nail placement, multi-pass scoring, and persistence of project files.

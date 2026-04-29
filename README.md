# Cominote

Cominote is a text-and-OCR-image-to-comic learning platform that turns educational notes, PDFs, and readable study screenshots into downloadable comic strips.
This build now includes the full mini-project flow described in your documents:

- Firebase Authentication for sign up, login, and secure forgot-password reset links
- A single-page dashboard with Input, Processing Status, and Output panels
- Theme dataset integration from the `JSON/` folder
- Flask API endpoints for generation, image retrieval, and downloads
- `.txt`, `.pdf`, `.docx`, `.jpg`, `.jpeg`, and `.png` intake
- OCR-based text image conversion with Anime, Marvel, DC, Pokemon, Cartoon, Fantasy, and Sci-Fi art-style choices
- Background job generation with progress polling for long-running comic builds
- Chunk-aware concept extraction, relation hints, and multi-panel comic sequencing
- Programmatic comic rendering with PNG and JPEG export
- Recent comic history stored per signed-in user in local browser storage

## Project Structure

- `index.html` - the full SPA UI
- `styles.css` - comic-style responsive layout and dashboard styling
- `app.js` - Firebase auth, routing, form handling, API calls, history, and output rendering
- `app.py` - Flask server and REST endpoints
- `cominote_engine.py` - input validation, text/PDF/OCR-image handling, concept extraction, narrative generation, and comic rendering
- `JSON/` - theme datasets that can now be selected directly from the dashboard
- `render.yaml` - one-click Render deployment config for the full Flask app

## Run Locally

1. Create a virtual environment:

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

2. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. Optional NLP extras for richer extraction:

   ```bash
   python3 -m pip install --user nltk "spacy<3.8"
   python -m spacy download en_core_web_sm
   ```

   `nltk` and `spacy` are optional. The app already includes fallback logic, so the core project works without them.

4. Optional OCR fallback for Linux/Windows deployments:

   ```bash
   # Install the Tesseract OCR system package for your OS, then optionally:
   pip install pytesseract
   ```

   On macOS, Cominote can use the built-in Vision OCR helper at `scripts/ocr_vision.swift`. The image flow validates that uploaded JPG/PNG files contain readable study text before generating a comic.

5. Start the app:

   ```bash
   python3 app.py
   ```

6. Open [http://127.0.0.1:5001](http://127.0.0.1:5001)

## Theme Datasets

The dashboard now reads every `.json` file inside `JSON/` and exposes it as a selectable theme dataset.

- Pick a theme dataset directly from the UI
- Search by title from the dashboard
- Auto-match subject and style from the selected dataset
- Generate a comic from the dataset alone, or combine it with pasted notes / uploads

## Deployment

### Recommended: Render

This repo now includes `render.yaml`, so the easiest public deployment is to deploy the entire Flask app to Render.

1. Push this repo to GitHub.
2. In Render, choose **New +** -> **Blueprint**.
3. Connect the repo and Render will detect `render.yaml`.
4. Deploy. Render will install `requirements.txt` and run:

   ```bash
   gunicorn app:app --bind 0.0.0.0:$PORT
   ```

Because Flask already serves the frontend files, the Render URL becomes your single public app link.

### GitHub Repository

This workspace can be connected to your GitHub repo:

- `https://github.com/srija-kottakki/cominote`

The repo setup now includes:

- `.gitignore` for Python, generated outputs, and local tooling

### Firebase Hosting

Firebase Hosting is configured for your project id:

- `cominote-2d016`

Files added for this:

- `firebase.json`
- `.firebaserc`

Deploy with:

```bash
firebase login
firebase use cominote-2d016
firebase deploy --only hosting
```

### Important Hosting Note

GitHub Pages and Firebase Hosting can host the frontend files, but they do not run the Flask backend.
For hosted frontend deployments, set the backend URL in `config.js`:

```js
window.COMINOTE_CONFIG = {
  apiBase: "https://your-flask-backend.example.com"
};
```

If `apiBase` is left empty, the app expects the frontend and Flask backend to be served from the same origin, which is the local `python3 app.py` setup.

### Firebase Auth Domain Setup

After deploying the frontend, add your deployed site domain in Firebase Authentication's authorized domains list.
Examples:

- `srija-kottakki.github.io`
- `cominote-2d016.web.app`
- `cominote-2d016.firebaseapp.com`

## API Endpoints

- `GET /api/themes`
- `POST /api/generate`
- `POST /api/generate/images`
- `POST /api/upload-image`
- `GET /api/jobs/<job_id>`
- `GET /api/comics/<comic_id>`
- `GET /api/comics/<comic_id>/image`
- `GET /api/download/<comic_id>?format=png`
- `GET /api/download/<comic_id>?format=jpeg`
- `GET /api/download/<comic_id>?format=pdf`

## Notes

- Firebase config is kept from the existing prototype so your current auth flow still works. Forgot-password uses Firebase Auth reset emails and expiry-managed reset links.
- PDF parsing requires `PyMuPDF`.
- Comic rendering requires `Pillow`.
- Text image upload uses OCR. It extracts text from notes, textbook screenshots, and educational images, rejects unclear/no-text images with a clear message, detects the topic, summarizes learning points, then generates a themed comic from the extracted content instead of placing the uploaded bitmap in panels.
- The NLP layer is designed to run with lightweight heuristics by default and use `spaCy` / `NLTK` when available.

# Cominote

Cominote is a text-to-comic learning platform that turns educational notes into downloadable comic strips.
This build now includes the full mini-project flow described in your documents:

- Firebase Authentication for sign up and login
- A single-page dashboard with Input, Processing Status, and Output panels
- Flask API endpoints for generation, image retrieval, and downloads
- `.txt` and `.pdf` intake
- Rule-based concept extraction, relation hints, and multi-panel comic sequencing
- Programmatic comic rendering with PNG and JPEG export
- Recent comic history stored per signed-in user in local browser storage

## Project Structure

- `index.html` - the full SPA UI
- `styles.css` - comic-style responsive layout and dashboard styling
- `app.js` - Firebase auth, routing, form handling, API calls, history, and output rendering
- `app.py` - Flask server and REST endpoints
- `cominote_engine.py` - input validation, text/PDF handling, concept extraction, narrative generation, and comic rendering

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

3. Optional upgrades for richer NLP:

   ```bash
   python -m spacy download en_core_web_sm
   ```

   NLTK tokenizers and corpora are optional; the app includes fallbacks if they are not available.

4. Start the app:

   ```bash
   python3 app.py
   ```

5. Open [http://127.0.0.1:5000](http://127.0.0.1:5000)

## Deployment

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

- `POST /api/generate`
- `GET /api/comics/<comic_id>`
- `GET /api/comics/<comic_id>/image`
- `GET /api/download/<comic_id>?format=png`
- `GET /api/download/<comic_id>?format=jpeg`

## Notes

- Firebase config is kept from the existing prototype so your current auth flow still works.
- PDF parsing requires `PyMuPDF`.
- Comic rendering requires `Pillow`.
- The NLP layer is designed to run with lightweight heuristics by default and use `spaCy` / `NLTK` when available.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDf3QB-hQ1_RtwYTkgFPlJ5AGToSbCe6iw",
  authDomain: "cominote-2d016.firebaseapp.com",
  projectId: "cominote-2d016",
  storageBucket: "cominote-2d016.firebasestorage.app",
  messagingSenderId: "487871751138",
  appId: "1:487871751138:web:5d04f1f53b788890ab8fbb",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const COMINOTE_CONFIG = window.COMINOTE_CONFIG || {};
const API_BASE = String(COMINOTE_CONFIG.apiBase || "").replace(/\/$/, "");

const SAMPLE_NOTES = {
  science:
    "Photosynthesis is the process by which green plants make food. Chlorophyll in the leaves absorbs sunlight. The plant takes in carbon dioxide from the air and water from the soil. Using light energy, these raw materials are converted into glucose and oxygen. The glucose stores chemical energy for the plant, while oxygen is released into the atmosphere.",
  history:
    "The Industrial Revolution began in Britain in the eighteenth century. New machines and factories changed how goods were produced. Coal and steam power increased manufacturing speed. Cities grew because workers moved from villages to industrial centers. Although production increased, factory workers often faced difficult conditions and long hours.",
  mathematics:
    "A linear equation shows a constant rate of change. In the equation y equals mx plus c, m represents the slope and c represents the y-intercept. The slope tells us how much y changes when x increases by one unit. When we graph the equation, the line crosses the y-axis at c. Using two points on the line, we can calculate the slope and predict future values.",
  literature:
    "In a story, the setting shapes the mood and the characters' choices. The protagonist usually faces a conflict that drives the plot forward. Supporting characters reveal different perspectives on the main problem. As the story reaches its climax, tension rises and the central theme becomes clearer. The resolution shows how the characters changed because of the conflict.",
};

const STATUS_STEPS = [
  {
    title: "Validating your input",
    text: "Checking file size, file type, and text length before sending the request.",
    progress: 16,
  },
  {
    title: "Extracting concepts",
    text: "Ranking important ideas and detecting named entities from your notes.",
    progress: 42,
  },
  {
    title: "Sequencing the narrative",
    text: "Turning the extracted concepts into a comic-style scene flow.",
    progress: 72,
  },
  {
    title: "Rendering comic panels",
    text: "Drawing the final strip and preparing download links.",
    progress: 96,
  },
];

const state = {
  currentComic: null,
  progressTimer: null,
  user: null,
  history: [],
};

const els = {};

function apiUrl(path) {
  if (!path) return API_BASE || "";
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  return `${API_BASE}${path}`;
}

function cacheEls() {
  const ids = [
    "login-email",
    "login-pass",
    "login-msg",
    "signup-name",
    "signup-email",
    "signup-pass",
    "signup-pass2",
    "signup-msg",
    "dash-username",
    "dash-email",
    "user-avatar",
    "project-title",
    "subject-select",
    "style-select",
    "notes-input",
    "notes-file",
    "char-count",
    "file-feedback",
    "generate-btn",
    "status-progress",
    "status-title",
    "status-text",
    "summary-panels",
    "summary-concepts",
    "summary-source",
    "comic-preview",
    "comic-image",
    "comic-title",
    "comic-caption",
    "download-png",
    "download-jpeg",
    "concept-list",
    "scene-list",
    "history-list",
  ];

  ids.forEach((id) => {
    els[id] = document.getElementById(id);
  });

  els.statusSteps = Array.from(document.querySelectorAll(".status-step"));
}

function showPage(id) {
  document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
  const target = document.getElementById(id);
  if (target) {
    target.classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function setAuthMessage(id, type, text) {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = text || "";
  node.className = "auth-message";
  if (type) {
    node.classList.add(`is-${type}`);
  }
}

function setStatus(index, phase = "idle") {
  els.statusSteps.forEach((step, stepIndex) => {
    step.classList.remove("is-idle", "is-active", "is-done", "is-error");

    if (phase === "error" && stepIndex === index) {
      step.classList.add("is-error");
      return;
    }

    if (stepIndex < index) {
      step.classList.add("is-done");
      return;
    }

    if (stepIndex === index && phase === "active") {
      step.classList.add("is-active");
      return;
    }

    step.classList.add("is-idle");
  });
}

function resetStatusBoard() {
  clearInterval(state.progressTimer);
  state.progressTimer = null;
  els["status-progress"].style.width = "0%";
  els["status-title"].textContent = "Ready to generate";
  els["status-text"].textContent = "Paste notes or upload a file, then click Generate Comic to begin.";
  els["summary-panels"].textContent = "0";
  els["summary-concepts"].textContent = "0";
  els["summary-source"].textContent = "Idle";
  setStatus(-1);
}

function beginProgressAnimation() {
  clearInterval(state.progressTimer);
  let currentStep = 0;
  const applyStep = () => {
    const details = STATUS_STEPS[currentStep];
    if (!details) return;
    els["status-title"].textContent = details.title;
    els["status-text"].textContent = details.text;
    els["status-progress"].style.width = `${details.progress}%`;
    setStatus(currentStep, "active");
    currentStep += 1;
  };

  applyStep();
  state.progressTimer = window.setInterval(() => {
    if (currentStep >= STATUS_STEPS.length) {
      clearInterval(state.progressTimer);
      state.progressTimer = null;
      return;
    }
    applyStep();
  }, 1200);
}

function completeProgress(comic) {
  clearInterval(state.progressTimer);
  state.progressTimer = null;
  els["status-progress"].style.width = "100%";
  els["status-title"].textContent = "Comic ready";
  els["status-text"].textContent = comic.summary;
  els["summary-panels"].textContent = String(comic.panel_count);
  els["summary-concepts"].textContent = String(comic.concepts.length);
  els["summary-source"].textContent = comic.source_label;
  setStatus(STATUS_STEPS.length, "done");
}

function setStatusError(message) {
  clearInterval(state.progressTimer);
  state.progressTimer = null;
  els["status-progress"].style.width = "100%";
  els["status-title"].textContent = "Generation failed";
  els["status-text"].textContent = message;
  setStatus(3, "error");
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function historyKey() {
  if (!state.user) return "cominote-history-guest";
  return `cominote-history-${state.user.uid}`;
}

function loadHistory() {
  try {
    state.history = JSON.parse(localStorage.getItem(historyKey()) || "[]");
  } catch {
    state.history = [];
  }
  renderHistory();
}

function persistHistoryEntry(comic) {
  const entry = {
    comic_id: comic.comic_id,
    title: comic.title,
    subject: comic.subject,
    style: comic.style,
    preview_url: comic.image_url,
    created_at: comic.created_at,
    summary: comic.summary,
  };

  const deduped = [entry, ...state.history.filter((item) => item.comic_id !== comic.comic_id)].slice(0, 10);
  state.history = deduped;
  localStorage.setItem(historyKey(), JSON.stringify(deduped));
  renderHistory();
}

function renderHistory() {
  const container = els["history-list"];
  if (!state.history.length) {
    container.className = "history-list empty-state";
    container.innerHTML = "<p>Your generated comics history is empty for this account.</p>";
    return;
  }

  container.className = "history-list";
  container.innerHTML = state.history
    .map(
      (item) => `
        <article class="history-entry">
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.subject)} • ${escapeHtml(item.style)} • ${new Date(item.created_at).toLocaleString()}</p>
          <small>${escapeHtml(item.summary)}</small>
          <button class="btn btn-outline" type="button" onclick="openHistoryComic('${item.comic_id}')">Open Result</button>
        </article>
      `
    )
    .join("");
}

function renderConcepts(comic) {
  const container = els["concept-list"];
  if (!comic.concepts.length) {
    container.className = "concept-list empty-state";
    container.innerHTML = "<p>No concepts were extracted from this input.</p>";
    return;
  }

  container.className = "concept-list";
  container.innerHTML = comic.concepts
    .map(
      (concept) => `
        <article class="concept-pill">
          <strong>${escapeHtml(concept.label)}</strong>
          <small>${escapeHtml(concept.kind)} • score ${Number(concept.score).toFixed(2)}</small>
        </article>
      `
    )
    .join("");
}

function renderScenes(comic) {
  const container = els["scene-list"];
  if (!comic.scenes.length) {
    container.className = "scene-list empty-state";
    container.innerHTML = "<p>No scenes were produced for this comic.</p>";
    return;
  }

  container.className = "scene-list";
  container.innerHTML = comic.scenes
    .map(
      (scene, index) => `
        <article class="scene-card">
          <h4>Panel ${index + 1}: ${escapeHtml(scene.title)}</h4>
          <p>${escapeHtml(scene.dialogue)}</p>
          <small>${escapeHtml(scene.speaker)} • ${escapeHtml(scene.background)}</small>
        </article>
      `
    )
    .join("");
}

function renderComic(comic) {
  state.currentComic = comic;
  els["comic-preview"].classList.remove("empty");
  els["comic-image"].src = `${apiUrl(comic.image_url)}?v=${encodeURIComponent(comic.comic_id)}`;
  els["comic-title"].textContent = comic.title;
  els["comic-caption"].textContent = `${comic.subject} • ${comic.style} • ${comic.summary}`;
  els["download-png"].disabled = false;
  els["download-jpeg"].disabled = false;
  renderConcepts(comic);
  renderScenes(comic);
}

function resetOutput() {
  state.currentComic = null;
  els["comic-preview"].classList.add("empty");
  els["comic-image"].removeAttribute("src");
  els["comic-title"].textContent = "Waiting for your first project";
  els["comic-caption"].textContent = "Generated comics will include a summary caption, subject, style, and timestamp.";
  els["download-png"].disabled = true;
  els["download-jpeg"].disabled = true;
  els["concept-list"].className = "concept-list empty-state";
  els["concept-list"].innerHTML = "<p>Concepts will appear here after generation.</p>";
  els["scene-list"].className = "scene-list empty-state";
  els["scene-list"].innerHTML = "<p>Your generated scene-by-scene breakdown will appear here.</p>";
}

function syncUser(user) {
  state.user = user;
  if (user) {
    const name = user.displayName || user.email || "Comic Learner";
    const initials = name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("")
      .slice(0, 2);

    els["dash-username"].textContent = name;
    els["dash-email"].textContent = user.email || "Signed in";
    els["user-avatar"].textContent = initials || "CN";
    loadHistory();
  } else {
    els["dash-username"].textContent = "Comic Learner";
    els["dash-email"].textContent = "Sign in to load your workspace";
    els["user-avatar"].textContent = "CN";
    state.history = [];
    renderHistory();
  }
}

function ensureAuth() {
  if (state.user) {
    return true;
  }
  showPage("pg-login");
  setAuthMessage("login-msg", "error", "Please log in before generating a comic.");
  return false;
}

function updateCharCount() {
  const count = els["notes-input"].value.length;
  els["char-count"].textContent = `${count} / 5000 characters`;
}

function handleFileSelection() {
  const file = els["notes-file"].files?.[0];
  if (!file) {
    els["file-feedback"].textContent = "No file selected yet.";
    return;
  }
  const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
  els["file-feedback"].textContent = `${file.name} selected • ${sizeMb} MB`;
}

function clearComposer() {
  els["project-title"].value = "";
  els["notes-input"].value = "";
  els["notes-file"].value = "";
  els["subject-select"].value = "science";
  els["style-select"].value = "pow";
  els["file-feedback"].textContent = "No file selected yet.";
  updateCharCount();
  resetStatusBoard();
  resetOutput();
}

function fillSample(subject) {
  els["subject-select"].value = subject;
  els["project-title"].value = `${subject.charAt(0).toUpperCase() + subject.slice(1)} comic revision`;
  els["notes-input"].value = SAMPLE_NOTES[subject] || "";
  updateCharCount();
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function doSignup() {
  const name = els["signup-name"].value.trim();
  const email = els["signup-email"].value.trim();
  const password = els["signup-pass"].value;
  const passwordConfirm = els["signup-pass2"].value;

  if (!name || !email || !password || !passwordConfirm) {
    setAuthMessage("signup-msg", "error", "Please complete all signup fields.");
    return;
  }

  if (password !== passwordConfirm) {
    setAuthMessage("signup-msg", "error", "Passwords do not match.");
    return;
  }

  if (password.length < 6) {
    setAuthMessage("signup-msg", "error", "Password must be at least 6 characters long.");
    return;
  }

  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName: name });
    setAuthMessage("signup-msg", "success", "Account created. Loading your dashboard...");
    setTimeout(() => showPage("pg-dash"), 900);
  } catch (error) {
    setAuthMessage("signup-msg", "error", mapAuthError(error.code));
  }
}

async function doLogin() {
  const email = els["login-email"].value.trim();
  const password = els["login-pass"].value;

  if (!email || !password) {
    setAuthMessage("login-msg", "error", "Please enter your email and password.");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    setAuthMessage("login-msg", "success", "Logged in. Opening your workspace...");
    setTimeout(() => showPage("pg-dash"), 700);
  } catch (error) {
    setAuthMessage("login-msg", "error", mapAuthError(error.code));
  }
}

async function doLogout() {
  await signOut(auth);
  resetStatusBoard();
  resetOutput();
  showPage("pg-home");
}

function mapAuthError(code) {
  const errors = {
    "auth/email-already-in-use": "That email is already registered.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/weak-password": "Choose a stronger password with at least 6 characters.",
    "auth/user-not-found": "No account was found for that email.",
    "auth/wrong-password": "Incorrect password. Please try again.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and retry.",
  };
  return errors[code] || "Something went wrong. Please try again.";
}

async function generateComic() {
  if (!ensureAuth()) {
    return;
  }

  const title = els["project-title"].value.trim() || `${slugify(els["subject-select"].value)}-comic-project`;
  const text = els["notes-input"].value.trim();
  const file = els["notes-file"].files?.[0];

  if (!text && !file) {
    setStatusError("Add pasted notes or upload a .txt/.pdf file before generating.");
    return;
  }

  els["generate-btn"].disabled = true;
  beginProgressAnimation();

  try {
    const formData = new FormData();
    formData.append("title", title);
    formData.append("text", text);
    formData.append("subject", els["subject-select"].value);
    formData.append("style", els["style-select"].value);
    formData.append("user_id", state.user.uid);
    formData.append("user_name", state.user.displayName || "");
    if (file) {
      formData.append("file", file);
    }

    const response = await fetch(apiUrl("/api/generate"), {
      method: "POST",
      body: formData,
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Comic generation failed.");
    }

    completeProgress(payload);
    renderComic(payload);
    persistHistoryEntry(payload);
  } catch (error) {
    setStatusError(error.message || "Comic generation failed.");
  } finally {
    els["generate-btn"].disabled = false;
  }
}

function downloadComic(format) {
  if (!state.currentComic) {
    return;
  }
  window.open(apiUrl(state.currentComic.downloads[format]), "_blank", "noopener");
}

async function openHistoryComic(comicId) {
  try {
    const response = await fetch(apiUrl(`/api/comics/${encodeURIComponent(comicId)}`));
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not load that comic.");
    }
    renderComic(payload);
    completeProgress(payload);
    showPage("pg-dash");
  } catch (error) {
    setStatusError(error.message || "Could not load that comic.");
    showPage("pg-dash");
  }
}

function setupEvents() {
  els["notes-input"].addEventListener("input", updateCharCount);
  els["notes-file"].addEventListener("change", handleFileSelection);
  updateCharCount();
  resetStatusBoard();
  resetOutput();
}

window.showPage = showPage;
window.doSignup = doSignup;
window.doLogin = doLogin;
window.doLogout = doLogout;
window.generateComic = generateComic;
window.downloadComic = downloadComic;
window.fillSample = fillSample;
window.clearComposer = clearComposer;
window.openHistoryComic = openHistoryComic;

cacheEls();
setupEvents();

onAuthStateChanged(auth, (user) => {
  syncUser(user);
  if (user) {
    showPage("pg-dash");
    setAuthMessage("login-msg", null, "");
    setAuthMessage("signup-msg", null, "");
  }
});

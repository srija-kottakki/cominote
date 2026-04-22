import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  DEFAULT_THEME_RENDER,
  buildThemePreviewDataUri,
  normalizeThemeRender,
} from "./theme_preview.js";

const firebaseConfig = {
  apiKey: "AIzaSyDf3QB-hQ1_RtwYTkgFPlJ5AGToSbCe6iw",
  authDomain: "cominote-2d016.firebaseapp.com",
  projectId: "cominote-2d016",
  storageBucket: "cominote-2d016.firebasestorage.app",
  messagingSenderId: "487871751138",
  appId: "1:487871751138:web:5d04f1f53b788890ab8fbb",
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);

const COMINOTE_CONFIG = window.COMINOTE_CONFIG || {};
const API_BASE = String(COMINOTE_CONFIG.apiBase || "").replace(/\/$/, "");
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_TEXT_CHARS = 25_000_000;
const JOB_POLL_MS = 1200;

const STATUS_STEPS = [
  {
    title: "Checking Input",
    text: "Verifying the selected theme and your uploaded content.",
  },
  {
    title: "Reading Content",
    text: "Extracting the main ideas from your text or PDF.",
  },
  {
    title: "Building Comic",
    text: "Creating the themed comic layout and story panels.",
  },
  {
    title: "Exporting PDF",
    text: "Preparing the final comic preview and PDF download.",
  },
];

const state = {
  currentComic: null,
  currentJobId: null,
  jobPollTimer: null,
  user: null,
  history: [],
  themes: [],
  selectedThemeSlug: "",
};

const els = {};

function apiUrl(path) {
  if (!path) return API_BASE || "";
  if (/^https?:\/\//i.test(path)) return path;
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
    "theme-select",
    "theme-hint",
    "theme-summary-card",
    "theme-name",
    "theme-character-stage",
    "theme-badge",
    "theme-character-image",
    "theme-sound-effect",
    "theme-character-name",
    "theme-character-description",
    "theme-preview",
    "theme-background-pill",
    "theme-elements-pill",
    "theme-visual-pill",
    "theme-subject-pill",
    "theme-style-pill",
    "theme-cast-pill",
    "theme-font-pill",
    "theme-layout-pill",
    "theme-size-pill",
    "notes-input",
    "notes-file",
    "char-count",
    "file-feedback",
    "generate-btn",
    "status-progress",
    "status-title",
    "status-text",
    "summary-panels",
    "summary-source",
    "summary-chunks",
    "comic-preview",
    "comic-image",
    "comic-title",
    "comic-caption",
    "preview-theme-stage",
    "preview-theme-image",
    "preview-theme-sound",
    "preview-placeholder-title",
    "preview-placeholder-text",
    "download-pdf",
    "history-list",
  ];

  ids.forEach((id) => {
    els[id] = document.getElementById(id);
  });

  els.statusSteps = Array.from(document.querySelectorAll(".status-step"));
  els.uploadCard = document.querySelector(".upload-card");
}

function showPage(id) {
  document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
  const target = document.getElementById(id);
  if (!target) return;
  target.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setAuthMessage(id, type, text) {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = text || "";
  node.className = "auth-message";
  if (type) node.classList.add(`is-${type}`);
}

function setStatus(index, phase = "idle") {
  els.statusSteps.forEach((step, stepIndex) => {
    step.classList.remove("is-idle", "is-active", "is-done", "is-error");

    if (phase === "error" && stepIndex === index) {
      step.classList.add("is-error");
      return;
    }

    if (phase === "done" || stepIndex < index) {
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

function stageToStep(stage, progress) {
  if (stage === "failed") return 3;
  if (stage === "completed") return STATUS_STEPS.length;
  if (stage === "queued" || stage === "starting" || stage === "collecting") return 0;
  if (stage === "reading") return progress >= 60 ? 2 : 1;
  if (stage === "rendering") return 3;
  return Math.min(STATUS_STEPS.length - 1, Math.floor(progress / 25));
}

function resetStatusBoard() {
  clearTimeout(state.jobPollTimer);
  state.jobPollTimer = null;
  state.currentJobId = null;
  els["status-progress"].style.width = "0%";
  els["status-title"].textContent = "Ready to begin";
  els["status-text"].textContent = "Choose a theme, add text or upload a file, and generate the comic PDF.";
  els["summary-panels"].textContent = "0";
  els["summary-source"].textContent = "Idle";
  els["summary-chunks"].textContent = "0";
  setStatus(-1);
}

function applyJobProgress({ stage = "queued", progress = 0, message = "", meta = {} }) {
  const safeProgress = Math.max(0, Math.min(Number(progress) || 0, 100));
  const stepIndex = stageToStep(stage, safeProgress);
  const fallbackStep =
    STATUS_STEPS[Math.min(STATUS_STEPS.length - 1, stepIndex)] || STATUS_STEPS[0];

  els["status-progress"].style.width = `${safeProgress}%`;
  els["status-title"].textContent = fallbackStep.title;

  if (meta?.chunk_count) {
    els["summary-chunks"].textContent = String(meta.chunk_count);
  }

  if (stage === "reading" && meta?.chunk_index && meta?.chunk_count) {
    els["status-text"].textContent = `Processing chunk ${meta.chunk_index} of ${meta.chunk_count}.`;
  } else {
    els["status-text"].textContent = message || fallbackStep.text;
  }

  if (stage === "completed") {
    setStatus(STATUS_STEPS.length, "done");
    return;
  }

  if (stage === "failed") {
    setStatus(stepIndex, "error");
    return;
  }

  setStatus(stepIndex, "active");
}

function animateNumber(element, targetValue, duration = 550) {
  if (!element) return;
  const start = Number.parseInt(element.textContent, 10) || 0;
  const end = Number.parseInt(targetValue, 10) || 0;
  if (start === end) return;

  const startTime = performance.now();
  const tick = (time) => {
    const progress = Math.min((time - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = String(Math.round(start + (end - start) * eased));
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function completeProgress(comic) {
  clearTimeout(state.jobPollTimer);
  state.jobPollTimer = null;
  els["status-progress"].style.width = "100%";
  els["status-title"].textContent = "Comic ready";
  els["status-text"].textContent = comic.summary;
  animateNumber(els["summary-panels"], comic.panel_count);
  animateNumber(els["summary-chunks"], comic.meta?.chunk_count || 0);
  els["summary-source"].textContent = comic.source_label;
  setStatus(STATUS_STEPS.length, "done");
}

function setStatusError(message) {
  clearTimeout(state.jobPollTimer);
  state.jobPollTimer = null;
  hideComicSkeleton();
  els["status-progress"].style.width = "100%";
  els["status-title"].textContent = "Could not generate comic";
  els["status-text"].textContent = message;
  setStatus(3, "error");
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value) || 0);
}

function currentTheme() {
  const slug = state.selectedThemeSlug || els["theme-select"]?.value || "";
  return state.themes.find((theme) => theme.slug === slug) || null;
}

function themeRenderFor(theme = null) {
  return normalizeThemeRender(theme?.theme_render || theme?.meta?.theme_render || DEFAULT_THEME_RENDER);
}

function primaryThemeCharacter(theme = null) {
  const render = themeRenderFor(theme);
  return render.featured_cast?.[0] || DEFAULT_THEME_RENDER.featured_cast[0];
}

function featuredCastNames(theme = null) {
  const render = themeRenderFor(theme);
  const names = (render.featured_cast || [])
    .map((item) => String(item?.name || "").trim())
    .filter(Boolean);
  return names.length ? names.join(" / ") : primaryThemeCharacter(theme).name;
}

function comicElementsLabel(theme = null) {
  const render = themeRenderFor(theme);
  return (render.comic_elements || []).slice(0, 3).join(", ") || "Comic energy";
}

function setThemeImage(element, theme = null, options = {}) {
  if (!element) return;
  const render = themeRenderFor(theme);
  const primary = primaryThemeCharacter(theme);
  element.onerror = () => {
    if (element.dataset.previewFallback === "1") return;
    element.dataset.previewFallback = "1";
    element.src = buildThemePreviewDataUri(DEFAULT_THEME_RENDER, options);
    element.alt = "Theme preview placeholder";
  };
  element.dataset.previewFallback = "0";
  element.src = buildThemePreviewDataUri(render, options);
  element.alt = `${primary.name} preview`;
  element.dataset.themeKey = render.id || "theme-preview";
}

function renderThemeStage(theme = null) {
  const render = themeRenderFor(theme);
  const primary = primaryThemeCharacter(theme);
  const backgroundName = render.featured_background?.name || "Comic World";
  const stage = els["theme-character-stage"];
  if (stage) {
    stage.dataset.themeProfile = render.theme_profile || theme?.theme_profile || "default";
  }

  if (!theme) {
    els["theme-badge"].textContent = "Comic Preview";
    els["theme-sound-effect"].textContent = "POP!";
    els["theme-character-name"].textContent = "Theme Explorer";
    els["theme-character-description"].textContent =
      "Choose a theme to see its featured hero, scene styling, and comic energy.";
    els["theme-background-pill"].textContent = "🌆 Background: --";
    els["theme-elements-pill"].textContent = "💥 Elements: --";
    setThemeImage(els["theme-character-image"], null, { width: 360, height: 360 });
    return;
  }

  els["theme-badge"].textContent = render.badge_text || "Comic Preview";
  els["theme-sound-effect"].textContent = render.sound_effect || "POP!";
  els["theme-character-name"].textContent = featuredCastNames(theme);
  els["theme-character-description"].textContent =
    primary.description || `${primary.name} leads this ${theme.title} comic setup.`;
  els["theme-background-pill"].textContent = `🌆 Background: ${backgroundName}`;
  els["theme-elements-pill"].textContent = `💥 Elements: ${comicElementsLabel(theme)}`;
  setThemeImage(els["theme-character-image"], theme, { width: 360, height: 360 });
}

function renderThemeSummary(theme = null) {
  const card = els["theme-summary-card"];
  if (!card) return;
  const render = themeRenderFor(theme);

  if (!theme) {
    card.classList.add("empty");
    card.dataset.themeProfile = "default";
    els["theme-name"].textContent = "No theme selected";
    els["theme-preview"].textContent =
      "Pick one theme first. Then paste text or upload a PDF, DOCX, or TXT file to generate the comic PDF.";
    els["theme-visual-pill"].textContent = "Visual Theme: --";
    els["theme-subject-pill"].textContent = "Topic: --";
    els["theme-style-pill"].textContent = "Style: --";
    els["theme-cast-pill"].textContent = "Characters: --";
    els["theme-font-pill"].textContent = "Fonts: --";
    els["theme-layout-pill"].textContent = "Panels: --";
    els["theme-size-pill"].textContent = "Story Pool: --";
    renderThemeStage(null);
    return;
  }

  card.classList.remove("empty");
  card.dataset.themeProfile = render.theme_profile || theme.theme_profile || "default";
  els["theme-name"].textContent = theme.title;
  els["theme-preview"].textContent = render.headline || theme.preview;
  els["theme-visual-pill"].textContent = `Visual Theme: ${theme.theme_profile_label || "--"}`;
  els["theme-subject-pill"].textContent = `Topic: ${theme.subject}`;
  els["theme-style-pill"].textContent = `Style: ${theme.recommended_style_label}`;
  els["theme-cast-pill"].textContent = `Characters: ${featuredCastNames(theme)}`;
  els["theme-font-pill"].textContent = `Fonts: ${theme.font_label || "--"}`;
  els["theme-layout-pill"].textContent = `Panels: ${theme.layout_label || "--"}`;
  els["theme-size-pill"].textContent = `Story Pool: ${formatNumber(theme.word_count)} words`;
  renderThemeStage(theme);
}

function applyThemeVisualState(theme = null) {
  const render = themeRenderFor(theme);
  const profile = render.theme_profile || theme?.theme_profile || "default";
  document.body.dataset.themeProfile = profile;

  const summary = els["theme-summary-card"];
  if (summary) {
    summary.dataset.themeProfile = profile;
  }

  const preview = els["comic-preview"];
  if (preview) {
    preview.dataset.themeProfile = profile;
  }

  const themeStage = els["theme-character-stage"];
  if (themeStage) {
    themeStage.dataset.themeProfile = profile;
  }

  const previewStage = els["preview-theme-stage"];
  if (previewStage) {
    previewStage.dataset.themeProfile = profile;
  }

  document.body.style.setProperty(
    "--theme-display-font",
    theme?.ui_display_font || "\"Bangers\", cursive"
  );
  document.body.style.setProperty(
    "--theme-body-font",
    theme?.ui_body_font || "\"Comic Neue\", cursive"
  );
  document.body.style.setProperty("--theme-accent", render.ui?.accent || theme?.theme_accent || "#f4631e");
  document.body.style.setProperty("--theme-accent-2", render.ui?.accent_2 || "#e63946");
  document.body.style.setProperty("--theme-accent-3", render.ui?.accent_3 || "#1e6fd9");
  document.body.style.setProperty("--theme-surface", render.ui?.surface || theme?.theme_surface || "#ffffff");
  document.body.style.setProperty("--theme-bg-start", render.ui?.bg_start || "#fff2b2");
  document.body.style.setProperty("--theme-bg-end", render.ui?.bg_end || "#fef8df");
  document.body.style.setProperty("--theme-glow", render.ui?.glow || "rgba(244, 99, 30, 0.18)");
}

function populateThemeSelect() {
  const select = els["theme-select"];
  const selectedSlug = state.selectedThemeSlug || select.value;

  select.innerHTML = `
    <option value="">Choose a theme</option>
    ${state.themes
      .map(
        (theme) =>
          `<option value="${escapeHtml(theme.slug)}">${escapeHtml(theme.title)}</option>`
      )
      .join("")}
  `;

  if (selectedSlug && state.themes.some((theme) => theme.slug === selectedSlug)) {
    select.value = selectedSlug;
    state.selectedThemeSlug = selectedSlug;
  } else {
    state.selectedThemeSlug = "";
  }

  if (!state.themes.length) {
    els["theme-hint"].textContent = "No themes were found in the JSON folder.";
    return;
  }

  els["theme-hint"].textContent = `${formatNumber(state.themes.length)} themes available in your theme library.`;
}

function maybeAutofillTitle(theme) {
  const currentTitle = els["project-title"].value.trim();
  const looksAutoGenerated =
    !currentTitle ||
    currentTitle.toLowerCase().endsWith("comic") ||
    currentTitle.toLowerCase().endsWith("comic pdf") ||
    currentTitle.toLowerCase().endsWith("comic project");

  if (theme && looksAutoGenerated) {
    els["project-title"].value = `${theme.title} Comic`;
  }
}

function renderPlaceholderPreview(theme = null, options = {}) {
  const placeholderTitle = els["preview-placeholder-title"];
  const placeholderText = els["preview-placeholder-text"];
  const previewStage = els["preview-theme-stage"];
  const previewSound = els["preview-theme-sound"];
  const previewImage = els["preview-theme-image"];
  const preview = els["comic-preview"];
  const render = themeRenderFor(theme);
  const primary = primaryThemeCharacter(theme);

  if (preview) {
    preview.dataset.themeProfile = render.theme_profile || theme?.theme_profile || "default";
  }

  if (!theme) {
    if (previewStage) previewStage.classList.add("is-hidden");
    if (placeholderTitle) placeholderTitle.textContent = "No comic yet";
    if (placeholderText) {
      placeholderText.textContent = "Your comic will appear here after it is ready.";
    }
    return;
  }

  if (previewStage) previewStage.classList.remove("is-hidden");
  if (previewSound) {
    previewSound.textContent = render.sound_effect || "POP!";
  }
  setThemeImage(previewImage, theme, {
    width: options.compact ? 300 : 420,
    height: options.compact ? 300 : 340,
    compact: true,
  });
  if (placeholderTitle) {
    placeholderTitle.textContent = `Previewing ${primary.name}`;
  }
  if (placeholderText) {
    placeholderText.textContent =
      `${theme.title} is ready with ${featuredCastNames(theme)}. Generate the comic to replace this live preview with your full themed strip.`;
  }
}

function syncThemeState(theme = null, options = {}) {
  renderThemeSummary(theme);
  applyThemeVisualState(theme);
  if (options.autofillTitle !== false) {
    maybeAutofillTitle(theme);
  }
  if (!state.currentComic) {
    renderPlaceholderPreview(theme, { compact: true });
  }
}

function setSelectedTheme(slug = "", options = {}) {
  state.selectedThemeSlug = slug || "";
  if (els["theme-select"] && els["theme-select"].value !== state.selectedThemeSlug) {
    els["theme-select"].value = state.selectedThemeSlug;
  }

  const theme = currentTheme();
  const activeComicTheme = state.currentComic?.meta?.theme_slug || "";
  const shouldResetOutput =
    options.resetOutput !== false &&
    state.currentComic &&
    state.selectedThemeSlug !== activeComicTheme;

  if (shouldResetOutput) {
    resetOutput();
  }

  syncThemeState(theme, { autofillTitle: options.autofillTitle !== false });
  return theme;
}

function applyThemeSelection() {
  setSelectedTheme(els["theme-select"]?.value || "", { resetOutput: true, autofillTitle: true });
}

async function loadThemes() {
  try {
    const response = await fetch(apiUrl("/api/themes"));
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not load themes.");
    }
    state.themes = (Array.isArray(payload.themes) ? payload.themes : []).sort((a, b) =>
      String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity: "base" })
    );
    populateThemeSelect();
    syncThemeState(currentTheme(), { autofillTitle: false });
  } catch (error) {
    state.themes = [];
    populateThemeSelect();
    syncThemeState(null, { autofillTitle: false });
    els["theme-hint"].textContent = error.message || "Could not load themes.";
  }
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
    theme_title: comic.meta?.theme_title || "",
    preview_url: comic.image_url,
    created_at: comic.created_at,
    summary: comic.summary,
  };

  state.history = [entry, ...state.history.filter((item) => item.comic_id !== comic.comic_id)].slice(0, 10);
  localStorage.setItem(historyKey(), JSON.stringify(state.history));
  renderHistory();
}

function renderHistory() {
  const container = els["history-list"];
  if (!container) return;

  if (!state.history.length) {
    container.className = "history-list empty-state";
    container.innerHTML = "<p>Your recent comic PDFs will appear here.</p>";
    return;
  }

  container.className = "history-list";
  container.innerHTML = state.history
    .map(
      (item) => `
        <article class="history-entry">
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.theme_title || "Theme comic")} • ${new Date(
            item.created_at
          ).toLocaleString()}</p>
          <small>${escapeHtml(item.summary)}</small>
          <button class="btn-outline" type="button" onclick="openHistoryComic('${item.comic_id}')">Open Result</button>
        </article>
      `
    )
    .join("");
}

function showComicSkeleton() {
  const preview = els["comic-preview"];
  if (!preview) return;
  preview.classList.remove("empty");
  preview.classList.add("loading-skeleton");
  if (els["comic-image"]) {
    els["comic-image"].style.display = "none";
  }
}

function hideComicSkeleton() {
  const preview = els["comic-preview"];
  if (!preview) return;
  preview.classList.remove("loading-skeleton");
  if (els["comic-image"]) {
    els["comic-image"].style.display = "";
  }
}

function renderComic(comic) {
  state.currentComic = comic;
  hideComicSkeleton();

  const preview = els["comic-preview"];
  preview.classList.remove("empty");
  renderPlaceholderPreview(null);

  const oldImg = els["comic-image"];
  const newImg = oldImg.cloneNode(false);
  newImg.id = "comic-image";
  newImg.alt = "Generated Cominote comic preview";
  oldImg.replaceWith(newImg);
  els["comic-image"] = newImg;

  const resultTheme =
    state.themes.find((theme) => theme.slug === comic.meta?.theme_slug) ||
    state.themes.find((theme) => theme.title === comic.meta?.theme_title) ||
    (comic.meta?.theme_render || comic.meta?.theme_profile
      ? {
          slug: comic.meta?.theme_slug || "",
          title: comic.meta?.theme_title || comic.title || "Theme Preview",
          theme_profile: comic.meta?.theme_profile || comic.meta?.theme_render?.theme_profile || "default",
          theme_render: comic.meta?.theme_render || DEFAULT_THEME_RENDER,
          ui_display_font: "\"Bangers\", cursive",
          ui_body_font: "\"Comic Neue\", cursive",
        }
      : null);

  if (comic.meta?.theme_slug) {
    state.selectedThemeSlug = comic.meta.theme_slug;
    if (els["theme-select"] && els["theme-select"].value !== comic.meta.theme_slug) {
      els["theme-select"].value = comic.meta.theme_slug;
    }
  }

  syncThemeState(resultTheme, { autofillTitle: false });

  newImg.addEventListener(
    "error",
    () => {
      state.currentComic = null;
      preview.classList.add("empty");
      renderPlaceholderPreview(resultTheme || currentTheme(), { compact: true });
      els["comic-title"].textContent = "Comic preview unavailable";
      els["comic-caption"].textContent =
        "The generated image could not be loaded, so the live theme preview is shown instead. You can still retry generation or use the PDF download if available.";
      els["download-pdf"].disabled = !comic.downloads?.pdf;
    },
    { once: true }
  );
  newImg.src = `${apiUrl(comic.image_url)}?v=${encodeURIComponent(comic.comic_id)}`;

  els["comic-title"].textContent = comic.title;
  const themeLabel = comic.meta?.theme_title
    ? `${comic.meta.theme_title} • ${comic.meta?.theme_profile_label || comic.subject}`
    : comic.meta?.theme_profile_label || comic.subject;
  els["comic-caption"].textContent = `${themeLabel} • ${comic.panel_count} panels • PDF ready for download`;
  els["download-pdf"].disabled = false;
}

function resetOutput() {
  state.currentComic = null;
  hideComicSkeleton();
  els["comic-preview"].classList.add("empty");
  els["comic-image"].removeAttribute("src");
  renderPlaceholderPreview(currentTheme(), { compact: true });
  const theme = currentTheme();
  const primary = primaryThemeCharacter(theme);
  els["comic-title"].textContent = theme ? `${primary.name} is ready` : "Waiting for your first comic";
  els["comic-caption"].textContent = theme
    ? `${theme.title} preview loaded. Generate the full comic PDF to replace this panel.`
    : "Your generated comic preview and PDF download will appear here.";
  els["download-pdf"].disabled = true;
}

function syncUser(user) {
  state.user = user;
  if (!user) {
    els["dash-username"].textContent = "Comic Learner";
    els["dash-email"].textContent = "Sign in to load your workspace";
    els["user-avatar"].textContent = "CN";
    state.history = [];
    renderHistory();
    return;
  }

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
}

function ensureAuth() {
  if (state.user) return true;
  showPage("pg-login");
  setAuthMessage("login-msg", "error", "Please log in before generating a comic.");
  return false;
}

function updateCharCount() {
  const count = els["notes-input"].value.length;
  const ratio = count / MAX_TEXT_CHARS;
  els["char-count"].textContent = `${formatNumber(count)} / ${formatNumber(MAX_TEXT_CHARS)} characters`;
  els["char-count"].style.color = ratio > 0.9 ? "#e63946" : ratio > 0.6 ? "#f4631e" : "#555";
}

function updateUploadCardState(hasFile) {
  if (els.uploadCard) {
    els.uploadCard.classList.toggle("has-file", hasFile);
  }
}

function handleFileSelection() {
  const file = els["notes-file"].files?.[0];
  if (!file) {
    updateUploadCardState(false);
    els["file-feedback"].textContent = "No file selected yet.";
    return;
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    els["notes-file"].value = "";
    updateUploadCardState(false);
    els["file-feedback"].textContent = "Please choose a file smaller than 50 MB.";
    return;
  }

  updateUploadCardState(true);
  const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
  els["file-feedback"].textContent = `${file.name} selected • ${sizeMb} MB`;
}

function clearComposer() {
  els["project-title"].value = "";
  state.selectedThemeSlug = "";
  populateThemeSelect();
  els["notes-input"].value = "";
  els["notes-file"].value = "";
  els["file-feedback"].textContent = "No file selected yet.";
  updateUploadCardState(false);
  updateCharCount();
  resetStatusBoard();
  resetOutput();
  syncThemeState(null, { autofillTitle: false });
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
  clearComposer();
  showPage("pg-home");
}

function buildDefaultTitle(theme) {
  return theme ? `${theme.title} Comic` : "Cominote Comic";
}

async function generateComic() {
  if (!ensureAuth()) return;

  const theme = currentTheme();
  const text = els["notes-input"].value.trim();
  const file = els["notes-file"].files?.[0];

  if (!theme) {
    setStatusError("Please choose a theme before generating the comic PDF.");
    return;
  }

  if (!text && !file) {
    setStatusError("Please paste text or upload a file before generating the comic PDF.");
    return;
  }

  if (text.length > MAX_TEXT_CHARS) {
    setStatusError("Please keep pasted text under 25 million characters.");
    return;
  }

  if (file && file.size > MAX_UPLOAD_BYTES) {
    setStatusError("Please choose a file smaller than 50 MB.");
    return;
  }

  const title = els["project-title"].value.trim() || buildDefaultTitle(theme);

  els["generate-btn"].disabled = true;
  els["generate-btn"].textContent = "GENERATING...";
  resetStatusBoard();
  resetOutput();
  showComicSkeleton();
  applyJobProgress({
    stage: "starting",
    progress: 8,
    message: "Uploading your content and preparing the themed comic PDF.",
  });

  try {
    const formData = new FormData();
    formData.append("title", title);
    formData.append("text", text);
    formData.append("theme_slug", theme.slug);
    formData.append("user_id", state.user.uid);
    formData.append("user_name", state.user.displayName || "");
    formData.append("async", "1");
    if (file) formData.append("file", file);

    const response = await fetch(apiUrl("/api/generate"), {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Comic generation failed.");
    }

    if (response.status === 202 && payload.job_id) {
      state.currentJobId = payload.job_id;
      await pollJobUntilComplete(payload.job_id, payload);
      return;
    }

    completeProgress(payload);
    renderComic(payload);
    persistHistoryEntry(payload);
  } catch (error) {
    setStatusError(error.message || "Comic generation failed.");
  } finally {
    els["generate-btn"].disabled = false;
    els["generate-btn"].textContent = "GENERATE COMIC PDF";
    hideComicSkeleton();
  }
}

async function pollJobUntilComplete(jobId, initialPayload = null) {
  if (initialPayload) {
    applyJobProgress({
      stage: initialPayload.stage || "queued",
      progress: initialPayload.progress || 4,
      message: initialPayload.message || "Your comic is in the queue.",
    });
  }

  while (true) {
    const response = await fetch(apiUrl(`/api/jobs/${encodeURIComponent(jobId)}`));
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Could not load generation progress.");
    }

    applyJobProgress(payload);

    if (payload.status === "completed" && payload.result) {
      completeProgress(payload.result);
      renderComic(payload.result);
      persistHistoryEntry(payload.result);
      return;
    }

    if (payload.status === "failed") {
      throw new Error(payload.error || payload.message || "Comic generation failed.");
    }

    await new Promise((resolve) => {
      state.jobPollTimer = window.setTimeout(resolve, JOB_POLL_MS);
    });
  }
}

function downloadComic(format) {
  if (!state.currentComic) return;
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

function setupDropzone() {
  const zone = els.uploadCard;
  if (!zone) return;

  const activate = () => zone.classList.add("is-dragging");
  const deactivate = () => zone.classList.remove("is-dragging");

  ["dragenter", "dragover"].forEach((eventName) => {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      activate();
    });
  });

  ["dragleave", "dragend", "drop"].forEach((eventName) => {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      deactivate();
    });
  });

  zone.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    els["notes-file"].files = transfer.files;
    handleFileSelection();
  });
}

function setupEvents() {
  els["notes-input"].addEventListener("input", updateCharCount);
  els["notes-file"].addEventListener("change", handleFileSelection);
  els["theme-select"].addEventListener("change", applyThemeSelection);
  updateCharCount();
  resetStatusBoard();
  state.selectedThemeSlug = els["theme-select"]?.value || "";
  resetOutput();
  syncThemeState(currentTheme(), { autofillTitle: false });
  setupDropzone();
}

window.showPage = showPage;
window.doSignup = doSignup;
window.doLogin = doLogin;
window.doLogout = doLogout;
window.generateComic = generateComic;
window.downloadComic = downloadComic;
window.clearComposer = clearComposer;
window.openHistoryComic = openHistoryComic;

cacheEls();
setupEvents();
loadThemes();

onAuthStateChanged(auth, (user) => {
  syncUser(user);
  if (user) {
    showPage("pg-dash");
    setAuthMessage("login-msg", null, "");
    setAuthMessage("signup-msg", null, "");
  }
});

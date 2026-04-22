const COLOR_RE = /^#[0-9a-f]{6}$/i;

export const DEFAULT_THEME_RENDER = {
  id: "theme-explorer",
  label: "Theme Explorer",
  badge_text: "Comic Preview",
  headline: "Select a theme to load its featured hero, scene, and comic effects.",
  sound_effect: "POP!",
  theme_profile: "cartoon_kids",
  comic_elements: ["halftone dots", "speech bubbles", "caption boxes"],
  ui: {
    accent: "#f4631e",
    accent_2: "#ffd93d",
    accent_3: "#1e6fd9",
    surface: "#fffaf0",
    bg_start: "#fff3b8",
    bg_end: "#fff8e5",
    glow: "rgba(244, 99, 30, 0.2)",
  },
  featured_cast: [
    {
      name: "Theme Explorer",
      description: "A bright placeholder hero keeps the dashboard stable when a theme has no mapped signature yet.",
      variant: "explorer",
      category: "student",
      palette: {
        hair: "#47311f",
        skin: "#efc39b",
        costume_primary: "#f4631e",
        costume_accent: "#ffd93d",
        eye: "#1e6fd9",
      },
      costume: {
        top: "comic explorer jacket",
        bottom: "dashboard-ready adventure pants",
        accessory: "story compass",
        shoes: "comic sneakers",
      },
      tags: ["placeholder", "comic", "explorer", "dashboard"],
    },
  ],
  featured_background: {
    name: "Comic Studio",
    description: "A warm yellow studio filled with panels, dots, and speech bubbles.",
    category: "studio",
  },
};

const VARIANT_GROUPS = {
  creature: new Set(["electric-mascot", "lion", "alien", "mythic-monkey"]),
  robot: new Set(["robot"]),
  spirit: new Set(["ai-spirit"]),
};

function safeColor(value, fallback) {
  return COLOR_RE.test(String(value || "")) ? String(value) : fallback;
}

function merge(base, override) {
  const result = { ...base };
  Object.entries(override || {}).forEach(([key, value]) => {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key])
    ) {
      result[key] = merge(result[key], value);
      return;
    }
    result[key] = value;
  });
  return result;
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function shortText(value, max = 20) {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function primaryCharacter(themeRender) {
  return (themeRender.featured_cast || [])[0] || DEFAULT_THEME_RENDER.featured_cast[0];
}

function secondaryCharacter(themeRender) {
  return (themeRender.featured_cast || [])[1] || null;
}

function halftoneDots(width, height, accent) {
  const dots = [];
  for (let y = 30; y < height - 20; y += 24) {
    for (let x = 20; x < width - 20; x += 24) {
      const opacity = ((x + y) % 3 === 0) ? 0.15 : 0.08;
      dots.push(
        `<circle cx="${x}" cy="${y}" r="2.2" fill="${accent}" opacity="${opacity}"></circle>`
      );
    }
  }
  return dots.join("");
}

function drawStageDecor(themeRender, width, height, compact) {
  const accent = safeColor(themeRender.ui.accent, DEFAULT_THEME_RENDER.ui.accent);
  const accent2 = safeColor(themeRender.ui.accent_2, DEFAULT_THEME_RENDER.ui.accent_2);
  const accent3 = safeColor(themeRender.ui.accent_3, DEFAULT_THEME_RENDER.ui.accent_3);
  const frameInset = compact ? 12 : 14;
  return `
    <rect x="${frameInset}" y="${frameInset}" width="${width - frameInset * 2}" height="${height - frameInset * 2}" rx="24" fill="rgba(255,255,255,0.32)" stroke="${accent}" stroke-width="4"></rect>
    <path d="M24 ${height - 64} C 90 ${height - 98}, 154 ${height - 96}, ${width - 28} ${height - 58} L ${width - 28} ${height - 22} L 24 ${height - 22} Z" fill="${accent3}" opacity="0.26"></path>
    <path d="M28 ${height - 44} C 110 ${height - 76}, ${width - 140} ${height - 70}, ${width - 36} ${height - 38}" fill="none" stroke="${accent2}" stroke-width="12" stroke-linecap="round" opacity="0.34"></path>
    <path d="M28 52 C 96 18, 160 22, ${width - 34} 50" fill="none" stroke="${accent}" stroke-width="10" stroke-linecap="round" opacity="0.24"></path>
    ${halftoneDots(width, height, accent2)}
  `;
}

function drawHeroCaption(character, width) {
  return `
    <g transform="translate(${width - 134}, 26)">
      <rect width="108" height="36" rx="18" fill="#ffffff" opacity="0.88"></rect>
      <text x="54" y="23" text-anchor="middle" fill="#1a1a1a" font-size="15" font-weight="800" font-family="Arial, sans-serif">${escapeXml(shortText(character.name, 12))}</text>
    </g>
  `;
}

function drawSupportBadge(themeRender, width, compact) {
  const element = (themeRender.comic_elements || [])[0] || "comic energy";
  return `
    <g transform="translate(22, ${compact ? 24 : 28})">
      <rect width="${compact ? 138 : 156}" height="34" rx="17" fill="#ffffff" opacity="0.9"></rect>
      <text x="${compact ? 69 : 78}" y="22" text-anchor="middle" fill="#1a1a1a" font-size="${compact ? 13 : 14}" font-weight="800" font-family="Arial, sans-serif">${escapeXml(shortText(element, compact ? 16 : 18))}</text>
    </g>
  `;
}

function drawCharacterBody(character, scale = 1, secondary = false) {
  const palette = character.palette || {};
  const hair = safeColor(palette.hair, "#47311f");
  const skin = safeColor(palette.skin, "#efc39b");
  const suit = safeColor(palette.costume_primary, "#f4631e");
  const accent = safeColor(palette.costume_accent, "#ffd93d");
  const eye = safeColor(palette.eye, "#1e6fd9");
  const opacity = secondary ? 0.92 : 1;

  return {
    hair,
    skin,
    suit,
    accent,
    eye,
    opacity,
    s: scale,
  };
}

function drawProp(variant, colors, secondary = false) {
  const stroke = secondary ? 6 : 8;
  switch (variant) {
    case "electric-mascot":
      return `<path d="M118 226 L145 180 L135 180 L160 142 L149 170 L164 170 Z" fill="${colors.accent}" stroke="#1a1a1a" stroke-width="5"></path>`;
    case "web-hero":
      return `<path d="M146 236 Q 178 190, 210 148" fill="none" stroke="#ffffff" stroke-width="${stroke}" stroke-linecap="round"></path>`;
    case "tech-armor":
      return `<circle cx="152" cy="186" r="${secondary ? 12 : 15}" fill="${colors.accent}" stroke="#ffffff" stroke-width="4"></circle>`;
    case "ninja-hero":
      return `<path d="M110 172 Q 150 152, 194 172" fill="none" stroke="${colors.accent}" stroke-width="${stroke}" stroke-linecap="round"></path>`;
    case "dark-knight":
      return `<path d="M98 132 L118 92 L138 132" fill="${colors.hair}" opacity="0.95"></path><path d="M166 132 L186 92 L206 132" fill="${colors.hair}" opacity="0.95"></path>`;
    case "saiyan-warrior":
      return `<path d="M124 96 L140 56 L156 96 M148 88 L170 42 L190 94 M104 98 L120 56 L134 102" fill="none" stroke="${colors.hair}" stroke-width="10" stroke-linecap="round"></path>`;
    case "pirate-hero":
      return `<ellipse cx="150" cy="96" rx="54" ry="16" fill="${colors.accent}" stroke="#1a1a1a" stroke-width="5"></ellipse><rect x="108" y="94" width="84" height="18" rx="9" fill="${colors.accent}" stroke="#1a1a1a" stroke-width="5"></rect>`;
    case "astronaut":
      return `<ellipse cx="150" cy="104" rx="54" ry="56" fill="rgba(255,255,255,0.2)" stroke="#ffffff" stroke-width="6"></ellipse>`;
    case "alien":
      return `<circle cx="126" cy="96" r="12" fill="${colors.accent}"></circle><circle cx="174" cy="96" r="12" fill="${colors.accent}"></circle>`;
    case "pirate-captain":
      return `<path d="M88 104 Q 150 48, 212 104 L198 118 Q 150 86, 102 118 Z" fill="${colors.suit}" stroke="#1a1a1a" stroke-width="5"></path>`;
    case "lion":
      return `<circle cx="150" cy="110" r="64" fill="${colors.accent}" opacity="0.8"></circle>`;
    case "robot":
      return `<rect x="104" y="68" width="92" height="72" rx="20" fill="${colors.suit}" stroke="#1a1a1a" stroke-width="6"></rect>`;
    case "ai-spirit":
      return `<circle cx="150" cy="150" r="72" fill="${colors.suit}" opacity="0.22"></circle>`;
    case "wonder-heroine":
      return `<path d="M122 82 Q 150 54, 178 82" fill="none" stroke="${colors.accent}" stroke-width="${stroke}" stroke-linecap="round"></path>`;
    case "spy-agent":
      return `<path d="M124 168 L150 202 L176 168" fill="${colors.accent}" opacity="0.95"></path>`;
    case "mystic-hero":
      return `<circle cx="150" cy="152" r="78" fill="none" stroke="${colors.accent}" stroke-width="8" opacity="0.45"></circle>`;
    case "mythic-monkey":
      return `<path d="M216 222 Q 252 188, 216 150" fill="none" stroke="${colors.accent}" stroke-width="10" stroke-linecap="round"></path>`;
    case "fantasy-ranger":
      return `<path d="M94 120 Q 150 66, 206 120" fill="none" stroke="${colors.accent}" stroke-width="${stroke}" stroke-linecap="round"></path>`;
    case "hero-guardian":
      return `<path d="M150 188 L174 198 L166 228 L134 228 L126 198 Z" fill="${colors.accent}" stroke="#ffffff" stroke-width="4"></path>`;
    case "manga-hero":
      return `<path d="M98 84 L124 62 L150 88 L176 58 L202 84" fill="none" stroke="${colors.hair}" stroke-width="9" stroke-linecap="round"></path>`;
    default:
      return "";
  }
}

function drawHumanCharacter(character, scale = 1, secondary = false) {
  const c = drawCharacterBody(character, scale, secondary);
  const variant = String(character.variant || "").toLowerCase();
  const torsoTop = secondary ? 166 : 172;
  const torsoWidth = secondary ? 76 : 90;
  const torsoLeft = 150 - torsoWidth / 2;
  const armY = secondary ? 192 : 198;
  const legTop = secondary ? 244 : 250;
  const headScale = secondary ? 44 : 52;

  return `
    <g opacity="${c.opacity}">
      ${drawProp(variant, c, secondary)}
      <ellipse cx="150" cy="112" rx="${headScale}" ry="${secondary ? 48 : 56}" fill="${c.skin}" stroke="#1a1a1a" stroke-width="5"></ellipse>
      <path d="M102 110 Q 120 46, 150 48 Q 182 48, 198 112 Q 180 92, 150 90 Q 122 90, 102 110 Z" fill="${c.hair}"></path>
      <rect x="${torsoLeft}" y="${torsoTop}" width="${torsoWidth}" height="${secondary ? 94 : 104}" rx="22" fill="${c.suit}" stroke="#1a1a1a" stroke-width="5"></rect>
      <rect x="${torsoLeft + 18}" y="${torsoTop + 18}" width="${torsoWidth - 36}" height="${secondary ? 18 : 20}" rx="10" fill="${c.accent}" opacity="0.88"></rect>
      <path d="M${torsoLeft + 2} ${armY} Q ${torsoLeft - 30} ${armY + 12}, ${torsoLeft - 12} ${armY + 54}" fill="none" stroke="${c.suit}" stroke-width="20" stroke-linecap="round"></path>
      <path d="M${torsoLeft + torsoWidth - 2} ${armY} Q ${torsoLeft + torsoWidth + 30} ${armY + 12}, ${torsoLeft + torsoWidth + 12} ${armY + 54}" fill="none" stroke="${c.suit}" stroke-width="20" stroke-linecap="round"></path>
      <path d="M${torsoLeft + 26} ${legTop} Q ${torsoLeft + 20} ${legTop + 44}, ${torsoLeft + 20} ${legTop + 92}" fill="none" stroke="${c.accent}" stroke-width="22" stroke-linecap="round"></path>
      <path d="M${torsoLeft + torsoWidth - 26} ${legTop} Q ${torsoLeft + torsoWidth - 20} ${legTop + 44}, ${torsoLeft + torsoWidth - 20} ${legTop + 92}" fill="none" stroke="${c.accent}" stroke-width="22" stroke-linecap="round"></path>
      <circle cx="${secondary ? 134 : 130}" cy="${secondary ? 112 : 114}" r="${secondary ? 6 : 7}" fill="#ffffff"></circle>
      <circle cx="${secondary ? 166 : 170}" cy="${secondary ? 112 : 114}" r="${secondary ? 6 : 7}" fill="#ffffff"></circle>
      <circle cx="${secondary ? 134 : 130}" cy="${secondary ? 112 : 114}" r="${secondary ? 2.4 : 3}" fill="${c.eye}"></circle>
      <circle cx="${secondary ? 166 : 170}" cy="${secondary ? 112 : 114}" r="${secondary ? 2.4 : 3}" fill="${c.eye}"></circle>
      <path d="M134 142 Q 150 154, 166 142" fill="none" stroke="#1a1a1a" stroke-width="5" stroke-linecap="round"></path>
    </g>
  `;
}

function drawMascotCharacter(character, scale = 1, secondary = false) {
  const c = drawCharacterBody(character, scale, secondary);
  const variant = String(character.variant || "").toLowerCase();
  const bodyY = secondary ? 198 : 210;
  const headY = secondary ? 114 : 124;
  const mainBody = variant === "lion" ? 78 : 70;
  const bodyFill = variant === "alien" ? c.skin : c.suit;

  return `
    <g opacity="${c.opacity}">
      ${drawProp(variant, c, secondary)}
      <ellipse cx="150" cy="${headY}" rx="${secondary ? 52 : 62}" ry="${secondary ? 50 : 58}" fill="${bodyFill}" stroke="#1a1a1a" stroke-width="5"></ellipse>
      <ellipse cx="150" cy="${bodyY}" rx="${secondary ? 58 : mainBody}" ry="${secondary ? 52 : 62}" fill="${c.suit}" stroke="#1a1a1a" stroke-width="5"></ellipse>
      <circle cx="${secondary ? 128 : 124}" cy="${headY - 6}" r="${secondary ? 7 : 9}" fill="#ffffff"></circle>
      <circle cx="${secondary ? 172 : 176}" cy="${headY - 6}" r="${secondary ? 7 : 9}" fill="#ffffff"></circle>
      <circle cx="${secondary ? 128 : 124}" cy="${headY - 6}" r="${secondary ? 3 : 4}" fill="${c.eye}"></circle>
      <circle cx="${secondary ? 172 : 176}" cy="${headY - 6}" r="${secondary ? 3 : 4}" fill="${c.eye}"></circle>
      <path d="M136 ${headY + 20} Q 150 ${headY + 28}, 164 ${headY + 20}" fill="none" stroke="#1a1a1a" stroke-width="5" stroke-linecap="round"></path>
      <path d="M104 ${bodyY + 42} Q 90 ${bodyY + 78}, 106 ${bodyY + 102}" fill="none" stroke="${c.accent}" stroke-width="20" stroke-linecap="round"></path>
      <path d="M196 ${bodyY + 42} Q 210 ${bodyY + 78}, 194 ${bodyY + 102}" fill="none" stroke="${c.accent}" stroke-width="20" stroke-linecap="round"></path>
    </g>
  `;
}

function drawRobotCharacter(character, scale = 1, secondary = false) {
  const c = drawCharacterBody(character, scale, secondary);
  return `
    <g opacity="${c.opacity}">
      ${drawProp("robot", c, secondary)}
      <rect x="104" y="82" width="92" height="78" rx="24" fill="${c.suit}" stroke="#1a1a1a" stroke-width="6"></rect>
      <rect x="118" y="98" width="64" height="30" rx="14" fill="#111827" opacity="0.88"></rect>
      <circle cx="136" cy="113" r="7" fill="${c.eye}"></circle>
      <circle cx="164" cy="113" r="7" fill="${c.eye}"></circle>
      <rect x="116" y="178" width="68" height="90" rx="22" fill="${c.accent}" stroke="#1a1a1a" stroke-width="6"></rect>
      <path d="M124 192 L176 192" stroke="#ffffff" stroke-width="6" stroke-linecap="round"></path>
      <path d="M116 200 Q 82 216, 94 254" fill="none" stroke="${c.suit}" stroke-width="18" stroke-linecap="round"></path>
      <path d="M184 200 Q 218 216, 206 254" fill="none" stroke="${c.suit}" stroke-width="18" stroke-linecap="round"></path>
      <path d="M132 268 Q 126 314, 126 330" fill="none" stroke="${c.suit}" stroke-width="18" stroke-linecap="round"></path>
      <path d="M168 268 Q 174 314, 174 330" fill="none" stroke="${c.suit}" stroke-width="18" stroke-linecap="round"></path>
    </g>
  `;
}

function drawSpiritCharacter(character, scale = 1, secondary = false) {
  const c = drawCharacterBody(character, scale, secondary);
  return `
    <g opacity="${secondary ? 0.82 : 0.9}">
      ${drawProp("ai-spirit", c, secondary)}
      <path d="M150 74 C 194 74, 228 112, 228 154 C 228 224, 186 278, 150 326 C 114 278, 72 224, 72 154 C 72 112, 106 74, 150 74 Z" fill="${c.suit}" opacity="0.45"></path>
      <path d="M150 94 C 182 94, 206 122, 206 154 C 206 208, 176 248, 150 284 C 124 248, 94 208, 94 154 C 94 122, 118 94, 150 94 Z" fill="${c.accent}" opacity="0.46"></path>
      <circle cx="132" cy="150" r="8" fill="#ffffff"></circle>
      <circle cx="168" cy="150" r="8" fill="#ffffff"></circle>
      <circle cx="132" cy="150" r="4" fill="${c.eye}"></circle>
      <circle cx="168" cy="150" r="4" fill="${c.eye}"></circle>
      <path d="M132 182 Q 150 196, 168 182" fill="none" stroke="#1a1a1a" stroke-width="5" stroke-linecap="round"></path>
    </g>
  `;
}

function drawCharacter(character, options = {}) {
  const variant = String(character?.variant || "").toLowerCase();
  if (VARIANT_GROUPS.robot.has(variant)) {
    return drawRobotCharacter(character, options.scale || 1, options.secondary);
  }
  if (VARIANT_GROUPS.spirit.has(variant)) {
    return drawSpiritCharacter(character, options.scale || 1, options.secondary);
  }
  if (VARIANT_GROUPS.creature.has(variant)) {
    return drawMascotCharacter(character, options.scale || 1, options.secondary);
  }
  return drawHumanCharacter(character, options.scale || 1, options.secondary);
}

export function normalizeThemeRender(input = {}) {
  const merged = merge(DEFAULT_THEME_RENDER, input || {});
  merged.ui = {
    ...DEFAULT_THEME_RENDER.ui,
    ...(input.ui || {}),
  };
  merged.featured_cast = Array.isArray(input.featured_cast) && input.featured_cast.length
    ? input.featured_cast.map((entry) => ({
        ...DEFAULT_THEME_RENDER.featured_cast[0],
        ...entry,
        palette: {
          ...DEFAULT_THEME_RENDER.featured_cast[0].palette,
          ...((entry && entry.palette) || {}),
        },
        costume: {
          ...DEFAULT_THEME_RENDER.featured_cast[0].costume,
          ...((entry && entry.costume) || {}),
        },
      }))
    : DEFAULT_THEME_RENDER.featured_cast;
  merged.featured_background = {
    ...DEFAULT_THEME_RENDER.featured_background,
    ...(input.featured_background || {}),
  };
  merged.comic_elements = Array.isArray(input.comic_elements) && input.comic_elements.length
    ? input.comic_elements.slice(0, 3)
    : DEFAULT_THEME_RENDER.comic_elements;
  return merged;
}

export function buildThemePreviewSvg(input = {}, options = {}) {
  const themeRender = normalizeThemeRender(input);
  const width = options.width || 320;
  const height = options.height || 360;
  const compact = Boolean(options.compact);
  const primary = primaryCharacter(themeRender);
  const support = secondaryCharacter(themeRender);
  const bgStart = safeColor(themeRender.ui.bg_start, DEFAULT_THEME_RENDER.ui.bg_start);
  const bgEnd = safeColor(themeRender.ui.bg_end, DEFAULT_THEME_RENDER.ui.bg_end);
  const accent = safeColor(themeRender.ui.accent, DEFAULT_THEME_RENDER.ui.accent);
  const accent2 = safeColor(themeRender.ui.accent_2, DEFAULT_THEME_RENDER.ui.accent_2);
  const accent3 = safeColor(themeRender.ui.accent_3, DEFAULT_THEME_RENDER.ui.accent_3);
  const title = escapeXml(shortText(primary.name, compact ? 12 : 16));
  const backgroundName = escapeXml(shortText(themeRender.featured_background?.name || "", compact ? 18 : 22));

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${bgStart}"></stop>
          <stop offset="100%" stop-color="${bgEnd}"></stop>
        </linearGradient>
        <linearGradient id="burst" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${accent}"></stop>
          <stop offset="50%" stop-color="${accent2}"></stop>
          <stop offset="100%" stop-color="${accent3}"></stop>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" rx="28" fill="url(#bg)"></rect>
      <rect x="10" y="10" width="${width - 20}" height="${height - 20}" rx="24" fill="transparent" stroke="#1a1a1a" stroke-width="4"></rect>
      ${drawStageDecor(themeRender, width, height, compact)}
      ${drawSupportBadge(themeRender, width, compact)}
      ${drawHeroCaption(primary, width)}
      <g transform="translate(${compact ? 12 : 20}, ${compact ? 18 : 12}) scale(${compact ? 0.84 : 1})">
        ${support ? `<g transform="translate(178, 54) scale(0.62)">${drawCharacter(support, { scale: 0.62, secondary: true })}</g>` : ""}
        <g transform="translate(8, 8)">${drawCharacter(primary, { scale: 1, secondary: false })}</g>
      </g>
      <g transform="translate(${compact ? 20 : 26}, ${height - (compact ? 70 : 82)})">
        <rect width="${width - (compact ? 40 : 52)}" height="${compact ? 52 : 60}" rx="18" fill="#ffffff" opacity="0.88"></rect>
        <text x="18" y="${compact ? 21 : 24}" fill="#1a1a1a" font-size="${compact ? 17 : 19}" font-weight="900" font-family="Arial, sans-serif">${title}</text>
        <text x="18" y="${compact ? 39 : 44}" fill="#374151" font-size="${compact ? 11 : 12}" font-weight="700" font-family="Arial, sans-serif">${backgroundName}</text>
      </g>
      <path d="M18 ${height - 98} C 92 ${height - 124}, 190 ${height - 124}, ${width - 18} ${height - 90}" fill="none" stroke="url(#burst)" stroke-width="${compact ? 8 : 10}" opacity="0.2" stroke-linecap="round"></path>
    </svg>
  `;
}

export function buildThemePreviewDataUri(input = {}, options = {}) {
  const svg = buildThemePreviewSvg(input, options);
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

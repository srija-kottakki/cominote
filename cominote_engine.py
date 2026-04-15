from __future__ import annotations

import json
import math
import re
import textwrap
import uuid
from collections import Counter
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
try:
    import fitz  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    fitz = None

try:
    import nltk  # type: ignore
    from nltk import sent_tokenize, word_tokenize  # type: ignore
    from nltk.corpus import stopwords  # type: ignore
    from nltk.stem import WordNetLemmatizer  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    nltk = None
    sent_tokenize = None
    word_tokenize = None
    stopwords = None
    WordNetLemmatizer = None

try:
    import spacy  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    spacy = None

try:
    from PIL import Image, ImageDraw, ImageFont  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    Image = None
    ImageDraw = None
    ImageFont = None


MAX_TEXT_CHARS = 5000
MAX_FILE_SIZE = 5 * 1024 * 1024
ALLOWED_EXTENSIONS = {".txt", ".pdf"}
FALLBACK_STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "has",
    "have",
    "in",
    "into",
    "is",
    "it",
    "its",
    "of",
    "on",
    "or",
    "that",
    "the",
    "their",
    "this",
    "to",
    "was",
    "were",
    "with",
}

SUBJECT_KEYWORDS = {
    "science": {"science", "energy", "plant", "cell", "atom", "force", "oxygen", "experiment"},
    "history": {"history", "empire", "battle", "revolution", "leader", "kingdom", "war", "timeline"},
    "mathematics": {"equation", "graph", "number", "angle", "algebra", "formula", "value", "slope"},
    "literature": {"theme", "plot", "character", "setting", "story", "conflict", "symbol", "narrative"},
}

STYLE_LIBRARY = {
    "pow": {
        "name": "Pow Burst",
        "page": "#fff6cf",
        "panel": "#ffef85",
        "accent": "#f4621e",
        "accent_alt": "#e63946",
        "bubble": "#ffffff",
        "caption": "#1a1a1a",
    },
    "campus": {
        "name": "Campus Chronicle",
        "page": "#f4f1ff",
        "panel": "#ffffff",
        "accent": "#2d6cdf",
        "accent_alt": "#1fa38a",
        "bubble": "#ffffff",
        "caption": "#1a1a1a",
    },
    "lab": {
        "name": "Lab Adventure",
        "page": "#ecfff8",
        "panel": "#dcfff4",
        "accent": "#1fa38a",
        "accent_alt": "#115d4f",
        "bubble": "#ffffff",
        "caption": "#1a1a1a",
    },
    "classic": {
        "name": "Classic Strip",
        "page": "#fff7f0",
        "panel": "#fffdf7",
        "accent": "#1a1a1a",
        "accent_alt": "#f4621e",
        "bubble": "#ffffff",
        "caption": "#1a1a1a",
    },
}

CAST_LIBRARY = {
    "science": [
        ("Nova", "Curious Learner"),
        ("Dr. Spark", "Science Guide"),
        ("Lab Buddy", "Experiment Specialist"),
        ("Narrator", "Story Voice"),
    ],
    "history": [
        ("Mina", "Timeline Explorer"),
        ("Archivist Arjun", "History Guide"),
        ("Witness", "Event Expert"),
        ("Narrator", "Story Voice"),
    ],
    "mathematics": [
        ("Riya", "Problem Solver"),
        ("Coach Sigma", "Math Guide"),
        ("Graph Bot", "Formula Expert"),
        ("Narrator", "Story Voice"),
    ],
    "literature": [
        ("Asha", "Reader"),
        ("Professor Quill", "Literature Guide"),
        ("Story Muse", "Theme Expert"),
        ("Narrator", "Story Voice"),
    ],
}

BACKGROUND_LIBRARY = {
    "science": ["laboratory", "greenhouse", "observation deck", "revision corner"],
    "history": ["archive hall", "timeline wall", "old city square", "classroom map board"],
    "mathematics": ["graph studio", "equation board", "pattern lab", "revision desk"],
    "literature": ["library corner", "story stage", "reading garden", "theme board"],
}


class ValidationError(ValueError):
    """Raised when the request does not satisfy project constraints."""


class DependencyError(RuntimeError):
    """Raised when optional runtime dependencies required for a path are unavailable."""


@dataclass
class Concept:
    label: str
    score: float
    kind: str


@dataclass
class Relation:
    subject: str
    verb: str
    object: str


@dataclass
class Scene:
    title: str
    speaker: str
    role: str
    dialogue: str
    caption: str
    background: str
    focus: str


class CominoteEngine:
    def __init__(self, base_dir: Path) -> None:
        self.base_dir = base_dir
        self.output_dir = self.base_dir / "generated"
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self._spacy_model = None

    def generate(
        self,
        *,
        title: str,
        subject: str,
        style: str,
        text: str,
        uploaded_file,
        user_id: str = "",
        user_name: str = "",
    ) -> dict:
        subject = subject if subject in SUBJECT_KEYWORDS else "science"
        style = style if style in STYLE_LIBRARY else "pow"

        cleaned_text, source_label = self._collect_input(text=text, uploaded_file=uploaded_file)
        sentences = self._sentences(cleaned_text)
        if len(sentences) < 2:
            raise ValidationError("Please provide at least two meaningful sentences so the comic can tell a story.")

        concepts = self._concepts(cleaned_text, sentences, subject)
        relations = self._relations(sentences)
        scenes = self._scenes(title=title, subject=subject, concepts=concepts, relations=relations, sentences=sentences)

        comic_id = uuid.uuid4().hex[:12]
        image_path = self.output_dir / f"{comic_id}.png"
        self._render(image_path=image_path, title=title, subject=subject, style=style, scenes=scenes)

        payload = {
            "comic_id": comic_id,
            "title": title,
            "subject": subject.title(),
            "style": STYLE_LIBRARY[style]["name"],
            "source_label": source_label,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "summary": f"{title} was transformed into a {len(scenes)}-panel comic focused on {concepts[0].label if concepts else 'the main lesson'}.",
            "panel_count": len(scenes),
            "concepts": [asdict(concept) for concept in concepts],
            "relations": [asdict(relation) for relation in relations],
            "scenes": [asdict(scene) for scene in scenes],
            "downloads": {
                "png": f"/api/download/{comic_id}?format=png",
                "jpeg": f"/api/download/{comic_id}?format=jpeg",
            },
            "image_url": f"/api/comics/{comic_id}/image",
            "meta": {
                "subject_slug": subject,
                "style_slug": style,
                "user_id": user_id,
                "user_name": user_name,
            },
        }

        self._write_metadata(comic_id, payload)
        return payload

    def get_comic(self, comic_id: str) -> dict:
        path = self.output_dir / f"{comic_id}.json"
        if not path.exists():
            raise FileNotFoundError(comic_id)
        return json.loads(path.read_text(encoding="utf-8"))

    def get_download_path(self, comic_id: str, image_format: str) -> Path:
        png_path = self.output_dir / f"{comic_id}.png"
        if not png_path.exists():
            raise FileNotFoundError(comic_id)

        fmt = image_format.lower()
        if fmt == "png":
            return png_path
        if fmt not in {"jpeg", "jpg"}:
            raise ValidationError("Only PNG and JPEG downloads are supported.")
        return self._ensure_jpeg(comic_id, png_path)

    def image_path(self, comic_id: str) -> Path:
        path = self.output_dir / f"{comic_id}.png"
        if not path.exists():
            raise FileNotFoundError(comic_id)
        return path

    def _collect_input(self, *, text: str, uploaded_file) -> tuple[str, str]:
        title_text = self._normalise_whitespace(text)
        file_text = ""
        source_label = "Text Input"

        if uploaded_file and uploaded_file.filename:
            file_text = self._read_uploaded_file(uploaded_file)
            source_label = "Text + Upload" if title_text else "File Upload"

        combined = self._normalise_whitespace(f"{title_text}\n\n{file_text}".strip())
        if not combined:
            raise ValidationError("Please provide pasted notes or upload a supported file.")
        if len(combined) > MAX_TEXT_CHARS:
            raise ValidationError("Input exceeds the 5,000 character limit defined in the project requirements.")
        return combined, source_label

    def _read_uploaded_file(self, uploaded_file) -> str:
        filename = uploaded_file.filename or ""
        suffix = Path(filename).suffix.lower()
        if suffix not in ALLOWED_EXTENSIONS:
            raise ValidationError("Only .txt and .pdf uploads are supported.")

        raw = uploaded_file.read()
        uploaded_file.stream.seek(0)
        if len(raw) > MAX_FILE_SIZE:
            raise ValidationError("Uploaded files must be 5 MB or smaller.")

        if suffix == ".txt":
            return raw.decode("utf-8", errors="ignore")
        if suffix == ".pdf":
            return self._extract_pdf_text(raw)
        raise ValidationError("Unsupported upload type.")

    def _extract_pdf_text(self, raw: bytes) -> str:
        if fitz is None:
            raise DependencyError("PDF upload support needs PyMuPDF installed in the Python environment.")

        with fitz.open(stream=raw, filetype="pdf") as document:
            text = "\n".join(page.get_text("text") for page in document)
        text = self._normalise_whitespace(text)
        if not text:
            raise ValidationError("The uploaded PDF did not contain extractable text.")
        return text

    @staticmethod
    def _normalise_whitespace(text: str) -> str:
        return re.sub(r"\s+", " ", (text or "")).strip()

    def _sentences(self, text: str) -> list[str]:
        if sent_tokenize is not None and nltk is not None:
            try:
                return [sentence.strip() for sentence in sent_tokenize(text) if sentence.strip()]
            except LookupError:
                pass
        return [sentence.strip() for sentence in re.split(r"(?<=[.!?])\s+", text) if sentence.strip()]

    def _tokens(self, text: str) -> list[str]:
        if word_tokenize is not None:
            try:
                return [token for token in word_tokenize(text) if re.search(r"[A-Za-z]", token)]
            except LookupError:
                pass
        return re.findall(r"[A-Za-z][A-Za-z'-]*", text)

    def _stopwords(self) -> set[str]:
        if stopwords is not None:
            try:
                return set(stopwords.words("english"))
            except LookupError:
                return FALLBACK_STOPWORDS
        return FALLBACK_STOPWORDS

    def _lemmatize(self, token: str) -> str:
        word = token.lower()
        if WordNetLemmatizer is not None:
            try:
                return WordNetLemmatizer().lemmatize(word)
            except LookupError:
                pass
        for ending in ("ing", "ed", "es", "s"):
            if word.endswith(ending) and len(word) > len(ending) + 2:
                return word[: -len(ending)]
        return word

    def _concepts(self, text: str, sentences: list[str], subject: str) -> list[Concept]:
        stop = self._stopwords()
        sentence_terms = []
        totals: Counter[str] = Counter()

        for sentence in sentences:
            cleaned = []
            for token in self._tokens(sentence):
                lemma = self._lemmatize(token)
                if lemma in stop or len(lemma) < 3:
                    continue
                cleaned.append(lemma)
            if cleaned:
                sentence_terms.append(cleaned)
                totals.update(cleaned)

        if not totals:
            raise ValidationError("Cominote could not find enough meaningful words to build a comic.")

        doc_count = len(sentence_terms) or 1
        doc_frequency: Counter[str] = Counter()
        for sentence in sentence_terms:
            doc_frequency.update(set(sentence))

        entities = self._entities(text)
        entity_labels = {entity.lower() for entity in entities}
        subject_terms = SUBJECT_KEYWORDS.get(subject, set())
        scored = []

        total_terms = sum(totals.values())
        for term, count in totals.items():
            tf = count / total_terms
            idf = math.log((1 + doc_count) / (1 + doc_frequency[term])) + 1
            score = tf * idf
            if term in subject_terms:
                score *= 1.3
            if term in entity_labels:
                score *= 1.2
            kind = "entity" if term in entity_labels else "concept"
            scored.append(Concept(label=term.title(), score=round(score * 12, 2), kind=kind))

        scored.sort(key=lambda item: item.score, reverse=True)
        unique = []
        seen = set()
        for concept in scored:
            key = concept.label.lower()
            if key in seen:
                continue
            seen.add(key)
            unique.append(concept)
            if len(unique) == 6:
                break
        return unique

    def _entities(self, text: str) -> list[str]:
        model = self._load_spacy_model()
        if model is not None:
            doc = model(text)
            entities = [ent.text.strip() for ent in doc.ents if ent.text.strip()]
            if entities:
                return entities[:8]

        matches = re.findall(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b", text)
        unique = []
        for match in matches:
            if match.lower() in {"the", "this"}:
                continue
            if match not in unique:
                unique.append(match)
            if len(unique) == 8:
                break
        return unique

    def _load_spacy_model(self):
        if spacy is None:
            return None
        if self._spacy_model is not None:
            return self._spacy_model
        try:
            self._spacy_model = spacy.load("en_core_web_sm")
        except Exception:
            try:
                self._spacy_model = spacy.blank("en")
            except Exception:
                self._spacy_model = None
        return self._spacy_model

    def _relations(self, sentences: list[str]) -> list[Relation]:
        relations = []
        common_verbs = {
            "is",
            "are",
            "was",
            "were",
            "means",
            "shows",
            "uses",
            "forms",
            "creates",
            "produces",
            "explains",
            "changes",
            "moves",
            "affects",
            "reveals",
        }

        for sentence in sentences:
            tokens = self._tokens(sentence)
            if len(tokens) < 3:
                continue

            subject = tokens[0].title()
            verb = ""
            object_tokens = []
            for index, token in enumerate(tokens[1:], start=1):
                lowered = token.lower()
                if lowered in common_verbs or lowered.endswith(("s", "ed", "ing")):
                    verb = lowered
                    object_tokens = tokens[index + 1 :]
                    break
            if not verb:
                continue

            object_text = " ".join(object_tokens[:5]).strip().title()
            if not object_text:
                continue

            relations.append(Relation(subject=subject, verb=verb, object=object_text))
            if len(relations) == 5:
                break

        return relations

    def _scenes(
        self,
        *,
        title: str,
        subject: str,
        concepts: list[Concept],
        relations: list[Relation],
        sentences: list[str],
    ) -> list[Scene]:
        cast = CAST_LIBRARY[subject]
        backgrounds = BACKGROUND_LIBRARY[subject]
        focus_concepts = concepts[:4] or [Concept(label=subject.title(), score=1.0, kind="concept")]

        intro = Scene(
            title="Hook",
            speaker=cast[0][0],
            role=cast[0][1],
            dialogue=f"I need to understand {focus_concepts[0].label.lower()} for {title}.",
            caption=self._sentence_snippet(sentences[0]),
            background=backgrounds[0],
            focus=focus_concepts[0].label,
        )

        develop_one = Scene(
            title="Key Idea",
            speaker=cast[1][0],
            role=cast[1][1],
            dialogue=f"Start with {focus_concepts[0].label.lower()}: it anchors the whole lesson.",
            caption=self._sentence_snippet(sentences[min(1, len(sentences) - 1)]),
            background=backgrounds[1],
            focus=focus_concepts[0].label,
        )

        relation_focus = relations[0] if relations else None
        middle_dialogue = (
            f"{relation_focus.subject} {relation_focus.verb} {relation_focus.object.lower()}, which gives the story its next beat."
            if relation_focus
            else f"{focus_concepts[1].label if len(focus_concepts) > 1 else focus_concepts[0].label} connects to the main idea and moves the explanation forward."
        )
        develop_two = Scene(
            title="Connection",
            speaker=cast[2][0],
            role=cast[2][1],
            dialogue=middle_dialogue,
            caption=self._sentence_snippet(sentences[min(2, len(sentences) - 1)]),
            background=backgrounds[2],
            focus=focus_concepts[min(1, len(focus_concepts) - 1)].label,
        )

        examples = []
        for index, concept in enumerate(focus_concepts[2:4], start=3):
            sentence_index = min(index, len(sentences) - 1)
            examples.append(
                Scene(
                    title=f"Panel {index + 1}",
                    speaker=cast[index % len(cast)][0],
                    role=cast[index % len(cast)][1],
                    dialogue=f"{concept.label} makes the lesson easier to remember when we tie it to a concrete example.",
                    caption=self._sentence_snippet(sentences[sentence_index]),
                    background=backgrounds[index % len(backgrounds)],
                    focus=concept.label,
                )
            )

        outro = Scene(
            title="Wrap Up",
            speaker=cast[3][0],
            role=cast[3][1],
            dialogue=f"Now the core ideas of {title} fit together like a comic sequence you can revise quickly.",
            caption="Review the full strip, then download it for revision.",
            background=backgrounds[-1],
            focus=focus_concepts[0].label,
        )

        scenes = [intro, develop_one, develop_two, *examples, outro]
        return scenes[: min(max(len(scenes), 3), 6)]

    @staticmethod
    def _sentence_snippet(sentence: str) -> str:
        return textwrap.shorten(sentence, width=86, placeholder="...")

    def _render(self, *, image_path: Path, title: str, subject: str, style: str, scenes: list[Scene]) -> None:
        if Image is None or ImageDraw is None or ImageFont is None:
            raise DependencyError("Comic rendering needs Pillow installed in the Python environment.")

        palette = STYLE_LIBRARY[style]
        panel_width = 600
        panel_height = 390
        margin = 30
        gutter = 24
        columns = 2
        rows = math.ceil(len(scenes) / columns)
        width = margin * 2 + columns * panel_width + (columns - 1) * gutter
        height = margin * 2 + rows * panel_height + (rows - 1) * gutter + 80

        image = Image.new("RGB", (width, height), palette["page"])
        draw = ImageDraw.Draw(image)

        title_font = self._font(42, bold=True)
        heading_font = self._font(22, bold=True)
        body_font = self._font(18)
        label_font = self._font(16, bold=True)

        draw.rectangle((18, 18, width - 18, height - 18), outline="#1a1a1a", width=4)
        draw.text((margin, 24), title.upper(), font=title_font, fill=palette["accent"])
        draw.text((margin, 68), f"{subject.title()} study comic", font=label_font, fill="#1a1a1a")

        for index, scene in enumerate(scenes):
            row, col = divmod(index, columns)
            left = margin + col * (panel_width + gutter)
            top = margin + 100 + row * (panel_height + gutter)
            right = left + panel_width
            bottom = top + panel_height

            draw.rectangle((left, top, right, bottom), fill=palette["panel"], outline="#1a1a1a", width=4)
            self._halftone(draw, left, top, right, bottom, palette["accent_alt"])
            self._draw_header(draw, left, top, right, scene.title, heading_font, palette)
            self._draw_character(draw, left + 42, bottom - 160, palette["accent"], scene.speaker[0].upper(), label_font)
            self._draw_speech_bubble(
                draw,
                left + 150,
                top + 84,
                right - 28,
                top + 225,
                scene.dialogue,
                body_font,
                palette,
            )
            self._draw_caption(
                draw,
                left + 28,
                bottom - 96,
                right - 28,
                bottom - 26,
                scene.caption,
                label_font,
                palette,
                scene.background,
            )

        image.save(image_path, format="PNG")

    def _draw_header(self, draw, left, top, right, title, font, palette):
        draw.rectangle((left, top, right, top + 46), fill=palette["accent"], outline="#1a1a1a", width=3)
        draw.text((left + 18, top + 8), title.upper(), font=font, fill="white")

    def _draw_character(self, draw, x, y, accent, initial, font):
        draw.ellipse((x + 24, y - 88, x + 104, y - 8), fill="#ffe2c3", outline="#1a1a1a", width=3)
        draw.rectangle((x + 10, y - 8, x + 118, y + 98), fill=accent, outline="#1a1a1a", width=3)
        draw.line((x + 25, y + 98, x + 5, y + 140), fill="#1a1a1a", width=5)
        draw.line((x + 102, y + 98, x + 122, y + 140), fill="#1a1a1a", width=5)
        draw.line((x + 10, y + 22, x - 20, y + 58), fill="#1a1a1a", width=5)
        draw.line((x + 118, y + 22, x + 146, y + 58), fill="#1a1a1a", width=5)
        draw.text((x + 54, y + 24), initial, font=font, fill="white", anchor="mm")

    def _draw_speech_bubble(self, draw, left, top, right, bottom, text, font, palette):
        draw.rounded_rectangle((left, top, right, bottom), radius=28, fill=palette["bubble"], outline="#1a1a1a", width=3)
        draw.polygon(
            [(left + 32, bottom - 12), (left + 68, bottom - 12), (left + 44, bottom + 24)],
            fill=palette["bubble"],
            outline="#1a1a1a",
        )
        wrapped = textwrap.fill(text, width=34)
        draw.multiline_text((left + 22, top + 20), wrapped, font=font, fill="#1a1a1a", spacing=5)

    def _draw_caption(self, draw, left, top, right, bottom, caption, font, palette, background):
        draw.rounded_rectangle((left, top, right, bottom), radius=18, fill=palette["accent_alt"], outline="#1a1a1a", width=3)
        wrapped = textwrap.fill(f"{background.title()}: {caption}", width=54)
        draw.multiline_text((left + 16, top + 12), wrapped, font=font, fill="white", spacing=4)

    def _halftone(self, draw, left, top, right, bottom, accent_alt):
        dot_fill = accent_alt
        for y in range(top + 64, bottom - 16, 26):
            for x in range(left + 12, right - 12, 26):
                draw.ellipse((x, y, x + 5, y + 5), fill=dot_fill)

    def _font(self, size: int, bold: bool = False):
        if ImageFont is None:
            raise DependencyError("Pillow is required for comic rendering.")

        candidates = [
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
            "/System/Library/Fonts/Supplemental/Helvetica.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ]
        for candidate in candidates:
            path = Path(candidate)
            if path.exists():
                try:
                    return ImageFont.truetype(str(path), size=size)
                except OSError:
                    continue
        return ImageFont.load_default()

    def _ensure_jpeg(self, comic_id: str, png_path: Path) -> Path:
        jpeg_path = self.output_dir / f"{comic_id}.jpeg"
        if jpeg_path.exists():
            return jpeg_path
        if Image is None:
            raise DependencyError("JPEG export needs Pillow installed in the Python environment.")
        with Image.open(png_path) as source:
            source.convert("RGB").save(jpeg_path, format="JPEG", quality=92)
        return jpeg_path

    def _write_metadata(self, comic_id: str, payload: dict) -> None:
        path = self.output_dir / f"{comic_id}.json"
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

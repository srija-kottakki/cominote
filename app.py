from __future__ import annotations

import os
import uuid
from pathlib import Path

from flask import Flask, jsonify, request, send_file
from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename

from background_jobs import JobManager
from cominote_engine import CominoteEngine, DependencyError, ValidationError


BASE_DIR = Path(__file__).resolve().parent
GENERATED_DIR = BASE_DIR / "generated"
UPLOAD_DIR = GENERATED_DIR / "uploads"
JOB_DIR = GENERATED_DIR / "jobs"

app = Flask(__name__, static_folder=str(BASE_DIR), static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = 75 * 1024 * 1024

engine = CominoteEngine(BASE_DIR)
job_manager = JobManager(JOB_DIR)


def _persist_upload(uploaded_file: FileStorage | None) -> dict[str, str] | None:
    if uploaded_file is None or not uploaded_file.filename:
        return None

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = secure_filename(uploaded_file.filename) or "upload.bin"
    suffix = Path(safe_name).suffix.lower()
    upload_id = uuid.uuid4().hex[:10]
    temp_path = UPLOAD_DIR / f"{upload_id}{suffix}"
    uploaded_file.save(temp_path)
    return {
        "path": str(temp_path),
        "filename": safe_name,
        "size_bytes": str(temp_path.stat().st_size),
    }


def _build_generation_payload() -> dict:
    upload_meta = _persist_upload(request.files.get("file"))
    return {
        "title": (request.form.get("title") or "Cominote Project").strip(),
        "subject": (request.form.get("subject") or "").strip().lower(),
        "style": (request.form.get("style") or "").strip().lower(),
        "cast_mode": (request.form.get("cast_mode") or "auto").strip().lower(),
        "theme_slug": (request.form.get("theme_slug") or "").strip().lower(),
        "text": request.form.get("text", ""),
        "user_id": request.form.get("user_id", ""),
        "user_name": request.form.get("user_name", ""),
        "upload": upload_meta,
    }


def _run_generation(job_id: str, payload: dict, progress) -> dict:
    upload = payload.get("upload") or {}
    upload_path = upload.get("path")
    try:
        return engine.generate(
            title=payload["title"],
            subject=payload["subject"],
            style=payload["style"],
            cast_mode=payload.get("cast_mode", "auto"),
            theme_slug=payload.get("theme_slug", ""),
            text=payload["text"],
            uploaded_file=Path(upload_path) if upload_path else None,
            user_id=payload.get("user_id", ""),
            user_name=payload.get("user_name", ""),
            progress_callback=progress,
        )
    finally:
        if upload_path:
            path = Path(upload_path)
            if path.exists():
                path.unlink(missing_ok=True)


def _handle_sync_generation(payload: dict):
    try:
        result = _run_generation("sync", payload, lambda *_args, **_kwargs: None)
        return jsonify(result)
    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400
    except DependencyError as exc:
        return jsonify({"error": str(exc)}), 503
    except Exception:
        app.logger.exception("Unexpected error during comic generation")
        return jsonify(
            {
                "error": "Cominote hit an unexpected processing issue. Please try again with a smaller file or retry the job.",
            }
        ), 500


@app.get("/")
def home():
    return app.send_static_file("index.html")


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "service": "Cominote API"})


@app.get("/api/themes")
def themes():
    return jsonify({"themes": engine.list_theme_datasets()})


@app.post("/api/generate")
def generate():
    payload = _build_generation_payload()
    wants_async = (request.form.get("async") or request.args.get("async") or "").strip() in {"1", "true", "yes"}
    if not wants_async:
        return _handle_sync_generation(payload)

    try:
        job = job_manager.create_job(payload=payload, worker=_run_generation)
        return (
            jsonify(
                {
                    "job_id": job.job_id,
                    "status": job.status,
                    "progress": job.progress,
                    "stage": job.stage,
                    "message": job.message,
                }
            ),
            202,
        )
    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400
    except DependencyError as exc:
        return jsonify({"error": str(exc)}), 503
    except Exception:
        app.logger.exception("Unexpected error while starting background generation")
        return jsonify({"error": "Could not start background comic generation."}), 500


@app.get("/api/jobs/<job_id>")
def job_status(job_id: str):
    try:
        return jsonify(job_manager.get_job(job_id))
    except FileNotFoundError:
        return jsonify({"error": "Job not found."}), 404


@app.get("/api/comics/<comic_id>")
def comic_metadata(comic_id: str):
    try:
        return jsonify(engine.get_comic(comic_id))
    except FileNotFoundError:
        return jsonify({"error": "Comic not found."}), 404


@app.get("/api/comics/<comic_id>/image")
def comic_image(comic_id: str):
    try:
        return send_file(engine.image_path(comic_id), mimetype="image/png")
    except FileNotFoundError:
        return jsonify({"error": "Comic image not found."}), 404


@app.get("/api/download/<comic_id>")
def download_comic(comic_id: str):
    try:
        image_format = (request.args.get("format") or "png").lower()
        path = engine.get_download_path(comic_id, image_format)
        mimetype_map = {
            "png": "image/png",
            "jpeg": "image/jpeg",
            "jpg": "image/jpeg",
            "pdf": "application/pdf",
        }
        extension_map = {
            "png": "png",
            "jpeg": "jpeg",
            "jpg": "jpeg",
            "pdf": "pdf",
        }
        mimetype = mimetype_map.get(image_format, "application/octet-stream")
        extension = extension_map.get(image_format, image_format)
        download_name = f"cominote-{comic_id}.{extension}"
        return send_file(path, mimetype=mimetype, as_attachment=True, download_name=download_name)
    except FileNotFoundError:
        return jsonify({"error": "Comic download not found."}), 404
    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400
    except DependencyError as exc:
        return jsonify({"error": str(exc)}), 503


if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "5001"))
    app.run(debug=False, host=host, port=port)

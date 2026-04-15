from __future__ import annotations

from pathlib import Path

from flask import Flask, jsonify, request, send_file

from cominote_engine import CominoteEngine, DependencyError, ValidationError


BASE_DIR = Path(__file__).resolve().parent
app = Flask(__name__, static_folder=str(BASE_DIR), static_url_path="")
engine = CominoteEngine(BASE_DIR)


@app.get("/")
def home():
    return app.send_static_file("index.html")


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "service": "Cominote API"})


@app.post("/api/generate")
def generate():
    try:
        payload = engine.generate(
            title=(request.form.get("title") or "Cominote Project").strip(),
            subject=(request.form.get("subject") or "science").strip().lower(),
            style=(request.form.get("style") or "pow").strip().lower(),
            text=request.form.get("text", ""),
            uploaded_file=request.files.get("file"),
            user_id=request.form.get("user_id", ""),
            user_name=request.form.get("user_name", ""),
        )
        return jsonify(payload)
    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400
    except DependencyError as exc:
        return jsonify({"error": str(exc)}), 503
    except Exception:
        app.logger.exception("Unexpected error during comic generation")
        return jsonify(
            {
                "error": "Cominote hit an unexpected processing issue. Please try again with shorter notes or a simpler file.",
            }
        ), 500


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
        mimetype = "image/png" if image_format == "png" else "image/jpeg"
        extension = "png" if image_format == "png" else "jpeg"
        download_name = f"cominote-{comic_id}.{extension}"
        return send_file(path, mimetype=mimetype, as_attachment=True, download_name=download_name)
    except FileNotFoundError:
        return jsonify({"error": "Comic download not found."}), 404
    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400
    except DependencyError as exc:
        return jsonify({"error": str(exc)}), 503


if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=5000)

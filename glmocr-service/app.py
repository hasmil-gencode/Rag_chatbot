import os
import json
import tempfile
import base64
from flask import Flask, request, jsonify
from pdf2image import convert_from_path
from glmocr import GlmOcr

app = Flask(__name__)

parser = GlmOcr(config_path="config.yaml", layout_device="cpu")


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/ocr", methods=["POST"])
def ocr():
    """
    Accepts a file upload (PDF or image).
    Returns structured OCR result with per-page content and metadata.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    suffix = os.path.splitext(file.filename)[1].lower()

    with tempfile.TemporaryDirectory() as tmpdir:
        filepath = os.path.join(tmpdir, file.filename)
        file.save(filepath)

        if suffix == ".pdf":
            # Convert PDF pages to images
            images = convert_from_path(filepath, dpi=200)
            pages = []
            image_paths = []
            for i, img in enumerate(images):
                img_path = os.path.join(tmpdir, f"page_{i+1}.png")
                img.save(img_path, "PNG")
                image_paths.append(img_path)

            # Parse all pages as single document
            result = parser.parse(image_paths)
            md = result.markdown_result if hasattr(result, "markdown_result") else str(result)
            jr = result.json_result if hasattr(result, "json_result") else None

            # Build per-page response
            if jr and isinstance(jr, list):
                for idx, page_data in enumerate(jr):
                    pages.append({
                        "page_number": idx + 1,
                        "content": page_data.get("content", ""),
                        "regions": page_data.get("regions", []),
                    })
            else:
                # Fallback: split markdown by page markers or return as single page
                pages.append({
                    "page_number": 1,
                    "content": md,
                    "regions": [],
                })

        else:
            # Single image
            result = parser.parse(filepath)
            md = result.markdown_result if hasattr(result, "markdown_result") else str(result)
            jr = result.json_result if hasattr(result, "json_result") else None

            regions = []
            if jr and isinstance(jr, list) and len(jr) > 0:
                regions = jr[0].get("regions", []) if isinstance(jr[0], dict) else []

            pages = [{
                "page_number": 1,
                "content": md,
                "regions": regions,
            }]

    return jsonify({
        "success": True,
        "file_name": file.filename,
        "total_pages": len(pages),
        "pages": pages,
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002)

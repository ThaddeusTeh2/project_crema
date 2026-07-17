"""Shot log routes: list, add, export."""

from datetime import datetime, timezone

from flask import Blueprint, jsonify, request, send_file

import store

shots_bp = Blueprint("shots", __name__, url_prefix="/api/shots")


@shots_bp.route("", methods=["GET"])
def list_shots():
    method = request.args.get("method")
    coffee = request.args.get("coffee")
    limit = request.args.get("limit", type=int)

    shots = store.load_shots()

    if method:
        shots = [s for s in shots if s.get("method") == method]
    if coffee:
        shots = [s for s in shots if s.get("coffee_name", "").lower() == coffee.lower()]

    shots = list(reversed(shots))

    if limit:
        shots = shots[:limit]

    return jsonify(shots)


@shots_bp.route("", methods=["POST"])
def add_shot():
    data = request.get_json(silent=True) or {}

    shot = {
        "coffee_name": data.get("coffee_name", ""),
        "timestamp": data.get("timestamp", datetime.now(timezone.utc).isoformat()),
        "grind_macro": data.get("grind_macro"),
        "grind_micro": data.get("grind_micro"),
        "dose": data.get("dose"),
        "yield": data.get("yield"),
        "temperature": data.get("temperature"),
        "preinfusion": data.get("preinfusion"),
        "shot_time": data.get("shot_time"),
        "taste_score": data.get("taste_score"),
        "method": data.get("method", "manual"),
        "notes": data.get("notes"),
    }

    saved = store.add_shot(shot)
    return jsonify(saved), 201


@shots_bp.route("/export", methods=["GET"])
def export_shots():
    shots = store.load_shots()
    import json
    import tempfile

    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(shots, f, indent=2, default=str)
        path = f.name

    return send_file(path, as_attachment=True, download_name="crema_shots.json")
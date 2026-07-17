"""Bayesian optimization routes: init, suggest, record."""

from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

import store
from algorithms.bayesian import BayesianOptimizer, DEFAULT_VARIABLES, HAS_SKOPT

bayesian_bp = Blueprint("bayesian", __name__, url_prefix="/api/bayesian")

_session: BayesianOptimizer | None = None


@bayesian_bp.route("/init", methods=["POST"])
def init_bayesian():
    global _session

    if not HAS_SKOPT:
        return jsonify({"error": "scikit-optimize not installed. Run: pip install scikit-optimize"}), 500

    data = request.get_json(silent=True) or {}
    variables = data.get("variables", DEFAULT_VARIABLES)
    n_initial = data.get("n_initial", 3)

    try:
        _session = BayesianOptimizer(variables=variables, n_initial=n_initial)
        result = _session.initialize()
        return jsonify({"first_suggestion": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bayesian_bp.route("/suggest", methods=["POST"])
def suggest():
    global _session
    if _session is None:
        return jsonify({"error": "No active Bayesian session. Call /api/bayesian/init first."}), 400

    try:
        result = _session.suggest()
        return jsonify({"suggestion": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bayesian_bp.route("/record", methods=["POST"])
def record_bayesian():
    global _session
    if _session is None:
        return jsonify({"error": "No active Bayesian session. Call /api/bayesian/init first."}), 400

    data = request.get_json(silent=True) or {}
    params = data.get("params", {})
    score = data.get("score")

    if score is None:
        return jsonify({"error": "score is required"}), 400

    try:
        result = _session.record(params, float(score))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    if "grind_macro" in params:
        grind_macro = params["grind_macro"]
        grind_micro = params.get("grind_micro", "E")
    elif "grind" in params:
        from algorithms.grind import GrindSetting
        grind = GrindSetting.from_float(params["grind"])
        grind_macro, grind_micro = grind.macro, grind.micro
    else:
        grind_macro, grind_micro = 15, "E"

    shot = {
        "coffee_name": data.get("coffee_name", "Bayesian Session"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "grind_macro": grind_macro,
        "grind_micro": grind_micro,
        "dose": params.get("dose"),
        "yield": params.get("yield"),
        "temperature": params.get("temperature"),
        "preinfusion": params.get("preinfusion"),
        "shot_time": data.get("shot_time"),
        "taste_score": float(score),
        "method": "bayesian",
        "notes": data.get("notes"),
    }
    store.add_shot(shot)

    return jsonify(result)
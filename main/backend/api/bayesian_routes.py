"""Bayesian optimization routes: per-coffee sessions with disk persistence."""

from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

import store
from algorithms.bayesian import (
    BayesianOptimizer,
    DEFAULT_VARIABLES,
    HAS_SKOPT,
    MIN_RECOMMENDED_INITIAL,
)

bayesian_bp = Blueprint("bayesian", __name__, url_prefix="/api/bayesian")

_sessions: dict[str, BayesianOptimizer] = {}


def _load_session(coffee_name: str) -> BayesianOptimizer | None:
    """Load a session from memory or disk."""
    global _sessions
    if coffee_name in _sessions:
        return _sessions[coffee_name]

    sessions_data = store.load_bayesian_sessions()
    data = sessions_data.get(coffee_name)
    if data:
        bo = BayesianOptimizer.from_dict(data)
        if bo:
            _sessions[coffee_name] = bo
            return bo
    return None


def _save_session(coffee_name: str, bo: BayesianOptimizer) -> None:
    """Save session to memory and disk."""
    _sessions[coffee_name] = bo
    store.save_bayesian_session(coffee_name, bo.to_dict())


def _get_seed_shots(coffee_name: str) -> list[dict]:
    """Collect existing shots for a coffee that can seed the GP."""
    all_shots = store.load_shots()
    return [
        s for s in all_shots
        if s.get("coffee_name", "").lower() == coffee_name.lower()
        and s.get("valid_for_model", False)
        and s.get("taste_score") is not None
    ]


def _shot_has_model_data(shot: dict) -> bool:
    """Check if a shot has the 5 variable parameters needed for GP."""
    return all(
        shot.get(v["name"]) is not None
        or (v["name"] == "grind" and shot.get("grind_macro") is not None)
        for v in DEFAULT_VARIABLES
    )


@bayesian_bp.route("/sessions", methods=["GET"])
def list_sessions():
    """List all saved Bayesian sessions."""
    sessions_data = store.load_bayesian_sessions()
    result = []
    for coffee_name, data in sessions_data.items():
        history = data.get("history", [])
        n_observed = sum(1 for h in history if not h.get("unobserved"))
        result.append({
            "coffee_name": coffee_name,
            "observations": n_observed,
            "total": len(history),
            "initialized": data.get("initialized", False),
        })
    return jsonify(result)


@bayesian_bp.route("/init", methods=["POST"])
def init_bayesian():
    global _sessions

    if not HAS_SKOPT:
        return jsonify({"error": "scikit-optimize not installed. Run: pip install scikit-optimize"}), 500

    data = request.get_json(silent=True) or {}
    coffee_name = data.get("coffee_name", "Unknown Coffee")
    n_initial = data.get("n_initial", MIN_RECOMMENDED_INITIAL)

    existing = _load_session(coffee_name)
    if existing and existing._initialized:
        return jsonify({
            "error": f"Session already exists for '{coffee_name}'. Use /restore to reload.",
            "existing": True,
            "observations": sum(1 for h in existing._history if not h.get("unobserved")),
        }), 409

    try:
        bo = BayesianOptimizer(coffee_name=coffee_name, n_initial=n_initial)
        seed_shots = _get_seed_shots(coffee_name)
        result = bo.initialize(seed_shots=seed_shots)
        _save_session(coffee_name, bo)

        coffee_shots = [s for s in store.load_shots()
                        if s.get("coffee_name", "").lower() == coffee_name.lower()]
        available_seeds = sum(1 for s in coffee_shots
                              if s.get("valid_for_model") and s.get("taste_score") is not None)

        return jsonify({
            "first_suggestion": result,
            "coffee_name": coffee_name,
            "shot_count": len(coffee_shots),
            "seed_count": available_seeds,
            "total_observations": bo._history and len(bo._history) or 0,
            "confidence": result.get("confidence", "Low"),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bayesian_bp.route("/suggest", methods=["POST"])
def suggest():
    data = request.get_json(silent=True) or {}
    coffee_name = data.get("coffee_name", "")

    bo = _load_session(coffee_name)
    if bo is None:
        return jsonify({"error": f"No session for '{coffee_name}'. Call /api/bayesian/init first."}), 400

    try:
        result = bo.suggest()
        _save_session(coffee_name, bo)
        return jsonify({
            "suggestion": result,
            "coffee_name": coffee_name,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bayesian_bp.route("/record", methods=["POST"])
def record_bayesian():
    data = request.get_json(silent=True) or {}
    coffee_name = data.get("coffee_name", "")
    params = data.get("params", {})
    score = data.get("score")
    valid_for_model = data.get("valid_for_model", True)

    if score is None:
        return jsonify({"error": "score is required"}), 400

    bo = _load_session(coffee_name)
    if bo is None:
        return jsonify({"error": f"No session for '{coffee_name}'. Call /api/bayesian/init first."}), 400

    taste_components = data.get("taste_components")

    try:
        result = bo.record(
            params,
            float(score),
            valid_for_model=valid_for_model,
            taste_components=taste_components,
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    _save_session(coffee_name, bo)

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
        "coffee_name": coffee_name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "grind_macro": grind_macro,
        "grind_micro": grind_micro,
        "dose": params.get("dose"),
        "yield": params.get("yield"),
        "temperature": params.get("temperature"),
        "preinfusion": params.get("preinfusion"),
        "shot_time": data.get("shot_time"),
        "taste_score": float(score),
        "taste_components": taste_components,
        "method": "bayesian",
        "notes": data.get("notes"),
        "valid_for_model": valid_for_model,
        "valid_reason": data.get("valid_reason"),
    }
    store.add_shot(shot)

    return jsonify({
        **result,
        "coffee_name": coffee_name,
    })


@bayesian_bp.route("/state", methods=["GET"])
def get_bayesian_state():
    """Get the current state of a Bayesian session."""
    coffee_name = request.args.get("coffee_name", "")
    bo = _load_session(coffee_name)
    if bo is None:
        return jsonify({"error": f"No session for '{coffee_name}'."}), 404

    return jsonify({
        "coffee_name": bo.coffee_name,
        "initialized": bo._initialized,
        "history": bo._history,
        "history_count": sum(1 for h in bo._history if not h.get("unobserved")),
        "total_observations": len(bo._history),
        "confidence": bo._confidence_label(),
        "variables": bo.variables,
    })


@bayesian_bp.route("/reset", methods=["POST"])
def reset_bayesian():
    """Delete a Bayesian session for a coffee."""
    data = request.get_json(silent=True) or {}
    coffee_name = data.get("coffee_name", "")
    global _sessions
    _sessions.pop(coffee_name, None)
    store.delete_bayesian_session(coffee_name)
    return jsonify({"ok": True})


@bayesian_bp.route("/coffees", methods=["GET"])
def list_coffees_with_shots():
    """List distinct coffee names with shot counts for Bayesian seeding."""
    shots = store.load_shots()
    coffee_map: dict[str, dict] = {}
    for s in shots:
        name = s.get("coffee_name", "Unknown Coffee")
        if name not in coffee_map:
            coffee_map[name] = {"coffee_name": name, "total_shots": 0, "valid_for_model": 0}
        coffee_map[name]["total_shots"] += 1
        if s.get("valid_for_model") and s.get("taste_score") is not None:
            coffee_map[name]["valid_for_model"] += 1

    return jsonify(sorted(coffee_map.values(), key=lambda c: c["coffee_name"]))
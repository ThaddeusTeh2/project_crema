"""Pipeline lifecycle routes: start, state, reset."""

from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

import store
from algorithms.grind import GrindSetting

pipeline_bp = Blueprint("pipeline", __name__, url_prefix="/api/pipeline")


@pipeline_bp.route("/start", methods=["POST"])
def start_pipeline():
    data = request.get_json(silent=True) or {}
    coffee_name = data.get("coffee_name", "Unknown Coffee")
    target_time = data.get("target_time", 30.0)
    macro = data.get("macro", 15)
    micro = data.get("micro", "E")

    try:
        starting_grind = GrindSetting(macro=macro, micro=micro)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    locked_vars = {
        "dose": data.get("dose", 18.0),
        "yield": data.get("yield", 36.0),
        "temperature": data.get("temperature", 93.0),
        "preinfusion": data.get("preinfusion", 5.0),
    }

    state = {
        "phase": "secant",
        "coffee_name": coffee_name,
        "target_time": target_time,
        "starting_grind": starting_grind.to_dict(),
        "locked_vars": locked_vars,
        "secant": {
            "active": True,
            "converged": False,
            "history": [],
            "next_grind": str(starting_grind),
            "iteration": 0,
            "error": None,
            "target_time": target_time,
        },
        "golden": None,
        "recipe": None,
        "started_at": datetime.now(timezone.utc).isoformat(),
    }

    store.save_state(state)

    shot = {
        "coffee_name": coffee_name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "grind_macro": macro,
        "grind_micro": micro,
        "dose": locked_vars["dose"],
        "yield": locked_vars["yield"],
        "temperature": locked_vars["temperature"],
        "preinfusion": locked_vars["preinfusion"],
        "shot_time": None,
        "taste_score": None,
        "taste_components": None,
        "method": "secant_start",
        "notes": f"Starting grind for {coffee_name}",
        "valid_for_model": False,
        "valid_reason": "pipeline start, no taste score",
    }
    store.add_shot(shot)

    return jsonify(state)


@pipeline_bp.route("/state", methods=["GET"])
def get_state():
    state = store.load_state()
    if not state:
        return jsonify({"phase": "setup"})
    return jsonify(state)


@pipeline_bp.route("/reset", methods=["POST"])
def reset_pipeline():
    store.reset_state()
    return jsonify({"ok": True})


@pipeline_bp.route("/restart-phase", methods=["POST"])
def restart_phase():
    state = store.load_state()
    if not state:
        return jsonify({"error": "No active pipeline."}), 400

    phase = state.get("phase")
    if phase == "secant":
        starting = state.get("starting_grind", {"macro": 15, "micro": "E"})
        target = state.get("target_time", 30)
        state["secant"] = {
            "active": True,
            "converged": False,
            "history": [],
            "next_grind": f"{starting['macro']}{starting['micro']}",
            "iteration": 0,
            "error": None,
            "target_time": target,
        }
    elif phase == "golden":
        state["phase"] = "secant"
        state["golden"] = None
    elif phase == "recipe":
        state["phase"] = "golden"
        state["recipe"] = None
    else:
        return jsonify({"error": f"Cannot restart from phase '{phase}'."}), 400

    store.save_state(state)
    return jsonify({"ok": True, "phase": state["phase"], "state": state})
"""Secant method routes: record shot time, get next grind."""

from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

import store
from algorithms.grind import GrindSetting
from algorithms.secant import SecantMethod

secant_bp = Blueprint("secant", __name__, url_prefix="/api/pipeline/secant")


@secant_bp.route("/record", methods=["POST"])
def record_shot():
    data = request.get_json(silent=True) or {}
    shot_time = data.get("shot_time")
    shot_quality = data.get("shot_quality", "good")

    if shot_time is None:
        return jsonify({"error": "shot_time is required"}), 400

    state = store.load_state()
    if not state or state.get("phase") != "secant":
        return jsonify({"error": "No active secant session. Start a pipeline first."}), 400

    locked = state.get("locked_vars", {})
    secant_data = state.get("secant", {})
    secant = SecantMethod(
        target_time=secant_data.get("target_time", state.get("target_time", 30.0)),
    )
    secant.history = secant_data.get("history", [])
    secant._iteration = secant_data.get("iteration", 0)
    secant._converged = secant_data.get("converged", False)

    grind_str = secant_data.get("next_grind")
    if not grind_str:
        return jsonify({"error": "No grind to record against. Start a secant session first."}), 400

    macro = int(grind_str[:-1]) if grind_str[:-1].isdigit() else 15
    micro = grind_str[-1] if grind_str[-1].isalpha() else "E"
    current_grind = GrindSetting(macro=macro, micro=micro)

    result = secant.record_shot(current_grind, float(shot_time), shot_quality=shot_quality)

    state["secant"] = secant.to_dict()
    if result.get("next_grind"):
        state["secant"]["next_grind"] = str(result["next_grind"])
    else:
        state["secant"]["next_grind"] = None

    if result["converged"]:
        state["secant"]["converged"] = True

    store.save_state(state)

    dose = data.get("dose", locked.get("dose"))
    syield = data.get("yield", locked.get("yield"))
    temperature = data.get("temperature", locked.get("temperature"))
    preinfusion = data.get("preinfusion", locked.get("preinfusion"))

    shot = {
        "coffee_name": state.get("coffee_name", ""),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "grind_macro": current_grind.macro,
        "grind_micro": current_grind.micro,
        "dose": dose,
        "yield": syield,
        "temperature": temperature,
        "preinfusion": preinfusion,
        "shot_time": float(shot_time),
        "taste_score": None,
        "taste_components": None,
        "method": "secant",
        "notes": data.get("notes"),
        "valid_for_model": False,
        "valid_reason": f"secant dial-in — shot quality: {shot_quality}",
        "shot_quality": shot_quality,
    }
    store.add_shot(shot)

    response = {
        "next_grind": str(result["next_grind"]) if result.get("next_grind") else None,
        "converged": result["converged"],
        "iteration": result["iteration"],
        "error": result["error"],
        "rejected": result.get("rejected", False),
    }

    if result["converged"]:
        secant_data = state["secant"]
        if secant_data.get("history"):
            last = secant_data["history"][-1]
            response["final_grind"] = last.get("grind")
            response["final_time"] = last.get("time")

    return jsonify(response)
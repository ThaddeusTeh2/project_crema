"""Golden Section Search routes: configure bounds, compare taste."""

from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

import store
from algorithms.golden_section import GoldenSectionSearch, PREFERENCE_WEIGHTS
from algorithms.grind import GrindSetting

golden_bp = Blueprint("golden", __name__, url_prefix="/api/pipeline/golden")

VALID_PREFERENCES = list(PREFERENCE_WEIGHTS.keys())


@golden_bp.route("/config", methods=["POST"])
def configure_golden():
    state = store.load_state()
    if not state:
        return jsonify({"error": "No active pipeline. Start one first."}), 400

    data = request.get_json(silent=True) or {}
    coarse_macro = data.get("coarse_macro")
    fine_macro = data.get("fine_macro")
    coarse_micro = data.get("coarse_micro", "E")
    fine_micro = data.get("fine_micro", "E")

    if coarse_macro is None or fine_macro is None:
        secant_data = state.get("secant", {})
        if secant_data.get("converged") and secant_data.get("history"):
            last_grind_str = secant_data["history"][-1].get("grind")
            if last_grind_str:
                center = GrindSetting(
                    macro=int(last_grind_str[:-1]),
                    micro=last_grind_str[-1],
                ).to_float()

                good_history = [h for h in secant_data.get("history", []) if h.get("quality", "good") == "good"]
                if len(good_history) >= 2:
                    first = GrindSetting(
                        macro=int(good_history[0]["grind"][:-1]),
                        micro=good_history[0]["grind"][-1],
                    ).to_float()
                    movement = abs(center - first)
                    half_width = max(movement * 1.5, 2.0)
                else:
                    half_width = 5.0

                coarse = GrindSetting.from_float(min(center + half_width, 31.8))
                fine = GrindSetting.from_float(max(center - half_width, 1.0))
            else:
                return jsonify({"error": "No secant result to auto-configure from. Provide bounds manually."}), 400
        else:
            return jsonify({"error": "Provide coarse_macro, fine_macro, coarse_micro, fine_micro or converge secant first."}), 400
    else:
        try:
            coarse = GrindSetting(macro=coarse_macro, micro=coarse_micro)
            fine = GrindSetting(macro=fine_macro, micro=fine_micro)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

    gs = GoldenSectionSearch(coarse=coarse, fine=fine)
    initial = gs.initial_points()

    state["phase"] = "golden"
    state["golden"] = {
        **gs.to_dict(),
        "active": True,
        "converged": False,
        "point_a": str(initial["point_a"]),
        "point_b": str(initial["point_b"]),
        "retained_point": None,
        "new_point": None,
        "best_grind": None,
        "width": round(coarse.to_float() - fine.to_float(), 2),
        "iteration": 0,
        "history": [],
    }

    store.save_state(state)

    locked = state.get("locked_vars", {})

    shot_a = {
        "coffee_name": state.get("coffee_name", ""),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "grind_macro": initial["point_a"].macro,
        "grind_micro": initial["point_a"].micro,
        "dose": locked.get("dose"),
        "yield": locked.get("yield"),
        "temperature": locked.get("temperature"),
        "preinfusion": locked.get("preinfusion"),
        "shot_time": None,
        "taste_score": None,
        "taste_components": None,
        "method": "golden_test",
        "notes": "Golden section test point A",
        "valid_for_model": False,
        "valid_reason": "golden section test — pairwise comparison only",
    }
    store.add_shot(shot_a)

    shot_b = {
        "coffee_name": state.get("coffee_name", ""),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "grind_macro": initial["point_b"].macro,
        "grind_micro": initial["point_b"].micro,
        "dose": locked.get("dose"),
        "yield": locked.get("yield"),
        "temperature": locked.get("temperature"),
        "preinfusion": locked.get("preinfusion"),
        "shot_time": None,
        "taste_score": None,
        "taste_components": None,
        "method": "golden_test",
        "notes": "Golden section test point B",
        "valid_for_model": False,
        "valid_reason": "golden section test — pairwise comparison only",
    }
    store.add_shot(shot_b)

    return jsonify({
        "point_a": str(initial["point_a"]),
        "point_b": str(initial["point_b"]),
    })


@golden_bp.route("/compare", methods=["POST"])
def compare_golden():
    data = request.get_json(silent=True) or {}
    preference = data.get("preference", "slightly_a")

    if preference not in VALID_PREFERENCES:
        return jsonify({"error": f"preference must be one of: {', '.join(VALID_PREFERENCES)}"}), 400

    state = store.load_state()
    if not state or state.get("phase") != "golden":
        return jsonify({"error": "No active golden section session."}), 400

    golden_data = state.get("golden", {})
    gs = GoldenSectionSearch.from_dict(golden_data)
    gs._initialized = golden_data.get("initialized", True)

    result = gs.compare(preference)

    locked = state.get("locked_vars", {})

    prev_history = golden_data.get("history", [])
    prev_history.append({
        "iteration": gs.iteration,
        "point_a": golden_data.get("point_a", "?"),
        "point_b": golden_data.get("point_b", "?"),
        "preference": preference,
        "weight": result["weight"],
        "action": result["action"],
    })

    state["golden"] = {
        **gs.to_dict(),
        "active": True,
        "converged": result["converged"],
        "point_a": str(GrindSetting.from_float(gs._c)) if not result["converged"] else None,
        "point_b": str(GrindSetting.from_float(gs._d)) if not result["converged"] else None,
        "retained_point": str(result["retained_point"]) if result.get("retained_point") else None,
        "new_point": str(result["new_point"]) if result.get("new_point") else None,
        "best_grind": str(result["best_grind"]) if result.get("best_grind") else None,
        "width": result["width"],
        "iteration": gs.iteration,
        "history": prev_history,
    }

    store.save_state(state)

    response = {
        "action": result["action"],
        "new_point": str(result["new_point"]) if result.get("new_point") else None,
        "retained_point": str(result["retained_point"]) if result.get("retained_point") else None,
        "converged": result["converged"],
        "width": result["width"],
        "preference": preference,
        "weight": result["weight"],
    }

    if result["converged"]:
        response["best_grind"] = str(result["best_grind"])

    if result["action"] == "pull_new":
        shot = {
            "coffee_name": state.get("coffee_name", ""),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "grind_macro": result["new_point"].macro,
            "grind_micro": result["new_point"].micro,
            "dose": locked.get("dose"),
            "yield": locked.get("yield"),
            "temperature": locked.get("temperature"),
            "preinfusion": locked.get("preinfusion"),
            "shot_time": None,
            "taste_score": None,
            "taste_components": None,
            "method": "golden_compare",
            "notes": f"Golden section iteration {gs.iteration}, preference={preference}",
            "valid_for_model": False,
            "valid_reason": "golden section — pairwise comparison only",
        }
        store.add_shot(shot)

    return jsonify(response)
"""Recipe routes: save and list recipes. Marks final shot valid_for_model for Bayesian seeding."""

from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

import store
from algorithms.grind import GrindSetting

recipe_bp = Blueprint("recipe", __name__, url_prefix="/api")


@recipe_bp.route("/pipeline/recipe/save", methods=["POST"])
def save_recipe():
    data = request.get_json(silent=True) or {}
    recipe_name = data.get("recipe_name", "Unnamed Recipe")

    state = store.load_state()
    if not state:
        return jsonify({"error": "No active pipeline."}), 400

    golden_data = state.get("golden", {})
    secant_data = state.get("secant", {})
    locked = state.get("locked_vars", {})

    final_grind = None
    if golden_data.get("converged"):
        final_grind = golden_data.get("best_grind") or golden_data.get("point_a") or golden_data.get("retained_point")
    elif secant_data.get("converged") and secant_data.get("history"):
        good_shots = [h for h in secant_data["history"] if h.get("quality", "good") == "good"]
        if good_shots:
            final_grind = good_shots[-1].get("grind")

    dose = data.get("dose", locked.get("dose"))
    syield = data.get("yield", locked.get("yield"))
    temperature = data.get("temperature", locked.get("temperature"))
    preinfusion = data.get("preinfusion", locked.get("preinfusion"))
    taste_score = data.get("taste_score")
    taste_components = data.get("taste_components")
    grind_macro = None
    grind_micro = None
    if final_grind:
        try:
            grind_macro = int(final_grind[:-1])
            grind_micro = final_grind[-1]
        except (ValueError, IndexError):
            pass

    seed_shot = {
        "coffee_name": state.get("coffee_name", ""),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "grind_macro": grind_macro,
        "grind_micro": grind_micro,
        "dose": dose,
        "yield": syield,
        "temperature": temperature,
        "preinfusion": preinfusion,
        "shot_time": secant_data.get("history", [])[-1].get("time") if secant_data.get("history") else None,
        "taste_score": taste_score,
        "taste_components": taste_components,
        "method": "bayesian_seed",
        "notes": f"Saved recipe: {recipe_name}",
        "valid_for_model": True,
        "valid_reason": None,
    }
    saved_shot = store.add_shot(seed_shot)

    recipe = {
        "name": recipe_name,
        "coffee_name": state.get("coffee_name", ""),
        "grind": final_grind,
        "dose": dose,
        "yield": syield,
        "temperature": temperature,
        "preinfusion": preinfusion,
        "target_time": state.get("target_time"),
        "saved_at": datetime.now(timezone.utc).isoformat(),
        "secant_history": secant_data.get("history", []),
        "golden_converged": golden_data.get("converged", False),
        "source_shot_id": saved_shot["id"],
    }

    saved = store.save_recipe(recipe)

    state["phase"] = "recipe"
    state["recipe"] = {
        "saved": True,
        "recipe_name": recipe_name,
        "final_grind": final_grind,
    }
    store.save_state(state)

    return jsonify({"recipe": saved, "seed_shot_id": saved_shot["id"]})


@recipe_bp.route("/recipes", methods=["GET"])
def list_recipes():
    recipes = store.load_recipes()
    return jsonify(recipes)
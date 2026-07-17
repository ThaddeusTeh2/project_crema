"""Recipe routes: save and list recipes."""

from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

import store

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

    final_grind = None
    if golden_data.get("converged"):
        final_grind = golden_data.get("best_grind") or golden_data.get("point_a") or golden_data.get("retained_point")
    elif secant_data.get("converged") and secant_data.get("history"):
        final_grind = secant_data["history"][-1].get("grind")

    recipe = {
        "name": recipe_name,
        "coffee_name": state.get("coffee_name", ""),
        "grind": final_grind,
        "target_time": state.get("target_time"),
        "saved_at": datetime.now(timezone.utc).isoformat(),
        "secant_history": secant_data.get("history", []),
        "golden_converged": golden_data.get("converged", False),
    }

    saved = store.save_recipe(recipe)

    state["phase"] = "recipe"
    state["recipe"] = {
        "saved": True,
        "recipe_name": recipe_name,
        "final_grind": final_grind,
    }
    store.save_state(state)

    return jsonify({"recipe": saved})


@recipe_bp.route("/recipes", methods=["GET"])
def list_recipes():
    recipes = store.load_recipes()
    return jsonify(recipes)
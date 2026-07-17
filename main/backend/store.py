"""JSON file persistence for pipeline state and shot log."""

import json
import os
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SHOTS_FILE = DATA_DIR / "shots.json"
STATE_FILE = DATA_DIR / "pipeline_state.json"
RECIPES_FILE = DATA_DIR / "recipes.json"


def _ensure_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def _read_json(path: Path) -> dict | list:
    _ensure_dir()
    if not path.exists():
        return {} if "state" in path.name else []
    with open(path, "r") as f:
        return json.load(f)


def _write_json(path: Path, data: dict | list) -> None:
    _ensure_dir()
    with open(path, "w") as f:
        json.dump(data, f, indent=2, default=str)


def load_state() -> dict:
    """Load the current pipeline state."""
    return _read_json(STATE_FILE)


def save_state(state: dict) -> None:
    """Save the pipeline state."""
    _write_json(STATE_FILE, state)


def reset_state() -> dict:
    """Clear the pipeline state."""
    empty = {}
    _write_json(STATE_FILE, empty)
    return empty


def load_shots() -> list[dict]:
    """Load all logged shots."""
    return _read_json(SHOTS_FILE)


def clear_shots() -> None:
    """Clear all logged shots."""
    _write_json(SHOTS_FILE, [])


def add_shot(shot: dict) -> dict:
    """Append a shot to the log and return it."""
    shots = load_shots()
    shot["id"] = str(len(shots) + 1)
    shots.append(shot)
    _write_json(SHOTS_FILE, shots)
    return shot


def load_recipes() -> list[dict]:
    """Load all saved recipes."""
    return _read_json(RECIPES_FILE)


def save_recipe(recipe: dict) -> dict:
    """Save a recipe and return it."""
    recipes = load_recipes()
    recipes.append(recipe)
    _write_json(RECIPES_FILE, recipes)
    return recipe
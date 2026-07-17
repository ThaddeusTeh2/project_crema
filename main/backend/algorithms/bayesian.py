"""Bayesian Optimization for multi-variable espresso recipe optimization.

Wraps scikit-optimize (skopt) for Gaussian Process regression with
Expected Improvement acquisition. Uses Latin Hypercube Sampling for
initial exploration and enforces espresso-specific constraints.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

try:
    from skopt import Optimizer
    from skopt.space import Real

    HAS_SKOPT = True
except ImportError:
    HAS_SKOPT = False
    Optimizer = None
    Real = None

from .grind import GrindSetting

DEFAULT_VARIABLES = [
    {"name": "grind", "min": 1.0, "max": 31.8},
    {"name": "dose", "min": 14.0, "max": 22.0},
    {"name": "yield", "min": 24.0, "max": 50.0},
    {"name": "temperature", "min": 88.0, "max": 98.0},
    {"name": "preinfusion", "min": 0.0, "max": 15.0},
]

ESPRESSO_CONSTRAINTS = {
    "min_ratio": 1.5,
    "max_ratio": 3.0,
    "min_dose": 14.0,
    "max_dose": 22.0,
}

MIN_RECOMMENDED_INITIAL = 10


def _latin_hypercube(n_points: int, bounds: list[tuple[float, float]], seed: int = 42) -> np.ndarray:
    """Generate Latin Hypercube samples within bounds."""
    rng = np.random.RandomState(seed)
    n_dims = len(bounds)
    samples = np.zeros((n_points, n_dims))
    for j in range(n_dims):
        intervals = np.linspace(bounds[j][0], bounds[j][1], n_points + 1)
        lower = intervals[:-1]
        upper = intervals[1:]
        points = lower + rng.uniform(0, 1, n_points) * (upper - lower)
        rng.shuffle(points)
        samples[:, j] = points
    return samples


def _constraints_satisfied(params: dict[str, float]) -> tuple[bool, str | None]:
    """Check espresso-specific constraints on parameter dict."""
    dose = params.get("dose")
    syield = params.get("yield")

    if dose is not None:
        if dose < ESPRESSO_CONSTRAINTS["min_dose"]:
            return False, f"dose {dose:.1f}g below minimum {ESPRESSO_CONSTRAINTS['min_dose']}g"
        if dose > ESPRESSO_CONSTRAINTS["max_dose"]:
            return False, f"dose {dose:.1f}g above maximum {ESPRESSO_CONSTRAINTS['max_dose']}g"

    if dose is not None and dose > 0 and syield is not None and syield > 0:
        ratio = syield / dose
        if ratio < ESPRESSO_CONSTRAINTS["min_ratio"]:
            return False, f"yield/dose ratio {ratio:.1f} below minimum {ESPRESSO_CONSTRAINTS['min_ratio']}"
        if ratio > ESPRESSO_CONSTRAINTS["max_ratio"]:
            return False, f"yield/dose ratio {ratio:.1f} above maximum {ESPRESSO_CONSTRAINTS['max_ratio']}"

    return True, None


@dataclass
class BayesianOptimizer:
    """Gaussian Process Bayesian optimization for multi-variable espresso tuning.

    Per-coffee instance — each coffee bag gets its own GP model.
    """

    coffee_name: str = "Unknown Coffee"
    variables: list[dict] = field(default_factory=lambda: DEFAULT_VARIABLES.copy())
    n_initial: int = MIN_RECOMMENDED_INITIAL
    _optimizer: Optimizer | None = field(default=None, init=False)
    _initialized: bool = field(default=False, init=False)
    _history: list[dict] = field(default_factory=list, init=False)

    def __post_init__(self) -> None:
        if not HAS_SKOPT:
            raise ImportError(
                "scikit-optimize is required for Bayesian optimization. "
                "Install it with: pip install scikit-optimize"
            )

    def _build_space(self) -> list[Real]:
        return [
            Real(v["min"], v["max"], name=v["name"]) for v in self.variables
        ]

    def initialize(self, seed_shots: list[dict] | None = None) -> dict:
        """Initialize the GP model. Seeds with existing valid shots if provided.

        Uses Latin Hypercube Sampling for remaining initial exploration points.
        """
        space = self._build_space()

        bounds = [(v["min"], v["max"]) for v in self.variables]
        lhs_points = _latin_hypercube(self.n_initial, bounds)

        self._optimizer = Optimizer(
            dimensions=space,
            base_estimator="GP",
            acq_func="EI",
            n_initial_points=0,
            random_state=42,
        )

        seeded_count = 0
        if seed_shots:
            for shot in seed_shots:
                x, ok = self._shot_to_x(shot)
                if ok:
                    taste = shot.get("taste_score")
                    if taste is not None and 1 <= taste <= 10:
                        self._optimizer.tell([x], [-float(taste)])
                        self._history.append({
                            **dict(zip([v["name"] for v in self.variables], x)),
                            "score": float(taste),
                            "shot_id": shot.get("id"),
                        })
                        seeded_count += 1

        remaining = max(0, self.n_initial - seeded_count)
        for i in range(remaining):
            idx = seeded_count + i
            if idx < len(lhs_points):
                x = lhs_points[idx].tolist()
            else:
                x = self._feasible_random_point()
            self._optimizer.tell([x], [-5.0])
            self._history.append({
                **dict(zip([v["name"] for v in self.variables], x)),
                "score": 5.0,
                "unobserved": True,
            })

        self._initialized = True

        suggestion = self._optimizer.ask()
        result = self._format_suggestion(suggestion)
        result["seeded_count"] = seeded_count
        result["total_observations"] = len(self._history)
        result["confidence"] = self._confidence_label()
        return result

    def suggest(self) -> dict:
        """Get the next experiment suggestion with EI rationale."""
        if not self._initialized or self._optimizer is None:
            raise RuntimeError("Call initialize() before suggest()")

        suggestion = self._optimizer.ask()
        result = self._format_suggestion(suggestion)
        result["ei_rationale"] = self._ei_rationale(suggestion)
        result["constraints"] = _constraints_satisfied(
            {v["name"]: suggestion[i] for i, v in enumerate(self.variables)}
        )
        result["confidence"] = self._confidence_label()
        return result

    def record(
        self,
        params: dict[str, float],
        score: float,
        *,
        valid_for_model: bool = True,
        taste_components: dict[str, float] | None = None,
    ) -> dict:
        """Record a shot result and update the model."""
        if not self._initialized or self._optimizer is None:
            raise RuntimeError("Call initialize() before record()")

        x = [params.get(v["name"], v["min"]) for v in self.variables]
        shot_entry = {**params, "score": score}
        if taste_components:
            shot_entry["taste_components"] = taste_components

        if valid_for_model:
            self._optimizer.tell(x, -score)
            self._history.append(shot_entry)

        result: dict = {
            "recorded": dict(zip([v["name"] for v in self.variables], x)),
            "score": score,
            "history_count": sum(1 for h in self._history if not h.get("unobserved")),
            "total_observations": len(self._history),
            "valid_for_model": valid_for_model,
        }

        if valid_for_model:
            suggestion = self._format_suggestion(None)
            result["suggestion"] = suggestion
            result["ei_rationale"] = self._ei_rationale(
                [suggestion.get(v["name"], 0) for v in self.variables]
            )
            result["contour_data"] = self.contour_data()

        result["confidence"] = self._confidence_label()
        return result

    def contour_data(self) -> dict:
        """Generate 2D contour data for grind vs dose with uncertainty."""
        if not self._initialized or self._optimizer is None:
            return {"x": [], "y": [], "z": [], "z_std": []}

        try:
            best_idx = np.argmin(self._optimizer.yi)
            best_x = self._optimizer.Xi[best_idx]
            fixed = dict(zip([v["name"] for v in self.variables], best_x))
        except (ValueError, IndexError, AttributeError):
            best_x = [(v["min"] + v["max"]) / 2 for v in self.variables]
            fixed = dict(zip([v["name"] for v in self.variables], best_x))

        grind_var = self.variables[0]
        dose_var = self.variables[1]

        grind_vals = np.linspace(grind_var["min"], grind_var["max"], 20)
        dose_vals = np.linspace(dose_var["min"], dose_var["max"], 20)

        z_grid = np.zeros((len(dose_vals), len(grind_vals)))
        z_std_grid = np.zeros((len(dose_vals), len(grind_vals)))

        for i in range(len(grind_vals)):
            for j in range(len(dose_vals)):
                point = []
                for v in self.variables:
                    if v["name"] == "grind":
                        point.append(grind_vals[i])
                    elif v["name"] == "dose":
                        point.append(dose_vals[j])
                    else:
                        point.append(fixed.get(v["name"], (v["min"] + v["max"]) / 2))
                try:
                    pred, std = self._optimizer.models[-1].predict(
                        np.array([point]), return_std=True
                    )
                    z_grid[j, i] = -float(pred[0])
                    z_std_grid[j, i] = float(std[0])
                except Exception:
                    z_grid[j, i] = 0.0
                    z_std_grid[j, i] = 0.0

        return {
            "x": grind_vals.tolist(),
            "y": dose_vals.tolist(),
            "z": z_grid.tolist(),
            "z_std": z_std_grid.tolist(),
            "x_label": "Grind",
            "y_label": "Dose (g)",
            "z_label": "Predicted Score",
            "z_std_label": "Uncertainty (σ)",
        }

    def _shot_to_x(self, shot: dict) -> tuple[list[float], bool]:
        """Convert a shot dict to optimizer input. Returns (x, is_valid)."""
        x = []
        for v in self.variables:
            val = shot.get(v["name"])
            if val is None:
                if v["name"] == "grind":
                    macro = shot.get("grind_macro")
                    micro = shot.get("grind_micro")
                    if macro is not None and micro is not None:
                        val = GrindSetting(macro=int(macro), micro=micro).to_float()
                    else:
                        return [], False
                else:
                    val = (v["min"] + v["max"]) / 2
            x.append(float(val))
        return x, True

    def _feasible_random_point(self) -> list[float]:
        """Generate a random point that satisfies espresso constraints."""
        bounds = [(v["min"], v["max"]) for v in self.variables]
        for _ in range(100):
            point = [float(np.random.uniform(lo, hi)) for lo, hi in bounds]
            params = dict(zip([v["name"] for v in self.variables], point))
            ok, _ = _constraints_satisfied(params)
            if ok:
                return point
        return [float(np.random.uniform(lo, hi)) for lo, hi in bounds]

    def _ei_rationale(self, x: list[float]) -> dict | None:
        """Compute Expected Improvement rationale for a suggested point."""
        if self._optimizer is None or self._optimizer.models is None:
            return None
        try:
            model = self._optimizer.models[-1]
            X = np.array([x])
            pred_mean, pred_std = model.predict(X, return_std=True)
            pred_mean = -pred_mean[0]
            pred_std = float(pred_std[0])

            yi = self._optimizer.yi
            valid_yi = [y for y in yi if -y >= 1]
            if not valid_yi:
                return None
            current_best = -min(valid_yi)

            improvement = max(0, pred_mean - current_best)
            return {
                "predicted_score": round(float(pred_mean), 2),
                "uncertainty": round(pred_std, 2),
                "current_best": round(float(current_best), 2),
                "expected_improvement": round(improvement, 2),
            }
        except Exception:
            return None

    def _confidence_label(self) -> str:
        """Return a confidence label based on observation count."""
        n_observed = sum(1 for h in self._history if not h.get("unobserved"))
        if n_observed < 3:
            return "Low"
        if n_observed < 8:
            return "Medium"
        if n_observed < 15:
            return "Good"
        return "High"

    def _format_suggestion(self, raw: list[float] | None) -> dict:
        """Format raw optimizer output into a suggestion dict."""
        suggestion: dict[str, float] = {}
        if raw is None and self._initialized and self._optimizer is not None:
            try:
                best_idx = np.argmin(self._optimizer.yi)
                suggestion = dict(
                    zip(
                        [v["name"] for v in self.variables],
                        [float(v) for v in self._optimizer.Xi[best_idx]],
                    )
                )
            except (ValueError, IndexError, AttributeError):
                pass
        elif raw is not None:
            suggestion = dict(
                zip([v["name"] for v in self.variables], [float(v) for v in raw])
            )

        if "grind" in suggestion:
            grind = GrindSetting.from_float(suggestion["grind"])
            suggestion["grind_macro"] = grind.macro
            suggestion["grind_micro"] = grind.micro
            suggestion["grind_display"] = str(grind)

        return suggestion

    def get_valid_shots_for_model(self) -> list[dict]:
        """Return only shots marked as valid for model training."""
        return [h for h in self._history if not h.get("unobserved")]

    def to_dict(self) -> dict:
        return {
            "coffee_name": self.coffee_name,
            "variables": self.variables,
            "n_initial": self.n_initial,
            "initialized": self._initialized,
            "history": self._history,
        }

    @staticmethod
    def from_dict(data: dict) -> BayesianOptimizer | None:
        if not HAS_SKOPT:
            return None
        bo = BayesianOptimizer(
            coffee_name=data.get("coffee_name", "Unknown Coffee"),
            variables=data.get("variables", DEFAULT_VARIABLES.copy()),
            n_initial=data.get("n_initial", MIN_RECOMMENDED_INITIAL),
        )
        bo._initialized = data.get("initialized", False)
        bo._history = data.get("history", [])
        if bo._initialized and bo._history:
            try:
                bo.initialize()
                for entry in bo._history:
                    x = [
                        entry.get(v["name"], v["min"])
                        for v in bo.variables
                    ]
                    if not entry.get("unobserved"):
                        bo._optimizer.tell(x, -entry["score"])
            except Exception:
                pass
        return bo
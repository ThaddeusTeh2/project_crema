"""Bayesian Optimization for multi-variable espresso recipe optimization.

Wraps scikit-optimize (skopt) for Gaussian Process regression with
Expected Improvement acquisition.
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


@dataclass
class BayesianOptimizer:
    """Gaussian Process Bayesian optimization for multi-variable espresso tuning."""

    variables: list[dict] = field(default_factory=lambda: DEFAULT_VARIABLES.copy())
    n_initial: int = 3
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

    def initialize(self) -> dict:
        """Initialize the GP model and return the first suggestion."""
        space = self._build_space()
        self._optimizer = Optimizer(
            dimensions=space,
            base_estimator="GP",
            acq_func="EI",
            n_initial_points=self.n_initial,
            random_state=42,
        )
        self._initialized = True

        suggestion = self._optimizer.ask()
        return self._format_suggestion(suggestion)

    def suggest(self) -> dict:
        """Get the next experiment suggestion."""
        if not self._initialized or self._optimizer is None:
            raise RuntimeError("Call initialize() before suggest()")

        suggestion = self._optimizer.ask()
        return self._format_suggestion(suggestion)

    def record(self, params: dict[str, float], score: float) -> dict:
        """Record a shot result and update the model.

        Returns the next suggestion for the next shot.
        """
        if not self._initialized or self._optimizer is None:
            raise RuntimeError("Call initialize() before record()")

        x = [params.get(v["name"], v["min"]) for v in self.variables]
        self._optimizer.tell(x, -score)

        self._history.append({**params, "score": score})

        params_out = dict(zip([v["name"] for v in self.variables], x))
        suggestion = self._format_suggestion(None)

        return {
            "recorded": params_out,
            "score": score,
            "iteration": len(self._history),
            "suggestion": suggestion,
            "contour_data": self.contour_data(),
        }

    def contour_data(self) -> dict:
        """Generate 2D contour data for grind vs dose, holding other vars at optimum."""
        if not self._initialized or self._optimizer is None:
            return {"x": [], "y": [], "z": []}

        try:
            best_idx = np.argmin(self._optimizer.yi)
            best_x = self._optimizer.Xi[best_idx]
            fixed = dict(zip([v["name"] for v in self.variables], best_x))
        except (ValueError, IndexError, AttributeError):
            best_x = [
                (v["min"] + v["max"]) / 2 for v in self.variables
            ]
            fixed = dict(zip([v["name"] for v in self.variables], best_x))

        grind_var = self.variables[0]
        dose_var = self.variables[1]

        grind_vals = np.linspace(grind_var["min"], grind_var["max"], 20)
        dose_vals = np.linspace(dose_var["min"], dose_var["max"], 20)

        x_grid, y_grid = np.meshgrid(grind_vals, dose_vals)
        z_grid = np.zeros_like(x_grid)

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
                    pred = self._optimizer.models[-1].predict(
                        np.array([point]), return_std=False
                    )
                    z_grid[j, i] = -float(pred[0])
                except Exception:
                    z_grid[j, i] = 0.0

        return {
            "x": grind_vals.tolist(),
            "y": dose_vals.tolist(),
            "z": z_grid.tolist(),
            "x_label": "Grind",
            "y_label": "Dose (g)",
            "z_label": "Predicted Score",
        }

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

    def to_dict(self) -> dict:
        return {
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
            variables=data.get("variables", DEFAULT_VARIABLES.copy()),
            n_initial=data.get("n_initial", 3),
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
                    bo._optimizer.tell(x, -entry["score"])
            except Exception:
                pass
        return bo
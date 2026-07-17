"""Golden Section Search for maximizing espresso taste.

Now accepts a 5-point preference scale:
    strongly_a (-2) < slightly_a (-1) < same (0) < slightly_b (+1) < strongly_b (+2)

Default behaviour when both points weight equally: fallback to "a" selection.
"""

from dataclasses import dataclass

from .grind import GrindSetting

PHI = (1 + 5**0.5) / 2

PREFERENCE_WEIGHTS = {
    "strongly_a": -2,
    "slightly_a": -1,
    "same": 0,
    "slightly_b": 1,
    "strongly_b": 2,
}


@dataclass
class GoldenSectionSearch:
    """Golden section search to find the grind setting that maximizes taste.

    Uses a 5-point preference comparison for richer ranking data.
    Converges when interval width <= tolerance (in float grind units).
    """

    coarse: GrindSetting
    fine: GrindSetting
    tolerance: float = 0.5
    _a: float = 0.0
    _b: float = 0.0
    _c: float = 0.0
    _d: float = 0.0
    _initialized: bool = False
    _converged: bool = False
    _iteration: int = 0

    def __post_init__(self) -> None:
        self._a = self.fine.to_float()
        self._b = self.coarse.to_float()

    def initial_points(self) -> dict:
        """Return the two initial test points (A and B)."""
        width = self._b - self._a
        self._c = self._b - width / PHI
        self._d = self._a + width / PHI
        self._initialized = True
        return {
            "point_a": GrindSetting.from_float(self._c),
            "point_b": GrindSetting.from_float(self._d),
        }

    def compare(self, preference: str) -> dict:
        """Record which test point tasted better using 5-point scale.

        Args:
            preference: "strongly_a", "slightly_a", "same", "slightly_b", or "strongly_b"

        Returns dict with:
            action: "pull_new" or "done"
            new_point: GrindSetting | None
            retained_point: GrindSetting | None
            converged: bool
            width: float
            preference: str
            weight: int (-2 to +2)
        """
        if not self._initialized:
            raise RuntimeError("Call initial_points() before compare()")

        if self._converged:
            return {
                "action": "done",
                "new_point": None,
                "retained_point": None,
                "converged": True,
                "width": round(self._b - self._a, 2),
                "preference": preference,
                "weight": PREFERENCE_WEIGHTS.get(preference, 0),
            }

        self._iteration += 1
        weight = PREFERENCE_WEIGHTS.get(preference, 0)

        if weight <= 0:
            self._b = self._d
            self._d = self._c
            self._c = self._b - (self._b - self._a) / PHI
        else:
            self._a = self._c
            self._c = self._d
            self._d = self._a + (self._b - self._a) / PHI

        width = self._b - self._a

        if width <= self.tolerance:
            self._converged = True
            best = GrindSetting.from_float((self._a + self._b) / 2)
            return {
                "action": "done",
                "new_point": None,
                "retained_point": None,
                "converged": True,
                "width": round(width, 2),
                "best_grind": best,
                "preference": preference,
                "weight": weight,
            }

        return {
            "action": "pull_new",
            "new_point": GrindSetting.from_float(self._c),
            "retained_point": GrindSetting.from_float(self._d),
            "converged": False,
            "width": round(width, 2),
            "preference": preference,
            "weight": weight,
        }

    @property
    def converged(self) -> bool:
        return self._converged

    @property
    def iteration(self) -> int:
        return self._iteration

    def to_dict(self) -> dict:
        return {
            "coarse": self.coarse.to_dict(),
            "fine": self.fine.to_dict(),
            "tolerance": self.tolerance,
            "a": self._a,
            "b": self._b,
            "c": self._c,
            "d": self._d,
            "initialized": self._initialized,
            "converged": self._converged,
            "iteration": self._iteration,
        }

    @staticmethod
    def from_dict(data: dict) -> "GoldenSectionSearch":
        gs = GoldenSectionSearch(
            coarse=GrindSetting.from_dict(data["coarse"]),
            fine=GrindSetting.from_dict(data["fine"]),
            tolerance=data.get("tolerance", 0.5),
        )
        gs._a = data.get("a", gs._a)
        gs._b = data.get("b", gs._b)
        gs._c = data.get("c", gs._c)
        gs._d = data.get("d", gs._d)
        gs._initialized = data.get("initialized", False)
        gs._converged = data.get("converged", False)
        gs._iteration = data.get("iteration", 0)
        return gs
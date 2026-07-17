"""Golden Section Search for maximizing espresso taste."""

from dataclasses import dataclass

from .grind import GrindSetting

PHI = (1 + 5**0.5) / 2


@dataclass
class GoldenSectionSearch:
    """Golden section search to find the grind setting that maximizes taste.

    After an initial pair of shots, each iteration requires only one new shot
    because one test point from the previous iteration is retained.

    Converges when the interval width is <= tolerance (in float grind units).
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
    _retained: str = ""  # "c" or "d"

    def __post_init__(self) -> None:
        self._a = self.fine.to_float()
        self._b = self.coarse.to_float()

    def initial_points(self) -> dict:
        """Return the two initial test points to pull (A and B).

        Must be called before compare().
        """
        width = self._b - self._a
        self._c = self._b - width / PHI
        self._d = self._a + width / PHI
        self._initialized = True

        return {
            "point_a": GrindSetting.from_float(self._c),
            "point_b": GrindSetting.from_float(self._d),
        }

    def compare(self, winner: str) -> dict:
        """Record which test point tasted better and return the next action.

        Args:
            winner: "a" (point_c) or "b" (point_d)

        Returns dict with:
            action: "pull_new" or "done"
            new_point: GrindSetting | None (the single new shot to pull)
            retained_point: GrindSetting | None (compare new shot against this)
            converged: bool
            width: float (current interval width)
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
            }

        self._iteration += 1

        if winner == "a":
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
            }

        return {
            "action": "pull_new",
            "new_point": GrindSetting.from_float(self._c),
            "retained_point": GrindSetting.from_float(self._d),
            "converged": False,
            "width": round(width, 2),
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
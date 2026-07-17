"""Secant Method for dialing in espresso shot time."""

from dataclasses import dataclass, field

from .grind import GrindSetting


@dataclass
class SecantMethod:
    """Iterative root-finding to reach a target espresso shot time.

    Uses linear interpolation (secant method) between the two most recent
    (grind, time) observations to estimate the next grind setting.

    Converges when |time - target| <= tolerance.
    """

    target_time: float
    tolerance: float = 1.0
    max_iterations: int = 10
    history: list[dict] = field(default_factory=list)
    _converged: bool = field(default=False, init=False)
    _iteration: int = field(default=0, init=False)

    def record_shot(self, grind: GrindSetting, shot_time: float) -> dict:
        """Record a shot's time and return the next grind suggestion.

        Returns a dict with keys:
            next_grind: GrindSetting or None (if converged)
            converged: bool
            iteration: int
            error: float | None (seconds from target)
        """
        if self._converged:
            return {
                "next_grind": None,
                "converged": True,
                "iteration": self._iteration,
                "error": abs(shot_time - self.target_time),
            }

        self._iteration += 1
        entry = {
            "iteration": self._iteration,
            "grind": str(grind),
            "time": shot_time,
        }
        self.history.append(entry)

        error = shot_time - self.target_time
        entry["error"] = round(error, 1)

        if abs(error) <= self.tolerance or self._iteration >= self.max_iterations:
            self._converged = True
            return {
                "next_grind": None,
                "converged": True,
                "iteration": self._iteration,
                "error": round(abs(error), 1),
            }

        next_grind = self._compute_next(grind, shot_time)
        return {
            "next_grind": next_grind,
            "converged": False,
            "iteration": self._iteration,
            "error": round(abs(error), 1),
        }

    def _compute_next(self, current_grind: GrindSetting, current_time: float) -> GrindSetting:
        """Compute the next grind using secant interpolation or bisection fallback."""
        g_n = current_grind.to_float()
        t_n = current_time

        if len(self.history) < 2:
            step = self._initial_step(g_n, t_n)
            return GrindSetting.from_float(g_n + step)

        prev = self.history[-2]
        prev_grind = self._parse_grind(prev["grind"])
        g_prev = prev_grind.to_float()
        t_prev = prev["time"]

        if abs(t_n - t_prev) < 0.5:
            return self._bisection_step(current_grind, current_time)

        denom = t_n - t_prev
        g_next = g_n - (t_n - self.target_time) * (g_n - g_prev) / denom
        return GrindSetting.from_float(g_next)

    def _initial_step(self, g_n: float, t_n: float) -> float:
        """Estimate an initial step size based on how far off the time is."""
        error_ratio = (self.target_time - t_n) / self.target_time
        step = error_ratio * 3.0
        if abs(step) < 0.5:
            step = 0.5 if step >= 0 else -0.5
        return step

    def _bisection_step(self, current_grind: GrindSetting, current_time: float) -> GrindSetting:
        """Fallback: move halfway toward the target direction using a minimal
        reference slope."""
        error = self.target_time - current_time
        if error > 0:
            direction = -1.0
        else:
            direction = 1.0
        step_size = max(0.5, abs(error) / self.target_time * 2.0)
        g_next = current_grind.to_float() + direction * step_size
        return GrindSetting.from_float(g_next)

    @property
    def converged(self) -> bool:
        return self._converged

    def to_dict(self) -> dict:
        return {
            "target_time": self.target_time,
            "tolerance": self.tolerance,
            "max_iterations": self.max_iterations,
            "history": self.history,
            "converged": self._converged,
            "iteration": self._iteration,
        }

    @staticmethod
    def _parse_grind(s: str) -> GrindSetting:
        """Parse a grind string like '17C' into a GrindSetting."""
        s = s.strip()
        macro = int(s[:-1])
        micro = s[-1]
        return GrindSetting(macro=macro, micro=micro)

    @staticmethod
    def from_dict(data: dict) -> "SecantMethod":
        secant = SecantMethod(
            target_time=data["target_time"],
            tolerance=data.get("tolerance", 1.0),
            max_iterations=data.get("max_iterations", 10),
        )
        secant.history = data.get("history", [])
        secant._converged = data.get("converged", False)
        secant._iteration = data.get("iteration", 0)
        return secant
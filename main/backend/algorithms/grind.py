"""GrindSetting value object for Baratza Sette 270 grind settings."""

from __future__ import annotations

from dataclasses import dataclass

MICRO_STEPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I"]
MIN_MACRO = 1
MAX_MACRO = 31
MIN_FLOAT = 1.0
MAX_FLOAT = 31.8


@dataclass(frozen=True)
class GrindSetting:
    """Represents a grind setting on the Baratza Sette 270.

    The Sette 270 has two adjustment rings:
    - Macro: 1–31 (1 = finest, 31 = coarsest)
    - Micro: A–I (A = finest, I = coarsest), stepless within each letter band

    A setting like "17C" means macro=17, micro=C.
    """

    macro: int
    micro: str

    def __post_init__(self) -> None:
        if not (MIN_MACRO <= self.macro <= MAX_MACRO):
            raise ValueError(
                f"Macro must be between {MIN_MACRO} and {MAX_MACRO}, got {self.macro}"
            )
        if self.micro not in MICRO_STEPS:
            raise ValueError(
                f"Micro must be one of {MICRO_STEPS}, got '{self.micro}'"
            )

    def to_float(self) -> float:
        """Convert to a continuous numeric value.

        A=0.0, B=0.1, ..., I=0.8.
        So 17C → 17.2.
        """
        micro_idx = MICRO_STEPS.index(self.micro)
        return float(self.macro) + micro_idx / 10.0

    @staticmethod
    def from_float(value: float) -> GrindSetting:
        """Convert a continuous float back to the nearest valid GrindSetting.

        17.2 → GrindSetting(17, 'C')
        Clamps to the valid range [1.0, 31.8].
        """
        clamped = max(MIN_FLOAT, min(MAX_FLOAT, value))
        macro = int(clamped)
        frac = clamped - macro
        micro_idx = round(frac * 10)
        if micro_idx >= len(MICRO_STEPS):
            macro += 1
            micro_idx = 0
        if macro > MAX_MACRO:
            macro = MAX_MACRO
            micro_idx = len(MICRO_STEPS) - 1
        return GrindSetting(macro=macro, micro=MICRO_STEPS[micro_idx])

    @staticmethod
    def from_dict(data: dict) -> GrindSetting:
        """Create from a dict with 'macro' and 'micro' keys."""
        return GrindSetting(macro=data["macro"], micro=data["micro"])

    def to_dict(self) -> dict:
        """Serialize to a dict."""
        return {"macro": self.macro, "micro": self.micro}

    def __str__(self) -> str:
        return f"{self.macro}{self.micro}"

    def __repr__(self) -> str:
        return f"GrindSetting({self.macro}, '{self.micro}')"
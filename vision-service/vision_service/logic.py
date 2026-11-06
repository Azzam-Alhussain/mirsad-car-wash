"""Pure vision logic. No camera, model, or network dependency is required here."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Iterable
from uuid import uuid4

Point = tuple[float, float]


def point_in_polygon(point: Point, polygon: Iterable[Point]) -> bool:
    """Ray-casting test for a normalized camera-zone polygon."""
    x, y = point
    vertices = list(polygon)
    if len(vertices) < 3:
        return False
    inside = False
    previous = vertices[-1]
    for current in vertices:
        x1, y1 = previous
        x2, y2 = current
        if (y1 > y) != (y2 > y):
            intersection_x = (x2 - x1) * (y - y1) / (y2 - y1) + x1
            if x < intersection_x:
                inside = not inside
        previous = current
    return inside


def classify_vehicle(class_name: str, normalized_area: float, medium_area: float, large_area: float) -> str:
    """Calibrated heuristic: known heavy classes first, then apparent bbox area."""
    if not 0 <= medium_area < large_area < 1:
        raise ValueError("Area thresholds must satisfy 0 <= medium < large < 1")
    if class_name.lower() in {"bus", "truck"}:
        return "large"
    if normalized_area >= large_area:
        return "large"
    if normalized_area >= medium_area:
        return "medium"
    return "small"


@dataclass(frozen=True)
class EventDecision:
    phase: str
    tracking_id: str
    bay: int
    size: str | None = None
    confidence: float | None = None


@dataclass
class _Track:
    candidate_bay: int | None = None
    candidate_frames: int = 0
    active_bay: int | None = None
    outside_frames: int = 0
    tracking_id: str | None = None
    confidence_sum: float = 0.0
    confidence_samples: int = 0
    exited: bool = False


class BayLifecycle:
    """Consecutive-frame state machine that suppresses single-frame false events."""

    def __init__(
        self,
        camera_id: str,
        entry_frames: int = 3,
        exit_frames: int = 8,
        id_factory: Callable[[], str] | None = None,
    ) -> None:
        if entry_frames < 1 or exit_frames < 1:
            raise ValueError("entry_frames and exit_frames must be positive")
        self.camera_id = camera_id
        self.entry_frames = entry_frames
        self.exit_frames = exit_frames
        self.id_factory = id_factory or (lambda: uuid4().hex[:12])
        self.tracks: dict[int, _Track] = {}

    def update(
        self,
        raw_track_id: int,
        bay: int | None,
        size: str,
        confidence: float,
    ) -> EventDecision | None:
        track = self.tracks.setdefault(raw_track_id, _Track())
        if track.exited:
            return None

        track.confidence_sum += min(1.0, max(0.0, confidence))
        track.confidence_samples += 1

        if track.active_bay is None:
            if bay is None:
                track.candidate_bay = None
                track.candidate_frames = 0
                return None
            if track.candidate_bay == bay:
                track.candidate_frames += 1
            else:
                track.candidate_bay = bay
                track.candidate_frames = 1
            if track.candidate_frames < self.entry_frames:
                return None

            track.active_bay = bay
            track.tracking_id = f"{self.camera_id}-{raw_track_id}-{self.id_factory()}"
            mean_confidence = track.confidence_sum / track.confidence_samples
            return EventDecision("entry", track.tracking_id, bay, size, round(mean_confidence, 4))

        if bay == track.active_bay:
            track.outside_frames = 0
            return None
        track.outside_frames += 1
        if track.outside_frames < self.exit_frames:
            return None

        track.exited = True
        return EventDecision("exit", track.tracking_id or "", track.active_bay)

    def retire(self, raw_track_id: int) -> None:
        self.tracks.pop(raw_track_id, None)

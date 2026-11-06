from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from .logic import Point


_ENV = re.compile(r"\$\{([A-Z0-9_]+)\}")


def _expand(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _expand(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_expand(item) for item in value]
    if isinstance(value, str):
        def replace(match: re.Match[str]) -> str:
            name = match.group(1)
            if name not in os.environ:
                raise ValueError(f"Required environment variable {name} is not set")
            return os.environ[name]
        return _ENV.sub(replace, value)
    return value


@dataclass(frozen=True)
class Zone:
    bay: int
    polygon: tuple[Point, ...]


@dataclass(frozen=True)
class Camera:
    camera_id: str
    rtsp_url: str
    zones: tuple[Zone, ...]


@dataclass(frozen=True)
class Config:
    api_url: str
    api_key: str
    model: str
    confidence: float
    vehicle_class_ids: tuple[int, ...]
    frame_skip: int
    entry_frames: int
    exit_frames: int
    medium_area: float
    large_area: float
    captures_dir: Path
    request_timeout: float
    reconnect_seconds: float
    storage: dict[str, Any]
    cameras: tuple[Camera, ...]


def load_config(path: str) -> Config:
    raw = _expand(yaml.safe_load(Path(path).read_text(encoding="utf-8")))
    service = raw["service"]
    size = service.get("size", {})
    api_key = os.environ.get("VISION_API_KEY", service.get("api_key", "")).strip()
    if not api_key:
        raise ValueError("VISION_API_KEY is required")
    cameras = tuple(
        Camera(
            camera_id=str(camera["id"]),
            rtsp_url=str(camera["rtsp_url"]),
            zones=tuple(
                Zone(int(zone["bay"]), tuple((float(x), float(y)) for x, y in zone["polygon"]))
                for zone in camera["zones"]
            ),
        )
        for camera in raw["cameras"]
    )
    if not cameras or any(not camera.zones for camera in cameras):
        raise ValueError("At least one camera and one bay zone per camera are required")
    for camera in cameras:
        bays = [zone.bay for zone in camera.zones]
        if len(bays) != len(set(bays)) or any(bay < 1 for bay in bays):
            raise ValueError(f"Camera {camera.camera_id} has invalid or duplicate bay zones")
        for zone in camera.zones:
            if len(zone.polygon) < 3 or any(not 0 <= x <= 1 or not 0 <= y <= 1 for x, y in zone.polygon):
                raise ValueError(f"Camera {camera.camera_id}, bay {zone.bay}: polygon must be normalized")

    config = Config(
        api_url=os.environ.get("MIRSAD_API_URL", service["api_url"]).rstrip("/"),
        api_key=api_key,
        model=str(service.get("model", "yolo11n.pt")),
        confidence=float(service.get("confidence", 0.45)),
        vehicle_class_ids=tuple(int(item) for item in service.get("vehicle_class_ids", [2, 5, 7])),
        frame_skip=max(1, int(service.get("frame_skip", 2))),
        entry_frames=max(1, int(service.get("entry_frames", 3))),
        exit_frames=max(1, int(service.get("exit_frames", 8))),
        medium_area=float(size.get("medium_area", 0.035)),
        large_area=float(size.get("large_area", 0.09)),
        captures_dir=Path(service.get("captures_dir", "./captures")),
        request_timeout=float(service.get("request_timeout_seconds", 10)),
        reconnect_seconds=float(service.get("reconnect_seconds", 5)),
        storage=service.get("storage", {}),
        cameras=cameras,
    )
    if not 0 <= config.medium_area < config.large_area < 1:
        raise ValueError("size thresholds must satisfy 0 <= medium_area < large_area < 1")
    return config

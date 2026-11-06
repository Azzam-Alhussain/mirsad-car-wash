from __future__ import annotations

import argparse
import logging
import os
import signal
import threading
import time
from datetime import datetime, timezone

os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp")

import cv2  # noqa: E402
from ultralytics import YOLO  # noqa: E402

from .captures import CaptureStore  # noqa: E402
from .client import EventClient  # noqa: E402
from .config import Camera, Config, load_config  # noqa: E402
from .logic import BayLifecycle, classify_vehicle, point_in_polygon  # noqa: E402

logger = logging.getLogger(__name__)


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class CameraWorker:
    def __init__(self, config: Config, camera: Camera, stop: threading.Event) -> None:
        self.config = config
        self.camera = camera
        self.stop = stop
        self.lifecycle = BayLifecycle(camera.camera_id, config.entry_frames, config.exit_frames)
        self.captures = CaptureStore(config.captures_dir / camera.camera_id, config.storage)
        self.client = EventClient(
            config.api_url,
            config.api_key,
            config.request_timeout,
            config.captures_dir.parent / "spool" / f"{camera.camera_id}.jsonl",
        )
        # One tracker instance per camera: tracker IDs must never be shared across streams.
        self.model = YOLO(config.model)

    def _bay_and_area(self, box: Any, width: int, height: int) -> tuple[int | None, float]:
        x1, y1, x2, y2 = (float(value) for value in box.xyxy[0].tolist())
        bottom_center = ((x1 + x2) / (2 * width), y2 / height)
        area = max(0.0, x2 - x1) * max(0.0, y2 - y1) / (width * height)
        for zone in self.camera.zones:
            if point_in_polygon(bottom_center, zone.polygon):
                return zone.bay, area
        return None, area

    def _process_frame(self, frame: Any) -> None:
        height, width = frame.shape[:2]
        results = self.model.track(
            frame,
            persist=True,
            tracker="bytetrack.yaml",
            conf=self.config.confidence,
            classes=list(self.config.vehicle_class_ids),
            verbose=False,
        )
        boxes = results[0].boxes
        if boxes is None or boxes.id is None:
            return
        names = results[0].names
        for index, raw_id in enumerate(boxes.id.int().cpu().tolist()):
            box = boxes[index]
            class_name = str(names[int(box.cls[0].item())])
            confidence = float(box.conf[0].item())
            bay, area = self._bay_and_area(box, width, height)
            size = classify_vehicle(class_name, area, self.config.medium_area, self.config.large_area)
            decision = self.lifecycle.update(int(raw_id), bay, size, confidence)
            if decision is None:
                continue

            image_url = self.captures.save(frame, decision.tracking_id, decision.phase)
            payload = {
                "phase": decision.phase,
                "trackingId": decision.tracking_id,
                "cameraId": self.camera.camera_id,
                "bay": decision.bay,
                "timestamp": utc_timestamp(),
            }
            if image_url:
                payload["imageUrl"] = image_url
            if decision.phase == "entry":
                payload.update({"size": decision.size, "confidence": decision.confidence})
            self.client.submit(payload)
            logger.info("%s %s bay=%s size=%s", self.camera.camera_id, decision.phase, decision.bay, decision.size or "-")
            if decision.phase == "exit":
                self.lifecycle.retire(int(raw_id))

    def run(self) -> None:
        logger.info("Starting camera %s", self.camera.camera_id)
        frame_index = 0
        while not self.stop.is_set():
            capture = cv2.VideoCapture(self.camera.rtsp_url, cv2.CAP_FFMPEG)
            if not capture.isOpened():
                logger.error("Cannot open camera %s; retrying", self.camera.camera_id)
                capture.release()
                self.stop.wait(self.config.reconnect_seconds)
                continue
            logger.info("Connected to camera %s", self.camera.camera_id)
            while not self.stop.is_set():
                ok, frame = capture.read()
                if not ok:
                    logger.warning("Camera %s stream interrupted", self.camera.camera_id)
                    break
                frame_index += 1
                if frame_index % self.config.frame_skip:
                    continue
                try:
                    self._process_frame(frame)
                    if frame_index % 50 == 0:
                        self.client.flush()
                except Exception:
                    logger.exception("Camera %s frame processing failed", self.camera.camera_id)
                    self.stop.wait(0.5)
            capture.release()
            self.stop.wait(self.config.reconnect_seconds)


def main() -> None:
    parser = argparse.ArgumentParser(description="Mirsad RTSP/YOLO/ByteTrack vision worker")
    parser.add_argument("--config", default="cameras.yaml")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    config = load_config(args.config)
    stop = threading.Event()

    def request_stop(_signum: int, _frame: Any) -> None:
        stop.set()

    signal.signal(signal.SIGINT, request_stop)
    signal.signal(signal.SIGTERM, request_stop)
    threads = [
        threading.Thread(target=CameraWorker(config, camera, stop).run, name=camera.camera_id, daemon=True)
        for camera in config.cameras
    ]
    for thread in threads:
        thread.start()
    while not stop.is_set() and any(thread.is_alive() for thread in threads):
        stop.wait(1)
    logger.info("Vision service stopped")


if __name__ == "__main__":
    main()

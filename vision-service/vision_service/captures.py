from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2

logger = logging.getLogger(__name__)


class CaptureStore:
    def __init__(self, directory: Path, storage: dict[str, Any]) -> None:
        self.directory = directory
        self.directory.mkdir(parents=True, exist_ok=True)
        self.bucket = str(storage.get("s3_bucket") or "").strip()
        self.prefix = str(storage.get("s3_prefix") or "mirsad").strip("/")
        self.public_base_url = str(storage.get("public_base_url") or "").rstrip("/")
        self.s3 = None
        if self.bucket:
            if not self.public_base_url:
                raise ValueError("storage.public_base_url is required with s3_bucket for durable image links")
            import boto3
            self.s3 = boto3.client(
                "s3",
                endpoint_url=str(storage.get("s3_endpoint_url") or "") or None,
                region_name=str(storage.get("s3_region") or "") or None,
            )

    def save(self, frame: Any, tracking_id: str, phase: str) -> str | None:
        ok, encoded = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 88])
        if not ok:
            logger.error("Could not encode %s capture for %s", phase, tracking_id)
            return None
        safe_id = re.sub(r"[^A-Za-z0-9_-]", "-", tracking_id)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        filename = f"{safe_id}-{phase}-{timestamp}.jpg"
        try:
            (self.directory / filename).write_bytes(encoded.tobytes())
        except OSError as error:
            logger.error("Capture storage failed; the vehicle event will still be delivered: %s", error)
            return None
        key = f"{self.prefix}/{filename}" if self.prefix else filename
        if self.s3:
            try:
                self.s3.put_object(Bucket=self.bucket, Key=key, Body=encoded.tobytes(), ContentType="image/jpeg")
            except Exception as error:  # Cloud SDK exceptions vary by provider.
                logger.error("Capture upload failed; local JPEG was retained: %s", error)
                return None
        return f"{self.public_base_url}/{key}" if self.public_base_url else None

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)


class EventClient:
    """Authenticated client with a small disk spool for network outages."""

    def __init__(self, api_url: str, api_key: str, timeout: float, spool_path: Path) -> None:
        self.endpoint = f"{api_url}/api/vision/events"
        self.api_key = api_key
        self.timeout = timeout
        self.spool_path = spool_path
        self.spool_path.parent.mkdir(parents=True, exist_ok=True)
        self.session = requests.Session()
        retry = Retry(
            total=4,
            connect=4,
            read=4,
            backoff_factor=0.5,
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=frozenset({"POST"}),
        )
        self.session.mount("https://", HTTPAdapter(max_retries=retry))
        self.session.mount("http://", HTTPAdapter(max_retries=retry))

    def _post(self, payload: dict[str, Any]) -> None:
        response = self.session.post(
            self.endpoint,
            json=payload,
            headers={"x-api-key": self.api_key},
            timeout=self.timeout,
        )
        response.raise_for_status()

    def submit(self, payload: dict[str, Any]) -> None:
        self.flush()
        if self.spool_path.exists():
            self._append(payload)
            return
        try:
            self._post(payload)
        except requests.RequestException as error:
            logger.error("Event delivery failed; writing to local retry spool: %s", error)
            self._append(payload)

    def _append(self, payload: dict[str, Any]) -> None:
        with self.spool_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload, separators=(",", ":")) + "\n")

    def flush(self) -> None:
        if not self.spool_path.exists():
            return
        try:
            lines = self.spool_path.read_text(encoding="utf-8").splitlines()
        except OSError as error:
            logger.error("Cannot read event spool: %s", error)
            return
        for index, line in enumerate(lines):
            if not line.strip():
                continue
            try:
                self._post(json.loads(line))
            except (requests.RequestException, json.JSONDecodeError) as error:
                logger.error("Retry spool is waiting for the API: %s", error)
                remaining = "\n".join(lines[index:]) + "\n"
                temporary = self.spool_path.with_suffix(".tmp")
                temporary.write_text(remaining, encoding="utf-8")
                temporary.replace(self.spool_path)
                return
        self.spool_path.unlink(missing_ok=True)

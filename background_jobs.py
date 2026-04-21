from __future__ import annotations

import json
import logging
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable


LOGGER = logging.getLogger("cominote.jobs")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class JobRecord:
    job_id: str
    status: str
    progress: int
    stage: str
    message: str
    created_at: str
    updated_at: str
    result: dict[str, Any] | None = None
    error: str | None = None
    meta: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class JobManager:
    def __init__(self, storage_dir: Path, max_workers: int = 2) -> None:
        self.storage_dir = storage_dir
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self._executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="cominote-job")
        self._lock = threading.Lock()
        self._jobs: dict[str, JobRecord] = {}

    def create_job(
        self,
        *,
        payload: dict[str, Any],
        worker: Callable[[str, dict[str, Any], Callable[[str, int, str, dict[str, Any] | None], None]], dict[str, Any]],
    ) -> JobRecord:
        job_id = uuid.uuid4().hex[:12]
        now = utc_now_iso()
        record = JobRecord(
            job_id=job_id,
            status="queued",
            progress=0,
            stage="queued",
            message="Your comic job is waiting to start.",
            created_at=now,
            updated_at=now,
            meta={"title": payload.get("title", ""), "subject": payload.get("subject", "")},
        )
        with self._lock:
            self._jobs[job_id] = record
        self._save(record)
        self._executor.submit(self._run, record.job_id, payload, worker)
        return record

    def get_job(self, job_id: str) -> dict[str, Any]:
        with self._lock:
            record = self._jobs.get(job_id)
        if record is not None:
            return record.to_dict()

        path = self.storage_dir / f"{job_id}.json"
        if not path.exists():
            raise FileNotFoundError(job_id)

        payload = json.loads(path.read_text(encoding="utf-8"))
        record = JobRecord(**payload)
        with self._lock:
            self._jobs[job_id] = record
        return record.to_dict()

    def _run(
        self,
        job_id: str,
        payload: dict[str, Any],
        worker: Callable[[str, dict[str, Any], Callable[[str, int, str, dict[str, Any] | None], None]], dict[str, Any]],
    ) -> None:
        self._update(job_id, status="running", progress=5, stage="starting", message="Comic generation has started.")
        try:
            result = worker(job_id, payload, self._progress_reporter(job_id))
            self._update(
                job_id,
                status="completed",
                progress=100,
                stage="completed",
                message="Your comic is ready.",
                result=result,
                error=None,
            )
        except Exception as exc:  # pragma: no cover - defensive background error path
            LOGGER.exception("Background job %s failed", job_id)
            self._update(
                job_id,
                status="failed",
                progress=100,
                stage="failed",
                message="Comic generation failed.",
                error=str(exc),
            )

    def _progress_reporter(
        self, job_id: str
    ) -> Callable[[str, int, str, dict[str, Any] | None], None]:
        def reporter(stage: str, progress: int, message: str, meta: dict[str, Any] | None = None) -> None:
            self._update(
                job_id,
                status="running",
                stage=stage,
                progress=max(0, min(int(progress), 100)),
                message=message,
                meta=meta,
            )

        return reporter

    def _update(self, job_id: str, **changes: Any) -> None:
        with self._lock:
            record = self._jobs.get(job_id)
            if record is None:
                path = self.storage_dir / f"{job_id}.json"
                if path.exists():
                    record = JobRecord(**json.loads(path.read_text(encoding="utf-8")))
                else:
                    raise FileNotFoundError(job_id)
            for key, value in changes.items():
                if key == "meta" and value:
                    if record.meta is None:
                        record.meta = {}
                    record.meta.update(value)
                    continue
                setattr(record, key, value)
            record.updated_at = utc_now_iso()
            self._jobs[job_id] = record
            self._save(record)

    def _save(self, record: JobRecord) -> None:
        path = self.storage_dir / f"{record.job_id}.json"
        path.write_text(json.dumps(record.to_dict(), indent=2), encoding="utf-8")

import pytest

from api.job_queue import submit_and_wait, queue_enabled, QueueBusy, QueueJobError


class _StubJob:
    def __init__(self, statuses, result=None, exc_info=None):
        self._statuses = list(statuses)
        self._result = result
        self.exc_info = exc_info

    def get_status(self, refresh=True):
        # Hold on the last status once the script is exhausted.
        return self._statuses.pop(0) if len(self._statuses) > 1 else self._statuses[0]

    def return_value(self):
        return self._result


class _StubQueue:
    def __init__(self, job):
        self._job = job
        self.enqueued = None

    def enqueue(self, func, **kw):
        self.enqueued = (func, kw)
        return self._job


def _noop(**_kw):
    return None


def test_returns_worker_result_when_finished():
    q = _StubQueue(_StubJob(["queued", "started", "finished"], result={"ok": 1}))
    out = submit_and_wait(_noop, {"a": 1}, job_timeout=5, max_wait=5, queue=q, poll_interval=0)
    assert out == {"ok": 1}
    assert q.enqueued[1]["kwargs"] == {"a": 1}


def test_raises_queue_job_error_on_failure():
    q = _StubQueue(_StubJob(["failed"], exc_info="Traceback ... ValueError: boom"))
    with pytest.raises(QueueJobError):
        submit_and_wait(_noop, {}, job_timeout=5, max_wait=5, queue=q, poll_interval=0)


def test_raises_queue_busy_on_timeout():
    q = _StubQueue(_StubJob(["queued"]))  # never finishes
    with pytest.raises(QueueBusy):
        submit_and_wait(_noop, {}, job_timeout=5, max_wait=0.05, queue=q, poll_interval=0.01)


def test_queue_enabled_reads_env(monkeypatch):
    monkeypatch.setenv("QUERY_QUEUE_ENABLED", "true")
    assert queue_enabled() is True
    monkeypatch.setenv("QUERY_QUEUE_ENABLED", "0")
    assert queue_enabled() is False
    monkeypatch.delenv("QUERY_QUEUE_ENABLED", raising=False)
    assert queue_enabled() is False

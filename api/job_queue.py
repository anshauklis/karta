"""RQ-backed query queue: a blocking submit-and-wait bridge so the API can offload
heavy execution to worker processes while keeping the synchronous HTTP contract.
Enabled by QUERY_QUEUE_ENABLED; otherwise callers use the inline path.
"""
import os
import time

REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
QUEUE_NAME = "karta"


class QueueBusy(Exception):
    """No worker produced a result within max_wait — apply backpressure."""


class QueueJobError(Exception):
    """The worker job failed; message carries the worker traceback."""


def queue_enabled() -> bool:
    return os.environ.get("QUERY_QUEUE_ENABLED", "").strip().lower() in ("1", "true", "yes", "on")


def get_queue():
    from redis import Redis
    from rq import Queue
    return Queue(QUEUE_NAME, connection=Redis.from_url(REDIS_URL))


def submit_and_wait(func, kwargs: dict, *, job_timeout: int, max_wait: float,
                    queue=None, poll_interval: float = 0.1):
    """Enqueue func(**kwargs) and block until it finishes.

    Returns the worker's return value. Raises QueueJobError if the job fails and
    QueueBusy if max_wait elapses before completion.
    """
    q = queue if queue is not None else get_queue()
    job = q.enqueue(
        func,
        kwargs=kwargs,
        job_timeout=job_timeout,
        result_ttl=60,
        failure_ttl=60,
    )
    deadline = time.monotonic() + max_wait
    while True:
        status = job.get_status(refresh=True)
        if status == "finished":
            return job.return_value()
        if status in ("failed", "stopped", "canceled"):
            raise QueueJobError(getattr(job, "exc_info", None) or f"job {status}")
        if time.monotonic() >= deadline:
            raise QueueBusy("All workers are busy; please retry shortly")
        time.sleep(poll_interval)

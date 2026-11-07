"""Small HTTP helpers with retries and a polite user agent (stdlib only)."""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request

USER_AGENT = "turn-up-scotland-hackathon/0.1 (+https://github.com/PersiaF04/HACKTHEBURGH-26)"


class FetchError(RuntimeError):
    """Raised when a request still fails after all retries."""


def build_url(url: str, params: dict | None = None) -> str:
    if not params:
        return url
    return url + ("&" if "?" in url else "?") + urllib.parse.urlencode(params, doseq=True)


def get_bytes(url: str, params: dict | None = None, *, timeout: float = 120,
              retries: int = 3, backoff: float = 5.0) -> bytes:
    full = build_url(url, params)
    last: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(full, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            last = exc
            # 4xx other than 429 will not get better by retrying.
            code = getattr(exc, "code", None)
            if code is not None and 400 <= code < 500 and code != 429:
                break
            time.sleep(backoff * (attempt + 1))
    raise FetchError(f"GET {full} failed: {last}")


def get_json(url: str, params: dict | None = None, **kwargs):
    return json.loads(get_bytes(url, params, **kwargs).decode("utf-8"))

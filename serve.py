#!/usr/bin/env python3
"""sunburntimer's static server: `python3 -m http.server` plus the cache headers
an installable, offline-capable app (a PWA) needs.

WHY THIS FILE EXISTS AT ALL. This app has no server-side code and never wanted
one, and `python3 -m http.server` would serve it, except that it sends no
`Cache-Control` header on anything. No Cache-Control means HEURISTIC
caching: a browser is free to invent a freshness lifetime of roughly 10% of the
file's age since Last-Modified, so a file that has not changed in a month is
served from disk for days with no revalidation. For an app shell that is
annoying. For `/sw.js` it is fatal — a service worker that cannot be re-fetched
can never notice it has been replaced, so the app is pinned at whatever version
the phone happened to install, forever. And a worker's own network-first
`fetch()` goes through that same HTTP cache, so the worker cannot rescue it.

The headers are set here, by the app, rather than in whatever reverse proxy
sits in front of it: then they travel with the code, arrive with a `git pull`
deploy, and cannot be lost to a later proxy-config rewrite.

Revalidation is `Last-Modified` + `If-Modified-Since`, which
`SimpleHTTPRequestHandler` already implements: with `no-cache` on top, an
unchanged file is a 304 with an empty body and a changed one is never served
stale. No ETag is emitted — Last-Modified alone answers the same question here,
where every file is a real file on disk with an honest mtime.

Nothing here is content-addressed (this app has no build step, on purpose), so
there is no `immutable` rule: every file is `no-cache`, which is the correct
answer for an unhashed asset and cannot rot into serving a year-old module.

Usage mirrors the module it replaces:

    python3 serve.py 8000 --bind 127.0.0.1
"""

from __future__ import annotations

import argparse
import mimetypes
import os
import posixpath
import urllib.parse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# `.webmanifest` is missing from Python's mimetypes table (and from nginx's
# stock mime.types). Served as octet-stream the manifest is ignored outright and
# the install prompt has no name and no icon — a silent, browser-side failure.
mimetypes.add_type("application/manifest+json", ".webmanifest")

# Security headers the app says itself, so they do not depend on the reverse
# proxy in front of it remembering to add them: a proxy that passes responses
# through untouched still serves them.
BASE_HEADERS = {
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
}


# What the site is: the page, its own modules and styles, and the PWA kit.
# Everything else in the checkout -- .git/, bin/, tests/, package.json, this
# file -- is repository, not site, and answers 404. An allowlist rather than a
# denylist, so a file added to the repo is private until it is named here.
PUBLIC_FILES = {"/", "/index.html", "/sw.js"}
PUBLIC_DIRS = ("/css/", "/js/", "/static/")


def is_public(raw_path: str) -> bool:
    """Judged on the DECODED, normalised path -- the one translate_path opens.
    On the raw path, /%2egit/ or /static/%2e%2e/serve.py walk past a check."""
    path = raw_path.split("?", 1)[0].split("#", 1)[0]
    path = posixpath.normpath(urllib.parse.unquote(path, errors="surrogatepass"))
    if any(part.startswith(".") for part in path.split("/")):
        return False
    return path in PUBLIC_FILES or path.startswith(PUBLIC_DIRS)


class ContractHandler(SimpleHTTPRequestHandler):
    """Every response carries an explicit Cache-Control. That is the invariant."""

    # A banner that does not advertise the interpreter build to the internet;
    # this app is PUBLIC. `version_string` is overridden rather than just
    # blanking `sys_version`, whose default join leaves a trailing space.
    server_version = "sunburntimer"
    sys_version = ""

    def version_string(self) -> str:
        return self.server_version

    def end_headers(self) -> None:
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        for name, value in BASE_HEADERS.items():
            self.send_header(name, value)
        # no-cache everywhere: revalidate, never serve blind. The specific
        # cases below only ADD to it.
        self.send_header("Cache-Control", "no-cache")
        if path == "/sw.js":
            # Without this the worker's scope is /, which it already is — but
            # the header is what makes that survive the worker ever moving, and
            # `pwa_kit.py check --live` reads it.
            self.send_header("Service-Worker-Allowed", "/")
        super().end_headers()

    def send_head(self):
        if not is_public(self.path):
            self.send_error(404, "Not Found")
            return None
        return super().send_head()

    def list_directory(self, path):
        # A browsable index of the site's own folders is enumeration, not content.
        self.send_error(404, "Not Found")
        return None

    # .js is left to Python's mimetypes, which answers `text/javascript`. That
    # and `application/javascript` are both correct per WHATWG; a check that
    # pins one of them fails a correctly served worker.


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("port", nargs="?", type=int, default=int(os.environ.get("PORT", 8037)))
    # Loopback by default: in production a reverse proxy owns TLS and the public
    # path, and a listener on 0.0.0.0 is reachable around all of it on its raw
    # port. Override --bind for local development only.
    parser.add_argument("--bind", default=os.environ.get("HOST", "127.0.0.1"))
    args = parser.parse_args()

    handler = partial(ContractHandler, directory=str(ROOT))
    # ThreadingHTTPServer (not socketserver.TCPServer) because HTTPServer sets
    # allow_reuse_address: restarting inside the previous socket's TIME_WAIT
    # otherwise dies with EADDRINUSE and the service simply does not come back.
    with ThreadingHTTPServer((args.bind, args.port), handler) as httpd:
        print(f"sunburntimer serving {ROOT} on http://{args.bind}:{args.port}", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

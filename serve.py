#!/usr/bin/env python3
"""sunburntimer's static server: `python3 -m http.server` plus the cache headers
the PWA contract requires.

WHY THIS FILE EXISTS AT ALL. This app has no server-side code and never wanted
one; it was served by `python3 -m http.server 8037 --bind 127.0.0.1`, which
sends no `Cache-Control` header on anything. No Cache-Control means HEURISTIC
caching: a browser is free to invent a freshness lifetime of roughly 10% of the
file's age since Last-Modified, so a file that has not changed in a month is
served from disk for days with no revalidation. For an app shell that is
annoying. For `/sw.js` it is fatal — a service worker that cannot be re-fetched
can never notice it has been replaced, so the app is pinned at whatever version
the phone happened to install, forever. And a worker's own network-first
`fetch()` goes through that same HTTP cache, so the worker cannot rescue it.

The delivery table (ServerCLI docs/fleet-pwa.md) is the whole reason this is
here, and this file is where it is enforced, not the vhost: the fleet's rule is
"prefer setting these in the app", because that needs no nginx edit, no
snapshot refresh and no sudo, and cannot be lost to a later vhost rewrite. On
this app it is also the only option that survives a `git pull` deploy.

Revalidation is `Last-Modified` + `If-Modified-Since`, which
`SimpleHTTPRequestHandler` already implements: with `no-cache` on top, an
unchanged file is a 304 with an empty body and a changed one is never served
stale. No ETag is emitted — Last-Modified alone answers the same question here,
where every file is a real file on disk with an honest mtime.

Nothing here is content-addressed (this app has no build step, on purpose), so
there is no `immutable` rule: every file is `no-cache`, which is the correct
answer for an unhashed asset and cannot rot into serving a year-old module.

Usage mirrors the module it replaces, so the sm command stays a one-liner:

    python3 serve.py 8037 --bind 127.0.0.1
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

# Security headers this vhost does not set. sun.mattia.ninja's nginx block
# proxies with no `add_header` at all, so if these are not sent here they are
# not sent — and adding them in nginx instead would be a live-config change to
# hand-hold through sudo for something the app can just say itself.
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

    # .js is left to Python's mimetypes, which answers `text/javascript`. The
    # fleet contract accepts that alongside `application/javascript` — both are
    # correct per WHATWG, and pinning one is how a correctly-served worker
    # started failing its own check.


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("port", nargs="?", type=int, default=int(os.environ.get("PORT", 8037)))
    # Loopback by default: nginx owns TLS and the public path, and a listener on
    # 0.0.0.0 is reachable around all of it on its raw port. Overridable for
    # local development, never in the sm command.
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

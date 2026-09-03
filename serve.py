#!/usr/bin/env python3
"""Dev server: stock http.server + Cache-Control: no-store on every response.

python's plain `http.server` sends NO cache headers, so browsers heuristically
cache the ES modules under src/ — after files change on disk, an open tab can
reload a stale MIX of old and new modules and throw phantom errors for code
that is perfectly fine on disk (e.g. "clamp is not defined" from a module
whose new import line the tab never fetched). no-store forces every reload to
serve exactly what is on disk. Dev only — index.html is the self-contained
bundle and has no module graph to tear.

Usage: python3 serve.py [port]     (default 8123)
"""
import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler


class NoStoreHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
print(f'serving on http://127.0.0.1:{port} (Cache-Control: no-store)')
ThreadingHTTPServer(('127.0.0.1', port), NoStoreHandler).serve_forever()

"""Local static preview only; Python standard library, no application backend."""

import argparse
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]


class PreviewHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass  # No access log file or terminal request history.


def main():
    config = json.loads((ROOT / "site.config.json").read_text(encoding="utf-8"))
    parser = argparse.ArgumentParser(description="Agent Hoihoi static local preview")
    parser.add_argument("--port", type=int, default=urlsplit(config["localBaseUrl"]).port or 4173)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("Port must be between 1 and 65535.")
    handler = partial(PreviewHandler, directory=str(ROOT / "public"))
    try:
        with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
            print(f"Local: http://127.0.0.1:{args.port}/", flush=True)
            print("Static preview only. No submissions or access logging. Ctrl+C to stop.", flush=True)
            if args.port != (urlsplit(config["localBaseUrl"]).port or 4173):
                print("Note: sitemap.xml still uses localBaseUrl from site.config.json.", flush=True)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                print("\nPreview stopped.", flush=True)
    except OSError as error:
        parser.exit(1, f"Cannot start local preview: {error}\nTry --port 4174 if the port is in use.\n")


if __name__ == "__main__":
    main()

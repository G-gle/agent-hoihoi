"""Generate the public research URLs; production origin must be explicit."""

import argparse
import ipaddress
import json
from pathlib import Path
from urllib.parse import urlsplit
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
def catalog_pages(root=ROOT):
    articles = json.loads((root / "content/research-index.json").read_text(encoding="utf-8"))
    return ["", "research.html", *[a["slug"] + ".html" for a in articles], "about.html"]


def render_sitemap(base, pages, public=False):
    if not isinstance(base, str) or not base:
        raise ValueError("Configure a base URL before generating a sitemap.")
    parts = urlsplit(base)
    if parts.scheme not in {"http", "https"} or not parts.hostname or parts.query or parts.fragment or parts.username or parts.password:
        raise ValueError("Base URL must be an absolute HTTP(S) URL without credentials, query or fragment.")
    if public:
        hostname = parts.hostname.lower()
        try:
            local_host = not ipaddress.ip_address(hostname).is_global
        except ValueError:
            local_host = hostname == "localhost" or hostname.endswith(".localhost")
        if local_host or parts.scheme != "https":
            raise ValueError("Public sitemap requires a confirmed public HTTPS URL.")
    base = base.rstrip("/") + "/"
    note = "Public URL explicitly configured." if public else "Local preview only. Public origin is not configured for this output."
    rows = "\n".join(f"  <url><loc>{escape(base + page)}</loc></url>" for page in pages)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<!-- {note} -->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{rows}\n</urlset>\n'


def main():
    parser = argparse.ArgumentParser(description="Generate local or public sitemap.xml")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--local", action="store_true")
    mode.add_argument("--public", action="store_true")
    args = parser.parse_args()
    config = json.loads((ROOT / "site.config.json").read_text(encoding="utf-8"))
    base = config["publicBaseUrl" if args.public else "localBaseUrl"]
    if not isinstance(base, str) or not base:
        parser.error("publicBaseUrl is not configured. Set the confirmed public URL in site.config.json first.")
    pages = catalog_pages()
    try:
        sitemap = render_sitemap(base, pages, args.public)
    except ValueError as exc:
        parser.error(str(exc))
    (ROOT / "public" / "sitemap.xml").write_text(sitemap, encoding="utf-8")
    print(f"Wrote {len(pages)} research URLs to public/sitemap.xml ({'public' if args.public else 'local'}).")


if __name__ == "__main__":
    main()

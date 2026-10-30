"""Check discovery, routes and Worker form templates without third-party packages."""

import argparse
import json
import re
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
from urllib.request import urlopen
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
PAGES = {"index.html", "research.html", "agent-traps.html", "agents-and-traps.html", "about.html", "observations.html", "guestbook.html", "guestbook-complete.html", "observations-detail.html"}
ARTICLES = json.loads((ROOT / "content/research-index.json").read_text(encoding="utf-8"))
ARTICLE_PAGES = [a["slug"] + ".html" for a in ARTICLES]
PAGES.update(ARTICLE_PAGES)


class Page(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.elements = []
        self.main_links = []
        self.footer_links = []
        self.ids = set()
        self.nav = None
        self.lang = None
        self.article_text = []
        self.in_article = False
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.elements.append((tag, attrs))
        if tag == "html":
            self.lang = attrs.get("lang")
        if tag == "article":
            self.in_article = True
        if self.in_article and tag in {"h1", "h2", "h3", "p", "li", "td", "th", "br", "hr"}:
            self.article_text.append(" ")
        if attrs.get("id"):
            assert attrs["id"] not in self.ids, f"Duplicate id: {attrs['id']}"
            self.ids.add(attrs["id"])
        if tag == "nav":
            self.nav = attrs.get("class")
        if tag == "a" and self.nav == "main-nav":
            self.main_links.append(attrs)
        if tag == "a" and self.nav == "utility-nav":
            self.footer_links.append(attrs)

    def handle_endtag(self, tag):
        if self.in_article and tag in {"h1", "h2", "h3", "p", "li", "td", "th"}:
            self.article_text.append(" ")
        if tag == "nav":
            self.nav = None
        if tag == "article":
            self.in_article = False

    def handle_data(self, text):
        if self.in_article:
            self.article_text.append(text)


def manuscript_text(source):
    """Independent text extraction for exact completeness/order comparison."""
    lines = []
    for line in source.splitlines():
        if line == "---" or re.fullmatch(r"\|[:|\- ]+\|", line):
            continue
        line = re.sub(r"^#{1,3} ", "", line)
        line = re.sub(r"^- ", "", line)
        if line.startswith("|"):
            line = " ".join(cell.strip() for cell in line.strip("|").split("|"))
        line = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", line)
        lines.append(line.replace("**", "").replace("*", "").replace("`", ""))
    return " ".join(" ".join(lines).split())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", help="Also verify all public files through this running local HTTP server")
    args = parser.parse_args()
    assert {p.name for p in PUBLIC.glob("*.html")} == PAGES
    parsed = {name: Page((PUBLIC / name).read_text(encoding="utf-8")) for name in sorted(PAGES)}
    checks = []
    internal_count = 0
    for name, page in parsed.items():
        assert page.lang == "en", name
        assert not re.search(r"[\u3040-\u30ff\u3400-\u9fff]", (PUBLIC / name).read_text(encoding="utf-8")), name
        for landmark in ("title", "header", "main", "footer"):
            assert len([t for t, _ in page.elements if t == landmark]) == 1, (name, landmark)
        assert len([t for t, _ in page.elements if t == "h1"]) == 1, name
        assert any(t == "meta" and a.get("name") == "viewport" for t, a in page.elements), name
        assert [a["href"] for a in page.main_links] == ["index.html", "research.html", "about.html"], name
        assert [a["href"] for a in page.footer_links] == ["guestbook.html"], name
        assert all(a.get("aria-label") for a in page.footer_links), name
        for tag, attrs in page.elements:
            if tag == "meta" and attrs.get("name") == "robots":
                assert name in {"observations-detail.html", "guestbook-complete.html"} and attrs.get("content") == "noindex"
            for key in ("href", "src", "action"):
                if key not in attrs:
                    continue
                link = urlsplit(attrs[key])
                if link.scheme or link.netloc:
                    assert tag == "a" and key == "href" and link.scheme == "https" and (name in ARTICLE_PAGES or (name == "about.html" and attrs[key] == "https://docs.google.com/forms/d/e/1FAIpQLSeCAIDEG5HPMwmMgEgiOcwOgiO2CT1c4wQB3p3y1eV3OO7qIQ/viewform?usp=publish-editor")), f"Unexpected external dependency: {name}: {attrs[key]}"
                    continue
                target = (PUBLIC / unquote(link.path)).resolve() if link.path else PUBLIC / name
                assert target.is_relative_to(PUBLIC.resolve()) and target.is_file(), f"Broken link: {name}: {attrs[key]}"
                if link.fragment:
                    destination = parsed.get(target.name)
                    assert destination and unquote(link.fragment) in destination.ids, f"Broken fragment: {attrs[key]}"
                internal_count += 1
    checks.append(f"{len(PAGES)} HTML pages: titles/layout landmarks, English language and {internal_count} local references checked")
    checks.append("Every primary nav: Home / Research / About only; footer hoihoi is the sole utility anchor and leads to Guestbook")
    assert not any(t == "a" and a.get("href") == "observations.html" for t, a in parsed["index.html"].elements)
    routes = [("agent-traps.html", "observations.html"), ("agents-and-traps.html", "observations.html"), ("index.html", "guestbook.html"), ("observations.html", "guestbook.html"), ("guestbook-complete.html", "observations-detail.html")]
    for name in ["research.html", *ARTICLE_PAGES]:
        assert parsed[name].main_links[1].get("aria-current") == "page", name
    assert any(t == "a" and a.get("href") == "research.html" for t, a in parsed["index.html"].elements)
    for target in ARTICLE_PAGES:
        assert not any(t == "a" and a.get("href") == target for t, a in parsed["index.html"].elements), ("index.html", target)
        assert any(t == "a" and a.get("href") == target for t, a in parsed["research.html"].elements), ("research.html", target)
    for source, target in routes:
        assert any(t == "a" and a.get("href") == target for t, a in parsed[source].elements), (source, target)
    for name, page in parsed.items():
        if name != "guestbook-complete.html":
            assert not any(a.get("href") in {"observations-detail.html", "guestbook-complete.html"} for t, a in page.elements), name
        if name in {"observations-detail.html", "guestbook-complete.html"}:
            assert any(t == "meta" and a.get("name") == "robots" and a.get("content") == "noindex" for t, a in page.elements)
    checks.append("Home -> Research -> articles and overview -> guestbook -> receipt -> detail are linked")
    source_path = ROOT / "content/AIAgentTraps20261021.md"
    source = source_path.read_text(encoding="utf-8")
    original = ROOT.parents[1] / "AIAgentTraps20261021.md"
    if original.exists():
        assert source_path.read_bytes() == original.read_bytes(), "Source copy differs from the supplied manuscript"
    research = parsed["agent-traps.html"]
    assert manuscript_text(source) == " ".join("".join(research.article_text).split()), "Article text was omitted, reordered, or changed"
    expected_links = Counter(re.findall(r"\]\((https://[^)]+)\)", source))
    actual_links = Counter(a["href"] for t, a in research.elements if t == "a" and a.get("href", "").startswith("https://"))
    assert actual_links == expected_links, "External article references changed"
    assert len([t for t, _ in research.elements if t == "h2"]) == 6
    assert len([t for t, _ in research.elements if t == "table"]) == 5
    assert all(f"chapter-{n}" in research.ids for n in range(1, 7)) and "sources-and-scope" in research.ids
    article_html = (PUBLIC / "agent-traps.html").read_text(encoding="utf-8")
    assert article_html.count('href="observations.html"') == 1
    assert article_html.index('id="chapter-6"') < article_html.index('href="observations.html"') < article_html.index('id="sources-and-scope"')
    assert 'class="supplementary"' in article_html and "FIELD_OBSERVATIONS_URL" not in article_html
    checks.append(f"Complete article text/order matches source; 6 chapters, Sources and scope, 5 tables, and all {sum(actual_links.values())} external reference occurrences preserved")
    guest = parsed["guestbook.html"]
    fields = [a for t, a in guest.elements if t in {"input", "textarea"}]
    assert [a["name"] for a in fields] == ["name", "message"]
    assert "required" not in fields[0] and "required" in fields[1]
    assert any(t == "form" and a.get("method") == "post" and a.get("action") == "guestbook.html" for t, a in guest.elements)
    assert "<!--CSRF_FIELD-->" in (PUBLIC / "guestbook.html").read_text(encoding="utf-8")
    assert "<!--GUESTBOOK_LIST-->" in (PUBLIC / "guestbook.html").read_text(encoding="utf-8")
    assert "No recent submission confirmed" in (PUBLIC / "guestbook-complete.html").read_text(encoding="utf-8")
    assert 'Location: "/guestbook-complete.html"' in (ROOT / "src/guestbook.js").read_text(encoding="utf-8")
    checks.append("POST form template, optional name, required message, server CSRF/list slots and neutral direct receipt template verified")
    robots = (PUBLIC / "robots.txt").read_text(encoding="utf-8")
    assert "User-agent: *" in robots and "Allow: /" in robots and "disallow" not in robots.lower()
    config = json.loads((ROOT / "site.config.json").read_text(encoding="utf-8"))
    urls = [node.text for node in ET.parse(PUBLIC / "sitemap.xml").findall("{*}url/{*}loc")]
    valid_bases = [b.rstrip("/") + "/" for b in [config["localBaseUrl"], config["publicBaseUrl"]] if b]
    assert any(urls == [base, *[base + page for page in ["research.html", *ARTICLE_PAGES, "about.html"]]] for base in valid_bases), urls
    llms = (PUBLIC / "llms.txt").read_text(encoding="utf-8")
    for target in ["index.html", "research.html", *ARTICLE_PAGES, "about.html", "observations.html", "guestbook.html"]:
        assert f"]({target})" in llms
    assert "observations-detail.html" not in llms and "guestbook-complete.html" not in llms
    assert "pending administrator approval" in llms and "JavaScript is not required" in llms
    assert not re.search(r"[\u3040-\u30ff\u3400-\u9fff]", llms)
    checks.append(f"robots allows all; sitemap contains {3 + len(ARTICLE_PAGES)} normal pages; llms includes all research articles and the moderated guestbook")
    if args.url:
        base = args.url.rstrip("/") + "/"
        count = 0
        for path in sorted(PUBLIC.rglob("*")):
            if not path.is_file():
                continue
            relative = path.relative_to(PUBLIC).as_posix()
            with urlopen(base + relative, timeout=10) as response:
                assert response.status == 200
                body = response.read()
                if relative in {"observations.html", "observations-detail.html"}:
                    prefix, rest = path.read_bytes().split(b"<!--OBSERVATION_DATA_START-->")
                    suffix = rest.split(b"<!--OBSERVATION_DATA_END-->")[1]
                    assert body.startswith(prefix) and body.endswith(suffix), relative
                    assert b'data-observation-state="' in body and b"<!--OBSERVATION_DATA_START-->" not in body
                    assert response.headers.get("Cache-Control") == "no-store"
                elif relative not in {"guestbook.html", "guestbook-complete.html"}:
                    assert body == path.read_bytes(), relative
                else:
                    assert b"<!--CSRF_FIELD-->" not in body and b"<!--GUESTBOOK_LIST-->" not in body
            count += 1
        checks.append(f"HTTP 200 and static file equality and dynamic template rendering confirmed for all {count} public files")
    for check in checks:
        print(f"PASS: {check}")
    print("NOTE: Browser layout/focus/input/navigation checks are separate; see verification/README.md for recorded results.")


if __name__ == "__main__":
    main()

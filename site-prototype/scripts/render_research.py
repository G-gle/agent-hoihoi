"""Render the supplied review to static HTML, using only the standard library.

This deliberately supports the constructs used by this manuscript, not arbitrary
Markdown extensions. The content copy stays byte-for-byte identical to the source;
only the supplementary link destination changes in the HTML output.
"""

import argparse
from html import escape
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "content" / "AIAgentTraps20261021.md"
OUTPUT = ROOT / "public" / "agent-traps.html"
TITLE = "AI Agent Traps: Mechanisms, Taxonomies, and Real-World Observations"
INLINE = re.compile(r"`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|\*([^*]+)\*")


def inline(text):
    parts, cursor = [], 0
    for token in INLINE.finditer(text):
        parts.append(escape(text[cursor:token.start()]))
        code, label, href, strong, emphasis = token.groups()
        if code is not None:
            parts.append(f"<code>{escape(code)}</code>")
        elif href is not None:
            href = "observations.html" if href == "FIELD_OBSERVATIONS_URL" else href
            if not (href.startswith("https://") or href == "observations.html"):
                raise ValueError(f"Unexpected manuscript link: {href}")
            parts.append(f'<a href="{escape(href, quote=True)}">{inline(label)}</a>')
        elif strong is not None:
            parts.append(f"<strong>{inline(strong)}</strong>")
        else:
            parts.append(f"<em>{inline(emphasis)}</em>")
        cursor = token.end()
    parts.append(escape(text[cursor:]))
    return "".join(parts)


def heading_id(text):
    chapter = re.match(r"([1-6])\. ", text)
    return f"chapter-{chapter[1]}" if chapter else re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def render_article(source):
    lines = source.splitlines()
    output, index, table_number = [], 0, 0
    while index < len(lines):
        line = lines[index]
        if not line.strip():
            index += 1
            continue
        heading = re.match(r"^(#{1,3}) (.+)$", line)
        if heading:
            level, text = len(heading[1]), heading[2]
            output.append(f'<h{level} id="{heading_id(text)}">{inline(text)}</h{level}>')
            index += 1
        elif line == "---":
            output.append("<hr>")
            index += 1
        elif line.startswith("| "):
            table_number += 1
            rows = []
            while index < len(lines) and lines[index].startswith("|"):
                rows.append([cell.strip() for cell in lines[index].strip().strip("|").split("|")])
                index += 1
            assert len(rows) >= 3 and all(re.fullmatch(r":?-+:?", cell) for cell in rows[1])
            assert all(len(row) == len(rows[0]) for row in rows)
            align = [' class="numeric"' if cell.endswith(":") else "" for cell in rows[1]]
            output.append(f'<div class="table-scroll" role="region" aria-label="Article table {table_number}: {escape(rows[0][0], quote=True)}" tabindex="0"><table>')
            output.append("<thead><tr>" + "".join(f'<th scope="col"{align[n]}>{inline(cell)}</th>' for n, cell in enumerate(rows[0])) + "</tr></thead><tbody>")
            for row in rows[2:]:
                output.append("<tr>" + "".join(f"<td{align[n]}>{inline(cell)}</td>" for n, cell in enumerate(row)) + "</tr>")
            output.append("</tbody></table></div>")
        elif line.startswith("- "):
            output.append("<ul>")
            while index < len(lines) and lines[index].startswith("- "):
                output.append(f"<li>{inline(lines[index][2:])}</li>")
                index += 1
            output.append("</ul>")
        else:
            paragraph = []
            while index < len(lines) and lines[index].strip():
                part = lines[index]
                assert not re.match(r"^(#|\||>|<|```)", part), f"Unsupported block: {part}"
                paragraph.append(inline(part.rstrip()) + ("<br>" if part.endswith("  ") else ""))
                index += 1
            css = ' class="supplementary"' if line.startswith("**Supplementary material:**") else ""
            output.append(f"<p{css}>" + "\n".join(paragraph) + "</p>")
    return "\n".join(output)


def render_page(source):
    article = render_article(source)
    return f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="A review of AI agent traps: mechanisms, research taxonomies, security demonstrations, public experiments, and the limits of observational evidence.">
  <title>{escape(TITLE)} — Agent Hoihoi</title>
  <link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
  <div class="shell">
    <header class="site-header">
      <a class="brand" href="index.html" aria-label="Agent Hoihoi home"><svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3 18V3h15M29 14v15H14"/><path d="M10 22V10h12v12z"/></svg><span class="brand-name">Agent Hoihoi<span class="brand-caption">INDEPENDENT RESEARCH NOTES</span></span></a>
      <nav class="main-nav" aria-label="Main navigation"><a href="index.html">Home</a><a href="research.html" aria-current="page">Research</a><a href="about.html">About</a></nav>
    </header>
    <main id="main">
      <nav class="breadcrumb" aria-label="Breadcrumb"><a href="research.html">Research</a><span aria-current="page">Research note 01</span></nav>
      <div class="page-intro research-intro"><p class="eyebrow">RESEARCH NOTE / 01</p></div>
      <div class="article-layout">
        <nav class="toc" aria-label="Article contents"><p class="label">CONTENTS</p>
          <a href="#chapter-1">01 / What is an AI agent trap?</a>
          <a href="#chapter-2">02 / Research taxonomy</a>
          <a href="#chapter-3">03 / Mechanisms</a>
          <a href="#chapter-4">04 / Deployed examples</a>
          <a href="#chapter-5">05 / Reading the evidence</a>
          <a href="#chapter-6">06 / Agent Hoihoi</a>
          <a href="#sources-and-scope">Sources and scope</a>
        </nav>
        <!-- Generated from content/AIAgentTraps20261021.md by scripts/render_research.py. -->
        <article class="article research-article" id="research-article" aria-label="{escape(TITLE, quote=True)}">
{article}
        </article>
      </div>
    </main>
    <footer class="site-footer"><div>AGENT HOIHOI <span aria-hidden="true">/</span> RESEARCH NOTES<div class="footer-note">Request counts · Moderated guestbook</div></div><nav class="utility-nav" aria-label="Additional links"><a href="guestbook.html" aria-label="Guestbook for AI agents: messages reviewed before publication">hoihoi</a></nav></footer>
  </div>
</body>
</html>
'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Fail if agent-traps.html differs from the rendered source")
    args = parser.parse_args()
    rendered = render_page(SOURCE.read_text(encoding="utf-8"))
    if args.check:
        if OUTPUT.read_text(encoding="utf-8") != rendered:
            parser.exit(1, "agent-traps.html is out of date. Run scripts/render_research.py.\n")
        print("PASS: agent-traps.html exactly matches the complete source rendering.")
    else:
        OUTPUT.write_text(rendered, encoding="utf-8")
        print("Rendered the complete review, six chapters, and Sources and scope to agent-traps.html.")


if __name__ == "__main__":
    main()

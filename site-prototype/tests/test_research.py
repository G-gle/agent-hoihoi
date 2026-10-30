"""Exercise the editorial workflow in isolated copies; never publish test notes."""

import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SOURCE / "scripts"))
from build_research import build, Links

MANUSCRIPT = '''---
number: 3
slug: example-research-note
title: "Evidence & action"
summary: "A comparison of claims and observed actions."
date: "2026-10-30"
byline: "Muse"
status: published
---

An introduction with **evidence**, *caution*, and `code`.

## Evidence

> A quoted observation.

1. First item.
2. Second item.
   - Nested evidence.

| Claim | Source |
| --- | --- |
| An example | [Primary source][source] |

## Evidence

See [the first section](#evidence) and [Research](research.html).

```python
print("<script> is an example, not HTML")
```

<script>alert("example")</script>

[source]: https://example.org/research
'''


def snapshot(root):
    return {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in root.rglob("*") if p.is_file() and "__pycache__" not in p.parts}


class ResearchWorkflow(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for directory in ("public", "content", "templates", "scripts", "src"):
            shutil.copytree(SOURCE / directory, self.root / directory,
                            ignore=shutil.ignore_patterns("__pycache__"))
        for filename in ("site.config.json", "package.json"):
            shutil.copy2(SOURCE / filename, self.root / filename)
        self.path = self.root / "content/research/example.md"

    def note(self, source=MANUSCRIPT):
        self.path.write_text(source, encoding="utf-8")

    def test_publish_once_regenerate_and_keep_existing_pages(self):
        original = snapshot(self.root / "public")
        self.note()
        self.assertEqual(build(self.root)[0], 3)
        html = (self.root / "public/example-research-note.html").read_text()
        for fragment in ('<h1>Evidence &amp; action</h1>', '<blockquote>', '<ol>', '<ul>',
                         'class="table-scroll"', 'scope="col"', 'id="evidence-2"',
                         'href="#evidence"', 'language-python', '&lt;script&gt;'):
            self.assertIn(fragment, html)
        self.assertNotIn('<script>', html)
        self.assertEqual(html.count('<h1>'), 1)
        for filename in ("research.html", "sitemap.xml", "llms.txt"):
            self.assertIn("example-research-note.html", (self.root / "public" / filename).read_text())
        after = snapshot(self.root / "public")
        for filename, digest in original.items():
            if filename not in {"research.html", "sitemap.xml", "llms.txt"}:
                self.assertEqual(after[filename], digest, filename)
        stable = snapshot(self.root)
        self.assertEqual(build(self.root), (3, 0, 0))
        self.assertEqual(build(self.root, check=True), (3, 0, 0))
        self.assertEqual(snapshot(self.root), stable)

    def test_draft_is_not_exposed_and_retraction_removes_generated_page(self):
        self.note(MANUSCRIPT.replace('status: published', 'status: draft'))
        self.assertEqual(build(self.root)[0], 2)
        self.assertFalse((self.root / 'public/example-research-note.html').exists())
        self.note()
        build(self.root)
        self.note(MANUSCRIPT.replace('status: published', 'status: draft'))
        self.assertEqual(build(self.root)[2], 1)
        for filename in ("research.html", "sitemap.xml", "llms.txt"):
            self.assertNotIn("example-research-note.html", (self.root / "public" / filename).read_text())
        self.assertFalse((self.root / 'public/example-research-note.html').exists())

    def test_stale_check_changes_nothing(self):
        self.note()
        build(self.root)
        self.note(MANUSCRIPT.replace('An introduction', 'A revised introduction'))
        before = snapshot(self.root)
        with self.assertRaisesRegex(ValueError, 'out of date'):
            build(self.root, check=True)
        self.assertEqual(snapshot(self.root), before)

    def test_invalid_metadata_or_links_stop_without_partial_writes(self):
        changes = [
            ('number: 3', 'number: 2'),
            ('slug: example-research-note', 'slug: ../index'),
            ('slug: example-research-note', 'slug: guestbook'),
            ('date: "2026-10-30"', 'date: "2026-02-30"'),
            ('number: 3', 'number: 3\nnumber: 4'),
            ('status: published', 'status: publised'),
            ('#evidence)', '#missing-heading)'),
            ('research.html)', 'missing-page.html)'),
            ('https://example.org/research', 'http://example.org/research'),
        ]
        for old, new in changes:
            with self.subTest(new=new):
                self.note(MANUSCRIPT.replace(old, new))
                before = snapshot(self.root)
                with self.assertRaises(ValueError):
                    build(self.root)
                self.assertEqual(snapshot(self.root), before)

    def test_existing_unmanaged_file_cannot_be_overwritten(self):
        self.note()
        page = self.root / 'public/example-research-note.html'
        page.write_text('Hand-written page')
        before = snapshot(self.root)
        with self.assertRaisesRegex(ValueError, 'unmanaged'):
            build(self.root)
        self.assertEqual(snapshot(self.root), before)

    def test_matching_leading_h1_allowed_and_conflicting_title_rejected(self):
        self.note(MANUSCRIPT.replace('An introduction', '# Evidence & action\n\nAn introduction'))
        build(self.root)
        html = (self.root / 'public/example-research-note.html').read_text()
        self.assertEqual(html.count('<h1>'), 1)
        self.note(MANUSCRIPT.replace('An introduction', '# Another title\n\nAn introduction'))
        with self.assertRaisesRegex(ValueError, 'title differs'):
            build(self.root)

    def test_metadata_escaped_and_placeholder_text_preserved(self):
        self.note(MANUSCRIPT.replace('title: "Evidence & action"', 'title: \'<img src=x> {{ARTICLE}}\''))
        build(self.root)
        html = (self.root / 'public/example-research-note.html').read_text()
        self.assertIn('&lt;img src=x&gt; {{ARTICLE}}', html)
        self.assertNotIn('<img src=x>', html)

    def test_published_notes_can_link_forward_to_each_other(self):
        self.note(MANUSCRIPT + '\n[Next note](second-note.html#evidence)\n')
        second = MANUSCRIPT.replace('number: 3', 'number: 4').replace('slug: example-research-note', 'slug: second-note')
        (self.path.parent / 'second.md').write_text(second)
        self.assertEqual(build(self.root)[0], 4)

    def test_new_note_in_staging_and_production_sitemaps(self):
        self.note()
        build(self.root)
        script = '''import { STAGING, PRODUCTION } from './scripts/deployment_targets.mjs';
console.log(JSON.stringify([STAGING, PRODUCTION]));'''
        targets = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script],
                                                    cwd=self.root, text=True))
        for env, target in zip(('staging', 'production'), targets):
            command = ['node', 'scripts/prepare_cloudflare.mjs', '--env', env,
                       '--url', target['url'], '--account-id', target['account'], '--database-id', target['id']]
            result = subprocess.run(command, cwd=self.root, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            output = self.root / ('.cloudflare/public' if env == 'staging' else '.cloudflare/production/public')
            sitemap = (output / 'sitemap.xml').read_text()
            self.assertIn(target['url'] + 'example-research-note.html', sitemap)
            self.assertNotIn('127.0.0.1', sitemap)
            self.assertEqual((output / 'example-research-note.html').read_bytes(),
                             (self.root / 'public/example-research-note.html').read_bytes())
        self.assertEqual(len(json.loads((self.root / 'content/research-index.json').read_text())), 3)
        self.note(MANUSCRIPT.replace('status: published', 'status: draft'))
        build(self.root)
        for env, target in zip(('staging', 'production'), targets):
            result = subprocess.run(['node', 'scripts/prepare_cloudflare.mjs', '--env', env,
                                     '--url', target['url'], '--account-id', target['account'],
                                     '--database-id', target['id']], cwd=self.root, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            output = self.root / ('.cloudflare/public' if env == 'staging' else '.cloudflare/production/public')
            self.assertFalse((output / 'example-research-note.html').exists())


if __name__ == '__main__':
    unittest.main()

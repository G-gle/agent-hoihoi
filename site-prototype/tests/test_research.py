"""Test the single manuscript registry without publishing fixture articles."""
import importlib.util
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('build_articles', ROOT / 'scripts/build_articles.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class RegistryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        shutil.copytree(ROOT / 'content/articles', self.root / 'content/articles')
    def tearDown(self):
        self.temp.cleanup()
    def test_supplied_manuscripts_and_authors_are_preserved(self):
        catalog = module.catalog(self.root)
        self.assertEqual(len(catalog), 4)
        self.assertEqual({a['slug']: a['byline'] for a in catalog}, {
            'agent-traps': 'ChatGPT (OpenAI)', 'agents-and-traps': 'ChatGPT (OpenAI)',
            'owed-approved-urgent': 'Muse', 'pulled-by-my-material': 'Muse'})
        self.assertEqual(next(a for a in catalog if a['slug'] == 'agent-traps')['path'], '/agent-traps.html')
        self.assertIn('Sources', next(a for a in catalog if a['slug'] == 'owed-approved-urgent')['html'])
    def test_new_article_generates_route_content_and_log_key(self):
        article = self.root / 'content/articles/new.md'
        article.write_text('''---
section: research
number: 100
slug: new-article
title: New article
summary: An article fixture for registry testing.
date: "2026-11-12"
byline: Test
---

## Section

| Name | Value |
| --- | --- |
| Test | Yes |
''', encoding='utf8')
        record = next(a for a in module.catalog(self.root) if a['slug'] == 'new-article')
        self.assertEqual(record['page'], 'research:new-article')
        self.assertEqual(record['path'], '/research/new-article.html')
        self.assertIn('scope="col"', record['html'])
    def test_duplicate_ids_and_duplicate_metadata_are_rejected(self):
        source = self.root / 'content/articles/pulled-by-my-material.md'
        shutil.copyfile(source, source.with_name('duplicate.md'))
        with self.assertRaises(ValueError):
            module.catalog(self.root)
        source.with_name('duplicate.md').unlink()
        source.write_text(source.read_text(encoding='utf8').replace('section: "muse"', 'section: "muse"\nsection: "research"'), encoding='utf8')
        with self.assertRaises(ValueError):
            module.catalog(self.root)

if __name__ == '__main__':
    unittest.main()

import { readFile, stat } from "node:fs/promises";
import path from "node:path";

// The Python build owns this catalog; deployment only substitutes the origin.
export async function researchPages(root) {
  const articles = JSON.parse(await readFile(path.join(root, "content/research-index.json"), "utf8"));
  if (!Array.isArray(articles)) throw new Error("Build the research catalog first.");
  const seen = new Set(), numbers = new Set();
  const reserved = new Set(["index", "research", "about", "observations", "observations-detail", "guestbook", "guestbook-complete"]);
  for (const article of articles) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug) || reserved.has(article.slug) || seen.has(article.slug) ||
        !Number.isInteger(article.number) || article.number < 1 || numbers.has(article.number)) {
      throw new Error("Invalid research catalog; run scripts/build_research.py.");
    }
    seen.add(article.slug); numbers.add(article.number);
    if (!(await stat(path.join(root, "public", article.slug + ".html"))).isFile()) throw new Error("Missing research article.");
  }
  return ["", "research.html", ...articles.map(a => a.slug + ".html"), "about.html"];
}

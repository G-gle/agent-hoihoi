import { SITEMAP_PATHS } from '../src/site.js';
// Existing prepare entry point; manuscripts are the only editable registry.
export async function researchPages() { return SITEMAP_PATHS.map(path=>path.slice(1)); }

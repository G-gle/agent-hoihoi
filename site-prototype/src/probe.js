// Initial Access verification and stop mode: no assets, no D1 binding.
export default {
  fetch() {
    return new Response("Staging environment unavailable.\n", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  },
};

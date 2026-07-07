const CACHE_NAME = "patient-mlde-pareto-preview-match-v5";

const ASSETS = [
  "./",
  "index.html",
  "styles.css?v=preview-match-20260707",
  "app.js?v=preview-match-20260707",
  "manifest.json?v=preview-match-20260707",
  "icons/icon.svg",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "examples/custom_variant_template.csv",
  "examples/patient_context_template.csv",
  "emi_binding.csv",
  "iso_binding.csv",
  "igg_binding.csv"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { clearLegacyLocalData } from "./legacyCleanup";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";

function renderApp() {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

clearLegacyLocalData().finally(renderApp);

if ("serviceWorker" in navigator) {
  const serviceWorkerVersion = "2026-10-26-signed-in-reminders-3";
  const refreshKey = `jikeoro-sw-refreshed-${serviceWorkerVersion}`;
  let refreshing = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing || sessionStorage.getItem(refreshKey)) return;
    refreshing = true;
    sessionStorage.setItem(refreshKey, "1");
    window.location.reload();
  });

  let registrationPromise: Promise<ServiceWorkerRegistration> | null = null;
  const updateServiceWorker = () => {
    registrationPromise ??= navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}sw.js?v=${serviceWorkerVersion}`,
      { updateViaCache: "none" },
    );
    return registrationPromise.then((registration) => registration.update()).catch(() => undefined);
  };

  window.addEventListener("load", () => {
    void updateServiceWorker();
  });

  window.addEventListener("pageshow", () => void updateServiceWorker());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void updateServiceWorker();
  });

  window.setInterval(() => void updateServiceWorker(), 15 * 60 * 1000);

  if ("caches" in window) {
    void caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith("jikeoro-senior-")).map((key) => caches.delete(key)),
    ));
  }
}

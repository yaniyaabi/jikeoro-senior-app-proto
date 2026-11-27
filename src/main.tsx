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
  const serviceWorkerVersion = "2026-11-27-native-camera-v1";
  // Network-only pages update on next open; never reload an active camera/file picker or draft.

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

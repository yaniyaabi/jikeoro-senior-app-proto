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
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => undefined);
  });
}

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import styles from "./style.css?inline";

function injectFonts() {
  if (document.getElementById("tomomai-fonts")) return;
  const style = document.createElement("style");
  style.id = "tomomai-fonts";
  style.textContent = `
@font-face {
  font-family: 'Inter';
  src: url('${__API_BASE__}/res/fonts/Inter-VariableFont_opsz_wght.woff2') format('woff2');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Murecho';
  src: url('${__API_BASE__}/res/fonts/Murecho-VariableFont_wght.woff2') format('woff2');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}
`;
  document.head.appendChild(style);
}

function mount() {
  injectFonts();

  const host = document.createElement("div");
  host.id = "tomomai-root";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  // Inject styles into the shadow root so they don't leak into the host page.
  // `:root` in the bundled CSS refers to the document root, which is outside
  // the shadow tree — so CSS custom properties defined there never reach our
  // elements. Replace `:root` with `:host` so the variables are declared on
  // the shadow host element itself and inherit down through the shadow tree.
  // Similarly, mirror the `.dark` class via `:host-context(.dark)` so Tailwind
  // dark-mode variants work when the host page applies dark mode.
  const processedStyles = styles
    .replace(/:root\b/g, ":host")
    .replace(/\.dark\b(\s*\{)/g, ":host-context(.dark)$1");
  const styleEl = document.createElement("style");
  styleEl.textContent = processedStyles;
  shadow.appendChild(styleEl);

  const container = document.createElement("div");
  shadow.appendChild(container);

  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <App container={container} />
    </React.StrictMode>
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}

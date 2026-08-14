/**
 * Orbit Artisan — loader du widget d'estimation.
 *
 * À coller sur n'importe quel site :
 *   <script src="https://orbitartisan.com/embed.js" data-artisan="mon-slug" defer></script>
 *
 * Attributs facultatifs :
 *   data-theme="light|dark|auto"   thème du widget (défaut : light)
 *   data-position="right|left"     coin d'affichage (défaut : right)
 *   data-label="Devis en 2 min"    texte du bouton flottant
 *   data-color="#1c2a3a"           couleur du bouton
 *   data-button="false"            n'injecte pas de bouton (pilotage via window.OrbitArtisan)
 *
 * API : window.OrbitArtisan.open() / .close() / .toggle()
 */
(function () {
  "use strict";

  if (window.__orbitArtisanEmbed) return;

  var script = document.currentScript;
  if (!script) {
    var candidates = document.querySelectorAll("script[data-artisan]");
    script = candidates[candidates.length - 1];
  }
  if (!script) return;

  var slug = (script.getAttribute("data-artisan") || "").trim();
  if (!slug) {
    console.warn("[orbit-artisan] attribut data-artisan manquant sur le script d'intégration.");
    return;
  }

  var NS = "orbit-embed";
  var origin = new URL(script.src, window.location.href).origin;
  var theme = script.getAttribute("data-theme") || "light";
  var position = script.getAttribute("data-position") === "left" ? "left" : "right";
  var label = script.getAttribute("data-label") || "Estimer mes travaux";
  var color = script.getAttribute("data-color") || "#1b2735";
  var withButton = script.getAttribute("data-button") !== "false";

  var MIN_HEIGHT = 360;
  var Z = 2147483000;

  var iframe = null;
  var panel = null;
  var button = null;
  var open = false;

  function isNarrow() {
    return window.innerWidth < 520;
  }

  function maxHeight() {
    return Math.max(MIN_HEIGHT, window.innerHeight - (isNarrow() ? 24 : 48));
  }

  function applyPanelLayout() {
    if (!panel) return;
    var narrow = isNarrow();
    panel.style.width = narrow ? "calc(100vw - 16px)" : "400px";
    panel.style[position] = narrow ? "8px" : "20px";
    panel.style[position === "right" ? "left" : "right"] = "auto";
    panel.style.bottom = narrow ? "8px" : "92px";
    panel.style.maxHeight = maxHeight() + "px";
  }

  function createPanel() {
    panel = document.createElement("div");
    panel.setAttribute("data-orbit-artisan", "panel");
    panel.style.cssText = [
      "position:fixed",
      "z-index:" + Z,
      "background:#ffffff",
      "border-radius:16px",
      "box-shadow:0 24px 60px rgba(15,23,42,.24)",
      "overflow:hidden",
      "opacity:0",
      "transform:translateY(12px)",
      "transition:opacity .18s ease, transform .18s ease",
      "display:none",
    ].join(";");

    iframe = document.createElement("iframe");
    iframe.title = "Estimation de travaux";
    iframe.src =
      origin + "/embed/" + encodeURIComponent(slug) + "?theme=" + encodeURIComponent(theme);
    iframe.allow = "geolocation; camera";
    iframe.style.cssText = [
      "width:100%",
      "height:" + MIN_HEIGHT + "px",
      "border:0",
      "display:block",
      "background:transparent",
    ].join(";");

    panel.appendChild(iframe);
    document.body.appendChild(panel);
    applyPanelLayout();
  }

  function createButton() {
    button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-orbit-artisan", "launcher");
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-expanded", "false");
    button.style.cssText = [
      "position:fixed",
      "bottom:20px",
      position + ":20px",
      "z-index:" + Z,
      "display:inline-flex",
      "align-items:center",
      "gap:8px",
      "padding:12px 18px",
      "border:0",
      "border-radius:999px",
      "background:" + color,
      "color:#fff",
      "font:600 15px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
      "cursor:pointer",
      "box-shadow:0 12px 28px rgba(15,23,42,.28)",
    ].join(";");

    button.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
      "<span></span>";
    button.lastChild.textContent = label;

    button.addEventListener("click", function () {
      api.toggle();
    });
    document.body.appendChild(button);
  }

  var api = {
    open: function () {
      if (open) return;
      if (!panel) createPanel();
      open = true;
      applyPanelLayout();
      panel.style.display = "block";
      // Laisse le navigateur peindre l'état initial avant la transition.
      requestAnimationFrame(function () {
        panel.style.opacity = "1";
        panel.style.transform = "translateY(0)";
      });
      if (button) {
        button.setAttribute("aria-expanded", "true");
        if (isNarrow()) button.style.display = "none";
      }
    },
    close: function () {
      if (!open || !panel) return;
      open = false;
      panel.style.opacity = "0";
      panel.style.transform = "translateY(12px)";
      window.setTimeout(function () {
        if (!open && panel) panel.style.display = "none";
      }, 180);
      if (button) {
        button.setAttribute("aria-expanded", "false");
        button.style.display = "inline-flex";
      }
    },
    toggle: function () {
      if (open) api.close();
      else api.open();
    },
  };

  window.addEventListener("message", function (event) {
    if (event.origin !== origin) return;
    if (!iframe || event.source !== iframe.contentWindow) return;

    var data = event.data;
    if (!data || typeof data.type !== "string") return;

    if (data.type === NS + ":height") {
      var height = Math.min(Math.max(Number(data.height) || MIN_HEIGHT, MIN_HEIGHT), maxHeight());
      iframe.style.height = height + "px";
      return;
    }
    if (data.type === NS + ":close") {
      api.close();
    }
  });

  window.addEventListener("keydown", function (event) {
    if (event.key === "Escape") api.close();
  });

  window.addEventListener("resize", function () {
    if (open) applyPanelLayout();
  });

  function boot() {
    if (withButton) createButton();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.__orbitArtisanEmbed = true;
  window.OrbitArtisan = api;
})();

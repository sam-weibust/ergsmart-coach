import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Catch unhandled WebSocket / realtime promise rejections on mobile browsers
// and log them silently instead of crashing the app.
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event?.reason;
    const msg: string = reason?.message ?? String(reason ?? "");
    if (
      msg.toLowerCase().includes("websocket") ||
      msg.toLowerCase().includes("ws://") ||
      msg.toLowerCase().includes("insecure") ||
      msg.toLowerCase().includes("the operation is insecure")
    ) {
      console.warn("[CrewSync] WebSocket rejection suppressed (mobile browser):", msg);
      event.preventDefault();
    }
  });
}

// Keyboard handling: when an input/textarea is focused on mobile, scroll it
// into view so it stays visible above the on-screen keyboard.
if (typeof window !== "undefined") {
  window.addEventListener(
    "focusin",
    (e) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const tag = t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable) {
        setTimeout(() => {
          try {
            t.scrollIntoView({ block: "center", behavior: "smooth" });
          } catch {}
        }, 300);
      }
    },
    true,
  );
}

createRoot(document.getElementById("root")!).render(<App />);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  });
}

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import logoIcon from "@/assets/crewsync-logo-icon.jpg";

const DISMISS_KEY = "crewsync_app_banner_dismissed";
const DISMISS_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

const APP_STORE_URL = "https://apps.apple.com/app/crewsync/id6744037195";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.crewsync.app";

function isMobileBrowser(): boolean {
  return /iPhone|iPad|Android/i.test(navigator.userAgent);
}

function isIOS(): boolean {
  return /iPhone|iPad/i.test(navigator.userAgent);
}

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - parseInt(raw) < DISMISS_TTL;
  } catch {
    return false;
  }
}

export function AppStoreBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    if (!isMobileBrowser()) return;
    if (isDismissed()) return;
    setVisible(true);
  }, []);

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setVisible(false);
  }

  if (!visible) return null;

  const storeUrl = isIOS() ? APP_STORE_URL : PLAY_STORE_URL;
  const storeLabel = isIOS() ? "App Store" : "Play Store";

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        backgroundColor: "#FFFFFF",
        borderBottom: "1px solid #E2E1E9",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "10px 12px",
        boxShadow: "0 4px 20px 0 hsla(0,0%,87%,.2)",
      }}
    >
      {/* Logo */}
      <img
        src={logoIcon}
        alt="CrewSync"
        style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0 }}
      />

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "#1A1A2E", fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>
          Get the full CrewSync experience
        </div>
        <div style={{ color: "#6B6B7D", fontSize: 11, lineHeight: 1.3, marginTop: 1 }}>
          Live PM5 tracking, Bluetooth, and more
        </div>
      </div>

      {/* Get App button */}
      <a
        href={storeUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={dismiss}
        style={{
          backgroundColor: "#1A1A2E",
          color: "#ffffff",
          fontSize: 12,
          fontWeight: 600,
          padding: "6px 12px",
          borderRadius: 6,
          textDecoration: "none",
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}
      >
        {storeLabel}
      </a>

      {/* Dismiss */}
      <button
        onClick={dismiss}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 4,
          color: "#6B6B7D",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
        }}
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}

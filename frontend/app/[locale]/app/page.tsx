"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ControlCenter } from "@/components/control-center";

const STORAGE_KEY = "projectpulse-session";
const LEGACY_STORAGE_KEY = "arquicheck-session";

export default function AppPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    // Platform operator impersonation: fragment `#imp=<base64(session)>` hands off a
    // session to this tab without touching localStorage — we use sessionStorage so the
    // operator's own tab keeps its admin session.
    if (window.location.hash.startsWith("#imp=")) {
      try {
        const encoded = window.location.hash.slice(5);
        const decoded = decodeURIComponent(escape(atob(encoded)));
        const parsed = JSON.parse(decoded);
        if (parsed?.access_token && parsed?.user) {
          window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        }
      } catch {
        // ignore — fall through to normal auth
      }
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }

    // If the URL carries an invite or reset token, skip the auth check —
    // ControlCenter handles these flows itself (setup-account / password-reset).
    const params = new URLSearchParams(window.location.search);
    if (params.get("invite") || params.get("reset")) {
      setAuthed(true);
      setChecked(true);
      return;
    }

    const raw =
      window.sessionStorage.getItem(STORAGE_KEY) ??
      window.localStorage.getItem(STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
      router.replace("/login");
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      const payload = JSON.parse(atob(parsed.access_token.split(".")[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        window.localStorage.removeItem(STORAGE_KEY);
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
        router.replace("/login");
        return;
      }
      setAuthed(true);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      router.replace("/login");
      return;
    }
    setChecked(true);
  }, [router]);

  if (!checked || !authed) {
    return <div className="min-h-screen bg-[#0a0e1a]" />;
  }
  return <ControlCenter />;
}

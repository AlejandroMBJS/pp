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
    const raw =
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

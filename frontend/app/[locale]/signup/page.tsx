"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { SiteHeader } from "@/components/site-header";

const STORAGE_KEY = "projectpulse-session";

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    company_name: "",
    company_slug: "",
    owner_name: "",
    owner_email: "",
    password: "",
  });
  const [slugTouched, setSlugTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(STORAGE_KEY)) {
      router.replace("/app");
    }
  }, [router]);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "company_name" && !slugTouched) {
        next.company_slug = slugify(value);
      }
      return next;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    for (const [k, v] of Object.entries(form)) {
      if (!v.trim()) {
        setError(`Falta ${k.replace("_", " ")}`);
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error creando cuenta");
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      router.replace("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando cuenta");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white">
      <SiteHeader current="signup" />
      <main className="max-w-md mx-auto px-6 py-16">
        <h1 className="text-3xl font-black mb-2">Crea tu cuenta</h1>
        <p className="text-sm text-white/60 mb-8">
          14 días gratis con todas las funciones. Sin tarjeta.
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field
            label="Nombre de empresa"
            value={form.company_name}
            onChange={(v) => update("company_name", v)}
            placeholder="Constructora Ejemplo S.A."
          />
          <Field
            label="Slug de empresa"
            value={form.company_slug}
            onChange={(v) => {
              setSlugTouched(true);
              update("company_slug", slugify(v));
            }}
            placeholder="constructora-ejemplo"
          />
          <Field
            label="Tu nombre"
            value={form.owner_name}
            onChange={(v) => update("owner_name", v)}
            placeholder="María Pérez"
          />
          <Field
            label="Email"
            type="email"
            value={form.owner_email}
            onChange={(v) => update("owner_email", v)}
            placeholder="maria@empresa.com"
          />
          <Field
            label="Contraseña"
            type="password"
            value={form.password}
            onChange={(v) => update("password", v)}
            placeholder="Mínimo 8 caracteres"
          />
          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-black uppercase tracking-widest shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Creando...
              </>
            ) : (
              <>
                <UserPlus size={16} /> Crear cuenta gratis
              </>
            )}
          </button>
        </form>
        <p className="text-center text-xs text-white/50 mt-6">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="text-cyan-400 hover:text-cyan-300 font-bold">
            Entrar
          </Link>
        </p>
        <p className="text-center text-[10px] text-white/30 mt-4">
          Al crear tu cuenta aceptas nuestros{" "}
          <Link href="/legal/terms" className="underline">
            Términos
          </Link>{" "}
          y{" "}
          <Link href="/legal/privacy" className="underline">
            Privacidad
          </Link>
          .
        </p>
      </main>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-widest font-bold text-white/50 mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-blue-500/50"
      />
    </div>
  );
}

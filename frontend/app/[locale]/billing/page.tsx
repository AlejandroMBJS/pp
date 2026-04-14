import Link from "next/link";
import { XCircle } from "lucide-react";

export const metadata = {
  title: "Pago cancelado — ProjectPulse",
  robots: { index: false, follow: false },
};

export default function BillingCancelPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] text-white p-6">
      <div className="max-w-md w-full bg-white/[0.03] border border-white/10 rounded-2xl p-8 text-center">
        <XCircle size={48} className="mx-auto mb-4 text-amber-400" />
        <h1 className="text-xl font-black mb-2">Pago cancelado</h1>
        <p className="text-sm text-white/60 mb-6">
          No te preocupes — no se cobró nada. Puedes volver a intentarlo cuando quieras desde tu panel de billing.
        </p>
        <div className="flex flex-col gap-2">
          <Link
            href="/app"
            className="inline-block px-4 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-black uppercase tracking-widest"
          >
            Volver al dashboard
          </Link>
          <Link
            href="/pricing"
            className="inline-block px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-black uppercase tracking-widest text-white/70"
          >
            Ver planes
          </Link>
        </div>
      </div>
    </div>
  );
}

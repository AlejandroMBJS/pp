import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 mt-20">
      <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8 text-xs">
        <div>
          <div className="text-sm font-black tracking-widest uppercase mb-3">ProjectPulse</div>
          <p className="text-white/40 leading-relaxed">
            Control de calidad, evidencia geolocalizada y auditorías IA para proyectos técnicos.
          </p>
        </div>
        <div>
          <div className="font-bold text-white/70 mb-3 uppercase tracking-widest">Producto</div>
          <ul className="space-y-2 text-white/50">
            <li><Link href="/#features" className="hover:text-white">Features</Link></li>
            <li><Link href="/pricing" className="hover:text-white">Precios</Link></li>
            <li><Link href="/#faq" className="hover:text-white">FAQ</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-bold text-white/70 mb-3 uppercase tracking-widest">Empresa</div>
          <ul className="space-y-2 text-white/50">
            <li><Link href="/login" className="hover:text-white">Entrar</Link></li>
            <li><Link href="/signup" className="hover:text-white">Crear cuenta</Link></li>
            <li><a href="mailto:hola@projpul.com" className="hover:text-white">Contacto</a></li>
          </ul>
        </div>
        <div>
          <div className="font-bold text-white/70 mb-3 uppercase tracking-widest">Legal</div>
          <ul className="space-y-2 text-white/50">
            <li><Link href="/legal/terms" className="hover:text-white">Términos</Link></li>
            <li><Link href="/legal/privacy" className="hover:text-white">Privacidad</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/5 py-5 text-center text-[11px] text-white/30">
        © {new Date().getFullYear()} ProjectPulse. Todos los derechos reservados.
      </div>
    </footer>
  );
}

"use client";

import { useEffect, useState, useRef, type FormEvent } from "react";
import { Input } from "./ui/form-input";
import { Briefcase, Building2, ChevronRight, Key, Mail, ShieldCheck, User } from "lucide-react";

type DemoPayload = {
  product: string;
  message: string;
  demo_accounts: Array<{ role: string; email: string }>;
  suggested_flow: string[];
};

type AuthFormState = {
  company_name: string;
  company_slug: string;
  owner_name: string;
  owner_email: string;
  password: string;
  email: string;
};

type InviteSetupFormState = {
  password: string;
  confirmPassword: string;
};

type PublicWorkspaceProps = {
  demo: DemoPayload | null;
  authForm: AuthFormState;
  setAuthForm: (state: AuthFormState) => void;
  inviteToken: string;
  inviteSetupForm: InviteSetupFormState;
  setInviteSetupForm: (state: InviteSetupFormState) => void;
  onRegister: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onLogin: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onSetupAccount: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onExitInviteSetup: () => void;
  loading: boolean;
};

export function PublicWorkspace({
  demo,
  authForm,
  setAuthForm,
  inviteToken,
  inviteSetupForm,
  setInviteSetupForm,
  onRegister,
  onLogin,
  onSetupAccount,
  onExitInviteSetup,
  loading,
}: PublicWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const [demoFilled, setDemoFilled] = useState(false);
  const loginFormRef = useRef<HTMLFormElement>(null);
  const [inviteInfo, setInviteInfo] = useState<{
    email: string;
    full_name: string;
    role: string;
    company_name: string;
  } | null>(null);
  const [inviteLookupState, setInviteLookupState] = useState<"idle" | "loading" | "ok" | "error">(
    inviteToken ? "loading" : "idle"
  );

  useEffect(() => {
    if (!inviteToken) {
      setInviteInfo(null);
      setInviteLookupState("idle");
      return;
    }
    let cancelled = false;
    setInviteLookupState("loading");
    fetch(`/api/v1/auth/invite/${encodeURIComponent(inviteToken)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("lookup failed");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setInviteInfo({
          email: data.email,
          full_name: data.full_name,
          role: data.role,
          company_name: data.company_name,
        });
        setInviteLookupState("ok");
      })
      .catch(() => {
        if (cancelled) return;
        setInviteInfo(null);
        setInviteLookupState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  return (
    <div
      className="min-h-screen p-6 md:p-12 lg:p-20 flex flex-col overflow-x-hidden"
      style={{
        background: "var(--surface-gradient)",
      }}
    >
      {/* Header */}
      <header className="mb-12 flex items-center justify-between">
        <div className="flex items-center gap-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-white/10 border border-white/10 text-lg font-black tracking-widest text-white shadow-2xl backdrop-blur-xl">
            PP
          </div>
          <div>
            <div className="text-xs font-black uppercase tracking-[0.4em] text-blue-400">ProjectPulse</div>
            <div className="text-lg font-bold text-white/90 tracking-tight">Strategic Control Console</div>
          </div>
        </div>
        
        <div className="hidden md:flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Operational servers: CDMX · GDL · MTY</span>
        </div>
      </header>

      <main className="flex-1 grid gap-12 lg:grid-cols-2 items-center max-w-7xl mx-auto w-full">
        {/* Left: Hero Section */}
        <div className="space-y-10 animate-in fade-in slide-in-from-left-8 duration-700">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-1.5 mb-6">
              <ShieldCheck size={14} className="text-blue-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-300">Military-grade infrastructure</span>
            </div>
            
            <h1 className="text-5xl md:text-6xl xl:text-7xl font-extrabold leading-[1.05] text-white tracking-tighter">
              Building the <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-sky-400 to-cyan-400 animate-gradient-x">
                 future of projects.
              </span>
            </h1>
            
            <p className="mt-8 text-xl text-white/30 leading-relaxed max-w-md">
              Digitize, supervise, and scale any project operation with a single technical control platform.
            </p>
          </div>

          <div className="glass-card p-8 border-white/5 bg-white/[0.03] backdrop-blur-2xl rounded-[32px] max-w-md relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-cyan-500/5 rounded-[32px] opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative flex items-start gap-4">
               <div className="h-10 w-10 rounded-full bg-blue-600/20 flex items-center justify-center shrink-0 border border-blue-500/20">
                  <Briefcase className="text-blue-400" size={18} />
               </div>
               <p className="text-sm font-medium leading-relaxed text-white/60 italic">
                  "{demo?.message ?? "Welcome to the ProjectPulse platform. Use quick access accounts to explore the product."}"
               </p>
             </div>
           </div>
          
          {/* Quick Demo Access (Always Visible) */}
          <div className="space-y-4">
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20 px-1">
              Quick Demo Access
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {(demo?.demo_accounts ?? []).map((account) => (
                <button
                  key={account.role}
                  type="button"
                  className="flex flex-col gap-2 rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-left transition-all hover:bg-white/10 hover:border-white/10 active:scale-95 group overflow-hidden relative"
                  onClick={() => {
                    setAuthForm({
                      ...authForm,
                      email: account.email,
                      password: "",
                    });
                    setActiveTab("login");
                    setDemoFilled(true);
                    setTimeout(() => {
                      loginFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                      const pwInput = loginFormRef.current?.querySelector<HTMLInputElement>('input[type="password"]');
                      pwInput?.focus();
                      setTimeout(() => setDemoFilled(false), 2000);
                    }, 100);
                  }}
                >
                  <div className="absolute -right-2 -bottom-2 opacity-5 group-hover:opacity-10 transition-opacity h-12 w-12 bg-white rounded-full blur-xl" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-400/60 group-hover:text-blue-400 transition-colors capitalize">{account.role}</span>
                  <span className="text-[9px] font-medium text-white/20 group-hover:text-white/40 transition-colors truncate">{account.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Auth Card */}
        <div className="animate-in fade-in slide-in-from-right-8 duration-700 delay-150">
          <div className="glass-card border-white/10 bg-white/[0.02] backdrop-blur-3xl rounded-[40px] shadow-2xl overflow-hidden">
            {/* Tab Switcher */}
            <div className="flex border-b border-white/5 bg-white/[0.01]">
              <button
                type="button"
                onClick={() => setActiveTab("login")}
                className={`flex-1 py-6 text-xs font-black uppercase tracking-[0.2em] transition-all relative ${
                  activeTab === "login" ? "text-white" : "text-white/20 hover:text-white/40"
                }`}
              >
                Sign In
                {activeTab === "login" && (
                  <div className="absolute bottom-0 left-1/4 right-1/4 h-1 bg-blue-500 rounded-full" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("register")}
                className={`flex-1 py-6 text-xs font-black uppercase tracking-[0.2em] transition-all relative ${
                  activeTab === "register" ? "text-white" : "text-white/20 hover:text-white/40"
                }`}
              >
                Create Company
                {activeTab === "register" && (
                  <div className="absolute bottom-0 left-1/4 right-1/4 h-1 bg-cyan-500 rounded-full" />
                )}
              </button>
            </div>

            <div className="p-10">
              {inviteToken ? (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="mb-8">
                    <h2 className="text-2xl font-black text-white tracking-tight">Activate your account</h2>
                    {inviteLookupState === "loading" && (
                      <p className="mt-2 text-sm text-white/30 font-medium">Loading invite…</p>
                    )}
                    {inviteLookupState === "error" && (
                      <p className="mt-2 text-sm text-red-400 font-medium">
                        This invite link is invalid or has expired. Ask your administrator to send a new one.
                      </p>
                    )}
                    {inviteLookupState === "ok" && inviteInfo && (
                      <div className="mt-3 rounded-2xl border border-blue-500/20 bg-blue-500/10 px-4 py-3">
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-300 mb-1">
                          Setting password for
                        </div>
                        <div className="text-sm font-bold text-white truncate">{inviteInfo.email}</div>
                        <div className="text-xs text-white/50 mt-0.5">
                          {inviteInfo.full_name} · {inviteInfo.company_name} · <span className="capitalize">{inviteInfo.role}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <form onSubmit={onSetupAccount} className="grid gap-5">
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs leading-relaxed text-emerald-100/85">
                      Use a strong password with at least 12 characters, uppercase, lowercase, and numbers.
                    </div>
                    <div className="relative group">
                      <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-white/10 group-focus-within:text-emerald-400 transition-colors" size={18} />
                      <Input
                        placeholder="Create password"
                        type="password"
                        value={inviteSetupForm.password}
                        className="pl-12 bg-white/[0.03] border-white/5 py-4 h-auto rounded-2xl"
                        onChange={(v) => setInviteSetupForm({ ...inviteSetupForm, password: v })}
                      />
                    </div>
                    <div className="relative group">
                      <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-white/10 group-focus-within:text-emerald-400 transition-colors" size={18} />
                      <Input
                        placeholder="Confirm password"
                        type="password"
                        value={inviteSetupForm.confirmPassword}
                        className="pl-12 bg-white/[0.03] border-white/5 py-4 h-auto rounded-2xl"
                        onChange={(v) => setInviteSetupForm({ ...inviteSetupForm, confirmPassword: v })}
                      />
                    </div>
                    {inviteSetupForm.confirmPassword && inviteSetupForm.password !== inviteSetupForm.confirmPassword && (
                      <p className="text-xs text-red-400/80 font-semibold">Passwords do not match</p>
                    )}
                    <button
                      className="btn-primary w-full py-5 text-sm font-black uppercase tracking-[0.2em] shadow-xl shadow-emerald-500/20 active:scale-98 transition-transform disabled:opacity-50 mt-4 rounded-3xl"
                      disabled={loading || inviteLookupState !== "ok" || !inviteSetupForm.password.trim() || !inviteSetupForm.confirmPassword.trim() || inviteSetupForm.password !== inviteSetupForm.confirmPassword}
                    >
                      {loading ? "Activating..." : "Activate account"}
                    </button>
                    <button
                      type="button"
                      onClick={onExitInviteSetup}
                      className="w-full py-3 text-xs font-black uppercase tracking-[0.2em] text-white/40 transition-colors hover:text-white/70"
                    >
                      Back to sign in
                    </button>
                  </form>
                </div>
              ) : activeTab === "login" ? (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="mb-8">
                    <h2 className="text-2xl font-black text-white tracking-tight">Welcome back</h2>
                    <p className="mt-2 text-sm text-white/30 font-medium">Access your project control dashboard.</p>
                  </div>
                  <form ref={loginFormRef} onSubmit={onLogin} className="grid gap-5">
                    <div className="relative group">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-white/10 group-focus-within:text-blue-400 transition-colors" size={18} />
                      <Input
                        placeholder="Business email"
                        type="email"
                        autoComplete="email"
                        required
                        value={authForm.email}
                        className="pl-12 bg-white/[0.03] border-white/5 py-4 h-auto rounded-2xl"
                        onChange={(v) => setAuthForm({ ...authForm, email: v })}
                      />
                    </div>
                    <div className="relative group">
                      <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-white/10 group-focus-within:text-blue-400 transition-colors" size={18} />
                      <Input
                        placeholder="Password"
                        type="password"
                        autoComplete="current-password"
                        required
                        value={authForm.password}
                        className="pl-12 bg-white/[0.03] border-white/5 py-4 h-auto rounded-2xl"
                        onChange={(v) => setAuthForm({ ...authForm, password: v })}
                      />
                    </div>
                    <button
                      className={`btn-primary w-full py-5 text-sm font-black uppercase tracking-[0.2em] active:scale-98 transition-all disabled:opacity-50 mt-4 rounded-3xl ${demoFilled ? "shadow-2xl shadow-blue-500/50 ring-2 ring-blue-400/60 scale-[1.02]" : "shadow-xl shadow-blue-500/20"}`}
                      disabled={loading || !authForm.email.trim() || !authForm.password.trim()}
                    >
                      {loading ? "Validating..." : demoFilled ? "Tap to enter" : "Enter console"}
                    </button>
                  </form>
                </div>
              ) : (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="mb-8">
                    <h2 className="text-2xl font-black text-white tracking-tight">Start today</h2>
                    <p className="mt-2 text-sm text-white/30 font-medium">Set up your operating workspace in seconds.</p>
                  </div>
                  <form onSubmit={onRegister} className="grid gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="relative group">
                        <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-white/10 group-focus-within:text-cyan-400 transition-colors" size={16} />
                        <Input
                          placeholder="Company"
                          value={authForm.company_name}
                          className="pl-11 bg-white/[0.03] border-white/5 py-3.5 h-auto rounded-xl"
                          onChange={(v) => setAuthForm({ ...authForm, company_name: v })}
                        />
                      </div>
                      <Input
                        placeholder="slug-url"
                        value={authForm.company_slug}
                        required
                        pattern="^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])?$"
                        title="lowercase letters, digits, hyphens; 3-50 chars"
                        className="bg-white/[0.03] border-white/5 py-3.5 h-auto rounded-xl"
                        onChange={(v) => setAuthForm({ ...authForm, company_slug: v.toLowerCase() })}
                      />
                    </div>
                    <div className="relative group">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 text-white/10 group-focus-within:text-cyan-400 transition-colors" size={16} />
                      <Input
                        placeholder="Full name"
                        value={authForm.owner_name}
                        className="pl-11 bg-white/[0.03] border-white/5 py-3.5 h-auto rounded-xl"
                        onChange={(v) => setAuthForm({ ...authForm, owner_name: v })}
                      />
                    </div>
                    <div className="relative group">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-white/10 group-focus-within:text-cyan-400 transition-colors" size={16} />
                      <Input
                        placeholder="Business email"
                        type="email"
                        autoComplete="email"
                        required
                        value={authForm.owner_email}
                        className="pl-11 bg-white/[0.03] border-white/5 py-3.5 h-auto rounded-xl"
                        onChange={(v) => setAuthForm({ ...authForm, owner_email: v })}
                      />
                    </div>
                    <div className="relative group">
                      <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-white/10 group-focus-within:text-cyan-400 transition-colors" size={16} />
                      <Input
                        placeholder="Password (min 8 chars)"
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={8}
                        maxLength={128}
                        value={authForm.password}
                        className="pl-11 bg-white/[0.03] border-white/5 py-3.5 h-auto rounded-xl"
                        onChange={(v) => setAuthForm({ ...authForm, password: v })}
                      />
                    </div>
                    <button
                      className="btn-secondary w-full py-5 text-sm font-black uppercase tracking-[0.2em] border-white/10 hover:bg-white/5 active:scale-98 transition-all disabled:opacity-50 mt-4 rounded-3xl"
                      disabled={loading || !authForm.company_name.trim() || !authForm.company_slug.trim() || !authForm.owner_name.trim() || !authForm.owner_email.trim() || !authForm.password.trim()}
                    >
                      {loading ? "Booting workspace..." : "Create company and enter"}
                    </button>
                  </form>
                </div>
              )}
            </div>
            
            {!inviteToken && (
              <div className="px-10 py-6 bg-white/[0.01] border-t border-white/5 flex items-center justify-center gap-4 group cursor-pointer" onClick={() => setActiveTab(activeTab === 'login' ? 'register' : 'login')}>
              <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 group-hover:text-white/40 transition-colors">
                {activeTab === 'login' ? "Don't have an account? Register" : 'Already have an account? Sign in'}
              </span>
              <ChevronRight size={10} className="text-white/10 group-hover:text-white/30 transition-all group-hover:translate-x-1" />
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="mt-20 pt-12 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6 opacity-30">
        <div className="text-[10px] font-black uppercase tracking-[0.4em] text-white">
          ProjectPulse Core v3.0 · Definitive Strategic Edition
        </div>
        <div className="flex gap-8 text-[9px] font-bold uppercase tracking-widest text-white/60">
          <span>Terms</span>
          <span>Privacy</span>
          <span>Security</span>
          <span>Status</span>
        </div>
      </footer>
    </div>
  );
}

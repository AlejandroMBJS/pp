import { Inbox } from "lucide-react";

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-white/10 bg-white/[0.02] backdrop-blur-xl px-10 py-16 text-center shadow-2xl">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 border border-white/5 shadow-inner">
        <Inbox size={32} className="text-white/20" />
      </div>
      <p className="text-sm font-medium text-white/40 tracking-tight max-w-[200px]">{text}</p>
    </div>
  );
}

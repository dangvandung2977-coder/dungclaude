import { redirect } from "next/navigation";
import Link from "next/link";
import { readSession } from "@/lib/auth/auth";
import { ShieldCheck, KeyRound, Cpu, Users, ArrowLeft, PlugZap, Gauge } from "lucide-react";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/app");
  return (
      <div className="min-h-dvh flex flex-col">
        <header className="border-b bordered surface">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-2">
            <span className="h-8 w-8 rounded-xl bg-[var(--accent)] text-white flex items-center justify-center"><ShieldCheck size={17} /></span>
            <span className="font-semibold">Admin — Quản trị nguồn API</span>
            <span className="text-[11px] bordered rounded-full px-2 py-0.5 faint ml-1">chỉ bạn thấy trang này</span>
            <span className="flex-1" />
            <Link href="/app" className="text-sm muted hover:text-[var(--text)] inline-flex items-center gap-1"><ArrowLeft size={14} /> Về chat</Link>
          </div>
          <nav className="max-w-5xl mx-auto px-4 pb-3 flex gap-1.5 text-sm">
            <Tab href="/admin" icon={<KeyRound size={14} />} label="Nguồn API" />
            <Tab href="/admin/endpoints" icon={<PlugZap size={14} />} label="Endpoints riêng" />
            <Tab href="/admin/models" icon={<Cpu size={14} />} label="Model & chức năng" />
            <Tab href="/admin/optimization" icon={<Gauge size={14} />} label="Tối ưu & Chi phí" />
            <Tab href="/admin/users" icon={<Users size={14} />} label="Người dùng" />
          </nav>
        </header>
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">{children}</main>
      </div>
  );
}

function Tab({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] hover:bg-[var(--surface-2)] font-medium">
      {icon} {label}
    </Link>
  );
}

"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input, Button } from "@/components/ui/primitives";
import { useSession } from "@/hooks/useSession";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { refresh } = useSession();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const r = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: name || undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Đăng ký thất bại");
      await refresh();
      router.push("/app");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Đăng ký lỗi");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 bg-[var(--bg)] text-[var(--text)]">
      <form onSubmit={submit} className="card-elevated w-full max-w-sm p-7 border border-[var(--border)] shadow-xl">
        <Link href="/" className="inline-flex items-center gap-2 font-semibold text-base mb-6 hover:opacity-90 transition-opacity">
          <span className="h-7 w-7 rounded-lg bg-[var(--text)] text-[var(--bg)] flex items-center justify-center font-bold text-xs shadow-xs">
            D
          </span>
          <span className="text-[15px] font-semibold">DungClaude</span>
        </Link>

        <h1 className="text-lg font-semibold tracking-tight">Tạo tài khoản mới</h1>
        <p className="text-xs text-[var(--text-2)] mt-1 mb-5">
          Khởi tạo tài khoản để trải nghiệm không gian làm việc AI.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-[var(--text-2)] block mb-1">Họ & Tên</label>
            <Input
              placeholder="VD: Nguyễn Văn A"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--text-2)] block mb-1">Email</label>
            <Input
              type="email"
              required
              placeholder="ten@congty.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--text-2)] block mb-1">Mật khẩu (≥ 6 ký tự)</label>
            <Input
              type="password"
              required
              minLength={6}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
        </div>

        {err && (
          <div className="mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs" role="alert">
            {err}
          </div>
        )}

        <Button disabled={loading} loading={loading} className="w-full mt-5 py-2.5 shadow-sm">
          Tạo tài khoản
        </Button>

        <p className="text-xs text-[var(--text-2)] mt-4 text-center">
          Đã có tài khoản?{" "}
          <Link href="/login" className="font-medium text-[var(--text)] hover:underline">
            Đăng nhập
          </Link>
        </p>
      </form>
    </div>
  );
}

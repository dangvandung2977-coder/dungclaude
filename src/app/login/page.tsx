"use client";
import React, { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AuthLayout,
  AuthCard,
  AuthInput,
  AuthButton,
  AuthError,
  AuthDivider,
  GoogleAuthButton,
} from "@/components/auth";
import { useSession } from "@/hooks/useSession";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useSession();

  useEffect(() => {
    const urlError = searchParams.get("error");
    if (urlError) {
      setErr(decodeURIComponent(urlError));
    }
  }, [searchParams]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Đăng nhập thất bại");
      await refresh();
      router.push("/app");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Đăng nhập lỗi");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Chào mừng trở lại"
      subtitle="Đăng nhập để tiếp tục công việc của bạn."
      footer={
        <div className="flex items-center justify-center gap-1.5 text-xs text-[#A6A49B]">
          <span>Chưa có tài khoản?</span>
          <Link
            href="/signup"
            className="font-medium text-[#ECEBE4] hover:text-[#D97757] transition-colors focus-visible:outline-none focus-visible:underline"
          >
            Đăng ký ngay
          </Link>
        </div>
      }
    >
      {/* 1. Google OAuth Provider */}
      <GoogleAuthButton
        disabled={loading}
        onError={(msg) => setErr(msg)}
      />

      {/* 2. Visual Divider */}
      <AuthDivider label="hoặc" />

      {/* 3. Traditional Email / Password Form */}
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <AuthInput
          label="Email"
          type="email"
          required
          placeholder="ten@congty.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          disabled={loading}
        />

        <AuthInput
          label="Mật khẩu"
          type="password"
          isPassword
          required
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          disabled={loading}
        />

        <AuthError message={err} className="mt-1" />

        <AuthButton
          type="submit"
          loading={loading}
          loadingText="Đang đăng nhập..."
          className="mt-2"
        >
          Đăng nhập
        </AuthButton>
      </form>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <AuthLayout>
      <Suspense
        fallback={
          <div className="w-full max-w-[430px] h-[480px] rounded-2xl bg-[#232220] border border-white/[0.08] animate-pulse" />
        }
      >
        <LoginForm />
      </Suspense>
    </AuthLayout>
  );
}

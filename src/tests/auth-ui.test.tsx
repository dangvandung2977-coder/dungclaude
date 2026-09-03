import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import LoginPage from "@/app/login/page";
import SignupPage from "@/app/signup/page";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthButton } from "@/components/auth/AuthButton";
import { AuthError } from "@/components/auth/AuthError";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";
import { AuthDivider } from "@/components/auth/AuthDivider";

// Mock router and hooks
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/login",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    user: null,
    loading: false,
    refresh: vi.fn(),
  }),
}));

describe("Authentication UI Components", () => {
  it("renders LoginPage with expected headings, labels, and buttons", () => {
    const html = renderToString(<LoginPage />);
    expect(html).toContain("Chào mừng trở lại");
    expect(html).toContain("Đăng nhập để tiếp tục công việc của bạn.");
    expect(html).toContain("Tiếp tục với Google");
    expect(html).toContain("hoặc");
    expect(html).toContain("Email");
    expect(html).toContain("Mật khẩu");
    expect(html).toContain("Đăng nhập");
    expect(html).toContain("Chưa có tài khoản?");
    expect(html).toContain("Đăng ký ngay");
  });

  it("renders SignupPage with name, email, password fields and Google button", () => {
    const html = renderToString(<SignupPage />);
    expect(html).toContain("Tạo không gian làm việc");
    expect(html).toContain("Khởi tạo không gian làm việc AI của bạn.");
    expect(html).toContain("Tiếp tục với Google");
    expect(html).toContain("hoặc");
    expect(html).toContain("Họ &amp; Tên");
    expect(html).toContain("Email");
    expect(html).toContain("Mật khẩu");
    expect(html).toContain("Tạo tài khoản");
    expect(html).toContain("Đã có tài khoản?");
  });

  it("renders GoogleAuthButton with Google SVG icon and accessible label", () => {
    const html = renderToString(<GoogleAuthButton />);
    expect(html).toContain("Tiếp tục với Google");
    expect(html).toContain('aria-label="Tiếp tục với Google"');
    expect(html).toContain("<svg");
  });

  it("renders AuthDivider with custom or default label", () => {
    const defaultHtml = renderToString(<AuthDivider />);
    expect(defaultHtml).toContain("hoặc");

    const customHtml = renderToString(<AuthDivider label="hoặc tiếp tục bằng" />);
    expect(customHtml).toContain("hoặc tiếp tục bằng");
  });

  it("renders AuthInput with password toggle button when isPassword is true", () => {
    const html = renderToString(
      <AuthInput label="Mật khẩu bí mật" isPassword placeholder="test password" />
    );
    expect(html).toContain("Mật khẩu bí mật");
    expect(html).toContain('type="password"');
    expect(html).toContain("Hiện mật khẩu");
  });

  it("renders AuthButton in idle and loading states", () => {
    const idleHtml = renderToString(<AuthButton>Tiếp tục</AuthButton>);
    expect(idleHtml).toContain("Tiếp tục");
    expect(idleHtml).not.toContain("animate-spin");

    const loadingHtml = renderToString(
      <AuthButton loading loadingText="Đang xử lý tài khoản...">
        Tiếp tục
      </AuthButton>
    );
    expect(loadingHtml).toContain("Đang xử lý tài khoản...");
    expect(loadingHtml).toContain("animate-spin");
    expect(loadingHtml).toContain("disabled");
  });

  it("renders AuthError only when message is present", () => {
    const emptyHtml = renderToString(<AuthError message="" />);
    expect(emptyHtml).toBe("");

    const errorHtml = renderToString(<AuthError message="Mật khẩu không chính xác" />);
    expect(errorHtml).toContain("Mật khẩu không chính xác");
    expect(errorHtml).toContain('role="alert"');
  });
});

"use client";
import React, { useState } from "react";
import { X, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "accent" | "ghost" | "outline" | "danger";
  size?: "xs" | "sm" | "md" | "lg";
  loading?: boolean;
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const sizeClasses = {
    xs: "px-2.5 py-1 text-xs rounded-md gap-1.5",
    sm: "px-3 py-1.5 text-xs font-medium rounded-lg gap-1.5",
    md: "px-3.5 py-2 text-sm font-medium rounded-[10px] gap-2",
    lg: "px-5 py-2.5 text-sm font-medium rounded-[10px] gap-2.5",
  }[size];

  const variantClasses = {
    primary: "btn-primary",
    secondary: "bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--surface-hover)] border border-[var(--border)]",
    accent: "btn-accent",
    ghost: "hover:bg-[var(--surface-hover)] text-[var(--text-2)] hover:text-[var(--text)]",
    outline: "bordered hover:bg-[var(--surface-hover)] text-[var(--text)]",
    danger: "bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20",
  }[variant];

  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-all select-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
        sizeClasses,
        variantClasses,
        loading && "opacity-75 cursor-wait",
        className
      )}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <svg className="animate-spin -ml-0.5 h-3.5 w-3.5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

export function IconButton({
  children,
  label,
  className,
  active,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      aria-label={label}
      title={label}
      {...props}
      className={cn(
        "p-1.5 rounded-lg text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer flex items-center justify-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed",
        active && "bg-[var(--surface-hover)] text-[var(--text)]",
        className
      )}
    >
      {children}
    </button>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "input w-full px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)]",
        className
      )}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "input w-full px-3 py-2 text-sm resize-none text-[var(--text)] placeholder:text-[var(--text-3)]",
        className
      )}
    />
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  description,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity" onClick={onClose} />
      <div
        className={cn(
          "card-elevated relative w-full p-6 z-10 animate-in fade-in zoom-in-95 duration-150 border border-[var(--border)]",
          wide ? "max-w-2xl" : "max-w-md"
        )}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-[var(--text)]">{title}</h2>
            {description && <p className="text-xs text-[var(--text-2)] mt-0.5">{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Đóng modal"
            className="p-1 rounded-md text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ?? "toggle switch"}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-150 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
        checked ? "bg-[var(--accent)]" : "bg-[var(--surface-2)] border border-[var(--border)]"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform ring-0 transition duration-150 ease-in-out mt-[2px]",
          checked ? "translate-x-4" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: "default" | "accent" | "success" | "warning" | "outline";
  className?: string;
}) {
  const variantStyles = {
    default: "bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--border)]",
    accent: "bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-border)]",
    success: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
    outline: "border border-[var(--border)] text-[var(--text-2)]",
  }[variant];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium tracking-tight whitespace-nowrap",
        variantStyles,
        className
      )}
    >
      {children}
    </span>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: Array<{ id: T; label: string; icon?: React.ReactNode; badge?: string | number }>;
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-1 p-1 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]", className)}>
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer",
              active
                ? "bg-[var(--surface)] text-[var(--text)] shadow-xs"
                : "text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]"
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.badge !== undefined && (
              <span className={cn("ml-1 px-1.5 py-0.2 rounded-full text-[10px]", active ? "bg-[var(--surface-2)] text-[var(--text)]" : "bg-[var(--surface)] text-[var(--text-3)]")}>
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function useToast() {
  const [items, setItems] = useState<Array<{ id: number; msg: string; type?: "success" | "error" | "info" }>>([]);

  function toast(msg: string, type: "success" | "error" | "info" = "info") {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, msg, type }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 2600);
  }

  function Toasts() {
    return (
      <div className="fixed bottom-5 right-5 z-[70] flex flex-col gap-2 pointer-events-none" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto card-elevated px-4 py-2.5 text-xs font-medium shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150 border border-[var(--border)]"
          >
            {t.type === "success" && <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />}
            {t.type === "error" && <AlertCircle size={14} className="text-red-400 shrink-0" />}
            {t.type === "info" && <Info size={14} className="text-[var(--accent)] shrink-0" />}
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    );
  }

  return { toast, Toasts };
}

export function Empty({
  icon,
  title,
  hint,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      {icon && <div className="mb-3.5 text-[var(--text-3)]">{icon}</div>}
      <p className="font-semibold text-sm tracking-tight text-[var(--text)]">{title}</p>
      {hint && <p className="text-xs text-[var(--text-2)] mt-1 max-w-sm leading-relaxed">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2.5 p-3" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-10 w-full" />
      ))}
    </div>
  );
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title = "Xác nhận thao tác",
  description = "Thao tác này không thể hoàn tác.",
  confirmText = "Xác nhận",
  cancelText = "Hủy",
  danger = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-sm p-5 rounded-2xl bg-[#262523] border border-white/10 shadow-2xl z-10 animate-in fade-in zoom-in-95 duration-150 text-[#ECEBE4]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3.5 mb-4">
          {danger && (
            <div className="h-9 w-9 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0">
              <AlertCircle size={18} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-[#ECEBE4] tracking-tight">{title}</h3>
            {description && (
              <p className="text-xs text-[#A6A49B] mt-1 leading-relaxed">{description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-[#A6A49B] hover:text-[#ECEBE4] hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={async () => {
              await onConfirm();
              onClose();
            }}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer shadow-xs active:scale-95",
              danger
                ? "bg-[#D97757] hover:bg-[#c46849] text-white"
                : "bg-white text-black hover:opacity-90"
            )}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}


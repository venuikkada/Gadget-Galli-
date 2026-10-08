import { Loader2, X } from 'lucide-react';
import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

import { STATUS_COLORS, STATUS_LABEL, type OrderStatus, type ShopStatus } from '@gg/shared';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
type ButtonVariant = 'primary' | 'action' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';

const BUTTON: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-dark shadow-sm',
  action: 'bg-action text-white hover:bg-action-dark shadow-sm',
  secondary: 'bg-primary-soft text-primary hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-200',
  outline: 'border border-slate-300 bg-white text-ink hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800',
  ghost: 'text-primary hover:bg-primary-soft dark:text-indigo-300 dark:hover:bg-slate-800',
  danger: 'bg-error text-white hover:bg-red-700 shadow-sm',
  success: 'bg-success text-white hover:bg-green-700 shadow-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  children,
  className,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode }) {
  const sizes = { sm: 'h-8 px-3 text-xs gap-1.5', md: 'h-10 px-4 text-sm gap-2', lg: 'h-12 px-5 text-base gap-2' };
  return (
    <button
      type="button"
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------
export function Card({ children, className, title, actions, padded = true }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode; padded?: boolean }) {
  return (
    <section className={cx('rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900', className)}>
      {title || actions ? (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
          <h3 className="text-base font-semibold">{title}</h3>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint, tone = 'primary', onClick }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'primary' | 'action' | 'success' | 'warning' | 'error'; onClick?: () => void }) {
  const bar = { primary: 'bg-primary', action: 'bg-action', success: 'bg-success', warning: 'bg-warning', error: 'bg-error' }[tone];
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cx(
        'relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm dark:border-slate-800 dark:bg-slate-900',
        onClick && 'transition hover:-translate-y-0.5 hover:shadow-md',
      )}
    >
      <span className={cx('absolute inset-y-0 left-0 w-1', bar)} />
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="tabular mt-1 text-2xl font-bold">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</div> : null}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------
type Tone = 'neutral' | 'primary' | 'action' | 'success' | 'warning' | 'error';
const BADGE: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  primary: 'bg-primary-soft text-primary dark:bg-indigo-950 dark:text-indigo-300',
  action: 'bg-action-soft text-action-dark dark:bg-orange-950 dark:text-orange-300',
  success: 'bg-success-soft text-green-800 dark:bg-green-950 dark:text-green-300',
  warning: 'bg-warning-soft text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  error: 'bg-error-soft text-red-800 dark:bg-red-950 dark:text-red-300',
};

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold', BADGE[tone], className)}>{children}</span>;
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const c = STATUS_COLORS[status];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold" style={{ background: c.bg, color: c.fg }}>
      <span className="size-1.5 rounded-full" style={{ background: c.dot }} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export const SHOP_STATUS_LABEL: Record<ShopStatus, string> = {
  draft: 'Draft',
  under_review: 'Under review',
  changes_requested: 'Changes requested',
  approved: 'Live',
  rejected: 'Rejected',
  suspended: 'Suspended',
};
const SHOP_STATUS_TONE: Record<ShopStatus, Tone> = {
  draft: 'neutral',
  under_review: 'primary',
  changes_requested: 'warning',
  approved: 'success',
  rejected: 'error',
  suspended: 'error',
};

export function ShopStatusBadge({ status }: { status: ShopStatus }) {
  return <Badge tone={SHOP_STATUS_TONE[status]}>{SHOP_STATUS_LABEL[status]}</Badge>;
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------
const FIELD = 'rounded-lg border border-slate-300 bg-white px-3 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

export function Field({ label, hint, error, children, className }: { label?: string; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block space-y-1.5', className)}>
      {label ? <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</span> : null}
      {children}
      {error ? <span className="block text-xs text-error">{error}</span> : hint ? <span className="block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

/** Full width unless the caller sets its own width (w-*, flex-*). */
const width = (className?: string) => (/(^|\s)(w-|flex-|min-w-)/.test(className ?? '') ? '' : 'w-full');

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(FIELD, width(className), 'h-10', className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(FIELD, width(className), 'min-h-24 py-2', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(FIELD, width(className), 'h-10 pr-8', className)} {...rest}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx('inline-flex cursor-pointer select-none items-center gap-2 text-sm', disabled && 'cursor-not-allowed opacity-50')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative h-6 w-11 rounded-full transition', checked ? 'bg-success' : 'bg-slate-300 dark:bg-slate-700')}
      >
        <span className={cx('absolute top-0.5 size-5 rounded-full bg-white shadow transition', checked ? 'left-5.5' : 'left-0.5')} />
      </button>
      {label}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className="w-full min-w-[640px] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cx('whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400', className)}>{children}</th>;
}

export function Td({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={cx('border-b border-slate-100 px-4 py-3 align-middle dark:border-slate-800', className)}>{children}</td>;
}

export function Tr({ children, onClick, className }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return <tr onClick={onClick} className={cx(onClick && 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50', className)}>{children}</tr>;
}

// ---------------------------------------------------------------------------
// Tabs, pagination
// ---------------------------------------------------------------------------
export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition',
            value === o.value ? 'bg-white text-primary shadow-sm dark:bg-slate-800 dark:text-indigo-300' : 'text-slate-600 hover:text-ink dark:text-slate-400 dark:hover:text-slate-100',
          )}
        >
          {o.label}
          {o.count != null ? <span className="rounded-md bg-slate-200 px-1.5 text-xs dark:bg-slate-700">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ total, limit, offset, onChange }: { total: number; limit: number; offset: number; onChange: (offset: number) => void }) {
  if (total <= limit) return null;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.ceil(total / limit);
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-3 text-sm text-slate-500">
      <span>
        {offset + 1}–{Math.min(offset + limit, total)} of {total}
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onChange(Math.max(0, offset - limit))}>
          Previous
        </Button>
        <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onChange(offset + limit)}>
          Next
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
      <Loader2 className="size-5 animate-spin text-primary" />
      {label}
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="mb-2 size-14 rounded-2xl bg-primary-soft dark:bg-indigo-950" />
      <div className="font-semibold">{title}</div>
      {body ? <div className="max-w-md text-sm text-slate-500">{body}</div> : null}
      {action}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-error-soft px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
      <span>{error}</span>
      {onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={cx('flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl dark:bg-slate-900', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800">{footer}</div> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toasts (module-level, no provider needed)
// ---------------------------------------------------------------------------
type ToastItem = { id: number; text: string; tone: 'success' | 'error' | 'info' };
let listeners: ((t: ToastItem[]) => void)[] = [];
let toasts: ToastItem[] = [];
let seq = 0;

export function toast(text: string, tone: ToastItem['tone'] = 'success') {
  const item = { id: ++seq, text, tone };
  toasts = [...toasts, item];
  listeners.forEach((l) => l(toasts));
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== item.id);
    listeners.forEach((l) => l(toasts));
  }, 3800);
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>(toasts);
  useEffect(() => {
    listeners.push(setItems);
    return () => {
      listeners = listeners.filter((l) => l !== setItems);
    };
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cx(
            'pointer-events-auto rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg',
            t.tone === 'success' ? 'bg-success' : t.tone === 'error' ? 'bg-error' : 'bg-ink',
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** Small helper for "are you sure?" prompts that need a typed reason. */
export function ReasonModal({
  open,
  onClose,
  title,
  description,
  placeholder,
  confirmLabel,
  danger,
  required = true,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  placeholder?: string;
  confirmLabel: string;
  danger?: boolean;
  required?: boolean;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setReason('');
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            disabled={required && !reason.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(reason.trim());
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description ? <div className="text-sm text-slate-600 dark:text-slate-300">{description}</div> : null}
      <Textarea autoFocus placeholder={placeholder} value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
}

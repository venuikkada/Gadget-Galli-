import { BadgeCheck, ReceiptText, ShieldCheck, Wallet } from "lucide-react";
import { useState } from "react";
import { Navigate } from "react-router";

import { Button, Field, Input } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const HIGHLIGHTS = [
  {
    icon: Wallet,
    text: "Verify customer payments in minutes, with a sound alert for each one",
  },
  {
    icon: BadgeCheck,
    text: "Approve shops and products, and feature the best on the home screen",
  },
  {
    icon: ReceiptText,
    text: "Follow every order from request to delivery, and fix stuck ones",
  },
  {
    icon: ShieldCheck,
    text: "Pay shops after delivery and settle problem reports",
  },
];

export default function LoginPage() {
  const {
    session,
    profile,
    isAdmin,
    needsCode,
    loading,
    signIn,
    verifyCode,
    signOut,
  } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && session && isAdmin) return <Navigate to="/" replace />;
  const noAccess = !loading && session && profile && !isAdmin && !needsCode;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      const msg = errorMessage(err);
      setError(/invalid login/i.test(msg) ? "Wrong email or password." : msg);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await verifyCode(code);
    } catch (err) {
      setCode("");
      setError(
        /invalid|expired/i.test(errorMessage(err))
          ? "That code is wrong or expired. Enter the newest code from your app."
          : errorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  };

  if (!loading && session && needsCode) {
    return (
      <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-primary-950 to-primary-700 p-4">
        <form
          onSubmit={submitCode}
          className="w-full max-w-sm space-y-5 rounded-2xl bg-white p-7 shadow-xl dark:bg-slate-900"
        >
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="" className="size-11 rounded-xl" />
            <div>
              <h1 className="text-xl font-bold">2-step verification</h1>
              <p className="text-xs text-ink-muted">
                Open your authenticator app and enter the 6-digit code for
                Gadget Galli.
              </p>
            </div>
          </div>
          <Field label="6-digit code">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              maxLength={6}
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              className="text-center text-2xl tracking-[0.5em]"
              data-testid="login-code"
            />
          </Field>
          {error ? <p className="text-sm text-error-ink">{error}</p> : null}
          <Button
            type="submit"
            className="w-full"
            size="lg"
            loading={busy}
            disabled={code.length !== 6}
          >
            Verify
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={signOut}
          >
            Use another account
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-gradient-to-br from-primary-950 via-primary-900 to-primary-700 p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-24 size-96 rounded-full bg-white/5"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-24 size-[28rem] rounded-full bg-accent/10"
      />
      <div className="relative grid w-full max-w-4xl items-center gap-12 lg:grid-cols-2">
        <div className="hidden text-white lg:block">
          <img
            src="/logo.png"
            alt=""
            className="size-14 rounded-2xl shadow-lg"
          />
          <h2 className="mt-6 font-display text-4xl leading-tight font-bold">
            Run Hyderabad’s gadget marketplace
          </h2>
          <p className="mt-3 text-white/80">
            Shops, orders, payments and payouts, all in one place.
          </p>
          <ul className="mt-8 space-y-4 text-sm">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10">
                  <Icon className="size-4 text-accent" />
                </span>
                <span className="text-white/90">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <form
          onSubmit={submit}
          className="mx-auto w-full max-w-sm space-y-5 rounded-2xl bg-white p-7 shadow-xl dark:bg-slate-900"
        >
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="" className="size-11 rounded-xl" />
            <div>
              <h1 className="text-xl font-bold">Gadget Galli Admin</h1>
              <p className="text-xs text-ink-muted">
                For the Gadget Galli team only
              </p>
            </div>
          </div>
          {noAccess ? (
            <div className="space-y-3 rounded-xl bg-error-soft p-3 text-sm text-error-ink">
              <p>This account does not have admin access.</p>
              <Button size="sm" variant="outline" onClick={signOut}>
                Use another account
              </Button>
            </div>
          ) : null}
          <Field label="Email">
            <Input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@gadgetgalli.in"
              data-testid="login-email"
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="login-password"
            />
          </Field>
          {error ? <p className="text-sm text-error-ink">{error}</p> : null}
          <Button
            type="submit"
            className="w-full"
            size="lg"
            loading={busy}
            data-testid="login-submit"
          >
            Log in
          </Button>
        </form>
      </div>
    </div>
  );
}

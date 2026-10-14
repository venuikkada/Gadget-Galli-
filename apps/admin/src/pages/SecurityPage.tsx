import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { useState } from 'react';

import { Badge, Button, Card, ErrorBox, Field, Input, PageHeader, Spinner, Table, Td, Th, toast, Tr } from '@/components/ui';
import { errorMessage, rpc } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

interface Enrolment {
  factorId: string;
  qr: string;
  secret: string;
}

interface AdminSecurityRow {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  mfa: boolean;
}

/**
 * Optional 2-step verification for admins (docs/SECURITY.md). With it on, logging in needs the password and a
 * 6-digit code from an authenticator app, and the database treats a password-only session as a non-admin.
 */
export default function SecurityPage() {
  const { isSuper } = useAuth();
  const qc = useQueryClient();
  const factors = useQuery({
    queryKey: ['mfa-factors'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      return data.totp;
    },
  });
  const team = useQuery({ queryKey: ['admin-security'], queryFn: () => rpc<AdminSecurityRow[]>('admin_security_overview'), enabled: isSuper });
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const on = (factors.data ?? []).find((f) => f.status === 'verified');

  const start = async () => {
    setBusy(true);
    try {
      // Drop an unfinished earlier attempt, so a fresh QR code can be made.
      const { data: all } = await supabase.auth.mfa.listFactors();
      for (const f of all?.all ?? []) if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Gadget Galli ${new Date().toISOString().slice(0, 10)}` });
      if (error) throw error;
      setEnrolment({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!enrolment) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrolment.factorId, code: code.trim() });
      if (error) throw error;
      setEnrolment(null);
      setCode('');
      toast('2-step verification is on. You will need a code from your app at every login.', 'success');
      await qc.invalidateQueries({ queryKey: ['mfa-factors'] });
      await qc.invalidateQueries({ queryKey: ['admin-security'] });
    } catch (err) {
      toast(/invalid|expired/i.test(errorMessage(err)) ? 'That code is wrong or expired. Enter the newest code from your app.' : errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    if (!on || !window.confirm('Turn off 2-step verification? Anyone with your password could then log in as you.')) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: on.id });
      if (error) throw error;
      toast('2-step verification is off.', 'success');
      await qc.invalidateQueries({ queryKey: ['mfa-factors'] });
      await qc.invalidateQueries({ queryKey: ['admin-security'] });
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Security" subtitle="Protect the admin panel with a code from your phone, in addition to your password." />

      <Card title="2-step verification">
        {factors.isLoading ? (
          <Spinner />
        ) : factors.isError ? (
          <ErrorBox error={errorMessage(factors.error)} onRetry={() => factors.refetch()} />
        ) : on ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="size-8 text-success-ink" />
              <div>
                <p className="font-semibold">On</p>
                <p className="text-sm text-ink-muted">Logging in needs your password and the 6-digit code from your authenticator app.</p>
              </div>
            </div>
            <Button variant="outline" icon={<ShieldOff className="size-4" />} loading={busy} onClick={turnOff}>
              Turn off
            </Button>
          </div>
        ) : enrolment ? (
          <div className="grid gap-6 md:grid-cols-[220px_1fr]">
            <img src={enrolment.qr} alt="QR code for your authenticator app" className="size-52 rounded-xl bg-white p-2" />
            <div className="space-y-4">
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                <li>Install Google Authenticator or Microsoft Authenticator on your phone.</li>
                <li>Tap <b>+</b> and scan this QR code.</li>
                <li>Type the 6-digit code it shows below.</li>
              </ol>
              <p className="text-xs text-ink-muted">
                Can't scan? Enter this key by hand: <code className="break-all font-mono">{enrolment.secret}</code>
              </p>
              <Field label="6-digit code">
                <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="max-w-48 text-center text-xl tracking-[0.4em]" />
              </Field>
              <div className="flex gap-2">
                <Button loading={busy} disabled={code.length !== 6} onClick={confirm}>
                  Turn on
                </Button>
                <Button variant="ghost" onClick={() => setEnrolment(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-semibold">Off</p>
              <p className="text-sm text-ink-muted">Recommended: even if someone learns your password, they can't log in without your phone.</p>
            </div>
            <Button icon={<ShieldCheck className="size-4" />} loading={busy} onClick={start}>
              Turn on
            </Button>
          </div>
        )}
      </Card>

      {isSuper ? (
        <Card title="Admin team" padded={false}>
          {team.isLoading ? (
            <Spinner />
          ) : team.isError ? (
            <ErrorBox error={errorMessage(team.error)} onRetry={() => team.refetch()} />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>2-step</Th>
                </tr>
              </thead>
              <tbody>
                {(team.data ?? []).map((a) => (
                  <Tr key={a.id}>
                    <Td>{a.name ?? '—'}</Td>
                    <Td>{a.email ?? '—'}</Td>
                    <Td>{a.role.replace('_', ' ')}</Td>
                    <Td>{a.mfa ? <Badge tone="success">On</Badge> : <Badge tone="warning">Off</Badge>}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      ) : null}
    </div>
  );
}

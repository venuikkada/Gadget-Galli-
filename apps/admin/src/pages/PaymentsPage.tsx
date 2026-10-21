import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Copy, Phone, Upload, Wallet, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { formatDateTimeIST, formatINR, formatPhone, isValidUpiId, timeAgo } from '@gg/shared';

import { UpiQr } from '@/components/UpiQr';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHeader, ReasonModal, Spinner, Table, Tabs, Td, Th, toast, Tr } from '@/components/ui';
import { errorMessage, publicUrl, rpc, uploadPublic } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { PaidPayout, PaymentSettings, PaymentsToVerify, PayoutShop } from '@/lib/types';

type Tab = 'verify' | 'due' | 'held' | 'paid' | 'settings';
const TABS: Tab[] = ['verify', 'due', 'held', 'paid', 'settings'];

/**
 * Customers pay Gadget Galli by UPI or bank transfer and enter the reference; you check your bank app and confirm,
 * and the shop then packs and sends. After delivery you pay each shop by UPI and record the reference
 * (docs/DECISIONS.md #52). Where customers pay (UPI ID, QR image, bank account) is set in the Settings tab.
 */
export default function PaymentsPage() {
  const { isSuper } = useAuth();
  const settings = useQuery({ queryKey: ['payments', 'settings'], queryFn: () => rpc<PaymentSettings>('platform_payment_info'), enabled: isSuper });
  const [tab, setTab] = useState<Tab>(() => {
    const asked = new URLSearchParams(location.search).get('tab') as Tab | null;
    // Settings is for super admins; an unknown or not-allowed tab falls back to the payments to verify
    return asked && TABS.includes(asked) && (asked !== 'settings' || isSuper) ? asked : 'verify';
  });
  const verify = useQuery({ queryKey: ['payments', 'verify'], queryFn: () => rpc<PaymentsToVerify>('admin_list_payments_to_verify'), refetchInterval: 15_000 });
  // Nothing set up yet: open Settings first, because customers cannot pay until it is filled in
  const notReady = isSuper && settings.data?.ready === false;
  useEffect(() => {
    if (notReady && !new URLSearchParams(location.search).get('tab')) setTab('settings');
  }, [notReady]);

  return (
    <div className="space-y-6">
      <PageHeader title="Payments" subtitle="Customers pay Gadget Galli. Shops are paid after the customer receives the order." />
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'verify', label: `To verify${verify.data?.items.length ? ` (${verify.data.items.length})` : ''}` },
          { value: 'due', label: 'Payouts due' },
          { value: 'held', label: 'On hold' },
          { value: 'paid', label: 'Paid' },
          ...(isSuper ? [{ value: 'settings' as const, label: 'Settings' }] : []),
        ]}
      />
      {tab === 'verify' ? <VerifyTab q={verify} /> : null}
      {tab === 'due' || tab === 'held' ? <PayoutsTab status={tab} /> : null}
      {tab === 'paid' ? <PaidTab /> : null}
      {tab === 'settings' && isSuper ? <SettingsTab /> : null}
    </div>
  );
}

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['payments'] });
    qc.invalidateQueries({ queryKey: ['overview'] });
    qc.invalidateQueries({ queryKey: ['orders'] });
    qc.invalidateQueries({ queryKey: ['order'] });
  };
}

function VerifyTab({ q }: { q: ReturnType<typeof useQuery<PaymentsToVerify>> }) {
  const refresh = useRefresh();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);

  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorBox error={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const items = q.data?.items ?? [];

  const confirm = async (id: string) => {
    setBusy(id);
    try {
      await rpc('admin_confirm_payment', { p_order_id: id, p_ref: null });
      toast('Payment confirmed. The shop has been told to pack and send.');
      refresh();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card
      padded={false}
      title="Check each payment in your bank or UPI app"
      actions={q.data?.awaiting ? <span className="text-xs text-ink-muted">{q.data.awaiting} more orders waiting for the customer to pay</span> : null}
    >
      {!items.length ? (
        <Empty title="No payments to verify" body="When a customer pays and enters the UPI reference or bank UTR, it appears here with a sound alert." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Amount</Th>
              <Th>Paid by · reference</Th>
              <Th>Customer</Th>
              <Th>Shop</Th>
              <Th className="text-right">Action</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <Tr key={p.id}>
                <Td>
                  <Link to={`/orders/${p.id}`} className="font-semibold text-link">{p.order_no}</Link>
                  <div className="text-xs text-ink-muted">{timeAgo(p.payment_claimed_at)}</div>
                </Td>
                <Td className="text-base font-bold">{formatINR(p.grand_total)}</Td>
                <Td>
                  <Badge tone={p.payment_method === 'bank_transfer' ? 'action' : 'primary'}>{p.payment_method === 'bank_transfer' ? 'Bank transfer' : 'UPI'}</Badge>
                  <button
                    type="button"
                    className="mt-1 flex items-center gap-1.5 font-mono text-sm"
                    onClick={() => {
                      navigator.clipboard?.writeText(p.payment_ref ?? '');
                      toast('Copied');
                    }}
                    title="Copy"
                  >
                    {p.payment_ref} <Copy className="size-3.5 text-ink-muted" />
                  </button>
                </Td>
                <Td>
                  <div>{p.customer_name ?? '—'}</div>
                  {p.customer_phone ? (
                    <a href={`tel:${p.customer_phone}`} className="inline-flex items-center gap-1 text-xs text-link">
                      <Phone className="size-3" /> {formatPhone(p.customer_phone)}
                    </a>
                  ) : null}
                </Td>
                <Td>{p.shop_name}</Td>
                <Td className="text-right">
                  <div className="inline-flex gap-2">
                    <Button size="sm" variant="success" icon={<CheckCircle2 className="size-4" />} loading={busy === p.id} onClick={() => confirm(p.id)} data-testid={`confirm-payment-${p.order_no}`}>
                      Payment received
                    </Button>
                    <Button size="sm" variant="outline" icon={<XCircle className="size-4" />} onClick={() => setRejecting(p.id)}>
                      Not received
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      <ReasonModal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title="Payment not received"
        description="The customer sees this message and can enter the correct UPI reference or bank UTR."
        placeholder="No payment with this reference in the bank statement."
        confirmLabel="Tell the customer"
        danger
        onConfirm={async (reason) => {
          await rpc('admin_reject_payment', { p_order_id: rejecting, p_reason: reason });
          toast('The customer has been told.');
          refresh();
        }}
      />
    </Card>
  );
}

function PayoutsTab({ status }: { status: 'due' | 'held' }) {
  const refresh = useRefresh();
  const q = useQuery({ queryKey: ['payments', 'payouts', status], queryFn: () => rpc<PayoutShop[]>('admin_list_payouts', { p_status: status }) });
  const [paying, setPaying] = useState<PayoutShop | null>(null);

  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorBox error={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const shops = q.data ?? [];
  if (!shops.length) {
    return (
      <Card>
        <Empty
          title={status === 'due' ? 'No payouts due' : 'Nothing on hold'}
          body={status === 'due' ? 'When customers receive their orders, what you owe each shop appears here.' : 'Payouts are held while a customer\'s problem report is open.'}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        {status === 'due'
          ? `You owe ${shops.length} shop${shops.length > 1 ? 's' : ''} ${formatINR(shops.reduce((s, x) => s + Number(x.total), 0))}. Scan a shop's QR with your phone to pay the exact amount, then record the UPI reference.`
          : 'These payouts wait until the reported problem is resolved on the Problems page.'}
      </p>
      {shops.map((s) => (
        <div key={s.shop_id} data-testid={`payout-shop-${s.shop_name}`}>
        <Card padded={false}>
          <div className="flex flex-wrap gap-6 p-5">
            {status === 'due' && s.upi_id ? <UpiQr upiId={s.upi_id} payeeName={s.upi_name} amount={Number(s.total)} note="payout" /> : null}
            <div className="min-w-60 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Link to={`/shops/${s.shop_id}`} className="text-lg font-bold text-link">{s.shop_name}</Link>
                {s.area ? <span className="text-sm text-ink-muted">{s.area}</span> : null}
              </div>
              <div className="text-3xl font-extrabold">{formatINR(Number(s.total))}</div>
              <div className="text-sm text-ink-muted">{s.order_count} delivered order{s.order_count > 1 ? 's' : ''}</div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">UPI:</span>
                {s.upi_id ? <span className="font-mono">{s.upi_id}</span> : <Badge tone="error">No UPI ID: ask the shop to add it</Badge>}
                {s.upi_id && s.upi_verified ? <Badge tone="success">Verified</Badge> : s.upi_id ? <Badge tone="warning">Not verified</Badge> : null}
              </div>
              {s.contact_phone ? (
                <a href={`tel:${s.contact_phone}`} className="inline-flex items-center gap-1 text-sm text-link">
                  <Phone className="size-3.5" /> {formatPhone(s.contact_phone)}
                </a>
              ) : null}
              {status === 'due' ? (
                <div className="pt-2">
                  <Button icon={<Wallet className="size-4" />} onClick={() => setPaying(s)} disabled={!s.upi_id} data-testid={`pay-shop-${s.shop_id}`}>
                    Mark {formatINR(Number(s.total))} paid
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Delivered</Th>
                <Th className="text-right">Order total</Th>
                <Th className="text-right">Commission</Th>
                <Th className="text-right">Pay the shop</Th>
              </tr>
            </thead>
            <tbody>
              {s.orders.map((o) => (
                <Tr key={o.id}>
                  <Td><Link to={`/orders/${o.id}`} className="text-link">{o.order_no}</Link></Td>
                  <Td>{formatDateTimeIST(o.delivered_at)}</Td>
                  <Td className="text-right">{formatINR(o.grand_total)}</Td>
                  <Td className="text-right">{o.commission_amount ? formatINR(o.commission_amount) : '—'}</Td>
                  <Td className="text-right font-semibold">{formatINR(o.payout_amount ?? o.grand_total)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
        </div>
      ))}
      <PayoutModal shop={paying} onClose={() => setPaying(null)} onDone={refresh} />
    </div>
  );
}

function PayoutModal({ shop, onClose, onDone }: { shop: PayoutShop | null; onClose: () => void; onDone: () => void }) {
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (shop) setRef('');
  }, [shop]);
  return (
    <Modal
      open={!!shop}
      onClose={onClose}
      title={shop ? `Pay ${shop.shop_name}` : ''}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="success"
            loading={busy}
            disabled={ref.trim().length < 4}
            data-testid="payout-confirm"
            onClick={async () => {
              if (!shop) return;
              setBusy(true);
              try {
                await rpc('admin_mark_payouts_paid', { p_order_ids: shop.orders.map((o) => o.id), p_ref: ref });
                toast(`${formatINR(Number(shop.total))} recorded as paid. The shop has been notified.`);
                onDone();
                onClose();
              } catch (e) {
                toast(errorMessage(e), 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            Mark as paid
          </Button>
        </>
      }
    >
      {shop ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-5">
            {shop.upi_id ? <UpiQr upiId={shop.upi_id} payeeName={shop.upi_name} amount={Number(shop.total)} note="payout" size={150} /> : null}
            <div>
              <div className="text-sm text-ink-muted">Pay exactly</div>
              <div className="text-3xl font-extrabold">{formatINR(Number(shop.total))}</div>
              <div className="font-mono text-sm">{shop.upi_id}</div>
            </div>
          </div>
          <Field label="UPI reference or bank UTR of your payment" hint="The 12-digit UTR from your UPI or bank app. The shop sees it.">
            <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. 412345678901" autoFocus data-testid="payout-ref" />
          </Field>
        </div>
      ) : null}
    </Modal>
  );
}

function PaidTab() {
  const q = useQuery({ queryKey: ['payments', 'payouts', 'paid'], queryFn: () => rpc<PaidPayout[]>('admin_list_payouts', { p_status: 'paid' }) });
  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorBox error={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const rows = q.data ?? [];
  return (
    <Card padded={false}>
      {!rows.length ? (
        <Empty title="No payouts yet" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Paid on</Th>
              <Th>Shop</Th>
              <Th>Reference (UPI / UTR)</Th>
              <Th>Orders</Th>
              <Th className="text-right">Amount</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Tr key={`${r.payout_ref}-${r.shop_id}`}>
                <Td>{formatDateTimeIST(r.payout_at)}</Td>
                <Td><Link to={`/shops/${r.shop_id}`} className="text-link">{r.shop_name}</Link></Td>
                <Td className="font-mono text-sm">{r.payout_ref}</Td>
                <Td className="text-sm">{r.orders.map((o) => o.order_no).join(', ')}</Td>
                <Td className="text-right font-semibold">{formatINR(Number(r.total))}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function SettingsTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['payments', 'settings'], queryFn: () => rpc<PaymentSettings>('platform_payment_info') });
  const [f, setF] = useState<SettingsForm>(EMPTY_SETTINGS);
  const [accountAgain, setAccountAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    if (!q.data) return;
    const d = q.data;
    setF({
      upi_id: d.upi_id ?? '',
      upi_name: d.upi_name ?? 'Gadget Galli',
      qr_path: d.qr_path ?? '',
      bank_account_name: d.bank?.account_name ?? '',
      bank_account_number: d.bank?.account_number ?? '',
      bank_ifsc: d.bank?.ifsc ?? '',
      bank_name: d.bank?.bank_name ?? '',
      commission_pct: String(d.commission_pct ?? 0),
    });
    setAccountAgain(d.bank?.account_number ?? '');
  }, [q.data]);

  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorBox error={errorMessage(q.error)} onRetry={() => q.refetch()} />;

  const set = (k: keyof SettingsForm) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const accountDigits = f.bank_account_number.replace(/\s/g, '');
  const ifsc = f.bank_ifsc.trim().toUpperCase();
  const bankStarted = !!(f.bank_account_name.trim() || accountDigits || ifsc || f.bank_name.trim());
  const errs = {
    upi: !f.upi_id || isValidUpiId(f.upi_id) ? null : 'This does not look like a UPI ID (name@bank).',
    accName: bankStarted && !f.bank_account_name.trim() ? 'Enter the account holder name.' : null,
    account: bankStarted && !/^\d{9,18}$/.test(accountDigits) ? 'Account numbers have 9 to 18 digits.' : null,
    again: bankStarted && accountAgain.replace(/\s/g, '') !== accountDigits ? 'The two account numbers do not match.' : null,
    ifsc: bankStarted && !IFSC.test(ifsc) ? 'An IFSC has 11 characters, like HDFC0001234 (the 5th is a zero).' : null,
  };
  const valid = !Object.values(errs).some(Boolean);
  const ready = valid && (!!f.upi_id || bankStarted);
  const qrUrl = publicUrl('banners', f.qr_path);

  const save = async () => {
    setBusy(true);
    try {
      await rpc('admin_save_payment_settings', {
        p_settings: { ...f, bank_account_number: accountDigits, bank_ifsc: ifsc, commission_pct: Number(f.commission_pct || 0) },
      });
      toast('Payment details saved. Customers see them on every accepted order.');
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const uploadQr = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const qr_path = await uploadPublic('banners', 'payments', file);
      // Merge into the latest form: anything typed while the image uploaded stays
      setF((x) => ({ ...x, qr_path }));
      toast('QR uploaded. Click Save to show it to customers.');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {!q.data?.ready ? (
        <div className="rounded-xl border border-error/30 bg-error-soft p-4 text-sm text-error-ink" data-testid="payments-not-ready">
          <strong>Customers cannot pay yet.</strong> Add your UPI ID or bank account below and save. Until then, accepted orders show
          "payment details are being set up".
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card title="UPI (fastest for customers)">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Gadget Galli UPI ID" hint="A business / merchant UPI ID is best." error={errs.upi}>
                <Input value={f.upi_id} onChange={(e) => setF({ ...f, upi_id: e.target.value.trim() })} placeholder="gadgetgalli@ybl" data-testid="settings-upi" />
              </Field>
              <Field label="Name customers see">
                <Input value={f.upi_name} onChange={set('upi_name')} placeholder="Gadget Galli" />
              </Field>
            </div>
            <div className="mt-5 space-y-2">
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Your QR image (optional)</div>
              <p className="text-xs text-ink-muted">
                Upload the QR from your bank or PhonePe / Paytm Business. Customers see it as a second option, under the QR the app makes with
                the exact order amount.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                {qrUrl ? (
                  <img src={qrUrl} alt="Your UPI QR" className="size-28 rounded-lg border border-slate-200 bg-white object-contain p-1" data-testid="settings-qr-preview" />
                ) : null}
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                  <Upload className="size-4" /> {uploading ? 'Uploading…' : qrUrl ? 'Replace QR' : 'Upload QR'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    data-testid="settings-qr-file"
                    onChange={(e) => {
                      void uploadQr(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
                {qrUrl ? (
                  <Button variant="ghost" size="sm" onClick={() => setF({ ...f, qr_path: '' })}>
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>

          <Card title="Bank account (NEFT / IMPS)">
            <p className="mb-4 text-xs text-ink-muted">For big orders above a customer's UPI limit. Customers see these details with copy buttons.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Account holder name" error={errs.accName}>
                <Input value={f.bank_account_name} onChange={set('bank_account_name')} placeholder="Gadget Galli Technologies" data-testid="settings-bank-holder" />
              </Field>
              <Field label="Bank and branch">
                <Input value={f.bank_name} onChange={set('bank_name')} placeholder="HDFC Bank, Kukatpally" data-testid="settings-bank-bank" />
              </Field>
              <Field label="Account number" error={errs.account}>
                <Input value={f.bank_account_number} onChange={set('bank_account_number')} inputMode="numeric" autoComplete="off" data-testid="settings-bank-account" />
              </Field>
              <Field label="Account number again" error={errs.again}>
                <Input value={accountAgain} onChange={(e) => setAccountAgain(e.target.value)} inputMode="numeric" autoComplete="off" data-testid="settings-bank-account-again" />
              </Field>
              <Field label="IFSC" error={errs.ifsc}>
                <Input value={f.bank_ifsc} onChange={(e) => setF({ ...f, bank_ifsc: e.target.value.toUpperCase() })} placeholder="HDFC0001234" maxLength={11} data-testid="settings-bank-ifsc" />
              </Field>
            </div>
          </Card>

          <Card title="Shop payouts">
            <Field label="Commission kept from each payout (%)" hint="0 means shops get the full order amount. You can change this later.">
              <Input type="number" min={0} max={50} step={0.5} value={f.commission_pct} onChange={set('commission_pct')} className="max-w-32" />
            </Field>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Button loading={busy} disabled={!valid} onClick={save} data-testid="settings-save">
              Save payment details
            </Button>
            {!ready ? <span className="text-sm text-ink-muted">Add a UPI ID or a bank account so customers can pay.</span> : null}
          </div>
        </div>

        <Card title="What customers see">
          <div className="flex flex-col items-center gap-3 text-center">
            {f.upi_id && !errs.upi ? (
              <>
                <UpiQr upiId={f.upi_id} payeeName={f.upi_name || 'Gadget Galli'} amount={1} note="test" />
                <p className="text-xs text-ink-muted">Test it: scan with your phone and check that your name shows up (a ₹1 test).</p>
              </>
            ) : (
              <p className="text-sm text-ink-muted">Enter a UPI ID to see the QR with the order amount.</p>
            )}
            {qrUrl ? <img src={qrUrl} alt="" className="size-32 rounded-lg border border-slate-200 bg-white object-contain p-1" /> : null}
            {bankStarted && valid ? (
              <div className="w-full rounded-xl bg-slate-50 p-3 text-left text-xs dark:bg-slate-800">
                <div className="font-semibold">Bank transfer</div>
                <div>{f.bank_account_name}</div>
                <div className="font-mono">
                  A/c {accountDigits} · {ifsc}
                </div>
                {f.bank_name ? <div className="text-ink-muted">{f.bank_name}</div> : null}
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

interface SettingsForm {
  upi_id: string;
  upi_name: string;
  qr_path: string;
  bank_account_name: string;
  bank_account_number: string;
  bank_ifsc: string;
  bank_name: string;
  commission_pct: string;
}

const EMPTY_SETTINGS: SettingsForm = {
  upi_id: '',
  upi_name: 'Gadget Galli',
  qr_path: '',
  bank_account_name: '',
  bank_account_number: '',
  bank_ifsc: '',
  bank_name: '',
  commission_pct: '0',
};

const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;

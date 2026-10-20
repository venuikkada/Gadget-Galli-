import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Copy, Phone, Wallet, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { formatDateTimeIST, formatINR, formatPhone, isValidUpiId, timeAgo } from '@gg/shared';

import { UpiQr } from '@/components/UpiQr';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHeader, ReasonModal, Spinner, Table, Tabs, Td, Th, toast, Tr } from '@/components/ui';
import { errorMessage, rpc } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { PaidPayout, PaymentSettings, PaymentsToVerify, PayoutShop } from '@/lib/types';

type Tab = 'verify' | 'due' | 'held' | 'paid' | 'settings';

/**
 * Customers pay Gadget Galli's UPI and enter the UPI reference; you check your bank app and confirm, and the shop
 * then packs and sends. After delivery you pay each shop by UPI and record the reference (docs/DECISIONS.md #52).
 */
export default function PaymentsPage() {
  const { isSuper } = useAuth();
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(location.search).get('tab') as Tab) || 'verify');
  const verify = useQuery({ queryKey: ['payments', 'verify'], queryFn: () => rpc<PaymentsToVerify>('admin_list_payments_to_verify'), refetchInterval: 30_000 });

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
        <Empty title="No payments to verify" body="When a customer pays and enters the UPI reference, it appears here." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Amount</Th>
              <Th>UPI reference</Th>
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
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 font-mono text-sm"
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
        description="The customer sees this message and can enter the correct UPI reference."
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
          <Field label="UPI reference of your payment" hint="The 12-digit UTR from your UPI or bank app. The shop sees it.">
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
              <Th>UPI reference</Th>
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
  const [upi, setUpi] = useState('');
  const [name, setName] = useState('');
  const [pct, setPct] = useState('0');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!q.data) return;
    setUpi(q.data.upi_id ?? '');
    setName(q.data.upi_name ?? 'Gadget Galli');
    setPct(String(q.data.commission_pct ?? 0));
  }, [q.data]);

  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorBox error={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const upiOk = isValidUpiId(upi);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <Card title="Where customers pay">
        <div className="space-y-4">
          {!q.data?.upi_id ? (
            <div className="rounded-xl bg-warning-soft p-3 text-sm text-warning-ink">
              Not set yet: customers see "payment details are being set up" and cannot pay. Add your business UPI ID below.
            </div>
          ) : null}
          <Field label="Gadget Galli UPI ID" hint="Use a business / merchant UPI ID if you have one. Every customer payment goes here." error={upi && !upiOk ? 'This does not look like a UPI ID (name@bank).' : null}>
            <Input value={upi} onChange={(e) => setUpi(e.target.value.trim())} placeholder="gadgetgalli@ybl" data-testid="settings-upi" />
          </Field>
          <Field label="Name customers see">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Gadget Galli" />
          </Field>
          <Field label="Commission kept from each payout (%)" hint="0 means shops get the full order amount. You can change this later.">
            <Input type="number" min={0} max={50} step={0.5} value={pct} onChange={(e) => setPct(e.target.value)} className="max-w-32" />
          </Field>
          <Button
            loading={busy}
            disabled={!upiOk}
            onClick={async () => {
              setBusy(true);
              try {
                await rpc('admin_save_payment_settings', { p_upi_id: upi, p_upi_name: name, p_commission_pct: Number(pct || 0) });
                toast('Payment settings saved.');
                qc.invalidateQueries({ queryKey: ['payments'] });
              } catch (e) {
                toast(errorMessage(e), 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            Save
          </Button>
        </div>
      </Card>
      <Card title="What customers scan">
        {upiOk ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <UpiQr upiId={upi} payeeName={name || 'Gadget Galli'} amount={1} note="test" />
            <p className="text-xs text-ink-muted">Test it: scan with your phone and check that your name shows up (a ₹1 test).</p>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">Enter a UPI ID to see the QR.</p>
        )}
      </Card>
    </div>
  );
}

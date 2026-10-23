import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { expectedPaymentMode, formatINR, REJECT_REASONS, upiPaymentUrl, type DeliveryService, type Order, type PaymentMethod, type PaymentMode } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { signedUrl } from '@/shared/api/storage';
import { PhotoPicker } from '@/shared/components/PhotoPicker';
import { useTranslation } from '@/shared/i18n';
import { openDeliveryApp } from '@/shared/lib/linking';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Button, Chip, Divider, IconButton, InfoBanner, Input, QtyStepper, Row, Segmented, Sheet, toast } from '@/shared/ui';

import { orderActions, useMyListings, useMyShop } from '../api';

interface Line {
  key: string;
  shop_product_id: string | null;
  name: string;
  qty: number;
  price: string;
  with_installation?: boolean;
  installation_charge?: number | null;
}

export function ConfirmSheet({ order, visible, onClose }: { order: Order; visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [lines, setLines] = useState<Line[]>([]);
  const [charge, setCharge] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState('');
  // How the customer pays (docs/DECISIONS.md #57): advance only within the shop's limit; the shop may always choose
  // pay on delivery. null: not chosen yet, so it follows the total.
  const [mode, setMode] = useState<PaymentMode | null>(null);
  const listings = useMyListings(picker ? order.shop.id : undefined, query);
  const terms = order.payment_terms;

  useEffect(() => {
    if (!visible) return;
    setLines(
      order.items.map((i, idx) => ({
        key: `${idx}`,
        shop_product_id: i.shop_product_id,
        name: i.name,
        qty: i.qty,
        price: String(i.price),
        with_installation: i.with_installation,
        installation_charge: i.installation_charge,
      })),
    );
    setCharge(String(order.delivery_charge));
    setNote('');
    setMode(null);
  }, [visible, order]);

  const total = useMemo(
    () =>
      lines.reduce((s, l) => s + Number(l.price || 0) * l.qty + (l.with_installation ? (l.installation_charge ?? 0) * l.qty : 0), 0) +
      (order.fulfilment === 'delivery' ? Number(charge || 0) : 0),
    [lines, charge, order.fulfilment],
  );

  const auto = expectedPaymentMode(terms, total, order.fulfilment);
  const advanceOk = auto === 'advance';
  const payMode: PaymentMode = mode === 'advance' && !advanceOk ? 'on_delivery' : (mode ?? auto);

  const changed =
    Number(charge || 0) !== order.delivery_charge ||
    lines.length !== order.items.length ||
    lines.some((l, i) => l.shop_product_id !== order.items[i]?.shop_product_id || l.qty !== order.items[i]?.qty || Number(l.price) !== order.items[i]?.price);

  const confirm = async () => {
    if (!lines.length) return;
    setBusy(true);
    try {
      await orderActions.confirm(
        order.id,
        changed ? lines.map((l) => ({ shop_product_id: l.shop_product_id, name: l.name, qty: l.qty, price: Number(l.price || 0), with_installation: l.with_installation, installation_charge: l.installation_charge })) : null,
        changed ? Number(charge || 0) : null,
        note || null,
        order.payee === 'gadget_galli' ? null : payMode,
      );
      onClose();
    } catch (e) {
      toast(errorText(e, t), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('p.confirm.title')}
      footer={
        <Button
          testID="confirm-order"
          title={`${t('p.step.accept')} · ${formatINR(total)}`}
          variant="success"
          size="lg"
          full
          loading={busy}
          onPress={confirm}
        />
      }
    >
      <InfoBanner text={t('p.confirm.body')} />
      {lines.map((l) => (
        <View key={l.key} style={{ gap: 8 }}>
          <Row justify="space-between" align="flex-start">
            {l.shop_product_id ? (
              <AppText variant="title" style={{ flex: 1 }} numberOfLines={2}>{l.name}</AppText>
            ) : (
              <Input value={l.name} onChangeText={(v) => setLines(lines.map((x) => (x.key === l.key ? { ...x, name: v } : x)))} placeholder={t('p.confirm.lineName')} style={{ flex: 1 }} />
            )}
            <IconButton icon="trash-outline" color={colors.error} onPress={() => setLines(lines.filter((x) => x.key !== l.key))} />
          </Row>
          <Row gap={10}>
            <Input label={t('p.confirm.price')} prefix="₹" keyboardType="decimal-pad" value={l.price} onChangeText={(v) => setLines(lines.map((x) => (x.key === l.key ? { ...x, price: v.replace(/[^\d.]/g, '') } : x)))} style={{ flex: 1 }} />
            <View style={{ gap: 6 }}>
              <AppText variant="label" color="textMuted">{t('p.confirm.qty')}</AppText>
              <QtyStepper qty={l.qty} onChange={(q) => setLines(q < 1 ? lines.filter((x) => x.key !== l.key) : lines.map((x) => (x.key === l.key ? { ...x, qty: q } : x)))} />
            </View>
          </Row>
          <Divider />
        </View>
      ))}
      <Row gap={8} wrap>
        <Button title={t('p.confirm.addLine')} icon="add" variant="secondary" size="sm" onPress={() => setPicker(!picker)} />
        <Button
          title={t('p.confirm.lineName')}
          icon="create-outline"
          variant="ghost"
          size="sm"
          onPress={() => setLines([...lines, { key: `c${Date.now()}`, shop_product_id: null, name: '', qty: 1, price: '0' }])}
        />
      </Row>
      {picker ? (
        <View style={{ gap: 6 }}>
          <Input icon="search" placeholder={t('p.products.search')} value={query} onChangeText={setQuery} />
          {(listings.data?.pages[0]?.items ?? []).slice(0, 8).map((li) => (
            <Pressable
              key={li.id}
              onPress={() => {
                setLines([...lines, { key: `p${li.id}${Date.now()}`, shop_product_id: li.id, name: li.name, qty: 1, price: String(li.price) }]);
                setPicker(false);
              }}
              style={{ paddingVertical: 8 }}
            >
              <Row justify="space-between">
                <AppText variant="bodySmall" style={{ flex: 1 }} numberOfLines={1}>{li.name}</AppText>
                <AppText variant="label">{formatINR(li.price)}</AppText>
              </Row>
            </Pressable>
          ))}
        </View>
      ) : null}
      {order.fulfilment === 'delivery' ? <Input label={t('p.confirm.deliveryCharge')} prefix="₹" keyboardType="number-pad" value={charge} onChangeText={setCharge} /> : null}
      <Input label={t('p.confirm.note')} value={note} onChangeText={setNote} />
      <Row justify="space-between">
        <AppText variant="title">{t('p.confirm.total')}</AppText>
        <AppText variant="priceLarge">{formatINR(total)}</AppText>
      </Row>
      {order.payee !== 'gadget_galli' ? (
        <View style={{ gap: 8 }} testID="confirm-payment-mode">
          <AppText variant="label" color="textMuted">{t('p.confirm.payHow')}</AppText>
          {advanceOk ? (
            <Segmented<PaymentMode>
              value={payMode}
              onChange={setMode}
              options={[
                { value: 'advance', label: t('p.confirm.advance') },
                { value: 'on_delivery', label: t('p.confirm.onDelivery') },
              ]}
            />
          ) : null}
          <InfoBanner
            tone={payMode === 'advance' ? 'success' : 'info'}
            icon={payMode === 'advance' ? 'shield-checkmark' : 'cash-outline'}
            text={
              payMode === 'advance'
                ? t('p.confirm.advanceBody', { limit: formatINR(terms?.advance_limit ?? 0) })
                : !terms?.upi_ready
                  ? t('p.confirm.codNoUpi')
                  : terms.paused
                    ? t(`p.confirm.codPaused_${terms.paused}`)
                    : terms.advance_limit <= 0
                      ? t('p.confirm.codNew')
                      : order.fulfilment === 'pickup'
                        ? t('p.confirm.codPickup')
                        : total > terms.advance_limit
                          ? t('p.confirm.codAboveLimit', { limit: formatINR(terms.advance_limit) })
                          : t('p.confirm.codChosen')
            }
          />
        </View>
      ) : null}
    </Sheet>
  );
}

export function RejectSheet({ order, visible, onClose }: { order: Order; visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<string>('out_of_stock');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('p.rejectSheet.title')}
      footer={
        <Button
          testID="reject-order"
          title={t('p.step.reject')}
          variant="danger"
          size="lg"
          full
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await orderActions.reject(order.id, reason, note || null);
              onClose();
            } catch (e) {
              toast(errorText(e, t), 'error');
            } finally {
              setBusy(false);
            }
          }}
        />
      }
    >
      <AppText variant="label" color="textMuted">{t('p.rejectSheet.reason')}</AppText>
      <Row wrap gap={8}>
        {REJECT_REASONS.map((r) => (
          <Chip key={r} label={t(`reject.${r}`)} selected={reason === r} onPress={() => setReason(r)} />
        ))}
      </Row>
      <Input label={t('p.rejectSheet.note')} value={note} onChangeText={setNote} multiline />
    </Sheet>
  );
}

export function PackSheet({ order, visible, onClose }: { order: Order; visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [pkg, setPkg] = useState<string[]>([]);
  const [bill, setBill] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('p.pack.title')}
      footer={
        <Button
          testID="mark-packed"
          title={t('p.step.packed')}
          variant="primary"
          size="lg"
          full
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await orderActions.packed(order.id, pkg[0] ?? null, bill[0] ?? null);
              onClose();
            } catch (e) {
              toast(errorText(e, t), 'error');
            } finally {
              setBusy(false);
            }
          }}
        />
      }
    >
      <PhotoPicker bucket="order-media" folder={order.id} label={t('p.pack.packagePhoto')} value={pkg} onChange={setPkg} max={1} />
      <PhotoPicker bucket="order-media" folder={order.id} label={t('p.pack.billPhoto')} value={bill} onChange={setBill} max={1} />
    </Sheet>
  );
}

const SERVICES: DeliveryService[] = ['porter', 'rapido', 'uber', 'own', 'other'];

export function DispatchSheet({ order, visible, onClose, update }: { order: Order; visible: boolean; onClose: () => void; update?: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const d = order.dispatch;
  const [service, setService] = useState<DeliveryService>('porter');
  const [rider, setRider] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [tracking, setTracking] = useState('');
  const [otp, setOtp] = useState('');
  // When updating, the ETA changes only if the owner picks a new one (the server keeps the old one otherwise).
  const [eta, setEta] = useState<number | null>(update ? null : 60);
  const [photo, setPhoto] = useState<string[]>([]);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const pickup = order.fulfilment === 'pickup';

  // Fill the form from the order each time the sheet opens (the rider may have been sent since the screen opened),
  // but not again while it is open: a live refresh of the order must not wipe what the owner is typing.
  const wasVisible = useRef(false);
  useEffect(() => {
    const opened = visible && !wasVisible.current;
    wasVisible.current = visible;
    if (!opened) return;
    setService(d?.service && d.service !== 'store_pickup' ? d.service : 'porter');
    setRider(d?.rider_name ?? '');
    setPhone(d?.rider_phone?.replace(/^\+91/, '') ?? '');
    setVehicle(d?.vehicle_no ?? '');
    setTracking(d?.tracking_url ?? '');
    setOtp(d?.delivery_otp ?? '');
    setEta(update ? null : 60);
    setPhoto(order.pack_photo_path ? [order.pack_photo_path] : []);
  }, [visible, d, update, order.pack_photo_path]);

  // The pack photo is in the private order-media bucket, so it needs a signed link to show.
  useEffect(() => {
    const path = order.pack_photo_path;
    if (!visible || !path || signed[path]) return;
    signedUrl('order-media', path).then((url) => url && setSigned((m) => ({ ...m, [path]: url })));
  }, [visible, order.pack_photo_path, signed]);

  const send = async () => {
    setBusy(true);
    try {
      const details = {
        service: pickup ? 'store_pickup' : service,
        rider_name: rider,
        rider_phone: phone,
        vehicle_no: vehicle,
        tracking_url: tracking,
        delivery_otp: otp,
        eta: eta ? new Date(Date.now() + eta * 60_000).toISOString() : null,
        package_photo_path: photo[0] ?? null,
      };
      if (update) await orderActions.updateDispatch(order.id, details);
      else await orderActions.dispatch(order.id, details);
      onClose();
    } catch (e) {
      toast(errorText(e, t), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={pickup ? t('p.step.readyPickup') : update ? t('p.order.updateRider') : t('p.send.title')}
      footer={<Button testID="dispatch-order" title={pickup ? t('p.step.readyPickup') : update ? t('common.update') : t('p.step.send')} variant="action" size="lg" full loading={busy} onPress={send} />}
    >
      {pickup ? (
        <InfoBanner text={t('p.send.pickupHint')} />
      ) : (
        <>
          <InfoBanner text={t('p.send.bookHint')} />
          <Row gap={8} wrap>
            {(['porter', 'rapido', 'uber'] as const).map((k) => (
              <Button key={k} title={t('p.send.openApp', { app: t(`service.${k}`) })} icon="open-outline" variant="outline" size="sm" onPress={() => openDeliveryApp(k)} />
            ))}
          </Row>
          {!update ? (
            <>
              <AppText variant="label" color="textMuted">{t('p.send.service')}</AppText>
              <Row wrap gap={8}>
                {SERVICES.map((s) => (
                  <Chip key={s} testID={`service-${s}`} label={t(`service.${s}`)} selected={service === s} onPress={() => setService(s)} />
                ))}
              </Row>
            </>
          ) : null}
          <Input testID="rider-name" label={t('p.send.riderName')} value={rider} onChangeText={setRider} />
          <Input label={t('p.send.riderPhone')} prefix="+91" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
          <Row gap={10}>
            <Input label={t('p.send.vehicle')} autoCapitalize="characters" value={vehicle} onChangeText={setVehicle} style={{ flex: 1 }} placeholder="TS 09 AB 1234" />
            <Input label={t('p.send.otp')} keyboardType="number-pad" value={otp} onChangeText={setOtp} style={{ flex: 1 }} />
          </Row>
          <Input label={t('p.send.tracking')} autoCapitalize="none" keyboardType="url" value={tracking} onChangeText={setTracking} />
          <AppText variant="label" color="textMuted">{t('p.send.eta')}</AppText>
          <Row wrap gap={8}>
            {[
              [30, t('p.send.in30')],
              [60, t('p.send.in1h')],
              [120, t('p.send.in2h')],
            ].map(([m, label]) => (
              <Chip key={String(m)} label={String(label)} selected={eta === m} onPress={() => setEta(m as number)} />
            ))}
          </Row>
          {!update ? <PhotoPicker bucket="order-media" folder={order.id} label={t('p.send.photo')} value={photo} onChange={setPhoto} max={1} signed={signed} /> : null}
          <Row gap={6}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textSubtle} />
            <AppText variant="caption" color="textSubtle">{t('order.otpHint')}</AppText>
          </Row>
        </>
      )}
    </Sheet>
  );
}

const NOT_RECEIVED = ['noPayment', 'wrongAmount', 'wrongRef'] as const;

/** The customer says they paid: confirm it after checking the UPI app, or say it has not arrived. */
export function CheckPaymentSheet({ order, visible, onClose }: { order: Order; visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<(typeof NOT_RECEIVED)[number]>('noPayment');
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('p.check.notReceivedTitle')}
      footer={
        <Button
          testID="reject-payment"
          title={t('p.check.notReceived')}
          variant="danger"
          size="lg"
          full
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await orderActions.rejectPayment(order.id, t(`p.check.reason_${reason}`));
              onClose();
            } catch (e) {
              toast(errorText(e, t), 'error');
            } finally {
              setBusy(false);
            }
          }}
        />
      }
    >
      <InfoBanner text={t(order.payment_method === 'bank_transfer' ? 'p.check.notReceivedBodyBank' : 'p.check.notReceivedBody', { ref: order.payment_ref ?? '', amount: formatINR(order.grand_total) })} />
      <Row wrap gap={8}>
        {NOT_RECEIVED.map((r) => (
          <Chip key={r} label={t(`p.check.reason_${r}`)} selected={reason === r} onPress={() => setReason(r)} />
        ))}
      </Row>
    </Sheet>
  );
}

const DOOR_METHODS: PaymentMethod[] = ['upi', 'cash', 'bank_transfer'];

/** Handover: the customer's delivery code (and, for pay on delivery, how they paid) completes the order. */
export function HandoverSheet({ order, visible, onClose }: { order: Order; visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [code, setCode] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [ref, setRef] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const collect = order.payment_mode === 'on_delivery' && !order.paid_at;
  // How the customer can pay at the door: a UPI QR with the exact amount, and the shop's bank account
  const bank = useMyShop().data?.bank ?? null;
  const upiLink = useMemo(
    () => (order.shop.upi_id ? upiPaymentUrl({ upiId: order.shop.upi_id, payeeName: order.shop.upi_name ?? order.shop.name, amount: order.grand_total, orderNo: order.order_no }) : null),
    [order.shop.upi_id, order.shop.upi_name, order.shop.name, order.grand_total, order.order_no],
  );
  useEffect(() => {
    if (!visible) return;
    setCode('');
    setRef('');
    setError(undefined);
    setShowPay(false);
  }, [visible]);

  const done = async () => {
    setBusy(true);
    try {
      const r = await orderActions.handover(order.id, code, collect ? method : null, collect && ref ? ref : null);
      if ('error' in r) setError(r.attempts_left > 0 ? t('p.handover.wrongCode', { n: r.attempts_left }) : t('error.CODE_LOCKED'));
      else onClose();
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('p.handover.title')}
      footer={<Button testID="handover-done" title={t('p.handover.done')} icon="checkmark-done" variant="success" size="lg" full disabled={code.length !== 4} loading={busy} onPress={done} />}
    >
      <InfoBanner icon="key-outline" text={order.fulfilment === 'pickup' ? t('p.handover.bodyPickup') : t('p.handover.body')} />
      <Input
        testID="handover-code"
        label={t('p.handover.code')}
        value={code}
        onChangeText={(v) => {
          setCode(v.replace(/\D/g, '').slice(0, 4));
          setError(undefined);
        }}
        keyboardType="number-pad"
        error={error}
        maxLength={4}
      />
      {collect ? (
        <View style={{ gap: 8 }}>
          <Button
            testID="handover-show-pay"
            title={showPay ? t('p.handover.hidePay') : t('p.handover.showPay')}
            icon="qr-code-outline"
            variant="outline"
            full
            onPress={() => setShowPay((v) => !v)}
          />
          {showPay ? (
            <View style={{ gap: 10, alignItems: 'center' }} testID="handover-pay">
              {upiLink ? (
                <>
                  <AppText variant="h3" align="center">{t('p.handover.scanToPay', { amount: formatINR(order.grand_total) })}</AppText>
                  <View style={{ padding: 12, backgroundColor: '#FFFFFF', borderRadius: 12 }} testID="handover-qr">
                    <QRCode value={upiLink} size={200} />
                  </View>
                  <AppText variant="bodySmall" color="textMuted" selectable>{order.shop.upi_id}</AppText>
                </>
              ) : null}
              {bank ? (
                <View style={{ alignSelf: 'stretch', gap: 2, backgroundColor: colors.surfaceAlt, borderRadius: 12, padding: 12 }} testID="handover-bank">
                  <AppText variant="label">{t('p.handover.orBank')}</AppText>
                  <AppText variant="bodySmall" selectable>{bank.account_name}</AppText>
                  <AppText variant="bodySmall" selectable>{`${t('order.bankAccountNumber')}: ${bank.account_number}`}</AppText>
                  <AppText variant="bodySmall" selectable>{`${t('order.bankIfsc')}: ${bank.ifsc}${bank.bank_name ? ` · ${bank.bank_name}` : ''}`}</AppText>
                </View>
              ) : null}
              {upiLink || bank ? (
                <AppText variant="caption" color="textMuted" align="center">{t('p.handover.checkMoney')}</AppText>
              ) : (
                <InfoBanner tone="warning" text={t('p.handover.noPayDetails')} />
              )}
            </View>
          ) : null}
          <AppText variant="label" color="textMuted">{t('p.handover.paidBy', { amount: formatINR(order.grand_total) })}</AppText>
          <Row wrap gap={8}>
            {DOOR_METHODS.map((m) => (
              <Chip key={m} testID={`handover-${m}`} label={t(`payment.${m}`)} selected={method === m} onPress={() => setMethod(m)} />
            ))}
          </Row>
          {method !== 'cash' ? (
            <Input testID="handover-ref" label={method === 'bank_transfer' ? t('p.handover.refBank') : t('p.handover.ref')} value={ref} onChangeText={(v) => setRef(v.replace(/[^0-9A-Za-z]/g, '').slice(0, 30).toUpperCase())} autoCapitalize="characters" />
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}

/** The shop cannot deliver: refund a paid order (with the reference) or cancel one paid on delivery. */
export function CancelSheet({ order, visible, onClose }: { order: Order; visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const paid = !!order.paid_at;
  useEffect(() => {
    if (!visible) return;
    setReason('');
    setRef('');
  }, [visible]);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={paid ? t('p.cancel.refundTitle') : t('p.cancel.title')}
      footer={
        <Button
          testID="cancel-order"
          title={paid ? t('p.cancel.refundDone') : t('p.cancel.title')}
          variant="danger"
          size="lg"
          full
          disabled={!reason.trim() || (paid && ref.length < 6)}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await orderActions.cancel(order.id, reason, paid ? ref : null);
              onClose();
            } catch (e) {
              toast(errorText(e, t), 'error');
            } finally {
              setBusy(false);
            }
          }}
        />
      }
    >
      <InfoBanner tone="warning" text={paid ? t('p.cancel.refundBody', { amount: formatINR(order.grand_total) }) : t('p.cancel.body')} />
      <Input testID="cancel-reason" label={t('p.cancel.reason')} value={reason} onChangeText={setReason} />
      {paid ? (
        <Input
          testID="refund-ref"
          label={t('p.cancel.refundRef')}
          hint={t('p.cancel.refundRefHint')}
          value={ref}
          onChangeText={(v) => setRef(v.replace(/[^0-9A-Za-z]/g, '').slice(0, 30).toUpperCase())}
          autoCapitalize="characters"
        />
      ) : null}
    </Sheet>
  );
}

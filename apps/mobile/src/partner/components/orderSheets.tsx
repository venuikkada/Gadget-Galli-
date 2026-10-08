import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { formatINR, REJECT_REASONS, type DeliveryService, type Order, type PaymentMethod } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { PhotoPicker } from '@/shared/components/PhotoPicker';
import { useTranslation } from '@/shared/i18n';
import { openDeliveryApp } from '@/shared/lib/linking';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Button, Chip, Divider, IconButton, InfoBanner, Input, QtyStepper, Row, Sheet, toast } from '@/shared/ui';

import { orderActions, useMyListings } from '../api';

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
  const listings = useMyListings(picker ? order.shop.id : undefined, query);

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
  }, [visible, order]);

  const total = useMemo(
    () =>
      lines.reduce((s, l) => s + Number(l.price || 0) * l.qty + (l.with_installation ? (l.installation_charge ?? 0) * l.qty : 0), 0) +
      (order.fulfilment === 'delivery' ? Number(charge || 0) : 0),
    [lines, charge, order.fulfilment],
  );

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

export function PaySheet({ order, visible, onClose }: { order: Order; visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [amount, setAmount] = useState(String(order.grand_total));
  const [txn, setTxn] = useState('');
  const [proof, setProof] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (visible) setAmount(String(order.grand_total));
  }, [visible, order.grand_total]);
  const methods: PaymentMethod[] = order.fulfilment === 'pickup' ? ['upi', 'bank_transfer', 'cash'] : ['upi', 'bank_transfer'];
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('p.pay.title')}
      footer={
        <Button
          testID="mark-paid"
          title={t('p.step.paymentReceived')}
          variant="success"
          size="lg"
          full
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await orderActions.paid(order.id, method, Number(amount || order.grand_total), txn || null, proof[0] ?? null);
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
      <InfoBanner tone="warning" text={t('p.pay.checkHint')} />
      <AppText variant="label" color="textMuted">{t('p.pay.method')}</AppText>
      <Row wrap gap={8}>
        {methods.map((m) => (
          <Chip key={m} label={t(`payment.${m}`)} selected={method === m} onPress={() => setMethod(m)} />
        ))}
      </Row>
      <Input label={t('p.pay.amount')} prefix="₹" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
      {method !== 'cash' ? <Input label={t('p.pay.txn')} value={txn} onChangeText={setTxn} keyboardType="number-pad" /> : null}
      <PhotoPicker bucket="order-media" folder={order.id} label={t('p.pay.proof')} value={proof} onChange={setProof} max={1} />
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
  const [service, setService] = useState<DeliveryService>(d?.service && d.service !== 'store_pickup' ? d.service : 'porter');
  const [rider, setRider] = useState(d?.rider_name ?? '');
  const [phone, setPhone] = useState(d?.rider_phone?.replace(/^\+91/, '') ?? '');
  const [vehicle, setVehicle] = useState(d?.vehicle_no ?? '');
  const [tracking, setTracking] = useState(d?.tracking_url ?? '');
  const [otp, setOtp] = useState(d?.delivery_otp ?? '');
  const [eta, setEta] = useState<number | null>(60);
  const [photo, setPhoto] = useState<string[]>(order.pack_photo_path ? [order.pack_photo_path] : []);
  const [busy, setBusy] = useState(false);
  const pickup = order.fulfilment === 'pickup';

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
          <AppText variant="label" color="textMuted">{t('p.send.service')}</AppText>
          <Row wrap gap={8}>
            {SERVICES.map((s) => (
              <Chip key={s} testID={`service-${s}`} label={t(`service.${s}`)} selected={service === s} onPress={() => setService(s)} />
            ))}
          </Row>
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
          {!update ? <PhotoPicker bucket="order-media" folder={order.id} label={t('p.send.photo')} value={photo} onChange={setPhoto} max={1} /> : null}
          <Row gap={6}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textSubtle} />
            <AppText variant="caption" color="textSubtle">{t('order.otpHint')}</AppText>
          </Row>
        </>
      )}
    </Sheet>
  );
}

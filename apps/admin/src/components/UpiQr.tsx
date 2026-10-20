import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

import { upiPaymentUrl } from '@gg/shared';

/** A UPI payment QR for an exact amount: scan it with any UPI app on your phone to pay. */
export function UpiQr({ upiId, payeeName, amount, note, size = 176 }: { upiId: string; payeeName: string; amount: number; note: string; size?: number }) {
  const [svg, setSvg] = useState<string | null>(null);
  const link = upiPaymentUrl({ upiId, payeeName, amount, orderNo: note });
  useEffect(() => {
    let alive = true;
    QRCode.toString(link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then((s) => alive && setSvg(s));
    return () => {
      alive = false;
    };
  }, [link]);
  if (!svg) return <div style={{ width: size, height: size }} className="animate-pulse rounded-xl bg-surface-alt" />;
  return (
    <img
      src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
      alt={`UPI QR to pay ${payeeName}`}
      width={size}
      height={size}
      className="rounded-xl bg-white p-2"
    />
  );
}

import QRCode from 'qrcode';

/** QR code as an inline SVG string (for printable posters). Pure JS, works on every platform. */
export function qrSvg(text: string, size = 320, color = '#0F172A', background = '#FFFFFF'): string {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const quiet = 2;
  const total = n + quiet * 2;
  let path = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.modules.data[y * n + x]) path += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="${background}"/><path d="${path}" fill="${color}"/></svg>`;
}

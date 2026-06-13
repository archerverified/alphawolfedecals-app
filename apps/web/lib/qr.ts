// QR rendering for web surfaces (Goal 9). Reuses qrcode-generator — the SAME
// library the export pack uses (lib/export/spec-pack.ts) — so there is no second
// QR system. Returns an inline SVG string (vector, crisp at any size).
import qrcode from 'qrcode-generator';

export function qrSvg(text: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

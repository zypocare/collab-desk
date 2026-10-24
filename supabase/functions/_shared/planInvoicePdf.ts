// The GST tax invoice for a Miracle plan payment, as an A4 PDF for the receipt email.
// Built from the invoice saved with the payment (migration 157). Uses the app's Inter font (for ₹),
// falling back to Helvetica with "Rs." if it can't be fetched.
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'npm:pdf-lib@1.17.1';
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1';

export type PlanInvoice = {
  title: string;
  number: string;
  date: string;
  seller: { legal_name?: string; address?: string; state?: string; gstin?: string; pan?: string; email?: string };
  buyer: { name?: string; trade_name?: string; gstin?: string; address?: string; state?: string; city?: string; email?: string };
  place_of_supply: string;
  item: { description: string; from: string; to: string; sac: string; qty: number };
  taxable: number;
  gst_rate: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  gst_charged: boolean;
  paid: { on: string; via: string; ref: string };
};

const INK = rgb(0.12, 0.09, 0.11);
const MUTED = rgb(0.45, 0.41, 0.44);
const LINE = rgb(0.88, 0.85, 0.85);
const ACCENT = rgb(0.78, 0.15, 0.37);
const PAID = rgb(0.17, 0.48, 0.27);

const day = (d: string) => (d ? new Date(String(d).slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');

/** Rupees in words, the Indian way ("One Thousand Four Hundred Ninety-Nine Rupees"). */
export function rupeesInWords(n: number) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (x: number) => (x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? '-' + ones[x % 10] : ''));
  const three = (x: number) => (x >= 100 ? ones[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + two(x % 100) : '') : two(x));
  const r = Math.floor(n), p = Math.round((n - r) * 100);
  const parts: string[] = [];
  const crore = Math.floor(r / 1e7), lakh = Math.floor((r % 1e7) / 1e5), thousand = Math.floor((r % 1e5) / 1e3), rest = r % 1e3;
  if (crore) parts.push(three(crore) + ' Crore');
  if (lakh) parts.push(two(lakh) + ' Lakh');
  if (thousand) parts.push(two(thousand) + ' Thousand');
  if (rest) parts.push(three(rest));
  return `${parts.join(' ') || 'Zero'} Rupees${p ? ` and ${two(p)} Paise` : ''} only`;
}

export async function planInvoicePdf(inv: PlanInvoice, fontBase = 'https://app.miracleapp.live'): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${inv.title} ${inv.number}`);
  doc.setAuthor(inv.seller.legal_name ?? 'Zyposoft Technologies Private Limited');
  let reg: PDFFont, bold: PDFFont, rs = '₹';
  try {
    doc.registerFontkit(fontkit);
    const [a, b] = await Promise.all(['Inter-Regular.ttf', 'Inter-SemiBold.ttf'].map((f) => fetch(`${fontBase}/fonts/${f}`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))));
    reg = await doc.embedFont(a);
    bold = await doc.embedFont(b);
  } catch {
    reg = await doc.embedFont(StandardFonts.Helvetica);
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
    rs = 'Rs. ';
  }
  const money = (n: number) => rs + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const page: PDFPage = doc.addPage([595.28, 841.89]);
  const W = 595.28, M = 48;
  let y = 841.89 - M;
  const text = (s: string, x: number, yy: number, size = 10, f = reg, color = INK) => page.drawText(String(s ?? ''), { x, y: yy, size, font: f, color });
  const right = (s: string, xr: number, yy: number, size = 10, f = reg, color = INK) => text(s, xr - f.widthOfTextAtSize(String(s ?? ''), size), yy, size, f, color);
  const wrap = (s: string, f: PDFFont, size: number, width: number) => {
    const out: string[] = [];
    for (const para of String(s ?? '').split(/\n/)) {
      let line = '';
      for (const w of para.split(/\s+/)) {
        const t = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(t, size) > width && line) (out.push(line), (line = w));
        else line = t;
      }
      if (line) out.push(line);
    }
    return out;
  };

  // Header
  text('Miracle', M, y - 6, 22, bold, ACCENT);
  right(inv.title.toUpperCase(), W - M, y - 2, 14, bold);
  right(`No. ${inv.number}`, W - M, y - 18, 10, reg, MUTED);
  right(`Date ${day(inv.date)}`, W - M, y - 31, 10, reg, MUTED);
  y -= 58;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: LINE });
  y -= 20;

  // Seller and buyer
  const col = (title: string, x: number, lines: string[]) => {
    let yy = y;
    text(title, x, yy, 8.5, bold, MUTED);
    yy -= 15;
    for (const [i, l] of lines.filter(Boolean).entries()) {
      for (const w of wrap(l, i === 0 ? bold : reg, i === 0 ? 11 : 9.5, 230)) {
        text(w, x, yy, i === 0 ? 11 : 9.5, i === 0 ? bold : reg);
        yy -= i === 0 ? 15 : 13;
      }
    }
    return yy;
  };
  const s = inv.seller, b = inv.buyer;
  const y1 = col('FROM', M, [s.legal_name ?? '', s.address ?? '', s.state ? `State: ${s.state}` : '', s.gstin ? `GSTIN: ${s.gstin}` : '', s.pan ? `PAN: ${s.pan}` : '', s.email ?? '']);
  const y2 = col('BILLED TO', W / 2 + 10, [b.name ?? '', b.trade_name && b.trade_name !== b.name ? b.trade_name : '', b.address ?? '', [b.city, b.state].filter(Boolean).join(', '), b.gstin ? `GSTIN: ${b.gstin}` : '', b.email ?? '']);
  y = Math.min(y1, y2) - 8;
  text(`Place of supply: ${inv.place_of_supply || '-'}`, M, y, 9.5, reg, MUTED);
  y -= 24;

  // The line
  page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 22, color: rgb(0.97, 0.95, 0.96) });
  text('Description', M + 8, y, 9, bold, MUTED);
  text('SAC', 352, y, 9, bold, MUTED);
  text('Qty', 410, y, 9, bold, MUTED);
  right('Taxable value', W - M - 8, y, 9, bold, MUTED);
  y -= 24;
  const desc = wrap(`${inv.item.description}\nPeriod: ${day(inv.item.from)} to ${day(inv.item.to)}`, reg, 10, 290);
  for (const [i, l] of desc.entries()) text(l, M + 8, y - i * 14, 10, i === 0 ? bold : reg, i === 0 ? INK : MUTED);
  text(inv.item.sac, 352, y, 10);
  text(String(inv.item.qty ?? 1), 410, y, 10);
  right(money(inv.taxable), W - M - 8, y, 10);
  y -= Math.max(desc.length * 14, 14) + 14;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: LINE });
  y -= 20;

  // Totals
  const sum = (label: string, v: number, big = false) => {
    text(label, 330, y, big ? 11 : 10, big ? bold : reg, big ? INK : MUTED);
    right(money(v), W - M - 8, y, big ? 12 : 10, big ? bold : reg);
    y -= big ? 22 : 16;
  };
  sum('Taxable value', inv.taxable);
  if (inv.gst_charged) {
    if (inv.igst) sum(`IGST @ ${inv.gst_rate}%`, inv.igst);
    else {
      sum(`CGST @ ${inv.gst_rate / 2}%`, inv.cgst);
      sum(`SGST @ ${inv.gst_rate / 2}%`, inv.sgst);
    }
  }
  page.drawLine({ start: { x: 330, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 1, color: LINE });
  y -= 4;
  sum('Total', inv.total, true);
  for (const w of wrap(rupeesInWords(inv.total), reg, 9.5, W - 2 * M)) (text(w, M, y, 9.5, reg, MUTED), (y -= 13));
  y -= 14;

  // Paid
  page.drawRectangle({ x: M, y: y - 8, width: W - 2 * M, height: 30, color: rgb(0.93, 0.97, 0.94) });
  text(`PAID on ${day(inv.paid.on)} via ${inv.paid.via}${inv.paid.ref ? ` · ref ${inv.paid.ref}` : ''}`, M + 10, y + 2, 10, bold, PAID);
  y -= 40;
  const notes = [
    inv.gst_charged ? 'Prices include GST. Tax is not payable on reverse charge.' : 'GST is not charged on this invoice.',
    'Miracle never takes a commission on deals between brands and creators; this invoice is only for the Miracle plan.',
    'This is a computer-generated invoice and needs no signature.',
  ];
  for (const n of notes) for (const w of wrap(n, reg, 8.5, W - 2 * M)) (text(w, M, y, 8.5, reg, MUTED), (y -= 12));
  text(`${s.legal_name ?? ''} · ${s.email ?? 'support@miracleapp.live'} · www.miracleapp.live`, M, 30, 8, reg, MUTED);
  return await doc.save();
}

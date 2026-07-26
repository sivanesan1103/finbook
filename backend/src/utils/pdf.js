import PDFDocument from 'pdfkit';
import path from 'path';
import { fileURLToPath } from 'url';

const INR = (n) => `Rs. ${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

/** HTTP header values must be ASCII (Latin-1, really) — a Tamil party name
 * spliced straight into `filename="..."` produces an invalid header that
 * some HTTP clients reject outright and others silently mangle. Ships an
 * ASCII-safe fallback name plus the real name as an RFC 6266 filename*
 * parameter, which every modern browser prefers and decodes correctly. */
const contentDisposition = (rawName) => {
  const ascii = rawName.replace(/[^\x20-\x7E]/g, '') || 'file';
  return `attachment; filename="${ascii}.pdf"; filename*=UTF-8''${encodeURIComponent(rawName)}.pdf`;
};

// PDFKit's built-in Helvetica has no Tamil glyphs at all — a party/business
// name typed in Tamil silently came out as garbage bytes on every report.
// @fontsource ships the actual Tamil-script glyphs pre-subsetted from Noto
// Sans Tamil as plain .woff files, which fontkit (pdfkit's font engine)
// reads directly — no build step, no need to vendor a font file ourselves.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontsDir = path.join(__dirname, '../../node_modules/@fontsource/noto-sans-tamil/files');
const TAMIL_REGULAR = 'TamilRegular';
const TAMIL_BOLD = 'TamilBold';
const registerTamilFonts = (doc) => {
  doc.registerFont(TAMIL_REGULAR, path.join(fontsDir, 'noto-sans-tamil-tamil-400-normal.woff'));
  doc.registerFont(TAMIL_BOLD, path.join(fontsDir, 'noto-sans-tamil-tamil-700-normal.woff'));
};

// The Tamil-script subset above has zero Latin glyphs (and Helvetica has
// zero Tamil glyphs), so a name mixing both scripts — "தமிழ் Traders" —
// needs per-run font switching, not just picking one font for the string.
const TAMIL_RANGE = /[஀-௿]/;
const hasTamil = (s) => TAMIL_RANGE.test(String(s));
const splitByScript = (s) => {
  const runs = [];
  let cur = '', curIsTamil = TAMIL_RANGE.test(s[0] || '');
  for (const ch of String(s)) {
    const chIsTamil = TAMIL_RANGE.test(ch);
    if (chIsTamil !== curIsTamil && cur) { runs.push({ text: cur, tamil: curIsTamil }); cur = ''; }
    cur += ch;
    curIsTamil = chIsTamil;
  }
  if (cur) runs.push({ text: cur, tamil: curIsTamil });
  return runs;
};

/** Drop-in replacement for doc.font(...).text(str, x, y, opts) that
 * transparently switches to the Tamil font for Tamil-script runs within
 * the same string, falling straight through to the plain call when the
 * string is pure Latin/ASCII (the common case) so nothing else changes. */
const smartText = (doc, str, x, y, opts = {}) => {
  const { bold, ...rest } = opts;
  const latinFont = bold ? 'Helvetica-Bold' : 'Helvetica';
  if (!hasTamil(str)) return doc.font(latinFont).text(str, x, y, rest);
  const tamilFont = bold ? TAMIL_BOLD : TAMIL_REGULAR;
  const runs = splitByScript(str);
  runs.forEach((run, i) => {
    doc.font(run.tamil ? tamilFont : latinFont);
    if (i === 0) doc.text(run.text, x, y, { ...rest, continued: i < runs.length - 1 });
    else doc.text(run.text, { continued: i < runs.length - 1 });
  });
  return doc;
};

// ─────────────────────────────────────────────────────────────────────────
// Shared visual toolkit for the four plain "list" report PDFs (party
// statement, cashbook, transactions, sales). streamInvoicePdf below has its
// own established bordered-box layout and intentionally doesn't use this —
// it's a different document (a tax invoice, not an activity report) and
// changing its look wasn't asked for.
// ─────────────────────────────────────────────────────────────────────────
const RC = { brand: '#0d47a1', border: '#dde3ea', headBg: '#eef3fb', text: '#1a1a1a', muted: '#6b7280', give: '#b71c1c', get: '#1b5e20', zebra: '#f7f9fc' };
const PAGE_L = 40, PAGE_R = 555, PAGE_BOTTOM = 780;

/** Business name + report title/date-range header, used identically across all four report PDFs. */
const reportHeader = (doc, { business, title, subtitle }) => {
  doc.fontSize(17).fillColor(RC.brand);
  smartText(doc, business.name, PAGE_L, 40, { bold: true });
  doc.fontSize(10).fillColor(RC.muted);
  smartText(doc, title, PAGE_L, doc.y + 2);
  if (subtitle) { doc.fontSize(9).fillColor(RC.muted); smartText(doc, subtitle, PAGE_L, doc.y + 1); }
  doc.font('Helvetica').fontSize(8).fillColor(RC.muted)
    .text(`Generated ${fmtDate(new Date())} — FinBook`, PAGE_L, 40, { width: PAGE_R - PAGE_L, align: 'right' });
  const y = doc.y + 10;
  doc.moveTo(PAGE_L, y).lineTo(PAGE_R, y).strokeColor(RC.border).lineWidth(1).stroke();
  return y + 14;
};

/** Row of boxed stat chips (label above, value below) — replaces a single crammed summary line. */
const reportStats = (doc, y, stats) => {
  const w = (PAGE_R - PAGE_L - (stats.length - 1) * 10) / stats.length;
  let x = PAGE_L;
  for (const s of stats) {
    doc.roundedRect(x, y, w, 40, 4).fillColor(RC.headBg).fill();
    doc.font('Helvetica').fontSize(7.5).fillColor(RC.muted).text(s.label.toUpperCase(), x + 10, y + 8, { width: w - 20 });
    doc.font('Helvetica-Bold').fontSize(12).fillColor(s.color || RC.text).text(s.value, x + 10, y + 20, { width: w - 20 });
    x += w + 10;
  }
  return y + 40 + 16;
};

/**
 * Draws a table with a shaded header row, vertical column rules, and
 * zebra-striped body rows, re-printing the header on every page the table
 * spills onto (the previous version reset straight to a blank y=40 with no
 * indication mid-table which columns were which).
 */
const reportTable = (doc, { startY, columns, rows }) => {
  const drawHead = (y) => {
    doc.roundedRect(PAGE_L, y, PAGE_R - PAGE_L, 22, 3).fillColor(RC.headBg).fill();
    doc.font('Helvetica-Bold').fontSize(8).fillColor(RC.muted);
    columns.forEach((c) => doc.text(c.label.toUpperCase(), c.x + 8, y + 7, { width: c.width - 12, align: c.align || 'left' }));
    return y + 22;
  };
  let y = drawHead(startY);
  rows.forEach((row, i) => {
    if (y + row.height > PAGE_BOTTOM) {
      doc.addPage();
      y = drawHead(40);
    }
    if (i % 2 === 1) doc.rect(PAGE_L, y, PAGE_R - PAGE_L, row.height).fillColor(RC.zebra).fill();
    row.cells.forEach((cell, ci) => {
      const c = columns[ci];
      doc.fontSize(8.5).fillColor(cell.color || RC.text);
      smartText(doc, cell.text, c.x + 8, y + 7, { width: c.width - 12, align: c.align || 'left', bold: cell.bold });
    });
    y += row.height;
  });
  doc.moveTo(PAGE_L, y).lineTo(PAGE_R, y).strokeColor(RC.border).stroke();
  return y;
};

/** "Page X of Y" + brand footer on every page — added once the full page count is known. */
const addFooters = (doc) => {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    // Writing this close to the bottom edge would otherwise trip pdfkit's
    // automatic page-break-on-overflow and silently spawn a blank page.
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(7.5).fillColor(RC.muted)
      .text('Generated by FinBook', PAGE_L, 800, { width: 200, lineBreak: false })
      .text(`Page ${i + 1} of ${range.count}`, PAGE_L, 800, { width: PAGE_R - PAGE_L, align: 'right', lineBreak: false });
  }
};

/**
 * Streams a party statement (ledger report) PDF to `res`.
 * Layout mirrors the app's report screen: header, net balance, entries table.
 */
export const streamPartyStatement = (res, { business, party, entries, totals }) => {
  const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
  registerTamilFonts(doc);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', contentDisposition(`statement-${party.name}`));
  doc.pipe(res);

  let y = reportHeader(doc, { business, title: `Statement of ${party.name} (${party.type})` });
  y = reportStats(doc, y, [
    { label: totals.balance >= 0 ? 'You will get' : 'You will give', value: INR(Math.abs(totals.balance)), color: totals.balance >= 0 ? RC.give : RC.get },
    { label: 'You gave', value: INR(totals.gave), color: RC.give },
    { label: 'You got', value: INR(totals.got), color: RC.get },
  ]);

  const columns = [
    { label: 'Date', x: PAGE_L, width: 85 },
    { label: 'Details', x: PAGE_L + 85, width: 210 },
    { label: 'You Gave', x: PAGE_L + 295, width: 90, align: 'right' },
    { label: 'You Got', x: PAGE_L + 385, width: 65, align: 'right' },
    { label: 'Balance', x: PAGE_L + 450, width: 65, align: 'right' },
  ];
  const rows = entries.map((e) => ({
    height: 20,
    cells: [
      { text: fmtDate(e.entryDate) },
      { text: e.description || '-', color: RC.muted },
      { text: e.type === 'GAVE' ? INR(e.amount) : '', color: RC.give },
      { text: e.type === 'GOT' ? INR(e.amount) : '', color: RC.get },
      { text: INR(Math.abs(e.runningBalance)), bold: true },
    ],
  }));
  reportTable(doc, { startY: y, columns, rows });
  addFooters(doc);
  doc.end();
};

/** Streams a cashbook report PDF. */
export const streamCashbookReport = (res, { business, entries, totals, allTimeBalance, from, to }) => {
  const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
  registerTamilFonts(doc);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="cashbook-report.pdf"');
  doc.pipe(res);

  let y = reportHeader(doc, { business, title: 'Cashbook Report', subtitle: `${fmtDate(from)} – ${fmtDate(to)}` });
  y = reportStats(doc, y, [
    { label: 'In (this period)', value: INR(totals.in), color: RC.get },
    { label: 'Out (this period)', value: INR(totals.out), color: RC.give },
    { label: 'Net (this period)', value: INR(totals.balance) },
    // Same figure the app's Cashbook screen calls "Total Balance" — shown
    // alongside the period net so the two are never mistaken for the same
    // number when the selected date range isn't the account's full history.
    ...(allTimeBalance !== undefined ? [{ label: 'Total Balance (all-time)', value: INR(allTimeBalance) }] : []),
  ]);

  const columns = [
    { label: 'Date', x: PAGE_L, width: 80 },
    { label: 'Description', x: PAGE_L + 80, width: 195 },
    { label: 'Mode', x: PAGE_L + 275, width: 80 },
    { label: 'Out', x: PAGE_L + 355, width: 80, align: 'right' },
    { label: 'In', x: PAGE_L + 435, width: 80, align: 'right' },
  ];
  const rows = entries.map((e) => ({
    height: 20,
    cells: [
      { text: fmtDate(e.entryDate) },
      { text: e.description || '-', color: RC.muted },
      { text: e.paymentMode },
      { text: e.direction === 'OUT' ? INR(e.amount) : '', color: RC.give },
      { text: e.direction === 'IN' ? INR(e.amount) : '', color: RC.get },
    ],
  }));
  reportTable(doc, { startY: y, columns, rows });
  addFooters(doc);
  doc.end();
};

/** Streams a transactions report PDF (all parties, date range). */
export const streamTransactionsReport = (res, { business, entries, totals, from, to, partyType }) => {
  const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
  registerTamilFonts(doc);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="transactions-report.pdf"');
  doc.pipe(res);

  let y = reportHeader(doc, {
    business,
    title: `Transactions Report (${partyType ? partyType.toLowerCase() + 's' : 'all parties'})`,
    subtitle: `${fmtDate(from)} – ${fmtDate(to)}`,
  });
  y = reportStats(doc, y, [
    { label: 'You Gave', value: INR(totals.gave), color: RC.give },
    { label: 'You Got', value: INR(totals.got), color: RC.get },
    { label: 'Net Balance', value: INR(totals.net) },
  ]);

  const columns = [
    { label: 'Date', x: PAGE_L, width: 75 },
    { label: 'Party', x: PAGE_L + 75, width: 130 },
    { label: 'Details', x: PAGE_L + 205, width: 150 },
    { label: 'You Gave', x: PAGE_L + 355, width: 80, align: 'right' },
    { label: 'You Got', x: PAGE_L + 435, width: 80, align: 'right' },
  ];
  const rows = entries.map((e) => ({
    height: 20,
    cells: [
      { text: fmtDate(e.entryDate) },
      { text: e.party?.name || '-', bold: true },
      { text: e.description || e.paymentMode || '-', color: RC.muted },
      { text: e.type === 'GAVE' ? INR(e.amount) : '', color: RC.give },
      { text: e.type === 'GOT' ? INR(e.amount) : '', color: RC.get },
    ],
  }));
  reportTable(doc, { startY: y, columns, rows });
  addFooters(doc);
  doc.end();
};

/** Streams a sales report PDF (invoices in a date range). */
export const streamSalesReport = (res, { business, entries, totals, from, to }) => {
  const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
  registerTamilFonts(doc);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="sales-report.pdf"');
  doc.pipe(res);

  let y = reportHeader(doc, { business, title: 'Sales Report', subtitle: `${fmtDate(from)} – ${fmtDate(to)}` });
  y = reportStats(doc, y, [
    { label: `Billed (${totals.count} bills)`, value: INR(totals.billed) },
    { label: 'Collected', value: INR(totals.collected), color: RC.get },
    { label: 'Pending', value: INR(totals.pending), color: RC.give },
  ]);

  const columns = [
    { label: 'Date', x: PAGE_L, width: 70 },
    { label: 'Invoice', x: PAGE_L + 70, width: 85 },
    { label: 'Party', x: PAGE_L + 155, width: 130 },
    { label: 'Status', x: PAGE_L + 285, width: 75 },
    { label: 'Total', x: PAGE_L + 360, width: 75, align: 'right' },
    { label: 'Balance', x: PAGE_L + 435, width: 80, align: 'right' },
  ];
  const rows = entries.map((e) => ({
    height: 20,
    cells: [
      { text: fmtDate(e.date) },
      { text: e.invoiceNo, bold: true },
      { text: e.partyName, color: RC.muted },
      { text: e.status, color: RC.muted },
      { text: INR(e.total) },
      { text: INR(e.balance), color: e.balance > 0 ? RC.give : RC.get, bold: true },
    ],
  }));
  reportTable(doc, { startY: y, columns, rows });
  addFooters(doc);
  doc.end();
};

/** Indian-numbering amount in words, e.g. 5346 → "Five Thousand Three Hundred Forty Six Rupees Only". */
const amountInWords = (amount) => {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven',
    'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ' ' + ones[n % 10] : ''}`);
  const three = (n) => (n >= 100 ? `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ' ' + two(n % 100) : ''}` : two(n));
  const words = (n) => {
    if (n === 0) return 'Zero';
    const parts = [];
    if (n >= 1e7) { parts.push(`${words(Math.floor(n / 1e7))} Crore`); n %= 1e7; }
    if (n >= 1e5) { parts.push(`${three(Math.floor(n / 1e5))} Lakh`); n %= 1e5; }
    if (n >= 1e3) { parts.push(`${three(Math.floor(n / 1e3))} Thousand`); n %= 1e3; }
    if (n > 0) parts.push(three(n));
    return parts.join(' ');
  };
  let rupees = Math.floor(Math.abs(Number(amount)));
  let paise = Math.round((Math.abs(Number(amount)) - rupees) * 100);
  if (paise === 100) { rupees += 1; paise = 0; }
  let out = `${words(rupees)} Rupees`;
  if (paise > 0) out += ` and ${two(paise)} Paise`;
  return `${out} Only /-`;
};

const partyAddress = (p) =>
  [p.addressLine, p.area, [p.city, p.state].filter(Boolean).join(', '), p.pincode].filter(Boolean).join(', ');

/** Streams a Khatabook-style tax invoice PDF (bordered boxes, tax summary, amount in words). */
export const streamInvoicePdf = (res, { business, invoice }) => {
  const isProforma = invoice.docType === 'PROFORMA';
  const doc = new PDFDocument({ margin: 36, size: 'A4' });
  registerTamilFonts(doc);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${isProforma ? 'proforma' : 'invoice'}-${invoice.invoiceNo}.pdf"`);
  doc.pipe(res);

  const L = 36, W = 523, R = L + W;
  const line = (x1, y1, x2, y2) => doc.moveTo(x1, y1).lineTo(x2, y2).strokeColor('#9aa4b2').lineWidth(0.7).stroke();
  const box = (x, y, w, h) => doc.rect(x, y, w, h).strokeColor('#9aa4b2').lineWidth(0.7).stroke();
  const BOLD = 'Helvetica-Bold', REG = 'Helvetica';
  let paged = false; // set when the document spills onto a second page
  // Start a new page if the next block of height h would run past the printable area.
  const ensure = (h) => { if (y + h > 790) { doc.addPage(); paged = true; y = 40; } };

  // ── Title row ──
  let y = 40;
  doc.font(BOLD).fontSize(13).fillColor('#111')
    .text(isProforma ? 'PROFORMA INVOICE' : 'TAX INVOICE', L + 10, y);
  doc.font(REG).fontSize(8).fillColor('#666')
    .text(isProforma ? 'NOT A TAX INVOICE — FOR ESTIMATION ONLY' : 'ORIGINAL RECIPIENT', L, y + 3, { width: W - 10, align: 'right' });
  y += 24;

  const top = y;

  // ── Business details (left) + invoice meta (right) ──
  const bizH = 74;
  box(L, y, W, bizH);
  line(L + 300, y, L + 300, y + bizH);
  doc.fontSize(11).fillColor('#111');
  smartText(doc, business.name, L + 10, y + 8, { width: 280, bold: true });
  doc.font(REG).fontSize(8).fillColor('#333');
  let by = doc.y + 2;
  if (business.address) { doc.text(business.address, L + 10, by, { width: 280 }); by = doc.y + 2; }
  if (business.phone) { doc.text(`Contact no: ${business.phone}`, L + 10, by, { width: 280 }); by = doc.y + 2; }
  if (business.gstin) doc.font(BOLD).text(`GSTIN: ${business.gstin}`, L + 10, by, { width: 280 });

  doc.font(REG).fontSize(8).fillColor('#333');
  const metaX = L + 310;
  doc.text(`Invoice no: `, metaX, y + 10, { continued: true }).font(BOLD).text(invoice.invoiceNo);
  doc.font(REG).text(`Invoice Date: `, metaX, y + 26, { continued: true }).font(BOLD).text(fmtDate(invoice.issueDate));
  if (invoice.dueDate) doc.font(REG).text(`Due Date: `, metaX, y + 42, { continued: true }).font(BOLD).text(fmtDate(invoice.dueDate));
  doc.font(REG).text(`Status: `, metaX, invoice.dueDate ? y + 58 : y + 42, { continued: true }).font(BOLD).text(invoice.status);
  y += bizH;

  // ── Billing / shipping address ──
  const addr = partyAddress(invoice.party);
  const addrH = 64;
  box(L, y, W, addrH);
  line(L + W / 2, y, L + W / 2, y + addrH);
  const addrBlock = (x, title) => {
    doc.font(BOLD).fontSize(7.5).fillColor('#555').text(title, x, y + 7);
    doc.fontSize(9).fillColor('#111');
    smartText(doc, invoice.party.name, x, y + 18, { width: W / 2 - 20, bold: true });
    doc.font(REG).fontSize(8).fillColor('#333');
    if (addr) doc.text(addr, x, doc.y + 1, { width: W / 2 - 20, height: 20, ellipsis: true });
    if (invoice.party.phone) doc.text(`Contact no: ${invoice.party.phone}`, x, doc.y + 1);
    doc.text(`GSTIN: ${invoice.party.gstin || 'Nil'}`, x, doc.y + 1);
  };
  addrBlock(L + 10, 'BILLING ADDRESS');
  addrBlock(L + W / 2 + 10, 'SHIPPING ADDRESS');
  y += addrH;

  // ── Items table ──
  // Columns: S.NO | ITEMS | QTY | RATE/UNIT | TAX | AMOUNT
  const cols = [L, L + 34, L + 262, L + 322, L + 392, L + 452, R];
  const headH = 18;
  doc.rect(L, y, W, headH).fillColor('#eef1f5').fill();
  box(L, y, W, headH);
  doc.font(BOLD).fontSize(7.5).fillColor('#444');
  const heads = ['S.NO', 'ITEMS', 'QTY', 'RATE/UNIT', 'TAX', 'AMOUNT'];
  heads.forEach((h, i) => doc.text(h, cols[i] + 6, y + 5.5, {
    width: cols[i + 1] - cols[i] - 12, align: i >= 2 ? 'right' : 'left',
  }));
  y += headH;

  doc.font(REG).fontSize(8).fillColor('#111');
  let totalQty = 0;
  invoice.items.forEach((it, i) => {
    const qty = Number(it.qty), price = Number(it.price), rate = Number(it.taxRate || 0);
    const baseAmt = qty * price;
    const rowH = Math.max(24, doc.heightOfString(it.name, { width: cols[2] - cols[1] - 12 }) + 12);
    if (y + rowH > 760) { doc.addPage(); paged = true; y = 40; }
    totalQty += qty;
    box(L, y, W, rowH);
    for (let c = 1; c < 6; c++) line(cols[c], y, cols[c], y + rowH);
    doc.fillColor('#111').text(String(i + 1).padStart(2, '0'), cols[0] + 6, y + 6, { width: cols[1] - cols[0] - 12 });
    doc.font(BOLD).text(it.name, cols[1] + 6, y + 6, { width: cols[2] - cols[1] - 12 });
    doc.font(REG)
      .text(String(qty), cols[2] + 6, y + 6, { width: cols[3] - cols[2] - 12, align: 'right' })
      .text(INR(price), cols[3] + 6, y + 6, { width: cols[4] - cols[3] - 12, align: 'right' })
      .text(rate ? `${INR((baseAmt * rate) / 100)} (${rate}%)` : '-', cols[4] + 6, y + 6, { width: cols[5] - cols[4] - 12, align: 'right' })
      .text(INR(Number(it.amount)), cols[5] + 6, y + 6, { width: cols[6] - cols[5] - 12, align: 'right' });
    y += rowH;
  });

  // TOTAL row
  const totH = 18;
  doc.rect(L, y, W, totH).fillColor('#eef1f5').fill();
  box(L, y, W, totH);
  doc.font(BOLD).fontSize(8).fillColor('#111')
    .text('TOTAL', cols[1] + 6, y + 5)
    .text(String(totalQty), cols[2] + 6, y + 5, { width: cols[3] - cols[2] - 12, align: 'right' })
    .text(INR(invoice.taxAmount), cols[4] + 6, y + 5, { width: cols[5] - cols[4] - 12, align: 'right' })
    .text(INR(invoice.total), cols[5] + 6, y + 5, { width: cols[6] - cols[5] - 12, align: 'right' });
  y += totH + 10;

  // ── Tax summary (left) + totals (right) ──
  const rates = {};
  invoice.items.forEach((it) => {
    const rate = Number(it.taxRate || 0);
    const taxable = Number(it.qty) * Number(it.price);
    rates[rate] ||= { taxable: 0, tax: 0 };
    rates[rate].taxable += taxable;
    rates[rate].tax += (taxable * rate) / 100;
  });
  const taxRows = Object.entries(rates).sort(([a], [b]) => Number(a) - Number(b));
  const sumX = L, sumW = 300;
  const rowH2 = 15, sumH = rowH2 * (taxRows.length + 2);
  ensure(Math.max(sumH, 100) + 10);
  box(sumX, y, sumW, sumH);
  const sc = [sumX, sumX + 110, sumX + 165, sumX + 230, sumX + sumW];
  doc.font(BOLD).fontSize(7.5).fillColor('#444')
    .text('TAXABLE VALUE', sc[0] + 6, y + 4)
    .text('RATE', sc[1] + 6, y + 4)
    .text('TAX AMOUNT', sc[2] + 6, y + 4)
    .text('TOTAL TAX', sc[3] + 6, y + 4);
  line(sumX, y + rowH2, sumX + sumW, y + rowH2);
  let sy = y + rowH2;
  doc.font(REG).fontSize(8).fillColor('#111');
  taxRows.forEach(([rate, v]) => {
    doc.text(INR(v.taxable), sc[0] + 6, sy + 4)
      .text(`${rate}%`, sc[1] + 6, sy + 4)
      .text(INR(v.tax), sc[2] + 6, sy + 4)
      .text(INR(v.tax), sc[3] + 6, sy + 4);
    sy += rowH2;
  });
  line(sumX, sy, sumX + sumW, sy);
  doc.font(BOLD)
    .text('TOTAL', sc[0] + 6, sy + 4)
    .text(INR(invoice.taxAmount), sc[2] + 6, sy + 4)
    .text(INR(invoice.taxAmount), sc[3] + 6, sy + 4);

  const tx = L + 320, tw = R - tx;
  const trow = (label, value, opts = {}) => {
    doc.font(opts.bold ? BOLD : REG).fontSize(opts.big ? 10 : 8).fillColor(opts.color || '#111')
      .text(label, tx, y2, { width: tw - 90 })
      .text(value, tx + tw - 90, y2, { width: 90, align: 'right' });
    y2 += opts.big ? 18 : 14;
  };
  let y2 = y + 4;
  trow('Subtotal', INR(invoice.subtotal));
  trow('Tax', INR(invoice.taxAmount));
  if (Number(invoice.discount) > 0) trow('Discount', `- ${INR(invoice.discount)}`);
  trow('Grand Total', INR(invoice.total), { bold: true, big: true });
  if (!isProforma) {
    trow('Amount Paid', INR(invoice.amountPaid), { color: '#1b5e20' });
    trow('Balance Due', INR(Number(invoice.total) - Number(invoice.amountPaid)), { color: '#b71c1c', bold: true });
  }
  y = Math.max(y + sumH, y2) + 10;

  // ── Amount in words ──
  const wordsH = 30;
  ensure(wordsH + 4);
  box(L, y, W, wordsH);
  doc.font(BOLD).fontSize(7.5).fillColor('#555').text('TOTAL AMOUNT (IN WORDS)', L + 10, y + 5);
  doc.font(BOLD).fontSize(8.5).fillColor('#111').text(amountInWords(invoice.total), L + 10, y + 16, { width: W - 20 });
  y += wordsH;

  // ── Payment details / terms + signature ──
  const payLines = [
    business.upiId && ['UPI ID:', business.upiId],
    business.bankName && ['Bank:', business.bankName],
    business.bankAccountName && ['Name:', business.bankAccountName],
    business.bankAccountNo && ['A/C no:', business.bankAccountNo],
    business.bankIfsc && ['IFSC:', business.bankIfsc],
  ].filter(Boolean);
  const termH = Math.max(88, 28 + payLines.length * 12);
  ensure(termH + 28);
  box(L, y, W, termH);
  line(L + 200, y, L + 200, y + termH);
  line(L + 380, y, L + 380, y + termH);

  doc.font(BOLD).fontSize(7.5).fillColor('#555').text('PAYMENT DETAILS', L + 10, y + 7);
  if (payLines.length === 0) {
    doc.font(REG).fontSize(7.5).fillColor('#888').text('Add UPI & bank details in Settings to print them here.', L + 10, y + 20, { width: 180 });
  } else {
    let py = y + 20;
    payLines.forEach(([k, v]) => {
      doc.font(REG).fontSize(7.5).fillColor('#555').text(k, L + 10, py, { width: 45 });
      doc.font(BOLD).fillColor('#111').text(v, L + 58, py, { width: 138 });
      py += 12;
    });
  }

  doc.font(BOLD).fontSize(7.5).fillColor('#555').text('TERMS & CONDITIONS', L + 210, y + 7);
  doc.font(REG).fontSize(7.5).fillColor('#333').text(
    invoice.notes || business.invoiceTerms ||
    '1. Goods once sold will not be returned.\n2. Payment is due within the mentioned due date.\n3. Subject to local jurisdiction.',
    L + 210, y + 20, { width: 160, height: termH - 26, ellipsis: true },
  );

  doc.fontSize(7.5).fillColor('#333');
  smartText(doc, `For ${business.name}`, L + 390, y + 10, { width: W - 400, align: 'right' });
  doc.font(BOLD).fontSize(8).fillColor('#111').text('Authorised Signature', L + 390, y + termH - 16, { width: W - 400, align: 'right' });
  y += termH + 8;

  doc.font(REG).fontSize(7.5).fillColor('#666')
    .text('Is reverse charge applicable? No', L, y, { continued: false })
    .text(`Generated by FinBook on ${fmtDate(new Date())} · Page 1 of 1`, L, y, { width: W, align: 'right' });

  // Outer frame around everything above the footer (single-page invoices only —
  // after an addPage the page-1 `top` no longer maps to the current page).
  if (!paged) box(L - 4, top - 4, W + 8, y - top + 2);

  doc.end();
};

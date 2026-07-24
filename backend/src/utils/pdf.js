import PDFDocument from 'pdfkit';

const INR = (n) => `Rs. ${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

/**
 * Streams a party statement (ledger report) PDF to `res`.
 * Layout mirrors the app's report screen: header, net balance, entries table.
 */
export const streamPartyStatement = (res, { business, party, entries, totals }) => {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="statement-${party.name}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).fillColor('#0d47a1').text(business.name, { continued: false });
  doc.fontSize(10).fillColor('#555').text(`Statement of ${party.name} (${party.type})`);
  doc.text(`Generated on ${fmtDate(new Date())} — FinBook`);
  doc.moveDown();

  doc.fontSize(12).fillColor('#000').text(`Net Balance: ${INR(Math.abs(totals.balance))} ${totals.balance >= 0 ? '(You will get)' : '(You will give)'}`);
  doc.fontSize(10).fillColor('#b71c1c').text(`You gave: ${INR(totals.gave)}`, { continued: true })
    .fillColor('#1b5e20').text(`   You got: ${INR(totals.got)}`);
  doc.moveDown();

  const startX = doc.x;
  let y = doc.y;
  const col = [startX, startX + 130, startX + 260, startX + 360, startX + 460];
  doc.fontSize(9).fillColor('#333');
  doc.text('Date', col[0], y).text('Details', col[1], y).text('You Gave', col[2], y)
    .text('You Got', col[3], y).text('Balance', col[4], y);
  y += 14;
  doc.moveTo(startX, y).lineTo(startX + 515, y).strokeColor('#ccc').stroke();
  y += 6;

  for (const e of entries) {
    if (y > 760) { doc.addPage(); y = 40; }
    doc.fillColor('#000').text(fmtDate(e.entryDate), col[0], y, { width: 120 });
    doc.fillColor('#555').text(e.description || '-', col[1], y, { width: 120 });
    doc.fillColor('#b71c1c').text(e.type === 'GAVE' ? INR(e.amount) : '', col[2], y, { width: 90 });
    doc.fillColor('#1b5e20').text(e.type === 'GOT' ? INR(e.amount) : '', col[3], y, { width: 90 });
    doc.fillColor('#000').text(INR(Math.abs(e.runningBalance)), col[4], y);
    y += 18;
  }

  doc.end();
};

/** Streams a cashbook report PDF. */
export const streamCashbookReport = (res, { business, entries, totals, from, to }) => {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="cashbook-report.pdf"');
  doc.pipe(res);

  doc.fontSize(18).fillColor('#0d47a1').text(business.name);
  doc.fontSize(10).fillColor('#555').text(`Cashbook report ${fmtDate(from)} – ${fmtDate(to)} — FinBook`);
  doc.moveDown();
  doc.fontSize(12).fillColor('#000')
    .text(`Total In: ${INR(totals.in)}    Total Out: ${INR(totals.out)}    Balance: ${INR(totals.balance)}`);
  doc.moveDown();

  const x = doc.x;
  let y = doc.y;
  doc.fontSize(9).fillColor('#333')
    .text('Date', x, y).text('Description', x + 110, y).text('Mode', x + 300, y)
    .text('Out', x + 380, y).text('In', x + 460, y);
  y += 18;
  for (const e of entries) {
    if (y > 760) { doc.addPage(); y = 40; }
    doc.fillColor('#000').text(fmtDate(e.entryDate), x, y);
    doc.fillColor('#555').text(e.description || '-', x + 110, y, { width: 180 });
    doc.fillColor('#000').text(e.paymentMode, x + 300, y);
    doc.fillColor('#b71c1c').text(e.direction === 'OUT' ? INR(e.amount) : '', x + 380, y);
    doc.fillColor('#1b5e20').text(e.direction === 'IN' ? INR(e.amount) : '', x + 460, y);
    y += 16;
  }
  doc.end();
};

/** Streams a transactions report PDF (all parties, date range). */
export const streamTransactionsReport = (res, { business, entries, totals, from, to, partyType }) => {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="transactions-report.pdf"');
  doc.pipe(res);

  doc.fontSize(18).fillColor('#0d47a1').text(business.name);
  doc.fontSize(10).fillColor('#555')
    .text(`Transactions report (${partyType ? partyType.toLowerCase() + 's' : 'all parties'}) ${fmtDate(from)} – ${fmtDate(to)} — FinBook`);
  doc.moveDown();
  doc.fontSize(12).fillColor('#000')
    .text(`You Gave: ${INR(totals.gave)}    You Got: ${INR(totals.got)}    Net Balance: ${INR(totals.net)}`);
  doc.moveDown();

  const x = doc.x;
  let y = doc.y;
  doc.fontSize(9).fillColor('#333')
    .text('Date', x, y).text('Party', x + 90, y).text('Details', x + 230, y)
    .text('You Gave', x + 380, y).text('You Got', x + 460, y);
  y += 14;
  doc.moveTo(x, y).lineTo(x + 515, y).strokeColor('#ccc').stroke();
  y += 6;
  for (const e of entries) {
    if (y > 760) { doc.addPage(); y = 40; }
    doc.fillColor('#000').text(fmtDate(e.entryDate), x, y, { width: 85 });
    doc.fillColor('#000').text(e.party?.name || '-', x + 90, y, { width: 135 });
    doc.fillColor('#555').text(e.description || e.paymentMode || '-', x + 230, y, { width: 145 });
    doc.fillColor('#b71c1c').text(e.type === 'GAVE' ? INR(e.amount) : '', x + 380, y, { width: 75 });
    doc.fillColor('#1b5e20').text(e.type === 'GOT' ? INR(e.amount) : '', x + 460, y);
    y += 16;
  }
  doc.end();
};

/** Streams a sales report PDF (invoices in a date range). */
export const streamSalesReport = (res, { business, entries, totals, from, to }) => {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="sales-report.pdf"');
  doc.pipe(res);

  doc.fontSize(18).fillColor('#0d47a1').text(business.name);
  doc.fontSize(10).fillColor('#555').text(`Sales report ${fmtDate(from)} – ${fmtDate(to)} — FinBook`);
  doc.moveDown();
  doc.fontSize(12).fillColor('#000')
    .text(`Billed: ${INR(totals.billed)}    Collected: ${INR(totals.collected)}    Pending: ${INR(totals.pending)}    Bills: ${totals.count}`);
  doc.moveDown();

  const x = doc.x;
  let y = doc.y;
  doc.fontSize(9).fillColor('#333')
    .text('Date', x, y).text('Invoice', x + 80, y).text('Party', x + 170, y)
    .text('Status', x + 300, y).text('Total', x + 380, y).text('Balance', x + 460, y);
  y += 14;
  doc.moveTo(x, y).lineTo(x + 515, y).strokeColor('#ccc').stroke();
  y += 6;
  for (const e of entries) {
    if (y > 760) { doc.addPage(); y = 40; }
    doc.fillColor('#000').text(fmtDate(e.date), x, y, { width: 75 });
    doc.fillColor('#000').text(e.invoiceNo, x + 80, y, { width: 85 });
    doc.fillColor('#555').text(e.partyName, x + 170, y, { width: 125 });
    doc.fillColor('#555').text(e.status, x + 300, y, { width: 75 });
    doc.fillColor('#000').text(INR(e.total), x + 380, y, { width: 75 });
    doc.fillColor(e.balance > 0 ? '#b71c1c' : '#1b5e20').text(INR(e.balance), x + 460, y);
    y += 16;
  }
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
  doc.font(BOLD).fontSize(11).fillColor('#111').text(business.name, L + 10, y + 8, { width: 280 });
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
    doc.font(BOLD).fontSize(9).fillColor('#111').text(invoice.party.name, x, y + 18, { width: W / 2 - 20 });
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

  doc.font(REG).fontSize(7.5).fillColor('#333').text(`For ${business.name}`, L + 390, y + 10, { width: W - 400, align: 'right' });
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

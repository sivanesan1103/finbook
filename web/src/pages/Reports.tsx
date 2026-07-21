import { useCallback, useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../api/client';
import type { Transaction, CashbookEntry, PartyType } from '../types';
import type { TranslationKey } from '../i18n';
import { EmptyState, Money, Spinner, fmtDate } from '../components/ui';

type ReportKind = 'transactions' | 'cashbook';
type Period = 'today' | 'yesterday' | 'week' | 'month' | 'lastMonth' | 'year' | 'custom';

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const periodRange = (p: Period): { from: string; to: string } => {
  const now = new Date();
  switch (p) {
    case 'today': return { from: iso(now), to: iso(now) };
    case 'yesterday': {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return { from: iso(y), to: iso(y) };
    }
    case 'week': {
      const start = new Date(now); start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      return { from: iso(start), to: iso(now) };
    }
    case 'lastMonth': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: iso(start), to: iso(end) };
    }
    case 'year': return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) };
    case 'month':
    default: return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
  }
};

const PERIODS: { key: Period; labelKey: TranslationKey }[] = [
  { key: 'today', labelKey: 'reports.periodToday' },
  { key: 'yesterday', labelKey: 'reports.periodYesterday' },
  { key: 'week', labelKey: 'reports.periodWeek' },
  { key: 'month', labelKey: 'reports.periodMonth' },
  { key: 'lastMonth', labelKey: 'reports.periodLastMonth' },
  { key: 'year', labelKey: 'reports.periodYear' },
  { key: 'custom', labelKey: 'reports.periodCustom' },
];

const downloadBlob = (data: Blob, filename: string) => {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

export default function Reports() {
  const { business } = useAuth();
  const { t } = useLanguage();
  const [kind, setKind] = useState<ReportKind>('transactions');
  const [partyType, setPartyType] = useState<PartyType>('CUSTOMER');
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<Period>('month');
  const [{ from, to }, setRange] = useState(periodRange('month'));
  const [downloading, setDownloading] = useState(false);

  const [txData, setTxData] = useState<{ totals: { gave: number; got: number; net: number }; count: number; entries: Transaction[] } | null>(null);
  const [tabCounts, setTabCounts] = useState({ CUSTOMER: 0, SUPPLIER: 0 });
  const [cashEntries, setCashEntries] = useState<CashbookEntry[] | null>(null);
  const [cashTotals, setCashTotals] = useState({ in: 0, out: 0, balance: 0 });

  const base = `/businesses/${business?.id}`;
  const dateParams = { from, to: to + 'T23:59:59' };

  const setPeriodAndRange = (p: Period) => {
    setPeriod(p);
    if (p !== 'custom') setRange(periodRange(p));
  };

  const loadTransactions = useCallback(async () => {
    if (!business) return;
    setTxData(null);
    const params = { ...dateParams, search: search || undefined };
    const [cust, supp] = await Promise.all([
      api.get(`${base}/reports/transactions`, { params: { ...params, partyType: 'CUSTOMER' } }),
      api.get(`${base}/reports/transactions`, { params: { ...params, partyType: 'SUPPLIER' } }),
    ]);
    setTabCounts({ CUSTOMER: cust.data.data.count, SUPPLIER: supp.data.data.count });
    setTxData(partyType === 'CUSTOMER' ? cust.data.data : supp.data.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business, from, to, search, partyType, base]);

  const loadCashbook = useCallback(async () => {
    if (!business) return;
    setCashEntries(null);
    const all: CashbookEntry[] = [];
    let page = 1, pages = 1;
    do {
      const res = await api.get(`${base}/cashbook`, { params: { ...dateParams, page, limit: 100 } });
      all.push(...res.data.data);
      pages = res.data.meta.pages;
      page++;
    } while (page <= pages && page <= 50);
    const totalIn = all.filter((e) => e.direction === 'IN').reduce((s, e) => s + Number(e.amount), 0);
    const totalOut = all.filter((e) => e.direction === 'OUT').reduce((s, e) => s + Number(e.amount), 0);
    setCashEntries(all);
    setCashTotals({ in: totalIn, out: totalOut, balance: totalIn - totalOut });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business, from, to, base]);

  useEffect(() => {
    if (kind === 'transactions') loadTransactions();
    else loadCashbook();
  }, [kind, loadTransactions, loadCashbook]);

  // ── downloads ──
  const downloadPdf = async () => {
    if (!business) return;
    setDownloading(true);
    try {
      if (kind === 'transactions') {
        const res = await api.get(`${base}/reports/transactions.pdf`, {
          params: { ...dateParams, partyType, search: search || undefined }, responseType: 'blob',
        });
        downloadBlob(res.data, 'transactions-report.pdf');
      } else {
        const res = await api.get(`${base}/cashbook/report.pdf`, { params: dateParams, responseType: 'blob' });
        downloadBlob(res.data, 'cashbook-report.pdf');
      }
    } finally { setDownloading(false); }
  };

  const downloadExcel = () => {
    const wb = XLSX.utils.book_new();
    if (kind === 'transactions') {
      if (!txData) return;
      const rows = txData.entries.map((t) => ({
        Date: fmtDate(t.entryDate),
        Party: t.party?.name || '',
        Details: t.description || '',
        'Payment Mode': t.paymentMode as string,
        'You Gave': t.type === 'GAVE' ? Number(t.amount) : '',
        'You Got': t.type === 'GOT' ? Number(t.amount) : '',
      }));
      rows.push({ Date: '', Party: '', Details: 'TOTALS', 'Payment Mode': '', 'You Gave': txData.totals.gave, 'You Got': txData.totals.got });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Transactions');
      XLSX.writeFile(wb, 'transactions-report.xlsx');
    } else {
      if (!cashEntries) return;
      const rows = cashEntries.map((e) => ({
        Date: fmtDate(e.entryDate),
        Details: e.description || '',
        'Payment Mode': e.paymentMode as string,
        'Cash Out': e.direction === 'OUT' ? Number(e.amount) : '',
        'Cash In': e.direction === 'IN' ? Number(e.amount) : '',
      }));
      rows.push({ Date: '', Details: 'TOTALS', 'Payment Mode': '', 'Cash Out': cashTotals.out, 'Cash In': cashTotals.in });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Cashbook');
      XLSX.writeFile(wb, 'cashbook-report.xlsx');
    }
  };

  const hasRows = kind === 'transactions' ? !!txData?.entries.length : !!cashEntries?.length;
  const loading = kind === 'transactions' ? !txData : !cashEntries;

  const filters = (withSearch: boolean) => (
    <div className={`grid grid-cols-2 ${withSearch ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-3 mb-5`}>
      {withSearch && (
        <div>
          <label className="label">{t('reports.customerName')}</label>
          <input className="input" placeholder={t('reports.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}
      <div>
        <label className="label">{t('reports.period')}</label>
        <select className="input" value={period} onChange={(e) => setPeriodAndRange(e.target.value as Period)}>
          {PERIODS.map((p) => <option key={p.key} value={p.key}>{t(p.labelKey)}</option>)}
        </select>
      </div>
      <div>
        <label className="label">{t('reports.start')}</label>
        <input type="date" className="input" value={from}
          onChange={(e) => { setPeriod('custom'); setRange((r) => ({ ...r, from: e.target.value })); }} />
      </div>
      <div>
        <label className="label">{t('reports.end')}</label>
        <input type="date" className="input" value={to}
          onChange={(e) => { setPeriod('custom'); setRange((r) => ({ ...r, to: e.target.value })); }} />
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      {/* ── Reports list panel ── */}
      <section className="w-[360px] border-r border-slate-200 bg-white flex flex-col shrink-0">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-lg">{t('reports.title')}</h2>
        </div>
        <p className="px-5 pt-4 pb-2 text-[11px] font-bold text-slate-400 tracking-wider">{t('reports.partiesReports')}</p>
        <button onClick={() => setKind('transactions')}
          className={`flex items-center gap-3 px-5 py-4 text-left border-l-4 transition ${
            kind === 'transactions' ? 'border-brand-500 bg-brand-50' : 'border-transparent hover:bg-slate-50'
          }`}>
          <span className={`w-11 h-11 rounded-full flex items-center justify-center text-lg ${kind === 'transactions' ? 'bg-brand-500 text-white' : 'bg-slate-100'}`}>⇄</span>
          <span>
            <span className="block font-semibold text-sm">{t('reports.transactionReport')}</span>
            <span className="block text-xs text-slate-400">{t('reports.transactionReportSub')}</span>
          </span>
        </button>
        <button onClick={() => setKind('cashbook')}
          className={`flex items-center gap-3 px-5 py-4 text-left border-l-4 transition ${
            kind === 'cashbook' ? 'border-brand-500 bg-brand-50' : 'border-transparent hover:bg-slate-50'
          }`}>
          <span className={`w-11 h-11 rounded-full flex items-center justify-center text-lg ${kind === 'cashbook' ? 'bg-brand-500 text-white' : 'bg-slate-100'}`}>📔</span>
          <span>
            <span className="block font-semibold text-sm">{t('reports.cashbookReport')}</span>
            <span className="block text-xs text-slate-400">{t('reports.cashbookReportSub')}</span>
          </span>
        </button>
      </section>

      {/* ── Report detail panel ── */}
      <section className="flex-1 overflow-y-auto bg-white min-w-0">
        <div className="px-6 py-4 flex items-center gap-3 border-b border-slate-100">
          <span className="w-12 h-12 rounded-full bg-brand-500 text-white flex items-center justify-center text-xl">
            {kind === 'transactions' ? '⇄' : '📔'}
          </span>
          <h1 className="text-xl font-bold text-slate-800 flex-1">
            {kind === 'transactions' ? t('reports.transactionsReportsTitle') : t('reports.cashbookReport')}
          </h1>
          <button className="btn-outline" onClick={downloadPdf} disabled={!hasRows || downloading}>
            {downloading ? '…' : t('reports.downloadPdf')}
          </button>
          <button className="btn-outline" onClick={downloadExcel} disabled={!hasRows}>
            {t('reports.downloadExcel')}
          </button>
        </div>

        {kind === 'transactions' && (
          <div className="px-6 pt-4">
            <div className="flex gap-8 border-b border-slate-200 mb-5">
              {(['CUSTOMER', 'SUPPLIER'] as PartyType[]).map((pt) => (
                <button key={pt} onClick={() => setPartyType(pt)}
                  className={`pb-2 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
                    partyType === pt ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}>
                  {pt === 'CUSTOMER' ? t('reports.customers') : t('reports.suppliers')}
                  <span className={`text-xs rounded-full px-2 py-0.5 ${partyType === pt ? 'bg-brand-50 text-brand-600' : 'bg-slate-100 text-slate-500'}`}>
                    {tabCounts[pt]}
                  </span>
                </button>
              ))}
            </div>

            {filters(true)}

            <p className="font-semibold text-sm mb-3">{t('reports.totalEntries', { count: txData?.count ?? 0 })}</p>
            <div className="grid grid-cols-3 gap-4 mb-5">
              <div className="card p-4 bg-red-50 border-red-100">
                <Money value={txData?.totals.gave ?? 0} colored={false} className="text-xl text-get" />
                <p className="text-xs font-semibold text-get mt-1">{t('reports.youGave')}</p>
              </div>
              <div className="card p-4 bg-green-50 border-green-100">
                <Money value={txData?.totals.got ?? 0} colored={false} className="text-xl text-give" />
                <p className="text-xs font-semibold text-give mt-1">{t('reports.youGot')}</p>
              </div>
              <div className="card p-4 bg-brand-50 border-brand-100">
                <Money value={txData?.totals.net ?? 0} colored={false} className="text-xl text-slate-800" />
                <p className="text-xs font-semibold text-slate-500 mt-1">{t('reports.netBalance')}</p>
              </div>
            </div>

            {loading ? <Spinner /> : !txData?.entries.length ? (
              <EmptyState icon="🗃️" title={t('reports.noTransactionsAvailable')} />
            ) : (
              <div className="card mb-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100">
                      <th className="px-5 py-3">{t('reports.date')}</th><th>{t('reports.party')}</th><th>{t('reports.details')}</th>
                      <th className="text-right">{t('reports.youGave')}</th><th className="text-right px-5">{t('reports.youGot')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txData.entries.map((tx) => (
                      <tr key={tx.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-5 py-3 text-slate-500">{fmtDate(tx.entryDate)}</td>
                        <td className="font-medium">{tx.party?.name}</td>
                        <td className="text-slate-400">{tx.description || '—'}</td>
                        <td className="text-right">{tx.type === 'GAVE' && <Money value={tx.amount} colored={false} className="text-get" />}</td>
                        <td className="text-right px-5">{tx.type === 'GOT' && <Money value={tx.amount} colored={false} className="text-give" />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {kind === 'cashbook' && (
          <div className="px-6 pt-5">
            {filters(false)}

            <div className="grid grid-cols-3 gap-4 mb-5">
              <div className="card p-4 bg-green-50 border-green-100">
                <Money value={cashTotals.in} colored={false} className="text-xl text-give" />
                <p className="text-xs font-semibold text-give mt-1">{t('reports.totalIn')}</p>
              </div>
              <div className="card p-4 bg-red-50 border-red-100">
                <Money value={cashTotals.out} colored={false} className="text-xl text-get" />
                <p className="text-xs font-semibold text-get mt-1">{t('reports.totalOut')}</p>
              </div>
              <div className="card p-4 bg-brand-50 border-brand-100">
                <Money value={cashTotals.balance} colored={false} className="text-xl text-slate-800" />
                <p className="text-xs font-semibold text-slate-500 mt-1">{t('reports.netBalance')}</p>
              </div>
            </div>

            {loading ? <Spinner /> : !cashEntries?.length ? (
              <EmptyState icon="🗃️" title={t('reports.noTransactionsAvailable')} />
            ) : (
              <div className="card mb-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100">
                      <th className="px-5 py-3">{t('reports.date')}</th><th>{t('reports.details')}</th><th>{t('reports.mode')}</th>
                      <th className="text-right">{t('reports.cashOut')}</th><th className="text-right px-5">{t('reports.cashIn')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashEntries.map((e) => (
                      <tr key={e.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-5 py-3 text-slate-500">{fmtDate(e.entryDate)}</td>
                        <td className="text-slate-600">{e.description || '—'}</td>
                        <td className="text-slate-400">{e.paymentMode}</td>
                        <td className="text-right">{e.direction === 'OUT' && <Money value={Number(e.amount)} colored={false} className="text-get" />}</td>
                        <td className="text-right px-5">{e.direction === 'IN' && <Money value={Number(e.amount)} colored={false} className="text-give" />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

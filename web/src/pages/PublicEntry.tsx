import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, apiMessage } from '../api/client';
import { inr } from '../components/ui';

interface Row {
  id: string;
  entryDate: string;
  debit: number | null;
  credit: number | null;
  balance: number;
  isLatest: boolean;
}

interface LedgerData {
  businessName: string;
  partyName: string;
  totalDebit: number;
  totalCredit: number;
  netBalance: number;
  entries: Row[];
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** Unauthenticated read-only page for a shared entry link (wa.me/SMS "view
 * transaction history" link) — no login, no nav, just this party's ledger,
 * styled to match the Khatabook-style receipt customers already recognize. */
export default function PublicEntry() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<LedgerData | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get(`/public/entries/${token}`)
      .then((res) => setData(res.data.data))
      .catch((e) => setErr(apiMessage(e)));
  }, [token]);

  const dateRange = data?.entries.length
    ? `${fmtDate(data.entries[data.entries.length - 1].entryDate)} – ${fmtDate(data.entries[0].entryDate)}`
    : '';

  return (
    <div className="min-h-screen bg-slate-100 flex justify-center py-6 px-3">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm overflow-hidden h-fit">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <span className="font-extrabold text-navy-900">FinBook</span>
          <span className="text-xs text-slate-400">Powered by FinBook</span>
        </div>

        {err && <p className="text-center text-give font-semibold p-8">{err}</p>}
        {!err && !data && <p className="text-center text-slate-400 p-8">Loading…</p>}

        {data && (
          <>
            <div className="flex items-center gap-3 px-5 py-4">
              <div className="w-11 h-11 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600">
                {data.partyName.slice(0, 2).toUpperCase()}
              </div>
              <p className="font-bold text-slate-800">{data.businessName}</p>
            </div>

            <div className="px-5 pb-2">
              <p className="font-bold text-slate-800">Transaction History</p>
              {dateRange && <p className="text-xs text-slate-400">({dateRange})</p>}
            </div>

            <div className="mx-5 mb-4 border border-slate-200 rounded-lg grid grid-cols-2 divide-x divide-slate-200">
              <div className="p-3">
                <p className="text-xs text-slate-400">Total Debit(-)</p>
                <p className="font-bold text-slate-800">{inr(data.totalDebit)}</p>
                <p className="text-xs text-slate-400 mt-2">Total Credit(+)</p>
                <p className="font-bold text-slate-800">{inr(data.totalCredit)}</p>
              </div>
              <div className="p-3">
                <p className="text-xs text-slate-400">Net Balance</p>
                <p className="font-bold text-slate-800">{inr(Math.abs(data.netBalance))}</p>
              </div>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-slate-200 text-xs text-slate-400">
                  <th className="text-left font-medium px-5 py-2">Date</th>
                  <th className="text-right font-medium px-2 py-2">Debit(-)</th>
                  <th className="text-right font-medium px-2 py-2">Credit(+)</th>
                  <th className="text-right font-medium px-5 py-2">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-5 py-3">
                      {row.isLatest && <span className="block text-give text-xs font-semibold">Latest</span>}
                      {fmtDate(row.entryDate)}
                    </td>
                    <td className="text-right px-2 py-3 text-get">{row.debit ? inr(row.debit) : ''}</td>
                    <td className="text-right px-2 py-3 text-give">{row.credit ? inr(row.credit) : ''}</td>
                    <td className={`text-right px-5 py-3 font-medium ${row.balance > 0 ? 'text-get' : 'text-slate-600'}`}>
                      {inr(Math.abs(row.balance))}{row.balance > 0 ? ' Dr' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

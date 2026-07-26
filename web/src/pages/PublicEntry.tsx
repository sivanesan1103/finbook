import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, apiMessage } from '../api/client';
import { inr } from '../components/ui';

interface EntryData {
  businessName: string;
  partyName: string;
  amount: number;
  type: 'GAVE' | 'GOT';
  entryDate: string;
  runningBalance: number | null;
}

/** Unauthenticated read-only page for a shared entry link (wa.me/SMS "view
 * transaction history" link) — no login, no nav, just the one entry. */
export default function PublicEntry() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<EntryData | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get(`/public/entries/${token}`)
      .then((res) => setData(res.data.data))
      .catch((e) => setErr(apiMessage(e)));
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-navy-900 via-navy-800 to-navy-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-navy-800 rounded-t-3xl px-8 py-8 text-center border-b border-navy-700">
          <h1 className="text-2xl font-extrabold text-white">FinBook</h1>
        </div>
        <div className="bg-white rounded-b-3xl px-8 py-8 shadow-2xl">
          {err && <p className="text-center text-give font-semibold">{err}</p>}
          {!err && !data && <p className="text-center text-slate-400">Loading…</p>}
          {data && (
            <div className="space-y-5">
              <div className="text-center">
                <p className="text-sm text-slate-500">{data.businessName}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {new Date(data.entryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
              <div className="text-center py-4 border-y border-slate-100">
                <p className={`text-3xl font-extrabold ${data.type === 'GOT' ? 'text-get' : 'text-give'}`}>
                  {inr(data.amount)}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  {data.type === 'GOT' ? 'Payment received' : 'Credit given'} · {data.partyName}
                </p>
              </div>
              {data.runningBalance !== null && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">Total outstanding balance</span>
                  <span className="font-bold text-slate-800">{inr(Math.abs(data.runningBalance))}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

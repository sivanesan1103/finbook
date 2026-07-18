import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import type { DashboardData } from '../types';
import { Money, Spinner, fmtDateTime } from '../components/ui';

function Stat({ title, children, sub, to }: { title: string; children: React.ReactNode; sub?: string; to?: string }) {
  const inner = (
    <div className="card p-5 hover:shadow-md transition h-full">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{title}</p>
      <div className="text-2xl font-bold text-slate-800">{children}</div>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

export default function Dashboard() {
  const { business, user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    if (!business) return;
    setData(null);
    api.get(`/businesses/${business.id}/reports/dashboard`).then((r) => setData(r.data.data));
  }, [business]);

  if (!data) return <Spinner />;

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Hello, {user?.name?.split(' ')[0]} 👋</h1>
        <p className="text-sm text-slate-500 mt-1">Here's what's happening at <span className="font-semibold text-slate-700">{business?.name}</span> this month.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat title="You Will Get" sub="outstanding from parties" to="/customers">
          <Money value={data.ledger.youWillGet} colored={false} className="text-give" />
        </Stat>
        <Stat title="You Will Give" sub="payable to parties" to="/suppliers">
          <Money value={data.ledger.youWillGive} colored={false} className="text-get" />
        </Stat>
        <Stat title="Cash In" sub={`Out: ₹${data.cash.out.toLocaleString('en-IN')}`} to="/cashbook">
          <Money value={data.cash.in} colored={false} className="text-give" />
        </Stat>
        <Stat title="Expenses" sub="this month" to="/expenses">
          <Money value={data.expenses} colored={false} className="text-slate-700" />
        </Stat>
        <Stat title="Sales Billed" sub={`${data.sales.invoiceCount} invoices`} to="/invoices">
          <Money value={data.sales.billed} colored={false} className="text-slate-700" />
        </Stat>
        <Stat title="Collected" sub="payments received" to="/invoices">
          <Money value={data.sales.collected} colored={false} className="text-give" />
        </Stat>
        <Stat title="Customers" sub="total" to="/customers">
          <span className="text-2xl font-bold text-slate-800">{data.parties.customers}</span>
        </Stat>
        <Stat title="Suppliers" sub="total" to="/suppliers">
          <span className="text-2xl font-bold text-slate-800">{data.parties.suppliers}</span>
        </Stat>
      </div>

      <div className="card mt-8">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">Recent Transactions</h3>
        </div>
        {data.recentTransactions.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            No transactions yet — open a customer khata and add your first entry.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100">
                <th className="px-6 py-3 font-semibold">Party</th>
                <th className="py-3 font-semibold">Date</th>
                <th className="py-3 font-semibold">Details</th>
                <th className="text-right px-6 py-3 font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.recentTransactions.map((t) => (
                <tr key={t.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition">
                  <td className="px-6 py-3 font-medium text-slate-700">{t.party?.name}</td>
                  <td className="py-3 text-slate-500">{fmtDateTime(t.entryDate)}</td>
                  <td className="py-3 text-slate-400">{t.description || '—'}</td>
                  <td className={`text-right px-6 py-3 font-semibold ${t.type === 'GAVE' ? 'text-get' : 'text-give'}`}>
                    {t.type === 'GAVE' ? '− ' : '+ '}<Money value={t.amount} colored={false} className={t.type === 'GAVE' ? 'text-get' : 'text-give'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

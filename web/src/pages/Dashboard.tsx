import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { api, apiMessage, isForbidden } from '../api/client';
import type { DashboardData } from '../types';
import { LockedState, Money, Spinner, fmtDateTime, useToast } from '../components/ui';

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
  const { t } = useLanguage();
  const toast = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    if (!business) return;
    setData(null);
    setForbidden(false);
    api.get(`/businesses/${business.id}/reports/dashboard`)
      .then((r) => setData(r.data.data))
      .catch((e) => {
        if (isForbidden(e)) setForbidden(true);
        else toast(apiMessage(e), 'error');
      });
  }, [business]);

  if (forbidden) return <LockedState />;
  if (!data) return <Spinner />;

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">{t('dashboard.greeting', { name: user?.name?.split(' ')[0] || '' })}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('dashboard.subtitle', { business: business?.name || '' })}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat title={t('dashboard.youWillGet')} sub={t('dashboard.youWillGetSub')} to="/customers">
          <Money value={data.ledger.youWillGet} colored={false} className="text-give" />
        </Stat>
        <Stat title={t('dashboard.youWillGive')} sub={t('dashboard.youWillGiveSub')} to="/suppliers">
          <Money value={data.ledger.youWillGive} colored={false} className="text-get" />
        </Stat>
        <Stat title={t('dashboard.cashIn')} sub={t('dashboard.cashOutSub', { amount: data.cash.out.toLocaleString('en-IN') })} to="/cashbook">
          <Money value={data.cash.in} colored={false} className="text-give" />
        </Stat>
        <Stat title={t('dashboard.expenses')} sub={t('dashboard.expensesSub')} to="/expenses">
          <Money value={data.expenses} colored={false} className="text-slate-700" />
        </Stat>
        <Stat title={t('dashboard.salesBilled')} sub={t('dashboard.invoiceCountSub', { count: data.sales.invoiceCount })} to="/invoices">
          <Money value={data.sales.billed} colored={false} className="text-slate-700" />
        </Stat>
        <Stat title={t('dashboard.collected')} sub={t('dashboard.collectedSub')} to="/invoices">
          <Money value={data.sales.collected} colored={false} className="text-give" />
        </Stat>
        <Stat title={t('dashboard.customers')} sub={t('dashboard.totalSub')} to="/customers">
          <span className="text-2xl font-bold text-slate-800">{data.parties.customers}</span>
        </Stat>
        <Stat title={t('dashboard.suppliers')} sub={t('dashboard.totalSub')} to="/suppliers">
          <span className="text-2xl font-bold text-slate-800">{data.parties.suppliers}</span>
        </Stat>
      </div>

      <div className="card mt-8">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">{t('dashboard.recentTransactions')}</h3>
        </div>
        {data.recentTransactions.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            {t('dashboard.noTransactions')}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100">
                <th className="px-6 py-3 font-semibold">{t('dashboard.party')}</th>
                <th className="py-3 font-semibold">{t('dashboard.date')}</th>
                <th className="py-3 font-semibold">{t('dashboard.details')}</th>
                <th className="text-right px-6 py-3 font-semibold">{t('dashboard.amount')}</th>
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

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import type { ActivityLog } from '../types';
import { EmptyState, Spinner, fmtDateTime } from '../components/ui';

const ACTION_LABELS: Record<string, string> = {
  TRANSACTION_CREATED: '➕ added an entry',
  TRANSACTION_UPDATED: '✏️ edited an entry',
  TRANSACTION_DELETED: '🗑 deleted an entry',
  PARTY_CREATED: '👤 added a party',
  PARTY_UPDATED: '👤 updated a party',
  PARTY_DELETED: '👤 deleted a party',
  INVOICE_CREATED: '🧮 created an invoice',
  PAYMENT_RECORDED: '💰 collected a payment',
  EXPENSE_CREATED: '🧾 added an expense',
  CASHBOOK_ENTRY_CREATED: '📔 added a cashbook entry',
  STAFF_ADDED: '🧑‍💼 added staff',
  REMINDER_SENT: '🔔 sent a reminder',
};

export default function Activity() {
  const { business } = useAuth();
  const [rows, setRows] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    const res = await api.get(`/businesses/${business.id}/activity`, { params: { limit: 100 } });
    setRows(res.data.data);
    setLoading(false);
  }, [business]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-bold mb-4">Activity Log</h1>
      <div className="card">
        {loading ? <Spinner /> : rows.length === 0 ? (
          <EmptyState icon="🕘" title="No activity yet" subtitle="Every entry, edit and delete made by you or your staff shows up here." />
        ) : (
          <ul className="divide-y divide-slate-50">
            {rows.map((l) => (
              <li key={l.id} className="px-5 py-3 flex items-center gap-4 text-sm">
                <div className="flex-1">
                  <p>
                    <span className="font-semibold">{l.user?.name || 'System'}</span>{' '}
                    {ACTION_LABELS[l.action] || l.action.toLowerCase().replaceAll('_', ' ')}
                  </p>
                  {l.meta ? <p className="text-xs text-slate-400">{JSON.stringify(l.meta)}</p> : null}
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap">{fmtDateTime(l.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

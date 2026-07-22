import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../api/client';
import type { ActivityLog } from '../types';
import type { TranslationKey } from '../i18n';
import { EmptyState, Spinner, fmtDateTime } from '../components/ui';

const ACTION_KEYS: Record<string, TranslationKey> = {
  TRANSACTION_CREATED: 'activity.actionTransactionCreated',
  TRANSACTION_UPDATED: 'activity.actionTransactionUpdated',
  TRANSACTION_DELETED: 'activity.actionTransactionDeleted',
  PARTY_CREATED: 'activity.actionPartyCreated',
  PARTY_UPDATED: 'activity.actionPartyUpdated',
  PARTY_DELETED: 'activity.actionPartyDeleted',
  INVOICE_CREATED: 'activity.actionInvoiceCreated',
  PAYMENT_RECORDED: 'activity.actionPaymentRecorded',
  EXPENSE_CREATED: 'activity.actionExpenseCreated',
  CASHBOOK_ENTRY_CREATED: 'activity.actionCashbookEntryCreated',
  STAFF_ADDED: 'activity.actionStaffAdded',
  REMINDER_SENT: 'activity.actionReminderSent',
};

export default function Activity() {
  const { business } = useAuth();
  const { t } = useLanguage();
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
      <h1 className="text-xl font-bold mb-4">{t('activity.title')}</h1>
      <div className="card">
        {loading ? <Spinner /> : rows.length === 0 ? (
          <EmptyState icon="🕘" title={t('activity.noActivityTitle')} subtitle={t('activity.noActivitySubtitle')} />
        ) : (
          <ul className="divide-y divide-slate-50">
            {rows.map((l) => (
              <li key={l.id} className="px-5 py-3 flex items-center gap-4 text-sm">
                <div className="flex-1">
                  <p>
                    <span className="font-semibold">{l.user?.name || t('activity.system')}</span>{' '}
                    {ACTION_KEYS[l.action] ? t(ACTION_KEYS[l.action]) : l.action.toLowerCase().replaceAll('_', ' ')}
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

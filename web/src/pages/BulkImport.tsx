import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { api, apiMessage } from '../api/client';
import type { PartyType } from '../types';

const SAMPLE_ROWS = [
  { 'Name*': 'Ramesh Kumar', 'Phone Number': '9876543210', 'Email': 'ramesh@example.com', 'GSTIN': '', 'Address': '12, Main Street', 'Area': 'T Nagar', 'City': 'Chennai', 'State': 'Tamil Nadu', 'Pincode': '600017' },
  { 'Name*': 'Priya Traders', 'Phone Number': '9123456780', 'Email': '', 'GSTIN': '33ABCDE1234F1Z5', 'Address': '', 'Area': '', 'City': 'Coimbatore', 'State': 'Tamil Nadu', 'Pincode': '' },
];

interface ParsedParty {
  name: string; phone?: string; email?: string; gstin?: string;
  addressLine?: string; area?: string; city?: string; state?: string; pincode?: string;
}
interface RowError { row: number; reason: string }

type UploadState =
  | { phase: 'idle' }
  | { phase: 'parsing'; fileName: string }
  | { phase: 'review'; fileName: string; parties: ParsedParty[]; errors: RowError[] }
  | { phase: 'uploading'; fileName: string }
  | { phase: 'done'; fileName: string; created: number; errors: RowError[] }
  | { phase: 'failed'; fileName: string; message: string };

const str = (v: unknown) => (v == null ? '' : String(v).trim());

export default function BulkImport({ type = 'CUSTOMER' as PartyType }: { type?: PartyType }) {
  const { business } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ phase: 'idle' });
  const isCustomer = type === 'CUSTOMER';
  const labelSingular = t(isCustomer ? 'bulkImport.customerSingular' : 'bulkImport.supplierSingular');
  const labelPlural = t(isCustomer ? 'bulkImport.customerPlural' : 'bulkImport.supplierPlural');
  const labelFor = (count: number) => (count === 1 ? labelSingular : labelPlural);

  const downloadSample = () => {
    const ws = XLSX.utils.json_to_sheet(SAMPLE_ROWS);
    ws['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 22 }, { wch: 18 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Parties');
    XLSX.writeFile(wb, `bizkhata-${labelSingular}s-sample.xlsx`);
  };

  const parseFile = async (file: File) => {
    setState({ phase: 'parsing', fileName: file.name });
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      if (!rows.length) {
        setState({ phase: 'failed', fileName: file.name, message: t('bulkImport.emptySheet') });
        return;
      }
      // Tolerant header lookup: "Name*", "name", "Customer Name" all work
      const pick = (row: Record<string, unknown>, ...keys: string[]) => {
        for (const k of Object.keys(row)) {
          const norm = k.toLowerCase().replace(/[^a-z]/g, '');
          if (keys.some((want) => norm.includes(want))) return str(row[k]);
        }
        return '';
      };
      const parties: ParsedParty[] = [];
      const errors: RowError[] = [];
      rows.forEach((row, i) => {
        const rowNo = i + 2; // 1-based + header row
        const name = pick(row, 'name');
        const phone = pick(row, 'phone', 'mobile');
        if (!name) { errors.push({ row: rowNo, reason: t('bulkImport.nameMissing') }); return; }
        if (name.length > 120) { errors.push({ row: rowNo, reason: t('bulkImport.nameTooLong') }); return; }
        if (phone && phone.replace(/[\s+-]/g, '').length > 20) { errors.push({ row: rowNo, reason: t('bulkImport.phoneTooLong') }); return; }
        const email = pick(row, 'email');
        const p: ParsedParty = { name };
        if (phone) p.phone = phone;
        if (email && /^\S+@\S+\.\S+$/.test(email)) p.email = email;
        const gstin = pick(row, 'gstin'); if (gstin) p.gstin = gstin.slice(0, 20);
        const addressLine = pick(row, 'address'); if (addressLine) p.addressLine = addressLine.slice(0, 200);
        const area = pick(row, 'area', 'locality'); if (area) p.area = area.slice(0, 100);
        const city = pick(row, 'city'); if (city) p.city = city.slice(0, 80);
        const st = pick(row, 'state'); if (st) p.state = st.slice(0, 80);
        const pincode = pick(row, 'pincode', 'pin'); if (pincode) p.pincode = pincode.slice(0, 10);
        parties.push(p);
      });
      if (!parties.length) {
        setState({ phase: 'failed', fileName: file.name, message: t('bulkImport.noValidRows') });
        return;
      }
      setState({ phase: 'review', fileName: file.name, parties, errors });
    } catch {
      setState({ phase: 'failed', fileName: file.name, message: t('bulkImport.couldNotRead') });
    }
  };

  const upload = async () => {
    if (state.phase !== 'review' || !business) return;
    const { fileName, parties, errors } = state;
    setState({ phase: 'uploading', fileName });
    try {
      let created = 0;
      for (let i = 0; i < parties.length; i += 500) {
        const chunk = parties.slice(i, i + 500).map((p) => ({ ...p, type }));
        const res = await api.post(`/businesses/${business.id}/parties/bulk`, { parties: chunk });
        created += res.data.data.created ?? chunk.length;
      }
      setState({ phase: 'done', fileName, created, errors });
    } catch (e) {
      setState({ phase: 'failed', fileName, message: apiMessage(e) });
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = '';
  };

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center gap-3 mb-6">
        <button className="text-2xl text-slate-500 hover:text-slate-800" onClick={() => navigate(-1)} title={t('bulkImport.back')}>←</button>
        <h1 className="text-2xl font-bold text-slate-800">{t('bulkImport.title')}</h1>
      </div>

      {/* ── 3 simple steps ── */}
      <div className="card p-6 mb-6">
        <p className="font-semibold text-slate-800 mb-5">{t('bulkImport.stepsHeading', { label: labelPlural })}</p>
        <div className="grid md:grid-cols-3 gap-8">
          <div>
            <p className="text-sm font-bold mb-2 border-b border-slate-200 pb-2">{t('bulkImport.step1')}</p>
            <div className="flex items-start gap-3">
              <span className="text-3xl">📄</span>
              <p className="text-sm text-slate-600">
                <button className="text-brand-600 font-semibold hover:underline" onClick={downloadSample}>{t('bulkImport.download')}</button>{' '}
                {t('bulkImport.sampleFormat')}
              </p>
            </div>
          </div>
          <div>
            <p className="text-sm font-bold mb-2 border-b border-slate-200 pb-2">{t('bulkImport.step2')}</p>
            <div className="flex items-start gap-3">
              <span className="text-3xl">📄</span>
              <p className="text-sm text-slate-600">
                {t('bulkImport.fillDetails1', { label: labelSingular })} <b>{t('bulkImport.tableName')}</b> {t('bulkImport.fillDetails2')}
              </p>
            </div>
          </div>
          <div>
            <p className="text-sm font-bold mb-2 border-b border-slate-200 pb-2">{t('bulkImport.step3')}</p>
            <p className="text-sm text-slate-600">
              {t('bulkImport.step3Body1')} <b>“{t('bulkImport.uploadExcelSheet')}”</b> {t('bulkImport.step3Body2')}
            </p>
          </div>
        </div>
      </div>

      {/* ── Bulk upload status ── */}
      <div className="card p-6">
        <p className="font-semibold text-slate-800 mb-6">{t('bulkImport.statusHeading')}</p>

        {state.phase === 'idle' && (
          <div className="flex flex-col items-center py-10">
            <span className="text-6xl mb-4">🗂️</span>
            <p className="font-bold text-lg text-slate-800 mb-4">{t('bulkImport.noFileAdded')}</p>
            <button className="btn-primary" onClick={() => fileRef.current?.click()}>{t('bulkImport.uploadButton')}</button>
          </div>
        )}

        {(state.phase === 'parsing' || state.phase === 'uploading') && (
          <div className="flex flex-col items-center py-10">
            <span className="text-6xl mb-4 animate-pulse">⏳</span>
            <p className="font-semibold text-slate-600">
              {state.phase === 'parsing' ? t('bulkImport.reading') : t('bulkImport.uploading')} <b>{state.fileName}</b>…
            </p>
          </div>
        )}

        {state.phase === 'review' && (
          <div>
            <p className="text-sm text-slate-600 mb-3">
              <b>{state.fileName}</b> — {t('bulkImport.foundValid', { count: state.parties.length, label: labelFor(state.parties.length) })}
              {state.errors.length > 0 && <span className="text-amber-600">{t('bulkImport.rowsWillBeSkipped', { count: state.errors.length })}</span>}
            </p>
            {state.errors.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 max-h-36 overflow-y-auto">
                {state.errors.map((er) => (
                  <p key={er.row} className="text-xs text-amber-700">{t('bulkImport.rowError', { row: er.row, reason: er.reason })}</p>
                ))}
              </div>
            )}
            <div className="border border-slate-200 rounded-lg overflow-hidden mb-4 max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-left text-xs text-slate-400 uppercase">
                    <th className="px-4 py-2">{t('bulkImport.tableName')}</th><th>{t('bulkImport.tablePhone')}</th><th>{t('bulkImport.tableCity')}</th><th className="px-4">{t('bulkImport.tableGstin')}</th>
                  </tr>
                </thead>
                <tbody>
                  {state.parties.slice(0, 50).map((p, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-medium">{p.name}</td>
                      <td>{p.phone || '—'}</td>
                      <td>{p.city || '—'}</td>
                      <td className="px-4">{p.gstin || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {state.parties.length > 50 && (
                <p className="text-xs text-slate-400 px-4 py-2">{t('bulkImport.andMore', { count: state.parties.length - 50 })}</p>
              )}
            </div>
            <div className="flex gap-3">
              <button className="btn-primary" onClick={upload}>{t('bulkImport.confirmImport', { count: state.parties.length, label: labelFor(state.parties.length) })}</button>
              <button className="btn-outline" onClick={() => setState({ phase: 'idle' })}>{t('bulkImport.cancel')}</button>
            </div>
          </div>
        )}

        {state.phase === 'done' && (
          <div className="flex flex-col items-center py-10">
            <span className="text-6xl mb-4">✅</span>
            <p className="font-bold text-lg text-slate-800 mb-1">{t('bulkImport.importedSuccess', { count: state.created, label: labelFor(state.created) })}</p>
            {state.errors.length > 0 && (
              <p className="text-sm text-amber-600 mb-2">{t('bulkImport.rowsSkippedInvalid', { count: state.errors.length })}</p>
            )}
            <div className="flex gap-3 mt-3">
              <button className="btn-primary" onClick={() => navigate(isCustomer ? '/customers' : '/suppliers')}>
                {t('bulkImport.viewLabel', { label: labelPlural })}
              </button>
              <button className="btn-outline" onClick={() => setState({ phase: 'idle' })}>{t('bulkImport.uploadAnother')}</button>
            </div>
          </div>
        )}

        {state.phase === 'failed' && (
          <div className="flex flex-col items-center py-10">
            <span className="text-6xl mb-4">⚠️</span>
            <p className="font-bold text-lg text-slate-800 mb-1">{t('bulkImport.uploadFailed')}</p>
            <p className="text-sm text-red-600 mb-4">{state.message}</p>
            <button className="btn-primary" onClick={() => fileRef.current?.click()}>{t('bulkImport.tryAgain')}</button>
          </div>
        )}

        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFile} />
      </div>
    </div>
  );
}

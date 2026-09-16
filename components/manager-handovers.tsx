'use client';
import {useEffect, useState} from 'react';
import {CalendarDays, FileHeart, Hospital, LoaderCircle, RefreshCw, UserRound} from 'lucide-react';
import {apiFetch} from '@/lib/api-client';
import {Button} from '@/components/ui/button';
import {EcgViewer} from '@/components/ecg-viewer';
import type {Language} from '@/lib/ecg/schema';

type Handover = {
  id: string; center_name: string; created_at: string;
  created_by: {email: string; display_name: string};
  patient: {patientId?: string; clinicianFinding?: string; gptSummary?: string;
    patient?: {age?: number; systolic?: number; diastolic?: number; pulse?: number; spo2?: number; notes?: string}};
};
export function ManagerHandovers({lang}: {lang: Language}) {
  const [rows, setRows] = useState<Handover[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [ecgPath, setEcgPath] = useState<string | null>(null);
  const tr = (en: string, ru: string, uz: string) => lang === 'ru' ? ru : lang === 'uz' ? uz : en;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(false);
    apiFetch('/handovers', {signal: controller.signal}).then(async r => {
      if (!r.ok) throw new Error('load_failed');
      return (await r.json()).handovers as Handover[];
    }).then(data => {if (!controller.signal.aborted) setRows(data);})
      .catch(() => {if (!controller.signal.aborted) setError(true);})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [revision]);
  return <section className="content-card manager-handovers">
    <div className="history-heading"><div><h2>{tr('Incoming handovers', 'Входящие передачи', 'Келган топширувлар')}</h2><p>{tr('Patients sent to your center.', 'Пациенты, направленные в ваш центр.', 'Марказингизга юборилган беморлар.')}</p></div><Button variant="outline" disabled={loading} onClick={() => setRevision(v => v + 1)}><RefreshCw size={16}/>{tr('Refresh', 'Обновить', 'Янгилаш')}</Button></div>
    {loading ? <div className="center-loading" role="status"><LoaderCircle className="animate-spin"/>{tr('Loading handovers…', 'Загрузка передач…', 'Топширувлар юкланмоқда…')}</div> : error ? <p role="alert">{tr('Unable to load handovers. Please refresh.', 'Не удалось загрузить передачи. Нажмите «Обновить».', 'Топширувлар юкланмади. Янгилашни босинг.')}</p> : !rows.length ? <div className="center-empty"><FileHeart size={28}/><h3>{tr('No handovers yet', 'Передач пока нет', 'Ҳали топширувлар йўқ')}</h3><p>{tr('New handovers will appear here after a doctor sends a patient to your center.', 'Передачи появятся здесь после отправки пациента врачом в ваш центр.', 'Шифокор беморни марказингизга юборгач, топширувлар шу ерда кўринади.')}</p></div> : <div className="history-grid">{rows.map(row => {
      const patient = row.patient.patient || {};
      return <article className="history-card handover-card" key={row.id}>
        <div className="history-patient"><UserRound size={22}/><h3>{row.patient.patientId || tr('Name not specified', 'ФИО не указано', 'Исм киритилмаган')}</h3></div>
        <p className="handover-center"><Hospital size={16}/>{row.center_name}</p>
        <dl className="handover-metadata"><div><dt><CalendarDays size={15}/>{tr('Created at', 'Дата создания', 'Яратилган вақт')}</dt><dd><time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString(lang === 'uz' ? 'uz-Cyrl' : lang)}</time></dd></div><div><dt><UserRound size={15}/>{tr('Created by', 'Создал', 'Яратган')}</dt><dd>{row.created_by.display_name}{row.created_by.display_name !== row.created_by.email && <small>{row.created_by.email}</small>}</dd></div></dl>
        <div className="history-vitals"><span>{tr('Age', 'Возраст', 'Ёш')}: <b>{patient.age ?? '—'}</b></span><span>{tr('BP', 'АД', 'ҚБ')}: <b>{patient.systolic ?? '—'}/{patient.diastolic ?? '—'}</b></span><span>{tr('Pulse', 'Пульс', 'Пульс')}: <b>{patient.pulse ?? '—'}</b></span><span>SpO₂: <b>{patient.spo2 ?? '—'}%</b></span></div>
        {patient.notes && <p className="handover-notes">{patient.notes}</p>}
        {(row.patient.gptSummary || row.patient.clinicianFinding) && <p className="handover-notes">{row.patient.gptSummary || row.patient.clinicianFinding}</p>}
        <Button variant="outline" onClick={() => setEcgPath(`/handovers/${row.id}/ecg`)}><FileHeart size={17}/>{tr('Open ECG', 'Открыть ЭКГ', 'ЭКГни очиш')}</Button>
      </article>;
    })}</div>}
    <EcgViewer path={ecgPath} lang={lang} onClose={() => setEcgPath(null)}/>
  </section>;
}

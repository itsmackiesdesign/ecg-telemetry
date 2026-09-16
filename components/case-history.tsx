'use client';
import {useEffect,useState} from 'react';
import {apiFetch,openEcg} from '@/lib/api-client';
import {Button} from '@/components/ui/button';
import {AiResult} from '@/components/ecg-ai';
import {analysisSchema} from '@/lib/ecg/schema';
export function CaseHistory({lang}:{lang:string}){
 const [rows,setRows]=useState<any[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 function load(){setLoading(true);setError('');apiFetch('/assessments').then(async r=>{const b:any=await r.json();if(!r.ok)throw Error(b.error);return b.assessments}).then(setRows).catch(()=>setError(lang==='ru'?'Не удалось загрузить историю':'Unable to load history')).finally(()=>setLoading(false))}
 useEffect(load,[]);
 return <section className="content-card"><h2>{lang==='ru'?'История случаев':'Case history'}</h2><Button variant="outline" onClick={load}>↻</Button>{loading?<p>…</p>:error?<p role="alert">{error}</p>:!rows.length?<p>{lang==='ru'?'Сохранённых оценок пока нет. GPT-анализ сохраняется автоматически; для оценки врача нажмите «Сохранить оценку».':'No saved cases yet. GPT analyses save automatically; use Save assessment for clinician assessments.'}</p>:rows.map(r=><details key={r.id} className="content-card"><summary>{r.patient_id||r.id.slice(0,8)} · {new Date(r.created_at).toLocaleString()} · {r.finding}</summary><p>{lang==='ru'?'Возраст':'Age'}: {r.patient.age} · BP: {r.patient.systolic||r.patient.sys}/{r.patient.diastolic||r.patient.dia} · SpO₂: {r.patient.spo2||r.patient.spo}</p><p>{r.patient.notes}</p>{r.ecg_path&&<Button onClick={()=>openEcg(`/ecg/files/${r.ecg_path}`).catch(()=>setError('Unable to open ECG'))}>ECG ↗</Button>}{r.ai_result&&analysisSchema.safeParse(r.ai_result.analysis).success&&<AiResult result={r.ai_result} lang={lang as 'ru'|'uz'|'en'}/>}</details>)}</section>
}

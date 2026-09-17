'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {apiFetch} from '@/lib/api-client';
export function SaveAssessment({patient,finding,ai,file,lang}:{patient:Record<string,unknown>;finding:string;ai:any;file:File|null;lang:string}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[id,setId]=useState<string|null>(null);
 async function save(){setBusy(true);setMessage('');try{
  let key=ai?.ecg_path;
  if(file&&!key){const form=new FormData();form.set('image',file);const r=await apiFetch('/ecg/upload',{method:'POST',body:form});const b:any=await r.json();if(!r.ok)throw Error(b.error);key=b.object_key;}
  const r=await apiFetch('/assessments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id||ai?.assessment_id||undefined,patient_id:patient.id||'',patient,finding,ai_result:ai,ecg_path:key})});const b:any=await r.json();if(!r.ok)throw Error(b.error);setId(b.id);setMessage(lang==='ru'?'Сохранено в истории':'Saved to case history');
 }catch{setMessage(lang==='ru'?'Не удалось сохранить. Повторите запрос.':'Could not save. Please retry.')}finally{setBusy(false)}}
 return <div className="inline-actions"><Button onClick={save} disabled={busy}>{busy?'…':lang==='ru'?'Сохранить оценку':lang==='uz'?'Баҳолашни сақлаш':'Save assessment'}</Button><span role="status">{message|| (ai?.assessment_id ? (lang==='ru'?'ИИ-анализ сохранён автоматически':'AI analysis saved automatically'):'')}</span></div>
}

'use client';
import {apiFetch,openEcg} from "@/lib/api-client";
import {CoronaryState} from '@/components/coronary-state';
import {useEffect,useRef,useState} from 'react';
import {Sparkles,LoaderCircle,ShieldCheck,CircleAlert,Check,ArrowRight} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {Accordion,AccordionContent,AccordionItem,AccordionTrigger} from '@/components/ui/accordion';
import {analysisSchema,type AnalysisEnvelope,type ClinicalContext,type Language} from '@/lib/ecg/schema';
const local=(lang:Language,en:string,uz:string,ru:string)=>lang==='uz'?uz:lang==='ru'?ru:en;
export function useEcgAnalysis(file:File|null,patient:ClinicalContext['patient'],lang:Language){
 const [result,setResult]=useState<AnalysisEnvelope|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[consent,setConsent]=useState(false);
 const [service,setService]=useState<{configured:boolean;signed_in:boolean}|null>(null);
 const controller=useRef<AbortController|null>(null),generation=useRef(0);
 const fingerprint=JSON.stringify({patient,lang});
 const reset=()=>{generation.current++;controller.current?.abort();setResult(null);setError('');setBusy(false);setConsent(false)};
 useEffect(()=>{reset();return()=>{generation.current++;controller.current?.abort()}},[file,fingerprint]);
 useEffect(()=>{const abort=new AbortController();apiFetch('/ecg/status',{cache:'no-store',signal:abort.signal}).then(r=>r.ok?r.json():null).then(value=>{if(value&&typeof value==='object'&&'configured' in value&&'signed_in' in value&&typeof value.configured==='boolean'&&typeof value.signed_in==='boolean')setService({configured:value.configured,signed_in:value.signed_in})}).catch(()=>{});return()=>abort.abort()},[]);
 async function analyze(){
  if(!file||!consent||busy)return;
  if(file.size>5*1024*1024){setError('file_too_large');return}
  if(!navigator.onLine){setError('offline');return}
  if(service?.configured===false){setError('not_configured');return}
  controller.current?.abort();const abort=new AbortController();controller.current=abort;const version=++generation.current;
  setBusy(true);setError('');setResult(null);
  const deadline=setTimeout(()=>abort.abort(),100000);
  try{
   const form=new FormData();form.set('image',file,'ecg.'+(file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg'));form.set('context',JSON.stringify({language:lang,patient,consent:true}));
   const response=await apiFetch('/ecg/analyze',{method:'POST',body:form,signal:abort.signal,cache:'no-store'});
   let body:Record<string,unknown>;try{body=await response.json()}catch{throw new Error('invalid_response')}
   if(!response.ok)throw new Error(typeof body.error==='string'?body.error:'provider_unavailable');
   const parsed=analysisSchema.safeParse(body.analysis);
   if(!parsed.success||typeof body.model!=='string'||typeof body.prompt_version!=='string'||typeof body.analyzed_at!=='string'||!Array.isArray(body.guardrails)||!body.guardrails.every(x=>typeof x==='string'))throw new Error('invalid_response');
   if(generation.current===version)setResult({...body,analysis:parsed.data} as AnalysisEnvelope);
  }catch(error){if(generation.current===version)setError(abort.signal.aborted?'timeout':error instanceof Error?error.message:'provider_unavailable')}
  finally{clearTimeout(deadline);if(generation.current===version)setBusy(false)}
 }
 function cancel(){generation.current++;controller.current?.abort();setBusy(false);setError('cancelled')}
 return {result,error,busy,consent,setConsent,service,analyze,cancel,reset};
}
export function AiControls({ai,lang,onReview}:{ai:ReturnType<typeof useEcgAnalysis>;lang:Language;onReview:()=>void}){
 const tr=(en:string,uz:string,ru:string)=>local(lang,en,uz,ru);
 const errors:Record<string,string>={
  not_configured:tr('The administrator needs to configure the server API key. No analysis was performed.','Сервер API калитини созлаш керак. Таҳлил бажарилмади.','Администратору нужно настроить API-ключ на сервере. Анализ не выполнен.'),
  sign_in_required:tr('Sign in to request an analysis.','Таҳлил учун тизимга киринг.','Войдите, чтобы выполнить анализ.'),
  offline:tr('GPT analysis requires internet access. Offline clinician assessment remains available.','GPT таҳлили учун интернет керак. Шифокор баҳолаши офлайн мавжуд.','Для GPT-анализа нужен интернет. Оценка врачом доступна офлайн.'),
  timeout:tr('Analysis timed out. Retry or continue with clinician review.','Таҳлил вақти тугади. Қайта урининг ёки шифокор баҳолашига ўтинг.','Время ожидания истекло. Повторите запрос или продолжите оценку врачом.'),
  cancelled:tr('Analysis cancelled. No result is available.','Таҳлил бекор қилинди. Натижа йўқ.','Анализ отменён. Результата нет.'),
  model_refusal:tr('The model could not provide an interpretation. Request clinician review.','Модель талқин бермади. Шифокор кўриги керак.','Модель не предоставила интерпретацию. Нужна проверка врачом.'),
  invalid_response:tr('The model response failed validation. It has not been used as an assessment.','Модель жавоби текширувдан ўтмади. Баҳолашда ишлатилмади.','Ответ модели не прошёл проверку. Он не использован для оценки.'),
  incomplete_response:tr('The model returned an incomplete response. No assessment is available.','Модель жавоби тўлиқ эмас. Баҳолаш йўқ.','Модель вернула неполный ответ. Оценка недоступна.'),
  invalid_input:tr('Check patient age, vital signs and clinical notes before retrying.','Ёш, ҳаётий кўрсаткичлар ва изоҳларни текширинг.','Проверьте возраст, жизненные показатели и клинические заметки.'),
  invalid_image:tr('Use a valid JPEG, PNG or WebP ECG image.','Тўғри JPEG, PNG ёки WebP тасвир танланг.','Выберите корректное изображение ЭКГ в JPEG, PNG или WebP.'),
  file_too_large:tr('GPT analysis accepts images up to 5 MB. Larger images remain available for clinician review.','GPT таҳлили 5 МБгача тасвир қабул қилади. Катта тасвирни шифокор кўриши мумкин.','Для GPT-анализа — изображения до 5 МБ. Более крупные доступны для просмотра врачом.'),
  rate_limited:tr('The analysis service has reached its limit. Try again later.','Таҳлил хизмати лимитига етилди. Кейинроқ урининг.','Достигнут лимит сервиса анализа. Повторите позже.'),
  request_in_progress:tr('An analysis is already running. Wait for it to finish.','Таҳлил бажарилмоқда. Тугашини кутинг.','Анализ уже выполняется. Дождитесь завершения.'),
  provider_configuration:tr('The server API credentials or model access need attention.','Сервер API калити ёки модель рухсатини текшириш керак.','Нужно проверить API-ключ или доступ сервера к модели.'),
 };
 return <div className="ai-panel"><div className="ai-panel-title"><Sparkles size={20}/><div><h3>{tr('Analyze with GPT','GPT билан таҳлил','Анализ с GPT')}</h3><p>{tr('Preliminary interpretation · physician review required','Дастлабки талқин · шифокор тасдиғи зарур','Предварительная интерпретация · требуется проверка врача')}</p></div></div>
 <label className="ai-consent"><Checkbox disabled={ai.busy} checked={ai.consent} onCheckedChange={v=>ai.setConsent(v===true)}/><span>{tr('I authorize sending this ECG image, age, sex, symptoms, vital signs and notes to OpenAI for analysis. I have removed identifying information from the image and notes.','ЭКГ тасвири, ёш, жинс, симптомлар, кўрсаткичлар ва изоҳларни OpenAIга таҳлил учун юборишга рухсат бераман. Тасвир ва изоҳлардан шахсий маълумотларни олиб ташладим.','Разрешаю передать изображение ЭКГ, возраст, пол, симптомы, показатели и заметки в OpenAI для анализа. Я удалил идентифицирующие сведения из изображения и заметок.')}</span></label>
 <p className="ai-privacy">{tr('Up to 5 MB for GPT analysis. No automatic upload. Patient ID is excluded. The image and validated result are saved to your case history; OpenAI retention rules still apply.','GPT таҳлили учун 5 МБгача. Автоматик юклаш йўқ. Бемор IDси юборилмайди. Тасвир ва тасдиқланган жавоб ҳолатлар тарихида сақланади; OpenAI сақлаш қоидалари амал қилади.','Для GPT-анализа — до 5 МБ. Автоматической отправки нет. ID пациента не передаётся. Изображение и проверенный ответ сохраняются в вашей истории; действуют правила хранения OpenAI.')}</p>
 {ai.service?.configured===false&&<p className="ai-setup">{errors.not_configured}</p>}
 <div className="ai-actions"><Button disabled={!ai.consent||ai.busy} onClick={ai.analyze}>{ai.busy?<LoaderCircle className="animate-spin"/>:<Sparkles/>}{ai.busy?tr('Analyzing ECG…','ЭКГ таҳлил қилинмоқда…','Анализ ЭКГ…'):tr('Analyze ECG','ЭКГни таҳлил қилиш','Анализировать ЭКГ')}</Button>{ai.busy&&<Button variant="outline" onClick={ai.cancel}>{tr('Cancel','Бекор қилиш','Отменить')}</Button>}</div>
 {ai.busy&&<p role="status" className="ai-privacy">{tr('Checking image quality and ECG findings. Do not delay urgent care.','Тасвир сифати ва ЭКГ текширилмоқда. Шошилинч ёрдамни кечиктирманг.','Проверяем качество изображения и признаки на ЭКГ. Не задерживайте неотложную помощь.')}</p>}
 {ai.error&&<div role="alert" className="ai-error"><CircleAlert size={18}/><div>{errors[ai.error]||tr('Analysis is unavailable. No result has been generated.','Таҳлил мавжуд эмас. Натижа яратилмади.','Анализ недоступен. Результат не сформирован.')}{ai.error==='sign_in_required'&&<a href="/signin-with-chatgpt?return_to=%2F" target="_top">{tr('Sign in','Кириш','Войти')}</a>}</div></div>}
 {ai.result&&<div className="ai-success"><Check size={18}/><span>{tr('Response received. Review the findings and limitations.','Жавоб олинди. Натижалар ва чекловларни текширинг.','Ответ получен. Проверьте находки и ограничения.')}</span><Button variant="outline" onClick={onReview}>{tr('View result','Натижа','Результат')}<ArrowRight size={14}/></Button></div>}
 </div>
}
const revealedResults=new WeakSet<object>();
export function AiResult({result,lang,reveal=false}:{result:AnalysisEnvelope;lang:Language;reveal?:boolean}){
 const [animateReveal]=useState(()=>reveal&&!revealedResults.has(result));
 useEffect(()=>{if(reveal)revealedResults.add(result)},[result,reveal]);
 const tr=(en:string,uz:string,ru:string)=>local(lang,en,uz,ru);const a=result.analysis;
 const title={emergency_review:tr('Emergency physician review','Шошилинч шифокор кўриги','Экстренная проверка врачом'),urgent_review:tr('Urgent physician review','Тезкор шифокор кўриги','Срочная проверка врачом'),no_acute_ecg_features_identified:tr('No acute ECG features identified','Ўткир ЭКГ белгилари аниқланмади','Острых ЭКГ-признаков не выявлено'),indeterminate:tr('Unable to determine','Аниқлаб бўлмади','Недостаточно данных для оценки')}[a.review_priority];
 const quality={adequate:tr('Readable','Ўқиш мумкин','Читаемая'),limited:tr('Limited','Чекланган','Ограниченная'),uninterpretable:tr('Uninterpretable','Ўқиб бўлмайди','Неинтерпретируемая')}[a.image_quality.status];
 const reasons:Record<string,string>={low_risk_not_supported:tr('Available data do not support a low-risk assessment; ischemia has not been established by this check.','Маълумотлар паст хавфни тасдиқламайди; бу текширув ишемияни аниқламайди.','Данных недостаточно для низкого риска; эта проверка сама по себе не устанавливает ишемию.'),incomplete_recording:tr('A complete calibrated 12-lead recording is required before a reassuring ECG assessment.','Ижобий баҳолаш учун тўлиқ калибрланган 12 уланмали ЭКГ керак.','Для заключения об отсутствии острых признаков нужна полная калиброванная ЭКГ в 12 отведениях.'),abnormal_vitals:tr('Abnormal vital signs require immediate clinician review.','Ҳаётий кўрсаткичлар шошилинч кўрикни талаб қилади.','Отклонения жизненных показателей требуют немедленной проверки врачом.'),symptoms_require_review:tr('Symptoms prevent a reassuring assessment even without acute ECG findings.','Ўткир ЭКГ белгилари бўлмаса ҳам, симптомлар кўрикни талаб қилади.','Даже без острых ЭКГ-признаков симптомы требуют срочной оценки.'),limited:tr('Limited quality prevents a negative conclusion.','Чекланган сифат манфий хулосага йўл қўймайди.','Ограниченное качество не позволяет дать отрицательное заключение.'),uninterpretable:tr('An unreadable ECG cannot be classified as normal.','Ўқилмайдиган ЭКГ нормал деб баҳоланмайди.','Нечитаемая ЭКГ не может быть признана нормальной.'),unverified_measurement:tr('Visual measurements without verified calibration were removed.','Калибровкасиз визуал ўлчовлар олиб ташланди.','Визуальные измерения без подтверждённой калибровки удалены.')};
 return <div className="ai-result"><CoronaryState analysis={a} lang={lang} reveal={animateReveal}/>{(a.coronary_state===undefined||a.review_priority==='emergency_review')&&<div className={'risk-box '+(a.review_priority==='emergency_review'?'high':a.review_priority==='urgent_review'?'medium':'neutral')}><CircleAlert/><div><small>GPT · {tr('NOT CONFIRMED','ТАСДИҚЛАНМАГАН','НЕ ПОДТВЕРЖДЕНО')}</small><h3>{title}</h3><p>{a.priority_reason}</p></div></div>}<div className="ai-quality"><ShieldCheck size={17}/><span>{tr('Recording quality','Ёзув сифати','Качество записи')}: <b>{quality}</b></span></div><p className="ai-summary">{a.summary_for_clinician}</p>
 {result.guardrails.length>0&&<div className="info-box"><CircleAlert size={18}/><ul>{result.guardrails.map(key=><li key={key}>{reasons[key]||key}</li>)}</ul></div>}
 <div className="info-box"><ShieldCheck size={18}/><p>{tr('ACS is not excluded. GPT findings require physician confirmation. Review the original ECG and clinical context.','ЎКС истисно қилинмайди. GPT хулосаси шифокор тасдиғини талаб қилади. Асл ЭКГ ва клиник ҳолатни текширинг.','ОКС не исключён. Выводы GPT требуют подтверждения врачом. Проверьте исходную ЭКГ и клиническую картину.')}</p></div>
 {a.observed_findings.length>0&&<><h3 className="care-title">{tr('Observed ECG findings','Кузатилган ЭКГ белгилари','Наблюдаемые ЭКГ-признаки')}</h3>{a.observed_findings.map((f,i)=><div className="ai-finding" key={i}><b>{f.finding}</b>{f.leads.length>0&&<span>{f.leads.join(', ')}</span>}<p>{f.supporting_observation}</p></div>)}</>}
 <Accordion type="multiple" className="ai-details"><AccordionItem value="interpretations"><AccordionTrigger>{tr('Preliminary interpretations','Дастлабки талқинлар','Предварительные интерпретации')}</AccordionTrigger><AccordionContent>{a.preliminary_interpretations.map((p,i)=><div className="ai-finding" key={i}><b>{p.interpretation}</b><p>{p.supporting_findings.join(' · ')}</p><p>{p.limitations.join(' · ')}</p></div>)}{!a.preliminary_interpretations.length&&<p>—</p>}</AccordionContent></AccordionItem><AccordionItem value="measurements"><AccordionTrigger>{tr('Measurements and limitations','Ўлчовлар ва чекловлар','Измерения и ограничения')}</AccordionTrigger><AccordionContent><p>{tr('Readable leads','Ўқиладиган уланмалар','Читаемые отведения')}: {a.image_quality.readable_leads.join(', ')||'—'}</p><p>{tr('Missing / unreadable','Йўқ / ўқилмайди','Отсутствуют / не читаются')}: {a.image_quality.missing_or_unreadable_leads.join(', ')||'—'}</p><ul>{a.image_quality.limitations.map((s,i)=><li key={i}>{s}</li>)}</ul>{a.measurements.map((m,i)=><div className="ai-measurement" key={i}><b>{m.name}: {m.value===null?'—':`${m.approximate?'≈ ':''}${m.value} ${m.unit||''}`}</b><span>{m.source==='device_printout'?tr('Device printout','Аппарат ёзуви','Печать аппарата'):m.source==='visual_estimate'?tr('Visual estimate','Визуал баҳолаш','Визуальная оценка'):tr('Provided data','Киритилган маълумот','Переданные данные')}</span>{m.limitation&&<p>{m.limitation}</p>}</div>)}</AccordionContent></AccordionItem></Accordion>
 <h3 className="care-title">{tr('Suggested next steps for the physician','Шифокор учун кейинги қадамлар','Предлагаемые действия для врача')}</h3>{a.next_steps.map((s,i)=><div className="ai-next-step" key={i}><span>{i+1}</span><div><b>{s.action}</b><p>{s.reason}</p><small>{s.urgency==='immediate'?tr('Immediate','Дарҳол','Немедленно'):s.urgency==='urgent'?tr('Urgent','Тезкор','Срочно'):tr('After urgent priorities','Шошилинч чоралардан кейин','После неотложных действий')}</small></div></div>)}
 {a.missing_information.length>0&&<><h3 className="care-title">{tr('Information to verify','Текшириш керак','Что нужно уточнить')}</h3><ul className="ai-missing">{a.missing_information.map((s,i)=><li key={i}>{s}</li>)}</ul></>}
 <p className="ai-meta">{result.model} · {result.prompt_version} · {new Date(result.analyzed_at).toLocaleString(lang==='uz'?'uz-Cyrl':lang)}</p></div>
}

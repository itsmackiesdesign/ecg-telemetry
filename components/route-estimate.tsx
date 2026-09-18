'use client';
import {useEffect,useRef,useState} from 'react';
import {MapPin,LoaderCircle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {apiFetch} from '@/lib/api-client';
import {centerLocation,type CenterCoordinates} from '@/lib/center-location';
export type RouteEstimate={id:string;center_id:string;duration_seconds:number;distance_meters:number;calculated_at:string};
export function RouteEstimatePanel({center,lang,disabled,onChange,onBusyChange}:{center:CenterCoordinates & {id:string};lang:string;disabled:boolean;onChange:(route:RouteEstimate|null)=>void;onBusyChange:(busy:boolean)=>void}){
 const [route,setRoute]=useState<RouteEstimate|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [origin,setOrigin]=useState<{latitude:number;longitude:number}|null>(null);
 const generation=useRef(0),controller=useRef<AbortController|null>(null);
 const tr=(en:string,uz:string,ru:string)=>lang==='ru'?ru:lang==='uz'?uz:en;
 useEffect(()=>{onBusyChange(busy);return()=>onBusyChange(false)},[busy,onBusyChange]);
 useEffect(()=>()=>{generation.current++;controller.current?.abort()},[]);
 useEffect(()=>{if(!route)return;const timer=setTimeout(()=>{setRoute(null);onChange(null);setError('expired')},Math.max(0,Date.parse(route.calculated_at)+9*60*1000-Date.now()));return()=>clearTimeout(timer)},[route,onChange]);
 function calculate(){
  if(disabled||busy)return;
  setRoute(null);onChange(null);setError('');
  if(!navigator.geolocation){setError('location');return}
  setBusy(true);const version=++generation.current;
  navigator.geolocation.getCurrentPosition(async position=>{
   if(version!==generation.current)return;
   const point={latitude:position.coords.latitude,longitude:position.coords.longitude};setOrigin(point);
   const abort=new AbortController();controller.current=abort;
   const timer=setTimeout(()=>abort.abort(),20000);
   try{
    const response=await apiFetch(`/centers/${center.id}/route`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(point),signal:abort.signal});
    const body=await response.json() as {route:RouteEstimate;error?:string};
    if(!response.ok)throw Error(body.error||'routing_unavailable');
    if(version===generation.current){setRoute(body.route);onChange(body.route)}
   }catch(e){if(version===generation.current)setError(e instanceof Error?e.message:'routing_unavailable')}
   finally{clearTimeout(timer);if(version===generation.current)setBusy(false)}
  },()=>{if(version===generation.current){setBusy(false);setError('location')}},{enableHighAccuracy:true,timeout:15000,maximumAge:30000});
 }
 const target=centerLocation(center);
 return <div className="route-estimate"><h4><MapPin size={18}/>{tr('Travel time','Йўл вақти','Время в пути')}</h4><p>{tr('Use your location to calculate a driving route. Coordinates are sent to the routing service.','Автомобиль маршрути учун жойлашувингизни аниқланг. Координаталар маршрут хизматига юборилади.','Определите свою геолокацию для расчёта автомобильного маршрута. Координаты передаются сервису маршрутизации.')}</p><Button variant="outline" onClick={calculate} disabled={disabled||busy||!target}>{busy&&<LoaderCircle className="animate-spin"/>}{busy?tr('Calculating…','Ҳисобланмоқда…','Рассчитываем…'):tr('Calculate from my location','Жойлашувимдан ҳисоблаш','Рассчитать от моей локации')}</Button>
 {!target&&<p>{tr('The center has no valid coordinates.','Марказ координаталари киритилмаган.','У центра не указаны корректные координаты.')}</p>}
 {error&&<p role="alert">{error==='location'?tr('Allow location access in your browser and retry.','Браузерда геолокацияга рухсат беринг ва қайта урининг.','Разрешите геолокацию в браузере и повторите попытку.'):error==='expired'?tr('Estimate expired. Recalculate before sending.','Ҳисоб эскирди. Юборишдан олдин қайта ҳисобланг.','Расчёт устарел. Пересчитайте перед отправкой.'):tr('Route unavailable. Retry; you can still send the handover without an ETA.','Маршрут мавжуд эмас. Вақтсиз топширув юбориш мумкин.','Маршрут недоступен. Повторите расчёт или отправьте передачу без времени прибытия.')}</p>}
 {route&&<><strong>{Math.max(1,Math.ceil(route.duration_seconds/60))} {tr('min','дақ','мин')} · {(route.distance_meters/1000).toFixed(1)} {tr('km','км','км')}</strong><p>{tr('Approximate, without live traffic. Sending assumes departure now.','Тахминий, тирбандлик ҳисобга олинмаган. Юбориш ҳозир йўлга чиқишни англатади.','Примерно, без учёта пробок. При отправке предполагается выезд сейчас.')}</p>{origin&&target&&<a href={`https://www.google.com/maps/dir/?api=1&origin=${origin.latitude},${origin.longitude}&destination=${target.lat},${target.lon}&travelmode=driving`} target="_blank" rel="noreferrer">{tr('Open driving route','Маршрутни очиш','Открыть маршрут')} ↗</a>}</>}
 </div>;
}

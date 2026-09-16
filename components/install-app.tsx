'use client';
import {useEffect,useState} from 'react';
import {Download,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
export function InstallApp(){
 const [prompt,setPrompt]=useState<InstallEvent|null>(null),[ios,setIos]=useState(false),[hidden,setHidden]=useState(true),[help,setHelp]=useState(false);
 useEffect(()=>{
  const standalone=matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone;
  if(standalone)return;
  setHidden(false);setIos(/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1));
  const ready=(e:Event)=>{e.preventDefault();setPrompt(e as InstallEvent)};
  const installed=()=>setHidden(true);
  window.addEventListener('beforeinstallprompt',ready);window.addEventListener('appinstalled',installed);
  return()=>{window.removeEventListener('beforeinstallprompt',ready);window.removeEventListener('appinstalled',installed)};
 },[]);
 if(hidden||(!prompt&&!ios))return null;
 return <aside className="pwa-install" aria-label="Установка приложения"><div><b>ЭКГ телеметрия на телефоне</b>{help&&<p>В Safari нажмите «Поделиться» → «На экран Домой» → «Добавить».</p>}</div><Button size="sm" onClick={async()=>{if(!prompt){setHelp(true);return}try{await prompt.prompt();await prompt.userChoice;setPrompt(null)}catch{setPrompt(null)}}}><Download size={16}/>Установить</Button><button aria-label="Закрыть предложение установки" onClick={()=>setHidden(true)}><X size={18}/></button></aside>
}

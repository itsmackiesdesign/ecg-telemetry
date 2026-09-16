'use client';
import {useEffect, useState} from 'react';
import {LoaderCircle} from 'lucide-react';
import {apiFetch} from '@/lib/api-client';
import {Dialog, DialogContent, DialogTitle, DialogDescription} from '@/components/ui/dialog';

export function EcgViewer({path, onClose, lang}: {path: string | null; onClose: () => void; lang: string}) {
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const tr = (en: string, ru: string, uz: string) => lang === 'ru' ? ru : lang === 'uz' ? uz : en;
  useEffect(() => {
    setSource(''); setError('');
    if (!path) return;
    const controller = new AbortController();
    let objectUrl = '';
    apiFetch(path, {signal: controller.signal}).then(async response => {
      if (!response.ok) throw new Error(response.status === 401 ? 'session' : response.status === 404 ? 'missing' : 'failed');
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) throw new Error('failed');
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob); setSource(objectUrl);
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [path]);
  return <Dialog open={!!path} onOpenChange={open => {if (!open) onClose();}}>
    <DialogContent className="ecg-viewer">
      <DialogTitle>{tr('ECG image', 'Изображение ЭКГ', 'ЭКГ тасвири')}</DialogTitle>
      <DialogDescription>{tr('Original image sent by the clinician.', 'Исходное изображение, отправленное врачом.', 'Шифокор юборган асл тасвир.')}</DialogDescription>
      {error ? <p role="alert">{error === 'session' ? tr('Your session expired. Sign in again.', 'Сессия истекла. Войдите снова.', 'Сессия тугади. Қайта киринг.') : error === 'missing' ? tr('This ECG file is unavailable or you do not have access.', 'Файл ЭКГ недоступен или у вас нет доступа.', 'ЭКГ файли мавжуд эмас ёки рухсат йўқ.') : tr('Unable to load ECG. Close and try again.', 'Не удалось загрузить ЭКГ. Закройте и попробуйте снова.', 'ЭКГ юкланмади. Ёпинг ва қайта урининг.')}</p> : source ? <><div className="ecg-image-scroll"><img src={source} alt={tr('Original ECG', 'Исходная ЭКГ', 'Асл ЭКГ')} onError={() => setError('failed')}/></div><a href={source} download="ecg">{tr('Download original', 'Скачать оригинал', 'Аслини юклаб олиш')}</a></> : <div role="status" className="center-loading"><LoaderCircle className="animate-spin"/>{tr('Loading ECG…', 'Загрузка ЭКГ…', 'ЭКГ юкланмоқда…')}</div>}
    </DialogContent>
  </Dialog>;
}

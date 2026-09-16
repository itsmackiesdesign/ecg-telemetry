export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8000';
export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = typeof window !== 'undefined' ? localStorage.getItem('pulsepoint_token') : null;
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${API_BASE}${path}`, {...init, headers, cache:'no-store'});
}
export async function openEcg(path: string) {
  const response = await apiFetch(path);
  if (!response.ok) throw new Error('Unable to open ECG');
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a'); link.href=url; link.target='_blank'; link.rel='noopener'; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}

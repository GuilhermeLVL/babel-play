import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * A trilha passou a ser BAIXADA de `public/` em vez de embutida no bundle. Em teste não há
 * servidor, e um `fetch('/trilha/es.json')` não tem host para resolver — então o transporte é
 * trocado pelo disco, e só ele: o código exercitado é o mesmo que roda no navegador, incluindo o
 * `r.ok` e o `catch` que devolve `null` para idioma sem trilha.
 */
const RAIZ = path.resolve(__dirname, '..', 'public');
const original = globalThis.fetch;

globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.pathname : String(entrada);
  if (!url.startsWith('/trilha/') && !url.startsWith('/glosas/')) {
    return original ? original(entrada, init) : Promise.reject(new Error(`fetch não configurado: ${url}`));
  }
  try {
    const texto = await readFile(path.join(RAIZ, url), 'utf8');
    return new Response(texto, { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response('não encontrado', { status: 404 });
  }
}) as typeof fetch;

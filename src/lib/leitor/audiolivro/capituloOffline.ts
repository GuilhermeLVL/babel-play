/**
 * O CAPÍTULO BAIXADO NO APARELHO (F2): "Baixar este capítulo" guarda o `.opus` no Cache Storage
 * (`frasy-audiolivros-v1`), e o reprodutor toca dele por `blob:` sem rede. Fica só neste aparelho; a pessoa apaga quando
 * quiser. Sem Cache Storage (contexto inseguro, navegador antigo), nada é guardado e o capítulo segue pelo CDN.
 */
const CACHE = 'frasy-audiolivros-v1';

const abrir = async (): Promise<Cache | null> => {
  try {
    return typeof caches !== 'undefined' && caches ? await caches.open(CACHE) : null;
  } catch {
    return null;
  }
};

export async function capituloBaixado(url: string): Promise<boolean> {
  const c = await abrir();
  return !!(c && (await c.match(url)));
}

/** Baixa o capítulo inteiro e guarda. Resposta de erro lança e nada é guardado. */
export async function baixarCapitulo(url: string, aoProgredir?: (fracao: number) => void): Promise<void> {
  const c = await abrir();
  if (!c) throw new Error('este navegador não guarda arquivos para ouvir sem rede');
  const r = await fetch(url, { credentials: 'omit' });
  if (!r.ok) throw new Error(`o capítulo não veio (HTTP ${r.status})`);
  const total = Number(r.headers.get('content-length')) || 0;
  const tipo = r.headers.get('content-type') || 'audio/webm';
  const pedacos: Uint8Array[] = [];
  let recebidos = 0;
  const leitor = r.body?.getReader();
  if (leitor) {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      pedacos.push(value);
      recebidos += value.length;
      if (total) aoProgredir?.(Math.min(recebidos / total, 1));
    }
  } else {
    pedacos.push(new Uint8Array(await r.arrayBuffer()));
  }
  const corpo = new Uint8Array(pedacos.reduce((t, p) => t + p.length, 0));
  let o = 0;
  for (const p of pedacos) {
    corpo.set(p, o);
    o += p.length;
  }
  await c.put(url, new Response(corpo, { headers: { 'content-type': tipo } }));
  aoProgredir?.(1);
}

export async function apagarCapitulo(url: string): Promise<void> {
  await (await abrir())?.delete(url);
}

/** O endereço que o `<audio>` toca: o `blob:` do capítulo baixado, ou a própria URL do CDN. */
export async function urlParaTocar(url: string): Promise<string> {
  try {
    const r = await (await abrir())?.match(url);
    if (r) return URL.createObjectURL(await r.blob());
  } catch {
    /* o cache falhou: toca do CDN */
  }
  return url;
}

/** "≈ 6 MB" (ou "≈ 551 KB" abaixo de 1 MB). */
export function tamanhoLegivel(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `≈ ${Math.round(mb)} MB` : `≈ ${Math.max(1, Math.round(bytes / 1024))} KB`;
}

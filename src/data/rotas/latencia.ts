/**
 * O CLIENTE DO `latencia.json` (openspec `latencia-publicada-por-aparelho`, tarefa 2.1): um GET estático, sem credencial, sem
 * identificador, sem cookie. NÃO é rota da API: é o arquivo que o Action semanal publica (`scripts/producao/publicar-latencia.mjs`).
 *
 * QUANDO PEDE: só com `latencia_publicada` E `rum_latencia` ligadas (sem telemetria de campo não há agregado novo). Com qualquer
 * uma desligada, NENHUMA requisição sai. Falha de rede, arquivo inválido (contrato `v: 1`) ou com mais de 35 dias = sem dado:
 * a tela fica como estava, sem "estimativa" no lugar.
 *
 * ONDE FICA O ARQUIVO: `VITE_LATENCIA_URL` (padrão `/latencia.json`, na raiz do site; o bucket e o endereço são decisão do
 * dono, `docs/runbook.md` "Latência publicada"). Uma URL fora da origem precisa entrar no `connect-src` da CSP.
 */
import { type LatenciaPublicada } from '../../core/latencia/agregarLatencia';
import { arquivoFresco, validarLatencia } from '../../core/latencia/contratoDaLatencia';
import { FLAG_LATENCIA_PUBLICADA, FLAG_RUM_LATENCIA } from '../../core/planos';
import { flagLigada } from '../../lib/flagsCache';

export const URL_PADRAO_DA_LATENCIA = '/latencia.json';

/** O endereço do arquivo (`VITE_LATENCIA_URL` se vier, senão `/latencia.json`). */
export function urlDaLatencia(): string {
  const v = (import.meta.env.VITE_LATENCIA_URL as string | undefined)?.trim();
  return v || URL_PADRAO_DA_LATENCIA;
}

/** As duas flags que abrem a leitura. */
export const latenciaPublicadaLigada = (): boolean =>
  flagLigada(FLAG_LATENCIA_PUBLICADA) && flagLigada(FLAG_RUM_LATENCIA);

let pedido: Promise<LatenciaPublicada | null> | null = null;

/** Só para os testes. */
export function esquecerLatenciaPublicada(): void {
  pedido = null;
}

/**
 * O agregado válido e fresco, ou `null`. Um pedido por carga da página (a promessa fica na memória; falha também fica, para
 * não insistir). Com a flag desligada devolve `null` SEM pedir nada.
 */
export function lerLatenciaPublicada(agora: Date = new Date()): Promise<LatenciaPublicada | null> {
  if (!latenciaPublicadaLigada()) return Promise.resolve(null);
  pedido ??= (async () => {
    try {
      const r = await fetch(urlDaLatencia(), { credentials: 'omit', cache: 'default', headers: { accept: 'application/json' } });
      if (!r.ok) return null;
      const arquivo = validarLatencia(await r.json());
      return arquivo && arquivoFresco(arquivo, agora) ? arquivo : null;
    } catch {
      return null;
    }
  })();
  return pedido;
}

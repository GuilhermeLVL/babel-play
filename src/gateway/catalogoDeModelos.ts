/**
 * O CATÁLOGO DA TELA "Modelos no aparelho" (Ajustes → Processamento).
 *
 * Transcrição: os seis modelos que a pessoa pode fixar (`ModeloFixo`), na ordem da tela, com nome
 * simples, os idiomas a que servem, o tamanho do download e o erro medido em português (palavras
 * erradas a cada 100, da bancada de 09/10/2026; o Moonshine não transcreve português, então não tem).
 * O tamanho do Whisper base/tiny é o q8 do roteador (`MODEL_DOWNLOAD_MB_Q8`), o do small e do
 * Moonshine o medido (`MODEL_DOWNLOAD_MB`), o do Parakeet o `MB_DO_PARAKEET`: a tela não inventa número.
 * O peso é o quanto o modelo pesa no computador (memória e processador), para o selo.
 *
 * Tradução: os tradutores guardados (opus-mt, Bergamot), lidos dos manifestos do `localStorage` —
 * a mesma fonte do "baixado em" e do "Liberar espaço" da Captura.
 */
import { ID_DO_PARAKEET, MB_DO_PARAKEET } from './adapters/parakeetModelo';
import { chaveDoManifesto, type ManifestoDeModelo } from './modelManifest';
import type { ModeloFixo } from './modeloFixo';
import { MODEL_DOWNLOAD_MB, MODEL_DOWNLOAD_MB_Q8, MOONSHINE_MODELS, WHISPER_MODELS } from './sttRouter';

export interface ItemDoCatalogo {
  fixo: Exclude<ModeloFixo, 'auto'>;
  id: string;
  nome: string;
  idiomas: string[] | 'todos';
  mb: number;
  /** Palavras erradas a cada 100 em português (bancada). Ausente = não transcreve português. */
  erroPtPorCem?: number;
  peso: 'leve' | 'medio' | 'pesado';
}

export function catalogoDeTranscricao(): ItemDoCatalogo[] {
  return [
    {
      fixo: 'parakeet',
      id: ID_DO_PARAKEET,
      nome: 'Preciso',
      idiomas: ['pt', 'es'],
      mb: MB_DO_PARAKEET,
      erroPtPorCem: 6,
      peso: 'medio',
    },
    {
      fixo: 'whisper-small',
      id: WHISPER_MODELS.small,
      nome: 'Preciso com placa de vídeo',
      idiomas: 'todos',
      mb: MODEL_DOWNLOAD_MB[WHISPER_MODELS.small],
      erroPtPorCem: 11,
      peso: 'pesado',
    },
    {
      fixo: 'whisper-base',
      id: WHISPER_MODELS.base,
      nome: 'Equilibrado',
      idiomas: 'todos',
      mb: MODEL_DOWNLOAD_MB_Q8[WHISPER_MODELS.base],
      erroPtPorCem: 19,
      peso: 'leve',
    },
    {
      fixo: 'whisper-tiny',
      id: WHISPER_MODELS.tiny,
      nome: 'Rápido',
      idiomas: 'todos',
      mb: MODEL_DOWNLOAD_MB_Q8[WHISPER_MODELS.tiny],
      erroPtPorCem: 29,
      peso: 'leve',
    },
    {
      fixo: 'moonshine-base',
      id: MOONSHINE_MODELS.base,
      nome: 'Inglês',
      idiomas: ['en'],
      mb: MODEL_DOWNLOAD_MB[MOONSHINE_MODELS.base],
      peso: 'leve',
    },
    {
      fixo: 'moonshine-tiny',
      id: MOONSHINE_MODELS.tiny,
      nome: 'Inglês, rápido',
      idiomas: ['en'],
      mb: MODEL_DOWNLOAD_MB[MOONSHINE_MODELS.tiny],
      peso: 'leve',
    },
  ];
}

/** O começo comum das chaves de manifesto (`babel.modelManifest.`), sem copiar a constante. */
const PREFIXO = chaveDoManifesto('', '', '').replace(/\|\|$/, '');

/** Modelos de transcrição (os do catálogo e os de bancada/diagnóstico): nunca entram em "Tradução". */
const DE_TRANSCRICAO = /whisper|moonshine|parakeet/i;

/** Um nome curto e técnico para o tradutor; a tela troca os códigos pelos nomes dos idiomas. */
function tituloDoTradutor(id: string): string {
  const bergamot = /^bergamot\/([a-z]{2,3})-([a-z]{2,3})$/i.exec(id);
  if (bergamot) return `Bergamot ${bergamot[1]} → ${bergamot[2]}`;
  const opus = /opus-mt-([^-]+)-(.+)$/i.exec(id);
  if (opus) return `opus-mt ${opus[1]} → ${opus[2]}`;
  return id.split('/').pop() || id;
}

/**
 * Os tradutores com cópia gravada neste navegador. Um por modelo (a cópia mais nova, quando há mais
 * de um dtype), na ordem do id. Manifesto ilegível ou sem `localStorage`: fica de fora, sem lançar.
 */
export function tradutoresGuardados(): Array<{ id: string; titulo: string; bytes: number }> {
  const porId = new Map<string, ManifestoDeModelo>();
  const ids = new Set(catalogoDeTranscricao().map((i) => i.id));
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIXO)) continue;
      let m: ManifestoDeModelo | null = null;
      try {
        m = JSON.parse(localStorage.getItem(k) ?? 'null') as ManifestoDeModelo | null;
      } catch {
        continue;
      }
      if (!m || typeof m.modelId !== 'string' || ids.has(m.modelId) || DE_TRANSCRICAO.test(m.modelId)) continue;
      const antes = porId.get(m.modelId);
      if (!antes || (m.gravadoEm ?? 0) > (antes.gravadoEm ?? 0)) porId.set(m.modelId, m);
    }
  } catch {
    /* sem localStorage: nada guardado que dê para listar */
  }
  return [...porId.values()]
    .sort((a, b) => a.modelId.localeCompare(b.modelId))
    .map((m) => ({ id: m.modelId, titulo: tituloDoTradutor(m.modelId), bytes: Number(m.bytesTotais) || 0 }));
}

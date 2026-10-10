/**
 * O CHIP DE ESTADO DA CAPTURA — a frase curta que junta o chip do modelo, a marca de onde a fala é
 * processada e o seletor de nível (`estadoDoChip()` de `enxuto.js:49-61`, protótipo `telas-enxutas`).
 *
 * O PROTÓTIPO INVENTA O DADO (`marcaDeOnde()`, `medidor()`); AQUI O TEXTO SAI DO SELO DA FALA
 * (`seloDaFala.ts`), a mesma fonte da marca de antes e da janela "Modelo no dispositivo". A REGRA DE
 * OURO continua inteira: o chip nunca diz "no aparelho" se o áudio saiu, ou pode ter saído, e antes da
 * primeira fala ele diz o que VAI acontecer, não o que aconteceu.
 *
 *   parada      a etiqueta do selo em negrito e o detalhe dele; na nuvem, com horas contadas, o detalhe
 *               vira "restam 13 h 30 neste mês" (`enxuto.js:53-54`: a etiqueta já diz que é a nuvem)
 *   gravando    "Legendando" e onde (`enxuto.js:55-59`), com o par de idiomas
 *   pausada     "Pausado · nada está sendo ouvido": o gravador e a detecção de fala estão parados
 *               (`AudioCapture.setPaused`) e o reconhecedor do navegador foi encerrado
 *
 * PURO: sem DOM, sem relógio, sem estado global. Quem traduz é a tela (`t` entra por parâmetro).
 */
import type { NivelDeServico } from '../../core/rota/politicaDeRota';
import { horas, type Medidor, NIVEIS } from './nivelDeServico';
import type { SeloDaFala } from './seloDaFala';

type Traduzir = (chave: string, vars?: Record<string, string | number>) => string;

export interface EstadoDoChip {
  /** O que vai em negrito. */
  forte: string;
  /** O resto da frase; vazio = só o negrito. */
  resto: string;
}

/** Onde a legenda está sendo feita, para a frase "Legendando · …". Sai do selo, palavra por palavra. */
function ondeLegenda(selo: SeloDaFala, t: Traduzir): string {
  const nuvem = { nivel: t(NIVEIS.precisao.nome) };
  if (!selo.confirmado) {
    // Nenhuma fala atendida ainda: é o previsto, dito como previsto.
    return selo.onde === 'nuvem'
      ? t('vai pela nuvem ({nivel})', nuvem)
      : selo.onde === 'navegador'
        ? t('vai pelo navegador')
        : t('vai rodar no aparelho');
  }
  if (selo.onde === 'nuvem') return t('na nuvem ({nivel})', nuvem);
  if (selo.onde === 'navegador') return t('pelo navegador');
  // Transcrita aqui, mas a nuvem foi tentada antes: o áudio pode ter saído, e o chip não esconde isso.
  return selo.saiDoAparelho ? t('no aparelho, depois de tentar a nuvem') : t('no aparelho');
}

/** O medidor que o chip resume: o do nível em uso quando é o "Ao vivo", senão o da Precisão. */
const medidorEmUso = (ms: readonly Medidor[], emUso: NivelDeServico | null): Medidor | null =>
  (emUso === 'aovivo' && ms.find((m) => m.nivel === 'aovivo')) || ms[0] || null;

export function estadoDoChip(
  o: {
    selo: SeloDaFala | null;
    gravando: boolean;
    pausada: boolean;
    medidores: readonly Medidor[];
    emUso: NivelDeServico | null;
    /** O par de idiomas como a tela o escreve ("inglês → português" ou "EN → PT"). */
    par: string;
  },
  t: Traduzir,
): EstadoDoChip {
  if (o.gravando) {
    if (o.pausada) return { forte: t('Pausado'), resto: t('nada está sendo ouvido') };
    return { forte: t('Legendando'), resto: [o.selo ? ondeLegenda(o.selo, t) : '', o.par].filter(Boolean).join(' · ') };
  }
  /* Sem selo não há o que afirmar: o chip continua sendo a porta da folha, com o nome dela. */
  if (!o.selo) return { forte: t('Como isto funciona'), resto: '' };
  const med = o.selo.onde === 'nuvem' && !o.selo.mudou ? medidorEmUso(o.medidores, o.emUso) : null;
  return {
    forte: t(o.selo.etiqueta),
    resto: med && !med.acabou ? t('restam {resta} neste mês', { resta: horas(med.resta) }) : t(o.selo.detalhe),
  };
}

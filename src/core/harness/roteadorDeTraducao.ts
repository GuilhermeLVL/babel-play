/**
 * ROTEADOR DE TRADUÇÃO (`routeMt`) — a escada M0–M5 do harness adaptativo (§1.2), como função pura.
 *
 * POR QUE EXISTE. A cadeia de tradução de hoje é fixa por perfil (`profiles.ts`) e o gateway tem um
 * atalho por cima dela: `falada`/`nuvemPrimeiro` mandam o texto ao LLM do servidor ANTES da cadeia.
 * Esse atalho ignorava `parcial`, e o parcial do microfone — refeito a cada ~1,1 s — ia ao LLM pago
 * várias vezes por frase: o maior desperdício achado na auditoria de eficiência (2026-09-28, achado 1).
 * Aqui a decisão "o que tentar, em que ordem" vira uma função que se lê e se testa inteira.
 *
 * A ESCADA, do mais barato ao mais caro (rodar o mínimo de IA que entrega a qualidade pedida):
 *   M0 `pular`      — o aluno já sabe todas as palavras: não traduzir (mostra só o que ele não sabe);
 *   M1 `dicionario` — toque numa palavra solta: glosa/dicionário é melhor que MT para palavra isolada;
 *   M2 `memoria`    — memória de tradução (exata/aproximada) — consulta barata, erra rápido;
 *   M3 `nativo`     — Translator API do navegador (no aparelho, sem download nosso);
 *   M4 `local`      — nosso modelo no aparelho (opus-mt; Bergamot quando existir);
 *   M5 `nuvem`      — LLM do nosso servidor: SÓ texto final, SÓ para quem tem direito, SÓ com consentimento;
 *   +  `terceiro`   — MyMemory, direto do navegador: último recurso, também só final e com consentimento.
 *
 * REGRAS QUE NÃO DOBRAM:
 *   - PARCIAL NUNCA vai à nuvem nem a terceiro, em nenhum plano. O parcial vive ~1 s na tela.
 *   - Grátis nunca vai à nuvem, a menos que o chamador diga que há cota de convidado.
 *   - Sem consentimento, nada sai do aparelho (nuvem e terceiro saem; ver `registroDeMotores.ts`).
 *
 * FALA FINAL DE QUEM PAGA: a nuvem sobe para logo depois da memória, antes do nativo. É o que o
 * gateway faz hoje (`falada`/`nuvemPrimeiro`, `src/gateway/index.ts`): o opus-mt traduz fala informal
 * ao pé da letra ("a gente tava de boa"), e o LLM traduz sentido. A porta de qualidade
 * (`portasDeQualidade.ts`) é o caminho futuro para trocar isso por "local primeiro, sobe se ruim".
 *
 * Devolve a escada E os degraus descartados com o motivo — para a telemetria dizer por que um trecho
 * não foi à nuvem, sem texto do usuário.
 */
import { chaveDaPalavra } from '../texto/palavra';
import { palavrasDoTexto } from '../texto/segmentacao';

export type DegrauMt = 'pular' | 'dicionario' | 'memoria' | 'nativo' | 'local' | 'nuvem' | 'terceiro';

export type MotivoDaRotaMt =
  // por que o degrau entrou
  | 'todas-conhecidas'
  | 'mesmo-idioma'
  | 'palavra-solta'
  | 'consulta-barata'
  | 'no-aparelho'
  | 'falada-nuvem-primeiro'
  | 'ultimo-recurso'
  // por que foi descartado
  | 'texto-vazio'
  | 'parcial'
  | 'plano'
  | 'consentimento'
  | 'indisponivel'
  | 'nao-e-palavra-solta';

export interface DisponibilidadeMt {
  /** Translator API do navegador tem o par (ou pode baixar). */
  tradutorNativo: boolean;
  /** opus-mt cobre o par (ver `dirConfig` em `mtWorker.ts`). */
  opusMt: boolean;
  /** Bergamot cobre o par — candidato, ainda sem adaptador. */
  bergamot?: boolean;
  /** O servidor tem tradutor de nuvem configurado e o disjuntor está fechado. */
  nuvem: boolean;
  /** MyMemory na cadeia do perfil. Ausente = não. */
  terceiro?: boolean;
  /** Dicionário local de glosas. Ausente = sim (consulta que erra é barata). */
  dicionario?: boolean;
  /** Memória de tradução. Ausente = sim. */
  memoria?: boolean;
}

export interface EntradaDaRotaMt {
  texto: string;
  /**
   * O aluno já sabe esta palavra? (vocabulário dele + frequência/CEFR). Ausente = não filtrar — é o
   * que o chamador passa quando o pedido é explícito ("traduzir a frase inteira").
   */
  palavrasConhecidas?: (palavra: string) => boolean;
  /** O pedido veio de um toque numa palavra da legenda. */
  ehToqueEmPalavra: boolean;
  /** Texto provisório (parcial do STT), que será refeito em ~1 s. */
  parcial: boolean;
  /** Plano pago (Essencial/Pro/self-host). */
  pago: boolean;
  /** Grátis/convidado com cota de nuvem disponível (a cota é decidida no servidor; aqui é só o sinal). */
  cotaDeConvidado?: boolean;
  /** Consentimento de nuvem (Ajustes → Privacidade). */
  consentimento: boolean;
  disponibilidade: DisponibilidadeMt;
  /** BCP-47 da origem; '' quando desconhecida. */
  origem: string;
  destino: string;
  /** Fala (microfone/conversa): registro informal, o LLM traduz melhor que o opus-mt. */
  falada: boolean;
  /** Legenda do sistema de quem paga, com nuvem primeiro (o `nuvemPrimeiro` do gateway). */
  nuvemPrimeiro?: boolean;
}

export interface PassoDaRotaMt {
  degrau: DegrauMt;
  /** Id do motor no registro (`registroDeMotores.ts`); ausente para degraus sem motor de IA. */
  motor?: string;
  motivo: MotivoDaRotaMt;
}

export interface RotaMt {
  /** Degraus a tentar, NESTA ordem; o chamador para no primeiro que servir. */
  degraus: PassoDaRotaMt[];
  /** Degraus que ficaram de fora, com o motivo (telemetria). */
  descartados: { degrau: DegrauMt; motivo: MotivoDaRotaMt }[];
}

const idiomaBase = (l: string): string => l.toLowerCase().split('-')[0];

export function routeMt(e: EntradaDaRotaMt): RotaMt {
  const descartados: RotaMt['descartados'] = [];
  const palavras = palavrasDoTexto(e.texto, e.origem);
  if (!e.texto.trim() || palavras.length === 0) {
    return { degraus: [], descartados: [{ degrau: 'pular', motivo: 'texto-vazio' }] };
  }
  if (e.origem && idiomaBase(e.origem) === idiomaBase(e.destino)) {
    return { degraus: [{ degrau: 'pular', motivo: 'mesmo-idioma' }], descartados };
  }

  // M0 — não traduzir o que o aluno já sabe. Não vale para o toque: tocar é pedir o significado.
  if (!e.ehToqueEmPalavra && e.palavrasConhecidas) {
    const conhece = e.palavrasConhecidas;
    if (palavras.every((p) => conhece(chaveDaPalavra(p)) || conhece(p))) {
      return { degraus: [{ degrau: 'pular', motivo: 'todas-conhecidas' }], descartados };
    }
  }

  const d = e.disponibilidade;
  const degraus: PassoDaRotaMt[] = [];

  // M1 — dicionário, só para toque numa palavra solta.
  if (e.ehToqueEmPalavra) {
    if (palavras.length !== 1) descartados.push({ degrau: 'dicionario', motivo: 'nao-e-palavra-solta' });
    else if (d.dicionario === false) descartados.push({ degrau: 'dicionario', motivo: 'indisponivel' });
    else degraus.push({ degrau: 'dicionario', motivo: 'palavra-solta' });
  }

  // M2 — memória de tradução.
  if (d.memoria === false) descartados.push({ degrau: 'memoria', motivo: 'indisponivel' });
  else degraus.push({ degrau: 'memoria', motivo: 'consulta-barata' });

  // M5 — nuvem: decide ANTES de montar o meio, porque a fala final de quem paga a puxa para cima.
  const motivoSemNuvem: MotivoDaRotaMt | null = e.parcial
    ? 'parcial'
    : !(e.pago || e.cotaDeConvidado)
      ? 'plano'
      : !e.consentimento
        ? 'consentimento'
        : !d.nuvem
          ? 'indisponivel'
          : null;
  const nuvemPrimeiro = motivoSemNuvem === null && (e.falada || !!e.nuvemPrimeiro);
  if (nuvemPrimeiro) degraus.push({ degrau: 'nuvem', motor: 'server-llm-mt', motivo: 'falada-nuvem-primeiro' });

  // M3 — nativo do navegador.
  if (d.tradutorNativo) degraus.push({ degrau: 'nativo', motor: 'chrome-translator', motivo: 'no-aparelho' });
  else descartados.push({ degrau: 'nativo', motivo: 'indisponivel' });

  /* M4 — nosso modelo local. opus-mt antes do Bergamot: o opus-mt está medido na bancada (COMET 0,847
     no gold); o Bergamot é candidato (36 MB contra 113 MB) e troca de lugar quando ganhar lá. */
  const locais: PassoDaRotaMt[] = [];
  if (d.opusMt) locais.push({ degrau: 'local', motor: 'opus-mt-local', motivo: 'no-aparelho' });
  if (d.bergamot) locais.push({ degrau: 'local', motor: 'bergamot', motivo: 'no-aparelho' });
  if (locais.length) degraus.push(...locais);
  else descartados.push({ degrau: 'local', motivo: 'indisponivel' });

  if (motivoSemNuvem !== null) descartados.push({ degrau: 'nuvem', motivo: motivoSemNuvem });
  else if (!nuvemPrimeiro) degraus.push({ degrau: 'nuvem', motor: 'server-llm-mt', motivo: 'ultimo-recurso' });

  // Terceiro (MyMemory): sem plano, mas sai do aparelho — parcial e consentimento valem igual.
  const motivoSemTerceiro: MotivoDaRotaMt | null = e.parcial
    ? 'parcial'
    : !e.consentimento
      ? 'consentimento'
      : !d.terceiro
        ? 'indisponivel'
        : null;
  if (motivoSemTerceiro !== null) descartados.push({ degrau: 'terceiro', motivo: motivoSemTerceiro });
  else degraus.push({ degrau: 'terceiro', motor: 'mymemory', motivo: 'ultimo-recurso' });

  return { degraus, descartados };
}

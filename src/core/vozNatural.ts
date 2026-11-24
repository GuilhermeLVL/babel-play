/**
 * A VOZ NATURAL DA NUVEM (Fase E, modo intérprete) — o contrato entre o cliente
 * (`src/lib/voz/vozDaNuvem.ts`) e o servidor (`server/ai/ttsProxy.ts`, `POST /api/ai/tts`).
 *
 * O intérprete está em TODOS os planos: o Grátis lê a tradução com a voz do aparelho
 * (`speechSynthesis`); a voz natural da nuvem é do Premium, pelo entitlement `vozNatural` — nunca pelo
 * nome do plano. Sem ela (ou com a flag desligada, a nuvem fechada, a cota do dia no fim), a voz do
 * aparelho lê a MESMA fala, sem a pessoa perceber.
 */
import { ehPlanoPago, type PlanoEfetivo } from './planos';

/** A flag de produto — nasce desligada (migração 0046); ligar exige a retenção registrada na LGPD. */
export const FLAG_VOZ_NATURAL = 'voz_natural';

/**
 * A VOZ NATURAL PELO OPENROUTER (change `voz-natural-openrouter`, 17/11/2026): a mesma chave que o app já usa, pelo
 * `POST /audio/speech` com retenção zero. O PADRÃO é o Kokoro 82M, o mais barato (US$ 0,62 a 4 por 1M de caracteres,
 * os dois endpoints com retenção zero); a voz BOA é o MAI-Voice 2.1 Flash (US$ 15/1M), só do nível `boa` e DESLIGADA
 * por padrão (fora dos `ops/ia-provedores*.json`): no pior caso ela deixa a margem do plano de nível boa negativa
 * (`openspec/changes/archive/2026-11-23-voz-natural-openrouter/design.md`).
 */
export const MODELO_DE_VOZ_DO_OPENROUTER = 'hexgrad/kokoro-82m';
export const MODELO_DE_VOZ_BOA_DO_OPENROUTER = 'microsoft/mai-voice-2.1-flash';

/**
 * A VOZ DA NUVEM É SÓ DE QUEM PAGA (decisão do dono, 17/11/2026): o plano tem a capacidade `vozNatural` E é um plano
 * pago, fora do teste de 3 dias. Grátis, convidado e teste NUNCA chegam à nuvem da voz: a voz do aparelho lê a
 * tradução, de graça. O self-host passa porque a chave é do dono da instância (não há custo nosso). Nada aqui muda
 * oferta: quem pode comprar continua sendo decidido pelas regras de compra (menores inclusive).
 */
export function vozDaNuvemLiberada(p: { plan: PlanoEfetivo | string; vozNatural: boolean; emTeste: boolean }): boolean {
  if (!p.vozNatural || p.emTeste) return false;
  return p.plan === 'selfhost' || ehPlanoPago(p.plan);
}

export const ROTA_DA_VOZ_NATURAL = '/api/ai/tts';

/**
 * Caracteres por pedido: UMA fala traduzida. A legenda tem ~100; uma fala longa de conversa passa pouco
 * de 400. O teto é também o do custo de um pedido (600 × US$ 1/1M = US$ 0,0006 no padrão).
 */
export const TETO_DE_CARACTERES_DA_VOZ = 600;

/** A velocidade que a pessoa pode pedir (1 = a do modelo). */
export const VELOCIDADE_DA_VOZ = { minima: 0.5, maxima: 2 } as const;

/** Os códigos das recusas próprias da voz (as comuns — portão, admissão, cota — são as de sempre). */
export const CODIGOS_DA_VOZ_NATURAL = {
  /** 402: o plano não tem `vozNatural`. */
  exige: 'exige_voz_natural',
  /** 503: a flag `voz_natural` está desligada. */
  desligada: 'voz_natural_desligada',
  /** 501: nenhuma perna de voz com chave no servidor. */
  naoConfigurada: 'voz_nao_configurada',
  /** 422: nenhuma voz configurada fala este idioma. */
  semIdioma: 'idioma_sem_voz_natural',
  /** 400: o pedido trouxe áudio de referência ou voz criada — não há clonagem de voz. */
  clonagem: 'clonagem_de_voz_recusada',
} as const;

/**
 * A ROTA DO TRADUTOR LOCAL POR DIREÇÃO (openspec `traducao-local-por-direcao`, D2): uma tabela pura que diz, para cada
 * direção, QUAL motor local vem primeiro e qual fica de reserva. Antes essa regra morava em `if`s espalhados
 * (`bergamotVenceNoPar`, `parDoBergamot`, comentários); agora o roteador (`routeMt`) só a consome, e o veredito do teste
 * cego é um DADO (`vereditoPorDirecao.json`), não uma condicional.
 *
 *   X→en (pt e `ORIGENS_DO_BERGAMOT_NO_CDN`) : `bergamot-local`, reserva `opus-mt-local`;
 *   en→pt-BR                                  : `opus-mt-local` com o alvo `pt_br`; um tradutor leve só passa à frente com o
 *                                               veredito `aprovado` (D4). Do inglês, o Bergamot NUNCA entra sem ele;
 *   X→Y sem inglês (pivô)                     : 1ª perna (X→en) Bergamot, 2ª perna segundo a linha de `en→Y`.
 *
 * Quem decide se o motor está DISPONÍVEL neste aparelho (modelo publicado, navegador capaz, flag) é o chamador; a tabela só
 * ordena. Sem texto de usuário, sem DOM, sem rede.
 */
import veredito from './vereditoPorDirecao.json';
import { ORIGENS_DO_BERGAMOT_NO_CDN, passaPeloIngles } from './viaIngles';

export type MotorLocalDeMt = 'bergamot-local' | 'opus-mt-local';
export type VereditoDoTesteCego = 'aprovado' | 'reprovado' | 'inconclusivo' | 'nao-avaliado';

export interface PernaDaRota {
  de: string;
  para: string;
  /** Motores locais desta perna, em ordem (o primeiro é o preferido, os seguintes são reserva). */
  motores: MotorLocalDeMt[];
}

const base = (l: string): string => l.toLowerCase().split(/[-_]/)[0] ?? '';

/** O veredito versionado de uma direção (`en-pt`…); ausente = `nao-avaliado`. */
export function vereditoDaDirecao(
  de: string,
  para: string,
  vereditos: Readonly<Record<string, string>> = veredito,
): VereditoDoTesteCego {
  const v = vereditos[`${base(de)}-${base(para)}`];
  return v === 'aprovado' || v === 'reprovado' || v === 'inconclusivo' ? v : 'nao-avaliado';
}

/** Os motores locais de UMA perna direta, em ordem de preferência. */
function motoresDaPerna(
  de: string,
  para: string,
  vereditos: Readonly<Record<string, string>> | undefined,
): MotorLocalDeMt[] {
  const s = base(de);
  const t = base(para);
  if (t === 'en' && (s === 'pt' || ORIGENS_DO_BERGAMOT_NO_CDN.has(s))) return ['bergamot-local', 'opus-mt-local'];
  if (s === 'en' && t === 'pt' && vereditoDaDirecao(s, t, vereditos) === 'aprovado')
    return ['bergamot-local', 'opus-mt-local'];
  return ['opus-mt-local'];
}

/**
 * As pernas da rota local: uma só para um par direto, duas para o pivô (`X→en` e `en→Y`). Vazia quando é o mesmo idioma.
 */
export function pernasDaRotaLocal(
  de: string,
  para: string,
  vereditos?: Readonly<Record<string, string>>,
): PernaDaRota[] {
  const s = base(de);
  const t = base(para);
  if (!s || !t || s === t) return [];
  if (passaPeloIngles(s, t))
    return [
      { de: s, para: 'en', motores: motoresDaPerna(s, 'en', vereditos) },
      { de: 'en', para: t, motores: motoresDaPerna('en', t, vereditos) },
    ];
  return [{ de: s, para: t, motores: motoresDaPerna(s, t, vereditos) }];
}

/**
 * Os motores locais que o roteador tenta, em ordem, para a direção pedida. Em par com pivô, a ordem é a da 1ª perna
 * (X→en): é nela que o Bergamot entra, e o composto do gateway cuida da 2ª (en→Y).
 */
export function motoresLocaisDaDirecao(
  de: string,
  para: string,
  vereditos?: Readonly<Record<string, string>>,
): MotorLocalDeMt[] {
  return pernasDaRotaLocal(de, para, vereditos)[0]?.motores ?? ['opus-mt-local'];
}

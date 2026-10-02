import type { EstadoDasMissoes, Missao } from '@core';
import { CheckCircle2, Gamepad2, ListChecks, type LucideIcon, Snowflake, Sprout, Star, Target } from 'lucide-react';
import type { CSSProperties } from 'react';

import { t, tp } from '../../lib/i18n';
import { perfilProtegido } from '../../lib/protecaoDoMenor';
import { Barra, IconeEmBloco, TituloDeSecao } from '../ui';

/**
 * AS MISSÕES DO DIA (recompensas v2, onda 5 — spec §8.2).
 *
 * Três missões do dia, com o progresso que o SERVIDOR contou (`GET /api/metrics/missoes`): a tela
 * não soma nada por conta própria. Quando as três fecham, o cartão vira o PONTO DE PARADA: "Meta do
 * dia concluída", a recompensa creditada e nenhum convite a "mais uma" — é o fim do dia, dito.
 *
 * Sem estado (ainda carregando, ou a rota falhou), o cartão não aparece: progresso inventado é pior
 * do que cartão nenhum.
 */
export const ICONE_DA_MISSAO: Record<Missao['tipo'], LucideIcon> = {
  revisar: Target,
  palavras: Sprout,
  rodadaBoa: Star,
  jogoNovo: Gamepad2,
};

/** O texto de uma missão (o cartão de sempre e o Início do headset dizem a mesma frase). */
export function rotuloDaMissao(m: Missao): string {
  switch (m.tipo) {
    case 'revisar':
      return tp(m.alvo, 'Revise {n} palavra', 'Revise {n} palavras');
    case 'palavras':
      return tp(m.alvo, 'Salve {n} palavra de uma captura', 'Salve {n} palavras de uma captura');
    case 'rodadaBoa':
      return tp(m.alvo, 'Feche {n} rodada com 2 estrelas ou mais', 'Feche {n} rodadas com 2 estrelas ou mais');
    case 'jogoNovo':
      return t('Jogue um jogo que você nunca jogou');
  }
}

export default function MissoesDoDia({
  estado,
  className = '',
  style,
}: {
  estado: EstadoDasMissoes | null;
  className?: string;
  style?: CSSProperties;
}) {
  if (!estado || !estado.missoes.length) return null;
  const { missoes, recompensa, congelamentos } = estado;
  const feitas = missoes.filter((m) => m.atual >= m.alvo).length;
  const concluida = estado.metaConcluida;
  /* Congelamento é assunto de ofensiva: para o perfil protegido, nada que lembre sequência. */
  const mostraCongelamento = congelamentos > 0 && !perfilProtegido();

  return (
    <section className={`cartao ${className}`} style={{ padding: 20, ...style }} aria-label={t('Missões do dia')}>
      <TituloDeSecao
        nivel="h3"
        icone={ListChecks}
        titulo={concluida ? t('Meta do dia concluída') : t('Missões do dia')}
        desc={
          concluida
            ? t('+{seeds} Seeds e +{xp} XP. Por hoje é isso: amanhã chegam missões novas.', recompensa)
            : t('Feche as três para ganhar +{seeds} Seeds e +{xp} XP.', recompensa)
        }
        direita={
          <span className="label-mono" data-testid="missoes-feitas">
            {feitas}/{missoes.length}
          </span>
        }
      />
      <ul style={{ display: 'grid', gap: 12, marginTop: 14 }}>
        {missoes.map((m) => {
          const feita = m.atual >= m.alvo;
          const atual = Math.min(m.atual, m.alvo);
          return (
            <li key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }} data-missao={m.tipo}>
              <IconeEmBloco icone={feita ? CheckCircle2 : ICONE_DA_MISSAO[m.tipo]} tom={feita ? 'good' : 'accent'} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13.5, fontWeight: 700 }}>{rotuloDaMissao(m)}</p>
                <Barra
                  pct={(atual / m.alvo) * 100}
                  tom={feita ? 'good' : 'accent'}
                  tamanho="fina"
                  className="mt-1.5"
                  rotuloAcessivel={t('{atual} de {alvo}', { atual, alvo: m.alvo })}
                />
              </div>
              <span className="mut" style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
                {atual}/{m.alvo}
              </span>
            </li>
          );
        })}
      </ul>
      {mostraCongelamento && (
        <p className="mut" style={{ fontSize: 12.5, marginTop: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Snowflake aria-hidden style={{ width: 14, height: 14 }} />
          {tp(
            congelamentos,
            '{n} congelamento guardado: um dia sem prática não quebra a ofensiva.',
            '{n} congelamentos guardados: um dia sem prática não quebra a ofensiva.',
          )}
        </p>
      )}
    </section>
  );
}

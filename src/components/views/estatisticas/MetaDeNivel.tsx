import { Target } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { type AppMetrics, fetchSettings, patchUiSettings } from '../../../data/api';
import { t } from '../../../lib/i18n';
import { ehBaixaConfianca } from '../../Honestidade';
import { TituloDeSecao } from '../../ui';

/**
 * A META DE NÍVEL (CEFR) — veio do bloco inline antigo do Início (decisão do dono, 24/09): o link
 * "Ver estatísticas detalhadas" passou a trazer para cá, e a meta veio junto. O protótipo não
 * desenha metas de nível, então ela entra no molde padrão: `.cartao` com `TituloDeSecao`, no fim.
 *
 * O ALVO É ESCOLHIDO, O VALOR É MEDIDO. O nível-alvo é uma meta declarada (persiste em
 * `settings.ui.cefrGoal`, por merge, sem pisar em `ui.goal`, que é de Ajustes); o ritmo vem de
 * `metrics.wpm` e a aderência do vocabulário, da distribuição real de níveis do caderno. O que o
 * app não mede (o agregado de vícios entre sessões) diz que não mede.
 */

type Nivel = 'B2' | 'C1' | 'C2';
const NIVEIS: Nivel[] = ['B2', 'C1', 'C2'];
/** Ritmo de fala DECLARADO por nível (benchmark, não medição). */
const PPM_ALVO: Record<Nivel, number> = { B2: 130, C1: 150, C2: 160 };
const ORDEM_CEFR: Record<string, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
const ROTULO: Record<Nivel, string> = { B2: 'B2 · Gerente', C1: 'C1 · Executivo', C2: 'C2 · Conselheiro' };

function Medida({
  rotulo,
  valor,
  pct,
  tom,
  texto,
}: {
  rotulo: string;
  valor: string;
  pct: number;
  tom: 'accent' | 'good' | 'neutro';
  texto: string;
}) {
  // Acento: o degradê do próprio `.barra span`; os outros tons trocam só a cor.
  const cor = tom === 'good' ? 'var(--good)' : tom === 'neutro' ? 'var(--border-strong)' : undefined;
  return (
    <div>
      <div className="entre" style={{ gap: 8 }}>
        <span className="label-mono">{rotulo}</span>
        <b className="tn" style={{ font: '800 15px var(--font-display)' }}>
          {valor}
        </b>
      </div>
      <div className="barra" style={{ marginTop: 8 }} aria-hidden>
        <span style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: cor }} />
      </div>
      <p className="mut" style={{ fontSize: 12.5, marginTop: 8 }}>
        {texto}
      </p>
    </div>
  );
}

export default function MetaDeNivel({ metrics }: { metrics: AppMetrics | null }) {
  const [nivel, setNivel] = useState<Nivel>('C1');
  const carregado = useRef(false);
  useEffect(() => {
    let vivo = true;
    void fetchSettings().then((s) => {
      if (!vivo) return;
      try {
        const ui = s?.ui ? (JSON.parse(s.ui) as { cefrGoal?: string }) : {};
        if (ui.cefrGoal === 'B2' || ui.cefrGoal === 'C1' || ui.cefrGoal === 'C2') setNivel(ui.cefrGoal);
      } catch {
        /* ui inválido: fica o padrão */
      }
      carregado.current = true;
    });
    return () => {
      vivo = false;
    };
  }, []);
  const escolher = (n: Nivel) => {
    setNivel(n);
    if (carregado.current) void patchUiSettings({ cefrGoal: n });
  };

  const alvo = PPM_ALVO[nivel];
  const ppm = metrics && metrics.speakingMs > 0 && metrics.wpm > 0 ? Math.round(metrics.wpm) : null;
  const estimativa = !metrics || ehBaixaConfianca(metrics.wpmConfidence);
  const dist = metrics?.levelDistribution ?? [];
  const total = dist.reduce((s, l) => s + l.count, 0);
  const noAlvo = dist.filter((l) => (ORDEM_CEFR[l.level] ?? 0) >= ORDEM_CEFR[nivel]).reduce((s, l) => s + l.count, 0);
  const aderencia = total > 0 ? Math.round((noAlvo / total) * 100) : null;

  return (
    <section className="cartao p5 secao" aria-labelledby="meta-nivel-t">
      <TituloDeSecao
        icone={Target}
        titulo={<span id="meta-nivel-t">{t('Meta de nível')}</span>}
        desc={t('Escolha um nível-alvo. O alvo é declarado; o que aparece embaixo foi medido nas suas sessões.')}
        direita={
          <div className="seg" role="radiogroup" aria-label={t('Nível-alvo')}>
            {NIVEIS.map((n) => (
              <button key={n} type="button" role="radio" aria-checked={nivel === n} onClick={() => escolher(n)}>
                {t(ROTULO[n])}
              </button>
            ))}
          </div>
        }
      />
      <div className="g3" style={{ marginTop: 16 }}>
        <Medida
          rotulo={t('Ritmo de fala')}
          valor={ppm != null ? `${ppm} / ${alvo} ppm` : `— / ${alvo} ppm`}
          pct={ppm != null ? (ppm / alvo) * 100 : 0}
          tom="accent"
          texto={
            ppm != null
              ? `${t('Medido: {n} ppm', { n: ppm })}${estimativa ? ` ${t('(estimativa, poucas sessões)')}` : ''}.`
              : t('Sem fala capturada suficiente para medir o seu ritmo.')
          }
        />
        <Medida
          rotulo={t('Vocabulário no nível-alvo')}
          valor={aderencia != null ? `${aderencia}%` : '—'}
          pct={aderencia ?? 0}
          tom="good"
          texto={
            aderencia != null
              ? t('{pct}% do seu caderno está em {nivel} ou acima.', { pct: aderencia, nivel })
              : t('Sem palavras no caderno para medir a aderência ao nível {n}.', { n: nivel })
          }
        />
        <Medida
          rotulo={t('Clareza e concisão')}
          valor={t('sem agregado')}
          pct={0}
          tom="neutro"
          texto={t('Os vícios de linguagem são contados em cada sessão. O total entre sessões ainda não existe.')}
        />
      </div>
    </section>
  );
}

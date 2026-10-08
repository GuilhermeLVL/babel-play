import { temporadaPorId } from '@core/temporada';
import { Check, Lock, Palette, PanelLeft, Sparkles, Type } from 'lucide-react';
import { useMemo } from 'react';

import { FONTE_OPTIONS, type FonteType, type ThemeType } from '../../../../lib/appearance';
import { lerPaletaAtiva, paletaPorId } from '../../../../lib/galeria/paletas';
import { t } from '../../../../lib/i18n';
import { CATALOGO_DA_LOJA, estadoDoItem, type ItemDaLoja, temPortaDeNivel } from '../../../../lib/loja';
import { PARTICULAS_OPTIONS, readParticulas } from '../../../../lib/particulas';
import { lerAmostras } from '../../../../lib/polimento/personalizar';
import type { AbaDaLojaV2 } from '../../../../lib/rotas';

/**
 * COLEÇÃO, O ATELIÊ (`telas2.js:352-365`, `telas2.css:68-102`; itens D36 e D37).
 *
 * À esquerda a vitrine fixa ("Como está agora"), à direita os temas. Tocar num tema pinta o app
 * inteiro com ele, em círculo, sem equipar; a vitrine passa a dizer "em prévia" e oferece voltar ao
 * equipado e equipar (ou, no que ainda não é seu, o caminho para conseguir).
 *
 * OS TEMAS SÃO OS DO CATÁLOGO (`tipo: 'tema'`), com o estado que a régua de sempre dá
 * (`estadoDoItem`): o protótipo tinha uma lista de exemplo.
 */

/** De onde vem um tema que ainda não é seu (`ROTULO_DO_TEMA`, `telas2.js:299`). */
type Origem = 'seu' | 'nivel' | 'loja' | 'temporada' | 'conquista';

function origemDoTema(item: ItemDaLoja, nivel: number, saldo: number): Origem {
  if (estadoDoItem(item, nivel, saldo).estado === 'equipavel') return 'seu';
  if (item.exclusivoDe || item.origemMaestria) return 'conquista';
  if (item.origemTemporada) return 'temporada';
  if (temPortaDeNivel(item) && (item.nivel ?? 1) > nivel) return 'nivel';
  return 'loja';
}

function rotuloDaOrigem(item: ItemDaLoja, origem: Origem): string {
  switch (origem) {
    case 'seu':
      return t('Na sua coleção');
    case 'nivel':
      return t('Chega no nível {n}', { n: item.nivel ?? 1 });
    case 'temporada':
      return t('Na Temporada {n}', { n: temporadaPorId(item.origemTemporada?.temporada ?? '')?.numero ?? 1 });
    case 'conquista':
      return t('Em Conquistas');
    default:
      return t('Na Loja');
  }
}

/** Onde se consegue o tema (`ver-na-loja`, `telas2.js:588`; lá, sempre a Loja). */
const ABA_DA_ORIGEM: Record<Origem, AbaDaLojaV2> = {
  seu: 'colecao',
  nivel: 'loja',
  loja: 'loja',
  temporada: 'temporada',
  conquista: 'conquistas',
};

export default function ColecaoDoPrototipo({
  nivel,
  saldo,
  theme,
  fonte,
  emProva,
  versao,
  aoProvar,
  aoEquipar,
  aoIrPara,
  aoAbrirVisual,
}: {
  nivel: number;
  saldo: number;
  /** O tema equipado. */
  theme: ThemeType;
  fonte: FonteType;
  /** O tema em prova (pintado, não equipado), ou `null`. */
  emProva: ThemeType | null;
  /** Muda quando a posse muda (compra, equipar): a lista é relida. */
  versao: number;
  aoProvar: (id: ThemeType) => void;
  aoEquipar: (item: ItemDaLoja) => void;
  aoIrPara: (aba: AbaDaLojaV2) => void;
  /** Abre a folha "Meu visual" (o inventário inteiro) na seção pedida. */
  aoAbrirVisual: (secao: string) => void;
}) {
  const temas = useMemo(
    () =>
      CATALOGO_DA_LOJA.filter((i) => i.tipo === 'tema').map((item) => {
        const origem = origemDoTema(item, nivel, saldo);
        return { item, id: item.alvo as ThemeType, origem };
      }),
    [nivel, saldo, versao], // eslint-disable-line react-hooks/exhaustive-deps -- `versao` relê a posse
  );
  /* Lidas do CSS do app a cada montagem (guardadas por tema e por claro/escuro). */
  const amostras = lerAmostras(temas.map((x) => x.id));

  const nomeDe = (id: ThemeType) => {
    if (id === 'custom') {
      const paleta = lerPaletaAtiva();
      if (paleta) return paletaPorId(paleta)?.nome ?? t('Paleta');
    }
    return temas.find((x) => x.id === id)?.item.nome ?? id;
  };
  const naTela = emProva ?? theme;
  const provado = emProva ? temas.find((x) => x.id === emProva) : undefined;

  const resumo = [
    { icone: Palette, rotulo: t('Tema'), valor: nomeDe(theme), secao: 'temas' },
    {
      icone: Sparkles,
      rotulo: t('Partículas'),
      valor: t(PARTICULAS_OPTIONS.find((o) => o.id === readParticulas())?.name ?? '—'),
      secao: 'efeitos',
    },
    {
      icone: Type,
      rotulo: t('Fonte'),
      valor: t(FONTE_OPTIONS.find((f) => f.id === fonte)?.name ?? fonte),
      secao: 'acessibilidade',
    },
    { icone: PanelLeft, rotulo: t('Menu'), valor: t('Trilho de ícones'), secao: 'acessibilidade' },
  ];

  return (
    <>
      <div className="px-atelie">
        <section className="q-cartao px-vitrine" data-testid="vitrine-da-colecao">
          <p className="q-rotulo">{emProva ? t('Como está agora · em prévia') : t('Como está agora')}</p>
          <div className="px-vitrine-tela">
            <div className="px-vitrine-leg">
              <b>
                We ship the <u>roadmap</u> today.
              </b>
              <i>Entregamos o roteiro hoje.</i>
            </div>
            <div className="px-vitrine-cartoes">
              <span>{t('nova')}</span>
              <span className="ap">{t('aprendida')}</span>
              <span className="do">{t('dominada')}</span>
            </div>
            <div className="px-vitrine-barra">
              <i />
            </div>
          </div>
          <div className="px-vitrine-pe">
            <div>
              <p className="q-rotulo">{t('Tema')}</p>
              <b>{nomeDe(naTela)}</b>
            </div>
            {emProva ? (
              <div className="q-acoes">
                <button type="button" className="q-ctl" data-px-tema={theme} onClick={() => aoProvar(theme)}>
                  {t('Voltar ao {tema}', { tema: nomeDe(theme) })}
                </button>
                {provado && provado.origem === 'seu' ? (
                  <button type="button" className="q-ctl pri" data-px="equipar" onClick={() => aoEquipar(provado.item)}>
                    {t('Equipar')}
                  </button>
                ) : (
                  provado && (
                    <button
                      type="button"
                      className="q-ctl pri"
                      data-px="ver-na-loja"
                      onClick={() => aoIrPara(ABA_DA_ORIGEM[provado.origem])}
                    >
                      {rotuloDaOrigem(provado.item, provado.origem)}
                    </button>
                  )
                )}
              </div>
            ) : (
              <span className="q-tag">
                <Check aria-hidden /> {t('Equipado')}
              </span>
            )}
          </div>
        </section>

        <section className="q-secao px-temas">
          <header>
            <div>
              <h2>{t('Temas')}</h2>
              <p>{t('Toque para experimentar no app inteiro. Nada muda de verdade até você equipar.')}</p>
            </div>
          </header>
          <div className="px-temas-grade">
            {temas.map(({ item, id, origem }) => (
              <button
                key={item.id}
                type="button"
                className="q-tile px-tema"
                data-px-tema={id}
                aria-pressed={naTela === id}
                onClick={() => aoProvar(id)}
              >
                <span className="px-amostra">
                  {amostras[id].map((c, i) => (
                    <i key={i} style={{ background: c }} />
                  ))}
                </span>
                <b>{item.nome}</b>
                <span className="q-d">
                  {id === theme ? t('Equipado') : rotuloDaOrigem(item, origem)}
                  {origem === 'seu' ? null : (
                    <>
                      {' '}
                      <Lock aria-hidden />
                    </>
                  )}
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="q-grade g4">
        {resumo.map((r) => (
          <button key={r.rotulo} type="button" className="q-linha" onClick={() => aoAbrirVisual(r.secao)}>
            <span className="q-ic">
              <r.icone aria-hidden />
            </span>
            <span>
              <small className="q-rotulo">{r.rotulo}</small>
              <b>{r.valor}</b>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

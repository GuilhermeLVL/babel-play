import { Cpu, Info, Lock, type LucideIcon, Server, Smartphone, WifiOff, Zap } from 'lucide-react';

import type { NivelDeServico } from '../../../../core/rota/politicaDeRota';
import {
  horas,
  type IconeDaMarca,
  type MarcaDoSelo,
  type Medidor,
  NIVEIS,
  type NivelNaTela,
} from '../../../../lib/captura/nivelDeServico';
import { type SeloDaFala, textoDoSelo } from '../../../../lib/captura/seloDaFala';
import { t } from '../../../../lib/i18n';
import { langLabelNaUI } from '../../../../lib/languages';

/**
 * AS PEÇAS DO NÍVEL DE SERVIÇO NA CAPTURA — a fileira que o protótipo `anuncios-no-gratis` põe logo
 * abaixo dos idiomas (`planos4.js:205-250`): o seletor "No aparelho / Precisão / Ao vivo", a marca de
 * onde a fala é processada, o medidor das horas de nuvem e a nota da tela pronta.
 *
 * A marcação e as classes são as do protótipo, elemento por elemento (o CSS é o dele, copiado por
 * `scripts/polimento/trazer-css.mjs` para `styles/polimento/planos4.css`). Só apresentação: o que
 * cada peça mostra chega pronto de `useNiveisDaCaptura`.
 */

/** `NIVEIS[n].icone`, `planos4.js:116-118`. */
export const ICONE_DO_NIVEL: Record<NivelDeServico, LucideIcon> = { aparelho: Cpu, precisao: Server, aovivo: Zap };

const ICONE_DA_MARCA: Record<IconeDaMarca, LucideIcon> = {
  cpu: Cpu,
  smartphone: Smartphone,
  server: Server,
  'wifi-off': WifiOff,
};

/** Um nível do seletor, com o nome do plano que o abre (para o `title` e para as folhas). */
export interface NivelDoSeletor extends NivelNaTela {
  /** O plano que tem o nível, já no idioma da tela. `null` = nenhum a dizer (o transporte não existe). */
  plano: string | null;
}

/** `seletorDeNivel()` de `planos4.js:219-225`. */
export function SeletorDeNivel({
  niveis,
  emUso,
  aoEscolher,
}: {
  niveis: readonly NivelDoSeletor[];
  /** O nível em uso, pelo selo da fala. `null` = ainda não se sabe (nenhum marcado). */
  emUso: NivelDeServico | null;
  aoEscolher: (n: NivelDeServico) => void;
}) {
  return (
    <div className="q-abas q-seg pl-niveis" role="radiogroup" aria-label={t('Nível de serviço')}>
      {niveis.map(({ nivel, tranca, plano }) => {
        const Icone = ICONE_DO_NIVEL[nivel];
        const dica = !tranca
          ? ''
          : plano
            ? ` ${t('Faz parte do {plano}.', { plano })}`
            : ` ${t('Ainda não está disponível.')}`;
        return (
          <button
            key={nivel}
            type="button"
            role="radio"
            className="q-aba"
            aria-checked={emUso === nivel}
            data-pl-nivel={nivel}
            data-pl-tranca={tranca ? '' : undefined}
            title={t(NIVEIS[nivel].curto) + dica}
            onClick={() => aoEscolher(nivel)}
          >
            <Icone aria-hidden />
            <span>{t(NIVEIS[nivel].nome)}</span>
            {tranca && (
              <span className="pl-cad">
                <Lock aria-hidden />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * `htmlDaMarca()` de `planos4.js:205-208`: a marca pequena e sempre visível. O TEXTO é o do selo da
 * fala (`textoDoSelo`: a etiqueta em negrito e o detalhe), o mesmo da janela "Modelo no dispositivo";
 * o motivo vai no `title`. Ao toque, abre "Como isto funciona".
 */
export function MarcaDeOnde({
  selo,
  marca,
  classe = '',
  aoAbrir,
}: {
  selo: SeloDaFala;
  marca: MarcaDoSelo;
  /** `pl-so-largo` (no topo) ou `pl-so-estreito` (na fileira): o CSS mostra uma das duas. */
  classe?: string;
  aoAbrir: () => void;
}) {
  const Icone = ICONE_DA_MARCA[marca.icone];
  const forte = t(selo.etiqueta);
  const resto = t(selo.detalhe);
  const { motivo } = textoDoSelo(selo, t, langLabelNaUI);
  return (
    <button
      type="button"
      className={`pl-onde ${classe}`}
      data-pl="como"
      data-tom={marca.tom}
      data-testid="marca-de-onde"
      aria-label={t('Onde a fala é processada: {forte}, {resto}. Abrir Como isto funciona', { forte, resto })}
      title={motivo || undefined}
      onClick={aoAbrir}
    >
      <span className="pl-onde-ic">
        <Icone aria-hidden />
      </span>
      <span className="pl-onde-txt">
        <b>{forte}</b> · {resto}
      </span>
      <Info aria-hidden />
    </button>
  );
}

/** O medidor que o chip mostra: o do nível em uso quando é o "Ao vivo", senão o da Precisão. */
export function medidorDoChip(ms: readonly Medidor[], emUso: NivelDeServico | null): Medidor | null {
  return (emUso === 'aovivo' && ms.find((x) => x.nivel === 'aovivo')) || ms[0] || null;
}

/** `chipDoMedidor()` de `planos4.js:226-235`: um chip com uma barrinha. Abre a folha. */
export function ChipDoMedidor({
  medidores,
  emUso,
  aoAbrir,
}: {
  medidores: readonly Medidor[];
  emUso: NivelDeServico | null;
  aoAbrir: () => void;
}) {
  const m = medidorDoChip(medidores, emUso);
  if (!m) return null;
  const fim = medidores[0].acabou;
  return (
    <button
      type="button"
      className="q-chip pl-medidor"
      data-pl="como"
      data-tom={fim ? 'fim' : m.pct >= 85 ? 'pouco' : ''}
      data-testid="medidor-de-nuvem"
      title={t('Horas de nuvem deste mês. Quando acabam, a legenda segue no aparelho.')}
      onClick={aoAbrir}
    >
      <Server aria-hidden />
      <span className="pl-medidor-txt">
        {fim
          ? t('Nuvem do mês acabou · no aparelho')
          : t('Nuvem: restam {resta} de {total}', { resta: horas(m.resta), total: horas(m.total) })}
        <i className="pl-mini-barra" aria-hidden="true">
          <i style={{ width: `${Math.max(4, 100 - m.pct)}%` }} />
        </i>
      </span>
    </button>
  );
}

/**
 * `notaDoPronto()` de `planos4.js:236-245`: uma nota por vez na tela "Pronto para legendar".
 *
 * As horas acabaram: NADA BLOQUEIA. A nota diz quanto era, que a legenda continua no aparelho e que as
 * horas voltam no dia 1º (os contadores do servidor zeram na virada do mês, `lib/uso.ts`). A porta
 * para o plano de cima só aparece quando ele existe e tem mais horas.
 */
export function NotaDoPronto({
  medidores,
  semRede,
  planoDeCima,
  aoVerPlano,
}: {
  medidores: readonly Medidor[];
  semRede: boolean;
  /** O plano à venda com mais horas de Precisão: o nome e as horas dele. */
  planoDeCima?: { nome: string; horas: string } | null;
  aoVerPlano?: () => void;
}) {
  if (medidores.length && medidores[0].acabou && !semRede) {
    return (
      <div className="q-aviso pl-nota" data-pl-momento="fim_horas" data-testid="nota-das-horas">
        <span>
          <Server aria-hidden />
          <span>
            <b>{t('As {horas} de nuvem deste mês acabaram.', { horas: horas(medidores[0].total) })}</b>{' '}
            {t('A legenda continua no aparelho, sem limite. As horas voltam no dia 1º.')}
          </span>
        </span>
        {planoDeCima && aoVerPlano && (
          <button type="button" className="q-ctl" data-pl-porta="premium" onClick={aoVerPlano}>
            {t('Ver o {plano} · {horas}', { plano: planoDeCima.nome, horas: planoDeCima.horas })}
          </button>
        )}
      </div>
    );
  }
  if (semRede) {
    return (
      <div className="q-aviso pl-nota" data-testid="nota-sem-internet">
        <span>
          <WifiOff aria-hidden />
          <span>
            <b>{t('Você está sem internet.')}</b>{' '}
            {t('A legenda roda no aparelho e nada se perde. A nuvem volta sozinha com a conexão.')}
          </span>
        </span>
      </div>
    );
  }
  return null;
}

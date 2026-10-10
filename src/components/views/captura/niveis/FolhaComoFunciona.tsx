import { Cpu, Lock, type LucideIcon, Server, ShieldCheck, Smartphone, WifiOff } from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { NivelDeServico } from '../../../../core/rota/politicaDeRota';
import {
  type EscolhaDeNivel,
  horas,
  type MarcaDoSelo,
  type Medidor,
  NIVEIS,
} from '../../../../lib/captura/nivelDeServico';
import { type SeloDaFala, textoDoSelo } from '../../../../lib/captura/seloDaFala';
import { t } from '../../../../lib/i18n';
import { langLabelNaUI } from '../../../../lib/languages';
import FolhaDeBaixo from '../celular/FolhaDeBaixo';
import { ICONE_DO_NIVEL, type NivelDoSeletor } from './pecas';

const ICONE_DO_AGORA: Record<MarcaDoSelo['icone'], LucideIcon> = {
  cpu: Cpu,
  smartphone: Smartphone,
  server: Server,
  'wifi-off': WifiOff,
};

/** `linhaDoMedidor()` de `planos4.js:372-373`. */
function LinhaDoMedidor({ m }: { m: Medidor }) {
  const Icone = ICONE_DO_NIVEL[m.nivel];
  const nome = t(NIVEIS[m.nivel].nome);
  return (
    <div className="pl-med-linha" data-tom={m.acabou ? 'fim' : m.pct >= 85 ? 'pouco' : ''}>
      <span className="pl-med-topo">
        <b>
          <Icone aria-hidden /> {nome}
        </b>
        <span>
          {m.acabou
            ? t('acabou · {total} usadas', { total: horas(m.total) })
            : t('{usado} de {total}', { usado: horas(m.usado), total: horas(m.total) })}
        </span>
      </span>
      <span
        className="q-barra"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={m.pct}
        aria-label={t('Nuvem no nível {nivel} neste mês', { nivel: nome })}
      >
        <span style={{ width: `${Math.max(m.pct, 2)}%` }} />
      </span>
    </div>
  );
}

/**
 * A FOLHA "COMO ISTO FUNCIONA" — `abrirComo()` de `planos4.js:371-437`: o nível de agora e o porquê, os
 * três níveis, a nuvem do mês, como o app escolhe sozinho e o que é enviado.
 *
 * O QUE MUDOU DO TEXTO DO PROTÓTIPO, PORQUE A FOLHA SÓ AFIRMA O QUE O CÓDIGO FAZ:
 *   - "Agora" e o porquê são o selo da fala e o motivo da política (`seloDaFala.ts`), não as frases de
 *     exemplo de `nivelAgora()`;
 *   - "Como o app escolhe sozinho" descreve a rota de HOJE (`escolhaDeHoje`, `politicaDeRota.ts`): quem
 *     tem nuvem no plano vai à nuvem primeiro. O protótipo descreve a política nova ("nuvem só quando
 *     vale a pena"), que continua desligada;
 *   - "O que é enviado" não diz "com a ordem de não guardar" nem fala de anúncio: o nosso servidor não
 *     grava o áudio, mas a retenção do provedor é configuração de conta ainda não conferida. Fica a
 *     frase do selo: o áudio vai para o nosso servidor.
 */
export default function FolhaComoFunciona({
  selo,
  marca,
  niveis,
  emUso,
  medidores,
  escolha,
  modelo,
  aoEscolher,
  aoAutomatico,
  aoVerPlanos,
  aoVerModelo,
  aoFechar,
}: {
  /** O selo da fala; `null` = ainda não há o que afirmar (o bloco "Agora" não aparece). */
  selo: SeloDaFala | null;
  marca: MarcaDoSelo | null;
  niveis: readonly NivelDoSeletor[];
  emUso: NivelDeServico | null;
  medidores: readonly Medidor[];
  /** A preferência gravada: `auto` desliga o botão "Voltar à escolha automática". */
  escolha: EscolhaDeNivel;
  /** A linha do modelo local ("Modelo local · 589 MB"); ausente fora do nível "No aparelho". */
  modelo?: string | null;
  /** Escolher um nível SEM cadeado (grava a preferência). O com cadeado fecha a folha e abre a dele. */
  aoEscolher: (n: NivelDeServico) => void;
  aoAutomatico: () => void;
  /** Ausente = sem oferta (perfil protegido, edição estática). */
  aoVerPlanos?: () => void;
  aoVerModelo?: () => void;
  aoFechar: () => void;
}) {
  const folha = useRef<HTMLDialogElement>(null);
  const depois = useRef<(() => void) | null>(null);
  /* `focarFolha()` de `anuncios.js:574`. */
  useEffect(() => {
    const d = folha.current;
    if (!d) return;
    d.setAttribute('tabindex', '-1');
    d.focus({ preventScroll: true });
  }, []);
  const fecharE = (faz: () => void) => {
    depois.current = faz;
    folha.current?.close();
  };

  const texto = selo ? textoDoSelo(selo, t, langLabelNaUI) : null;
  const Agora = marca ? ICONE_DO_AGORA[marca.icone] : null;

  return (
    <FolhaDeBaixo
      titulo={t('Ações')}
      classe="pj-como-folha ad-folha pl-como-folha"
      doPrototipo
      refDaFolha={folha}
      aoFechar={() => {
        const faz = depois.current;
        depois.current = null;
        aoFechar();
        faz?.();
      }}
    >
      <div className="pj-como pl-como" data-testid="como-isto-funciona">
        <span className="label-mono">{t('Onde a sua fala é processada')}</span>
        <h2>{t('Como isto funciona')}</h2>
        {selo && marca && Agora && texto && (
          <div className="pl-agora" data-tom={marca.tom} data-testid="nivel-de-agora">
            <span className="q-ic">
              <Agora aria-hidden />
            </span>
            <div>
              {/* Antes da primeira fala o selo diz o que VAI acontecer, e a folha não afirma "agora". */}
              <b>{selo.confirmado ? t('Agora: {onde}', { onde: t(selo.etiqueta) }) : t(selo.etiqueta)}</b>
              <span className="ad-sub">{texto.motivo || t(selo.detalhe)}</span>
            </div>
          </div>
        )}
        <p className="folha-rotulo">{niveis.length === 3 ? t('Os três níveis') : t('Os níveis')}</p>
        <div className="pj-nivs pl-nivs" role="radiogroup" aria-label={t('Nível de serviço')}>
          {niveis.map(({ nivel, tranca, plano }) => {
            const Icone = tranca ? Lock : ICONE_DO_NIVEL[nivel];
            const selinho = tranca ? (plano ?? t('em breve')) : nivel === 'aparelho' ? t('grátis') : t('no seu plano');
            return (
              <button
                key={nivel}
                type="button"
                className="pj-niv"
                role="radio"
                aria-checked={emUso === nivel}
                data-pl-nivel={nivel}
                /* `planos4.js:415-419`: o nível com cadeado fecha esta folha e abre a dele; o outro é
                   escolhido aqui mesmo, com a folha aberta. */
                onClick={() => (tranca ? fecharE(() => aoEscolher(nivel)) : aoEscolher(nivel))}
              >
                <b>
                  <Icone aria-hidden /> {t(NIVEIS[nivel].nome)}
                </b>
                <span>{t(NIVEIS[nivel].curto)}</span>
                <i className={`pl-selo${tranca ? ' off' : ''}`}>{selinho}</i>
              </button>
            );
          })}
        </div>
        {medidores.length > 0 && (
          <>
            <p className="folha-rotulo">{t('Nuvem deste mês')}</p>
            <div className="pl-med">
              {medidores.map((m) => (
                <LinhaDoMedidor key={m.nivel} m={m} />
              ))}
              <p className="pj-como-ajudas">
                {t('Quando as horas acabam, a legenda segue no aparelho, sem travar nada. Elas voltam no dia 1º.')}
              </p>
            </div>
          </>
        )}
        <p className="folha-rotulo">{t('Como o app escolhe sozinho')}</p>
        <ol className="ad-lista pl-passos">
          <li>
            <Cpu aria-hidden />
            <span>
              <b>{t('O modelo que roda no seu aparelho.')}</b>{' '}
              {t('É grátis, e é o caminho de quem não tem nuvem no plano.')}
            </span>
          </li>
          <li>
            <Smartphone aria-hidden />
            <span>
              <b>{t('Um recurso do próprio aparelho.')}</b>{' '}
              {t('O reconhecimento de fala e o tradutor do navegador, quando existem.')}
            </span>
          </li>
          <li>
            <Server aria-hidden />
            <span>
              <b>{t('Nuvem, quando o seu plano tem horas.')}</b>{' '}
              {t('Ela entra primeiro, e o modelo do aparelho fica de reserva.')}
            </span>
          </li>
          <li>
            <WifiOff aria-hidden />
            <span>
              <b>{t('Sem internet ou sem horas, volta para o aparelho.')}</b> {t('Nada trava e nada é cobrado a mais.')}
            </span>
          </li>
        </ol>
        <p className="folha-rotulo">{t('O que é enviado')}</p>
        <ul className="ad-lista">
          <li>
            <ShieldCheck aria-hidden />
            <span>
              <b>{t('No aparelho:')}</b> {t('nada. O áudio não sai daqui.')}
            </span>
          </li>
          <li>
            <Server aria-hidden />
            <span>
              <b>{t('Na nuvem:')}</b>{' '}
              {t(
                'só o trecho de fala que está sendo legendado e o texto a traduzir. O áudio vai para o nosso servidor.',
              )}
            </span>
          </li>
          <li>
            <Smartphone aria-hidden />
            <span>
              <b>{t('Pelo navegador:')}</b>{' '}
              {t(
                'quando o reconhecimento de fala do navegador não roda no aparelho, o áudio vai para o serviço de fala do navegador, pelas regras dele. Só com a sua autorização.',
              )}
            </span>
          </li>
        </ul>
        <div className="ad-confirma-pe">
          <button
            type="button"
            className="btn btn-outline"
            data-pl-f="auto"
            disabled={escolha === 'auto'}
            onClick={aoAutomatico}
          >
            {escolha === 'auto' ? t('Escolha automática ligada') : t('Voltar à escolha automática')}
          </button>
          {aoVerPlanos && (
            <button type="button" className="btn btn-solid" data-pl-f="planos" onClick={() => fecharE(aoVerPlanos)}>
              {t('Ver os planos')}
            </button>
          )}
        </div>
        {modelo && aoVerModelo && (
          <p className="ad-confirma-nota">
            <span>{modelo}.</span>
            <button type="button" className="ad-sem" data-pl-f="modelo" onClick={() => fecharE(aoVerModelo)}>
              {t('Ver o modelo')}
            </button>
          </p>
        )}
      </div>
    </FolhaDeBaixo>
  );
}

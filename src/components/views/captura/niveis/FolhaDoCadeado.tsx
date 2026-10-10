import { Cpu, Target, WalletCards } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { PLAN_MATRIX, type PlanoPago } from '../../../../core/planos';
import { brl } from '../../../../lib/assinatura';
import { NIVEIS, type QuemTemONivel } from '../../../../lib/captura/nivelDeServico';
import { numero, t } from '../../../../lib/i18n';
import FolhaDeBaixo from '../celular/FolhaDeBaixo';
import { ICONE_DO_NIVEL } from './pecas';

/** As quatro caixas de aparelho do protótipo (`DISPS`, `planos4.js:24-30`). */
export type AparelhoDoNivel = 'pc' | 'fraco' | 'celular' | 'quest';

const nome = (p: PlanoPago): string => t(PLAN_MATRIX[p].rotulo);
const h = (n: number | null): string => (n === null ? '' : numero(n));

/**
 * "Quando vale a pena" (`planos4.js:336-339`), por aparelho. A frase do Quest mudou por decisão do dono
 * (01/10 e `quatroPlanos.ts`): no Quest o inglês roda no aparelho, então a nuvem não é "o único jeito".
 */
function valeAPena(nivel: 'precisao' | 'aovivo', aparelho: AparelhoDoNivel): string {
  if (nivel === 'aovivo')
    return t(
      'Vale a pena numa conversa de verdade: rua, viagem, reunião, aula. Para estudar com vídeo, a Precisão já basta.',
    );
  return {
    pc: t(
      'Neste computador, vale para português, áudio com barulho e várias pessoas falando. Para inglês limpo, o aparelho já chega perto.',
    ),
    fraco: t('Neste computador vale quase sempre: menos erro e menos espera.'),
    celular: t('No celular vale para sessão longa e contínua, sem a legenda reiniciar a cada frase.'),
    quest: t('No Quest o inglês roda no aparelho. Vale para os outros idiomas e para áudio com barulho.'),
  }[aparelho];
}

/** "Quem tem" (`planos4.js:340`), com os planos e as horas da matriz. */
function quemTem(nivel: 'precisao' | 'aovivo', quem: readonly QuemTemONivel[]): string {
  const [a, b] = quem;
  if (!a) return '';
  if (nivel === 'aovivo') {
    const frase = t('Só o plano {plano} tem: {h} h por mês.', { plano: nome(a.plano), h: h(a.horasNoMes) });
    return a.aVenda ? frase : `${frase} ${t('Ele ainda não está à venda.')}`;
  }
  const primeira = t('No {plano} são {h} h por mês.', { plano: nome(a.plano), h: h(a.horasNoMes) });
  return b ? `${primeira} ${t('No {plano}, {h} h.', { plano: nome(b.plano), h: h(b.horasNoMes) })}` : primeira;
}

/**
 * A FOLHA DO NÍVEL COM CADEADO — `abrirTranca()` de `planos4.js:330-364`: o que é, quando vale a pena
 * neste aparelho, quem tem, o que a pessoa já tem, e a porta para a tela Planos.
 *
 * O dado é o do app: os planos e as horas vêm da matriz (`core/planos.ts`), o preço do plano, e a porta
 * só nomeia um plano que está à venda. A amostra por anúncio do protótipo (`pl-amostra`) NÃO entra: a
 * flag `anuncios` ainda não existe (anotado em `fidelidade/ficou-de-fora.md`).
 */
export default function FolhaDoCadeado({
  nivel,
  aparelho,
  quem,
  jaIncluso = false,
  aoFechar,
  aoVerPlano,
  aoComo,
}: {
  nivel: 'precisao' | 'aovivo';
  aparelho: AparelhoDoNivel;
  /** Os planos que têm o nível (`quemTemONivel`). */
  quem: readonly QuemTemONivel[];
  /**
   * O plano da pessoa JÁ declara o nível, e o cadeado é porque o transporte ainda não existe (o "Ao
   * vivo" de hoje). Não há plano a oferecer: a folha diz isso em vez de vender o que a pessoa já tem.
   */
  jaIncluso?: boolean;
  aoFechar: () => void;
  /** A porta para a tela Planos, com o plano a destacar. Ausente = sem oferta (perfil protegido). */
  aoVerPlano?: (plano: PlanoPago | null) => void;
  aoComo: () => void;
}) {
  const folha = useRef<HTMLDialogElement>(null);
  /** O que acontece DEPOIS de a folha fechar (`fecharFolhaDeBaixo()` e o `setTimeout` de `planos4.js:359-362`). */
  const depois = useRef<(() => void) | null>(null);
  /* `focarFolha()` de `anuncios.js:574`: o foco vai para a folha, não para o primeiro botão. */
  useEffect(() => {
    const d = folha.current;
    if (!d) return;
    d.setAttribute('tabindex', '-1');
    d.focus({ preventScroll: true });
  }, []);

  const N = NIVEIS[nivel];
  const Icone = ICONE_DO_NIVEL[nivel];
  const dono = quem[0] ?? null;
  const porta = dono?.aVenda ? dono.plano : null;
  const preco = porta ? PLAN_MATRIX[porta].precoMensalBrl : null;
  const fecharE = (faz: (() => void) | null) => {
    depois.current = faz;
    folha.current?.close();
  };

  return (
    <FolhaDeBaixo
      titulo={t('Ações')}
      classe="pj-como-folha ad-folha"
      doPrototipo
      refDaFolha={folha}
      aoFechar={() => {
        const faz = depois.current;
        depois.current = null;
        aoFechar();
        faz?.();
      }}
    >
      <div className="pj-como ad-confirma pl-tranca" data-testid="folha-do-cadeado">
        <span className="label-mono">
          {jaIncluso ? t('Nível de serviço · ainda não disponível') : t('Nível de serviço · com cadeado no seu plano')}
        </span>
        <h2>
          {jaIncluso
            ? t('O nível Ao vivo ainda não está disponível')
            : nivel === 'aovivo'
              ? t('O nível Ao vivo é do plano {plano}', { plano: dono ? nome(dono.plano) : '' })
              : t('A Precisão começa no plano {plano}', { plano: dono ? nome(dono.plano) : '' })}
        </h2>
        <ul className="ad-lista">
          <li>
            <Icone aria-hidden />
            <span>
              <b>{t('O que é.')}</b> {t(N.longo)}
            </span>
          </li>
          <li>
            <Target aria-hidden />
            <span>
              <b>{t('Quando vale a pena.')}</b> {valeAPena(nivel, aparelho)}
            </span>
          </li>
          <li>
            <WalletCards aria-hidden />
            <span>
              <b>{t('Quem tem.')}</b>{' '}
              {jaIncluso
                ? t('O seu plano já inclui este nível. Ele passa a valer aqui quando ficar pronto.')
                : quemTem(nivel, quem)}
            </span>
          </li>
          <li>
            <Cpu aria-hidden />
            <span>
              <b>{t('O que você já tem.')}</b>{' '}
              {t('O nível No aparelho continua grátis e sem limite. Nada do que você usa hoje depende disto.')}
            </span>
          </li>
        </ul>
        <div className="ad-confirma-pe">
          <button type="button" className="btn btn-outline" data-pl-f="nao" onClick={() => fecharE(null)}>
            {jaIncluso || !aoVerPlano ? t('Fechar') : t('Agora não')}
          </button>
          {!jaIncluso && aoVerPlano && (
            <button
              type="button"
              className="btn btn-solid"
              data-pl-f="porta"
              onClick={() => fecharE(() => aoVerPlano(porta))}
            >
              {porta && preco !== null
                ? t('Ver o {plano} · {preco}', { plano: nome(porta), preco: brl(preco) })
                : t('Ver os planos')}
            </button>
          )}
        </div>
        <p className="ad-confirma-nota">
          <span>{jaIncluso ? '' : t('Trocar de plano nunca apaga o que você já gravou.')}</span>
          <button type="button" className="ad-sem" data-pl-f="como" onClick={() => fecharE(aoComo)}>
            {t('Como isto funciona')}
          </button>
        </p>
      </div>
    </FolhaDeBaixo>
  );
}

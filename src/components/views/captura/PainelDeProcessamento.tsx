import '../../../styles/painelDeProcessamento.css';

import {
  BatteryLow,
  ChevronRight,
  CircleQuestionMark,
  Cloud,
  Cpu,
  Gauge,
  HardDrive,
  Languages,
  Lock,
  type LucideIcon,
  Mic,
} from 'lucide-react';
import { type ReactNode, type RefObject, useEffect, useId, useRef, useState } from 'react';

import { horas } from '../../../lib/captura/nivelDeServico';
import {
  type CotaDoPainel,
  cotasDoUso,
  type LinhaDoMotor,
  type OndeRoda,
  ROTULO_DO_ONDE,
} from '../../../lib/captura/painelDoProcessamento';
import { t } from '../../../lib/i18n';
import type { UsoDoMes } from '../../../lib/uso';
import { Barra } from '../../ui';
import FolhaDeBaixo from './celular/FolhaDeBaixo';

/** A seta do fim das linhas: 16 px, como as linhas da folha "Como isto funciona". */
const SETA = { width: 16, height: 16 } as const;

export type EscolhaDoPainel = 'aparelho' | 'nuvem';

/**
 * O PAINEL DE PROCESSAMENTO DA CAPTURA — o que o selo compacto do topo abre (plano 2026-10-23, Task 4;
 * desenho do popover "Usage" que o dono mandou): onde a fala roda, a escolha Aparelho | Nuvem, quem
 * transcreve e quem traduz, as cotas do mês e os caminhos para o resto.
 *
 *  - Computador: um popover ancorado no selo (`role="dialog"`, não modal). Esc e o clique fora fecham,
 *    e o foco volta ao selo. Fica no fluxo do topo (`position: absolute` sob o selo): não lê
 *    `getBoundingClientRect`, então o zoom do texto (P/M/G no body) não o desloca.
 *  - Celular (≤ 720 px): a folha de baixo de sempre (`FolhaDeBaixo`), com o foco preso e o fundo inerte.
 *
 * O segmentado grava a MESMA escolha da aba Processamento dos Ajustes (`lib/escolhaDoProcessamento`):
 * quem chama recebe só `aoEscolher`. Nuvem trancada (plano sem nuvem, perfil protegido) tem cadeado e
 * uma frase que diz o que continua funcionando; nunca uma oferta.
 *
 * As cotas só aparecem com a resposta de `/api/me/uso` e um teto de verdade: sem rede, o painel abre
 * sem elas.
 */
export default function PainelDeProcessamento({
  onde,
  escolha,
  nuvem,
  aoEscolher,
  transcricao,
  traducao,
  aoVerModelo,
  carregarUso,
  aoModelosNoAparelho,
  aoUsoEPlano,
  aoComoFunciona,
  celular,
  ancora,
  aoFechar,
}: {
  /** Onde a fala roda agora, pelo selo. `null` = ainda não há o que afirmar. */
  onde: OndeRoda | null;
  /** O lado marcado do segmentado. */
  escolha: EscolhaDoPainel;
  /** A nuvem trancada e o porquê (já traduzido). `null` = livre. */
  nuvem: { trancada: true; porque: string } | null;
  aoEscolher: (e: EscolhaDoPainel) => void;
  transcricao: LinhaDoMotor | null;
  traducao: LinhaDoMotor | null;
  /** Abre "Modelo no dispositivo". */
  aoVerModelo?: () => void;
  carregarUso: () => Promise<UsoDoMes | null>;
  /** Ajustes → Processamento. Ausente (gravando) = sem o link. */
  aoModelosNoAparelho?: () => void;
  /** Planos. Ausente = sem oferta (perfil protegido, edição estática). */
  aoUsoEPlano?: () => void;
  aoComoFunciona: () => void;
  celular: boolean;
  /** O selo: o foco volta para ele quando o popover fecha. */
  ancora: RefObject<HTMLElement | null>;
  aoFechar: () => void;
}) {
  const idTitulo = useId();
  const caixa = useRef<HTMLDivElement>(null);
  const folha = useRef<HTMLDialogElement>(null);
  const [cotas, setCotas] = useState<CotaDoPainel[]>([]);
  const fecharRef = useRef(aoFechar);
  fecharRef.current = aoFechar;

  /* As cotas do mês, uma vez por abertura. Sem resposta, nada (nenhum número inventado). */
  useEffect(() => {
    let vivo = true;
    void carregarUso()
      .then((u) => vivo && setCotas(cotasDoUso(u)))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uma leitura por abertura
  }, []);

  /* POPOVER: o foco entra no painel; Esc e o clique fora fecham, com o foco de volta no selo. */
  useEffect(() => {
    if (celular) return;
    const el = caixa.current;
    el?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus({ preventScroll: true });
    const fecharEVoltar = () => {
      fecharRef.current();
      ancora.current?.focus({ preventScroll: true });
    };
    const aoTecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      fecharEVoltar();
    };
    const aoApontar = (e: PointerEvent) => {
      const alvo = e.target as Node | null;
      if (!alvo || el?.contains(alvo) || ancora.current?.contains(alvo)) return;
      fecharEVoltar();
    };
    document.addEventListener('keydown', aoTecla, true);
    document.addEventListener('pointerdown', aoApontar, true);
    return () => {
      document.removeEventListener('keydown', aoTecla, true);
      document.removeEventListener('pointerdown', aoApontar, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- liga uma vez por abertura
  }, [celular]);

  /** Fecha o painel e então faz (a folha fecha pelo `<dialog>`, para a animação de saída). */
  const depois = useRef<(() => void) | null>(null);
  const fecharE = (faz: () => void) => {
    if (celular && folha.current) {
      depois.current = faz;
      folha.current.close();
      return;
    }
    fecharRef.current();
    faz();
  };

  const corpo = (
    <div className="pp" data-testid="painel-de-processamento">
      <header className="pp-cab">
        <h2 id={idTitulo}>{t('Processamento')}</h2>
        {onde && <span className="pp-onde">{t(ROTULO_DO_ONDE[onde])}</span>}
      </header>

      <div className="pp-seg" role="radiogroup" aria-label={t('Onde a fala é processada')}>
        <BotaoDoSeg
          icone={Cpu}
          rotulo={t('Aparelho')}
          marcado={escolha === 'aparelho'}
          aoEscolher={() => aoEscolher('aparelho')}
        />
        <BotaoDoSeg
          icone={nuvem ? Lock : Cloud}
          rotulo={t('Nuvem')}
          marcado={escolha === 'nuvem'}
          trancado={!!nuvem}
          aoEscolher={() => aoEscolher('nuvem')}
        />
      </div>
      {nuvem && <p className="pp-nota">{nuvem.porque}</p>}

      <div className="pp-lista">
        {transcricao && (
          <Linha
            icone={Mic}
            titulo={t('Transcrição')}
            detalhe={`${t(transcricao.nome)} · ${t(ROTULO_DO_ONDE[transcricao.onde])}`}
            aoTocar={aoVerModelo && (() => fecharE(aoVerModelo))}
          />
        )}
        {traducao && (
          <Linha
            icone={Languages}
            titulo={t('Tradução')}
            detalhe={`${t(traducao.nome)} · ${t(ROTULO_DO_ONDE[traducao.onde])}`}
            aoTocar={aoVerModelo && (() => fecharE(aoVerModelo))}
          />
        )}
      </div>

      {cotas.length > 0 && (
        <div className="pp-lista pp-cotas" data-testid="cotas-do-painel">
          {cotas.map((c) => (
            <LinhaDaCota key={c.qual} cota={c} />
          ))}
        </div>
      )}

      <hr className="pp-divisa" />
      <div className="pp-lista pp-pe">
        {aoModelosNoAparelho && (
          <Linha icone={HardDrive} titulo={t('Modelos no aparelho')} aoTocar={() => fecharE(aoModelosNoAparelho)} />
        )}
        {aoUsoEPlano && <Linha icone={Gauge} titulo={t('Uso e plano')} aoTocar={() => fecharE(aoUsoEPlano)} />}
        <Linha icone={CircleQuestionMark} titulo={t('Como isto funciona')} aoTocar={() => fecharE(aoComoFunciona)} />
      </div>
    </div>
  );

  if (celular) {
    return (
      <FolhaDeBaixo
        titulo={t('Processamento')}
        classe="pp-folha"
        doPrototipo
        refDaFolha={folha}
        aoFechar={() => {
          const faz = depois.current;
          depois.current = null;
          fecharRef.current();
          faz?.();
        }}
      >
        {corpo}
      </FolhaDeBaixo>
    );
  }
  return (
    <div ref={caixa} className="pp-pop" role="dialog" aria-labelledby={idTitulo}>
      {corpo}
    </div>
  );
}

function BotaoDoSeg({
  icone: Icone,
  rotulo,
  marcado,
  trancado = false,
  aoEscolher,
}: {
  icone: LucideIcon;
  rotulo: string;
  marcado: boolean;
  trancado?: boolean;
  aoEscolher: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      className="pp-seg-op"
      aria-checked={marcado}
      aria-disabled={trancado || undefined}
      onClick={trancado || marcado ? undefined : aoEscolher}
    >
      <Icone aria-hidden />
      <span>{rotulo}</span>
    </button>
  );
}

function Linha({
  icone: Icone,
  titulo,
  detalhe,
  fim,
  aoTocar,
}: {
  icone: LucideIcon;
  titulo: string;
  detalhe?: string;
  fim?: ReactNode;
  aoTocar?: () => void;
}) {
  const miolo = (
    <>
      <span className="q-ic" aria-hidden="true">
        <Icone />
      </span>
      <span>
        <b>{titulo}</b>
        {detalhe && <small>{detalhe}</small>}
      </span>
      {(fim || aoTocar) && (
        <span className="q-fim" aria-hidden="true">
          {fim}
          {aoTocar && <ChevronRight style={SETA} />}
        </span>
      )}
    </>
  );
  return aoTocar ? (
    <button type="button" className="q-linha pp-linha" onClick={aoTocar}>
      {miolo}
    </button>
  ) : (
    <div className="q-linha pp-linha">{miolo}</div>
  );
}

function LinhaDaCota({ cota }: { cota: CotaDoPainel }) {
  const titulo = cota.qual === 'nuvem' ? t('Nuvem neste mês') : t('Reserva para aparelho fraco');
  const detalhe = t('{usado} de {total}', { usado: horas(cota.usado), total: horas(cota.total) });
  return (
    <div
      className="pp-cota"
      data-testid={`cota-${cota.qual}`}
      data-tom={cota.acabou ? 'fim' : cota.pct >= 85 ? 'pouco' : ''}
    >
      <div className="q-linha pp-linha">
        <span className="q-ic" aria-hidden="true">
          {cota.qual === 'nuvem' ? <Cloud /> : <BatteryLow />}
        </span>
        <span>
          <b>{titulo}</b>
          <small>{detalhe}</small>
        </span>
        <span className="q-fim pp-pct">{`${cota.pct}%`}</span>
      </div>
      <Barra
        pct={cota.pct}
        tamanho="fina"
        tom={cota.acabou ? 'warn' : 'accent'}
        rotuloAcessivel={titulo}
        className="pp-barra"
      />
    </div>
  );
}

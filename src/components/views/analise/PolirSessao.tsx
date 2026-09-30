import { Cloud, Loader2, Lock, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { FalhaDaNuance, PolidaDaFala } from '../../../data/apiDaNuance';
import { contarPolimento, type FalaParaPolir, polirSessao } from '../../../lib/analise/polimentoDaSessao';
import { useConsentimentoDeNuvem } from '../../../lib/consentimentoDeNuvem';
import { t } from '../../../lib/i18n';
import { nuanceDoPolimentoDasPreferencias } from '../../../lib/traducao/preferenciasDaNuance';

export type VersaoDaTraducao = 'original' | 'polida';

type Fase =
  | { f: 'parado' }
  | { f: 'polindo'; bloco: number; feitos: number; total: number; cancelando: boolean }
  | { f: 'pausado' }
  | { f: 'erro'; motivo: FalhaDaNuance };

function fraseDaFalha(m: FalhaDaNuance): string {
  switch (m) {
    case 'nuvem_ocupada':
      return t('A nuvem está ocupada agora. Tente de novo em instantes.');
    case 'em_andamento':
      return t('Esta sessão já está sendo polida em outra janela. Tente de novo em instantes.');
    case 'sem_conta':
      return t('Entre na sua conta para usar a Tradução Nuance.');
    case 'exige_nuance':
      return t('Este recurso faz parte da Tradução Nuance.');
    default:
      return t('Não deu para polir agora. Tente de novo em instantes.');
  }
}

/**
 * "POLIR A TRADUÇÃO DA SESSÃO" NA ANÁLISE (D5 da Fase D) — carregado por `lazy()`: a UI nova não
 * entra no JS inicial.
 *
 * COM A NUANCE (e a IA de nuvem autorizada): o botão percorre os blocos da sessão
 * (`lib/analise/polimentoDaSessao.ts`), com o progresso por bloco, cancelar (para depois do bloco em
 * curso, que já foi pago) e retomar (do próximo bloco pendente — o servidor não cobra de novo o que já
 * foi polido). As polidas chegam por `aoPolir` e a tela passa a mostrá-las; "Original | Polida"
 * alterna. A tradução original NUNCA é sobrescrita.
 *
 * SEM A NUANCE: o MESMO botão, com cadeado, abre o texto POSITIVO e — fora do perfil protegido, quem
 * chama decide passando `aoConhecer` — o convite. Nenhum pedido sai: o servidor recusaria (402).
 */
export default function PolirSessao({
  sessionId,
  utterances,
  disponivel,
  versao,
  aoTrocarVersao,
  aoPolir,
  aoConhecer,
}: {
  sessionId: string;
  utterances: ReadonlyArray<FalaParaPolir>;
  /** A pessoa tem a Tradução Nuance (`traducaoNuance`); sem ela, o botão vem com cadeado. */
  disponivel: boolean;
  versao: VersaoDaTraducao;
  aoTrocarVersao: (v: VersaoDaTraducao) => void;
  /** As polidas de um bloco, para a tela guardar ao lado das originais. */
  aoPolir: (polidas: ReadonlyArray<PolidaDaFala>) => void;
  /** O convite ao Premium. Ausente no perfil protegido: ele vê o cadeado e o texto, sem venda. */
  aoConhecer?: () => void;
}) {
  const { consentiu, autorizar } = useConsentimentoDeNuvem();
  const contagem = useMemo(() => contarPolimento(utterances), [utterances]);
  const [fase, setFase] = useState<Fase>({ f: 'parado' });
  const [convite, setConvite] = useState(false);
  const controle = useRef<AbortController | null>(null);
  /* As falas mais recentes para a fila (retomar lê o que a tela já aplicou). */
  const falas = useRef(utterances);
  falas.current = utterances;
  /* Saiu da tela (ou trocou de sessão — quem monta usa a sessão como `key`): a fila para. O bloco que
     já foi ao provedor o servidor grava, e ele não é cobrado de novo na próxima vez. */
  useEffect(() => () => controle.current?.abort(), []);

  if (contagem.linhasPolidaveis === 0) return null;

  const polir = async () => {
    const ctl = new AbortController();
    controle.current = ctl;
    let mostrou = false;
    const { polirBloco } = await import('../../../data/apiDaNuance');
    const nuance = nuanceDoPolimentoDasPreferencias();
    const fim = await polirSessao({
      utterances: falas.current,
      pedirBloco: (bloco) => polirBloco({ sessionId, bloco, ...nuance }, ctl.signal),
      aoPolir: (polidas) => {
        aoPolir(polidas);
        if (!mostrou && polidas.length) {
          mostrou = true;
          aoTrocarVersao('polida');
        }
      },
      aoAvancar: ({ bloco, feitos, total }) =>
        setFase((f) =>
          bloco === null
            ? { f: 'parado' }
            : { f: 'polindo', bloco, feitos, total, cancelando: f.f === 'polindo' && f.cancelando },
        ),
      sinal: ctl.signal,
    });
    controle.current = null;
    setFase(
      fim.fim === 'erro'
        ? { f: 'erro', motivo: fim.motivo }
        : fim.fim === 'cancelado'
          ? { f: 'pausado' }
          : { f: 'parado' },
    );
  };

  const cancelar = () => {
    controle.current?.abort();
    setFase((f) => (f.f === 'polindo' ? { ...f, cancelando: true } : f));
  };

  const completo = contagem.pendentes.length === 0;
  const temPolidas = contagem.linhasPolidas > 0;
  const blocos = { feitos: contagem.completos, total: contagem.total };

  if (!disponivel) {
    return (
      <div className="polir-sessao" data-testid="polir-sessao" style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
        <div className="linha" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-outline peq"
            aria-expanded={convite}
            onClick={() => setConvite((v) => !v)}
          >
            <Lock aria-hidden /> {t('Polir a tradução da sessão')}
          </button>
        </div>
        {convite && (
          <div className="aviso-info" role="note" data-testid="convite-do-polimento">
            <Lock aria-hidden />
            <span style={{ flex: 1 }}>
              {t(
                'Com a Tradução Nuance do Premium, a tradução da sessão inteira é revisada com o contexto da conversa, e a original continua guardada.',
              )}{' '}
              {t('Sua legenda já usa a Tradução rápida ao vivo, sem esperar.')}
            </span>
            {aoConhecer && (
              <button type="button" className="btn btn-outline peq" onClick={aoConhecer}>
                <Sparkles aria-hidden /> {t('Conhecer o Premium')}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (!consentiu) {
    return (
      <div className="aviso-info polir-sessao" role="note" data-testid="polir-sessao" style={{ marginBottom: 12 }}>
        <Cloud aria-hidden />
        <span style={{ flex: 1 }}>{t('A Tradução Nuance usa a IA de nuvem, que você ainda não autorizou.')}</span>
        <button type="button" className="btn btn-outline peq" onClick={() => void autorizar()}>
          <Cloud aria-hidden /> {t('Autorizar IA de nuvem')}
        </button>
      </div>
    );
  }

  const alternar = temPolidas && (
    <div className="seg" role="group" aria-label={t('Tradução exibida')}>
      <button type="button" aria-pressed={versao === 'original'} onClick={() => aoTrocarVersao('original')}>
        {t('Original')}
      </button>
      <button type="button" aria-pressed={versao === 'polida'} onClick={() => aoTrocarVersao('polida')}>
        {t('Polida')}
      </button>
    </div>
  );

  if (fase.f === 'polindo') {
    return (
      <div className="polir-sessao" data-testid="polir-sessao" style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
        <div className="aviso-info">
          <Loader2 className="animate-spin" aria-hidden />
          <span role="status" style={{ flex: 1 }}>
            {fase.cancelando
              ? t('Cancelando depois deste bloco…')
              : t('Polindo o bloco {n} de {total}…', { n: fase.bloco + 1, total: fase.total })}
          </span>
          {alternar}
          <button type="button" className="btn btn-outline peq" disabled={fase.cancelando} onClick={cancelar}>
            <X aria-hidden /> {t('Cancelar')}
          </button>
        </div>
        <div
          className="barra"
          role="progressbar"
          aria-label={t('Progresso do polimento')}
          aria-valuemin={0}
          aria-valuemax={fase.total}
          aria-valuenow={fase.feitos}
        >
          <span style={{ width: `${Math.round((fase.feitos / Math.max(1, fase.total)) * 100)}%` }} />
        </div>
      </div>
    );
  }

  const frase =
    fase.f === 'erro'
      ? fraseDaFalha(fase.motivo)
      : completo
        ? t('Tradução polida com o contexto da sessão. A original continua guardada.')
        : fase.f === 'pausado'
          ? t('Polimento pausado: {feitos} de {total} blocos.', blocos)
          : temPolidas
            ? t('{feitos} de {total} blocos polidos.', blocos)
            : t('Revise a tradução da sessão inteira com o contexto da conversa. A original continua guardada.');

  return (
    <div className="aviso-info polir-sessao" data-testid="polir-sessao" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
      <Sparkles aria-hidden />
      <span role="status" style={{ flex: 1, minWidth: 200 }}>
        {frase}
      </span>
      {alternar}
      {!completo && (
        <button type="button" className="btn btn-outline peq" onClick={() => void polir()}>
          <Sparkles aria-hidden />{' '}
          {temPolidas || fase.f === 'pausado' ? t('Retomar o polimento') : t('Polir a tradução da sessão')}
        </button>
      )}
    </div>
  );
}

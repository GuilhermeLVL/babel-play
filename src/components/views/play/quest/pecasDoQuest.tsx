import '../../../../styles/questJogarTelas.css';

import { ArrowLeft, type LucideIcon, X } from 'lucide-react';
import { type ReactNode, useId, useRef } from 'react';

import { numero, t } from '../../../../lib/i18n';
import { DialogoBase } from '../../../ui/Dialogo';

/**
 * AS PEÇAS QUE AS TELAS DE JOGAR REPETEM NO META QUEST (segunda rodada, 01/10/2026).
 *
 * Tudo aqui é marcação sobre as classes `.q-*` de `quest.css` e os diálogos que `questBase.css` já
 * veste: nenhuma peça guarda estado do app. Existem para as onze telas em volta dos jogos (lobby,
 * fonte, sala, antessala, fim da rodada, recordes, mapa, curadoria, trilha, pausa e tour) falarem a
 * mesma língua sem cada uma reescrever o mesmo botão de voltar ou o mesmo grupo de escolhas.
 */

/** Voltar, antes do título (`.q-ctl.q-voltar`). O nome acessível diz para onde volta. */
export function VoltarDoQuest({ rotulo, aoClicar }: { rotulo: string; aoClicar: () => void }) {
  return (
    <button type="button" className="q-ctl q-voltar" aria-label={rotulo} onClick={aoClicar}>
      <ArrowLeft aria-hidden />
    </button>
  );
}

/** Liga e desliga (`.q-interruptor`): o nome vem do `aria-label`, o estado do `aria-checked`. */
export function InterruptorDoQuest({
  ligado,
  aoTrocar,
  rotulo,
}: {
  ligado: boolean;
  aoTrocar: (ligado: boolean) => void;
  rotulo: string;
}) {
  return (
    <button
      type="button"
      className="q-interruptor"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      onClick={() => aoTrocar(!ligado)}
    />
  );
}

export interface OpcaoDoQuest {
  id: string;
  rotulo: string;
  contagem?: number;
  icone?: ReactNode;
  /** Por que a opção não pode ser escolhida. No headset não há hover: o motivo é ESCRITO abaixo. */
  motivoBloqueio?: string;
}

/**
 * Um grupo de escolhas: pílulas grandes que quebram de linha, com a contagem colada no rótulo.
 *
 * A opção sem material continua na tela, desligada, e o motivo aparece escrito logo abaixo do grupo
 * (nas telas de sempre ele mora no `title`, que só existe com o ponteiro parado em cima).
 */
export function OpcoesDoQuest({
  rotulo,
  opcoes,
  valor,
  aoTrocar,
  exclusiva = false,
  motivos = true,
}: {
  /** O nome do grupo para quem não vê a tela. */
  rotulo: string;
  opcoes: readonly OpcaoDoQuest[];
  valor: readonly string[];
  aoTrocar: (id: string) => void;
  /** Uma escolha só (idioma, nível): o grupo é um `radiogroup`. Senão, cada pílula liga e desliga. */
  exclusiva?: boolean;
  /** Falso onde a contagem zero na própria pílula já é o motivo (os filtros do mapa). */
  motivos?: boolean;
}) {
  const travadas = motivos ? opcoes.filter((o) => o.motivoBloqueio && !valor.includes(o.id)) : [];
  return (
    <div className="qj-escolha">
      <div className="q-abas qj-opcoes" role={exclusiva ? 'radiogroup' : 'group'} aria-label={rotulo}>
        {opcoes.map((o) => {
          const ligada = valor.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              className="q-aba"
              {...(exclusiva ? { role: 'radio' as const, 'aria-checked': ligada } : { 'aria-pressed': ligada })}
              disabled={!!o.motivoBloqueio && !ligada}
              onClick={() => aoTrocar(o.id)}
            >
              {o.icone}
              {o.rotulo}
              {o.contagem !== undefined && <span className="n">{numero(o.contagem)}</span>}
            </button>
          );
        })}
      </div>
      {travadas.length > 0 && (
        <ul className="qj-motivos">
          {travadas.map((o) => (
            <li key={o.id}>
              <b>{o.rotulo}:</b> {o.motivoBloqueio}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * O painel que abre NO CENTRO (nada desliza pela lateral): o `<dialog>` nativo de `ui/Dialogo`, com o
 * cabeçalho, o miolo que rola e, quando há, o pé fixo com as ações.
 */
export function PainelDoQuest({
  titulo,
  sobre,
  sub,
  icone: Icone,
  largo = false,
  aoFechar,
  pe,
  classe = '',
  children,
}: {
  titulo: ReactNode;
  /** O rótulo curto acima do título. */
  sobre?: ReactNode;
  sub?: ReactNode;
  icone?: LucideIcon;
  largo?: boolean;
  aoFechar: () => void;
  /** As ações do pé (`.dlg-pe`): ficam à vista enquanto o miolo rola. */
  pe?: ReactNode;
  classe?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  return (
    <DialogoBase
      classe={`qj qj-painel ${largo ? 'largo' : 'medio'} ${classe}`}
      rotuloId={idTitulo}
      aoFechar={aoFechar}
      refDialogo={ref}
    >
      <div className="dlg-cab">
        {Icone && (
          <span className="q-ic" aria-hidden>
            <Icone />
          </span>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          {sobre && <p className="q-sobre">{sobre}</p>}
          <h2 id={idTitulo}>{titulo}</h2>
          {sub && <p className="qj-nota">{sub}</p>}
        </div>
        <button type="button" className="x" aria-label={t('Fechar')} onClick={() => ref.current?.close()}>
          <X aria-hidden />
        </button>
      </div>
      <div className="dlg-corpo qj-painel-corpo">{children}</div>
      {pe && <div className="dlg-pe">{pe}</div>}
    </DialogoBase>
  );
}

/** Fecha o painel que contém o elemento (o `close` nativo avisa o `aoFechar`). */
export function fecharPainelDe(el: Element | null): void {
  el?.closest('dialog')?.close();
}

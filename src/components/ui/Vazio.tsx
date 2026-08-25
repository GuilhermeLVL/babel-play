import type { ReactNode } from 'react';

/**
 * VAZIO — o estado sem conteúdo, dito de um jeito que se possa agir sobre ele.
 *
 * O DEFEITO QUE ISTO CONSERTA. Os estados vazios do app diziam o que NÃO havia e paravam ali:
 * "Nenhuma gravação ainda", "Sem palavras suficientes". Um beco. Quem chega numa tela vazia
 * geralmente chega porque quer usá-la — e a pergunta que fica é sempre "então o que eu faço?".
 *
 * DAÍ `explicacao` E `acao` SEREM SEPARADOS DO `titulo`. O título diz o estado; a explicação diz a
 * causa ("este jogo precisa de 4 palavras e você tem 3 do inglês"); a ação leva ao lugar onde isso
 * se resolve. Sem a causa, a ação parece arbitrária; sem a ação, a causa parece uma reclamação.
 *
 * A explicação é onde o app já é bom: os motivos de bloqueio dos jogos e os de descarte da
 * curadoria já vêm redigidos do core (`ROTULO_MOTIVO.conserto`). Este componente existe para que
 * eles tenham para onde ir.
 */

/** `rotulo` é `ReactNode` porque as ações de vazio quase sempre levam ícone ("🎤 Nova captura"). */
interface AcaoDeVazio {
  rotulo: ReactNode;
  aoClicar: () => void;
}

interface VazioProps {
  /** Já dimensionado pelo chamador (`w-7 h-7`). */
  icone?: ReactNode;
  titulo: string;
  /** Por que está vazio, e o que muda isso. É a parte que faltava nos vazios antigos. */
  explicacao?: ReactNode;
  acao?: AcaoDeVazio;
  /** Segunda saída, menos proeminente. */
  acaoSecundaria?: AcaoDeVazio;
  className?: string;
}

export default function Vazio({
  icone,
  titulo,
  explicacao,
  acao,
  acaoSecundaria,
  className = '',
}: VazioProps) {
  /* As classes são as do vazio do Hub, ao pixel: `border` (1px) SOBRESCREVE o 2px que `.card-panel`
     define em `--border-width-card`, e é essa borda fina tracejada que distingue "não há nada aqui"
     de um card comum. Trocar por `card-panel border-dashed` engrossaria a moldura em todo vazio. */
  return (
    <div
      className={`card-panel p-10 bg-surface border border-dashed border-border-subtle flex flex-col items-center text-center ${className}`}
    >
      {icone && (
        <div className="w-14 h-14 rounded-full bg-canvas border border-border-subtle flex items-center justify-center mb-4 text-ink-faint" aria-hidden>
          {icone}
        </div>
      )}

      <h3 className="font-display font-extrabold text-base text-ink">{titulo}</h3>

      {explicacao && (
        <p className="text-[12.5px] text-ink-muted mt-2 max-w-md">{explicacao}</p>
      )}

      {(acao || acaoSecundaria) && (
        <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
          {acao && (
            <button type="button" onClick={acao.aoClicar} className="btn-solid">
              {acao.rotulo}
            </button>
          )}
          {acaoSecundaria && (
            <button type="button" onClick={acaoSecundaria.aoClicar} className="btn-outline">
              {acaoSecundaria.rotulo}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

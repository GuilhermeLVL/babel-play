import type { LucideIcon } from 'lucide-react';
import { ChevronRight, CircleHelp, Cpu, Languages, Maximize2, ShieldCheck, Smartphone, Type, Zap } from 'lucide-react';
import type { ReactNode } from 'react';

import { t } from '../../../../lib/i18n';
import { Interruptor } from '../../vocab/Dialogo';
import FolhaDeBaixo from './FolhaDeBaixo';

function Linha({
  icone: Icone,
  titulo,
  sub,
  aoTocar,
  direita,
}: {
  icone: LucideIcon;
  titulo: ReactNode;
  sub?: ReactNode;
  aoTocar?: () => void;
  direita?: ReactNode;
}) {
  const miolo = (
    <>
      <span className="opc-ic" aria-hidden>
        <Icone />
      </span>
      <span className="opc-txt">
        {titulo}
        {sub && <small>{sub}</small>}
      </span>
      {direita ?? <ChevronRight aria-hidden className="opc-seta" />}
    </>
  );
  return aoTocar ? (
    <button type="button" className="opc-linha" onClick={aoTocar}>
      {miolo}
    </button>
  ) : (
    <div className="opc-linha">{miolo}</div>
  );
}

/**
 * AS OPÇÕES DA CAPTURA NO CELULAR — o que eram botões soltos e o diálogo de ajustes vira uma lista
 * de linhas altas (maquete aprovada, 2026-09-29). Cada linha leva ao lugar que já existia (a
 * escolha Rápido/Privado, os idiomas, os ajustes da legenda, o Foco cheio, os modelos, a ajuda);
 * a única opção nova é "Manter a tela acesa" (`telaAcesa.ts`).
 */
export default function FolhaDeOpcoes({
  modo,
  par,
  telaAcesa,
  aoTrocarModo,
  aoAbrirIdiomas,
  aoAbrirVisual,
  aoFocoCheio,
  aoAbrirModelos,
  aoAbrirAjuda,
  aoFechar,
}: {
  /** Como a sua voz é transcrita agora; `null` = sem escolha a fazer (perfil Privado, sem Web Speech). */
  modo: { privado: boolean; rotulo: string; sub: string } | null;
  par: ReactNode;
  /** `null` = o navegador não segura a tela acesa (a linha nem aparece). */
  telaAcesa: { ligada: boolean; trocar: (v: boolean) => void } | null;
  aoTrocarModo?: () => void;
  aoAbrirIdiomas: () => void;
  aoAbrirVisual: () => void;
  aoFocoCheio: () => void;
  aoAbrirModelos: () => void;
  aoAbrirAjuda: () => void;
  aoFechar: () => void;
}) {
  return (
    <FolhaDeBaixo titulo={t('Opções da captura')} aoFechar={aoFechar} classe="folha-de-opcoes">
      {modo && (
        <Linha
          icone={modo.privado ? ShieldCheck : Zap}
          titulo={t('Como transcrever')}
          sub={`${modo.rotulo} · ${modo.sub}`}
          aoTocar={aoTrocarModo}
        />
      )}
      <Linha icone={Languages} titulo={t('Idiomas')} sub={par} aoTocar={aoAbrirIdiomas} />
      <Linha icone={Type} titulo={t('Texto e tradução')} sub={t('Tamanho, ordem e quando traduzir')} aoTocar={aoAbrirVisual} />
      <Linha icone={Maximize2} titulo={t('Foco cheio')} sub={t('Só a legenda, na tela inteira')} aoTocar={aoFocoCheio} />
      {telaAcesa && (
        <Linha
          icone={Smartphone}
          titulo={t('Manter a tela acesa')}
          sub={t('Enquanto grava: com a tela apagada, o celular corta o microfone')}
          direita={
            <Interruptor
              ligado={telaAcesa.ligada}
              aoTrocar={() => telaAcesa.trocar(!telaAcesa.ligada)}
              rotulo={t('Manter a tela acesa')}
            />
          }
        />
      )}
      <Linha icone={Cpu} titulo={t('Modelos no aparelho')} sub={t('O que foi baixado e o tamanho')} aoTocar={aoAbrirModelos} />
      <Linha icone={CircleHelp} titulo={t('Ajuda')} aoTocar={aoAbrirAjuda} />
    </FolhaDeBaixo>
  );
}

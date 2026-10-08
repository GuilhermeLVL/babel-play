import { Coins, Shirt } from 'lucide-react';
import { createPortal } from 'react-dom';

import type { FonteType, ThemeType } from '../../../../lib/appearance';
import type { Carteira } from '../../../../lib/carteira';
import type { ContextoDeEquipar } from '../../../../lib/galeria/equipar';
import { t } from '../../../../lib/i18n';
import type { ItemDaLoja } from '../../../../lib/loja';
import type { AbaDaLojaV2 } from '../../../../lib/rotas';
import type { AgeProfileType, MenuPositionType } from '../../../shell/navItems';
import { Dialogo } from '../../../ui';
import VitrineV2 from '../../loja/VitrineV2';
import Personalizar from '../../Personalizar';
import PainelDePrevia, { TIPOS_COM_PREVIA, usePreviaAoVivo } from '../PainelDePrevia';

/**
 * AS FOLHAS DE PERSONALIZAR NO DESENHO NOVO — o que o protótipo não desenha na tela parada e o app
 * precisa continuar oferecendo: equipar o que não é tema, os perfis de visual, a letra e o perfil de
 * exibição, e os Créditos.
 *
 * Nada disto acrescenta peça à tela do protótipo: abre num `<dialog>` (a camada de polimento já anima
 * a entrada e a saída, `lib/polimento/dialogos.ts`), a partir do que já está na tela (as quatro
 * linhas-resumo da Coleção, o toque no que já é seu, o chip de Seeds).
 *
 * O miolo é o de sempre: `Personalizar` (o inventário inteiro, por seção) e a prateleira de Créditos
 * de `VitrineV2`. As folhas saem por um portal para o `<body>`: dentro da tela, um palco novo faria a
 * camada tratar a folha como troca de tela.
 */

/** A seção do inventário onde mora cada tipo de peça (`Inventario.tsx`, `SECOES`). */
export function secaoDoTipo(tipo: string): string {
  if (tipo === 'tema') return 'temas';
  if (tipo === 'particulas' || tipo === 'rastro') return 'efeitos';
  if (tipo === 'legenda') return 'legendas';
  if (tipo === 'cartao') return 'cartoes';
  if (tipo === 'efeito-acerto' || tipo === 'efeito-combo' || tipo === 'finalizacao') return 'jogos';
  if (tipo === 'moldura' || tipo === 'titulo') return 'perfil';
  return 'capacidades';
}

export function FolhaDoVisual({
  secao,
  theme,
  setTheme,
  fonte,
  setFonte,
  nivel,
  saldo,
  ageProfile,
  setAgeProfile,
  menuPosition,
  setMenuPosition,
  onOpenStudio,
  aoIrPara,
  aoFechar,
}: {
  /** A seção em que o inventário abre (a da linha ou da peça tocada). */
  secao: string;
  theme: ThemeType;
  setTheme: (t: ThemeType) => void;
  fonte: FonteType;
  setFonte: (f: FonteType) => void;
  nivel: number;
  saldo: number;
  ageProfile: AgeProfileType;
  setAgeProfile: (p: AgeProfileType) => void;
  menuPosition: MenuPositionType;
  setMenuPosition: (p: MenuPositionType) => void;
  onOpenStudio: () => void;
  /** Os atalhos do inventário ("Ir à Loja", "Ver no Passe"): fecha a folha e troca de aba. */
  aoIrPara: (aba: AbaDaLojaV2) => void;
  aoFechar: () => void;
}) {
  const { previa, prever, parar } = usePreviaAoVivo(theme);
  return createPortal(
    <Dialogo
      icone={Shirt}
      titulo={t('Meu visual')}
      sub={t('O que é seu, para equipar: temas, efeitos, legendas, cartões, moldura, perfis e letra.')}
      largura="largo"
      aoFechar={aoFechar}
    >
      <div className="dlg-corpo" data-testid="folha-do-visual">
        <div className="qp">
          <div className="tela qp-miolo">
            <div className="qp-pilha">
              <Personalizar
                theme={theme}
                setTheme={setTheme}
                fonte={fonte}
                setFonte={setFonte}
                nivel={nivel}
                saldo={saldo}
                ageProfile={ageProfile}
                setAgeProfile={setAgeProfile}
                menuPosition={menuPosition}
                setMenuPosition={setMenuPosition}
                onOpenStudio={onOpenStudio}
                onIrParaLoja={() => aoIrPara('loja')}
                onIrParaPasse={() => aoIrPara('temporada')}
                onIrParaConquistas={() => aoIrPara('conquistas')}
                topo={<PainelDePrevia previa={previa} aoParar={parar} soEmPrevia />}
                aoPrever={prever}
                itemEmPrevia={previa.itemId}
                tiposComPrevia={TIPOS_COM_PREVIA}
                secaoInicial={secao}
              />
            </div>
          </div>
        </div>
      </div>
    </Dialogo>,
    document.body,
  );
}

export function FolhaDeCreditos({
  nivel,
  saldo,
  carteira,
  ctxEquipar,
  equipadoAtual,
  aoMudar,
  aoFechar,
}: {
  nivel: number;
  saldo: number;
  carteira: Carteira;
  ctxEquipar: ContextoDeEquipar;
  equipadoAtual: (item: ItemDaLoja) => boolean;
  aoMudar: () => void;
  aoFechar: () => void;
}) {
  return createPortal(
    <Dialogo
      icone={Coins}
      titulo={t('Créditos')}
      sub={t('Peças avulsas, com prévia e preço. A compra pede confirmação.')}
      largura="largo"
      aoFechar={aoFechar}
    >
      <div className="dlg-corpo" data-testid="folha-de-creditos">
        <div className="qp">
          <div className="tela qp-miolo">
            <VitrineV2
              nivel={nivel}
              saldo={saldo}
              carteira={carteira}
              mostrarCreditos
              ctxEquipar={ctxEquipar}
              equipadoAtual={equipadoAtual}
              aoPrever={() => undefined}
              itemEmPrevia={null}
              tiposComPrevia={new Set()}
              aoMudar={aoMudar}
              soCreditos
            />
          </div>
        </div>
      </div>
    </Dialogo>,
    document.body,
  );
}

import '../../../../styles/assistenteAoVivo.css';
import '../../../../styles/assistenteNaPagina.css';

import { Sparkles, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef } from 'react';

import type { MarcaNaLinha } from '../../../../core/assistente/telaDoAssistente';
import type { CorrecaoDaFala } from '../../../../data/apiDoAssistente';
import { t } from '../../../../lib/i18n';
import FolhaComoRespondo from './FolhaComoRespondo';
import { rotuloDaMarca } from './TextoComMarcas';
import type { AssistenteDaJanela } from './useAssistenteAoVivo';

/** O id da fala dentro de um seletor de atributo (o `CSS.escape` falta em alguns ambientes). */
const escapar = (s: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&'));

/**
 * Para onde o foco volta quando uma folha da página fecha: o elemento que o tinha ao abrir; se ele saiu da tela (o
 * painel da frase que fechou), o `reserva` (a linha ou a bolha da fala); senão, fica onde está.
 */
function useVoltaDoFoco(aberta: boolean, reserva?: () => HTMLElement | null | undefined) {
  const antes = useRef<HTMLElement | null>(null);
  const reservaRef = useRef(reserva);
  reservaRef.current = reserva;
  useLayoutEffect(() => {
    if (!aberta) return;
    antes.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      const alvo = antes.current?.isConnected ? antes.current : reservaRef.current?.();
      alvo?.focus({ preventScroll: true });
    };
  }, [aberta]);
}

/**
 * "COMO RESPONDO?" NA PÁGINA (Fase C3): a MESMA folha da janela flutuante (`FolhaComoRespondo`), numa camada da página
 * — na captura e no Intérprete. Abre só quando o pedido foi feito na página (a janela tem a dela). O foco volta para
 * quem a abriu, ou para a fala respondida.
 */
export function ComoRespondoNaPagina({
  assistente,
  aoOuvir,
}: {
  assistente: AssistenteDaJanela;
  aoOuvir?: (texto: string, lang: string | undefined, lenta: boolean) => void;
}) {
  const c = assistente.comoRespondo;
  const aberta = c.estado !== 'fechado';
  const falaId = c.estado !== 'fechado' ? c.falaId : '';
  useVoltaDoFoco(aberta, () => {
    if (!falaId) return null;
    const id = escapar(falaId);
    return document.querySelector<HTMLElement>(`[data-fala="${id}"] .q-fala, .asst-responder[data-para="${id}"]`);
  });
  if (c.estado === 'fechado') return null;
  return (
    <div className="asst-pagina" data-testid="como-respondo-na-pagina">
      <FolhaComoRespondo
        estado={c}
        protegido={assistente.protegido}
        aoFechar={assistente.fecharComoRespondo}
        aoTentarDeNovo={() => assistente.pedirComoRespondo(c.falaId)}
        aoAutorizar={assistente.autorizarEPedir}
        aoOuvir={aoOuvir}
      />
    </div>
  );
}

/**
 * A CORREÇÃO GENTIL da própria fala (opt-in), embaixo dela: "Mais natural: …", sem vermelho e sem "erro". Fica fora
 * dos anúncios (`aria-live="off"`): quem navega lê, mas ela não interrompe a conversa.
 */
export function CorrecaoNaPagina({
  correcao,
  lang,
  className = 'asst-correcao',
}: {
  correcao: CorrecaoDaFala | undefined;
  lang: string | undefined;
  className?: string;
}) {
  if (!correcao || correcao.ok || !correcao.corrigida.trim()) return null;
  return (
    /* `span` (em bloco pelo CSS): cabe também dentro do botão da linha da captura. */
    <span className={className} aria-live="off" data-testid="correcao-da-fala">
      <Sparkles aria-hidden /> {t('Mais natural:')} <span lang={lang || undefined}>{correcao.corrigida}</span>
      {correcao.dica && <span className="asst-correcao-dica"> · {correcao.dica}</span>}
    </span>
  );
}

/**
 * O CARTÃO DE UMA MARCA no Intérprete (que não tem o cartão da palavra da captura): o trecho, o tipo e o sentido, num
 * toque ou Enter. Não modal; Esc fecha e o foco volta para a marca.
 */
export function CartaoDaMarca({ marca, lang, aoFechar }: { marca: MarcaNaLinha; lang?: string; aoFechar: () => void }) {
  const fechar = useRef<HTMLButtonElement>(null);
  useVoltaDoFoco(true);
  useEffect(() => {
    fechar.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div
      className="asst-cartao"
      role="dialog"
      aria-label={t('Palavra: {palavra}', { palavra: marca.texto })}
      data-testid="cartao-da-marca"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          aoFechar();
        }
      }}
    >
      <div className="asst-cartao-topo">
        <b lang={lang || undefined}>{marca.texto}</b>
        <button
          ref={fechar}
          type="button"
          aria-label={t('Fechar o cartão da palavra')}
          title={t('Fechar')}
          onClick={aoFechar}
        >
          <X aria-hidden />
        </button>
      </div>
      <p className="asst-cartao-tipo" data-marca={marca.tipo}>
        {rotuloDaMarca(marca)}
      </p>
      {marca.sentido && <p className="asst-cartao-sentido">{marca.sentido}</p>}
    </div>
  );
}

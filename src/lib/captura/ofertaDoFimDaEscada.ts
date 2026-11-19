/**
 * O FIM DA ESCADA LOCAL DO REGULADOR (`reguladorDaCaptura.ts`, ação `oferecer-nativo-ou-nuvem`): o aparelho não acompanha
 * a fala nem com o modelo menor. A tela oferece a nuvem de alívio (Grátis com franquia) ou dá o aviso de sempre.
 *
 * LOG E TELA ANDAM JUNTOS (auditoria de 17/11/2026): o log dizia "oferecendo nativo/nuvem" ANTES de saber se algo ia
 * aparecer, e a rodada registrava uma oferta que ninguém viu. Agora o registro sai só quando a oferta (ou o aviso)
 * foi de fato posta na tela, e diz qual das duas.
 */
export const AVISO_DO_FIM_DA_ESCADA =
  'O aparelho não está acompanhando a fala nem com o modelo menor. Para a legenda chegar a tempo, use o Chrome no computador ou autorize a transcrição em nuvem em Ajustes, Privacidade.';

export function oferecerNoFimDaEscada(o: {
  clog: (...a: unknown[]) => void;
  /** Mostra o aviso (o toast da captura). */
  avisar: (msg: string) => void;
  /** Pergunta ao servidor e MOSTRA a nuvem de alívio; `true` = mostrou. Ausente = fora do Grátis. */
  pedirNuvemDeAlivio?: () => Promise<boolean>;
}): Promise<void> {
  const avisoDeSempre = () => {
    o.avisar(AVISO_DO_FIM_DA_ESCADA);
    o.clog('regulador: fim da escada local → aviso na tela (nativo/nuvem)');
  };
  if (!o.pedirNuvemDeAlivio) {
    avisoDeSempre();
    return Promise.resolve();
  }
  return o.pedirNuvemDeAlivio().then(
    (mostrou) => {
      if (mostrou) o.clog('regulador: fim da escada local → oferta da nuvem de alívio na tela');
      else avisoDeSempre();
    },
    () => avisoDeSempre(),
  );
}

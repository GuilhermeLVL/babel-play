/**
 * QUE IDIOMAS O MODELO DE TRANSCRIÇÃO VAI OUVIR NESTA CAPTURA — a conta, pura, que alimenta a rota
 * (`routeStt`) em `pipelineDeFala.ts`.
 *
 * NA CAPTURA DE SEMPRE o modelo ouve o som do computador (o idioma do conteúdo) e, se o microfone não
 * for ao reconhecimento do navegador, a sua voz. Com as duas fontes em inglês, o modelo pode ser o só
 * de inglês (Moonshine).
 *
 * NO INTÉRPRETE, O MODELO OUVE OS DOIS IDIOMAS PELO MICROFONE: as duas pessoas falam nele, o automático
 * sempre manda o microfone ao modelo (mesmo com o "Rápido" escolhido), e o par pode mudar no meio da
 * conversa sem a rota ser refeita (relato do dono, 10/10/2026: "eu estava no inglês e botei no
 * mandarim, e travou"). A conta antiga perguntava só pelo motor do "Eu falo": com inglês do outro lado
 * e o microfone contado como "do navegador", a rota saía no modelo só de inglês, e a fala em português,
 * mandarim ou árabe virava inglês inventado. No intérprete o modelo é sempre o multilíngue.
 *
 * A conversa virtual fica como a captura de sempre: lá o som do computador é uma fonte própria, com
 * idioma declarado (ou medido, com o "Detectar" ligado, que já chega aqui em `detectar`).
 */
export interface EntradaDosIdiomasDoModelo {
  /** O cenário da captura (`captureScenarioRef`): `interprete` quando a tela do intérprete está aberta. */
  cenario: string;
  /** A conversa virtual (som do computador + microfone, direção fixa por fonte). */
  virtual: boolean;
  /** O idioma do conteúdo ("Eles falam" / "A outra pessoa fala"), ISO-639-1. */
  ouve: string;
  /** O idioma de quem segura o aparelho ("Eu falo"), ISO-639-1. */
  falo: string;
  /** O microfone vai ao modelo (e não ao reconhecimento do navegador), pela conta da captura de sempre. */
  micVaiAoModelo: boolean;
  /** "Detectar idioma" ligado em alguma das fontes. */
  detectar: boolean;
}

export interface IdiomasDoModelo {
  /** O que vai a `routeStt({ micLang })`: `''` = o microfone não chega ao modelo. */
  idiomaDoMicrofone: string;
  /** O que vai a `routeStt({ autoDetect })`: o idioma de cada fala não é fixo. */
  detectar: boolean;
  /** O modelo só precisa decodificar inglês (a escada do regulador pode descer ao Moonshine). */
  soIngles: boolean;
}

export function idiomasDoModelo(e: EntradaDosIdiomasDoModelo): IdiomasDoModelo {
  const doisPeloMicrofone = e.cenario === 'interprete' && !e.virtual;
  if (doisPeloMicrofone) return { idiomaDoMicrofone: e.falo, detectar: true, soIngles: false };
  return {
    idiomaDoMicrofone: e.micVaiAoModelo ? e.falo : '',
    detectar: e.detectar,
    soIngles: e.ouve === 'en' && !e.detectar && (!e.micVaiAoModelo || e.falo === 'en'),
  };
}

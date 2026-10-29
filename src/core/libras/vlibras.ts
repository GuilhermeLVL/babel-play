/**
 * O PORTÃO DO VLIBRAS (piloto só para adultos; `docs/pesquisa/2026-10-29-vlibras-piloto.md`).
 *
 * O VLibras é um serviço EXTERNO do governo federal: o widget carrega código e avatar de `vlibras.gov.br` e envia o texto
 * clicado ou selecionado a `traducao2.vlibras.gov.br`. Por isso o script só é injetado com TRÊS condições juntas: a flag
 * `libras_vlibras` ligada, o perfil ADULTO confirmado (menor de 18 e idade não declarada são protegidos) e o
 * consentimento explícito da pessoa, guardado neste aparelho. Falha fechada: qualquer dúvida é "não carrega".
 *
 * Puro: sem DOM, sem rede, sem armazenamento. Quem lê a flag, o perfil e o aceite é `src/lib/libras/vlibras.ts`.
 */

/** A origem do serviço (script, avatar em `<iframe>` e fontes). */
export const ORIGEM_DO_VLIBRAS = 'https://vlibras.gov.br';
/** A raiz do widget (`rootPath` do `new window.VLibras.Widget`). */
export const RAIZ_DO_VLIBRAS = `${ORIGEM_DO_VLIBRAS}/app`;
/** O script oficial (loader de 2 KB; o resto ele mesmo busca). */
export const URL_DO_SCRIPT_DO_VLIBRAS = `${RAIZ_DO_VLIBRAS}/vlibras-plugin.js`;

/**
 * Os hosts que a CSP abre com `VLIBRAS_ATIVO=1`, por diretiva (confirmados em Chromium, 29/10/2026). O `vlibras.gov.br`
 * responde 302 para o jsdelivr (`/gh/` do repositório do VLibras), então o jsdelivr entra SÓ com esse caminho: o caminho
 * não vale no redirecionamento (basta o host), mas barra o `import()` direto do PostHog em `cdn.jsdelivr.net/npm/`.
 * O PostHog (analytics do widget) NUNCA entra.
 */
export const CSP_DO_VLIBRAS = {
  script: [ORIGEM_DO_VLIBRAS, 'https://cdn.jsdelivr.net/gh/spbgovbr-vlibras/'],
  connect: [
    ORIGEM_DO_VLIBRAS,
    'https://traducao2.vlibras.gov.br',
    'https://dicionario2.vlibras.gov.br',
    'https://repositorio.vlibras.gov.br',
  ],
  frame: [ORIGEM_DO_VLIBRAS],
  font: [ORIGEM_DO_VLIBRAS, 'https://cdn.jsdelivr.net/gh/spbgovbr-vlibras/'],
} as const;

/** A versão do texto de consentimento: mudar o que a tela diz exige novo aceite (suba o número). */
export const VERSAO_DO_CONSENTIMENTO_DO_VLIBRAS = 1;

export type MotivoDoPortao = 'flag_desligada' | 'perfil_protegido' | 'sem_consentimento';
export type ResultadoDoPortao = { ok: true } | { ok: false; motivo: MotivoDoPortao };

/** O botão pode aparecer? Flag ligada (exatamente `true`) e adulto confirmado (`protegido === false`, nada mais). */
export function podeOferecerVLibras(o: { flag: boolean; protegido: boolean }): boolean {
  return o.flag === true && o.protegido === false;
}

/** O script pode ser carregado agora? As três condições, nesta ordem de motivo. */
export function portaoDoVLibras(o: { flag: boolean; protegido: boolean; consentimento: boolean }): ResultadoDoPortao {
  if (o.flag !== true) return { ok: false, motivo: 'flag_desligada' };
  if (o.protegido !== false) return { ok: false, motivo: 'perfil_protegido' };
  if (o.consentimento !== true) return { ok: false, motivo: 'sem_consentimento' };
  return { ok: true };
}

/** O valor guardado é um aceite da versão atual? Qualquer outra coisa (vazio, lixo, versão antiga) é "não aceitou". */
export function consentimentoValido(bruto: unknown): boolean {
  if (typeof bruto !== 'string' || !bruto) return false;
  try {
    const v = JSON.parse(bruto) as { v?: unknown; aceitoEm?: unknown } | null;
    return (
      !!v && v.v === VERSAO_DO_CONSENTIMENTO_DO_VLIBRAS && typeof v.aceitoEm === 'number' && Number.isFinite(v.aceitoEm)
    );
  } catch {
    return false;
  }
}

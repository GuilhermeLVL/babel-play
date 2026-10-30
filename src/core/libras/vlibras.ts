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

/* ------------------------------ a PONTE (iframe isolado que hospeda o widget) ------------------------------ */

/**
 * O widget do governo NÃO roda no documento do app: roda em `public/vlibras-ponte.html`, dentro de um
 * `<iframe sandbox="allow-scripts">` SEM `allow-same-origin` (origem opaca: sem acesso ao DOM, aos cookies nem ao
 * `localStorage` do Frasy). O app e a ponte só conversam por `postMessage`, com estas duas formas e mais nada.
 */
export const CAMINHO_DA_PONTE_DO_VLIBRAS = '/vlibras-ponte.html';
/** O `sandbox` do iframe da ponte: scripts, e NUNCA `allow-same-origin`. */
export const SANDBOX_DA_PONTE_DO_VLIBRAS = 'allow-scripts';
/** O teto do texto enviado à ponte (caracteres): uma frase ou um parágrafo, não o livro. */
export const TAMANHO_MAXIMO_DO_TEXTO_DO_VLIBRAS = 2000;
const MARCA_DA_PONTE = 'vlibras-ponte';

export type MensagemParaAPonte =
  | { frasy: typeof MARCA_DA_PONTE; tipo: 'iniciar' }
  | { frasy: typeof MARCA_DA_PONTE; tipo: 'texto'; texto: string };
export type TipoDeMensagemDaPonte = 'pronta' | 'iniciado' | 'erro';

/** A mensagem de texto para a ponte: aparado, no teto, ou `null` se não sobrou nada. */
export function mensagemDeTexto(bruto: unknown): MensagemParaAPonte | null {
  if (typeof bruto !== 'string') return null;
  const texto = bruto.replace(/\s+/g, ' ').trim().slice(0, TAMANHO_MAXIMO_DO_TEXTO_DO_VLIBRAS);
  return texto ? { frasy: MARCA_DA_PONTE, tipo: 'texto', texto } : null;
}

export const mensagemDeInicio = (): MensagemParaAPonte => ({ frasy: MARCA_DA_PONTE, tipo: 'iniciar' });

/** O esquema ESTRITO do que a ponte aceita do app (a ponte tem a mesma regra, em `public/vlibras-ponte.js`). */
export function lerMensagemParaAPonte(dados: unknown): MensagemParaAPonte | null {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return null;
  const d = dados as Record<string, unknown>;
  if (d.frasy !== MARCA_DA_PONTE) return null;
  if (d.tipo === 'iniciar') return Object.keys(d).length === 2 ? mensagemDeInicio() : null;
  if (d.tipo === 'texto' && Object.keys(d).length === 3 && typeof d.texto === 'string') {
    if (d.texto.length > TAMANHO_MAXIMO_DO_TEXTO_DO_VLIBRAS) return null;
    return { frasy: MARCA_DA_PONTE, tipo: 'texto', texto: d.texto };
  }
  return null;
}

/** O esquema estrito do que o app aceita DA ponte: só um dos três tipos, sem carga. */
export function lerMensagemDaPonte(dados: unknown): TipoDeMensagemDaPonte | null {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return null;
  const d = dados as Record<string, unknown>;
  if (d.frasy !== MARCA_DA_PONTE || Object.keys(d).length !== 2) return null;
  return d.tipo === 'pronta' || d.tipo === 'iniciado' || d.tipo === 'erro' ? d.tipo : null;
}

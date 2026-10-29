/**
 * A VALIDAÇÃO DO "TRAGA O SEU" (VRM 0.x/1.0 ou GLB). Porte em camadas do protótipo `validar-avatar.mjs`
 * (ramo `proto/avatar-libras-fontes`, 26 casos reaproveitados em `tests/avatar-importador.test.ts`).
 *
 * Núcleo PURO: não decodifica imagem. As dimensões das texturas vêm do CABEÇALHO (PNG/JPEG/WebP) e uma recusa
 * hostil (URI externa, extensão obrigatória desconhecida, malha enorme, textura-bomba, arquivo grande, bloco fora
 * do arquivo, não-GLB) PARA antes do validador da Khronos e de qualquer decodificação. A única decodificação (a
 * redução de textura para 1024 px) acontece em `prepararAvatar`, por um gancho injetado, só depois de a validação
 * passar. O validador da Khronos também é injetado (a lib o carrega de forma vendorizada, nunca por CDN).
 *
 * As recusas e os avisos saem como CÓDIGOS com `detalhes` (a UI traduz com `t()` e aponta o passo certo do guia:
 * encontre, baixe, arraste ou confira a licença). A licença do `meta` vem de `avaliarLicenca` (M1).
 */
import { type AvaliacaoDeLicenca, avaliarLicenca, type CodigoDeLicenca } from '../licencaVrm';
import { ORCAMENTOS, TETO_DO_MODELO_BYTES, type TierDoAvatar } from '../tiers';
import { type Bytes, ErroDeGlb, type Json, lerGlb, reescreverImagens, temMagicGlb, type TrocaDeImagem } from './glb';
import { lerDimensoesDaImagem } from './imagem';

export const LIMITES_DA_IMPORTACAO = {
  bytes: TETO_DO_MODELO_BYTES,
  triangulosMax: 70_000,
  triangulosFraco: ORCAMENTOS.fraco.triangulos,
  ossos: 400,
  materiais: 32,
  texturas: 32,
  nos: 10_000,
  /** Recusa acima disto (por lado). */
  ladoTextura: 8192,
  /** Recusa acima disto (bomba de descompressão). */
  pixelsPorTextura: 4096 * 4096,
  pixelsTotal: 64 * 1024 * 1024,
  /** Acima disto a textura é reduzida no navegador. */
  ladoAlvoTextura: 1024,
} as const;

/** Os 4 passos do guia "traga o seu". */
export type PassoDoGuia = 'encontre' | 'baixe' | 'arraste' | 'licenca';

export type CodigoDeRecusa =
  | 'arquivo_grande'
  | 'sem_magic'
  | 'glb_curto'
  | 'versao_glb'
  | 'glb_truncado'
  | 'chunk_fora'
  | 'json_grande'
  | 'json_utf8'
  | 'json_invalido'
  | 'sem_json'
  | 'glb_invalido'
  | 'nos'
  | 'uri_externa'
  | 'imagem_sem_dados'
  | 'extensao_desconhecida'
  | 'triangulos'
  | 'ossos'
  | 'materiais'
  | 'texturas'
  | 'imagem_fora'
  | 'imagem_formato'
  | 'textura_dim'
  | 'textura_bomba'
  | 'pixels_total'
  | 'validador'
  | 'validador_falhou'
  | 'modificacao_proibida'
  | 'tier_muito_ruim'
  | 'tier_fraco'
  | CodigoDeLicenca;

export type CodigoDeAviso = 'validador_ausente' | 'bloco_desalinhado' | 'reducao_de_textura' | 'nao_roda_no_fraco';

type Detalhes = Record<string, string | number>;

export interface Recusa {
  etapa: string;
  codigo: CodigoDeRecusa;
  passo: PassoDoGuia;
  detalhes: Detalhes;
}

export interface AvisoDeImportacao {
  codigo: CodigoDeAviso;
  detalhes: Detalhes;
}

export interface Etapa {
  id: string;
  ok: boolean;
  notas: string[];
}

export interface InfoDeTextura {
  indice: number;
  formato: 'png' | 'jpeg' | 'webp';
  mime: string;
  largura: number;
  altura: number;
  pixels: number;
  bytes: number;
  reduzir: boolean;
  alvo?: { largura: number; altura: number };
}

export interface Metricas {
  triangulos: number;
  ossos: number;
  materiais: number;
  texturas: number;
  texturaMB: number | null;
}

export type RotuloDoRanking = 'excelente' | 'bom' | 'medio' | 'ruim' | 'muito_ruim';
const ROTULOS: readonly RotuloDoRanking[] = ['excelente', 'bom', 'medio', 'ruim', 'muito_ruim'];

export interface Ranking {
  triangulos: number;
  ossos: number;
  materiais: number;
  textura: number;
  geral: number;
  rotulo: RotuloDoRanking;
  /** Cabe no tier fraco (celular modesto e PiP). */
  fraco: boolean;
  pioresMetricas: string[];
}

/** Quem fez o modelo, lido do `meta` (texto curto e limpo, para o crédito na tela). */
export interface CreditoDoModelo {
  titulo: string;
  autores: string[];
  licenca: string;
  urlDaLicenca: string;
}

export type Decisao = 'aceito' | 'precisa_confirmar' | 'recusado';

export interface RelatorioDeImportacao {
  /** `menor` = perfil protegido (falha fechada). */
  perfil: 'adulto' | 'menor';
  tier: TierDoAvatar;
  etapas: Etapa[];
  recusas: Recusa[];
  avisos: AvisoDeImportacao[];
  decisao: Decisao;
  licenca: AvaliacaoDeLicenca | null;
  credito: CreditoDoModelo | null;
  metricas: Metricas | null;
  ranking: Ranking | null;
  texturas: InfoDeTextura[];
  reducoes: InfoDeTextura[];
  precisaConfirmar: CodigoDeLicenca[];
}

/** O que a validação usa do `gltf-validator` (Khronos). */
export interface ValidadorKhronos {
  validateBytes(
    bytes: Uint8Array,
    opcoes: { maxIssues: number; externalResourceFunction: (uri: string) => Promise<Uint8Array> },
  ): Promise<{ issues?: { messages?: Array<{ severity: number; code: string; pointer?: string }> } }>;
}

export interface OpcoesDeValidacao {
  /** Perfil protegido do app (`perfilProtegido()`). Qualquer coisa que não seja `false` exato vale como protegido. */
  protegido?: boolean;
  /** Tier do aparelho: no `fraco`, modelo que não cabe nele é recusado. */
  tier?: TierDoAvatar;
  direitosConfirmados?: boolean;
  validador?: ValidadorKhronos | null;
  permitirDraco?: boolean;
}

export class ErroDePreparacao extends Error {
  constructor(
    readonly codigo: 'recusado' | 'sem_confirmacao' | 'pos_reducao',
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'ErroDePreparacao';
  }
}

const EXT_EXATAS = new Set(['VRM', 'KHR_texture_transform', 'KHR_mesh_quantization', 'EXT_meshopt_compression']);
const extPermitida = (nome: string, permitirDraco: boolean) =>
  EXT_EXATAS.has(nome) ||
  nome.startsWith('VRMC_') ||
  nome.startsWith('KHR_materials_') ||
  (permitirDraco && nome === 'KHR_draco_mesh_compression');

// Limites superiores (inclusivos) de cada faixa, estilo VRChat. Acima da última = "muito ruim".
const FAIXAS = {
  triangulos: [10_000, 20_000, 32_000, 70_000],
  ossos: [75, 150, 256, 400],
  materiais: [4, 8, 16, 32],
  texturaMB: [40, 75, 110, 150],
};
const faixaDe = (valor: number, faixa: number[]) => {
  const i = faixa.findIndex((m) => valor <= m);
  return i === -1 ? 4 : i;
};

type Bruto = Record<string, unknown>;
const lista = (json: Json, chave: string): Bruto[] => (Array.isArray(json[chave]) ? (json[chave] as Bruto[]) : []);
const objeto = (v: unknown): v is Bruto => v !== null && typeof v === 'object' && !Array.isArray(v);
const inteiroNaoNegativo = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

function contarTriangulos(json: Json): number {
  const acc = lista(json, 'accessors');
  const porMalha = lista(json, 'meshes').map((m) =>
    (Array.isArray(m?.primitives) ? (m.primitives as Bruto[]) : []).reduce((s, p) => {
      const modo = typeof p?.mode === 'number' ? p.mode : 4;
      const indices = p?.indices;
      const posicao = objeto(p?.attributes) ? (p.attributes as Bruto).POSITION : undefined;
      const quem = inteiroNaoNegativo(indices) ? indices : inteiroNaoNegativo(posicao) ? posicao : -1;
      const n = quem >= 0 ? (acc[quem]?.count as unknown) : undefined;
      if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return s;
      if (modo === 4) return s + Math.floor(n / 3);
      if (modo === 5 || modo === 6) return s + Math.max(0, n - 2);
      return s;
    }, 0),
  );
  const usos = lista(json, 'nodes').filter((n) => inteiroNaoNegativo(n?.mesh) && (n.mesh as number) < porMalha.length);
  if (usos.length === 0) return porMalha.reduce((a, b) => a + b, 0);
  return usos.reduce((s, n) => s + porMalha[n.mesh as number], 0);
}

function contarOssos(json: Json): number {
  const j = new Set<unknown>();
  for (const s of lista(json, 'skins'))
    for (const x of Array.isArray(s?.joints) ? (s.joints as unknown[]) : []) j.add(x);
  return j.size;
}

/** O `meta` cru do VRM (1.0 ou 0.x), do jeito que `avaliarLicenca` espera. */
export function metaDoVrm(json: Json): unknown {
  const ext = objeto(json.extensions) ? json.extensions : {};
  const v1 = objeto(ext.VRMC_vrm) ? (ext.VRMC_vrm as Bruto).meta : undefined;
  if (objeto(v1)) return { ...v1, metaVersion: '1' };
  const v0 = objeto(ext.VRM) ? (ext.VRM as Bruto).meta : undefined;
  if (objeto(v0)) return { ...v0, metaVersion: '0' };
  return null;
}

// eslint-disable-next-line no-control-regex -- limpar caractere de controle do texto de terceiros é o ponto
const CONTROLE = /[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g;
const limpo = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(CONTROLE, ' ').trim().slice(0, max) : '');

/** Crédito para mostrar (título e autores), limitado e sem caractere de controle ou de direção de texto. */
export function lerCredito(json: Json, urlDaLicenca = ''): CreditoDoModelo | null {
  const meta = metaDoVrm(json) as Bruto | null;
  if (!meta) return null;
  const v1 = meta.metaVersion === '1';
  const autores = v1
    ? (Array.isArray(meta.authors) ? (meta.authors as unknown[]) : []).map((a) => limpo(a, 80)).filter(Boolean)
    : [limpo(meta.author, 80)].filter(Boolean);
  return {
    titulo: limpo(v1 ? meta.name : meta.title, 80),
    autores: autores.slice(0, 5),
    licenca: limpo(v1 ? '' : meta.licenseName, 60),
    urlDaLicenca,
  };
}

const etapa = (r: RelatorioDeImportacao, id: string): Etapa => {
  const e: Etapa = { id, ok: true, notas: [] };
  r.etapas.push(e);
  return e;
};

function recusar(
  r: RelatorioDeImportacao,
  e: Etapa,
  codigo: CodigoDeRecusa,
  passo: PassoDoGuia,
  detalhes: Detalhes = {},
): void {
  e.ok = false;
  r.recusas.push({ etapa: e.id, codigo, passo, detalhes });
}

const PASSO_DO_ERRO_GLB: Record<string, CodigoDeRecusa> = {
  glb_curto: 'glb_curto',
  sem_magic: 'sem_magic',
  versao_glb: 'versao_glb',
  glb_truncado: 'glb_truncado',
  chunk_fora: 'chunk_fora',
  json_grande: 'json_grande',
  json_utf8: 'json_utf8',
  json_invalido: 'json_invalido',
  sem_json: 'sem_json',
};

function esquemaDaUri(uri: unknown): string {
  const s = String(uri).trim().toLowerCase();
  if (s.startsWith('https://')) return 'https';
  if (s.startsWith('http://')) return 'http';
  if (s.startsWith('file:')) return 'file';
  if (s.startsWith('data:')) return 'data';
  return 'relativa';
}

function calcularRanking(m: Metricas): Ranking {
  const t = {
    triangulos: faixaDe(m.triangulos, FAIXAS.triangulos),
    ossos: faixaDe(m.ossos, FAIXAS.ossos),
    materiais: faixaDe(m.materiais, FAIXAS.materiais),
    textura: m.texturaMB === null ? 0 : faixaDe(m.texturaMB, FAIXAS.texturaMB),
  };
  const geral = Math.max(...Object.values(t));
  return {
    ...t,
    geral,
    rotulo: ROTULOS[geral],
    fraco: m.triangulos <= LIMITES_DA_IMPORTACAO.triangulosFraco && geral <= 2,
    pioresMetricas: Object.entries(t)
      .filter(([, v]) => v === geral)
      .map(([k]) => k),
  };
}

/** O menor tier do app que comporta esse número de triângulos (`null` = nenhum). */
export function tierMinimoParaTriangulos(triangulos: number): TierDoAvatar | null {
  for (const tier of ['fraco', 'medio', 'forte'] as const) if (triangulos <= ORCAMENTOS[tier].triangulos) return tier;
  return null;
}

function novoRelatorio(protegido: unknown, tier: TierDoAvatar): RelatorioDeImportacao {
  return {
    perfil: protegido === false ? 'adulto' : 'menor',
    tier,
    etapas: [],
    recusas: [],
    avisos: [],
    decisao: 'recusado',
    licenca: null,
    credito: null,
    metricas: null,
    ranking: null,
    texturas: [],
    reducoes: [],
    precisaConfirmar: [],
  };
}

function concluir(r: RelatorioDeImportacao, op: OpcoesDeValidacao = {}): RelatorioDeImportacao {
  const vistos = new Set<string>();
  r.avisos = r.avisos.filter((a) => (vistos.has(a.codigo) ? false : (vistos.add(a.codigo), true)));
  if (r.recusas.length) r.decisao = 'recusado';
  else if (r.licenca && r.licenca.confirmacoes.length && !op.direitosConfirmados) {
    r.decisao = 'precisa_confirmar';
    r.precisaConfirmar = r.licenca.confirmacoes;
  } else r.decisao = 'aceito';
  return r;
}

/**
 * Valida o arquivo inteiro. Nunca lança por conteúdo hostil: tudo vira recusa no relatório.
 * Ordem: tamanho e assinatura → estrutura e tetos (só JSON) → texturas pelo cabeçalho → validador Khronos →
 * licença → ranking.
 */
export async function validarAvatar(bytes: Bytes, op: OpcoesDeValidacao = {}): Promise<RelatorioDeImportacao> {
  const tier = op.tier ?? 'forte';
  const r = novoRelatorio(op.protegido, tier);
  const L = LIMITES_DA_IMPORTACAO;

  // 1. tamanho e assinatura, antes de qualquer leitura
  const e1 = etapa(r, 'tamanho_magic');
  if (bytes.byteLength > L.bytes)
    recusar(r, e1, 'arquivo_grande', 'encontre', {
      mb: Number((bytes.byteLength / 1048576).toFixed(1)),
      tetoMb: L.bytes / 1048576,
    });
  else if (!temMagicGlb(bytes)) recusar(r, e1, 'sem_magic', 'baixe');
  if (!e1.ok) return concluir(r);

  // 2. cabeçalho do GLB, JSON e tetos declarados
  const e2 = etapa(r, 'estrutura');
  let glb: { json: Json; bin: Bytes | null };
  try {
    glb = lerGlb(bytes);
  } catch (err) {
    const codigo = err instanceof ErroDeGlb ? (PASSO_DO_ERRO_GLB[err.codigo] ?? 'glb_invalido') : 'glb_invalido';
    recusar(r, e2, codigo, 'baixe');
    return concluir(r);
  }
  const { json, bin } = glb;
  if (lista(json, 'nodes').length > L.nos)
    recusar(r, e2, 'nos', 'encontre', { n: lista(json, 'nodes').length, teto: L.nos });
  lista(json, 'buffers').forEach((b, i) => {
    if (b?.uri !== undefined)
      recusar(r, e2, 'uri_externa', 'baixe', { alvo: `buffer ${i}`, esquema: esquemaDaUri(b.uri) });
  });
  lista(json, 'images').forEach((im, i) => {
    if (im?.uri !== undefined)
      recusar(r, e2, 'uri_externa', 'baixe', { alvo: `imagem ${i}`, esquema: esquemaDaUri(im.uri) });
    else if (!inteiroNaoNegativo(im?.bufferView)) recusar(r, e2, 'imagem_sem_dados', 'baixe', { indice: i });
  });
  for (const nome of Array.isArray(json.extensionsRequired) ? (json.extensionsRequired as unknown[]) : []) {
    if (typeof nome !== 'string' || !extPermitida(nome, op.permitirDraco === true))
      recusar(r, e2, 'extensao_desconhecida', 'baixe', { nome: limpo(nome, 60) });
  }
  const triangulos = contarTriangulos(json);
  const ossos = contarOssos(json);
  const materiais = lista(json, 'materials').length;
  const nTex = lista(json, 'images').length;
  if (triangulos > L.triangulosMax)
    recusar(r, e2, 'triangulos', 'encontre', { n: triangulos, teto: L.triangulosMax, fraco: L.triangulosFraco });
  if (ossos > L.ossos) recusar(r, e2, 'ossos', 'encontre', { n: ossos, teto: L.ossos });
  if (materiais > L.materiais) recusar(r, e2, 'materiais', 'encontre', { n: materiais, teto: L.materiais });
  if (nTex > L.texturas) recusar(r, e2, 'texturas', 'encontre', { n: nTex, teto: L.texturas });
  if (!e2.ok) {
    // Só o JSON é lido para o relatório ficar completo; nada vai adiante.
    const licenca = avaliarLicenca(metaDoVrm(json), r.perfil, 'importado');
    r.licenca = licenca;
    r.credito = lerCredito(json, licenca.urlDaLicenca);
    r.metricas = { triangulos, ossos, materiais, texturas: nTex, texturaMB: null };
    r.ranking = calcularRanking(r.metricas);
    return concluir(r);
  }

  // 3. dimensões das texturas, lidas do cabeçalho, sem decodificar
  const e3 = etapa(r, 'texturas_cabecalho');
  let pixelsTotal = 0;
  const vistas = lista(json, 'bufferViews');
  lista(json, 'images').forEach((im, i) => {
    const v = vistas[im.bufferView as number];
    const ini = typeof v?.byteOffset === 'number' ? v.byteOffset : 0;
    const tam = v?.byteLength;
    if (!bin || !v || !inteiroNaoNegativo(tam) || !inteiroNaoNegativo(ini) || ini + tam > bin.byteLength) {
      recusar(r, e3, 'imagem_fora', 'baixe', { indice: i });
      return;
    }
    const dim = lerDimensoesDaImagem(bin.subarray(ini, Math.min(ini + tam, ini + 65_536)));
    if (!dim) {
      recusar(r, e3, 'imagem_formato', 'baixe', { indice: i });
      return;
    }
    const pixels = dim.largura * dim.altura;
    const info: InfoDeTextura = {
      indice: i,
      formato: dim.formato,
      mime: dim.mime,
      largura: dim.largura,
      altura: dim.altura,
      pixels,
      bytes: tam,
      reduzir: false,
    };
    r.texturas.push(info);
    if (!(dim.largura > 0 && dim.altura > 0))
      recusar(r, e3, 'textura_dim', 'baixe', { indice: i, largura: dim.largura, altura: dim.altura });
    else if (dim.largura > L.ladoTextura || dim.altura > L.ladoTextura || pixels > L.pixelsPorTextura)
      recusar(r, e3, 'textura_bomba', 'encontre', {
        indice: i,
        largura: dim.largura,
        altura: dim.altura,
        bytes: tam,
        teto: Math.sqrt(L.pixelsPorTextura),
      });
    pixelsTotal += pixels;
    if (Math.max(dim.largura, dim.altura) > L.ladoAlvoTextura) {
      info.reduzir = true;
      const f = L.ladoAlvoTextura / Math.max(dim.largura, dim.altura);
      info.alvo = {
        largura: Math.max(1, Math.round(dim.largura * f)),
        altura: Math.max(1, Math.round(dim.altura * f)),
      };
    }
  });
  if (e3.ok && pixelsTotal > L.pixelsTotal)
    recusar(r, e3, 'pixels_total', 'encontre', {
      milhoes: Math.round(pixelsTotal / 1e6),
      teto: L.pixelsTotal / 1048576,
    });
  let vram = 0;
  for (const t of r.texturas) vram += (t.reduzir && t.alvo ? t.alvo.largura * t.alvo.altura : t.pixels) * 4 * (4 / 3);
  r.reducoes = r.texturas.filter((t) => t.reduzir);
  r.metricas = { triangulos, ossos, materiais, texturas: nTex, texturaMB: Math.round(vram / 1048576) };
  r.ranking = calcularRanking(r.metricas);
  const licenca = avaliarLicenca(metaDoVrm(json), r.perfil, 'importado');
  r.licenca = licenca;
  r.credito = lerCredito(json, licenca.urlDaLicenca);
  if (!e3.ok) return concluir(r);

  // 4. validador da Khronos (só chega aqui se nenhuma textura é bomba)
  const e4 = etapa(r, 'validador_khronos');
  if (!op.validador) {
    e4.notas.push('validador não carregado');
    r.avisos.push({ codigo: 'validador_ausente', detalhes: {} });
  } else {
    try {
      const rel = await op.validador.validateBytes(bytes, {
        maxIssues: 50,
        externalResourceFunction: (uri) => Promise.reject(new Error(`recurso externo bloqueado: ${uri}`)),
      });
      // GLB_CHUNK_LENGTH_UNALIGNED vira AVISO, não recusa: o three.js lê esses arquivos (avançando `ini + len`,
      // como `lerGlb`) e há VRMs reais cujo bloco JSON não tem padding. Recusar tiraria do usuário um arquivo que
      // o app renderiza sem problema; o que validamos tem de ser o que é renderizado.
      const todos = (rel.issues?.messages ?? []).filter((m) => m.severity === 0);
      const erros = todos.filter((m) => m.code !== 'GLB_CHUNK_LENGTH_UNALIGNED');
      if (todos.length !== erros.length) r.avisos.push({ codigo: 'bloco_desalinhado', detalhes: {} });
      e4.notas.push(`${erros.length} erros`);
      if (erros.length)
        recusar(r, e4, 'validador', 'baixe', {
          achados: erros
            .slice(0, 3)
            .map((m) => `${limpo(m.code, 60)} ${limpo(m.pointer, 60)}`.trim())
            .join('; '),
        });
    } catch (err) {
      recusar(r, e4, 'validador_falhou', 'baixe', { motivo: limpo(err instanceof Error ? err.message : err, 120) });
    }
  }

  // 5. licença (já avaliada) e 6. ranking por tier
  const e5 = etapa(r, 'licenca');
  for (const c of licenca.bloqueios) recusar(r, e5, c, 'licenca');
  if (licenca.avisos.includes('modificacao_proibida') && r.reducoes.length)
    recusar(r, e5, 'modificacao_proibida', 'licenca', { texturas: r.reducoes.length });
  const e6 = etapa(r, 'ranking');
  const rk = r.ranking;
  e6.notas.push(`geral: ${rk.rotulo}`);
  if (rk.geral === 4) recusar(r, e6, 'tier_muito_ruim', 'encontre', { piores: rk.pioresMetricas.join(', ') });
  else if (!rk.fraco) {
    r.avisos.push({ codigo: 'nao_roda_no_fraco', detalhes: { triangulos, teto: L.triangulosFraco } });
    if (tier === 'fraco') recusar(r, e6, 'tier_fraco', 'encontre', { n: triangulos, teto: L.triangulosFraco });
  }
  if (r.reducoes.length)
    r.avisos.push({ codigo: 'reducao_de_textura', detalhes: { n: r.reducoes.length, lado: L.ladoAlvoTextura } });
  return concluir(r, op);
}

/**
 * Recusa por TAMANHO sem ler o arquivo: a lib confere `File.size` antes de `arrayBuffer()`, para um arquivo de
 * 2 GB nunca ser carregado na memória só para ser recusado.
 */
export function recusarPorTamanho(tamanho: number, op: OpcoesDeValidacao = {}): RelatorioDeImportacao | null {
  if (tamanho <= LIMITES_DA_IMPORTACAO.bytes) return null;
  const r = novoRelatorio(op.protegido, op.tier ?? 'forte');
  const e = etapa(r, 'tamanho_magic');
  recusar(r, e, 'arquivo_grande', 'encontre', {
    mb: Number((tamanho / 1048576).toFixed(1)),
    tetoMb: LIMITES_DA_IMPORTACAO.bytes / 1048576,
  });
  return concluir(r);
}

/** Como reduzir uma imagem: o navegador usa canvas; os testes usam um espião. */
export interface GanchosDePreparo {
  reduzirImagem(bytes: Bytes, mime: string, largura: number, altura: number): Promise<TrocaDeImagem>;
}

/**
 * Passo 7: só roda se a decisão não é "recusado". Reduz as texturas por um gancho injetado e REVALIDA o resultado.
 */
export async function prepararAvatar(
  bytes: Bytes,
  relatorio: RelatorioDeImportacao,
  ganchos: GanchosDePreparo,
  op: OpcoesDeValidacao = {},
): Promise<{ bytes: Bytes; relatorio: RelatorioDeImportacao; reduzidas: number }> {
  if (relatorio.decisao === 'recusado')
    throw new ErroDePreparacao('recusado', 'arquivo recusado: nada foi decodificado');
  if (relatorio.decisao === 'precisa_confirmar' && !op.direitosConfirmados)
    throw new ErroDePreparacao('sem_confirmacao', 'falta confirmar os direitos de uso');
  if (!relatorio.reducoes.length) return { bytes, relatorio, reduzidas: 0 };
  const { json, bin } = lerGlb(bytes);
  if (!bin) throw new ErroDePreparacao('pos_reducao', 'sem binário para reduzir');
  const trocas = new Map<number, TrocaDeImagem>();
  const imagens = lista(json, 'images');
  const vistas = lista(json, 'bufferViews');
  for (const t of relatorio.reducoes) {
    const v = vistas[imagens[t.indice].bufferView as number];
    const ini = (v.byteOffset as number | undefined) ?? 0;
    const orig = bin.subarray(ini, ini + (v.byteLength as number));
    const alvo = t.alvo as { largura: number; altura: number };
    trocas.set(t.indice, await ganchos.reduzirImagem(orig, t.mime, alvo.largura, alvo.altura));
  }
  const novo = reescreverImagens(json, bin, trocas);
  const rel2 = await validarAvatar(novo.glb, {
    ...op,
    protegido: relatorio.perfil === 'adulto' ? false : true,
    tier: relatorio.tier,
  });
  if (rel2.recusas.length)
    throw new ErroDePreparacao(
      'pos_reducao',
      `o arquivo reduzido não passou: ${rel2.recusas.map((x) => x.codigo).join(', ')}`,
    );
  return { bytes: novo.glb, relatorio: rel2, reduzidas: trocas.size };
}

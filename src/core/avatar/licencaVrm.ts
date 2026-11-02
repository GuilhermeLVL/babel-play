/**
 * LICENÇA DO VRM: triagem do `meta` do modelo antes de salvar ou usar. NÃO é parecer jurídico.
 *
 * Regras (derivadas do protótipo `validar-avatar.mjs`, ramo `proto/avatar-libras-tudo`):
 *  · VRM 1.0 (`VRMC_vrm.meta`) e VRM 0.x (`VRM.meta`, com a grafia "Ussage" do esquema) são normalizados
 *    para os mesmos campos;
 *  · sem `meta`: licença "não declarada". Adulto confirma que tem direito; MENOR é recusado;
 *  · `onlyAuthor`/`onlySeparatelyLicensedPerson` (0.x: `OnlyAuthor`/`ExplicitlyLicensedPerson`): adulto confirma
 *    que é o autor ou tem a licença; menor é recusado;
 *  · MENOR (perfil protegido) só aceita licença explícita que PROÍBE uso excessivamente sexual e violento
 *    (e, no 1.0, antissocial/ódio); "permitido" e "não declarado" são recusa. Adulto só recebe aviso;
 *  · DECISÃO DO ASSISTENTE (trocável): a COLEÇÃO CURADA pelo Frasy (`origem: 'colecao' | 'familia'`) é isenta
 *    das regras de `meta` para menores, porque nós avaliamos cada modelo. Os metas dos CC0 da ToxSam, por
 *    exemplo, dizem `Allow` para uso sexual/violento (padrão do exportador), e mesmo assim são seguros. O
 *    crédito obrigatório continua sendo aviso. Modelo `importado` nunca tem essa isenção.
 *
 * Núcleo puro: recebe o `meta` como objeto cru (o que o `@pixiv/three-vrm` ou o JSON do GLB trazem).
 */

export type PerfilDeLicenca = 'adulto' | 'menor';
export type OrigemDoModelo = 'familia' | 'colecao' | 'importado';

export type CodigoDeLicenca =
  | 'licenca_nao_declarada'
  | 'uso_restrito'
  | 'uso_sexual'
  | 'uso_violento'
  | 'uso_odio'
  | 'comercial_proibido'
  | 'modificacao_proibida'
  | 'credito_obrigatorio';

export type Tri = 'permitido' | 'proibido' | 'nao_declarado';

export interface AvaliacaoDeLicenca {
  versao: 'vrm1' | 'vrm0' | 'sem_meta';
  /** `aceita` = pode salvar; `confirmar` = só depois de a pessoa confirmar o direito; `recusada` = não entra. */
  decisao: 'aceita' | 'confirmar' | 'recusada';
  bloqueios: CodigoDeLicenca[];
  confirmacoes: CodigoDeLicenca[];
  avisos: CodigoDeLicenca[];
  credito: 'obrigatorio' | 'dispensado' | 'nao_declarado';
  /** Só `http(s)://`, com até 500 caracteres; vazio se não houver. */
  urlDaLicenca: string;
  usoSexual: Tri;
  usoViolento: Tri;
}

type Bruto = Record<string, unknown>;

const MAX_URL = 500;
const objeto = (v: unknown): v is Bruto => v !== null && typeof v === 'object' && !Array.isArray(v);
const texto = (v: unknown) => (typeof v === 'string' ? v.slice(0, 2000).trim() : '');
const norm = (v: unknown) =>
  texto(v)
    .toLowerCase()
    .replace(/[^a-z]/g, '');
const http = (v: unknown) => {
  const t = texto(v);
  return /^https?:\/\//i.test(t) && t.length <= MAX_URL ? t : '';
};
const triBool = (v: unknown): Tri => (v === true ? 'permitido' : v === false ? 'proibido' : 'nao_declarado');
const triAllow = (v: unknown): Tri =>
  norm(v) === 'allow' ? 'permitido' : norm(v) === 'disallow' ? 'proibido' : 'nao_declarado';

interface Normalizada {
  versao: AvaliacaoDeLicenca['versao'];
  declarada: boolean;
  quemPode: 'todos' | 'autor' | 'licenciados' | 'nao_declarado';
  sexual: Tri;
  violento: Tri;
  odio: Tri;
  comercial: Tri;
  modificacaoProibida: boolean;
  credito: AvaliacaoDeLicenca['credito'];
  url: string;
}

function normalizar(meta: unknown): Normalizada {
  const m = objeto(meta) ? meta : null;
  const eVrm1 = !!m && (m.metaVersion === '1' || (m.metaVersion !== '0' && 'avatarPermission' in m));
  const eVrm0 = !!m && !eVrm1 && (m.metaVersion === '0' || 'allowedUserName' in m || 'licenseName' in m);
  const vazio: Normalizada = {
    versao: 'sem_meta',
    declarada: false,
    quemPode: 'nao_declarado',
    sexual: 'nao_declarado',
    violento: 'nao_declarado',
    odio: 'nao_declarado',
    comercial: 'nao_declarado',
    modificacaoProibida: false,
    credito: 'nao_declarado',
    url: '',
  };
  if (!m || (!eVrm1 && !eVrm0)) return vazio;

  if (eVrm1) {
    const ap = norm(m.avatarPermission);
    const cu = norm(m.commercialUsage);
    const url = http(m.licenseUrl) || http(m.otherLicenseUrl);
    return {
      versao: 'vrm1',
      declarada: !!url,
      quemPode:
        ap === 'everyone'
          ? 'todos'
          : ap === 'onlyauthor'
            ? 'autor'
            : ap === 'onlyseparatelylicensedperson'
              ? 'licenciados'
              : 'nao_declarado',
      sexual: triBool(m.allowExcessivelySexualUsage),
      violento: triBool(m.allowExcessivelyViolentUsage),
      odio: triBool(m.allowAntisocialOrHateUsage),
      comercial: cu === 'personalnonprofit' ? 'proibido' : cu ? 'permitido' : 'nao_declarado',
      modificacaoProibida: norm(m.modification) === 'prohibited',
      credito:
        norm(m.creditNotation) === 'required'
          ? 'obrigatorio'
          : norm(m.creditNotation) === 'unnecessary'
            ? 'dispensado'
            : 'nao_declarado',
      url,
    };
  }

  const au = norm(m.allowedUserName);
  const nomeDaLicenca = texto(m.licenseName);
  const url = http(m.otherLicenseUrl);
  return {
    versao: 'vrm0',
    // "Other" sem endereço não diz nada: só conta como declarada se houver um nome de verdade ou o endereço.
    declarada: !!nomeDaLicenca && (norm(nomeDaLicenca) !== 'other' || !!url),
    quemPode:
      au === 'everyone'
        ? 'todos'
        : au === 'onlyauthor'
          ? 'autor'
          : au === 'explicitlylicensedperson'
            ? 'licenciados'
            : 'nao_declarado',
    sexual: triAllow(m.sexualUssageName ?? m.sexualUsageName),
    violento: triAllow(m.violentUssageName ?? m.violentUsageName),
    odio: 'nao_declarado',
    comercial: triAllow(m.commercialUssageName ?? m.commercialUsageName),
    modificacaoProibida: false,
    credito: 'nao_declarado',
    url,
  };
}

export function avaliarLicenca(
  meta: unknown,
  perfil: PerfilDeLicenca,
  origem: OrigemDoModelo = 'importado',
): AvaliacaoDeLicenca {
  const n = normalizar(meta);
  // Falha fechada: só 'adulto' exato é adulto.
  const menor = perfil !== 'adulto';
  const curada = origem === 'colecao' || origem === 'familia';
  const bloqueios: CodigoDeLicenca[] = [];
  const confirmacoes: CodigoDeLicenca[] = [];
  const avisos: CodigoDeLicenca[] = [];

  // Pendências "de direito": adulto confirma, menor é recusado.
  const direito = (c: CodigoDeLicenca) => (menor ? bloqueios : confirmacoes).push(c);
  // Pendências "de conteúdo": adulto só é avisado, menor é recusado.
  const conteudo = (c: CodigoDeLicenca) => (menor ? bloqueios : avisos).push(c);

  if (!n.declarada) direito('licenca_nao_declarada');
  if (n.quemPode === 'autor' || n.quemPode === 'licenciados') direito('uso_restrito');
  if (n.sexual !== 'proibido') conteudo('uso_sexual');
  if (n.violento !== 'proibido') conteudo('uso_violento');
  // Só o VRM 1.0 tem o campo; no 0.x ele não existe e não pesa contra o arquivo.
  if (n.versao === 'vrm1' && n.odio !== 'proibido') conteudo('uso_odio');
  if (n.comercial === 'proibido') avisos.push('comercial_proibido');
  if (n.modificacaoProibida) avisos.push('modificacao_proibida');
  if (n.credito === 'obrigatorio') avisos.push('credito_obrigatorio');

  const bloq = curada ? [] : bloqueios;
  const conf = curada ? [] : confirmacoes;
  // Modelo curado: o que seria aviso de conteúdo ou bloqueio de menor não é mostrado; o crédito e o resto ficam.
  const av = curada ? avisos.filter((c) => c === 'credito_obrigatorio' || c === 'comercial_proibido') : avisos;

  return {
    versao: n.versao,
    decisao: bloq.length > 0 ? 'recusada' : conf.length > 0 ? 'confirmar' : 'aceita',
    bloqueios: bloq,
    confirmacoes: conf,
    avisos: av,
    credito: n.credito,
    urlDaLicenca: n.url,
    usoSexual: n.sexual,
    usoViolento: n.violento,
  };
}

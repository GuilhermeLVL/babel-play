/**
 * OS TEXTOS DO IMPORTADOR: cada código de recusa ou aviso do core vira uma frase clara, sem jargão, que diz o que
 * houve E em qual passo do guia (Encontre, Baixe, Arraste, Confira a licença) a pessoa resolve. O core só devolve
 * códigos e números; a tradução é daqui (`t()`).
 */
import type { AvisoDeImportacao, CodigoDeRecusa, PassoDoGuia, Recusa } from '../../../core/avatar/importador/validar';
import type { CodigoDeLicenca } from '../../../core/avatar/licencaVrm';
import { t } from '../../../lib/i18n';

/** Tela de toque (celular, tablet): não existe "arrastar" um arquivo, só escolher. */
export const ehTelaDeToque = (): boolean => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export const NOME_DO_PASSO: Record<PassoDoGuia, () => string> = {
  encontre: () => t('Encontre'),
  baixe: () => t('Baixe'),
  arraste: () => (ehTelaDeToque() ? t('Escolha o arquivo') : t('Arraste')),
  licenca: () => t('Confira a licença'),
};

/**
 * Recusas cuja saída é reexportar o modelo (reduzir, simplificar), não "voltar ao passo 1": a frase de ajuda já diz o
 * que fazer, e apontar o passo "Encontre" mandaria a pessoa para o lugar errado.
 */
const CORRIGE_NA_EXPORTACAO: ReadonlySet<CodigoDeRecusa> = new Set<CodigoDeRecusa>([
  'textura_bomba',
  'pixels_total',
  'triangulos',
  'ossos',
  'materiais',
  'texturas',
  'nos',
]);

export const NUMERO_DO_PASSO: Record<PassoDoGuia, number> = { encontre: 1, baixe: 2, arraste: 3, licenca: 4 };

type D = Recusa['detalhes'];

const CORROMPIDO = (): [string, string] => [
  t('O arquivo está corrompido ou incompleto.'),
  t('Baixe de novo. Se continuar assim, peça ao autor para exportar o modelo outra vez.'),
];
const TEXTURA_ILEGIVEL = (): [string, string] => [
  t('Uma imagem (textura) do modelo não pôde ser lida.'),
  t('Exporte o modelo com texturas PNG ou JPEG.'),
];

const RECUSAS: Partial<Record<CodigoDeRecusa, (d: D) => [string, string]>> = {
  arquivo_grande: (d) => [
    t('O arquivo tem {mb} MB e o limite é {tetoMb} MB.', { mb: d.mb, tetoMb: d.tetoMb }),
    t('Escolha um modelo mais leve ou reduza as texturas e exporte de novo.'),
  ],
  sem_magic: () => [
    t('Este arquivo não é um avatar 3D (.vrm ou .glb).'),
    ehTelaDeToque()
      ? t(
          'Se você baixou um .zip, abra-o e escolha só o arquivo .vrm ou .glb de dentro. Se for .fbx ou .blend, converta no Blender.',
        )
      : t(
          'Se você baixou um .zip, abra-o e arraste só o arquivo .vrm ou .glb de dentro. Se for .fbx ou .blend, converta no Blender.',
        ),
  ],
  glb_curto: CORROMPIDO,
  versao_glb: CORROMPIDO,
  glb_truncado: CORROMPIDO,
  chunk_fora: CORROMPIDO,
  json_grande: CORROMPIDO,
  json_utf8: CORROMPIDO,
  json_invalido: CORROMPIDO,
  sem_json: CORROMPIDO,
  glb_invalido: CORROMPIDO,
  nos: (d) => [
    t('O modelo tem partes demais ({n}; o limite é {teto}).', { n: d.n, teto: d.teto }),
    t('Escolha um modelo mais simples.'),
  ],
  ossos: (d) => [
    t('O modelo tem ossos demais ({n}; o limite é {teto}).', { n: d.n, teto: d.teto }),
    t('Remova ossos extras (cabelo, roupa) ou escolha um modelo mais simples.'),
  ],
  materiais: (d) => [
    t('O modelo tem materiais demais ({n}; o limite é {teto}).', { n: d.n, teto: d.teto }),
    t('Una os materiais num só (atlas de textura) e exporte de novo.'),
  ],
  texturas: (d) => [
    t('O modelo tem imagens demais ({n}; o limite é {teto}).', { n: d.n, teto: d.teto }),
    t('Una as texturas num atlas e exporte de novo.'),
  ],
  uri_externa: (d) => [
    t('O modelo depende de arquivos de fora dele ({alvo}). O Frasy não baixa nada de fora.', { alvo: d.alvo }),
    t('Exporte como um arquivo único (GLB ou VRM com tudo embutido).'),
  ],
  imagem_sem_dados: TEXTURA_ILEGIVEL,
  imagem_fora: TEXTURA_ILEGIVEL,
  imagem_formato: TEXTURA_ILEGIVEL,
  textura_dim: TEXTURA_ILEGIVEL,
  extensao_desconhecida: (d) => [
    t('O modelo exige um recurso que o Frasy não carrega ({nome}).', { nome: d.nome }),
    t('Exporte de novo sem essa extensão.'),
  ],
  triangulos: (d) => [
    t('O modelo tem {n} triângulos. O limite é {teto} (e {fraco} em celular modesto).', {
      n: d.n,
      teto: d.teto,
      fraco: d.fraco,
    }),
    t('Reduza a malha (no Blender, use "Decimate") ou escolha um modelo mais leve.'),
  ],
  textura_bomba: (d) => [
    t('Uma imagem do modelo é grande demais ({largura} x {altura} pixels) para o seu aparelho.', {
      largura: d.largura,
      altura: d.altura,
    }),
    t('Reduza as texturas para 2048 x 2048 ou menos e exporte de novo.'),
  ],
  pixels_total: (d) => [
    t('As texturas somam {milhoes} milhões de pixels (limite: {teto} milhões).', { milhoes: d.milhoes, teto: d.teto }),
    t('Reduza as texturas (por exemplo, para 1024 x 1024).'),
  ],
  validador: (d) => [
    t('A verificação do arquivo reprovou o modelo ({achados}).', { achados: d.achados }),
    t('Reexporte o modelo; abra no Blender e confira se carrega sem erro.'),
  ],
  validador_falhou: () => [
    t('A verificação do arquivo não conseguiu terminar.'),
    t('Tente de novo. Se repetir, reexporte o modelo.'),
  ],
  modificacao_proibida: () => [
    t('A licença proíbe modificar o modelo, e as texturas teriam de ser reduzidas aqui.'),
    t('Peça ao autor uma versão com texturas de até 1024 x 1024.'),
  ],
  tier_muito_ruim: (d) => [
    t('O modelo é pesado demais para rodar bem ({piores}).', { piores: d.piores }),
    t('Escolha um modelo mais leve.'),
  ],
  tier_fraco: (d) => [
    t('Este aparelho é modesto e o modelo ({n} triângulos) passa do limite de {teto}.', { n: d.n, teto: d.teto }),
    t('Escolha um modelo com menos de {teto} triângulos.', { teto: d.teto }),
  ],
  licenca_nao_declarada: () => [
    t('O arquivo não traz uma licença clara.'),
    t('Peça ao autor um arquivo com a licença preenchida, ou use um modelo CC0 ou CC-BY.'),
  ],
  uso_restrito: () => [
    t('A licença limita o uso ao próprio autor ou a quem tem uma licença separada.'),
    t('Só use se você for o autor ou tiver essa licença.'),
  ],
  uso_sexual: () => [
    t(
      'A licença não deixa claro se o modelo pode ser usado para conteúdo sexual. Por isso o Frasy não aceita este arquivo.',
    ),
    t('Escolha um modelo da coleção do Frasy.'),
  ],
  uso_violento: () => [
    t('A licença não proíbe expressamente o uso violento excessivo.'),
    t('Escolha um modelo da coleção do Frasy.'),
  ],
  uso_odio: () => [
    t('A licença não proíbe expressamente o uso antissocial ou de ódio.'),
    t('Escolha um modelo da coleção do Frasy.'),
  ],
};

export function textoDaRecusa(r: Recusa): {
  problema: string;
  ajuda: string;
  passo: PassoDoGuia;
  /** Falso quando a saída é reexportar o modelo: aí a tela não aponta passo do guia. */
  mostrarPasso: boolean;
} {
  const [problema, ajuda] = (RECUSAS[r.codigo] ?? CORROMPIDO)(r.detalhes);
  return { problema, ajuda, passo: r.passo, mostrarPasso: !CORRIGE_NA_EXPORTACAO.has(r.codigo) };
}

export function textoDoAviso(a: AvisoDeImportacao): string {
  switch (a.codigo) {
    case 'validador_ausente':
      return t('A verificação do arquivo não pôde rodar neste navegador: a checagem ficou incompleta.');
    case 'bloco_desalinhado':
      return t(
        'Um bloco do arquivo não está alinhado a 4 bytes. Isso foge da especificação, mas o app lê normalmente.',
      );
    case 'reducao_de_textura':
      return t('{n} textura(s) passam de {lado} px e serão reduzidas aqui, no seu navegador. Nada é enviado.', {
        n: a.detalhes.n,
        lado: a.detalhes.lado,
      });
    case 'nao_roda_no_fraco':
      return t('Este modelo é pesado: não roda bem em celular modesto nem na janelinha flutuante.');
  }
}

export function textoDaLicenca(c: CodigoDeLicenca): string {
  switch (c) {
    case 'licenca_nao_declarada':
      return t('O arquivo não declara uma licença de forma clara.');
    case 'uso_restrito':
      return t('A licença limita o uso ao próprio autor ou a quem tem uma licença separada.');
    case 'uso_sexual':
      return t('A licença permite (ou não diz se proíbe) uso sexual excessivo.');
    case 'uso_violento':
      return t('A licença permite (ou não diz se proíbe) uso violento excessivo.');
    case 'uso_odio':
      return t('A licença permite (ou não diz se proíbe) uso antissocial ou de ódio.');
    case 'comercial_proibido':
      return t('A licença não permite uso comercial. Use só para você, neste aparelho.');
    case 'modificacao_proibida':
      return t('A licença proíbe modificar o modelo.');
    case 'credito_obrigatorio':
      return t('A licença exige crédito ao autor: ele aparece abaixo e onde o avatar for usado.');
  }
}

/**
 * "ONDE ENCONTRAR" um avatar para o "traga o seu": os acervos externos (classe A: só LINK, o Frasy não hospeda,
 * não lista miniatura e não chama a API deles) e as ferramentas para converter. Destilado de
 * `docs/prototipos/avatar-libras/fontes/fontes.json` (ramo `proto/avatar-libras-fontes`, checado em 28/10/2026
 * nas páginas das próprias fontes). Nada aqui é parecer jurídico.
 *
 * Todo cartão tem endereço da fonte, endereço dos termos e a licença típica; `confirmado: false` marca o que o
 * levantamento NÃO conseguiu ler na fonte oficial (a tela avisa "confira nos termos").
 *
 * FICAM DE FORA, de propósito:
 *  · Mixamo: sai em FBX e os arquivos brutos não podem ser redistribuídos (guarda do projeto: sem Mixamo cru);
 *  · repositórios do GitHub (tópico `vrm`): quase só código, sem modelo pronto;
 *  · Hugging Face e Ready Player Me (classe C: não são acervo de avatar utilizável / serviço encerrado);
 *  · ToxSam (classe B): é a galeria ao vivo, com opt-in, e não um cartão de link.
 * Os textos são em português e passam por `t()` no ponto de uso.
 */

export interface FonteDeAvatar {
  id: string;
  nome: string;
  url: string;
  /** Onde ficam os termos de uso/licença desta fonte. */
  termosUrl: string;
  /** O que dá para achar lá, em uma frase. */
  oferece: string;
  /** Licença típica, curta. */
  licenca: string;
  /** Um cuidado que a pessoa precisa saber antes de usar, se houver. */
  aviso?: string;
  /** Os termos foram lidos na fonte oficial em 28/10/2026? */
  confirmado: boolean;
}

export const FONTES_DE_AVATAR: readonly FonteDeAvatar[] = [
  {
    id: 'vroid-studio',
    nome: 'VRoid Studio',
    url: 'https://vroid.com/en/studio',
    termosUrl: 'https://vroid.com/en/studio',
    oferece: 'Programa gratuito para criar o seu próprio personagem e exportar em VRM.',
    licenca: 'O modelo é seu',
    aviso: 'O caminho mais simples e sem dúvida de direitos: você mesmo cria. Defina a licença ao exportar.',
    confirmado: true,
  },
  {
    id: 'vroid-hub',
    nome: 'VRoid Hub',
    url: 'https://hub.vroid.com/en',
    termosUrl: 'https://policies.pixiv.net/en.html',
    oferece: 'O maior acervo de modelos VRM.',
    licenca: 'Condições por modelo',
    aviso: 'Cada autor define se o modelo pode ser usado como avatar. Leia as condições antes de baixar.',
    confirmado: true,
  },
  {
    id: 'sketchfab',
    nome: 'Sketchfab',
    url: 'https://sketchfab.com/',
    termosUrl: 'https://sketchfab.com/terms',
    oferece: 'Modelos 3D em vários formatos; use o filtro de licença.',
    licenca: 'CC0, CC-BY, CC-BY-SA, CC-BY-NC ou padrão',
    aviso: 'Baixar exige conta. Quase nada vem pronto como personagem humano.',
    confirmado: true,
  },
  {
    id: 'poly-pizza',
    nome: 'Poly Pizza',
    url: 'https://poly.pizza',
    termosUrl: 'https://poly.pizza/docs/uploading',
    oferece: 'Modelos low poly, em sua maioria objetos e personagens simples.',
    licenca: 'CC0 e CC-BY',
    aviso: 'Poucos personagens têm esqueleto pronto. Confira a licença em cada modelo.',
    confirmado: false,
  },
  {
    id: 'quaternius',
    nome: 'Quaternius',
    url: 'https://quaternius.com/',
    termosUrl: 'https://quaternius.com/license.html',
    oferece: 'Pacotes de personagens com esqueleto.',
    licenca: 'Licença própria (não é CC0)',
    aviso: 'A licença tem regras próprias de uso e de redistribuição. Leia antes de usar.',
    confirmado: true,
  },
  {
    id: 'kenney',
    nome: 'Kenney',
    url: 'https://kenney.nl/assets',
    termosUrl: 'https://kenney.nl/support',
    oferece: 'Pacotes de personagens simples.',
    licenca: 'CC0',
    aviso: 'Poucos vêm em VRM; se vier em outro formato, converta antes.',
    confirmado: true,
  },
  {
    id: 'kaykit',
    nome: 'KayKit (Kay Lousberg)',
    url: 'https://kaylousberg.itch.io/kaykit-adventurers',
    termosUrl: 'https://kaylousberg.itch.io/kaykit-adventurers',
    oferece: 'Personagens com esqueleto e animações.',
    licenca: 'CC0',
    aviso: 'Pegue a versão glTF e salve como GLB, se vier solta.',
    confirmado: true,
  },
  {
    id: 'opengameart',
    nome: 'OpenGameArt',
    url: 'https://opengameart.org/',
    termosUrl: 'https://opengameart.org/content/faq',
    oferece: 'Acervo comunitário de arte para jogos, com busca por licença.',
    licenca: 'CC0, CC-BY, CC-BY-SA, OGA-BY ou GPL',
    aviso: 'A licença muda de arquivo para arquivo.',
    confirmado: true,
  },
  {
    id: 'itch-cc0',
    nome: 'itch.io (modelos 3D CC0)',
    url: 'https://itch.io/game-assets/assets-cc0/tag-3d',
    termosUrl: 'https://itch.io/game-assets/assets-cc0/tag-3d',
    oferece: 'Pacotes de autores independentes, já filtrados por CC0.',
    licenca: 'CC0 (confira na página de cada pacote)',
    aviso: 'Cada autor define as regras do próprio pacote.',
    confirmado: false,
  },
  {
    id: 'booth',
    nome: 'BOOTH (pixiv)',
    url: 'https://booth.pm/en',
    termosUrl: 'https://booth.pm/en/terms',
    oferece: 'Loja japonesa de modelos, pagos e gratuitos.',
    licenca: 'Termos de cada loja',
    aviso: 'Muitos modelos são só para uso pessoal, sem revenda, e parte do conteúdo é para adultos.',
    confirmado: false,
  },
  {
    id: 'vrm-consortium',
    nome: 'VRM Consortium',
    url: 'https://vrm.dev/en/',
    termosUrl: 'https://vrm.dev/en/',
    oferece: 'O padrão do formato VRM e a explicação das licenças dentro do arquivo.',
    licenca: 'Não é um acervo',
    aviso: 'Boa leitura para entender o que é um VRM. Os exemplos oficiais têm condições próprias.',
    confirmado: true,
  },
];

export interface FerramentaDeAvatar {
  id: string;
  nome: string;
  url: string;
  para: string;
}

/** Para a mini-FAQ "baixei um .fbx, .blend ou .zip, e agora?". */
export const FERRAMENTAS_DE_AVATAR: readonly FerramentaDeAvatar[] = [
  {
    id: 'blender',
    nome: 'Blender',
    url: 'https://www.blender.org/download/',
    para: 'Abre .blend, .fbx e .obj e exporta em GLB (Arquivo > Exportar > glTF 2.0 > glTF Binary). Gratuito.',
  },
  {
    id: 'vrm-addon',
    nome: 'VRM Add-on for Blender',
    url: 'https://extensions.blender.org/add-ons/vrm/',
    para: 'Importa e exporta .vrm no Blender. Confira na página quais versões do Blender ele aceita.',
  },
  {
    id: 'gltf-transform',
    nome: 'glTF Transform',
    url: 'https://gltf-transform.dev/',
    para: 'Reduz texturas e otimiza um .glb pela linha de comando. Teste com o seu arquivo e valide de novo aqui.',
  },
];

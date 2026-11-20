/**
 * AS LISTAS DA LEGENDA SEGURA (change `legenda-segura-para-menores`, achado COMP-02 da auditoria de 17/11/2026: o
 * reconhecimento ouviu "review the pull request together" e escreveu "reveal the porn quest together").
 *
 * Quem aplica é `legendaSegura.ts`: ele troca SÓ o termo por `•••`, e o resto da fala fica como veio. Aqui só moram as
 * palavras, para serem revisadas sem ler código. Estas listas nunca aparecem na interface.
 *
 * COMO SÃO LIDAS. Cada palavra da legenda é comparada já normalizada (`normalizar.ts`): minúscula, sem acento (`ô`→`o`,
 * `ñ`→`n`), leetspeak desfeito (`p0rn0`→`porno`), sem pontuação e com 3+ letras repetidas reduzidas (`fuuuck`→`fuck`).
 * Letras soltas em sequência ("P O R N") são juntadas. Então: escreva SEM acento e SEM pontuação.
 *  - `exatos`: a palavra inteira tem de ser igual ("puta" não pega "computa");
 *  - `prefixos`: a palavra começa assim (`porn` pega porno, pornô, pornografia, pornography). Só entra prefixo que não
 *    começa nenhuma palavra neutra;
 *  - `pares`: duas palavras vizinhas ("white power"). Palavras vizinhas NUNCA são juntadas para casar com `exatos`:
 *    "por no" (espanhol, "por não") viraria "porno".
 *
 * A ESTRATÉGIA CONTRA FALSO POSITIVO (decisão do dono: lista conservadora). A legenda é de aula, desenho, série e
 * conversa. Só entra palavra SEM uso neutro em pt, en ou es (as listas valem para qualquer idioma: o idioma detectado
 * pode estar errado). Ficaram de fora, com o motivo:
 *  - `sexo`, `sex`: "sexo feminino", "sex education" são aula de biologia e formulário;
 *  - `sexo oral`, `oral sex`, `sexo anal`: aparecem em educação sexual e saúde;
 *  - `nude`, `pelado`, `desnudo`: arte, fotografia, "pé pelado";
 *  - `vagina`, `penis`, `clitoris`, `anal`: anatomia;
 *  - `coger` (pegar, na Espanha), `paja` (palha), `polla` (franguinho), `zorra` (raposa), `verga` (verga do navio),
 *    `pica` (pica, de picar), `cono` (cone; é o que "coño" vira sem o til), `hostia` (hóstia), `pinche` (ajudante de
 *    cozinha), `pajero` (o carro);
 *  - `pau`, `rola`, `cu` (pau, rolar, e "cu" de "see you" em inglês de chat), `gozar` (gozar férias), `safado`;
 *  - `cock` (galo), `pussy` (gatinho), `tits` (o passarinho), `dick` (Moby Dick, nome), `cum` (cum laude), `threesome`;
 *  - `bicha` (fila, em Portugal), `veado` (o animal), `fag` (cigarro, no Reino Unido), `chink` (fresta), `spic` (spick
 *    and span), `coon` (guaxinim), `dyke` (dique), `crioulo` (a língua), `marica`, `mongol`, `retard`;
 *  - `damn`, `crap`, `bastard`, `piss`, `maldito`, `droga`, `otario`, `babaca`: leves ou com uso neutro;
 *  - `niggard` (avarento): por isso `nigger` é exato, e não prefixo.
 *
 * O QUE ESTA LISTA NÃO PEGA: eufemismo, paráfrase e idioma fora de pt/en/es. Ela é a rede de baixo, não o juiz.
 */

/**
 * `sexual` e `odio` valem para o perfil protegido e para o adulto que liga a opção. `palavrao` (decisão do dono de
 * 17/11/2026) vale para o perfil protegido, em qualquer idade de menor e sem conta.
 */
export type CategoriaDaLegenda = 'sexual' | 'odio' | 'palavrao';

export interface TermosDaCategoria {
  categoria: CategoriaDaLegenda;
  exatos: readonly string[];
  prefixos: readonly string[];
  pares: readonly string[];
}

export const TERMOS_DA_LEGENDA: readonly TermosDaCategoria[] = [
  {
    /* Pornografia e sexual explícito, sem uso neutro. */
    categoria: 'sexual',
    prefixos: ['porn', 'masturb', 'orgasm'],
    exatos: [
      // sites
      'xvideos',
      'pornhub',
      'xhamster',
      'onlyfans',
      'redtube',
      'youporn',
      // en
      'hentai',
      'nudes',
      'blowjob',
      'blowjobs',
      'handjob',
      'handjobs',
      'dildo',
      'dildos',
      'cumshot',
      'creampie',
      'gangbang',
      'milf',
      'milfs',
      'bukkake',
      'deepthroat',
      'rimjob',
      'horny',
      'boobs',
      'sexting',
      // pt
      'putaria',
      'boquete',
      'punheta',
      'punheteiro',
      'siririca',
      'transar',
      'transando',
      'transou',
      'transaram',
      'transam',
      'buceta',
      'xoxota',
      'xereca',
      'piroca',
      'tesao',
      'tesuda',
      'tesudo',
      'foder',
      'fuder',
      'fodendo',
      'fudendo',
      // es
      'follar',
      'follando',
      'follamos',
      'follaron',
      'follada',
      'mamada',
      'chupamela',
      'cachondo',
      'cachonda',
      'cachondos',
      'cachondas',
    ],
    pares: ['dick pic', 'dick pics', 'blow job', 'hand job', 'sex tape'],
  },
  {
    /* Ofensas raciais e LGBTfóbicas inequívocas (as mesmas do filtro do tutor, `listasParaMenores.ts`) e lemas de
       supremacia. */
    categoria: 'odio',
    prefixos: [],
    exatos: [
      // en
      'nigger',
      'niggers',
      'nigga',
      'niggas',
      'faggot',
      'faggots',
      'kike',
      'kikes',
      'tranny',
      'trannies',
      'wetback',
      'wetbacks',
      // pt
      'viado',
      'viados',
      'viadinho',
      'traveco',
      'travecos',
      'baitola',
      'boiola',
      'sapatao',
      // es
      'maricon',
      'maricones',
      'sudaca',
      'sudacas',
      'negrata',
      'negratas',
    ],
    /* "white power" e "poder branco" ficaram de fora: "white power cable", "o poder branco das ondas". */
    pares: ['sieg heil', 'heil hitler'],
  },
  {
    /* Palavrões comuns. Só para o perfil protegido. */
    categoria: 'palavrao',
    prefixos: ['fuck', 'motherfuck', 'bitch', 'caralh'],
    exatos: [
      // en
      'shit',
      'shits',
      'shitty',
      'shitting',
      'bullshit',
      'shithead',
      'horseshit',
      'asshole',
      'assholes',
      'cunt',
      'cunts',
      'dickhead',
      'cocksucker',
      'wtf',
      'stfu',
      // pt
      'merda',
      'merdas',
      'porra',
      'bosta',
      'cacete',
      'puta',
      'putas',
      'puto',
      'putos',
      'foda',
      'fodas',
      'fodase',
      'fodido',
      'fodida',
      'fodeu',
      'arrombado',
      'arrombada',
      'arrombados',
      'pqp',
      'fdp',
      'vsf',
      'tnc',
      'krl',
      // es
      'mierda',
      'mierdas',
      'joder',
      'jodido',
      'jodida',
      'jodete',
      'pendejo',
      'pendeja',
      'pendejos',
      'cabron',
      'cabrona',
      'cabrones',
      'gilipollas',
      'hijueputa',
      'hijoputa',
      'carajo',
      'chingar',
      'chinga',
      'chingada',
      'chingado',
      'chingate',
      'culero',
      'culeros',
    ],
    pares: [],
  },
];

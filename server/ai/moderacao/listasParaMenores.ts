/**
 * AS LISTAS DO FILTRO LOCAL DE SAÍDA PARA PERFIL PROTEGIDO (change `filtro-tutor-menores`, decisão do dono de 15/11/2026,
 * opção B: determinístico, custo zero). Quem aplica é `moderarSaidaDoTutor.ts`; aqui só moram os padrões, para serem
 * revisados sem ler código.
 *
 * COMO OS PADRÕES SÃO LIDOS. Cada expressão roda sobre o texto JÁ NORMALIZADO (`normalizar` em `moderarSaidaDoTutor.ts`):
 * minúsculo, sem acento (`ç`→`c`, `ñ`→`n`), leetspeak desfeito dentro de palavras (`p0rn`→`porn`, `s3x0`→`sexo`), toda
 * pontuação vira espaço (menos `?`), letras soltas espaçadas juntadas (`s e x o`→`sexo`) e 3+ letras repetidas viram uma
 * (`porrrn`→`porn`). Então: escreva SEM acento, com espaço simples entre palavras, e o apóstrofo vira espaço
 * (`what's` → `what s`, `don't` → `don t`).
 *
 * A ESTRATÉGIA CONTRA FALSO POSITIVO. O tutor ensina idioma, e vocabulário de farmácia, notícia e gíria aparece numa aula
 * normal. Por isso:
 *  - PREFERIMOS FRASE E INTENÇÃO A PALAVRA SOLTA: "drug", "arma", "bomba", "matar", "sexo" sozinhos passam; o que barra é
 *    "como comprar maconha", "how to make a bomb", "como se matar", "fazer sexo". Palavra solta só entra quando ela não
 *    tem uso neutro numa aula (pornografia, ofensas raciais e homofóbicas inequívocas);
 *  - PALAVRAS AMBÍGUAS FICAM DE FORA, com o motivo anotado: `coke` (Coca-Cola), `pot`, `weed` sozinho (capinar), `coger`
 *    (pegar, na Espanha), `bicha` (fila, em Portugal), `veado` (o animal), `fag` (cigarro, no Reino Unido), `chink`
 *    (fresta), `crioulo` (a língua), `gozar` (gozar férias), `pelado`, `marica`;
 *  - DADO PESSOAL E ALICIAMENTO SÃO FRASES DE AULA ("Where do you live?", "Let's meet", "It's a secret"). Para essas duas
 *    categorias o trecho CITADO — entre `**…**`, aspas ou crase, que é como o tutor marca o idioma estudado
 *    (`sistemaDoTutor`) — é ignorado QUANDO há explicação fora dele ("diga", "significa", "em inglês"; ver `EXPLICACAO`
 *    em `moderarSaidaDoTutor.ts`), e o pedido direto de dado precisa terminar em pergunta (`?`) ou ser imperativo
 *    ("me passa o seu número"). As outras categorias valem até dentro da citação.
 *
 * O QUE ESTE FILTRO NÃO PEGA (e por isso a opção C, moderação por IA, fica para depois): paráfrase, eufemismo, idioma fora
 * de pt/en/es (o leetspeak e os contatos — link, e-mail, telefone, @ — valem para qualquer idioma), ironia e contexto.
 * Ele é a rede de baixo, não o juiz.
 */

/** As categorias que barram. São rótulos fixos: vão ao log e à métrica, nunca o texto. */
export type CategoriaDeBloqueio =
  | 'sexual'
  | 'autolesao'
  | 'drogas'
  | 'armas_violencia'
  | 'odio'
  | 'dados_pessoais'
  | 'aliciamento'
  | 'contato_externo'
  /** Texto acima do teto conferido (`TETO_DO_TEXTO_MODERADO`): barrado sem conferir. Não tem lista. */
  | 'texto_longo'

export interface ListaDeCategoria {
  categoria: CategoriaDeBloqueio
  /** Ignora o trecho citado (`**…**`, aspas, crase) antes de casar: a categoria é feita de frases que se ensinam. */
  ignoraCitacao?: boolean
  padroes: readonly RegExp[]
}

/* Artigos e quantificadores que podem ficar entre o verbo e o objeto ("comprar UMA arma", "buy SOME weed"). Só eles: um
   intervalo livre ("how to use THE WORD drug") viraria falso positivo. */
const DET = String.raw`(?:(?:a|o|as|os|um|uma|uns|umas|algum|alguma|mais|the|an|some|more|un|una|unos|unas|el|la|los|las|mas) )?`

/* ── Drogas: só VERBO DE OBTER/USAR + NOME DA DROGA, depois de "como/onde/how to/where". ──
   Fora de propósito: `coke`/`coca` (refrigerante), `pot`/`weed`/`hierba` sozinhos (panela, capinar, erva), `pills`/`remedio`
   (aula de farmácia). "Drug" e "droga" só contam como objeto desse verbo, nunca sozinhos ("drugstore", "que droga!"). */
const DROGAS_PT =
  'maconha|cocaina|crack|heroina|metanfetamina|lsd|ecstasy|mdma|drogas?|baseados?|lanca perfume|ketamina|k9'
const DROGAS_EN = 'weed|marijuana|cannabis|cocaine|crack|heroin|meth|lsd|ecstasy|mdma|molly|ketamine|fentanyl|drugs'
const DROGAS_ES = 'marihuana|cocaina|crack|heroina|metanfetamina|lsd|extasis|mdma|drogas?|porros?|ketamina'

/* ── Dado pessoal: "número favorito", "escola favorita", "number one goal", "número da sorte" são conversa de aula,
   não pedido de dado. Vem logo depois do nome do dado. ── */
const NAO_E_DADO = String.raw`(?! (?:favorit\w*|favourit\w*|preferid\w*|da sorte|de la suerte|lucky|one|um|uno|1)\b)`

/* ── Armas: objetos que só são arma. "bomba de…" (chocolate, água, ar) e "pistola de…" (cola quente) ficam de fora. ── */
const ARMAS_PT = String.raw`bombas?(?! de )|explosivos?|armas?(?: de fogo)?|revolver|pistolas?(?! de )|molotov|granadas?|silenciador`
const ARMAS_EN = 'bomb|pipe bomb|explosives?|guns?|firearms?|weapons?|molotov|silencer|ghost gun'
const ARMAS_ES = String.raw`bombas?(?! de )|explosivos?|armas?(?: de fuego)?|pistolas?(?! de )|molotov|granadas?|silenciador`

export const LISTAS_PARA_MENORES: readonly ListaDeCategoria[] = [
  {
    /* Conteúdo sexual explícito. `\bporn\w*` cobre porn/porno/pornografia/pornography (nenhuma palavra neutra começa
       assim). "sexo"/"sex" sozinhos ficam de fora: "sexo masculino" num formulário é aula. */
    categoria: 'sexual',
    padroes: [
      /\bporn\w*/,
      /\b(?:xvideos|pornhub|onlyfans|xhamster)\b/,
      /\bmasturba\w*/,
      /\borgasm\w*/,
      // pt
      /\b(?:putaria|boquete|punheta|siririca|transar|transando|transou|foder|fuder|fodendo|fudendo|tesao)\b/,
      /\b(?:fazer|faz|fizeram|ter|tendo|teve) (?:sexo|relacoes sexuais)\b/,
      /\bsexo (?:oral|anal|explicito|selvagem|a tres|virtual)\b/,
      /\bnudes\b/,
      // en
      /\b(?:blowjob|handjob|dildo|horny|sexting|boobs)\b/,
      /\bfuck\w*/,
      /\b(?:have|having|had) sex\b/,
      /\bsex (?:with|scene|video|chat|tape)\b/,
      /\bdick pics?\b/,
      // es
      /\b(?:follar|follando|follamos|mamada|cachond[ao]s?|chupamela)\b/,
      /\b(?:tener|tenemos|tuvieron) (?:sexo|relaciones sexuales)\b/,
    ],
  },
  {
    /* Automutilação: INSTRUÇÃO ou INCENTIVO. Mencionar o assunto para orientar ("fale com um adulto, ligue 188") passa —
       é o que a instrução de segurança pede. "como cortar" sem "se" é receita. */
    categoria: 'autolesao',
    padroes: [
      // pt
      /* "machucar"/"ferir" sozinhos são acidente ("como se machucar menos no futebol"): só contam com intenção. */
      /\b(?:como|jeitos? de|formas? de|maneiras? de|metodos? de|metodos? para) (?:se (?:matar|suicidar|cortar|enforcar)|suicidar|tirar a (?:propria )?vida)\b/,
      /\bse (?:machucar|ferir|cortar|machuca|fere|corta) de proposito\b/,
      /\b(?:voce )?(?:deveria|devia|deve) (?:se matar|se suicidar|se cortar|se machucar|tirar (?:a )?sua (?:propria )?vida)\b/,
      /\bvoce (?:deveria|devia|deve) morrer\b/,
      /\b(?:se mata|vai se matar)\b(?! de )/,
      // en
      /\bkill (?:yourself|urself)\b/,
      /\bkys\b/,
      /* "cut yourself some slack" é expressão (pegar leve consigo mesmo). */
      /\b(?:how to|ways? to|you should|go) (?:kill|hurt|cut|harm|end) (?:yourself|myself|your life|my life)\b(?! some slack)/,
      /\b(?:how to|ways? to) commit suicide\b/,
      /\b(?:you should|go) die\b/,
      /\b(?:best|easiest|painless|quickest) way to die\b/,
      // es
      /* "córtate el pelo", "cómo cortarte el flequillo": cortar(se) seguido de objeto é cabelo/unha. Sozinho ou com
         veia/pulso/braço, é automutilação. */
      /\b(?:matate|suicidate)\b/,
      /\bcort(?:ate|arte|arse)\b(?! (?:el|la|las|los|tu|tus|su|sus|pelo|unas|flequillo|barba|fleco)\b)/,
      /\bcort(?:ate|arte|arse) (?:las |tus |sus )?(?:venas|munecas|brazos|piernas)\b/,
      /\b(?:como|formas? de|maneras? de) (?:suicidarse|suicidarte|matarse|matarte|hacerse dano|hacerte dano)\b/,
      /\bdeberias (?:morir|matarte|suicidarte|cortarte)\b(?! (?:el|la|las|los|tu|tus|su|sus|pelo|unas|flequillo)\b)/,
    ],
  },
  {
    /* Drogas: como obter, usar ou fazer, e o incentivo direto ("experimente maconha"). */
    categoria: 'drogas',
    padroes: [
      new RegExp(
        String.raw`\b(?:como|onde|aonde|jeito de|da pra) (?:eu |voce |se )?(?:pode |posso |consigo |consegue )?(?:comprar|conseguir|arrumar|usar|fumar|cheirar|injetar|plantar|cultivar|fazer|preparar|vender|esconder) ${DET}(?:${DROGAS_PT})\b`,
      ),
      new RegExp(
        String.raw`\b(?:how (?:do (?:i|you) |can (?:i|you) |to )|where (?:do (?:i|you) |can (?:i|you) |to )|ways? to )(?:buy|get|use|smoke|snort|inject|grow|make|cook|sell|hide|score) ${DET}(?:${DROGAS_EN})\b`,
      ),
      new RegExp(
        String.raw`\b(?:como|donde|forma de|manera de) (?:puedo |puedes |se puede )?(?:comprar|conseguir|usar|consumir|fumar|esnifar|inyectar|cultivar|hacer|preparar|vender|esconder) ${DET}(?:${DROGAS_ES})\b`,
      ),
      /\b(?:experimente|experimenta|prove|try|prueba|pruebe) (?:a |um pouco de |some |un poco de )?(?:maconha|cocaina|heroina|metanfetamina|weed|marijuana|cocaine|heroin|meth|marihuana|lsd|ecstasy|mdma)\b/,
    ],
  },
  {
    /* Armas e violência: como fazer/obter arma, como ferir alguém, ataque a escola. "matar o tempo", "kill time",
       "how to shoot a photo" e "bath bomb" passam: o objeto tem de ser pessoa ou arma. */
    categoria: 'armas_violencia',
    padroes: [
      new RegExp(
        String.raw`\b(?:como|jeito de|formas? de|onde) (?:se )?(?:fazer|fabricar|montar|construir|comprar|conseguir) ${DET}(?:${ARMAS_PT})\b`,
      ),
      /\b(?:como|jeito de|formas? de) (?:matar|assassinar|esfaquear|envenenar|sequestrar|machucar|bater em|atirar em) (?:alguem|uma pessoa|pessoas|gente|colegas?|professor(?:a)?)\b/,
      /\b(?:atacar|atirar em|explodir|invadir armado) (?:a |uma |na |minha )?escola\b/,
      new RegExp(
        String.raw`\b(?:how to|ways? to|where to|how do (?:i|you)|how can (?:i|you)) (?:make|build|buy|get|assemble) ${DET}(?:${ARMAS_EN})\b`,
      ),
      /\b(?:how to|ways? to|you should|i will|i m going to|lets|let s) (?:kill|murder|stab|shoot|poison|kidnap|hurt|beat up) (?:someone|somebody|people|a person|him|her|them|the teacher|classmates?)\b/,
      /\bshoot up (?:a |the |my |your )?school\b/,
      new RegExp(
        String.raw`\b(?:como|forma de|donde) (?:hacer|fabricar|construir|comprar|conseguir) ${DET}(?:${ARMAS_ES})\b`,
      ),
      /\b(?:como|forma de) (?:matar|asesinar|apunalar|envenenar|secuestrar|herir) (?:a alguien|a una persona|a la gente|a mi|a tu|a su)\b/,
    ],
  },
  {
    /* Ódio: ofensas inequívocas (sem uso neutro) e lemas de supremacia. De fora, com motivo no topo: `bicha`, `veado`,
       `fag`, `chink`, `crioulo`, `marica`, `mongol`, `retard`. */
    categoria: 'odio',
    padroes: [
      /\b(?:nigger|niggers|nigga|niggas|faggot|faggots|kike|kikes|tranny|trannies|wetback|wetbacks)\b/,
      /\b(?:viado|viados|viadinho|traveco|travecos|baitola|boiola|sapatao)\b/,
      /\b(?:maricon|maricones|sudaca|sudacas|negrata|negratas)\b/,
      /\b(?:sieg heil|heil hitler|white power|poder branco)\b/,
      /\b(?:raca|race|raza) (?:inferior|superior)\b/,
    ],
  },
  {
    /* Pedido de dado pessoal ou de foto. Precisa ser PEDIDO: pergunta terminada em `?` ou imperativo. A frase de aula
       vem citada ("**What's your address?**") e a citação é ignorada aqui. */
    categoria: 'dados_pessoais',
    ignoraCitacao: true,
    padroes: [
      // pt
      new RegExp(
        String.raw`\b(?:qual|quais) (?:e |sao )?(?:o |a |os |as )?(?:seu|sua|seus|suas|teu|tua) (?:endereco|telefone|celular|numero|whats|whatsapp|zap|instagram|insta|email|e mail|nome completo|escola|cpf|senha|localizacao|bairro|rua)\b${NAO_E_DADO}[^?]{0,40}\?`,
      ),
      /\b(?:onde|em que (?:cidade|bairro|rua|escola)|em qual (?:cidade|bairro|rua|escola)) (?:voce|tu|vc) (?:mora|moras|vive|estuda|estudas)\b[^?]{0,30}\?/,
      /\b(?:me )?(?:manda|mande|envia|envie|passa|passe) (?:pra mim |para mim )?(?:o |a |uma )?(?:seu|sua|teu|tua) (?:endereco|telefone|celular|numero|whats|whatsapp|zap|instagram|insta|email|e mail|foto|selfie|localizacao|senha)\b/,
      /\b(?:manda|mande|envia|envie|tira|tire) (?:uma )?(?:foto|selfie|video) (?:sua|de voce|do seu corpo)\b/,
      // en
      new RegExp(
        String.raw`\b(?:what s|what is|whats) your (?:home )?(?:address|phone number|phone|number|cell|full name|school|instagram|snapchat|email|password|location)\b${NAO_E_DADO}[^?]{0,30}\?`,
      ),
      /\bwhere do you (?:live|go to school|study)\b[^?]{0,20}\?/,
      /\b(?:send|give|tell) me your (?:home )?(?:address|phone number|number|phone|email|instagram|snapchat|location|password|full name|photo|picture|pic|selfie)\b/,
      /\bsend me (?:a )?(?:photo|picture|pic|selfie|video) of (?:yourself|you)\b/,
      // es
      new RegExp(
        String.raw`\b(?:cual es|cuales son) (?:tu|tus) (?:direccion|telefono|numero|celular|nombre completo|escuela|colegio|instagram|correo|email|contrasena|ubicacion)\b${NAO_E_DADO}[^?]{0,30}\?`,
      ),
      /\bdonde (?:vives|estudias)\b[^?]{0,20}\?/,
      /\b(?:enviame|mandame|pasame|dame) (?:tu|una) (?:direccion|telefono|numero|celular|correo|email|instagram|foto|selfie|ubicacion|contrasena)\b/,
    ],
  },
  {
    /* Aliciamento: segredo com adulto, encontro pessoalmente, "está sozinho?", elogio sexualizado, apagar a conversa.
       Frases de aula ("It's our secret", "Are you alone?") vêm citadas e a citação é ignorada. */
    categoria: 'aliciamento',
    ignoraCitacao: true,
    padroes: [
      // pt
      /* "é o nosso segredo" sozinho é a TRADUÇÃO de uma frase de aula (vem sem aspas, em português); o que barra é o
         segredo que se combina: "isso fica (como) nosso segredo", "segredo entre nós". */
      /\b(?:fica|ficar|sera|vai ser) (?:como |o |um )?(?:nosso|nossa) (?:segredo|segredinho)\b/,
      /\bsegredo (?:entre nos|so nosso|nosso e de mais ninguem)\b/,
      /\bnao (?:conta|conte|fala|fale|diga|diz) (?:isso |nada )?(?:pra|para|a|aos) (?:ninguem|seus pais|sua mae|seu pai|seus responsaveis)\b/,
      /\b(?:encontrar|conhecer|ver) (?:voce|te|vc) pessoalmente\b/,
      /* "ao vivo" saiu: "ver o jogo ao vivo" é programa, não encontro. */
      /\b(?:vamos|podemos|quer|queria) (?:nos )?(?:encontrar|conhecer|ver)(?: \w+){0,3} (?:pessoalmente|sozinh[oa]s?)\b/,
      /\b(?:voce|vc|tu) (?:esta|ta|estas) sozinh[ao] (?:em casa|agora)\b/,
      /\b(?:voce|vc|tu) (?:e|es) (?:muito |tao )?(?:sexy|sexi|gostos[ao]|sensual)\b/,
      /\b(?:apague|apaga|deleta|delete|borra|borre) (?:essa|esta|nossa) (?:conversa|mensagem|mensagens)\b/,
      // en
      /* "our secret ingredient/recipe" é receita: o segredo só conta quando é COMBINADO ("it's our secret"). */
      /\bour little secret\b/,
      /\b(?:it s|it is|this is|that s|that is|keep it|keep this|will be|stays) our secret\b(?! (?:ingredient|recipe|sauce|weapon|formula|spice|tip)s?\b)/,
      /\bdon t tell (?:your )?(?:parents|mom|dad|mum|anyone|anybody)\b/,
      /* "meet after school at the library" é combinado de estudo; "meet ME after school" e "alone" não. */
      /\bmeet (?:me |you |up )?(?:in person|in real life|irl|alone)\b/,
      /\bmeet me after school\b/,
      /\bare you (?:home )?alone\b/,
      /\byou (?:are|re) (?:so |really |very )?sexy\b/,
      /\bdelete (?:this|our|the) (?:chat|conversation|messages?)\b/,
      // es
      /* "nuestro secreto es el amor" é receita; "es/será/queda (como) nuestro secreto" é combinado. */
      /\b(?:es|sera|queda|quedara|como) nuestro secreto\b(?! (?:ingrediente|receta|salsa|truco|es|de|para)\b)/,
      /\bnuestro secretito\b/,
      /\bno (?:se lo )?(?:digas|cuentes) a (?:nadie|tus padres|tu mama|tu papa)\b/,
      /\b(?:vernos|conocernos|encontrarnos) en persona\b/,
      /* "Estas solo palabras" (estas = estas, demonstrativo): só a PERGUNTA "¿estás solo/sola?" conta. */
      /\bestas sol[ao]\b[^?]{0,20}\?/,
      /\beres (?:muy |tan )?(?:sexy|sensual)\b/,
      /\bborra (?:esta|nuestra) (?:conversacion|mensajes?|chat)\b/,
    ],
  },
  {
    /* Convite para falar FORA do app. Link, e-mail, telefone e @ de rede social são detectados à parte, no texto antes
       do leetspeak (`detectarContato` em `moderarSaidaDoTutor.ts`). */
    categoria: 'contato_externo',
    padroes: [
      /\b(?:me (?:chama|adiciona|add|segue|siga)|chama|fala comigo|add me|follow me|dm me|message me|text me|agregame|escribeme|sigueme) (?:no |na |on |en |por |pelo )?(?:whats|whatsapp|zap|insta|instagram|discord|telegram|snap|snapchat|tiktok|facebook|kik|signal)\b/,
    ],
  },
]

/** Redes onde um `@nome` é perfil. O `@palavra` sozinho é a ficha do iChat (`src/lib/ichat/pedido.ts`) e passa. */
export const REDES_SOCIAIS =
  /\b(?:insta|instagram|ig|tiktok|twitter|snap|snapchat|discord|telegram|whats|whatsapp|zap|kik|facebook|threads|arroba)\b/

/**
 * Domínios (de link e de e-mail) que podem aparecer no texto do tutor sem virar "contato para fora": o do próprio app
 * e os domínios de EXEMPLO, que aula usa para ensinar a escrever e-mail ("My email is anna@example.com").
 */
export const DOMINIOS_PERMITIDOS: readonly string[] = [
  'frasy.com.br',
  'example.com',
  'example.org',
  'example.net',
  'exemplo.com',
  'exemplo.com.br',
  'ejemplo.com',
  'test.com',
]

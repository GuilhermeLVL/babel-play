# Como testar a aplicação em outros idiomas

Roteiro para validar o multi-idioma com as próprias mãos. Cada passo diz **o que você deve ver** —
se vir outra coisa, é defeito, e o que descrevo como "esperado" é o contrato.

---

## Antes de começar

```bash
cd .claude/worktrees/multi-idioma
npm run dev            # sobe em http://localhost:3100
```

Se a porta 3100 estiver ocupada por outra sessão, use `PORT=3101 npx tsx server.ts`.

---

## 1. O jeito rápido: trocar o idioma pela URL

**Não precisa mexer em nada da sua conta.** Acrescente `?ui=<idioma>` a qualquer endereço:

| endereço | o que você deve ver |
|---|---|
| `localhost:3100/jogar?ui=en` | menu em **Home / Record audio / Practice**, jogos em **Memory game**, **Build the sentence** |
| `localhost:3100/jogar?ui=es` | menu em **Inicio / Grabar audio / Jugar** |
| `localhost:3100/jogar?ui=ar` | menu em **árabe** e a interface **espelhada** — menu à direita, texto alinhado à direita |
| `localhost:3100/jogar?ui=xx` | tudo em `[Ĵögö dá mémóríá ····]` — o pseudo-idioma, explicado no §4 |
| `localhost:3100/jogar` | volta ao português (o override não persiste) |

**O que confirma que funcionou:** o menu lateral muda de idioma. Se ele continuar em português, o
catálogo não carregou — abra o DevTools (F12) → Network e procure por `i18n/en.json`.

---

## 2. O jeito real: como um usuário estrangeiro faria

1. **Ajustes** (engrenagem, no topo à direita)
2. Seção **Idiomas** → campo **"Meu idioma"**
3. Escolha **English (US)**

**O que deve acontecer:** a interface inteira muda na hora, sem recarregar. O menu vira
`Home / Record audio / Practice / My media / My words`.

**Por que "Meu idioma" e não uma opção separada de idioma da interface:** esse campo já significa
"o idioma que você fala e o das traduções que você lê". Perguntar duas vezes criaria o estado
incoerente de quem diz falar alemão e lê a tela em português.

**Para voltar:** mesmo caminho, escolha **Português (BR)**.

---

## 3. O que conferir em cada tela

Com a interface em **inglês** (`?ui=en`):

### Tela de jogos (`/jogar`)
- [ ] Menu lateral em inglês
- [ ] Nomes dos jogos: **Memory game**, **Word search**, **Build the sentence**, **Quick challenge**
- [ ] Descrições sob cada jogo em inglês
- [ ] Os motivos de bloqueio ("this browser has no voice in…") em inglês

### Meu vocabulário (`/vocabulario` → botão "My words")
- [ ] Cartões de métrica: **ACTIVE LEXICAL VOLUME**, **AVERAGE RETENTION RATE**, **REVIEWS DONE**
- [ ] **Os números com vírgula: `2,733`** — não `2.733`. Este é o teste mais importante desta tela:
      em português são 2.733 palavras; um americano lendo "2.733" entende 2,733 (dois e pouco).

### Ajustes (`/ajustes`)
- [ ] Rótulos das abas e dos campos em inglês
- [ ] O nome dos idiomas na lista continua **no próprio idioma** (`Español`, `日本語`) — isso é
      intencional: na hora de escolher, a pessoa procura o próprio idioma escrito como ele é.
      Dentro de uma frase ("this browser has no voice in **German**") aí sim vai traduzido.

---

## 4. Testar árabe: a interface espelhada

`localhost:3100/jogar?ui=ar`

- [ ] O menu vai para a **direita** da tela
- [ ] O texto alinha à **direita**
- [ ] Margens e espaçamentos trocam de lado (não ficam "colados" do lado errado)

**Como conferir de verdade** (F12 → Console):
```js
document.documentElement.dir   // deve ser "rtl"
document.documentElement.lang  // deve ser "ar"
```

Só uma parte do árabe está traduzida (21 chaves) — o resto aparece em português. **Isso é o
comportamento correto**: sem tradução, a frase original aparece, nunca um espaço vazio.

---

## 5. O teste que encontra problemas sem tradutor: pseudo-localização

`localhost:3100/jogar?ui=xx`

Tudo vira `[Ĵögö dá mémóríá ······]` — o texto original, acentuado e **40% mais longo**, que é o
que o alemão faz. Duas coisas ficam visíveis de imediato:

**a) Toda frase que ainda NÃO passa pelo sistema de tradução** continua em português limpo, no meio
do texto acentuado. É assim que se descobre o que falta migrar, sem ler o código.

**b) Todo lugar onde o layout quebra com texto mais longo** — botão cortado, rótulo com reticências,
tabela estourando.

Isso também roda sozinho:
```bash
npx playwright test tests/e2e/pseudo-localizacao.e2e.ts
```
Varre 5 telas e **falha** se algum texto de interface for cortado.

---

## 6. Verificar tudo de uma vez (o que o CI faz)

```bash
npm run typecheck        # tipos
npm run lint             # estilo
npm test                 # 2.775 testes unitários
npm run i18n:orfas       # chaves de tradução que sumiram do código
node scripts/i18n/pseudo.mjs --check   # catálogo pseudo em dia
npx playwright test      # 20 testes de ponta a ponta, no navegador
```

E as regras arquiteturais, que barram reincidência:
```bash
./node_modules/.bin/ast-grep test -c sgconfig.yml    # as regras funcionam
./node_modules/.bin/ast-grep scan -c sgconfig.yml src
```

A regra `locale-cravado` impede que volte a existir `toLocaleString('pt-BR')` no código — foi ela
que faltou para os 44 pontos não terem entrado em primeiro lugar.

---

## 7. O que ainda NÃO está traduzido, e por quê

Seja honesto com o que você vai ver: **a maior parte do app continua em português.**

| | estado |
|---|---|
| Menu, jogos, métricas, motivos de bloqueio, ajustes | traduzidos |
| O resto das telas (Análise, Captura, Biblioteca, Leitura) | **em português** |

O número real: **~330 chaves traduzidas de ~2.000**.

**Isso é por desenho, não por descuido.** A chave de tradução é o próprio texto português, então
uma frase sem tradução aparece em português — legível — em vez de sumir ou virar um código. É o
que permite migrar uma tela por vez sem quebrar as outras.

O que falta para completar não é engenharia: é **traduzir**, e a decisão de quem faz isso está
documentada em [`i18n-lacunas.md`](./i18n-lacunas.md) §6.

## Why

Ouvir a fala de onde a palavra veio é o que separa um cartão do Frasy de um cartão de dicionário. Hoje isso já existe pela
metade, e a metade que existe é cara e frágil:

- O verso do cartão toca "Fala original" (`src/lib/revisao/falaOriginal.ts`, `lib/revisao/cena.ts`) usando o trecho
  `inicioMs`/`fimMs` da gravação da SESSÃO. Para tocar 3 segundos, o app baixa o áudio INTEIRO da sessão
  (`lib/audioDaSessao.ts`: o arquivo vai para a memória; teto de upload de 120 MB). O próprio código admite o custo: "o app
  não corta o arquivo no servidor".
- Só funciona se a sessão tem áudio gravado e guardado no R2 (ROPA T03, "enquanto a sessão/conta existir"). Quem usa SEM
  CONTA, quem não gravou o áudio, quem apagou a sessão e quem trouxe o cartão do Anki fica com a voz do aparelho
  (`lib/tts.falar`), que não é a fala original.
- O cartão sobrevive à sessão (exportar `.apkg`, apagar a gravação), mas o áudio morre com ela.
- A captura já corta cada fala em PCM (`pipelineDeFala.ts:1154`, `guardarAudioDaFala` em `lib/captura/audioDasFalas.ts`), mas
  só para o Quest, só em memória, e descarta ao fechar a aba.

## Para quem

Quem revisa cartões nascidos da legenda (o público central: adolescentes e adultos que assistem e conversam). Menores
incluídos: por isso o padrão é **só no aparelho**.

## What Changes

Tudo atrás da flag nova `cartao_com_audio` (nasce DESLIGADA, sem regra de plano).

- **O trecho vira um arquivo pequeno e do cartão.** No instante em que a pessoa salva a palavra (do painel da frase, da
  lista de palavras da sessão ou do "Juntar a cena"), o app corta a fala (de 1 a 8 s, com 150 ms de folga) e a codifica em
  Ogg Opus mono ~24 kbps (`lib/codificadorOpus.ts` + `lib/oggOpus.ts`, que já existem). ~3 KB/s, então ~25 KB por cartão.
- **Três destinos, uma escolha da pessoa** (Ajustes, Privacidade, "Áudio dos cartões"):
  1. **Só neste aparelho** (padrão; o único para perfil protegido): IndexedDB, no molde de `lib/revisao/vozGuardada.ts`
     (apagar o cartão apaga o áudio; trocar de conta apaga tudo; sem IndexedDB, avisa e segue sem áudio).
  2. **Na minha conta** (só adulto declarado, com conta): sobe no R2 como anexo do cartão e passa pelo teto `R2_TETO_MB`.
  3. **Não guardar** (as palavras seguem como hoje: sessão ou voz do aparelho).
- **O verso toca o clipe do cartão primeiro**; sem clipe, cai no caminho de hoje (trecho da sessão, depois voz do aparelho).
  Nunca baixa a sessão inteira quando há clipe.
- **Sai junto no `.apkg`** (campo `[sound:...]` e a mídia no zip) quando a pessoa exporta e escolheu guardar; o `.apkg` é
  montado no navegador (`lib/anki/montarApkg.ts`), então nada passa pelo servidor.
- **Cartões antigos** ganham o clipe só quando a gravação da sessão existe e a pessoa pede ("Guardar o áudio deste cartão"):
  recorta o trecho do áudio já baixado. Sem varredura em massa.

## Delta sobre o que já existe

Não duplica `cartoes` (3.1, feito: a fala original no cartão pelo trecho da sessão) nem `cartao-leve-da-palavra`
(arquivada). Muda a FONTE do áudio (clipe do cartão em vez da sessão inteira) e acrescenta o destino local. Não existe change
ativa ou arquivada com "áudio do cartão" (conferido em `openspec/changes` e `archive`).

## Fora de escopo

- Áudio de terceiros além do que a captura já ouviu: o clipe é a fala que o app transcreveu, nada mais.
- Reconhecimento de voz sobre o clipe, "treinar o ouvido" e pares de som (ficam em `cartoes`).
- Compartilhar clipe entre pessoas ou publicar (nenhum link, nenhum endpoint público).
- Imagem da cena (change separada: `cartao-com-captura-de-tela`).

## Privacidade e retenção zero (o ponto central)

- "Retenção zero" do produto vale para PROVEDORES DE IA. O clipe NUNCA vai a provedor de IA nesta change: a fala já foi
  enviada ao STT quando a pessoa usou nuvem; o clipe guardado é uma cópia no destino escolhido, sem nova chamada externa.
- **Perfil protegido** (menor de 18 ou idade não declarada, inclusive sem conta): só o destino local; a opção "Na minha
  conta" nem aparece. A fala pode ter a voz de outras pessoas (amigos, família numa chamada); por isso o aviso na primeira
  vez: "O áudio guarda a voz de quem estava falando. Fica só neste aparelho."
- Terceiros: só se guarda o clipe de falas ouvidas pela captura da própria pessoa; a metade "outra pessoa" do Intérprete NÃO
  gera clipe (decisão de produto, ver Decisões do dono).
- Exclusão: excluir cartão, excluir sessão (quando o clipe é da conta) e "Excluir conta" apagam os clipes
  (`exclusao-e-exportacao-completas` precisa listar o novo anexo; tarefa 3.2). O ROPA ganha uma linha nova (áudio do cartão,
  art. 7º V, retenção "enquanto o cartão existir").
- A exportação de dados (LGPD art. 18) inclui os clipes da conta.

## Armazenamento e custo

- ~25 KB por cartão. 2.000 cartões com clipe = ~50 MB. Local: cota do navegador (pedir `navigator.storage.persist()` só no
  destino local e só depois do primeiro clipe; teto por aparelho de 200 MB, o mais antigo sai com aviso).
- Conta: R2 tem 10 GB grátis e já existe o teto `R2_TETO_MB` (padrão 90% do grátis). Teto por conta proposto: 50 MB (2.000
  clipes) em qualquer plano; plano maior só por decisão do dono, e a cota só entra em `src/core/planos.ts`.
- Custo de IA: zero. Custo de CPU: codificação Opus de 1 a 8 s no aparelho (meta p95 < 150 ms em celular médio, tarefa 1.3).
- A mudança REDUZ tráfego: hoje 20 cartões da mesma reunião de 40 min baixam ~40 MB uma vez; com clipes baixam ~0,5 MB.

## Riscos

| Risco                                                 | Mitigação                                                                                                   |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Voz de terceiros guardada sem que saibam              | Padrão local; aviso na primeira vez; sem clipe da "outra pessoa" no Intérprete; perfil protegido nunca sobe |
| Cota do navegador estoura ou IndexedDB é limpo        | Teto por aparelho, aviso, cartão segue pelo caminho antigo                                                  |
| Corte errado (início/fim do VAD)                      | O trecho é o da fala já delimitada; folga de 150 ms; a pessoa pode descartar o clipe                        |
| Safari sem Opus no WebCodecs                          | Cai em WAV 16 kHz/16 bits (`gateway/audio/wav.ts`), ~32 KB/s; o teto local conta em bytes                   |
| Palavra salva muito depois da fala (PCM fora do anel) | Recorta do áudio da sessão quando existir; senão, sem clipe                                                 |

## Métrica de sucesso

- Cartões novos com clipe tocável: >= 90% dos nascidos de fala capturada, entre quem não escolheu "Não guardar".
- Bytes baixados para tocar a fala original na revisão: queda >= 90% (linha de base na tarefa 1.1).
- Zero clipe no servidor para perfil protegido (teste de contrato mais consulta de auditoria).

## Esforço

M (3 a 5 dias de dev): codificar e guardar local é a parte pequena; o destino na conta, a exportação e a exclusão são o resto.

## Decisões do dono (com recomendação)

1. **Destino padrão do áudio.** Recomendo "Só neste aparelho" para todos, e "Na minha conta" só para adulto que escolher. Alternativa: só local, sem opção de conta (menor custo e menor risco, mas o cartão não segue a pessoa entre aparelhos).
2. **Voz da "outra pessoa" no Intérprete.** Recomendo NÃO guardar clipe dessa metade (consentimento de terceiro).
3. **Teto por conta** (50 MB sugerido) e se algum plano pago ganha mais: só em `src/core/planos.ts`, depois do número medido.
4. **Bitrate** vencedor da escuta cega (tarefa 1.2) e a linha nova do ROPA (tarefa 3.3).
5. **Ligar** `cartao_com_audio`: só depois de 1.3 e da rampa 5.1.

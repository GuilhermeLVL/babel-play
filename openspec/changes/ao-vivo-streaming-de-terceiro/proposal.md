> **DESCARTADA em 25/11/2026 (decisão assumida: recomendação das decisões 7 e 39, 25/11).** O plano Ao Vivo saiu de venda (ADR 0016) e
> a nuvem ao vivo foi abandonada em `planos-v3-e-rota-inteligente`. Só voltaria se a latência publicada por aparelho
> (`latencia-publicada-por-aparelho`) mostrar celular fraco o bastante para justificar um terceiro, e então com parecer jurídico sobre
> voz de menor primeiro. Mantida como registro; pode ser arquivada sem sincronizar `specs/`.

> **Plano Ao Vivo com streaming de terceiro: SÓ spec, tudo depende do dono.** Pacote de decisão para escolher (ou recusar) o
> serviço de transcrição em fluxo que sustenta o texto durante a fala na nuvem. Nenhum código de produção até as decisões
> abaixo; nenhuma flag nasce nesta change (`stt_ao_vivo` já existe e continua desligada).

## Why

O plano `aovivo` (R$ 39,90) está na matriz de `src/core/planos.ts` com `sttAoVivo: true`, 10 h/mês de nuvem em fluxo
(`sttAoVivoSegundosMes: 36_000`) e `flagsDeVenda: [venda_planos_v3, stt_ao_vivo]`, mas NÃO existe serviço de fluxo: o transporte é
`TRANSPORTE_AO_VIVO_EXISTE = false` (`src/lib/captura/nivelDeServico.ts`) e o custo da hora ao vivo é estimativa ("provisório até
o serviço de fluxo ser escolhido", comentário do plano). A venda v4 encerra o Ao Vivo (`encerradoPor: [venda_planos_v4]`), então a
pergunta real é: o Ao Vivo volta como plano, como complemento de outro plano, ou não volta.

O que mantém isto parado não é código, é decisão com consequência legal e de custo:

- Um serviço de terceiro recebe a VOZ da pessoa em tempo real. O público inclui menores (ECA Digital, LGPD art. 14), e o app tem
  retenção zero. Sem contrato (DPA) que proíba retenção e treino, não há como ligar para ninguém, muito menos para menor.
- Os fornecedores de fluxo conhecidos são os mais caros da tabela de transcrição (`docs/alternativas-de-custo-e-eficiencia.md`:
  Deepgram, AssemblyAI, Soniox e ElevenLabs a US$ 0,10 a 0,31/h, "retenção zero não confirmada"; Gladia treina com dados por
  padrão: descartado). `docs/auditoria/2026-10-09-aparelhos-planos-e-nuvem.md` estima Deepgram em ~US$ 0,29 a 0,35/h e
  AssemblyAI em ~US$ 0,15/h. Gemini é proibido.
- Já há trabalho aberto que toca o assunto, e esta change NÃO o duplica: `planos-v3-e-rota-inteligente` §10 (10.1 a 10.4: escolher o
  serviço, transporte em fluxo, adaptador e degrau `nuvem-ao-vivo`, 10 min estáveis) e `interprete-ao-vivo` (fala-para-fala, outro
  produto, fase P3 do intérprete). O DELTA daqui é o pacote de decisão que destrava o 10.1: provedor, DPA para menores, teto de
  custo e onde o produto mora. Quando esta change for aprovada, o 10.1 vira "feito por referência" e o 10.2 a 10.4 seguem naquela
  change (ou em uma change de implementação própria, decisão da tarefa 5.2).

## What Changes

Nada em código. Entrega:

1. **Matriz de escolha** (`docs/auditoria/`) com 3 a 4 provedores de fluxo: preço por hora, mínimo de cobrança por sessão, idiomas
   do produto (pt, en, es, zh, ja), latência até o parcial, política de retenção e treino lida no contrato (não na página de
   marketing), região de processamento, subprocessadores e se aceita a cláusula de menores.
2. **Minuta do DPA** (checklist para o jurídico do dono): finalidade única, sem retenção do áudio nem do texto além da sessão, sem
   treino, transferência internacional (LGPD art. 33) com base legal, lista de subprocessadores, incidente em 48 h, exclusão
   comprovada, e aviso na política de privacidade do app.
3. **Regra de menores**: por padrão, o Ao Vivo recusa perfil protegido (403 `ao_vivo_indisponivel_para_perfil`) até o DPA cobrir
   menores E o dono decidir abrir; o texto durante a fala nunca é o único caminho (queda para trechos ou aparelho).
4. **Modelo de custo**: hora real medida contra a estimativa, a margem do Ao Vivo na matriz (líquido de R$ 36,42 menos 20 h de
   trechos a US$ 1,58 e 10 h ao vivo) e o teto `TETO_USD_MES_*` do plano (`aviso-fim-do-teste-e-teto` 3.1).
5. **Decisão de lugar**: plano Ao Vivo legado, complemento do Pro (`pro4`), ou arquivar a ideia.

## Fora de escopo

- Código, flags novas, migrações, ligar `stt_ao_vivo`, vender o plano. Tudo isso é da implementação (§10 de `planos-v3`).
- Fala-para-fala (`interprete-ao-vivo`) e vozes por falante.
- Qualquer provedor sem DPA assinado; qualquer uso de Gemini.

## Riscos

- **Legal**: voz de menor em terceiro sem DPA viola LGPD art. 14 e a retenção zero do produto. Mitigação: recusa por padrão para
  perfil protegido e portão do DPA antes de qualquer chave de produção.
- **Custo**: a hora ao vivo pode custar o dobro da estimativa e comer a margem (10 h x US$ 0,35 = US$ 3,50 contra o líquido
  de US$ 6,50 já com US$ 1,58 de trechos e a tradução). Mitigação: reserva em blocos de 30 s, corte no servidor, teto por plano
  e queda para trechos.
- **Dependência**: um único fornecedor de fluxo vira ponto de falha. Mitigação: o degrau `nuvem-ao-vivo` sempre cai para a nuvem
  por trechos e para o aparelho.
- **Promessa vazia**: vender o plano sem a rota é cobrar por algo que não existe (já registrado em `planos.ts`). Mitigação: as duas
  chaves de venda continuam.

## Custo

Esforço desta change: P (documentos). Custo de IA paga: ZERO até o dono declarar um provedor e um teto; o spike de 10 min por
provedor (tarefa 3.2) custa centavos e só roda com a chave do dono e custo declarado antes.

## Métrica de sucesso

- Decisão registrada (provedor, DPA, teto, lugar) com data, em `docs/`, ou a decisão explícita de não fazer.
- Se houver implementação: custo medido por hora ao vivo <= 1,3x a estimativa da matriz, 10 min contínuos estáveis no Quest e
  num celular, e zero áudio de perfil protegido enviado ao terceiro (teste de rede).

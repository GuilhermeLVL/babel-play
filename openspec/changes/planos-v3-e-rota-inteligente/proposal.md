# Quatro planos, rota inteligente da fala, transparência e anúncios no Grátis

Estado em 21/10/2026: **em implementação**. O dono delegou as decisões em 09/10 (`design.md` §11). Prontos: matriz e cobrança dos quatro planos, troca de plano, tela de planos, política, consentimento, CSP, provedor e recompensa de anúncios (grupos 1, 2, 3, 7, 8, 9 e 11.2 a 11.5). Abertos: rota inteligente, transparência, nuvem ao vivo e qualidade no aparelho (grupos 4, 5, 6, 10 e Q, depois do lançamento), a bancada de anúncios (11.1), a consulta jurídica (11.6) e a abertura da venda, que é do dono (`docs/LANCAMENTO.md` §11-bis).

## Por quê

Em 09/10/2026 o dono aprovou o desenho e pediu que a engenharia passe a responder três perguntas: o que
o Grátis entrega de melhor sem custar nada, o que justifica pagar em cada aparelho, e como o app decide
sozinho onde a fala é processada, dizendo isso à pessoa. Três levantamentos do dia embasam esta change:

- `docs/auditoria/2026-10-09-aparelhos-planos-e-nuvem.md`: o que cada aparelho consegue de graça, quanto
  a nuvem acrescenta, custos e a proposta de quatro planos.
- `docs/auditoria/2026-10-09-qualidade-no-gratis-e-roteamento.md`: como tirar mais do que roda no
  aparelho, recursos nativos por plataforma, nuvem de custo zero, árvore de decisão e transparência.
- O mapa do código (resumido em `design.md`): o que está preso a dois planos e onde cada peça entra.

O protótipo que mostra as telas é `babel-play-lab/docs/prototipos/anuncios-no-gratis.html`.

Achados que motivam a mudança:

- Hoje todo pagante vai à nuvem primeiro, mesmo num computador que transcreve inglês tão bem quanto ela.
  Gasta a cota onde ela quase não ajuda.
- No Quest e no celular a nuvem não é luxo: sem ela não há legenda contínua (Quest) nem tradução boa
  (celular). Um plano só não serve a quem estuda no computador e a quem depende de nuvem.
- O selo da captura diz o motor em texto técnico, sem o motivo e sem dizer se o áudio sai do aparelho.
- O Grátis tem ganho de qualidade disponível sem custo, sobretudo em português no computador.

## O que muda

1. **Quatro planos**: Grátis (anúncio leve), Essencial R$ 9,90, Premium R$ 19,90, Ao Vivo R$ 39,90,
   com três níveis de serviço que a pessoa enxerga: No aparelho, Precisão, Ao vivo.
2. **Cotas mensais de nuvem por nível** (trechos e ao vivo), com queda suave para o aparelho quando
   acabam. Nada é bloqueado.
3. **Uma política única de rota** (aparelho × plano × tarefa × estado) que decide onde transcrever,
   traduzir, falar e explicar, e devolve o motivo em palavras. Ordem: aparelho, navegador, nossa nuvem.
4. **Transparência**: um selo sempre visível com três etiquetas fixas, o motivo ao toque, aviso quando
   a rota muda sozinha, e a regra de nunca passar a enviar áudio sem aceite prévio.
5. **Qualidade no aparelho**: medir e adotar modelos locais melhores (português primeiro), correção
   determinística de vocabulário, tabela única de qualidade.
6. **Anúncios só no Grátis**, com o premiado opcional como formato principal, atrás de chave desligada.

## O que NÃO muda

- A aparência segue o protótipo aprovado; esta change mexe em comportamento e acrescenta só as peças que
  o protótipo de planos e anúncios mostra.
- A autoridade continua no servidor: o cliente decide a rota, o servidor confere o direito e a cota.
- Perfil infantil e perfil privado continuam só no aparelho.

## Reverte uma decisão anterior

O ADR 0011 (02/10/2026) fixou um plano pago só e adiou o "Ao vivo" para depois do lançamento. Esta
change o substitui e pede um ADR novo. O dono precisa confirmar.

## Impacto

- Código: `src/core/planos.ts`, entitlements dos dois lados, cobrança (Asaas), cotas, roteadores do
  gateway, telas de Planos, captura e intérprete, CSP. 82 arquivos de teste citam nomes de plano.
- Banco: nenhuma tabela nova; migração de dados nas flags.
- Fornecedores: nenhum novo até a etapa do "Ao vivo" (precisa de um serviço de transcrição em fluxo) e
  dos anúncios (rede de anúncios e domínio próprio). O resto roda com o que já existe.
- Risco maior: anúncios conflitam com o isolamento que dá velocidade ao Whisper local (ver `design.md`).

## Decisões pendentes do dono

Estão em `design.md`, seção "Perguntas em aberto", cada uma com o padrão que assumo se não houver
resposta. Nenhuma etapa que dependa delas começa antes.

## Revisão de 25/11/2026

**Estado:** arquivar depois de um fechamento curto. Das 28 tarefas abertas na README, quase todas já estão no código; a change ficou
velha em dois pontos e o resto são atos do dono. Feito: grupos 1, 2, 3, 7, 8 e 9 (matriz, cobrança, troca, telas), 4.1 a 4.3 (política
em sombra e conferência), 5.1, 5.3 e 5.4 (selo, aviso de mudança, consentimento), Q.1, Q.2 e Q.6, 11.2 a 11.5. Falta: ADR da v4, 5.2
("Testar sem internet"), 5.5 (catálogos), 9.3 (conferir ofertas), 6.1 a 6.4 (flag `rota_inteligente` valendo), 11.1 e 11.6, e 0.3 (Asaas).

**O que ficou velho:**

- **Planos v4** (24/10, `docs/specs/2026-10-24-planos-v4.md`, migração 0054): Plus R$ 14,90 ou R$ 149 por ano, Família e Pro em breve; o
  Essencial, o Premium e o Ao Vivo deixaram de ser vendidos. A spec `matriz-de-planos` desta change e o ADR 0013 ainda falam em R$ 9,90,
  R$ 19,90 e R$ 39,90. A spec foi reescrita para a v4 e NÃO deve ser sincronizada na versão antiga.
- **Corte de custo de 02/10** (ADR 0011): foi revertido pelo ADR 0013 e depois pela v4. O texto "reverte uma decisão anterior" desta
  proposta já não descreve a decisão vigente; o que vale é a v4 e as cotas medidas em `src/core/planos.ts`.
- **Nuvem ao vivo** (grupo 10): o plano que a justificava (Ao Vivo) saiu de venda; o serviço de fluxo nunca foi escolhido.
- **Rota inteligente** (6.x): reabsorvida por `roteador-adaptativo-em-sombra` (calcula e registra) e por `stt_aparelho_primeiro`
  (aparelho primeiro no Parakeet, `audioDificil.ts`). A flag `rota_inteligente` (`politicaLigada`) segue sem migração; só vale abri-la
  depois de o roteador sair da sombra.
- **Qualidade no aparelho** (Q): em grande parte entregue pelo Parakeet v3 e pela spec `modelos-no-aparelho`; o que sobra é o Q.7
  (correção determinística) e medições em aparelho real.
- **Parciais na rota do Parakeet** (`parciais-incrementais`, flags `parciais_parakeet` e `parciais_vivos` desligadas): a política de
  rota precisa conhecê-los antes de a 6.2 ligar, para não decidir como se não existissem.

**Esforço restante:** M (6.x depende do #4; o resto são P: ADR, 5.2, 5.5, 9.3). **Valor para quem usa:** alto na venda do Plus (receita),
médio no selo e na rota; baixo no Ao Vivo.

**Dependências e conflitos:** `roteador-adaptativo-em-sombra` (#4) antes de 6.x; `stt_aparelho_primeiro` e `parciais-incrementais`
tocam `politicaDeRota.ts` e `pipelineDeFala.ts`; `polimento-movimento` (#11) toca a tela de Planos e o selo; muitos testes citam nomes de plano
(eram 82 arquivos em 09/10), então qualquer mudança de nome de plano é cara. Custo de IA: nenhum novo; anúncios dependem do parecer jurídico (11.6).

**Decisões do dono:**

1. Destino da change: (a) arquivar já e abrir duas pequenas (`rota-inteligente-valendo`, depois do #4; `anuncios-no-gratis-fechamento`,
   com 11.1 e 11.6); (b) manter viva até tudo fechar; (c) abandonar a rota inteligente e ficar na sombra. **Recomendo (a)**.
2. Nuvem ao vivo e plano Ao Vivo (grupo 10): (a) abandonar (v4 já o encerrou); (b) deixar como "em breve" no Pro; (c) spike com
   provedor e teto em USD. **Recomendo (a)**, e juntar a pergunta com a de `interprete-ao-vivo` (README, incerta 5).
3. Abrir a venda do Plus (0.3 e 11.6): (a) um só pedido de parecer jurídico (preço, anual e anúncios, ECA Digital) e abrir só o mensal
   antes dele; (b) esperar o parecer para tudo; (c) abrir mensal e anual juntos. **Recomendo (a)**: o anual segue desligado
   (`ANUAL_ENABLED`) até o parecer, como já está no código.

## Fechamento de 25/11/2026 (decisões assumidas)

Decisão assumida: recomendação (a) das três decisões acima, 25/11. (1) Arquivar já: ADR 0016 escrito, abertas as changes
`rota-inteligente-valendo` e `anuncios-no-gratis-fechamento` (só spec), tarefas abertas movidas (marca `[>]` em `tasks.md`).
(2) Nuvem ao vivo e plano Ao Vivo abandonados; `ao-vivo-streaming-de-terceiro` descartada (ver o aviso no topo dela). A pergunta da
`interprete-ao-vivo` (decisão 24) segue com o dono. (3) Mensal do Plus antes do parecer; o anual segue desligado (`ANUAL_ENABLED`).
Fica para o dono: [D] conferência no Asaas, parecer jurídico, abrir a venda. Arquivamento: tarefa 12.1.

# Quatro planos, rota inteligente da fala, transparência e anúncios no Grátis

Estado: **proposta, aguardando o dono**. Nada aqui foi implementado.

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

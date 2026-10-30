# Runbook: piloto VLibras (só adultos, desligado por padrão)

Pesquisa e riscos: `docs/pesquisa/2026-10-29-vlibras-piloto.md`. Flag: `libras_vlibras` (`docs/flags.md`).
`docs/runbooks/avatar.md` não existe nesta base; quando existir, este passo a passo pode ser linkado de lá.

## O que o piloto é

Botão "Sinais de apoio (VLibras)" no Intérprete, na Legendar e no leitor de livros, SÓ para adulto confirmado e com
consentimento. O widget do governo federal roda numa página nossa (`/vlibras-ponte.html`) dentro de um
`<iframe sandbox="allow-scripts">` sem `allow-same-origin` (origem opaca). O `script-src` do app não ganha nenhum
host de terceiro. A pessoa seleciona um trecho e toca em "Enviar o trecho selecionado"; o trecho vai por `postMessage`
à ponte, e o widget o traduz lá dentro.

## Ligar (ato do dono; produção segue fechada)

Antes: parecer sobre licença do dicionário/avatar, termos de uso do serviço e LGPD (itens NC da pesquisa).

1. Variável `VLIBRAS_ATIVO=1` no BUILD e no servidor (`.env.production.example`; no Worker, a variável de Actions
   `VLIBRAS_ATIVO` em `deploy-worker.yml`). Ela abre a CSP SÓ da página da ponte e troca o isolamento `completo`
   por `dip` (o avatar do VLibras é um iframe de outra origem sem COEP). Custo: o Firefox perde as threads dos modelos
   locais. Sem a variável a ponte não carrega nada (`default-src 'none'`).
2. Conferir os cabeçalhos no ambiente (a regra `!` do `_headers` do Workers Static Assets não foi provada aqui):
   `curl -sI https://<host>/vlibras-ponte.html` deve mostrar UMA `Content-Security-Policy` com
   `traducao2.vlibras.gov.br`, e `curl -sI https://<host>/` deve mostrar a CSP do app SEM `vlibras` e SEM
   `Cross-Origin-Embedder-Policy` (modo `dip`). Duas CSPs na ponte = o `!` não funcionou: não ligue a flag.
3. Ligar a flag `libras_vlibras` (operação de flags). Rollback: desligar a flag (some o botão) e tirar `VLIBRAS_ATIVO`.

## Teste real com a rede (para o dono)

1. Conta de ADULTO (data de nascimento declarada com 18+). Chromium recente (Chrome/Edge).
2. Abrir o Intérprete: o botão "Sinais de apoio (VLibras)" aparece. Com conta de menor, ou sem data declarada, ele NÃO
   aparece (confirme com uma segunda conta).
3. Tocar no botão: aparece a tela de consentimento (serviço externo, texto enviado ao governo, analytics do widget,
   aviso fixo). "Agora não": nada carrega (aba Rede sem `vlibras.gov.br`).
4. Tocar de novo e "Aceitar e ativar": abre o painel com "VLibras · governo federal" e o aviso fixo; o avatar do
   VLibras carrega (alguns segundos). Aba Rede: `vlibras.gov.br`, `traducao2`, `dicionario2`; NÃO deve haver
   `posthog` bem-sucedido (a CSP o bloqueia; o erro de CSP no console da ponte é esperado).
5. Selecionar uma frase da tela (ex.: uma linha da conversa), tocar em "Enviar o trecho selecionado": a frase
   aparece no painel e o avatar sinaliza. Se o avatar ainda estiver carregando, a ponte tenta de novo até 60 s.
6. Verificar o isolamento: no console da página do app, `document.querySelector('iframe[sandbox]').sandbox.value`
   deve ser `allow-scripts`. O app não deve ter nenhum `<script src*="vlibras">` no documento.
7. Repetir na Legendar (`/capturar`) e no leitor (abrir um livro, selecionar um trecho, tocar no botão: o trecho
   selecionado já vai junto ao abrir).
8. Revogar: Perfil > Você > "Desativar o VLibras" (ou "Desativar" no painel). O painel fecha e o botão volta a pedir
   consentimento.
9. Observar: o widget mostra a própria pergunta de analytics (do governo); o app não a controla.

## O que não foi provado

Widget real dentro da suíte (os e2e simulam o script), qualidade dos sinais, Safari/Firefox, celular real, regra `!` do
`_headers`, licença do dicionário/avatar, termos e retenção de dados no serviço do governo, LGPD.

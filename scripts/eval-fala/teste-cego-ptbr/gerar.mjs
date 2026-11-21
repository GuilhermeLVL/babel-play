/**
 * GERA O MATERIAL DO TESTE CEGO pt-BR (openspec `traducao-local-por-direcao`, D4). NÃO roda com pessoas: só monta os arquivos.
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/eval-fala/teste-cego-ptbr/gerar.mjs \
 *     --brutos docs/auditoria/eval/bancada-2026-09/mt_gold_….json,…/mt_fleurs_….json \
 *     --sistemas local:opus-mt,bergamot:en-pt --saida <pasta> [--avaliadores 2] [--semente N]
 *
 * ENTRADA: os brutos da bancada de tradução (`scripts/eval-fala/bancada/mt.mjs`) com as saídas dos sistemas nas MESMAS
 * frases en→pt: `gold:en-pt` (50 de legenda/conversa) e `fleurs:en-pt`/`wmt:en-pt` (50 de texto limpo). O 1º sistema de
 * `--sistemas` é o controle (opus-mt `>>pt_br<<`). Nunca texto de usuário nem de menor: só corpora públicos.
 *
 * SAÍDA em `--saida`:
 *   protocolo.json              o protocolo (nº de frases, sistemas, semente, limiares) e o sha256 — COMMITAR antes de avaliar;
 *   gabarito.json               QUEM É QUEM (item → sistema). NÃO ENVIAR AOS AVALIADORES; guardar à parte;
 *   planilha-A1.csv, …          uma por avaliador: frase em inglês, tradução, e colunas `variante` e `naturalidade_1a5`;
 *   formulario-A1.html, …       o mesmo em formulário de página única (offline, nada é enviado) que baixa o CSV preenchido.
 * Os avaliadores veem só o item opaco: sem rótulo do sistema, sem corpus, em ordem embaralhada própria. As frases repetidas
 * entre os avaliadores servem ao kappa. Planilha sem nome nem e-mail (o dono guarda o vínculo avaliador → pessoa).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  escolherFrases,
  frasesElegiveis,
  hashDoProtocolo,
  loteDoProtocolo,
  montarLote,
  planilhaDoAvaliador,
  PROTOCOLO_PADRAO,
} from './nucleo.mjs'

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 ? process.argv[i + 1] : d
}
const lista = (v) =>
  String(v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

/** O formulário de página única: o texto entra por `textContent` (nada vira HTML), o CSV sai por download local. */
export function formularioHtml(lote, avaliadorId, linhas) {
  const dados = JSON.stringify({ lote, avaliadorId, linhas }).replace(/</g, '\\u003c')
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Avaliação de traduções (${avaliadorId})</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#1c1c1e;--bd:#c7c7cc;--ac:#0a5bd8}
@media (prefers-color-scheme:dark){:root{--bg:#1c1c1e;--fg:#f2f2f7;--bd:#48484a;--ac:#6ea8ff}}
body{margin:0 auto;max-width:46rem;padding:1rem 16px 4rem;font:16px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--fg)}
.item{border:1px solid var(--bd);border-radius:8px;padding:.75rem 1rem;margin:1rem 0}
.en{opacity:.75}.pt{font-size:1.1rem;margin:.4rem 0 .6rem}
label{margin-right:1rem;white-space:nowrap}fieldset{border:0;padding:0;margin:.3rem 0}
button{font:inherit;padding:.6rem 1.2rem;border-radius:8px;border:1px solid var(--ac);background:var(--ac);color:#fff}
#msg{margin:.5rem 0}
</style></head><body>
<h1>Avaliação de traduções</h1>
<p>Para cada frase em inglês você vê uma tradução para o português. Marque (1) se ela <b>soa brasileiro</b>, <b>soa português de Portugal</b> ou se você não sabe dizer, e (2) uma nota de 1 a 5 para a <b>naturalidade</b> (1 = artificial, 5 = soa como alguém falando). Não é prova: não há resposta certa. Nada sai do seu computador; no fim, baixe o arquivo e envie a quem pediu.</p>
<div id="itens"></div>
<p id="msg"></p><button id="baixar">Baixar respostas (CSV)</button>
<script>
const D=${dados};
const V=[["brasileiro","soa brasileiro"],["portugal","soa português de Portugal"],["indeterminado","não sei dizer"]];
const raiz=document.getElementById("itens");
D.linhas.forEach((l,i)=>{
 const d=document.createElement("div");d.className="item";
 const en=document.createElement("div");en.className="en";en.textContent=(i+1)+". "+l.origem;
 const pt=document.createElement("div");pt.className="pt";pt.textContent=l.traducao;
 const f=document.createElement("fieldset");
 V.forEach(([v,t])=>{const lb=document.createElement("label");const r=document.createElement("input");r.type="radio";r.name="v"+i;r.value=v;lb.append(r," "+t);f.append(lb)});
 const s=document.createElement("select");s.id="n"+i;s.innerHTML='<option value="">naturalidade…</option>'+[1,2,3,4,5].map(n=>'<option>'+n+'</option>').join("");
 d.append(en,pt,f,s);raiz.append(d);
});
function csv(){
 const q=v=>/[",\\n\\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;
 const linhas=[["lote","item","frase_em_ingles","traducao","variante","naturalidade_1a5"]];
 D.linhas.forEach((l,i)=>{const r=document.querySelector('input[name="v'+i+'"]:checked');linhas.push([D.lote,l.item,l.origem,l.traducao,r?r.value:"",document.getElementById("n"+i).value])});
 return linhas.map(x=>x.map(q).join(",")).join("\\n")+"\\n";
}
document.getElementById("baixar").onclick=()=>{
 const falta=D.linhas.filter((l,i)=>!document.querySelector('input[name="v'+i+'"]:checked')||!document.getElementById("n"+i).value).length;
 document.getElementById("msg").textContent=falta?("Faltam "+falta+" frase(s) sem resposta completa. Baixei mesmo assim; volte e termine se puder."):"Tudo respondido.";
 const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv()],{type:"text/csv;charset=utf-8"}));a.download="respostas-"+D.avaliadorId+".csv";a.click();
};
</script></body></html>
`
}

function principal() {
  const brutos = lista(arg('brutos')).map((f) => JSON.parse(readFileSync(f, 'utf8')))
  const sistemas = lista(arg('sistemas', PROTOCOLO_PADRAO.controle))
  const saida = arg('saida')
  if (!brutos.length || sistemas.length < 2 || !saida) {
    console.error(
      'uso: gerar.mjs --brutos a.json,b.json --sistemas <controle>,<candidato>[,…] --saida <pasta> [--avaliadores 2] [--semente N] [--conversa 50] [--limpo 50] [--repeticao 20]',
    )
    process.exit(2)
  }
  const protocolo = {
    ...PROTOCOLO_PADRAO,
    sistemas,
    controle: sistemas[0],
    avaliadores: Number(arg('avaliadores', PROTOCOLO_PADRAO.avaliadores)),
    semente: Number(arg('semente', PROTOCOLO_PADRAO.semente)),
    frasesDeConversa: Number(arg('conversa', PROTOCOLO_PADRAO.frasesDeConversa)),
    frasesDeTextoLimpo: Number(arg('limpo', PROTOCOLO_PADRAO.frasesDeTextoLimpo)),
    repeticaoEntreAvaliadores: Number(arg('repeticao', PROTOCOLO_PADRAO.repeticaoEntreAvaliadores)),
  }
  const frases = escolherFrases(frasesElegiveis(brutos, sistemas), protocolo)
  const lote = montarLote(frases, sistemas, protocolo)
  const protocoloSha256 = hashDoProtocolo(protocolo)
  mkdirSync(saida, { recursive: true })
  writeFileSync(path.join(saida, 'protocolo.json'), `${JSON.stringify({ protocolo, protocoloSha256 }, null, 2)}\n`)
  writeFileSync(
    path.join(saida, 'gabarito.json'),
    `${JSON.stringify(
      {
        aviso: 'NÃO ENVIAR AOS AVALIADORES: este arquivo diz qual sistema produziu cada tradução.',
        protocolo,
        protocoloSha256,
        itens: lote.itens,
        avaliadores: lote.avaliadores,
        frasesRepetidas: lote.repetidas,
      },
      null,
      2,
    )}\n`,
  )
  for (const a of lote.avaliadores) {
    writeFileSync(
      path.join(saida, `planilha-${a.id}.csv`),
      planilhaDoAvaliador(loteDoProtocolo(protocolo), a, lote.itens),
    )
    writeFileSync(
      path.join(saida, `formulario-${a.id}.html`),
      formularioHtml(
        loteDoProtocolo(protocolo),
        a.id,
        a.itens.map((id) => ({ item: id, origem: lote.itens[id].origem, traducao: lote.itens[id].traducao })),
      ),
    )
  }
  console.log(
    `${frases.length} frases (${protocolo.frasesDeConversa} de conversa, ${protocolo.frasesDeTextoLimpo} de texto limpo) × ${sistemas.length} sistemas, ` +
      `${lote.avaliadores.map((a) => `${a.id}: ${a.itens.length} itens`).join(', ')}; ${lote.repetidas.length} frases repetidas. Lote ${loteDoProtocolo(protocolo)}.\n` +
      `Gravado em ${saida}. Commitar protocolo.json ANTES de avaliar; guardar gabarito.json à parte.`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) principal()

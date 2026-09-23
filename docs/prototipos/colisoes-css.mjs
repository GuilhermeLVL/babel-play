// Classes que os blocos novos definem e que o protótipo original JÁ usa com outra regra.
import { readFileSync } from 'node:fs'
const DIR = import.meta.dirname
const base = readFileSync(`${DIR}/consistencia-antes-r9.html`, 'utf8')
const cssBase = [...base.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n')
const classesBase = new Set([...cssBase.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]))
const meus = ['bloco-sub.css', 'bloco-fx.css', 'bloco-fx-extra2.css', 'bloco-jogos2.css', 'bloco-termo.css'].map(f => readFileSync(`${DIR}/${f}`, 'utf8')).join('\n')
// só seletores (antes de "{"), sem valores
const seletores = [...meus.matchAll(/([^{}]+)\{/g)].map(m => m[1]).filter(s => !s.trim().startsWith('@'))
const minhas = new Set(seletores.flatMap(s => [...s.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1])))
// classes do protótipo que eu reusei de propósito (componentes compartilhados)
const DE_PROPOSITO = new Set(['cartao','btn','btn-outline','btn-solid','peq','icone','bloco','link','label-mono','mut','badge','ok','acc','warn','neu','rare','good','campo','check','seg','pill','n','chips','tabela','barra','ib','entre','linha','pilha','sr','tn','p5','p6','ladrilhos','ladrilho','vazio','abas','aba','cab','sub','voltar','tela','fab','rot','ctx','dlg-cab','dlg-corpo','dlg-pe','x','aviso-info','det','soltar','trilho','interruptor','on','escuro','estudio','fala','orig','trad','quem','conversa','carta','virada','par','verso','tabuleiro','jogo','arte','clicavel','corpo','g2','ganho','estrelas','confete','faixa-escura','resumo','entra','sem-cascata','teclado','fila','letra','certa','lugar','fora','cheia','linha-termo','treme','venceu','termo-dica','grade-termo','perigo','auth-lado','auth-form','auth','relogio','ondas','dock','palco','app','combo','importar','fontes','fonte-imp','dica','filtros','midia','capa','menu-midia','pino','dur','meta','estreita','larga','secao','tsec','tsec-t','tsec-l','desc','sobrancelha','cab-acoes','cab-linha','cab-texto','largo','gauto','foco'])
const colide = [...minhas].filter(c => classesBase.has(c) && !DE_PROPOSITO.has(c)).sort()
console.log(colide.length ? 'VERIFICAR: ' + colide.join(', ') : 'nenhuma colisão nova')
for (const c of colide) { const i = cssBase.search(new RegExp(`\\.${c}(?![\\w-])`)); console.log(`  .${c} no original → ${cssBase.slice(Math.max(0, cssBase.lastIndexOf('\n', i)), i + 120).trim().replace(/\s+/g, ' ').slice(0, 140)}`) }

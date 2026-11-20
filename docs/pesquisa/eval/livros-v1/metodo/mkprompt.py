import sys
perfil,lote,out=sys.argv[1],sys.argv[2],sys.argv[3]
t=open("tpl_juiz.txt").read()
for k,v in {"{PERFIL}":perfil,"{LOTE}":open(lote).read().strip(),"{RUBRICA}":open("rubrica.txt").read(),"{BRIEF}":open("brief.md").read(),"{CATALOGO}":open("catalogo.txt").read()}.items(): t=t.replace(k,v)
open(out,"w").write(t)

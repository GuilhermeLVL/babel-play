import json,sys,itertools
perfil,ordem,out=sys.argv[1],sys.argv[2],sys.argv[3]
top=json.load(open("top12.json")); ide={f["id"]:f for f in json.load(open("ideias.json"))["funcoes"]}
fin="\n".join(f'{i} | {ide[i]["nome"]}: {ide[i]["descricao"]} [plano: {ide[i]["plano"]}; IA: {ide[i]["ia"]}; esforço: {ide[i]["esforco"]}]' for i in top)
pares=list(itertools.combinations(top,2))
if ordem=="BA": pares=[(y,x) for x,y in pares]
json.dump(pares,open(out+".pares.json","w"))
txt="\n".join(f'{k}. A = {x} ({ide[x]["nome"]}) | B = {y} ({ide[y]["nome"]})' for k,(x,y) in enumerate(pares,1))
t=open("tpl_par.txt").read()
for a,b in {"{PERFIL}":perfil,"{BRIEF}":open("brief.md").read(),"{FINALISTAS}":fin,"{PARES}":txt}.items(): t=t.replace(a,b)
open(out,"w").write(t)

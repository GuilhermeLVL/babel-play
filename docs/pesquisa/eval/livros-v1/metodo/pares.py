import json,itertools
ide={f["id"]:f["nome"] for f in json.load(open("ideias.json"))["funcoes"]}
top=json.load(open("top12.json"))
def parse(p):
    t=open(p).read(); return json.loads(t[t.find('['):t.rfind(']')+1])
win={}  # (judge, frozenset pair) -> [winner_AB, winner_BA]
res={}
for j in "bc":
    res[j]={}
    for o in ("AB","BA"):
        mapa=json.load(open(f"out/juizes/pares-{j}-{o}.mapa.json")); out=parse(f"out/juizes/pares-{j}-{o}.txt")
        assert len(out)==len(mapa),(j,o,len(out))
        for r,(x,y) in zip(out,mapa):
            w=x if r["vencedor"].strip().upper().startswith("A") else y
            res[j].setdefault(tuple(sorted((x,y))),{})[o]=w
stab={}; wins={i:0 for i in top}; wins_j={j:{i:0 for i in top} for j in "bc"}
estaveis={}
posA={j:0 for j in "bc"}; tot={j:0 for j in "bc"}
for j in "bc":
    s=0
    for p,d in res[j].items():
        if d["AB"]==d["BA"]:
            s+=1; wins_j[j][d["AB"]]+=1; estaveis.setdefault(p,{})[j]=d["AB"]
    stab[j]=round(s/len(res[j]),2)
# position bias: fraction of "A" wins
for j in "bc":
    for o in ("AB","BA"):
        out=parse(f"out/juizes/pares-{j}-{o}.txt"); posA[j]+=sum(1 for r in out if r["vencedor"].strip().upper().startswith("A")); tot[j]+=len(out)
both=[p for p,d in estaveis.items() if len(d)==2]
agree=sum(1 for p in both if estaveis[p]["b"]==estaveis[p]["c"])
consenso={i:0 for i in top}
for p in both:
    if estaveis[p]["b"]==estaveis[p]["c"]: consenso[estaveis[p]["b"]]+=1
rank=sorted(top,key=lambda i:(-(wins_j["b"][i]+wins_j["c"][i]),-consenso[i]))
out=dict(estabilidade=stab,vies_posicao_A={j:round(posA[j]/tot[j],2) for j in "bc"},pares_estaveis_nos_dois=len(both),concordancia_entre_juizes=round(agree/len(both),2) if both else None,
 ranking=[dict(id=i,nome=ide[i],vitorias_estaveis_b=wins_j["b"][i],vitorias_estaveis_c=wins_j["c"][i],vitorias_consenso=consenso[i]) for i in rank])
json.dump(out,open("out/juizes/placar-pares.json","w"),ensure_ascii=False,indent=1)
print(json.dumps({k:v for k,v in out.items() if k!="ranking"}))
for r in out["ranking"]: print(r)

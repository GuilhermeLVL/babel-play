import json,re,glob,itertools,sys
ideias={f["id"]:f for f in json.load(open("ideias.json"))["funcoes"]}
C=["valor","frequencia","viavel","custo_baixo","risco_baixo","simples"]
def parse(path):
    t=open(path).read()
    i=t.find('['); j=t.rfind(']')
    return json.loads(t[i:j+1])
V={}
for j in "abc":
    V[j]={}
    for k in ((["1a","1b"] if j=="a" else ["1"])+["2","3"]):
        for o in parse(f"out/juizes/rubrica-{j}-lote{k}.txt"): V[j][o["id"]]=o
miss={j:[i for i in ideias if i not in V[j]] for j in V}
print("faltando",miss,file=sys.stderr)
rows=[]
for i in ideias:
    sc=[sum(int(V[j][i][c]) for c in C) for j in "abc" if i in V[j]]
    pago=sum(int(V[j][i]["diferencial_pago"]) for j in "abc" if i in V[j])
    rows.append(dict(id=i,nome=ideias[i]["nome"],a=sc[0],b=sc[1],c=sc[2],media=round(sum(sc)/3,2),pago=pago))
rows.sort(key=lambda r:(-r["media"],r["id"]))
# concordância por critério: % de unanimidade e Fleiss kappa (3 avaliadores, 2 categorias)
def fleiss(items):
    N=len(items); n=3
    P=[]; p1=0
    for v in items:
        s=sum(v); P.append((s*(s-1)+(n-s)*(n-s-1))/(n*(n-1))); p1+=s
    Pb=sum(P)/N; p=p1/(N*n); Pe=p*p+(1-p)*(1-p)
    return (Pb-Pe)/(1-Pe) if Pe<1 else 1.0
conc={}
for c in C+["diferencial_pago"]:
    items=[[int(V[j][i][c]) for j in "abc"] for i in ideias]
    un=sum(1 for v in items if len(set(v))==1)/len(items)
    pares={}
    for x,y in itertools.combinations("abc",2):
        pares[x+y]=round(sum(1 for i in ideias if int(V[x][i][c])==int(V[y][i][c]))/len(ideias),2)
    conc[c]=dict(unanimidade=round(un,2),kappa=round(fleiss(items),2),pares=pares)
# correlação de Spearman simples entre totais
def rank(xs):
    o=sorted(range(len(xs)),key=lambda k:xs[k]); r=[0]*len(xs); k=0
    while k<len(o):
        m=k
        while m+1<len(o) and xs[o[m+1]]==xs[o[k]]: m+=1
        for q in range(k,m+1): r[o[q]]=(k+m)/2
        k=m+1
    return r
def pearson(a,b):
    ma=sum(a)/len(a); mb=sum(b)/len(b)
    num=sum((x-ma)*(y-mb) for x,y in zip(a,b)); den=(sum((x-ma)**2 for x in a)*sum((y-mb)**2 for y in b))**.5
    return num/den
sp={}
for x,y in itertools.combinations("abc",2):
    sp[x+y]=round(pearson(rank([r[x] for r in rows]),rank([r[y] for r in rows])),2)
json.dump(dict(ranking=rows,concordancia=conc,spearman_totais=sp,faltando=miss),open("out/juizes/placar-rubrica.json","w"),ensure_ascii=False,indent=1)
for r in rows: print(f'{r["id"]:6} {r["media"]:4} a{r["a"]} b{r["b"]} c{r["c"]} pago{r["pago"]} {r["nome"]}')
print(json.dumps(conc,ensure_ascii=False)); print(sp)

import json, re, shutil, unicodedata
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
import pandas as pd

SOURCE=Path(r'D:\TF\TF ASSESSORIA e FINANCAS\PÓS - VENDA.xlsx')
EXTRA_SOURCES=sorted(Path(r'outputs\google-drive-import').glob('producao_*.xlsx'))
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'outputs'/'pos-venda-import'
PUBLIC=ROOT/'public'/'data'
HEADER_ROWS=[2,2,4,8,3,2,4,5,5,5,4]

def norm(v):
 if pd.isna(v): return ''
 return re.sub(r'\s+',' ',unicodedata.normalize('NFKD',str(v)).encode('ascii','ignore').decode()).strip().upper()
def digits(v): return re.sub(r'\D','',str(v)) if not pd.isna(v) else ''
def cpf_ok(v):
 d=digits(v)
 if len(d)!=11 or d==d[0]*11:return False
 for n in (9,10):
  s=sum(int(d[i])*((n+1)-i) for i in range(n)); x=(s*10)%11; x=0 if x==10 else x
  if x!=int(d[n]):return False
 return True
def datev(v):
 if pd.isna(v) or str(v).strip()=='':return None
 try:return pd.to_datetime(v,dayfirst=True).date().isoformat()
 except:return None
def num(v):
 if pd.isna(v):return None
 if isinstance(v,(int,float)):return round(float(v),2)
 s=re.sub(r'[^0-9,.-]','',str(v));
 try:return round(float(s.replace('.','').replace(',','.')),2)
 except:return None
def category(product):
 p=norm(product)
 rules=[('REFIN','Refinanciamento'),('PORTABIL','Portabilidade'),('MARGEM','Aumento de margem'),('CART','Cartão consignado'),('SAQUE','Saque complementar'),('FINANCIAMENTO','Financiamento de veículo'),('VEICULO','Financiamento de veículo'),('FGTS','FGTS'),('SEGURO','Seguro'),('CONSORC','Consórcio'),('GARANTIA','Crédito com garantia'),('PESSOAL','Empréstimo pessoal'),('INSS','Empréstimo consignado INSS'),('PREFEIT','Servidor público'),('SERVIDOR','Servidor público'),('CONSIGNADO','Empréstimo consignado')]
 return next((v for k,v in rules if k in p),'Outros')
def pick(row,*names):
 for name in names:
  for col in row.index:
   if norm(col)==name and not pd.isna(row[col]):return row[col]
 return None

OUT.mkdir(parents=True,exist_ok=True); PUBLIC.mkdir(parents=True,exist_ok=True)
shutil.copy2(SOURCE,OUT/'PÓS - VENDA - ORIGINAL.xlsx')
raw=[]; birthday=[]
sheet_names=pd.ExcelFile(SOURCE).sheet_names
for sheet,h in zip(sheet_names,HEADER_ROWS):
 df=pd.read_excel(SOURCE,sheet_name=sheet,header=h,dtype=object)
 df.columns=[norm(c) or f'COL_{i}' for i,c in enumerate(df.columns)]
 for i,row in df.iterrows():
  name=pick(row,'NOME','NOME CLIENTE')
  if not name or len(norm(name))<5 or norm(name) in {'VENDA BALCAO','VENDA TF','NOME CLIENTE'}:continue
  cpfraw=pick(row,'CPF','CPF CLIENTE','CPF/BENEFICIO')
  cpf=digits(cpfraw) if cpf_ok(cpfraw) else None
  benefit=digits(cpfraw) if cpfraw is not None and not cpf and len(digits(cpfraw))>=7 else None
  phone=pick(row,'TELEFONE'); birth=pick(row,'NASCIMENTO','DATA ANIVERSARIO')
  base={'source_sheet':sheet,'source_row':int(i+h+2),'name':norm(name).title(),'normalized_name':norm(name),'cpf':cpf,'benefit_number':benefit,'birth_date':datev(birth),'phone':str(phone).strip() if phone is not None and not pd.isna(phone) else None}
  if 'ANIVERSARIANTES' in norm(sheet): birthday.append(base); continue
  product=pick(row,'OPERACAO','ACAO','PRODUTO')
  bank=pick(row,'BANCO','CONVENIO')
  op={**base,'bank':norm(bank).title() or None,'original_product':norm(product).title() or None,'category':category(product),'promoter':norm(pick(row,'PROMOTORA')).title() or None,'producer':norm(pick(row,'PRODUCAO')).title() or None,'origin':norm(pick(row,'PRODUCAO')).title() or ('Protocolo' if 'PROTOCOLO' in norm(sheet) else None),'value':num(pick(row,'VALOR','VALOR PAGO')),'installment':num(pick(row,'PARCELA')),'term':num(pick(row,'PRAZO')),'operation_date':datev(pick(row,'DATA','DATA ENTREGA')),'status':norm(pick(row,'SITUACAO CONTRATO')).title() or 'Registro histórico','commission':num(pick(row,'COMISSAO')),'commission_status':norm(pick(row,'SITUACAO COMISSAO')).title() or None}
  raw.append(op)

# Planilhas anuais recebidas pelo Google Drive. O cabeçalho é localizado sem
# depender da posição da aba, e a origem completa é mantida em cada operação.
for extra in EXTRA_SOURCES:
 if not extra.exists(): continue
 shutil.copy2(extra,OUT/extra.name)
 for sheet in pd.ExcelFile(extra).sheet_names:
  preview=pd.read_excel(extra,sheet_name=sheet,header=None,dtype=object,nrows=25)
  header=None
  for i,row in preview.iterrows():
   cells=[norm(v) for v in row.dropna().tolist()]
   if 'NOME' in cells and len(set(cells)&{'CPF','CPF/BENEFICIO','BANCO','OPERACAO','ACAO','VALOR','VALOR PAGO'})>=2: header=i; break
  if header is None: continue
  df=pd.read_excel(extra,sheet_name=sheet,header=header,dtype=object)
  df.columns=[norm(c) or f'COL_{i}' for i,c in enumerate(df.columns)]
  for i,row in df.iterrows():
   name=pick(row,'NOME','NOME CLIENTE')
   if not name or len(norm(name))<5 or norm(name).startswith(('VENDA ','TOTAL')): continue
   cpfraw=pick(row,'CPF','CPF CLIENTE','CPF/BENEFICIO'); cpf=digits(cpfraw) if cpf_ok(cpfraw) else None
   benefit=digits(cpfraw) if cpfraw is not None and not cpf and len(digits(cpfraw))>=7 else None
   phone=pick(row,'TELEFONE'); product=pick(row,'OPERACAO','ACAO','PRODUTO'); bank=pick(row,'BANCO','CONVENIO')
   base={'source_sheet':extra.name+' / '+sheet,'source_row':int(i+header+2),'name':norm(name).title(),'normalized_name':norm(name),'cpf':cpf,'benefit_number':benefit,'birth_date':datev(pick(row,'NASCIMENTO','DATA ANIVERSARIO')),'phone':str(phone).strip() if phone is not None and not pd.isna(phone) else None}
   raw.append({**base,'bank':norm(bank).title() or None,'original_product':norm(product).title() or None,'category':category(product),'promoter':norm(pick(row,'PROMOTORA')).title() or None,'producer':norm(pick(row,'PRODUCAO')).title() or sheet.title(),'origin':norm(pick(row,'PRODUCAO')).title() or sheet.title(),'value':num(pick(row,'VALOR','VALOR PAGO')),'installment':num(pick(row,'PARCELA')),'term':num(pick(row,'PRAZO')),'operation_date':datev(pick(row,'DATA','DATA ENTREGA')),'status':norm(pick(row,'SITUACAO CONTRATO')).title() or 'Registro histórico','commission':num(pick(row,'COMISSAO')),'commission_status':norm(pick(row,'SITUACAO COMISSAO')).title() or None})

allpeople=raw+birthday
bykey=defaultdict(list); uncertain=[]
for r in allpeople:
 if r['cpf']:key='cpf:'+r['cpf']
 elif r['benefit_number']:key='benefit:'+r['benefit_number']
 elif r['birth_date']:key='namebirth:'+r['normalized_name']+'|'+r['birth_date']
 elif r['phone']:key='namephone:'+r['normalized_name']+'|'+digits(r['phone'])
 else:key='row:'+r['source_sheet']+':'+str(r['source_row']); uncertain.append(r)
 bykey[key].append(r)
clients=[]; key_to_id={}
for cid,(key,rows) in enumerate(sorted(bykey.items()),1):
 best=max(rows,key=lambda x:sum(bool(x.get(k)) for k in ('cpf','benefit_number','birth_date','phone')))
 clients.append({'id':cid,'name':best['name'],'cpf':best['cpf'],'benefit_number':next((x['benefit_number'] for x in rows if x['benefit_number']),None),'birth_date':next((x['birth_date'] for x in rows if x['birth_date']),None),'phone':next((x['phone'] for x in rows if x['phone']),None),'match_key':key,'source_records':len(rows)})
 key_to_id[key]=cid
for r in raw:
 if r['cpf']:key='cpf:'+r['cpf']
 elif r['benefit_number']:key='benefit:'+r['benefit_number']
 elif r['birth_date']:key='namebirth:'+r['normalized_name']+'|'+r['birth_date']
 elif r['phone']:key='namephone:'+r['normalized_name']+'|'+digits(r['phone'])
 else:key='row:'+r['source_sheet']+':'+str(r['source_row'])
 r['client_id']=key_to_id[key]
 r['fingerprint']='|'.join(str(r.get(k) or '') for k in ('cpf','bank','original_product','value','installment','term','operation_date'))
fps=Counter(r['fingerprint'] for r in raw if r['fingerprint'].strip('|'))
possible=[r for r in raw if fps[r['fingerprint']]>1]
for i,r in enumerate(raw,1):r['id']=i; r['possible_duplicate']=fps[r['fingerprint']]>1
report={'source_file':SOURCE.name,'additional_files':[p.name for p in EXTRA_SOURCES if p.exists()],'source_size_bytes':SOURCE.stat().st_size,'sheets':len(sheet_names)+sum(len(pd.ExcelFile(p).sheet_names) for p in EXTRA_SOURCES if p.exists()),'rows_recognized':len(allpeople),'clients_unique':len(clients),'client_records_consolidated':len(allpeople)-len(clients),'operations_preserved':len(raw),'possible_duplicate_rows':len(possible),'clients_without_valid_cpf':sum(not c['cpf'] for c in clients),'records_without_safe_identity':len(uncertain),'operations_by_category':Counter(r['category'] for r in raw),'operations_by_sheet':Counter(r['source_sheet'] for r in raw),'generated_at':datetime.now().isoformat(timespec='seconds'),'note':'Nenhuma operação foi removida. possible_duplicate=true exige revisão humana.'}
for path,data in [(OUT/'clientes_consolidados.json',clients),(OUT/'operacoes_preservadas.json',raw),(OUT/'relatorio_importacao.json',report),(PUBLIC/'tf-clients.json',clients),(PUBLIC/'tf-operations.json',raw)]:path.write_text(json.dumps(data,ensure_ascii=False,indent=2,default=dict),encoding='utf-8')
pd.DataFrame(clients).to_csv(OUT/'clientes_consolidados.csv',index=False,encoding='utf-8-sig')
pd.DataFrame(raw).to_csv(OUT/'operacoes_preservadas.csv',index=False,encoding='utf-8-sig')
print(json.dumps(report,ensure_ascii=False,indent=2,default=dict))

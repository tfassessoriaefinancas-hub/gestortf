# Gestão TF — Next.js + PostgreSQL / MongoDB

CRM em Next.js 16, React 19 e TypeScript, com a interface original do Gestão TF. **Uma única base é selecionada explicitamente** por `DATABASE_PROVIDER`: `postgres` (padrão, `DATABASE_URL`) ou `mongodb` (`MONGODB_URI` e `MONGODB_DATABASE`). Clientes, operações, comissões, permissões, sessões e anexos usam essa mesma base. Não há troca automática de provedor nem leitura de backups locais quando o banco fica indisponível.

O suporte a MongoDB preserva as consultas parametrizadas da aplicação e as traduz em consultas e agregações nativas. As coleções mantêm IDs, campos, relacionamentos e valores em centavos; os inteiros são armazenados como BSON `int64`. Transações, índices únicos e verificação das referências protegem edições e gravações relacionadas. Os cálculos continuam em `lib/operation-finance.ts`, compartilhados pelas telas e relatórios.

## MongoDB Atlas e transferência

Use um cluster com suporte a transações (replica set). Cadastre `MONGODB_URI` e `MONGODB_DATABASE=gestortf` como variáveis privadas. Mantenha `DATABASE_PROVIDER=postgres` até concluir a transferência. A origem continua sendo o PostgreSQL atual; os arquivos históricos locais não representam uma exportação atual.

```bash
# Gera um arquivo privado completo; a origem é consultada somente para leitura.
npm run db:transfer:mongodb -- export data/mongodb-migration/current-postgres-snapshot.json

# Cria a estrutura, importa em uma transação e compara todos os campos.
# O destino precisa estar vazio e o snapshot precisa ter menos de uma hora.
npm run db:transfer:mongodb -- import data/mongodb-migration/current-postgres-snapshot.json
npm run db:transfer:mongodb -- verify data/mongodb-migration/current-postgres-snapshot.json
```

A exportação inclui as 37 tabelas, registros excluídos, recebimentos, configurações, ajustes de parceiros, senhas já derivadas, sessões, anexos e fontes de importação. O processo preserva os IDs e prepara os próximos IDs. Se o destino tiver dados, se houver diferença de estrutura ou checksum, ou se a origem estiver inacessível, a transferência para e mantém a conexão ativa. Uma nova execução com o mesmo snapshot apenas verifica o destino; nunca o limpa nem sobrescreve edições posteriores.

No momento da troca, suspenda temporariamente gravações na origem, exporte novamente e confira o destino antes de mudar `DATABASE_PROVIDER=mongodb` na Vercel e publicar novamente. A aplicação recusa uma base MongoDB sem o marcador de transferência verificada. Mantenha a origem e o snapshot privados para recuperação; após novas gravações no MongoDB, voltar ao PostgreSQL exige reconciliar essas alterações.

`db/mongodb-schema.json` é gerado das migrações existentes por `npm run db:generate:mongodb`; não contém dados de clientes. `npm run db:migrate:mongodb` prepara somente a estrutura, sem dados. Novas alterações de contrato exigem migração explícita; a inicialização não reinterpreta silenciosamente uma base existente.

Os testes `npm run test:mongodb` usam uma base `tf_test_` exclusiva e a removem ao terminar. `npm run test:database-transfer` verifica uma transferência completa entre bases de teste; requer também `TRANSFER_TEST_POSTGRES_URL`. Para executar os mesmos testes de navegador com MongoDB, forneça `DATABASE_PROVIDER=mongodb`, `MONGODB_URI` e execute `npm run test:e2e`; o teste define sozinho o nome isolado da base.

## Vercel

1. Importe `tfassessoriaefinancas-hub/gestortf`, branch `main`, com o preset **Next.js** e Node.js **24.x**.
2. Cadastre a conexão privada do Neon na variável **`DATABASE_URL`**. Ela não deve ter prefixo `NEXT_PUBLIC_`. Se usar Preview, configure a variável nesse ambiente também; utilize outro banco se quiser testar alterações sem afetar a produção.
3. Publique novamente depois de salvar a variável. Build: `npm run build`; saída e instalação seguem os padrões do Next.js.
4. Entre com o CPF ou e-mail e a senha guardados no arquivo privado `data/neon-access.json` do computador em que a migração foi executada. Altere a senha em **Configurações**. Para acessos antigos da equipe, defina uma senha em **Usuários e acessos**.

O banco deste projeto já foi migrado. O deploy não importa dados novamente nem precisa de arquivos locais. Credenciais, backups e dados pessoais não fazem parte do repositório. O acesso usa senhas com scrypt, sessões revogáveis no PostgreSQL e cookies HTTP-only. O modo opcional de desenvolvimento local é desativado automaticamente na Vercel.

As APIs paginam o histórico em blocos de até 1.000 registros, carregados pelo painel. Anexos de até **4 MB** ficam em `stored_files`, no próprio PostgreSQL, para persistir entre deploys. Esse tamanho deixa margem para o [limite de requisições da Vercel](https://vercel.com/docs/errors/function_payload_too_large).

Durante o uso, o painel consulta apenas `/api/crm/changes` a cada minuto. A resposta contém sete revisões pequenas; o histórico carregado é reutilizado enquanto sua revisão não mudar. Notas, parceiros, equipe, catálogos e pós-venda são carregados conforme a tela aberta. O portal do parceiro segue a mesma verificação. Telas ocultas, offline ou sem atividade há dois minutos suspendem a atualização; eventos próximos de foco são agrupados.

As revisões ficam em chaves `crm_revision:*` da tabela existente `app_settings`, gravadas na mesma transação dos dados, tanto no PostgreSQL quanto no MongoDB. Isso funciona entre diferentes instâncias da aplicação, detecta exclusões e não exige uma migração de esquema. Alterações externas devem passar pela camada de banco da aplicação ou invalidar as revisões correspondentes na mesma transação. Uma alteração real ainda recarrega o conjunto afetado completo; consultas sem alterações não percorrem novamente o histórico. Os testes `request-budget.spec.ts` verificam esse comportamento nos dois temas e entre sessões independentes.

## Executar localmente

Requer Node.js 24 e npm.

```bash
npm ci
cp .env.example .env.local
# Preencha DATABASE_URL com a conexão privada.
npm run dev
```

Abra **http://localhost:3000** e use a mesma conta. Para produção local:

```bash
npm run build
npm start
```

As fontes estão incluídas no projeto. A compilação usa Webpack e não precisa baixar fontes externas.

## Migração e preservação

A migração inicial preservou as 27 tabelas originais e consolidou as bases históricas no PostgreSQL: **3.561 clientes, 8.174 operações e 67 registros de comissão**, incluindo registros antigos e excluídos. CPFs históricos correspondentes foram vinculados aos cadastros existentes. Os **17 lançamentos históricos de agosto/setembro já substituídos pela base atualizada** permanecem guardados, com exclusão dos relatórios para manter a regra original.

`source_records` guarda **11.899 registros de origem** para conferência, incluindo os valores originais antes da normalização. O painel usa as tabelas canônicas: editar um registro histórico atualiza o banco, sem reconstruí-lo a partir de JSONs. `migration_runs` registra o checksum da importação. Uma segunda execução com o mesmo plano não duplica registros; planos diferentes ou destinos já preenchidos são recusados.

Os arquivos `data/crm.sqlite`, `data/historical/`, `data/source-snapshot.json`, `data/neon-migration-plan.json` e `data/backups/` são cópias privadas para migração e recuperação; não são consultados pelo sistema em execução.

```bash
# Aplicar novas alterações de esquema, sem reimportar os dados:
npm run db:migrate

# Apenas para a migração inicial de uma base local existente:
npm run db:prepare:neon
npm run db:import:neon

# Conferir cada campo migrado e as fontes antes de começar novas edições:
npm run db:verify:neon
```

Novas migrações PostgreSQL ficam em `db/postgres/*.sql`. Migrações aplicadas são verificadas por checksum e não devem ser editadas. Os scripts SQLite, o esquema `db/schema.ts` e `drizzle.sqlite.config.ts` foram mantidos exclusivamente para consultar backups anteriores.

## Verificação

```bash
npm test
npm run build
npm run typecheck
npm run test:e2e
```

Os testes de navegador criam e removem um esquema PostgreSQL próprio com prefixo `tf_test_`. Eles cobrem login, permissões, encerramento de sessões, atendimento, comissões, anexos, edição histórica, navegação e tela móvel, sem alterar o esquema `public`. Use uma conexão com permissão para criar esse esquema. O Playwright usa Chrome instalado; alternativamente, defina `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

WhatsApp e extração por IA continuam opcionais e dependem das credenciais correspondentes em `.env.example`.

## Sincronização e temas

`lib/operations.ts` consulta clientes e operações atuais; `lib/operation-finance.ts` centraliza os cálculos usados pela produção, comissões, indicadores e parceiros. O percentual atual da operação prevalece sobre cópias históricas. Taxas de assessoria e adesão ficam separadas da comissão bruta do parceiro, preservando ILA, nota e divisão já cadastradas. Importações sem percentual mantêm o valor histórico como referência.

As edições usam `lib/update-operation.ts`, com transação e os mesmos IDs de cliente, operação e receitas. Campos omitidos, dados de origem e histórico de recebimentos são preservados. As telas atualizam após salvar, ao recuperar o foco e periodicamente; alterações também notificam outras abas.

Os dois temas compartilham componentes e `app/shared-layout.css`. Cores e fundos ficam nos estilos de identidade visual. Toda alteração estrutural deve valer para ambos os temas, salvo pedido expresso do usuário. Os testes verificam comissão de 6% para 4%, persistência sem duplicação e alternância dos temas em cinco larguras de tela.

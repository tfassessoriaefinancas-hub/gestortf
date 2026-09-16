# Gestão TF — Next.js + Neon

CRM em Next.js 16, React 19 e TypeScript, com a interface original do Gestão TF. **PostgreSQL é a única fonte de dados em execução**, tanto localmente quanto na Vercel. Clientes, operações, comissões, permissões, sessões e anexos são lidos e gravados no banco indicado por `DATABASE_URL`.

## Vercel

1. Importe `tfassessoriaefinancas-hub/gestortf`, branch `main`, com o preset **Next.js** e Node.js **24.x**.
2. Cadastre a conexão privada do Neon na variável **`DATABASE_URL`**. Ela não deve ter prefixo `NEXT_PUBLIC_`. Se usar Preview, configure a variável nesse ambiente também; utilize outro banco se quiser testar alterações sem afetar a produção.
3. Publique novamente depois de salvar a variável. Build: `npm run build`; saída e instalação seguem os padrões do Next.js.
4. Entre com o CPF ou e-mail e a senha guardados no arquivo privado `data/neon-access.json` do computador em que a migração foi executada. Altere a senha em **Configurações**. Para acessos antigos da equipe, defina uma senha em **Usuários e acessos**.

O banco deste projeto já foi migrado. O deploy não importa dados novamente nem precisa de arquivos locais. Credenciais, backups e dados pessoais não fazem parte do repositório. O acesso usa senhas com scrypt, sessões revogáveis no PostgreSQL e cookies HTTP-only. O modo opcional de desenvolvimento local é desativado automaticamente na Vercel.

As APIs paginam o histórico em blocos de até 1.000 registros, carregados pelo painel. Anexos de até **4 MB** ficam em `stored_files`, no próprio PostgreSQL, para persistir entre deploys. Esse tamanho deixa margem para o [limite de requisições da Vercel](https://vercel.com/docs/errors/function_payload_too_large).

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

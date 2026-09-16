# Gestão TF — Next.js local

Cópia do código original de [Gestão TF](https://nexo-crm-gestao.thiagon-oliveira.chatgpt.site), versão 175, commit `b59498a2c9a7355acf23eac3a7c58c3aa69cd25f`.

As telas, temas, imagens, atendimento Kanban, clientes, produção, parceiros, comissões, notas, relatórios e APIs foram preservados. A execução usa Next.js 16 com App Router, React 19 e TypeScript. O runtime da hospedagem foi substituído por SQLite e arquivos locais. As fontes estão incluídas no projeto; a compilação não precisa acessar o Google Fonts. O repositório público contém o código e inicia com um banco vazio, sem dados de clientes.

## Executar

Requer Node.js 24 e npm.

```bash
git clone git@github.com:tfassessoriaefinancas-hub/gestortf.git
cd gestortf
npm ci
cp .env.example .env.local
npm run db:migrate
npm run dev
```

Abra **http://localhost:3000**. No primeiro acesso pelo navegador, a tela original solicita cadastrar CPF e senha para o bloqueio local.

Para executar a compilação de produção:

```bash
npm run build
npm start
```

Os comandos usam Webpack, validado neste Mac, e escutam apenas em `127.0.0.1`.

## Dados

- `data/crm.sqlite`: banco local persistente; as 13 migrações são aplicadas automaticamente.
- `data/files/`: novos documentos anexados, entregues pelas APIs.
- `data/source-snapshot.json`: snapshot privado opcional para restauração, mantendo IDs e relacionamentos.
- `data/historical/tf-clients.json` e `data/historical/tf-operations.json`: bases históricas privadas opcionais. O painel aplica as mesmas regras originais de combinação e deduplicação.
- `data/imports/aug-sep-2026.json`: base privada opcional para a importação administrativa legada.

As bases históricas são entregues por rotas autenticadas de administrador; quando não existem, o painel recebe listas vazias. Dados pessoais não ficam em `public/` nem no código TypeScript. Novos cadastros e anexos ficam no computador em que o sistema roda. Alterações locais não são sincronizadas com o site original.

O banco, o snapshot, as bases históricas, os anexos e `.env.local` ficam fora do Git. Para backup, pare o servidor e copie a pasta `data/` completa e `.env.local`. A cópia local original conserva todos os dados importados; eles não são enviados ao GitHub.

Para restaurar o snapshot em **um banco vazio**, configure outro `LOCAL_DATA_DIR` e execute:

```bash
npm run db:import -- data/source-snapshot.json
```

A importação é transacional e recusa tabelas que já contenham registros. Ao restaurar a cópia, preserve também `LOCAL_USER_ID` do `.env.local` original.

## Acesso e integrações

Esta instalação foi preparada para uso local de um administrador. `LOCAL_AUTH_ENABLED=true` fornece a identidade somente para hosts de loopback. Os antigos cabeçalhos de identidade da hospedagem não são aceitos como autenticação. A tela de CPF e senha é o bloqueio de navegador herdado do site, não autenticação de servidor para publicação na internet.

As telas de usuários e permissões foram preservadas, mas autenticação com várias contas e Sign in with ChatGPT dependem de configurar um provedor de autenticação antes de hospedar esta versão.

As rotas de WhatsApp e extração de documentos por IA continuam no código. Nenhuma credencial foi copiada ou ativada; essas funções dependem das variáveis opcionais indicadas em `.env.example`. O CRM, cadastros, relatórios e anexos funcionam sem elas. O token de importação administrativa também é opcional.

## Verificação

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
```

Os testes de navegador usam um banco temporário separado na porta 3100. Usam o Chrome instalado no macOS quando disponível; em outro ambiente, instale o Chromium com `npx playwright install chromium` ou configure `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

Os testes verificam persistência, migrações, rollback, anexos, acesso local, cadastro e movimentação de atendimento, finalização com comissão, navegação, temas e layout móvel. Capturas ficam em `test-results/`.

A publicação no GitHub começa com um histórico novo, sem os dados privados presentes no histórico da origem. O histórico original permanece somente na branch local `source-original`. Nenhuma alteração foi publicada no site original.

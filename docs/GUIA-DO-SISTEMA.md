# JurídicoBRM — Guia do sistema

Sistema de gestão operacional de clientes jurídicos: cadastro único, tipos de cliente
(operações), checklists editáveis, pendências automáticas, registro de contato e
painel de operação para trabalhar dezenas/centenas de clientes.

## Primeiros passos (uma única vez)

1. **Ativar o login por e-mail/senha no Firebase** (obrigatório):
   - Abra [console.firebase.google.com](https://console.firebase.google.com) → projeto **baro-de-mau**
   - Menu **Authentication** → **Sign-in method** → habilite **E-mail/senha**.
2. **Criar sua conta de administrador**:
   - Ainda em Authentication → **Users** → **Add user** → e-mail `gutookada@gmail.com` + senha.
   - Este e-mail é o administrador "de fábrica" — ao entrar no sistema o perfil é criado sozinho.
3. **Publicar as regras de segurança**:
   - No terminal do projeto: `npx firebase-tools deploy --only firestore:rules`
   - (ou copie o conteúdo de `firestore.rules` no console → Firestore → Regras → Publicar).
4. **Entrar no sistema** com o e-mail e senha criados.
5. **Instalar os padrões**: menu **Tipos & Checklists** → botão **“Instalar padrões”**.
   Isso cria os tipos (Pré-cliente, Barão de Mauá, Contestação GSI, Cliente antigo,
   Arquivado), o checklist completo do Barão de Mauá e as 5 mensagens padrão.

## Habilitar a IA (uma única vez, opcional)

Para os botões **Preencher com IA** (cadastro de cliente e processo) e **Resumir com IA**
funcionarem, habilite o Firebase AI Logic no projeto:

```bash
npx -y firebase-tools@latest init ailogic
```

(ou Console Firebase → AI Logic → Começar, usando a Gemini Developer API — tem camada gratuita.)

## Processos

- **Processos** no menu: lista com número, clientes, parte contrária, polo e status.
- Um processo pode ter **vários clientes**; a estrela marca o principal.
- Clique no **número** para abrir a página do processo: dados completos, clientes,
  andamentos (com **resumir com IA**), editar e lixeira.
- **Novo processo**: preencha manualmente ou clique em **Preencher com IA** e cole a
  capa do processo — número, vara, classe, partes e polo são extraídos.
- Na **ficha do cliente → aba Processos**: veja os processos dele, crie um novo já
  vinculado ou vincule um processo existente pela busca.

## Tarefas (recursos completos)

- **Minhas / Equipe**: por padrão você vê só as suas (e as marcadas para "Todos").
- Criar/editar com responsável (pessoa ou **Todos**), prioridade e prazo; tarefas com
  prazo passado aparecem como **Vencida**.
- **Seleção múltipla** → editar em lote (responsável/prioridade/prazo/status) ou excluir.
- **Lixeira**: restaure tarefas excluídas (apagar de vez, só administrador).

## Como criar usuários (funcionários)

Menu **Usuários** (só administrador) → **Novo usuário** → nome, e-mail, senha inicial
e papel (Operador ou Administrador). O funcionário entra com esse e-mail/senha.
- **Desativar**: botão na linha do usuário — bloqueia o acesso na hora (inclusive no servidor).
- **Trocar senha**: botão de chave envia e-mail de redefinição.
- **Contas do sistema antigo** (senha sem criptografia) aparecem num quadro amarelo — remova-as.

## Como cadastrar cliente com código interno

Menu **Clientes** → **Novo cliente**. O campo **Código** aceita 1 letra + 4 números
(ex.: `X9999`), converte para maiúsculo e **bloqueia duplicidade**. CPF/CNPJ é validado
(dígitos verificadores) e deduplicado mesmo com pontuação diferente. Alterar o código de
um cliente existente pede confirmação.

## Como usar a tela Operação (o painel de guerra)

Menu **Operação**:
1. Escolha o tipo no topo (ex.: **Barão de Mauá**).
2. Os cartões A/B/C/D/P mostram a prontidão geral (clique para filtrar):
   - **A — Redondo** · **B — Protocolável c/ pendência** · **C — Alto risco** ·
     **D — Não protocolar** · **P — Protocolado**.
3. Filtros rápidos: *Precisa ligar*, *Sem contato 7+ dias*, *Sem telefone*, *Sem responsável*,
   *Sem código* e um botão **“Falta …”** para cada item do checklist marcado como “Filtro”
   (personalizável no editor de checklist).
4. Busca por código, nome, CPF ou telefone (com ou sem pontuação).
5. Na tabela: **responsável, prioridade e próxima ação são editáveis direto na linha**;
   ícones de telefone/WhatsApp ligam ou abrem conversa; o botão de telefone no fim da
   linha **registra contato**.
6. Clique no **nome** para abrir o painel lateral com: **Checklist** (marca status sem sair
   da tela + lista de pendências com botão “criar tarefa”), **Caso** (bloco/lote, nº do
   processo etc.), **Contatos** (histórico) e **Mensagem** (modelos prontos).
7. Selecione várias linhas para **ações em lote**: responsável, prioridade, status,
   adicionar/remover tipo, criar tarefas e exportar Excel.
8. Ordenação por urgência, pendências, contato mais antigo, nome ou código. Botão de
   **visão compacta** para ver mais linhas.

## Como editar tipos e checklists (sem programar)

Menu **Tipos & Checklists** (admin):
- Criar/editar/arquivar/reordenar tipos, com cor e descrição.
- Cada tipo tem a tabela de **itens do checklist**: nome, categoria, exigência
  (obrigatório/recomendado/opcional), **Bloqueia** (trava o protocolo), **Pendência**
  (gera pendência automática), **Filtro** (vira botão na Operação), **Chave** e ativo.
- A **Chave** liga o item às regras de prontidão. Chaves reconhecidas:
  `procuracao`, `contrato`, `termo_resp`, `ultimo_adq`, `ultimo_adq_prova`, `extrato`,
  `boletos`, `pagamentos_suficientes`, `planilha`, `minuta_revisada`, `protocolado`,
  `jg_pedir`, `jg_completa`, `telefone`. As regras em si ficam em `src/lib/readiness.ts`.
- Aba **Campos do caso**: campos específicos do tipo (texto, lista, data) — ex.: bloco/lote.

## Como registrar contato

Em qualquer lugar (Operação, ficha do cliente): botão **Registrar contato** → canal
(ligação/WhatsApp/e-mail/presencial) + resultado (não atendeu, pediu prazo, vai enviar…)
+ observação + próxima ação. O "último contato" do cliente atualiza na hora para todos.

## Como ver pendências

- **Por cliente**: painel lateral (Operação) ou ficha → quadro amarelo com as pendências
  geradas pelo checklist (+ sem telefone/sem código). Botão **criar tarefa** transforma
  a pendência em tarefa com responsável e prazo.
- **Em massa**: filtros "Falta …" na Operação mostram quem está faltando cada item;
  Relatórios mostra o ranking "O que mais falta".

## Como importar dados em lote

**Jeito rápido (com IA)** — tela **Clientes** → botão **Importar**:
1. Copie as linhas da sua planilha (ou qualquer lista/texto) e cole na caixa.
2. Clique em **Analisar com IA**: ela identifica os clientes e monta uma tabela.
3. Linhas são casadas com o cadastro por código → CPF → nome. **Células vermelhas**
   são conflitos: clique nelas para alternar entre o valor novo (colado) e o atual.
4. Ajuste a ação de cada linha (criar/atualizar/pular) e clique em **Inserir dados** —
   tudo é gravado de uma vez.

**Jeito clássico (sem IA)** — menu **Importar** (admin): suba o Excel/CSV → mapeie as
colunas → escolha tipos a atribuir e se atualiza existentes → prévia → Importar.

## Como exportar

- **Operação**: botão Exportar (lista filtrada ou seleção) — Excel.
- **Clientes**: botão Exportar.
- **Relatórios**: lista para ligação, prontos para protocolo, alto risco, todos do tipo.

## Segurança (como ficou)

- Login por **Firebase Authentication** (e-mail/senha, senha criptografada pelo Google).
- Permissões verificadas **no servidor** pelas **Firestore Security Rules**: só usuário
  autenticado **e ativo** lê/escreve; tipos, checklists, mensagens e usuários só admin.
- `localStorage` não é mais fonte de permissão; usuário desativado perde acesso
  imediatamente (a regra confere o perfil a cada operação).
- Exclusão definitiva de dados só admin (o app usa lixeira/soft delete).

## Estrutura de dados (Firestore)

| Coleção | Conteúdo |
| --- | --- |
| `clients` | Cadastro único (código, CPF normalizado, contato, tipos, status, responsável…) |
| `clientTypes` | Tipos/operações com checklist e campos do caso embutidos |
| `caseFiles` | Ficha operacional por cliente×tipo (`{clientId}_{typeId}`): status dos itens + campos |
| `updates` | Contatos, anotações, tarefas e andamentos (coleção legada, preservada) |
| `messageTemplates` | Mensagens padrão |
| `users` | Perfis de acesso (uid do Firebase Auth) |
| `processes`, `clientGroups` | Legado preservado |

# Contrato de funcionalidades — JurídicoBRM

> **Para humanos e IAs (Claude, Codex, Gemini):** este arquivo é o inventário oficial
> do que o sistema FAZ. Antes de refatorar qualquer tela, confira aqui o que ela
> precisa continuar fazendo. **Nenhum item pode sumir numa refatoração.**
> Ao adicionar funcionalidade nova, adicione a linha correspondente aqui no mesmo commit.
> Em julho/2026 uma refatoração visual perdeu funções (multi-cliente em processos,
> IA de preenchimento, edição em lote de tarefas) — este arquivo existe para isso nunca se repetir.

## Login (/)
- E-mail/senha (Firebase Auth) e Google; "esqueci minha senha" por e-mail.
- Redireciona logado para /dashboard; telas internas exigem sessão + perfil ativo.

## Painel (/dashboard)
- Cartões: clientes ativos, minhas tarefas pendentes, sem contato 7+ dias, alto risco — todos clicáveis.
- Cartão por operação (tipo) com prontos/risco/protocolados e atalho para Operação.

## Operação (/dashboard/operacao) — tela central
- Seletor de operação (chips com contagem); botões com os nomes das classificações + "sem classificação" clicáveis (filtram), usando fundo discreto quando selecionados.
- **Prontidão é MANUAL**: o nome na linha é um seletor (Redondo/Protocolável/Alto risco/Não protocolar/Protocolado ou nenhuma) gravado internamente em caseFiles.grade — nenhum cálculo automático.
- Administrador vê **Editar operação**, que abre diretamente o construtor da operação selecionada.
- Busca por código, nome, CPF (com/sem pontuação) e telefone; ao lado, **Personalizar pendências** permite que cada usuário escolha quais filtros de pendência aparecem na listagem, com a seleção salva em seu perfil por operação.
- **Filtros como links de texto pequenos** com contagem entre parênteses, abaixo da busca: precisa ligar, sem contato 7+ dias, sem telefone, sem responsável, sem código, sem prontidão + **um filtro "falta X" para CADA item ativo do checklist** (tudo é filtro).
- Tabela sempre em **linhas baixas** (sem botão de alternância): cabeçalhos clicáveis para ordenar; código, nome (abre painel lateral), telefone com ligar/WhatsApp e botão `+` para adicionar outro número, prontidão (seletor manual), pendências (itens não-OK), prioridade **editável na linha**, último contato, próxima ação editável; registrar contato por linha.
- Seleção múltipla → lote: responsável, prioridade, status geral, adicionar/remover tipo, criar tarefas, exportar seleção.
- Ordenação (urgência/pendências/contato/nome/código), exportar Excel.
- Painel lateral (drawer): prontidão manual no topo; **botão alinhado à direita para exibir/ocultar itens OK**; checklist em 3 estados de 1 clique (— / Pendente / OK) + observação por item; pendências (todo item não-OK) com "criar tarefa" e lista expansível com "ver mais"/"ver menos"; campos do caso; histórico de contatos; mensagens padrão (copiar/WhatsApp).

## Clientes (/dashboard/clients)
- Lista compacta com cabeçalhos clicáveis para ordenar: código em destaque (sem quebra de linha), telefone com botão `+` para acrescentar outro número, tipos em chips com lápis para editar as operações vinculadas e status em chip pequeno; busca normalizada (código/nome/CPF/telefone) e filtro por tipo.
- **Clientes aninhados**: qualquer cliente principal pode vincular outros clientes e o mesmo aninhado pode pertencer a vários principais; nas listas de Clientes e Operação, `+`/`−` à esquerda do nome expande/recolhe os aninhados em linhas recuadas (na Operação aparecem somente os que também pertencem à operação selecionada).
- Barra de ações: **Novo cliente à esquerda; Importar (IA) e Exportar à direita**.
- **Importar com IA**: caixa para colar texto/tabela (direto do Excel) → IA organiza em tabela
  de clientes × campos → casa com existentes por código → CPF → nome → **conflitos em vermelho
  com escolha por célula (valor novo × valor atual)** → ação por linha (criar/atualizar/pular)
  → "Inserir dados" grava tudo em lote. Link para a importação por arquivo (sem IA).
- **Novo/editar** ([id]/edit, new): código X9999 validado + único (mudança pede confirmação); CPF/CNPJ com dígito verificador + dedupe com/sem pontuação; aviso de nome repetido; **vários telefones, e-mails e endereços com escolha do principal**; WhatsApp; **dados pessoais complementares (RG, órgão emissor, nome da mãe, nacionalidade, profissão, estado civil)**; tipos (multi), status geral, responsável, prioridade, origem, próxima ação, observações.
- **Preencher com IA**: cola texto solto → preenche o cadastro (src/lib/ai.ts, Firebase AI Logic).
- **Ficha ([id])**: cabeçalho com telefone/ligar/WhatsApp/registrar contato/editar/lixeira e
  **caixas editáveis no próprio card: Próxima ação e Anotações (salvam ao sair do campo)**; card de vínculos permite buscar/adicionar/remover clientes aninhados no principal e mostra, sem edição, todos os principais em **Aninhado a**.
  Abas nesta ordem: **Andamentos | Dados do cliente | Processos | Tarefas | (tipos do cliente por último)**:
  - Andamentos: anotação rápida, **resumir com IA**, **editar/excluir registro (autor ou admin)**;
  - Dados do cliente: TODOS os campos do cadastro (contato, endereço, pessoais, gestão) + legado
    + **card Mensagem padrão** (modelos com variáveis, copiar/WhatsApp);
  - Processos: lista vinculados, criar processo já vinculado, vincular existente pela busca;
  - Tarefas: pendentes + nova tarefa;
  - Uma aba por tipo do cliente (gestão operacional): prontidão, campos do caso, checklist.

## Processos (/dashboard/processes)
- Lista: número (link para página do processo), clientes, tipo de ação, parte contrária, polo, status; filtros por status; busca por número/cliente/parte contrária/tipo.
- **Formulário completo (novo/editar)**: número, status, **vários clientes com principal (estrela)** — nunca sobrescrever a lista de vínculos —, **polo ativo/passivo, parte contrária**, tipo de ação/classe/assunto/foro/vara/juiz **com sugestões dos valores já usados**, instância, observações; **Preencher com IA** (capa do processo).
- **Página do processo ([id])**: dados completos, clientes vinculados (principal com estrela), editar, lixeira/restaurar, **registrar andamento processual**, linha do tempo (por vínculo e por número), editar/excluir andamento, **resumir com IA**.

## Andamentos (/dashboard/updates)
- Linha do tempo geral (500 recentes) com filtro por tipo e busca (cliente/código/texto/autor/nº processo).
- **Novo andamento**: anotação / atendimento (canal+resultado, atualiza último contato) / andamento processual (com processo do cliente), com busca de cliente.
- **Editar/excluir** registro (autor ou admin; exclusão = lixeira).

## Tarefas (/dashboard/tasks)
- Filtros: **Minhas** (responsável = eu ou "Todos") / **Equipe**; por responsável; mostrar concluídas; busca por tarefa/cliente/processo/autor; **Lixeira** (operador vê o que ele ocultou; administrador audita todos; restauração sempre disponível).
- Criar/editar tarefa: descrição, responsável (**inclui "Todos"**), prioridade, prazo; vínculo opcional com processo; vínculo com nenhum, um ou **vários clientes** (uma tarefa criada para cada cliente marcado, inclusive diretamente pela tela Tarefas; também aceita lote pela Operação).
- Concluir/reabrir em 1 clique; status **Vencida** automático por prazo.
- **Seleção múltipla → editar em lote** (responsável/prioridade/prazo/status com "manter como está") e excluir em lote.
- A fila exibe autor/data de criação e processo vinculado; ações de excluir/restaurar pedem confirmação.
- Ordenação clicável por prazo, prioridade, responsável e status.

## Grupos de clientes (/dashboard/groups)
- Grupos são listas organizacionais livres e **não alteram** cadastro, operação, aninhamento ou vínculos de processo; um cliente pode participar de vários grupos.
- Listagem em tempo real com busca por grupo/cliente/observação, quantidade e nomes de membros, autor/data e acesso à edição.
- Criar/editar: nome, observações e seleção pesquisável de qualquer quantidade de clientes; `clientIds[]` e `clientNames[]` são gravados juntos e na mesma ordem.
- Página do grupo mostra os membros, telefone principal e processos atuais de cada cliente, com links para as fichas.
- Soft delete com lixeira: operador vê/restaura os grupos que ele ocultou e administrador audita todos. Ocultar grupo nunca exclui clientes e não existe exclusão definitiva.

## Relatórios (/dashboard/reports)
- Clientes por tipo (barras); prontidão A–P do tipo selecionado; "o que mais falta" por item.
- Exportações: lista para ligação, prontos (A), alto risco (C/D), todos do tipo.
- Produtividade 30 dias por usuário (contatos + tarefas concluídas).

## Administração
- **Editor de operações (settings/types — via botão Editar operação na tela Operação; fora do menu lateral)**: tudo em **uma coluna de cards** (um por operação, expande para editar); nome/cor/descrição; **checklist com pastas**: criar/renomear/apagar pasta (apagar devolve os itens à raiz), **arrastar itens entre pastas/para reordenar e arrastar pastas para reordenar**; itens têm somente nome (sem obrigatório/bloqueia/pendência/filtro/chave — tudo é filtro e pendência, nada bloqueia; prontidão é manual); campos do caso (texto/texto longo/lista/data); **Instalar padrões** (Barão de Mauá completo, GSI, mensagens) sem sobrescrever; arquivar/restaurar e reordenar operações.
- Operações, grupos, itens e campos usam **soft delete** com opção administrativa de ver/restaurar ocultos; não há exclusão definitiva no editor.
- Edições incompatíveis de itens/campos criam um novo padrão e preservam a definição anterior nas fichas já existentes. A ficha mostra o padrão novo junto dos itens/campos antigos até que qualquer usuário os oculte; ocultar não apaga estados, observações ou valores, e administradores podem visualizar/restaurar os ocultos.
- **Mensagens padrão (settings/templates)**: criar/editar/ocultar/restaurar com variáveis {{nome}}, {{primeiro_nome}}, {{codigo}}, {{pendencias}}, {{responsavel}}.
- **Importar (import)**: Excel/CSV → mapeamento automático de colunas → tipos em lote → atualizar existentes por código/CPF → prévia com validação → gravação em lote.
- **Usuários (users)**: criar (e-mail+senha, sem derrubar sessão do admin), editar papel, desativar/reativar (bloqueio imediato via rules), redefinir senha por e-mail, ocultar/restaurar contas do sistema antigo sem apagar o registro.

## IA (src/lib/ai.ts — Firebase AI Logic, sem backend próprio)
- extractClientText: texto → cadastro de cliente.
- extractClientsBatchText: texto/planilha colada → array de clientes (importação em lote da tela Clientes).
- extractProcessText: capa de processo → dados do processo.
- summarizeTimeline: histórico → resumo (situação/pendências/próxima ação).
- Requer habilitar uma vez: `npx -y firebase-tools@latest init ailogic`.

## Regras transversais (não quebrar)
- Cadastro de cliente é ÚNICO; tipos são etiquetas (typeIds) — nunca duplicar cliente por operação.
- Aninhamento de clientes é muitos-para-muitos por `clients.nestedClientIds[]`: o vínculo fica somente no principal, pode haver vários principais para o mesmo aninhado e a interface impede auto vínculo e ciclos.
- Exclusões são sempre ocultação auditável (`deleted=true`, `deletedAt`, `deletedBy`) com restauração. Hard delete é proibido para todos, inclusive administradores, e bloqueado nas Firestore Rules.
- Definições embutidas de operação (grupos, itens e campos) nunca são removidas do documento: recebem marca de ocultação e permanecem disponíveis para compatibilidade histórica.
- `clientIds` e `clientNames` de processos andam JUNTOS e na mesma ordem.
- Deletados (deleted=true) nunca aparecem em listas/relatórios comuns.
- Prontidão A/B/C/D/P: **manual** (caseFiles.grade), definida pela equipe na Operação/ficha — nunca calculada.
- Checklist: 3 estados (Não verificado / Pendente / OK); OK gravado como `conferido`; legados só convertidos na exibição.
- Último contato do cliente é atualizado por registerContact (src/lib/db-actions.ts).

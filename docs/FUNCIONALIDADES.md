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
- Seletor de tipo (chips com contagem); cartões A/B/C/D/P clicáveis (filtram).
- Busca por código, nome, CPF (com/sem pontuação) e telefone.
- Filtros rápidos embutidos: precisa ligar, sem contato 7+ dias, sem telefone, sem responsável, sem código; + um filtro "Falta X" por item do checklist marcado como Filtro (pinned).
- Tabela: código, nome (abre painel lateral), telefone com ligar/WhatsApp, prontidão (tooltip com motivos), pendências, responsável e prioridade **editáveis na linha**, último contato, próxima ação editável; registrar contato por linha.
- Seleção múltipla → lote: responsável, prioridade, status geral, adicionar/remover tipo, criar tarefas, exportar seleção.
- Ordenação (urgência/pendências/contato/nome/código), visão compacta, exportar Excel.
- Painel lateral (drawer): checklist com status em 2 cliques + observação por item, pendências com "criar tarefa", campos do caso, histórico de contatos, mensagens padrão (copiar/WhatsApp).

## Clientes (/dashboard/clients)
- Lista compacta: código em destaque (sem quebra de linha), tipos e status em chips pequenos,
  busca normalizada (código/nome/CPF/telefone), filtro por tipo.
- Barra de ações: **Novo cliente à esquerda; Importar (IA) e Exportar à direita**.
- **Importar com IA**: caixa para colar texto/tabela (direto do Excel) → IA organiza em tabela
  de clientes × campos → casa com existentes por código → CPF → nome → **conflitos em vermelho
  com escolha por célula (valor novo × valor atual)** → ação por linha (criar/atualizar/pular)
  → "Inserir dados" grava tudo em lote. Link para a importação por arquivo (sem IA).
- **Novo/editar** ([id]/edit, new): código X9999 validado + único (mudança pede confirmação); CPF/CNPJ com dígito verificador + dedupe com/sem pontuação; aviso de nome repetido; telefone/WhatsApp; endereço; **dados pessoais complementares (RG, órgão emissor, nome da mãe, nacionalidade, profissão, estado civil)**; tipos (multi), status geral, responsável, prioridade, origem, próxima ação, observações.
- **Preencher com IA**: cola texto solto → preenche o cadastro (src/lib/ai.ts, Firebase AI Logic).
- **Ficha ([id])**: cabeçalho com telefone/ligar/WhatsApp/registrar contato/editar/lixeira e
  **caixas editáveis no próprio card: Próxima ação e Anotações (salvam ao sair do campo)**.
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
- Filtros: **Minhas** (responsável = eu ou "Todos") / **Equipe**; por responsável; mostrar concluídas; **Lixeira** (restaurar; excluir de vez só admin).
- Criar/editar tarefa: descrição, responsável (**inclui "Todos"**), prioridade, prazo; vínculo com cliente (individual ou em lote pela Operação).
- Concluir/reabrir em 1 clique; status **Vencida** automático por prazo.
- **Seleção múltipla → editar em lote** (responsável/prioridade/prazo/status com "manter como está") e excluir em lote.
- Ordenação clicável por prazo, prioridade, responsável.

## Relatórios (/dashboard/reports)
- Clientes por tipo (barras); prontidão A–P do tipo selecionado; "o que mais falta" por item.
- Exportações: lista para ligação, prontos (A), alto risco (C/D), todos do tipo.
- Produtividade 30 dias por usuário (contatos + tarefas concluídas).

## Administração
- **Tipos & Checklists (settings/types)**: criar/editar/arquivar/reordenar tipos (nome, cor, descrição); editor de checklist (nome, categoria, exigência, bloqueia, pendência, filtro/pinned, chave de prontidão, ativo, ordem); campos do caso (texto/lista/data); **Instalar padrões** (Barão de Mauá completo, GSI, mensagens) sem sobrescrever.
- **Mensagens padrão (settings/templates)**: CRUD com variáveis {{nome}}, {{primeiro_nome}}, {{codigo}}, {{pendencias}}, {{responsavel}}.
- **Importar (import)**: Excel/CSV → mapeamento automático de colunas → tipos em lote → atualizar existentes por código/CPF → prévia com validação → gravação em lote.
- **Usuários (users)**: criar (e-mail+senha, sem derrubar sessão do admin), editar papel, desativar/reativar (bloqueio imediato via rules), redefinir senha por e-mail, limpar contas do sistema antigo.

## IA (src/lib/ai.ts — Firebase AI Logic, sem backend próprio)
- extractClientText: texto → cadastro de cliente.
- extractClientsBatchText: texto/planilha colada → array de clientes (importação em lote da tela Clientes).
- extractProcessText: capa de processo → dados do processo.
- summarizeTimeline: histórico → resumo (situação/pendências/próxima ação).
- Requer habilitar uma vez: `npx -y firebase-tools@latest init ailogic`.

## Regras transversais (não quebrar)
- Cadastro de cliente é ÚNICO; tipos são etiquetas (typeIds) — nunca duplicar cliente por operação.
- Exclusões são sempre lixeira (deleted=true) com restauração; hard delete só admin.
- `clientIds` e `clientNames` de processos andam JUNTOS e na mesma ordem.
- Deletados (deleted=true) nunca aparecem em listas/relatórios comuns.
- Prontidão A/B/C/D/P: calculada em src/lib/readiness.ts via chaves dos itens do checklist.
- Último contato do cliente é atualizado por registerContact (src/lib/db-actions.ts).

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
- Cartão por operação (tipo) com botões neutros de prontos/risco/protocolados; cada botão abre um painel lateral rolável com a lista rápida e links dos clientes correspondentes. O cartão mantém o atalho para a fila completa da Operação.

## Operação (/dashboard/operacao) — tela central
- Seletor de operação (chips com contagem): operações não selecionadas têm borda e marcador neutros; somente a selecionada recebe cor e fundo fosco padronizado. Botões com os nomes das classificações + "sem classificação" são clicáveis (filtram), usando fundo discreto quando selecionados.
- **Prontidão é MANUAL**: o nome na linha é um seletor (Redondo/Protocolável/Alto risco/Não protocolar/Protocolado ou nenhuma) gravado internamente em caseFiles.grade — nenhum cálculo automático. A primeira definição de prontidão ou prioridade é direta; alterações posteriores exigem confirmação com o nome do cliente, valor atual e novo valor.
- Administrador vê **Editar operação**, que abre diretamente o construtor da operação selecionada.
- Busca por código, nome, CPF (com/sem pontuação) e telefone; ao lado, **Personalizar pendências** permite que cada usuário escolha quais filtros de pendência aparecem na listagem, com a seleção salva em seu perfil por operação. Os links de filtro ficam recolhidos por padrão e só aparecem ao clicar em **Exibir filtros**; o botão informa quando há um filtro ativo.
- **Filtros como links de texto pequenos** com contagem entre parênteses: precisa ligar, sem contato 7+ dias, sem telefone, sem código, sem prontidão + **um filtro "falta X" para CADA item ativo do checklist** (tudo é filtro). Não existe seletor separado de ordenação; a classificação continua disponível pelos títulos das colunas.
- Tabela sempre em **linhas baixas**, com separadores verticais finos e conteúdo contido/truncado dentro das colunas (sem botão de alternância): cabeçalhos clicáveis para ordenar; código, nome (abre painel lateral), telefone com um único menu kebab vertical para ligar/abrir WhatsApp/adicionar outro número, prontidão (seletor manual), pendências (itens não-OK), prioridade **editável na linha**, último contato com menu kebab vertical para ver o atendimento completo, cadastrar novo atendimento ou cadastrar nova anotação, próxima ação editável. **Último contato** significa a data do `Atendimento` ativo mais recente, usando o resumo legado do cliente apenas como fallback.
- Seleção múltipla → lote: prioridade, adicionar/remover tipo, criar tarefas, exportar seleção.
- Ordenação pelos cabeçalhos (urgência/pendências/contato/nome/código), exportar Excel.
- Painel lateral (drawer): prontidão manual no topo; por padrão exibe todos os itens e oferece **Somente pendentes** para ocultar temporariamente OK/Não se aplica; checklist em 3 estados de 1 clique com contraste reforçado (Pendente vermelho, Não se aplica cinza marcado e OK verde) + observação por item; pendências (todo item não-OK) com "criar tarefa" e lista expansível com "ver mais"/"ver menos"; campos do caso; histórico de contatos; mensagens padrão (copiar/WhatsApp).

## Clientes (/dashboard/clients)
- Lista compacta com separadores verticais finos, conteúdo contido nas células e cabeçalhos clicáveis para ordenar: código em destaque (sem quebra de linha), CPF/CNPJ, telefone, tipos e último contato alinhados à direita; telefone com botão `+` para acrescentar outro número; tipos em chips com lápis para editar as operações vinculadas; **Próxima ação antes de Último contato**; menu kebab vertical após o último contato para ver o registro completo do atendimento mais recente, cadastrar novo atendimento ou cadastrar nova anotação; busca normalizada (código/nome/CPF/telefone) e filtro por tipo. A data e a ordenação de **Último contato** vêm do `Atendimento` ativo mais recente, com fallback para o resumo legado do cliente. Não existe status geral nem responsável interno do cliente.
- **Clientes aninhados**: qualquer cliente principal pode vincular outros clientes e o mesmo aninhado pode pertencer a vários principais; cada vínculo recebe uma descrição livre obrigatória (ex.: filho, cônjuge, sócio), editada somente no principal e exibida também na ficha do aninhado e nas linhas expandidas. Nas listas de Clientes e Operação, `+`/`−` à esquerda do nome expande/recolhe os aninhados em linhas recuadas, com fundo bege discreto e o código do principal; o aninhado não aparece novamente como linha principal.
- Um cliente aninhado herda as operações de todos os seus principais. Todo link para sua ficha no painel abre antes um aviso, permitindo escolher a ficha de qualquer principal ou a ficha do próprio vinculado.
- Barra de ações: **Novo cliente à esquerda; Importar (IA) e Exportar à direita**.
- **Importar com IA**: caixa para colar texto/tabela (direto do Excel) → IA organiza em tabela
  de clientes × campos → casa com existentes por código → CPF → nome → **conflitos em vermelho
  com escolha por célula (valor novo × valor atual)** → ação por linha (criar/atualizar/pular)
  → "Inserir dados" grava tudo em lote. Link para a importação por arquivo (sem IA).
- **Importação temporária Barão de Mauá (administrador)**: botão especial na lista de Clientes recebe CSV/XLS/XLSX da planilha manual; aceita UTF-8 ou Windows-1252 e usa IA somente para mapear cada cabeçalho aos campos cadastrais, itens de checklist e campos atuais da operação. A prévia editável, sem rolagem horizontal, mostra destino por linha, cadastro, dados operacionais e coluna **Rever**. Código/CPF/nome são cruzados contra toda a base; nomes semelhantes, identificadores que apontam para clientes diferentes e cadastros ocultados bloqueiam importação automática. Todo conflito começa desmarcado e só substitui valor existente com check explícito; a gravação sempre acrescenta Barão de Mauá sem remover tipos ou outros dados. Linhas/campos desmarcados ou sem destino seguro geram ao final um CSV UTF-8 para entrada manual.
- **Novo/editar** ([id]/edit, new): no novo cliente, Gestão operacional é o primeiro card; tipos não selecionados são neutros e somente os selecionados recebem o fundo fosco padronizado em todo o sistema (`Pré-cliente` amarelo e `Arquivado` cinza mais escuro). No primeiro cadastro a seleção é direta; ao editar cliente existente, adicionar ou remover cada tipo exige confirmação. Código validado + único (mudança pede confirmação) e botão de geração automática (`N9999` para Barão de Mauá/pré-cliente e `A9999` para cliente antigo); código repetido só é aceito entre clientes diretamente aninhados; CPF/CNPJ com dígito verificador + dedupe com/sem pontuação; aviso de nome repetido; **vários telefones, e-mails e endereços com escolha do principal**; WhatsApp; **dados pessoais complementares (RG, órgão emissor, nome da mãe, nacionalidade, profissão, estado civil)**; tipos (multi), prioridade, origem, próxima ação e observações.
- **Ver apagados**: administradores veem um controle discreto com ícone e quantidade em Clientes e em toda listagem/editor que permite soft delete; registros podem ser auditados e restaurados.
- **Preencher com IA**: cola texto solto → preenche o cadastro (src/lib/ai.ts, Firebase AI Logic).
- **Ficha ([id])**: cabeçalho com telefone/ligar/WhatsApp/registrar atendimento/editar, sem ação de exclusão; **Mover para lixeira** aparece exclusivamente na página Editar cliente, com confirmação, e
  **caixas editáveis no próprio card: Próxima ação e Anotações (salvam ao sair do campo)**; card de vínculos permite buscar/vincular/desvincular clientes, criar e vincular um cliente por cadastro rápido (nome, CPF/CNPJ e telefone) e mostra, sem edição, todos os principais em **Aninhado a**.
  Abas nesta ordem: **Andamentos | Dados do cliente | Vínculos entre clientes | Processos | Tarefas pendentes | (tipos do cliente por último)**:
  - Andamentos: visão geral completa, incluindo tarefas pendentes e concluídas; anotação rápida, **resumir com IA**, **editar/excluir registro (autor ou admin)**. Cards exibem dados básicos por tipo: Atendimento (canal/resultado/texto/autor/data), Anotação (texto/autor/data), Andamento Processual (texto/processo/autor/data) e Tarefa (descrição clicável para acompanhamento, status, responsável, prioridade, prazo, conclusão, processos, autor/data);
  - Dados do cliente: todos os campos do cadastro que não aparecem no card superior, incluindo dados pessoais, origem, contatos e endereços adicionais e metadados de auditoria, mais **card Mensagem padrão** (modelos com variáveis, copiar/WhatsApp);
  - Vínculos entre clientes: quando não há vínculos, o card mostra somente **Vincular**; o botão abre uma busca em modal e cada resultado oferece **Vincular** (o cliente escolhido fica abaixo do cliente aberto) ou **Tornar principal** (o escolhido fica acima do cliente aberto). Antes de gravar, outro modal pergunta, usando os dois nomes, o que o cliente de baixo é do principal; essa informação obrigatória fica sempre junto do cliente inferior. O card exibe primeiro os principais e depois os clientes aninhados, além de cadastro rápido e desvinculação sem apagar cadastro;
  - Processos: lista vinculados, criar processo já vinculado, vincular existente pela busca;
  - Tarefas pendentes: mostra somente tarefas não concluídas, com links para acompanhamento, processos vinculados e ação de nova tarefa;
  - Uma aba por tipo do cliente (gestão operacional): prontidão, campos do caso, checklist.

## Processos (/dashboard/processes)
- Lista com separadores verticais finos: número em coluna ampliada (link para a página e truncamento com `...` quando ainda não couber), clientes, tipo de ação em coluna mais estreita, parte contrária, polo e status; filtros por status; busca por número/cliente/parte contrária/tipo.
- **Formulário completo (novo/editar)**: número, status, **vários clientes com principal (estrela)** — nunca sobrescrever a lista de vínculos —, **polo ativo/passivo, parte contrária**, tipo de ação/classe/assunto/foro/vara/juiz **com sugestões dos valores já usados**, instância, observações; **Preencher com IA** (capa do processo).
- **Página do processo ([id])**: dados completos, clientes vinculados (principal com estrela), editar, lixeira/restaurar, **registrar andamento processual**, linha do tempo (por vínculo e por número), editar/excluir andamento, **resumir com IA**.

## Andamentos (/dashboard/updates)
- Linha do tempo geral (500 recentes) com filtro por tipo e busca (cliente/código/texto/autor/nº processo).
- **Novo andamento**: anotação / atendimento (canal opcional + registro obrigatório, atualiza último contato) / andamento processual (com processo do cliente), com busca de cliente.
- **Editar/excluir** registro (autor ou admin; exclusão = lixeira).

## Tarefas (/dashboard/tasks)
- Filtros: **Minhas** (responsável = eu ou "Todos") / **Equipe**; por responsável; mostrar concluídas; busca por tarefa/cliente/processo/autor; **Lixeira** (operador vê o que ele ocultou; administrador audita todos; restauração sempre disponível).
- Criar tarefa em diálogo; **editar em painel lateral rolável**: descrição, responsáveis em seleção múltipla (**inclui "Todos"**), prioridade, prazo; vínculo opcional com processo; vínculo com nenhum, um ou **vários clientes** (uma tarefa criada para cada cliente marcado, inclusive diretamente pela tela Tarefas; também aceita lote pela Operação).
- Clicar no título abre a **ficha de acompanhamento da tarefa ([id])**: detalhes, links para cliente/processo, responsável, prioridade, prazo, autor, última alteração, marcos de criação/conclusão/ocultação, concluir/reabrir, editar no painel lateral, mover para lixeira e restaurar.
- Concluir/reabrir em 1 clique; status **Vencida** automático por prazo.
- **Seleção múltipla → editar em lote** (responsáveis com múltipla escolha/prioridade/prazo/status com "manter como está") e excluir em lote.
- A fila exibe autor/data de criação e uma coluna de vínculos: números dos processos quando houver processo vinculado; caso contrário, nomes dos clientes. Aceita listas com vários vínculos, sempre com links para as páginas correspondentes e sem depender de código interno; ações de excluir/restaurar pedem confirmação.
- Ordenação clicável por prazo, prioridade, responsável e status.

## Grupos de clientes (/dashboard/groups)
- Grupos são listas organizacionais livres e **não alteram** cadastro, operação, aninhamento ou vínculos de processo; um cliente pode participar de vários grupos.
- Listagem em tempo real com separadores verticais finos, busca por grupo/cliente/observação, quantidade e nomes de membros, autor/data e acesso à edição.
- Criar/editar: nome, observações e seleção pesquisável de qualquer quantidade de clientes; `clientIds[]` e `clientNames[]` são gravados juntos e na mesma ordem.
- Página do grupo mostra os membros, telefone principal e processos atuais de cada cliente, com links para as fichas.
- Soft delete com lixeira: operador vê/restaura os grupos que ele ocultou e administrador audita todos. Ocultar grupo nunca exclui clientes e não existe exclusão definitiva.

## Relatórios (/dashboard/reports)
- Clientes por tipo (barras); prontidão A–P do tipo selecionado; "o que mais falta" por item.
- Exportações: lista para ligação, prontos (A), alto risco (C/D), todos do tipo.
- Produtividade 30 dias por usuário (contatos + tarefas concluídas).

## Administração
- **Possíveis duplicatas (settings/duplicates)**: ferramenta exclusiva do administrador que compara clientes ativos por CPF/CNPJ normalizado, código repetido fora de aninhamento, nome idêntico e nome muito semelhante (erro de letra ou nome intermediário ausente). Cada suspeita pode ser marcada como **Não é duplicata** ou unificada escolhendo qual cadastro permanece. O item do menu lateral só aparece enquanto existir ao menos uma suspeita não resolvida.
- **Unificação de clientes**: copia para o sobrevivente somente dados escalares ausentes e agrega sem repetir telefones, e-mails, endereços, operações, processos e aninhados; redireciona andamentos/tarefas, processos, grupos, fichas operacionais e vínculos entre clientes. O cadastro de origem não é apagado nem esvaziado: recebe soft delete e metadados de destino/data/autor para auditoria.
- **Editor de operações (settings/types — via botão Editar operação na tela Operação; fora do menu lateral)**: tudo em **uma coluna de cards** (um por operação, expande para editar); nome/cor/descrição; **checklist com pastas**: criar/renomear/apagar pasta (apagar devolve os itens à raiz), **arrastar itens entre pastas/para reordenar e arrastar pastas para reordenar**; itens têm somente nome (sem obrigatório/bloqueia/pendência/filtro/chave — tudo é filtro e pendência, nada bloqueia; prontidão é manual); campos do caso (texto/texto longo/lista/data); **Instalar padrões** (Barão de Mauá completo, GSI, mensagens) sem sobrescrever; arquivar/restaurar e reordenar operações.
- Operações, grupos, itens e campos usam **soft delete** com opção administrativa de ver/restaurar ocultos; não há exclusão definitiva no editor.
- Edições incompatíveis de itens/campos criam um novo padrão e preservam a definição anterior nas fichas já existentes. A ficha mostra o padrão novo junto dos itens/campos antigos até que qualquer usuário os oculte; ocultar não apaga estados, observações ou valores, e administradores podem visualizar/restaurar os ocultos.
- **Mensagens padrão (settings/templates)**: criar/editar/ocultar/restaurar com variáveis {{nome}}, {{primeiro_nome}}, {{codigo}} e {{pendencias}}.
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
- Códigos de clientes são únicos inclusive contra a lixeira; a única exceção é um par diretamente vinculado como principal/aninhado. Importações bloqueiam reutilização de código ou CPF pertencente a cadastro ocultado.
- Aninhamento de clientes é muitos-para-muitos por `clients.nestedClientIds[]`; a descrição livre fica em `clients.nestedClientRelationships[nestedClientId]`. Ambos ficam somente no principal, pode haver vários principais para o mesmo aninhado e a interface impede auto vínculo e ciclos.
- Exclusões são sempre ocultação auditável (`deleted=true`, `deletedAt`, `deletedBy`) com restauração. Hard delete é proibido para todos, inclusive administradores, e bloqueado nas Firestore Rules.
- Definições embutidas de operação (grupos, itens e campos) nunca são removidas do documento: recebem marca de ocultação e permanecem disponíveis para compatibilidade histórica.
- `clientIds` e `clientNames` de processos andam JUNTOS e na mesma ordem.
- Deletados (deleted=true) nunca aparecem em listas/relatórios comuns.
- Prontidão A/B/C/D/P: **manual** (caseFiles.grade), definida pela equipe na Operação/ficha — nunca calculada.
- Checklist: 3 estados (Não verificado / Pendente / OK); OK gravado como `conferido`; legados só convertidos na exibição.
- Último contato é a data do `Atendimento` ativo mais recente; `registerContact` também mantém o resumo em `clients.lastContactAt` para compatibilidade e consultas rápidas.

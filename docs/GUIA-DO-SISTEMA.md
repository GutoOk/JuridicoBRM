# JurídicoBRM — Guia do sistema

Sistema de gestão operacional de clientes jurídicos: cadastro único, tipos de cliente
(operações), checklists editáveis, pendências automáticas, registro de atendimento e
painel de operação para trabalhar dezenas/centenas de clientes.

## Primeiros passos (uma única vez)

1. **Ativar o login por e-mail/senha no Firebase** (obrigatório):
   - Abra [console.firebase.google.com](https://console.firebase.google.com) → projeto **baro-de-mau**
   - Menu **Authentication** → **Sign-in method** → habilite **E-mail/senha**.
2. **Criar sua conta de administrador**:
   - Ainda em Authentication → **Users** → **Add user** → e-mail `okjuridico@gmail.com` + senha.
   - Essa mesma conta também pode entrar pelo Google; nesse caso habilite o provedor Google em **Sign-in method** e use exatamente `okjuridico@gmail.com`.
   - Este e-mail é o administrador "de fábrica" — ao entrar no sistema o perfil é criado sozinho.
3. **Publicar as regras de segurança**:
   - No terminal do projeto: `npx firebase-tools deploy --only firestore:rules`
   - (ou copie o conteúdo de `firestore.rules` no console → Firestore → Regras → Publicar).
4. **Entrar no sistema** com o e-mail e senha criados ou com o Google.
5. **Instalar os padrões**: menu **Editor de operações** → botão **“Instalar padrões”**.
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

## Financeiro

O item **Financeiro** fica no menu depois de **Processos** e antes de **Relatórios**.
Essa tela reúne os acordos de todos os clientes e mostra valor devido, recebido, saldo
pendente, parcelas vencidas e próximos vencimentos. Use a busca para localizar um
cliente e abra a ficha dele para lançar ou conferir os detalhes.

Na ficha do cliente, **Financeiro** é a última aba. Clique em **Novo valor devido** e escolha:

- **0,5 salário mínimo**, **1 salário mínimo**, **1,5 salário mínimo** ou **Valor personalizado**;
- pagamento **No ato**, **Parcelado**, **No fim do processo** ou **Outro**;
- no parcelado, a quantidade e a data de cada parcela;
- em Outro, a descrição livre e o cronograma combinado.

**No fim do processo** não exige data: o acordo continua pendente até o pagamento e não
é classificado como vencido por prazo. As demais parcelas com data passada e saldo em
aberto aparecem como inadimplentes. A tela mantém sempre visível o saldo ainda pendente.

Um pagamento parcial reduz o saldo da parcela escolhida e leva o restante para a última
parcela pendente. Se o pagamento parcial for na própria última parcela, o saldo continua
nela até a quitação.

Nos acordos baseados em salário mínimo, o sistema preserva o fator contratado. Ao quitar
a última parcela, compara a referência inicial com o salário mínimo vigente na data real
do pagamento e coloca eventual acréscimo na última parcela pendente; um valor posterior
menor nunca reduz o acordo. Parcelas já pagas não mudam. Não há juros, multa ou qualquer
outra correção para atraso, e valores personalizados permanecem pelo valor nominal.

Para registrar um recebimento, informe data, valor, observação opcional e uma das formas:
**Espécie**, **Pix**, **Depósito/transferência**, **Maquininha** ou **Outro**. A conta é
obrigatória para todas as formas, exceto Espécie. Escolha uma conta cadastrada ou escreva
uma conta apenas para aquele lançamento. Confira o resumo e confirme o registro.

Cada recebimento aparece também na aba **Andamentos**, com valor pago, data e forma de
recebimento. É o mesmo registro, portanto excluir ou restaurar no Financeiro também se
reflete nos Andamentos. Para corrigir um lançamento errado, exclua-o e registre o
pagamento correto.

Administradores encontram, na tela Financeiro, o cadastro do histórico de salários
mínimos (valor e início da vigência, inclusive futuras) e das contas de recebimento.
Somente administradores veem os itens excluídos e podem restaurá-los. Toda exclusão pede
confirmação. Um acordo que já tenha recebimento ativo só pode ser excluído depois que
esses recebimentos forem excluídos.

## Tarefas (recursos completos)

- **Minhas / Equipe**: por padrão você vê só as suas (e as marcadas para "Todos").
- A busca encontra descrição, cliente, código, processo, autor ou responsável.
- Criar/editar com responsável (pessoa ou **Todos**), prioridade, prazo e processo opcional;
  tarefas com prazo passado aparecem como **Vencida**.
- Na nova tarefa, marque vários clientes para criar uma tarefa igual para cada um, ou
  deixe todos desmarcados para criar uma tarefa geral.
- Clique no texto da tarefa para abrir o **acompanhamento**, com dados completos,
  cliente, processo e marcos registrados. O botão **Editar** abre um painel lateral
  com barra de rolagem, sem esconder os campos em telas menores.
- Na coluna **Vínculos**, tarefas de processo mostram o número do processo; as demais
  mostram o nome do cliente. Quando houver vários vínculos, eles aparecem em lista e
  cada nome ou número abre sua página correspondente.
- **Seleção múltipla** → editar em lote (responsável/prioridade/prazo/status) ou excluir.
- **Lixeira**: restaure tarefas ocultadas. Nada pode ser apagado definitivamente.

## Grupos de clientes

Menu **Grupos** → **Novo grupo**. Dê um nome, escreva uma observação opcional e marque
os clientes desejados. Use grupos para organizar uma lista temporária de trabalho,
clientes com alguma semelhança ou qualquer recorte que ajude a equipe.

Um cliente pode estar em vários grupos. O grupo não muda processos, operações nem o
aninhamento familiar do cadastro. Na página do grupo aparecem o telefone e os processos
de cada membro. O lápis abre a edição; a lixeira remove apenas o grupo, nunca os clientes.

## Como criar usuários (funcionários)

Menu **Usuários** (só administrador) → **Novo usuário** → nome, e-mail, senha inicial
e papel (Operador ou Administrador). O funcionário entra com esse e-mail/senha.
- **Desativar**: botão na linha do usuário — bloqueia o acesso na hora (inclusive no servidor).
- **Trocar senha**: botão de chave envia e-mail de redefinição.
- **Contas do sistema antigo** (senha sem criptografia) aparecem num quadro amarelo — remova-as.

## Como cadastrar cliente com código interno

Menu **Clientes** → **Novo cliente**. Comece pelo card **Gestão operacional**. O campo
**Código** aceita 1 letra + 4 números e o botão ao lado gera o próximo código livre:
`N9999` para Barão de Mauá/pré-cliente e `A9999` para cliente antigo. O sistema
converte para maiúsculo e **bloqueia duplicidade**, inclusive de cadastros ocultados. CPF/CNPJ é validado
(dígitos verificadores) e deduplicado mesmo com pontuação diferente. Alterar o código de
um cliente existente pede confirmação.

O código não pode ser repetido, inclusive se o outro cadastro estiver apagado. A exceção
é quando os dois clientes estão diretamente vinculados como principal e aninhado.
Para mover um cliente para a lixeira, abra sua ficha, clique em **Editar** e use **Excluir cliente**
no cabeçalho da página de edição. A ficha de visualização não exibe essa ação.

## Como usar Ferramentas

O menu **Administração → Ferramentas** aparece somente para Áttila (`okjuridico@gmail.com`). Ele reúne importação com IA, importação de planilha, importação temporária de Barão de Mauá, possíveis duplicatas e cards separados para CPF/CNPJ, telefones e nomes em maiúsculas.

Em **Revisar CPF/CNPJ**, máscaras que podem ser corrigidas com segurança já aparecem marcadas. CPF/CNPJ que não passa no teste dos dígitos verificadores fica desmarcado: edite a sugestão e somente marque depois que ela for validada.

Em **Revisar telefones**, números com quantidade segura recebem máscara e começam marcados. Campos que podem conter mais de um telefone ou têm quantidade duvidosa ficam desmarcados. É possível corrigir o campo ali ou abrir o cadastro para separar/adicionar telefones antes do lote.

Em **Nomes em maiúsculas**, confira a prévia e confirme o lote. O sistema atualiza o nome do cliente e também as cópias usadas em processos, grupos, tarefas e andamentos para não deixar grafias diferentes.

## Como resolver possíveis clientes duplicados

Em **Administração → Ferramentas → Possíveis duplicatas**, o sistema procura automaticamente:
- mesmo CPF/CNPJ, com ou sem pontos, barras e traços;
- mesmo código fora de um vínculo de aninhamento;
- mesmo nome ou nome muito semelhante, inclusive quando falta nome intermediário ou há uma letra errada.

Em cada comparação, marque o cadastro que deve permanecer. Use **Não é duplicata** para
encerrar um falso positivo ou **Unificar no selecionado** para transferir os vínculos. A unificação
leva processos, andamentos, tarefas, grupos, fichas operacionais, telefones, e-mails, endereços
e aninhamentos. O outro cadastro permanece intacto na lixeira, com indicação do destino.

Nas telas que permitem ocultar registros, administradores encontram **Ver apagados (quantidade)**
para auditar e restaurar o conteúdo.

## Como vincular clientes da mesma família ou processo

Abra a ficha de qualquer um dos clientes e entre na aba **Vínculos entre clientes**:
- Clique em **Vincular** para abrir a busca por nome, código ou CPF. A busca não fica aberta no card.
- Em cada pessoa encontrada, use **Vincular** para colocá-la abaixo do cliente aberto ou **Tornar principal** para colocá-la acima.
- Confirme o que o cliente de baixo é do principal (filho, cônjuge, sócio ou qualquer texto). O modal mostra os dois nomes para deixar o sentido claro.
- Se a pessoa ainda não existe, use **Novo cliente para vincular** e informe nome, CPF/CNPJ e telefone. Complete o restante do cadastro depois.
- A descrição fica sempre junto do cliente de baixo e pode ser alterada na ficha do principal; ela salva ao sair do campo.
- Use o botão de desvincular ao lado do nome para remover apenas o vínculo; nenhum cadastro é apagado.
- O mesmo cliente pode ser aninhado a mais de um principal.
- Em **Aninhado a**, a ficha mostra os principais aos quais a pessoa está vinculada. Essa lista é somente informativa; a alteração é feita na ficha de cada principal.

O cliente aninhado acompanha automaticamente a operação do principal. Ao clicar nele em
qualquer link do painel, escolha no aviso se deseja abrir a ficha do principal ou a ficha do vinculado.

Na ficha, a aba **Dados do cliente** mostra os dados do cadastro que não estão no resumo superior.
A aba **Andamentos** é a visão geral e mantém também as tarefas concluídas.
Cada tarefa mostra status, responsável, prioridade, prazo e processo; clique na descrição
para abrir o acompanhamento. A aba **Tarefas pendentes** é a fila de ação e mostra somente
o que ainda não foi concluído.

No cabeçalho da ficha, clique em **Próxima ação** ou **Informações gerais** para abrir
um formulário vazio. Ao salvar Informações gerais, o sistema mantém o texto atual no
resumo e cria uma Anotação nos Andamentos. Ao salvar Próxima ação, o resumo é atualizado
e uma Tarefa pendente para **Todos** é criada. Os textos anteriores permanecem no histórico.

Nas listas **Clientes** e **Operação**, o botão `+` à esquerda do nome abre os
aninhados em linhas recuadas e com fundo bege; o botão `−` recolhe. A linha aninhada
usa o código e a operação do principal.

## Como usar a tela Operação (o painel de guerra)

Menu **Operação**:
1. Escolha o tipo no topo (ex.: **Barão de Mauá**).
2. Os cartões **Redondo**, **Protocolável c/ pendência**, **Alto risco**, **Não protocolar**, **Protocolado** e **sem classificação** filtram a prontidão manual. O selecionado fica em azul-marinho fosco.
3. Clique em **Exibir filtros** para abrir os filtros rápidos. **Personalizar pendências** escolhe quais itens aparecem para seu usuário.
4. Busca por código, nome, CPF ou telefone (com ou sem pontuação).
5. Na tabela: a **prioridade** é editável direto na linha; clicar na **próxima ação** abre um modal vazio com Cancelar/Salvar e cria uma Tarefa para **Todos**. O menu kebab vertical do telefone reúne **Ligar**, **WhatsApp** e **Adicionar telefone**; o menu ao lado do último atendimento permite ver o registro, cadastrar atendimento ou anotação.
6. Clique no **nome** para abrir o painel lateral com: **Checklist** (marca status sem sair
   da tela + observação em modal vazio que também gera Anotação no histórico + lista de pendências com botão “criar tarefa”), **Caso** (bloco/lote, nº do
   processo etc.), **Contatos** (histórico) e **Mensagem** (modelos prontos).
7. Selecione várias linhas para **ações em lote**: prioridade,
   adicionar/remover tipo, criar tarefas e exportar Excel.
8. Ordene clicando nos títulos das colunas. As linhas são compactas e textos longos não invadem a coluna seguinte.

## Como editar operações e checklists (sem programar)

Na tela **Operação**, administradores podem clicar em **Editar operação**. O mesmo
construtor fica no menu **Editor de operações** (admin):
- Criar, editar, ocultar, restaurar e reordenar operações, com cor e descrição.
- A aba **Grupos** organiza os blocos de perguntas. Ocultar um grupo também oculta seus
  itens do padrão, mas não apaga respostas que já existam.
- Cada **item do checklist** tem nome, descrição, grupo, exigência
  (obrigatório/recomendado/opcional), respostas permitidas no seletor, **Bloqueia**
  (trava o protocolo), **Pendência** (gera pendência automática), **Filtro** (vira botão
  na Operação), **Chave** e ativo.
- A **Chave** liga o item às regras de prontidão. Chaves reconhecidas:
  `procuracao`, `contrato`, `termo_resp`, `ultimo_adq`, `ultimo_adq_prova`, `extrato`,
  `boletos`, `pagamentos_suficientes`, `planilha`, `minuta_revisada`, `protocolado`,
  `jg_pedir`, `jg_completa`, `telefone`. As regras em si ficam em `src/lib/readiness.ts`.
- Aba **Campos do caso**: texto, texto longo, lista ou data, com texto de ajuda,
  obrigatoriedade, exemplo e largura — ex.: bloco/lote.
- **Ver ocultas** mostra operações, grupos, itens e campos aposentados para consulta ou
  restauração. O editor não oferece exclusão definitiva.

Quando um administrador muda nome, exigência, respostas, tipo ou opções de uma
definição, o sistema cria o padrão novo sem reescrever as fichas existentes. Essas
fichas passam a mostrar o checklist/campos atuais e uma seção de **itens antigos**.
Qualquer usuário pode ocultar um item antigo; respostas, observações e valores continuam
guardados. Administradores podem usar **Ver ocultos** na ficha para restaurar a exibição.

## Como registrar atendimento

Em qualquer lugar (Operação, ficha ou lista de clientes): botão **Registrar atendimento**
abre um painel lateral. O canal e a próxima ação são opcionais; o **Registro do atendimento**
é obrigatório. Os textos rápidos apenas preenchem esse registro e podem ser personalizados
por cada usuário no próprio painel. O último contato do cliente atualiza na hora para todos.
Quando houver Próxima ação, ela também cria uma Tarefa pendente para **Todos**.

## Como ver pendências

- **Por cliente**: painel lateral (Operação) ou ficha → quadro amarelo com as pendências
  geradas pelo checklist (+ sem telefone/sem código). Botão **criar tarefa** transforma
  a pendência em tarefa com responsável e prazo.
- **Em massa**: filtros "Falta …" na Operação mostram quem está faltando cada item;
  Relatórios mostra o ranking "O que mais falta".

## Como importar dados em lote

### Importação temporária de Barão de Mauá

Em **Administração → Ferramentas → Barão de Mauá**, Áttila pode selecionar a planilha manual em CSV ou Excel. A IA compara os cabeçalhos com os itens e campos atualmente configurados na operação, mas não cria nem completa valores.

Na revisão, confira o destino de cada linha e os checks de cada campo. Conflitos aparecem destacados e começam desmarcados; só marque quando quiser substituir o valor existente. Dados na coluna **Rever** podem ser marcados para entrar nas observações ou deixados desmarcados. Ao concluir, tudo que não foi importado é reunido automaticamente em um CSV de revisão manual.

**Jeito rápido (com IA)** — **Ferramentas → Importar com IA**:
1. Copie as linhas da sua planilha (ou qualquer lista/texto) e cole na caixa.
2. Clique em **Analisar com IA**: ela identifica os clientes e monta uma tabela.
3. Linhas são casadas com o cadastro por código → CPF → nome. **Células vermelhas**
   são conflitos: clique nelas para alternar entre o valor novo (colado) e o atual.
4. Ajuste a ação de cada linha (criar/atualizar/pular) e clique em **Inserir dados** —
   tudo é gravado de uma vez.

**Jeito clássico (sem IA)** — **Ferramentas → Importar planilha**: suba o Excel/CSV → mapeie as
colunas → escolha tipos a atribuir e se atualiza existentes → prévia → Importar.

## Como exportar

- **Operação**: botão Exportar (lista filtrada ou seleção) — Excel.
- **Clientes**: botão Exportar.
- **Relatórios**: lista para ligação, prontos para protocolo, alto risco, todos do tipo.

## Segurança (como ficou)

- Login por **Firebase Authentication** (e-mail/senha, senha criptografada pelo Google).
- Permissões verificadas **no servidor** pelas **Firestore Security Rules**: só usuário
  autenticado **e ativo** lê/escreve; tipos, checklists, mensagens, usuários, salários
  mínimos e contas de recebimento só admin.
- `localStorage` não é mais fonte de permissão; usuário desativado perde acesso
  imediatamente (a regra confere o perfil a cada operação).
- Não existe exclusão definitiva: toda remoção de registro usa lixeira/soft delete,
  mantém autor e data da ocultação e pode ser restaurada.

## Estrutura de dados (Firestore)

| Coleção | Conteúdo |
| --- | --- |
| `clients` | Cadastro único (código, CPF normalizado, contato, tipos, prioridade…) |
| `clientTypes` | Tipos/operações com checklist e campos do caso embutidos |
| `caseFiles` | Ficha operacional por cliente×tipo (`{clientId}_{typeId}`): status dos itens + campos |
| `updates` | Contatos, anotações, tarefas, andamentos processuais e recebimentos Financeiros canônicos |
| `financialAgreements` | Valores devidos e forma de pagamento de cada cliente |
| `financialInstallments` | Parcelas, vencimentos, saldo e vínculo com os recebimentos |
| `minimumWages` | Histórico de valores e vigências do salário mínimo |
| `receivingAccounts` | Contas de recebimento mantidas por administradores |
| `messageTemplates` | Mensagens padrão |
| `users` | Perfis de acesso (uid do Firebase Auth) |
| `processes`, `clientGroups` | Legado preservado |

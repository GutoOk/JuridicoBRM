# JurídicoBRM — instruções para IAs programadoras (Claude, Codex, Gemini…)

Sistema de gestão operacional de clientes jurídicos de um escritório real
(operação Barão de Mauá e outras). Next.js 15 (App Router) + Firebase
(Auth, Firestore, AI Logic) + shadcn/ui + Tailwind. Tudo em português do Brasil.

## Regra número 1: não perder funcionalidades

Antes de mexer em qualquer tela, consulte **docs/FUNCIONALIDADES.md** — é o contrato
do que cada tela faz. Em correção pequena e localizada, leia a seção da tela e as
regras transversais; leia o documento inteiro em tela nova ou refatoração ampla.
Refatoração (visual ou de código) NUNCA pode remover item listado lá. Ao criar
funcionalidade, atualize o contrato no mesmo commit.
A pasta `JuridicoBRM-antigo/` é só referência histórica (excluída de build/lint/git)
— não importe código dela, mas consulte-a em caso de dúvida sobre comportamento antigo.

## Comandos

```bash
npm run dev        # dev server na porta 9002
npm run typecheck  # tsc --noEmit — deve passar limpo
npm run lint       # next lint — deve passar sem avisos
npm run build      # next build — deve concluir
```
Durante a iteração, rode apenas a verificação específica da área alterada. Rode os
três checks completos uma única vez antes de encerrar qualquer alteração.

## Economia de contexto e créditos

- Correções pontuais ficam no agente principal por padrão. Use subagente somente
  para frentes realmente independentes e com benefício concreto de paralelização.
- Ao delegar, envie contexto mínimo e autocontido (`fork_turns: "none"` sempre que
  possível); não replique o histórico completo, skills ou documentos já analisados.
- Reproduza primeiro o caso exato relatado e crie o menor teste regressivo capaz de
  falhar antes de ampliar a solução.
- Prefira o menor patch que resolva a causa comprovada. Não transforme uma correção
  localizada em refatoração de arquitetura sem necessidade técnica demonstrada ou
  autorização do usuário.
- Durante a correção, rode somente testes focados. Auditoria ampla, suíte completa,
  typecheck, lint e build ficam para uma única validação final.
- Em Firestore Rules, estabilize primeiro o teste alvo; faça a auditoria de segurança
  e a suíte completa apenas sobre a versão candidata final, sem auditorias duplicadas.
- Se duas tentativas não resolverem o mesmo erro, pare e reavalie a hipótese antes de
  repetir comandos, testes ou agentes.
- Avise o usuário antes de iniciar uma atividade com potencial de consumo elevado de
  contexto, créditos, tempo ou serviços externos.
- Nunca instale dependências, runtimes ou ferramentas sem parar e pedir ao usuário.
  Sempre que houver uma ação concreta que o usuário possa executar para destravar ou
  simplificar o trabalho, pause e peça essa ajuda antes de buscar outra alternativa.

## Arquitetura (decisões tomadas — não reverter sem pedido explícito)

- **Sem Server Actions e sem backend próprio.** Todo acesso a dados é feito no
  navegador com o SDK cliente do Firestore (`onSnapshot`, tempo real, cache
  persistente). A segurança REAL está nas **Firestore Security Rules**
  (`firestore.rules`): papéis admin/operator no doc `users/{uid}`, usuário
  inativo bloqueado no servidor. O único admin bootstrap é
  `okjuridico@gmail.com`, com login por Google ou e-mail/senha; o endereço fica em
  `src/lib/constants.ts` e hardcoded nas rules — mudar sempre nos dois lugares.
- **IA sem Genkit**: `src/lib/ai.ts` usa Firebase AI Logic (`firebase/ai`) direto
  do cliente. Modelo definido numa constante única nesse arquivo. Não reintroduzir
  Genkit nem rotas de API para IA.
- **Coleções** (não renomear campos, não apagar campos legados):
  - `clients` — cadastro único; código `X9999` único; `cpfCnpjDigits`/`phoneDigits`
    normalizados; `typeIds[]` (etiquetas de operação); campos legados
    `phones[]/emails[]/addresses[]` preservados como fallback de exibição.
  - `clientTypes` — tipos/operações com `checklist[]` e `caseFields[]` embutidos.
  - `caseFiles` — id `{clientId}_{typeId}`; status dos itens + campos do caso.
  - `updates` — Atendimento/Anotação/Tarefa/Andamento Processual/Financeiro
    (coleção legada, compartilhada; tarefas têm status/responsible/dueDate;
    contatos têm channel/result). Recebimentos são documentos canônicos
    `type:"Financeiro"` nesta coleção, vinculados ao acordo/parcela; não criar
    cópia paralela para exibi-los nos Andamentos.
  - `processes` — **`clientIds[]` e `clientNames[]` andam juntos, na mesma ordem**;
    `mainClientId` é o principal. Nunca reduzir esses arrays ao editar.
  - `financialAgreements` — valores devidos e plano de pagamento por cliente;
    mantém agregados transacionais de valor recebido, quantidade de pagamentos,
    parcelas quitadas e último pagamento. `nextOpenSequence` e `installmentIds[]`
    existem apenas para compatibilidade e não autorizam a ordem dos recebimentos;
    `financialInstallments` — parcelas com IDs determinísticos por acordo+sequência,
    vencimentos, saldo e vínculos com recebimentos.
  - `minimumWages` — histórico de valores e vigências do salário mínimo;
    `receivingAccounts` — contas de recebimento cadastradas por administradores.
  - `messageTemplates`, `users`, `clientGroups` (legado sem tela).
- **Soft delete em tudo**: `deleted:true` + lixeira com restauração e metadados de
  auditoria. Hard delete é proibido inclusive para admin e bloqueado nas rules.
  Toda lista/relatório filtra `!deleted`.
- **Financeiro**: valor devido pode ser 0,5/1/1,5 salário mínimo ou personalizado;
  planos são no ato, parcelado, no fim do processo (sem vencimento obrigatório) ou
  outro livre. Qualquer parcela ativa pode receber antes ou depois do vencimento, com
  valor menor ou maior que o previsto dentro do saldo global; diferenças passam às
  parcelas que continuam abertas. Exclusões seguem a ordem inversa dos recebimentos e
  restaurações recompõem a cadeia na ordem permitida, sempre atualizando os agregados
  do acordo na mesma transação.
  Em acordo por salário mínimo, somente a quitação final corrige o total pelo maior
  salário entre a referência original e o vigente na data do pagamento; não existem
  juros, multa ou outra correção. Registrar recebimento e excluir sempre pedem
  confirmação; cadastrar o valor devido não. Um acordo só pode ser excluído depois
  que todos os seus recebimentos forem excluídos. Conta é obrigatória em todo
  recebimento salvo Espécie. Operadores consultam somente registros financeiros
  ativos; somente admin cadastra salários/contas e visualiza ou restaura excluídos.
  Editar acordo não pede confirmação: com recebimento ativo altera apenas descrição
  e observação; sem recebimento, a edição integral cria a nova versão e oculta
  atomicamente a anterior com suas parcelas, preservando toda a auditoria.
- **Prontidão A/B/C/D/P é MANUAL** (decisão de produto, jul/2026): a equipe
  classifica cada cliente na Operação; o valor fica em `caseFiles.grade`.
  NÃO reintroduzir cálculo automático de prontidão nem regras por `key`.
  Checklist usa 3 estados simples (Não verificado / Pendente / OK=`conferido`);
  valores antigos do banco são apenas convertidos na exibição (`displayStatus`).
  Todo item ativo não-OK é pendência e vira filtro na Operação; nada bloqueia.
  Categorias do checklist são pastas (`checklistGroups` + `groupId` no item),
  editadas com arrastar-e-soltar no Editor de operações (botão na tela Operação;
  não fica no menu lateral).
- Mutações compartilhadas em `src/lib/db-actions.ts` (registerContact atualiza o
  último contato do cliente — usar sempre ela para contatos).

## Padrão visual (preferências do dono — seguir à risca)

- Compacto e denso: fontes 12–13px, linhas de tabela baixas, pouco espaçamento.
- Cores foscas/discretas; chips suaves (`bg-*-100 text-*-800`), nunca fundo
  saturado com texto branco; negrito raríssimo; **nunca texto em MAIÚSCULAS**.
- **Nenhuma rolagem horizontal**: tabelas `table-fixed` + `truncate` + colunas
  que se ocultam (`hidden md:table-cell` etc.).
- Sistema autoexplicativo: toda ação tem tooltip (`HelpTip` de
  `src/components/shared/page-shell.tsx`) ou `title=`. Sem manuais na tela.
- Componentes de página: `PageHeader`, `Toolbar`, `SearchBox`, `FilterChip`,
  `EmptyState`, classes `page-shell`, `surface`, `work-table`, `ledger-header`
  (globals.css). Reutilizar, não inventar padrão novo.
- Skill de design do repo: `.skills/frontend-design/SKILL.md`.

## Dados do usuário

- NUNCA apagar/renomear dados ou coleções do Firestore em migrações silenciosas.
- Duplicidade: código e CPF/CNPJ são deduplicados na criação/edição/importação.
- Docs de uso para o dono do escritório: `docs/GUIA-DO-SISTEMA.md`.

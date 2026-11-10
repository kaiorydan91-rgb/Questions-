# Grafia Questions — v1.5.0

## Histórico e gerenciamento de pacotes

- Nova aba **Pacotes e histórico** dentro de Banco, com visão agrupada dos pacotes importados, busca por nome/arquivo/identificador, filtro por situação e ordenação.
- Resumo de pacotes, questões vinculadas e operações registradas.
- Visualização das questões pertencentes a cada pacote.
- Remoção do histórico sem excluir o conteúdo do banco.
- Exclusão inteligente de pacote com confirmação detalhada. O sistema preserva questões referenciadas por outros pacotes, coleções, atividades (inclusive tarefas pendentes), respostas, revisões, anotações, favoritos e aliases.
- Imagens, blobs e textos-base só são excluídos quando não houver outras questões que os referenciem.

## Tarefas de estudo

- Pacotes podem originar tarefas pendentes, ou ser resolvidos imediatamente.
- Gerador com seleção de todas as questões, sorteio por quantidade ou seleção manual paginada.
- Filtros por área, matéria, assunto/subassunto e dificuldade; opção de embaralhar a ordem.
- Seleção de vários pacotes para formar uma tarefa combinada.
- Lista de tarefas pendentes na área Atividades, com ações para resolver ou excluir sem apagar questões.
- Recomendações do desempenho também podem criar tarefas de reforço.

## Desempenho e diagnóstico

- Filtros por 7, 30, 90 dias e todo o histórico, além de filtros combinados por área, matéria e assunto/subassunto. A comparação com o período imediatamente anterior respeita os mesmos filtros.
- Precisão nas questões respondidas separada do aproveitamento total, que considera questões em branco no denominador.
- Indicadores de acertos, erros, em branco, questões únicas, atividades concluídas, duração e revisões pendentes.
- Análise por área, matéria, dificuldade, assunto principal, assuntos secundários e subassuntos.
- Avisos sobre amostras pequenas para evitar diagnósticos fortes com poucos dados.
- Gráfico de evolução e acesso ao resultado detalhado de cada atividade, incluindo diagnósticos individuais por matéria e dificuldade.
- Registro opcional do motivo de cada erro no resultado (conteúdo, interpretação, cálculo, confusão conceitual, tempo, insegurança ou outro). Esses motivos são autodeclarados e não inferidos automaticamente.
- Recomendações de estudo com criação direta de tarefas.
- Exportação para impressão/PDF pelo navegador.
- A estimativa inspirada na TRI permanece experimental e separada de qualquer nota oficial.

## Compatibilidade e segurança dos dados

- A versão 1.5.0 não altera a versão estrutural do IndexedDB; não exige apagar nem recriar o banco local.
- As novas tarefas e motivos de erro usam stores já existentes (`activities` e `answers`), que já fazem parte dos backups completos e incrementais.
- O cache offline e o identificador da aplicação foram atualizados para 1.5.0.
- Antes de excluir pacotes, é recomendável gerar um backup. A exclusão não remove questões associadas a atividades, respostas, revisões, anotações, favoritos ou aliases protegidos.

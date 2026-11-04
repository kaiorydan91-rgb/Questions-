# Grafia Questions — atualização 1.1.0

## Gerador de atividades
- Seleção múltipla de áreas de conhecimento e matérias. A combinação usa união de filtros: qualquer área ou matéria marcada pode incluir a questão.
- Seleção de vários assuntos, com busca por assuntos importados e entrada de texto livre.
- Catálogo normalizado de assuntos salvo no IndexedDB e atualizado a partir do banco de questões.

## Resolução
- Grifos de trechos do enunciado com persistência por atividade e questão.
- Alternativas podem ser riscadas e restauradas; a eliminação visual é independente da resposta marcada.
- Comentários específicos ficam vinculados somente à alternativa selecionada, inclusive na revisão final.
- Descarte explícito de atividade em andamento, com confirmação e remoção das respostas e ferramentas usadas naquela sessão. Atividades descartadas não entram nos indicadores de desempenho nem no histórico de concluídas.

## Banco e compatibilidade
- IndexedDB atualizado da versão 3 para a 4, adicionando `topics`.
- Backups completos da versão anterior, sem `topics`, continuam restauráveis; o catálogo é reconstruído a partir das questões armazenadas.
- Cache offline atualizado para `v1.1.0`.

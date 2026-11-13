# Grafia Questions — v1.5.2

## Exclusão vinculada de pacotes

- Excluir um pacote agora remove todas as questões vinculadas a ele, mesmo quando também aparecem em outros pacotes, coleções ou favoritos.
- Referências de tarefas pendentes, atividades em andamento, revisões, coleções e outros registros de importação são atualizadas para não deixar vínculos quebrados.
- A área de histórico usa a ação explícita **Excluir pacote e questões**; não há mais exclusão apenas do registro de histórico que deixe questões órfãs.
- Na primeira abertura, o Grafia consulta o diário local de alterações e remove questões órfãs de pacotes apagados em versões anteriores.
- Atividades concluídas e resultados anteriores são preservados.
- Não há alteração estrutural no IndexedDB; o cache offline passa para 1.5.2.

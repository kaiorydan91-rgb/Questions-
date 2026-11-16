# Grafia Questions — v1.6.0

## Resolução e navegação
- Agora é possível deixar uma questão em branco clicando novamente na alternativa marcada.
- A navegação adapta a grade à quantidade de questões e exibe discretamente a resposta selecionada.
- A leitura no computador recebeu área de conteúdo maior, fontes ampliadas e hierarquia tipográfica mais próxima de um caderno de prova.
- O sistema destaca comandos reconhecidos no enunciado sem alterar o texto armazenado.
- Links e referências ocupam menos espaço visual.

## Textos-base compartilhados
- Cada questão pode estar associada a vários textos por `textBaseIds`; `textBaseId` permanece compatível. O importador também detecta blocos longos e idênticos no início de enunciados de várias questões, separando-os como texto-base compartilhado quando a correspondência é suficientemente forte.
- Textos usados por mais de uma questão aparecem uma única vez, agrupados com as questões relacionadas.
- Grifos em um texto-base compartilhado são sincronizados entre as questões associadas.
- O gerador de atividades e o gerador de tarefas de pacotes ganharam filtro para excluir questões com textos compartilhados. A busca do banco também pesquisa o título e o conteúdo de todos os textos-base associados.

## Tarefas e importação
- Tarefas criadas a partir de pacotes agora permitem configurar correção, comentários, navegação, cronômetro e pontuação negativa.
- O importador aceita ZIP completo com um JSON e as imagens. O formato antigo JSON + ZIP de imagens continua aceito.
- A exportação gera um único ZIP pronto para reimportação.
- Espaçamentos indevidos, espaços não separáveis e quebras excessivas são normalizados ao importar textos. A revisão ortográfica manual usa as sugestões nativas do navegador nos campos editáveis; não há substituição automática de palavras para evitar mudanças semânticas. A prévia informa quando blocos de texto foram inferidos automaticamente.

## Compatibilidade e dados
- Mantido schema de IndexedDB; não há exclusão ou redefinição de dados existentes.
- Cache do Service Worker atualizado para v1.6.0.

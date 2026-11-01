# Auditoria técnica — Grafia Questions 1.0.1

## Correções aplicadas nesta revisão

1. Removido o ornamento vazio do cabeçalho do cartão “Seu desempenho” na tela inicial. O símbolo não tinha ação nem informação associada; era apenas decoração.
2. Respostas de atividade são recarregadas diretamente do IndexedDB antes de retomar, renderizar ou entregar a atividade. Na versão anterior, o carregamento usava uma cópia em memória que podia ficar desatualizada. Isso criava risco de a atividade reaberta ou entregue mostrar respostas antigas/em branco e corrigir o resultado incorretamente.
3. A gravação de respostas, confiança e marcação de revisão agora mantém a lista de respostas em memória sincronizada com os registros gravados, além da leitura nova do IndexedDB ao carregar a atividade.
4. A opção de excluir questões já resolvidas considera somente respostas completas de atividades concluídas. Antes, respostas parciais ou tentativas em andamento podiam bloquear questões como se já tivessem sido resolvidas.
5. A criação de atividades consulta o IndexedDB para detectar uma atividade em andamento, em vez de depender apenas da lista em memória. Isso reduz o risco de iniciar duas atividades simultâneas por uma lista desatualizada.
6. A entrega da atividade ganhou uma trava contra acionamentos duplicados (por exemplo, toque repetido ou disputa entre o botão de entrega e o cronômetro). Em caso de falha, a trava é liberada e as respostas salvas permanecem disponíveis para nova tentativa.
7. Uma questão em branco ou parcialmente preenchida, mas marcada para revisão, recebe o motivo “Marcada durante a atividade”, e não “Resposta incorreta”.
8. A edição da composição de uma coleção de prova também atualiza a ordem efetiva que será exibida e usada ao resolver a prova.
9. O editor de classificação preserva a dificuldade “Não informada”, em vez de convertê-la silenciosamente para “Fácil”. O limite de duração do cronômetro também é validado entre 1 e 600 minutos.
10. O importador compara o conteúdo de uma imagem quando um `assetId` já existe no banco. Se o mesmo identificador vier associado a outro arquivo, a importação é bloqueada para evitar substituir silenciosamente uma imagem usada por questões existentes. Arquivos ZIP com nomes ambíguos ou sem referência no JSON também são bloqueados e identificados.
11. Textos-base com o mesmo ID, mas conteúdo/título diferente do já armazenado, não são sobrescritos silenciosamente: a importação é interrompida e pede outro ID ou resolução do conflito.
12. A rotina de backup incremental aceita um checkpoint válido igual a zero; ignora registros internos de checkpoint e metadados de backup; confirma o checkpoint sem criar ruído no diário de alterações; e restaura o checkpoint de origem atomicamente. A restauração incremental também é bloqueada quando existem alterações locais após o checkpoint, evitando mesclar silenciosamente duas linhas de alterações incompatíveis.
13. O cache do Service Worker foi atualizado para 1.0.1. A versão do banco local foi elevada para 3, com migração transacional para preservar metadados e binários de imagens já existentes.

## Problemas identificados no código original

- **Respostas e estado em memória:** o carregador de respostas consultava a cópia em memória em vez da fonte persistente. Este era o risco mais importante para a integridade das atividades; foi corrigido.
- **Filtro de questões já resolvidas:** a verificação incluía tentativas parciais e atividades ainda não concluídas; foi corrigida.
- **Atividades simultâneas:** a prevenção de uma nova atividade dependia de estado em memória, que podia estar desatualizado; agora consulta o IndexedDB.
- **Revisões de questões em branco:** a classificação do motivo podia chamar uma resposta em branco de incorreta; foi corrigida.
- **Coleções de prova:** alterar as questões selecionadas não atualizava a ordem original usada para abrir/resolver a prova; foi corrigido.
- **Imagem e texto-base com IDs reutilizados:** havia risco de substituir dados já referenciados por questões existentes; agora há bloqueio explícito de conteúdo divergente.
- **Backup incremental:** a sequência e a confirmação de checkpoint tinham casos-limite que podiam gerar ruído no diário ou aceitar restauração sobre alterações locais; as verificações foram reforçadas.

## Pontos identificados que continuam como limitações ou merecem evolução

- O aplicativo mantém listas textuais carregadas em memória para filtros e painéis; a lista do banco tem paginação visual, mas não usa cursores reais do IndexedDB. Bancos muito grandes podem exigir otimização.
- A detecção de duplicatas é robusta para correspondência com o banco já existente, mas não consolida automaticamente duas questões iguais que apareçam com IDs diferentes dentro do mesmo JSON de entrada. É recomendável revisar pacotes gerados externamente para eliminar duplicatas internas antes de importar.
- A busca de imagens por nome-base só é segura quando o nome é único; agora nomes ambíguos são bloqueados e precisam de caminho completo.
- Os backups continuam sem criptografia e são processados em memória. O usuário deve guardar os arquivos em local protegido e evitar pacotes enormes em aparelhos com pouca memória. A restauração incremental exige a sequência correta e bloqueia um dispositivo que tenha alterações próprias após o checkpoint; nesse cenário, a orientação é gerar um novo backup completo.
- Não há coordenação explícita entre várias abas abertas ao mesmo tempo. Como cada aba mantém uma cópia de dados em memória, duas abas editando simultaneamente a mesma atividade podem apresentar estados visuais diferentes; use uma única aba para resolver uma atividade até que exista sincronização entre abas.
- A estimativa experimental inspirada na TRI depende dos parâmetros fornecidos pelo pacote e não equivale à TRI oficial.
- O fluxo de atividade foi revisado estaticamente e com verificações de sintaxe; não foi possível simular todos os cenários de uso real em cada navegador/dispositivo. Recomenda-se validar especialmente importação com imagens, conclusão/retomada de atividade e sequência backup completo + incremental em uma cópia de teste.

## Verificações executadas

- Sintaxe de todos os módulos JavaScript (`node --check`).
- Estrutura do manifesto PWA e caminhos dos recursos referenciados.
- Conferência de 85 IDs HTML, sem duplicatas, e ausência de caminhos locais ausentes.
- Checagem do pacote vazio de modelo: nenhuma questão de demonstração incluída.
- Verificação de integridade estrutural do ZIP gerado (`unzip -t`).

Esta auditoria descreve o código entregue nesta versão; ela não substitui testes em diferentes versões do Chrome/Android nem garante ausência absoluta de defeitos.

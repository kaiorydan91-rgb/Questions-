# Grafia Questions — v1.5.5

## Imagens nas resoluções

- A posição `explanation` permite inserir uma ou várias imagens na resolução geral da questão.
- A posição `alternative_explanation:A` (e equivalentes documentados no schema) associa imagens ao comentário de uma alternativa específica.
- Imagens gerais e imagens de alternativas podem aparecer simultaneamente, junto das imagens já existentes no enunciado e nas opções.
- As imagens são importadas pelo mesmo fluxo JSON + ZIP, armazenadas no repositório local de assets e incluídas na exportação de pacotes e backups.
- As imagens são exibidas na correção durante a atividade conforme as configurações atuais, na revisão dos resultados e na visualização completa da questão.
- A validação alerta quando uma imagem aponta para uma alternativa inexistente.
- As imagens de resolução recebem uma área maior para facilitar a leitura de gráficos, esquemas e diagramas.

## Compatibilidade

- Não houve alteração de schemaVersion (`1.0.0`) nem migração do IndexedDB.
- Os pacotes antigos continuam válidos; as posições anteriores de imagens permanecem inalteradas.
- Dados locais, atividades, respostas e imagens existentes são preservados.

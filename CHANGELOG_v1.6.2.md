# Grafia Questions — v1.6.2

- Adicionada segunda rota de leitura de arquivos Blob/File com FileReader quando `arrayBuffer()` falha ou retorna tamanho diferente do declarado.
- Mensagem de erro de ZIP inválido agora informa nome, tamanho declarado, bytes lidos, tipo MIME e amostras hexadecimais do início/fim do arquivo, para distinguir download parcial de seleção incorreta.
- A análise que falha dentro do Worker é repetida na thread principal com o arquivo original. Isso contorna problemas de alguns provedores de documentos/navegadores móveis ao clonar objetos File para Workers.
- A versão do aplicativo e o cache do Service Worker foram atualizados para 1.6.2; a estrutura do IndexedDB foi mantida.

## Validação

- O leitor atualizado abriu o pacote SAS 1.6.1 (12 entradas, 90 questões e 11 imagens).
- O leitor atualizado abriu o próprio ZIP de atualização do Grafia (30 entradas).
- Verificados novamente os registros EOCD, diretório central e integridade CRC dos dois arquivos.
- O código JavaScript passou pela verificação sintática.

A recuperação automática só resolve falhas de leitura/transferência entre File e Worker. Se a própria cópia selecionada estiver truncada, a nova mensagem informa os tamanhos e os bytes lidos para orientar a correção.

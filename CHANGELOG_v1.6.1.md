# Grafia Questions — v1.6.1

## Correções de ZIP e importação
- Corrigida a data DOS gravada no cabeçalho local e no diretório central dos ZIPs exportados. A data agora é 01/01/1980, válida pelo padrão ZIP, em vez do valor inválido 00/00/1980.
- O leitor ZIP valida a posição e o tamanho do diretório central, o fim do arquivo, arquivos divididos em volumes, campos ZIP64, flags suportadas, nomes, cabeçalhos locais, descritores de dados, limites, sobreposição de registros, tamanho extraído e CRC.
- A análise em segundo plano fecha a conexão temporária do IndexedDB em todos os caminhos de execução.
- A interface comunica falhas de resposta do Worker com mensagens mais claras.

## Compatibilidade
- Cache do Service Worker atualizado para v1.6.1 para forçar a instalação dos arquivos corrigidos.
- Nenhuma mudança estrutural no IndexedDB e nenhuma migração destrutiva. Questões, imagens e atividades locais são preservadas.

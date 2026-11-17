# Auditoria técnica — correção da importação ZIP (Grafia Questions 1.6.1)

## Defeito confirmado na versão 1.6.0

O gerador `js/zip.js` gravava `0` tanto no campo DOS de horário quanto no campo DOS de data, nos cabeçalhos locais e no diretório central. A data DOS `0x0000` representa mês/dia `00/00`, que não é uma data válida. O leitor interno da versão 1.6.0 não examinava esse campo, portanto os testes anteriores de leitura e CRC não detectavam o problema. Leitores ZIP mais estritos podem recusar o arquivo como inválido.

## Correções realizadas

- O escritor agora grava horário `00:00:00` e data DOS `0x0021`, correspondente a `01/01/1980`, em ambos os cabeçalhos.
- O escritor rejeita conteúdo com tipos inválidos, nomes vazios ou repetidos, quantidade excessiva de entradas e arquivos que ultrapassem os limites ZIP32/tamanho configurados.
- O leitor verifica a presença e a posição do EOCD, o tamanho do comentário, os discos, a contagem de registros, a posição e o tamanho exatos do diretório central e a ausência de campos ZIP64 não suportados.
- O leitor verifica flags, método de compressão, nomes UTF-8/CP437, campos extras, consistência entre cabeçalhos local/central, descritores de dados, limites de tamanho, sobreposição dos registros, tamanho final e CRC.
- O Worker fecha o IndexedDB em bloco `finally` e a interface também trata falhas de transferência de mensagens.
- O cache offline foi alterado para `v1.6.1`; a inscrição do Service Worker desabilita cache HTTP do script e solicita uma verificação de atualização.
- `appVersion` passou a `1.6.1`, sem alteração da versão estrutural do IndexedDB (`DB_VERSION` permanece 4) e sem apagar dados existentes.

## Testes executados

1. O pacote de questões foi reconstruído com o escritor corrigido do Grafia.
2. O ZIP final foi aberto novamente pelo leitor `readZip` atualizado.
3. O ZIP foi validado com Python `zipfile.testzip()` e Info-ZIP `unzip -t`; ambos não apontaram erros.
4. Os timestamps DOS dos cabeçalhos foram verificados como `1980-01-01 00:00:00`.
5. O importador `prepareQuestionImport` foi executado com um banco vazio de teste: 90 questões, 0 incompletas, 11 imagens localizadas/validadas e 1 texto-base.
6. Foram conferidos IDs únicos, área/matéria, caminhos de imagem, arquivos faltantes/extras e distribuição de dificuldade.
7. O leitor também abriu um ZIP legado produzido na versão 1.6.0, um ZIP DEFLATE com nomes UTF-8 e um ZIP com comentário EOCD contendo assinatura falsa.
8. Um ZIP com conteúdo alterado foi rejeitado pelo teste de CRC.
9. Os arquivos JavaScript do aplicativo passaram pela verificação sintática do Node.js.

## Resultado do pacote SAS

- 90 questões: inglês nas questões 1–5 e demais áreas nas questões 6–90; espanhol excluído.
- 11 imagens PNG referenciadas e presentes no ZIP.
- 1 texto-base compartilhado.
- Dificuldades estimadas: 30 Fácil, 44 Média e 16 Difícil.
- 0 questões incompletas no validador de importação.
- 0 IDs duplicados, 0 imagens ausentes e 0 imagens não referenciadas.

## Limites e confirmação no dispositivo

A versão continua aceitando ZIP32 sem senha e métodos armazenado (0) e DEFLATE (8), com os limites de tamanho e quantidade já documentados. ZIP64 e criptografia continuam fora do escopo.

Os testes acima confirmam o formato e o fluxo de leitura/importação em ambiente controlado, mas não substituem a confirmação no navegador/aparelho em que o Grafia está instalado. Para que a correção do leitor e do cache entre em vigor, publique/instale os arquivos da versão 1.6.1; apenas selecionar o pacote novo no aplicativo antigo não atualiza o código do aplicativo.

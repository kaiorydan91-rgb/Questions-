# Grafia Questions — v1.6.4

## Navegação da atividade
- A coluna lateral ficou mais larga e os números usam cinco colunas em desktop, com botões maiores.
- A grade de navegação possui rolagem independente e acompanha automaticamente a questão e o texto compartilhado que estão na região de leitura, usando eventos de rolagem em captura e `IntersectionObserver` para cobrir também contêineres roláveis internos.
- Ao navegar diretamente para uma questão distante, o botão correspondente é mantido visível na lista.

## Respostas
- Removido o mecanismo de desmarcação por interceptação de clique em radio, que podia conflitar com a ativação nativa dos controles.
- Adicionado o botão explícito “Limpar resposta” em cada questão respondida.
- Ao limpar uma resposta, o Grafia zera resposta, resultado de correção e horário da resposta, preservando grifos, confiança e sinalização de revisão.
- “Deixar tudo em branco” também limpa metadados de correção e continua preservando os demais dados de estudo.

## Textos compartilhados
- Textos longos vinculados a várias questões são analisados para identificar linhas numeradas já existentes.
- Quando a fonte não traz numeração, textos longos com quebras de linha explícitas recebem numeração visual automática.
- Também reconhece numeração esparsa típica de algumas provas (por exemplo, 5, 10, 15) e preenche visualmente os números intermediários, sem alterar o texto original.
- Cabeçalhos e linhas em branco são preservados; a numeração é apresentada em coluna separada, sem se misturar ao texto.
- Prefixos e separadores originais permanecem no DOM como conteúdo não visual, mantendo a correspondência dos offsets de grifos.
- A seleção de trechos calcula offsets sobre os nós de texto originais, para preservar a precisão dos grifos.

## Compatibilidade
- Atualizada a versão do aplicativo, o registro local e o cache do Service Worker para 1.6.4.
- Nenhuma alteração estrutural no IndexedDB e nenhum dado local é removido.

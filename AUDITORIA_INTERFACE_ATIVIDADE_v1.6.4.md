# Auditoria de melhorias da atividade — Grafia Questions 1.6.4

## Navegação
- Desktop ampliado para uma coluna lateral de 250–330 px, cinco colunas e botões de pelo menos 44 px de altura.
- A grade tem rolagem interna independente do restante da página.
- A navegação acompanha a região de leitura por sincronização via `requestAnimationFrame`, eventos de rolagem em captura e `IntersectionObserver`, inclusive quando o conteúdo rola dentro de contêineres internos.
- A questão atual recebe estado visual `current`; quando sai da área visível da grade, a grade rola para mantê-la à vista.
- Seções de texto compartilhado identificam a primeira questão associada, permitindo acompanhar a lista ainda durante a leitura do texto.

## Respostas
- Removido o listener de captura que cancelava o evento nativo dos radios e tentava desmarcá-los manualmente.
- A limpeza é feita por ação explícita, seguida de persistência no IndexedDB e atualização de alternativas, feedback, progresso e navegação.
- Os campos `answeredAt` e `isCorrect` são redefinidos para `null` ao limpar.
- A ação em lote mantém grifos, confiança e marcação de revisão.

## Textos compartilhados
- O detector reconhece prefixos numéricos em todas as linhas e também numeração esparsa (por exemplo, 5, 10, 15) quando o intervalo entre os marcadores coincide com a quantidade de linhas intermediárias.
- Textos longos (320+ caracteres) com ao menos quatro linhas explícitas recebem numeração visual sequencial quando não há marcadores existentes.
- Títulos antes da primeira linha numerada e espaçamento entre parágrafos são mantidos.
- Números visuais usam pseudo-elementos CSS e não contaminam o texto selecionável. Prefixos e quebras originais são mantidos em nós ocultos para preservar os offsets de seleção.
- O cálculo de offsets de seleção percorre os nós de texto do DOM, incluindo os marcadores e separadores originais.

## Verificações executadas
- Sintaxe dos módulos JavaScript validada com `node --check` (app.js, db.js, importer.js, zip.js e sw.js).
- Teste no Chromium com CSS e funções de produção: 1440×900, 1280×720 e 390×844.
- Desktop 1440×900: grade de cinco colunas, painel de 330 px e botões de 44 px; ao rolar até a questão 56, a questão 56 tornou-se ativa e permaneceu visível na grade após a rolagem automática.
- Desktop 1280×720: painel lateral de aproximadamente 294 px, cinco colunas, botões de 44 px e painel contido na altura da janela.
- Mobile 390×844: layout em uma coluna, navegação com rolagem própria e sem largura excedente.
- Respostas: marcar C → limpar → confirmar estado em branco → marcar A; a alternativa A foi salva e o botão de limpeza reapareceu.
- Texto SAS compartilhado: 49 linhas detectadas, numeração original de 1 a 49 mantida e conteúdo textual original preservado integralmente.
- Texto longo sem numeração: sete linhas numeradas automaticamente e conteúdo textual original preservado.
- Numeração esparsa (5, 10, 15): 15 números visuais sequenciais inferidos e texto original preservado.
- Seleção de texto: o deslocamento de grifo de referência permaneceu igual ao deslocamento no texto original (56 caracteres).
- ZIP final testado com CRC, caminhos, unicidade dos nomes e leitura completa.

## Limitações
- A automação foi executada em navegador Chromium com DOM de teste e funções reais de produção; não representa uma instalação física em todos os navegadores ou aparelhos. A experiência no computador do usuário ainda depende da atualização local do aplicativo.

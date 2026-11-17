# Auditoria de interface — Grafia Questions 1.6.3

## Alterações implementadas

### Uso no computador
- O shell da atividade deixa de ficar limitado pela largura geral de 1.460 px e usa a largura total disponível.
- O painel de resolução usa uma coluna principal flexível e uma coluna lateral de navegação.
- A barra superior e o título redundante da página são recolhidos durante uma atividade em andamento para liberar espaço vertical.
- Enunciados, textos-base e alternativas aumentam de escala em telas largas.
- Os cartões de questão passam a ocupar a altura útil do monitor, sem impor a mesma regra aos layouts móveis.
- O painel lateral acompanha a altura útil, mantém os botões de ação visíveis e permite rolagem própria da grade de questões.
- A barra principal fica a 3 px da borda inferior em desktop e mantém o recuo seguro em dispositivos móveis.

### Respostas em branco
- A renderização das alternativas continua usando apenas a resposta registrada na atividade; o campo `answer` do pacote (gabarito) não é usado para pré-selecionar alternativa.
- Atividades novas começam sem resposta selecionada.
- Foi adicionado o comando **Deixar tudo em branco**, que exige confirmação e limpa as respostas e alternativas eliminadas da atividade corrente.
- Grifos, nível de confiança e sinalizações de revisão são preservados. O gabarito oficial no banco de questões não é alterado.

## Testes executados

1. `node --check` em `app.js`, `db.js`, `importer.js`, `zip.js` e `sw.js`: aprovado.
2. Prévia automatizada em Chromium com DOM de atividade representativo: 1440×900, 1280×720 e 390×844. Nenhuma exceção JavaScript na prévia.
3. Desktop 1440×900: shell da atividade com 1.412 px, cartão com 1.176,7 px, coluna lateral com 218 px, barra inferior a 3 px da borda.
4. Laptop 1280×720: shell da atividade com 1.252 px, cartão com 1.018,6 px, coluna lateral com 218 px, barra inferior a 3 px da borda.
5. Mobile 390×844: o cartão continua dentro da largura do aparelho (368 px), barra inferior preserva o recuo móvel e a disposição em coluna permanece ativa.
6. A prévia confirmou zero radios selecionados quando não existe resposta de atividade.
7. Arquivo final: diretório ZIP, CRC, conteúdo esperado e ausência de nomes duplicados verificados por `zipfile.testzip()`.

## Limitações do teste

A prévia Chromium usa estrutura representativa da tela de atividade e os estilos reais do aplicativo; não substitui a validação no computador/navegador onde o Grafia está instalado. O comando de limpeza de respostas é validado por inspeção do fluxo e verificação sintática, não por uma sessão IndexedDB real com respostas pessoais.

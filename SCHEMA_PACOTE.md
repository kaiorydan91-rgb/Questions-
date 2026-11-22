# Formato de importação do Grafia Questions — schema 2.0.0

O Grafia Questions aceita pacotes `2.0.0` e continua lendo pacotes legados `1.0.0`. O schema 2.0.0 foi criado para representar uma questão como uma composição ordenada de elementos, sem obrigar que o enunciado seja um único parágrafo ou que as alternativas sejam apenas texto.

## Arquivos do pacote

1. `pacote-questoes.json` — obrigatório. Contém questões, estruturas, gabaritos, classificação e referências a recursos.
2. `pacote-imagens.zip` — opcional. Contém arquivos citados em `images[].file`.

Imagens não devem ser incorporadas em base64 no JSON. Use caminhos relativos únicos dentro do ZIP.

## Estrutura geral

```json
{
  "schemaVersion": "2.0.0",
  "packageId": "identificador-estavel-unico",
  "packageName": "Nome do pacote",
  "generatedAt": "2026-11-22T12:00:00.000Z",
  "source": { "name": "Instituição", "exam": "Prova", "year": 2026 },
  "textBases": [],
  "questions": []
}
```

`packageId` deve permanecer estável quando o mesmo conjunto for reanalisado ou reimportado. Cada questão também precisa de um `id` globalmente único e estável. Não use IDs genéricos como `1`, `2` ou `Q001` em pacotes diferentes.

## Conceito central: sequência de blocos

No schema 2.0.0, `content` é uma lista ordenada de blocos. A ordem da lista é a ordem em que o aluno deve ler os elementos. Os blocos não criam cartões visuais separados: o Grafia os apresenta em uma composição contínua, respeitando a estrutura interna de cada um.

Cada bloco aceita `id` e `type`, além dos campos específicos do tipo. Campos adicionais são preservados no registro, mas tipos desconhecidos são sinalizados para revisão e recebem uma apresentação de fallback; não serão interpretados como HTML.

### Tipos de bloco disponíveis

| `type` | Campos principais | Uso |
|---|---|---|
| `paragraph` | `text` | Parágrafo normal; aceita quebras de linha, links Markdown e negrito/itálico simples |
| `heading` | `text` | Título ou subtítulo interno |
| `quote` | `text` | Citação ou trecho destacado |
| `poem` | `stanzas` | Poema com estrofes e versos preservados |
| `list` | `ordered`, `listType`, `items` | Lista ordenada ou não ordenada; itens podem ter `children` |
| `formula` | `latex`, `mathml`, `label` | Expressão matemática; MathML é preferível para renderização fiel e LaTeX é preservado como origem/fallback |
| `chemistry` | `formula`, `mathml`, `label` | Fórmula química, índices e cargas; MathML pode ser usado para estruturas mais complexas |
| `table` | `title`, `headers`, `rows`, `caption` | Tabela com células e suporte a `colSpan`/`rowSpan` |
| `image` | `assetId`, `alt`, `caption` | Imagem referenciada em `images[]` |
| `diagram` | `assetId`, `alt`, `caption` | Diagrama preservado como imagem |
| `chart` | `assetId`, `alt`, `caption` | Gráfico preservado como imagem para manter a fidelidade visual |
| `divider` | — | Separador visual discreto |
| `code` | `text` | Trecho monoespaçado ou código impresso no material |
| `callout` | `text` | Observação ou destaque lateral |
| `command` | `text` ou `children` | Comando da questão, com destaque editorial próprio |

### Exemplo de enunciado misto

```json
{
  "id": "BIO-2026-001",
  "area": "Ciências da Natureza",
  "subject": "Biologia",
  "primaryTopic": "Bioquímica",
  "type": "multiple_choice",
  "content": [
    { "id": "p1", "type": "paragraph", "text": "A água participa de inúmeros processos biológicos." },
    {
      "id": "poema1",
      "type": "poem",
      "stanzas": [
        ["Primeiro verso", "Segundo verso"],
        ["Terceiro verso", "Quarto verso"]
      ]
    },
    { "id": "formula1", "type": "chemistry", "formula": "H2O" },
    { "id": "p2", "type": "paragraph", "text": "Sua geometria molecular influencia suas propriedades." }
  ],
  "command": {
    "content": [
      { "type": "paragraph", "text": "Considerando essas informações, assinale a alternativa correta." }
    ]
  },
  "alternatives": {
    "A": "Sua natureza polar.",
    "B": "Sua composição exclusivamente iônica.",
    "C": "Sua estrutura apolar."
  },
  "answer": "A"
}
```

`statement` continua aceito para questões simples e para compatibilidade com o schema anterior. Se `content` existir, ele é a sequência principal do corpo da questão. Questões podem usar `statement`, `content` ou ambos; quando ambos são fornecidos, `content` é a composição principal e `statement` fica como texto complementar legado, não é duplicado automaticamente.

## Poemas, listas e enumerações

Cada item de `stanzas` representa uma estrofe; cada string dentro da estrofe representa um verso. Não coloque quebras de estrofe apenas com espaços ou linhas vazias dentro de um parágrafo.

```json
{
  "type": "poem",
  "stanzas": [
    ["Verso 1", "Verso 2"],
    ["Verso 3", "Verso 4"]
  ]
}
```

Listas usam `ordered: true` para numeração e `ordered: false` para marcadores. Também aceitam `listType: "numbered"` ou `listType: "ordered"`. Cada item pode conter texto e blocos filhos.

```json
{
  "type": "list",
  "ordered": true,
  "items": [
    { "text": "Primeiro item" },
    { "text": "Segundo item", "children": [
      { "type": "paragraph", "text": "Detalhe do segundo item." }
    ]}
  ]
}
```

## Matemática e química

Blocos `formula` aceitam `latex` ou `mathml`. O MathML é renderizado pelo suporte nativo do navegador, com uma lista restrita de elementos e atributos permitidos. Para expressões complexas, forneça `mathml` e mantenha a expressão original em `latex` para portabilidade e edição.

```json
{
  "type": "formula",
  "label": "Expressão matemática",
  "latex": "\\frac{x^2+1}{2} = \\sqrt{9}",
  "mathml": "<math><mfrac><mrow><msup><mi>x</mi><mn>2</mn></msup><mo>+</mo><mn>1</mn></mrow><mn>2</mn></mfrac><mo>=</mo><msqrt><mn>9</mn></msqrt></math>"
}
```

Para química, `formula` aceita texto como `H2O`, `Ca(OH)2` ou `Fe^{3+}`. Índices e cargas simples são apresentados como subscritos e sobrescritos. Use MathML para estruturas que exijam ligações, alinhamentos ou notação mais complexa.

O renderizador LaTeX incluído é deliberadamente de compatibilidade e cobre notações comuns; ele não substitui um motor TeX completo. Não dependa da conversão automática de qualquer comando LaTeX arbitrário.

## Tabelas

`headers` contém as células do cabeçalho e `rows` contém arrays de células. Uma célula pode ser uma string ou objeto com `text`, `colSpan` e `rowSpan`. Isso permite cabeçalhos agrupados e células mescladas.

```json
{
  "type": "table",
  "title": "Resultados observados",
  "headerRows": [
    [
      { "text": "Amostra", "rowSpan": 2 },
      { "text": "Medições", "colSpan": 2 }
    ],
    ["Antes", "Depois"]
  ],
  "rows": [
    ["A", "12", "18"],
    ["B", "9", "14"]
  ],
  "caption": "Valores apresentados no experimento."
}
```

## Imagens, mapas, gráficos e diagramas

Os blocos `image`, `diagram` e `chart` apontam para um recurso cadastrado em `images[]` pelo mesmo `assetId`. A imagem deve estar no ZIP, no caminho indicado em `images[].file`.

```json
{
  "content": [
    { "type": "paragraph", "text": "Observe a representação a seguir." },
    { "type": "image", "assetId": "IMG-001", "alt": "Circuito elétrico" },
    { "type": "paragraph", "text": "Considere os componentes representados." }
  ],
  "images": [
    {
      "id": "IMG-001",
      "file": "imagens/IMG-001.webp",
      "position": "statement",
      "alt": "Circuito elétrico com bateria e resistores",
      "caption": "Esquema do circuito",
      "kind": "essential",
      "essential": true
    }
  ]
}
```

Para preservar a leitura de cadernos impressos, use um bloco `image` no ponto exato em que a figura aparece no fluxo de leitura. `images[].position` continua sendo aceito para pacotes legados e imagens auxiliares, como imagens de resolução ou comentários.

Imagens aceitas: PNG, JPEG, WebP, GIF e SVG. O importador verifica o tipo real do arquivo, tamanho e CRC. Não reutilize o mesmo `assetId` para imagens diferentes.

## Alternativas multimodais

As alternativas também podem conter blocos. Use um array em `content` dentro de cada alternativa ou o mapa `alternativeContent`.

```json
{
  "alternatives": {
    "A": { "content": [ { "type": "formula", "latex": "x^2 + 2x + 1 = 0" } ] },
    "B": { "content": [ { "type": "image", "assetId": "ALT-B" } ] },
    "C": "Alternativa textual normal."
  },
  "alternativeContent": {
    "A": [ { "type": "formula", "latex": "x^2 + 2x + 1 = 0" } ],
    "B": [ { "type": "image", "assetId": "ALT-B" } ]
  },
  "images": [
    { "id": "ALT-B", "file": "imagens/ALT-B.webp", "position": "option:B", "alt": "Gráfico da alternativa B" }
  ],
  "answer": "B"
}
```

O formato `alternativeContent` é útil para exportação interna do Grafia; os dois modos são aceitos na importação. As chaves precisam corresponder às alternativas existentes. A imagem também deve constar em `images[]` e no ZIP.

## Texto-base compartilhado

`textBases` continua permitindo compartilhar um mesmo material entre várias questões. Um texto-base aceita `content` como texto corrido ou `blocks` como lista estruturada. Questões vinculadas usam `textBaseId`.

```json
{
  "textBases": [
    {
      "id": "TB-001",
      "title": "Texto I",
      "blocks": [
        { "type": "heading", "text": "A cidade contemporânea" },
        { "type": "paragraph", "text": "Primeiro parágrafo..." },
        { "type": "quote", "text": "Trecho citado..." }
      ]
    }
  ]
}
```

Para compartilhar um material, crie um único objeto e informe o mesmo `textBaseId` nas questões vinculadas. O Grafia preserva a ordem original das questões e apresenta o material compartilhado uma vez por grupo na atividade.

## Imagens auxiliares e posições legadas

Além dos blocos de imagem, o array `images` aceita posições antigas:

- `before_statement`
- `statement` ou `after_statement`
- `after_text_base`
- `option:A`, `option:B` etc.
- `after_alternatives`
- `explanation`
- `alternative_explanation:A`, `alternative_comment:A` etc.

Imagens de resolução geral e comentários individuais podem coexistir com imagens do enunciado e das alternativas no mesmo array `images` e no mesmo ZIP.

## Tipos de questão e classificação

O Grafia Questions continua aceitando:

- `multiple_choice`: resposta única por alternativas; `answer` deve corresponder à chave da alternativa.
- `true_false`: `answer` deve ser `V` ou `F`.
- `assertion_set`: múltiplas afirmações; `statements` recebe objetos `{ "id": "S1", "text": "..." }` e `answer` contém a sequência V/F, por exemplo `"VFV"`.

Questões discursivas continuam fora do escopo do banco objetivo atual. Não as converta automaticamente para múltipla escolha.

`area` deve ser `Linguagens`, `Ciências Humanas`, `Ciências da Natureza` ou `Exatas`. Matérias reconhecidas: Português, Literatura, Inglês, Espanhol, Artes, Educação Física, História, Geografia, Filosofia, Sociologia, Biologia, Química, Física e Matemática.

`primaryTopic` é o assunto principal. `secondaryTopics`, `subtopics`, `relatedSubjects`, `prerequisites` e `skills` são listas opcionais. `difficulty` aceita `Fácil`, `Média` ou `Difícil`.

`triParameters` aceita `a`, `b` e `c`. Não invente parâmetros; omita o objeto quando não houver calibração empírica confiável. A estimativa do aplicativo é experimental e não representa a TRI oficial do ENEM.

## Compatibilidade com schema 1.0.0

O importador continua aceitando o formato anterior com `statement`, `alternatives` textuais e arrays posicionais `images`, `tables` e `equations`. Questões antigas não precisam ser reimportadas para continuarem funcionando. Ao exportar um pacote do banco, o Grafia gera `schemaVersion: "2.0.0"` e mantém os campos legados necessários, acrescentando `content`, `command` e `alternativeContent` quando existirem.

## Integridade e limites

- IDs de questão devem ser únicos e estáveis.
- `assetId` deve identificar um arquivo de imagem único.
- Blocos de imagem precisam apontar para `images[]`.
- Links externos aceitam apenas HTTP e HTTPS.
- Tipos de bloco não reconhecidos são sinalizados para revisão e não são executados como HTML.
- Questões incompletas podem ser corrigidas ou removidas antes da importação.
- O pacote usa JSON obrigatório e ZIP opcional; ZIP64 e ZIPs criptografados não são aceitos nesta versão.

## Limite desta atualização

O schema 2.0.0 e seu renderizador permitem representar blocos explicitamente. O reconhecimento automático de PDFs, OCR, interpretação de layout e reconstrução por IA ainda não estão implementados dentro do site. Para importar um PDF com alta fidelidade, o processo de digitalização externo deve produzir o JSON 2.0.0 e o ZIP de imagens, seguido da validação do Grafia.

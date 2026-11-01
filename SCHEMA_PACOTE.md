# Formato de importação do Grafia Questions — schema 1.0.0

A importação utiliza um arquivo JSON obrigatório e um ZIP opcional de imagens. O banco inicial do aplicativo é vazio; este documento não contém questões de demonstração.

## Arquivo de dados

O JSON deve possuir:

- `schemaVersion`: obrigatoriamente `1.0.0`.
- `packageId`: identificador estável do pacote, que deve ser mantido ao reanalisar/reimportar o mesmo conjunto.
- `packageName`: nome legível do pacote.
- `source`: procedência geral (instituição, prova, ano ou origem). Pode incluir `url`, `link` ou `href` para a página da fonte; o endereço é apresentado em um bloco visual separado do enunciado. A questão também aceita `sourceUrl`/`sourceLink` ou `links`/`references` como alternativas.
- `textBases`: textos-base compartilhados por questões.
- `questions`: lista de questões.
- `sourceExam` (opcional): metadados da prova de origem, incluindo título, descrição e ordem original. `sourceExam.originalOrder` deve conter os IDs das questões na sequência da prova (não a ordem de classificação por matéria); o aplicativo preserva essa ordem e também mantém cada questão no banco geral.

## Campos recomendados por questão

Cada questão precisa de um `id` globalmente único e estável entre reimportações. Não reutilize IDs genéricos como `1`, `2` ou `Q001` em pacotes diferentes; prefira IDs que incorporem origem, ano, prova e número. O importador bloqueia IDs existentes cujo enunciado/alternativas sejam diferentes, para evitar mesclar questões distintas.

```json
{
  "id": "BIO-2026-001",
  "area": "Ciências da Natureza",
  "subject": "Biologia",
  "primaryTopic": "Citologia",
  "secondaryTopics": ["Bioenergética"],
  "relatedSubjects": ["Química"],
  "classificationConfidence": 0.92,
  "classificationNote": "Classificação conferida a partir do conteúdo da questão.",
  "subtopics": ["Respiração celular"],
  "prerequisites": ["Organelas celulares"],
  "skills": ["Interpretar processos celulares"],
  "difficulty": "Média",
  "type": "multiple_choice",
  "statement": "Enunciado da questão.",
  "alternatives": {"A":"...", "B":"...", "C":"...", "D":"...", "E":"..."},
  "answer": "B",
  "explanation": "Resolução geral, quando disponível.",
  "alternativeExplanations": {"A":"...", "C":"..."},
  "textBaseId": "TEXTO-001",
  "images": [
    {
      "id": "IMG-BIO-001",
      "file": "imagens/IMG-BIO-001.webp",
      "position": "after_statement",
      "alt": "Descrição objetiva da imagem",
      "caption": "Legenda opcional",
      "sourceUrl": "https://exemplo.org/imagem-original",
      "kind": "essential",
      "essential": true
    }
  ],
  "tables": [{"title":"Dados observados", "headers":["Amostra","Valor"], "rows":[["A","12"]], "position":"after_statement"}],
  "equations": [{"label":"Expressão", "expression":"E = mc²", "position":"after_statement"}],
  "sourceQuestionNumber": 1,
  "source": {"name":"Instituição ou prova", "year":2026, "url":"https://exemplo.org/prova"},
  "links": [{"label":"Página de origem", "url":"https://exemplo.org/questao"}],
  "triParameters": {"a":1.1,"b":0.2,"c":0.18}
}
```

### Tipos de questão

Esta versão não aceita questões discursivas. Se o material de origem contiver uma questão discursiva, interrompa a preparação do pacote e confirme com o usuário como deseja tratá-la; não a converta automaticamente em objetiva.

- `multiple_choice`: resposta única por alternativas. `answer` corresponde à chave da alternativa.
- `true_false`: uma afirmação; `answer` deve ser `V` ou `F`.
- `assertion_set`: múltiplas afirmações; use `statements` como array de objetos `{ "id": "S1", "text": "..." }` e `answer` como sequência de `V` e `F`, por exemplo `"VFV"`.

Questões ligadas a textos-base usam `textBaseId`. Os textos-base ficam no array `textBases`, com `id`, `title`, `content` e `source` opcionais. Uma questão pode indicar assuntos secundários (`secondaryTopics`), subassuntos (`subtopics`), matérias relacionadas (`relatedSubjects`), pré-requisitos (`prerequisites`) e habilidades (`skills`). `classificationConfidence` é um número entre 0 e 1; `classificationNote` registra ressalvas ou justificativas da classificação. `sourceQuestionNumber` preserva a numeração original.

### Imagens

O campo `images` aceita várias referências. `id` identifica o recurso; `file` informa o caminho dentro do ZIP; `position` define onde a imagem será exibida:

- `before_statement`
- `statement` ou `after_statement`
- `after_text_base`
- `option:A`, `option:B` etc. (também aceita `alternative:A`)
- `after_alternatives`. Tabelas e expressões aceitam posições como `after_statement`, `after_text_base` e `after_alternatives`; cada tabela possui `headers`, `rows`, `title` e `caption`, e cada expressão possui `expression`, `label` e `position`.

`sourceUrl` (ou `url`/`href`) pode guardar o endereço externo da origem da imagem; ele será mostrado como um link separado da imagem. `kind` pode ser `essential`, `illustrative` ou `shared`. O booleano `essential` indica que o arquivo é necessário para interpretar a questão. Um mesmo identificador pode ser referenciado por várias questões.

O ZIP deve conter os caminhos apontados no JSON. São aceitas imagens PNG, JPEG, WebP, GIF e SVG; o sistema verifica o conteúdo real do arquivo, o nome, o tamanho e o CRC. Arquivos de imagem extra não utilizados são ignorados. Não use imagens em base64 no JSON.

### Classificação

`area` deve ser uma destas opções: `Linguagens`, `Ciências Humanas`, `Ciências da Natureza` ou `Exatas`.

Matérias reconhecidas inicialmente: Português, Literatura, Inglês, Espanhol, Artes, Educação Física, História, Geografia, Filosofia, Sociologia, Biologia, Química, Física e Matemática.

`primaryTopic` é o assunto principal. `secondaryTopics` e `subtopics` são arrays de assuntos complementares. `prerequisites` e `skills` são arrays opcionais.

### Dificuldade e parâmetros TRI

`difficulty` aceita `Fácil`, `Média` ou `Difícil`.

`triParameters` aceita `a` (discriminação), `b` (dificuldade) e `c` (acerto casual). A estimativa exibida pelo aplicativo é experimental, requer pelo menos cinco itens respondidos com parâmetros válidos e não representa a TRI oficial do ENEM. Não invente parâmetros: omita o objeto quando não houver calibração empírica confiável.

## Dois arquivos por importação

1. `pacote-questoes.json` — obrigatório, contém dados e referências.
2. `pacote-imagens.zip` — opcional, contém as imagens citadas em `images[].file`.

Não incorpore imagens em base64 dentro do JSON. Isso mantém os lotes pequenos e permite que os recursos sejam compartilhados sem duplicar arquivos.

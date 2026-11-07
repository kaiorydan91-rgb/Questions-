# Grafia Questions — versão 1.1.0

Aplicação web progressiva (PWA) para banco pessoal de questões e atividades, com armazenamento local no navegador. O projeto não contém questões de demonstração: o acervo começa vazio e é preenchido por importação.

## Publicar no GitHub Pages

1. Extraia o conteúdo do ZIP para a raiz do repositório (mantenha `index.html`, `css/`, `js/`, `icons/`, `manifest.webmanifest` e `sw.js` juntos).
2. Envie os arquivos para o GitHub.
3. No repositório, abra **Settings → Pages**.
4. Em **Build and deployment**, selecione a branch principal e a pasta `/ (root)`; salve.
5. Abra o endereço HTTPS publicado. Na primeira visita, o navegador cria o banco local e registra o Service Worker.
6. Em navegadores compatíveis, use a opção do próprio navegador para instalar/adicionar à tela inicial.

Não abra o `index.html` diretamente pelo gerenciador de arquivos para uso permanente. Use HTTPS (GitHub Pages) ou um servidor local. O IndexedDB e o Service Worker dependem de uma origem compatível.

## Armazenamento e privacidade

- Questões, imagens, respostas, atividades, revisões, anotações e configurações são armazenadas no IndexedDB deste navegador/dispositivo.
- Não existe servidor de dados nem sincronização automática entre dispositivos.
- O site publicado contém apenas o aplicativo; o conteúdo pessoal permanece no armazenamento local do navegador.
- O navegador pode limpar dados locais em algumas situações. A solicitação de persistência é apenas um pedido ao navegador, não uma garantia. Faça backups periódicos.
- Os backups não são criptografados nesta versão. Proteja os arquivos exportados.

## Importar questões

O fluxo utiliza dois arquivos separados:

1. JSON obrigatório (`schemaVersion: "1.0.0"`), com questões, alternativas, gabaritos, resoluções, classificação e referências às imagens.
2. ZIP opcional com as imagens referenciadas no JSON.

Consulte `SCHEMA_PACOTE.md` e `MODELO_PACOTE.json`. O modelo começa com `questions: []`; não é um conjunto de questões fictícias.

A importação verifica a estrutura, IDs estáveis e únicos, referências de imagens, textos-base, correspondência entre área e matéria, questões incompletas e duplicatas. Um `assetId` já existente não pode ser reutilizado para outro arquivo de imagem: o conteúdo é comparado para impedir que questões antigas passem a apontar silenciosamente para uma imagem diferente. Um ID já existente com enunciado/alternativas diferentes bloqueia a importação para evitar mesclagem acidental. Questões incompletas podem ser editadas ou removidas da importação. Conflitos de gabarito exigem uma escolha explícita. A análise de JSON e ZIP roda em um Web Worker quando o navegador oferece suporte, reduzindo o bloqueio da interface. A gravação ocorre em lotes de até 200 questões e 100 imagens. Se o navegador interromper a operação, reanalise o mesmo par JSON/ZIP para retomar por identificadores e deduplicação; esta versão ainda não usa um cursor de retomada formal. O ZIP é verificado por tamanho e CRC antes de os arquivos serem armazenados.

## Backups

- **Completo:** exporta banco, histórico, respostas, revisões, notas, coleções, configurações e imagens em um ZIP.
- **Incremental:** exporta alterações posteriores ao último checkpoint. O checkpoint usa a sequência monotônica do diário interno do IndexedDB, não horário de relógio, para evitar perder alterações que ocorram no mesmo milissegundo. Faça um backup completo antes do primeiro incremental; o incremental só pode ser aplicado ao banco de origem correspondente e na sequência correta.
- **Pacote de questões:** exporta um JSON e, quando necessário, um ZIP opcional de imagens.
- **Restauração completa:** permite mesclar ou substituir. A substituição dispara antes o download de um backup de segurança e grava os dados em uma transação IndexedDB. Depois de criar qualquer backup, confirme que o arquivo foi salvo antes de avançar o checkpoint incremental; sem essa confirmação, as alterações continuam incluídas no próximo backup.

## Limites conhecidos da versão 1.1.0

- A estimativa de proficiência inspirada na TRI é experimental e só aparece com parâmetros `a`, `b` e `c` fornecidos no pacote; não é uma nota oficial do ENEM.
- A estimativa não deve ser interpretada sem calibração empírica dos parâmetros.
- Fórmulas são exibidas como expressões textuais; o aplicativo não inclui um renderizador avançado de LaTeX nesta versão.
- A versão inicial oferece diagnóstico por área/assunto, confiança declarada, tempo total de atividades e estratégias por dificuldade/revisões. As revisões começam com intervalos heurísticos simples; ainda não há um algoritmo adaptativo avançado nem diagnóstico completo por categorias de erro. O mapa de desempenho melhora à medida que atividades reais são concluídas.
- O importador de ZIP usa recursos nativos do navegador (DecompressionStream para entradas compactadas), aceita ZIP32 sem senha e possui limites de tamanho/quantidade para reduzir riscos de arquivos excessivos. ZIP64 e arquivos criptografados não são aceitos. O JSON de questões tem limite de 100 MB; o ZIP tem limite de 512 MB, cada arquivo individual até 100 MB e 20.000 entradas. Navegadores antigos podem exigir ZIPs sem compressão ou atualização.
- A interface mantém os registros textuais carregados em memória para alimentar filtros, painéis e relatórios; a lista visual é paginada, mas a consulta ainda não usa paginação por cursor diretamente no IndexedDB. Por isso, antes de importar acervos muito grandes (dezenas ou centenas de milhares de questões), é recomendável validar o desempenho no dispositivo e planejar uma otimização de consultas sob demanda. A importação já é dividida em lotes e a preparação do pacote usa Web Worker quando disponível.
- Não há sincronização entre dispositivos, contas, servidor, IA interna, criptografia dos backups ou recuperação de senha: os arquivos de backup são o meio de transferência.

## Histórico da atualização

Consulte `CHANGELOG_v1.1.0.md` para os ajustes desta versão.

## Estrutura do projeto

```text
index.html
.nojekyll
manifest.webmanifest
sw.js
css/app.css
js/app.js
js/db.js
js/importer.js
js/zip.js
js/import-worker.js
icons/icon-192.png
icons/icon-512.png
MODELO_PACOTE.json
SCHEMA_PACOTE.md
AUDITORIA_GRAFIA_QUESTIONS_v1.0.1.md
CHANGELOG_v1.0.3.md
CHANGELOG_v1.0.4.md
CHANGELOG_v1.1.0.md
CHANGELOG_v1.3.0.md
CHANGELOG_v1.4.0.md
README.md
```

## Atualização 1.1.0 (histórico)

A versão 1.1.0 introduziu filtros combináveis por área/matéria, catálogo derivado das questões, seleção de trechos, marcação visual de alternativas e comentários individuais. Na versão 1.3.0, o seletor de assuntos foi ampliado com a lista de 100 tópicos do Grafia Study, a marcação de alternativas passou a funcionar por pressão longa e os grifos foram estendidos ao texto-base. A versão 1.4.0 mantém o seletor limitado aos 100 assuntos fixos e aos assuntos personalizados salvos manualmente.

## Atualização 1.0.4

- Os seis itens da navegação voltaram a exibir ícones vetoriais próprios.
- O marcador flutuante separado da barra de navegação foi removido; a área ativa é sinalizada no próprio item.
- O histórico registra os IDs das questões de cada pacote importado e oferece **Criar atividade** para resolver esse conjunto posteriormente.
- A atividade usa os IDs já existentes no banco, sem importar ou duplicar questões novamente.
- Registros antigos sem associação de IDs informam que é necessário reimportar o pacote para habilitar a ação.

## Publicar em outra conta do GitHub

Este ZIP é um pacote independente para um repositório novo. Extraia os arquivos diretamente para a raiz do novo repositório (onde ficará o `index.html`) e publique pelo GitHub Pages. Nenhum arquivo é enviado automaticamente para o repositório antigo.

## Atualização 1.0.3

- As fontes e referências da questão também aparecem separadas do enunciado na prévia do banco, durante a resolução e nos resultados.
- A origem externa das imagens continua visível junto à imagem; ao mesclar uma questão já existente, os metadados de origem da imagem são preservados quando o novo pacote não os informa.
- A limpeza do cache offline agora é limitada ao caminho desta instalação do Grafia Questions, sem apagar caches de outros aplicativos publicados sob o mesmo domínio.


## Histórico de importações e atividades

As importações feitas nesta versão guardam a relação de IDs das questões que vieram em cada pacote. Em **Configurações → Histórico → Criar atividade**, você pode transformar novamente aquele pacote em uma atividade de resolução, inclusive dias depois, sem importar as questões outra vez. O botão não aparece para registros antigos que não tenham essa relação salva; nesses casos, reimporte o mesmo pacote uma vez para habilitar a função. Só pode haver uma atividade em andamento por vez; uma sessão em andamento pode ser descartada no próprio painel de resolução.

## Navegação 1.0.4

A barra inferior voltou a exibir ícones próprios para as seis áreas. O indicador flutuante que aparecia separado da barra foi eliminado; o estado ativo é indicado dentro do próprio item.


## v1.3.0

- Seletor de assuntos usa a lista-base de 100 tópicos do Grafia Study, filtrada pelas matérias escolhidas, com busca e entrada personalizada.
- Alternativas podem ser escurecidas por pressão longa de 1 segundo; não há mais botão de riscar nem texto tachado.
- Comentário da alternativa selecionada aparece antes da resolução completa.
- Grifos abrangem enunciado e texto-base e continuam salvos na atividade e no resultado.
- A estimativa de proficiência usa MAP regularizado com parâmetros `a`, `b` e `c` calibrados. O diagnóstico separado de coerência por dificuldade não é uma nota TRI.


## v1.4.0

- O catálogo do seletor de atividades passa a exibir exclusivamente os 100 assuntos fixos do Grafia Study e assuntos personalizados que o usuário salvou manualmente.
- Questões importadas deixam de cadastrar ou acrescentar assuntos ao catálogo.
- A busca permite salvar uma expressão nova como assunto personalizado, mantendo-a no armazenamento local e nos backups.
- Registros antigos gerados automaticamente a partir das questões são removidos na primeira atualização, sem apagar questões, respostas ou atividades.

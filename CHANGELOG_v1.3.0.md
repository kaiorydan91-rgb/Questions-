# Grafia Questions — v1.3.0

## Atualização de desempenho e interface

- Renderização sob demanda: somente a tela aberta é atualizada; as demais são renderizadas ao serem acessadas.
- Busca do banco otimizada com índice normalizado em memória e lista ordenada reutilizada.
- Contagem de questões por assunto pré-calculada; evita varrer todo o banco para cada assunto exibido.
- Busca textual com atualização agrupada durante a digitação.
- Efeitos visuais pesados reduzidos: desfoques de fundo, sombras extensas, camadas decorativas e animações de troca de página.
- Cartões, filtros, barra superior e navegação mais compactos.
- Remoção de textos de apresentação e instruções redundantes.
- Mantidos os dados locais, respostas, atividades, TRI, revisões, biblioteca, importação, exportação e restauração.

## Compatibilidade

- Banco IndexedDB permanece na mesma versão estrutural; nenhum dado local é apagado ou migrado.
- Pacotes e backups existentes continuam compatíveis.

### Otimizações adicionais
- Carregamento tardio de imagens e reutilização de URLs de objetos em memória.
- Índices em memória para localizar questões, textos-base e respostas sem buscas lineares repetidas.
- Salvamento em lote das respostas e revisões ao finalizar uma atividade.
- Atualização pontual dos marcadores de questões respondidas/revisadas.
- Cálculo de consistência por dificuldade otimizado para tempo linear.

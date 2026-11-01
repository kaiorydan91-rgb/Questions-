# Grafia Questions — atualização 1.0.4

## Navegação
- Reintroduzidos os ícones de Início, Banco, Atividades, Desempenho, Revisões e Biblioteca.
- Ajustado o alinhamento dos ícones e rótulos no celular e no desktop.
- Removidos marcadores flutuantes/indicadores residuais da navegação; o destaque da área ativa permanece dentro da própria barra.

## Histórico de importações
- Cada nova importação salva a lista dos identificadores das questões que vieram daquele pacote.
- O histórico agora oferece **Criar atividade** para converter o pacote importado em uma atividade de resolução, mantendo a ordem original do pacote e sem duplicar questões no banco.
- A ação só aparece quando há questões daquele pacote disponíveis. Registros antigos sem associação de questões são identificados e instruem a reimportação para habilitar o recurso.
- Ao criar a atividade, o aplicativo usa o fluxo já existente de atividade e respeita a regra de uma atividade em andamento por vez.

## Compatibilidade
- Não houve mudança no esquema do IndexedDB nem remoção de dados existentes.
- A atualização do cache do Service Worker força a entrega dos novos arquivos após a publicação.
- Nenhuma questão fictícia foi incluída.

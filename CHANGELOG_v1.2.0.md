# Grafia Questions — v1.2.0

## Melhorias incluídas

- **Assuntos por matéria:** seletor com os 100 assuntos da lista do Grafia Study, filtrado pelas matérias/áreas escolhidas, busca textual e cadastro de assuntos personalizados. Assuntos existentes no banco continuam disponíveis.
- **Marcação por pressão longa:** removido o botão “Riscar”. Manter uma alternativa pressionada por 1 segundo escurece o texto; repetir o gesto restaura a aparência. A marcação não substitui a seleção da resposta.
- **Explicações em sequência:** no resultado, o comentário da alternativa escolhida aparece primeiro e a resolução geral completa vem logo abaixo.
- **Grifos corrigidos:** a seleção de texto aceita enunciado e texto-base, salva os trechos na resposta da questão e reaplica as marcações na sessão e no resultado. Registros antigos de grifos do enunciado continuam compatíveis.
- **TRI revisada:** a estimativa θ continua dependendo de parâmetros calibrados `a`, `b` e `c`; agora usa uma estimativa MAP regularizada e não escolhe mais uma atividade antiga apenas por ter mais itens calibrados. Um indicador separado mostra a coerência entre o nível de dificuldade e os acertos, penalizando padrões em que uma questão fácil é errada e uma mais difícil é acertada. Esse indicador não é uma nota TRI.
- **Dados existentes:** mantém o banco local, as atividades, as respostas, as imagens, os backups e a compatibilidade com os pacotes já aceitos.

## Observação sobre a TRI

A estimativa só tem interpretação na escala dos parâmetros calibrados fornecidos no pacote. O Grafia Questions não transforma níveis “Fácil/Média/Difícil” em parâmetros psicométricos fictícios e não apresenta uma nota oficial ou equivalente à TRI do ENEM.

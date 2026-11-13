# Grafia Questions — v1.5.1

## Substituição segura de questões duplicadas

- A detecção de duplicatas agora tem uma segunda comparação baseada no conteúdo do enunciado, alternativas e afirmações. Ela reconhece uma questão cujo ID de imagem ou vínculo de texto-base seja diferente, sem exigir igualdade desses anexos.
- Correspondências encontradas apenas pelo conteúdo são sinalizadas para revisão manual, pois as figuras ou os textos-base podem representar versões diferentes.
- A prévia de importação mostra uma contagem comparativa de informações identificadas na questão atual e na questão importada, com uma ação em lote para marcar todas as versões importadas menos completas para substituição. Cada escolha continua editável individualmente antes de confirmar.
- Para cada duplicata, o usuário pode escolher: enriquecer e preservar os dados atuais; substituir pela versão importada, mesmo que ela tenha menos informações; ou manter a versão atual sem alterações.
- A substituição troca o conteúdo da questão pelo conteúdo importado, mas conserva o ID original, a data de criação, os favoritos e o histórico de respostas. Isso mantém as referências de atividades, respostas, revisões e anotações ligadas ao mesmo ID.
- Antes da substituição, a versão atual é salva no histórico interno da questão. São mantidas as cinco versões anteriores mais recentes. A tela de detalhes permite restaurar uma versão salva, arquivando também a versão que estava ativa.
- O histórico das versões anteriores é incluído nos backups existentes, pois faz parte do registro da questão. A limpeza de pacotes também considera as imagens e os textos-base citados por versões arquivadas, para que uma versão restaurável não perca seus anexos.

## Compatibilidade

- Não houve alteração da versão estrutural do IndexedDB e não é necessário apagar dados nem reimportar o banco.
- O valor informativo da aplicação e o cache offline passam para 1.5.1.

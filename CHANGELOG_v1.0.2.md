# Grafia Questions — atualização 1.0.2

## Ajustes solicitados

1. **Links destacados:** URLs HTTP/HTTPS em textos são transformadas em chips clicáveis com estilo próprio. Links de fontes da questão aparecem em uma seção separada. Imagens podem manter um link externo para a respectiva origem.
2. **Navegação sem bolinhas:** os seis itens inferiores exibem apenas rótulos textuais. Foram removidos os ícones circulares e os estilos que desenhavam bolhas atrás deles.
3. **Projeto independente:** nome, manifesto PWA, cache offline e documentação identificam Grafia Questions 1.0.2, pronto para ser enviado a outro repositório GitHub Pages.
4. **Dados:** não foram adicionadas questões fictícias. O nome interno do IndexedDB foi preservado para evitar incompatibilidade com dados locais já existentes na mesma origem.

## Campos opcionais de referência

- `source.url`, `source.link` ou `source.href`
- `sourceUrl`, `sourceURL`, `sourceLink` ou `referenceUrl`
- `links` ou `references` como strings ou objetos com `url`/`href`/`link` e `label`/`title`/`name`
- `images[].sourceUrl` (também aceita `images[].url` e `images[].href`)

Somente endereços HTTP e HTTPS são transformados em links clicáveis.

# AGENTS.md

Instrucciones para cualquier agente o persona que trabaje en este repositorio.

Capybara es un fork de [choganhq/chogan](https://github.com/choganhq/chogan) con la marca de WebCom. El contrato completo con la fábrica (comandos, revisores, tipos de issue) lo agrega el issue #4; por ahora este archivo fija una sola regla.

## El núcleo no se edita

Upstream cambia muy seguido, y cada línea propia en el núcleo es un conflicto en cada actualización. Por eso:

- **No se editan** `www/lib/chogan.js`, `www/lib/chogan.css` ni `www/index.html`, salvo la marca Capybara y los cambios que un issue nombre explícitamente como cambio al núcleo (hoy, ninguno vigente: el arreglo de monedas de #13 llegó desde upstream).
- Lo nuevo del fork vive en su propia carpeta, con el contrato de `NEW_GAME.md`: por ejemplo, el compañero de la épica #2 en `www/games/companero/`.
- Una entrada nueva en `www/games.json` exige, por las pruebas de upstream, su fila en las dos tablas de `README.md` y su línea en las cinco descripciones de `fastlane/metadata/android/*/full_description.txt`. Esos archivos se tocan solo para eso.
- Un cambio que necesite el núcleo se propone primero upstream.

**Cómo se comprueba:** `git diff upstream/main -- www/lib/chogan.js www/lib/chogan.css www/index.html` muestra solo la marca Capybara.

## Comandos

```bash
node tools/test.js        # tiene que terminar con «همه‌ی … بررسی سبز»
./tools/browser-check.sh  # todas las páginas cargan sin errores (necesita Chrome)
```

# Mi compañero

Una mascota que se cuida y se viste con las monedas de los juegos. Es lo único que Capybara agrega al original ([choganhq/chogan](https://github.com/choganhq/chogan)): vive entera en `www/games/companero/`, con su propia entrada en `www/games.json`, y no toca el núcleo (`www/lib/chogan.js`, `www/lib/chogan.css` ni `www/index.html`).

Épica: [#2](https://github.com/cmena92/chogan/issues/2).

## La regla de fondo: deseos, nunca carencias

El compañero puede **querer** cosas, pero nada empeora con el tiempo y nada se pierde por no abrir la app.

- No hay hambre, suciedad, enfermedad, tristeza ni muerte.
- No hay rachas, notificaciones, fechas límite ni pérdidas.
- Cumplir un deseo es opcional; no cumplirlo no cambia nada.
- El vínculo nunca baja y no da ninguna ventaja en los juegos.

Las pruebas lo verifican con un reloj simulado: tras 1 hora, 30 días o 1 año fuera, todo está igual que sin ausencia.

## Economía

### Fuentes: de dónde salen las monedas

Una sola, la del original: **terminar partidas**. Cada juego entrega sus monedas al final de una ronda con `C.stats.record({ coins })`, que es la única puerta de entrada al saldo. Lo habitual son **2 a 15 monedas por partida** según el juego y el resultado, más **8** en el desafío diario.

El compañero **no da monedas**: ni el cuidado, ni los deseos, ni el vínculo.

### Sumideros: adónde van

1. **Las paletas y los personajes del original** (Perfil): 150 a 320 monedas cada uno.
2. **La tienda del compañero**: lo permanente se compra una vez; los consumibles, cada vez.

Las compras pasan por `C.coins.spend`, que solo acepta precios enteros y positivos, y quedan en un registro local sin datos personales.

### Precios

| Artículo | Tipo | Detalle | Precio |
|---|---|---|---|
| `capybara` | animal | el de siempre, gratis | 0 |
| `conejo` | animal | | 180 |
| `panda` | animal | | 260 |
| `nutria` | animal | | 340 |
| `natural` | diseño | los colores propios de cada animal | 0 |
| `medianoche` | diseño | | 120 |
| `arcoiris` | diseño | | 150 |
| `manchitas` | diseño | | 180 |
| `rayas` | diseño | | 180 |
| `dorado` | diseño | | 300 |
| `gorra` | prenda | cabeza | 90 |
| `corona` | prenda | cabeza | 220 |
| `lentes` | prenda | cabeza | 140 |
| `lazo` | prenda | cuello | 80 |
| `panuelo` | prenda | cuello | 110 |
| `sueter` | prenda | cuerpo | 180 |
| `capa` | prenda | cuerpo | 240 |
| `fruta` | consumible | comida | 5 |
| `zanahoria` | consumible | comida | 8 |
| `pastel` | consumible | comida | 15 |
| `sandia` | consumible | comida | 6 |
| `galleta` | consumible | comida | 7 |
| `helado` | consumible | comida | 12 |
| `te` | consumible | té de hierbas | 9 |
| `jabon` | consumible | baño de burbujas | 10 |

Los cuatro personajes del original (zorro, búho, gato y oso) también son animales del compañero. Se compran en la tienda del Perfil, no aquí, y el compañero solo lee si ya son tuyos.

### Costo total

Todo lo permanente cuesta **2,770 monedas**: animales 780, diseños 930 y ropa 1,060. A unas 8 monedas por partida, son unas 350 partidas: meses de juego tranquilo, sin necesidad de apurarse.

Los consumibles no suman a ese total: cuestan de 5 a 15 y son opcionales.

## Cuidado y vínculo

- **Gratis:** acariciar, cepillar y jugar.
- **Vínculo:** +1 por cada cuidado y +3 extra al cumplir el deseo de la visita. Una misma acción gratuita suma como mucho una vez cada 30 segundos, pero se puede hacer siempre.
- **Cinco niveles**, a los 0, 10, 25, 50 y 100 puntos. El 100 es el máximo y se muestra desde el principio.
- **Un deseo por visita**, distinto del de la visita anterior: probar una comida, un baño de burbujas, algo nuevo para ponerse, jugar o caricias. Primero se elige el tipo, todos igual de probables, y después cuál comida: así las siete comidas no acaparan los deseos.
- **Escenas:** comer lleva la comida a la boca, el jabón da un baño de burbujas y jugar trae una pelota que rebota. Con movimiento reducido se ve la misma escena, quieta.

## Datos

Todo se guarda en el teléfono, bajo `chogan.companero.`:

- `inventario`: lo comprado, lo equipado y el registro de compras;
- `cuidado`: el vínculo y el deseo de la visita.

«Borrar todo» en el Perfil lo elimina, como a los datos de cualquier juego. Los datos rotos o de una versión desconocida vuelven a los valores por defecto sin tocar el saldo. El compañero no pide nada a la red ni agrega permisos al APK.

## Decisiones

| Decisión | Por qué |
|---|---|
| Deseos en vez de necesidades | Las mascotas virtuales suelen enganchar con culpa; Capybara promete no hacerlo. |
| El compañero es una entrada más de `games.json` | El núcleo queda intacto y sincronizar con el original no da conflictos. |
| Lógica pura en módulos propios (`economia.js`, `cuidado.js`, `disenos.js`, `prendas.js`, `expresiones.js`) | Se prueba sin navegador, con el reloj y el azar simulados. |
| Una sola fuente para la app y el arte | `design/companero/` usa los mismos módulos, así lo aprobado es exactamente lo que se ve. |
| Pruebas en `tools/test-companero.js` | `tools/test.js` es del original; editarlo daría conflictos. |
| Documentación aquí y no en `DECISIONS.md` | Ese archivo es del original. |
| Precios en monedas, sin dinero real | Capybara no tiene compras dentro de la app. |
| En el sitio de WebCom el compañero no cuenta como juego | No es un juego: no se gana ni se pierde. |

## Cómo se prueba

```sh
node tools/test-companero.js   # el compañero
node tools/test.js             # el original
./tools/browser-check.sh       # todas las páginas, sin errores en consola
```

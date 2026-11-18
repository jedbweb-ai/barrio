# Barrio — estado del proyecto

Juego cozy para construir una ciudad moderna que se arma sola, inspirado en la mecánica de Townscaper.
Última actualización: 2026-11-18.

## Visión (no cambiar sin que el usuario lo pida)
- Sin objetivos, sin forma de perder, sin estadísticas ni números (población, dinero, etc.).
- El jugador solo decide *dónde*, *qué tipo* y *de qué color*; el resto se genera solo según los vecinos.
- Debe abrirlo cualquiera: computadora y celular, y funcionar sin internet.
- No recrear Townscaper: es un juego original con ambientación moderna.

## Dónde está
- Jugar / app instalable: https://jedbweb-ai.github.io/barrio/
- Artifact público: https://claude.ai/artifact/QzFAXE8m9sPezXmRhQ4QuT
- Repo: https://github.com/jedbweb-ai/barrio (público, rama `main`)

## Cómo se trabaja
- Código: `src/main.js` (todo el juego, Three.js) · `src/index.html` (plantilla e interfaz) · `public/` (ícono y manifiesto).
- `npm run build` → `dist/` (un único `index.html` autónomo con Three.js y tipografía embebidos, más `sw.js` e íconos).
- Publicar: commit + push a `main` (GitHub Actions despliega en Pages en ~1 min) y republicar `dist/index.html`
  en el artifact con su `url` (capacidad `downloads` ya declarada, se conserva sola).
- Probar antes de publicar: servir `dist/` en local y revisar en el navegador. Para armar una ciudad de prueba,
  escribir `localStorage['barrio-v2']` y recargar.
- Textos de la interfaz y comentarios del código: en español rioplatense.

## Qué tiene hoy
- **Herramientas:** Viviendas (`viv`), Negocios (`neg`), Oficinas (`ofi`), Parque, Pintar, Quitar. 8 colores. Teclas 1–6, N (día), Ctrl+Z.
- **Mapa que crece:** empieza en 20×20; al construir a ≤3 celdas del borde se agregan 6 celdas de ese lado (máx. 90 por lado).
- **Generación automática:** calles con veredas y sendas peatonales, faroles, locales con toldo en planta baja,
  balcones, terrazas, antenas, pasarelas entre torres, patios internos.
- **Variantes por vecinos (mismo tipo y altura):** casas con techo a cuatro aguas / en hilera a dos aguas / terraza
  compartida en bloque; negocios con cartel o galería con lucernario; oficinas con helipuerto.
- **Parques combinados:** senderos conectados, cerco, entradas, elemento central donde se juntan 4 celdas
  (fuente, cantero, juegos, glorieta, árbol grande) y lago con islote desde 3×3.
- **Ambiente:** autos, pájaros, nubes, ciclo día / atardecer / noche, notas musicales al construir.
- **Guardado:** automático en `localStorage` (`barrio-v2`, migra `barrio-v1` y el estilo viejo `casa` → `neg`). Deshacer y foto.

## Datos técnicos útiles
- Celdas en un `Map` disperso (`key(x,z)`); límites en `B`. Clases de celda: `b` edificio, `p` parque, `s` calle,
  `y` patio, `m` pradera. Tras cada cambio se reconstruyen las celdas a 3 de distancia (`rebuildAround`).
- Formato guardado v2: `{ v:2, b:[x0,x1,z0,z1], c:[[x, z, [[color, estilo]...], parque]...] }`.

## Pendiente / ideas
- Probar en un celular real: instalación como app, uso táctil y rendimiento con mapas grandes.
- Verificar el botón Foto para visitantes externos del artifact.
- Ideas conversadas: peatones, grilla irregular, puentes sobre agua, plazas grandes, estaciones, pasar a Godot.

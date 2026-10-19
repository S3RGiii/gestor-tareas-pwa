# Gestor de Tareas — Electiva PWA

Proyecto base de las Sesiones 1-14 (JavaScript y TypeScript) con el
`manifest.json` de la Sesión 16.

## Estado

- Sesión 16: manifest enlazado desde `index.html`, con iconos de 192×192 y
  512×512 (`any` y `maskable`).
- Pendiente: Service Worker de la Sesión 17. Hasta entonces Chrome debe
  mostrar 4 de los 5 criterios de instalabilidad en verde; es lo esperado.
- Las tareas se guardan en `localStorage`. El cambio a IndexedDB corresponde
  a sesiones posteriores del bloque.

## Cómo ejecutar

No abras `index.html` con `file://`: los módulos ES y el manifest necesitan
un servidor local.

```bash
npx serve .
# o
python -m http.server 8080
```

Abre `http://localhost:3000` (o `http://localhost:8080`) y revisa
DevTools → Application → Manifest.

## Estructura

```text
.
├─ index.html
├─ manifest.json
├─ app.js
├─ tareas.js
├─ css/estilos.css
├─ icons/                 icon-192.png, icon-512.png, icon-512-maskable.png
└─ referencia-typescript/ versión tipada de tareas.ts
```

## Nota de despliegue

`start_url` y `scope` están en `/`, como en la guía. Si publicas el proyecto
en GitHub Pages bajo `/gestor-tareas/`, cámbialos a `./index.html` y `./`
para que la PWA no apunte a la raíz del dominio.

# Avance 1 del incremento de calidad de Taskify

**Curso:** PSWE-06 Calidad y Pruebas de Software — Universidad CENFOTEC  
**Equipo:** Rocket  
**Integrantes:** Michael Jiménez Montero, David Montero Madrigal, Marco Rodríguez Vargas y Tomás Azofeifa Quesada  
**Profesor:** Luis Felipe Soto Cruz  
**Entrega:** Avance 1, sesión 6  
**Fecha de preparación:** 11 de octubre de 2026

Este avance define un incremento centrado en la integridad de las tareas: validar la fecha de vencimiento y mantener el proyecto y el responsable dentro del espacio de trabajo correspondiente. Se fundamenta en el análisis previamente entregado y aporta una prueba automatizada ejecutada antes de implementar la corrección. La evidencia confirma un defecto de validación; las verificaciones de pertenencia se mantienen como riesgos pendientes de validación dinámica.

## 3.1 Identificación

| Elemento | Identificación |
| --- | --- |
| Sistema evaluado | Taskify, aplicación web colaborativa de gestión de proyectos y tareas. |
| Repositorio original | https://github.com/impruthvi/taskify |
| Copia de trabajo del equipo | https://github.com/tomazoque/pswe-06-taskify |
| Línea base revisada | Commit `5609d5846656782ee631b674ac4b3348d6daf03a` de `main`. |
| Documento de origen | `Proyecto_taskify_equipo_rocket.docx`, «Análisis y Evaluación de Software – Avance», fechado el 16 de septiembre de 2026. |
| Tecnologías relevantes | Next.js, TypeScript, Hono, Zod y Appwrite. |

**Alcance hasta la sesión 8.** Completar cuatro historias sobre integridad de tareas y administración de miembros: rechazo de fechas ausentes o de tipo incorrecto, validación de pertenencia del proyecto y validación de pertenencia del responsable y preservación de al menos un administrador por espacio. Incorporar pruebas de regresión, comprobar los flujos seleccionados con Appwrite local y verificar la consistencia de los datos de esas tareas en tabla, Kanban y calendario.

Según la retroalimentación del profesor, se priorizan Vitest sobre validaciones Zod y reglas de rol/espacio. Playwright y SonarQube se realizarán únicamente si el tiempo alcanza. Se limita el incremento a estas reglas y sus pruebas. No incluye rediseñar la aplicación, añadir funciones de negocio, resolver toda la concurrencia del Kanban ni realizar una auditoría exhaustiva de seguridad o infraestructura. El conflicto de dependencias identificado durante la preparación se registra como limitación técnica, sin considerarlo resuelto.

## 3.2 Trazabilidad con el análisis

Los identificadores A1–A5 se asignan en este avance para facilitar la trazabilidad; no son identificadores preexistentes del documento original. Se diferencia entre una observación confirmada, una necesidad de calidad y un riesgo aún no demostrado.

| ID | Referencia y hallazgo del análisis entregado | Vinculación con el incremento |
| --- | --- | --- |
| A1 | §4.b «Pruebas existentes» y §4.d «Pruebas automatizadas»: ausencia de una suite automatizada y riesgo de regresiones. | Sustenta las pruebas de las cuatro historias. En este avance se incorporan Vitest y diez casos de validación. |
| A2 | §2, Usabilidad, «Protección contra errores del usuario»: los formularios deben impedir fechas inválidas. §5.a: pruebas unitarias de validaciones Zod. | HU-01. La ejecución actual confirma que el esquema admite cuatro entradas de tipo incorrecto. |
| A3 | §2, Seguridad, «Integridad»: validar en la API y Appwrite los límites del espacio. §4.d: riesgos de autorización y permisos en funciones colaborativas. | HU-02 y HU-03. La inspección de las rutas de tareas no muestra una comprobación explícita de pertenencia del proyecto y responsable recibidos. Su impacto en persistencia queda pendiente de pruebas con Appwrite. |
| A4 | §2, Funcionalidad adecuada, «Corrección funcional», y §4.d «Operaciones sobre tareas»: consistencia de fecha, responsable y proyecto entre vistas. | Regresión de HU-01–HU-03: los datos válidos deben persistir y conservarse en tabla, Kanban y calendario. No se declara una inconsistencia ya reproducida entre vistas. |
| A5 | §2, Seguridad, «Integridad», y §4.d «Funcionalidades colaborativas»: comprobar permisos en cambios de miembros y roles. | HU-04. Vitest confirma dos comportamientos contrarios a los criterios propuestos: impedir una promoción por el único administrador y permitir su eliminación cuando quedan miembros. |

La inspección complementaria se realizó sobre `src/features/tasks/schemas.ts` y las rutas POST y PATCH de `src/features/tasks/server/route.ts`. Esas rutas comprueban la pertenencia del usuario al espacio, pero no contienen controles explícitos equivalentes sobre los identificadores de proyecto y responsable recibidos. Esto no demuestra por sí solo que las reglas de Appwrite permitan una operación indebida.

## 3.3 Historias de usuario

Los criterios siguientes definen el comportamiento objetivo del incremento. Su inclusión no significa que ya estén implementados o aprobados.

### HU-01 Validar la fecha de vencimiento

**Como** miembro de un espacio, **quiero** que Taskify rechace fechas ausentes o de tipo incorrecto al crear o editar una tarea, **para** evitar vencimientos que no seleccioné.

**Origen:** A1, A2 y A4. **Prioridad:** alta.

**Criterios de aceptación medibles:**

1. El esquema acepta una cadena ISO válida y un objeto `Date` válido, conservando el instante recibido.
2. Rechaza `""`, `"not-a-date"`, `null`, `false`, `true`, `0` y `{}`; al crear, también rechaza la ausencia de fecha. Cada rechazo identifica el campo `dueDate`.
3. En POST y PATCH, una fecha explícitamente inválida genera HTTP 400 sin crear ni modificar la tarea. En PATCH se permite omitir `dueDate` para conservar el valor existente.
4. La interfaz muestra un mensaje asociado a la fecha y conserva los demás datos del formulario ante un rechazo. Una tarea creada con fecha válida mantiene la fecha seleccionada en las tres vistas, usando la misma zona horaria de prueba.
5. Los diez casos unitarios de este avance pasan después de la corrección; las comprobaciones de API e interfaz se agregan antes de cerrar la historia.

### HU-02 Mantener el proyecto dentro del espacio de la tarea

**Como** miembro de un espacio, **quiero** que una tarea solo pueda asociarse a un proyecto de ese mismo espacio, **para** mantener la separación de información entre equipos.

**Origen:** A1, A3 y A4. **Prioridad:** alta.

**Criterios de aceptación medibles:**

1. Con dos espacios A y B y un usuario autorizado únicamente en A, POST y PATCH rechazan con HTTP 400 un `projectId` de B o inexistente. El mensaje es genérico y no revela datos del proyecto externo.
2. El rechazo no crea registros ni cambia el proyecto u otros campos de una tarea existente; se comprueba el estado antes y después.
3. Un proyecto existente de A permite la operación y queda asociado a la tarea. En PATCH, omitir `projectId` conserva la asociación actual.
4. Se automatizan al menos seis escenarios de API: proyecto válido, externo e inexistente, tanto en creación como en edición. Se verifica el caso válido en las tres vistas.

### HU-03 Mantener el responsable dentro del espacio de la tarea

**Como** miembro de un espacio, **quiero** asignar tareas únicamente a miembros del mismo espacio, **para** evitar asignaciones ajenas al equipo.

**Origen:** A1, A3 y A4. **Prioridad:** alta.

**Criterios de aceptación medibles:**

1. Con espacios A y B, POST y PATCH rechazan con HTTP 400 un `assigneeId` correspondiente a B o inexistente. Se devuelve un mensaje genérico sin revelar datos personales externos.
2. El rechazo no crea registros ni modifica el responsable u otros campos de una tarea existente; se comprueba el estado antes y después.
3. Un miembro existente de A puede asignarse a una tarea de A. En PATCH, omitir `assigneeId` conserva el responsable actual.
4. Se automatizan al menos seis escenarios de API: miembro válido, externo e inexistente, tanto en creación como en edición. La asignación válida se comprueba en tabla, Kanban y calendario.

### HU-04 Administrar roles sin dejar el espacio sin administrador

**Como** administrador de un espacio, **quiero** administrar sus miembros y promover a otro administrador sin perder la administración del equipo, **para** conservar el control de acceso y la continuidad del espacio.

**Origen:** A1 y A5. **Prioridad:** alta. La condición de conservar al menos un administrador es un criterio propuesto para este incremento, coherente con la protección ya existente contra degradar al último administrador.

**Criterios de aceptación medibles:**

1. Un administrador puede promover a un miembro del mismo espacio a `ADMIN`, incluso si actualmente es el único administrador; HTTP 200 y una actualización del miembro correspondiente.
2. Un miembro regular no puede promoverse, y un administrador de A no puede cambiar roles ni eliminar miembros de B; se conserva HTTP 401 del contrato actual y no se invoca ninguna escritura.
3. Un rol fuera de `ADMIN` y `MEMBER` genera HTTP 400 antes de escribir.
4. Degradar o eliminar al último administrador se rechaza con HTTP 401 sin escritura, incluso cuando existen otros miembros regulares.
5. Los ocho escenarios de `tests/api/member-authorization.test.ts` pasan antes de cerrar la historia. El comportamiento de persistencia real se contrasta posteriormente con Appwrite local.

## 3.4 Proceso

**Ciclo de trabajo propuesto.** Para cada historia: identificar la regla y el hallazgo de origen, escribir la prueba, ejecutarla contra la línea base, registrar el resultado, implementar el cambio mínimo necesario, ejecutar regresión y análisis estático, y someter el cambio a revisión. Cuando una prueba confirme que el comportamiento ya es correcto, se conserva como regresión y no se introduce una corrección artificial.

| Herramienta | Uso y estado en este avance |
| --- | --- |
| Git y GitHub | Copia de trabajo del equipo; rama local `avance-1-pruebas` para pruebas y evidencia. La publicación remota se informa por separado. |
| Vitest | Configurado y ejecutado: diez casos sobre el esquema real de tareas y ocho sobre las rutas Hono de miembros, con sesión y persistencia simuladas. Se ejecutan las rutas, Zod y `getMember` reales. |
| React Testing Library | Complementaria, si el tiempo lo permite. Los mensajes y conservación de valores podrán comprobarse manualmente; no ejecutada en este avance. |
| Docker Compose y Appwrite | Previstos para verificar permisos y persistencia reales con datos de prueba. El paquete `qa-team` mencionado en el README no está en la línea base revisada. |
| Playwright | Opcional si el tiempo alcanza, según el profesor. En su ausencia, registrar la comprobación manual de los flujos seleccionados; no ejecutado en este avance. |
| ESLint y TypeScript | Configuración existente; se usarán `npm run lint` y `npx tsc --noEmit` antes de integrar las correcciones. No se presentan resultados nuevos de estas herramientas. |
| SonarQube y npm audit | SonarQube queda opcional si el tiempo alcanza; npm audit conserva su uso diagnóstico previsto. No se atribuyen resultados ni métricas no ejecutadas. |

**Frecuencia de integración propuesta.** Commits pequeños por prueba o corrección; ejecución local de pruebas en cada cambio; sincronización diaria mientras exista trabajo activo y revisión mediante pull request al completar una historia. Integrar a `main` únicamente con los criterios de la historia satisfechos, pruebas en verde y revisión de al menos otro integrante. La evidencia roja del avance se conserva en una rama separada. No se afirma que exista un flujo de GitHub Actions configurado.

**Entorno de la prueba realizada.** Node.js 24.19.0, npm 11.9.0, Vitest 5.0.3, Vite 8.3.4 y Zod 3.25.76. Se añadió `package-lock.json` para reproducir la instalación con npm en esta rama; el `bun.lockb` original no se actualizó. Para reproducir esta evidencia se utiliza npm y el nuevo lockfile.

La instalación ordinaria con npm encontró un conflicto de pares entre `react-day-picker@8.10.1` y `date-fns@4.1.0`. Se utilizó `--legacy-peer-deps --ignore-scripts` para preparar la prueba unitaria. Esta opción no corrige ni valida la compatibilidad del calendario; debe resolverse o validarse explícitamente antes de las pruebas de sistema. El entorno ejecutado fue Node 24; no se da por verificada la suite nueva con Node 20.

## 3.5 Evidencia

**Prueba anterior a la implementación de la corrección.** Se agregó `tests/unit/task-due-date.test.ts`, que importa directamente `createTaskSchema` de producción y ejecuta diez casos. No requiere Appwrite, credenciales ni conexión a una base de datos. El comportamiento objetivo procede de HU-01.

| Elemento | Evidencia |
| --- | --- |
| Fecha de ejecución | 11 de octubre de 2026, 09:47:45, Costa Rica; 15:47:45 UTC. |
| Código de producción evaluado | Línea base `5609d5846656782ee631b674ac4b3348d6daf03a`. |
| Commit local de pruebas y evidencia | `72e9826`, posterior a la línea base y sin cambios en `src/`. |
| Comando ejecutado | `npm test -- --reporter=verbose` |
| Resultado | 10 pruebas: 6 aprobadas y 4 fallidas; código de salida 1. |
| Salida completa | `docs/evidence/avance-1/vitest-red.txt` |
| Entorno y verificación de producción | `docs/evidence/avance-1/environment.json`; diferencia de `src/` respecto a la línea base vacía. |

| Entrada de `dueDate` | Resultado esperado | Resultado observado |
| --- | --- | --- |
| Cadena `2026-10-20T12:00:00.000Z` | Aceptar y conservar instante | Aprobado |
| Objeto `Date` con ese instante | Aceptar y conservar instante | Aprobado |
| Cadena vacía | Rechazar | Aprobado |
| `"not-a-date"` | Rechazar | Aprobado |
| Campo ausente (`undefined`) | Rechazar en creación | Aprobado |
| `null` | Rechazar | **Fallido: aceptado** |
| `false` | Rechazar | **Fallido: aceptado** |
| `true` | Rechazar | **Fallido: aceptado** |
| `0` | Rechazar | **Fallido: aceptado** |
| Objeto vacío | Rechazar | Aprobado |

Extracto de la salida real:

```text
Test Files  1 failed (1)
     Tests  4 failed | 6 passed (10)
AssertionError: expected true to be false // Object.is equality
EXIT_CODE=1
```

**Interpretación.** `z.coerce.date()` admite entradas que pueden convertirse a una fecha aunque su tipo no sea el esperado por el formulario o la API. Los cuatro fallos son variantes de un mismo defecto, no cuatro defectos independientes. Los seis casos que pasan comprueban entradas válidas y otros rechazos, por lo que el resultado rojo no corresponde a un fallo de arranque de la suite.

Esta evidencia cumple el propósito de demostrar una prueba previa a la corrección: en este avance no se modificó el código de producción. La fase verde queda prevista para la sesión 7. La prueba cubre el esquema de validación, no demuestra persistencia en Appwrite, mensajes de interfaz ni las historias HU-02 y HU-03.

**Reproducción sobre la rama o el parche entregado:**

```bash
# Usar Node.js 24, desde la raíz del repositorio con los cambios de este avance.
npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund
npm test -- --reporter=verbose
```

Antes de aplicar la corrección, se esperan los cuatro fallos indicados. Después de corregirla, se espera que los diez casos pasen sin debilitar sus expectativas.

### Ampliación con Vitest según retroalimentación del profesor

Se añadió `tests/api/member-authorization.test.ts` y resolución del alias `@` en Vitest. Las ocho pruebas llaman las rutas Hono en memoria, sin levantar un servidor HTTP. La sesión se sustituye por un usuario conocido y Appwrite por un doble de prueba que responde según los filtros reales de usuario, espacio y rol. Las decisiones de autorización no se simulan: se ejecuta el código de producción de las rutas y `getMember`.

| Escenario | Resultado |
| --- | --- |
| Administrador promueve miembro del mismo espacio cuando hay dos administradores | Aprobado |
| Miembro regular intenta promoverse | Aprobado: HTTP 401 y cero escrituras |
| Administrador de A intenta modificar un miembro de B | Aprobado: HTTP 401 y cero escrituras |
| Rol `OWNER`, no admitido por Zod | Aprobado: HTTP 400 y cero escrituras |
| Degradar al último administrador | Aprobado: HTTP 401 y cero escrituras |
| Único administrador promueve otro miembro | **Fallido: HTTP 401; se esperaba 200** |
| Administrador de A elimina miembro de B | Aprobado: HTTP 401 y cero eliminaciones |
| Eliminar al último administrador cuando quedan miembros regulares | **Fallido: HTTP 200; se esperaba rechazo** |

**Resultado acumulado:** 18 casos, 12 aprobados y 6 fallidos. Salida completa: `docs/evidence/avance-1/vitest-roles-red.txt`. Comando: `npm test -- --reporter=verbose`. Los seis fallos corresponden a tres problemas: cuatro variantes del defecto de fechas, un bloqueo indebido de promoción y la falta de protección ante la eliminación del último administrador. Los dos últimos se demuestran en las rutas con persistencia simulada, no contra una instancia real de Appwrite.

Se conserva la ejecución original de diez pruebas como evidencia histórica. El resultado vigente de la suite ampliada es **18 casos**. No se modificó producción; las correcciones y su evidencia verde se mantienen para la siguiente entrega. No se ha probado aquí la autenticación real, permisos configurados en Appwrite, concurrencia o persistencia efectiva.

## 3.6 Entregas siguientes

| Sesión | Entrega prevista | Evidencia y condición de cierre |
| --- | --- | --- |
| 7 | Correcciones de HU-01 y HU-04 y demostración roja → verde; pruebas de rutas para HU-02 y HU-03 antes de sus cambios. Preparación del entorno Appwrite local. | Dieciocho casos de HU-01 y HU-04 en verde, evidencia inicial y posterior, pruebas de HTTP 400 y ausencia de escritura ante fecha inválida, revisión de cambios y resultados iniciales de análisis estático. Documentación de bloqueos y del conflicto de dependencias. |
| 8 | Incremento con las cuatro historias verificadas e integrado tras revisión; informe final con trazabilidad de hallazgos, historias, pruebas y cambios. | Al menos doce escenarios de API de HU-02/HU-03, más los de HU-01; comprobación de persistencia y rechazos con Appwrite; recorridos manuales documentados sobre tareas válidas en tabla, Kanban y calendario, automatizados con Playwright solo si el tiempo alcanza; resultados de regresión y análisis, limitaciones pendientes e instrucciones reproducibles. |

El cierre se determina por los criterios medibles de cada historia. La sesión 6 aporta planificación y evidencia roja; no presenta como realizadas las correcciones, pruebas de integración o pruebas de sistema previstas para las sesiones siguientes.

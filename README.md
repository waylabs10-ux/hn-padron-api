# HN Padrón Electoral API

Servicio privado de VOTOMAP para consultar la información electoral de
Honduras. El navegador nunca llama este servicio directamente: la Edge
Function de VOTOMAP valida al usuario, aplica consentimiento/cuotas y realiza
la llamada servidor-a-servidor.

## Seguridad y capacidad

- HN_API_TOKEN obligatorio y comparación en tiempo constante.
- Endpoint principal POST /v1/consulta para evitar DNI en URLs y logs.
- No se registran DNI, token ni datos personales.
- Caché en memoria identificada por hash del DNI.
- Hasta 8 consultas simultáneas y una cola de 200 solicitudes por defecto.
- Límite configurable de 600 solicitudes por minuto.
- Descubrimiento automático de la acción de la fuente cuando cambia su
  despliegue Next.js.
- Respuestas personales con Cache-Control: no-store.

## Variables

| Variable | Obligatoria | Valor recomendado |
| --- | --- | --- |
| HN_API_TOKEN | Sí | secreto aleatorio de al menos 32 bytes |
| PORT | No | 3000 |
| HN_UPSTREAM_URL | No | https://dondemetocavotar.com/ |
| HN_UPSTREAM_NEXT_ACTION | No | vacío para descubrimiento automático |
| HN_MAX_CONCURRENT | No | 8 |
| HN_MAX_QUEUED | No | 200 |
| HN_RATE_LIMIT_PER_MINUTE | No | 600 |
| HN_CACHE_TTL_MS | No | 43200000 |

## Endpoints

### GET /health

No devuelve datos personales ni secretos.

### POST /v1/consulta

~~~http
POST /v1/consulta
Authorization: Bearer <HN_API_TOKEN>
Content-Type: application/json

{"dni":"0801199000000"}
~~~

La respuesta normalizada incluye nombre, sexo, departamento, municipio,
sector electoral, centro de votación, JRV, línea, habilitación y dirección.

### GET /consulta/:dni

Compatibilidad protegida con la versión anterior. VOTOMAP no usa esta ruta
porque un DNI no debe quedar en logs de URL.

## Desarrollo

~~~bash
npm ci
HN_API_TOKEN=solo-desarrollo npm test
HN_API_TOKEN=solo-desarrollo npm start
~~~

## Despliegue

El repositorio incluye Dockerfile para EasyPanel. El servicio escucha en el
puerto 3000; el dominio de producción es https://hon.votomap.site.

## Fuente y límites

La Ley Electoral hondureña establece el carácter público del Censo Nacional
Electoral y su consulta personal. No se encontró una API pública oficial y
documentada del CNE. El adaptador actual consume el servicio electoral
disponible detrás de dondemetocavotar.com; está desacoplado para poder
reemplazarlo por una fuente oficial sin cambiar el contrato de VOTOMAP.

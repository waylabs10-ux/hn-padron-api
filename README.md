# 🗳️ HN Padrón Electoral API

> API REST para consultar puestos de votación en Honduras por número de cédula de identidad.

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?style=flat-square&logo=express&logoColor=white)
![Railway](https://img.shields.io/badge/Deploy-Railway-0B0D0E?style=flat-square&logo=railway&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)

---

## 📋 Descripción

API que permite consultar el padrón electoral de Honduras devolviendo información completa del centro de votación asignado a un ciudadano, incluyendo nombre, departamento, municipio, sector electoral, centro de votación y JRV.

---

## 🚀 Endpoints

### `GET /consulta/:dni`

Consulta el puesto de votación por número de cédula.

**Parámetros**

| Parámetro | Tipo   | Descripción                              |
|-----------|--------|------------------------------------------|
| `dni`     | string | Número de cédula hondureña (13 dígitos) |

**Ejemplo de petición**

```bash
curl https://tu-app.up.railway.app/consulta/0801199001234
```

**Respuesta exitosa `200`**

```json
{
  "success": true,
  "data": {
    "identidad": "0801199001234",
    "nombre": "MARIA FERNANDA GUERRERO RODRIGUEZ",
    "sexo": "FEMENINO",
    "departamento": "FRANCISCO MORAZAN",
    "municipio": "DISTRITO CENTRAL",
    "sectorElectoral": "COL. QUINCE DE SEPTIEMBRE",
    "centroVotacion": "COLEGIO DE ABOGADOS",
    "jrv": "10809",
    "linea": "339",
    "habilitado": true,
    "fullAddress": "COLEGIO DE ABOGADOS, DISTRITO CENTRAL, FRANCISCO MORAZAN, Honduras"
  }
}
```

**Respuestas de error**

| Código | Descripción                                      |
|--------|--------------------------------------------------|
| `400`  | Cédula inválida (no tiene 13 dígitos numéricos) |
| `404`  | Cédula no encontrada en el padrón electoral      |
| `429`  | Límite de solicitudes excedido (10 req/min)      |
| `502`  | Error al conectar con la fuente de datos         |

---

### `GET /health`

Verifica que el servidor esté operativo.

```bash
curl https://tu-app.up.railway.app/health
```

```json
{
  "status": "ok",
  "timestamp": "2026-06-10T15:30:00.000Z"
}
```

---

## ⚙️ Instalación local

### Requisitos

- Node.js 18+
- npm

### Pasos

```bash
# Clonar el repositorio
git clone https://github.com/waylabs10-ux/hn-padron-api.git
cd hn-padron-api

# Instalar dependencias
npm install

# Iniciar el servidor
node server.js
```

El servidor quedará disponible en `http://localhost:3000`.

---

## 🧪 Pruebas rápidas

```bash
# Consulta válida
curl http://localhost:3000/consulta/0801199001234

# Cédula con formato inválido
curl http://localhost:3000/consulta/12345

# Health check
curl http://localhost:3000/health
```

---

## 🏗️ Estructura del proyecto

```
hn-padron-api/
├── server.js          # Servidor Express + lógica principal
├── package.json       # Dependencias y configuración
├── .gitignore         # Archivos ignorados por Git
└── README.md          # Documentación
```

---

## 🔒 Rate Limiting

Para evitar abuso, la API aplica un límite de **10 solicitudes por minuto por IP**. Al superar el límite se devuelve un error `429`.

---

## 🌐 Deploy en Railway

1. Fork o clona este repositorio
2. Ve a [railway.app](https://railway.app) → **New Project**
3. Selecciona **Deploy from GitHub repo**
4. Elige `hn-padron-api`
5. En **Settings → Networking** → **Generate Domain**

Railway detecta Node.js automáticamente. No se requieren variables de entorno adicionales.

---

## ⚠️ Aviso legal

Esta API actúa como intermediario de consulta pública del padrón electoral de Honduras. Los datos retornados son de carácter público y están disponibles en los portales oficiales del **Consejo Nacional Electoral (CNE)**. Su uso debe limitarse a fines informativos y de orientación ciudadana.

---

## 🛠️ Stack

- **Runtime:** Node.js 18+
- **Framework:** Express 4.x
- **Deploy:** Railway
- **Fuente de datos:** Padrón Electoral CNE Honduras

---

## 📄 Licencia

MIT © [WayLabs](https://github.com/waylabs10-ux)
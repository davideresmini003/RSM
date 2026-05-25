# RSM — Reinsurance Software Marketplace

Plataforma B2B SaaS para intermediación de reaseguro en Europa. Tres roles: **Cedente** (aseguradora), **Reasegurador**, **Broker** + **Admin**. Flujo end-to-end: publicación de Submission Pack → expresión de interés → NCA tripartito (eIDAS) → negociación con chat anónimo → cotización → contrato → cierre + valoración.

> Stack: **FastAPI** + **MongoDB** (backend) · **React 19** + **Tailwind** (frontend) · JWT + cookies httpOnly

---

## 🚀 Setup en local (Visual Studio Code)

### 1. Requisitos previos
| Herramienta | Versión mínima | Instalación |
|---|---|---|
| Python | 3.11+ | https://www.python.org/downloads/ |
| Node.js | 18+ | https://nodejs.org/ |
| Yarn | 1.22+ | `npm install -g yarn` |
| MongoDB | 7.x | nativo o vía Docker (recomendado) |
| Docker (opcional, recomendado para Mongo) | 24+ | https://www.docker.com/ |

### 2. Clonar y abrir en VS Code
```bash
git clone <tu-repo-url> rsm
cd rsm
code .
```

> Si exportas desde Emergent con el botón **Save to GitHub**, ya tienes el repo listo.

### 3. Arrancar MongoDB

**Opción A — Docker (recomendado, 1 línea):**
```bash
docker compose up -d
```
Esto levanta MongoDB en `localhost:27017` con los datos persistidos en el volumen `rsm_mongo_data`.

**Opción B — Mongo nativo:**
```bash
# macOS (brew)
brew tap mongodb/brew && brew install mongodb-community
brew services start mongodb-community

# Ubuntu/Debian
sudo apt install -y mongodb
sudo systemctl start mongod
```

### 4. Configurar variables de entorno

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Edita `backend/.env` y, **muy importante**, genera un `JWT_SECRET` propio:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
# pega el resultado en JWT_SECRET="..."
```

### 5. Backend (FastAPI)

```bash
cd backend

# Crea un virtualenv (recomendado)
python -m venv .venv
source .venv/bin/activate         # Linux / macOS
# .venv\Scripts\activate          # Windows PowerShell

# Instala dependencias
pip install -r requirements.txt

# Arranca el servidor (puerto 8001, con hot reload)
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

El backend queda disponible en **http://localhost:8001**. La documentación interactiva OpenAPI está en **http://localhost:8001/docs**.

> En el primer arranque el `seed.py` crea automáticamente el admin + los usuarios demo + los packs de muestra. Revisa los logs para ver los emails sembrados.

### 6. Frontend (React + CRACO)

En otra terminal:

```bash
cd frontend
yarn install
yarn start
```

La app se abre en **http://localhost:3000**.

### 7. Credenciales de acceso

Después del seed automático, usa cualquiera de estas cuentas (todas con password `Admin123!`):

| Rol | Email |
|---|---|
| Admin | `admin@rsm.local` (el que pongas en `ADMIN_EMAIL`) |
| Cedente | `cedente@demo.eu` |
| Reasegurador | `reasegurador@demo.eu` |
| Broker | `broker@demo.eu` |

> **Nota**: las cuentas `aseguradora@rsm.com` / `reaseguradora@rsm.com` / `broker@rsm.com` solo existen en la base de datos compartida de Emergent. En local solo se siembran las cuentas `*@demo.eu`. Si quieres añadir más, edita `backend/seed.py`.

---

## 🛠 Comandos útiles

### Tests backend
```bash
cd backend
source .venv/bin/activate
pytest tests/ -v
```

### Lint
```bash
# Backend
cd backend && ruff check .
# Frontend
cd frontend && yarn eslint src/
```

### Reset completo de la base de datos
```bash
docker compose down -v && docker compose up -d
# o, con mongo nativo:
mongosh rsm_database --eval "db.dropDatabase()"
```
Al reiniciar el backend, el `seed.py` repuebla todo.

### Build de producción del frontend
```bash
cd frontend && yarn build
# El output queda en frontend/build/
```

---

## 📂 Estructura del proyecto

```
/app
├── backend/
│   ├── routers/         # auth, operations, marketplace, admin, pack_files, broker, ...
│   ├── tests/           # pytest suites
│   ├── server.py        # punto de entrada FastAPI
│   ├── database.py      # cliente Motor (Mongo async)
│   ├── seed.py          # datos demo + indexes
│   ├── security.py      # JWT, hashing, dependencies
│   ├── models.py        # Pydantic schemas
│   ├── utils.py         # helpers + audit log
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/       # Landing, Dashboard, NewPack, Marketplace, OperationDetail, ...
│   │   ├── components/  # Sidebar, Timeline, Toast, ui/ (shadcn)
│   │   └── lib/         # api.js, auth.jsx, i18n.jsx
│   ├── public/
│   ├── craco.config.js
│   └── package.json
├── docker-compose.yml   # MongoDB local
├── memory/              # PRD.md + test_credentials.md (uso interno)
└── README.md
```

---

## ⚙️ Variables de entorno

### `backend/.env`
| Variable | Descripción | Ejemplo |
|---|---|---|
| `MONGO_URL` | Connection string de Mongo | `mongodb://localhost:27017` |
| `DB_NAME` | Nombre de la base de datos | `rsm_database` |
| `CORS_ORIGINS` | Orígenes permitidos (CORS) | `http://localhost:3000` |
| `JWT_SECRET` | Secret para firmar JWT (¡cambia esto!) | hex de 64 chars |
| `ADMIN_EMAIL` | Email del admin sembrado | `admin@rsm.local` |
| `ADMIN_PASSWORD` | Contraseña del admin | `Admin123!` |
| `DEMO_PASSWORD` | Contraseña de las cuentas demo | `Demo123!` |

### `frontend/.env`
| Variable | Descripción | Valor local |
|---|---|---|
| `REACT_APP_BACKEND_URL` | URL del backend (sin `/api`) | `http://localhost:8001` |
| `WDS_SOCKET_PORT` | Puerto websocket del HMR | `3000` |
| `ENABLE_HEALTH_CHECK` | Health check del runtime | `false` |

> Toda llamada al backend desde el frontend se hace contra `${REACT_APP_BACKEND_URL}/api/...`. Si cambias el puerto del backend, actualiza esta variable.

---

## 🐛 Troubleshooting

**`MONGO_URL` keyerror al arrancar backend**
El servidor no encuentra el `.env`. Verifica que lo creaste a partir de `.env.example` en `backend/`.

**El frontend no se conecta al backend (Network Error / CORS)**
- Comprueba que el backend está corriendo en el puerto 8001 (`curl http://localhost:8001/docs`)
- Verifica que `REACT_APP_BACKEND_URL` apunta a `http://localhost:8001` (sin `/api`)
- Reinicia `yarn start` tras cambiar el `.env` (CRA solo lee el `.env` al arrancar)

**Mongo "Connection refused"**
- Si usas Docker: `docker compose ps` debe mostrar `rsm-mongo` en estado `Up`
- Si usas Mongo nativo: `sudo systemctl status mongod`

**Los datos demo no aparecen**
El seed solo crea los usuarios/packs si no existen ya. Si manipulaste la DB manualmente, vacíala (`docker compose down -v`) y reinicia el backend.

---

## 📦 Despliegue

Para subir a producción ten en cuenta:
- `JWT_SECRET` **único** y largo
- `CORS_ORIGINS` con el dominio real del frontend (no `*`)
- `ADMIN_PASSWORD` y `DEMO_PASSWORD` **fuertes** (o desactiva el seed demo)
- Mongo con autenticación y conexión TLS
- Backend detrás de un reverse proxy (nginx / Caddy) con HTTPS
- Frontend servido desde un CDN o desde el reverse proxy (`yarn build` → carpeta `build/`)

---

## 📝 Licencia
Propietario — uso interno RSM.

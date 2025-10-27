# Configuración de Base de Datos y Almacenamiento

## 📋 Resumen de la arquitectura

### Base de Datos (PostgreSQL)
- **Ubicación**: Contenedor Docker `firmas_db`
- **Datos persistentes**: Carpeta `./bd` en la raíz del proyecto
- **Credenciales locales**:
  - Usuario: `postgres`
  - Password: `postgres123`
  - Base de datos: `firmas_db`

### Almacenamiento de Archivos
- **Ubicación**: `server/uploads/`
- **Formato aceptado**: Solo PDF
- **Tamaño máximo**: 10MB por archivo
- **Nombres de archivo**: Se generan automáticamente con timestamp único

## 🚀 Pasos para inicializar

### 1. Instalar dependencias nuevas

Desde la carpeta `server/`:

```bash
npm install
```

Esto instalará las nuevas dependencias:
- `pg` - Cliente de PostgreSQL
- `multer` - Manejo de subida de archivos
- `graphql-upload` - Soporte para Upload en GraphQL

### 2. Iniciar Docker Compose

Desde la raíz del proyecto:

```bash
docker-compose up -d
```

Esto iniciará los 3 contenedores:
- `firmas_db` (PostgreSQL)
- `firmas_server` (Backend)
- `firmas_frontend` (Frontend)

### 3. Inicializar el esquema de base de datos

Opción A - Desde dentro del contenedor:

```bash
docker exec -it firmas_server npm run db:init
```

Opción B - Localmente (si tienes Node.js instalado):

```bash
cd server
npm run db:init
```

Este comando ejecutará el archivo `server/database/schema.sql` que creará:
- ✅ 5 Tablas: `users`, `documents`, `signatures`, `document_signers`, `audit_log`
- ✅ 2 Vistas: `v_documents_with_signatures`, `v_pending_documents_by_user`
- ✅ Triggers para actualizar `updated_at` automáticamente
- ✅ Usuario admin por defecto (admin@prexxa.local)

## 📊 Estructura de tablas creadas

### `users`
Almacena usuarios del sistema (integración con AD y locales)

### `documents`
Almacena metadatos de documentos subidos:
- Título, descripción
- Ruta del archivo en `server/uploads/`
- Tamaño, tipo MIME
- Estado (pending, in_progress, completed, rejected, archived)
- Usuario que lo subió

### `signatures`
Almacena las firmas digitales:
- Documento firmado
- Usuario firmante
- Datos de la firma
- Timestamp, IP, User Agent
- Estado (pending, signed, rejected)

### `document_signers`
Tabla intermedia que define quiénes deben firmar cada documento:
- Documento + Usuario asignado
- Orden de firma (opcional)
- Si es requerido u opcional

### `audit_log`
Registro de auditoría de todas las acciones del sistema

## 🔍 Verificar que todo funciona

### Conectarse a PostgreSQL

```bash
docker exec -it firmas_db psql -U postgres -d firmas_db
```

### Comandos útiles de PostgreSQL

```sql
-- Ver todas las tablas
\dt

-- Ver estructura de una tabla
\d users

-- Ver usuarios
SELECT * FROM users;

-- Ver documentos
SELECT * FROM documents;

-- Salir
\q
```

## 📁 Estructura de archivos creada

```
server/
├── database/
│   ├── schema.sql      # Esquema completo de la BD
│   ├── init.js         # Script para inicializar la BD
│   └── db.js           # Cliente de PostgreSQL
├── uploads/            # Carpeta para archivos PDF subidos
└── utils/
    └── fileUpload.js   # Configuración de Multer
```

## 🔐 Seguridad

- Los archivos PDF se almacenan con nombres únicos (timestamp + random)
- Solo se aceptan archivos PDF (validación en servidor)
- Tamaño máximo: 10MB
- La carpeta `uploads/` debe estar en `.gitignore` (ya configurado)
- La carpeta `bd/` debe estar en `.gitignore` (ya configurado)

## ⚠️ Importante

1. **NO** subir la carpeta `bd/` al repositorio (datos sensibles)
2. **NO** subir la carpeta `uploads/` al repositorio (archivos de usuarios)
3. Los `.dockerignore` ya están configurados para excluir estas carpetas
4. El `.gitignore` también está actualizado

## 🔄 Próximos pasos

Una vez inicializado, el sistema estará listo para:
1. ✅ Subir documentos PDF desde el Dashboard
2. ✅ Almacenarlos en `server/uploads/`
3. ✅ Guardar metadatos en PostgreSQL
4. ✅ Asignar firmantes
5. ✅ Gestionar firmas digitales
6. ✅ Auditoría completa de acciones

## 📞 Troubleshooting

### Error: "Cannot connect to database"
- Verificar que el contenedor `firmas_db` esté corriendo: `docker ps`
- Ver logs: `docker logs firmas_db`

### Error: "Tablas ya existen"
- Está bien, el script usa `IF NOT EXISTS`
- Para reiniciar desde cero, eliminar la carpeta `bd/` y volver a ejecutar

### Error: "Permission denied" en uploads/
- Verificar permisos de la carpeta: `chmod 755 server/uploads`

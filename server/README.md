# Backend GraphQL - Sistema de Firmas Digitales

Servidor GraphQL con Apollo Server para el sistema de firmas digitales.

## Estructura del Proyecto

```
server/
├── graphql/
│   ├── index.js      # Exporta schema y resolvers
│   ├── schema.js     # Definiciones de tipos GraphQL
│   └── resolvers.js  # Lógica de resolución de queries/mutations
├── server.js         # Archivo principal del servidor
├── .env              # Variables de entorno
└── package.json      # Dependencias del proyecto
```

## Instalación

Las dependencias ya están instaladas. Si necesitas reinstalarlas:

```bash
npm install
```

## Configuración

El archivo `.env` contiene las variables de entorno:

```env
PORT=5000
JWT_SECRET=tu-secreto-super-seguro-cambiar-en-produccion
FRONTEND_URL=http://localhost:5173
DATABASE_URL=postgresql://admin:$40M1n*!!2023@192.168.0.254:5432/DB_QPREX
```

## Iniciar el Servidor

### Modo desarrollo (con nodemon - reinicio automático):
```bash
npm run dev
```

### Modo producción:
```bash
npm start
```

El servidor estará disponible en:
- **API GraphQL**: http://localhost:5000/graphql
- **Health Check**: http://localhost:5000/health

## Schema GraphQL

### Tipos principales:

- **User**: Usuarios del sistema
- **Document**: Documentos para firmar
- **Signature**: Firmas digitales
- **AuthPayload**: Respuesta de autenticación

### Queries disponibles:

```graphql
# Usuarios
me: User                    # Usuario autenticado
users: [User!]!            # Todos los usuarios (solo admin)
user(id: ID!): User        # Usuario por ID

# Documentos
documents: [Document!]!     # Todos los documentos
document(id: ID!): Document # Documento por ID
myDocuments: [Document!]!   # Documentos del usuario autenticado

# Firmas
signatures(documentId: ID!): [Signature!]!  # Firmas de un documento
```

### Mutations disponibles:

```graphql
# Autenticación
login(email: String!, password: String!): AuthPayload!
register(name: String!, email: String!, password: String!): AuthPayload!

# Usuarios
updateUser(id: ID!, name: String, email: String): User!
deleteUser(id: ID!): Boolean!

# Documentos
createDocument(title: String!, content: String): Document!
updateDocument(id: ID!, title: String, content: String, status: String): Document!
deleteDocument(id: ID!): Boolean!

# Firmas
signDocument(documentId: ID!, signatureData: String!): Signature!
```

## Ejemplo de uso

### Registro de usuario:

```graphql
mutation {
  register(
    name: "Juan Pérez"
    email: "juan@example.com"
    password: "password123"
  ) {
    token
    user {
      id
      name
      email
      role
    }
  }
}
```

### Login:

```graphql
mutation {
  login(
    email: "juan@example.com"
    password: "password123"
  ) {
    token
    user {
      id
      name
      email
    }
  }
}
```

### Crear documento:

```graphql
mutation {
  createDocument(
    title: "Contrato de servicios"
    content: "Contenido del contrato..."
  ) {
    id
    title
    status
    createdAt
  }
}
```

## Autenticación

El servidor usa JWT (JSON Web Tokens) para autenticación. Para acceder a recursos protegidos:

1. Obtén el token mediante login o register
2. Incluye el token en el header de las peticiones:

```
Authorization: Bearer <tu-token>
```

## Base de datos

Actualmente el servidor usa **datos en memoria** (arrays). Para integrar con PostgreSQL:

1. Instala el cliente de PostgreSQL:
   ```bash
   npm install pg
   ```

2. Actualiza los resolvers en `graphql/resolvers.js` para conectar con la base de datos usando la variable `DATABASE_URL` del archivo `.env`

## Próximos pasos

- [ ] Integrar con base de datos PostgreSQL
- [ ] Agregar validaciones de entrada
- [ ] Implementar paginación
- [ ] Agregar tests unitarios
- [ ] Implementar rate limiting
- [ ] Agregar logging
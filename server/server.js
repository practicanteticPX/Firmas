const express = require('express');
const { ApolloServer } = require('apollo-server-express');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const { typeDefs, resolvers } = require('./graphql');
const uploadRoutes = require('./routes/upload');

const JWT_SECRET = process.env.JWT_SECRET || 'tu-secreto-super-seguro-cambiar-en-produccion';
const PORT = process.env.PORT || 5001;

// Función para obtener el usuario del token
const getUserFromToken = (token) => {
  try {
    if (token) {
      return jwt.verify(token, JWT_SECRET);
    }
    return null;
  } catch (error) {
    return null;
  }
};

// Rate limiter para GraphQL (más restrictivo para operaciones de login)
const graphqlLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // límite de 100 requests por ventana
  message: 'Demasiadas peticiones desde esta IP, por favor intenta más tarde.',
  standardHeaders: true,
  legacyHeaders: false,
});

async function startServer() {
  const app = express();

  // Middleware de seguridad
  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
  }));

  // CORS
  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://192.168.0.19:5173',
    credentials: true,
  }));

  app.use(express.json());

  // Servir archivos estáticos de la carpeta uploads
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

  // Rutas REST para subida de archivos
  app.use('/api', uploadRoutes);

  // Crear servidor Apollo
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: ({ req }) => {
      // Obtener token del header
      const token = req.headers.authorization?.replace('Bearer ', '') || '';
      const user = getUserFromToken(token);

      return { user };
    },
    formatError: (error) => {
      console.error('GraphQL Error:', error);
      return {
        message: error.message,
        path: error.path,
      };
    },
  });

  // Iniciar Apollo Server
  await server.start();

  // Aplicar rate limiter antes de GraphQL
  app.use('/graphql', graphqlLimiter);

  // Aplicar middleware de Apollo a Express
  server.applyMiddleware({
    app,
    path: '/graphql',
    cors: false, // Ya manejamos CORS arriba
  });

  // Ruta de health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      message: 'Server is running',
      timestamp: new Date().toISOString(),
      services: {
        graphql: true,
        activeDirectory: !!process.env.AD_HOSTNAME
      }
    });
  });

  // Iniciar servidor
  app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://192.168.0.19:${PORT}`);
    console.log(`📊 GraphQL disponible en http://192.168.0.19:${PORT}${server.graphqlPath}`);
    console.log(`🔐 Autenticación Active Directory configurada`);
    console.log(`   - Host: ${process.env.AD_HOSTNAME || 'No configurado'}`);
    console.log(`   - Protocol: ${process.env.AD_PROTOCOL || 'ldap'}`);
    console.log(`   - Base DN: ${process.env.AD_BASE_DN || 'No configurado'}`);
    console.log(`💾 Base de datos: ${process.env.DATABASE_URL ? 'PostgreSQL conectado' : 'No configurado'}`);
  });
}

// Iniciar el servidor
startServer().catch((error) => {
  console.error('Error al iniciar el servidor:', error);
  process.exit(1);
});
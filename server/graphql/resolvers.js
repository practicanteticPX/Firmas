const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticateUser } = require('../services/ldap');

const JWT_SECRET = process.env.JWT_SECRET || 'tu-secreto-super-seguro-cambiar-en-produccion';

// Simulación de base de datos en memoria (reemplazar con PostgreSQL)
let users = [];
let documents = [];
let signatures = [];

const resolvers = {
  Query: {
    // Obtener usuario autenticado
    me: (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');
      return users.find(u => u.id === user.id);
    },

    // Obtener todos los usuarios (solo admin)
    users: (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');
      if (user.role !== 'admin') throw new Error('No autorizado');
      return users;
    },

    // Obtener un usuario por ID
    user: (_, { id }, { user }) => {
      if (!user) throw new Error('No autenticado');
      return users.find(u => u.id === id);
    },

    // Obtener todos los documentos
    documents: (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');
      return documents;
    },

    // Obtener un documento por ID
    document: (_, { id }, { user }) => {
      if (!user) throw new Error('No autenticado');
      return documents.find(d => d.id === id);
    },

    // Obtener documentos del usuario autenticado
    myDocuments: (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');
      return documents.filter(d => d.createdBy.id === user.id);
    },

    // Obtener firmas de un documento
    signatures: (_, { documentId }, { user }) => {
      if (!user) throw new Error('No autenticado');
      return signatures.filter(s => s.documentId === documentId);
    },
  },

  Mutation: {
    // Login con Active Directory
    login: async (_, { email, password }) => {
      try {
        // El campo 'email' puede ser username o email
        const username = email.includes('@') ? email.split('@')[0] : email;

        // Autenticar contra Active Directory
        const ldapUser = await authenticateUser(username, password);

        // Buscar si el usuario ya existe en nuestra base de datos
        let user = users.find(u => u.email === ldapUser.email || u.username === ldapUser.username);

        // Si no existe, crear nuevo usuario desde AD
        if (!user) {
          user = {
            id: String(users.length + 1),
            name: ldapUser.name,
            email: ldapUser.email,
            username: ldapUser.username,
            employeeID: ldapUser.employeeID,
            role: 'user',
            createdAt: new Date().toISOString(),
          };
          users.push(user);
          console.log('✓ Nuevo usuario creado desde AD:', user.username);
        } else {
          // Actualizar información del usuario desde AD
          user.name = ldapUser.name;
          user.email = ldapUser.email;
          console.log('✓ Usuario existente autenticado:', user.username);
        }

        // Generar token JWT
        const token = jwt.sign(
          {
            id: user.id,
            email: user.email,
            username: user.username,
            role: user.role
          },
          JWT_SECRET,
          { expiresIn: process.env.JWT_EXPIRES || '8h' }
        );

        return {
          token,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            username: user.username,
            role: user.role,
            createdAt: user.createdAt,
          },
        };
      } catch (error) {
        console.error('❌ Error en login:', error.message);
        throw new Error('Usuario o contraseña inválidos');
      }
    },

    // Registro
    register: async (_, { name, email, password }) => {
      const existingUser = users.find(u => u.email === email);
      if (existingUser) {
        throw new Error('El email ya est� registrado');
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = {
        id: String(users.length + 1),
        name,
        email,
        password: hashedPassword,
        role: 'user',
        createdAt: new Date().toISOString(),
      };

      users.push(newUser);

      const token = jwt.sign(
        { id: newUser.id, email: newUser.email, role: newUser.role },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      return {
        token,
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          createdAt: newUser.createdAt,
        },
      };
    },

    // Actualizar usuario
    updateUser: (_, { id, name, email }, { user }) => {
      if (!user) throw new Error('No autenticado');
      if (user.id !== id && user.role !== 'admin') {
        throw new Error('No autorizado');
      }

      const userIndex = users.findIndex(u => u.id === id);
      if (userIndex === -1) throw new Error('Usuario no encontrado');

      if (name) users[userIndex].name = name;
      if (email) users[userIndex].email = email;

      return users[userIndex];
    },

    // Eliminar usuario
    deleteUser: (_, { id }, { user }) => {
      if (!user) throw new Error('No autenticado');
      if (user.role !== 'admin') throw new Error('No autorizado');

      const userIndex = users.findIndex(u => u.id === id);
      if (userIndex === -1) throw new Error('Usuario no encontrado');

      users.splice(userIndex, 1);
      return true;
    },

    // Crear documento
    createDocument: (_, { title, content }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const newDocument = {
        id: String(documents.length + 1),
        title,
        content: content || '',
        status: 'draft',
        createdBy: users.find(u => u.id === user.id),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      documents.push(newDocument);
      return newDocument;
    },

    // Actualizar documento
    updateDocument: (_, { id, title, content, status }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const docIndex = documents.findIndex(d => d.id === id);
      if (docIndex === -1) throw new Error('Documento no encontrado');

      const doc = documents[docIndex];
      if (doc.createdBy.id !== user.id && user.role !== 'admin') {
        throw new Error('No autorizado');
      }

      if (title) doc.title = title;
      if (content) doc.content = content;
      if (status) doc.status = status;
      doc.updatedAt = new Date().toISOString();

      return doc;
    },

    // Eliminar documento
    deleteDocument: (_, { id }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const docIndex = documents.findIndex(d => d.id === id);
      if (docIndex === -1) throw new Error('Documento no encontrado');

      const doc = documents[docIndex];
      if (doc.createdBy.id !== user.id && user.role !== 'admin') {
        throw new Error('No autorizado');
      }

      documents.splice(docIndex, 1);
      return true;
    },

    // Firmar documento
    signDocument: (_, { documentId, signatureData }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const doc = documents.find(d => d.id === documentId);
      if (!doc) throw new Error('Documento no encontrado');

      const newSignature = {
        id: String(signatures.length + 1),
        documentId,
        userId: user.id,
        signedAt: new Date().toISOString(),
        signatureData,
      };

      signatures.push(newSignature);
      return newSignature;
    },
  },

  // Resolvers para campos anidados
  Document: {
    createdBy: (parent) => parent.createdBy,
  },
};

module.exports = resolvers;
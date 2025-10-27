const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../database/db');
const { authenticateUser } = require('../services/ldap');

const JWT_SECRET = process.env.JWT_SECRET || 'tu-secreto-super-seguro-cambiar-en-produccion';

const resolvers = {
  Query: {
    // Obtener usuario autenticado
    me: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(
        'SELECT * FROM users WHERE id = $1',
        [user.id]
      );

      return result.rows[0];
    },

    // Obtener todos los usuarios (solo admin)
    users: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');
      if (user.role !== 'admin') throw new Error('No autorizado');

      const result = await query('SELECT * FROM users ORDER BY created_at DESC');
      return result.rows;
    },

    // Obtener un usuario por ID
    user: async (_, { id }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query('SELECT * FROM users WHERE id = $1', [id]);
      return result.rows[0];
    },

    // Obtener todos los documentos
    documents: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT d.*, u.name as uploaded_by_name, u.email as uploaded_by_email
        FROM documents d
        JOIN users u ON d.uploaded_by = u.id
        ORDER BY d.created_at DESC
      `);

      return result.rows;
    },

    // Obtener un documento por ID
    document: async (_, { id }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT d.*, u.name as uploaded_by_name, u.email as uploaded_by_email
        FROM documents d
        JOIN users u ON d.uploaded_by = u.id
        WHERE d.id = $1
      `, [id]);

      return result.rows[0];
    },

    // Obtener documentos del usuario autenticado
    myDocuments: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT
          d.*,
          COUNT(DISTINCT ds.user_id) as total_signers,
          COUNT(DISTINCT CASE WHEN s.status = 'signed' THEN s.signer_id END) as signed_count,
          COUNT(DISTINCT CASE WHEN s.status = 'pending' THEN s.signer_id END) as pending_count
        FROM documents d
        LEFT JOIN document_signers ds ON d.id = ds.document_id
        LEFT JOIN signatures s ON d.id = s.document_id AND ds.user_id = s.signer_id
        WHERE d.uploaded_by = $1
        GROUP BY d.id
        ORDER BY d.created_at DESC
      `, [user.id]);

      return result.rows;
    },

    // Obtener documentos pendientes de firma
    pendingDocuments: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT
          d.*,
          u.name as uploaded_by_name,
          u.email as uploaded_by_email,
          COALESCE(s.status, 'pending') as signature_status
        FROM document_signers ds
        JOIN documents d ON ds.document_id = d.id
        JOIN users u ON d.uploaded_by = u.id
        LEFT JOIN signatures s ON d.id = s.document_id AND ds.user_id = s.signer_id
        WHERE ds.user_id = $1
          AND COALESCE(s.status, 'pending') = 'pending'
          AND d.status NOT IN ('completed', 'archived')
        ORDER BY d.created_at DESC
      `, [user.id]);

      return result.rows;
    },

    // Obtener documentos por estado
    documentsByStatus: async (_, { status }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT d.*, u.name as uploaded_by_name, u.email as uploaded_by_email
        FROM documents d
        JOIN users u ON d.uploaded_by = u.id
        WHERE d.status = $1
        ORDER BY d.created_at DESC
      `, [status]);

      return result.rows;
    },

    // Obtener firmas de un documento
    signatures: async (_, { documentId }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT s.*, u.name as signer_name, u.email as signer_email
        FROM signatures s
        JOIN users u ON s.signer_id = u.id
        WHERE s.document_id = $1
        ORDER BY s.created_at DESC
      `, [documentId]);

      return result.rows;
    },

    // Obtener firmas del usuario
    mySignatures: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT s.*, d.title as document_title
        FROM signatures s
        JOIN documents d ON s.document_id = d.id
        WHERE s.signer_id = $1
        ORDER BY s.created_at DESC
      `, [user.id]);

      return result.rows;
    },
  },

  Mutation: {
    // Login con Active Directory
    login: async (_, { email, password }) => {
      try {
        const username = email.includes('@') ? email.split('@')[0] : email;
        const ldapUser = await authenticateUser(username, password);

        // Buscar o crear usuario
        let result = await query(
          'SELECT * FROM users WHERE email = $1 OR ad_username = $2',
          [ldapUser.email, ldapUser.username]
        );

        let user = result.rows[0];

        if (!user) {
          // Crear nuevo usuario desde AD
          const insertResult = await query(
            `INSERT INTO users (name, email, ad_username, role, is_active)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *`,
            [ldapUser.name, ldapUser.email, ldapUser.username, 'user', true]
          );
          user = insertResult.rows[0];
          console.log('✓ Nuevo usuario creado desde AD:', user.ad_username);
        } else {
          // Actualizar información del usuario
          const updateResult = await query(
            'UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING *',
            [ldapUser.name, ldapUser.email, user.id]
          );
          user = updateResult.rows[0];
          console.log('✓ Usuario existente autenticado:', user.ad_username);
        }

        const token = jwt.sign(
          { id: user.id, email: user.email, role: user.role },
          JWT_SECRET,
          { expiresIn: process.env.JWT_EXPIRES || '8h' }
        );

        return { token, user };
      } catch (error) {
        console.error('❌ Error en login:', error.message);
        throw new Error('Usuario o contraseña inválidos');
      }
    },

    // Registro local
    register: async (_, { name, email, password }) => {
      const existingUser = await query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );

      if (existingUser.rows.length > 0) {
        throw new Error('El email ya está registrado');
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const result = await query(
        `INSERT INTO users (name, email, password_hash, role, is_active)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *`,
        [name, email, hashedPassword, 'user', true]
      );

      const user = result.rows[0];
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      return { token, user };
    },

    // Actualizar usuario
    updateUser: async (_, { id, name, email }, { user }) => {
      if (!user) throw new Error('No autenticado');
      if (user.id !== id && user.role !== 'admin') {
        throw new Error('No autorizado');
      }

      const result = await query(
        'UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email) WHERE id = $3 RETURNING *',
        [name, email, id]
      );

      return result.rows[0];
    },

    // Eliminar usuario
    deleteUser: async (_, { id }, { user }) => {
      if (!user) throw new Error('No autenticado');
      if (user.role !== 'admin') throw new Error('No autorizado');

      await query('DELETE FROM users WHERE id = $1', [id]);
      return true;
    },

    // Subir documento (metadata, el archivo se sube por REST)
    uploadDocument: async (_, { title, description }, { user }) => {
      if (!user) throw new Error('No autenticado');

      // Esta mutation se usa desde GraphQL directo, pero normalmente
      // el archivo se sube por el endpoint REST /api/upload
      return {
        success: false,
        message: 'Use el endpoint /api/upload para subir archivos',
        document: null
      };
    },

    // Actualizar documento
    updateDocument: async (_, { id, title, description, status }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const docResult = await query('SELECT * FROM documents WHERE id = $1', [id]);
      if (docResult.rows.length === 0) throw new Error('Documento no encontrado');

      const doc = docResult.rows[0];
      if (doc.uploaded_by !== user.id && user.role !== 'admin') {
        throw new Error('No autorizado');
      }

      const result = await query(
        `UPDATE documents
        SET title = COALESCE($1, title),
            description = COALESCE($2, description),
            status = COALESCE($3, status)
        WHERE id = $4
        RETURNING *`,
        [title, description, status, id]
      );

      return result.rows[0];
    },

    // Asignar firmantes a un documento
    assignSigners: async (_, { documentId, userIds }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const docResult = await query('SELECT * FROM documents WHERE id = $1', [documentId]);
      if (docResult.rows.length === 0) throw new Error('Documento no encontrado');

      const doc = docResult.rows[0];
      if (doc.uploaded_by !== user.id && user.role !== 'admin') {
        throw new Error('No autorizado');
      }

      // Insertar firmantes
      for (let i = 0; i < userIds.length; i++) {
        await query(
          `INSERT INTO document_signers (document_id, user_id, order_position, is_required)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (document_id, user_id) DO NOTHING`,
          [documentId, userIds[i], i + 1, true]
        );

        // Crear firma pendiente
        await query(
          `INSERT INTO signatures (document_id, signer_id, status, signature_type)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (document_id, signer_id) DO NOTHING`,
          [documentId, userIds[i], 'pending', 'digital']
        );
      }

      return true;
    },

    // Eliminar documento
    deleteDocument: async (_, { id }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const docResult = await query('SELECT * FROM documents WHERE id = $1', [id]);
      if (docResult.rows.length === 0) throw new Error('Documento no encontrado');

      const doc = docResult.rows[0];
      if (doc.uploaded_by !== user.id && user.role !== 'admin') {
        throw new Error('No autorizado');
      }

      // Eliminar archivo físico
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(__dirname, '..', doc.file_path);

      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.error('Error al eliminar archivo:', err);
      }

      await query('DELETE FROM documents WHERE id = $1', [id]);
      return true;
    },

    // Rechazar documento
    rejectDocument: async (_, { documentId, reason }, { user }) => {
      if (!user) throw new Error('No autenticado');

      await query(
        'UPDATE documents SET status = $1 WHERE id = $2',
        ['rejected', documentId]
      );

      await query(
        'UPDATE signatures SET status = $1 WHERE document_id = $2 AND signer_id = $3',
        ['rejected', documentId, user.id]
      );

      // Auditoría
      await query(
        'INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
        [user.id, 'reject', 'document', documentId, JSON.stringify({ reason })]
      );

      return true;
    },

    // Firmar documento
    signDocument: async (_, { documentId, signatureData }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(
        `UPDATE signatures
        SET status = 'signed',
            signature_data = $1,
            signed_at = CURRENT_TIMESTAMP
        WHERE document_id = $2 AND signer_id = $3
        RETURNING *`,
        [signatureData, documentId, user.id]
      );

      if (result.rows.length === 0) {
        throw new Error('No estás asignado para firmar este documento');
      }

      // Verificar si todos han firmado
      const pendingResult = await query(
        `SELECT COUNT(*) as pending FROM signatures
        WHERE document_id = $1 AND status = 'pending'`,
        [documentId]
      );

      if (parseInt(pendingResult.rows[0].pending) === 0) {
        await query(
          'UPDATE documents SET status = $1, completed_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['completed', documentId]
        );
      } else {
        await query(
          'UPDATE documents SET status = $1 WHERE id = $2',
          ['in_progress', documentId]
        );
      }

      // Auditoría
      await query(
        'INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1, $2, $3, $4)',
        [user.id, 'sign', 'document', documentId]
      );

      return result.rows[0];
    },
  },

  // Resolvers para campos anidados
  Document: {
    // Mapeo de snake_case (BD) a camelCase (GraphQL)
    fileName: (parent) => parent.file_name,
    filePath: (parent) => parent.file_path,
    fileSize: (parent) => parent.file_size,
    mimeType: (parent) => parent.mime_type,
    uploadedById: (parent) => parent.uploaded_by,
    createdAt: (parent) => parent.created_at,
    updatedAt: (parent) => parent.updated_at,
    completedAt: (parent) => parent.completed_at,

    uploadedBy: async (parent) => {
      const result = await query('SELECT * FROM users WHERE id = $1', [parent.uploaded_by]);
      return result.rows[0];
    },
    signatures: async (parent) => {
      const result = await query('SELECT * FROM signatures WHERE document_id = $1', [parent.id]);
      return result.rows;
    },
    totalSigners: (parent) => parent.total_signers || 0,
    signedCount: (parent) => parent.signed_count || 0,
    pendingCount: (parent) => parent.pending_count || 0,
  },

  Signature: {
    // Mapeo de snake_case (BD) a camelCase (GraphQL)
    documentId: (parent) => parent.document_id,
    signerId: (parent) => parent.signer_id,
    signatureData: (parent) => parent.signature_data,
    signatureType: (parent) => parent.signature_type,
    ipAddress: (parent) => parent.ip_address,
    userAgent: (parent) => parent.user_agent,
    signedAt: (parent) => parent.signed_at,
    createdAt: (parent) => parent.created_at,
    updatedAt: (parent) => parent.updated_at,

    document: async (parent) => {
      const result = await query('SELECT * FROM documents WHERE id = $1', [parent.document_id]);
      return result.rows[0];
    },
    signer: async (parent) => {
      const result = await query('SELECT * FROM users WHERE id = $1', [parent.signer_id]);
      return result.rows[0];
    },
  },

  User: {
    // Mapeo de snake_case (BD) a camelCase (GraphQL)
    adUsername: (parent) => parent.ad_username || null,
    isActive: (parent) => parent.is_active !== undefined ? parent.is_active : true,
    createdAt: (parent) => parent.created_at,
    updatedAt: (parent) => parent.updated_at,
  },
};

module.exports = resolvers;

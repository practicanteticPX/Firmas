const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { query } = require('../database/db');
const { authenticateUser } = require('../services/ldap');
const { addCoverPageWithSigners, updateSignersPage } = require('../utils/pdfCoverPage');

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
          COALESCE(s.status, 'pending') as signature_status,
          ds.order_position,
          CASE
            WHEN ds.order_position > 1 THEN (
              SELECT COUNT(*)
              FROM document_signers ds_prev
              LEFT JOIN signatures s_prev ON ds_prev.document_id = s_prev.document_id AND ds_prev.user_id = s_prev.signer_id
              WHERE ds_prev.document_id = d.id
                AND ds_prev.order_position < ds.order_position
                AND COALESCE(s_prev.status, 'pending') != 'signed'
            )
            ELSE 0
          END as pending_previous_signers,
          CASE
            WHEN ds.order_position > 1 THEN (
              SELECT u_prev.name
              FROM document_signers ds_prev
              JOIN users u_prev ON ds_prev.user_id = u_prev.id
              WHERE ds_prev.document_id = d.id
                AND ds_prev.order_position = ds.order_position - 1
              LIMIT 1
            )
            ELSE NULL
          END as previous_signer_name
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

    // Obtener documentos firmados por el usuario
    signedDocuments: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT
          d.*,
          u.name as uploaded_by_name,
          u.email as uploaded_by_email,
          s.signed_at,
          s.signature_type
        FROM signatures s
        JOIN documents d ON s.document_id = d.id
        JOIN users u ON d.uploaded_by = u.id
        WHERE s.signer_id = $1
          AND s.status = 'signed'
        ORDER BY s.signed_at DESC
      `, [user.id]);

      return result.rows;
    },

    // Obtener documentos rechazados por el usuario autenticado
    rejectedByMeDocuments: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT DISTINCT
          d.*,
          u.name as uploaded_by_name,
          u.email as uploaded_by_email,
          s.rejection_reason,
          s.rejected_at,
          s.signed_at,
          s.created_at,
          COALESCE(s.rejected_at, s.signed_at, s.created_at) as sort_date
        FROM documents d
        JOIN signatures s ON d.id = s.document_id
        JOIN users u ON d.uploaded_by = u.id
        WHERE s.signer_id = $1
          AND s.status = 'rejected'
        ORDER BY sort_date DESC
      `, [user.id]);

      return result.rows;
    },

    // Obtener documentos rechazados por otros firmantes
    rejectedByOthersDocuments: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT DISTINCT
          d.*,
          u.name as uploaded_by_name,
          u.email as uploaded_by_email,
          rejector_sig.rejection_reason,
          rejector_sig.rejected_at,
          rejector_sig.signed_at,
          rejector_sig.created_at,
          rejector_user.id as rejected_by_id,
          rejector_user.name as rejected_by_name,
          rejector_user.email as rejected_by_email,
          COALESCE(rejector_sig.rejected_at, rejector_sig.signed_at, rejector_sig.created_at) as sort_date
        FROM documents d
        JOIN users u ON d.uploaded_by = u.id
        -- Mi firma (debe existir y yo NO soy quien rechazó)
        JOIN signatures my_sig ON d.id = my_sig.document_id
          AND my_sig.signer_id = $1
        -- La firma del que rechazó (alguien más, no yo)
        JOIN signatures rejector_sig ON d.id = rejector_sig.document_id
          AND rejector_sig.status = 'rejected'
          AND rejector_sig.signer_id != $1
        -- Usuario que rechazó
        JOIN users rejector_user ON rejector_sig.signer_id = rejector_user.id
        WHERE d.status = 'rejected'
          AND d.uploaded_by != $1  -- Excluir documentos que YO creé
        ORDER BY sort_date DESC
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

    // Obtener usuarios disponibles para seleccionar como firmantes (incluye el usuario actual para autofirma)
    availableSigners: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      // Incluir al usuario actual para permitir autofirma
      const result = await query(`
        SELECT id, name, email, role
        FROM users
        ORDER BY
          CASE WHEN id = $1 THEN 0 ELSE 1 END,
          name ASC
      `, [user.id]);

      return result.rows;
    },
  },

  Mutation: {
    // Login con autenticación local y fallback a Active Directory
    login: async (_, { email, password }) => {
      try {
        // Primero intentar autenticación local
        const localUserResult = await query(
          'SELECT * FROM users WHERE email = $1 AND password_hash IS NOT NULL',
          [email]
        );

        // Si existe usuario local con password_hash, validar contraseña
        if (localUserResult.rows.length > 0) {
          const localUser = localUserResult.rows[0];
          const validPassword = await bcrypt.compare(password, localUser.password_hash);

          if (validPassword) {
            console.log('✓ Usuario local autenticado:', localUser.email);

            const token = jwt.sign(
              { id: localUser.id, email: localUser.email, role: localUser.role },
              JWT_SECRET,
              { expiresIn: process.env.JWT_EXPIRES || '8h' }
            );

            return { token, user: localUser };
          }
          // Si la contraseña no es válida, lanzar error inmediatamente
          throw new Error('Usuario o contraseña inválidos');
        }

        // Si no hay usuario local, intentar con Active Directory
        const username = email.includes('@') ? email.split('@')[0] : email;
        const ldapUser = await authenticateUser(username, password);

        // Buscar o crear usuario desde AD
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
          console.log('✓ Usuario existente autenticado desde AD:', user.ad_username);
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

      // Recalcular el estado del documento basado en todas las firmas
      const statusResult = await query(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'signed' THEN 1 ELSE 0 END) as signed,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
        FROM signatures
        WHERE document_id = $1`,
        [documentId]
      );

      const stats = statusResult.rows[0];
      const total = parseInt(stats.total);
      const signed = parseInt(stats.signed);
      const pending = parseInt(stats.pending);
      const rejected = parseInt(stats.rejected);

      // Determinar el nuevo estado del documento
      let newStatus = 'pending';

      if (rejected > 0) {
        // Si hay alguna firma rechazada, el documento está rechazado
        newStatus = 'rejected';
      } else if (total > 0 && signed === total) {
        // Si todas las firmas están completas, el documento está completado
        newStatus = 'completed';
      } else if (signed > 0 && signed < total) {
        // Si hay algunas firmas pero no todas, está en progreso
        newStatus = 'in_progress';
      } else if (pending > 0 && signed === 0) {
        // Si hay firmas pendientes pero ninguna firmada, está pendiente
        newStatus = 'pending';
      }

      // Actualizar el estado del documento
      await query(
        'UPDATE documents SET status = $1 WHERE id = $2',
        [newStatus, documentId]
      );

      // ========== GENERAR PÁGINA DE PORTADA ==========
      try {
        console.log(`📋 Generando página de portada para documento ${documentId}...`);

        // Obtener información completa del documento y uploader
        const docInfoResult = await query(
          `SELECT d.*, u.name as uploader_name
          FROM documents d
          LEFT JOIN users u ON d.uploaded_by = u.id
          WHERE d.id = $1`,
          [documentId]
        );

        if (docInfoResult.rows.length === 0) {
          throw new Error('Documento no encontrado');
        }

        const docInfo = docInfoResult.rows[0];

        // Obtener lista completa de firmantes con su orden y estado actual
        const signersResult = await query(
          `SELECT u.id, u.name, u.email, ds.order_position,
                  COALESCE(s.status, 'pending') as status,
                  s.signed_at,
                  s.rejected_at
          FROM document_signers ds
          JOIN users u ON ds.user_id = u.id
          LEFT JOIN signatures s ON s.document_id = ds.document_id AND s.signer_id = ds.user_id
          WHERE ds.document_id = $1
          ORDER BY ds.order_position ASC`,
          [documentId]
        );

        const signers = signersResult.rows;

        if (signers.length === 0) {
          console.log('⚠️ No hay firmantes asignados, saltando generación de portada');
          return true;
        }

        // Construir la ruta completa al archivo PDF
        // file_path ya incluye "uploads/" en su valor
        const pdfPath = path.join(__dirname, '..', docInfo.file_path);

        console.log(`📂 Ruta del PDF: ${pdfPath}`);

        // Preparar información del documento para la portada
        const documentInfo = {
          title: docInfo.title,
          createdAt: docInfo.created_at,
          uploadedBy: docInfo.uploader_name || 'Sistema'
        };

        // Generar la página de portada
        await addCoverPageWithSigners(pdfPath, signers, documentInfo);

        console.log('✅ Página de portada generada exitosamente');
      } catch (coverError) {
        console.error('❌ Error al generar página de portada:', coverError);
        // No lanzamos el error para que no falle la asignación de firmantes
        // Solo registramos el error en los logs
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
      // file_path ya incluye 'uploads/', así que lo quitamos para construir la ruta correcta
      const relativePath = doc.file_path.replace(/^uploads\//, '');
      const filePath = path.join(__dirname, '..', 'uploads', relativePath);

      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`🗑️ Archivo eliminado: ${filePath}`);
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

      // Validar orden secuencial - el usuario debe ser el siguiente en la fila para rechazar
      const orderCheck = await query(
        `SELECT ds.order_position, ds.user_id
        FROM document_signers ds
        WHERE ds.document_id = $1 AND ds.user_id = $2`,
        [documentId, user.id]
      );

      if (orderCheck.rows.length === 0) {
        throw new Error('No estás asignado a este documento');
      }

      const currentOrder = orderCheck.rows[0].order_position;

      // Si no es el primer firmante, validar que el anterior haya firmado
      if (currentOrder > 1) {
        const previousSignerCheck = await query(
          `SELECT s.status, u.name as signer_name
          FROM document_signers ds
          JOIN signatures s ON s.document_id = ds.document_id AND s.signer_id = ds.user_id
          JOIN users u ON u.id = ds.user_id
          WHERE ds.document_id = $1 AND ds.order_position = $2`,
          [documentId, currentOrder - 1]
        );

        if (previousSignerCheck.rows.length === 0) {
          throw new Error('Error al verificar el orden de firma');
        }

        const previousSigner = previousSignerCheck.rows[0];

        if (previousSigner.status !== 'signed') {
          throw new Error(`Solo puedes rechazar cuando ${previousSigner.signer_name} haya firmado primero (Firmante #${currentOrder - 1})`);
        }
      }

      const now = new Date().toISOString();

      // Actualizar la firma del usuario a rechazada con la razón y fecha
      await query(
        'UPDATE signatures SET status = $1, rejection_reason = $2, rejected_at = $3, signed_at = $3 WHERE document_id = $4 AND signer_id = $5',
        ['rejected', reason || '', now, documentId, user.id]
      );

      // Recalcular el estado del documento basado en todas las firmas
      const statusResult = await query(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'signed' THEN 1 ELSE 0 END) as signed,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
        FROM signatures
        WHERE document_id = $1`,
        [documentId]
      );

      const stats = statusResult.rows[0];
      const total = parseInt(stats.total);
      const signed = parseInt(stats.signed);
      const rejected = parseInt(stats.rejected);

      // Determinar el nuevo estado del documento
      let newStatus = 'pending';

      if (rejected > 0) {
        // Si hay alguna firma rechazada, el documento está rechazado
        newStatus = 'rejected';
      } else if (total > 0 && signed === total) {
        // Si todas las firmas están completas, el documento está completado
        newStatus = 'completed';
      } else if (signed > 0 && signed < total) {
        // Si hay algunas firmas pero no todas, está en progreso
        newStatus = 'in_progress';
      }

      // Actualizar el estado del documento
      await query(
        'UPDATE documents SET status = $1 WHERE id = $2',
        [newStatus, documentId]
      );

      // Auditoría
      await query(
        'INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
        [user.id, 'reject', 'document', documentId, JSON.stringify({ reason })]
      );

      // ========== ACTUALIZAR PÁGINA DE FIRMANTES ==========
      try {
        console.log(`📋 Actualizando página de firmantes para documento ${documentId}...`);

        // Obtener información del documento
        const docInfoResult = await query(
          `SELECT d.*, u.name as uploader_name
          FROM documents d
          LEFT JOIN users u ON d.uploaded_by = u.id
          WHERE d.id = $1`,
          [documentId]
        );

        if (docInfoResult.rows.length > 0) {
          const docInfo = docInfoResult.rows[0];

          // Obtener firmantes con estados actualizados
          const signersResult = await query(
            `SELECT u.id, u.name, u.email, ds.order_position,
                    COALESCE(s.status, 'pending') as status,
                    s.signed_at,
                    s.rejected_at
            FROM document_signers ds
            JOIN users u ON ds.user_id = u.id
            LEFT JOIN signatures s ON s.document_id = ds.document_id AND s.signer_id = ds.user_id
            WHERE ds.document_id = $1
            ORDER BY ds.order_position ASC`,
            [documentId]
          );

          const signers = signersResult.rows;
          const pdfPath = path.join(__dirname, '..', docInfo.file_path);

          const documentInfo = {
            title: docInfo.title,
            createdAt: docInfo.created_at,
            uploadedBy: docInfo.uploader_name || 'Sistema'
          };

          // Actualizar la página de firmantes
          await updateSignersPage(pdfPath, signers, documentInfo);

          console.log('✅ Página de firmantes actualizada después de rechazar');
        }
      } catch (updateError) {
        console.error('❌ Error al actualizar página de firmantes:', updateError);
        // No lanzamos el error para que no falle el rechazo
      }

      return true;
    },

    // Firmar documento
    signDocument: async (_, { documentId, signatureData }, { user }) => {
      if (!user) throw new Error('No autenticado');

      // Validar orden secuencial de firma
      const orderCheck = await query(
        `SELECT ds.order_position, ds.user_id
        FROM document_signers ds
        WHERE ds.document_id = $1 AND ds.user_id = $2`,
        [documentId, user.id]
      );

      if (orderCheck.rows.length === 0) {
        throw new Error('No estás asignado para firmar este documento');
      }

      const currentOrder = orderCheck.rows[0].order_position;

      // Si no es el primer firmante (order_position > 1), validar que el anterior haya firmado
      if (currentOrder > 1) {
        const previousSignerCheck = await query(
          `SELECT s.status, u.name as signer_name
          FROM document_signers ds
          JOIN signatures s ON s.document_id = ds.document_id AND s.signer_id = ds.user_id
          JOIN users u ON u.id = ds.user_id
          WHERE ds.document_id = $1 AND ds.order_position = $2`,
          [documentId, currentOrder - 1]
        );

        if (previousSignerCheck.rows.length === 0) {
          throw new Error('Error al verificar el orden de firma');
        }

        const previousSigner = previousSignerCheck.rows[0];

        if (previousSigner.status !== 'signed') {
          throw new Error(`Debes esperar a que ${previousSigner.signer_name} firme el documento primero (Firmante #${currentOrder - 1})`);
        }
      }

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

      // Recalcular el estado del documento basado en todas las firmas
      const statusResult = await query(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'signed' THEN 1 ELSE 0 END) as signed,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
        FROM signatures
        WHERE document_id = $1`,
        [documentId]
      );

      const stats = statusResult.rows[0];
      const total = parseInt(stats.total);
      const signed = parseInt(stats.signed);
      const pending = parseInt(stats.pending);
      const rejected = parseInt(stats.rejected);

      // Determinar el nuevo estado del documento
      let newStatus = 'pending';
      let shouldSetCompletedAt = false;

      if (rejected > 0) {
        // Si hay alguna firma rechazada, el documento está rechazado
        newStatus = 'rejected';
      } else if (total > 0 && signed === total) {
        // Si todas las firmas están completas, el documento está completado
        newStatus = 'completed';
        shouldSetCompletedAt = true;
      } else if (signed > 0 && signed < total) {
        // Si hay algunas firmas pero no todas, está en progreso
        newStatus = 'in_progress';
      } else if (pending > 0 && signed === 0) {
        // Si hay firmas pendientes pero ninguna firmada, está pendiente
        newStatus = 'pending';
      }

      // Actualizar el estado del documento
      if (shouldSetCompletedAt) {
        await query(
          'UPDATE documents SET status = $1, completed_at = CURRENT_TIMESTAMP WHERE id = $2',
          [newStatus, documentId]
        );
      } else {
        await query(
          'UPDATE documents SET status = $1 WHERE id = $2',
          [newStatus, documentId]
        );
      }

      // Auditoría
      await query(
        'INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1, $2, $3, $4)',
        [user.id, 'sign', 'document', documentId]
      );

      // ========== ACTUALIZAR PÁGINA DE FIRMANTES ==========
      try {
        console.log(`📋 Actualizando página de firmantes para documento ${documentId}...`);

        // Obtener información del documento
        const docInfoResult = await query(
          `SELECT d.*, u.name as uploader_name
          FROM documents d
          LEFT JOIN users u ON d.uploaded_by = u.id
          WHERE d.id = $1`,
          [documentId]
        );

        if (docInfoResult.rows.length > 0) {
          const docInfo = docInfoResult.rows[0];

          // Obtener firmantes con estados actualizados
          const signersResult = await query(
            `SELECT u.id, u.name, u.email, ds.order_position,
                    COALESCE(s.status, 'pending') as status,
                    s.signed_at,
                    s.rejected_at
            FROM document_signers ds
            JOIN users u ON ds.user_id = u.id
            LEFT JOIN signatures s ON s.document_id = ds.document_id AND s.signer_id = ds.user_id
            WHERE ds.document_id = $1
            ORDER BY ds.order_position ASC`,
            [documentId]
          );

          const signers = signersResult.rows;
          const pdfPath = path.join(__dirname, '..', docInfo.file_path);

          const documentInfo = {
            title: docInfo.title,
            createdAt: docInfo.created_at,
            uploadedBy: docInfo.uploader_name || 'Sistema'
          };

          // Actualizar la página de firmantes
          await updateSignersPage(pdfPath, signers, documentInfo);

          console.log('✅ Página de firmantes actualizada después de firmar');
        }
      } catch (updateError) {
        console.error('❌ Error al actualizar página de firmantes:', updateError);
        // No lanzamos el error para que no falle la firma
      }

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
    // Campos presentes solo en signedDocuments
    signedAt: (parent) => parent.signed_at,
    signatureType: (parent) => parent.signature_type,

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
    rejectionReason: (parent) => parent.rejection_reason,
    rejectedAt: (parent) => parent.rejected_at,
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

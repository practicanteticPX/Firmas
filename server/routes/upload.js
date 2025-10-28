const express = require('express');
const path = require('path');
const fs = require('fs');
const { uploadSinglePDF, uploadMultiplePDFs, normalizeUserName, uploadDir } = require('../utils/fileUpload');
const { query } = require('../database/db');
const jwt = require('jsonwebtoken');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'tu-secreto-super-seguro-cambiar-en-produccion';

/**
 * Middleware para verificar autenticaciÃ³n y cargar datos del usuario
 */
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'No autorizado' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    // Cargar nombre del usuario desde la base de datos
    const userResult = await query('SELECT id, name, email, role FROM users WHERE id = $1', [decoded.id]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Usuario no encontrado' });
    }

    req.user = userResult.rows[0];
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token invÃ¡lido' });
  }
};

/**
 * POST /api/upload
 * Endpoint para subir documentos PDF
 */
router.post('/upload', authenticate, (req, res) => {
  uploadSinglePDF(req, res, async (err) => {
    if (err) {
      console.error('Error en subida:', err);
      return res.status(400).json({
        success: false,
        message: err.message || 'Error al subir el archivo'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No se ha proporcionado ningÃºn archivo'
      });
    }

    const { title, description, groupTitle } = req.body;


    try {
      // Construir ruta: usuario/(grupo?)/archivo.pdf
      const normalizedUserName = normalizeUserName(req.user.name);
      const groupLabel = (groupTitle || title || '').trim();
      const normalizedGroup = groupLabel ? normalizeUserName(groupLabel) : '';

      let relativePath = `uploads/${normalizedUserName}/${req.file.filename}`;
      if (normalizedGroup) {
        const userBaseDir = path.join(uploadDir, normalizedUserName);
        const groupDir = path.join(userBaseDir, normalizedGroup);
        if (!fs.existsSync(groupDir)) fs.mkdirSync(groupDir, { recursive: true });
        const currentPath = req.file.path;
        const newPath = path.join(groupDir, req.file.filename);
        try {
          fs.renameSync(currentPath, newPath);
          relativePath = `uploads/${normalizedUserName}/${normalizedGroup}/${req.file.filename}`;
        } catch (moveErr) {
          console.error('Error moviendo archivo a carpeta de grupo:', moveErr);
        }
      }

      // TÃ­tulo real del documento = nombre del archivo sin extensiÃ³n
      const docTitle = path.basename(req.file.originalname, path.extname(req.file.originalname));

      // Guardar el documento en la base de datos
      const result = await query(
        `INSERT INTO documents (
          title,
          description,
          file_name,
          file_path,
          file_size,
          mime_type,
          status,
          uploaded_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          docTitle,
          description?.trim() || null,
          req.file.filename,
          relativePath,
          req.file.size,
          req.file.mimetype,
          'pending',
          req.user.id
        ]
      );

      const document = result.rows[0];

      // Registrar en auditorÃ­a
      await query(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          req.user.id,
          'upload',
          'document',
          document.id,
          JSON.stringify({ title, file_name: req.file.filename }),
          req.ip
        ]
      );

      console.log(`âœ… Documento subido: ${document.title} (ID: ${document.id})`);

      res.json({
        success: true,
        message: 'Documento subido exitosamente',
        document: {
          id: document.id,
          title: document.title,
          description: document.description,
          fileName: document.file_name,
          fileSize: document.file_size,
          status: document.status,
          createdAt: document.created_at
        }
      });
    } catch (dbError) {
      console.error('Error en base de datos:', dbError);

      // Si hay error, intentar eliminar el archivo subido
      const fs = require('fs');
      if (req.file && req.file.path) {
        fs.unlink(req.file.path, (unlinkErr) => {
          if (unlinkErr) console.error('Error al eliminar archivo:', unlinkErr);
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error al guardar el documento en la base de datos'
      });
    }
  });
});

/**
 * POST /api/upload-multiple
 * Endpoint para subir mÃºltiples documentos PDF
 */
router.post('/upload-multiple', authenticate, (req, res) => {
  uploadMultiplePDFs(req, res, async (err) => {
    if (err) {
      console.error('Error en subida mÃºltiple:', err);
      return res.status(400).json({
        success: false,
        message: err.message || 'Error al subir los archivos'
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No se han proporcionado archivos'
      });
    }

    const { title, description, groupTitle } = req.body;

    const created = [];
    try {
      const normalizedUserName = normalizeUserName(req.user.name);
      const groupLabel = (groupTitle || title || '').trim();
      const normalizedGroup = groupLabel ? normalizeUserName(groupLabel) : '';

      for (const f of req.files) {
        let relativePath = `uploads/${normalizedUserName}/${f.filename}`;
        if (normalizedGroup) {
          const userBaseDir = path.join(uploadDir, normalizedUserName);
          const groupDir = path.join(userBaseDir, normalizedGroup);
          if (!fs.existsSync(groupDir)) fs.mkdirSync(groupDir, { recursive: true });
          const currentPath = f.path;
          const newPath = path.join(groupDir, f.filename);
          try {
            fs.renameSync(currentPath, newPath);
            relativePath = `uploads/${normalizedUserName}/${normalizedGroup}/${f.filename}`;
          } catch (moveErr) {
            console.error('Error moviendo archivo (mÃºltiple) a carpeta de grupo:', moveErr);
          }
        }
        const docTitle = path.basename(f.originalname, path.extname(f.originalname));
        const result = await query(
          `INSERT INTO documents (
            title,
            description,
            file_name,
            file_path,
            file_size,
            mime_type,
            status,
            uploaded_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *`,
          [
            docTitle,
            description?.trim() || null,
            f.filename,
            relativePath,
            f.size,
            f.mimetype,
            'pending',
            req.user.id
          ]
        );
        const document = result.rows[0];

        await query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, ip_address)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            req.user.id,
            'upload',
            'document',
            document.id,
            JSON.stringify({ title, file_name: f.filename }),
            req.ip
          ]
        );
        created.push(document);
      }

      console.log(`âœ” Documentos subidos: ${created.length}`);
      return res.json({
        success: true,
        message: `Se subieron ${created.length} documento(s) exitosamente`,
        documents: created.map(d => ({
          id: d.id,
          title: d.title,
          description: d.description,
          fileName: d.file_name,
          fileSize: d.file_size,
          status: d.status,
          createdAt: d.created_at
        }))
      });
    } catch (dbError) {
      console.error('Error en base de datos (mÃºltiple):', dbError);
      // No intentamos borrar archivos aquÃ­ para evitar inconsistencias si ya hay registros
      return res.status(500).json({
        success: false,
        message: 'Error al guardar los documentos en la base de datos'
      });
    }
  });
});

module.exports = router;

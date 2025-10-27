const express = require('express');
const path = require('path');
const { uploadSinglePDF } = require('../utils/fileUpload');
const { query } = require('../database/db');
const jwt = require('jsonwebtoken');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'tu-secreto-super-seguro-cambiar-en-produccion';

/**
 * Middleware para verificar autenticación
 */
const authenticate = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'No autorizado' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token inválido' });
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
        message: 'No se ha proporcionado ningún archivo'
      });
    }

    const { title, description } = req.body;

    if (!title || title.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'El título es obligatorio'
      });
    }

    try {
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
          title.trim(),
          description?.trim() || null,
          req.file.filename,
          req.file.path,
          req.file.size,
          req.file.mimetype,
          'pending',
          req.user.id
        ]
      );

      const document = result.rows[0];

      // Registrar en auditoría
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

      console.log(`✅ Documento subido: ${document.title} (ID: ${document.id})`);

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

module.exports = router;

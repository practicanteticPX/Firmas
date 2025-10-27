const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Asegurarse de que la carpeta uploads existe
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuración de almacenamiento
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generar nombre único: timestamp-random-original.pdf
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const nameWithoutExt = path.basename(file.originalname, ext);
    cb(null, `${nameWithoutExt}-${uniqueSuffix}${ext}`);
  }
});

// Filtro para aceptar solo PDFs
const fileFilter = (req, file, cb) => {
  // Aceptar solo PDFs
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos PDF'), false);
  }
};

// Configurar multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB máximo
  }
});

/**
 * Middleware para manejar la subida de un solo archivo PDF
 */
const uploadSinglePDF = upload.single('file');

/**
 * Elimina un archivo del sistema de archivos
 * @param {string} filePath - Ruta del archivo a eliminar
 */
const deleteFile = (filePath) => {
  return new Promise((resolve, reject) => {
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error('Error al eliminar archivo:', err);
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

/**
 * Obtiene el tamaño de un archivo
 * @param {string} filePath - Ruta del archivo
 * @returns {Promise<number>} Tamaño en bytes
 */
const getFileSize = (filePath) => {
  return new Promise((resolve, reject) => {
    fs.stat(filePath, (err, stats) => {
      if (err) {
        reject(err);
      } else {
        resolve(stats.size);
      }
    });
  });
};

/**
 * Verifica si un archivo existe
 * @param {string} filePath - Ruta del archivo
 * @returns {Promise<boolean>}
 */
const fileExists = (filePath) => {
  return new Promise((resolve) => {
    fs.access(filePath, fs.constants.F_OK, (err) => {
      resolve(!err);
    });
  });
};

module.exports = {
  uploadSinglePDF,
  deleteFile,
  getFileSize,
  fileExists,
  uploadDir,
};

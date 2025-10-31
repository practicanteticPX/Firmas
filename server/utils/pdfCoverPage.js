const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');

/**
 * Genera una página de información de firmantes al final del PDF
 * @param {string} pdfPath - Ruta al PDF original
 * @param {Array} signers - Array de firmantes con {name, email, order_position, status}
 * @param {Object} documentInfo - Información del documento {title, createdAt, uploadedBy}
 * @returns {Promise<Buffer>} PDF con página de información agregada
 */
async function addCoverPageWithSigners(pdfPath, signers, documentInfo) {
  try {
    console.log(`📄 Agregando página de información de firmantes a: ${path.basename(pdfPath)}`);

    // Leer el PDF original
    const existingPdfBytes = await fs.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);

    // Crear una nueva página AL FINAL del documento
    const coverPage = pdfDoc.addPage([595.28, 841.89]); // A4 en puntos

    // Cargar fuentes
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const { width, height } = coverPage.getSize();
    const margin = 50;
    let yPosition = height - margin;

    // ========== HEADER ==========
    // Logo/Título del sistema
    coverPage.drawRectangle({
      x: 0,
      y: height - 80,
      width: width,
      height: 80,
      color: rgb(0.4, 0.42, 0.95), // Color morado/azul
    });

    coverPage.drawText('SISTEMA DE FIRMAS DIGITALES', {
      x: margin,
      y: height - 45,
      size: 20,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    coverPage.drawText('PREXXA', {
      x: margin,
      y: height - 65,
      size: 12,
      font: fontRegular,
      color: rgb(1, 1, 1),
    });

    yPosition = height - 120;

    // ========== INFORMACIÓN DEL DOCUMENTO ==========
    coverPage.drawText('INFORMACIÓN DEL DOCUMENTO', {
      x: margin,
      y: yPosition,
      size: 14,
      font: fontBold,
      color: rgb(0.2, 0.2, 0.2),
    });

    yPosition -= 30;

    // Título del documento
    coverPage.drawText('Título:', {
      x: margin,
      y: yPosition,
      size: 11,
      font: fontBold,
      color: rgb(0.3, 0.3, 0.3),
    });

    const titleText = documentInfo.title || 'Sin título';
    const maxTitleLength = 60;
    const displayTitle = titleText.length > maxTitleLength
      ? titleText.substring(0, maxTitleLength) + '...'
      : titleText;

    coverPage.drawText(displayTitle, {
      x: margin + 100,
      y: yPosition,
      size: 11,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });

    yPosition -= 25;

    // Fecha de creación
    coverPage.drawText('Fecha de creación:', {
      x: margin,
      y: yPosition,
      size: 11,
      font: fontBold,
      color: rgb(0.3, 0.3, 0.3),
    });

    const createdDate = documentInfo.createdAt
      ? new Date(documentInfo.createdAt).toLocaleString('es-ES', { timeZone: 'America/Bogota' })
      : new Date().toLocaleString('es-ES', { timeZone: 'America/Bogota' });

    coverPage.drawText(createdDate, {
      x: margin + 100,
      y: yPosition,
      size: 11,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });

    yPosition -= 25;

    // Creado por
    coverPage.drawText('Creado por:', {
      x: margin,
      y: yPosition,
      size: 11,
      font: fontBold,
      color: rgb(0.3, 0.3, 0.3),
    });

    coverPage.drawText(documentInfo.uploadedBy || 'Sistema', {
      x: margin + 100,
      y: yPosition,
      size: 11,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });

    yPosition -= 40;

    // ========== LISTA DE FIRMANTES ==========
    coverPage.drawText('FIRMANTES ASIGNADOS', {
      x: margin,
      y: yPosition,
      size: 14,
      font: fontBold,
      color: rgb(0.2, 0.2, 0.2),
    });

    yPosition -= 10;

    // Línea separadora
    coverPage.drawLine({
      start: { x: margin, y: yPosition },
      end: { x: width - margin, y: yPosition },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7),
    });

    yPosition -= 25;

    // Ordenar firmantes por order_position
    const sortedSigners = [...signers].sort((a, b) => a.order_position - b.order_position);

    // Dibujar cada firmante
    for (let i = 0; i < sortedSigners.length; i++) {
      const signer = sortedSigners[i];

      // Si no hay espacio suficiente, mostrar mensaje
      if (yPosition < 100) {
        coverPage.drawText('...y más firmantes (ver documento completo)', {
          x: margin + 40,
          y: yPosition,
          size: 10,
          font: fontRegular,
          color: rgb(0.5, 0.5, 0.5),
        });
        break;
      }

      // Dibujar badge de orden
      const badgeSize = 24;
      const badgeX = margin + 10;

      coverPage.drawCircle({
        x: badgeX,
        y: yPosition + 5,
        size: badgeSize / 2,
        color: rgb(0.4, 0.42, 0.95),
      });

      coverPage.drawText(signer.order_position.toString(), {
        x: badgeX - (signer.order_position < 10 ? 4 : 7),
        y: yPosition + 1,
        size: 12,
        font: fontBold,
        color: rgb(1, 1, 1),
      });

      // Nombre del firmante
      const signerName = signer.name || 'Sin nombre';
      const maxNameLength = 40;
      const displayName = signerName.length > maxNameLength
        ? signerName.substring(0, maxNameLength) + '...'
        : signerName;

      coverPage.drawText(displayName, {
        x: margin + 45,
        y: yPosition + 8,
        size: 11,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      // Email del firmante
      const signerEmail = signer.email || '';
      const maxEmailLength = 45;
      const displayEmail = signerEmail.length > maxEmailLength
        ? signerEmail.substring(0, maxEmailLength) + '...'
        : signerEmail;

      coverPage.drawText(displayEmail, {
        x: margin + 45,
        y: yPosition - 7,
        size: 9,
        font: fontRegular,
        color: rgb(0.4, 0.4, 0.4),
      });

      // Estado dinámico basado en el status real
      let statusText = '[ PENDIENTE ]';
      let statusColor = rgb(0.8, 0.6, 0); // Amarillo/naranja
      let dateTimeText = '';

      if (signer.status === 'signed') {
        statusText = '[ FIRMADO ]';
        statusColor = rgb(0.13, 0.55, 0.13); // Verde

        // Mostrar fecha y hora de firma
        if (signer.signed_at) {
          const signedDate = new Date(signer.signed_at);
          dateTimeText = signedDate.toLocaleString('es-ES', {
            timeZone: 'America/Bogota',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
        }
      } else if (signer.status === 'rejected') {
        statusText = '[ RECHAZADO ]';
        statusColor = rgb(0.86, 0.15, 0.15); // Rojo

        // Mostrar fecha y hora de rechazo
        if (signer.rejected_at) {
          const rejectedDate = new Date(signer.rejected_at);
          dateTimeText = rejectedDate.toLocaleString('es-ES', {
            timeZone: 'America/Bogota',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
        }
      }

      coverPage.drawText(statusText, {
        x: width - margin - 85,
        y: yPosition + 8,
        size: 9,
        font: fontBold,
        color: statusColor,
      });

      // Mostrar fecha/hora si existe
      if (dateTimeText) {
        coverPage.drawText(dateTimeText, {
          x: width - margin - 85,
          y: yPosition - 5,
          size: 7,
          font: fontRegular,
          color: rgb(0.5, 0.5, 0.5),
        });
      }

      yPosition -= 45;
    }

    // ========== FOOTER ==========
    const footerY = 60;

    coverPage.drawLine({
      start: { x: margin, y: footerY + 20 },
      end: { x: width - margin, y: footerY + 20 },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });

    coverPage.drawText('IMPORTANTE: Este documento requiere firma secuencial.', {
      x: margin,
      y: footerY,
      size: 9,
      font: fontBold,
      color: rgb(0.8, 0.3, 0.3),
    });

    coverPage.drawText('Cada firmante debe esperar a que el anterior complete su firma.', {
      x: margin,
      y: footerY - 12,
      size: 8,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
    });

    coverPage.drawText(`Página generada automáticamente el ${new Date().toLocaleString('es-ES', { timeZone: 'America/Bogota' })}`, {
      x: margin,
      y: footerY - 30,
      size: 7,
      font: fontRegular,
      color: rgb(0.6, 0.6, 0.6),
    });

    // Guardar el PDF modificado
    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(pdfPath, pdfBytes);

    console.log(`✅ Página de firmantes agregada exitosamente`);

    return pdfBytes;
  } catch (error) {
    console.error('❌ Error al agregar página de firmantes:', error);
    throw error;
  }
}

/**
 * Actualiza la última página del PDF con los estados actualizados de firmantes
 * @param {string} pdfPath - Ruta al PDF
 * @param {Array} signers - Array de firmantes con {name, email, order_position, status}
 * @param {Object} documentInfo - Información del documento
 */
async function updateSignersPage(pdfPath, signers, documentInfo) {
  try {
    console.log(`🔄 Actualizando página de firmantes en: ${path.basename(pdfPath)}`);

    // Leer el PDF existente
    const existingPdfBytes = await fs.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);

    const pageCount = pdfDoc.getPageCount();

    // Eliminar la última página (la hoja de firmantes anterior)
    if (pageCount > 1) {
      pdfDoc.removePage(pageCount - 1);
      console.log(`🗑️  Página anterior eliminada`);
    }

    // Guardar el PDF sin la última página
    const pdfBytesWithoutLast = await pdfDoc.save();
    await fs.writeFile(pdfPath, pdfBytesWithoutLast);

    // Ahora agregar la nueva página con estados actualizados
    await addCoverPageWithSigners(pdfPath, signers, documentInfo);

    console.log(`✅ Página de firmantes actualizada exitosamente`);
  } catch (error) {
    console.error('❌ Error al actualizar página de firmantes:', error);
    throw error;
  }
}

module.exports = {
  addCoverPageWithSigners,
  updateSignersPage,
};

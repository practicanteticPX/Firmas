import { useState, useEffect } from 'react';
import axios from 'axios';
import './Dashboard.css';
import './Dashboard.overrides.css';

// Determinar el host del backend basándose en el hostname actual
const getBackendHost = () => {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol; // http: o https:

  // Usar el mismo host desde donde se accede, solo cambiar el puerto
  return `${protocol}//${hostname}:5001`;
};

const BACKEND_HOST = getBackendHost();
const API_URL = `${BACKEND_HOST}/graphql`;
const API_UPLOAD_URL = `${BACKEND_HOST}/api/upload`;
const API_UPLOAD_MULTI_URL = `${BACKEND_HOST}/api/upload-multiple`;
const API_UPLOAD_UNIFIED_URL = `${BACKEND_HOST}/api/upload-unified`;

// Log para debug
console.log('🔗 Backend URL:', API_URL);

function Dashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('upload');
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [documentTitle, setDocumentTitle] = useState('');
  const [documentDescription, setDocumentDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Estados para datos reales
  const [pendingDocuments, setPendingDocuments] = useState([]);
  const [signedDocuments, setSignedDocuments] = useState([]);
  const [myDocuments, setMyDocuments] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [loadingSigned, setLoadingSigned] = useState(false);
  const [loadingMy, setLoadingMy] = useState(false);
  const [viewingDocument, setViewingDocument] = useState(null);
  const [isViewingPending, setIsViewingPending] = useState(false);
  const [showSignConfirm, setShowSignConfirm] = useState(false);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [showDescription, setShowDescription] = useState(false);

  // Estados para firmantes
  const [availableSigners, setAvailableSigners] = useState([]);
  const [selectedSigners, setSelectedSigners] = useState([]);
  const [loadingSigners, setLoadingSigners] = useState(false);

  // Estados para modal de gestión de firmantes
  const [managingDocument, setManagingDocument] = useState(null);
  const [documentSigners, setDocumentSigners] = useState([]);
  const [loadingDocumentSigners, setLoadingDocumentSigners] = useState(false);
  const [modalSelectedSigners, setModalSelectedSigners] = useState([]);
  // Estado para confirmación de eliminación
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteDocId, setDeleteDocId] = useState(null);
  const [deleteDocTitle, setDeleteDocTitle] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Estados para lista de archivos mejorada
  const [unifyPDFs, setUnifyPDFs] = useState(true);
  const [draggedIndex, setDraggedIndex] = useState(null);

  // Estados para Stepper funcional de MUI (3 pasos)
  const steps = ['Cargar documentos', 'Añadir firmantes', 'Enviar'];
  const [activeStep, setActiveStep] = useState(0);
  const [completed, setCompleted] = useState({});

  // Funciones del Stepper
  const totalSteps = () => steps.length;
  const completedSteps = () => Object.keys(completed).length;
  const isLastStep = () => activeStep === totalSteps() - 1;
  const allStepsCompleted = () => completedSteps() === totalSteps();

  const handleNext = () => {
    const newActiveStep =
      isLastStep() && !allStepsCompleted()
        ? steps.findIndex((step, i) => !(i in completed))
        : activeStep + 1;
    setActiveStep(newActiveStep);
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const handleStepClick = (step) => () => {
    setActiveStep(step);
  };

  const handleComplete = () => {
    setCompleted({
      ...completed,
      [activeStep]: true,
    });
    handleNext();
  };

  const handleReset = () => {
    setActiveStep(0);
    setCompleted({});
    setSelectedFiles([]);
    setSelectedSigners([]);
    setDocumentTitle('');
    setDocumentDescription('');
    setUploadSuccess(false);
    setError('');
  };

  // Validar si el paso actual está completo para poder avanzar
  const canProceedToNextStep = () => {
    switch (activeStep) {
      case 0: // Cargar documentos
        return selectedFiles && selectedFiles.length > 0 && documentTitle.trim().length > 0;
      case 1: // Añadir firmantes
        return selectedSigners && selectedSigners.length > 0;
      case 2: // Enviar
        return true;
      default:
        return false;
    }
  };

  // Cargar documentos pendientes al montar o cambiar de tab
  useEffect(() => {
    if (activeTab === 'pending') {
      loadPendingDocuments();
    }
  }, [activeTab]);

  // Cargar mis documentos al montar o cambiar de tab
  useEffect(() => {
    if (activeTab === 'my-documents') {
      loadMyDocuments();
    }
  }, [activeTab]);

  // Cargar documentos firmados al montar o cambiar de tab
  useEffect(() => {
    if (activeTab === 'signed') {
      loadSignedDocuments();
    }
  }, [activeTab]);

  // Cargar firmantes disponibles al montar o cambiar a tab upload
  useEffect(() => {
    if (activeTab === 'upload') {
      loadAvailableSigners();
    }
  }, [activeTab]);

  /**
   * Cargar documentos pendientes de firma desde GraphQL
   */
  const loadPendingDocuments = async () => {
    setLoadingPending(true);
    try {
      const token = localStorage.getItem('token');

      const response = await axios.post(
        API_URL,
        {
          query: `
            query {
              pendingDocuments {
                id
                title
                description
                filePath
                uploadedBy {
                  name
                  email
                }
                createdAt
                status
              }
            }
          `
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      setPendingDocuments(response.data.data.pendingDocuments || []);
    } catch (err) {
      console.error('Error al cargar documentos pendientes:', err);
      setError('Error al cargar documentos pendientes');
    } finally {
      setLoadingPending(false);
    }
  };

  /**
   * Cargar documentos firmados desde GraphQL
   */
  const loadSignedDocuments = async () => {
    setLoadingSigned(true);
    try {
      const token = localStorage.getItem('token');

      const response = await axios.post(
        API_URL,
        {
          query: `
            query {
              signedDocuments {
                id
                title
                description
                filePath
                fileName
                fileSize
                uploadedBy {
                  name
                  email
                }
                createdAt
                status
                signedAt
                signatureType
              }
            }
          `
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      setSignedDocuments(response.data.data.signedDocuments || []);
    } catch (err) {
      console.error('Error al cargar documentos firmados:', err);
      setError('Error al cargar documentos firmados');
    } finally {
      setLoadingSigned(false);
    }
  };

  /**
   * Cargar mis documentos desde GraphQL
   */
  const loadMyDocuments = async () => {
    setLoadingMy(true);
    try {
      const token = localStorage.getItem('token');

      const response = await axios.post(
        API_URL,
        {
          query: `
            query {
              myDocuments {
                id
                title
                description
                fileName
                filePath
                fileSize
                status
                createdAt
                totalSigners
                signedCount
                pendingCount
              }
            }
          `
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      setMyDocuments(response.data.data.myDocuments || []);
    } catch (err) {
      console.error('Error al cargar mis documentos:', err);
      setError('Error al cargar mis documentos');
    } finally {
      setLoadingMy(false);
    }
  };

  /**
   * Cargar usuarios disponibles como firmantes desde GraphQL
   */
  const loadAvailableSigners = async () => {
    setLoadingSigners(true);
    try {
      const token = localStorage.getItem('token');

      const response = await axios.post(
        API_URL,
        {
          query: `
            query {
              availableSigners {
                id
                name
                email
                role
              }
            }
          `
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      setAvailableSigners(response.data.data.availableSigners || []);
    } catch (err) {
      console.error('Error al cargar firmantes:', err);
      setError('Error al cargar firmantes disponibles');
    } finally {
      setLoadingSigners(false);
    }
  };

  const validateFile = (file) => {
    if (file.type !== 'application/pdf') {
      setError('Solo se permiten archivos PDF');
      return false;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('El archivo es demasiado grande. máximo 10MB');
      return false;
    }

    return true;
  };

  const validateFiles = (files) => {
    const valid = [];
    for (const f of files) {
      if (!validateFile(f)) return null;
      valid.push(f);
    }
    return valid;
  };

  /**
   * Alternar selección de un firmante
   */
  const toggleSigner = (signerId) => {
    setSelectedSigners(prev => {
      if (prev.includes(signerId)) {
        return prev.filter(id => id !== signerId);
      } else {
        return [...prev, signerId];
      }
    });
  };

  /**
   * Seleccionar todos los firmantes
   */
  const selectAllSigners = () => {
    setSelectedSigners(availableSigners.map(s => s.id));
  };

  /**
   * Deseleccionar todos los firmantes
   */
  const clearSelectedSigners = () => {
    setSelectedSigners([]);
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validar máximo 10 archivos
    const currentCount = selectedFiles.length;
    const newCount = currentCount + files.length;
    if (newCount > 10) {
      setError(`Máximo 10 archivos permitidos. Ya tienes ${currentCount} archivo(s) seleccionado(s).`);
      return;
    }

    const valid = validateFiles(files);
    if (!valid) return;
    const merge = (current, incoming) => {
      const map = new Map((current || []).map(f => [f.name + ':' + f.size, true]));
      const result = [...(current || [])];
      for (const f of incoming) {
        const k = f.name + ':' + f.size;
        if (!map.has(k)) {
          // Validar que no se exceda el límite
          if (result.length < 10) {
            result.push(f);
            map.set(k, true);
          }
        }
      }
      return result;
    };
    setSelectedFiles(prev => merge(prev, valid));
    setSelectedFile(prev => prev || valid[0]);
    setError('');
    setUploadSuccess(false);
  };

  // Drag & Drop handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      // Validar máximo 10 archivos
      const currentCount = selectedFiles.length;
      const newCount = currentCount + files.length;
      if (newCount > 10) {
        setError(`Máximo 10 archivos permitidos. Ya tienes ${currentCount} archivo(s) seleccionado(s).`);
        return;
      }

      const valid = validateFiles(files);
      if (!valid) return;
      const merge = (current, incoming) => {
        const map = new Map((current || []).map(f => [f.name + ':' + f.size, true]));
        const result = [...(current || [])];
        for (const f of incoming) {
          const k = f.name + ':' + f.size;
          if (!map.has(k)) {
            // Validar que no se exceda el límite
            if (result.length < 10) {
              result.push(f);
              map.set(k, true);
            }
          }
        }
        return result;
      };
      setSelectedFiles(prev => merge(prev, valid));
      setSelectedFile(prev => prev || valid[0]);
      setError('');
      setUploadSuccess(false);
    }
  };

  /**
   * Eliminar un archivo de la lista
   */
  const removeFile = (index) => {
    setSelectedFiles(prev => {
      const newFiles = [...prev];
      newFiles.splice(index, 1);
      return newFiles;
    });

    // Si no quedan archivos, limpiar también selectedFile
    if (selectedFiles.length === 1) {
      setSelectedFile(null);
      const fileInput = document.getElementById('file-input');
      if (fileInput) fileInput.value = '';
    }
  };

  /**
   * Limpiar todos los archivos
   */
  const clearAllFiles = () => {
    setSelectedFile(null);
    setSelectedFiles([]);
    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.value = '';
  };

  /**
   * Manejar el inicio del drag para reordenar archivos
   */
  const handleFileDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('dragging');
  };

  /**
   * Manejar el drag over para reordenar archivos
   */
  const handleFileDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (draggedIndex === null || draggedIndex === index) return;

    // Reordenar los archivos
    setSelectedFiles(prev => {
      const newFiles = [...prev];
      const draggedFile = newFiles[draggedIndex];
      newFiles.splice(draggedIndex, 1);
      newFiles.splice(index, 0, draggedFile);
      return newFiles;
    });

    setDraggedIndex(index);
  };

  /**
   * Manejar el fin del drag
   */
  const handleFileDragEnd = (e) => {
    e.currentTarget.classList.remove('dragging');
    setDraggedIndex(null);
  };

  /**
   * Subir documento REAL usando FormData
   */
  const handleUpload = async (e) => {
    e.preventDefault();

    if (((selectedFiles?.length || 0) === 0 && !selectedFile)) {
      setError('Por favor completa todos los campos');
      return;
    }

    if (selectedSigners.length === 0) {
      setError('Por favor selecciona al menos un firmante');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');

      // Crear FormData para subir el/los archivo(s)
      const formData = new FormData();
      const filesToSend = (selectedFiles && selectedFiles.length > 0) ? selectedFiles : (selectedFile ? [selectedFile] : []);
      if (filesToSend.length === 0) {
        setError('Selecciona al menos un PDF');
        setUploading(false);
        return;
      }
      // Nombre del conjunto (opcional)
      if (documentTitle && documentTitle.trim()) {
        formData.append('groupTitle', documentTitle.trim());
      }
      // Enviar como múltiples si hay más de uno
      if (filesToSend.length > 1) {
        for (const f of filesToSend) formData.append('files', f);
      } else {
        formData.append('file', filesToSend[0]);
      }
      // Ya no usamos 'title' como nombre del documento cuando hay múltiples,
      // el backend usará el nombre real del archivo como título y 'groupTitle' para agrupar.
      formData.append('title', documentTitle.trim());
      if (documentDescription.trim()) {
        formData.append('description', documentDescription.trim());
      }

      // Determinar endpoint según número de archivos y opción de unificar
      let endpoint;
      if (filesToSend.length === 1) {
        endpoint = API_UPLOAD_URL;
      } else {
        // Si hay múltiples archivos y la opción de unificar está activada
        endpoint = unifyPDFs ? API_UPLOAD_UNIFIED_URL : API_UPLOAD_MULTI_URL;
      }
      const uploadResponse = await axios.post(endpoint, formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      if (uploadResponse.data.success && (uploadResponse.data.document || uploadResponse.data.documents)) {
        const documents = uploadResponse.data.documents || [uploadResponse.data.document];

        // Asignar firmantes a cada documento creado
        for (const doc of documents) {
          const assignResponse = await axios.post(
            API_URL,
            {
              query: `
                mutation AssignSigners($documentId: ID!, $userIds: [ID!]!) {
                  assignSigners(documentId: $documentId, userIds: $userIds)
                }
              `,
              variables: {
                documentId: doc.id,
                userIds: selectedSigners
              }
            },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (assignResponse.data.errors) {
            throw new Error(assignResponse.data.errors[0].message);
          }
        }

        setUploadSuccess(true);
        setSelectedFile(null);
        setSelectedFiles([]);
        setDocumentTitle('');
        setDocumentDescription('');
        setSelectedSigners([]);

        // Limpiar el input file
        const fileInput = document.getElementById('file-input');
        if (fileInput) fileInput.value = '';

        // Recargar mis documentos si estamos en esa pestaña
        // recargar "mis documentos" siempre, ya que hay nuevos elementos
        await loadMyDocuments();

        setTimeout(() => setUploadSuccess(false), 5000);
      } else {
        throw new Error(uploadResponse.data.message || 'Error al subir el documento');
      }
    } catch (err) {
      console.error('Error en subida:', err);
      setError(
        err.response?.data?.message ||
        err.message ||
        'Error al subir el documento. Por favor intenta nuevamente.'
      );
    } finally {
      setUploading(false);
    }
  };

  /**
   * Firmar documento REAL usando GraphQL
   */
  const handleSignDocument = async (docId) => {
    try {
      const token = localStorage.getItem('token');

      const response = await axios.post(
        API_URL,
        {
          query: `
            mutation SignDocument($documentId: ID!, $signatureData: String!) {
              signDocument(documentId: $documentId, signatureData: $signatureData) {
                id
                status
                signedAt
              }
            }
          `,
          variables: {
            documentId: docId,
            signatureData: `Firmado por ${user.name || user.email} el ${new Date().toISOString()}`
          }
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      alert('Documento firmado exitosamente');

      // Recargar ambas listas: pendientes y firmados
      await loadPendingDocuments();
      await loadSignedDocuments();
    } catch (err) {
      console.error('Error al firmar:', err);
      alert(err.message || 'Error al firmar el documento');
    }
  };

  /**
   * Rechazar documento con razón
   */
  const handleRejectDocument = async (docId, reason) => {
    try {
      const token = localStorage.getItem('token');

      const response = await axios.post(
        API_URL,
        {
          query: `
            mutation RejectDocument($documentId: ID!, $reason: String!) {
              rejectDocument(documentId: $documentId, reason: $reason) {
                id
                status
                rejectedAt
                rejectedBy {
                  id
                  name
                  email
                }
                rejectionReason
              }
            }
          `,
          variables: {
            documentId: docId,
            reason: reason
          }
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      alert('Documento rechazado');
      // Recargar documentos pendientes
      loadPendingDocuments();
    } catch (err) {
      console.error('Error al rechazar documento:', err);
      alert(err.message || 'Error al rechazar el documento');
    }
  };

  const handleViewDocument = (doc, isPending = false) => {
    // Abrir el visor de PDF con el documento seleccionado
    setViewingDocument(doc);
    setIsViewingPending(isPending);
  };

  const handleCloseViewer = () => {
    setViewingDocument(null);
    setIsViewingPending(false);
    setShowSignConfirm(false);
    setShowRejectConfirm(false);
    setRejectReason('');
    setRejectError('');
    setShowDescription(false);
  };

  const handleOpenSignConfirm = () => {
    setShowSignConfirm(true);
  };

  const handleCancelSign = () => {
    setShowSignConfirm(false);
  };

  const handleConfirmSign = async () => {
    if (viewingDocument) {
      await handleSignDocument(viewingDocument.id);
      setShowSignConfirm(false);
      handleCloseViewer();
    }
  };

  const handleOpenRejectConfirm = () => {
    setShowRejectConfirm(true);
    setRejectReason('');
    setRejectError('');
  };

  const handleCancelReject = () => {
    setShowRejectConfirm(false);
    setRejectReason('');
    setRejectError('');
  };

  const handleRejectReasonChange = (e) => {
    const value = e.target.value;
    setRejectReason(value);
    if (value.length >= 20) {
      setRejectError('');
    }
  };

  const handleConfirmReject = async () => {
    if (rejectReason.trim().length < 20) {
      setRejectError('Debes proporcionar una razón de al menos 20 caracteres');
      return;
    }

    if (viewingDocument) {
      await handleRejectDocument(viewingDocument.id, rejectReason.trim());
      setShowRejectConfirm(false);
      handleCloseViewer();
    }
  };

  /**
   * Eliminar documento con confirmación
   */
  const handleDeleteDocument = (docId, docTitle) => {
    setDeleteDocId(docId);
    setDeleteDocTitle(docTitle || '');
    setConfirmDeleteOpen(true);
  };

  const confirmDeleteDocument = async () => {
    if (!deleteDocId) return;
    setDeleting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        API_URL,
        {
          query: `
            mutation DeleteDocument($id: ID!) {
              deleteDocument(id: $id)
            }
          `,
          variables: { id: deleteDocId }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }
      setConfirmDeleteOpen(false);
      // Si el visor muestra este doc, cerrarlo
      if (viewingDocument && viewingDocument.id === deleteDocId) {
        setViewingDocument(null);
      }
      setDeleteDocId(null);
      setDeleteDocTitle('');
      await loadMyDocuments();
    } catch (err) {
      console.error('Error al eliminar documento:', err);
      alert(err.message || 'Error al eliminar el documento');
    } finally {
      setDeleting(false);
    }
  };

  const cancelDeleteDocument = () => {
    setConfirmDeleteOpen(false);
    setDeleteDocId(null);
    setDeleteDocTitle('');
  };

  /**
   * Gestionar firmantes de un documento
   */
  const handleManageSigners = async (doc) => {
    setManagingDocument(doc);
    setLoadingDocumentSigners(true);
    setModalSelectedSigners([]);
    if (availableSigners.length === 0) {
      try { await loadAvailableSigners(); } catch {}
    }

    try {
      const token = localStorage.getItem('token');

      const response = await axios.post(
        API_URL,
        {
          query: `
            query GetSignatures($documentId: ID!) {
              signatures(documentId: $documentId) {
                id
                signer {
                  id
                  name
                  email
                }
                status
                signedAt
                createdAt
              }
            }
          `,
          variables: {
            documentId: doc.id
          }
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      setDocumentSigners(response.data.data.signatures || []);
    } catch (err) {
      console.error('Error al cargar firmantes:', err);
      alert('Error al cargar la información de firmantes');
      setManagingDocument(null);
    } finally {
      setLoadingDocumentSigners(false);
    }
  };

  const handleCloseSignersModal = () => {
    setManagingDocument(null);
    setDocumentSigners([]);
    setModalSelectedSigners([]);
  };

  // Selección para modal de gestión de firmantes
  const toggleModalSigner = (signerId) => {
    setModalSelectedSigners(prev => prev.includes(signerId)
      ? prev.filter(id => id !== signerId)
      : [...prev, signerId]
    );
  };

  const selectAllModalSigners = (candidates) => {
    setModalSelectedSigners(candidates.map(s => s.id));
  };

  const clearModalSelectedSigners = () => setModalSelectedSigners([]);

  const handleAddSignersToDocument = async () => {
    if (!managingDocument || modalSelectedSigners.length === 0) return;
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        API_URL,
        {
          query: `
            mutation AssignSigners($documentId: ID!, $userIds: [ID!]!) {
              assignSigners(documentId: $documentId, userIds: $userIds)
            }
          `,
          variables: {
            documentId: managingDocument.id,
            userIds: modalSelectedSigners
          }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      // Refrescar lista de firmantes del documento
      setLoadingDocumentSigners(true);
      const refresh = await axios.post(
        API_URL,
        {
          query: `
            query GetSignatures($documentId: ID!) {
              signatures(documentId: $documentId) {
                id
                signer { id name email }
                status
                signedAt
                createdAt
              }
            }
          `,
          variables: { documentId: managingDocument.id }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!refresh.data.errors) {
        setDocumentSigners(refresh.data.data.signatures || []);
      }
      setModalSelectedSigners([]);
      setLoadingDocumentSigners(false);

      // Actualizar lista de mis documentos para reflejar conteo
      try { await loadMyDocuments(); } catch {}
    } catch (err) {
      console.error('Error al asignar firmantes:', err);
      alert(err.message || 'Error al asignar firmantes');
    }
  };

  const getDocumentUrl = (filePath) => {
    if (!filePath) return '';

    // Si la ruta comienza con /app/uploads (formato antiguo), convertir a ruta relativa
    if (filePath.startsWith('/app/uploads/')) {
      return `${BACKEND_HOST}/uploads/${filePath.replace('/app/uploads/', '')}`;
    }

    // Si la ruta comienza con uploads/ (formato nuevo), usar directamente
    if (filePath.startsWith('uploads/')) {
      return `${BACKEND_HOST}/${filePath}`;
    }

    // Si no tiene ningún prefijo, asumir que es relativo a uploads/
    return `${BACKEND_HOST}/uploads/${filePath}`;
  };

  // Conversión robusta para fechas que vengan en distintos formatos
  const toDateSafe = (value) => {
    if (value === null || value === undefined) return null;
    try {
      if (value instanceof Date) {
        return isNaN(value.getTime()) ? null : value;
      }
      if (typeof value === 'number') {
        // segundos vs milisegundos
        const ms = value < 1e12 ? value * 1000 : value;
        const dNum = new Date(ms);
        return isNaN(dNum.getTime()) ? null : dNum;
      }
      let str = String(value).trim();
      if (!str) return null;
      // Epoch en string
      if (/^\d+$/.test(str)) {
        const num = parseInt(str, 10);
        const ms = str.length === 10 ? num * 1000 : num;
        const dEpoch = new Date(ms);
        return isNaN(dEpoch.getTime()) ? null : dEpoch;
      }
      // Normalizar 'YYYY-MM-DD HH:mm:ss(.SSS)(Â±ZZ)' a ISO
      if (str.includes(' ') && !str.includes('T')) {
        str = str.replace(' ', 'T');
      }
      // Si tiene fecha y hora sin zona (no Z ni offset), asumir UTC
      if (str.includes('T') && !/[Zz]|[\+\-]\d{2}:?\d{2}$/.test(str)) {
        str += 'Z';
      }
      // Solo fecha sin hora
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        str += 'T00:00:00Z';
      }
      let d = new Date(str);
      if (isNaN(d.getTime())) {
        // último intento: Date con cadena original
        d = new Date(String(value));
      }
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  };

  const formatDate = (dateInput) => {
    const date = toDateSafe(dateInput);
    if (!date) return '-';
    return new Intl.DateTimeFormat('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'America/Bogota'
    }).format(date);
  };

  const formatDateTime = (dateInput) => {
    const date = toDateSafe(dateInput);
    if (!date) return '-';
    return new Intl.DateTimeFormat('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Bogota'
    }).format(date);
  };

  const formatFileSize = (bytes) => {
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-background">
        <div className="gradient-circle circle-1"></div>
        <div className="gradient-circle circle-2"></div>
        <div className="gradient-circle circle-3"></div>
      </div>

      <div className="dashboard-content">
        <div className="ds-shell">
          {/* Left Sidebar (visual only) */}
          <aside className="ds-aside">
            <div className="ds-aside-header">
              <div className="logo">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span className="ds-brand-text">FirmaPRO</span>
            </div>
            <nav className="ds-side-nav">
              <button className={`ds-nav-item ${activeTab === 'upload' ? 'active' : ''}`} onClick={() => setActiveTab('upload')}>
                <svg className="ds-nav-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15M17 8L12 3M12 3L7 8M12 3V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Subir documento
              </button>
              <button className={`ds-nav-item ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>
                <svg className="ds-nav-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 6V12L16 14M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Pendiente de firma
              </button>
              <button className={`ds-nav-item ${activeTab === 'signed' ? 'active' : ''}`} onClick={() => setActiveTab('signed')}>
                <svg className="ds-nav-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9 11L12 14L22 4M21 12V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Documentos firmados
              </button>
              <button className={`ds-nav-item ${activeTab === 'my-documents' ? 'active' : ''}`} onClick={() => setActiveTab('my-documents')}>
                <svg className="ds-nav-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 7V17C3 17.5304 3.21071 18.0391 3.58579 18.4142C3.96086 18.7893 4.46957 19 5 19H19C19.5304 19 20.0391 18.7893 20.4142 18.4142C20.7893 18.0391 21 17.5304 21 17V9C21 8.46957 20.7893 7.96086 20.4142 7.58579C20.0391 7.21071 19.5304 7 19 7H13L11 4H5C4.46957 4 3.96086 4.21071 3.58579 4.58579C3.21071 4.96086 3 5.46957 3 6V7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Mis documentos
              </button>
            </nav>
          </aside>

          <div className="ds-content">
        {/* Header */}
        <header className="dashboard-header">
          <div className="header-right">
            <div className="user-info">
              <div className="user-avatar">
                {user?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="user-details">
                <span className="user-name">{user?.name || user?.email}</span>
                <span className="user-role">{user?.role || 'Usuario'}</span>
              </div>
            </div>
            <button className="logout-button" onClick={onLogout}>
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H9M16 17L21 12M21 12L16 7M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Salir
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="dashboard-main">
          {/* Navigation Tabs */}
          <div className="tabs-container">
            <button
              className={`tab ${activeTab === 'upload' ? 'active' : ''}`}
              onClick={() => setActiveTab('upload')}
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15M17 8L12 3M12 3L7 8M12 3V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Subir Documento
            </button>
            <button
              className={`tab ${activeTab === 'pending' ? 'active' : ''}`}
              onClick={() => setActiveTab('pending')}
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Pendientes de Firma
              {!loadingPending && pendingDocuments.length > 0 && (
                <span className="badge">{pendingDocuments.length}</span>
              )}
            </button>
            <button
              className={`tab ${activeTab === 'signed' ? 'active' : ''}`}
              onClick={() => setActiveTab('signed')}
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Documentos Firmados
              {!loadingSigned && signedDocuments.length > 0 && (
                <span className="badge badge-success">{signedDocuments.length}</span>
              )}
            </button>
            <button
              className={`tab ${activeTab === 'my-documents' ? 'active' : ''}`}
              onClick={() => setActiveTab('my-documents')}
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 12H15M9 16H15M17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H12.5858C12.851 3 13.1054 3.10536 13.2929 3.29289L18.7071 8.70711C18.8946 8.89464 19 9.149 19 9.41421V19C19 20.1046 18.1046 21 17 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Mis Documentos
              {!loadingMy && myDocuments.length > 0 && (
                <span className="badge badge-info">{myDocuments.length}</span>
              )}
            </button>
          </div>

          {/* Upload Section - Rediseñado estilo ZapSign */}
          {activeTab === 'upload' && (
            <div className="section upload-section-zapsign">
              {/* Stepper Horizontal Personalizado - 3 Pasos */}
              <div className="firmapro-stepper">
                <div className="firmapro-stepper-items">
                  <div className="firmapro-stepper-item">
                    <div className={`stepper-number ${activeStep >= 0 ? 'active' : ''}`}>1</div>
                    <span className={`stepper-label ${activeStep >= 0 ? 'active' : ''}`}>Cargar documentos</span>
                  </div>
                  <div className="stepper-line"></div>
                  <div className="firmapro-stepper-item">
                    <div className={`stepper-number ${activeStep >= 1 ? 'active' : ''}`}>2</div>
                    <span className={`stepper-label ${activeStep >= 1 ? 'active' : ''}`}>Añadir firmantes</span>
                  </div>
                  <div className="stepper-line"></div>
                  <div className="firmapro-stepper-item">
                    <div className={`stepper-number ${activeStep >= 2 ? 'active' : ''}`}>3</div>
                    <span className={`stepper-label ${activeStep >= 2 ? 'active' : ''}`}>Enviar</span>
                  </div>
                </div>
              </div>

              {/* Content Card */}
              <div className="zapsign-content-card">
                <div className="zapsign-header">
                  <div className="header-content">
                    <div>
                      <h2 className="zapsign-title">Nuevo documento</h2>
                      <p className="zapsign-subtitle">Completa los detalles y sube tu archivo para firmar.</p>
                    </div>
                    <button type="button" className="help-button">
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M9.09 9C9.3251 8.33167 9.78915 7.76811 10.4 7.40913C11.0108 7.05016 11.7289 6.91894 12.4272 7.03871C13.1255 7.15849 13.7588 7.52152 14.2151 8.06353C14.6713 8.60553 14.9211 9.29152 14.92 10C14.92 12 11.92 13 11.92 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M12 17H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span>Necesito ayuda</span>
                    </button>
                  </div>
                </div>

                <form onSubmit={handleUpload} className="zapsign-upload-form">
                  {/* Mensajes de estado */}
                  {uploadSuccess && (
                    <div className="success-message">
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span>Documento subido exitosamente</span>
                    </div>
                  )}

                  {error && (
                    <div className="error-message">
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Paso 0: Cargar documentos */}
                  {activeStep === 0 && (
                    <>
                      <div className="form-group">
                        <label htmlFor="document-title">
                          Título del documento
                        </label>
                        <input
                          type="text"
                          id="document-title"
                          value={documentTitle}
                          onChange={(e) => setDocumentTitle(e.target.value)}
                          placeholder="Ej: Contrato de servicios 2024"
                          className="form-input"
                          disabled={uploading}
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label htmlFor="document-description">
                          Descripción <span>(opcional)</span>
                        </label>
                        <textarea
                          id="document-description"
                          value={documentDescription}
                          onChange={(e) => setDocumentDescription(e.target.value)}
                          placeholder="Describe brevemente el documento..."
                          className="form-input form-textarea"
                          rows="3"
                          disabled={uploading}
                        />
                      </div>

                      {/* Sección: ¿Qué documento se firmará? */}
                      <div className="zapsign-section">
                    <h3 className="section-question">¿Qué documento se firmará?</h3>

                    <div
                      className={`zapsign-upload-area ${isDragging ? 'dragging' : ''} ${(selectedFiles && selectedFiles.length > 0) ? 'has-files' : ''}`}
                      onDragEnter={handleDragEnter}
                      onDragLeave={handleDragLeave}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                    >
                      <input
                        type="file"
                        id="file-input-zapsign"
                        onChange={(e) => handleFileChange(e)}
                        multiple
                        accept=".pdf,application/pdf"
                        className="file-input-hidden"
                        disabled={uploading}
                      />

                      {!selectedFiles || selectedFiles.length === 0 ? (
                        <label htmlFor="file-input-zapsign" className="zapsign-upload-label">
                          <div className="upload-icon-minimal">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15M17 8L12 3M12 3L7 8M12 3V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                          <div className="upload-text-container">
                            <p className="upload-text-main">
                              <span className="upload-link">Haz clic para subir</span>
                              <span className="upload-text-normal"> o arrastra y suelta</span>
                            </p>
                            <p className="upload-text-hint">Solo PDF hasta 10MB</p>
                          </div>
                        </label>
                      ) : (
                        <div className="file-list-minimal">
                          {selectedFiles.map((file, index) => (
                            <div
                              key={`${file.name}-${index}`}
                              className="file-item-minimal"
                              draggable={!uploading}
                              onDragStart={(e) => handleFileDragStart(e, index)}
                              onDragOver={(e) => handleFileDragOver(e, index)}
                              onDragEnd={handleFileDragEnd}
                            >
                              <div className="file-item-left">
                                <div className="file-icon-minimal">
                                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </div>
                                <div className="file-info-minimal">
                                  <p className="file-name-minimal">{file.name}</p>
                                  <p className="file-size-minimal">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="file-delete-minimal"
                                onClick={() => removeFile(index)}
                                disabled={uploading}
                                title="Eliminar archivo"
                              >
                                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Botón para agregar más archivos - minimalista */}
                    {(selectedFiles.length > 0 || selectedFile) && selectedFiles.length < 10 && (
                      <div className="add-more-files-container">
                        <button
                          type="button"
                          className="add-more-files-btn"
                          onClick={() => { const el = document.getElementById('file-input-zapsign'); if (el) el.click(); }}
                          disabled={uploading}
                        >
                          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 4v16m8-8H4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Agregar más archivos
                        </button>
                      </div>
                    )}
                      </div>
                    </>
                  )}

                  {/* Paso 1: Añadir firmantes */}
                  {activeStep === 1 && (
                    <>
                      {/* Sección de selección de firmantes */}
                      <div className="form-group signers-section">
                        <label>Seleccionar firmantes</label>
                        <p className="help-text">Elige las personas que deben firmar este documento</p>

                    {loadingSigners ? (
                      <div className="signers-loading">
                        <span className="button-spinner"></span>
                        <span>Cargando firmantes...</span>
                      </div>
                    ) : (
                      <>
                        <div className="signers-actions">
                          <button
                            type="button"
                            className="signers-action-btn"
                            onClick={selectAllSigners}
                            disabled={uploading || availableSigners.length === 0}
                          >
                            Seleccionar todos
                          </button>
                          <button
                            type="button"
                            className="signers-action-btn"
                            onClick={clearSelectedSigners}
                            disabled={uploading || selectedSigners.length === 0}
                          >
                            Limpiar selección
                          </button>
                          <span className="signers-count">
                            {selectedSigners.length} de {availableSigners.length} seleccionados
                          </span>
                        </div>

                        <div className="signers-list">
                          {availableSigners.length === 0 ? (
                            <div className="signers-empty">
                              <p>No hay usuarios disponibles para seleccionar como firmantes</p>
                            </div>
                          ) : (
                            availableSigners.map(signer => (
                              <div
                                key={signer.id}
                                className={`signer-item ${selectedSigners.includes(signer.id) ? 'selected' : ''}`}
                                onClick={() => !uploading && toggleSigner(signer.id)}
                              >
                                <div className="signer-checkbox">
                                  {selectedSigners.includes(signer.id) && (
                                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                      <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                  )}
                                </div>
                                <div className="signer-info">
                                  <div className="signer-avatar">
                                    {signer.name.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="signer-details">
                                    <p className="signer-name">{signer.name}</p>
                                    <p className="signer-email">{signer.email}</p>
                                  </div>
                                </div>
                                <div className="signer-role">
                                  <span className={`role-badge role-${signer.role}`}>
                                    {signer.role === 'admin' ? 'Admin' : 'Usuario'}
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </>
                    )}
                      </div>
                    </>
                  )}

                  {/* Paso 2: Enviar documento */}
                  {activeStep === 2 && (
                    <>
                      <div className="zapsign-section">
                        <h3 className="section-question">Resumen del envío</h3>

                        <div className="summary-card">
                          <div className="summary-item">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="summary-icon">
                              <path d="M9 12H15M9 16H15M17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H12.5858C12.851 3 13.1054 3.10536 13.2929 3.29289L18.7071 8.70711C18.8946 8.89464 19 9.149 19 9.41421V19C19 20.1046 18.1046 21 17 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <div>
                              <h4>Documentos</h4>
                              <p>{selectedFiles?.length || 0} archivo{(selectedFiles?.length || 0) !== 1 ? 's' : ''} seleccionado{(selectedFiles?.length || 0) !== 1 ? 's' : ''}</p>
                            </div>
                          </div>

                          <div className="summary-item">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="summary-icon">
                              <path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13M16 3.13C16.8604 3.3503 17.623 3.8507 18.1676 4.55231C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89317 18.7122 8.75608 18.1676 9.45769C17.623 10.1593 16.8604 10.6597 16 10.88M13 7C13 9.20914 11.2091 11 9 11C6.79086 11 5 9.20914 5 7C5 4.79086 6.79086 3 9 3C11.2091 3 13 4.79086 13 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <div>
                              <h4>Firmantes</h4>
                              <p>{selectedSigners?.length || 0} persona{(selectedSigners?.length || 0) !== 1 ? 's' : ''} seleccionada{(selectedSigners?.length || 0) !== 1 ? 's' : ''}</p>
                            </div>
                          </div>

                          {documentTitle && (
                            <div className="summary-item">
                              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="summary-icon">
                                <path d="M7 8H17M7 12H17M7 16H12M3 6C3 4.89543 3.89543 4 5 4H19C20.1046 4 21 4.89543 21 6V18C21 19.1046 20.1046 20 19 20H5C3.89543 20 3 19.1046 3 18V6Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              <div>
                                <h4>Título</h4>
                                <p>{documentTitle}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                </form>

                {/* Footer con botones de navegación */}
                <div className="form-footer">
                  <button
                    type="button"
                    className="footer-btn-back"
                    disabled={activeStep === 0}
                    onClick={handleBack}
                  >
                    Atrás
                  </button>

                  {activeStep < steps.length - 1 ? (
                    <button
                      type="button"
                      className="footer-btn-continue"
                      onClick={handleNext}
                      disabled={!canProceedToNextStep()}
                    >
                      Continuar
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="footer-btn-continue"
                      onClick={handleUpload}
                      disabled={uploading || !canProceedToNextStep()}
                    >
                      {uploading ? 'Enviando...' : 'Enviar Documento'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Pending Documents Section - Minimal */}
          {activeTab === 'pending' && (
            <div className="section pending-section-minimal">
              <div className="section-header-minimal">
                <div>
                  <h2 className="section-title-minimal">Pendientes de Firma</h2>
                  <p className="section-subtitle-minimal">{pendingDocuments.length} documento{pendingDocuments.length !== 1 ? 's' : ''} esperando tu firma</p>
                </div>
              </div>

              {loadingPending ? (
                <div className="loading-state-minimal">
                  <div className="spinner-minimal"></div>
                  <p>Cargando documentos...</p>
                </div>
              ) : pendingDocuments.length === 0 ? (
                <div className="empty-state-minimal">
                  <div className="empty-icon-minimal">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <h3 className="empty-title-minimal">No hay documentos pendientes</h3>
                  <p className="empty-text-minimal">Todos tus documentos han sido firmados</p>
                </div>
              ) : (
                <div className="documents-grid-minimal">
                  {pendingDocuments.map((doc) => (
                    <div key={doc.id} className="doc-card-minimal">
                      <div className="doc-card-header-minimal">
                        <div className="doc-icon-minimal">
                          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <span className="doc-badge-minimal pending">Pendiente</span>
                      </div>

                      <div className="doc-card-body-minimal">
                        <h3 className="doc-card-title-minimal">{doc.title}</h3>
                        {doc.description && (
                          <p className="doc-card-description-minimal">{doc.description}</p>
                        )}
                        <div className="doc-card-meta-minimal">
                          <div className="doc-meta-item-minimal">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21M16 7C16 9.20914 14.2091 11 12 11C9.79086 11 8 9.20914 8 7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <span>{doc.uploadedBy?.name || doc.uploadedBy?.email || 'Desconocido'}</span>
                          </div>
                          <div className="doc-meta-item-minimal">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M12 8V12L15 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <span>{formatDateTime(doc.createdAt)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="doc-card-actions-minimal">
                        <button
                          className="btn-minimal-secondary"
                          onClick={() => handleViewDocument(doc, true)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Ver documento
                        </button>
                        <button
                          className="btn-minimal-primary"
                          onClick={() => handleSignDocument(doc.id)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M11 5H6C5.46957 5 4.96086 5.21071 4.58579 5.58579C4.21071 5.96086 4 6.46957 4 7V19C4 19.5304 4.21071 20.0391 4.58579 20.4142C4.96086 20.7893 5.46957 21 6 21H18C18.5304 21 19.0391 20.7893 19.4142 20.4142C19.7893 20.0391 20 19.5304 20 19V14M18.5 2.5C18.8978 2.1022 19.4374 1.87868 20 1.87868C20.5626 1.87868 21.1022 2.1022 21.5 2.5C21.8978 2.8978 22.1213 3.43739 22.1213 4C22.1213 4.56261 21.8978 5.1022 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Firmar ahora
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Signed Documents Section - Minimal */}
          {activeTab === 'signed' && (
            <div className="section pending-section-minimal">
              <div className="section-header-minimal">
                <div>
                  <h2 className="section-title-minimal">Documentos Firmados</h2>
                  <p className="section-subtitle-minimal">{signedDocuments.length} documento{signedDocuments.length !== 1 ? 's' : ''} completado{signedDocuments.length !== 1 ? 's' : ''}</p>
                </div>
              </div>

              {loadingSigned ? (
                <div className="loading-state-minimal">
                  <div className="spinner-minimal"></div>
                  <p>Cargando documentos...</p>
                </div>
              ) : signedDocuments.length === 0 ? (
                <div className="empty-state-minimal">
                  <div className="empty-icon-minimal">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <h3 className="empty-title-minimal">No hay documentos firmados</h3>
                  <p className="empty-text-minimal">Los documentos que firmes aparecerán aquí</p>
                </div>
              ) : (
                <div className="documents-grid-minimal">
                  {signedDocuments.map((doc) => (
                    <div key={doc.id} className="doc-card-minimal">
                      <div className="doc-card-header-minimal">
                        <div className="doc-icon-minimal">
                          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <span className="doc-badge-minimal signed">Firmado</span>
                      </div>

                      <div className="doc-card-body-minimal">
                        <h3 className="doc-card-title-minimal">{doc.title}</h3>
                        {doc.description && (
                          <p className="doc-card-description-minimal">{doc.description}</p>
                        )}
                        <div className="doc-card-meta-minimal">
                          {doc.signedAt && (
                            <div className="doc-meta-item-minimal">
                              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              <span>Firmado el {formatDateTime(doc.signedAt)}</span>
                            </div>
                          )}
                          <div className="doc-meta-item-minimal">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21M16 7C16 9.20914 14.2091 11 12 11C9.79086 11 8 9.20914 8 7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <span>{doc.uploadedBy?.name || doc.uploadedBy?.email || 'Desconocido'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="doc-card-actions-minimal">
                        <button
                          className="btn-minimal-secondary"
                          onClick={() => handleViewDocument(doc)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Ver documento
                        </button>
                        <button
                          className="btn-minimal-primary"
                          onClick={() => window.open(getDocumentUrl(doc.filePath), '_blank')}
                        >
                          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15M7 10L12 15M12 15L17 10M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Descargar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* My Documents Section - Rediseñado */}
          {activeTab === 'my-documents' && (
            <div className="section my-documents-section-modern">
              <div className="modern-header">
                <div className="header-content">
                  <h2>Mis Documentos</h2>
                  <p className="header-subtitle">{myDocuments.length} documento{myDocuments.length !== 1 ? 's' : ''}</p>
                </div>
              </div>

              {loadingMy ? (
                <div className="loading-state-modern">
                  <div className="spinner-modern"></div>
                  <p>Cargando documentos...</p>
                </div>
              ) : myDocuments.length === 0 ? (
                <div className="empty-state-modern">
                  <div className="empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 12H15M9 16H15M17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H12.5858C12.851 3 13.1054 3.10536 13.2929 3.29289L18.7071 8.70711C18.8946 8.89464 19 9.149 19 9.41421V19C19 20.1046 18.1046 21 17 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <h3>No tienes documentos</h3>
                  <p>Comienza subiendo tu primer documento</p>
                  <button
                    className="btn-primary-modern"
                    onClick={() => setActiveTab('upload')}
                  >
                    Subir Documento
                  </button>
                </div>
              ) : (
                <div className="documents-list-modern">
                  {myDocuments.map((doc) => {
                      const progress = doc.totalSigners > 0
                        ? (doc.signedCount / doc.totalSigners) * 100
                        : 0;

                      const getStatusConfig = (status) => {
                        const statusMap = {
                          pending: { label: 'Pendiente', color: '#F59E0B', bg: '#FEF3C7' },
                          in_progress: { label: 'En progreso', color: '#3B82F6', bg: '#DBEAFE' },
                          completed: { label: 'Completado', color: '#10B981', bg: '#D1FAE5'},
                          rejected: { label: 'Rechazado', color: '#EF4444', bg: '#FEE2E2' },
                          archived: { label: 'Archivado', color: '#6B7280', bg: '#F3F4F6' }
                        };
                        return statusMap[status] || statusMap.pending;
                      };

                      const statusConfig = getStatusConfig(doc.status);

                      return (
                        <div key={doc.id} className="doc-card-modern">
                          {/* Left side - PDF Icon and Info */}
                          <div className="doc-left">
                            <div className="pdf-icon-modern">
                              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" fill="currentColor"/>
                                <path d="M14 2V8H20" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              <span className="pdf-label">PDF</span>
                            </div>
                            <div className="doc-info-modern">
                              <h3 className="doc-title-modern">{doc.title}</h3>
                              <div className="doc-meta-modern">
                                <span className="meta-date">{formatDateTime(doc.createdAt)}</span>
                                <span className="meta-dot">•</span>
                                <span className="meta-size">{formatFileSize(doc.fileSize)}</span>
                              </div>
                              {doc.description && (
                                <p className="doc-description-modern">{doc.description}</p>
                              )}
                            </div>
                          </div>

                          {/* Center - Progress */}
                          <div className="doc-center">
                            <div className="progress-modern">
                              <div className="progress-info">
                                <span className="progress-label-modern">Firmas</span>
                                <span className="progress-numbers">{doc.signedCount}/{doc.totalSigners}</span>
                              </div>
                              <div className="progress-bar-modern">
                                <div
                                  className="progress-fill-modern"
                                  style={{
                                    width: `${progress}%`,
                                    backgroundColor: progress === 100 ? '#10B981' : '#3B82F6'
                                  }}
                                ></div>
                              </div>
                              <div className="progress-tags">
                                {doc.signedCount > 0 && (
                                  <span className="tag-signed">{doc.signedCount} firmada{doc.signedCount !== 1 ? 's' : ''}</span>
                                )}
                                {doc.pendingCount > 0 && (
                                  <span className="tag-pending">{doc.pendingCount} pendiente{doc.pendingCount !== 1 ? 's' : ''}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Right side - Status and Actions */}
                          <div className="doc-right">
                            <span
                              className="status-badge-modern"
                              style={{
                                color: statusConfig.color,
                                backgroundColor: statusConfig.bg
                              }}
                            >
                              <span className="status-icon">{statusConfig.icon}</span>
                              {statusConfig.label}
                            </span>
                            <div className="actions-modern">
                              <button
                                className="btn-icon-modern btn-view"
                                onClick={() => handleViewDocument(doc)}
                                title="Ver documento"
                              >
                                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                              <button
                                className="btn-icon-modern btn-manage"
                                onClick={() => handleManageSigners(doc)}
                                title="Gestionar firmantes"
                              >
                                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13M16 3.13C16.8604 3.35031 17.623 3.85071 18.1676 4.55232C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89317 18.7122 8.75608 18.1676 9.45768C17.623 10.1593 16.8604 10.6597 16 10.88M13 7C13 9.20914 11.2091 11 9 11C6.79086 11 5 9.20914 5 7C5 4.79086 6.79086 3 9 3C11.2091 3 13 4.79086 13 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                              <button
                                className="btn-icon-modern btn-delete"
                                onClick={() => handleDeleteDocument(doc.id, doc.title)}
                                title="Eliminar documento"
                              >
                                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M3 6H5H21M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </main>
          </div>{/* /.ds-content */}
        </div>{/* /.ds-shell */}
      </div>

      {/* PDF Viewer Modal - Diseño Minimalista */}
      {viewingDocument && (
        <div className="pdf-viewer-minimal-overlay">
          {/* Header Minimalista */}
          <div className="pdf-viewer-minimal-header">
            <div className="pdf-viewer-header-left">
              <button className="pdf-viewer-back-btn" onClick={handleCloseViewer}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Volver
              </button>
              <div className="pdf-viewer-title">
                <h2>{viewingDocument.title}</h2>
              </div>
              {viewingDocument.description && (
                <button
                  className="pdf-viewer-description-btn"
                  onClick={() => setShowDescription(!showDescription)}
                  title={showDescription ? "Ocultar descripción" : "Ver descripción"}
                >
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M13 16H12V12H11M12 8H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
            </div>
            <div className="pdf-viewer-header-right">
              {isViewingPending && (
                <>
                  <button className="pdf-viewer-action-btn reject" onClick={handleOpenRejectConfirm}>
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Rechazar
                  </button>
                  <button className="pdf-viewer-action-btn sign" onClick={handleOpenSignConfirm}>
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M11 5H6C5.46957 5 4.96086 5.21071 4.58579 5.58579C4.21071 5.96086 4 6.46957 4 7V19C4 19.5304 4.21071 20.0391 4.58579 20.4142C4.96086 20.7893 5.46957 21 6 21H18C18.5304 21 19.0391 20.7893 19.4142 20.4142C19.7893 20.0391 20 19.5304 20 19V14M18.5 2.5C18.8978 2.1022 19.4374 1.87868 20 1.87868C20.5626 1.87868 21.1022 2.1022 21.5 2.5C21.8978 2.8978 22.1213 3.43739 22.1213 4C22.1213 4.56261 21.8978 5.1022 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Firmar
                  </button>
                </>
              )}
              <button className="pdf-viewer-action-btn close" onClick={handleCloseViewer} title="Cerrar">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Popup de descripción */}
          {showDescription && viewingDocument.description && (
            <div className="pdf-description-popup">
              <div className="pdf-description-content">
                <div className="pdf-description-header">
                  <h4>Descripción</h4>
                  <button
                    className="pdf-description-close"
                    onClick={() => setShowDescription(false)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
                <p className="pdf-description-text">{viewingDocument.description}</p>
              </div>
            </div>
          )}

          {/* Contenedor del PDF */}
          <div className="pdf-viewer-minimal-body">
            <object
              data={getDocumentUrl(viewingDocument.filePath)}
              type="application/pdf"
              className="pdf-viewer-minimal-iframe"
            >
              <embed
                src={getDocumentUrl(viewingDocument.filePath)}
                type="application/pdf"
                className="pdf-viewer-minimal-iframe"
              />
              <div className="pdf-fallback-minimal">
                <div className="fallback-icon">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p className="fallback-title">No se puede mostrar el PDF en este navegador</p>
                <a
                  href={getDocumentUrl(viewingDocument.filePath)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="fallback-download-btn"
                >
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15M7 10L12 15M12 15L17 10M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Descargar PDF
                </a>
              </div>
            </object>
          </div>

          {/* Popup de Confirmación de Firma - Minimalista */}
          {showSignConfirm && (
            <div className="sign-confirm-overlay" onClick={handleCancelSign}>
              <div className="sign-confirm-modal" onClick={(e) => e.stopPropagation()}>
                <div className="sign-confirm-icon">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M11 5H6C5.46957 5 4.96086 5.21071 4.58579 5.58579C4.21071 5.96086 4 6.46957 4 7V19C4 19.5304 4.21071 20.0391 4.58579 20.4142C4.96086 20.7893 5.46957 21 6 21H18C18.5304 21 19.0391 20.7893 19.4142 20.4142C19.7893 20.0391 20 19.5304 20 19V14M18.5 2.5C18.8978 2.1022 19.4374 1.87868 20 1.87868C20.5626 1.87868 21.1022 2.1022 21.5 2.5C21.8978 2.8978 22.1213 3.43739 22.1213 4C22.1213 4.56261 21.8978 5.1022 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h3 className="sign-confirm-title">Confirmar firma</h3>
                <p className="sign-confirm-message">
                  ¿Estás seguro de que deseas firmar este documento? Esta acción no se puede deshacer.
                </p>
                <div className="sign-confirm-actions">
                  <button className="sign-confirm-btn cancel" onClick={handleCancelSign}>
                    Cancelar
                  </button>
                  <button className="sign-confirm-btn confirm" onClick={handleConfirmSign}>
                    Firmar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Popup de Rechazo de Documento - Minimalista */}
          {showRejectConfirm && (
            <div className="sign-confirm-overlay" onClick={handleCancelReject}>
              <div className="reject-confirm-modal" onClick={(e) => e.stopPropagation()}>
                <div className="reject-confirm-icon">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h3 className="reject-confirm-title">Rechazar documento</h3>
                <p className="reject-confirm-message">
                  Por favor, explica la razón del rechazo. Esta información será visible para todos los involucrados.
                </p>
                <div className="reject-reason-container">
                  <textarea
                    className="reject-reason-input"
                    placeholder="Escribe la razón del rechazo (mínimo 20 caracteres)..."
                    value={rejectReason}
                    onChange={handleRejectReasonChange}
                    rows="4"
                    maxLength="500"
                  />
                  <div className="reject-reason-info">
                    <span className={`char-count ${rejectReason.length < 20 ? 'insufficient' : 'sufficient'}`}>
                      {rejectReason.length}/500 caracteres {rejectReason.length < 20 && `(mínimo 20)`}
                    </span>
                  </div>
                  {rejectError && (
                    <div className="reject-error-message">
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      {rejectError}
                    </div>
                  )}
                </div>
                <div className="reject-confirm-actions">
                  <button className="reject-confirm-btn cancel" onClick={handleCancelReject}>
                    Cancelar
                  </button>
                  <button
                    className="reject-confirm-btn confirm"
                    onClick={handleConfirmReject}
                    disabled={rejectReason.trim().length < 20}
                  >
                    Rechazar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal de Gestión de Firmantes */}
      {managingDocument && (
        <div className="modal-overlay" onClick={handleCloseSignersModal}>
          <div className="signers-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="signers-modal-header">
              <div>
                <h2>Gestión de Firmantes</h2>
                <p className="modal-subtitle">{managingDocument.title}</p>
              </div>
              <button className="modal-close-button" onClick={handleCloseSignersModal}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

            <div className="signers-modal-body">
              {loadingDocumentSigners ? (
                <div className="loading-state-modern">
                  <div className="spinner-modern"></div>
                  <p>Cargando firmantes...</p>
                </div>
              ) : documentSigners.length === 0 ? (
                <div className="empty-state-modern">
                  <p>No hay firmantes asignados a este documento</p>
                </div>
              ) : (
                <>
                  <div className="signers-list-modal">
                    {documentSigners.map((signature) => (
                      <div key={signature.id} className="signer-item-modal">
                        <div className="signer-avatar-modal">
                          {(signature.signer?.name || signature.signer?.email || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div className="signer-info-modal">
                          <p className="signer-name-modal">{signature.signer?.name || 'Usuario'}</p>
                          <p className="signer-email-modal">{signature.signer?.email || 'N/A'}</p>
                          {signature.status === 'signed' && signature.signedAt && (
                            <p className="signer-timestamp">Firmado: {formatDateTime(signature.signedAt)}</p>
                          )}
                          {signature.status === 'pending' && (
                            <p className="signer-timestamp-pending">Pendiente desde: {formatDateTime(signature.createdAt)}</p>
                          )}
                        </div>
                        <div className="signer-status-badge-modal">
                          {signature.status === 'signed' && (
                            <span className="status-signed">
                              Firmado
                            </span>
                          )}
                          {signature.status === 'pending' && (
                            <span className="status-pending">
                              Pendiente
                            </span>
                          )}
                          {signature.status === 'rejected' && (
                            <span className="status-rejected">
                              Rechazado
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Sección para agregar nuevos firmantes */}
                  <div className="signers-add-section" style={{ marginTop: '16px' }}>
                    <h3 style={{ marginBottom: '8px' }}>Agregar firmantes</h3>
                    {(() => {
                      const existingIds = new Set((documentSigners || []).map(s => s?.signer?.id).filter(Boolean));
                      const candidates = (availableSigners || []).filter(s => !existingIds.has(s.id));
                      return (
                        <>
                          <div className="signers-actions" style={{ marginBottom: '8px' }}>
                            <button
                              type="button"
                              className="signers-action-btn"
                              onClick={() => selectAllModalSigners(candidates)}
                              disabled={candidates.length === 0}
                            >
                              Seleccionar todos
                            </button>
                            <button
                              type="button"
                              className="signers-action-btn"
                              onClick={clearModalSelectedSigners}
                              disabled={modalSelectedSigners.length === 0}
                            >
                              Limpiar selección
                            </button>
                            <span className="signers-count">
                              {modalSelectedSigners.length} de {candidates.length} seleccionados
                            </span>
                          </div>

                          <div className="signers-list">
                            {candidates.length === 0 ? (
                              <div className="signers-empty">No hay más usuarios disponibles para agregar</div>
                            ) : (
                              candidates.map(signer => (
                                <div
                                  key={signer.id}
                                  className={`signer-item ${modalSelectedSigners.includes(signer.id) ? 'selected' : ''}`}
                                  onClick={() => toggleModalSigner(signer.id)}
                                >
                                  <div className="signer-avatar">
                                    {(signer.name || signer.email || 'U').charAt(0).toUpperCase()}
                                  </div>
                                  <div className="signer-details">
                                    <div className="signer-name">{signer.name || 'Usuario'}</div>
                                    <div className="signer-email">{signer.email}</div>
                                  </div>
                                  {modalSelectedSigners.includes(signer.id) && (
                                    <div className="signer-selected">âœ”</div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </>
              )}
            </div>

            <div className="signers-modal-footer">
              <button className="btn-close-modal" onClick={handleCloseSignersModal}>
                Cerrar
              </button>
              <button
                className="action-button primary"
                onClick={handleAddSignersToDocument}
                disabled={modalSelectedSigners.length === 0}
                style={{ marginLeft: '8px' }}
              >
                Agregar firmantes
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal de confirmación de eliminación */}
      {confirmDeleteOpen && (
        <div className="modal-overlay" onClick={cancelDeleteDocument}>
          <div className="signers-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="signers-modal-header">
              <div>
                <h2>Eliminar documento</h2>
                {deleteDocTitle && (
                  <p className="modal-subtitle">{deleteDocTitle}</p>
                )}
              </div>
              <button className="modal-close-button" onClick={cancelDeleteDocument}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            <div className="signers-modal-body">
              <p>Esta seguro de desea eliminar este documento?</p>
              <p>Esta operación es irreversible.</p>
            </div>
            <div className="signers-modal-footer">
              <button className="btn-close-modal" onClick={cancelDeleteDocument} disabled={deleting}>
                Cancelar
              </button>
              <button className="action-button primary" onClick={confirmDeleteDocument} disabled={deleting} style={{ marginLeft: '8px' }}>
                {deleting ? 'Eliminando...' : 'Aceptar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;


























import { useState, useEffect } from 'react';
import axios from 'axios';
import './Dashboard.css';

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

// Log para debug
console.log('🔗 Backend URL:', API_URL);

function Dashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('upload');
  const [selectedFile, setSelectedFile] = useState(null);
  const [documentTitle, setDocumentTitle] = useState('');
  const [documentDescription, setDocumentDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Estados para datos reales
  const [pendingDocuments, setPendingDocuments] = useState([]);
  const [myDocuments, setMyDocuments] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [loadingMy, setLoadingMy] = useState(false);
  const [viewingDocument, setViewingDocument] = useState(null);

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

  const validateFile = (file) => {
    if (file.type !== 'application/pdf') {
      setError('Solo se permiten archivos PDF');
      return false;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('El archivo es demasiado grande. Máximo 10MB');
      return false;
    }

    return true;
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && validateFile(file)) {
      setSelectedFile(file);
      setError('');
      setUploadSuccess(false);
    }
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

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (validateFile(file)) {
        setSelectedFile(file);
        setError('');
        setUploadSuccess(false);
      }
    }
  };

  /**
   * Subir documento REAL usando FormData
   */
  const handleUpload = async (e) => {
    e.preventDefault();

    if (!selectedFile || !documentTitle.trim()) {
      setError('Por favor completa todos los campos');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');

      // Crear FormData para subir el archivo
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('title', documentTitle.trim());
      if (documentDescription.trim()) {
        formData.append('description', documentDescription.trim());
      }

      // Subir archivo usando endpoint REST
      const response = await axios.post(API_UPLOAD_URL, formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data.success) {
        setUploadSuccess(true);
        setSelectedFile(null);
        setDocumentTitle('');
        setDocumentDescription('');

        // Limpiar el input file
        const fileInput = document.getElementById('file-input');
        if (fileInput) fileInput.value = '';

        // Recargar mis documentos si estamos en esa pestaña
        if (activeTab === 'my-documents') {
          await loadMyDocuments();
        }

        setTimeout(() => setUploadSuccess(false), 5000);
      } else {
        throw new Error(response.data.message || 'Error al subir el documento');
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
      await loadPendingDocuments();
    } catch (err) {
      console.error('Error al firmar:', err);
      alert(err.message || 'Error al firmar el documento');
    }
  };

  const handleViewDocument = (doc) => {
    // Abrir el visor de PDF con el documento seleccionado
    setViewingDocument(doc);
  };

  const handleCloseViewer = () => {
    setViewingDocument(null);
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

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
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
        {/* Header */}
        <header className="dashboard-header">
          <div className="header-left">
            <div className="logo">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="header-info">
              <h1>Firmas Digitales</h1>
              <p>Sistema de gestión de documentos</p>
            </div>
          </div>
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

          {/* Upload Section */}
          {activeTab === 'upload' && (
            <div className="section upload-section">
              <div className="section-card">
                <div className="card-header">
                  <h2>Subir nuevo documento</h2>
                  <p>Sube un documento PDF para que sea firmado por los participantes</p>
                </div>

                <form onSubmit={handleUpload} className="upload-form">
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

                  <div className="form-group">
                    <label htmlFor="document-title">Título del documento</label>
                    <input
                      type="text"
                      id="document-title"
                      value={documentTitle}
                      onChange={(e) => setDocumentTitle(e.target.value)}
                      placeholder="Ej: Contrato de servicios 2024"
                      className="form-input"
                      disabled={uploading}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="document-description">Descripción (opcional)</label>
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

                  <div className="form-group">
                    <label htmlFor="file-input">Archivo PDF</label>
                    <div
                      className={`file-drop-zone ${isDragging ? 'dragging' : ''} ${selectedFile ? 'has-file' : ''}`}
                      onDragEnter={handleDragEnter}
                      onDragLeave={handleDragLeave}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                    >
                      <input
                        type="file"
                        id="file-input"
                        onChange={handleFileChange}
                        accept=".pdf,application/pdf"
                        className="file-input"
                        disabled={uploading}
                      />

                      {!selectedFile ? (
                        <label htmlFor="file-input" className="file-drop-label">
                          <div className="file-drop-icon">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M7 18C4.79086 18 3 16.2091 3 14C3 11.7909 4.79086 10 7 10C7 7.23858 9.23858 5 12 5C14.7614 5 17 7.23858 17 10C19.2091 10 21 11.7909 21 14C21 16.2091 19.2091 18 17 18H7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M12 12V19M12 12L9 15M12 12L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                          <div className="file-drop-text">
                            <p className="file-drop-title">
                              {isDragging ? 'Suelta el archivo aquí' : 'Arrastra tu PDF aquí'}
                            </p>
                            <p className="file-drop-subtitle">
                              o <span className="file-drop-link">haz clic para seleccionar</span>
                            </p>
                          </div>
                        </label>
                      ) : (
                        <div className="file-selected">
                          <div className="file-selected-icon">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" fill="#DC2626"/>
                              <path d="M14 2V8H20" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M12 18V12M12 12L9 15M12 12L15 15" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                          <div className="file-selected-info">
                            <p className="file-selected-name">{selectedFile.name}</p>
                            <p className="file-selected-size">
                              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                          <button
                            type="button"
                            className="file-remove-button"
                            onClick={() => {
                              setSelectedFile(null);
                              const fileInput = document.getElementById('file-input');
                              if (fileInput) fileInput.value = '';
                            }}
                            disabled={uploading}
                          >
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                    <small className="help-text">Solo archivos PDF (máximo 10MB)</small>
                  </div>

                  <button
                    type="submit"
                    className="submit-button"
                    disabled={uploading || !selectedFile || !documentTitle.trim()}
                  >
                    {uploading ? (
                      <>
                        <span className="button-spinner"></span>
                        <span>Subiendo...</span>
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15M17 8L12 3M12 3L7 8M12 3V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span>Subir Documento</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Pending Documents Section */}
          {activeTab === 'pending' && (
            <div className="section pending-section">
              <div className="section-card">
                <div className="card-header">
                  <h2>Documentos pendientes de firma</h2>
                  <p>Estos documentos requieren tu firma</p>
                </div>

                {loadingPending ? (
                  <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Cargando documentos...</p>
                  </div>
                ) : pendingDocuments.length === 0 ? (
                  <div className="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <h3>No hay documentos pendientes</h3>
                    <p>Todos tus documentos han sido firmados</p>
                  </div>
                ) : (
                  <div className="documents-grid">
                    {pendingDocuments.map((doc) => (
                      <div key={doc.id} className="document-card">
                        <div className="document-icon">
                          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" fill="#DC2626"/>
                            <path d="M14 2V8H20" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <div className="document-content">
                          <div className="document-header-row">
                            <h3 className="document-title">{doc.title}</h3>
                            <span className="status-badge status-pending">Pendiente</span>
                          </div>
                          {doc.description && (
                            <p className="document-description">{doc.description}</p>
                          )}
                          <div className="document-meta">
                            <div className="meta-item">
                              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21M16 7C16 9.20914 14.2091 11 12 11C9.79086 11 8 9.20914 8 7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              <span>{doc.uploadedBy?.name || doc.uploadedBy?.email || 'Desconocido'}</span>
                            </div>
                            <div className="meta-item">
                              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M8 7V3M16 7V3M7 11H17M5 21H19C20.1046 21 21 20.1046 21 19V7C21 5.89543 20.1046 5 19 5H5C3.89543 5 3 5.89543 3 7V19C3 20.1046 3.89543 21 5 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              <span>{formatDate(doc.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="document-actions">
                          <button
                            className="action-button action-view"
                            onClick={() => handleViewDocument(doc)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            Ver
                          </button>
                          <button
                            className="action-button action-sign"
                            onClick={() => handleSignDocument(doc.id)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M11 5H6C5.46957 5 4.96086 5.21071 4.58579 5.58579C4.21071 5.96086 4 6.46957 4 7V19C4 19.5304 4.21071 20.0391 4.58579 20.4142C4.96086 20.7893 5.46957 21 6 21H18C18.5304 21 19.0391 20.7893 19.4142 20.4142C19.7893 20.0391 20 19.5304 20 19V14M18.5 2.5C18.8978 2.1022 19.4374 1.87868 20 1.87868C20.5626 1.87868 21.1022 2.1022 21.5 2.5C21.8978 2.8978 22.1213 3.43739 22.1213 4C22.1213 4.56261 21.8978 5.1022 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            Firmar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* My Documents Section */}
          {activeTab === 'my-documents' && (
            <div className="section my-documents-section">
              <div className="section-card">
                <div className="card-header">
                  <h2>Mis documentos</h2>
                  <p>Documentos que has subido al sistema</p>
                </div>

                {loadingMy ? (
                  <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Cargando documentos...</p>
                  </div>
                ) : myDocuments.length === 0 ? (
                  <div className="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 12H15M9 16H15M17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H12.5858C12.851 3 13.1054 3.10536 13.2929 3.29289L18.7071 8.70711C18.8946 8.89464 19 9.149 19 9.41421V19C19 20.1046 18.1046 21 17 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <h3>No tienes documentos</h3>
                    <p>Comienza subiendo tu primer documento en la pestaña "Subir Documento"</p>
                  </div>
                ) : (
                  <div className="documents-grid">
                    {myDocuments.map((doc) => {
                      const progress = doc.totalSigners > 0
                        ? (doc.signedCount / doc.totalSigners) * 100
                        : 0;

                      const getStatusBadge = (status) => {
                        const statusMap = {
                          pending: { label: 'Pendiente', className: 'status-pending' },
                          in_progress: { label: 'En progreso', className: 'status-progress' },
                          completed: { label: 'Completado', className: 'status-completed' },
                          rejected: { label: 'Rechazado', className: 'status-rejected' },
                          archived: { label: 'Archivado', className: 'status-archived' }
                        };
                        return statusMap[status] || { label: status, className: 'status-pending' };
                      };

                      const statusInfo = getStatusBadge(doc.status);

                      return (
                        <div key={doc.id} className="document-card">
                          <div className="document-icon">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" fill="#DC2626"/>
                              <path d="M14 2V8H20" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                          <div className="document-content">
                            <div className="document-header-row">
                              <h3 className="document-title">{doc.title}</h3>
                              <span className={`status-badge ${statusInfo.className}`}>
                                {statusInfo.label}
                              </span>
                            </div>
                            {doc.description && (
                              <p className="document-description">{doc.description}</p>
                            )}
                            <div className="document-meta">
                              <div className="meta-item">
                                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M8 7V3M16 7V3M7 11H17M5 21H19C20.1046 21 21 20.1046 21 19V7C21 5.89543 20.1046 5 19 5H5C3.89543 5 3 5.89543 3 7V19C3 20.1046 3.89543 21 5 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <span>{formatDate(doc.createdAt)}</span>
                              </div>
                              <div className="meta-item">
                                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M9 12H15M9 16H15M17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H12.5858C12.851 3 13.1054 3.10536 13.2929 3.29289L18.7071 8.70711C18.8946 8.89464 19 9.149 19 9.41421V19C19 20.1046 18.1046 21 17 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <span>PDF - {formatFileSize(doc.fileSize)}</span>
                              </div>
                            </div>

                            {/* Signature Progress */}
                            <div className="signature-progress">
                              <div className="progress-header">
                                <span className="progress-label">Progreso de firmas</span>
                                <span className="progress-stats">
                                  {doc.signedCount} de {doc.totalSigners} firmantes
                                </span>
                              </div>
                              <div className="progress-bar-container">
                                <div
                                  className="progress-bar-fill"
                                  style={{ width: `${progress}%` }}
                                ></div>
                              </div>
                              <div className="progress-details">
                                <span className="progress-detail signed">
                                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                  {doc.signedCount} Firmadas
                                </span>
                                <span className="progress-detail pending">
                                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 8V12L15 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                  {doc.pendingCount} Pendientes
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="document-actions">
                            <button
                              className="action-button action-view"
                              onClick={() => handleViewDocument(doc)}
                            >
                              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              Ver
                            </button>
                            <button
                              className="action-button action-manage"
                              onClick={() => alert('Gestión de firmantes en desarrollo')}
                            >
                              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13M16 3.13C16.8604 3.35031 17.623 3.85071 18.1676 4.55232C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89317 18.7122 8.75608 18.1676 9.45768C17.623 10.1593 16.8604 10.6597 16 10.88M13 7C13 9.20914 11.2091 11 9 11C6.79086 11 5 9.20914 5 7C5 4.79086 6.79086 3 9 3C11.2091 3 13 4.79086 13 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              Gestionar Firmantes
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* PDF Viewer Modal */}
      {viewingDocument && (
        <div className="modal-overlay" onClick={handleCloseViewer}>
          <div className="modal-content pdf-viewer-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-section">
                <h2>{viewingDocument.title}</h2>
                {viewingDocument.description && (
                  <p className="modal-description">{viewingDocument.description}</p>
                )}
              </div>
              <button className="modal-close-button" onClick={handleCloseViewer}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <object
                data={getDocumentUrl(viewingDocument.filePath)}
                type="application/pdf"
                className="pdf-iframe"
              >
                <embed
                  src={getDocumentUrl(viewingDocument.filePath)}
                  type="application/pdf"
                  className="pdf-iframe"
                />
                <div className="pdf-fallback">
                  <p>No se puede mostrar el PDF en este navegador.</p>
                  <a
                    href={getDocumentUrl(viewingDocument.filePath)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="action-button action-download"
                  >
                    Descargar PDF para ver
                  </a>
                </div>
              </object>
            </div>
            <div className="modal-footer">
              <a
                href={getDocumentUrl(viewingDocument.filePath)}
                target="_blank"
                rel="noopener noreferrer"
                className="action-button action-download"
              >
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15M7 10L12 15M12 15L17 10M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Descargar PDF
              </a>
              <button className="action-button action-close" onClick={handleCloseViewer}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;

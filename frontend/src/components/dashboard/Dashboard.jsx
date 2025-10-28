import { useState } from 'react';
import axios from 'axios';
import './Dashboard.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://192.168.0.30:5001/graphql';

function Dashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('upload'); // 'upload', 'pending', o 'my-documents'
  const [selectedFile, setSelectedFile] = useState(null);
  const [documentTitle, setDocumentTitle] = useState('');
  const [documentDescription, setDocumentDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Documentos pendientes de firma (mock data - después se carga desde GraphQL)
  const [pendingDocuments] = useState([
    {
      id: '1',
      title: 'Contrato de servicios 2024',
      createdBy: 'Juan Pérez',
      createdAt: '2024-01-15',
      status: 'pending'
    },
    {
      id: '2',
      title: 'Acuerdo de confidencialidad',
      createdBy: 'María García',
      createdAt: '2024-01-14',
      status: 'pending'
    },
    {
      id: '3',
      title: 'Orden de compra #1234',
      createdBy: 'Carlos López',
      createdAt: '2024-01-13',
      status: 'pending'
    }
  ]);

  // Mis documentos (mock data - después se carga desde GraphQL)
  const [myDocuments] = useState([
    {
      id: '10',
      title: 'Propuesta comercial Q1 2024',
      description: 'Propuesta comercial para el primer trimestre',
      createdAt: '2024-01-20',
      status: 'pending',
      totalSigners: 3,
      signedCount: 1,
      pendingCount: 2
    },
    {
      id: '11',
      title: 'Contrato de arrendamiento',
      description: 'Contrato de arrendamiento local oficina',
      createdAt: '2024-01-18',
      status: 'in_progress',
      totalSigners: 2,
      signedCount: 1,
      pendingCount: 1
    },
    {
      id: '12',
      title: 'Acta de reunión mensual',
      description: 'Acta de la reunión del mes de enero',
      createdAt: '2024-01-16',
      status: 'completed',
      totalSigners: 5,
      signedCount: 5,
      pendingCount: 0
    }
  ]);

  const validateFile = (file) => {
    // Validar que sea PDF
    if (file.type !== 'application/pdf') {
      setError('Solo se permiten archivos PDF');
      return false;
    }

    // Validar tamaño máximo (10MB)
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

  const handleUpload = async (e) => {
    e.preventDefault();

    if (!selectedFile || !documentTitle.trim()) {
      setError('Por favor completa todos los campos');
      return;
    }

    setUploading(true);
    setError('');

    try {
      // TODO: Implementar la subida real con GraphQL mutation
      // Por ahora simulamos la subida
      await new Promise(resolve => setTimeout(resolve, 2000));

      setUploadSuccess(true);
      setSelectedFile(null);
      setDocumentTitle('');

      // Limpiar el input file
      const fileInput = document.getElementById('file-input');
      if (fileInput) fileInput.value = '';

      setTimeout(() => setUploadSuccess(false), 3000);
    } catch (err) {
      setError('Error al subir el documento. Por favor intenta nuevamente.');
    } finally {
      setUploading(false);
    }
  };

  const handleSignDocument = async (docId) => {
    // TODO: Implementar firma digital
    console.log('Firmando documento:', docId);
  };

  const handleViewDocument = (docId) => {
    // TODO: Implementar vista de documento
    console.log('Viendo documento:', docId);
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
              {pendingDocuments.length > 0 && (
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
              {myDocuments.length > 0 && (
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
                  <p>Sube un documento para que sea firmado por los participantes</p>
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
              <div className="section-header">
                <h2>Documentos pendientes de firma</h2>
                <p>Revisa y firma los documentos que requieren tu aprobación</p>
              </div>

              <div className="documents-grid">
                {pendingDocuments.length === 0 ? (
                  <div className="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <h3>No tienes documentos pendientes</h3>
                    <p>Los documentos que requieran tu firma aparecerán aquí</p>
                  </div>
                ) : (
                  pendingDocuments.map((doc) => (
                    <div key={doc.id} className="document-card">
                      <div className="document-icon">
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M16 13H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M16 17H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M10 9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div className="document-info">
                        <h3>{doc.title}</h3>
                        <p className="document-meta">
                          <span>Creado por: {doc.createdBy}</span>
                          <span>Fecha: {new Date(doc.createdAt).toLocaleDateString('es-ES')}</span>
                        </p>
                      </div>
                      <div className="document-actions">
                        <button
                          className="action-button secondary"
                          onClick={() => handleViewDocument(doc.id)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Ver
                        </button>
                        <button
                          className="action-button primary"
                          onClick={() => handleSignDocument(doc.id)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M3 17L9 11L13 15L21 7M21 7H15M21 7V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Firmar
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* My Documents Section */}
          {activeTab === 'my-documents' && (
            <div className="section my-documents-section">
              <div className="section-header">
                <h2>Mis documentos subidos</h2>
                <p>Administra y revisa el estado de los documentos que has subido</p>
              </div>

              <div className="documents-grid">
                {myDocuments.length === 0 ? (
                  <div className="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 12H15M9 16H15M17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H12.5858C12.851 3 13.1054 3.10536 13.2929 3.29289L18.7071 8.70711C18.8946 8.89464 19 9.149 19 9.41421V19C19 20.1046 18.1046 21 17 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <h3>No has subido documentos</h3>
                    <p>Los documentos que subas aparecerán aquí</p>
                  </div>
                ) : (
                  myDocuments.map((doc) => (
                    <div key={doc.id} className="document-card my-document">
                      <div className="document-header">
                        <div className="document-icon">
                          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <span className={`status-badge status-${doc.status}`}>
                          {doc.status === 'pending' && 'Pendiente'}
                          {doc.status === 'in_progress' && 'En Proceso'}
                          {doc.status === 'completed' && 'Completado'}
                          {doc.status === 'rejected' && 'Rechazado'}
                        </span>
                      </div>

                      <div className="document-info">
                        <h3>{doc.title}</h3>
                        {doc.description && (
                          <p className="document-description">{doc.description}</p>
                        )}
                        <p className="document-meta">
                          <span>Fecha: {new Date(doc.createdAt).toLocaleDateString('es-ES')}</span>
                        </p>
                      </div>

                      <div className="document-progress">
                        <div className="progress-info">
                          <span className="progress-label">Progreso de firmas</span>
                          <span className="progress-count">{doc.signedCount} / {doc.totalSigners}</span>
                        </div>
                        <div className="progress-bar">
                          <div
                            className="progress-fill"
                            style={{ width: `${doc.totalSigners > 0 ? (doc.signedCount / doc.totalSigners) * 100 : 0}%` }}
                          ></div>
                        </div>
                        <div className="progress-stats">
                          <span className="stat-item signed">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            {doc.signedCount} firmados
                          </span>
                          <span className="stat-item pending">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M12 6V12L16 14M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            {doc.pendingCount} pendientes
                          </span>
                        </div>
                      </div>

                      <div className="document-actions">
                        <button
                          className="action-button secondary"
                          onClick={() => handleViewDocument(doc.id)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Ver
                        </button>
                        <button
                          className="action-button info"
                          onClick={() => console.log('Gestionar firmantes', doc.id)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13M16 3.13C16.8604 3.35031 17.623 3.85071 18.1676 4.55232C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89318 18.7122 8.75608 18.1676 9.45769C17.623 10.1593 16.8604 10.6597 16 10.88M13 7C13 9.20914 11.2091 11 9 11C6.79086 11 5 9.20914 5 7C5 4.79086 6.79086 3 9 3C11.2091 3 13 4.79086 13 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Firmantes
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default Dashboard;

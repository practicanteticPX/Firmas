const { gql } = require('apollo-server-express');

const typeDefs = gql`
  scalar Upload

  type User {
    id: ID!
    name: String!
    email: String!
    role: String!
    adUsername: String
    isActive: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  type Document {
    id: ID!
    title: String!
    description: String
    fileName: String!
    filePath: String!
    fileSize: Int!
    mimeType: String!
    status: String!
    uploadedBy: User!
    uploadedById: ID!
    createdAt: String!
    updatedAt: String!
    completedAt: String
    # Campos calculados
    totalSigners: Int
    signedCount: Int
    pendingCount: Int
    signatures: [Signature!]
    # Campos de firma (solo disponibles en signedDocuments)
    signedAt: String
    signatureType: String
  }

  type Signature {
    id: ID!
    document: Document!
    documentId: ID!
    signer: User!
    signerId: ID!
    signatureData: String
    signatureType: String!
    ipAddress: String
    userAgent: String
    status: String!
    signedAt: String
    createdAt: String!
    updatedAt: String!
  }

  type DocumentSigner {
    id: ID!
    document: Document!
    user: User!
    orderPosition: Int!
    isRequired: Boolean!
    notifiedAt: String
    createdAt: String!
  }

  type UploadResponse {
    success: Boolean!
    message: String!
    document: Document
  }

  type Query {
    # Usuarios
    me: User
    users: [User!]!
    user(id: ID!): User
    availableSigners: [User!]!

    # Documentos
    documents: [Document!]!
    document(id: ID!): Document
    myDocuments: [Document!]!
    pendingDocuments: [Document!]!
    signedDocuments: [Document!]!
    documentsByStatus(status: String!): [Document!]!

    # Firmas
    signatures(documentId: ID!): [Signature!]!
    mySignatures: [Signature!]!
  }

  type Mutation {
    # Autenticación
    login(email: String!, password: String!): AuthPayload!
    register(name: String!, email: String!, password: String!): AuthPayload!

    # Usuarios
    updateUser(id: ID!, name: String, email: String): User!
    deleteUser(id: ID!): Boolean!

    # Documentos
    uploadDocument(title: String!, description: String): UploadResponse!
    updateDocument(id: ID!, title: String, description: String, status: String): Document!
    deleteDocument(id: ID!): Boolean!
    assignSigners(documentId: ID!, userIds: [ID!]!): Boolean!

    # Firmas
    signDocument(documentId: ID!, signatureData: String!): Signature!
    rejectDocument(documentId: ID!, reason: String): Boolean!
  }
`;

module.exports = typeDefs;

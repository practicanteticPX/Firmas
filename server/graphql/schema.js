const { gql } = require('apollo-server-express');

const typeDefs = gql`
  type User {
    id: ID!
    name: String!
    email: String!
    role: String!
    createdAt: String!
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  type Document {
    id: ID!
    title: String!
    content: String
    status: String!
    createdBy: User!
    createdAt: String!
    updatedAt: String!
  }

  type Signature {
    id: ID!
    documentId: ID!
    userId: ID!
    signedAt: String!
    signatureData: String!
  }

  type Query {
    # Usuarios
    me: User
    users: [User!]!
    user(id: ID!): User

    # Documentos
    documents: [Document!]!
    document(id: ID!): Document
    myDocuments: [Document!]!

    # Firmas
    signatures(documentId: ID!): [Signature!]!
  }

  type Mutation {
    # Autenticaci�n
    login(email: String!, password: String!): AuthPayload!
    register(name: String!, email: String!, password: String!): AuthPayload!

    # Usuarios
    updateUser(id: ID!, name: String, email: String): User!
    deleteUser(id: ID!): Boolean!

    # Documentos
    createDocument(title: String!, content: String): Document!
    updateDocument(id: ID!, title: String, content: String, status: String): Document!
    deleteDocument(id: ID!): Boolean!

    # Firmas
    signDocument(documentId: ID!, signatureData: String!): Signature!
  }
`;

module.exports = typeDefs;
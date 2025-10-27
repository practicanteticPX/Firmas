const { Pool } = require('pg');
require('dotenv').config();

// Configurar pool de conexiones
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Máximo de conexiones en el pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Manejar errores del pool
pool.on('error', (err, client) => {
  console.error('Error inesperado en el cliente de PostgreSQL:', err);
  process.exit(-1);
});

/**
 * Ejecuta una query SQL
 * @param {string} text - Query SQL
 * @param {Array} params - Parámetros de la query
 * @returns {Promise} Resultado de la query
 */
const query = (text, params) => pool.query(text, params);

/**
 * Obtiene un cliente del pool para transacciones
 * @returns {Promise} Cliente de PostgreSQL
 */
const getClient = () => pool.connect();

module.exports = {
  query,
  getClient,
  pool,
};

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  user: process.env.PG_USER || 'raguser',
  password: process.env.PG_PASSWORD || 'ragpass',
  database: process.env.PG_DATABASE || 'ragchatbot',
});

export const query = (text, params) => pool.query(text, params);
export default pool;

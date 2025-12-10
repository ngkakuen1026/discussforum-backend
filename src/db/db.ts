import pkg from 'pg';
import dotenv from "dotenv";

dotenv.config(); 

const { Pool } = pkg;

// Create a connection pool
const pool = new Pool({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT ? parseInt(process.env.PG_PORT, 10) : undefined,
    max: 10,
    idleTimeoutMillis: 30000, 
    connectionTimeoutMillis: 2000,
    prepare: false
}as any);

pool.on("connect", () => {
    console.log("Database connected successfully");
});

pool.on("error", (err: Error) => {
    console.error("Unexpected error on idle database client", err);
    process.exit(-1);
});

export default pool;

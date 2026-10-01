import mysql, { type Pool } from 'mysql2/promise'

let pool: Pool | undefined

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export function getMysqlPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: requiredEnv('MYSQL_HOST'),
      port: Number(process.env.MYSQL_PORT || 3306),
      user: requiredEnv('MYSQL_USER'),
      password: requiredEnv('MYSQL_PASSWORD'),
      database: requiredEnv('MYSQL_DATABASE'),
      waitForConnections: true,
      connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
      namedPlaceholders: true,
      decimalNumbers: false,
    })
  }

  return pool
}

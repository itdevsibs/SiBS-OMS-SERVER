import mysql from 'mysql2/promise';

export function createDatabasePool(database) {
  return mysql.createPool({
    ...database,
    waitForConnections: true,
    connectionLimit: 8,
    queueLimit: 40,
    timezone: 'Z',
    dateStrings: true,
    connectTimeout: 10000,
    enableKeepAlive: true
  });
}

export function createKronosPool(database) {
  return mysql.createPool({
    ...database,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 40,
    timezone: 'Z',
    dateStrings: true,
    connectTimeout: 10000,
    enableKeepAlive: true
  });
}

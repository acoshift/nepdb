export interface Config {
  port?: number;
  database?: DatabaseConfig;
}

export interface DatabaseConfig {
  user?: string;
  pwd?: string;
  host?: string;
  port?: number;
  db?: string;
}

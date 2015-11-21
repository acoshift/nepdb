export interface Config {
  http?: number;
  https?: number;
  host?: string;
  database?: DatabaseConfig;
}

export interface DatabaseConfig {
  user?: string;
  pwd?: string;
  host?: string;
  port?: number;
  db?: string;
}

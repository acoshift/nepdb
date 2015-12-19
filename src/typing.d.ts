declare module 'nepdb' {
  export interface Config {
    server: {
      port: number;
      cookie: {
        secret: string;
      }
    };
    database: {
      user: string;
      pwd: string;
      host: string;
      port: string;
      maxPoolSize: string;
    };
    compression: {
      level: number;
    };
    token: {
      algorithm: string;
      expiresIn: string;
      issuer: string;
      secret: string;
    };
    bcrypt: {
      cost: number;
    }
  }
}

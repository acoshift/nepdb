declare module 'nepdb' {
  import * as express from 'express';
  import * as mongodb from 'mongodb';
  import * as nepq from 'nepq';

  export interface Config {
    server: {
      port: number;
      cookie: {
        expiresIn: string;
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

  export interface NepDB {
    config: Config;
    app: express.Express;
    db: mongodb.Db;
    nq: nepq.Nq;

    // helper functions
    decode(base64: string): string;
    objectId(id: string): mongodb.ObjectID;
    json(s: string): any;
    collection(q: nepq.NepQ, callback: (err: Error, collection: mongodb.Collection) => void): void;
    ns(q: nepq.NepQ): any[];
    error(res: express.Response, name: string, code?: number, message?: string): void;
    reject(res: express.Response): void;
    resp(req: express.Request, res: express.Response, q: nepq.NepQ, err: Error, r: any): void;
    makeToken(user: any, exp: string): any;
    decodeToken(token: any): any;
    getToken(req: express.Request): string;
    authen(req: express.Request, res: express.Response, next: Function): void;
    autho(q: nepq.NepQ, req: express.Request, ...args): void;
    isAuth(q: nepq.NepQ, req: express.Request, method: string): boolean;

  }

  export interface Operator {
    (nepdb: NepDB);
  }
}

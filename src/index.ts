import {
  Config,
  NepDB,
} from 'nepdb';

import * as express from 'express';
import * as http from 'http';
import { MongoClient, ObjectID, Db } from 'mongodb';
import { escape } from 'querystring';
import * as nepq from 'nepq';
var compression = require('compression');
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import * as _ from 'lodash';
var etag = require('etag');
var fresh = require('fresh');
// import * as cookieParser from 'cookie-parser';

import opToken = require('./operators/token');
import opCreate = require('./operators/create');
import opRead = require('./operators/read');
import opUpdate = require('./operators/update');
import opDelete = require('./operators/delete');

var nepdb = new class implements NepDB {
  config: Config = require('./config');
  app = express();
  db: Db = null;
  nq = nepq();

  decode(base64) {
    return base64 ? new Buffer(base64, 'base64').toString() : null;
  }

  objectId(id) {
    let _id = null;
    try {
      _id = ObjectID.createFromHexString(id);
    } catch (e) { }
    return _id;
  }

  json(s) {
    let r = {};
    try {
      r = JSON.parse(s);
    } catch (e) { }
    return r;
  }

  collection(q, cb) {
    let [ d, c ] = this.ns(q);
    let col = null;
    this.db.db(d).collection(c, {
      w: 1,
      j: false,
      strict: true
    }, cb);
  }

  ns(q) {
    let n = q.name.split('.');
    let d = n.shift();
    let c = n.join('.');
    return [ d, c ];
  }

  errorString = {
    400: 'Bad Request',
    401: 'Unauthorized',
    404: 'Not Found',
    405: 'Method Not Allowed',
    418: 'I\'m a teapot',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    501: 'Not Implemented',
    503: 'Service Unavailable',
    520: 'Unknown Error',
  }

  error(res, name, code?, message?) {
    res.status(code || 520).json({ error: { name: name, message: message || this.errorString[code || 520] } });
  }

  reject(res) {
    this.error(res, 'NepDBError', 401);
  }

  resp(req, res, q, err, r) {
    if (err) {
      this.error(res, err.name, 500, err.message);
    } else {
      let response = q.response(r);
      if (fresh(req.headers, { etag: etag(JSON.stringify(response)) })) {
        res.sendStatus(304);
        return;
      }
      res.json(response);
    }
  }

  makeToken(user, exp) {
    return jwt.sign({
      sub: `${user.name}/${user.ns}`,
      role: user.role
    }, this.config.token.secret, {
      algorithm: this.config.token.algorithm,
      // expiresIn: exp || this.config.token.expiresIn,
      // issuer: this.config.token.issuer
    });
  }

  decodeToken(token) {
    let d = null;
    try {
      d = jwt.decode(token, { json: true, complete: true });
    } catch (e) {}
    return d;
  }

  getToken(req) {
    let p = req.get('authorization');
    if (!p) return null;
    let [ m, t ] = p.split(' ');
    if (m.toLowerCase() !== 'bearer') return null;
    return t || null;
  }

  authen(req, res, next) {
    let token = this.getToken(req);
    let user;
    try {
      if (!token) throw new Error();
      user = jwt.verify(token, this.config.token.secret, { algorithms: [ this.config.token.algorithm ] });
      if (!user || !user.sub || !user.role) throw new Error();
      let [ name, ns ] = user.sub.split('/');
      user.name = name;
      user.ns = ns;
    } catch (e) {
      user = {
        sub: 'guest',
        role: 'guest',
        name: 'guest',
      };
    }
    req.user = user;
    next();
  }

  autho(q, req, ...args) {
    req.autho = null;

    let [ d ] = this.ns(q);

    // add user information if not exists
    let user = req.user;
    if (!user) user = {};
    if (!user.sub) user.sub = user.name = 'guest';
    if (!user.role) user.role = 'guest';
    if (!user.ns || user.ns !== d) {
      user.role = 'guest';
      user.ns = d;
    }
    req.user = user;

    // no namespace = no autho
    if (!d) return args.pop()();

    // get user's role from database
    this.db.db(d).collection('db.roles').findOne({name: user.role}, (err, r) => {
      if (err || !r) return args.pop()();
      req.autho = r.dbs;
      args.pop()();
    });
  }

  isAuth(q, req, method) {
    if (!req.user || !req.autho) return false;

    // check wildcards
    if (req.autho === 1) return true;
    if (req.autho['*'] && req.autho['*'][method] === 1) return true;

    let [ , c ] = this.ns(q);
    c = c.split('.');
    while (c.length) {
      let k = req.autho[c.join('.')];
      if (k && (k === 1 || k[method] === 1)) return true;
      c.pop();
    }

    // no autho found
    return false;
  }

  // class functions

  log(q, req, ...args) {
    let l = {
      t: this.decodeToken(this.getToken(req)),
      q: q
    };
    this.db.db('nepdb').collection('logs').insertOne(l, { w: 0 }, null);
    args.pop()();
  }

  methodAlias = {
    c: 'create',
    r: 'read',
    u: 'update',
    d: 'delete',
    q: 'query',
    n: 'count',
    l: 'login',
    // lo: 'logout',
  };

  mapMethodAlias(q) {
    if (this.methodAlias[q.method]) q.method = this.methodAlias[q.method];
  }

  calc(k, v) {
    switch (k) {
      case '$bcrypt':
        return bcrypt.hashSync(v, this.config.bcrypt.cost);
    }
    return null;
  }

  preprocess(q) {
    _.forOwn(q, (v, k, a) => {
      if (k[0] === '$') {
        let p;
        _.forOwn(v, (_v, _k, _a) => {
          p = this.calc(k, _v);
          if (p !== null) a[_k] = p;
        });
        if (p) delete a[k];
      } else if (typeof v === 'object') {
        this.preprocess(v);
      } else if (k === '_id') {
        a[k] = this.objectId(v);
      }
    });
  }

  constructor() {
    // decode config
    // this.config.server.cookie.secret = this.decode(this.config.server.cookie.secret);
    this.config.token.secret = this.decode(this.config.token.secret);

    var connectionUri = (() => {
      let { user, pwd, host, port, maxPoolSize } = this.config.database;
      return `mongodb://${(user && pwd) ? `${user}:${escape(pwd)}@` : ''}${host || 'localhost'}:${port || 27017}/?maxPoolSize=${maxPoolSize}`;
    })();

    this.app.set('x-powered-by', false);
    this.app.set('etag', 'strong');

    this.app.use(compression(this.config.compression));
    // this.app.use(cookieParser(/*this.config.server.cookie.secret*/));

    MongoClient.connect(connectionUri, (err, database) => {
      if (err) throw err;

      this.db = database;

      let port = this.config.server.port || 8000;

      http.createServer(this.app).listen(port, () => {
        console.log(`Server listening on port ${port}`);
      });
    });

    this.nq.parser.on('after', q => {
      this.mapMethodAlias(q);
      this.preprocess(q.params);
    });

    this.nq.use(this.log.bind(this));
    this.nq.use(this.autho.bind(this));

    opToken(this);
    opCreate(this);
    opRead(this);
    opUpdate(this);
    opDelete(this);

    this.nq.use((q, req, res) => {
      this.error(res, 'NepDBError', 501);
    });

    this.nq.error((req, res) => {
      this.error(res, 'NepQError', 400);
    });

    this.app.use((req, res, next) => {
      // TODO: config CORS from database
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') return res.sendStatus(204);
      next();
    });

    this.app.use(this.authen.bind(this));
    this.app.use(this.nq.bodyParser());

    this.app.use((req, res) => {
      this.error(res, 'NepDBError', 400);
    });
  }
};

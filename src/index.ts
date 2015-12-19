import {
  Config,
} from 'nepdb';

import * as express from 'express';
import * as http from 'http';
import { MongoClient, ObjectID } from 'mongodb';
import { escape } from 'querystring';
import nepq = require('nepq');
var compression = require('compression');
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import * as _ from 'lodash';
var etag = require('etag');
var fresh = require('fresh');
import * as cookieParser from 'cookie-parser';
var config: Config = require('./config');

import opToken = require('./operators/token');
import opCreate = require('./operators/create');
import opRead = require('./operators/read');
import opUpdate = require('./operators/update');
import opDelete = require('./operators/delete');



function decode(base64) {
  return base64 ? new Buffer(base64, 'base64').toString() : null;
}

config.server.cookie.secret = decode(config.server.cookie.secret);
config.token.secret = decode(config.token.secret);

var app = express();
var db;
var nq = nepq();

var nepdb = {
  config: config,
  app: app,
  db: db,
  nq: nq,
  reject: reject,
  resp: resp,
  collection: collection,
  makeToken: makeToken,
  getToken: getToken,
  authen: authen,
  autho: autho,
  isAuth: isAuth,
  error: error,
  objectId: objectId,

  start: () => {
    db = db;
    app.set('x-powered-by', false);
    app.set('etag', 'strong');

    app.use(compression(config.compression));
    app.use(cookieParser(config.server.cookie.secret));

    nq.parser.on('after', q => {
      mapMethodAlias(q);
      preprocess(q.params);
    });

    nq.use(log);
    nq.use(autho);

    opToken.apply(nepdb);
    opCreate.apply(nepdb);
    opRead.apply(nepdb);
    opUpdate.apply(nepdb);
    opDelete.apply(nepdb);

    nq.use((q, req, res) => {
      error(res, 'NepDBError', 'Not Implemented');
    });

    nq.error((req, res) => {
      error(res, 'NepQError', 'Bad Request');
    });

    app.use((req, res, next) => {
      // TODO: config CORS from database
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') return res.sendStatus(204);
      next();
    });

    app.use(authen);
    app.use(nq.bodyParser());

    app.use((req, res) => {
      res.json({ error: { name: 'NepDBError', message: 'Bad Request' }});
    });
  }
};

var connectionUri = (() => {
  let { user, pwd, host, port, maxPoolSize } = config.database;
  return `mongodb://${(user && pwd) ? `${user}:${escape(pwd)}@` : ''}${host || 'localhost'}:${port || 27017}/?maxPoolSize=${maxPoolSize}`;
})();

MongoClient.connect(connectionUri, (err, database) => {
  if (err) throw err;

  db = nepdb.db = database;

  let port = config.server.port || 8000;

  nepdb.start();

  http.createServer(app).listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
});

/* Helper Functions */

function objectId(id) {
  let _id = null;
  try {
    _id = ObjectID.createFromHexString(id);
  } catch (e) { }
  return _id;
}

function json(s) {
  let r = {};
  try {
    r = JSON.parse(s);
  } catch (e) { }
  return r;
}

function collection(q, cb) {
  let [ d, c ] = ns(q);
  let col = null;
  db.db(d).collection(c, {
    w: 1,
    j: false,
    strict: true
  }, cb);
}

function ns(q) {
  let n = q.name.split('.');
  let d = n.shift();
  let c = n.join('.');
  return [ d, c ];
}

function error(res, name, message) {
  res.json({ error: { name: name, message: message } });
}

function reject(res) {
  error(res, 'NepDBError', 'Unauthorized');
}

function resp(req, res, q, err, r) {
  if (err) {
    error(res, err.name, err.message);
  } else {
    let response = q.response(r);
    if (fresh(req.headers, { etag: etag(JSON.stringify(response)) })) {
      res.sendStatus(304);
      return;
    }
    res.json(response);
  }
}

var methodAlias = {
  c: 'create',
  r: 'read',
  u: 'update',
  d: 'delete',
  l: 'list',
  n: 'count',
  ln: 'login',
  lo: 'logout',
};

function mapMethodAlias(q) {
  if (methodAlias[q.method]) q.method = methodAlias[q.method];
}

function calc(k, v) {
  switch (k) {
    case '$bcrypt':
      return bcrypt.hashSync(v, config.bcrypt.cost);
  }
  return null;
}

function preprocess(q) {
  _.forOwn(q, (v, k, a) => {
    if (k[0] === '$') {
      let p;
      _.forOwn(v, (_v, _k, _a) => {
        p = calc(k, _v);
        if (p !== null) a[_k] = p;
      });
      if (p) delete a[k];
    } else if (typeof v === 'object') {
      preprocess(v);
    } else if (k === '_id') {
      a[k] = objectId(v);
    }
  });
}

function makeToken(user, exp) {
  return jwt.sign({
    sub: `${user.name}@${user.ns}`,
    role: user.role
  }, config.token.secret, {
    algorithm: config.token.algorithm,
    expiresIn: exp || config.token.expiresIn,
    issuer: config.token.issuer
  });
}

function decodeToken(token) {
  let d = null;
  try {
    d = jwt.decode(token, { json: true, complete: true });
  } catch (e) {}
  return d;
}

function log(q, req, ...args) {
  let l = {
    t: decodeToken(getToken(req)),
    q: q
  };
  db.db('nepdb').collection('logs').insertOne(l, { w: 0 });
  args.pop()();
}

function getToken(req) {
  return req.signedCookies.token || null;
}

function authen(req, res, next) {
  let token = getToken(req);
  let user;
  try {
    if (!token) throw new Error();
    user = jwt.verify(token, config.token.secret, { algorithms: [ config.token.algorithm ] });
    if (!user || !user.sub || !user.role) throw new Error();
    let [ name, ns ] = user.sub.split('@');
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

function autho(q, req, ...args) {
  req.autho = null;

  let [ d ] = ns(q);

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
  db.db(d).collection('db.roles').findOne({name: user.role}, (err, r) => {
    if (err || !r) return args.pop()();
    req.autho = r.dbs;
    args.pop()();
  });
}

function isAuth(q, req, method) {
  if (!req.user || !req.autho) return false;

  // check wildcards
  if (req.autho['*'] && req.autho['*'][method] === 1) return true;

  let [ , c ] = ns(q);
  c = c.split('.');
  while (c.length) {
    let k = req.autho[c.join('.')];
    if (k && (k === 1 || k[method] === 1)) return true;
    c.pop();
  }

  // no autho found
  return false;
}

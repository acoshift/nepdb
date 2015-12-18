import express from 'express';
import http from 'http';
import { MongoClient, ObjectID } from 'mongodb';
import { escape } from 'querystring';
import nepq from 'nepq';
import compression from 'compression';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import _ from 'lodash';
import moment from 'moment';
import etag from 'etag';
import fresh from 'fresh';
import config from './config';

import opToken from './operators/token';
import opCreate from './operators/create';
import opRead from './operators/read';
import opUpdate from './operators/update';
import opDelete from './operators/delete';

function decode(base64) {
  return base64 ? new Buffer(base64, 'base64').toString() : null;
}

config.secret = decode(config.secret);

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
    app.use(compression(config.compression));
    app.set('x-powered-by', false);
    app.set('etag', 'strong');

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

  let port = config.port || 8000;

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
  s: 'signin',
  n: 'count',
};

function mapMethodAlias(q) {
  if (methodAlias[q.method]) q.method = methodAlias[q.method];
}

function calc(k, v) {
  switch (k) {
    case '$bcrypt':
      return bcrypt.hashSync(v, bcrypt.genSaltSync(10));
  }
  return null;
}

function preprocess(q) {
  _.forOwn(q, (v, k, a) => {
    if (k.startsWith('$')) {
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

function makeToken(user) {
  return jwt.sign({
    name: user.name,
    pwd: user.pwd,
    ns: user.ns,
    role: user.role
  }, config.secret, {
    algorithm: 'HS256',
    expiresIn: config.expire
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
  if (!req.headers.authorization) return null;
  let [method, token] = req.headers.authorization.split(' ');
  if (method !== 'Bearer') return null;
  return token;
}

function authen(req, res, next) {
  let token = getToken(req);
  let user = {
    name: 'guest',
    role: 'guest'
  };
  try {
    if (!token) throw new Error();
    user = jwt.verify(token, config.secret, { algorithm: 'HS256' });
    if (!user || !user.name || !user.ns) throw new Error();
  } catch (e) { }
  req.user = user;
  next();
}

function autho(q, req, ...args) {
  req.autho = null;
  let user = req.user;
  let [ d ] = ns(q);
  if (!user || user.name === 'guest' || !user.ns || user.ns !== d) user = { role: 'guest', ns: d };
  if (!d) return args.pop()();
  db.db(d).collection('db.roles').findOne({name: user.role}, (err, r) => {
    if (err || !r) return args.pop()();
    req.autho = r.dbs;
    args.pop()();
  });
}

function isAuth(q, req, method) {
  if (!req.user || !req.autho) return false;
  let [ , c ] = ns(q);
  if (req.autho['*'] && req.autho['*'][method] === 1) return true;
  c = c.split('.');
  while (c.length) {
    let k = req.autho[c.join('.')];
    if (k && (k === 1 || k[method] === 1)) return true;
    c.pop();
  }
  return false;
}

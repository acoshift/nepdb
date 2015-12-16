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

function decode(base64) {
  return base64 ? new Buffer(base64, 'base64').toString() : null;
}

config.secret = decode(config.secret);

var connectionUri = (() => {
  let { user, pwd, host, port, maxPoolSize } = config.database;
  return `mongodb://${(user && pwd) ? `${user}:${escape(pwd)}@` : ''}${host || 'localhost'}:${port || 27017}/?maxPoolSize=${maxPoolSize}`;
})();

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

var app = express();

app.use(compression(config.compression));

app.set('x-powered-by', false);

app.set('etag', 'strong');

var db;

MongoClient.connect(connectionUri, (err, database) => {
  if (err) throw err;

  db = database;

  let port = config.port || 8000;

  http.createServer(app).listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
});

var nq = nepq();

function ns(q) {
  let n = q.name.split('.');
  let d = n.shift();
  let c = n.join('.');
  return [ d, c ];
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

var methodAlias = {
  /* CRUD Operator */
  c: 'create',
  r: 'read',
  u: 'update',
  d: 'delete',
  /* $CRUD Operator */
  $c: '$create',
  $r: '$read',
  $u: '$update',
  $d: '$delete',
  /* Token Operator */
  l: 'login',
  f: 'refresh',
  k: 'key',
  /* Advanced Operator */
  cnt: 'count',
  /* DB */
  cd: 'createDatabase',
  rd: 'renameDatabase',
  ls: 'listDatabases',
  dd: 'dropDatabase',
  /* Collection */
  cc: 'createCollection',
  rc: 'renameCollection',
  lc: 'listCollections',
  dc: 'dropCollection',
  /* Index */
  ci: 'createIndex',
  ii: 'indexInformation',
  ei: 'ensureIndex',
  li: 'listIndexes',
  ix: 'indexExists',
};

function mapMethodAlias(q) {
  if (methodAlias[q.method]) q.method = methodAlias[q.method];
}

nq.parser.on('after', q => {
  mapMethodAlias(q);
  preprocess(q.params);
});

function log(q, req, ...args) {
  let user = decodeToken((authToken(req)));
  let [ d ] = ns(q);
  let l = {
    user: user ? user.name : null,
    q: q
  };
  if (d) db.db(d).collection('db.logs').insertOne(l);
  args.pop()();
}

function authToken(req) {
  if (!req.headers.authorization) return null;
  let [method, token] = req.headers.authorization.split(' ');
  if (method !== 'Bearer') return null;
  return token;
}

function authen(req, res, next) {
  let token = authToken(req);
  let user = {
    name: 'guest',
    role: 'guest'
  };
  try {
    if (!token) throw new Error();
    user = jwt.verify(token, config.secret);
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
  db.db(d).collection('db.roles').findOne({name: user.role}, (err, r) => {
    if (err || !r) return args.pop()();
    req.autho = r.dbs;
    args.pop()();
  });
}

function decodeToken(token) {
  let user = null;
  try {
    user = jwt.decode(token, config.secret);
    if (!user || !user.name || !user.ns) throw new Error();
  } catch(e) { return null; }
  return user;
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

function login(ns, name, pwd, cb) {
  if (!ns ||
      !name ||
      !pwd ||
      typeof name !== 'string' ||
      typeof pwd !== 'string') return cb(null);

  db.db(ns).collection('db.users').findOne({ name: name }, (err, r) => {
    if (err ||
        !r ||
        !r.enabled ||
        !r.pwd ||
        !bcrypt.compareSync(pwd, r.pwd)) {
      return cb(null);
    }
    let profile = {
      name: name,
      pwd: pwd,
      ns: ns,
      role: r.role || null
    };
    console.log(profile);
    cb({ token: makeToken(profile) });
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

nq.use(log);

nq.use(autho);

nq.on('login', null, (q, req, res) => {
  login(q.name, q.params.name, q.params.pwd, r => {
    if (!r) return reject(res);
    res.json(q.response(r));
  });
});

nq.on('refresh', '', (q, req, res) => {
  let user = decodeToken((authToken(req)));
  if (!user) return reject(res);
  login(user.ns, user.name, user.pwd, r => {
    res.json(q.response(r));
  });
});

nq.on('$create', null, (q, req, res) => {
  if (!isAuth(q, req, 'c')) return reject(res);
  if (!(q.params instanceof Array)) return error(res, 'NepDBError', 'Parameter must be an array of object');
  collection(q, (err, c) => {
    if (err || !c) return reject(res);
    c.insertMany(q.params, resp.bind(this, req, res, q));
  });
});

nq.on('create', null, (q, req, res) => {
  if (!isAuth(q, req, 'c')) return reject(res);
  if (q.params instanceof Array) return error(res, 'NepDBError', 'Parameter must be an object');
  collection(q, (err, c) => {
    if (err || !c) return reject(res);
    c.insertOne(q.params, resp.bind(this, req, res, q));
  });
});

nq.on('$read', null, (q, req, res) => {
  if (!isAuth(q, req, 'r')) return reject(res);

  let x = q.params;
  let opt = {};

  if (q.params.length >= 2) {
    x = q.params[0];
    opt = q.params[1];
  }

  opt = {
    limit: opt.limit || 0,
    skip: opt.skip || 0
  };

  collection(q, (err, c) => {
    if (err || !c) return reject(res);
    c.find(x).skip(opt.skip).limit(opt.limit).toArray(resp.bind(this, req, res, q));
  });
});

nq.on('read', null, (q, req, res) => {
  if (!isAuth(q, req, 'r')) return reject(res);

  collection(q, (err, c) => {
    if (err || !c) return reject(res);
    c.findOne(q.params, resp.bind(this, req, res, q));
  });
});

nq.on('$update', null, (q, req, res) => {
  if (!isAuth(q, req, 'u')) return reject(res);
  if (!(q.params instanceof Array) || q.params.length !== 2) {
    return error(res, 'NepQError', 'Parameter must be an array of 2 objects');
  }
  q.params[1].$currentDate = { updated: true };
  collection(q, (err, c) => {
    if (err || !c) return reject(res);
    c.updateMany(q.params[0], q.params[1], resp.bind(this, req, res, q));
  });
});

nq.on('update', null, (q, req, res) => {
  if (!isAuth(q, req, 'u')) return reject(res);
  if (!(q.params instanceof Array) || q.params.length !== 2) {
    return error(res, 'NepDBError', 'Parameter must be an array of 2 objects');
  }
  q.params[1].$currentDate = { updated: true };
  collection(q, (err, c) => {
    if (err || !c) return reject(res);
    c.updateOne(q.params[0], q.params[1], resp.bind(this, req, res, q));
  });
});

nq.on('$delete', null, (q, req, res) => {
  if (!isAuth(q, req, 'd')) return reject(res);
  collection(q, (err, c) => {
    if (err || !c) return reject(res);
    c.deleteMany(q.params, resp.bind(this, req, res, q));
  });
});

nq.on('delete', null, (q, req, res) => {
  if (!isAuth(q, req, 'd')) return reject(res);
  collection(q, (err, c) => {
    if (err || !c) return reject(res);
    c.deleteOne(q.params, resp.bind(this, req, res, q));
  });
});

nq.on('count', null, (q, req, res) => {
  if (!isAuth(q, req, 'r')) return reject(res);
  let x = q.params;
  let opt = {};

  if (q.params.length >= 2) {
    x = q.params[0];
    opt = q.params[1];
  }

  opt = {
    limit: opt.limit || null,
    skip: opt.skip || null
  };

  collection(q, (err, c) => {
    if (err || !c) return reject(res);
    c.count(x, opt, resp.bind(this, req, res, q));
  });
});

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

'use strict';

import express from 'express';
import http from 'http';
import { MongoClient, ObjectID } from 'mongodb';
import { escape } from 'querystring';
import nepq from 'nepq';
import compression from 'compression';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import _ from 'lodash';
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
  let d = q.namespace.shift();
  let c = q.namespace.join('.');
  c = c ? `${c}.${q.name}` : q.name;
  return [ d, c ];
}

function makeToken(user) {
  return jwt.sign({
    user: user.user,
    pwd: user.pwd,
    ns: user.ns
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

function resp(res, q, err, r) {
  if (err) {
    error(res, err.name, err.message);
  } else {
    res.json(q.response(r));
  }
}

function calc(k, v) {
  switch (k) {
    case '$$bcrypt':
      return bcrypt.hashSync(v, bcrypt.genSaltSync(10));
  }
  return null;
}

function preprocess(q) {
  // TODO: calculate func in q
  _.forOwn(q.param, (v, k, a) => {
    if (k.startsWith('$$')) {
      _.forOwn(v, (_v, _k, _a) => {
        a[_k] = calc(k, _v);
      });
      delete a[k];
    }
  });
}

nq.parser.on('after', preprocess);

function auth(req, res, next) {
  if (!req.headers['authorization']) return reject(res);
  let [method, token] = req.headers['authorization'].split(' ');
  if (method !== 'Bearer') return reject(res);
  let user;
  try {
    user = jwt.verify(token, config.secret);
    if (!user || !user.user || !user.pwd || !user.exp || !user.ns) throw new Error();
  } catch (e) { return reject(res); }
  db.db(user.ns).collection('user').findOne({
    user: user.user
  }, (err, r) => {
    if (err || !r || !r.pwd || !bcrypt.compareSync(user.pwd, r.pwd)) return reject(res);

    let q = nq.request;
    // TODO: check method and db name with user's roles

    req.user = user;
    next();
  });
}

nq.on('login', '', null, (q, req, res) => {
  if (!q.name ||
      !q.param.user ||
      !q.param.pwd ||
      typeof q.param.user !== 'string' ||
      typeof q.param.pwd !== 'string') return reject(res);

  db.db(q.name).collection('user').findOne({
    user: q.param.user
  }, (err, r) => {
    if (err || !r || !r.pwd || !bcrypt.compareSync(q.param.pwd, r.pwd)) return reject(res);
    let user = {
      user: q.param.user,
      pwd: q.param.pwd,
      ns: q.name
    }
    res.json(q.response({ token: makeToken(user) }));
  });
});

nq.on('refresh', '', '', (q, req, res) => {
  auth(req, res, () => {
    if (!req.user) return reject(res);
    res.json(q.response({token: makeToken(req.user)}));
  });
});

nq.on('create', null, null, (q, req, res) => {
  auth(req, res, () => {
    let [ d, c ] = ns(q);
    db.db(d).collection(c).insertMany(q.param, { w: 1 }, resp.bind(this, res, q));
  });
});

nq.on('$create', null, null, (q, req, res) => {
  auth(req, res, () => {
    let [ d, c ] = ns(q);
    db.db(d).collection(c).insertOne(q.param, { w: 1 }, resp.bind(this, res, q));
  });
});

nq.on('read', null, null, (q, req, res) => {
  auth(req, res, () => {
    let [ d, c ] = ns(q);

    let x = q.param;
    let opt = {};

    if (q.param.length >= 2) {
      x = q.param[0];
      opt = q.param[1];
    }

    opt = {
      limit: opt.limit || 0,
      skip: opt.skip || 0
    }

    db.db(d).collection(c).find(x).skip(opt.skip).limit(opt.limit).toArray(resp.bind(this, res, q));
  });
});

nq.on('$read', null, null, (q, req, res) => {
  auth(req, res, () => {
    let [ d, c ] = ns(q);
    db.db(d).collection(c).findOne(q.param, resp.bind(this, res, q));
  });
});

nq.on('update', null, null, (q, req, res) => {
  auth(req, res, () => {
    let [ d, c ] = ns(q);
    if (!(q.param instanceof Array) || q.param.length !== 2) {
      return error(res, 'NepQ', 'Bad Request');
    }
    db.db(d).collection(c).updateMany(q.param[0], q.param[1], resp.bind(this, res, q));
  });
});

nq.on('$update', null, null, (q, req, res) => {
  auth(req, res, () => {
    let [ d, c ] = ns(q);
    if (!(q.param instanceof Array) || q.param.length !== 2) {
      return error(res, 'NepQ', 'Bad Request');
    }
    db.db(d).collection(c).updateOne(q.param[0], q.param[1], resp.bind(this, res, q));
  });
});

nq.on('delete', null, null, (q, req, res) => {
  auth(req, res, () => {
    let [ d, c ] = ns(q);
    db.db(d).collection(c).deleteMany(q.param, { w: 1 }, resp.bind(this, res, q));
  });
});

nq.on('$delete', null, null, (q, req, res) => {
  auth(req, res, () => {
    let [ d, c ] = ns(q);
    db.db(d).collection(c).deleteOne(q.param, { w: 1 }, resp.bind(this, res, q));
  });
});

nq.use((q, req, res) => {
  error(res, 'NepDB', 'Not Implemented');
});

nq.error((req, res) => {
  error(res, 'NepQ', 'Bad Request');
});

app.use((req, res, next) => {
  // TODO: config CORS from database
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(nq.bodyParser());

app.use((req, res) => {
  res.json({ error: { name: 'NepDB', message: 'Bad Request' }});
});

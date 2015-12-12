'use strict';

import express from 'express';
import http from 'http';
import { MongoClient, ObjectID } from 'mongodb';
import { escape } from 'querystring';
import nepq from 'nepq';
import compression from 'compression';
import jwt from 'jsonwebtoken';
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

function resp(err, r) {
  if (err) {
    nq.res.status(520).json(err);
  } else {
    nq.send(r);
  }
}

function ns() {
  let q = nq.request;
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

function reject(res) {
  res.status(401).json({
    name: 'NepDBError',
    message: 'Unauthorized'
  });
}

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
    user: user.user, pwd: user.pwd
  }, (err, r) => {
    if (err || !r) return reject(res);

    let q = nq.request;
    // TODO: check method and db name with user's roles

    req.user = user;
    next();
  });
}

nq.on('login', '', null, q => {
  if (!q.name ||
      !q.param.user ||
      !q.param.pwd ||
      typeof q.param.user !== 'string' ||
      typeof q.param.pwd !== 'string') return reject(nq.res);

  db.db(q.name).collection('user').findOne({
    user: q.param.user, pwd: q.param.pwd
  }, (err, r) => {
    if (err || !r) return reject(nq.res);
    let user = {
      user: r.user,
      pwd: r.pwd,
      ns: q.name
    }
    nq.send({ token: makeToken(user) });
  });
});

nq.on('refresh', '', '', () => {
  setTimeout(() => {
    if (!nq.req.user) return reject(nq.res);
  nq.send({token: makeToken(nq.req.user)});
  }, 7000);

});

nq.on('create', null, null, q => {
  let [ d, c ] = ns();
  db.db(d).collection(c).insertMany(q.param, { w: 1 }, resp);
});

nq.on('$create', null, null, q => {
  let [ d, c ] = ns();
  db.db(d).collection(c).insertOne(q.param, { w: 1 }, resp);
});

nq.on('read', null, null, q => {
  let [ d, c ] = ns();

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

  db.db(d).collection(c).find(x).skip(opt.skip).limit(opt.limit).toArray(resp);
});

nq.on('$read', null, null, q => {
  let [ d, c ] = ns();

  db.db(d).collection(c).findOne(q.param, resp);
});

nq.on('update', null, null, q => {
  let [ d, c ] = ns();

  if (!(q.param instanceof Array) || q.param.length !== 2) {
    return nq.res.status(400).json({
      name: 'NepQError',
      message: 'Bad Request'
    });
  }

  db.db(d).collection(c).updateMany(q.param[0], q.param[1], resp);
});

nq.on('$update', null, null, q => {
  let [ d, c ] = ns();

  if (!(q.param instanceof Array) || q.param.length !== 2) {
    return nq.res.status(400).json({
      name: 'NepQError',
      message: 'Bad Request'
    });
  }

  db.db(d).collection(c).updateOne(q.param[0], q.param[1], resp);
});

nq.on('delete', null, null, q => {
  let [ d, c ] = ns();

  db.db(d).collection(c).deleteMany(q.param, { w: 1 }, resp);
});

nq.on('$delete', null, null, q => {
  let [ d, c ] = ns();

  db.db(d).collection(c).deleteOne(q.param, { w: 1 }, resp);
});

nq.use(() => {
  nq.res.status(501).json({
    name: 'NepDB',
    message: 'Not Implemented'
  });
});

nq.error(() => {
  nq.res.status(400).json({
    name: 'NepQError',
    message: 'Bad Request'
  });
});

app.use((req, res, next) => {
  // TODO: config CORS from database
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.use(auth);

app.use(nq.bodyParser());

app.use((req, res) => {
  res.status(400).json({
    name: 'NepDB',
    message: 'Bad Request'
  });
});

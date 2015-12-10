'use strict';

import express from 'express';
import http from 'http';
import { MongoClient, ObjectID } from 'mongodb';
import { escape } from 'querystring';
import nepq from 'nepq';
import uuid from 'node-uuid';
import config from './config';

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
/*
interface User {
  _id: mongodb.ObjectID;
  username: string;
  password: string;
  role: mongodb.ObjectID;
}

interface Token {
  _id: mongodb.ObjectID;
  token: string;
  user: mongodb.ObjectID;
  timestamp: number;
  expire: number;
}

interface Role {
  _id: mongodb.ObjectID;
  name: string;
  auth: any;
}
*/

var app = express();
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

function auth() {
  let q = nq.request;
  // TODO: auth logic
  return true;
}

nq.on('auth', null, 'login', q => {
  console.log(q);
  let _db = q.namespace.shift();
  db.db(_db).collection('nepq.user').findOne({
    username: q.param.username,
    password: q.param.password
  }, (err, r) => {
    if (err) return resp(err);
    if (!r) return resp(401);

    // create token
    let token = uuid.v4();
    db.db(_db).collection('nepq.token').insert({
      token: token,
      user: r._id,
      created: Date.now(),
      expire: Date.now() + (q.param.remember ? config.auth.expire.remember : config.auth.expire.time)
    }, (err) => {
      if (err) return resp(500);
      nq.response({ token: token });
    });
  });
});

function extendTime(token) {
  // TODO: add config.suth.expire.time to token
}

nq.on('auth', null, 'logout', q => {
  let _db = q.namespace.shift();

});

nq.on('create', null, null, q => {
  if (!auth()) return;
  let [ d, c ] = ns();
  db.db(d).collection(c).insertMany(q.param, { w: 1 }, (err, r) => {
    if (err) return resp(err);
    resp(null, r.ops);
  });
});

nq.on('$create', null, null, q => {
  if (!auth()) return;
  let [ d, c ] = ns();
  db.db(d).collection(c).insertOne(q.param, { w: 1 }, (err, r) => {
    if (err) return resp(err);
    resp(null, r.ops[0]);
  });
});

nq.on('read', null, null, q => {
  if (!auth()) return;
  let [ d, c ] = ns();

  let limit = 0,
    skip = 0;

  if (typeof q.param.$limit !== 'undefined') {
    limit = q.param.$limit;
    delete q.param.$limit;
  }

  if (typeof q.param.$skip !== 'undefined') {
    skip = q.param.$skip;
    delete q.param.$skip;
  }

  db.db(d).collection(c).find(q.param).skip(skip).limit(limit).toArray(resp);
});

nq.on('$read', null, null, q => {
  if (!auth()) return;
  let [ d, c ] = ns();

  let skip = 0;

  if (typeof q.param.$skip !== 'undefined') {
    skip = q.param.$skip;
    delete q.param.$skip;
  }

  db.db(d).collection(c).findOne(q.param, resp);
});

nq.on('update', null, null, q => {
  if (!auth()) return;
  let [ d, c ] = ns();

  if (!(q.param instanceof Array)) return resp(400);
  if (q.param.length !== 2) return resp(400);

  db.db(d).collection(c).updateMany(q.param.q, q.param.d, resp);
});

nq.on('$update', null, null, q => {
  if (!auth()) return;
  let [ d, c ] = ns();

  if (!(q.param instanceof Array)) return resp(400);
  if (q.param.length !== 2) return resp(400);

  db.db(d).collection(c).updateOne(q.param.q, q.param.d, resp);
});

nq.on('delete', null, null, q => {
  if (!auth()) return;
  let [ d, c ] = ns();

  db.db(d).collection(c).deleteMany(q.param, resp);
});

nq.on('$delete', null, null, q => {
  if (!auth()) return;
  let [ d, c ] = ns();

  db.db(d).collection(c).deleteOne(q.param, resp);
});

nq.use(() => {
  nq.res.status(405).json({
    name: 'NepDB',
    message: 'Method Not Allowed'
  });
});

nq.error(() => {
  nq.res.status(400).json({
    name: 'NepQError',
    message: 'Bad Request'
  });
})

app.use(nq.bodyParser());

app.use((req, res) => {
  res.status(406).json({
    name: 'NepDB',
    message: 'Not Acceptable'
  });
});

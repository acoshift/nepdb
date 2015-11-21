/*
  collection:
    - db: store database info
        {
          "name": "test",
          "api": [
            {
              "key": "xxxxxxxxxxxxxxxxx",
              "desc": "my api key",
              "roles": [
                {
                  "collection0": [ "GET", "POST" ],
                  "collection1": [ "DELETE" ]
                }
              ]
              "createAt": 1212121
              "updateAt": 1444224
            }
          ],
          "createAt": 1212121
          "updateAt": 1444224
        }
    - log: store api called log
        {
          "db": "_id of db"
          "key": "xxxxxxxxxxxxxxxxx",
          "method": "GET",
          "collection": "product",
          "querystring": "?q={}",
          "origin": "www.myweb.com",
          "ok": 1,
          "timestamp": 1122121
        }
    - user: store user info
        {
          "user": "user1",
          "pass": "some bcrypt",
          "db": [ "_id of db0", "_id of db2", "_id of db3" ],
          "createAt": 1212121
          "updateAt": 1444224
        }
    - ssl: store ssl data for each domain name
        {
          host: "myweb.com",
          "ssl": {
            "cert": "",
            "key": "",
            "ca": [ "", "", "" ]
          }
        }
        
  api:
    /api/:db/:collection?q={} - native mongodb query
    /api/:db/:collection/:id - GET, POST, PUT, DELETE
    /api/:db/fs - GridFS
      /chunks - binary chunks
      /files - file’s metadata
      TODO
*/

/// <reference path="typings/tsd.d.ts" />
'use strict';

import * as express from "express";
import * as path from "path";
import * as http from "http";
import * as https from "https";
import * as tls from "tls";
import * as ip from "ip";
import * as bodyParser from "body-parser";
import * as methodOverride from "method-override";
import * as winston from "winston";
import { MongoClient, ObjectID } from "mongodb";
import { escape } from "querystring";
import { Config } from "./config";

var config: Config = require('./config');

var connectionUri = (() => {
  let { user, pwd, host, port, db } = config.database;
  return `mongodb://${(user && pwd) ? `${user}:${escape(pwd)}@` : ''}${host || 'localhost'}:${port || 27017}/${db || 'nepdb'}`;
})();

function objectId(id: string): ObjectID {
  let _id = null;
  try {
    _id = ObjectID.createFromHexString(id);
  } catch (e) { }
  return _id;
}

MongoClient.connect(connectionUri, (err, db) => {
  var app = express();

  // TODO: get database name from domain name
  app.use((req, res, next) => {
    next();
  });
  
  // TODO: get database name from url if no custom domain name
  app.use((req, res, next) => {
    next();
  });
  
  // TODO: query database info
  app.use((req, res, next) => {
    // TODO: check api-key form request database info
    // TODO: check CORS from request with database info
    // TODO: check role from request with database info
    // TODO: add log data
    // TODO: run request command
    // TODO: send response back
  });
  
  config.http && http.createServer(app).listen(config.http);
  
  config.https && db.collection('ssl').findOne({ host: config.host }, (err, r) => {
    if (err) return;
    
    let ops = {
      cert: '',
      key: '',
      ca: '',
      SNICallback: (host, cb) => {
        db.collection('ssl').findOne({ host: host }, (err, r) => {
          if (err || !r) { cb(null, null); return; }
          cb(null, tls.createSecureContext({
            cert: r.ssl.cert || '',
            key: r.ssl.key || '',
            ca: r.ssl.ca || ''
          }).context)
        });
      }
    }
    
    if (r) {
      ops.cert = r.ssl.cert || '';
      ops.key = r.ssl.key || '';
      ops.ca = r.ssl.ca || '';
    }
    
    https.createServer(ops, app).listen(config.https);
  });
})

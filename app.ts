/// <reference path="./typings/tsd.d.ts" />
'use strict';

import * as express from "express";
import * as http from "http";
import { MongoClient, ObjectID } from "mongodb";
import { escape } from "querystring";
import * as apiNepq from "./api/nepq";
import * as apiRest from "./api/rest";
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

function json(s: string): any {
  let r = {};
    try {
      r = JSON.parse(s);
    } catch (e) { }
  return r;
}

MongoClient.connect(connectionUri, (err, db) => {
  var app = express();
  
  app.use('nepq', apiNepq);
  app.use('rest', apiRest);
  
  app.use((req, res) => {
    ;
  });
  
  let port = config.port || 8000;

  http.createServer(app).listen(port, () => {
    console.log(`http server started at port ${port}`);
  });
})

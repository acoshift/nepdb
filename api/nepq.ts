/// <reference path="../typings/tsd.d.ts" />
'use strict';

import * as express from "express";
import * as bodyParser from "body-parser";

/* Request
  {
    "method": "read", // CRUD: create, read, update, delete
    "database": "mydb",
    "collection": "user",
    "params": {
      "username": "user13"
    },
    "retrieve": {
      "id": 1,
      "username": 1,
      "email": 1,
      "address": {
        "zip": 1,
        "country": 1
      }
    }
  }
*/

interface Request {
  method: string;
  database: string;
  collection: string;
  params: any;
  retrieve: any;
}

/* Response
  {
    "ok": 1,
    "error": null,
    "result": {
      "id": 13244,
      "username": "user13",
      "email": "myemail@email.com",
      "address": {
        "zip": 12345,
        "country": "TH"
      }
    }
  }
*/

interface Response {
  ok: number;
  error: any;
  result: any;
}

var nepq = express();

nepq.use(bodyParser.json());

// TODO: Implement Nepq API

export = nepq;

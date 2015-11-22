/// <reference path="../typings/tsd.d.ts" />
'use strict';

import * as express from "express";
import * as bodyParser from "body-parser";

var rest = express();

rest.use(bodyParser.json());

// TODO: Implement Rest API

export = rest;

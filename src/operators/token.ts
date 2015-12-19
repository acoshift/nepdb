import {
  NepDB,
  Operator,
} from 'nepdb';

import * as bcrypt from 'bcryptjs';
import * as _ from 'lodash';
import ms = require('ms');

var op: Operator = function(nepdb: NepDB) {
  let {
    nq,
    db,
    reject,
    makeToken,
    config,
    error,
  } = nepdb;

  nq.on('login', null, (q, req, res) => {
    function badRequest() {
      error(res, 'NepDBError', 'Bad Request');
    }
    // check params
    let ns = q.name;
    if (!ns) return badRequest();
    let d;
    if (_.isArray(q.params)) {
      if (q.params.length === 2) {
        d = {
          name: q.params[0],
          pwd: q.params[1]
        };
      } else if (q.params.length === 3) {
        d = {
          name: q.params[0],
          pwd: q.params[1],
          exp: q.params[2]
        }
      } else {
        return badRequest();
      }
    } else if (_.isPlainObject(q.params)) {
      if (!q.params.name || !q.params.pwd) return badRequest();
      d = {
        name: q.params.name,
        pwd: q.params.pwd
      };
      if (q.params.exp) d.exp = q.params.exp;
    }

    if (!d ||
        typeof d.name !== 'string' ||
        typeof d.pwd !== 'string') return badRequest();

    db.db(ns).collection('db.users').findOne({ name: d.name }, (err, r) => {
      if (err ||
          !r ||
          !r.enabled ||
          !r.pwd ||
          !bcrypt.compareSync(d.pwd, r.pwd)) {
        return reject(res);
      }
      let profile = {
        name: d.name,
        ns: ns,
        role: r.role || 'guest'
      };
      let token = makeToken(profile, d.exp);
      res.cookie('token', r, {
        maxAge: ms(d.exp) || ms(config.token.expiresIn),
        //secure: true,
        httpOnly: true,
        signed: true
      });
      res.sendStatus(200);
    });
  });

  nq.on('logout', null, (q, req, res) => {
    res.clearCookie('token');
    res.sendStatus(200);
  });
}

export = op;

import {
  NepDB,
  Operator,
} from 'nepdb';

import * as bcrypt from 'bcryptjs';
import * as _ from 'lodash';
import ms = require('ms');

var op: Operator = function(n: NepDB) {
  n.nq.on('login', null, (q, req, res) => {
    function badRequest() {
      n.error(res, 'NepDBError', 400);
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

    n.db.db(ns).collection('db.users').findOne({ name: d.name }, (err, r) => {
      if (err ||
          !r ||
          !r.enabled ||
          !r.pwd ||
          !bcrypt.compareSync(d.pwd, r.pwd)) {
        return n.reject(res);
      }
      let profile = {
        name: d.name,
        ns: ns
      };
      let token = n.makeToken(profile, d.exp);
      res.cookie('token', token, {
        maxAge: d.exp ? ms(d.exp) : ms(n.config.server.cookie.expiresIn),
        secure: true,
        httpOnly: true
      });
      /*res.status(200).json({
        ok: 1
      });*/
      res.json(q.response({ token: token }));
    });
  });

  /*
  n.nq.on('logout', null, (q, req, res) => {
    res.clearCookie('token');
    res.sendStatus(200);
  });
  */
}

export = op;

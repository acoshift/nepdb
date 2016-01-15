import {
  NepDB,
  Operator,
} from 'nepdb';

import * as _ from 'lodash';

var op: Operator = function(n: NepDB) {
  n.nq.on('create', null, (q, req, res) => {
    // check create authorization
    if (n.isAuth(q, req, 'c') === 0) return n.reject(res);

    // change params to array
    if (!_.isArray(q.params)) q.params = [ q.params ];

    // check are params plain object
    if (!_.every(q.params, _.isPlainObject)) return n.error(res, 'NepDBError', 400);

    // add owner to params
    if (req.user._id) {
      _.forEach(q.params, x => x._owner = req.user._id);
    }

    n.collection(q, (err, c) => {
      if (err || !c) return n.reject(res);
      c.insertMany(q.params, n.resp.bind(n, req, res, q));
    });
  });

  n.nq.on('import', null, (q, req, res) => {
    // check create authorization
    if (n.isAuth(q, req, 'c') === 0) return n.reject(res);

    // change params to array
    if (!_.isArray(q.params)) return n.error(res, 'NepDBError', 400);

    // check are params array
    if (!_.every(q.params, _.isArray)) return n.error(res, 'NepDBError', 400);

    n.collection(q, (err, c) => {
      if (err || !c) return n.reject(res);

      // loop in params
      let ps = q.params;
      let obj;
      let i;
      for (i = 1; i < ps.length; ++i) {
        obj = {};
        _.forEach(ps[0], (name, j) => {
          _.set(obj, name, ps[i][j]);
        });

        // add owner to params
        if (req.user._id) {
          obj._owner = req.user._id;
        }

        // write obj to database
        // c.insertMany(q.params, n.resp.bind(n, req, res, q));
        c.insertOne(obj, { w: 0 }, null);
      }
    });
    // TODO: check return ok obj count (n)
    res.json({ ok: 1 });
  });
}

export = op;

import {
  NepDB,
  Operator,
} from 'nepdb';

import * as _ from 'lodash';

var op: Operator = function(n: NepDB) {
  n.nq.on('create', null, (q, req, res) => {
    // check create authorization
    if (!n.isAuth(q, req, 'c')) return n.reject(res);

    // change params to array
    if (!_.isArray(q.params)) q.params = [ q.params ];

    // check are params plain object
    if (!_.every(q.params, _.isPlainObject)) return n.error(res, 'NepDBError', 400);

    n.collection(q, (err, c) => {
      if (err || !c) return n.reject(res);
      c.insertMany(q.params, n.resp.bind(n, req, res, q));
    });
  });
}

export = op;

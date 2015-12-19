import {
  NepDB,
  Operator,
} from 'nepdb';

import * as _ from 'lodash';

var op: Operator = function(n: NepDB) {
  n.nq.on('update', null, (q, req, res) => {
    // check update authorization
    if (!n.isAuth(q, req, 'u')) return n.reject(res);

    // check params
    if (!_.isArray(q.params) ||
        q.params.length !== 2 ||
        !_.isString(q.params[0]) ||
        !_.isPlainObject(q.params[1])) return n.error(res, 'NepDBError', 400);

    q.params[0] = n.objectId(q.params[0]);

    if (!q.params[0]) return n.error(res, 'NepDBError', 400);

    let doc = {
      $set: q.params[1],
      $currentDate: { _updated: true }
    };

    n.collection(q, (err, c) => {
      if (err || !c) return n.reject(res);
      c.updateOne({ _id: q.params[0] }, doc, n.resp.bind(this, req, res, q));
    });
  });
}

export = op;

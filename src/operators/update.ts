import {
  NepDB,
  Operator,
} from 'nepdb';

import * as _ from 'lodash';

var op: Operator = function(nepdb: NepDB) {
  let {
    nq,
    reject,
    resp,
    isAuth,
    collection,
    objectId,
    error,
  } = nepdb;

  nq.on('update', null, (q, req, res) => {
    // check update authorization
    if (!isAuth(q, req, 'u')) return reject(res);

    // check params
    if (!_.isArray(q.params) ||
        q.params.length !== 2 ||
        !_.isString(q.params[0]) ||
        !_.isPlainObject(q.params[1])) return error(res, 'NepDBError', 400);

    q.params[0] = objectId(q.params[0]);

    if (!q.params[0]) return error(res, 'NepDBError', 400);

    let doc = {
      $set: q.params[1],
      $currentDate: { _updated: true }
    };

    collection(q, (err, c) => {
      if (err || !c) return reject(res);
      c.updateOne({ _id: q.params[0] }, doc, resp.bind(this, req, res, q));
    });
  });
}

export = op;

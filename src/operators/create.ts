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
    error,
  } = nepdb;

  nq.on('create', null, (q, req, res) => {
    // check create authorization
    if (!isAuth(q, req, 'c')) return reject(res);

    // change params to array
    if (!_.isArray(q.params)) q.params = [ q.params ];

    // check are params plain object
    if (!_.every(q.params, _.isPlainObject)) return error(res, 'NepDBError', 400);

    collection(q, (err, c) => {
      if (err || !c) return reject(res);
      c.insertMany(q.params, resp.bind(this, req, res, q));
    });
  });
}

export = op;

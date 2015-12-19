import {
  NepDB,
  Operator,
} from 'nepdb';

import * as _ from 'lodash';

var op: Operator = function() {
  let {
    nq,
    reject,
    resp,
    isAuth,
    collection,
    error,
    objectId,
  } = this;

  nq.on('delete', null, (q, req, res) => {
    // check delete authorization
    if (!isAuth(q, req, 'd')) return reject(res);

    // change params to array
    if (!_.isArray(q.params)) q.params = [ q.params ];

    // check are params string
    if (!_.every(q.params, _.isString)) return error(res, 'NepDBError', 'Invalid parameters');

    // convert id string to ObjectID
    let params = _.map(q.params, objectId);

    collection(q, (err, c) => {
      if (err || !c) return reject(res);
      c.deleteMany({ _id: { $in: params } }, resp.bind(this, req, res, q));
    });
  });
}

export = op;

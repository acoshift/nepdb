import {
  NepDB,
  Operator,
} from 'nepdb';

import * as _ from 'lodash';

var op: Operator = function(n: NepDB) {
  n.nq.on('delete', null, (q, req, res) => {
    // check delete authorization
    if (!n.isAuth(q, req, 'd')) return n.reject(res);

    // change params to array
    if (!_.isArray(q.params)) q.params = [ q.params ];

    // check are params string
    if (!_.every(q.params, _.isString)) return n.error(res, 'NepDBError', 400);

    // convert id string to ObjectID
    let params = _.map(q.params, n.objectId);

    n.collection(q, (err, c) => {
      if (err || !c) return n.reject(res);
      c.deleteMany({ _id: { $in: params } }, n.resp.bind(n, req, res, q));
    });
  });
}

export = op;

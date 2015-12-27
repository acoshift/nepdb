import {
  NepDB,
  Operator,
} from 'nepdb';

import * as _ from 'lodash';

var op: Operator = function(n: NepDB) {
  n.nq.on('delete', null, (q, req, res) => {
    // check delete authorization
    let auth = n.isAuth(q, req, 'd');
    if (auth === 0) return n.reject(res);
    if (auth === 2 && !req.user._id) return n.reject(res);

    // change params to array
    if (!_.isArray(q.params)) q.params = [ q.params ];

    // check are params string
    if (!_.every(q.params, _.isString)) return n.error(res, 'NepDBError', 400);

    // convert id string to ObjectID
    let params = _.map(q.params, n.objectId);

    let query: any = { _id: { $in: params } };
    if (auth === 2) {
      query._owner = req.user._id;
    }

    let [ d, col ] = n.ns(q);

    n.collection(q, (err, c) => {
      if (err || !c) return n.reject(res);
      c.find(query).each((err, r) => {
        if (err || !r) return;
        n.db.db(d).collection('db.trash').insertOne({
          db: col,
          data: r
        }, { w: 0 }, null);
      });
      c.deleteMany(query, n.resp.bind(n, req, res, q));
    });
  });
}

export = op;

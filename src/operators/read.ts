import {
  NepDB,
  Operator,
} from 'nepdb';

import * as _ from 'lodash';

interface ReadOptions {
  limit?: number;
  skip?: number;
}

var op: Operator = function(n: NepDB) {
  n.nq.on('query', null, (q, req, res) => {
    // check read authorization
    if (!n.isAuth(q, req, 'r')) return n.reject(res);

    // check params
    if (_.isArray(q.params) && q.params.length > 2) return n.error(res, 'NepDBError', 400);

    let x = q.params;
    let opt: ReadOptions = {};

    if (_.isArray(q.params) && q.params.length === 2) {
      x = q.params[0];
      opt = q.params[1];
    }

    opt = {
      limit: opt.limit || 0,
      skip: opt.skip || 0
    };

    n.collection(q, (err, c) => {
      if (err || !c) return n.reject(res);
      c.find(x).skip(opt.skip).limit(opt.limit).toArray(n.resp.bind(n, req, res, q));
    });
  });

  n.nq.on('read', null, (q, req, res) => {
    // check read authorization
    if (!n.isAuth(q, req, 'r')) return n.reject(res);

    // change params to array
    if (!_.isArray(q.params)) q.params = [ q.params ];

    // check are params string
    if (!_.every(q.params, _.isString)) return n.error(res, 'NepDBError', 400);

    // convert id string to ObjectID
    let params = _.map(q.params, n.objectId);

    n.collection(q, (err, c) => {
      if (err || !c) return n.reject(res);
      c.find({ _id: { $in: params } }).toArray(n.resp.bind(n, req, res, q));
    });
  });

  n.nq.on('count', null, (q, req, res) => {
    // check read authorization
    if (!n.isAuth(q, req, 'r')) return n.reject(res);

    // check params
    if (_.isArray(q.params) && q.params.length > 2) return n.error(res, 'NepDBError', 400);

    let x = q.params;
    let opt: ReadOptions = {};

    if (_.isArray(q.params) && q.params.length === 2) {
      x = q.params[0];
      opt = q.params[1];
    }

    opt = {
      limit: opt.limit || null,
      skip: opt.skip || null
    };

    n.collection(q, (err, c) => {
      if (err || !c) return n.reject(res);
      c.count(x, opt, n.resp.bind(n, req, res, q));
    });
  });
}

export = op;

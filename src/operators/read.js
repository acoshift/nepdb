import _ from 'lodash';

export default function() {
  let {
    nq,
    reject,
    resp,
    isAuth,
    collection,
    objectId,
    error,
  } = this;

  nq.on('list', null, (q, req, res) => {
    // check read authorization
    if (!isAuth(q, req, 'r')) return reject(res);

    // check params
    if (_.isArray(q.params) && q.params.length > 2) return error(res, 'NepDBError', 'Invalid parameters');

    let x = q.params;
    let opt = {};

    if (_.isArray(q.params) && q.params.length === 2) {
      x = q.params[0];
      opt = q.params[1];
    }

    opt = {
      limit: opt.limit || 0,
      skip: opt.skip || 0
    };

    collection(q, (err, c) => {
      if (err || !c) return reject(res);
      c.find(x).skip(opt.skip).limit(opt.limit).toArray(resp.bind(this, req, res, q));
    });
  });

  nq.on('read', null, (q, req, res) => {
    // check read authorization
    if (!isAuth(q, req, 'r')) return reject(res);

    // change params to array
    if (!_.isArray(q.params)) q.params = [ q.params ];

    // check are params string
    if (!_.every(q.params, _.isString)) return error(res, 'NepDBError', 'Invalid parameters');

    // convert id string to ObjectID
    let params = _.map(q.params, objectId);

    collection(q, (err, c) => {
      if (err || !c) return reject(res);
      c.find({ _id: { $in: params } }).toArray(resp.bind(this, req, res, q));
    });
  });

  nq.on('count', null, (q, req, res) => {
    if (!isAuth(q, req, 'r')) return reject(res);
    let x = q.params;
    let opt = {};

    if (q.params.length >= 2) {
      x = q.params[0];
      opt = q.params[1];
    }

    opt = {
      limit: opt.limit || null,
      skip: opt.skip || null
    };

    collection(q, (err, c) => {
      if (err || !c) return reject(res);
      c.count(x, opt, resp.bind(this, req, res, q));
    });
  });
}

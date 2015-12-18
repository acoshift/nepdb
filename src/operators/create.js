import _ from 'lodash';

export default function() {
  let {
    nq,
    reject,
    resp,
    isAuth,
    collection,
    error,
  } = this;

  nq.on('create', null, (q, req, res) => {
    // check create authorization
    if (!isAuth(q, req, 'c')) return reject(res);

    // change params to array
    if (!_.isArray(q.params)) q.params = [ q.params ];

    // check are params plain object
    if (!_.every(q.params, _.isPlainObject)) return error(res, 'NepDBError', 'Invalid parameters');

    collection(q, (err, c) => {
      if (err || !c) return reject(res);
      c.insertMany(q.params, resp.bind(this, req, res, q));
    });
  });
}

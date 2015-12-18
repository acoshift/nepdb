export default function() {
  let {
    nq,
    reject,
    resp,
    isAuth,
    collection,
    error,
  } = this;

  nq.on('$create', null, (q, req, res) => {
    if (!isAuth(q, req, 'c')) return reject(res);
    if (!(q.params instanceof Array)) return error(res, 'NepDBError', 'Parameter must be an array of object');
    collection(q, (err, c) => {
      if (err || !c) return reject(res);
      c.insertMany(q.params, resp.bind(this, req, res, q));
    });
  });

  nq.on('create', null, (q, req, res) => {
    if (!isAuth(q, req, 'c')) return reject(res);
    if (q.params instanceof Array) return error(res, 'NepDBError', 'Parameter must be an object');
    collection(q, (err, c) => {
      if (err || !c) return reject(res);
      c.insertOne(q.params, resp.bind(this, req, res, q));
    });
  });
}

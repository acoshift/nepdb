export default function() {
  let {
    nq,
    reject,
    resp,
    isAuth,
    collection,
  } = this;

  nq.on('$update', null, (q, req, res) => {
    if (!isAuth(q, req, 'u')) return reject(res);
    if (!(q.params instanceof Array) || q.params.length !== 2) {
      return error(res, 'NepQError', 'Parameter must be an array of 2 objects');
    }
    q.params[1].$currentDate = { updated: true };
    collection(q, (err, c) => {
      if (err || !c) return reject(res);
      c.updateMany(q.params[0], q.params[1], resp.bind(this, req, res, q));
    });
  });

  nq.on('update', null, (q, req, res) => {
    if (!isAuth(q, req, 'u')) return reject(res);
    if (!(q.params instanceof Array) || q.params.length !== 2) {
      return error(res, 'NepDBError', 'Parameter must be an array of 2 objects');
    }
    q.params[1].$currentDate = { updated: true };
    collection(q, (err, c) => {
      if (err || !c) return reject(res);
      c.updateOne(q.params[0], q.params[1], resp.bind(this, req, res, q));
    });
  });
}

export default function() {
  let {
    nq,
    reject,
    resp,
    isAuth,
    collection,
  } = this;

  nq.on('$delete', null, (q, req, res) => {
    if (!isAuth(q, req, 'd')) return reject(res);
    collection(q, (err, c) => {
      if (err || !c) return reject(res);
      c.deleteMany(q.params, resp.bind(this, req, res, q));
    });
  });

  nq.on('delete', null, (q, req, res) => {
    if (!isAuth(q, req, 'd')) return reject(res);
    collection(q, (err, c) => {
      if (err || !c) return reject(res);
      c.deleteOne(q.params, resp.bind(this, req, res, q));
    });
  });
}

export default function() {
  let {
    nq,
    reject,
    resp,
    isAuth,
    collection,
  } = this;

  nq.on('$read', null, (q, req, res) => {
    if (!isAuth(q, req, 'r')) return reject(res);

    let x = q.params;
    let opt = {};

    if (q.params.length >= 2) {
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
    if (!isAuth(q, req, 'r')) return reject(res);

    collection(q, (err, c) => {
      if (err || !c) return reject(res);
      c.findOne(q.params, resp.bind(this, req, res, q));
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

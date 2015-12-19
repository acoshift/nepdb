import * as bcrypt from 'bcryptjs';

export = function() {
  let {
    nq,
    db,
    reject,
    makeToken,
  } = this;

  function token(ns, name, pwd, cb) {
    if (!ns ||
        !name ||
        !pwd ||
        typeof name !== 'string' ||
        typeof pwd !== 'string') return cb(null);

    db.db(ns).collection('db.users').findOne({ name: name }, (err, r) => {
      if (err ||
          !r ||
          !r.enabled ||
          !r.pwd ||
          !bcrypt.compareSync(pwd, r.pwd)) {
        return cb(null);
      }
      let profile = {
        name: name,
        pwd: pwd,
        ns: ns,
        role: r.role || null
      };
      cb({ token: makeToken(profile) });
    });
  }

  nq.on('token', null, (q, req, res) => {
    token(q.name, q.params.name, q.params.pwd, r => {
      if (!r) return reject(res);
      res.json(q.response(r));
    });
  });
}

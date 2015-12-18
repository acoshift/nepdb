import bcrypt from 'bcryptjs';

export default function() {
  let {
    nq,
    app,
    db,
    config,
    reject,
    makeToken,
    decodeToken,
    collection,
    authToken,
  } = this;

  function login(ns, name, pwd, cb) {
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

  nq.on('login', null, (q, req, res) => {
    login(q.name, q.params.name, q.params.pwd, r => {
      if (!r) return reject(res);
      res.json(q.response(r));
    });
  });

  nq.on('refresh', '', (q, req, res) => {
    let user = decodeToken((authToken(req)));
    if (!user) return reject(res);
    login(user.ns, user.name, user.pwd, r => {
      res.json(q.response(r));
    });
  });
}

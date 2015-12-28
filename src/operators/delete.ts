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
        let doc: any = {
          db: col,
          data: r
        };
        if (req.user._id) {
          doc._owner = req.user._id
        }
        n.db.db(d).collection('db.trash').insertOne(doc, { w: 0 }, null);
      });
      c.deleteMany(query, n.resp.bind(n, req, res, q));
    });
  });

  n.nq.on('restore', null, (q, req, res) => {
    // check delete authorization
    q.name = q.name + '.db.trash';
    let auth = n.isAuth(q, req, 'd');
    if (auth === 0) return n.reject(res);
    if (auth === 2 && !req.user._id) return n.reject(res);

    // change params to array
    if (!_.isArray(q.params)) q.params = [ q.params ];

    // check are params string
    if (!_.every(q.params, _.isString)) return n.error(res, 'NepDBError', 400);

    // convert id string to ObjectID
    let params = _.map(q.params, n.objectId);

    let query: any = { $or: [ { _id: { $in: params } }, { 'data._id': { $in: params } } ] };
    if (auth === 2) {
      query._owner = req.user._id;
    }

    let [ d, ] = n.ns(q);
    let resp = {
      ok: 1
    };

    n.db.db(d).collection('db.trash').find(query).each((err, r) => {
      if (err) resp.ok = 0;
      if (r) {
        n.db.db(d).collection(r.db).insertOne(r.data, { w: 0 }, null);
        n.db.db(d).collection('db.trash').deleteOne({ _id: r._id }, { w: 0 }, null);
      }
    });
    n.resp(req, res, q, null, resp);
  });
}

export = op;

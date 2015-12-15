# nepdb

## Readme was out of date

## Getting started

// TODO
```
$ git clone https://github.com/acoshift/nepdb.git
$ cd nepdb
$ npm install
$ gulp
$ mongod --dbpath=./db &
$ node build/index.js
```

## API Docs

### Create
`$create db.name(__documents__)`

### Create single document
`create db.name(__document__)`

### Read
`$read db.name(__filter__)`

### Read single document
`read db.name(__filter__)`

### Update
`$update db.name(__filter__, __document__)`

### Update single documents
`update db.name(__filter__, __document__)`

### Delete
`$delete db.name(__filter__)`

### Delete single document
`delete db.name(__filter__)`

---

## Example

Create one document:
```
create stock.product(name: "p1", price: 100)
```

Create multiple documents
```
$create stock.product(
  { name: "p1", price: 100 },
  { name: "p2", price: 150 },
  { name: "p3", price: 100 }
)
```
or
```
$create stock.product([
  { name: "p1", price: 100 },
  { name: "p2", price: 150 },
  { name: "p3", price: 100 }
])
```

Read documents
```
$read stock.product(name: "p1")
```

Read documents with paging

```
$read stock.product({price: 100}, {limit: 10, skip: 20})
```

Read single document
```
read stock.product(name: "p1")
```

Update single document
```
update stock.product(
  { name: "p1" },
  { $set: { name: "p6" } }
)
```

Update all documents matched filter
```
$update stock.product(
  { price: 100 },
  { $inc: { price: 30 } }
) {}
```

## Token
```
{
  name,
  pwd,
  ns,
  role,
  iat,
  exp
}
```

## Reserved Collections

### .db.users
```
{
  _id,
  name,
  pwd,
  role,
  enabled
}
```
### .db.roles
```
{
  _id,
  name,
  dbs {
    __db_name__ { c, r, u, d }
  }
}
```

### .db.logs
```
{
  _id,
  user,
  q
}
```

### .db.cors
```
{
  _id,
  domain,
  ns
}
```

# nepdb

~~MongoDB API in Node.js~~

MongoDB with nep nep~!

## Getting started

1. Clone our nep `$ git clone https://github.com/acoshift/nepdb.git`
2. Change directory `$ cd nepdb`
3. Install node modules `$ npm i`
4. Install TypeScript Compiler `$ npm i -g typescript`
5. Compile `$ tsc`
6. Start MongoDB server `$ mongod --dbpath=./db`
7. Release nep power~! `$ node app.js`

## API Docs

### Create
`create db.name(d: __document__) {}`

### Read
`read db.name(__filter__) {}`

### Update
`update db.name(q: {__filter__}, d: {__document__}) {}`

### Delete
`delete db.name(__filter__) {}`

---

## Example

Create one document:
```
create stock.product(d: {
  name: "p1",
  price: 100
}) {}
```

Create multiple documents
```
create stock.product(d: [
  { name: "p1", price: 100 },
  { name: "p2", price: 150 },
  { name: "p3", price: 100 }
]) {}
```

Read documents
```
read stock.product(name: "p1") { price }
```

Read documents with paging

```
read stock.product(price: 100, $limit: 10, $skip: 20) { name }
```

Update a document
```
update stock.product(
  q: { "name": "p1" },
  d: { "$set": { "name": "p6" } },
  $limit: 1
) {}
```

Update all documents matched filter
```
update stock.product(
  q: { "price": 100 },
  d: { "$inc": { "price": 30 } }
) {}
```

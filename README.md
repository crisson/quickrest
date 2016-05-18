# Quickrest

**THIS PROJECT IS A WIP.**

**The following represents the proposed API.  It has not been fully implemented.**

A simple library for quickly building REST API clients.

## Installation

    npm install quickrest --save
    bower install quickrest --save

### Node/CommonJS
```javascript
var quickrest = require('quickrest')
```

### ES6 Module
```javascript
import quickrest from 'quickrest'
```

## Features
* Offers both a callback and promise-based API.
* Bring your own `Promise` and request libraries.
* Makes reasonable assumptions about the structure of your REST API.
* Supports complex API versions.
* Offers a fluent API for requesting nested resources.

## Simple Example

```javascript

import bluebird from 'bluebird'
import qwest from 'quest'

import quickrest from 'quickrest'

const DEFAULT_USER_ID = 9000

const api = quickrest({
  root: 'https://api.example.com',
  promise: bluebird,
  request: (url, method, params, headers, cb) => {
    // since qwest returns a promise, there's no need to invoke the cb
    return qwest[method].bind(qwest, method)(url, params, headers)
  },
  async beforeEach(params, headers, cb){
    const token = await tokenStore.getTokenForUser(DEFAULT_USER_ID)
    const ah = {Authorization: `Bearer ${token}`}
    return {headers: ah}
  },
  endpoints: [
    'users',
    'users/posts',
    'users/posts/comments',
    'posts',
    'posts/comments',
    'comments',
    {
      resource: 'comments',
      version: 'v2',
      createMethod: 'put', // put will be used for creation and update
    }
  ],
})

// callback interface
// GET /users/9000
api.users.get(9000, (err, ({model, })) => console.log(err, model))

// promise interface
// GET /users/9000
api.users.get(9000)
  .then(({model, }) => console.info(model))
  .catch(console.error.bind(console))

// get nested resource
// GET /users/9000/posts/3
api.users.posts.get(9000, 3)

// get nested resource, and pass response to callback
// GET /users/9000/posts
api.users.posts.get(9000, 3, {page: 42, rpp: 200, query: 'bah'}, console.log.bind(console))

// create nested resource
// POST /users/9000/posts
api.users.posts.create(9000, {title: '...', content: 'something'})

// create doubly-nested resource
// POST /users/9000/posts/3/comments
api.users.posts.comments.create(9000, 3, {title: '...', content: 'something'})

// create doubly-nested resource, fluent syntax
// POST /users/9000/posts/3/comments
api.users(9000)
  .posts(3)
  .comments
  .create({title: '...', content: 'something'})

// delete nested resource
// DELETE /users/9000/posts/3
api.users.posts.del(9000, 3)

// same as api.users.create(...), since v2 of this route was not defined above
// GET /v1/users
api.v2.users.get(9000)
  .then(({model, }) => console.info(model))
  .catch(console.error.bind(console))

// the backward-incompatible and deprecated comments API
// /comments
api.comments.create({post_id: 3, data: 'something'})

// this endpoint is distinct from api.comments
// /v2/comments
api.v2.comments.create({post_id: 3, content: 'something'})

```

## Documented Example

```javascript
import bluebird from 'bluebird'
import qwest from 'qwest'
import quickrest from 'quickrest'

const api = quickrest({
  /**
   * The base url for your REST API.
   * @required
   * @type {String}
   */
  root: 'https://api.example.com',

  /**
   * A prefix for all rest endpoints.
   *
   * This is optional.
   *
   * @see implemented examples below.
   * @example
   * // for only one version
   *   {
   *     versions: 'v2',
   *   }
   * @example
   * // to declare multiple versions
   *   {
   *     versions: ['v2']
   *   }
   * @type {Array|string}
   */
  versions: ['v2'], // a version prefix for all endpoints.

  /**
   * A Promise/A+ compliant Promise implementation.
   * @example RSVP.Promise, q, bluebird, etc.
   *
   * Uses [es6-promise](https://github.com/stefanpenner/es6-promise) by default.
   *
   * @type {Promise}
   */
  promise: bluebird,

  /**
   * Makes HTTP requests
   * @param  {string}   url     the url to which the request will be made
   * @param  {string}   method  the http method lowercased (i.e., get, put, etc)
   * @param  {Object}   params  parameters to be sent with the request
   * @param  {Object}   headers headers to be sent with the request
   * @param  {Function} cb      callback invoked with the result of the http request
   * @return {Promise|null}           either a promise if the http request lib returns a promise, or null.  Alternatively, the callback `cb` may be invoked in the typical node style (i.e., cb(err, resp)).
   */
  request: (url, method, params, headers, cb) => {
    // since qwest returns a promise, there's no need to invoke the cb
    return qwest[method].bind(qwest, method)(url, params, headers)
  },

  /**
   * An object with the methods {log, info, warn, error}.  Defaults to logging to
   * the console if logging is enabled.
   * @type {Object}
   */
  logger: console,

  /**
   * Whether logging is enabled
   * @type {Boolean}
   */
  enableLogging: false,

  /**
   * Describes the shape of the response for `list()` endpoints.
   *
   * Keys are parameters required by this lib, and their values represent the path through nested object keys to retrieve them.
   *
   * The path should be compatible with lodash's [_.at](https://*lodash.com/docs#at)
   *
   * The shape expected by default looks like:
   * @example
   * {
   *   "page": 1,
   *   "rpp": 20,
   *   "items": [
   *     ...
   *   ],
   *   "query": ""
   * }
   *
   * This property need not be specified if your list endpoints return the default shape.
   *
   * @type {Object}
   */
  collection: {
    page: 'page',
    resultsPerPage: 'rpp',
    models: 'items',
    query: 'term',
  },

  /**
   * Headers sent with every request.
   *
   * This is optional.
   *
   * The headers displayed below are set by default.
   *
   * @type {Object}
   */
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },

  /**
   * A function run before each network request
   * @param  {Object}   params  request parameters
   * @param  {Object}   headers headers set by the user invoking an api function.
   * @param  {Function} cb      callback function optionally invoked
   * @return {Promise.<Object>|Object}           An object containing headers
   */
  beforeEach(params, headers, cb){
    // e.g., add as csrf token, authorization header, etc
    const np = {csrf: 'randomToken'}

    const nh = {Authorization: `Bearer ${token}`}

    // or return {headers: nh, params: np} which becomes Promise.resolve(...)
    // or return cb(null, {headers: nh, params: np})
    // or return Promise.resolve({headers: nh, params: np})
  },
  endpoints: [
    'user', // automatically expanded to 'users'.  use an object for a more detailed description.
    'users/posts',
    'users/posts/comments',
    'posts',
    'posts/comments',
    'comments',
    'posts',
    'comments',
    {
      resource: 'comments',
      version: 'v3',
      createMethod: 'put', // put will be used for creation and update
    }
  ]
})
```

#### Usage example
```javascript
// POST /users
api.users.create({email: 'jane.smith@example.com'}, (err, resp) => {
  if (err) {
    console.error(err)
    return;
  }

  const { model, } = resp;
})

// OR

// POST /users
api.users.create({email: 'jane.smith@example.com'})
  .then(({model, }) => console.info(model))
  .catch(console.error.bind(console))

// /v2/users/9000
api.v2.users.get(9000)

api.v2.comments.create({post_id: 4000, data: 'something'})

// /v3/comments/4000
// this endpoint is distinct from api.v2.comments
api.v3.comments.create({post_id: 4000, content: 'something'})
```

## Configuration

**root** (required) - the base url for your REST API.

**collection** -
```json
 {
  "page": 1,
  "rpp": 20,
  "items": [
    ...
  ],
  "query": ""
 }
```

**beforeEach** -

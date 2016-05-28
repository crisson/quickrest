# quickrest

A simple library for quickly building browser-based REST API clients.

***This project is a WIP***

## Status
[![Build Status](https://travis-ci.org/crisson/quickrest.svg?branch=master)](https://travis-ci.org/crisson/quickrest)


## Features
* Offers both a callback and promise-based API.
* Bring your own `Promise` and request libraries.
* Makes reasonable assumptions about the structure of your REST API.
* Supports complex API versions.
* Offers a fluent API for requesting nested resources.

## Simple Example

```javascript
import quickrest from 'quickrest'

const api = quickrest({
  root: 'https://api.example.com',
  versions: 'v2',
  endpoints: [
    'users',
    'users/posts',
    'users/posts/comments',
    'posts',
    'posts/comments',
    'comments',
    {
      resource: 'comments',
      createMethod: 'put', // put will be used for creation and update
    }
  ],
})

// callback interface
// GET /users/9000
api.users(9000).get((err, resp) => console.log(err, resp.model))

// promise interface
// GET /users/9000
api.users(9000).get()
  .then(({model, }) => console.info(model))
  .catch(console.error.bind(console))

// get nested resource
// GET /users/9000/posts/3
api.users(9000).posts(3).get()

// get nested resource, and pass response to callback
// GET /users/9000/posts
api.users(9000).posts.list({page: 42, rpp: 200, query: 'bah'}, console.log.bind(console))

// create nested resource
// POST /users/9000/posts
api.users(9000).posts.create({title: '...', content: 'something'})

// create doubly-nested resource
// POST /users/9000/posts/3/comments
api.users(9000).posts(3).comments.create({title: '...', content: 'something'})

// delete nested resource
// DELETE /users/9000/posts/3
api.users(9000).posts(3).del()

// api versioning via url
// GET /v2/users
api.v2().users(9000).get()
  .then(({model, }) => console.info(model))
  .catch(console.error.bind(console))

// the backward-incompatible and deprecated comments API
// PUT /comments
api.comments.create({post_id: 3, data: 'something'})

// /v2/comments
api.v2().comments.create({post_id: 3, content: 'something'})

```


## Motivation

Constructing API urls via string concatenation (or even template strings) can be annoying and error prone. Using JavaScript's language featues to model a REST API's resources makes for a more pleasant programming experience.

## Caveats

The library is currently meant for environments  where high-level REST parameters are set once for the lifetime of the app/process, (e.g., bearer tokens for an app) like in a browser. It lacks a simple mechanism to scope request-specific REST data (e.g., per-request data within an express.js app).

This capability is not a priority at the moment, but a PR with it is welcome =). It might look something like this:

```javascript
import quickrest from 'quickrest'
const api = quickrest(...);

// and then for each request (e.g., in an express middleware function)
function(req, res, next){
  req.api = api.specialize({
    beforeEach(params, query, headers, cb){...},
    headers: {...},
  })

  next()
}
```

## Installation

    npm install quickrest --save
    bower install quickrest --save

#### peerDependencies
* [superagent](https://github.com/visionmedia/superagent)
* [es6-promise](https://github.com/stefanpenner/es6-promise)


If you're indifferent to the http and Promise libraries used, this lib will attempt to use
`superagent` and `es6-promise`, respectively.  These libraries are considered peer dependencies, so it's your responsibility to install them alongside this lib.

```
npm install --save es6-promise superagent
```

### Node/CommonJS
```javascript
const quickrest = require('quickrest')
```

### ES6 Module
```javascript
import quickrest from 'quickrest'
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
   * Makes HTTP requests.  If this function is not specified, the library will use `superagent`.  superagent is a peerDependency, and it is your responsibility to install it.
   *
   * @param  {string}   url     the url to which the request will be made
   * @param  {string}   method  the http method lowercased (i.e., get, put, etc)
   * @param  {Object}   params  parameters to be sent with the request
   * @param  {Object}   [ query ]   query string parameters
   * @param  {Object}   headers headers to be sent with the request
   * @param  {Function} cb      callback invoked with the result of the http request
   * @return {Promise|null}           either a promise if the http request lib returns a promise, or null.  Alternatively, the callback `cb` may be invoked in the typical node style (i.e., cb(err, resp)).
   */
  request: (url, method, params, query, headers, cb) => {
    // since qwest returns a promise, there's no need to invoke the cb
    return qwest[method].bind(qwest, method)(url, params, headers)
  },

  /**
   * An object with the methods {log, info, warn, error}.  Defaults to a
   * noop logger if left undefined.
   * @type {Object}
   */
  logger: console,

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
   * An mapping of REST API method names to synonyms to prevent conflicts with REST API resource names.
   * @type {Object}
   */
  altMethodNames: {
    create: 'make',
    del: 'remove'
    get: 'fetch',
    list: 'all',
    update: 'overhaul',
  },

  /**
   * A function run before each network request. It receives any HTTP request body and query string parameters entered by the user, in additional to consolidated headers. It should return an object containing additional params, query string, or headers that should be added to the request.
   * @param  {Object}   params  request parameters
   * @param  {Object}   query   request query string parameters
   * @param  {Object}   headers headers set by the user invoking an api function.
   * @param  {Function} cb      callback function optionally invoked
   * @return {Promise.<Object>|Object}           An object containing headers
   */
  beforeEach(params, query, headers, cb){
    // e.g., add as csrf token, authorization header, etc
    const np = {csrf: 'randomToken'}

    const nh = {Authorization: `Bearer ${token}`}

    return Promise.resolve({headers: nh, params: np})
    // or return {headers: nh, params: np} which becomes Promise.resolve(...)
    // or return cb(null, {headers: nh, params: np})
  },

  /**
   * An array of the endpoints of your REST API.
   * @type {Array}
   */
  endpoints: [
    'users',
    'users/posts',
    'users/posts/comments',
    'posts',
    'posts/comments',
    'comments',
    'posts',
    'comments',
    {
      resource: 'comments',
      createMethod: 'put', // put will be used for creation and update
      headers: {
        'X-API-VERSION': 'example.v2',
        'Accept': 'application/vnd+example.comments+json'
      }
    }
  ]
})

```

## Development

Clone respository and install dependencies.

All development dependencies are managed via npm.

```
npm install
```

## License
MIT

import compact from 'lodash.compact'
import dropWhile from 'lodash.dropwhile'
import isObject from 'lodash.isobject'
import noopLogger from 'noop-logger'
import pick from 'lodash.pick'
import size from 'lodash.size'

const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json'
}

/**
 * A function that accepts everything, does nothing, and returns undefined.
 * @return {void}
 */
function noop() {}

function requestFactory(superagent, PromiseLib) {
  return function(url, method, props = {}, query = {}, headers, cb) {
    const req = superagent[method](url)
      .set(headers)
      .query(query)
      .send(props)

    if (!PromiseLib) {
      return req.end((err, res) => {
        const out = {
          status: res.status,
          model: res.body
        }
        return cb(err, out)
      })
    }

    return new PromiseLib((resolve, reject) => {
      req.end((err, res) => {
        const out = {
          status: res.status,
          model: res.body
        }
        if (cb) {
          cb(err, out)
        }

        if (err) return reject(err)
        resolve(out)
      })
    })
  }
}

/**
 * Returns a function that defines the response handler for a RESTful verb (i.e., get, create, etc.)
 * @param {Object} opts the config options provided by user amended to include a valid Promise lib and request function
 * @returns {Function}
 */
function verbFactory(opts, request) {
  return function(route, method, properties, query, headers, cb) {
    const processed = function(mod = {}, finish) {
      const head = Object.assign({}, headers, (mod.headers || {}))
      const props = Object.assign({}, properties, (mod.properties || {}))
      const qry = Object.assign({}, query, (mod.query || {}))

      return request(route, method, props, qry, head, finish)
    }

    // if opts.beforeEach is not defined, we execute the default request flow
    if (!opts.beforeEach) {
      if (!cb) {
        return new opts.promise(resolve => {
          return processed({})
        })
      }

      return processed({}, cb)
    }

    const spy = function(err, mod) {
      // we specifically do not return the output of the callback because its value (or its absence) might be considered significant elsewhere within this lib.
      if (err) {
        return cb(err)
      }

      processed(mod, cb)
    }

    let out = opts.beforeEach(properties, query, headers, spy)

    // if out is undefined, we assume that the callback will be used
    if (out === undefined) {
      return
    }

    return opts.promise.resolve(out)
      .then(processed)
  }
}

/**
 * Prototype REST API client endpoint
 * @param  {string} resource name of the resource
 * @param  {Object} opts     dependencies and configuration
 * @param  {Object} [conf.request]     function for making http requests
 * @return {Object}          an object containing methods for interacting with the API
 */
function proto(resource, opts) {
  const {
    altMethodNames = {}, request, headers,
  } = opts
  const {get,
    create,
    update,
    del,
    list,
  } = altMethodNames

  const factory = verbFactory(opts, request)

  const out = {
    [create || 'create']: function(props, cb = noop) {
      const method = resource.props && resource.props.createMethod ||
        'post'
      return factory(this._route(), method, props, {}, headers, cb)
    },
    [del || 'del']: function(cb = noop) {
      return factory(this._route(), 'delete', {}, {}, headers, cb)
    },
    [del || 'delete']: function(cb = noop) {
      return factory(this._route(), 'delete', {}, {}, headers, cb)
    },
    [get || 'get']: function(cb = noop) {
      return factory(this._route(), 'get', {}, {}, headers, cb)
    },
    [list || 'list']: function(query, cb = noop) {
      return factory(this._route(), 'get', {}, query, headers, cb)
    },
    [update || 'update']: function(props, cb = noop) {
      return factory(this._route(), 'put', props, {}, headers, cb)
    },
    getUrl() {
      return this._route()
    }
  }

  return out
}

/**
 * Cleans and normalizes resource strings
 * @param  {Array.<string>} raw
 * @param {Array.<string>} [commonVersions=[]]
 * @return {Array.<Array.<string>>}
 */
function buildResources(endpoints, commonVersions) {
  /**
   * An identity map of all the versions encountered to this point
   * @type {Object.<string, string>}
   */
  const versions = Object.create(null)

  /**
   * Resources that lack a configuration object
   * @type {Array}
   */
  const simpleResources = []

  const eps = endpoints.map(resource => {
    if (!isObject(resource)) {
      const clean = compact(resource.split('/'))
      simpleResources.push(clean)
      commonVersions.forEach(cv => {
        const copy = clean.slice()
        copy.unshift(cv)
        simpleResources.push(copy)
      })
      return clean
    }

    if (resource.versions) {
      [].concat(resource.versions)
        .reduce((iden, v, k) => {
          iden[k] = v
          return iden
        }, versions)
    }

    // configured endpoints are represented similarly to simple endpoints
    // (i.e. an array of resource/subresource paths), but they additionally
    // have an array property.
    const custom = resource.resource.split('/')
    Object.assign(custom, {
      config: resource
    })
    return custom
  })

  return [simpleResources, eps, versions]
}

/**
 * Removes trailing slashes from the root url
 * @param  {string} root
 * @return {string}
 */
function cleanroot(root) {
  if (!root.endsWith('/')) {
    return root.trim()
  }

  return dropWhile(root.trim()
      .split('')
      .reverse(), char => char === '/')
    .reverse()
    .join('')
}

/**
 * Returns a function that recursively builds the rest api object hierarchy.  
 *
 * The object built includes the REST resource names as functions.  Those functions have function-properties consisting of the REST methods (i.e. get, create, etc). The resourceful functions, when invoked return a new object hiearchy of their subresources (e.g, api.users(23).posts...).
 * @param  {Object} conf
 * @return {Function}
 */
function build(conf) {
  /**
   * Recursively builds a nested object of REST resource objects.
   * @param  {Array.<Array.<string>>} resources array of an array of resource/subresource paths. the arrays should be sorted such that the longest arrays are towards the beginning of the array container.
   * @param  {Object} accum     output object of REST resources
   * @return {Object} the accumulated object
   */
  return function loop(resources = {}, accum = function() {}) {
    const sz = size(resources)

    // there are no additional resources, so return the built function
    if (!sz) return accum

    const [name, ...rest] = Object.keys(resources)
    const v = resources[name]

    const fn = function(id) {
      // invoking this function creates a new object hierarchy, so we must
      // carry forward upstream route fragments
      if (this._out) return this._out

      const self = this

      // every invocation if this function returns a structurally similar
      // object, so cache it
      const out = this.out = Object.assign({
        _route() {
          // this must be a top-level route
          if (!accum._route) {
            return `${cleanroot(conf.root)}/${name}/${id}`
          }

          return `${self._route()}/${name}/${id}`
        }
      }, proto(name, conf))

      // attach subresources to the output object, and ensure their `this` is
      // the same object
      loop(v, out)

      return out
    }

    fn._route = function() {
      if (!accum._route) {
        return `${cleanroot(conf.root)}/${name}`
      }

      return `${accum._route()}/${name}`
    }

    Object.assign(fn, proto(name, conf))

    if (v !== 1) {
      // this must not be a leaf node
      loop(resources[name], fn)
    }

    accum[name] = fn

    if (rest.length) {
      const next = pick(resources, rest)
      return loop(next, accum)
    }

    return accum
  }
}

/**
 * Validates required initialization parameters provided by the user.
 * @param  {Object} config the configuration object argument provided at
 * initialization
 * @return {void}
 */
function validateConfig(config) {
  const {
    endpoints,
    root = ''
  } = config

  if (!root || !root.trim()) {
    throw new Error('api root is required')
  }

  if (!endpoints || !Array.isArray(endpoints) || !endpoints.length) {
    throw new Error('endpoints must be a non-empty array')
  }
}

/**
 * Choose between user provided dependencies and peer dependencies mentioned
 * in the README.
 * @param  {Object} config
 * @return {(Promise, request)}
 */
function chooseDependencies(config) {
  const {
    logger = noopLogger, promise, request
  } = config

  let agent = request
  let promiseLib = promise

  if (!promise) {
    try {
      promiseLib = require('es6-promise')
        .Promise
    } catch (er) {
      throw new Error(
        'expected Promise to be defined or es6-promise to be installed, but both are missing'
      )
    }
  }

  if (!request) {
    try {
      const superagent = require('superagent')
      agent = requestFactory(superagent, promiseLib)
    } catch (er) {
      throw new Error(
        'expected request function to be defined or superagent to be installed, but both are missing'
      )
    }
  }

  return [promiseLib, agent]
}

/**
 * Recursively creates or updates the object hierarchy in [map] according to the
 * string elements of [path]. former leaf nodes are updated to be internal nodes
 * if a path is followed that implies it contains a leaf node subresource.
 * @param {Object} map an object mapping resource names to either an object that
 * includes subsequent resource names, or '1' for leaf nodes.
 * @param {Array.<string>} paths an array of resource names.  subsequent array
 * elements represent subresources of the preceeding elements.
 */
function place(map, paths) {
  const [head, ...rest] = paths
  let node = map[head]

  if (rest.length) {
    if (!node || node === 1) {
      node = {}
      map[head] = node

      return place(node, rest)
    }

    return place(node, rest)
  }

  if (!node) {
    map[head] = 1
  }

  return map
}

/**
 * Converts a collection of resource paths in array format to an object hierarchy
 * explicitly encoding the hierarchy.
 *
 * @param {Array.<Array.<string>>} ls array of arrays
 * @return {Object} hierarchy of resources
 */
function normalize(ls = [
  []
]) {
  if (!ls.length) return {}

  const out = {}
  ls.forEach(xs => place(out, xs))

  return out
}


export default module.exports = (config) => {
  const { endpoints, versions = [] } = config
  const { logger = noopLogger } = config

  validateConfig(config)

  const [promiseLib, requestLib] = chooseDependencies(config)

  // we want to work with an array of strings, but versions may be either an array or a single stirng 
  const commonVersions = compact([].concat(versions))

  let [simpleResources, resources, ] = buildResources(endpoints,
    commonVersions)

  // this removes empty arrays from `resources`.  empty arrays may arise from
  // a user inputing an empty string endpoint.
  let all = resources.filter(ls => ls.length)
    .slice()

  // Array.prototype.push.apply(all, versioned)
  all = all.concat(simpleResources)

  // by placing the deep resource hierarchies first, we ensure that top-level
  // resources are created with the proper fluent behavior.
  all.sort((ls, xs) => -(ls.length - xs.length))

  const opts = Object.assign({}, config, {
    request: requestLib,
    promise: promiseLib,
    logger,
  }, {
    headers: Object.assign({}, DEFAULT_HEADERS, config.headers || {})
  })

  return build(opts)(normalize(all))
}

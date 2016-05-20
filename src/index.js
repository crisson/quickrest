import compact from 'lodash.compact'
import dropWhile from 'lodash.dropwhile'
import isObject from 'lodash.isobject'
import noopLogger from 'noop-logger'

const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json'
}

/**
 * A function that accepts everything, does nothing, and returns undefined.
 * @return {void}
 */
function noop () {}

function makeRequest (superagent, PromiseLib) {
  return function (url, method, props = {}, query = {}, headers, cb) {
    return new PromiseLib((resolve, reject) => {
      superagent[method](url)
        .set(headers)
        .query(query)
        .send(props)
        .end((err, res) => {
          const out = { status: res.status, model: res.body }
          cb(err, out)
          if (err) return reject(err)
          resolve(out)
        })
    })
  }
}

/**
 * Prototype REST API client endpoint
 * @param  {string} resource name of the resource
 * @param  {Object} opts     dependencies and configuration
 * @param  {Object} [conf.request]     function for making http requests
 * @return {Object}          an object containing methods for interacting with the API
 */
function proto (resource, opts) {
  const { altMethodNames = {}, request, headers, } = opts
  const { get, create, update, del, list, } = altMethodNames

  return {
    [create || 'create']: function (props, cb = noop) {
      const method = resource.props && resource.props.createMethod || 'post'
      return request(this._route(), method, props, {}, headers, cb)
    },
    [del || 'del']: function (cb = noop) {
      return request(this._route(), 'delete', {}, {}, headers, cb)
    },
    [del || 'delete']: function (cb = noop) {
      return request(this._route(), 'delete', {}, {}, headers, cb)
    },
    [get || 'get']: function (cb = noop) {
      return request(this._route(), 'get', {}, {}, headers, cb)
    },
    [list || 'list']: function (query, cb = noop) {
      return request(this._route(), 'get', query, query, headers, cb)
    },
    [update || 'update']: function (props, cb = noop) {
      return request(this._route(), 'put', props, {}, headers, cb)
    },
  }
}

/**
 * Cleans and normalizes resource strings
 * @param  {Array.<string>} raw
 * @return {Array.<Array.<string>>}
 */
function buildResources (endpoints) {
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
      return clean
    }

    if (resource.versions) {
      [].concat(resource.versions).reduce((iden, v, k) => {
        iden[k] = v
        return iden
      }, versions)
    }

    // configured endpoints are represented similarly to simple endpoints
    // (i.e. an array of resource/subresource paths), but they additionally
    // have an array property.
    const custom = resource.resource.split('/')
    Object.assign(custom, {config: resource})
    return custom
  })

  return [simpleResources, eps, versions]
}

/**
 * Removes trailing slashes from the root url
 * @param  {string} root
 * @return {string}
 */
function cleanroot (root) {
  if (!root.endsWith('/')) {
    return root.trim()
  }

  return dropWhile(root.trim().split('').reverse(), char => char === '/')
    .reverse()
    .join('')
}

/**
 * Returns a function that recursively builds the rest api object hierarchy
 * @param  {Object} conf
 * @return {Function}
 */
function build (conf) {
  /**
   * Recursively builds a nested object of REST resource objects.
   * @param  {Array.<Array.<string>} resources array of an array of resource/subresource paths. the
   * arrays should be sorted such that the longest arrays are towards the beginning of
   * the array container container.
   * @param  {Object} accum     output map of REST resources
   * @return {Object} the accumulated object
   */
  return function loop (resources, accum = function () {}) {
    // there are no additional resources, so return the built map
    if (!resources.length) return accum

    const [ xs, ...rest ] = resources

    // this is an empty resource, so return the built map
    if (!xs.length) return accum

    const [ topResource, ...subresources ] = xs
    let resourceNamespace = accum[topResource]

    if (!resourceNamespace) {
      resourceNamespace = function (id) {
        // invoking this function creates a new object hierarchy, so we must
        // carry forward upstream route fragments
        const out = Object.assign({
          _route () {
            if (!accum._route) {
              return `${cleanroot(conf.root)}/${topResource}/${id}`
            }

            return `${accum._route()}/${topResource}/${id}`
          }
        }, proto(topResource, conf))

        if (xs.length > 1) {
          return loop([subresources], out)
        }

        return out
      }

      resourceNamespace._route = function () {
        if (!accum._route) {
          return `${cleanroot(conf.root)}/${topResource}`
        }

        return `${accum._route()}/${topResource}`
      }

      Object.assign(resourceNamespace, proto(topResource, conf))
      accum[topResource] = resourceNamespace
    }

    return loop(rest, accum)
  }
}

function validateConfig (config) {
  const {endpoints, root = ''} = config

  if (!root || !root.trim()) {
    throw new Error('api root is required')
  }

  if (!endpoints || !Array.isArray(endpoints) || !endpoints.length) {
    throw new Error('endpoints must be a non-empty array')
  }
}

function chooseDependencies (config) {
  const {logger = noopLogger, promise, request} = config

  let agent = request
  let promiseLib = promise

  if (!promise) {
    try {
      promiseLib = require('es6-promise').Promise
    } catch (er) {
      logger.warn('using default')
    }
  }

  if (!request) {
    try {
      const superagent = require('superagent')
      agent = makeRequest(superagent, promiseLib)
    } catch (er) {
      logger.warn()
    }
  }

  return [promiseLib, agent]
}

export default module.exports = (config) => {
  const {endpoints} = config
  const {logger = noopLogger} = config

  validateConfig(config)

  const [promiseLib, requestLib] = chooseDependencies(config)

  let [simpleResources, resources, versions] = buildResources(endpoints)

  // this removes empty arrays from `resources`.  empty arrays may arise from
  // a user inputing an empty string endpoint.
  resources = resources.filter(ls => ls.length)

  // spread the version numbers among all simple endpoints
  const versioned = Object.keys(versions)
    .map(vr => simpleResources.map(r => `${vr}/${r}`))

  let all = resources.slice()
  Array.prototype.push.apply(all, versioned)

  // by placing the deep resource hiearchies first, we ensure that top-level
  // resources are created with the proper fluent behavior.
  all.sort((ls, xs) => -(ls.length - xs.length))

  const opts = Object.assign({}, config, {
    request: requestLib,
    promise: promiseLib, logger
  }, {
    headers: Object.assign({}, DEFAULT_HEADERS, config.headers || {})
  })

  return build(opts)(all)
}

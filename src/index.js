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
      return request(this._route(), 'get', {}, query, headers, cb)
    },
    [update || 'update']: function (props, cb = noop) {
      return request(this._route(), 'put', props, {}, headers, cb)
    },
  }
}

/**
 * Cleans and normalizes resource strings
 * @param  {Array.<string>} raw
 * @param {Array.<string>} [commonVersions=[]]
 * @return {Array.<Array.<string>>}
 */
function buildResources (endpoints, commonVersions) {
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
 * Returns a function that recursively builds the rest api object hierarchy.  
 *
 * The object built includes the REST resource names as function.  Those functions have function-properties consisting of the REST methods (i.e. get, create, etc). The resourceful functions, when invoked return a new object hiearchy of their subresources (e.g, api.users(23).posts...).
 * @param  {Object} conf
 * @return {Function}
 */
function build (conf) {
  /**
   * Recursively builds a nested object of REST resource objects.
   * @param  {Array.<Array.<string>>} resources array of an array of resource/subresource paths. the arrays should be sorted such that the longest arrays are towards the beginning of the array container.
   * @param  {Object} accum     output object of REST resources
   * @return {Object} the accumulated object
   */
  return function loop (resources, accum = function () {}) {
    // there are no additional resources, so return the built function
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

/**
 * Validates required initialization parameters provided by the user.
 * @param  {Object} config the configuration object argument provided at
 * initialization
 * @return {void}
 */
function validateConfig (config) {
  const {endpoints, root = ''} = config

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
function chooseDependencies (config) {
  const {logger = noopLogger, promise, request} = config

  let agent = request
  let promiseLib = promise

  if (!promise) {
    try {
      promiseLib = require('es6-promise').Promise
    } catch (er) {
        throw new Error('expected Promise to be defined or es6-promise to be installed, but both are missing')
    }
  }

  if (!request) {
    try {
      const superagent = require('superagent')
      agent = makeRequest(superagent, promiseLib)
    } catch (er) {
        throw new Error('expected request function to be defined or superagent to be installed, but both are missing')
    }
  }

  return [promiseLib, agent]
}

export default module.exports = (config) => {
  const {endpoints, versions = []} = config
  const {logger = noopLogger} = config

  validateConfig(config)

  const [promiseLib, requestLib] = chooseDependencies(config)

  // we want to work with an array of strings, but versions may be either an array or a single stirng 
  const commonVersions = compact([].concat(versions))

  let [ simpleResources, resources, ] = buildResources(endpoints, commonVersions)

  // this removes empty arrays from `resources`.  empty arrays may arise from
  // a user inputing an empty string endpoint.
  let all = resources.filter(ls => ls.length).slice()

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

  return build(opts)(all)
}

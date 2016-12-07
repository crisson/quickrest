import quickrest from '../src'

const PromiseLib = Promise

describe('quickrest', function() {
  const root = 'https://api.example.com'
  const endpoints = [
    'users',
    'users/posts',
    'users/posts/comments',
    'posts',
    'posts/comments',
    'comments',
    'auth/slack/authorize',
    'auth/github/authorize',
  ]

  let request

  beforeEach(() => {
    request = sinon.stub()
    request.returns(Promise.resolve({ model: {}, status: 200 }))
  })

  it('is a function', () => {
    expect(quickrest)
      .to.be.a('function')
  })

  it('throws an error if `endpoints` is undefined or an empty array', () => {
    const fn = function() { quickrest({ root }) }
    expect(fn)
      .to.throw(/endpoints .* non-empty/)
  })

  it('throws an error if `root` is falsy', () => {
    const fn = function() { quickrest({ endpoints }) }
    const gn = function() { quickrest({ endpoints, root: '' }) }
    const hn = function() { quickrest({ endpoints, root: '  ' }) }
    expect(fn)
      .to.throw(/required/)
    expect(gn)
      .to.throw(/required/)
    expect(hn)
      .to.throw(/required/)
  })

  let spy
  let api

  beforeEach(() => {
    spy = sinon.spy()
    api = quickrest({ root, endpoints, request: spy })
  })

  it('should return a function', () => {
    expect(api)
      .to.be.a('function')
  })

  it('that does not have any REST methods attached', () => {
    expect(api)
      .to.not.have.property('create')
    expect(api)
      .to.not.have.property('get')
    expect(api)
      .to.not.have.property('del')
    expect(api)
      .to.not.have.property('delete')
    expect(api)
      .to.not.have.property('update')
  })

  it('should have top level resources', () => {
    expect(api)
      .to.have.property('users')
    expect(api)
      .to.have.property('posts')
    expect(api)
      .to.have.property('comments')
  })

  it('and inaccessible subresources', () => {
    expect(api)
      .to.not.have.property('users.posts')
    expect(api)
      .to.not.have.property('posts.comments')
  })

  let spy1
  beforeEach(() => {
    spy1 = sinon.spy()
  })

  describe('top-level resources', () => {
    it('urls are prefixed only by root', () => {
      const args = {}
      api.users.create({}, spy1)
      expect(spy)
        .to.have.been.calledWith(`${root}/users`, 'post', args)
    })

    it('have a "get" method that includes resource id', () => {
      api.users(9000)
        .get(spy1)
      expect(spy)
        .to.have.been.calledWith(`${root}/users/9000`, 'get')
    })

    it('as does "del"', () => {
      api.users(9000)
        .del(spy1)
      expect(spy)
        .to.have.been.calledWith(`${root}/users/9000`, 'delete')
    })

    it('and "update"', () => {
      const args = {}
      api.users(9000)
        .update(args, spy1)
      expect(spy)
        .to.have.been.calledWith(`${root}/users/9000`, 'put', args)
    })
  })

  describe('subresources', () => {
    it('include their parent resource\'s fragment in their path', () => {
      const spy2 = sinon.spy()
      const args = {}
      api.users(9000)
        .posts.create(args, spy1)
      expect(spy)
        .to.have.been.calledWith(`${root}/users/9000/posts`, 'post',
          args)

      api.users(9000)
        .posts(3)
        .comments.create(args, spy2)
      expect(spy)
        .to.have.been.calledWith(
          `${root}/users/9000/posts/3/comments`, 'post', args)
    })
  })

  describe('config.request', () => {
    beforeEach(() => {
      request.returns(Promise.resolve({
        model: { id: 9000, email: 'jane.smith@example.com' },
        status: 200
      }))
      api = quickrest({ root, endpoints, request, })
    })

    it('may return a promise with response data', () => {
      const body = {
        id: 9000,
        email: 'jane.smith@example.com',
      }

      const promise = api.users(9000)
        .get()

      return PromiseLib.all([
        expect(promise)
        .to.eventually.have.property('model')
        .that.eql(body),
        expect(promise)
        .to.eventually.have.property('status', 200),
      ])
    })

    it('for post', () => {
      const body = {
        title: 'blog post',
        content: 'this is great',
      }

      request.returns(Promise.resolve({
        model: body,
        status: 200
      }))

      api = quickrest({ root, endpoints, request, })

      const promise = api.users(9000)
        .posts.create(body)

      return PromiseLib.all([
        expect(request)
        .to.have.been.calledWith(
          'https://api.example.com/users/9000/posts'),
        expect(promise)
        .to.eventually.have.property('model')
        .that.eql(body),
        expect(promise)
        .to.eventually.have.property('status', 200),
      ])
    })

    it('for patch', () => {
      const body = {
        title: 'blog post',
      }

      request.returns(Promise.resolve({
        model: body,
        status: 200
      }))

      api = quickrest({ root, endpoints, request, })

      const promise = api.users(9000)
        .posts.patch(body)

      return PromiseLib.all([
        expect(request)
        .to.have.been.calledWith(
          'https://api.example.com/users/9000/posts', 'patch'),
        expect(promise)
        .to.eventually.have.property('model')
        .that.eql(body),
        expect(promise)
        .to.eventually.have.property('status', 200),
      ])
    })
    it('for put', () => {
      const body = {
        title: 'blog post',
        content: 'this is great',
      }

      const resp = Object.assign({ id: 4 }, body)

      request.returns(Promise.resolve({
        model: resp,
        status: 200
      }))

      api = quickrest({ root, endpoints, request, })

      const promise = api.users(9000)
        .posts.update(body)

      return PromiseLib.all([
        expect(promise)
        .to.eventually.have.property('model')
        .that.eql(resp),
        expect(promise)
        .to.eventually.have.property('status', 200),
      ])
    })

    it('get all', () => {
      const query = {
        page: 2,
        rpp: 50,
      }

      const resp = {
        rpp: query.rpp,
        page: 2,
        items: []
      }

      request.returns(Promise.resolve({
        model: resp,
        status: 200
      }))

      api = quickrest({ root, endpoints, request, })

      const promise = api.users(9000)
        .posts.list(query)

      return PromiseLib.all([
        expect(promise)
        .to.eventually.have.property('model')
        .that.eql(resp),
        expect(promise)
        .to.eventually.have.property('status', 200),
      ])
    })

    it('and delete', () => {
      request.returns(Promise.resolve({
        status: 204
      }))

      api = quickrest({ root, endpoints, request, })

      const promise = api.users(9000)
        .del()

      return PromiseLib.all([
        expect(promise)
        .to.eventually.have.property('status', 204),
      ])
    })

    it('may return a rejected promise if the request fails', () => {
      request.returns(Promise.reject())

      api = quickrest({ root, endpoints, request, })

      const promise = api.users(9001)
        .del()

      return PromiseLib.all([
        expect(promise)
        .to.be.rejected
      ])
    })

    it('invokes a callback with response data', (done) => {
      const body = {
        id: 9000,
        email: 'jane.smith@example.com',
      }

      request = (url, method, params, query, headers, cb) => cb(
        null, { model: body, status: 200, })

      api = quickrest({ root, endpoints, request, })

      api.users(9000)
        .get((err, res) => {
          if (err) return done(err)
          expect(res.model)
            .to.eql(body)
          done()
        })
    })

    it('invokes a callback with error data if the request fails', done => {
      request = (url, method, params, query, headers, cb) => cb(
        new Error(), { model: {}, status: 404, })

      api = quickrest({ root, endpoints, request, })

      api.users(9000)
        .get((err, res) => {
          expect(err)
            .to.exist.be.an.instanceOf(Error)
          expect(res.status)
            .to.equal(404)
          done()
        })
    })
  })

  describe('config.versions', () => {
    it('allows you to gracefully evolve an API', () => {
      api = quickrest({ endpoints, root, versions: 'v1', request, })
      expect(api.v1)
        .to.exist
      expect(api.v1()
          .users)
        .to.exist
    })
  })

  describe('config.altMethodNames', () => {
    it('defines new method names to prevent name clashes', () => {
      api = quickrest({
        endpoints,
        root,
        request,
        altMethodNames: {
          get: 'fetch',
        }
      })

      expect(api.users.fetch)
        .to.exist.to.be.a('function')
      expect(api.users.create)
        .to.exist.to.be.a('function')
    })
  })

  describe('config.endpoints', () => {
    it('accepts a string or object containing a "resource" property', () => {
      api = quickrest({
        root,
        request,
        endpoints: [
          'users',
          {
            resource: 'plays',
          }
        ]
      })

      expect(api.users)
        .to.exist
      expect(api.plays)
        .to.exist
    })

    it('accepts an alt http verb for creating that resource', () => {

    })
  })

  describe('config.beforeEach', () => {
    it('is called', () => {
      api = quickrest({ endpoints, root, beforeEach: spy, request, })
      api.users.list()
      expect(spy)
        .to.have.been.calledOnce
    })

    it(
      'accepts a callback that receives an object containing params, query, and headers',
      (done) => {
        api = quickrest({
          endpoints,
          root,
          beforeEach(params, query, headers) {
            return { headers: { 'X-Request-Check': 2 } }
          },
          request(route, method, parmas, query, headers, cb) {
            expect(headers)
              .to.have.been.property('X-Request-Check', 2)
            done()
          }
        })

        api.users.create({ foo: 'bar' }, (err, res) => {
          expect(err)
            .to.not.exist
        })
      })

    it('may return an object that will be wrapped in a promise', () => {
      const body = { foo: '' }

      request = request.returns(Promise.resolve({
        model: body,
        status: 200
      }))

      api = quickrest({
        endpoints,
        root,
        beforeEach(params, query, headers) {
          return { headers: { 'X-Request-Check': 2 } }
        },
        request,
      })

      return expect(api.users(9019)
          .get())
        .to.eventually.have.property('model')
        .to.eql(body)
    })
  })
})

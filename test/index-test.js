import quickrest from '../src'

describe('quickrest', function () {
  const root = 'https://api.example.com'
  const endpoints = [
    'users',
    'users/posts',
    'users/posts/comments',
    'posts',
    'posts/comments',
    'comments',
  ]

  it('is a function', () => {
    expect(quickrest).to.be.a('function')
  })

  it('throws an error if `endpoints` is undefined or an empty array', () => {
    const fn = function () { quickrest({root}) }
    expect(fn).to.throw(/endpoints .* non-empty/)
  })

  it('throws an error if `root` is falsy', () => {
    const fn = function () { quickrest({endpoints}) }
    const gn = function () { quickrest({endpoints, root: ''}) }
    const hn = function () { quickrest({endpoints, root: '  '}) }
    expect(fn).to.throw(/required/)
    expect(gn).to.throw(/required/)
    expect(hn).to.throw(/required/)
  })

  let spy
  let api

  beforeEach(() => {
    spy = sinon.spy()
    api = quickrest({root, endpoints, request: spy})
  })

  it('should return a function', () => {
    expect(api).to.be.a('function')
  })

  it('that does not have any REST methods attached', () => {
    expect(api).to.not.have.property('create')
    expect(api).to.not.have.property('get')
    expect(api).to.not.have.property('del')
    expect(api).to.not.have.property('delete')
    expect(api).to.not.have.property('update')
  })

  it('should have top level resources', () => {
    expect(api).to.have.property('users')
    expect(api).to.have.property('posts')
    expect(api).to.have.property('comments')
  })

  it('and inaccessible subresources', () => {
    expect(api).to.not.have.property('users.posts')
    expect(api).to.not.have.property('posts.comments')
  })

  let spy1
  beforeEach(() => {
    spy1 = sinon.spy()
  })

  describe('top-level resources', () => {
    it('urls are prefixed only be root', () => {
      const args = {}
      api.users.create({}, spy1)
      expect(spy).to.have.been.calledWith(`${root}/users`, 'post', args)
    })

    it('have a "get" method that includes resource id', () => {
      api.users(9000).get(spy1)
      expect(spy).to.have.been.calledWith(`${root}/users/9000`, 'get')
    })

    it('as does "del"', () => {
      api.users(9000).del(spy1)
      expect(spy).to.have.been.calledWith(`${root}/users/9000`, 'delete')
    })

    it('and "update"', () => {
      const args = {}
      api.users(9000).update(spy1)
      expect(spy).to.have.been.calledWith(`${root}/users/9000`, 'put', args)
    })
  })

  describe('subresources', () => {
    it('include their parent resource\'s fragment in their path', () => {
      const spy2 = sinon.spy()
      const args = {}
      api.users(9000).posts.create(args, spy1)
      expect(spy).to.have.been.calledWith(`${root}/users/9000/posts`, 'post', args)

      api.users(9000).posts(3).comments.create(args, spy2)
      expect(spy).to.have.been.calledWith(`${root}/users/9000/posts/3/comments`, 'post', args)
    })
  })
})

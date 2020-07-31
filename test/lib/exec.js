const t = require('tap')
const requireInject = require('require-inject')
const { resolve, delimiter } = require('path')

const ARB_CTOR = []
const ARB_ACTUAL_TREE = {}
const ARB_REIFY = []
class Arborist {
  constructor (options) {
    ARB_CTOR.push(options)
    this.path = options.path
  }
  async loadActual () {
    return ARB_ACTUAL_TREE[this.path]
  }
  async reify (options) {
    ARB_REIFY.push(options)
  }
}

let PROGRESS_ENABLED = true
const npm = {
  flatOptions: {
    call: '',
    package: []
  },
  localPrefix: 'local-prefix',
  config: {
    get: k => {
      if (k !== 'cache') {
        throw new Error('unexpected config get')
      }
      return 'cache-dir'
    }
  },
  log: {
    disableProgress: () => {
      PROGRESS_ENABLED = false
    },
    enableProgress: () => {
      PROGRESS_ENABLED = true
    }
  }
}

const RUN_SCRIPTS = []
const runScript = async opt => {
  RUN_SCRIPTS.push(opt)
  if (PROGRESS_ENABLED) {
    throw new Error('progress not disabled during run script!')
  }
}

const MANIFESTS = {}
const pacote = {
  manifest: async (spec, options) => {
    return MANIFESTS[spec]
  }
}

const MKDIRPS = []
const mkdirp = async path => MKDIRPS.push(path)

const exec = requireInject('../../lib/exec.js', {
  '@npmcli/arborist': Arborist,
  '@npmcli/run-script': runScript,
  '../../lib/npm.js': npm,
  pacote,
  'mkdirp-infer-owner': mkdirp
})

t.afterEach(cb => {
  MKDIRPS.length = 0
  ARB_CTOR.length = 0
  ARB_REIFY.length = 0
  RUN_SCRIPTS.length = 0
  npm.flatOptions.package = []
  npm.flatOptions.call = ''
  cb()
})

t.test('npm exec foo, already present locally', async t => {
  const path = t.testdir()
  npm.localPrefix = path
  ARB_ACTUAL_TREE[path] = {
    children: new Map([['foo', { name: 'foo', version: '1.2.3' }]])
  }
  MANIFESTS.foo = {
    name: 'foo',
    version: '1.2.3',
    bin: {
      foo: 'foo'
    },
    _from: 'foo@'
  }
  await exec(['foo'], er => {
    if (er) {
      throw er
    }
  })
  t.strictSame(MKDIRPS, [], 'no need to make any dirs')
  t.match(ARB_CTOR, [ { package: ['foo'], path } ])
  t.strictSame(ARB_REIFY, [], 'no need to reify anything')
  t.equal(PROGRESS_ENABLED, true, 'progress re-enabled')
  t.match(RUN_SCRIPTS, [{
    pkg: { scripts: { npx: 'foo' } },
    banner: false,
    path: process.cwd(),
    stdioString: true,
    event: 'npx',
    env: { PATH: process.env.PATH },
    stdio: 'inherit'
  }])
})

t.test('npm exec foo, not present locally or in central loc', async t => {
  const path = t.testdir()
  const installDir = resolve('cache-dir/_npx/f7fbba6e0636f890')
  npm.localPrefix = path
  ARB_ACTUAL_TREE[path] = {
    children: new Map()
  }
  ARB_ACTUAL_TREE[installDir] = {
    children: new Map()
  }
  MANIFESTS.foo = {
    name: 'foo',
    version: '1.2.3',
    bin: {
      foo: 'foo'
    },
    _from: 'foo@'
  }
  await exec(['foo'], er => {
    if (er) {
      throw er
    }
  })
  t.strictSame(MKDIRPS, [installDir], 'need to make install dir')
  t.match(ARB_CTOR, [ { package: ['foo'], path } ])
  t.strictSame(ARB_REIFY, [{add: ['foo@']}], 'need to install foo@')
  t.equal(PROGRESS_ENABLED, true, 'progress re-enabled')
  const PATH = `${resolve(installDir, 'node_modules', '.bin')}${delimiter}${process.env.PATH}`
  t.match(RUN_SCRIPTS, [{
    pkg: { scripts: { npx: 'foo' } },
    banner: false,
    path: process.cwd(),
    stdioString: true,
    event: 'npx',
    env: { PATH },
    stdio: 'inherit'
  }])
})

t.test('npm exec foo, not present locally but in central loc', async t => {
  const path = t.testdir()
  const installDir = resolve('cache-dir/_npx/f7fbba6e0636f890')
  npm.localPrefix = path
  ARB_ACTUAL_TREE[path] = {
    children: new Map()
  }
  ARB_ACTUAL_TREE[installDir] = {
    children: new Map([['foo', { name: 'foo', version: '1.2.3' }]])
  }
  MANIFESTS.foo = {
    name: 'foo',
    version: '1.2.3',
    bin: {
      foo: 'foo'
    },
    _from: 'foo@'
  }
  await exec(['foo'], er => {
    if (er) {
      throw er
    }
  })
  t.strictSame(MKDIRPS, [installDir], 'need to make install dir')
  t.match(ARB_CTOR, [ { package: ['foo'], path } ])
  t.strictSame(ARB_REIFY, [], 'no need to install again, already there')
  t.equal(PROGRESS_ENABLED, true, 'progress re-enabled')
  const PATH = `${resolve(installDir, 'node_modules', '.bin')}${delimiter}${process.env.PATH}`
  t.match(RUN_SCRIPTS, [{
    pkg: { scripts: { npx: 'foo' } },
    banner: false,
    path: process.cwd(),
    stdioString: true,
    event: 'npx',
    env: { PATH },
    stdio: 'inherit'
  }])
})

t.test('npm exec foo, present locally but wrong version', async t => {
  const path = t.testdir()
  const installDir = resolve('cache-dir/_npx/2badf4630f1cfaad')
  npm.localPrefix = path
  ARB_ACTUAL_TREE[path] = {
    children: new Map()
  }
  ARB_ACTUAL_TREE[installDir] = {
    children: new Map([['foo', { name: 'foo', version: '1.2.3' }]])
  }
  MANIFESTS['foo@2.x'] = {
    name: 'foo',
    version: '2.3.4',
    bin: {
      foo: 'foo'
    },
    _from: 'foo@2.x'
  }
  await exec(['foo@2.x'], er => {
    if (er) {
      throw er
    }
  })
  t.strictSame(MKDIRPS, [installDir], 'need to make install dir')
  t.match(ARB_CTOR, [ { package: ['foo'], path } ])
  t.strictSame(ARB_REIFY, [{ add: ['foo@2.x'] }], 'need to add foo@2.x')
  t.equal(PROGRESS_ENABLED, true, 'progress re-enabled')
  const PATH = `${resolve(installDir, 'node_modules', '.bin')}${delimiter}${process.env.PATH}`
  t.match(RUN_SCRIPTS, [{
    pkg: { scripts: { npx: 'foo' } },
    banner: false,
    path: process.cwd(),
    stdioString: true,
    event: 'npx',
    env: { PATH },
    stdio: 'inherit'
  }])
})

t.test('npm exec --package=foo bar', async t => {
  const path = t.testdir()
  npm.localPrefix = path
  ARB_ACTUAL_TREE[path] = {
    children: new Map([['foo', { name: 'foo', version: '1.2.3' }]])
  }
  MANIFESTS.foo = {
    name: 'foo',
    version: '1.2.3',
    bin: {
      foo: 'foo'
    },
    _from: 'foo@'
  }
  npm.flatOptions.package = ['foo']
  await exec(['bar'], er => {
    if (er) {
      throw er
    }
  })
  t.strictSame(MKDIRPS, [], 'no need to make any dirs')
  t.match(ARB_CTOR, [ { package: ['foo'], path } ])
  t.strictSame(ARB_REIFY, [], 'no need to reify anything')
  t.equal(PROGRESS_ENABLED, true, 'progress re-enabled')
  t.match(RUN_SCRIPTS, [{
    pkg: { scripts: { npx: 'bar' } },
    banner: false,
    path: process.cwd(),
    stdioString: true,
    event: 'npx',
    env: { PATH: process.env.PATH },
    stdio: 'inherit'
  }])
})

t.test('npm exec @foo/bar -- --some=arg, locally installed', async t => {
  const foobarManifest = {
    name: '@foo/bar',
    version: '1.2.3',
    bin: {
      foo: 'foo',
      bar: 'bar'
    }
  }
  const path = t.testdir({
    node_modules: {
      '@foo/bar': {
        'package.json': JSON.stringify(foobarManifest)
      }
    }
  })
  npm.localPrefix = path
  ARB_ACTUAL_TREE[path] = {
    children: new Map([['@foo/bar', { name: '@foo/bar', version: '1.2.3' }]])
  }
  MANIFESTS['@foo/bar'] = foobarManifest
  await exec(['@foo/bar', '--some=arg'], er => {
    if (er) {
      throw er
    }
  })
  t.strictSame(MKDIRPS, [], 'no need to make any dirs')
  t.match(ARB_CTOR, [ { package: ['@foo/bar'], path } ])
  t.strictSame(ARB_REIFY, [], 'no need to reify anything')
  t.equal(PROGRESS_ENABLED, true, 'progress re-enabled')
  t.match(RUN_SCRIPTS, [{
    pkg: { scripts: { npx: 'bar' } },
    banner: false,
    path: process.cwd(),
    stdioString: true,
    event: 'npx',
    env: { PATH: process.env.PATH },
    stdio: 'inherit'
  }])
})

t.test('run command with 2 packages, need install, verify sort', t => {
  // test both directions, should use same install dir both times
  const cases = [['foo', 'bar'], ['bar', 'foo']]
  t.plan(cases.length)
  for (const packages of cases) {
    t.test(packages.join(', '), async t => {
      npm.flatOptions.package = packages
      const add = packages.map(p => `${p}@`)
      const path = t.testdir()
      // XXX
      const installDir = resolve('cache-dir/_npx/07de77790e5f40f2')
      npm.localPrefix = path
      ARB_ACTUAL_TREE[path] = {
        children: new Map()
      }
      ARB_ACTUAL_TREE[installDir] = {
        children: new Map()
      }
      MANIFESTS.foo = {
        name: 'foo',
        version: '1.2.3',
        bin: {
          foo: 'foo'
        },
        _from: 'foo@'
      }
      MANIFESTS.bar = {
        name: 'bar',
        version: '1.2.3',
        bin: {
          bar: 'bar'
        },
        _from: 'bar@'
      }
      await exec(['foobar'], er => {
        if (er) {
          throw er
        }
      })
      t.strictSame(MKDIRPS, [installDir], 'need to make install dir')
      t.match(ARB_CTOR, [ { package: packages, path } ])
      t.strictSame(ARB_REIFY, [{add}], 'need to install both packages')
      t.equal(PROGRESS_ENABLED, true, 'progress re-enabled')
      const PATH = `${resolve(installDir, 'node_modules', '.bin')}${delimiter}${process.env.PATH}`
      t.match(RUN_SCRIPTS, [{
        pkg: { scripts: { npx: 'foobar' } },
        banner: false,
        path: process.cwd(),
        stdioString: true,
        event: 'npx',
        env: { PATH },
        stdio: 'inherit'
      }])
    })
  }
})

t.test('npm exec foo, no bin in package', t => {
  const path = t.testdir()
  npm.localPrefix = path
  ARB_ACTUAL_TREE[path] = {
    children: new Map([['foo', { name: 'foo', version: '1.2.3' }]])
  }
  MANIFESTS.foo = {
    name: 'foo',
    version: '1.2.3',
    _from: 'foo@',
    _id: 'foo@1.2.3'
  }
  return t.rejects(exec(['foo'], er => {
    if (er) {
      throw er
    }
  }), {
    message: 'could not determine executable to run',
    pkgid: 'foo@1.2.3'
  })
})

t.test('npm exec foo, many bins in package, none named foo', t => {
  const path = t.testdir()
  npm.localPrefix = path
  ARB_ACTUAL_TREE[path] = {
    children: new Map([['foo', { name: 'foo', version: '1.2.3' }]])
  }
  MANIFESTS.foo = {
    name: 'foo',
    version: '1.2.3',
    bin: {
      bar: 'bar',
      baz: 'baz'
    },
    _from: 'foo@',
    _id: 'foo@1.2.3'
  }
  return t.rejects(exec(['foo'], er => {
    if (er) {
      throw er
    }
  }), {
    message: 'could not determine executable to run',
    pkgid: 'foo@1.2.3'
  })
})

t.test('npm exec -p foo -c "ls -laF"', async t => {
  const path = t.testdir()
  npm.localPrefix = path
  npm.flatOptions.package = ['foo']
  npm.flatOptions.call = 'ls -laF'
  ARB_ACTUAL_TREE[path] = {
    children: new Map([['foo', { name: 'foo', version: '1.2.3' }]])
  }
  MANIFESTS.foo = {
    name: 'foo',
    version: '1.2.3',
    _from: 'foo@'
  }
  await exec([], er => {
    if (er) {
      throw er
    }
  })
  t.strictSame(MKDIRPS, [], 'no need to make any dirs')
  t.match(ARB_CTOR, [ { package: ['foo'], path } ])
  t.strictSame(ARB_REIFY, [], 'no need to reify anything')
  t.equal(PROGRESS_ENABLED, true, 'progress re-enabled')
  t.match(RUN_SCRIPTS, [{
    pkg: { scripts: { npx: 'ls -laF' } },
    banner: false,
    path: process.cwd(),
    stdioString: true,
    event: 'npx',
    env: { PATH: process.env.PATH },
    stdio: 'inherit'
  }])
})

t.test('positional args and --call together is an error', t => {
  npm.flatOptions.call = 'true'
  return t.rejects(exec(['foo'], er => {
    if (er) {
      throw er
    }
  }), exec.usage)
})
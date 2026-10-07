import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Module from 'node:module';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../src/', import.meta.url));
export function createTsLoader(mocks = {}) {
  const modules = new Map();
  function load(relative) {
    const filename = path.isAbsolute(relative) ? relative : path.join(root, relative);
    if (modules.has(filename)) return modules.get(filename).exports;
    const loaded = new Module(filename);
    modules.set(filename, loaded);
    loaded.require = (specifier) => {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier.startsWith('@/')) return load(`${specifier.slice(2)}.ts`);
      if (specifier.startsWith('.')) return load(path.resolve(path.dirname(filename), `${specifier}.ts`));
      return Module.createRequire(filename)(specifier);
    };
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    });
    loaded._compile(compiled.outputText, filename);
    return loaded.exports;
  }
  return load;
}

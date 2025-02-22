/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react-native
 */

'use strict';

/*::
import type {PackageJson} from '../../utils/monorepo';
*/

const {getPackages} = require('../../utils/monorepo');
const {setReactNativeVersion} = require('../set-rn-version');
const {promises: fs} = require('fs');
const path = require('path');
const yargs = require('yargs');

async function updatePackageJson(
  packagePath /*: string */,
  packageJson /*: PackageJson */,
  newPackageVersions /*: $ReadOnly<{[string]: string}> */,
) /*: Promise<void> */ {
  const packageName = packageJson.name;

  if (packageName in newPackageVersions) {
    packageJson.version = newPackageVersions[packageName];
  }

  for (const dependencyField of ['dependencies', 'devDependencies']) {
    const deps = packageJson[dependencyField];

    if (deps == null) {
      continue;
    }

    for (const dependency in newPackageVersions) {
      if (dependency in deps) {
        deps[dependency] = newPackageVersions[dependency];
      }
    }
  }

  return fs.writeFile(
    path.join(packagePath, 'package.json'),
    JSON.stringify(packageJson, null, 2) + '\n',
    'utf-8',
  );
}

/**
 * Sets a singular version for the entire monorepo.
 *
 * Set `skipReactNativeVersion` to true when we don't want to update the version of react-native.
 * The use-case is when we update versions on `main` after a release cut. The version of react-native
 * stays 1000.0.0.
 *
 * This script does the following:
 * - Update all public npm packages under `<root>/packages` to specified version
 * - Update all npm dependencies of a `<root>/packages` package to specified version
 * - Update npm dependencies of the template app (`packages/react-native/template`) to specified version
 * - Update `packages/react-native` native source and build files to specified version if relevant
 */
async function setVersion(
  version /*: string */,
  skipReactNativeVersion /*: boolean */ = false,
) /*: Promise<void> */ {
  const packages = await getPackages({
    includePrivate: false,
    includeReactNative: true,
  });
  const newPackageVersions = Object.fromEntries(
    Object.keys(packages).map(packageName => [packageName, version]),
  );

  await setReactNativeVersion(
    skipReactNativeVersion ? '1000.0.0' : version,
    newPackageVersions,
  );

  // Exclude the react-native package, since this (and the template) are
  // handled by `setReactNativeVersion`.
  const packagesToUpdate = Object.values(packages).filter(
    pkg => pkg.name !== 'react-native',
  );

  await Promise.all(
    packagesToUpdate.map(({path: packagePath, packageJson}) =>
      updatePackageJson(packagePath, packageJson, newPackageVersions),
    ),
  );
}

if (require.main === module) {
  const {toVersion, skipReactNativeVersion} = yargs(process.argv.slice(2))
    .command(
      '$0 <to-version>',
      'Update all monorepo packages to <to-version>',
      args =>
        args.positional('to-version', {
          type: 'string',
          description: 'Sets entire monorepo to version provided',
          required: true,
        }),
    )
    .option('skip-react-native-version', {
      description: "Don't update the version of the react-native package",
      type: 'boolean',
      default: false,
    })
    .parseSync();
  setVersion(toVersion, !!skipReactNativeVersion).then(
    () => process.exit(0),
    error => {
      console.error(`Failed to set version ${toVersion}\n`, error);
      process.exit(1);
    },
  );
}

module.exports = setVersion;

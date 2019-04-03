/* 
   Copyright 2019 Locomote Ltd.

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

const initGlobal = require('indexeddbshim');
const IDB = require('@locomote.sh/idb');
const initQuery = require('./query');

/**
 * Initialize a query API for use in an external, non-browser environment.
 * @param dbpath    Optional location of a directory for saving IndexedDB
 *                  instances to disk. If not provided then all IndexedDB
 *                  instances are in-memory only and are not persisted.
 */
module.exports = function init( dbpath ) {
    
    // A global environment for the IndexedDB shim.
    const global = {};
    global.window = global;

    // IndexedDB setup options.
    const opts = dbpath
        ? { checkOrigin: false, databaseBasePath: dbpath }
        : { checkOrigin: false, memoryDatabase: ':memory:' };

    // Initialize the global env by adding indexedDB and IDBKeyPath refs.
    initGlobal( global, opts );

    // Create the idb functional wrapper.
    const idb = IDB( global );

    // Create the query function.
    const query = initQuery( idb );

    // Return the query function and the idb wrapper.
    return { query, idb };
}


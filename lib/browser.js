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

const initQuery = require('./query');
const IDB = require('@locomote.sh/idb');

/**
 * Initialize a query API for use in browser.
 * @param global    An optional global object. If not provided then defaults
 *                  to either the 'window' or 'global' object, whichever is
 *                  in available in the 'this' scope.
 */
module.exports = function init( global ) {

    // Create the idb functional wrapper.
    const idb = IDB( global || this.window || this.global );

    // Create the query function.
    const query = initQuery( idb );

    // Return the query function and the idb wrapper.
    return { query, idb };
}


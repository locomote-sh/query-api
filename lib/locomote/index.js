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

/* Query API functionality for use with the Locomote.sh content server
 * and different build tools.
 */

const initServer = require('./server');
const { makeSchema } = require('./schema');

/**
 * Initialize a query API environment for Locomote.sh.
 * @param filesets  Filesets to use when adding records to the file DB.
 * @param dbpath    An optional file path to store persisted file DB
 *                  instances under. If not provided then all file DB
 *                  instances are transient, in-memory instances only.
 */
module.exports = function init( filesets, dbpath ) {

    const server = initServer( filesets, dbpath );

    /**
     * Make a basic content origin with a standard db scheme
     * @param name  The db name.
     */
    function makeContentOrigin( name ) {
        const schema = makeSchema( name );
        return { schema };
    }

    server.makeContentOrigin = makeContentOrigin;

    return server;
}


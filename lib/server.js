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

// Server side functions for using the query API.

const { fingerprint } = require('@locomote.sh/utils');

const IDB = require('@locomote.sh/idb');

module.exports = function init( global ) {

    const idb = IDB( global );
    const query = require('./query')( idb );

    const {
        idbOpen,
        fdbRead,
        fdbWrite
    } = idb;

    /**
     * Read the hash of the latest commit from a file DB.
     * @param origin    A content origin.
     */
    async function readLatestCommit( origin ) {
        const latest = await fdbRead( origin, '.locomote/commit/$latest');
        return latest && latest.commit;
    }

    /**
     * Update the file DB.
     * @param origin    A content origin.
     * @param records   A list of file records.
     */
    async function updateDB( origin, records ) {
        // Open the indexeddb instance.
        const db = await idbOpen( origin );
        // Write new records to the db.
        for( const record of records ) {
            await fdbWrite( origin, record );
        }
        // Close the db.
        db.close();
    }

    /**
     * Generate an etag for a query response by combining the source repo's
     * latest commit hash with a hash of the query parameter names and values.
     */
    async function eTag( origin, req ) {
        const latest = await readLatestCommit( origin );
        const { query } = req;
        const keys = Object.keys( query ).sort();
        const values = keys.map( k => query[k] );
        return `${latest || '00000000'}-${fingerprint( keys.concat( values ) , 20 )}`;
    }

    /**
     * Set cache headers on a HTTP response.
     */
    function setCacheHeaders( res ) {
        res.set('Content-Type', 'application/json');
        res.set('Cache-Control','public, must-revalidate, max-age=600');
    }

    /**
     * Handle a HTTP file record request.
     * @param origin    A content origin.
     * @param req       An HTTP request. Should provide HTTP query parameters on a
     *                  'query' property.
     * @param res       An HTTP response.
     */
    async function handleFileRecordRequest( origin, req, res ) {
        const record = await fdbRead( origin, req.path );
        setCacheHeaders( res );
        res.end( JSON.stringify( record ) );
    }

    /**
     * Handle a HTTP query request.
     * @param origin    A content origin.
     * @param req       An HTTP request. Should provide HTTP query parameters on a
     *                  'query' property.
     * @param res       An HTTP response.
     */
    async function handleQueryRequest( origin, req, res ) {
        // Execute the query.
        const result = await query( origin, req.query );
        // Set headers.
        setCacheHeaders( res );
        const etag = await eTag( origin, req );
        res.set('Etag', etag );
        // Send the query result.
        res.end( JSON.stringify( result ) );
    }

    return {
        readLatestCommit,
        updateDB,
        handleFileRecordRequest,
        handleQueryRequest
    }

}



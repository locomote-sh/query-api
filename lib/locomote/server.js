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

const initQueryAPI = require('../external');

/**
 * Initialize Locomote.sh content server functions.
 */
module.exports = function init( filesets, dbpath ) {

    // Initialize the query API using the external environment.
    const {
        query,
        idb: { idbConnect }
    } = initQueryAPI( dbpath );

    // Following fdb* functions copied from sw/src/fdb.js; needs to be
    // a consolidation of these two codebases, after idb rewrite is complete.

    const ObjStoreName = 'files';

    /**
     * Connect to a file db.
     * @param origin    A content origin with a schema definition.
     */
    function fdbConnect( origin ) {
        const { schema } = origin;
        return idbConnect( schema, ObjStoreName );
    }
    
    const { makeFileRecord } = filesets;

    /**
     * Read the hash of the latest commit from a file DB.
     * @param origin    A content origin.
     */
    async function readLatestCommit( origin ) {
        const db = await fdbConnect( origin );
        const latest = await db.read('.locomote/commit/$latest');
        db.close();
        return latest && latest.commit;
    }

    /**
     * Add one or more file records to the file DB.
     * Adds new records or updates existing records. Deletes records for
     * deleted files (i.e. status: 'deleted').
     * @param origin    A content origin.
     * @param records   A list of file records.
     */
    async function addFileRecords( origin, records ) {
        // Open the indexeddb instance.
        const db = await fdbConnect( origin );
        // Write new records to the db.
        await Promise.all( records.map( record => {
            const { path, status } = record;
            if( status === 'deleted' ) {
                return db.remove( path );
            }
            return db.write( record );
        }));
        // Close the db.
        db.close();
    }

    /**
     * Add one or more files to the file DB.
     * @param origin    A content origin.
     * @param files     A list of file paths to add.
     * @param basePath  The path that supplied file paths are relative to.
     */
    async function addFiles( origin, files, basePath ) {
        // An object for caching filesets.
        const fsCache = {};
        // A request context used when generating file records.
        const ctx = { repoPath: basePath };
        // A version identified, also used to resolve fileset definitions
        // when generating file records - not currently needed.
        const version = null;
        // The file status - always true to indicate an active file.
        const status = true;
        // Open the indexeddb instance.
        const db = await fdbConnect( origin );
        // Write new records to the db.
        for( const file of files ) {
            // Generate the file record.
            const record = await makeFileRecord( ctx, version, file, status, fsCache );
            // If record returned then write to the db.
            if( record ) {
                await db.write( record );
            }
        }
        // Close the db.
        db.close();
    }

    /**
     * Remove one or more file records from the file DB.
     * @param origin    A content origin.
     * @param files     A list of file paths to remove.
     */
    async function removeFiles( origin, files ) {
        // Open the indexeddb instance.
        const db = await fdbConnect( origin );
        // Delete file records from fb.
        await Promise.all( files.map( file => db.remove( file ) ) );
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
        let { path } = req;
        path = path.slice( 1 ); // Loose the leading slash.
        const db = await fdbConnect( origin );
        const record = await db.read( path );
        db.close();
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
        const { schema } = origin;
        const { query: params } = req;
        const result = await query( schema, ObjStoreName, params );
        // Set headers.
        setCacheHeaders( res );
        const etag = await eTag( origin, req );
        res.set('Etag', etag );
        // Send the query result.
        res.end( JSON.stringify( result ) );
    }

    return {
        query,
        readLatestCommit,
        addFileRecords,
        addFiles,
        removeFiles,
        handleFileRecordRequest,
        handleQueryRequest
    }

}

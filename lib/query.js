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

/* A standard API for querying the file DB. */

/**
 * Initialize the query API.
 * @param idb   The initialized IndexedDB API (see idb.js).
 * @return Returns a function for executing content queries on a Locomote file DB.
 */
function init( idb ) {

    const {
        indexedDB,
        IDBKeyRange,
        idbOpenObjStore,
        idbOpenPK,
        idbOpenIndex,
        fdbReadAll
    } = idb;

    /**
     * Execute a query on an object store.
     * @param idb       IndexedDB functions.
     * @param origin    The content origin configuration.
     * @param params    The query parameters.
     */
    async function query( origin, params ) {

        const objStore = await idbOpenObjStore( origin, 'files');

        const results = await new Promise( ( resolve, reject ) => {

            // Result list - an array of matching primary keys.
            const results = [];
            // Initialize index cursors using query parameters.
            const cursors = new QueryCursors( objStore, params );
            
            // Check for null result.
            if( cursors.isNull() ) {
                return resolve( results );
            }

            let match;      // A primary key which matches the query terms.
            let prevKey;    // The previously matched primary key.
            let count = 0;  // The number of matches found.
            // The number of cursors we're still waiting for a result from.
            let pending = cursors.count;

            // Query parameters.
            const { $join = 'and', $from, $to, $limit } = params;

            // Cursor onsuccess event handler.
            const onsuccess = () => {
                // Negative pending means iteration is done.
                if( pending < 0 ) return;
                try {
                    pending--;
                    // If no pending cursors then process current result.
                    if( pending == 0 ) {
                        // Increment cursor state.
                        let { expect, match } = cursors.increment( $join );
                        // Test if we have a match and if it is different
                        // from the previous match.
                        if( match && match != prevKey ) {
                            // Add the match to the results list if no 'from'
                            // range limit, or if we are past the 'from' limit.
                            if( !$from || count >= $from ) {
                                results.push( match );
                            }
                            // Increment number of matches.
                            count++;
                            prevKey = match;
                        }
                        if( expect == 0 ) {
                            // No more results available.
                            resolve( results );
                            expect = -1; // Done iterating.
                        }
                        if( $to && count > $to ) {
                            // Past the end of the 'to' range.
                            resolve( results );
                            expect = -1; // Done iterating.
                        }
                        if( $limit && results.length == $limit ) {
                            // At end of result limit.
                            resolve( results );
                            expect = -1; // Done iterating.
                        }
                        pending = expect;
                    }
                }
                catch( e ) {
                    reject( e );
                }
            };

            // Open the index cursors.
            cursors.open( onsuccess, reject );
        });

        // Format query results.
        // First read query formatting parameters.
        const { $format, $orderBy } = params;
        // If result format is 'keys' then return result as is.
        if( $format == 'keys' ) {
            return results;
        }

        // Read object for each key in the result.
        const objects = await fdbReadAll( origin, results );
        // If returning a lookup then generate a key -> object map
        // from the list of keys and list of objects.
        if( $format == 'lookup' ) {
            const lookup = {};
            results.forEach( ( key, idx ) => {
                lookup[key] = objects[idx];
            });
            return lookup;
        }

        // Returning the list of objects.
        // Sort the list if an orderBy clause specified.
        if( $orderBy ) {
            objects.sort( comparator( $orderBy ) );
        }
        return objects;
    }

    /**
     * A function to create a function for comparing objects based on a value
     * at a property of each object on a specified path.
     */
    function comparator( path ) {
        // Break the path into an array of keys;
        const keys = path.split('.');
        // A function for resolving the path on an object.
        const resolve = function resolve( obj ) {
            // Iterate over each key in the path.
            for( let key of keys ) {
                if( !obj ) break;   // Break-out if no value.
                obj = obj[key];     // Lookup next value.
            }
            return obj;
        }
        // Return a function for comparing two objects by looking
        // up the property path value on each object.
        return function( o1, o2 ) {
            const v1 = resolve( o1 );
            const v2 = resolve( o2 );
            if( v1 < v2 ) {
                return -1;
            }
            if( v1 > v2 ) {
                return 1;
            }
            return 0;
        }
    }

    /**
     * A set of index cursors querying an object store.
     */
    class QueryCursors {

        /**
         * Initialize one or more cursors on the object store indecies.
         * @param objStore  A transaction opened on the object store being queried.
         * @param params    Query parameters.
         */
        constructor( objStore, params ) {
            // A map of paired test names which can be used to define query ranges.
            const testPairs = { 'to': 'from', 'from': 'to' };
            const queries = [];
            // Rewrite the set of parameters into a list of query descriptors.
            for( let key in params ) {
                // Skip query top-level params.
                if( key[0] == '$' ) {
                    continue;
                }
                // Split key into index name and test operation.
                let [ index, test ] = key.split('$');
                if( !test ) {
                    test = 'value';
                }
                // Read the test value.
                let value = params[key];
                // Check if this is a paired test.
                let pair = testPairs[test];
                if( pair ) {
                    // See if a query has already been created for the matching
                    // test pair.
                    let query = queries.find( query => {
                        return query.index === index
                            && query[pair] !== undefined
                            && query[test] === undefined;
                    });
                    // If query found then merge the current test into it.
                    if( query ) {
                        query[test] = value;
                        continue;
                    }
                }
                queries.push( new IndexQuery( objStore, index, test, value ) );
            }
            this.queries = queries;
        }

        /**
         * The number of cursors in the query.
         */
        get count() {
            return this.queries.length;
        }

        /**
         * Test if the query is a null query (i.e. no parameters / no results).
         */
        isNull() {
            return this.queries.length == 0;
        }

        /**
         * Open the query's cursors.
         */
        open( onsuccess, onerror ) {
            this.queries.forEach( query => query.openCursor( onsuccess, onerror ) );
        }

        /**
         * Increment the cursors state, check for matches and indicate what
         * cursors to continue for next iteration.
         * @param $join The join condition for multiple cursors; 'and' or 'or'.
         */
        increment( $join ) {
            // Get list of active cursors.
            this.cursors = this.queries.filter( query => !query.isComplete() );
            // Sort active cursors by primary key of matched record.
            this.cursors.sort( ( c1, c2 ) => c1.cmp( c2 ) );
            // Initialize results.
            let match, expect = 0;
            // Process cursors.
            switch( $join ) {
                case 'or':
                    if( this.allComplete() ) {
                        // All cursors completed => query is completed.
                        expect = 0;
                    }
                    else {
                        // Match and iterate lowest cursor.
                        match = this.lowestPrimaryKey();
                        expect = this.continueLowest();
                    }
                    break;
                case 'and':
                    if( this.anyComplete() ) {
                        // Any cursor completed => query is completed.
                        expect = 0;
                    }
                    else if( this.allKeysMatch() ) {
                        // If all cursor keys are the same then we have a match.
                        match = this.lowestPrimaryKey();
                        expect = this.continueAll();
                    }
                    else {
                        // No match, iterate the lowest cursor.
                        expect = this.continueLowest();
                    }
                    break;
                default:
                    throw new Error(`Bad query join: '${$join}'`);
            }

            return { match, expect };
        }

        /**
         * Test if all cursors have completed.
         */
        allComplete() {
            // All cursors are complete if no active cursors remain.
            return this.cursors.length == 0;
        }

        /**
         * Test if any cursor has completed.
         */
        anyComplete() {
            // Some cursor has completed if active count is less than query count.
            return this.cursors.length < this.queries.length;
        }

        /**
         * Test if all cursors are matching the same primary key.
         */
        allKeysMatch() {
            const { cursors } = this;
            // Note that result is true if only one cursor, so start comparison
            // from second position.
            for( let i = 1; i < cursors.length; i++ ) {
                if( cursors[i].primaryKey != cursors[i - 1].primaryKey ) {
                    return false;
                }
            }
            return true;
        }

        /**
         * Return the lowest primary key of all active cursors.
         */
        lowestPrimaryKey() {
            return this.cursors[0].primaryKey;
        }
        
        /**
         * Continue the cursor with the lowest primary key.
         */
        continueLowest() {
            this.cursors[0].continue();
            return 1;
        }

        /**
         * Continue all cursors.
         */
        continueAll() {
            this.cursors.forEach( cursor => cursor.continue() );
            return this.cursors.length;
        }

    }

    /**
     * A query on an object store index. Instances of this class
     * encapsulate one or more constraints used when iterating
     * over the index.
     */
    class IndexQuery {

        /**
         * Create a new query on the named index.
         * @param objStore  A transaction opened on the object store being queried.
         * @param index     An object store index name.
         * @param test      A test operation.
         * @param value     A test value.
         */
        constructor( objStore, index, test, value ) {
            this.objStore = objStore;
            this.index = index;
            this[test] = value;
        }

        /**
         * Open a cursor using the query's constraints.
         * @param onsuccess An onsuccess callback handler to attach to the cursor.
         * @param onerror   An error callback.
         */
        openCursor( onsuccess, onerror ) {
            // Make index search term from query constraints.
            let term;
            const { from, to, prefix, value } = this;
            if( from && to ) {
                this.mode = 'range';
                term = IDBKeyRange.bound( from, to, true );
            }
            else if( from ) {
                this.mode = 'range';
                term = IDBKeyRange.lowerBound( from, true );
            }
            else if( to ) {
                this.mode = 'range';
                term = IDBKeyRange.upperBound( to, true );
            }
            else if( prefix ) {
                this.mode = 'prefix';
                term = IDBKeyRange.lowerBound( prefix, true );
            }
            else if( value ) {
                this.mode = 'value';
                term = value;
            }
            const { index } = this;
            // Open a cursor.
            const pending = index == 'path'
                // Open cursor on primary key index.
                ? idbOpenPK( null, null, term, this.objStore )
                // Open cursor on named index.
                : idbOpenIndex( null, null, index, term, this.objStore );
            // Wait for async call to complete and then attach cursor.
            pending
                .then( cursor => {
                    cursor.onsuccess = onsuccess;
                    this.cursor = cursor;
                })
                .catch( onerror );
        }

        /**
         * Get the primary key currently referenced by the query's cursor.
         */
        get primaryKey() {
            return this.cursor.result.primaryKey;
        }

        /**
         * Test if the query's cursor has completed.
         * A cursor has completed if it has gone past the last record in its range.
         */
        isComplete() {
            const { mode, cursor: { result }, prefix } = this;
            switch( mode ) {
                case 'prefix':
                    return result == null || !result.key.startsWith( prefix );
                case 'value':
                case 'range':
                default:
                    return result == null;
            }
        }

        /**
         * Continue the query cursor.
         */
        continue() {
            this.cursor.result.continue();
        }

        /**
         * Compare this query's primary key with that of another query.
         */
        cmp( query ) {
            const pk0 = this.cursor.result.primaryKey;
            const pk1 = query.cursor.result.primaryKey;
            return indexedDB.cmp( pk0, pk1 );
        }
    }

    return query;
}

module.exports = init;

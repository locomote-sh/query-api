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
function initQuery( idb ) {

    const {
        indexedDB,
        IDBKeyRange,
        idbConnect
    } = idb;

    /**
     * Execute a query on an object store.
     * @param schema    The schema of the database being queried.
     * @param store     The name of the object store being queried.
     * @param params    The query parameters.
     */
    async function query( schema, store, params ) {

        // Convert query string to URLSearchParams.
        if( typeof params === 'string' ) {
            params = new URLSearchParams( params );
        }

        // Convert URLSearchParam to plain JS object.
        if( params instanceof URLSearchParams ) {
            const _params = {};
            for( const key of params.keys() ) {
                _params[key] = params.get( key );
            }
            params = _params;
        }

        // Connect to the object store.
        const cx = await idbConnect( schema, store );

        // Run the query.
        const results = await new Promise( async ( resolve, reject ) => {

            // Result list - an array of matching primary keys.
            const results = [];
            // Initialize index cursors using query parameters.
            const cursors = new QueryCursors( cx, params );
            
            // Check for null result.
            if( cursors.isNull() ) {
                return resolve( results );
            }

            //let match;      // A primary key which matches the query terms.
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
        const objects = await cx.readAll( results );

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
     * Return a function to resolve a dotted path reference on an object.
     */
    function makePathGetter( path ) {
        // Break the path into an array of keys;
        const keys = path.split('.');
        // A function for resolving the path on an object.
        return function getPath( obj ) {
            return keys.reduce( ( val, key ) => val && val[key], obj );
        }
    }

    /**
     * A function to create a function for comparing objects based on a value
     * at a property of each object on a specified path.
     */
    function comparator( path ) {
        const get = makePathGetter( path );
        // Return a function for comparing two objects by looking
        // up the property path value on each object.
        return function( o1, o2 ) {
            const v1 = get( o1 );
            const v2 = get( o2 );
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
         * @param cx        A connection to the object store being queried.
         * @param params    Query parameters.
         */
        constructor( cx, params ) {
            // A map of paired test names which can be used to define query ranges.
            const to = 'to', from = 'from';
            const testPairs = { to, from };
            const queries = [];
            // Rewrite the set of parameters into a list of query descriptors.
            for( const key in params ) {
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
                const value = params[key];
                // Check if this is a paired test.
                const pair = testPairs[test];
                if( pair ) {
                    // See if a query has already been created for the matching
                    // test pair.
                    const query = queries.find( query => {
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
                // Initialize queries.
                let iq;
                if( index === cx.keyPath ) {
                    iq = new PKQuery( cx, index, test, value );
                }
                else if( cx.indexNames.contains( index ) ) {
                    iq = new IndexQuery( cx, index, test, value );
                }
                else {
                    iq = new ScanQuery( cx, index, test, value );
                }
                queries.push( iq );
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
    class Query {

        /**
         * Create a new query on the named index.
         * @param cx        A connection to the object store being queried.
         * @param index     An object store index name.
         * @param test      A test operation.
         * @param value     A test value.
         */
        constructor( cx, index, test, value ) {
            this.cx = cx;
            this.index = index;
            this[test] = value;
        }

        /**
         * Initialize the query's key range based on the search terms.
         */
        initKeyRange() {
            const { from, to, prefix, value } = this;
            if( from && to ) {
                this.mode = 'range';
                this.term = IDBKeyRange.bound( from, to );
            }
            else if( from ) {
                this.mode = 'range';
                this.term = IDBKeyRange.lowerBound( from );
            }
            else if( to ) {
                this.mode = 'range';
                this.term = IDBKeyRange.upperBound( to );
            }
            else if( prefix ) {
                this.mode = 'prefix';
                this.term = IDBKeyRange.lowerBound( prefix );
            }
            else if( value ) {
                this.mode = 'value';
                this.term = value;
            }
            else throw new Error('Illegal query state: None of [ from, to, prefix, value ] set');
        }

        /**
         * Open a cursor using the query's constraints.
         * Default implementation throws an error; use one of the subclasses instead.
         * @param onsuccess An onsuccess callback handler to attach to the cursor.
         * @param onerror   An error callback.
         */
        openCursor( onsuccess, onerror ) {
            throw new Error('Use a subclass of Query');
        }

        /**
         * Get the primary key currently referenced by the query's cursor.
         */
        get primaryKey() {
            return this.cursor.primaryKey;
        }

        /**
         * Test if the query's cursor has completed.
         * A cursor has completed if it has gone past the last record in its range.
         */
        isComplete() {
            const { mode, cursor, prefix } = this;
            switch( mode ) {
                case 'prefix':
                    return cursor == null || !cursor.key.startsWith( prefix );
                case 'value':
                case 'range':
                case 'scan':
                default:
                    return cursor == null;
            }
        }

        /**
         * Continue the query cursor.
         */
        continue() {
            this.cursor.continue();
        }

        /**
         * Compare this query's primary key with that of another query.
         */
        cmp( query ) {
            const { primaryKey: pk0 } = this;
            const { primaryKey: pk1 } = query;
            return indexedDB.cmp( pk0, pk1 );
        }
    }

    /**
     * A query on an object store's primary key index.
     */
    class PKQuery extends Query {

        /**
         * Create a new query on the named index.
         * @param cx        A connection to the object store being queried.
         * @param index     An object store index name.
         * @param test      A test operation.
         * @param value     A test value.
         */
        constructor( cx, index, test, value ) {
            super( cx, index, test, value );
            this.initKeyRange();
        }

        /**
         * Open a cursor using the query's constraints.
         * @param onsuccess An onsuccess callback handler to attach to the cursor.
         * @param onerror   An error callback.
         */
        openCursor( onsuccess, onerror ) {
            const { term } = this;
            // NOTE the abstraction leak here; the idbOpenPK/idbOpenIndex
            // functions return a request object rather than a promise;
            // returning an async iterator would probably be a better idea.
            const request = this.cx.openPK( term );
            request.onsuccess = () => {
                this.cursor = request.result;
                onsuccess();
            };
            request.onerror = onerror;
        }

    }

    /**
     * A query on a named index of an object store.
     */
    class IndexQuery extends Query {

        /**
         * Create a new query on the named index.
         * @param cx        A connection to the object store being queried.
         * @param index     An object store index name.
         * @param test      A test operation.
         * @param value     A test value.
         */
        constructor( cx, index, test, value ) {
            super( cx, index, test, value );
            this.initKeyRange();
        }

        /**
         * Open a cursor using the query's constraints.
         * @param onsuccess An onsuccess callback handler to attach to the cursor.
         * @param onerror   An error callback.
         */
        openCursor( onsuccess, onerror ) {
            const { term, index } = this;
            // NOTE the abstraction leak here; the idbOpenPK/idbOpenIndex
            // functions return a request object rather than a promise;
            // returning an async iterator would probably be a better idea.
            const request = this.cx.openIndex( index, term );
            request.onsuccess = () => {
                this.cursor = request.result;
                onsuccess();
            };
            request.onerror = onerror;
        }

    }

    /**
     * A query which scans each row in an object store to find matching results.
     */
    class ScanQuery extends Query {

        /**
         * Create a new query on the named index.
         * @param cx        A connection to the object store being queried.
         * @param index     An object store index name; in this case, the path to the
         *                  property being tested on each row.
         * @param test      A test operation.
         * @param value     A test value.
         */
        constructor( cx, index, test, value ) {
            super( cx, index, test, value );
            this.initScanMatch();
        }

        /**
         * Initialize the row scan match function.
         */
        initScanMatch() {
            const { index, from, to, prefix, value } = this;
            const get = makePathGetter( index );
            if( from && to ) {
                this.match = function rangeFilter( row ) {
                    const value = get( row );
                    return value >= from && value <= to;
                };
            }
            else if( from ) {
                this.match = function lowerBoundFilter( row ) {
                    return get( row ) >= from;
                };
            }
            else if( to ) {
                this.match = function upperBoundFilter( row ) {
                    return get( row ) <= to;
                };
            }
            else if( prefix ) {
                this.match = function prefixFilter( row ) {
                    const value = get( row );
                    return (''+value).startsWith( prefix );
                };
            }
            else if( value ) {
                this.match = function valueFilter( row ) {
                    return value === get( row );
                };
            }
            else throw new Error('Illegal query state: None of [ from, to, prefix, value ] set');
        }

        /**
         * Open a cursor using the query's constraints.
         * @param onsuccess An onsuccess callback handler to attach to the cursor.
         * @param onerror   An error callback.
         */
        openCursor( onsuccess, onerror ) {
            const term = null;
            this.mode = 'scan';
            // Scan is done across all rows of the object store in PK order.
            const request = this.cx.openPK( term );
            request.onsuccess = () => {
                const cursor = request.result;
                this.cursor = cursor;
                if( cursor !== null ) {
                    const { value } = cursor;
                    // Test if the current row matches the query criteria and
                    // notify success if it does, otherwise continue to next row.
                    if( this.match( value ) ) {
                        onsuccess();
                    }
                    else cursor.continue();
                }
                else onsuccess(); // Necessary to notify end of scan.
            };
            request.onerror = onerror;
        }

    }

    return query;
}

if( typeof module === 'object' ) {
    module.exports = initQuery;
}

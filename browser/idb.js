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

/* Functions for working with IndexedDB databases. */

/**
 * Initialize the IndexedDB API.
 * @param global    A global object with { indexedDB, IDBKeyRange } properties.
 * @return Returns a set of functions for interacting with an IndexedDB instance.
 */
function initIDB( global ) {

    const { indexedDB, IDBKeyRange } = global;

    /**
     * Open an IndexedDB connection.
     * @param schema    The database schema.
     */
    function idbOpen( schema ) {
        const { name, version = 1 } = schema;
        if( !name ) {
            throw new Error('idbOpen: "name" property not specified on schema');
        }
        return new Promise( ( resolve, reject ) => {
            const request = indexedDB.open( name, version );
            request.onsuccess = ( e ) => {
                resolve( request.result );
            };
            request.onerror = ( e ) => {
                reject( request.error );
            };
            request.onupgradeneeded = ( e ) => {
                idbInit( e.target.result, schema );
            };
        });
    }

    /**
     * Initialize an IndexedDB instance.
     * @param db        The DB connection.
     * @param schema    The DB schema.
     */
    function idbInit( db, schema ) {
        const { stores } = schema;
        for( const name in stores ) {
            const { options, indexes } = stores[name];
            const objStore = db.createObjectStore( name, options );
            for( const index in indexes ) {
                const { keyPath, options } = indexes[index];
                objStore.createIndex( index, keyPath, options );
            }
        }
    }

    /**
     * Open a transaction on an object store.
     * @param schema    The database schema.
     * @param store     The object store name.
     * @param mode      The transaction mode; defaults to 'readonly'.
     */
    async function idbOpenObjStore( schema, store, mode = 'readonly' ) {
        const db = await idbOpen( schema );
        return db.transaction( store, mode ).objectStore( store );
    }

    /**
     * Convert an idb request object to a promise.
     */
    function reqAsPromise( request ) {
        return new Promise( ( resolve, reject ) => {
            request.onsuccess = () => resolve( request.result );
            request.onerror   = () => reject( request.error );
        });
    }

    /**
     * Read an object from an object store.
     * @param objStore  An open object store transaction.
     * @param key       An object primary key.
     */
    function idbRead( objStore, key ) {
        return reqAsPromise( objStore.get( key ) );
    }

    /**
     * Read a list of objects from an object store.
     * @param objStore  An open object store transaction.
     * @param keys      A list of object primary keys.
     */
    function idbReadAll( objStore, keys ) {
        return Promise.all( keys.map( key => {
            return idbRead( objStore, key );
        }));
    }

    /**
     * Write an object to an object store.
     * @param objStore  An open object store transaction.
     * @param object    The object to write.
     */
    function idbWrite( objStore, object ) {
        return reqAsPromise( objStore.put( object ) );
    }

    /**
     * Delete an object from an object store.
     * @param objStore  An open object store transaction.
     * @param key       An object primary key.
     */
    function idbDelete( objStore, key ) {
        return reqAsPromise( objStore.delete( key ) );
    }

    /**
     * Open a cursor on an object store's primary key index.
     * @param objStore  An open object store transaction.
     * @param term      An index filter term.
     */
    function idbOpenPK( objStore, term ) {
        return objStore.openCursor( term );
    }

    /**
     * Open a cursor on an object store index.
     * @param objStore  An open object store transaction.
     * @param index     The name of the index to open.
     * @param term      An index filter term.
     */
    function idbOpenIndex( objStore, index, term ) {
        return objStore.index( index ).openCursor( term );
    }

    /**
     * Count the number of items in an index.
     * @param objStore  An open object store transaction.
     * @param index     The name of the index to open.
     * @param term      An index filter term.
     */
    async function idbIndexCount( objStore, index, term ) {
        return reqAsPromise( objStore.index( index ).count( term ) );
    }

    return {
        indexedDB,
        IDBKeyRange,
        idbOpen,
        idbOpenObjStore,
        idbRead,
        idbReadAll,
        idbWrite,
        idbDelete,
        idbOpenPK,
        idbOpenIndex,
        idbIndexCount
    };
        
}

if( typeof module === 'object' ) {
    module.exports = initIDB;
}


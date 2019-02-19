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

const assert = require('assert');

// Test content origin.
const Origin = {
    schema: {
        version: 1,
        stores: {
            'files': {
                options: {
                    keyPath: 'pk'
                },
                indexes: {
                    'group': {
                        keyPath: 'group',
                        options: { unique: false }
                    }
                }
            }
        }
    }
};

// Initialize an in-memory indexeddb.
const global = {};
global.window = global;

const initIDB = require('indexeddbshim');
initIDB( global, {
    checkOrigin:    false,
    memoryDatabase: ':memory:'
});

// Initialize query function.
const IDB = require('@locomote.sh/idb');
const idb = IDB( global );
const query = require('../lib/query')( idb );

describe('Query tests', () => {

    before( async () => {

        // Populate database with data.
        const Data = [
            { pk: 'a',   group: 'aaa', value: { title: 'a' } },
            { pk: 'aa',  group: 'aaa', value: { title: 'aa' } },
            { pk: 'aaa', group: 'aaa', value: { title: 'aaa' } },
            { pk: 'bbb', group: 'bbb', value: { title: 'bbb' } },
            { pk: 'ccc', group: 'bbb', value: { title: 'ccc' } }
        ];

        const {
            fdbOpenObjStore,
            idbWrite
        } = idb;

        const objStore = await fdbOpenObjStore( Origin );

        await Promise.all( Data.map( data => idbWrite( data, objStore ) ) );

    });

    // Tests.
    test('pk=value',                    { pk: 'aaa' },                  ['aaa']);
    test('pk$prefix=value',             { pk$prefix: 'a' },             ['a','aa','aaa']);
    test('pk$from=value',               { pk$from: 'aaa' },             ['aaa','bbb','ccc']);
    test('pk$to=value',                 { pk$to: 'bbb' },               ['a','aa','aaa','bbb']);

    test('group=value',                 { group: 'aaa' },               ['a','aa','aaa']);
    test('group$prefix=value',          { group$prefix: 'aa' },         ['a','aa','aaa']);
    test('group$from=value',            { group$from: 'bb' },           ['bbb','ccc']);
    test('group$to=value',              { group$to: 'bb' },             ['a','aa','aaa']);

    test('value.title=value',           { 'value.title': 'aaa' },       ['aaa']);
    test('value.title$prefix=value',    { 'value.title$prefix': 'aa' }, ['aa','aaa']);
    test('value.title$from=value',      { 'value.title$from': 'bb' },   ['bbb','ccc']);
    test('value.title$to=value',        { 'value.title$to': 'bb' },     ['a','aa','aaa']);

    test('pk=v1 and group=v1',          { pk: 'aaa', group: 'aaa' },    ['aaa']);
    test('pk=v1 and group=v2',          { pk: 'aaa', group: 'bbb' },    []);
    test('pk$from=v1 and group=v2',     { pk$from: 'a', group: 'bbb' }, ['bbb','ccc']);
/*
*/
});

function test( description, params, expected ) {

    describe( description, () => {

        let results;

        before( async () => {
            results = await query( Origin, params );
        });

        it(`should have ${expected.length} results`, () => {
            assert.equal( results.length, expected.length );
        });

        it('should have matching results', () => {
            const actual = results.map( r => r.pk );
            assert.deepEqual( actual, expected );
        });

    });

}

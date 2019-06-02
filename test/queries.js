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
const schema = {
    name: 'test',
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
};

// Initialize an out-of-browser query environment.
const { query, idb } = require('../lib/external')();

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
            idbConnect
        } = idb;

        const { write } = await idbConnect( schema, 'files');

        await Promise.all( Data.map( data => write( data ) ) );

    });

    // Tests.
    test('pk=aaa',                 ['aaa']);
    test('pk$prefix=a',            ['a','aa','aaa']);
    test('pk$from=aaa',            ['aaa','bbb','ccc']);
    test('pk$to=bbb',              ['a','aa','aaa','bbb']);

    test('group=aaa',              ['a','aa','aaa']);
    test('group$prefix=aa',        ['a','aa','aaa']);
    test('group$from=bb',          ['bbb','ccc']); 
    test('group$to=bb',            ['a','aa','aaa']);

    test('value.title=aaa',        ['aaa']);
    test('value.title$prefix=aa',  ['aa','aaa']);
    test('value.title$from=bb',    ['bbb','ccc']);
    test('value.title$to=bb',      ['a','aa','aaa']);

    test('pk=aaa&group=aaa',       ['aaa']);
    test('pk=aaa&group=bbb',       []);
    test('pk$from=a&group=bbb',    ['bbb','ccc']);

});

function test( params, expected ) {

    describe( params, () => {

        let results;

        before( async () => {
            results = await query( schema, 'files', params );
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

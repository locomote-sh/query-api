# query-api

A HTTP compatible API for querying _IndexedDB_ object store contents either in the browser, from a page or service worker context, or server side in a _Node.js_ process.

## Description

This module provides an API for querying the contents of an [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) [object store](https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore).
Queries can be easily and naturally described using the parameters to a HTTP GET request.
The query engine can run either in the browser or on a _Node.js_ process on the server.

## Motivation

The query API is designed principally for use with service workers to provide offline capable querying functionality to web pages.

A difficulty with implementing query functionality within a service worker is the possibility that the service worker isn't available, either because the code is running on a browser without service worker support, or because of the service worker lifecycle and the possibility that the page is running before the service worker has been installed and activated.
The simplest way to resolve these problems is to ensure that any URLs handled locally by the service worker can also be handled remotely by the originating server.

Using this module, it is possible to support querying both remotely, on the server-side, or locally, in an offline capable fashion, either in a service worker or in code running in the page.
This will work provided that both query modes operate on the same data set, e.g. by providing some mechanism for replicating the object store's contents to both client and server.

(Object store replication is outside of the scope of this module, but primitives are provided via the <https://github.com/locomote-sh/idb> library for manipulating the IndexedDB contents.
Also see the [Locomote.sh content server](https://github.com/locomote-sh/content-server) and associated [service worker](https://github.com/locomote-sh/sw) for a solution to the replication problem.)

With this in mind, it should be seen that the main goal of this module is to provide a standard HTTP API for executing queries, so that a URL like the following:

```
    https://example.com/query.api?category=sales&name$prefix=Dur&$from=20$$limit=10
```

when requested by the browser can be either handled and resolved by the server, or handled locally by a service worker, when available; and that both modes can be handled seemlessly with no differences in operation other than response time and offline capability.
As such, this module should be seen as a specification of the HTTP query API as much as an implementation of that API, and it should be possible to implement the API server side on platforms other than Node.js.

## Setup

The following sections describe how to initialize the query API for browser and server-side usage.

In both cases, the query API initializer function returns the following values:

* `query`: The query function; see reference below.
* `idb`: A functional, promise based wrapper around the standard IndexedDB API. See <https://github.com/locomote-sh/idb>.

### Browser

Import and call the initializer from the browser sub-module:

```js
    import init from '@locomote.sh/query-api/lib/browser';
    const { query, idb } = init();
```

### Server

Import and call the initializer from the external sub-module:

```js
    import init from '@locomote.sh/query-api/lib/external';
    const { query, idb } = init();
```

This will instantiate an transient, in-memory IndexedDB instance.
If you want to persist the database then provide the path to an on-disk location where database images can be stored:

```js
    const { query, idb } = init('/var/data/idb');
```

## Query function

The query function has the following API:

`query( schema, store, params )`

**Arguments**:

* `schema`: A database schema object. See <https://github.com/locomote-sh/idb> for details of the schema format.
* `store`: The name of the object store being queried; the store name must appear in the schema.
* `params`: An object containing the query parameters. Can be presented as either a plain JS object or as an [URLSearchParam object](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams).

**Returns**: A promise resolving to an array or object containing the query results.

## Usage

Queries are defined using HTTP request parameters.

### Filters

The most basic usage pattern is to filter the contents of an object store by a specified value on a named property of the objects in the store, for example:

```
    path=index.html
```

This query will return all objects with a `path` property equal to `index.html`.

The filter operation can be modified by appending a comparison specifier to the property name, so for example:

```
    path$prefix=images/
```

will match any objects with a `path` property starting with `images/` - e.g. `images/logo.png` or `images/icons/file.png` would both match.
Note that the comparison specifier has been supplied by appending `$` followed by a comparison name. The full list of supported comparison specifiers is:

* `$prefix`: Match values starting with the specified value.
* `$from`: Match values &gt;= the specified value.
* `$to`: Match values &lt;= the specified value.
* `$value`: Match the value exactly. Note that `name=xxx` is shorthand for `name$value=xxx`.

Multiple filter operations can be combined. For example, the query:

```
    date$from=2018-01-01&date$to=2018-12-31
```

could be used to match objects within a certain date range, whilst the query:

```
    path$prefix=pages/&category=images
```

could be used to find objects representing files in a specific category and under a specific path.

### Filter names

The name used to specify filters can be an index name or a path to a an arbitary property value on objects in the store.
For example:

```
    order.date=2019-03-02&order.value$from=100
```

could be used to query on two values of a nested property.

Filters on index names are naturally quicker and more efficient than property names, which require a scan of all objects to find matches.

### Control parameters

The way a query is executed and results are collated and returned can be modified by using on of the control parameters.
The available control parameters are:

* `$join`: Change how multiple filters are combined; values are `and` or `or`, default value is `and`.
* `$from`: Specify start offset of the first row returned.
* `$to`: Specify the end offset of the last row returned.
* `$limit`: Specify the maximum number of rows to return.
* `$format`: Specify the format of the result. By default, the API returns a list of all matched objects. This can be modified by specifying one of the following:
    * `$format=keys`: Return just a list of the primary keys of each matched object.
    * `$format=lookup`: Return an object mapping each matched object's primary key to the object.
* `$orderBy`: Specify the sort order of the result. The value is the property path of the value to sort by.


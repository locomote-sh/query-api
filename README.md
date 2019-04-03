# query-api

A HTTP compatible API for querying IndexedDB object store contents either in the browser, from a page or service worker context, or server side in a Node.js process.

## Description

This module provides an API for querying the contents of an IndexedDB object store.
Queries can be easily and naturally described using the parameters to a HTTP GET request.
The query engine can run either in the browser or on a Node.js process on the server.

## Motivation

The query API is designed principally for use with service workers to provide offline capable query functionality to web pages.

A difficulty with implementing query functionality within a service worker is the possibility that the service worker isn't available, either because the code is running on a browser without service worker support, but also because of the service worker lifecycle and the possibility that the page is running before the service worker is installed and activated.
The simplest way to resolve these problems is to ensure that any URLs handled locally by the service worker can also be handled remotely by the originating server.

Using this module, it is possible to support both remote, server-side querying and local, offline querying either in a service worker or in code running in the page, provided some mechanism exists for replicating the object store's contents to both client and server.
Object store replication is outside of the scope of this module, but primitives are provided via the <https://github.com/locomote-sh/idb> library for manipulating the IndexedDB contents.
Also see the [Locomote.sh content server](https://github.com/locomote-sh/content-server) and associated [service worker](https://github.com/locomote-sh/sw) for a solution to the replication problem.

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

* `schema`: A database schema object. See <https://github.com/locomote-sh/idb> for details.
* `store`: The name of the object store being queried; the store must appear in the schema.
* `params`: An object containing the query parameters. Can be presented as either a plain object or as an [URLSearchParam object](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams).

**Returns**: A promise resolving to an array or object containing the query results.

## Usage

Queries are defined using HTTP request parameters.

### Filters

The most basic usage pattern is to filter the contents of the file DB by a specified value on a named property, for example:

```
    path=index.html
```

This query will return all file records with a `path` of `index.html` (which in this case can be at most one record, as `path` is used as the primary key in the file DB).

The filter operation can be modified by appending a comparison specifier to the property name, so for example:

```
    path$prefix=images/
```

will match any file records with a `path` property starting with `images/` - e.g. `images/logo.png` or `images/icons/file.png` would both match.
Note that the comparison specifier has been supplied by appending `$` followed by a comparison name. The full list of supported comparison specifiers is:

* `$prefix`: Match values starting with the specified value.
* `$from`: Match values &gt;= the specified value.
* `$to`: Match values &lt;= the specified value.
* `$value`: Match the value exactly. Note that `name=xxx` is shorthand for `name$value=xxx`.

Multiple filter operations can be combined. For example, the query:

```
    page.date$from=2018-01-01&page.date$to=2018-12-31
```

could be used to match files within a certain date range, whilst the query:

```
    path$prefix=pages/&category=files
```

could be used to find files in a specific category and under a specific path.

### Filter names

The name used to specify filters can be an index name or a path to a property value on a file DB record.
Filters on index names are naturally quicker and more efficient than property names, which require a scan of all values to find matching records.

### Control parameters

The way a query is executed and results are collated and returned can be modified by using on of the control parameters.
The available control parameters are:

* `$join`: Change how multiple filters are combined; values are `and` or `or`, default value is `and`.
* `$from`: Specify start offset of the first row returned.
* `$to`: Specify the end offset of the last row returned.
* `$limit`: Specify the maximum number of rows to return.
* `$format`: Specify the format of the result. By default, the API returns a list of all matched records. This can be modified by specifying one of the following:
    * `$format=keys`: Return just a list of the primary keys of each matched record.
    * `$format=lookup`: Return an object mapping each matched record's primary key to the record.
* `$orderBy`: Specify the sort order of the result. The value is the property path of the value to sort by.



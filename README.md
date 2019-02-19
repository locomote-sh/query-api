# query-api

Core file querying API for Locomote.

## Description

This library provides the core file querying API for Locomote.
The query API is a HTTP based API for querying file metadata stored in the file DB.
The query API is designed for use on both client and server.
When the Locomote service worker is installed and activated on a client then all query API requests are handled locally by the service worker, and can be fully executed in offline mode.
When the service worker is not installed, or on older clients without service worker support, API requests are executed on the server instead.

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

## Files

The module is composed of the following files:

* `lib/query.js`: The query API implementation.
* `lib/schema.js`: The default file DB schema.
* `lib/server.js`: Internal functions for calling the query API from a HTTP server.
* `test/*`: Unit tests.


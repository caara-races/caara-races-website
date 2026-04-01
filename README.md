# Proposed CAARA race support web site

This repository contains a proposal for a new version of the [CAARA race support] web site. This README document contains technical information about the repository. Please see [content/about.md](./content/about.md) for the motivations behind this proposal.

[caara race support]: https://sites.google.com/view/caararaces

## Prerequisites

In order to build this site locally, you will need:

- [Node.js]
- [NPM]
- (optional) API credentials for access to the staffing spreadsheet (for fetching volunteer staffing information)
- (optional) API credentials for Google's Geocoding API (for geolocating checkpoints)
- (optional) Docker (for running the QGIS image to generate PDF maps)

[node.js]: https://nodejs.org/
[npm]: https://www.npmjs.com/

## Building the site

First, ensure all dependencies are installed:

```sh
npm install
```

From the top level of the repository, run:

```sh
npm run build
```

This will produce a rendered version of the content in the `_site` directory. If you would like to view this content in your browser, run:

```sh
npm run serve
```

This will render the site and then expose it on local port 8080. You can view it in your browser by going to <http://localhost:8080/>.
